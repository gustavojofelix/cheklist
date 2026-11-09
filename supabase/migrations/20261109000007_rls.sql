-- =====================================================================
-- 0007 · Row Level Security: helpers + policies on every table
-- =====================================================================

-- ------------------------------------------------------------- helpers
-- All helpers are SECURITY DEFINER with an empty search_path so they can read
-- membership tables without recursive RLS and cannot be hijacked.

create or replace function private.is_platform(p_role public.platform_role default null)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles p
     where p.id = auth.uid() and p.status = 'active' and p.platform_role is not null
       and (p_role is null or p.platform_role = p_role or p.platform_role = 'superadmin'))
$$;

create or replace function private.root_org(p_org uuid)
returns uuid language sql stable security definer set search_path = '' as $$
  select coalesce(o.parent_id, o.id) from public.organizations o where o.id = p_org
$$;

-- Caller's role on an organization. Admins of a parent entity are admins of its branches.
create or replace function private.org_role(p_org uuid)
returns public.org_role language sql stable security definer set search_path = '' as $$
  select r from (
    select m.role as r
      from public.memberships m
     where m.org_id = p_org and m.user_id = auth.uid()
    union all
    select 'admin'::public.org_role
      from public.organizations o
      join public.memberships m on m.org_id = o.parent_id and m.user_id = auth.uid() and m.role = 'admin'
     where o.id = p_org
  ) x
  where exists (select 1 from public.profiles p where p.id = auth.uid() and p.status = 'active')
    and exists (select 1 from public.organizations o where o.id = p_org and o.deleted_at is null)
  order by r desc
  limit 1
$$;

-- 'full' | 'read_only' depending on the account subscription.
create or replace function private.access_mode(p_org uuid)
returns text language sql stable security definer set search_path = '' as $$
  select coalesce((
    select case
      when s.status = 'trial'    and s.trial_ends_at > now()                     then 'full'
      when s.status = 'active'   and s.current_period_end > now()                then 'full'
      when s.status = 'canceled' and s.current_period_end > now()                then 'full'
      when s.status = 'past_due' and coalesce(s.grace_until, s.current_period_end) > now() then 'full'
      else 'read_only' end
      from public.subscriptions s
     where s.organization_id = private.root_org(p_org)), 'read_only')
$$;

