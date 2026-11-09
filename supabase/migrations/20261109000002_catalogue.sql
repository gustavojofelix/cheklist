-- =====================================================================
-- 0002 · Platform catalogue: reference lists, settings, plans, templates
-- =====================================================================

create table public.reference_lists (
  list_key     text not null,                 -- entity_type | entity_subtype | company_size | province | sector | notification_day
  value        text not null,
  label        jsonb not null,                -- {"pt": "...", "en": "..."}
  parent_value text,                          -- entity_subtype → entity_type
  extra        jsonb not null default '{}',   -- e.g. company_size definition
  sort_order   int  not null default 0,
  is_active    boolean not null default true,
  primary key (list_key, value)
);

create table public.platform_settings (
  key        text primary key,
  value      jsonb not null,
  updated_by uuid,
  updated_at timestamptz not null default now()
);

create table public.email_templates (
  key        text not null,
  locale     text not null check (locale in ('pt','en')),
  subject    text not null,
  body_md    text not null,
  updated_at timestamptz not null default now(),
  primary key (key, locale)
);

-- ---------------------------------------------------------------- plans
create table public.plans (
  id                  uuid primary key default gen_random_uuid(),
  slug                text not null unique check (slug ~ '^[a-z0-9-]+$'),
  name                text not null,
  description         text,
  translations        jsonb not null default '{}',
  is_active           boolean not null default true,
  sort_order          int not null default 0,
  -- NULL limit = unlimited
  max_users           int    check (max_users >= 0),
  max_branches        int    check (max_branches >= 0),
  max_documents       int    check (max_documents >= 0),
  max_storage_bytes   bigint check (max_storage_bytes >= 0),
  max_ocr             int    check (max_ocr >= 0),
  max_ia              int    check (max_ia >= 0),
  max_file_size_bytes bigint not null default 20971520 check (max_file_size_bytes > 0),
  trial_days          int    check (trial_days > 0),
  allows_assisted_ia  boolean not null default false,
  extra_user_price    numeric(12,2) check (extra_user_price >= 0),
  extra_branch_price  numeric(12,2) check (extra_branch_price >= 0),
  stripe_product_id   text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create table public.plan_prices (
  id              uuid primary key default gen_random_uuid(),
  plan_id         uuid not null references public.plans on delete cascade,
  period          public.billing_period not null,
  amount          numeric(12,2) not null check (amount >= 0),
  currency        char(3) not null default 'MZN',
  stripe_price_id text,
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (plan_id, period, currency)
);
create index on public.plan_prices (plan_id);

create table public.addons (
  code       text primary key check (code in ('storage_5gb','extra_user','extra_branch')),
  amount     numeric(12,2) not null check (amount >= 0),
  currency   char(3) not null default 'MZN',
  is_active  boolean not null default true,
  updated_at timestamptz not null default now()
);

-- ------------------------------------------------------------ templates
create table public.checklist_templates (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  description     text,
  sector          text,                -- NULL = default template for any sector
  organization_id uuid,                -- non-null = entity-specific copy (FK added after organizations exists)
  status          public.template_status not null default 'draft',
  created_by      uuid,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
-- one published template per sector (and one default)
create unique index checklist_templates_one_published_per_sector
  on public.checklist_templates (coalesce(sector, '*'))
  where status = 'published' and organization_id is null;

create table public.template_versions (
  id             uuid primary key default gen_random_uuid(),
  template_id    uuid not null references public.checklist_templates on delete cascade,
  version_number int  not null check (version_number > 0),
  is_published   boolean not null default false,
  published_at   timestamptz,
  published_by   uuid,
  created_at     timestamptz not null default now(),
  unique (template_id, version_number)
);

create table public.template_items (
  id                  uuid primary key default gen_random_uuid(),
  version_id          uuid not null references public.template_versions on delete cascade,
  parent_id           uuid references public.template_items on delete cascade,
  scope               public.item_scope not null default 'headquarters',
  is_category         boolean not null default false,
  catalog_code        text,
  catalog_group       text,
  title               text not null,
  description         text,
  translations        jsonb not null default '{}',     -- {"en": {"title": "...", "description": "..."}}
  has_validity        boolean not null default false,
  requires_attachment boolean not null default false,
  applicability       public.applicability not null default 'yes',
  applicability_rule  jsonb,
  answer_kind         public.answer_kind not null default 'text',
  bound_field         text check (bound_field in ('sector','shareholders','social_object')),
  sort_order          int not null default 0,
  unique (version_id, scope, catalog_code)
);
create index on public.template_items (version_id, scope);
create index on public.template_items (parent_id);

-- Published versions (and their items) are immutable.
create or replace function private.guard_published_version()
returns trigger language plpgsql set search_path = '' as $$
declare v_published boolean;
begin
  if tg_table_name = 'template_versions' then
    if old.is_published and (new.version_number <> old.version_number or new.template_id <> old.template_id
                              or not new.is_published) then
      raise exception 'published_version_immutable' using errcode = 'P0001';
    end if;
    return new;
  end if;
  select is_published into v_published from public.template_versions
   where id = coalesce(new.version_id, old.version_id);
  if v_published then
    raise exception 'published_version_immutable' using errcode = 'P0001';
  end if;
  return coalesce(new, old);
end $$;

create trigger template_versions_guard before update on public.template_versions
  for each row execute function private.guard_published_version();
create trigger template_items_guard before insert or update or delete on public.template_items
  for each row execute function private.guard_published_version();

create trigger set_updated_at before update on public.plans               for each row execute function private.set_updated_at();
create trigger set_updated_at before update on public.plan_prices         for each row execute function private.set_updated_at();
create trigger set_updated_at before update on public.checklist_templates for each row execute function private.set_updated_at();
create trigger set_updated_at before update on public.platform_settings   for each row execute function private.set_updated_at();
