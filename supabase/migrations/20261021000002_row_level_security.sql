-- Row level security: the database decides who sees and changes each row.
-- admin and partner see the whole organization; viewer sees only houses where they are a partner.
-- admin and partner may register money records; only admin manages people and agreements.
-- No policy allows DELETE on money records, settlements or the audit log.

create function public.role_in(org uuid) returns text
language sql stable security definer
set search_path = public
as $$
  select role from public.memberships where organization_id = org and user_id = auth.uid()
$$;

create function public.is_admin(org uuid) returns boolean
language sql stable
as $$ select coalesce(public.role_in(org) = 'admin', false) $$;

create function public.can_write(org uuid) returns boolean
language sql stable
as $$ select coalesce(public.role_in(org) in ('admin', 'partner'), false) $$;

create function public.can_view_house(house uuid) returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.houses h
    join public.memberships m on m.organization_id = h.organization_id and m.user_id = auth.uid()
    where h.id = house
      and (
        m.role in ('admin', 'partner')
        or exists (
          select 1
          from public.house_agreements a
          join public.house_agreement_partners ap on ap.agreement_id = a.id
          join public.partners p on p.id = ap.partner_id
          where a.house_id = h.id and p.user_id = auth.uid()
        )
      )
  )
$$;

do $$
declare
  t text;
begin
  foreach t in array array[
    'organizations', 'partners', 'memberships', 'houses', 'house_agreements',
    'house_agreement_partners', 'expenses', 'sales', 'sale_payments',
    'partner_transfers', 'attachments', 'settlements', 'settlement_approvals', 'audit_log'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon', t);
  end loop;
end;
$$;

revoke insert, update, delete on public.audit_log from authenticated;

-- Organization, people, roles

create policy organizations_select on public.organizations for select to authenticated
  using (public.role_in(id) is not null);

create policy memberships_select on public.memberships for select to authenticated
  using (user_id = auth.uid() or public.is_admin(organization_id));
create policy memberships_admin on public.memberships for all to authenticated
  using (public.is_admin(organization_id)) with check (public.is_admin(organization_id));

create policy partners_select on public.partners for select to authenticated
  using (public.role_in(organization_id) is not null);
create policy partners_insert on public.partners for insert to authenticated
  with check (public.is_admin(organization_id));
create policy partners_update on public.partners for update to authenticated
  using (public.is_admin(organization_id)) with check (public.is_admin(organization_id));

-- Houses and agreements

create policy houses_select on public.houses for select to authenticated
  using (public.can_view_house(id));
create policy houses_insert on public.houses for insert to authenticated
  with check (public.can_write(organization_id));
create policy houses_update on public.houses for update to authenticated
  using (public.can_write(organization_id)) with check (public.can_write(organization_id));

create policy house_agreements_select on public.house_agreements for select to authenticated
  using (public.can_view_house(house_id));
create policy house_agreements_insert on public.house_agreements for insert to authenticated
  with check (public.is_admin(organization_id));

create policy house_agreement_partners_select on public.house_agreement_partners for select to authenticated
  using (exists (
    select 1 from public.house_agreements a
    where a.id = agreement_id and public.can_view_house(a.house_id)
  ));
create policy house_agreement_partners_insert on public.house_agreement_partners for insert to authenticated
  with check (public.is_admin(organization_id));
-- A partner records their own acceptance.
create policy house_agreement_partners_accept on public.house_agreement_partners for update to authenticated
  using (exists (select 1 from public.partners p where p.id = partner_id and p.user_id = auth.uid()))
  with check (exists (select 1 from public.partners p where p.id = partner_id and p.user_id = auth.uid()));

-- Money records and attachments: same rules for all

do $$
declare
  t text;
begin
  foreach t in array array['expenses', 'sales', 'sale_payments', 'partner_transfers', 'attachments'] loop
    execute format(
      'create policy %I on public.%I for select to authenticated using (public.can_view_house(house_id))',
      t || '_select', t);
    execute format(
      'create policy %I on public.%I for insert to authenticated with check (public.can_write(organization_id))',
      t || '_insert', t);
    execute format(
      'create policy %I on public.%I for update to authenticated
         using (public.can_write(organization_id)) with check (public.can_write(organization_id))',
      t || '_update', t);
  end loop;
end;
$$;

-- Settlements

create policy settlements_select on public.settlements for select to authenticated
  using (public.can_view_house(house_id));
create policy settlements_insert on public.settlements for insert to authenticated
  with check (public.is_admin(organization_id));

create policy settlement_approvals_select on public.settlement_approvals for select to authenticated
  using (exists (
    select 1 from public.settlements s
    where s.id = settlement_id and public.can_view_house(s.house_id)
  ));
-- Each partner approves for themselves only.
create policy settlement_approvals_insert on public.settlement_approvals for insert to authenticated
  with check (
    approved_by = auth.uid()
    and exists (select 1 from public.partners p where p.id = partner_id and p.user_id = auth.uid())
  );

-- Audit log: read-only for people who can see the house

create policy audit_log_select on public.audit_log for select to authenticated
  using (
    public.role_in(organization_id) in ('admin', 'partner')
    or (house_id is not null and public.can_view_house(house_id))
  );
