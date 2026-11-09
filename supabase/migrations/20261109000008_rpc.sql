-- =====================================================================
-- 0008 · Business rules: quotas, account provisioning, RPCs
-- =====================================================================

-- ------------------------------------------------------------- limits
create or replace function private.effective_limits(p_org uuid)
returns table (max_users int, max_branches int, max_documents int, max_storage_bytes bigint,
               max_file_size_bytes bigint, max_ocr int, max_ia int)
language sql stable security definer set search_path = '' as $$
  select coalesce(s.max_users_override, p.max_users + s.extra_users),
         p.max_branches + s.extra_branches,
         p.max_documents,
         p.max_storage_bytes + s.extra_storage_bytes,
         p.max_file_size_bytes,
         p.max_ocr,
         p.max_ia
    from public.subscriptions s join public.plans p on p.id = s.plan_id
   where s.organization_id = private.root_org(p_org)
$$;

-- All organizations of an account (parent + branches).
create or replace function private.account_orgs(p_org uuid)
returns setof uuid language sql stable security definer set search_path = '' as $$
  select o.id from public.organizations o
   where coalesce(o.parent_id, o.id) = private.root_org(p_org) and o.deleted_at is null
$$;

create or replace function private.quota_documents()
returns trigger language plpgsql security definer set search_path = '' as $$
declare l record; v_count int; v_bytes bigint;
begin
  if tg_op = 'UPDATE' and not (old.deleted_at is not null and new.deleted_at is null) then
    return new;   -- only inserts and restores consume quota
  end if;
  select * into l from private.effective_limits(new.organization_id);
  if not found then
    raise exception 'quota_exceeded:subscription' using errcode = 'P0001';
  end if;
  if new.size_bytes > l.max_file_size_bytes then
    raise exception 'quota_exceeded:file_size' using errcode = 'P0001';
  end if;
  select count(*), coalesce(sum(size_bytes), 0) into v_count, v_bytes
    from public.documents
   where organization_id in (select private.account_orgs(new.organization_id)) and deleted_at is null;
  if l.max_documents is not null and v_count + 1 > l.max_documents then
    raise exception 'quota_exceeded:documents' using errcode = 'P0001';
  end if;
  if l.max_storage_bytes is not null and v_bytes + new.size_bytes > l.max_storage_bytes then
    raise exception 'quota_exceeded:storage' using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger documents_quota before insert or update on public.documents
  for each row execute function private.quota_documents();

