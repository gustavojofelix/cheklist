-- =====================================================================
-- 0013 · Item guard: structural fields may change only inside trusted
--        server functions (e.g. apply_template_version), never from clients.
-- =====================================================================
create or replace function private.guard_checklist_item()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    select c.organization_id into new.organization_id from public.checklists c where c.id = new.checklist_id;
    if new.parent_id is not null and not exists (
         select 1 from public.checklist_items p where p.id = new.parent_id and p.checklist_id = new.checklist_id) then
      raise exception 'parent_in_other_checklist' using errcode = 'P0001';
    end if;
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
  if new.checklist_id <> old.checklist_id or new.organization_id <> old.organization_id then
    raise exception 'protected_field' using errcode = 'P0001';
  end if;
  if not private.is_service() then
    if new.template_item_id is distinct from old.template_item_id then
      raise exception 'protected_field' using errcode = 'P0001';
    end if;
    if old.template_item_id is not null
       and (new.title <> old.title or new.catalog_code is distinct from old.catalog_code) then
      raise exception 'catalogue_item_not_renamable' using errcode = 'P0001';
    end if;
  end if;
  if new.row_version <> old.row_version then
    raise exception 'stale_row' using errcode = 'P0001', detail = 'item changed by someone else';
  end if;
  new.row_version := old.row_version + 1;
  new.updated_by  := coalesce(auth.uid(), new.updated_by);
  return new;
end $$;
