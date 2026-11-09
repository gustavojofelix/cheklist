-- =====================================================================
-- DEV / LOCAL ONLY — demo accounts with known passwords. Never run on production.
-- =====================================================================
-- ================================================================ DEMO USERS
-- Local test accounts only (never run against production):
--   superadmin@checklist.test / Checklist#Admin2026   (platform superadmin)
--   demo@checklist.test       / Checklist#Demo2026    (admin of "Demo Consultores, Lda")
--   gestor@checklist.test     / Checklist#Demo2026    (manager in the same organization)
do $$
declare
  v_admin uuid := '00000000-0000-4000-a000-000000000001';
  v_demo  uuid := '00000000-0000-4000-a000-000000000002';
  v_mgr   uuid := '00000000-0000-4000-a000-000000000003';
  v_org   uuid;
  u record;
begin
  for u in select * from (values
      (v_admin, 'superadmin@checklist.test', 'Checklist#Admin2026', '{"full_name":"Super Admin","accepted_terms":true}'::jsonb),
      (v_demo,  'demo@checklist.test', 'Checklist#Demo2026',
         '{"full_name":"Ana Demo","phone_number":"841234567","accepted_terms":true,
           "organization":{"name":"Demo Consultores, Lda","email":"geral@demo.test","type":"commercial","entity_subtype":"lda",
                           "company_size":"pequena","sector":"13","tax_id":"400123456","address":"Av. Julius Nyerere, 100",
                           "country":"MZ","province":"Maputo Cidade","phone":"841234567"}}'::jsonb),
      (v_mgr,   'gestor@checklist.test', 'Checklist#Demo2026', '{"full_name":"Bruno Gestor","accepted_terms":true}'::jsonb)
    ) as t(id, email, pw, meta)
  loop
    insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                            raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
                            confirmation_token, recovery_token, email_change_token_new, email_change)
    values ('00000000-0000-0000-0000-000000000000', u.id, 'authenticated', 'authenticated', u.email,
            extensions.crypt(u.pw, extensions.gen_salt('bf')), now(),
            '{"provider":"email","providers":["email"]}', u.meta, now(), now(), '', '', '', '');
    insert into auth.identities (id, provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
    values (gen_random_uuid(), u.id::text, u.id, jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
            'email', now(), now(), now());
  end loop;

  update public.profiles set platform_role = 'superadmin' where id = v_admin;

  select org_id into v_org from public.memberships where user_id = v_demo;
  -- demo plan: Profissional (allows 5 users and 3 branches) so every feature can be shown
  update public.subscriptions
     set plan_id = (select id from public.plans where slug = 'profissional'),
         plan_price_id = (select pp.id from public.plan_prices pp join public.plans p on p.id = pp.plan_id
                           where p.slug = 'profissional' and pp.period = 'annual'),
         status = 'active', trial_ends_at = null, current_period_start = now(),
         current_period_end = now() + interval '1 year'
   where organization_id = v_org;
  insert into public.memberships (org_id, user_id, role) values (v_org, v_mgr, 'manager');

  -- some realistic dates so the dashboard shows every state
  update public.checklist_items set answer = 'Demo Consultores, Lda' where organization_id = v_org and catalog_code = 'LEG-01';
  update public.checklist_items set answer = '100123456' where organization_id = v_org and catalog_code = 'LEG-03';
  update public.checklist_items set answer = '400123456' where organization_id = v_org and catalog_code = 'FIS-01';
  update public.checklist_items set due_date = private.today() + 400, answer = 'Ana Demo (100%)' where organization_id = v_org and catalog_code = 'LEG-11';
  update public.checklist_items set due_date = private.today() + 60,  answer = 'Conselho de Administração (3 membros)' where organization_id = v_org and catalog_code = 'SOC-01';
  update public.checklist_items set due_date = private.today() + 10,  answer = 'Mandato 2023–2026' where organization_id = v_org and catalog_code = 'SOC-03';
  update public.checklist_items set due_date = private.today() - 5,   answer = 'Alvará n.º 1234/2021' where organization_id = v_org and catalog_code = 'LIC-01';
  update public.checklist_items set due_date = private.today() + 75 where organization_id = v_org and catalog_code = 'FIS-03';
  update public.checklist_items set is_applicable = false where organization_id = v_org and catalog_code in ('PI-02','PI-03');
end $$;
