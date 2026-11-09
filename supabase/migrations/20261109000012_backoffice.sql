-- =====================================================================
-- 0012 · Back office: template drafts/publishing, customer version upgrade,
--        operator access sessions, plan assignment, staff & user management,
--        platform-wide audit feed
-- =====================================================================

-- ------------------------------------------------------ template drafts
-- Returns the open draft of a template, creating it from the latest version if needed.
create or replace function public.template_draft(p_template uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_draft uuid; v_latest record;
begin
  if not private.is_platform('superadmin') then raise exception 'forbidden' using errcode = '42501'; end if;
  select id into v_draft from public.template_versions where template_id = p_template and not is_published;
  if v_draft is not null then return v_draft; end if;
  select * into v_latest from public.template_versions where template_id = p_template order by version_number desc limit 1;
  insert into public.template_versions (template_id, version_number)
  values (p_template, coalesce(v_latest.version_number, 0) + 1) returning id into v_draft;
  if v_latest.id is not null then
    with m as (select id as old_id, gen_random_uuid() as new_id from public.template_items where version_id = v_latest.id)
    insert into public.template_items (id, version_id, parent_id, scope, is_category, catalog_code, catalog_group, title,
           description, translations, has_validity, requires_attachment, applicability, applicability_rule, answer_kind,
           bound_field, sort_order)
    select m.new_id, v_draft, pm.new_id, ti.scope, ti.is_category, ti.catalog_code, ti.catalog_group, ti.title,
           ti.description, ti.translations, ti.has_validity, ti.requires_attachment, ti.applicability, ti.applicability_rule,
           ti.answer_kind, ti.bound_field, ti.sort_order
      from public.template_items ti join m on m.old_id = ti.id left join m pm on pm.old_id = ti.parent_id
     order by ti.parent_id nulls first, ti.sort_order;
  end if;
  return v_draft;
end $$;

create or replace function public.template_publish(p_version uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v record;
begin
  if not private.is_platform('superadmin') then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into v from public.template_versions where id = p_version for update;
  if not found or v.is_published then raise exception 'not_a_draft' using errcode = 'P0001'; end if;
  if not exists (select 1 from public.template_items where version_id = p_version and is_category) then
    raise exception 'template_empty' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.template_items where version_id = p_version and not is_category
              and (catalog_code is null or parent_id is null)) then
    raise exception 'template_item_needs_code_and_category' using errcode = 'P0001';
  end if;
  update public.template_versions set is_published = true, published_at = now(), published_by = auth.uid() where id = p_version;
  update public.checklist_templates set status = 'published' where id = v.template_id and status <> 'published';
end $$;

-- --------------------------------------------- customer version upgrade
-- Newer published version of the template the organization accepted, with a diff by catalogue code.
create or replace function public.version_offer(org uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_cur record; v_new record; v_scope public.item_scope; v_checklist uuid;
begin
  if not private.can_read_org(org) then raise exception 'forbidden' using errcode = '42501'; end if;
  select tv.* into v_cur from public.organizations o join public.template_versions tv on tv.id = o.template_version_id where o.id = org;
  if not found then return null; end if;
  select tv.*, t.name as template_name into v_new from public.template_versions tv join public.checklist_templates t on t.id = tv.template_id
   where tv.template_id = v_cur.template_id and tv.is_published and tv.version_number > v_cur.version_number
   order by tv.version_number desc limit 1;
  if not found then return null; end if;
  select id into v_checklist from public.checklists where organization_id = org;
  v_scope := case when (select parent_id from public.organizations where id = org) is null then 'headquarters' else 'branch' end;
  if v_scope = 'branch' and not exists (select 1 from public.template_items where version_id = v_new.id and scope = 'branch') then
    v_scope := 'headquarters';
  end if;
  return jsonb_build_object(
    'version_id', v_new.id, 'version_number', v_new.version_number, 'template_name', v_new.template_name,
    'current_version', v_cur.version_number,
    'added', coalesce((select jsonb_agg(jsonb_build_object('code', ti.catalog_code, 'title', ti.title) order by ti.catalog_code)
                         from public.template_items ti
                        where ti.version_id = v_new.id and ti.scope = v_scope and not ti.is_category
                          and not exists (select 1 from public.checklist_items ci where ci.checklist_id = v_checklist and ci.catalog_code = ti.catalog_code)), '[]'),
    'removed', coalesce((select jsonb_agg(jsonb_build_object('code', ci.catalog_code, 'title', ci.title) order by ci.catalog_code)
                         from public.checklist_items ci
                        where ci.checklist_id = v_checklist and ci.template_item_id is not null and not ci.is_category
                          and not exists (select 1 from public.template_items ti where ti.version_id = v_new.id and ti.scope = v_scope
                                             and ti.catalog_code = ci.catalog_code)), '[]'),
    'changed', coalesce((select jsonb_agg(jsonb_build_object('code', ci.catalog_code, 'from', ci.title, 'to', ti.title) order by ci.catalog_code)
                         from public.checklist_items ci
                         join public.template_items ti on ti.version_id = v_new.id and ti.scope = v_scope and ti.catalog_code = ci.catalog_code
                        where ci.checklist_id = v_checklist and not ci.is_category
                          and (ci.title <> ti.title or ci.has_validity <> ti.has_validity or ci.requires_attachment <> ti.requires_attachment
                               or ci.applicability <> ti.applicability)), '[]'),
    'customer_added', coalesce((select jsonb_agg(jsonb_build_object('code', ci.catalog_code, 'title', ci.title))
                         from public.checklist_items ci where ci.checklist_id = v_checklist and ci.template_item_id is null and not ci.is_category), '[]'));
end $$;

-- mode 'take': adopt titles/flags/structure of the new version (answers, dates and documents are kept);
-- mode 'keep': keep the customer's own changes and only add the new items.
create or replace function public.apply_template_version(org uuid, p_version uuid, p_mode text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_checklist uuid; v_scope public.item_scope; v_map jsonb := '{}'; ti record; v_id uuid; v_parent uuid; v_old uuid;
begin
  if not private.can_write_org(org, 'admin') then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_mode not in ('take', 'keep') then raise exception 'invalid_mode' using errcode = 'P0001'; end if;
  if (public.version_offer(org)->>'version_id')::uuid is distinct from p_version then
    raise exception 'version_not_offered' using errcode = 'P0001';
  end if;
  select id into v_checklist from public.checklists where organization_id = org;
  v_scope := case when (select parent_id from public.organizations where id = org) is null then 'headquarters' else 'branch' end;
  if v_scope = 'branch' and not exists (select 1 from public.template_items where version_id = p_version and scope = 'branch') then
    v_scope := 'headquarters';
  end if;
  v_old := (select template_version_id from public.organizations where id = org);

  for ti in select * from public.template_items where version_id = p_version and scope = v_scope
            order by parent_id nulls first, sort_order loop
    v_parent := (v_map->>(ti.parent_id::text))::uuid;
    if ti.is_category then
      select ci.id into v_id from public.checklist_items ci
       where ci.checklist_id = v_checklist and ci.is_category and ci.parent_id is null
         and (ci.catalog_group = ti.catalog_group or ci.title = ti.title) limit 1;
    else
      select ci.id into v_id from public.checklist_items ci where ci.checklist_id = v_checklist and ci.catalog_code = ti.catalog_code;
    end if;
    if v_id is null then
      insert into public.checklist_items (checklist_id, organization_id, parent_id, template_item_id, is_category, catalog_code,
             catalog_group, title, translations, answer_kind, bound_field, applicability, has_validity, requires_attachment, sort_order)
      values (v_checklist, org, v_parent, ti.id, ti.is_category, ti.catalog_code, ti.catalog_group, ti.title, ti.translations,
              ti.answer_kind, ti.bound_field, ti.applicability, ti.has_validity, ti.requires_attachment, ti.sort_order)
      returning id into v_id;
    elsif p_mode = 'take' then
      update public.checklist_items set template_item_id = ti.id, title = ti.title, translations = ti.translations,
             catalog_group = ti.catalog_group, has_validity = ti.has_validity or due_date is not null,
             requires_attachment = ti.requires_attachment, applicability = ti.applicability, answer_kind = ti.answer_kind,
             bound_field = ti.bound_field, sort_order = ti.sort_order, parent_id = coalesce(v_parent, parent_id)
       where id = v_id;
    else
      update public.checklist_items set template_item_id = ti.id where id = v_id;
    end if;
    v_map := v_map || jsonb_build_object(ti.id::text, v_id);
  end loop;

  -- catalogue items that no longer exist in the new version
  if p_mode = 'take' then
    delete from public.checklist_items ci
     where ci.checklist_id = v_checklist and not ci.is_category and ci.template_item_id in
           (select id from public.template_items where version_id = v_old)
       and ci.answer is null and ci.due_date is null
       and not exists (select 1 from public.document_items di where di.checklist_item_id = ci.id);
  end if;
  update public.checklist_items set template_item_id = null     -- kept as customer items
   where checklist_id = v_checklist and template_item_id in (select id from public.template_items where version_id = v_old);

  update public.organizations set template_version_id = p_version where id = org;
  update public.checklists set template_version_id = p_version where id = v_checklist;
  perform private.sync_bound_answers(org);
  perform audit.write('template.upgrade', org, 'checklists', v_checklist, p_mode, null,
                      jsonb_build_object('from_version', v_old, 'to_version', p_version, 'mode', p_mode), null);
end $$;

-- -------------------------------------------------------- operator access
create or replace function public.operator_access_start(org uuid, reason text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_root uuid := private.root_org(org); v_id uuid;
begin
  if not private.is_platform() then raise exception 'forbidden' using errcode = '42501'; end if;
  if (select platform_access_authorized_at from public.organizations where id = v_root) is null then
    raise exception 'no_platform_consent' using errcode = 'P0001';
  end if;
  if coalesce(trim(reason), '') = '' then raise exception 'reason_required' using errcode = 'P0001'; end if;
  update public.operator_sessions set ended_at = now() where operator_id = auth.uid() and ended_at is null;
  insert into public.operator_sessions (operator_id, organization_id, reason) values (auth.uid(), v_root, trim(reason))
  returning id into v_id;
  perform audit.write('operator.access_start', v_root, 'operator_sessions', v_id, trim(reason), null, null, null);
  return v_id;
end $$;

create or replace function public.operator_access_end()
returns void language plpgsql security definer set search_path = '' as $$
declare s record;
begin
  for s in update public.operator_sessions set ended_at = now() where operator_id = auth.uid() and ended_at is null returning * loop
    perform audit.write('operator.access_end', s.organization_id, 'operator_sessions', s.id, s.reason, null, null, null);
  end loop;
end $$;

-- Session context now includes organizations reachable through an operator session.
create or replace function public.my_context()
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'profile', (select to_jsonb(p) from public.profiles p where p.id = auth.uid()),
    'organizations', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', o.id, 'name', o.name, 'parent_id', o.parent_id,
               'role', coalesce(private.org_role(o.id), 'manager'::public.org_role),
               'operator', private.org_role(o.id) is null,
               'logo_path', o.logo_path, 'ai_enabled', o.ai_enabled,
               'access_mode', private.access_mode(o.id)) order by o.parent_id nulls first, o.name)
        from public.organizations o
       where o.deleted_at is null and (private.org_role(o.id) is not null or private.operator_has_access(o.id))), '[]'::jsonb),
    'subscriptions', coalesce((
      select jsonb_agg(jsonb_build_object(
               'organization_id', s.organization_id, 'status', s.status, 'plan', pl.name, 'plan_slug', pl.slug,
               'trial_ends_at', s.trial_ends_at, 'current_period_end', s.current_period_end))
        from public.subscriptions s join public.plans pl on pl.id = s.plan_id
       where private.org_role(s.organization_id) is not null or private.operator_has_access(s.organization_id)), '[]'::jsonb),
    'operator_session', (select jsonb_build_object('organization_id', s.organization_id, 'started_at', s.started_at, 'reason', s.reason)
                           from public.operator_sessions s where s.operator_id = auth.uid() and s.ended_at is null
                            and s.started_at > now() - interval '8 hours' order by s.started_at desc limit 1))
