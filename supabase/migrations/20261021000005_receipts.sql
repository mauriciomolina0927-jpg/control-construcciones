-- Receipt photos: a private storage bucket, folders per organization and house,
-- and the expense's has_receipt flag set by the database when a receipt arrives.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('receipts', 'receipts', false, 15 * 1024 * 1024,
        array['image/jpeg', 'image/png', 'image/heic', 'image/webp', 'application/pdf'])
on conflict (id) do nothing;

-- Paths are "<organization_id>/<house_id>/<file>". Inside subqueries, objects.name must be
-- qualified, or it resolves to houses.name.
create policy receipts_select on storage.objects for select to authenticated
  using (bucket_id = 'receipts' and public.can_view_house(((storage.foldername(name))[2])::uuid));

create policy receipts_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'receipts'
    and public.can_write(((storage.foldername(name))[1])::uuid)
    and exists (
      select 1 from public.houses h
      where h.id = ((storage.foldername(objects.name))[2])::uuid
        and h.organization_id = ((storage.foldername(objects.name))[1])::uuid
    )
  );
-- No update or delete policy: a receipt, once uploaded, stays.

-- Money records may change in exactly two ways: be voided, or (expenses) gain a receipt.
create or replace function public.guard_money_record() returns trigger
language plpgsql
as $$
declare
  house_stage text;
  old_rest jsonb;
  new_rest jsonb;
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
    old_rest := to_jsonb(old) - 'status' - 'voided_reason' - 'has_receipt';
    new_rest := to_jsonb(new) - 'status' - 'voided_reason' - 'has_receipt';
    if new_rest is distinct from old_rest
       or (to_jsonb(new) ->> 'has_receipt') is distinct from (to_jsonb(old) ->> 'has_receipt')
          and not ((to_jsonb(old) ->> 'has_receipt') = 'false' and (to_jsonb(new) ->> 'has_receipt') = 'true')
       or (new.status is distinct from old.status and not (old.status = 'active' and new.status = 'voided'))
       or (new.status = old.status and new.voided_reason is distinct from old.voided_reason) then
      raise exception 'money records cannot be edited; only an active record can be voided'
        using errcode = 'P0001';
    end if;
  end if;

  return new;
end;
$$;

-- An attachment must point to a record of the same house, and marks the expense as supported.
create function public.link_attachment() returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.owner_type = 'expense' then
    if not exists (select 1 from public.expenses e where e.id = new.owner_id and e.house_id = new.house_id) then
      raise exception 'attachment does not match an expense of this house' using errcode = 'P0001';
    end if;
    update public.expenses set has_receipt = true where id = new.owner_id and not has_receipt;
  elsif new.owner_type = 'sale_payment' then
    if not exists (select 1 from public.sale_payments p where p.id = new.owner_id and p.house_id = new.house_id) then
      raise exception 'attachment does not match a payment of this house' using errcode = 'P0001';
    end if;
  end if;
  if split_part(new.storage_path, '/', 1) <> new.organization_id::text
     or split_part(new.storage_path, '/', 2) <> new.house_id::text then
    raise exception 'attachment path must be organization/house/file' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger attachments_link before insert on public.attachments
  for each row execute function public.link_attachment();
-- Attachments are permanent, like the money records they support.
create trigger attachments_frozen before update or delete on public.attachments
  for each row execute function public.forbid_change();
