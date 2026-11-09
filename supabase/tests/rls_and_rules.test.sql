-- pgTAP: tenant isolation, role rules and business invariants.
-- Run with:  npx supabase test db
begin;
-- The hosted CLI connects as a login role; run fixtures as the database owner.
set local role postgres;
create extension if not exists pgtap with schema extensions;
-- pgTAP may already exist in another schema (the runner can pre-install it): put that schema on the path.
do $$
declare s text;
begin
  select n.nspname into s from pg_extension e join pg_namespace n on n.oid = e.extnamespace where e.extname = 'pgtap';
  perform set_config('search_path', 'public, extensions, ' || quote_ident(s), true);
end $$;
select plan(47);

-- ---------------------------------------------------------------- fixtures
create schema tests;
grant usage on schema tests to authenticated;
create or replace function tests.new_user(p_id uuid, p_email text, p_meta jsonb) returns void language sql as $$
  insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                          raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
                          confirmation_token, recovery_token, email_change_token_new, email_change)
  values ('00000000-0000-0000-0000-000000000000', p_id, 'authenticated', 'authenticated', p_email, 'x', now(),
          '{"provider":"email"}', p_meta, now(), now(), '', '', '', '');
$$;
create or replace function tests.login(p_id uuid) returns void language sql as $$
  select set_config('role', 'authenticated', true),
         set_config('request.jwt.claims', json_build_object('sub', p_id, 'role', 'authenticated')::text, true);
$$;
create or replace function tests.logout() returns void language sql as $$
  select set_config('role', 'postgres', true), set_config('request.jwt.claims', '', true);
$$;

select tests.new_user('10000000-0000-4000-a000-00000000000a', 'a@test.local',
  '{"full_name":"A","accepted_terms":true,"organization":{"name":"Org A","sector":"10","tax_id":"111111111"}}');
select tests.new_user('10000000-0000-4000-a000-00000000000b', 'b@test.local',
  '{"full_name":"B","accepted_terms":true,"organization":{"name":"Org B","sector":"3"}}');
select tests.new_user('10000000-0000-4000-a000-00000000000c', 'c@test.local', '{"full_name":"C (staff)"}');
update public.profiles set platform_role = 'superadmin' where email = 'c@test.local';

create table tests.ids as
select (select org_id from public.memberships where user_id = '10000000-0000-4000-a000-00000000000a') as org_a,
       (select org_id from public.memberships where user_id = '10000000-0000-4000-a000-00000000000b') as org_b;
grant select on tests.ids to authenticated;
grant execute on all functions in schema tests to authenticated;

-- --------------------------------------------------------- provisioning
select is((select count(*)::int from public.checklist_items where organization_id = (select org_a from tests.ids) and not is_category),
          39, 'sign-up provisions the 39-item checklist from the published template');
select is((select status::text from public.subscriptions where organization_id = (select org_a from tests.ids)),
          'trial', 'sign-up starts a trial subscription');
select is((select answer from public.checklist_items where organization_id = (select org_a from tests.ids) and catalog_code = 'LEG-12'),
          '10', 'sector item is bound to the company sector');

-- ------------------------------------------------------- tenant isolation
select tests.login('10000000-0000-4000-a000-00000000000a');
select is((select count(*)::int from public.organizations), 1, 'A sees only its own organization');
select is((select count(*)::int from public.checklist_items where organization_id = (select org_b from tests.ids)),
          0, 'A cannot read B''s checklist items');
select results_eq($$ with u as (update public.organizations set name = 'hacked' where id = (select org_b from tests.ids) returning 1)
                     select count(*)::int from u $$, $$ values (0) $$, 'A cannot update B''s organization');
select throws_ok($$ insert into public.documents (organization_id, storage_path, original_name, mime_type, size_bytes, uploaded_by)
                    values ((select org_b from tests.ids), (select org_b from tests.ids)::text || '/x/a.pdf', 'a.pdf', 'application/pdf', 10,
                            '10000000-0000-4000-a000-00000000000a') $$,
                 '42501', null, 'A cannot insert documents into B');
