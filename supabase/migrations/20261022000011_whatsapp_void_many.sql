-- Anular varios gastos de una vez ("anula todos los de hoy"): one request groups several records under
-- a batch (single requests have none), and one "sí" voids them all. Same rules as one: same phone, 30 minutes, nothing deleted.

alter table public.whatsapp_void_requests add column batch_id uuid;

-- Step 1 for many: targets is [{"kind": "expense"|"suggestion", "id": "..."}], at most 20.
-- Only the ones that can still be voided are kept. Returns the batch id, or null if none can be.
create function public.whatsapp_request_void_many(token text, phone text, targets jsonb, reason text)
returns uuid
language plpgsql security definer
set search_path = public
as $$
declare
  p public.partners;
  batch uuid := gen_random_uuid();
begin
  perform private.check_webhook_token(token);
  select * into p from public.partners where whatsapp_phone = phone;
  if not found then
    raise exception 'unknown phone' using errcode = 'P0002';
  end if;

  update public.whatsapp_void_requests set status = 'cancelled' where partner_id = p.id and status = 'pending';
  insert into public.whatsapp_void_requests (organization_id, partner_id, target_kind, target_id, reason, batch_id)
  select distinct p.organization_id, p.id, t.kind, t.id, left(nullif(trim(reason), ''), 200), batch
  from (select x ->> 'kind' as kind, (x ->> 'id')::uuid as id
        from jsonb_array_elements(coalesce(targets, '[]')) x limit 20) t
  where (t.kind = 'expense' and exists (
           select 1 from public.expenses e join public.houses h on h.id = e.house_id
           where e.id = t.id and e.organization_id = p.organization_id and e.status = 'active' and h.stage <> 'settled'))
     or (t.kind = 'suggestion' and exists (
           select 1 from public.expense_suggestions s
           where s.id = t.id and s.organization_id = p.organization_id and s.status = 'pending'));
  if not found then
    return null;
  end if;
  return batch;
end;
$$;

-- Step 2 for many: the same person said "sí" within 30 minutes. Takes any request of the batch (the context
-- shows the latest one) and returns how many were voided or discarded.
create function public.whatsapp_confirm_void_many(token text, phone text, request uuid) returns integer
language plpgsql security definer
set search_path = public
as $$
declare
  p public.partners;
  r public.whatsapp_void_requests;
  total integer := 0;
  batch uuid;
begin
  perform private.check_webhook_token(token);
  select * into p from public.partners where whatsapp_phone = phone;
  if not found then
    raise exception 'unknown phone' using errcode = 'P0002';
  end if;

  select coalesce(x.batch_id, x.id) into batch from public.whatsapp_void_requests x where x.id = request;
  for r in select * from public.whatsapp_void_requests
           where coalesce(batch_id, id) = batch and partner_id = p.id and status = 'pending'
             and created_at > now() - interval '30 minutes'
           for update
  loop
    if r.target_kind = 'expense' then
      update public.expenses e set status = 'voided',
        voided_reason = 'Anulado por WhatsApp (' || p.name || ')' || coalesce(': ' || r.reason, '')
      where e.id = r.target_id and e.status = 'active'
        and exists (select 1 from public.houses h where h.id = e.house_id and h.stage <> 'settled');
    else
      update public.expense_suggestions set status = 'discarded' where id = r.target_id and status = 'pending';
    end if;
    if found then
      total := total + 1;
    end if;
    update public.whatsapp_void_requests set status = case when found then 'done' else 'cancelled' end where id = r.id;
  end loop;
  return total;
end;
$$;

revoke execute on function public.whatsapp_request_void_many(text, text, jsonb, text),
  public.whatsapp_confirm_void_many(text, text, uuid) from public;
grant execute on function public.whatsapp_request_void_many(text, text, jsonb, text),
  public.whatsapp_confirm_void_many(text, text, uuid) to anon, authenticated;
