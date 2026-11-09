-- =====================================================================
-- 0017 · Document reading (OCR) and AI assistant
--   - availability + quota check (global switch, organization switch, plan limit per period)
--   - OCR proposals are accepted or rejected only by a user (final validation cannot be disabled)
--   - AI-proposed actions are executed only after explicit user confirmation
--   - both run with the caller's rights (RLS), so permissions are the same as editing by hand
-- =====================================================================

update public.platform_settings set value = '"claude-opus-5-5"' where key = 'claude_model';
insert into public.platform_settings (key, value) values ('claude_model', '"claude-opus-5-5"') on conflict (key) do nothing;

-- 'ok' | 'disabled' | 'quota' — never raises, so Edge Functions can report the reason.
create or replace function public.ai_check(org uuid, p_metric text)
returns text language plpgsql stable security definer set search_path = '' as $$
declare v_root uuid := private.root_org(org); l record; v_used int; v_start timestamptz; v_max int;
begin
  if not private.can_read_org(org) then return 'forbidden'; end if;
  if p_metric not in ('ocr', 'ia') then return 'forbidden'; end if;
  if p_metric = 'ia' and not coalesce((private.setting('ai_enabled_global'))::boolean, true) then return 'disabled'; end if;
  if p_metric = 'ia' and not (select ai_enabled from public.organizations where id = v_root) then return 'disabled'; end if;
  if private.access_mode(org) <> 'full' then return 'read_only'; end if;
  select * into l from private.effective_limits(org);
  v_max := case p_metric when 'ocr' then l.max_ocr else l.max_ia end;
  if v_max is null then return 'ok'; end if;                 -- unlimited
  select current_period_start into v_start from public.subscriptions where organization_id = v_root;
  select coalesce(sum(qty), 0) into v_used from public.usage_events
   where organization_id = v_root and metric = p_metric and created_at >= v_start;
  return case when v_used < v_max then 'ok' else 'quota' end;
end $$;

-- Usage is recorded by the Edge Functions (service role) after a successful call.
create or replace function public.ai_record_usage(org uuid, p_metric text)
returns void language sql security definer set search_path = '' as $$
  insert into public.usage_events (organization_id, metric) values (private.root_org(org), p_metric);
$$;

-- ------------------------------------------------------- OCR proposals
-- Runs as the caller: RLS on checklist_items decides whether they may apply it.
create or replace function public.accept_proposal(p_id uuid, p_value text default null)
returns void language plpgsql security invoker set search_path = '' as $$
declare p record; v text;
begin
  select * into p from public.item_proposals where id = p_id and status = 'pending';
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  v := coalesce(nullif(trim(p_value), ''), p.proposed_value);
  if p.field = 'due_date' then
    update public.checklist_items set has_validity = true, due_date = v::date where id = p.checklist_item_id;
  else
    update public.checklist_items set answer = v where id = p.checklist_item_id;
  end if;
  if not found then raise exception 'forbidden' using errcode = '42501'; end if;
  update public.item_proposals set status = 'accepted', decided_by = auth.uid(), decided_at = now(),
         proposed_value = v where id = p_id;
end $$;

create or replace function public.reject_proposal(p_id uuid)
returns void language plpgsql security invoker set search_path = '' as $$
begin
  update public.item_proposals set status = 'rejected', decided_by = auth.uid(), decided_at = now()
   where id = p_id and status = 'pending';
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
end $$;

-- ------------------------------------------------ AI-proposed actions
create policy aia_update on public.ai_proposed_actions for update to authenticated
  using (private.can_write_org(organization_id, 'user')) with check (private.can_write_org(organization_id, 'user'));

create or replace function public.ai_action_decide(p_action uuid, p_accept boolean)
returns void language plpgsql security invoker set search_path = '' as $$
declare a record;
begin
  select * into a from public.ai_proposed_actions where id = p_action and status = 'pending';
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if p_accept then
    if a.action->>'field' = 'due_date' then
      update public.checklist_items set has_validity = true, due_date = (a.action->>'value')::date where id = a.checklist_item_id;
    elsif a.action->>'field' = 'answer' then
      update public.checklist_items set answer = a.action->>'value' where id = a.checklist_item_id;
    else
      raise exception 'invalid_action' using errcode = 'P0001';
    end if;
    if not found then raise exception 'forbidden' using errcode = '42501'; end if;
  end if;
  update public.ai_proposed_actions set status = case when p_accept then 'accepted' else 'rejected' end::public.proposal_status,
         decided_by = auth.uid(), decided_at = now() where id = p_action;
end $$;

-- ---------------------------------------------------------------- grants
revoke execute on function public.ai_record_usage(uuid, text) from public, anon, authenticated;
grant execute on function public.ai_record_usage(uuid, text) to service_role;
revoke execute on function public.ai_check(uuid, text), public.accept_proposal(uuid, text), public.reject_proposal(uuid),
  public.ai_action_decide(uuid, boolean) from public, anon;
grant execute on function public.ai_check(uuid, text), public.accept_proposal(uuid, text), public.reject_proposal(uuid),
  public.ai_action_decide(uuid, boolean) to authenticated, service_role;
