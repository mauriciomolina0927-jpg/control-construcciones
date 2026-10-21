-- Creating a house with its first agreement.

set role authenticated;
select test.login('00000000-0000-0000-0000-0000000000a1');

select public.create_house(
  '10000000-0000-0000-0000-000000000001', 'Casa 4', 'Calle 10 # 5-20', 'lot', 180000000,
  '[{"partner_id": "20000000-0000-0000-0000-0000000000b1", "profit_share_bps": 5000},
    {"partner_id": "20000000-0000-0000-0000-0000000000c1", "profit_share_bps": 5000}]') as new_house \gset
select test.eq(
  (select count(*) from public.house_agreement_partners ap
   join public.house_agreements a on a.id = ap.agreement_id
   where a.house_id = :'new_house' and a.version = 1),
  2::bigint, 'the admin creates a house with its two partners');
select test.eq((select address from public.houses where id = :'new_house'), 'Calle 10 # 5-20', 'the house keeps its address');

select test.throws(
  $$select public.create_house('10000000-0000-0000-0000-000000000001', 'Casa mala', null, 'lot', null,
    '[{"partner_id": "20000000-0000-0000-0000-0000000000b1", "profit_share_bps": 6000},
      {"partner_id": "20000000-0000-0000-0000-0000000000c1", "profit_share_bps": 5000}]')$$,
  'add up to 100', 'profit shares must add up to 100%');
select test.throws(
  $$select public.create_house('10000000-0000-0000-0000-000000000001', 'Casa sin socios', null, 'lot', null, '[]')$$,
  'at least one partner', 'a house needs partners');
select test.throws(
  $$select public.create_house('10000000-0000-0000-0000-000000000001', 'Casa cerrada', null, 'settled', null,
    '[{"partner_id": "20000000-0000-0000-0000-0000000000b1", "profit_share_bps": 10000}]')$$,
  'cannot start settled', 'a new house cannot start settled');

select test.login('00000000-0000-0000-0000-0000000000c1');
select test.throws(
  $$select public.create_house('10000000-0000-0000-0000-000000000001', 'Casa del socio', null, 'lot', null,
    '[{"partner_id": "20000000-0000-0000-0000-0000000000c1", "profit_share_bps": 10000}]')$$,
  'row-level security', 'the viewer partner cannot create houses');

select test.login('00000000-0000-0000-0000-0000000000b1');
select test.throws(
  $$select public.create_house('10000000-0000-0000-0000-000000000001', 'Casa de papá', null, 'lot', null,
    '[{"partner_id": "20000000-0000-0000-0000-0000000000b1", "profit_share_bps": 10000}]')$$,
  'row-level security', 'only the admin creates houses, since they carry an agreement');
reset role;
select test.eq((select count(*) from public.houses where name in ('Casa de papá', 'Casa del socio', 'Casa mala')), 0::bigint,
  'a failed creation leaves nothing behind');
