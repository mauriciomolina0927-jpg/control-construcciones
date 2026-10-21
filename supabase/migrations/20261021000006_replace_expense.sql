-- "Registrar el correcto": a new expense that replaces another voids the old one in the same
-- transaction, so the house never counts both or neither. The old one may already be voided,
-- but each expense is corrected at most once.
create function public.void_replaced_expense() returns trigger
language plpgsql
as $$
begin
  if new.replaces_id is null then
    return new;
  end if;
  if not exists (select 1 from public.expenses where id = new.replaces_id and organization_id = new.organization_id)
     or exists (select 1 from public.expenses where replaces_id = new.replaces_id and id <> new.id) then
    raise exception 'only an expense of this organization that was not corrected yet can be replaced'
      using errcode = 'P0001';
  end if;
  update public.expenses
     set status = 'voided', voided_reason = 'Corregido por otro registro'
   where id = new.replaces_id and status = 'active';
  return new;
end;
$$;

create trigger expenses_replace after insert on public.expenses
  for each row execute function public.void_replaced_expense();
