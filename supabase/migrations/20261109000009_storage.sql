-- =====================================================================
-- 0009 · Storage buckets and object policies
-- Path convention: {organization_id}/{document_id}/{file name}
-- =====================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('documents', 'documents', false, 52428800,
     array['application/pdf','image/png','image/jpeg',
           'application/vnd.openxmlformats-officedocument.wordprocessingml.document']),
  ('reports',   'reports',   false, 52428800, array['application/pdf',
           'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
           'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']),
  ('invoices',  'invoices',  false, 10485760, array['application/pdf']),
  ('logos',     'logos',     true,  2097152,  array['image/png','image/jpeg','image/svg+xml'])
on conflict (id) do nothing;

create or replace function private.path_org(p_name text)
returns uuid language plpgsql immutable set search_path = '' as $$
begin
  return (storage.foldername(p_name))[1]::uuid;
exception when others then
  return null;
end $$;
grant execute on function private.path_org(text) to anon, authenticated, service_role;

-- documents: upload allowed for writers of the org in the path.
-- NO select/update/delete policies: downloads go through the document-download
-- Edge Function (access + OTP check, audit, 60-second signed URL); purges are server-side.
create policy documents_upload on storage.objects for insert to authenticated
  with check (bucket_id = 'documents' and private.can_write_org(private.path_org(name), 'user'));

-- logos: public read, admins upload/replace their own org's logo
create policy logos_read on storage.objects for select to anon, authenticated
  using (bucket_id = 'logos');
create policy logos_write on storage.objects for insert to authenticated
  with check (bucket_id = 'logos' and private.can_write_org(private.path_org(name), 'admin'));
create policy logos_update on storage.objects for update to authenticated
  using (bucket_id = 'logos' and private.can_write_org(private.path_org(name), 'admin'));

-- reports / invoices: written and served only by Edge Functions (service role).
