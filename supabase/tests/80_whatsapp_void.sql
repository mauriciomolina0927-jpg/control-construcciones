-- WhatsApp: voiding an expense takes a request and a "sí" from the same phone.

set role anon;
select test.login(null);
select test.eq((public.whatsapp_context('token-de-prueba', '573001112233') -> 'voidable') @> '[{"id": "50000000-0000-0000-0000-000000000070"}]', true,
  'the agent sees the recent active expenses it may void');
select test.eq(public.whatsapp_request_void('token-de-prueba', '573001112233', 'expense',
  '99999999-0000-0000-0000-000000000000', 'nada'), null::uuid, 'a record that does not exist cannot be requested');
select public.whatsapp_request_void('token-de-prueba', '573001112233', 'expense',
  '50000000-0000-0000-0000-000000000070', 'estaba repetido') as r1 \gset
select test.eq((public.whatsapp_context('token-de-prueba', '573001112233') -> 'void_request' ->> 'id')::uuid, :'r1'::uuid,
  'the request waits for a yes');
select test.throws($$update public.expenses set status = 'voided', voided_reason = 'x'$$, 'permission denied',
  'the webhook still cannot touch expenses directly');
select test.eq(public.whatsapp_confirm_void('token-de-prueba', '573001112233', :'r1'), 'voided', 'a yes voids it');
select test.eq(public.whatsapp_confirm_void('token-de-prueba', '573001112233', :'r1'), null::text, 'a second yes does nothing');
reset role;

select test.eq((select status || ' / ' || voided_reason from public.expenses where id = '50000000-0000-0000-0000-000000000070'),
  'voided / Anulado por WhatsApp (Papá): estaba repetido', 'the expense is voided, not deleted, with who and why');
select test.eq((select count(*) from public.audit_log where table_name = 'expenses'
  and record_id = '50000000-0000-0000-0000-000000000070' and action = 'update'), 1::bigint, 'the void is in the audit log');

-- Another phone cannot confirm someone else's request.
update public.partners set whatsapp_phone = '573009998877' where id = '20000000-0000-0000-0000-0000000000c1';
insert into public.expenses (id, organization_id, house_id, amount, spent_on, kind, category, paid_by_partner_id, source)
values ('50000000-0000-0000-0000-000000000080', '10000000-0000-0000-0000-000000000001',
        '30000000-0000-0000-0000-000000000001', 80000, '2026-10-22', 'construction', 'Transporte y acarreos',
        '20000000-0000-0000-0000-0000000000b1', 'whatsapp');
set role anon;
select public.whatsapp_request_void('token-de-prueba', '573001112233', 'expense',
  '50000000-0000-0000-0000-000000000080', null) as r2 \gset
select test.eq(public.whatsapp_confirm_void('token-de-prueba', '573009998877', :'r2'), null::text,
  'only the person who asked can confirm');
reset role;
select test.eq((select status from public.expenses where id = '50000000-0000-0000-0000-000000000080'), 'active',
  'so the expense stays active');

-- Several at once: one "sí" voids them all.
insert into public.expenses (id, organization_id, house_id, amount, spent_on, kind, category, paid_by_partner_id, source)
values ('50000000-0000-0000-0000-000000000081', '10000000-0000-0000-0000-000000000001',
        '30000000-0000-0000-0000-000000000001', 500000, '2026-10-22', 'construction', 'Materiales',
        '20000000-0000-0000-0000-0000000000b1', 'whatsapp');
set role anon;
select public.whatsapp_request_void_many('token-de-prueba', '573001112233',
  '[{"kind": "expense", "id": "50000000-0000-0000-0000-000000000080"},
    {"kind": "expense", "id": "50000000-0000-0000-0000-000000000081"},
    {"kind": "expense", "id": "50000000-0000-0000-0000-000000000070"}]', 'todos los de hoy') is not null as ok \gset
select test.eq(:'ok'::boolean, true, 'a batch keeps only what can still be voided');
select (public.whatsapp_context('token-de-prueba', '573001112233') -> 'void_request' ->> 'id')::uuid as r3 \gset
select test.eq(public.whatsapp_confirm_void_many('token-de-prueba', '573009998877', :'r3'), 0, 'another phone voids nothing');
select test.eq(public.whatsapp_confirm_void_many('token-de-prueba', '573001112233', :'r3'), 2, 'one yes voids the whole batch');
reset role;
select test.eq((select count(*) from public.expenses where id in ('50000000-0000-0000-0000-000000000080',
  '50000000-0000-0000-0000-000000000081') and status = 'voided'), 2::bigint, 'both are voided');
