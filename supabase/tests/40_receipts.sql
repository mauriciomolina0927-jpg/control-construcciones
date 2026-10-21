-- Receipt photos: storage permissions and the link to expenses.

set role authenticated;
select test.login('00000000-0000-0000-0000-0000000000b1');

insert into public.expenses (id, organization_id, house_id, amount, spent_on, kind, category, paid_by_partner_id)
values ('50000000-0000-0000-0000-000000000040', '10000000-0000-0000-0000-000000000001',
        '30000000-0000-0000-0000-000000000001', 320000, '2026-07-01', 'construction', 'Materiales',
        '20000000-0000-0000-0000-0000000000b1');
select test.eq((select has_receipt from public.expenses where id = '50000000-0000-0000-0000-000000000040'), false,
  'a new expense starts without receipt');

insert into storage.objects (bucket_id, name)
values ('receipts', '10000000-0000-0000-0000-000000000001/30000000-0000-0000-0000-000000000001/recibo-1.jpg');
select test.eq((select count(*) from storage.objects where name like '%recibo-1.jpg'), 1::bigint,
  'papá uploads a receipt photo to the house folder');
select test.throws(
  $$insert into storage.objects (bucket_id, name)
    values ('receipts', '10000000-0000-0000-0000-000000000002/30000000-0000-0000-0000-000000000001/x.jpg')$$,
  'row-level security', 'a photo cannot go under another organization');

insert into public.attachments (organization_id, house_id, owner_type, owner_id, storage_path, mime_type, size_bytes, sha256)
values ('10000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', 'expense',
        '50000000-0000-0000-0000-000000000040',
        '10000000-0000-0000-0000-000000000001/30000000-0000-0000-0000-000000000001/recibo-1.jpg',
        'image/jpeg', 250000, repeat('a', 64));
select test.eq((select has_receipt from public.expenses where id = '50000000-0000-0000-0000-000000000040'), true,
  'attaching the photo marks the expense as supported');

select test.throws(
  $$insert into public.attachments (organization_id, house_id, owner_type, owner_id, storage_path, mime_type, size_bytes, sha256)
    values ('10000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000002', 'expense',
            '50000000-0000-0000-0000-000000000040',
            '10000000-0000-0000-0000-000000000001/30000000-0000-0000-0000-000000000002/r.jpg',
            'image/jpeg', 1000, repeat('b', 64))$$,
  'does not match', 'a receipt cannot point to an expense of another house');
select test.throws(
  $$insert into public.attachments (organization_id, house_id, owner_type, owner_id, storage_path, mime_type, size_bytes, sha256)
    values ('10000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', 'expense',
            '50000000-0000-0000-0000-000000000040', 'otra/carpeta/r.jpg', 'image/jpeg', 1000, repeat('c', 64))$$,
  'organization/house/file', 'the receipt path must match its house');
select test.throws(
  $$insert into public.attachments (organization_id, house_id, owner_type, owner_id, storage_path, mime_type, size_bytes, sha256)
    values ('10000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', 'expense',
            '50000000-0000-0000-0000-000000000040',
            '10000000-0000-0000-0000-000000000001/30000000-0000-0000-0000-000000000001/v.exe',
            'application/x-msdownload', 1000, repeat('d', 64))$$,
  'check constraint', 'only images and PDF are accepted');

select test.throws(
  $$update public.expenses set has_receipt = false where id = '50000000-0000-0000-0000-000000000040'$$,
  'cannot be edited', 'a supported expense cannot lose its receipt');
update public.expenses set status = 'voided', voided_reason = 'Duplicado' where id = '50000000-0000-0000-0000-000000000040';
select test.eq((select status from public.expenses where id = '50000000-0000-0000-0000-000000000040'), 'voided',
  'an expense with receipt can still be voided');

-- ---------------------------------------------------------------- the viewer partner
select test.login('00000000-0000-0000-0000-0000000000c1');
select test.eq((select count(*) from storage.objects where name like '%recibo-1.jpg'), 1::bigint,
  'socio sees the receipts of his house');
select test.throws(
  $$insert into storage.objects (bucket_id, name)
    values ('receipts', '10000000-0000-0000-0000-000000000001/30000000-0000-0000-0000-000000000001/socio.jpg')$$,
  'row-level security', 'socio cannot upload receipts');

select test.login('00000000-0000-0000-0000-0000000000d1');
select test.eq((select count(*) from storage.objects where name like '%recibo-1.jpg'), 0::bigint,
  'otro socio cannot see receipts of a house that is not his');
reset role;

select test.throws($$delete from public.attachments$$, 'cannot be changed', 'receipts cannot be deleted');