-- Seats = distinct members across the account + open invitations.
create or replace function private.assert_seat_available(p_org uuid, p_email extensions.citext, p_user uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare l record; v_used int;
begin
  select * into l from private.effective_limits(p_org);
  if l.max_users is null then return; end if;
  if p_user is not null and exists (select 1 from public.memberships
       where user_id = p_user and org_id in (select private.account_orgs(p_org))) then
    return;   -- already occupies a seat in this account
  end if;
  select count(distinct m.user_id) into v_used
    from public.memberships m where m.org_id in (select private.account_orgs(p_org));
  select v_used + count(*) into v_used
    from public.invitations i
   where i.org_id in (select private.account_orgs(p_org))
     and i.accepted_at is null and i.revoked_at is null and i.expires_at > now()
     and (p_email is null or i.email <> p_email);
  if v_used + 1 > l.max_users then
    raise exception 'quota_exceeded:users' using errcode = 'P0001';
  end if;
end $$;

create or replace function private.quota_memberships()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform private.assert_seat_available(new.org_id, (select email from public.profiles where id = new.user_id), new.user_id);
  return new;
end $$;
create trigger memberships_quota before insert on public.memberships
  for each row execute function private.quota_memberships();

-- --------------------------------------------- checklist instantiation
create or replace function private.instantiate_checklist(p_org uuid, p_version uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_checklist uuid;
  v_scope public.item_scope := case when (select parent_id from public.organizations where id = p_org) is null
                                    then 'headquarters' else 'branch' end;
  v_template text;
begin
  select t.name into v_template from public.template_versions v join public.checklist_templates t on t.id = v.template_id
   where v.id = p_version;
  -- branches fall back to headquarters items when the template defines no branch set
  if v_scope = 'branch' and not exists (select 1 from public.template_items where version_id = p_version and scope = 'branch') then
    v_scope := 'headquarters';
  end if;

  insert into public.checklists (organization_id, template_version_id, title, description, created_by)
  values (p_org, p_version, coalesce(v_template, 'Checklist'), 'Catálogo de conformidade da entidade.', auth.uid())
  returning id into v_checklist;

  with m as (
    select id as old_id, gen_random_uuid() as new_id
      from public.template_items where version_id = p_version and scope = v_scope)
  insert into public.checklist_items (id, checklist_id, organization_id, parent_id, template_item_id, is_category,
         catalog_code, catalog_group, title, translations, answer_kind, bound_field, applicability,
         has_validity, requires_attachment, sort_order)
  select m.new_id, v_checklist, p_org, pm.new_id, ti.id, ti.is_category,
         ti.catalog_code, ti.catalog_group, ti.title, ti.translations, ti.answer_kind, ti.bound_field, ti.applicability,
         ti.has_validity, ti.requires_attachment, ti.sort_order
    from public.template_items ti
    join m on m.old_id = ti.id
    left join m pm on pm.old_id = ti.parent_id
   order by ti.parent_id nulls first, ti.sort_order;

  perform private.sync_bound_answers(p_org);
  update public.organizations set template_version_id = p_version where id = p_org;
  return v_checklist;
end $$;

-- Items bound to company data mirror the organization record.
create or replace function private.sync_bound_answers(p_org uuid)
returns void language sql security definer set search_path = '' as $$
  update public.checklist_items i
     set answer = case i.bound_field
                    when 'sector'        then o.sector
                    when 'shareholders'  then o.shareholders::text
                    when 'social_object' then o.social_object end
    from public.organizations o
   where o.id = p_org and i.organization_id = o.id and i.bound_field is not null
     and i.answer is distinct from case i.bound_field
                    when 'sector'        then o.sector
                    when 'shareholders'  then o.shareholders::text
                    when 'social_object' then o.social_object end
$$;

create or replace function private.on_org_changed()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.sector is distinct from old.sector or new.shareholders is distinct from old.shareholders
     or new.social_object is distinct from old.social_object then
    perform private.sync_bound_answers(new.id);
  end if;
  return null;
end $$;
create trigger organizations_sync_bound after update on public.organizations
  for each row execute function private.on_org_changed();

create or replace function private.published_version_for(p_sector text)
returns uuid language sql stable security definer set search_path = '' as $$
  select v.id
    from public.checklist_templates t
    join public.template_versions v on v.template_id = t.id and v.is_published
   where t.status = 'published' and t.organization_id is null
     and (t.sector = p_sector or t.sector is null)
   order by (t.sector is null), v.version_number desc
   limit 1
$$;

create or replace function private.setting(p_key text)
returns jsonb language sql stable security definer set search_path = '' as $$
  select value from public.platform_settings where key = p_key
$$;

-- ------------------------------------------------ account provisioning
-- Creates parent entity + admin membership + trial subscription + checklist.
create or replace function private.create_account(p_user uuid, p jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid;
  v_plan record;
  v_days int;
  v_version uuid;
begin
  if exists (select 1 from public.memberships m join public.organizations o on o.id = m.org_id
              where m.user_id = p_user and m.role = 'admin' and o.parent_id is null and o.deleted_at is null
                and o.created_by = p_user) then
    raise exception 'account_already_has_entity' using errcode = 'P0001';
  end if;
  if coalesce(trim(p->>'name'), '') = '' then
    raise exception 'organization_name_required' using errcode = 'P0001';
  end if;

  insert into public.organizations (name, email, type, entity_subtype, company_size, sector, tax_id, nuel,
         address, postal_box, country, province, phone, created_by)
  values (trim(p->>'name'), nullif(p->>'email',''), nullif(p->>'type',''), nullif(p->>'entity_subtype',''),
          nullif(p->>'company_size',''), nullif(p->>'sector',''), nullif(p->>'tax_id',''), nullif(p->>'nuel',''),
          nullif(p->>'address',''), nullif(p->>'postal_box',''), coalesce(nullif(p->>'country',''), 'MZ'),
          nullif(p->>'province',''), nullif(p->>'phone',''), p_user)
  returning id into v_org;

  select * into v_plan from public.plans where slug = 'trial' and is_active;
  if not found then
    raise exception 'trial_plan_missing' using errcode = 'P0001';
  end if;
  v_days := coalesce((private.setting('trial_days'))::int, v_plan.trial_days, 14);
  insert into public.subscriptions (organization_id, plan_id, plan_price_id, status, trial_ends_at,
         current_period_start, current_period_end, gateway)
  values (v_org, v_plan.id,
          (select id from public.plan_prices where plan_id = v_plan.id order by amount limit 1),
          'trial', now() + make_interval(days => v_days), now(), now() + make_interval(days => v_days), 'manual');

  insert into public.memberships (org_id, user_id, role, created_by) values (v_org, p_user, 'admin', p_user);

  v_version := private.published_version_for(nullif(p->>'sector',''));
  if v_version is not null then
    perform private.instantiate_checklist(v_org, v_version);
  end if;
  return v_org;
end $$;

-- New auth user → profile (+ account when company data was supplied at sign-up).
create or replace function private.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
declare m jsonb := coalesce(new.raw_user_meta_data, '{}');
begin
  insert into public.profiles (id, email, full_name, phone_country, phone_number, locale,
                               terms_accepted_at, privacy_accepted_at)
  values (new.id, new.email, coalesce(m->>'full_name', ''), coalesce(nullif(m->>'phone_country',''), 'MZ'),
          nullif(m->>'phone_number',''), coalesce(nullif(m->>'locale',''), 'pt'),
          case when (m->>'accepted_terms')::boolean then now() end,
          case when (m->>'accepted_terms')::boolean then now() end);
  if m ? 'organization' and jsonb_typeof(m->'organization') = 'object' then
    perform private.create_account(new.id, m->'organization');
  end if;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function private.handle_new_user();

-- Keep profile email in sync with auth.
create or replace function private.handle_user_email_change()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.email is distinct from old.email then
    update public.profiles set email = new.email where id = new.id;
  end if;
  return new;
end $$;
create trigger on_auth_user_email after update of email on auth.users
  for each row execute function private.handle_user_email_change();

-- ======================================================== public RPCs

-- Onboarding: signed-in user without an entity creates one.
create or replace function public.create_organization(payload jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  return private.create_account(auth.uid(), payload);
end $$;

create or replace function public.create_branch(parent uuid, payload jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_org uuid; v_used int; l record; v_version uuid;
begin
  if not private.can_write_org(parent, 'admin') then raise exception 'forbidden' using errcode = '42501'; end if;
  if (select parent_id from public.organizations where id = parent) is not null then
    raise exception 'branch_of_branch_not_allowed' using errcode = 'P0001';
  end if;
  select * into l from private.effective_limits(parent);
  select count(*) into v_used from public.organizations where parent_id = parent and deleted_at is null;
  if l.max_branches is not null and v_used + 1 > l.max_branches then
    raise exception 'quota_exceeded:branches' using errcode = 'P0001';
  end if;
  insert into public.organizations (parent_id, name, email, type, entity_subtype, tax_id, address, province,
                                    country, phone, sector, created_by)
  select parent, trim(payload->>'name'), nullif(payload->>'email',''), coalesce(nullif(payload->>'type',''), p.type),
         coalesce(nullif(payload->>'entity_subtype',''), p.entity_subtype), nullif(payload->>'tax_id',''),
         nullif(payload->>'address',''), nullif(payload->>'province',''), coalesce(nullif(payload->>'country',''), p.country),
         nullif(payload->>'phone',''), p.sector, auth.uid()
    from public.organizations p where p.id = parent
  returning id into v_org;
  -- a new branch starts from the version the customer has already accepted
  v_version := coalesce((select template_version_id from public.organizations where id = parent),
                        private.published_version_for((select sector from public.organizations where id = parent)));
  if v_version is not null then perform private.instantiate_checklist(v_org, v_version); end if;
  return v_org;
end $$;

create or replace function public.delete_branch(branch uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_parent uuid;
begin
  select parent_id into v_parent from public.organizations where id = branch and deleted_at is null;
  if v_parent is null then raise exception 'not_a_branch' using errcode = 'P0001'; end if;
  if not private.can_write_org(v_parent, 'admin') then raise exception 'forbidden' using errcode = '42501'; end if;
  update public.organizations set deleted_at = now() where id = branch;
end $$;

create or replace function public.set_platform_access(org uuid, allowed boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if private.org_role(org) is distinct from 'admin' or (select parent_id from public.organizations where id = org) is not null then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  update public.organizations
     set platform_access_authorized_at = case when allowed then now() end,
         platform_access_authorized_by = case when allowed then auth.uid() end
   where id = org;
  if not allowed then
    update public.operator_sessions set ended_at = now() where organization_id = org and ended_at is null;
  end if;
end $$;

-- Returns the raw token once; only its hash is stored.
create or replace function public.invite_member(org uuid, p_email text, p_role public.org_role default 'user')
returns text language plpgsql security definer set search_path = '' as $$
declare v_token text := encode(extensions.gen_random_bytes(24), 'hex');
        v_email extensions.citext := lower(trim(p_email));
begin
  if not private.can_write_org(org, 'admin') then raise exception 'forbidden' using errcode = '42501'; end if;
  if v_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'invalid_email' using errcode = 'P0001'; end if;
  if exists (select 1 from public.memberships m join public.profiles pr on pr.id = m.user_id
              where m.org_id = org and pr.email = v_email) then
    raise exception 'already_member' using errcode = 'P0001';
  end if;
  perform private.assert_seat_available(org, v_email, (select pr.id from public.profiles pr where pr.email = v_email));
  insert into public.invitations (org_id, email, role, token_hash, invited_by)
  values (org, v_email, p_role, encode(extensions.digest(v_token, 'sha256'), 'hex'), auth.uid());
  return v_token;
end $$;

create or replace function public.accept_invitation(token text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare i record; v_email extensions.citext;
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  select * into i from public.invitations where token_hash = encode(extensions.digest(token, 'sha256'), 'hex') for update;
  if not found or i.revoked_at is not null then raise exception 'invitation_invalid' using errcode = 'P0001'; end if;
  if i.accepted_at is not null or i.expires_at < now() then raise exception 'invitation_expired' using errcode = 'P0001'; end if;
  select email into v_email from public.profiles where id = auth.uid();
  if v_email <> i.email then raise exception 'invitation_wrong_account' using errcode = 'P0001'; end if;
  update public.invitations set accepted_at = now(), accepted_by = auth.uid() where id = i.id;
  insert into public.memberships (org_id, user_id, role, created_by)
  values (i.org_id, auth.uid(), i.role, i.invited_by)
  on conflict (org_id, user_id) do nothing;
  return i.org_id;
end $$;

-- Invitation preview for the sign-up page (no sensitive data).
create or replace function public.invitation_preview(token text)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('organization', o.name, 'email', i.email, 'role', i.role,
           'status', case when i.revoked_at is not null then 'invalid'
                          when i.accepted_at is not null or i.expires_at < now() then 'expired' else 'open' end)
    from public.invitations i join public.organizations o on o.id = i.org_id
   where i.token_hash = encode(extensions.digest(token, 'sha256'), 'hex')
$$;

-- Register an uploaded file and link it to one or more items (atomic).
create or replace function public.register_document(org uuid, p_path text, p_name text, p_mime text,
                                                    p_size bigint, p_sha256 text, p_item_ids uuid[])
returns uuid language plpgsql security invoker set search_path = '' as $$
declare v_doc uuid;
begin
  if coalesce(cardinality(p_item_ids), 0) = 0 then raise exception 'select_at_least_one_item' using errcode = 'P0001'; end if;
  insert into public.documents (organization_id, storage_path, original_name, mime_type, size_bytes, sha256, uploaded_by)
  values (org, p_path, p_name, p_mime, p_size, p_sha256, auth.uid()) returning id into v_doc;
  insert into public.document_items (document_id, checklist_item_id) select v_doc, unnest(p_item_ids);
  return v_doc;
end $$;

create or replace function public.delete_document(doc uuid)
returns void language plpgsql security invoker set search_path = '' as $$
declare v_days int := coalesce((private.setting('recycle_days'))::int, 30);
begin
  update public.documents set deleted_at = now(), deleted_by = auth.uid(),
         purge_after = now() + make_interval(days => v_days)
   where id = doc and deleted_at is null;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
end $$;

create or replace function public.restore_document(doc uuid)
returns void language plpgsql security invoker set search_path = '' as $$
begin
  update public.documents set deleted_at = null, deleted_by = null, purge_after = null
   where id = doc and deleted_at is not null;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
end $$;

-- Session context for the SPA in one round trip.
create or replace function public.my_context()
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'profile', (select to_jsonb(p) from public.profiles p where p.id = auth.uid()),
    'organizations', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', o.id, 'name', o.name, 'parent_id', o.parent_id, 'role', private.org_role(o.id),
               'logo_path', o.logo_path, 'ai_enabled', o.ai_enabled,
               'access_mode', private.access_mode(o.id)) order by o.parent_id nulls first, o.name)
        from public.organizations o
       where o.deleted_at is null and private.org_role(o.id) is not null), '[]'::jsonb),
    'subscriptions', coalesce((
      select jsonb_agg(jsonb_build_object(
               'organization_id', s.organization_id, 'status', s.status, 'plan', pl.name, 'plan_slug', pl.slug,
               'trial_ends_at', s.trial_ends_at, 'current_period_end', s.current_period_end))
        from public.subscriptions s join public.plans pl on pl.id = s.plan_id
       where private.org_role(s.organization_id) is not null), '[]'::jsonb))
$$;

-- Dashboard numbers for one account (parent + accessible branches) in one call.
create or replace function public.dashboard_summary(org uuid)
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
declare r jsonb;
begin
  if not private.can_read_org(org) then raise exception 'forbidden' using errcode = '42501'; end if;
  select jsonb_build_object(
    'entity_count',  count(distinct s.organization_id),
    'total',         count(*) filter (where not s.is_category),
    'regular',       count(*) filter (where not s.is_category and s.compliance_state = 'regular'),
    'atencao',       count(*) filter (where not s.is_category and s.compliance_state = 'atencao'),
    'critico',       count(*) filter (where not s.is_category and s.compliance_state = 'critico'),
    'expiring_window', count(*) filter (where not s.is_category and s.due_date between private.today() + 30 and private.today() + 90),
    'expired',       count(*) filter (where not s.is_category and s.is_overdue),
    'documents',     (select count(*) from public.documents d
                       where d.organization_id in (select private.account_orgs(org)) and d.deleted_at is null))
    into r
    from public.checklist_items_state s
   where s.organization_id in (select private.account_orgs(org));
  return r;
end $$;

-- Audit feed: admins (and managers) of the organization, or platform staff.
create or replace function public.audit_feed(org uuid, p_event text default null, p_from timestamptz default null,
                                             p_to timestamptz default null, p_ip text default null,
                                             p_before bigint default null, p_limit int default 50)
returns table (id bigint, occurred_at timestamptz, organization_id uuid, organization_name text, actor_id uuid,
               actor_name text, event text, table_name text, record_title text, changed_fields text[],
               old_data jsonb, new_data jsonb, ip inet)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not (coalesce(private.org_role(org) >= 'manager', false) or private.is_platform()) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return query
  select l.id, l.occurred_at, l.organization_id, o.name, l.actor_id, p.full_name, l.event, l.table_name,
         l.record_title, l.changed_fields, l.old_data, l.new_data, l.ip
    from audit.log l
    left join public.organizations o on o.id = l.organization_id
    left join public.profiles p on p.id = l.actor_id
   where l.organization_id in (select private.account_orgs(org))
     and (p_event is null or l.event = p_event)
     and (p_from is null or l.occurred_at >= p_from)
     and (p_to is null or l.occurred_at < p_to)
     and (p_ip is null or host(l.ip) = p_ip)
     and (p_before is null or l.id < p_before)
   order by l.id desc
   limit least(greatest(p_limit, 1), 200);
end $$;

-- Hash-chain verification (platform staff): returns the first broken link, if any.
create or replace function public.audit_verify_chain()
returns bigint language plpgsql stable security definer set search_path = '' as $$
declare r record; v_prev bytea; v_hash bytea;
begin
  if not private.is_platform('superadmin') then raise exception 'forbidden' using errcode = '42501'; end if;
  for r in select * from audit.log order by id loop
    v_hash := extensions.digest(coalesce(v_prev, ''::bytea)
               || convert_to(concat_ws('|', extract(epoch from r.occurred_at), r.organization_id, r.actor_id, r.event, r.table_name,
                                       r.record_id, r.old_data::text, r.new_data::text), 'UTF8'), 'sha256');
    if r.hash <> v_hash or r.prev_hash is distinct from v_prev then return r.id; end if;
    v_prev := r.hash;
  end loop;
  return null;
end $$;

-- Audit entries written by Edge Functions (downloads, shares, exports, operator visits). Service role only.
create or replace function public.log_event(p_event text, p_org uuid, p_table text, p_record uuid, p_title text,
                                            p_actor uuid, p_ip text default null, p_user_agent text default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform audit.write(p_event, p_org, p_table, p_record, p_title, null, null, null, p_actor,
                      nullif(trim(coalesce(p_ip, '')), '')::inet, p_user_agent);
end $$;

revoke execute on all functions in schema private from public;
grant execute on all functions in schema private to anon, authenticated, service_role;
revoke execute on function public.audit_verify_chain() from public, anon;
revoke execute on function public.log_event(text, uuid, text, uuid, text, uuid, text, text) from public, anon, authenticated;
grant execute on function public.log_event(text, uuid, text, uuid, text, uuid, text, text) to service_role;
-- authenticated-only RPCs (anon gets nothing useful, but keep the surface small)
revoke execute on function public.create_organization(jsonb), public.create_branch(uuid, jsonb), public.delete_branch(uuid),
  public.set_platform_access(uuid, boolean), public.invite_member(uuid, text, public.org_role),
  public.accept_invitation(text), public.register_document(uuid, text, text, text, bigint, text, uuid[]),
  public.delete_document(uuid), public.restore_document(uuid), public.dashboard_summary(uuid),
  public.audit_feed(uuid, text, timestamptz, timestamptz, text, bigint, int) from public, anon;
grant execute on function public.create_organization(jsonb), public.create_branch(uuid, jsonb), public.delete_branch(uuid),
  public.set_platform_access(uuid, boolean), public.invite_member(uuid, text, public.org_role),
  public.accept_invitation(text), public.register_document(uuid, text, text, text, bigint, text, uuid[]),
  public.delete_document(uuid), public.restore_document(uuid), public.dashboard_summary(uuid),
  public.audit_feed(uuid, text, timestamptz, timestamptz, text, bigint, int), public.audit_verify_chain(),
  public.my_context() to authenticated, service_role;
grant execute on function public.invitation_preview(text) to anon, authenticated;
