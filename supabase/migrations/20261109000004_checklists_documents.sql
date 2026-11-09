-- =====================================================================
-- 0004 · Checklists, items, documents, OCR proposals, reports, AI
-- =====================================================================

create table public.checklists (
  id                  uuid primary key default gen_random_uuid(),
  organization_id     uuid not null unique references public.organizations on delete cascade,  -- one per entity
  template_version_id uuid references public.template_versions,
  title               text not null,
  description         text,
  status              text not null default 'active' check (status in ('active','archived')),
  created_by          uuid references public.profiles,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create table public.checklist_items (
  id                  uuid primary key default gen_random_uuid(),
  checklist_id        uuid not null references public.checklists on delete cascade,
  organization_id     uuid not null references public.organizations on delete cascade,
  parent_id           uuid references public.checklist_items on delete cascade,
  template_item_id    uuid references public.template_items on delete set null,  -- NULL = customer-added
  is_category         boolean not null default false,
  catalog_code        text,
  catalog_group       text,
  title               text not null check (length(trim(title)) > 0),
  translations        jsonb not null default '{}',
  answer              text,
  answer_kind         public.answer_kind not null default 'text',
  bound_field         text check (bound_field in ('sector','shareholders','social_object')),
  applicability       public.applicability not null default 'yes',
  is_applicable       boolean not null default true,
  has_validity        boolean not null default false,
  due_date            date,
  notify_days         int[],                       -- NULL = organization default
  requires_attachment boolean not null default false,
  assignee_id         uuid references public.profiles on delete set null,
  notes               text,
  is_official_gazette boolean not null default false,
  br_subtype          text check (br_subtype is null or br_subtype in (
                        'constituicao_sa','constituicao_quotas','constituicao_sucursal','constituicao_associacao',
                        'constituicao_consorcio','alteracao_nome','alteracao_pacto','alteracao_orgao',
                        'alteracao_capital','outros')),
  publication_date    date,
  publication_series  text,
  sort_order          int not null default 0,
  row_version         int not null default 1,
  updated_by          uuid references public.profiles,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint due_needs_validity check (due_date is null or has_validity),
  unique (checklist_id, catalog_code)
);
create index on public.checklist_items (organization_id, due_date) where due_date is not null;
create index on public.checklist_items (checklist_id, parent_id, sort_order);
create index on public.checklist_items (assignee_id);

create table public.documents (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations on delete cascade,
  storage_path    text not null unique,
  original_name   text not null,
  mime_type       text not null check (mime_type in (
                    'application/pdf','image/png','image/jpeg',
                    'application/vnd.openxmlformats-officedocument.wordprocessingml.document')),
  size_bytes      bigint not null check (size_bytes > 0),
  sha256          text,
  uploaded_by     uuid references public.profiles,
  ocr_status      public.ocr_status not null default 'none',
  ocr_result      jsonb,
  deleted_at      timestamptz,
  deleted_by      uuid references public.profiles,
  purge_after     timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint storage_path_in_org check (storage_path like organization_id::text || '/%')
);
create index documents_live_by_org on public.documents (organization_id) where deleted_at is null;
create index documents_purge on public.documents (purge_after) where deleted_at is not null;

create table public.document_items (
  document_id       uuid not null references public.documents on delete cascade,
  checklist_item_id uuid not null references public.checklist_items on delete cascade,
  created_at        timestamptz not null default now(),
  primary key (document_id, checklist_item_id)
);
create index on public.document_items (checklist_item_id);

create table public.item_proposals (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references public.organizations on delete cascade,
  document_id       uuid not null references public.documents on delete cascade,
  checklist_item_id uuid not null references public.checklist_items on delete cascade,
  field             text not null check (field in ('answer','due_date')),
  proposed_value    text,
  source_quote      text,
  page              int,
  bbox              jsonb,
  status            public.proposal_status not null default 'pending',
  decided_by        uuid references public.profiles,
  decided_at        timestamptz,
  created_at        timestamptz not null default now()
);
create index on public.item_proposals (organization_id, status);

create table public.document_shares (
  id          uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents on delete cascade,
  organization_id uuid not null references public.organizations on delete cascade,
  recipients  extensions.citext[] not null check (cardinality(recipients) between 1 and 20),
  message     text,
  shared_by   uuid references public.profiles,
  sent_at     timestamptz not null default now()
);

create table public.reports (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations on delete cascade,
  checklist_id    uuid not null references public.checklists on delete cascade,
  item_ids        uuid[] not null,
  pdf_path        text,
  docx_path       text,
  created_by      uuid references public.profiles,
  created_at      timestamptz not null default now()
);

-- ------------------------------------------------------------------ AI
create table public.ai_conversations (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations on delete cascade,
  user_id         uuid not null references public.profiles on delete cascade,
  title           text,
  last_message_at timestamptz,
  created_at      timestamptz not null default now()
);
create index on public.ai_conversations (organization_id, user_id, last_message_at desc);

create table public.ai_messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.ai_conversations on delete cascade,
  role            text not null check (role in ('user','assistant')),
  content         text not null,
  sources         jsonb not null default '[]',
  input_tokens    int,
  output_tokens   int,
  created_at      timestamptz not null default now()
);
create index on public.ai_messages (conversation_id, created_at);

