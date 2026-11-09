-- =====================================================================
-- 0011 · E-mail outbox, templates, download OTP, due-date notifications,
--        recycle-bin purge hooks, scheduled jobs (pg_cron + pg_net)
--
-- Secrets are NOT in this file. After deploying, set once per project:
--   select vault.create_secret('<https://<ref>.supabase.co>', 'project_url');
--   select vault.create_secret('<random>', 'cron_secret');
--   supabase secrets set CRON_SECRET=<same random> RESEND_API_KEY=... EMAIL_FROM=...
-- (see docs/runbooks/secrets.md)
-- =====================================================================
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

insert into public.platform_settings (key, value) values
  ('app_url', '"https://cosmic-melomakarona-b9586f.netlify.app"'),
  ('otp_unlock_minutes', '30'),
  ('critical_repeat_days', '7')
on conflict (key) do nothing;

-- ------------------------------------------------------------------ outbox
create table public.email_outbox (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations on delete set null,
  to_email        extensions.citext not null,
  template        text not null,
  locale          text not null default 'pt',
  subject         text not null,
  body_text       text not null,
  status          text not null default 'pending' check (status in ('pending','sent','failed')),
  attempts        int not null default 0,
  last_error      text,
  provider_id     text,
  created_at      timestamptz not null default now(),
  sent_at         timestamptz
);
create index email_outbox_pending on public.email_outbox (created_at) where status = 'pending';
alter table public.email_outbox enable row level security;
-- Staff can see the queue, but never one-time codes.
create policy outbox_read on public.email_outbox for select to authenticated
  using (private.is_platform() and template <> 'otp_code');

-- {{name}} placeholders; unknown keys become empty strings.
create or replace function private.render(p_tpl text, p_vars jsonb)
returns text language plpgsql immutable set search_path = '' as $$
declare k text; v text; out text := p_tpl;
begin
  for k, v in select key, value from jsonb_each_text(coalesce(p_vars, '{}'::jsonb)) loop
    out := replace(out, '{{' || k || '}}', coalesce(v, ''));
  end loop;
  return regexp_replace(out, '\{\{[a-z_]+\}\}', '', 'g');
end $$;

