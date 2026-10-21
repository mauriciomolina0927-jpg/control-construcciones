-- PIN sign-in and invitations.

-- ---------------------------------------------------------------- PIN
set role authenticated;
select test.login('00000000-0000-0000-0000-0000000000b1');

select test.eq(public.has_pin(), false, 'papá has no PIN yet');
select test.eq(public.verify_pin('1234'), 'no_pin', 'verifying without a PIN says so');
select test.throws($$select public.set_pin('12a4')$$, '4 digits', 'a PIN must be 4 digits');
select test.throws($$select public.set_pin('12345')$$, '4 digits', 'a PIN cannot be longer');
select public.set_pin('2580');
select test.eq(public.has_pin(), true, 'papá sets a PIN');
select test.eq(public.verify_pin('2580'), 'ok', 'the right PIN opens');
select test.eq(public.verify_pin('0000'), 'wrong', 'a wrong PIN does not open');
select test.eq(public.verify_pin('2580'), 'ok', 'a right PIN resets the count');
select test.throws($$select * from public.user_pins$$, 'permission denied', 'nobody reads the PIN table directly');

select public.verify_pin('1111'), public.verify_pin('1111'), public.verify_pin('1111'), public.verify_pin('1111');
select test.eq(public.verify_pin('1111'), 'locked', 'the fifth wrong PIN locks it');
select test.eq(public.verify_pin('2580'), 'locked', 'once locked, even the right PIN does not open');

reset role;
update auth.users set last_sign_in_at = now() + interval '1 second' where id = '00000000-0000-0000-0000-0000000000b1';
set role authenticated;
select test.eq(public.verify_pin('2580'), 'ok', 'signing in by email again unlocks the PIN');

reset role;
update auth.users set last_sign_in_at = now() - interval '1 hour' where id = '00000000-0000-0000-0000-0000000000b1';
set role authenticated;
select test.throws($$select public.set_pin('1357')$$, 'sign in by email again', 'changing the PIN needs a fresh email sign-in');

select test.login(null);
select test.throws($$select public.verify_pin('2580')$$, 'not signed in', 'a signed-out user cannot try PINs');
reset role;
set role anon;
select test.throws($$select public.verify_pin('2580')$$, 'permission denied', 'anon cannot call verify_pin');
select test.eq(public.is_invited('nadie@example.com'), false, 'the sign-in page can ask if an email is invited');
reset role;

-- ---------------------------------------------------------------- invitations
insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000f1', 'nuevo.socio@example.com');
insert into public.partners (id, organization_id, name)
values ('20000000-0000-0000-0000-0000000000f1', '10000000-0000-0000-0000-000000000001', 'Nuevo socio');

set role authenticated;
select test.login('00000000-0000-0000-0000-0000000000b1');
select test.throws(
  $$insert into public.invitations (organization_id, email, role)
    values ('10000000-0000-0000-0000-000000000001', 'x@example.com', 'admin')$$,
  'row-level security', 'papá cannot invite people');

select test.login('00000000-0000-0000-0000-0000000000a1');
insert into public.invitations (organization_id, email, role, partner_id)
values ('10000000-0000-0000-0000-000000000001', 'nuevo.socio@example.com', 'viewer', '20000000-0000-0000-0000-0000000000f1');
select test.throws(
  $$insert into public.invitations (organization_id, email, role)
    values ('10000000-0000-0000-0000-000000000001', 'Mayus@Example.com', 'viewer')$$,
  'check constraint', 'invitation emails are stored in lowercase');
select test.eq(public.is_invited(' Nuevo.Socio@example.com '), true, 'is_invited ignores case and spaces');

select test.login('00000000-0000-0000-0000-0000000000f1');
select test.eq((select count(*) from public.houses), 0::bigint, 'before accepting, the new user sees nothing');
select test.eq(public.accept_invitations(), 1, 'the first sign-in accepts the invitation');
select test.eq(public.accept_invitations(), 0, 'an invitation is accepted only once');
reset role;
select test.eq(
  (select role from public.memberships where user_id = '00000000-0000-0000-0000-0000000000f1'),
  'viewer', 'the invitation becomes a membership with its role');
select test.eq(
  (select user_id from public.partners where id = '20000000-0000-0000-0000-0000000000f1'),
  '00000000-0000-0000-0000-0000000000f1'::uuid, 'the invitation links the user to their partner record');