$$;

-- ------------------------------------------------------------ plan assignment
create or replace function public.admin_assign_plan(org uuid, p_price uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_price record; v_len interval;
begin
  if not private.is_platform('superadmin') then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into v_price from public.plan_prices where id = p_price;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  v_len := case v_price.period when 'monthly' then interval '1 month' when 'quarterly' then interval '3 months'
                               when 'semestral' then interval '6 months' else interval '1 year' end;
  update public.subscriptions set plan_id = v_price.plan_id, plan_price_id = v_price.id, status = 'active',
         trial_ends_at = null, current_period_start = now(), current_period_end = now() + v_len, grace_until = null,
         cancel_at_period_end = false, canceled_at = null, gateway = 'manual'
   where organization_id = private.root_org(org);
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
end $$;

-- -------------------------------------------------- staff & user management
create or replace function public.set_platform_role(p_email text, p_role public.platform_role)
returns void language plpgsql security definer set search_path = '' as $$
declare v_user uuid;
begin
  if not private.is_platform('superadmin') then raise exception 'forbidden' using errcode = '42501'; end if;
  select id into v_user from public.profiles where email = lower(trim(p_email))::extensions.citext;
  if v_user is null then raise exception 'user_not_found' using errcode = 'P0001'; end if;
  if v_user = auth.uid() then raise exception 'cannot_change_own_role' using errcode = 'P0001'; end if;
  update public.profiles set platform_role = p_role where id = v_user;
end $$;

create or replace function public.set_user_status(p_user uuid, p_status public.user_status)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_user = auth.uid() then raise exception 'cannot_change_own_status' using errcode = 'P0001'; end if;
  if not (private.is_platform('superadmin') or (
        exists (select 1 from public.profiles where id = p_user and platform_role is null)
        and exists (select 1 from public.memberships m where m.user_id = p_user
                     and private.org_role(m.org_id) = 'admin'))) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  update public.profiles set status = p_status where id = p_user;
  if p_status = 'suspended' then
    -- Sign out everywhere (logged as auth.logout). Access is already cut by RLS (helpers require an active profile).
    begin
      delete from auth.sessions where user_id = p_user;
    exception when insufficient_privilege then null;
    end;
  end if;
end $$;

-- --------------------------------------------------------- platform audit
create or replace function public.audit_feed_platform(p_org uuid default null, p_event text default null,
       p_from timestamptz default null, p_to timestamptz default null, p_before bigint default null, p_limit int default 50)
returns table (id bigint, occurred_at timestamptz, organization_id uuid, organization_name text, actor_id uuid,
               actor_name text, event text, table_name text, record_title text, changed_fields text[],
               old_data jsonb, new_data jsonb, ip inet)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_platform() then raise exception 'forbidden' using errcode = '42501'; end if;
  return query
  select l.id, l.occurred_at, l.organization_id, o.name, l.actor_id, p.full_name, l.event, l.table_name,
         l.record_title, l.changed_fields, l.old_data, l.new_data, l.ip
    from audit.log l
    left join public.organizations o on o.id = l.organization_id
    left join public.profiles p on p.id = l.actor_id
   where (p_org is null or l.organization_id = p_org)
     and (p_event is null or l.event = p_event)
     and (p_from is null or l.occurred_at >= p_from)
     and (p_to is null or l.occurred_at < p_to)
     and (p_before is null or l.id < p_before)
   order by l.id desc
   limit least(greatest(p_limit, 1), 200);
end $$;

-- New accounts inherit the platform default for download OTP.
create or replace function private.default_document_otp()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.parent_id is null and not new.document_otp_required then
    new.document_otp_required := coalesce((private.setting('document_otp_default'))::boolean, false);
  end if;
  return new;
end $$;
create trigger organizations_default_otp before insert on public.organizations
  for each row execute function private.default_document_otp();

-- ------------------------------------------------------------------ grants
revoke execute on function public.template_draft(uuid), public.template_publish(uuid), public.version_offer(uuid),
  public.apply_template_version(uuid, uuid, text), public.operator_access_start(uuid, text), public.operator_access_end(),
  public.admin_assign_plan(uuid, uuid), public.set_platform_role(text, public.platform_role),
  public.set_user_status(uuid, public.user_status),
  public.audit_feed_platform(uuid, text, timestamptz, timestamptz, bigint, int) from public, anon;
grant execute on function public.template_draft(uuid), public.template_publish(uuid), public.version_offer(uuid),
  public.apply_template_version(uuid, uuid, text), public.operator_access_start(uuid, text), public.operator_access_end(),
  public.admin_assign_plan(uuid, uuid), public.set_platform_role(text, public.platform_role),
  public.set_user_status(uuid, public.user_status),
  public.audit_feed_platform(uuid, text, timestamptz, timestamptz, bigint, int), public.my_context() to authenticated, service_role;
revoke execute on all functions in schema private from public;
grant execute on all functions in schema private to anon, authenticated, service_role;
