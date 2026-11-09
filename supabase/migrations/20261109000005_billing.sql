-- =====================================================================
-- 0005 · Subscriptions, payments, invoices, vouchers, webhooks, Officegest
-- =====================================================================

create table public.subscriptions (
  id                      uuid primary key default gen_random_uuid(),
  organization_id         uuid not null unique references public.organizations on delete cascade,  -- parent entity only
  plan_id                 uuid not null references public.plans,
  plan_price_id           uuid references public.plan_prices,
  status                  public.sub_status not null,
  trial_ends_at           timestamptz,
  current_period_start    timestamptz not null default now(),
  current_period_end      timestamptz not null,
  grace_until             timestamptz,
  cancel_at_period_end    boolean not null default false,
  canceled_at             timestamptz,
  extra_users             int not null default 0 check (extra_users >= 0),
  extra_branches          int not null default 0 check (extra_branches >= 0),
  extra_storage_bytes     bigint not null default 0 check (extra_storage_bytes >= 0),
  max_users_override      int check (max_users_override >= 0),
  gateway                 public.gateway not null default 'manual',
  gateway_customer_id     text,
  gateway_subscription_id text,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  constraint period_order check (current_period_end > current_period_start),
  constraint trial_has_end check (status <> 'trial' or trial_ends_at is not null)
);

create table public.subscription_events (
  id              bigint generated always as identity primary key,
  subscription_id uuid not null references public.subscriptions on delete cascade,
  from_status     public.sub_status,
  to_status       public.sub_status not null,
  reason          text,
  actor_id        uuid,
  created_at      timestamptz not null default now()
);

create table public.vouchers (
  id             uuid primary key default gen_random_uuid(),
  code           extensions.citext not null unique,
  name           text not null,
  description    text,
  discount_type  public.discount_type not null,
  discount_value numeric(12,2) not null check (discount_value > 0),
  plan_id        uuid references public.plans,
  max_uses       int check (max_uses > 0),
  uses_count     int not null default 0 check (uses_count >= 0),
  valid_from     timestamptz,
  valid_until    timestamptz,
  is_active      boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint pct_le_100 check (discount_type <> 'percentage' or discount_value <= 100),
  constraint uses_le_max check (max_uses is null or uses_count <= max_uses),
  constraint valid_window check (valid_until is null or valid_from is null or valid_until > valid_from)
);

create table public.payments (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references public.organizations on delete restrict,
  subscription_id   uuid references public.subscriptions on delete set null,
  plan_price_id     uuid references public.plan_prices,
  gateway           public.gateway not null,
  amount            numeric(12,2) not null check (amount >= 0),
  amount_discounted numeric(12,2) not null default 0 check (amount_discounted >= 0),
  currency          char(3) not null default 'MZN',
  status            public.payment_status not null default 'pending',
  description       text,
  voucher_id        uuid references public.vouchers,
  gateway_ref       text,
  sislog_entity     text,
  sislog_reference  text,
  phone_msisdn      text,
  paid_at           timestamptz,
  created_by        uuid references public.profiles,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (gateway, gateway_ref)
);
create index on public.payments (organization_id, created_at desc);

create table public.invoices (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations on delete restrict,
  subscription_id uuid references public.subscriptions on delete set null,
  payment_id      uuid references public.payments on delete set null,
  number          text unique,
  status          public.invoice_status not null default 'pending',
  amount          numeric(12,2) not null check (amount >= 0),
  currency        char(3) not null default 'MZN',
  due_date        date,
  pdf_path        text,
  bank_details    text,
  generated_by    uuid references public.profiles,
  confirmed_by    uuid references public.profiles,
  paid_at         timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index on public.invoices (organization_id);

create table public.voucher_redemptions (
  id                uuid primary key default gen_random_uuid(),
  voucher_id        uuid not null references public.vouchers,
  user_id           uuid references public.profiles,
  organization_id   uuid not null references public.organizations on delete cascade,
  payment_id        uuid references public.payments,
  amount_discounted numeric(12,2) not null,
  redeemed_at       timestamptz not null default now()
);

create table public.webhook_events (
  id              uuid primary key default gen_random_uuid(),
  provider        text not null check (provider in ('stripe','sislog')),
  event_id        text not null,
  event_type      text,
  signature_valid boolean not null,
  payload         jsonb not null,
  handled         boolean not null default false,
  error           text,
  ip              inet,
  received_at     timestamptz not null default now(),
  unique (provider, event_id)
);

create table public.officegest_sync (
  payment_id        uuid primary key references public.payments on delete cascade,
  status            text not null default 'pending' check (status in ('pending','synced','failed')),
  attempts          int not null default 0,
  external_id       text,
  last_error        text,
  last_attempted_at timestamptz,
  synced_at         timestamptz
);

create trigger set_updated_at before update on public.subscriptions for each row execute function private.set_updated_at();
create trigger set_updated_at before update on public.payments      for each row execute function private.set_updated_at();
create trigger set_updated_at before update on public.invoices      for each row execute function private.set_updated_at();
create trigger set_updated_at before update on public.vouchers      for each row execute function private.set_updated_at();

-- Subscriptions belong to the parent entity, never to a branch.
create or replace function private.guard_subscription()
returns trigger language plpgsql set search_path = '' as $$
declare allowed boolean;
begin
  if exists (select 1 from public.organizations where id = new.organization_id and parent_id is not null) then
    raise exception 'subscription_on_branch' using errcode = 'P0001';
  end if;
  if tg_op = 'UPDATE' and new.status <> old.status then
    allowed := (old.status, new.status) in (
      ('trial','active'), ('trial','expired'), ('trial','canceled'),
      ('active','past_due'), ('active','canceled'), ('active','expired'),
      ('past_due','active'), ('past_due','expired'), ('past_due','canceled'),
      ('canceled','active'), ('canceled','expired'),
      ('expired','active'));
    if not allowed then
      raise exception 'invalid_subscription_transition % -> %', old.status, new.status using errcode = 'P0001';
    end if;
  end if;
  return new;
end $$;
create trigger subscriptions_guard before insert or update on public.subscriptions
  for each row execute function private.guard_subscription();

create or replace function private.log_subscription_event()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' or new.status <> old.status then
    insert into public.subscription_events (subscription_id, from_status, to_status, actor_id)
    values (new.id, case when tg_op = 'UPDATE' then old.status end, new.status, auth.uid());
  end if;
  return new;
end $$;
create trigger subscriptions_history after insert or update on public.subscriptions
  for each row execute function private.log_subscription_event();
