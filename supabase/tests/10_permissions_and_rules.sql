-- Permissions (row level security) and business rules.
-- Users: a1 admin (Mauricio), b1 partner (papá), c1 viewer (socio, Casa 1), d1 viewer (otro socio, Casa 2),
-- e1 admin of another organization.

-- ---------------------------------------------------------------- viewer (socio)
set role authenticated;
select test.login('00000000-0000-0000-0000-0000000000c1');

select test.eq((select count(*) from public.houses), 1::bigint, 'socio sees only the house where he is a partner');
select test.eq((select name from public.houses), 'Casa 1', 'socio sees Casa 1');
select test.eq((select count(*) from public.expenses), 2::bigint, 'socio sees only Casa 1 expenses');
select test.throws(
  $$insert into public.expenses (organization_id, house_id, amount, spent_on, kind, category, paid_by_partner_id)
    values ('10000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', 1000, '2026-05-01',
            'construction', 'Materiales', '20000000-0000-0000-0000-0000000000c1')$$,
  'row-level security', 'socio cannot register expenses');

select test.throws(
  $$update public.house_agreement_partners set profit_share_bps = 9000
    where partner_id = '20000000-0000-0000-0000-0000000000c1'$$,
  'cannot be changed', 'socio cannot change his profit share');
update public.house_agreement_partners set accepted_at = now()
where partner_id = '20000000-0000-0000-0000-0000000000c1';
select test.eq(
  (select count(*) from public.house_agreement_partners
   where partner_id = '20000000-0000-0000-0000-0000000000c1' and accepted_at is not null),
  1::bigint, 'socio accepts the agreement of his house');
update public.house_agreement_partners set accepted_at = now()
where partner_id = '20000000-0000-0000-0000-0000000000b1';
reset role;
select test.eq(
  (select count(*) from public.house_agreement_partners
   where partner_id = '20000000-0000-0000-0000-0000000000b1' and accepted_at is not null),
  0::bigint, 'socio cannot accept on behalf of papá');
set role authenticated;

update public.houses set name = 'Cambiada' where id = '30000000-0000-0000-0000-000000000001';
reset role;
select test.eq((select name from public.houses where id = '30000000-0000-0000-0000-000000000001'), 'Casa 1',
  'socio cannot rename a house');

-- ---------------------------------------------------------------- another organization
set role authenticated;
select test.login('00000000-0000-0000-0000-0000000000e1');
select test.eq((select count(*) from public.houses), 0::bigint, 'another organization sees no houses');
select test.eq((select count(*) from public.expenses), 0::bigint, 'another organization sees no expenses');
select test.eq((select count(*) from public.partners), 0::bigint, 'another organization sees no partners');

-- ---------------------------------------------------------------- not signed in
select test.login(null);
select test.eq((select count(*) from public.houses), 0::bigint, 'a signed-out user sees nothing');
reset role;
set role anon;
select test.throws($$select count(*) from public.houses$$, 'permission denied', 'anon has no access at all');
reset role;

-- ---------------------------------------------------------------- operating partner (papá)
set role authenticated;
select test.login('00000000-0000-0000-0000-0000000000b1');
select test.eq((select count(*) from public.houses), 3::bigint, 'papá sees every house of the organization');
insert into public.expenses (id, organization_id, house_id, amount, spent_on, kind, category, paid_by_partner_id, source)
values ('50000000-0000-0000-0000-000000000010', '10000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001',
        850000, '2026-05-02', 'construction', 'Cemento', '20000000-0000-0000-0000-0000000000b1', 'whatsapp');
select test.eq((select count(*) from public.expenses where id = '50000000-0000-0000-0000-000000000010'), 1::bigint,
  'papá can register an expense');
select test.throws(
  $$insert into public.partners (organization_id, name) values ('10000000-0000-0000-0000-000000000001', 'Intruso')$$,
  'row-level security', 'papá cannot add partners');

-- ---------------------------------------------------------------- admin and money rules
select test.login('00000000-0000-0000-0000-0000000000a1');

delete from public.expenses where id = '50000000-0000-0000-0000-000000000010';
select test.eq((select count(*) from public.expenses where id = '50000000-0000-0000-0000-000000000010'), 1::bigint,
  'not even the admin can delete an expense');

select test.throws(
  $$update public.expenses set amount = 1 where id = '50000000-0000-0000-0000-000000000010'$$,
  'cannot be edited', 'an expense amount cannot be edited');
select test.throws(
  $$update public.expenses set status = 'voided' where id = '50000000-0000-0000-0000-000000000010'$$,
  'check constraint', 'voiding needs a reason');

update public.expenses set status = 'voided', voided_reason = 'Valor equivocado'
where id = '50000000-0000-0000-0000-000000000010';
select test.eq((select status from public.expenses where id = '50000000-0000-0000-0000-000000000010'), 'voided',
  'an expense can be voided with a reason');
select test.throws(
  $$update public.expenses set status = 'active', voided_reason = null where id = '50000000-0000-0000-0000-000000000010'$$,
  'cannot be edited', 'a voided expense cannot be reactivated');

insert into public.expenses (organization_id, house_id, amount, spent_on, kind, category, paid_by_partner_id, replaces_id)
values ('10000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', 580000, '2026-05-02',
        'construction', 'Cemento', '20000000-0000-0000-0000-0000000000b1', '50000000-0000-0000-0000-000000000010');