create or replace function private.enqueue_email(p_to text, p_template text, p_vars jsonb, p_org uuid default null,
                                                 p_locale text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_locale text := coalesce(p_locale, (select locale from public.profiles where email = p_to::extensions.citext limit 1), 'pt');
  t record; v_id uuid;
begin
  select * into t from public.email_templates where key = p_template and locale = v_locale;
  if not found then
    select * into t from public.email_templates where key = p_template and locale = 'pt';
  end if;
  if not found then raise exception 'email_template_missing:%', p_template; end if;
  insert into public.email_outbox (organization_id, to_email, template, locale, subject, body_text)
  values (p_org, p_to, p_template, v_locale, private.render(t.subject, p_vars), private.render(t.body_md, p_vars))
  returning id into v_id;
  return v_id;
end $$;

-- Calls an Edge Function asynchronously (pg_net) with the cron shared secret. No-op until secrets exist.
create or replace function private.call_function(p_name text, p_body jsonb default '{}')
returns void language plpgsql security definer set search_path = '' as $$
declare v_url text; v_secret text;
begin
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'project_url';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'cron_secret';
  if v_url is null or v_secret is null then return; end if;
  perform net.http_post(
    url := v_url || '/functions/v1/' || p_name,
    body := p_body,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', v_secret),
    timeout_milliseconds := 30000);
end $$;

create or replace function private.dispatch_emails()
returns void language sql security definer set search_path = '' as $$
  select private.call_function('send-emails') where exists (select 1 from public.email_outbox where status = 'pending');
$$;

create or replace function private.app_url()
returns text language sql stable security definer set search_path = '' as $$
  select coalesce(value #>> '{}', '') from public.platform_settings where key = 'app_url'
$$;

-- ----------------------------------------------------------- invitations
-- Same contract as before, plus the invitation e-mail.
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
  perform private.enqueue_email(v_email, 'invitation', jsonb_build_object(
      'organization', (select name from public.organizations where id = org),
      'inviter', (select full_name from public.profiles where id = auth.uid()),
      'role', p_role::text,
      'link', private.app_url() || '/invite/' || v_token), org);
  perform private.dispatch_emails();
  return v_token;
end $$;

create or replace function public.resend_invitation(invitation uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare i record; v_token text := encode(extensions.gen_random_bytes(24), 'hex');
begin
  select * into i from public.invitations where id = invitation and accepted_at is null and revoked_at is null;
  if not found then raise exception 'invitation_invalid' using errcode = 'P0001'; end if;
  if not private.can_write_org(i.org_id, 'admin') then raise exception 'forbidden' using errcode = '42501'; end if;
  update public.invitations set token_hash = encode(extensions.digest(v_token, 'sha256'), 'hex'),
         expires_at = now() + interval '7 days' where id = invitation;
  perform private.enqueue_email(i.email, 'invitation', jsonb_build_object(
      'organization', (select name from public.organizations where id = i.org_id),
      'inviter', (select full_name from public.profiles where id = auth.uid()),
      'role', i.role::text, 'link', private.app_url() || '/invite/' || v_token), i.org_id);
  perform private.dispatch_emails();
  return v_token;
end $$;

-- ------------------------------------------------------------ download OTP
create or replace function public.otp_request(org uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_code text; v_root uuid := private.root_org(org);
begin
  if auth.uid() is null or not private.can_read_org(org) then raise exception 'forbidden' using errcode = '42501'; end if;
  -- rate limits: 1 per minute, 10 per hour
  if exists (select 1 from public.otp_challenges where user_id = auth.uid() and purpose = 'document'
              and created_at > now() - interval '1 minute') then
    raise exception 'otp_too_soon' using errcode = 'P0001';
  end if;
  if (select count(*) from public.otp_challenges where user_id = auth.uid() and purpose = 'document'
       and created_at > now() - interval '1 hour') >= 10 then
    raise exception 'otp_too_many' using errcode = 'P0001';
  end if;
  v_code := lpad(((('x' || encode(extensions.gen_random_bytes(4), 'hex'))::bit(32)::int & 2147483647) % 1000000)::text, 6, '0');
  insert into public.otp_challenges (user_id, purpose, code_hash, expires_at)
  values (auth.uid(), 'document', encode(extensions.digest(auth.uid()::text || ':' || v_code, 'sha256'), 'hex'),
          now() + interval '10 minutes');
  perform private.enqueue_email((select email from public.profiles where id = auth.uid()), 'otp_code',
            jsonb_build_object('code', v_code, 'organization', (select name from public.organizations where id = v_root)), v_root);
  perform private.dispatch_emails();
end $$;

create or replace function public.otp_verify(org uuid, code text)
returns timestamptz language plpgsql security definer set search_path = '' as $$
declare c record; v_root uuid := private.root_org(org);
        v_until timestamptz := now() + make_interval(mins => coalesce((private.setting('otp_unlock_minutes'))::int, 30));
begin
  if auth.uid() is null or not private.can_read_org(org) then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into c from public.otp_challenges
   where user_id = auth.uid() and purpose = 'document' and consumed_at is null and expires_at > now()
   order by created_at desc limit 1 for update;
  if not found then raise exception 'otp_invalid' using errcode = 'P0001'; end if;
  if c.attempts >= 5 then raise exception 'otp_too_many' using errcode = 'P0001'; end if;
  if c.code_hash <> encode(extensions.digest(auth.uid()::text || ':' || trim(code), 'sha256'), 'hex') then
    update public.otp_challenges set attempts = attempts + 1 where id = c.id;
    return null;   -- wrong code (attempt counted; caller shows an error)
  end if;
  update public.otp_challenges set consumed_at = now() where id = c.id;
  insert into public.document_unlocks (user_id, organization_id, unlocked_until) values (auth.uid(), v_root, v_until)
  on conflict (user_id, organization_id) do update set unlocked_until = excluded.unlocked_until;
  perform audit.write('otp.verified', v_root, 'otp_challenges', c.id, null, null, null, null);
  return v_until;
end $$;

-- ------------------------------------------------- due-date notifications
create or replace function private.notification_recipients(p_org uuid, p_assignee uuid)
returns extensions.citext[] language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(distinct e) filter (where e is not null), '{}')
    from (
      select unnest(case when cardinality(o.notification_emails) > 0 then o.notification_emails else r.notification_emails end) as e
        from public.organizations o join public.organizations r on r.id = coalesce(o.parent_id, o.id) where o.id = p_org
      union all
      select p.email from public.organizations o
        join public.organizations r on r.id = coalesce(o.parent_id, o.id)
        join public.memberships m on m.org_id = r.id and m.role = 'admin'
        join public.profiles p on p.id = m.user_id and p.status = 'active'
       where o.id = p_org and r.notify_admin
      union all
      select p.email from public.profiles p where p.id = p_assignee and p.status = 'active'
    ) x(e)
$$;

-- Runs daily: logs every reminder once and sends ONE e-mail per recipient per entity listing its items.
create or replace function private.enqueue_due_notifications()
returns int language plpgsql security definer set search_path = '' as $$
declare
  v_today date := private.today();
  v_repeat int := coalesce((private.setting('critical_repeat_days'))::int, 7);
  v_batches jsonb; b jsonb; v_n int := 0;
begin
  with due as (
    select i.id, i.organization_id, i.catalog_code, i.title, i.due_date, i.assignee_id,
           i.due_date - v_today as days_left, o.critical_days, o.repeat_while_critical, o.name as org_name,
           coalesce(i.notify_days, o.notification_days) as days
      from public.checklist_items i join public.organizations o on o.id = i.organization_id
     where not i.is_category and i.is_applicable and i.has_validity and i.due_date is not null
       and o.deleted_at is null and private.access_mode(o.id) = 'full'
  ), hits as (
    select d.*, case
             when d.days_left = any (d.days) then 'due'
             when d.repeat_while_critical and d.days_left <= d.critical_days and not exists (
                    select 1 from public.notification_log n where n.checklist_item_id = d.id and n.kind = 'critical_repeat'
                       and n.sent_at > now() - make_interval(days => v_repeat)) then 'critical_repeat'
           end as kind
      from due d
  ), logged as (
    insert into public.notification_log (organization_id, checklist_item_id, kind, days_before, due_date, recipients)
    select h.organization_id, h.id, h.kind, h.days_left, h.due_date, private.notification_recipients(h.organization_id, h.assignee_id)
      from hits h where h.kind is not null
    on conflict do nothing
    returning organization_id, checklist_item_id, recipients
  ), per_recipient as (
    select l.organization_id, unnest(l.recipients) as email, h.org_name,
           jsonb_build_object('code', h.catalog_code, 'title', h.title, 'due', to_char(h.due_date, 'DD/MM/YYYY'),
                              'days', h.days_left) as item
      from logged l join hits h on h.id = l.checklist_item_id
  )
  select coalesce(jsonb_agg(jsonb_build_object('org', g.organization_id, 'org_name', g.org_name, 'email', g.email, 'items', g.items)), '[]')
    into v_batches
    from (select organization_id, org_name, email, jsonb_agg(item order by (item->>'days')::int) items
            from per_recipient group by organization_id, org_name, email) g;

  for b in select * from jsonb_array_elements(v_batches) loop
    perform private.enqueue_email(b->>'email', 'due_reminder', jsonb_build_object(
        'organization', b->>'org_name',
        'count', jsonb_array_length(b->'items'),
        'items', (select string_agg('• ' || coalesce(x->>'code', '') || ' ' || (x->>'title') || ' — ' || (x->>'due')
                                    || case when (x->>'days')::int < 0 then ' (expirado há ' || abs((x->>'days')::int) || ' dias / expired '
                                                                              || abs((x->>'days')::int) || ' days ago)'
                                            else ' (' || (x->>'days') || ' dias / days)' end, E'\n')
                    from jsonb_array_elements(b->'items') x),
        'link', private.app_url() || '/entities/' || (b->>'org') || '/ficha'), (b->>'org')::uuid);
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;

-- ---------------------------------------------------- recycle-bin purge
-- Service role only: candidates = expired recycled documents + orphan uploads (> 24 h, never registered).
create or replace function public.purge_candidates()
returns table (kind text, path text, document_id uuid) language sql stable security definer set search_path = '' as $$
  select 'expired', d.storage_path, d.id from public.documents d
   where d.deleted_at is not null and d.purge_after < now()
  union all
  select 'orphan', o.name, null from storage.objects o
   where o.bucket_id = 'documents' and o.created_at < now() - interval '24 hours'
     and not exists (select 1 from public.documents d where d.storage_path = o.name)
  limit 500
$$;

create or replace function public.purge_finalize(p_document_ids uuid[])
returns int language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  delete from public.documents where id = any (p_document_ids) and deleted_at is not null and purge_after < now();
  get diagnostics n = row_count;
  return n;
end $$;

-- Audit CSV exports are themselves audited.
create or replace function public.log_audit_export(org uuid, p_rows int)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not (coalesce(private.org_role(org) >= 'manager', false) or private.is_platform()) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  perform audit.write('audit.export', org, 'audit_log', null, p_rows || ' rows', null, null, null);
end $$;

-- ---------------------------------------------------------------- grants
revoke execute on function public.purge_candidates(), public.purge_finalize(uuid[]) from public, anon, authenticated;
grant execute on function public.purge_candidates(), public.purge_finalize(uuid[]) to service_role;
revoke execute on function public.otp_request(uuid), public.otp_verify(uuid, text), public.resend_invitation(uuid),
  public.log_audit_export(uuid, int) from public, anon;
grant execute on function public.otp_request(uuid), public.otp_verify(uuid, text), public.resend_invitation(uuid),
  public.log_audit_export(uuid, int), public.invite_member(uuid, text, public.org_role) to authenticated, service_role;
revoke execute on all functions in schema private from public;
grant execute on all functions in schema private to anon, authenticated, service_role;

-- (email_outbox is deliberately NOT row-audited: OTP bodies must not be copied into the permanent log.)

-- ---------------------------------------------------------- email templates
insert into public.email_templates (key, locale, subject, body_md) values
('invitation','pt','Convite para {{organization}} — Checklist Legal',
 E'Olá,\n\n{{inviter}} convidou-o para a organização {{organization}} no Checklist Legal, com a função {{role}}.\n\nAceite o convite (válido por 7 dias):\n{{link}}\n\nSe não esperava este convite, ignore esta mensagem.'),
('invitation','en','Invitation to {{organization}} — Checklist Legal',
 E'Hello,\n\n{{inviter}} invited you to the organization {{organization}} on Checklist Legal, with the role {{role}}.\n\nAccept the invitation (valid for 7 days):\n{{link}}\n\nIf you were not expecting this invitation, ignore this message.'),
('otp_code','pt','Código de verificação: {{code}}',
 E'O seu código para descarregar documentos de {{organization}} é:\n\n{{code}}\n\nVálido durante 10 minutos. Se não pediu este código, ignore esta mensagem e altere a sua palavra-passe.'),
('otp_code','en','Verification code: {{code}}',
 E'Your code to download documents of {{organization}} is:\n\n{{code}}\n\nValid for 10 minutes. If you did not request it, ignore this message and change your password.'),
('due_reminder','pt','{{count}} item(ns) a acompanhar em {{organization}}',
 E'Os seguintes itens de {{organization}} estão a aproximar-se da data de validade ou já expiraram:\n\n{{items}}\n\nAbrir a ficha da entidade:\n{{link}}\n\nPode ajustar os avisos em Empresa → Notificações automáticas.'),
('due_reminder','en','{{count}} item(s) to follow up in {{organization}}',
 E'The following items of {{organization}} are approaching their validity date or have expired:\n\n{{items}}\n\nOpen the entity file:\n{{link}}\n\nYou can adjust these warnings in Company → Automatic notifications.')
on conflict (key, locale) do update set subject = excluded.subject, body_md = excluded.body_md;

-- ------------------------------------------------------------- schedules
-- 05:00 UTC = 07:00 Maputo
select cron.schedule('compliance-notify', '0 5 * * *',
  $$ select private.enqueue_due_notifications(); select private.dispatch_emails(); $$);
select cron.schedule('email-dispatch', '*/10 * * * *', $$ select private.dispatch_emails(); $$);
select cron.schedule('recycle-purge', '30 2 * * *', $$ select private.call_function('recycle-purge'); $$);
