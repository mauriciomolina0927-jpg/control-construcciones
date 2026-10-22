-- Anular gastos por WhatsApp (2026-10-22, pedido por Mauricio).
-- Two steps, both from the partner's own phone: the agent asks "¿Anulo ...?" and only a "sí" from the
-- same person within 30 minutes voids it. Nothing is deleted: an expense is voided (with who and why
-- in voided_reason) and a pending suggestion is discarded. Settled houses stay untouchable (guard_money_record).

create table public.whatsapp_void_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id),
  partner_id uuid not null,
  target_kind text not null check (target_kind in ('expense', 'suggestion')),
  target_id uuid not null,
  reason text,
  status text not null default 'pending' check (status in ('pending', 'done', 'cancelled')),
  created_at timestamptz not null default now(),
  foreign key (organization_id, partner_id) references public.partners (organization_id, id)
);

alter table public.whatsapp_void_requests enable row level security;
revoke all on public.whatsapp_void_requests from anon;
revoke insert, update, delete on public.whatsapp_void_requests from authenticated;
create policy whatsapp_void_requests_select on public.whatsapp_void_requests for select to authenticated
  using (public.can_write(organization_id));
create trigger whatsapp_void_requests_no_delete before delete on public.whatsapp_void_requests
  for each row execute function public.forbid_change();
create trigger whatsapp_void_requests_audit after insert or update on public.whatsapp_void_requests
  for each row execute function public.write_audit_log();

-- The context now also lists what can be voided (recent active expenses and pending suggestions)
-- and the void request waiting for a "sí".
create or replace function public.whatsapp_context(token text, phone text) returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  p public.partners;
begin
  perform private.check_webhook_token(token);
  select * into p from public.partners where whatsapp_phone = phone;
  if not found then
    return null;
  end if;

  return jsonb_build_object(
    'organization_id', p.organization_id,
    'partner_id', p.id,
    'partner_name', p.name,
    'partners', (select coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'name', x.name) order by x.created_at), '[]')
                 from public.partners x where x.organization_id = p.organization_id),
    'houses', (select coalesce(jsonb_agg(jsonb_build_object(
                   'id', h.id, 'name', h.name, 'stage', h.stage,
                   'lot', coalesce((select sum(e.amount) from public.expenses e
                                    where e.house_id = h.id and e.status = 'active' and e.kind = 'lot'), 0),
                   'construction', coalesce((select sum(e.amount) from public.expenses e
                                             where e.house_id = h.id and e.status = 'active' and e.kind = 'construction'), 0),
                   'without_receipt', (select count(*) from public.expenses e
                                       where e.house_id = h.id and e.status = 'active' and not e.has_receipt)
                 ) order by h.created_at), '[]')
               from public.houses h where h.organization_id = p.organization_id and h.stage <> 'settled'),
    'recent', (select coalesce(jsonb_agg(jsonb_build_object(
                   'direction', m.direction, 'body', m.body, 'has_media', m.has_media, 'at', m.created_at
                 ) order by m.created_at), '[]')
               from (select * from public.whatsapp_messages
                     where partner_id = p.id and created_at > now() - interval '24 hours'
                     order by created_at desc limit 12) m),
    'open', (select coalesce(jsonb_agg(jsonb_build_object(
                 'id', s.id, 'amount', s.amount, 'house_id', s.house_id, 'category', s.category,
                 'supplier_name', s.supplier_name, 'missing', s.missing, 'at', s.created_at
               ) order by s.created_at), '[]')
             from public.expense_suggestions s
             where s.paid_by_partner_id = p.id and s.status = 'pending'
               and s.created_at > now() - interval '24 hours' and cardinality(s.missing) > 0),
    'voidable', (select coalesce(jsonb_agg(v order by v ->> 'at'), '[]') from (
        (select jsonb_build_object('kind', 'expense', 'id', e.id, 'amount', e.amount, 'house_id', e.house_id,
                  'category', e.category, 'supplier_name', e.supplier_name, 'spent_on', e.spent_on, 'at', e.created_at) v
         from public.expenses e join public.houses h on h.id = e.house_id
         where e.organization_id = p.organization_id and e.status = 'active' and h.stage <> 'settled'
         order by e.created_at desc limit 15)
        union all
        (select jsonb_build_object('kind', 'suggestion', 'id', s.id, 'amount', s.amount, 'house_id', s.house_id,
                  'category', s.category, 'supplier_name', s.supplier_name, 'spent_on', s.spent_on, 'at', s.created_at)
         from public.expense_suggestions s
         where s.organization_id = p.organization_id and s.status = 'pending'
         order by s.created_at desc limit 10)
      ) items),
    'void_request', (select jsonb_build_object('id', r.id, 'kind', r.target_kind, 'target_id', r.target_id)
                     from public.whatsapp_void_requests r
                     where r.partner_id = p.id and r.status = 'pending' and r.created_at > now() - interval '30 minutes'
                     order by r.created_at desc limit 1)
  );
