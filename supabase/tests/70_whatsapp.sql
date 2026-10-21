-- WhatsApp: the webhook only proposes; a person confirms.

insert into private.webhook_tokens (name, token_hash)
values ('whatsapp', extensions.crypt('token-de-prueba', extensions.gen_salt('bf', 4)));
update public.partners set whatsapp_phone = '573001112233' where id = '20000000-0000-0000-0000-0000000000b1';

set role anon;
select test.login(null);

select test.throws($$select public.whatsapp_context('otro', '573001112233')$$, 'invalid webhook token',
  'a wrong token gets nothing');
select test.eq(public.whatsapp_context('token-de-prueba', '570000000000'), null::jsonb,
  'an unknown phone gets nothing');
select test.eq(public.whatsapp_context('token-de-prueba', '573001112233') ->> 'partner_name', 'Papá',
  'a known phone is recognized as its partner');
select test.eq(jsonb_array_length(public.whatsapp_context('token-de-prueba', '573001112233') -> 'houses'), 2,
  'the agent sees only the open houses');

select test.eq(public.whatsapp_record('token-de-prueba', '573001112233', 'wamid.1', 'in',
  'Cemento 850 mil', encode('fake-jpeg'::bytea, 'base64'), 'image/jpeg') is not null, true,
  'a message is recorded');
select test.eq(public.whatsapp_record('token-de-prueba', '573001112233', 'wamid.1', 'in', 'Cemento 850 mil'), null::uuid,
  'the same message delivered twice is recorded once');

select test.throws($$select from public.whatsapp_messages$$, 'permission denied',
  'anonymous callers cannot read messages directly');
select test.throws($$insert into public.expenses (organization_id, house_id, amount, spent_on, kind, category, paid_by_partner_id)
    values ('10000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', 1, '2026-07-02',
            'construction', 'Materiales', '20000000-0000-0000-0000-0000000000b1')$$, 'permission denied',
  'the webhook cannot write an expense');
reset role;

select id as m1 from public.whatsapp_messages where wa_message_id = 'wamid.1' \gset
set role anon;
select from public.whatsapp_suggest('token-de-prueba', :'m1',
  '{"amount": 850000, "category": "Materiales", "supplier_name": "Ferretería", "missing": ["house_id"]}');
reset role;

select test.eq((select missing from public.expense_suggestions), array['house_id'],
  'a suggestion records what is missing');
select test.eq((select paid_by_partner_id from public.expense_suggestions), '20000000-0000-0000-0000-0000000000b1'::uuid,
  'whoever wrote is the payer unless the message says otherwise');

select id as s1 from public.expense_suggestions \gset
set role anon;
select public.whatsapp_record('token-de-prueba', '573001112233', 'wamid.2', 'in', '1') as m2 \gset
select from public.whatsapp_suggest('token-de-prueba', :'m2',
  '{"house_id": "30000000-0000-0000-0000-000000000003", "missing": ["house_id"]}', :'s1');
select from public.whatsapp_suggest('token-de-prueba', :'m2',
  '{"house_id": "30000000-0000-0000-0000-000000000001", "missing": []}', :'s1');
reset role;
select test.eq((select house_id from public.expense_suggestions), '30000000-0000-0000-0000-000000000001'::uuid,
  'an answer fills in the open suggestion, never with a settled house');
select test.eq((select count(*) from public.expense_suggestions), 1::bigint, 'filling in does not create another');

-- Review in the app.
set role authenticated;
select test.login('00000000-0000-0000-0000-0000000000c1');
select test.eq((select count(*) from public.expense_suggestions), 0::bigint, 'the read-only partner does not see suggestions');

select test.login('00000000-0000-0000-0000-0000000000a1');
select test.eq((select count(*) from public.expense_suggestions), 1::bigint, 'the admin sees the suggestion');
select test.throws($$update public.expense_suggestions set status = 'confirmed'$$, 'must point to its expense',
  'a suggestion cannot be confirmed without its expense');

insert into public.expenses (id, organization_id, house_id, amount, spent_on, kind, category, paid_by_partner_id, source)
values ('50000000-0000-0000-0000-000000000070', '10000000-0000-0000-0000-000000000001',
        '30000000-0000-0000-0000-000000000001', 850000, '2026-10-21', 'construction', 'Materiales',
        '20000000-0000-0000-0000-0000000000b1', 'whatsapp');
update public.expense_suggestions set status = 'confirmed', expense_id = '50000000-0000-0000-0000-000000000070';
select test.eq((select reviewed_by from public.expense_suggestions), '00000000-0000-0000-0000-0000000000a1'::uuid,
  'the database records who confirmed');
select test.throws($$update public.expense_suggestions set status = 'discarded'$$, 'already reviewed',
  'a reviewed suggestion stays as it is');
select test.eq((select octet_length(bytes) from public.whatsapp_media), 9, 'the admin can read the photo to keep it as receipt');
reset role;
