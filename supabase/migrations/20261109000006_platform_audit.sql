-- =====================================================================
-- 0006 · Notifications, OTP, operator sessions, append-only audit log
-- =====================================================================

create table public.notification_log (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references public.organizations on delete cascade,
  checklist_item_id uuid references public.checklist_items on delete cascade,
  kind              text not null check (kind in ('due','critical_repeat','digest','quota')),
  days_before       int,
  due_date          date,
  recipients        extensions.citext[] not null,
  sent_at           timestamptz not null default now()
);
-- never send the same due-date reminder twice
create unique index notification_log_once on public.notification_log (checklist_item_id, due_date, days_before)
  where kind = 'due';

create table public.otp_challenges (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles on delete cascade,
  purpose     text not null check (purpose in ('document','bo_login')),
  code_hash   text not null,
  expires_at  timestamptz not null,
  attempts    int not null default 0,
  consumed_at timestamptz,
  created_at  timestamptz not null default now()
);

create table public.document_unlocks (
  user_id         uuid not null references public.profiles on delete cascade,
  organization_id uuid not null references public.organizations on delete cascade,
  unlocked_until  timestamptz not null,
  primary key (user_id, organization_id)
);

create table public.operator_sessions (
  id              uuid primary key default gen_random_uuid(),
  operator_id     uuid not null references public.profiles,
  organization_id uuid not null references public.organizations on delete cascade,
  reason          text not null check (length(trim(reason)) > 0),
  started_at      timestamptz not null default now(),
  ended_at        timestamptz
);
create index on public.operator_sessions (operator_id, organization_id) where ended_at is null;

-- ------------------------------------------------------------- audit log
create table audit.log (
  id                  bigint generated always as identity primary key,
  occurred_at         timestamptz not null default clock_timestamp(),
  organization_id     uuid,
  actor_id            uuid,
  actor_platform_role public.platform_role,
  operator_session_id uuid,
  event               text not null,
  table_name          text,
  record_id           uuid,
  record_title        text,
  old_data            jsonb,
  new_data            jsonb,
  changed_fields      text[],
  ip                  inet,
  user_agent          text,
  prev_hash           bytea,
  hash                bytea not null
);
create index on audit.log (organization_id, occurred_at desc);
create index on audit.log (actor_id, occurred_at desc);
create index on audit.log (event);

-- Append-only: nobody (not even service_role) can modify history.
revoke all on audit.log from public, anon, authenticated, service_role;

create or replace function audit.block_mutation()
returns trigger language plpgsql as $$
begin
  raise exception 'audit_log_is_append_only' using errcode = 'P0001';
end $$;
create trigger audit_log_immutable before update or delete on audit.log
  for each row execute function audit.block_mutation();
create trigger audit_log_no_truncate before truncate on audit.log
  for each statement execute function audit.block_mutation();

-- Request context (PostgREST exposes headers as a GUC). Cloudflare's real client IP first.
create or replace function audit.request_ip()
returns inet language plpgsql stable set search_path = '' as $$
declare h json; v text;
begin
  h := nullif(current_setting('request.headers', true), '')::json;
  v := coalesce(h->>'cf-connecting-ip', split_part(h->>'x-forwarded-for', ',', 1), h->>'x-real-ip');
  return nullif(trim(v), '')::inet;
exception when others then
  return null;
end $$;

create or replace function audit.request_user_agent()
returns text language sql stable set search_path = '' as $$
  select nullif(current_setting('request.headers', true), '')::json->>'user-agent'
$$;