select test.eq((select count(*) from public.expenses where replaces_id = '50000000-0000-0000-0000-000000000010'), 1::bigint,
  'the replacement points to the voided expense');

select test.throws(
  $$insert into public.expenses (organization_id, house_id, amount, spent_on, kind, category, paid_by_partner_id)
    values ('10000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000003', 1000, '2026-05-01',
            'construction', 'Materiales', '20000000-0000-0000-0000-0000000000b1')$$,
  'is settled', 'a settled house accepts no new expenses');

select test.throws(
  $$insert into public.expenses (organization_id, house_id, amount, spent_on, kind, category, paid_by_partner_id)
    values ('10000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', 0, '2026-05-01',
            'construction', 'Materiales', '20000000-0000-0000-0000-0000000000b1')$$,
  'check constraint', 'an expense must be positive');

select test.throws(
  $$insert into public.sale_payments (organization_id, sale_id, house_id, amount, paid_on, source, received_by_partner_id)
    values ('10000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000001',
            '30000000-0000-0000-0000-000000000002', 80000000, '2026-06-01', 'buyer', '20000000-0000-0000-0000-0000000000b1')$$,
  'does not match', 'a payment must belong to its sale''s house');

insert into public.sale_payments (organization_id, sale_id, house_id, amount, paid_on, source, received_by_partner_id)
values ('10000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000001',
        '30000000-0000-0000-0000-000000000001', 80000000, '2026-06-01', 'buyer', '20000000-0000-0000-0000-0000000000b1');
select test.eq((select sum(amount) from public.sale_payments), 80000000::numeric, 'a buyer payment is registered');

-- ---------------------------------------------------------------- settlements
insert into public.settlements (id, organization_id, house_id, version, breakdown, hash)
values ('70000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001',
        '30000000-0000-0000-0000-000000000001', 1,
        '{"socio": 87500000, "papa": 127500000}', 'ignored');
select test.eq(
  (select hash from public.settlements where id = '70000000-0000-0000-0000-000000000001'),
  encode(sha256(convert_to('{"papa": 127500000, "socio": 87500000}'::jsonb::text, 'UTF8')), 'hex'),
  'the database computes the settlement hash');
update public.settlements set breakdown = '{"socio": 1}' where id = '70000000-0000-0000-0000-000000000001';
select test.eq(
  (select breakdown ->> 'socio' from public.settlements where id = '70000000-0000-0000-0000-000000000001'),
  '87500000', 'the admin cannot change a settlement');

select test.login('00000000-0000-0000-0000-0000000000c1');
insert into public.settlement_approvals (organization_id, settlement_id, partner_id)
values ('10000000-0000-0000-0000-000000000001', '70000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-0000000000c1');
select test.eq((select count(*) from public.settlement_approvals), 1::bigint, 'socio approves the settlement for himself');
select test.throws(
  $$insert into public.settlement_approvals (organization_id, settlement_id, partner_id)
    values ('10000000-0000-0000-0000-000000000001', '70000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-0000000000b1')$$,
  'row-level security', 'socio cannot approve on behalf of papá');

-- ---------------------------------------------------------------- audit log
select test.eq(
  (select count(*) from public.audit_log where table_name = 'expenses' and house_id = '30000000-0000-0000-0000-000000000002'),
  0::bigint, 'socio cannot read the audit log of another house');
select test.eq(
  (select count(*) from public.audit_log
   where table_name = 'expenses' and record_id = '50000000-0000-0000-0000-000000000010' and action = 'update'),
  1::bigint, 'socio can read the audit log of his house');

select test.login('00000000-0000-0000-0000-0000000000a1');
select test.eq(
  (select actor from public.audit_log
   where table_name = 'expenses' and record_id = '50000000-0000-0000-0000-000000000010' and action = 'insert'),
  '00000000-0000-0000-0000-0000000000b1'::uuid, 'the audit log records who registered the expense');
select test.eq(
  (select before ->> 'status' from public.audit_log
   where table_name = 'expenses' and record_id = '50000000-0000-0000-0000-000000000010' and action = 'update'),
  'active', 'the audit log keeps the previous value');
select test.throws($$delete from public.audit_log$$, 'permission denied', 'nobody can delete the audit log');
reset role;

-- Even the database owner cannot rewrite history.
select test.throws($$update public.audit_log set actor = null$$, 'cannot be changed', 'the owner cannot edit the audit log');
select test.throws(
  $$delete from public.expenses where id = '50000000-0000-0000-0000-000000000001'$$,
  'cannot be deleted', 'the owner cannot delete an expense');
select test.throws(
  $$update public.settlements set breakdown = '{"socio": 1}'$$,
  'cannot be changed', 'the owner cannot change a settlement');

-- The app reads back what it inserts (INSERT ... RETURNING).
set role authenticated;
select test.login('00000000-0000-0000-0000-0000000000a1');
select test.throws(
  $t$do $do$ declare n text; begin
      insert into public.houses (organization_id, name) values ('10000000-0000-0000-0000-000000000001', 'Casa nueva')
      returning name into n;
      if n = 'Casa nueva' then raise exception 'returned ok'; end if;
    end $do$$t$,
  'returned ok', 'the admin gets back the house just created');
reset role;
