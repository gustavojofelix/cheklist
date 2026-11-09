-- =====================================================================
-- 0003 · Identity & tenancy: profiles, organizations, memberships, invitations
-- =====================================================================

create table public.profiles (
  id                  uuid primary key references auth.users on delete cascade,
  email               extensions.citext not null,
  full_name           text not null default '',
  phone_country       char(2) not null default 'MZ',
  phone_number        text check (phone_number is null or phone_number ~ '^[0-9]{9}$'),
  status              public.user_status not null default 'active',
  platform_role       public.platform_role,          -- NULL = customer user
  locale              text not null default 'pt' check (locale in ('pt','en')),
  terms_accepted_at   timestamptz,
  privacy_accepted_at timestamptz,
  last_access_at      timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create table public.organizations (
  id                            uuid primary key default gen_random_uuid(),
  parent_id                     uuid references public.organizations on delete restrict,
  name                          text not null check (length(trim(name)) > 0),
  email                         extensions.citext,
  type                          text,
  entity_subtype                text,
  company_size                  text,
  sector                        text,
  tax_id                        text check (tax_id is null or tax_id ~ '^[0-9]{9}$'),   -- NUIT
  nuel                          text,
  constitution_date             date,
  share_capital                 numeric(16,2) check (share_capital is null or share_capital >= 0),
  shareholders                  int check (shareholders is null or shareholders >= 0),
  social_object                 text,
  fiscal_activity_start_date    date,
  address                       text,
  postal_box                    text,
  country                       char(2) default 'MZ',
  province                      text,
  phone                         text,
  logo_path                     text,
  ai_enabled                    boolean not null default true,
  -- automatic notifications
  notification_emails           extensions.citext[] not null default '{}',
  notification_days             int[] not null default '{90,60,30,15,1}',
  attention_days                int not null default 90 check (attention_days between 1 and 365),
  critical_days                 int not null default 15 check (critical_days between 0 and 365),
  repeat_while_critical         boolean not null default true,
  notify_admin                  boolean not null default true,
  monthly_digest                boolean not null default false,
  document_otp_required         boolean not null default false,
  -- platform-operator consent
  platform_access_authorized_at timestamptz,
  platform_access_authorized_by uuid references public.profiles,
  -- accepted checklist template version
  template_version_id           uuid references public.template_versions,
  created_by                    uuid references public.profiles,
  deleted_at                    timestamptz,
  created_at                    timestamptz not null default now(),
  updated_at                    timestamptz not null default now(),
  constraint org_not_own_parent check (parent_id is distinct from id),
  constraint org_thresholds check (critical_days < attention_days)
);
create index on public.organizations (parent_id);

alter table public.checklist_templates
  add constraint checklist_templates_org_fk foreign key (organization_id) references public.organizations on delete cascade;

create table public.memberships (
  org_id     uuid not null references public.organizations on delete cascade,
  user_id    uuid not null references public.profiles on delete cascade,
  role       public.org_role not null default 'user',
  created_by uuid references public.profiles,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (org_id, user_id)
);
create index on public.memberships (user_id);

create table public.invitations (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations on delete cascade,
  email       extensions.citext not null,
  role        public.org_role not null default 'user',
  token_hash  text not null unique,
  invited_by  uuid references public.profiles,
  expires_at  timestamptz not null default now() + interval '7 days',
  accepted_at timestamptz,
  accepted_by uuid references public.profiles,
  revoked_at  timestamptz,
  created_at  timestamptz not null default now()
);
create index on public.invitations (org_id);
create unique index invitations_one_open_per_email on public.invitations (org_id, email)
  where accepted_at is null and revoked_at is null;

create trigger set_updated_at before update on public.profiles      for each row execute function private.set_updated_at();
create trigger set_updated_at before update on public.organizations for each row execute function private.set_updated_at();
create trigger set_updated_at before update on public.memberships   for each row execute function private.set_updated_at();

-- ---------------------------------------------------------------- guards

-- Only one level of branches: a branch's parent must be a parent entity.
create or replace function private.guard_org_hierarchy()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.parent_id is not null and exists (
      select 1 from public.organizations where id = new.parent_id and parent_id is not null) then
    raise exception 'branch_of_branch_not_allowed' using errcode = 'P0001';
  end if;
  if tg_op = 'UPDATE' and not private.is_service() then
    -- structural / consent / template fields are changed only through RPCs
    if new.parent_id is distinct from old.parent_id
       or new.template_version_id is distinct from old.template_version_id
       or new.platform_access_authorized_at is distinct from old.platform_access_authorized_at
       or new.platform_access_authorized_by is distinct from old.platform_access_authorized_by
       or new.deleted_at is distinct from old.deleted_at
       or new.created_by is distinct from old.created_by then
      raise exception 'protected_field' using errcode = 'P0001';
    end if;
  end if;
  return new;
end $$;
create trigger organizations_guard before insert or update on public.organizations
  for each row execute function private.guard_org_hierarchy();

-- Users may edit their own profile but not their role/status/email.
create or replace function private.guard_profile()
returns trigger language plpgsql set search_path = '' as $$
begin
  if not private.is_service() and not exists (
       select 1 from public.profiles p
        where p.id = auth.uid() and p.platform_role = 'superadmin' and p.status = 'active') then
    if new.platform_role is distinct from old.platform_role
       or new.status is distinct from old.status
       or new.email is distinct from old.email
       or new.id <> old.id then
      raise exception 'protected_field' using errcode = 'P0001';
    end if;
  end if;
  return new;
end $$;
create trigger profiles_guard before update on public.profiles
  for each row execute function private.guard_profile();

-- Every organization keeps at least one admin.
create or replace function private.guard_last_admin()
returns trigger language plpgsql set search_path = '' as $$
begin
  if (tg_op = 'DELETE' and old.role = 'admin')
     or (tg_op = 'UPDATE' and old.role = 'admin' and new.role <> 'admin') then
    if not exists (select 1 from public.memberships
                    where org_id = old.org_id and role = 'admin' and user_id <> old.user_id)
       and exists (select 1 from public.organizations where id = old.org_id and parent_id is null) then
      raise exception 'last_admin' using errcode = 'P0001';
    end if;
  end if;
  return coalesce(new, old);
end $$;
create trigger memberships_last_admin before update or delete on public.memberships
  for each row execute function private.guard_last_admin();