-- Platform staff may enter customer data only with consent and an open, recent operator session.
create or replace function private.operator_has_access(p_org uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select private.is_platform() and exists (
    select 1
      from public.organizations root
      join public.operator_sessions s on s.organization_id = root.id
     where root.id = private.root_org(p_org)
       and root.platform_access_authorized_at is not null
       and s.operator_id = auth.uid()
       and s.ended_at is null
       and s.started_at > now() - interval '8 hours')
$$;

create or replace function private.can_read_org(p_org uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select private.org_role(p_org) is not null or private.operator_has_access(p_org)
$$;

create or replace function private.can_write_org(p_org uuid, p_min public.org_role)
returns boolean language sql stable security definer set search_path = '' as $$
  select private.access_mode(p_org) = 'full' and (
           coalesce(private.org_role(p_org) >= p_min, false)
        or (p_min < 'admin' and private.operator_has_access(p_org)))
$$;

-- Users who share at least one organization with the caller.
create or replace function private.shares_org_with(p_user uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.memberships a
      join public.memberships b on b.org_id = a.org_id
     where a.user_id = auth.uid() and b.user_id = p_user)
$$;

revoke execute on all functions in schema private from public;
grant execute on all functions in schema private to anon, authenticated, service_role;

-- ----------------------------------------------------- enable everywhere
do $$
declare t text;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    -- (not FORCE: the table owner is only used by migrations and the vetted SECURITY DEFINER helpers)
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

-- ---------------------------------------------------- catalogue / platform
create policy ref_read   on public.reference_lists for select to anon, authenticated using (true);
create policy ref_admin  on public.reference_lists for all to authenticated
  using (private.is_platform('superadmin')) with check (private.is_platform('superadmin'));

create policy settings_read  on public.platform_settings for select to authenticated using (true);
create policy settings_admin on public.platform_settings for all to authenticated
  using (private.is_platform('superadmin')) with check (private.is_platform('superadmin'));

create policy email_tpl_admin on public.email_templates for all to authenticated
  using (private.is_platform('superadmin')) with check (private.is_platform('superadmin'));

create policy plans_read  on public.plans for select to anon, authenticated using (is_active or private.is_platform());
create policy plans_admin on public.plans for all to authenticated
  using (private.is_platform('superadmin')) with check (private.is_platform('superadmin'));
create policy prices_read  on public.plan_prices for select to anon, authenticated using (is_active or private.is_platform());
create policy prices_admin on public.plan_prices for all to authenticated
  using (private.is_platform('superadmin')) with check (private.is_platform('superadmin'));
create policy addons_read  on public.addons for select to anon, authenticated using (is_active or private.is_platform());
create policy addons_admin on public.addons for all to authenticated
  using (private.is_platform('superadmin')) with check (private.is_platform('superadmin'));

create policy tpl_read on public.checklist_templates for select to authenticated
  using (private.is_platform() or (status = 'published' and (organization_id is null or private.can_read_org(organization_id))));
create policy tpl_admin on public.checklist_templates for all to authenticated
  using (private.is_platform('superadmin')) with check (private.is_platform('superadmin'));
create policy tplv_read on public.template_versions for select to authenticated
  using (private.is_platform() or is_published);
create policy tplv_admin on public.template_versions for all to authenticated
  using (private.is_platform('superadmin')) with check (private.is_platform('superadmin'));
create policy tpli_read on public.template_items for select to authenticated
  using (private.is_platform() or exists (select 1 from public.template_versions v where v.id = version_id and v.is_published));
create policy tpli_admin on public.template_items for all to authenticated
  using (private.is_platform('superadmin')) with check (private.is_platform('superadmin'));

-- ------------------------------------------------------------- identity
create policy profiles_read on public.profiles for select to authenticated
  using (id = auth.uid() or private.shares_org_with(id) or private.is_platform());
create policy profiles_update_self on public.profiles for update to authenticated
  using (id = auth.uid() or private.is_platform('superadmin'))
  with check (id = auth.uid() or private.is_platform('superadmin'));

create policy org_read on public.organizations for select to authenticated
  using (private.can_read_org(id) or private.is_platform());
create policy org_update on public.organizations for update to authenticated
  using (private.can_write_org(id, 'admin') or private.is_platform('superadmin'))
  with check (private.can_write_org(id, 'admin') or private.is_platform('superadmin'));
-- inserts/deletes only through RPCs (create_account, create_branch, delete_branch)

create policy mem_read on public.memberships for select to authenticated
  using (private.can_read_org(org_id) or private.is_platform());
create policy mem_insert on public.memberships for insert to authenticated
  with check (private.can_write_org(org_id, 'admin') or private.is_platform('superadmin'));
create policy mem_update on public.memberships for update to authenticated
  using (private.can_write_org(org_id, 'admin') or private.is_platform('superadmin'))
  with check (private.can_write_org(org_id, 'admin') or private.is_platform('superadmin'));
create policy mem_delete on public.memberships for delete to authenticated
  using (private.org_role(org_id) = 'admin' or private.is_platform('superadmin'));

create policy inv_read on public.invitations for select to authenticated
  using (private.org_role(org_id) = 'admin' or private.is_platform());
create policy inv_update on public.invitations for update to authenticated
  using (private.org_role(org_id) = 'admin') with check (private.org_role(org_id) = 'admin');
-- creation through invite_member() RPC (token generation)

-- ----------------------------------------------------------- checklists
create policy cl_read on public.checklists for select to authenticated
  using (private.can_read_org(organization_id));
create policy cl_update on public.checklists for update to authenticated
  using (private.can_write_org(organization_id, 'manager'))
  with check (private.can_write_org(organization_id, 'manager'));

create policy ci_read on public.checklist_items for select to authenticated
  using (private.can_read_org(organization_id));
create policy ci_insert on public.checklist_items for insert to authenticated
  with check (private.can_write_org(organization_id, 'manager'));
create policy ci_update on public.checklist_items for update to authenticated
  using (private.can_write_org(organization_id, 'manager')
         or (private.can_write_org(organization_id, 'user') and assignee_id = auth.uid()))
  with check (private.can_write_org(organization_id, 'user'));
create policy ci_delete on public.checklist_items for delete to authenticated
  using (private.can_write_org(organization_id, 'manager') and template_item_id is null);

-- documents: soft delete only (no DELETE policy; purge is done by a scheduled job)
create policy doc_read on public.documents for select to authenticated
  using (private.can_read_org(organization_id));
create policy doc_insert on public.documents for insert to authenticated
  with check (private.can_write_org(organization_id, 'user') and uploaded_by = auth.uid());
create policy doc_update on public.documents for update to authenticated
  using (private.can_write_org(organization_id, 'user'))
  with check (private.can_write_org(organization_id, 'user'));

create policy di_read on public.document_items for select to authenticated
  using (exists (select 1 from public.documents d where d.id = document_id and private.can_read_org(d.organization_id)));
create policy di_insert on public.document_items for insert to authenticated
  with check (exists (select 1 from public.documents d where d.id = document_id and private.can_write_org(d.organization_id, 'user')));
create policy di_delete on public.document_items for delete to authenticated
  using (exists (select 1 from public.documents d where d.id = document_id and private.can_write_org(d.organization_id, 'user')));

create policy prop_read on public.item_proposals for select to authenticated
  using (private.can_read_org(organization_id));
create policy prop_update on public.item_proposals for update to authenticated
  using (private.can_write_org(organization_id, 'user')) with check (private.can_write_org(organization_id, 'user'));

create policy share_read on public.document_shares for select to authenticated
  using (private.can_read_org(organization_id));
create policy reports_read on public.reports for select to authenticated
  using (private.can_read_org(organization_id));

-- ------------------------------------------------------------------- AI
create policy aic_own on public.ai_conversations for all to authenticated
  using (user_id = auth.uid() and private.can_read_org(organization_id))
  with check (user_id = auth.uid() and private.can_read_org(organization_id));
create policy aim_read on public.ai_messages for select to authenticated
  using (exists (select 1 from public.ai_conversations c where c.id = conversation_id and c.user_id = auth.uid()));
create policy aia_read on public.ai_proposed_actions for select to authenticated
  using (private.can_read_org(organization_id));
create policy usage_read on public.usage_events for select to authenticated
  using (private.org_role(organization_id) = 'admin' or private.is_platform());

-- -------------------------------------------------------------- billing
create policy sub_read on public.subscriptions for select to authenticated
  using (private.org_role(organization_id) is not null or private.is_platform());
create policy sub_admin on public.subscriptions for all to authenticated
  using (private.is_platform('superadmin')) with check (private.is_platform('superadmin'));
create policy subev_read on public.subscription_events for select to authenticated
  using (private.is_platform() or exists (select 1 from public.subscriptions s
          where s.id = subscription_id and private.org_role(s.organization_id) = 'admin'));
create policy pay_read on public.payments for select to authenticated
  using (private.org_role(organization_id) = 'admin' or private.is_platform());
create policy inv_bill_read on public.invoices for select to authenticated
  using (private.org_role(organization_id) = 'admin' or private.is_platform());
create policy inv_bill_admin on public.invoices for all to authenticated
  using (private.is_platform('superadmin')) with check (private.is_platform('superadmin'));
create policy vouchers_admin on public.vouchers for all to authenticated
  using (private.is_platform('superadmin')) with check (private.is_platform('superadmin'));
create policy redemptions_read on public.voucher_redemptions for select to authenticated
  using (private.is_platform());
create policy webhooks_read on public.webhook_events for select to authenticated
  using (private.is_platform('superadmin'));
create policy officegest_read on public.officegest_sync for select to authenticated
  using (private.is_platform());

-- ------------------------------------------------------ platform security
create policy notif_read on public.notification_log for select to authenticated
  using (private.can_read_org(organization_id));
create policy unlock_own on public.document_unlocks for select to authenticated
  using (user_id = auth.uid());
create policy opsess_read on public.operator_sessions for select to authenticated
  using (private.is_platform() or private.org_role(organization_id) = 'admin');
-- otp_challenges: no policies → only service role (Edge Functions)