-- Single writer: serialises appends and maintains the hash chain (tamper evidence).
create or replace function audit.write(
  p_event text, p_org uuid, p_table text, p_record uuid, p_title text,
  p_old jsonb, p_new jsonb, p_changed text[],
  p_actor uuid default null, p_ip inet default null, p_user_agent text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_prev  bytea;
  v_actor uuid := coalesce(p_actor, auth.uid());
  v_role  public.platform_role;
  v_op    uuid;
  v_ip    inet := coalesce(p_ip, audit.request_ip());
  v_ua    text := coalesce(p_user_agent, audit.request_user_agent());
  v_at    timestamptz := clock_timestamp();
begin
  perform pg_advisory_xact_lock(hashtext('audit.log'));
  select hash into v_prev from audit.log order by id desc limit 1;
  if v_actor is not null then
    select platform_role into v_role from public.profiles where id = v_actor;
    if v_role is not null and p_org is not null then
      select id into v_op from public.operator_sessions
       where operator_id = v_actor and organization_id in (p_org, (select parent_id from public.organizations where id = p_org))
         and ended_at is null order by started_at desc limit 1;
    end if;
  end if;
  insert into audit.log (occurred_at, organization_id, actor_id, actor_platform_role, operator_session_id, event,
                         table_name, record_id, record_title, old_data, new_data, changed_fields,
                         ip, user_agent, prev_hash, hash)
  values (v_at, p_org, v_actor, v_role, v_op, p_event, p_table, p_record, p_title, p_old, p_new, p_changed,
          v_ip, v_ua, v_prev,
          extensions.digest(coalesce(v_prev, ''::bytea)
            || convert_to(concat_ws('|', extract(epoch from v_at), p_org, v_actor, p_event, p_table, p_record, p_old::text, p_new::text), 'UTF8'),
            'sha256'));
end $$;

-- Generic row-change capture for business tables.
create or replace function audit.capture()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_old jsonb := case when tg_op <> 'INSERT' then to_jsonb(old) end;
  v_new jsonb := case when tg_op <> 'DELETE' then to_jsonb(new) end;
  v_row jsonb := coalesce(v_new, v_old);
  v_org uuid;
  v_changed text[];
  v_redact text[] := array['token_hash','code_hash','updated_at','row_version','last_access_at'];
  k text;
begin
  v_org := coalesce((v_row->>'organization_id')::uuid, (v_row->>'org_id')::uuid,
                    case when tg_table_name = 'organizations' then (v_row->>'id')::uuid end);
  if tg_op = 'UPDATE' then
    select array_agg(key order by key) into v_changed
      from jsonb_each(v_new) n
     where n.value is distinct from v_old->n.key and not (n.key = any (v_redact));
    if v_changed is null then
      return null;   -- nothing meaningful changed (e.g. only updated_at)
    end if;
  end if;
  foreach k in array v_redact loop
    v_old := v_old - k; v_new := v_new - k;
  end loop;
  perform audit.write(lower(tg_op), v_org, tg_table_name,
                      (v_row->>'id')::uuid,
                      coalesce(v_row->>'title', v_row->>'name', v_row->>'original_name', v_row->>'full_name', v_row->>'email', v_row->>'catalog_code'),
                      v_old, v_new, v_changed);
  return null;
end $$;

do $$
declare t text;
begin
  foreach t in array array[
    'profiles','organizations','memberships','invitations','checklists','checklist_items','documents',
    'document_items','item_proposals','document_shares','reports','subscriptions','payments','invoices',
    'vouchers','plans','plan_prices','addons','checklist_templates','template_versions','platform_settings',
    'reference_lists','email_templates','operator_sessions','ai_proposed_actions']
  loop
    execute format('create trigger audit_capture after insert or update or delete on public.%I
                    for each row execute function audit.capture()', t);
  end loop;
end $$;

-- Logins / logouts from Supabase Auth sessions (with the session's IP and user agent).
create or replace function audit.capture_session()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  s record := coalesce(new, old);
  v_event text := case when tg_op = 'INSERT' then 'auth.login' else 'auth.logout' end;
  v_org uuid;
  v_any boolean := false;
begin
  for v_org in select org_id from public.memberships where user_id = s.user_id loop
    perform audit.write(v_event, v_org, 'sessions', s.id, null, null, null, null, s.user_id, s.ip, s.user_agent);
    v_any := true;
  end loop;
  if not v_any then
    perform audit.write(v_event, null, 'sessions', s.id, null, null, null, null, s.user_id, s.ip, s.user_agent);
  end if;
  if tg_op = 'INSERT' then
    update public.profiles set last_access_at = now() where id = s.user_id;
  end if;
  return null;
end $$;

create trigger audit_sessions after insert or delete on auth.sessions
  for each row execute function audit.capture_session();
