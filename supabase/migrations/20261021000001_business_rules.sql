-- Business rules enforced by the database, so neither an app bug nor an agent can skip them.

-- ---------------------------------------------------------------------------
-- Money records: no delete, no edit; only void an active record, never on a settled house
-- ---------------------------------------------------------------------------

create function public.guard_money_record() returns trigger
language plpgsql
as $$
declare
  house_stage text;
begin
  if tg_op = 'DELETE' then
    raise exception 'money records cannot be deleted; void them instead'
      using errcode = 'P0001';
  end if;

  select stage into house_stage from public.houses where id = new.house_id;
  if house_stage = 'settled' then
    raise exception 'house % is settled and accepts no changes', new.house_id
      using errcode = 'P0001';
  end if;

  if tg_op = 'UPDATE' then
    if old.status <> 'active' or new.status <> 'voided'
       or (to_jsonb(new) - 'status' - 'voided_reason') is distinct from (to_jsonb(old) - 'status' - 'voided_reason') then
      raise exception 'money records cannot be edited; only an active record can be voided'
        using errcode = 'P0001';
    end if;
  end if;

  return new;
end;
$$;

create trigger expenses_guard before insert or update or delete on public.expenses
  for each row execute function public.guard_money_record();
create trigger sale_payments_guard before insert or update or delete on public.sale_payments
  for each row execute function public.guard_money_record();
create trigger partner_transfers_guard before insert or update or delete on public.partner_transfers
  for each row execute function public.guard_money_record();

-- A payment's house must be its sale's house.
create function public.check_sale_payment_house() returns trigger
language plpgsql
as $$
begin
  if not exists (select 1 from public.sales s where s.id = new.sale_id and s.house_id = new.house_id) then
    raise exception 'payment house does not match its sale' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger sale_payments_house_check before insert on public.sale_payments
  for each row execute function public.check_sale_payment_house();

-- An agreement's terms never change (a change is a new version); a partner can only record acceptance once.
create function public.guard_agreement_partner() returns trigger
language plpgsql
as $$
begin
  if old.accepted_at is not null
     or (to_jsonb(new) - 'accepted_at') is distinct from (to_jsonb(old) - 'accepted_at') then
    raise exception 'agreement terms cannot be changed; create a new version'
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger house_agreement_partners_guard before update on public.house_agreement_partners
  for each row execute function public.guard_agreement_partner();

-- ---------------------------------------------------------------------------
-- Final settlements: hash computed by the database, then frozen
-- ---------------------------------------------------------------------------

create function public.hash_settlement() returns trigger
language plpgsql
as $$
begin
  new.hash := encode(sha256(convert_to(new.breakdown::text, 'UTF8')), 'hex');
  return new;
end;
$$;

create trigger settlements_hash before insert on public.settlements
  for each row execute function public.hash_settlement();

create function public.forbid_change() returns trigger
language plpgsql
as $$
begin
  raise exception '% rows cannot be changed or deleted', tg_table_name using errcode = 'P0001';
end;
$$;

create trigger settlements_frozen before update or delete on public.settlements
  for each row execute function public.forbid_change();
create trigger settlement_approvals_frozen before update or delete on public.settlement_approvals
  for each row execute function public.forbid_change();
create trigger audit_log_frozen before update or delete on public.audit_log
  for each row execute function public.forbid_change();

-- ---------------------------------------------------------------------------
-- Audit log: every write to every business table
-- ---------------------------------------------------------------------------

create function public.write_audit_log() returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  row_data jsonb := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
begin
  insert into public.audit_log (organization_id, house_id, actor, action, table_name, record_id, before, after)
  values (
    (row_data ->> 'organization_id')::uuid,
    case when tg_table_name = 'houses' then (row_data ->> 'id')::uuid
         else (row_data ->> 'house_id')::uuid end,
    auth.uid(),
    lower(tg_op),
    tg_table_name,
    coalesce(row_data ->> 'id', row_data ->> 'settlement_id', row_data ->> 'agreement_id'),
    case when tg_op = 'INSERT' then null else to_jsonb(old) end,
    case when tg_op = 'DELETE' then null else to_jsonb(new) end
  );
  return null;
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array[
    'organizations', 'partners', 'memberships', 'houses', 'house_agreements',
    'house_agreement_partners', 'expenses', 'sales', 'sale_payments',
    'partner_transfers', 'attachments', 'settlements', 'settlement_approvals'
  ] loop
    execute format(
      'create trigger %I after insert or update or delete on public.%I
         for each row execute function public.write_audit_log()',
      t || '_audit', t);
  end loop;
end;
$$;
