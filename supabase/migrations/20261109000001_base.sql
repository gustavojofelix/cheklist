-- =====================================================================
-- 0001 · Extensions, schemas, enums, shared helpers
-- =====================================================================
create extension if not exists citext   with schema extensions;
create extension if not exists pgcrypto with schema extensions;

create schema if not exists private;
create schema if not exists audit;

revoke all on schema private from public;
revoke all on schema audit   from public;
-- RLS policies call private.* helpers as the querying role, so those roles need USAGE.
grant usage on schema private to anon, authenticated, service_role;

-- Enum order matters: org_role is compared with >= (user < manager < admin).
create type public.org_role         as enum ('user','manager','admin');
create type public.platform_role    as enum ('operator','superadmin');
create type public.user_status      as enum ('active','suspended');
create type public.sub_status       as enum ('trial','active','past_due','canceled','expired');
create type public.billing_period   as enum ('monthly','quarterly','semestral','annual');
create type public.gateway          as enum ('stripe','sislog','manual');
create type public.payment_status   as enum ('pending','paid','failed','refunded');
create type public.invoice_status   as enum ('draft','pending','paid','overdue','void');
create type public.template_status  as enum ('draft','published','archived');
create type public.item_scope       as enum ('headquarters','branch');
create type public.applicability    as enum ('yes','depends','no');
create type public.answer_kind      as enum ('text','date','number','shareholders','social_object','sector');
create type public.compliance_state as enum ('regular','atencao','critico');
create type public.ocr_status       as enum ('none','queued','processing','ready','failed');
create type public.proposal_status  as enum ('pending','accepted','rejected');
create type public.discount_type    as enum ('percentage','fixed');

-- updated_at maintenance
create or replace function private.set_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- "Today" in the business timezone (Mozambique), used for compliance maths.
create or replace function private.today()
returns date language sql stable set search_path = '' as $$
  select (now() at time zone 'Africa/Maputo')::date
$$;

-- True when the current request runs with elevated rights (service role / migrations / cron).
create or replace function private.is_service()
returns boolean language sql stable set search_path = '' as $$
  select coalesce(auth.role(), '') = 'service_role'
      or current_user in ('postgres', 'supabase_admin')
$$;

grant execute on all functions in schema private to anon, authenticated, service_role;