select throws_ok($$ select * from audit.log $$, '42501', null, 'audit.log is not directly readable');
select throws_ok($$ select * from public.audit_feed((select org_b from tests.ids)) $$, '42501', null, 'A cannot read B''s audit feed');
select ok((select count(*) from public.audit_feed((select org_a from tests.ids))) > 0, 'A reads its own audit feed');

-- ------------------------------------------------------------ rules
select throws_ok($$ update public.checklist_items set title = 'Renamed' where organization_id = (select org_a from tests.ids) and catalog_code = 'LEG-01' $$,
                 'P0001', 'catalogue_item_not_renamable', 'catalogue item titles are immutable');
select lives_ok($$ update public.checklist_items set due_date = current_date + 20, answer = 'ok'
                   where organization_id = (select org_a from tests.ids) and catalog_code = 'SOC-01' $$, 'admin edits an item');
select is((select compliance_state::text from public.checklist_items_state
            where organization_id = (select org_a from tests.ids) and catalog_code = 'SOC-01'),
          'atencao', 'due in 20 days → Atenção (critical window is 15)');
select throws_ok($$ update public.checklist_items set answer = 'x', row_version = 1
                   where organization_id = (select org_a from tests.ids) and catalog_code = 'SOC-01' $$,
                 'P0001', 'stale_row', 'optimistic locking rejects stale writes');
select throws_ok($$ select public.invite_member((select org_a from tests.ids), 'new@test.local', 'user') $$,
                 'P0001', 'quota_exceeded:users', 'Trial seat limit (1 user) blocks invitations');
select throws_ok($$ select public.create_branch((select org_a from tests.ids), '{"name":"Filial"}') $$,
                 'P0001', 'quota_exceeded:branches', 'Trial plan has no branches');
select throws_ok($$ select public.create_organization('{"name":"Second entity"}') $$,
                 'P0001', 'account_already_has_entity', 'one parent entity per account');
select throws_ok($$ delete from public.memberships where user_id = '10000000-0000-4000-a000-00000000000a' $$,
                 'P0001', 'last_admin', 'cannot remove the last admin');

-- ------------------------------------------------------- iteration 4: OTP, reminders, outbox
select lives_ok($$ select public.otp_request((select org_a from tests.ids)) $$, 'download code can be requested');
select throws_ok($$ select public.otp_request((select org_a from tests.ids)) $$, 'P0001', 'otp_too_soon', 'codes are rate limited');
select is(public.otp_verify((select org_a from tests.ids), '000000x'), null::timestamptz, 'a wrong code does not unlock downloads');

select tests.logout();
select is((select count(*)::int from public.email_outbox where to_email = 'a@test.local' and template = 'otp_code'),
          1, 'the code is queued for e-mail delivery');
update public.checklist_items set due_date = private.today() + 30
 where organization_id = (select org_a from tests.ids) and catalog_code = 'LIC-01';
select private.enqueue_due_notifications();
select private.enqueue_due_notifications();
select is((select count(*)::int from public.notification_log l join public.checklist_items i on i.id = l.checklist_item_id
            where i.organization_id = (select org_a from tests.ids) and i.catalog_code = 'LIC-01'),
          1, 'a due reminder is logged once even if the job runs twice');
select ok((select count(*) from public.email_outbox where to_email = 'a@test.local' and template = 'due_reminder') >= 1,
          'the reminder e-mail goes to the organization admin');
select tests.login('10000000-0000-4000-a000-00000000000c');
select is((select count(*)::int from public.email_outbox where template = 'otp_code'), 0, 'staff never see one-time codes');
select tests.login('10000000-0000-4000-a000-00000000000a');

-- ------------------------------------------------------- iteration 5: templates, upgrades, operators
select throws_ok($$ select public.template_draft((select id from public.checklist_templates where name = 'Obrigações Gerais')) $$,
                 '42501', null, 'customers cannot edit templates');
