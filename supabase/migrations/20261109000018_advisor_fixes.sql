-- =====================================================================
-- 0018 · Supabase advisor findings (security + performance)
--   - fixed search_path on audit.block_mutation
--   - my_context() no longer callable anonymously
--   - auth.uid() wrapped in (select ...) so it is evaluated once per query, not per row
--   - "admin" policies split per command so SELECT is evaluated by a single policy
-- Accepted by design (documented in docs/phase3/PROGRESS.md):
--   - authenticated SECURITY DEFINER RPCs: each one checks the caller itself (pgTAP-tested)
--   - invitation_preview() is anonymous on purpose (sign-up page) and returns no sensitive data
--   - public.rls_auto_enable() is Supabase's own event trigger function (not callable via the API)
-- =====================================================================

alter function audit.block_mutation() set search_path = '';
revoke execute on function public.my_context() from anon;

-- ------------------------------------------------- auth.uid() init-plan
drop policy profiles_read on public.profiles;
create policy profiles_read on public.profiles for select to authenticated
  using (id = (select auth.uid()) or private.shares_org_with(id) or private.is_platform());
drop policy profiles_update_self on public.profiles;
create policy profiles_update_self on public.profiles for update to authenticated
  using (id = (select auth.uid()) or private.is_platform('superadmin'))
  with check (id = (select auth.uid()) or private.is_platform('superadmin'));

drop policy ci_update on public.checklist_items;
create policy ci_update on public.checklist_items for update to authenticated
  using (private.can_write_org(organization_id, 'manager')
         or (private.can_write_org(organization_id, 'user') and assignee_id = (select auth.uid())))
  with check (private.can_write_org(organization_id, 'user'));

drop policy doc_insert on public.documents;
create policy doc_insert on public.documents for insert to authenticated
  with check (private.can_write_org(organization_id, 'user') and uploaded_by = (select auth.uid()));

drop policy aic_own on public.ai_conversations;
create policy aic_own on public.ai_conversations for all to authenticated
  using (user_id = (select auth.uid()) and private.can_read_org(organization_id))
  with check (user_id = (select auth.uid()) and private.can_read_org(organization_id));

drop policy aim_read on public.ai_messages;
create policy aim_read on public.ai_messages for select to authenticated
  using (exists (select 1 from public.ai_conversations c where c.id = conversation_id and c.user_id = (select auth.uid())));

drop policy unlock_own on public.document_unlocks;
create policy unlock_own on public.document_unlocks for select to authenticated
  using (user_id = (select auth.uid()));

-- --------------------------------------- one SELECT policy per table
-- Each read policy already lets platform staff read; admin write rights become command-specific.
do $$
declare r record; cmd text;
begin
  for r in select * from (values
      ('addons', 'addons_admin', 'superadmin'), ('checklist_templates', 'tpl_admin', 'superadmin'),
      ('invoices', 'inv_bill_admin', 'superadmin'), ('plan_prices', 'prices_admin', 'superadmin'),
      ('plans', 'plans_admin', 'superadmin'), ('platform_settings', 'settings_admin', 'superadmin'),
      ('reference_lists', 'ref_admin', 'superadmin'), ('subscriptions', 'sub_admin', 'superadmin'),
      ('template_items', 'tpli_admin', 'superadmin'), ('template_versions', 'tplv_admin', 'superadmin')) as t(tbl, pol, role)
  loop
    execute format('drop policy %I on public.%I', r.pol, r.tbl);
    foreach cmd in array array['insert', 'update', 'delete'] loop
      if cmd = 'insert' then
        execute format('create policy %I on public.%I for insert to authenticated with check (private.is_platform(%L))',
                       r.pol || '_' || cmd, r.tbl, r.role);
      elsif cmd = 'update' then
        execute format('create policy %I on public.%I for update to authenticated using (private.is_platform(%L)) with check (private.is_platform(%L))',
                       r.pol || '_' || cmd, r.tbl, r.role, r.role);
      else
        execute format('create policy %I on public.%I for delete to authenticated using (private.is_platform(%L))',
                       r.pol || '_' || cmd, r.tbl, r.role);
      end if;
    end loop;
  end loop;
end $$;
