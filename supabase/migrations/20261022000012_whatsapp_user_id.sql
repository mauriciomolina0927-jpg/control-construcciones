-- Some people reach the company number with a WhatsApp username: Meta then sends only a
-- business-scoped user id (from_user_id, like "CO.123...") and no phone (2026-10-22, Miguel's case).
-- A partner can be linked to that id; the app looks up the partner's phone by it and keeps using the phone.
alter table public.partners add column whatsapp_user_id text unique
  check (whatsapp_user_id ~ '^[A-Z]{2}\.[0-9A-Za-z]{5,64}$');

create function public.whatsapp_phone_for_user(token text, user_id text) returns text
language plpgsql security definer
set search_path = public
as $$
begin
  perform private.check_webhook_token(token);
  return (select whatsapp_phone from public.partners where whatsapp_user_id = user_id);
end;
$$;

revoke execute on function public.whatsapp_phone_for_user(text, text) from public;
grant execute on function public.whatsapp_phone_for_user(text, text) to anon, authenticated;
