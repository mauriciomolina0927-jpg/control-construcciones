-- Final settlement: each partner approves with their PIN, and the house closes only when all of them did.

-- True when every partner of the house's current agreement approved its latest settlement.
create function public.settlement_fully_approved(house uuid) returns boolean
language sql stable security definer
set search_path = public
as $$
  with latest_settlement as (
    select id from public.settlements where house_id = house order by version desc limit 1
  ),
  latest_agreement as (
    select id from public.house_agreements where house_id = house order by version desc limit 1
  )
  select exists (select 1 from latest_settlement)
     and not exists (
       select 1
       from public.house_agreement_partners hap
       where hap.agreement_id = (select id from latest_agreement)
         and not exists (
           select 1 from public.settlement_approvals a
           where a.settlement_id = (select id from latest_settlement) and a.partner_id = hap.partner_id
         )
     );
$$;

-- A house becomes settled only through approvals, and a settled house never reopens.
create function public.guard_house_stage() returns trigger
language plpgsql
as $$
begin
  if old.stage = 'settled' then
    raise exception 'house % is settled and accepts no changes', old.id using errcode = 'P0001';
  end if;
  if new.stage = 'settled' and not public.settlement_fully_approved(new.id) then
    raise exception 'a house is settled only when every partner approves its final settlement'
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger houses_stage_guard before update on public.houses
  for each row execute function public.guard_house_stage();

-- No new settlement once the house is closed.
create function public.guard_new_settlement() returns trigger
language plpgsql
as $$
begin
  if (select stage from public.houses where id = new.house_id) = 'settled' then
    raise exception 'house % is settled and accepts no changes', new.house_id using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger settlements_open_house before insert on public.settlements
  for each row execute function public.guard_new_settlement();

-- Approvals go only through approve_settlement, which checks the PIN.
drop policy settlement_approvals_insert on public.settlement_approvals;

-- Returns 'approved', 'settled' (the last approval closed the house), or the PIN result
-- ('wrong', 'locked', 'no_pin'). A wrong PIN returns instead of raising, so the failed attempt counts.
create function public.approve_settlement(settlement uuid, pin text) returns text
language plpgsql security definer
set search_path = public, extensions
as $$
declare
  s public.settlements;
  me uuid;
  pin_result text;
begin
  select * into s from public.settlements where id = settlement;
  if not found or not public.can_view_house(s.house_id) then
    raise exception 'settlement not found' using errcode = 'P0002';
  end if;

  select hap.partner_id into me
  from public.house_agreement_partners hap
  join public.partners p on p.id = hap.partner_id
  where p.user_id = auth.uid()
    and hap.agreement_id = (select id from public.house_agreements
                            where house_id = s.house_id order by version desc limit 1);
  if me is null then
    raise exception 'only a partner of this house can approve its settlement' using errcode = '42501';
  end if;

  pin_result := public.verify_pin(pin);
  if pin_result <> 'ok' then
    return pin_result;
  end if;

  if exists (select 1 from public.settlements where house_id = s.house_id and version > s.version) then
    raise exception 'settlement is outdated: a newer version exists' using errcode = 'P0001';
  end if;
  if exists (
    select 1 from public.audit_log
    where house_id = s.house_id
      and table_name in ('expenses', 'sales', 'sale_payments', 'partner_transfers')
      and at > s.created_at
  ) then
    raise exception 'settlement is outdated: money moved after it was made' using errcode = 'P0001';
  end if;

  insert into public.settlement_approvals (organization_id, settlement_id, partner_id)
  values (s.organization_id, s.id, me)
  on conflict do nothing;

  if public.settlement_fully_approved(s.house_id) then
    update public.houses set stage = 'settled' where id = s.house_id;
    return 'settled';
  end if;
  return 'approved';
end;
$$;

revoke execute on function public.approve_settlement(uuid, text), public.settlement_fully_approved(uuid) from public, anon;
grant execute on function public.approve_settlement(uuid, text), public.settlement_fully_approved(uuid) to authenticated;
