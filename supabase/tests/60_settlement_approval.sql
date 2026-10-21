-- Final settlement of Casa 2 (papá + otro socio): approvals with PIN, and closing the house.

update auth.users set last_sign_in_at = now()
where id in ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000d1');

set role authenticated;
select test.login('00000000-0000-0000-0000-0000000000b1');
select public.set_pin('1111');
select test.login('00000000-0000-0000-0000-0000000000d1');
select public.set_pin('2222');

select test.login('00000000-0000-0000-0000-0000000000a1');
insert into public.settlements (id, organization_id, house_id, version, breakdown, hash)
values ('70000000-0000-0000-0000-000000000021', '10000000-0000-0000-0000-000000000001',
        '30000000-0000-0000-0000-000000000002', 1, '{"v": 1}', '');
select test.throws($$select public.approve_settlement('70000000-0000-0000-0000-000000000021', '1234')$$,
  'only a partner', 'the admin is not a partner and does not approve');

select test.login('00000000-0000-0000-0000-0000000000c1');
select test.throws($$select public.approve_settlement('70000000-0000-0000-0000-000000000021', '1234')$$,
  'not found', 'a partner of another house cannot approve');

select test.login('00000000-0000-0000-0000-0000000000d1');
select test.eq(public.approve_settlement('70000000-0000-0000-0000-000000000021', '9999'), 'wrong',
  'a wrong PIN does not approve');
reset role;
select test.eq((select failed_attempts from public.user_pins where user_id = '00000000-0000-0000-0000-0000000000d1'), 1,
  'the failed attempt counts toward the lock');
set role authenticated;
select test.login('00000000-0000-0000-0000-0000000000d1');
select test.eq(public.approve_settlement('70000000-0000-0000-0000-000000000021', '2222'), 'approved',
  'otro socio approves with his PIN');
select test.eq((select stage from public.houses where id = '30000000-0000-0000-0000-000000000002'), 'construction',
  'one approval does not close the house');

select test.login('00000000-0000-0000-0000-0000000000b1');
select test.throws(
  $$update public.houses set stage = 'settled' where id = '30000000-0000-0000-0000-000000000002'$$,
  'every partner approves', 'nobody can mark a house settled by hand');

-- Money moves after the settlement was made: it is outdated.
insert into public.expenses (organization_id, house_id, amount, spent_on, kind, category, paid_by_partner_id)
values ('10000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000002', 300000, '2026-08-01',
        'sale_cost', 'Notaría y registro de la venta', '20000000-0000-0000-0000-0000000000b1');
select test.throws($$select public.approve_settlement('70000000-0000-0000-0000-000000000021', '1111')$$,
  'money moved', 'a settlement made before new money cannot be approved');

select test.login('00000000-0000-0000-0000-0000000000a1');
insert into public.settlements (id, organization_id, house_id, version, breakdown, hash)
values ('70000000-0000-0000-0000-000000000022', '10000000-0000-0000-0000-000000000001',
        '30000000-0000-0000-0000-000000000002', 2, '{"v": 2}', '');
select test.login('00000000-0000-0000-0000-0000000000d1');
select test.throws($$select public.approve_settlement('70000000-0000-0000-0000-000000000021', '2222')$$,
  'newer version', 'an old version cannot be approved');
select test.eq(public.approve_settlement('70000000-0000-0000-0000-000000000022', '2222'), 'approved',
  'otro socio approves the new version');
select test.login('00000000-0000-0000-0000-0000000000b1');
select test.eq(public.approve_settlement('70000000-0000-0000-0000-000000000022', '1111'), 'settled',
  'the last approval closes the house');
select test.eq((select stage from public.houses where id = '30000000-0000-0000-0000-000000000002'), 'settled',
  'the house is settled');

select test.throws(
  $$update public.houses set stage = 'sold' where id = '30000000-0000-0000-0000-000000000002'$$,
  'is settled', 'a settled house never reopens');
select test.login('00000000-0000-0000-0000-0000000000a1');
select test.throws(
  $$insert into public.settlements (organization_id, house_id, version, breakdown, hash)
    values ('10000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000002', 3, '{}', '')$$,
  'is settled', 'a settled house takes no new settlement');
reset role;
