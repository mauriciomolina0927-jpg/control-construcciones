-- Hardening flagged by the Supabase security advisor:
-- internal functions are not callable without signing in, trigger functions are never callable
-- through the API, and every function has a fixed search_path.

revoke execute on function public.role_in(uuid), public.can_view_house(uuid), public.accept_invitations()
  from public, anon;
grant execute on function public.role_in(uuid), public.can_view_house(uuid), public.accept_invitations()
  to authenticated;
revoke execute on function public.link_attachment(), public.write_audit_log() from public, anon, authenticated;

alter function public.can_write(uuid) set search_path = public;
alter function public.is_admin(uuid) set search_path = public;
alter function public.check_sale_payment_house() set search_path = public;
alter function public.guard_agreement_partner() set search_path = public;
alter function public.hash_settlement() set search_path = public, extensions;
alter function public.forbid_change() set search_path = public;
alter function public.guard_money_record() set search_path = public;
alter function public.void_replaced_expense() set search_path = public;
alter function public.guard_house_stage() set search_path = public;
alter function public.guard_new_settlement() set search_path = public;
