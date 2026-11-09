-- =====================================================================
-- 0010 · Realtime: org-scoped live sync (RLS applies to change events)
-- =====================================================================
alter publication supabase_realtime add table
  public.checklist_items, public.documents, public.document_items, public.item_proposals,
  public.subscriptions, public.memberships;