create table public.ai_proposed_actions (
  id                uuid primary key default gen_random_uuid(),
  message_id        uuid not null references public.ai_messages on delete cascade,
  organization_id   uuid not null references public.organizations on delete cascade,
  checklist_item_id uuid references public.checklist_items on delete cascade,
  action            jsonb not null,
  status            public.proposal_status not null default 'pending',
  decided_by        uuid references public.profiles,
  decided_at        timestamptz,
  created_at        timestamptz not null default now()
);

create table public.usage_events (
  id              bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations on delete cascade,
  metric          text not null check (metric in ('ocr','ia')),
  qty             int not null default 1 check (qty > 0),
  created_at      timestamptz not null default now()
);
create index on public.usage_events (organization_id, metric, created_at);

create trigger set_updated_at before update on public.checklists      for each row execute function private.set_updated_at();
create trigger set_updated_at before update on public.checklist_items for each row execute function private.set_updated_at();
create trigger set_updated_at before update on public.documents       for each row execute function private.set_updated_at();

-- ------------------------------------------------------- item guards
create or replace function private.guard_checklist_item()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    -- organization_id must match the checklist's organization
    select c.organization_id into new.organization_id from public.checklists c where c.id = new.checklist_id;
    if new.parent_id is not null and not exists (
         select 1 from public.checklist_items p where p.id = new.parent_id and p.checklist_id = new.checklist_id) then
      raise exception 'parent_in_other_checklist' using errcode = 'P0001';
    end if;
    -- Boletim da República publications are numbered SOC-16.nn automatically
    if new.is_official_gazette and new.parent_id is not null and new.catalog_code is null then
      select p.catalog_code || '.' || lpad((count(c.id) + 1)::text, 2, '0')
        into new.catalog_code
        from public.checklist_items p
        left join public.checklist_items c on c.parent_id = p.id and c.is_official_gazette
       where p.id = new.parent_id
       group by p.catalog_code;
    end if;
    new.updated_by := coalesce(auth.uid(), new.updated_by);
    return new;
  end if;

  -- UPDATE
  if new.checklist_id <> old.checklist_id or new.organization_id <> old.organization_id
     or new.template_item_id is distinct from old.template_item_id then
    raise exception 'protected_field' using errcode = 'P0001';
  end if;
  if old.template_item_id is not null and not private.is_service()
     and (new.title <> old.title or new.catalog_code is distinct from old.catalog_code) then
    raise exception 'catalogue_item_not_renamable' using errcode = 'P0001';
  end if;
  -- optimistic locking: client must send the row_version it read (or leave it untouched)
  if new.row_version <> old.row_version then
    raise exception 'stale_row' using errcode = 'P0001', detail = 'item changed by someone else';
  end if;
  new.row_version := old.row_version + 1;
  new.updated_by  := coalesce(auth.uid(), new.updated_by);
  return new;
end $$;
create trigger checklist_items_guard before insert or update on public.checklist_items
  for each row execute function private.guard_checklist_item();

-- A document and the items it is linked to must belong to the same organization.
create or replace function private.guard_document_item()
returns trigger language plpgsql set search_path = '' as $$
begin
  if not exists (select 1 from public.documents d join public.checklist_items i on i.organization_id = d.organization_id
                  where d.id = new.document_id and i.id = new.checklist_item_id) then
    raise exception 'cross_org_link' using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger document_items_guard before insert on public.document_items
  for each row execute function private.guard_document_item();

-- Live compliance state (never stale; thresholds per organization).
create view public.checklist_items_state with (security_invoker = true) as
select i.*,
       case
         when i.is_category or not i.is_applicable or not i.has_validity or i.due_date is null then 'regular'
         when i.due_date - private.today() <= o.critical_days  then 'critico'
         when i.due_date - private.today() <= o.attention_days then 'atencao'
         else 'regular'
       end::public.compliance_state                                   as compliance_state,
       (i.due_date is not null and i.due_date < private.today())    as is_overdue,
       (select count(*) from public.document_items di
          join public.documents d on d.id = di.document_id and d.deleted_at is null
         where di.checklist_item_id = i.id)::int                     as document_count
  from public.checklist_items i
  join public.organizations o on o.id = i.organization_id;
