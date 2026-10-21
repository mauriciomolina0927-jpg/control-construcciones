-- Correcting an expense: the new record replaces the old one atomically.

set role authenticated;
select test.login('00000000-0000-0000-0000-0000000000b1');

insert into public.expenses (id, organization_id, house_id, amount, spent_on, kind, category, paid_by_partner_id)
values ('50000000-0000-0000-0000-000000000050', '10000000-0000-0000-0000-000000000001',
        '30000000-0000-0000-0000-000000000001', 85000, '2026-07-02', 'construction', 'Materiales',
        '20000000-0000-0000-0000-0000000000b1');
insert into public.expenses (id, organization_id, house_id, amount, spent_on, kind, category, paid_by_partner_id, replaces_id)
values ('50000000-0000-0000-0000-000000000051', '10000000-0000-0000-0000-000000000001',
        '30000000-0000-0000-0000-000000000001', 850000, '2026-07-02', 'construction', 'Materiales',
        '20000000-0000-0000-0000-0000000000b1', '50000000-0000-0000-0000-000000000050');
select test.eq((select status from public.expenses where id = '50000000-0000-0000-0000-000000000050'), 'voided',
  'registering the correct expense voids the wrong one');
select test.eq((select status from public.expenses where id = '50000000-0000-0000-0000-000000000051'), 'active',
  'the correction stays active');

select test.throws(
  $$insert into public.expenses (organization_id, house_id, amount, spent_on, kind, category, paid_by_partner_id, replaces_id)
    values ('10000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', 1, '2026-07-02',
            'construction', 'Materiales', '20000000-0000-0000-0000-0000000000b1', '50000000-0000-0000-0000-000000000050')$$,
  'not corrected yet', 'an expense cannot be corrected twice');
select test.eq((select count(*) from public.expenses where replaces_id = '50000000-0000-0000-0000-000000000050'), 1::bigint,
  'the failed second correction left nothing behind');
reset role;