end;
$$;

-- Step 1: remember what the person asked to void. Only something of their organization that can still
-- be voided; an older request still waiting is cancelled. Returns the request id, or null if not voidable.
create function public.whatsapp_request_void(token text, phone text, target_kind text, target_id uuid, reason text)
returns uuid
language plpgsql security definer
set search_path = public
as $$
declare
  p public.partners;
  result uuid;
begin
  perform private.check_webhook_token(token);
  select * into p from public.partners where whatsapp_phone = phone;
  if not found then
    raise exception 'unknown phone' using errcode = 'P0002';
  end if;

  if not (
    (target_kind = 'expense' and exists (
      select 1 from public.expenses e join public.houses h on h.id = e.house_id
      where e.id = target_id and e.organization_id = p.organization_id and e.status = 'active' and h.stage <> 'settled'))
    or (target_kind = 'suggestion' and exists (
      select 1 from public.expense_suggestions s
      where s.id = target_id and s.organization_id = p.organization_id and s.status = 'pending'))
  ) then
    return null;
  end if;

  update public.whatsapp_void_requests set status = 'cancelled' where partner_id = p.id and status = 'pending';
  insert into public.whatsapp_void_requests (organization_id, partner_id, target_kind, target_id, reason)
  values (p.organization_id, p.id, target_kind, target_id, left(nullif(trim(reason), ''), 200))
  returning id into result;
  return result;
end;
$$;

-- Step 2: the same person said "sí" within 30 minutes. Returns 'voided', 'discarded', or null if the
-- request expired or the record can no longer be voided.
create function public.whatsapp_confirm_void(token text, phone text, request uuid) returns text
language plpgsql security definer
set search_path = public
as $$
declare
  p public.partners;
  r public.whatsapp_void_requests;
  done text;
begin
  perform private.check_webhook_token(token);
  select * into p from public.partners where whatsapp_phone = phone;
  if not found then
    raise exception 'unknown phone' using errcode = 'P0002';
  end if;
  select * into r from public.whatsapp_void_requests
  where id = request and partner_id = p.id and status = 'pending' and created_at > now() - interval '30 minutes'
  for update;
  if not found then
    return null;
  end if;

  if r.target_kind = 'expense' then
    update public.expenses e set status = 'voided',
      voided_reason = 'Anulado por WhatsApp (' || p.name || ')' || coalesce(': ' || r.reason, '')
    where e.id = r.target_id and e.status = 'active'
      and exists (select 1 from public.houses h where h.id = e.house_id and h.stage <> 'settled');
    if found then done := 'voided'; end if;
  else
    update public.expense_suggestions set status = 'discarded' where id = r.target_id and status = 'pending';
    if found then done := 'discarded'; end if;
  end if;

  update public.whatsapp_void_requests set status = case when done is null then 'cancelled' else 'done' end
  where id = r.id;
  return done;
end;
$$;

revoke execute on function public.whatsapp_request_void(text, text, text, uuid, text),
  public.whatsapp_confirm_void(text, text, uuid) from public;
grant execute on function public.whatsapp_request_void(text, text, text, uuid, text),
  public.whatsapp_confirm_void(text, text, uuid) to anon, authenticated;
