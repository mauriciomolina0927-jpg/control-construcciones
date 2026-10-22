-- partners also has a user_id column (the login), so the parameter must be qualified.
create or replace function public.whatsapp_phone_for_user(token text, user_id text) returns text
language plpgsql security definer
set search_path = public
as $$
begin
  perform private.check_webhook_token(token);
  return (select p.whatsapp_phone from public.partners p where p.whatsapp_user_id = whatsapp_phone_for_user.user_id);
end;
$$;
