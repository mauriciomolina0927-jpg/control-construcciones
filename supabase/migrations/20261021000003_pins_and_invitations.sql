-- Sign-in: email once per device, then a 4-digit PIN.
-- The PIN is hashed with bcrypt and only reachable through the functions below.
-- 5 wrong PINs lock it until the person signs in again by email.

create extension if not exists pgcrypto with schema extensions;

create table public.user_pins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  pin_hash text not null,
  failed_attempts int not null default 0,
  locked_at timestamptz,
  updated_at timestamptz not null default now()
);
alter table public.user_pins enable row level security;
revoke all on public.user_pins from anon, authenticated;

create function public.has_pin() returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (select 1 from public.user_pins where user_id = auth.uid())
$$;

-- Setting or changing the PIN needs a fresh email sign-in (last 15 minutes) unless none exists yet.
create function public.set_pin(pin text) returns void
language plpgsql security definer
set search_path = public, extensions
as $$
declare
  uid uuid := auth.uid();
  signed_in_at timestamptz;
begin
  if uid is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  if pin !~ '^[0-9]{4}$' then
    raise exception 'the PIN must be 4 digits' using errcode = '22023';
  end if;

  select last_sign_in_at into signed_in_at from auth.users where id = uid;
  if exists (select 1 from public.user_pins where user_id = uid)
     and (signed_in_at is null or signed_in_at < now() - interval '15 minutes') then
    raise exception 'sign in by email again to change the PIN' using errcode = '42501';
  end if;

  insert into public.user_pins (user_id, pin_hash)
  values (uid, crypt(pin, gen_salt('bf', 8)))
  on conflict (user_id) do update
    set pin_hash = excluded.pin_hash, failed_attempts = 0, locked_at = null, updated_at = now();
end;
$$;

-- Returns 'ok', 'wrong', 'locked' or 'no_pin'.
create function public.verify_pin(pin text) returns text
language plpgsql security definer
set search_path = public, extensions
as $$
declare
  uid uuid := auth.uid();
  rec public.user_pins;
  signed_in_at timestamptz;
begin
  if uid is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;

  select * into rec from public.user_pins where user_id = uid for update;
  if not found then
    return 'no_pin';
  end if;

  select last_sign_in_at into signed_in_at from auth.users where id = uid;
  if rec.locked_at is not null then
    if signed_in_at is null or signed_in_at <= rec.locked_at then
      return 'locked';
    end if;
    -- Signed in by email after the lock: start over.
    update public.user_pins set failed_attempts = 0, locked_at = null where user_id = uid;
    rec.failed_attempts := 0;
  end if;

  if rec.pin_hash = crypt(coalesce(pin, ''), rec.pin_hash) then
    update public.user_pins set failed_attempts = 0 where user_id = uid;
    return 'ok';
  end if;

  update public.user_pins
  set failed_attempts = rec.failed_attempts + 1,
      locked_at = case when rec.failed_attempts + 1 >= 5 then now() end
  where user_id = uid;
  return case when rec.failed_attempts + 1 >= 5 then 'locked' else 'wrong' end;
end;
$$;

revoke execute on function public.has_pin(), public.set_pin(text), public.verify_pin(text) from public, anon;
grant execute on function public.has_pin(), public.set_pin(text), public.verify_pin(text) to authenticated;

-- ---------------------------------------------------------------------------
-- Invitations: only invited emails can sign in; the first sign-in turns the invitation into a membership
-- ---------------------------------------------------------------------------

create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id),
  email text not null check (email = lower(trim(email)) and email like '%_@_%'),
  role text not null check (role in ('admin', 'partner', 'viewer')),
  partner_id uuid,
  invited_by uuid default auth.uid() references auth.users (id),
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  unique (organization_id, email),
  foreign key (organization_id, partner_id) references public.partners (organization_id, id)
);

alter table public.invitations enable row level security;
revoke all on public.invitations from anon;

create policy invitations_admin on public.invitations for all to authenticated
  using (public.is_admin(organization_id)) with check (public.is_admin(organization_id));

create trigger invitations_audit after insert or update or delete on public.invitations
  for each row execute function public.write_audit_log();

-- Used by the sign-in page before sending the email, so strangers never get one.
create function public.is_invited(email text) returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (select 1 from public.invitations i where i.email = lower(trim(is_invited.email)))
$$;

create function public.accept_invitations() returns int
language plpgsql security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  user_email text;
  inv public.invitations;
  accepted int := 0;
begin
  if uid is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  select lower(email) into user_email from auth.users where id = uid;

  for inv in
    select * from public.invitations where email = user_email and accepted_at is null for update
  loop
    insert into public.memberships (organization_id, user_id, role)
    values (inv.organization_id, uid, inv.role)
    on conflict (organization_id, user_id) do nothing;

    if inv.partner_id is not null then
      update public.partners set user_id = uid where id = inv.partner_id and user_id is null;
    end if;

    update public.invitations set accepted_at = now() where id = inv.id;
    accepted := accepted + 1;
  end loop;
  return accepted;
end;
$$;

revoke execute on function public.is_invited(text), public.accept_invitations() from public;
grant execute on function public.is_invited(text) to anon, authenticated;
grant execute on function public.accept_invitations() to authenticated;
