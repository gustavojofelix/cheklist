-- =====================================================================
-- 0020 · Legislation library and document pairing ("acasalamento")
-- A legal act (e.g. Decreto n.º 38.088 — Código das Execuções Fiscais) keeps
-- its original publication, the diplomas that amend it (in date order) and
-- the revised / consolidated text that results from them.
-- The library is maintained by platform staff and read by every signed-in user.
-- =====================================================================

create type public.legal_act_kind as enum ('lei', 'decreto_lei', 'decreto', 'diploma_ministerial', 'resolucao', 'regulamento', 'codigo', 'outro');
create type public.legal_doc_role as enum ('original', 'alteracao', 'revisto');

create table public.legal_acts (
  id          uuid primary key default gen_random_uuid(),
  reference   text unique check (reference is null or length(trim(reference)) > 0),   -- internal code, e.g. LACI047
  title       text not null check (length(trim(title)) > 0),                          -- Código das Execuções Fiscais
  kind        public.legal_act_kind not null default 'decreto',
  number      text,                                                                   -- 38.088
  act_date    date,
  area        text,                                                                   -- Fiscal, Laboral, Comercial…
  summary     text,
  created_by  uuid references public.profiles default auth.uid(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table public.legal_act_documents (
  id            uuid primary key default gen_random_uuid(),
  act_id        uuid not null references public.legal_acts on delete cascade,
  role          public.legal_doc_role not null,
  diploma       text not null check (length(trim(diploma)) > 0),   -- Decreto-Lei n.º 1/2013, de 4 de Julho
  publication   text,                                              -- Boletim da República, I Série, n.º 53
  published_on  date,
  effect        text,                                              -- Revoga os artigos 147.º e 148.º
  storage_path  text not null unique check (storage_path like act_id::text || '/%'),
  original_name text not null,
  mime_type     text not null check (mime_type in ('application/pdf', 'image/png', 'image/jpeg',
                  'application/vnd.openxmlformats-officedocument.wordprocessingml.document')),
  size_bytes    bigint not null check (size_bytes > 0),
  created_by    uuid references public.profiles default auth.uid(),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index on public.legal_act_documents (act_id, role, published_on);
-- one original and one revised text per act; any number of alterations
create unique index legal_act_one_original on public.legal_act_documents (act_id) where role = 'original';
create unique index legal_act_one_revised  on public.legal_act_documents (act_id) where role = 'revisto';

-- An alteration cannot be published before the original it amends.
create or replace function private.guard_legal_document()
returns trigger language plpgsql set search_path = '' as $$
declare v_original date;
begin
  if new.role = 'alteracao' and new.published_on is not null then
    select published_on into v_original from public.legal_act_documents
     where act_id = new.act_id and role = 'original' and id <> new.id;
    if v_original is not null and new.published_on < v_original then
      raise exception 'alteration_before_original' using errcode = 'P0001';
    end if;
  end if;
  if new.role = 'original' and new.published_on is not null and exists (
       select 1 from public.legal_act_documents
        where act_id = new.act_id and role = 'alteracao' and published_on < new.published_on and id <> new.id) then
    raise exception 'alteration_before_original' using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger legal_act_documents_guard before insert or update on public.legal_act_documents
  for each row execute function private.guard_legal_document();

create trigger set_updated_at before update on public.legal_acts          for each row execute function private.set_updated_at();
create trigger set_updated_at before update on public.legal_act_documents for each row execute function private.set_updated_at();
create trigger audit_capture after insert or update or delete on public.legal_acts          for each row execute function audit.capture();
create trigger audit_capture after insert or update or delete on public.legal_act_documents for each row execute function audit.capture();

-- ------------------------------------------------------------- RLS
alter table public.legal_acts enable row level security;
alter table public.legal_act_documents enable row level security;

create policy la_read   on public.legal_acts for select to authenticated using (true);
create policy la_insert on public.legal_acts for insert to authenticated with check ((select private.is_platform()));
create policy la_update on public.legal_acts for update to authenticated using ((select private.is_platform())) with check ((select private.is_platform()));
create policy la_delete on public.legal_acts for delete to authenticated using ((select private.is_platform('superadmin')));

create policy lad_read   on public.legal_act_documents for select to authenticated using (true);
create policy lad_insert on public.legal_act_documents for insert to authenticated with check ((select private.is_platform()));
create policy lad_update on public.legal_act_documents for update to authenticated using ((select private.is_platform())) with check ((select private.is_platform()));
create policy lad_delete on public.legal_act_documents for delete to authenticated using ((select private.is_platform()));

grant select, insert, update, delete on public.legal_acts, public.legal_act_documents to authenticated;

-- ------------------------------------------------------------- storage
-- Path: {act_id}/{uuid}/{file name}. Published legislation: every signed-in user may read it.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('legislation', 'legislation', false, 52428800,
     array['application/pdf','image/png','image/jpeg',
           'application/vnd.openxmlformats-officedocument.wordprocessingml.document'])
on conflict (id) do nothing;

create policy legislation_read on storage.objects for select to authenticated
  using (bucket_id = 'legislation');
create policy legislation_write on storage.objects for insert to authenticated
  with check (bucket_id = 'legislation' and (select private.is_platform()));
create policy legislation_delete on storage.objects for delete to authenticated
  using (bucket_id = 'legislation' and (select private.is_platform()));