select tests.login('10000000-0000-4000-a000-00000000000c');
select lives_ok($$ select set_config('test.draft', public.template_draft((select id from public.checklist_templates where name = 'Obrigações Gerais'))::text, false) $$,
                'superadmin opens a draft version');
select is((select count(*)::int from public.template_items where version_id = current_setting('test.draft')::uuid), 44,
          'the draft copies every category and item');
select lives_ok($$ insert into public.template_items (version_id, parent_id, catalog_code, catalog_group, title)
                   select current_setting('test.draft')::uuid, id, 'LEG-13', 'Legal', 'Registo Comercial' from public.template_items
                    where version_id = current_setting('test.draft')::uuid and is_category and catalog_group = 'Legal' $$,
                'superadmin edits the draft');
select lives_ok($$ select public.template_publish(current_setting('test.draft')::uuid) $$, 'superadmin publishes version 2');
select throws_ok($$ update public.template_items set title = 'x' where version_id = current_setting('test.draft')::uuid $$,
                 'P0001', 'published_version_immutable', 'published versions are immutable');
select throws_ok($$ select public.operator_access_start((select org_a from tests.ids), 'support') $$,
                 'P0001', 'no_platform_consent', 'operators cannot enter without consent');
select tests.login('10000000-0000-4000-a000-00000000000a');
select is((public.version_offer((select org_a from tests.ids))->>'version_number')::int, 2, 'the customer is offered version 2');
select lives_ok($$ select public.apply_template_version((select org_a from tests.ids),
                   (public.version_offer((select org_a from tests.ids))->>'version_id')::uuid, 'take') $$, 'the customer takes version 2');
select ok(exists (select 1 from public.checklist_items where organization_id = (select org_a from tests.ids) and catalog_code = 'LEG-13'),
          'the new catalogue item is added');
select is((select answer from public.checklist_items where organization_id = (select org_a from tests.ids) and catalog_code = 'SOC-01'),
          'ok', 'existing answers are kept');
select lives_ok($$ select public.set_platform_access((select org_a from tests.ids), true) $$, 'the customer grants platform access');
select tests.login('10000000-0000-4000-a000-00000000000c');
select lives_ok($$ select public.operator_access_start((select org_a from tests.ids), 'support ticket 42') $$, 'operator enters with consent');
select is((select count(*)::int from public.checklist_items where organization_id = (select org_a from tests.ids) and not is_category),
          40, 'the operator can read the customer data during the session');
select lives_ok($$ select public.operator_access_end() $$, 'operator leaves');
select tests.login('10000000-0000-4000-a000-00000000000a');
select throws_ok($$ select public.set_platform_role('b@test.local', 'superadmin') $$, '42501', null, 'customers cannot grant platform roles');

-- ------------------------------------------------------- read-only mode
select tests.logout();
update public.subscriptions set trial_ends_at = now() - interval '1 day' where organization_id = (select org_a from tests.ids);
select tests.login('10000000-0000-4000-a000-00000000000a');
select results_eq($$ with u as (update public.checklist_items set notes = 'x' where organization_id = (select org_a from tests.ids) returning 1)
                     select count(*)::int from u $$, $$ values (0) $$, 'expired trial is read-only');
select ok((select count(*) from public.checklist_items where organization_id = (select org_a from tests.ids)) > 0,
          'expired trial can still read');

-- ------------------------------------------------------- platform staff
select tests.login('10000000-0000-4000-a000-00000000000c');
select is((select count(*)::int from public.organizations where id in ((select org_a from tests.ids), (select org_b from tests.ids))),
          2, 'superadmin lists organizations');
select is((select count(*)::int from public.checklist_items where organization_id = (select org_b from tests.ids)),
          0, 'superadmin cannot read customer data without consent + operator session');
select is(public.audit_verify_chain(), null::bigint, 'audit hash chain is intact');

-- -------------------------------------------------------- append-only
select tests.logout();
select throws_ok($$ update audit.log set event = 'tampered' $$, 'P0001', 'audit_log_is_append_only', 'audit log rejects updates');

select * from finish();
rollback;
