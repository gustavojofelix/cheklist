# Phase 2: Architecture Plan for the Checklist Legal rebuild

**Inputs:** [Phase 1 spec](../phase1/PHASE1-SPEC.md) and your decisions from 2026-11-09:
- Payments: **Stripe + SISLOG + manual transfer**
- Invoicing: **Officegest sync kept**
- OCR and AI: **Claude for both**

**Toolchain on this machine:** Node 24.22, npm 11.19, Docker 28.2, git 2.49. Latest versions are **Angular 22.2** and **Supabase CLI 3.0**.

---

## 1. System overview

```
                    ┌──────────────────── Cloudflare (DNS, WAF, CDN) ────────────────────┐
 Browser ──HTTPS──► │  www.<domain>  public site (Angular SSG: landing, pricing, terms)   │
                    │  app.<domain>  Angular SPA: front office  /admin back office        │
                    └───────────────┬─────────────────────────────────────────────────────┘
                                    │ supabase-js (JWT)
                    ┌───────────────▼──────────────── Supabase project (prod) ───────────┐
                    │ Auth (email+password, reset, verify)  ── custom access-token hook  │
                    │ PostgREST ─► Postgres 17  (RLS on every table, audit triggers)     │
                    │ Realtime  (org-scoped channels for live sync)                      │
                    │ Storage   (private buckets: documents, reports, invoices, logos)   │
                    │ Edge Functions (Deno): payments, webhooks, OCR, AI, reports,       │
                    │                        emails, OTP, operator access, cron jobs     │
                    │ pg_cron + pg_net ─► scheduled Edge Functions                       │
                    └───────┬───────────────┬───────────────┬───────────────┬────────────┘
                            │               │               │               │
                        Stripe          SISLOG          Officegest      Anthropic (Claude)
                                     (M-Pesa/e-Mola)    (invoicing)     OCR + assistant
                        Resend/SMTP (email)     Backup target (Cloudflare R2 / S3)
```

**Guiding rules**
1. **The database is the security boundary.** Every rule that protects data lives in Postgres: RLS, constraints, triggers and quota checks. The Angular app and Edge Functions are clients of those rules and cannot bypass them. Only the service role bypasses RLS, and it is used only inside Edge Functions that check the caller first.
2. **Secrets never reach the browser.** Gateway keys, the Anthropic key and the Officegest token live in Supabase Vault / Edge Function secrets.
3. **Every change is audited** by triggers. The application never has to remember to write a log entry.
4. **Money moves only on a verified webhook.** No client-side "payment succeeded" path exists.

---

## 2. Environments & hosting (evaluation area 2)

| Concern | Choice | Why |
|---|---|---|
| Database / auth / storage / functions | **Supabase Cloud, Pro plan**: three projects, `dev`, `staging`, `prod` | Managed Postgres with daily backups and PITR, SOC 2, no servers to patch. |
| Region | Closest region with acceptable latency to Mozambique. If there is no African region, use **eu-west/eu-central**. Measure latency from Maputo/Beira before choosing. | The region can't be changed later without a migration. |
| SPA + public site | **Cloudflare Pages**, which the current app already sits behind | Global CDN, preview deploy per branch, free TLS, WAF and rate limiting. |
| Email | **Resend** (or the firm's SMTP) via Supabase Auth SMTP + Edge Functions | Branded auth emails and notifications from one sender domain with SPF/DKIM/DMARC. |
| Local development | Supabase CLI (`supabase start` on Docker) + `ng serve` | The whole stack runs offline, and migrations are tested locally first. |
| CI/CD | GitHub Actions: lint → unit tests → **pgTAP RLS tests** → build → deploy migrations (`supabase db push`) and functions → Cloudflare Pages | Nothing reaches prod without passing the RLS test suite. |
| Domains | `www.` public, `app.` application, `api.` (optional CNAME to the Supabase custom domain) | The custom domain hides the project ref and keeps cookies first-party. |

> **Needed from you before Phase 3 deploys** (I can't create accounts): a Supabase organization, a Cloudflare account/domain, Stripe/SISLOG/Officegest test credentials and an Anthropic API key. Until then I build and test everything **locally**.

---

## 3. Database schema

UUID primary keys (`gen_random_uuid()`), `timestamptz` everywhere, `created_at/updated_at` on every table (maintained by a shared trigger). Money is stored as `numeric(12,2)` + ISO currency. **Soft delete** (`deleted_at`) applies to organizations and documents.

### 3.1 Schemas
- `public`: application tables exposed through PostgREST, with RLS on.
- `private`: helper functions and internal tables, **not exposed** to the API (secrets references, rate-limit counters).
- `audit`: append-only log, not exposed. It is read through a security-definer view/RPC.

### 3.2 Enums
```sql
create type org_role         as enum ('admin','manager','user');
create type platform_role    as enum ('superadmin','operator');
create type user_status      as enum ('active','suspended');
create type sub_status       as enum ('trial','active','past_due','canceled','expired');
create type billing_period   as enum ('monthly','quarterly','semestral','annual');
create type gateway          as enum ('stripe','sislog','manual');
create type payment_status   as enum ('pending','paid','failed','refunded');
create type invoice_status   as enum ('draft','pending','paid','overdue','void');
create type template_status  as enum ('draft','published','archived');
create type item_scope       as enum ('headquarters','branch');
create type applicability    as enum ('yes','depends','no');
create type answer_kind      as enum ('text','date','number','shareholders','social_object','sector');
create type compliance_state as enum ('regular','atencao','critico');
create type ocr_status       as enum ('none','queued','processing','ready','failed');
create type proposal_status  as enum ('pending','accepted','rejected');
create type discount_type    as enum ('percentage','fixed');
```

### 3.3 Identity & tenancy
```sql
profiles (
  id uuid pk references auth.users on delete cascade,
  full_name text not null, phone_country char(2) default 'MZ', phone_number text check (phone_number ~ '^[0-9]{9}$'),
  status user_status not null default 'active',
  platform_role platform_role null,            -- null = customer user
  locale text not null default 'pt' check (locale in ('pt','en')),
  terms_accepted_at timestamptz, privacy_accepted_at timestamptz, last_access_at timestamptz)

organizations (
  id uuid pk, parent_id uuid null references organizations,   -- null = parent entity, else branch
  name text not null, email citext, type text, entity_subtype text, company_size text, sector text,
  tax_id text check (tax_id ~ '^[0-9]{9}$'),      -- NUIT
  nuel text, constitution_date date, share_capital numeric(16,2), shareholders int, social_object text,
  fiscal_activity_start_date date, address text, postal_box text, country char(2), province text, phone text,
  logo_path text, ai_enabled bool not null default true,
  -- notification settings (explicit defaults, not null)
  notification_emails citext[] not null default '{}', notification_days int[] not null default '{90,60,30,15,1}',
  attention_days int not null default 90, critical_days int not null default 15 check (critical_days < attention_days),
  repeat_while_critical bool not null default true, notify_admin bool not null default true,
  monthly_digest bool not null default false,
  document_otp_required bool not null default false,
  platform_access_authorized_at timestamptz, platform_access_authorized_by uuid references profiles,
  template_version_id uuid references template_versions,     -- accepted template version
  deleted_at timestamptz,
  constraint branch_depth check (parent_id is distinct from id))
-- trigger: a branch's parent must itself have parent_id is null (only 1 level)
-- trigger: branch count ≤ plan.max_branches (+ purchased extras)

memberships (org_id uuid references organizations on delete cascade, user_id uuid references profiles,
  role org_role not null, created_by uuid, primary key (org_id, user_id))
-- branches: membership of the PARENT with role admin grants access to all its branches;
-- other users are given access per entity ("Gerir acesso").

invitations (id, org_id, email citext, role org_role, token_hash text unique, invited_by uuid,
  expires_at timestamptz not null default now() + interval '7 days', accepted_at, revoked_at)
-- trigger: active members + open invitations ≤ effective max_users
```

### 3.4 Templates & checklists
```sql
checklist_templates (id, name, description, sector text, organization_id uuid null,  -- non-null = entity-specific copy
  status template_status not null default 'draft', created_by uuid)
template_versions (id, template_id, version_number int, is_published bool, published_at, published_by,
  unique (template_id, version_number))          -- published versions are immutable (trigger)
template_items (id, version_id, parent_id null, scope item_scope, is_category bool,
  catalog_code text, catalog_group text, title text not null, description text, translations jsonb default '{}',
  has_validity bool, requires_attachment bool, applicability applicability default 'yes',
  applicability_rule jsonb null,                 -- e.g. {"entity_subtype":{"in":["sa","lda"]}} (rule for 'depends')
  answer_kind answer_kind default 'text', bound_field text null,   -- e.g. 'sector' → organizations.sector
  sort_order int, unique (version_id, catalog_code))

checklists (id, organization_id uuid unique references organizations,   -- exactly one per entity
  template_version_id uuid, title text, description text, status text check (status in ('active','archived')))

checklist_items (
  id uuid pk, checklist_id uuid references checklists on delete cascade,
  organization_id uuid not null,                 -- denormalised for fast RLS (kept in sync by trigger)
  parent_id uuid null references checklist_items, -- category header → item → sub-item / BR publication
  template_item_id uuid null,                    -- null = added by the customer
  is_category bool not null default false,
  catalog_code text, catalog_group text, title text not null, translations jsonb default '{}',
  answer text, answer_kind answer_kind default 'text',
  applicability applicability default 'yes', is_applicable bool not null default true,
  has_validity bool not null default false, due_date date,
  notify_days int[] null,                        -- null = use organization.notification_days
  requires_attachment bool not null default false,
  assignee_id uuid null references profiles, notes text,
  is_official_gazette bool default false, br_subtype text, publication_date date, publication_series text,
  sort_order int not null default 0, row_version int not null default 1,   -- optimistic locking
  updated_by uuid,
  constraint due_needs_validity check (due_date is null or has_validity),
  unique (checklist_id, catalog_code))
-- trigger: catalogue-code title cannot change (rule 7); auto-number SOC-16.nn for gazette children (rule 12)
-- trigger: bound_field answers mirror organization data (rule 11)

-- compliance state is computed live; nothing goes stale
create view checklist_items_state with (security_invoker = true) as
select i.*, case
  when not i.has_validity or i.due_date is null or not i.is_applicable then 'regular'
  when i.due_date - current_date <= o.critical_days then 'critico'
  when i.due_date - current_date <= o.attention_days then 'atencao'
  else 'regular' end::compliance_state as compliance_state,
  (i.due_date < current_date) as is_overdue
from checklist_items i join organizations o on o.id = i.organization_id;
```

### 3.5 Documents, OCR, reports
```sql
documents (id, organization_id, storage_path text unique, original_name text, mime_type text
  check (mime_type in ('application/pdf','image/png','image/jpeg',
         'application/vnd.openxmlformats-officedocument.wordprocessingml.document')),
  size_bytes bigint check (size_bytes > 0), sha256 text, uploaded_by uuid,
  ocr_status ocr_status default 'none', ocr_result jsonb,
  deleted_at timestamptz, deleted_by uuid, purge_after timestamptz)   -- set from settings.recycle_days
document_items (document_id, checklist_item_id, primary key (document_id, checklist_item_id))
                                                  -- trigger: both rows belong to the same org
item_proposals (id, document_id, checklist_item_id, field text, proposed_value text, source_quote text,
  page int, bbox jsonb, status proposal_status default 'pending', decided_by uuid, decided_at)
document_shares (id, document_id, recipients citext[], message text, shared_by uuid, sent_at)
reports (id, organization_id, checklist_id, item_ids uuid[], pdf_path text, docx_path text, created_by)
```

### 3.6 AI assistant
```sql
ai_conversations (id, organization_id, user_id, title, last_message_at)
ai_messages (id, conversation_id, role text check (role in ('user','assistant')), content text,
  sources jsonb default '[]', input_tokens int, output_tokens int)
ai_proposed_actions (id, message_id, organization_id, checklist_item_id, action jsonb,
  status proposal_status default 'pending', decided_by, decided_at)
usage_events (id bigserial, organization_id, metric text check (metric in ('ocr','ia')), qty int default 1, created_at)
```

### 3.7 Billing
```sql
plans (id, slug unique, name, description, translations jsonb, is_active bool, sort_order int,
  max_users int, max_branches int, max_documents int, max_storage_bytes bigint,
  max_ocr int, max_ia int, quota_period text default 'billing_period',
  max_file_size_bytes bigint, trial_days int, allows_assisted_ia bool,
  extra_user_price numeric(12,2), extra_branch_price numeric(12,2),
  stripe_product_id text)                           -- NULL limit = unlimited
plan_prices (id, plan_id, period billing_period, amount numeric(12,2) not null check (amount >= 0),
  currency char(3) default 'MZN', stripe_price_id text, is_active bool, unique (plan_id, period, currency))
addons (id, code text unique ('storage_5gb','extra_user','extra_branch'), amount, currency)

subscriptions (id, organization_id uuid unique,    -- one live subscription per account (parent entity)
  plan_id, plan_price_id, status sub_status, trial_ends_at, current_period_start, current_period_end,
  grace_until timestamptz, cancel_at_period_end bool default false, canceled_at,
  extra_users int default 0, extra_branches int default 0, extra_storage_bytes bigint default 0,
  max_users_override int, gateway gateway, gateway_customer_id text, gateway_subscription_id text)
subscription_events (id, subscription_id, from_status, to_status, reason, actor_id, created_at)  -- state history

payments (id, organization_id, subscription_id, gateway gateway, amount, currency, status payment_status,
  description, period billing_period, voucher_id null, amount_discounted numeric(12,2) default 0,
  gateway_ref text,                               -- Stripe session/PI id, SISLOG transaction id
  sislog_entity text, sislog_reference text, phone_msisdn text,
  paid_at, unique (gateway, gateway_ref))
invoices (id, organization_id, subscription_id, payment_id null, number text unique, status invoice_status,
  amount, currency, due_date, pdf_path, bank_details text, generated_by, confirmed_by, paid_at)
officegest_sync (payment_id pk, status text, attempts int default 0, external_id text, last_error text,
  last_attempted_at, synced_at)
vouchers (id, code citext unique, name, description, discount_type, discount_value numeric(12,2),
  plan_id null, max_uses int null, uses_count int default 0, valid_from, valid_until, is_active)
voucher_redemptions (id, voucher_id, user_id, organization_id, payment_id, amount_discounted, redeemed_at)
webhook_events (id, provider text, event_id text, event_type text, signature_valid bool, payload jsonb,
  handled bool default false, error text, ip inet, received_at, unique (provider, event_id))  -- idempotency
```

### 3.8 Platform, notifications, security
```sql
platform_settings (key text pk, value jsonb, updated_by, updated_at)
  -- trial_days, grace_days, recycle_days, max_file_size_bytes, bo_otp, document_otp_default,
  -- ai_enabled_global, ai_welcome{pt,en}, ai_suggestions{pt,en}[], quota_warnings_enabled, claude_model
reference_lists (list_key, value, label jsonb {pt,en}, parent_value, sort_order, is_active, primary key (list_key, value))
email_templates (key, locale, subject, body_md, primary key (key, locale))
notification_log (id, organization_id, checklist_item_id, kind text, days_before int, due_date date,
  recipients citext[], sent_at, unique (checklist_item_id, due_date, days_before))   -- never double-send
otp_challenges (id, user_id, purpose text, code_hash text, expires_at, attempts int default 0, consumed_at)
document_unlocks (user_id, organization_id, unlocked_until, primary key (user_id, organization_id))
operator_sessions (id, operator_id, organization_id, reason text, started_at, ended_at)
```

### 3.9 Audit log (evaluation area 9)
```sql
create table audit.log (
  id bigint generated always as identity primary key,
  occurred_at timestamptz not null default clock_timestamp(),
  organization_id uuid, actor_id uuid, actor_platform_role platform_role, operator_session_id uuid,
  event text not null,               -- 'insert'|'update'|'delete'|'auth.login'|'auth.logout'|'document.download'|…
  table_name text, record_id uuid, record_title text,
  old_data jsonb, new_data jsonb, changed_fields text[],
  ip inet, user_agent text,
  prev_hash bytea, hash bytea not null);          -- hash chain: sha256(prev_hash || row) → tamper-evident
```
- **Generic trigger** `audit.capture()` (security definer) on every business table, AFTER INSERT/UPDATE/DELETE. It records the diff with `changed_fields`, the org, and `auth.uid()`. IP and user agent come from `request.headers` (PostgREST exposes them, and Cloudflare's `CF-Connecting-IP` is read first). Secret columns are redacted.
- **Append-only:** no API grants. `REVOKE UPDATE, DELETE, TRUNCATE` from every role, including `authenticated` and `service_role`. A `BEFORE UPDATE OR DELETE` trigger raises an exception. Only the database owner can alter it, and that is itself detected by the hash chain.
- **Logins/logouts:** a trigger on `auth.sessions` (insert = login, delete = logout) writes `auth.login/auth.logout` with the session's IP and user agent. Failed logins come from the Supabase Auth logs, which are exported nightly.
- **Reads that matter:** document downloads, shares, report generation, operator visits and exports are written by the Edge Functions that perform them.
- **Access:** RPC `audit_feed(org_id, filters…)` returns rows for orgs where the caller is admin. Platform staff see everything. CSV export streams through an Edge Function and is itself audited.
- **Retention:** partitioned by month. After 24 months (configurable) partitions are detached to cold storage (R2), never deleted early.

---

## 4. Row Level Security

All tables have `enable row level security` and `force row level security`. Helper functions are `stable security definer set search_path = ''` in `private`, so they are cached per statement and can't be hijacked:

```sql
private.is_platform(role platform_role default null)  -- caller is superadmin/operator (and active)
private.org_role(org uuid) returns org_role            -- caller's role on org, or on its parent if they are parent admin
private.can_read_org(org uuid) bool  := org_role(org) is not null
                                        or (is_platform() and private.operator_has_access(org))
private.can_write_org(org uuid, min org_role) bool    -- role ≥ min AND access_mode(org) = 'full'
private.access_mode(org uuid) returns text            -- 'full' | 'read_only' | 'none', from subscription status
private.operator_has_access(org) bool                 -- org consented AND caller has an open operator_session
```

The role order is `user < manager < admin`. The default capability matrix below is my proposal. Rows marked **?** need your confirmation (Phase 1 open question 1).

| Resource | user | manager | admin | operator* | superadmin* |
|---|---|---|---|---|---|
| View ficha, items, documents | ✔ | ✔ | ✔ | ✔ | ✔ |
| Edit item answer/date/upload doc | own assigned items **?** | ✔ | ✔ | ✔ (logged) | ✔ |
| Add/remove items & categories | ✘ | ✔ | ✔ | ✘ | ✘ |
| Company data, notifications | ✘ | ✘ | ✔ | ✘ | ✔ |
| Members & invitations | ✘ | ✘ | ✔ | ✘ | ✔ |
| Subscription & payments | ✘ | ✘ | ✔ | ✘ | ✔ |
| Audit log (org) | ✘ | ✔ **?** | ✔ | ✔ | ✔ |
| Templates, plans, vouchers, gateways, settings | ✘ | ✘ | ✘ | read **?** | ✔ |

\* Platform staff can access customer data only through a consented, open operator session.

Representative policies:

```sql
-- organizations
create policy org_select on organizations for select using (private.can_read_org(id));
create policy org_update on organizations for update
  using (private.can_write_org(id,'admin')) with check (private.can_write_org(id,'admin'));
-- inserts happen only via RPC create_account() / create_branch() (security definer, checks plan limits)

-- checklist_items
create policy ci_select on checklist_items for select using (private.can_read_org(organization_id));
create policy ci_update on checklist_items for update
  using (private.can_write_org(organization_id,'manager')
         or (private.can_write_org(organization_id,'user') and assignee_id = auth.uid()))
  with check (private.can_write_org(organization_id,'user'));
create policy ci_insert on checklist_items for insert with check (private.can_write_org(organization_id,'manager'));
create policy ci_delete on checklist_items for delete
  using (private.can_write_org(organization_id,'manager') and template_item_id is null);  -- catalogue items can't be deleted, only marked not applicable

-- documents: soft delete only (no DELETE policy; purge is done by the cron function)
create policy doc_select on documents for select using (private.can_read_org(organization_id));
create policy doc_insert on documents for insert with check (private.can_write_org(organization_id,'user'));
create policy doc_update on documents for update using (private.can_write_org(organization_id,'user'));

-- memberships: admins manage; everyone sees co-members
create policy mem_select on memberships for select using (private.can_read_org(org_id));
create policy mem_write  on memberships for all using (private.can_write_org(org_id,'admin'))
  with check (private.can_write_org(org_id,'admin') and role is not null);
-- trigger: an org must always keep ≥1 admin

-- billing: customers read their own; all writes come from Edge Functions (service role) only
create policy sub_select on subscriptions for select using (private.org_role(organization_id) = 'admin' or private.is_platform());
create policy pay_select on payments      for select using (private.org_role(organization_id) = 'admin' or private.is_platform());

-- platform catalogue
create policy plans_read  on plans for select using (is_active or private.is_platform('superadmin'));
create policy plans_admin on plans for all using (private.is_platform('superadmin')) with check (private.is_platform('superadmin'));
-- same pattern: vouchers (no customer read; validated via RPC), checklist_templates, reference_lists (read: all),
-- platform_settings (read: safe subset via view; write: superadmin)

-- webhook_events, officegest_sync, otp_challenges, operator_sessions: no customer policies at all
```

**Storage policies.** These are private buckets with the path convention `{org_id}/{document_id}/{filename}`:
- `documents` bucket: `insert` is allowed when `private.can_write_org((storage.foldername(name))[1]::uuid,'user')`. The bucket has a `file_size_limit` and allowed MIME types.
- There is **no `select` policy**. Every download goes through the `document-download` Edge Function, which checks read access and the OTP unlock, writes `document.download` to the audit log, and returns a **60-second signed URL**. Download logging and OTP therefore can't be bypassed.
- `reports`, `invoices` and `logos` follow the same pattern. Logos are public-read through a transform URL.

**RLS testing:** pgTAP tests under `supabase/tests/` impersonate each role (`set local role authenticated; set request.jwt.claims …`). For every table they assert allowed and denied select/insert/update/delete, including **cross-tenant attempts**. CI blocks merges on any failure.

---

## 5. Business-flow enforcement in the database (evaluation area 6)

| Rule (Phase 1 §6) | Enforcement |
|---|---|
| One parent entity per account; branches 1 level deep | `create_account()` RPC + trigger on `organizations` |
| Plan limits: users, branches, documents, storage, file size | `BEFORE INSERT` triggers call `private.assert_quota(org, metric)` and raise `P0001 quota_exceeded:<metric>`, which the UI translates. Recycled documents are excluded. |
| OCR / IA quotas per period | `usage_events` counted within `current_period_start..end`, checked in the Edge Function before calling Claude, inserted after success |
| Read-only when expired | `private.access_mode()` inside every write policy, so expired orgs can read and export but not write |
| Subscription state machine | Trigger on `subscriptions` allows only these transitions: `trial→active/expired`, `active→past_due/canceled`, `past_due→active/expired`, `canceled→expired/active`, `expired→active`. Each change is written to `subscription_events`. |
| Activation only via verified payment | `subscriptions.status`/`current_period_end` are writable only by `service_role`; Edge webhooks are the sole writers |
| Catalogue title immutable, catalogue items not deletable | Triggers + delete policy |
| Template versions immutable after publish | Trigger blocks updates on published `template_versions` / `template_items` |
| Version upgrade (keep vs take) | `apply_template_version(org, version, mode)` RPC in one transaction, preserving answers, dates and documents by `catalog_code` |
| OCR proposals never auto-applied | Proposals live in `item_proposals`. Only `accept_proposal()` (user-invoked) writes to `checklist_items`. |
| Always ≥1 admin per org | Trigger on `memberships` |
| No double notifications | Unique key on `notification_log` |
| Webhook idempotency | Unique `(provider, event_id)` on `webhook_events`, plus `(gateway, gateway_ref)` on `payments` |
| Voucher limits | `redeem_voucher()` RPC uses `select … for update` and checks validity window, plan, `max_uses` |
| Concurrent edits | `row_version` optimistic lock: the update must match the version the client read, otherwise the UI shows "changed by X, reload" |

The Angular forms mirror these validators (NUIT 9 digits, phone, dates) for fast feedback, but the server is the authority.

---

## 6. Edge Functions & scheduled jobs

Shared code lives in `supabase/functions/_shared/`: the Supabase admin client, a caller-auth helper, Zod validation, i18n email renderer, the audit writer, the Claude client, the `PaymentGateway` interface, rate limiting and CORS.

| Function | Trigger | Responsibility |
|---|---|---|
| `account-register` | client | After Auth sign-up: create profile, org, admin membership, trial subscription and checklist from the sector template, in one transaction (RPC). |
| `invitation-send` / `invitation-accept` | client | Token (hashed in DB), branded email, limit check, accept-into-org. |
| `document-download` | client | Access + OTP check → signed URL (60 s) → audit. |
| `otp-request` / `otp-verify` | client | 6-digit email code, hashed, 10 min expiry, 5 attempts, sets `document_unlocks`. |
| `document-share` | client | Validate recipients, send email with expiring signed link (7 days), audit. |
| `ocr-extract` | client / queue | Quota check → Claude reads the PDF/image → returns `{field, value, quote, page}` → `item_proposals` (status `pending`). |
| `ai-chat` | client (streamed SSE) | Quota and enable checks → retrieve the org's items and documents (full-text + OCR text) → Claude answers with citations and the mandatory disclaimer → may propose actions (stored pending, never executed). |
| `report-generate` | client | Selected items → PDF (pdf-lib) + DOCX (docx) → `reports` bucket → signed URLs. |
| `checkout-create` | client | `PaymentGateway.createCheckout(plan_price, voucher, org)`: **Stripe** returns a Checkout Session URL. **SISLOG** is either an MSISDN push (M-Pesa/e-Mola) or an entity+reference. **Manual** creates a `pending` invoice with bank details. |
| `stripe-webhook` | Stripe | Verify signature → `webhook_events` (idempotent) → payment paid/failed → subscription transition → Officegest queue. |
| `sislog-webhook` | SISLOG | Verify (shared secret + IP allow-list) → same pipeline. |
| `invoice-confirm` | superadmin | Mark manual invoice paid (with uploaded PDF), activate subscription, audit. |
| `officegest-sync` | after payment + cron retry | Push paid payment to Officegest with exponential backoff (max 8 attempts) → `officegest_sync`. Failures are visible in the back office. |
| `operator-access-start/end` | back office | Requires org consent → opens `operator_sessions` → audit in the customer's log. |
| `admin-*` | back office | Create company with admin user, gateway connection tests (secrets never returned, masked only). |

**pg_cron schedule** (via `pg_net` → Edge Function with a service token):

| Job | When | Does |
|---|---|---|
| `compliance-notify` | daily 06:00 Africa/Maputo | For each applicable item with a due date where `due - today ∈ notify_days` (or critical + repeat): send email, insert `notification_log`. |
| `subscription-lifecycle` | hourly | Trial ended → `expired`. Period ended unpaid → `past_due` with `grace_until`. Grace over → `expired` (read-only). Cancel at period end. Renewal invoices for manual billing. |
| `quota-warnings` | daily | 80% / 95% usage emails (once per threshold per period). |
| `recycle-purge` | daily | Delete storage objects + rows where `purge_after < now()` (audited). |
| `monthly-digest` | 1st of month | Compliance summary per org with `monthly_digest`. |
| `officegest-retry` | every 15 min | Retry failed syncs. |
| `backup-export` | nightly | See §9. |
| `audit-partition` | monthly | Create next partition, archive old ones. |

---

## 7. Angular application

**Stack:** Angular **22** (standalone, **signals**, zoneless change detection, built-in control flow, `@defer`), `@supabase/supabase-js` v2, **Transloco** for runtime PT/EN switching without a reload (Angular's built-in i18n is compile-time and needs one build per locale), Angular Material 3 + CDK (dialogs, tables, drag-drop for item reordering) themed to match the current look, Tailwind for layout, ngx-charts or a light SVG donut for the dashboard, and Vitest + Playwright for tests.

**State:** small signal stores per feature (`signal`, `computed`, `resource()`/`rxResource` for async loads). There is no NgRx: the database plus Realtime is the source of truth. `OrgContextStore` holds the active organization, the role and the subscription access mode. Guards and the UI read from it.

```
checklist-legal/
├─ angular.json, package.json, tsconfig*.json, tailwind.config.js
├─ src/
│  ├─ main.ts, app.config.ts (provideZonelessChangeDetection, router, transloco, http)
│  ├─ app.routes.ts
│  ├─ environments/ (environment.ts → supabaseUrl, anonKey only)
│  ├─ assets/i18n/ pt.json, en.json
│  └─ app/
│     ├─ core/
│     │  ├─ supabase/ supabase.client.ts, database.types.ts (generated by `supabase gen types`)
│     │  ├─ auth/ auth.service.ts (session signal), auth.guard.ts, guest.guard.ts, platform.guard.ts
│     │  ├─ org/ org-context.store.ts, org-role.guard.ts, access-mode.guard.ts
│     │  ├─ realtime/ realtime.service.ts (org channel subscriptions)
│     │  ├─ i18n/ transloco-loader.ts, locale.service.ts (persists to profiles.locale)
│     │  ├─ errors/ global-error-handler.ts, db-error-translator.ts (P0001 quota_exceeded → message)
│     │  └─ api/ edge-functions.service.ts (typed wrappers)
│     ├─ shared/
│     │  ├─ ui/ page-header, data-table, confirm-dialog, compliance-chip, usage-bar, empty-state,
│     │  │      file-dropzone, kpi-card, donut-chart, catalog-id, date-field
│     │  ├─ forms/ validators.ts (nuit, phone, dateRange), form-error.component.ts
│     │  └─ pipes/ relative-time, bytes, money
│     ├─ layouts/ auth-shell/, front-office-shell/ (sidebar, org switcher, search, locale), admin-shell/
│     ├─ features/                       (each feature: *.routes.ts + pages/ + components/ + data/*.store.ts)
│     │  ├─ auth/ login, register (2 steps), forgot, reset, verify-email, invitation, onboarding
│     │  ├─ dashboard/
│     │  ├─ company/ details, members, logs, notifications (tabs)
│     │  ├─ entities/ list, branch-form, manage-access
│     │  ├─ ficha/ ficha-page, category-card, item-row, edit-mode, add-document-dialog,
│     │  │         document-viewer (OCR marks), proposals-review, version-review, gazette-entries
│     │  ├─ checklists/ editor (tree + drag/drop), view, export
│     │  ├─ reports/ list, select-points
│     │  ├─ audit/ audit-log (filters, CSV)
│     │  ├─ recycle-bin/
│     │  ├─ ai/ conversation-list, chat (streaming), sources, proposed-action-card
│     │  ├─ profile/
│     │  └─ billing/ subscriptions, subscription-detail, choose-plan, payment-reference, invoices, payments
│     └─ admin/                          (lazy bundle, platform.guard)
│        ├─ dashboard/ (revenue, customers, signups)
│        ├─ organizations/ list, create, access (operator session), assign-plan
│        ├─ templates/ list, editor (HQ/branch trees, categories), versions, publish, entity-template
│        ├─ plans/  vouchers/  invoices/  payments/  webhook-logs/  officegest-failures/
│        ├─ users/ (superadmins, operators)
│        └─ settings/ general, lists, ocr-ia, emails, security, gateways
├─ public-site/   (separate small Angular app, SSG/prerendered: landing, pricing from `plans`, terms, privacy)
├─ supabase/
│  ├─ config.toml
│  ├─ migrations/  0001_extensions_enums.sql, 0002_identity.sql, 0003_templates_checklists.sql,
│  │               0004_documents_ai.sql, 0005_billing.sql, 0006_platform.sql, 0007_audit.sql,
│  │               0008_rls_helpers.sql, 0009_policies.sql, 0010_rpc.sql, 0011_cron.sql, 0012_storage.sql
│  ├─ seed.sql     (reference lists, plans/prices, "Obrigações Gerais" v1 template with 39 items, demo org)
│  ├─ functions/   _shared/, one folder per function in §6
│  └─ tests/       pgTAP: rls_*.test.sql, rules_*.test.sql
├─ e2e/            Playwright: register→ficha→upload→report, invite, subscribe (Stripe test mode), admin flows
├─ docs/           phase1/, phase2/, runbooks/ (backup-restore.md, incident.md, key-rotation.md)
└─ .github/workflows/ ci.yml, deploy-staging.yml, deploy-prod.yml, nightly-backup.yml
```

**Routes (front office):** `/login /register /forgot-password /reset-password /verify-email /invite/:token /onboarding` · `/dashboard` · `/company?tab=` · `/entities` · `/entities/:id/ficha` · `/entities/:id/version` · `/checklists/:id` · `/checklists/:id/view` · `/reports` · `/reports/:checklistId` · `/audit` · `/recycle-bin` · `/ai[/:conversationId]` · `/profile` · `/billing` · `/billing/plans` · `/billing/:subscriptionId` · `/billing/pay/:paymentId`.
**Admin:** everything under `/admin/**`, lazily loaded, behind `platformGuard`, with a separate shell. A customer never downloads the admin bundle.

**i18n:** UI strings live in `pt.json` / `en.json`, with PT as the default. The locale is stored per user (`profiles.locale`) and in localStorage before login. Dates and currency use Angular `LOCALE_ID` data (pt-MZ / en). Content (template titles, plan names, reference lists, email templates) is stored as `{pt, en}` JSON or `translations` and resolved by a `translate` pipe that falls back to PT. A CI check fails the build when a key is missing in either file.

---

## 8. Front/back office synchronisation (evaluation area 3)

- **One database, one source of truth.** The back office and front office read the same tables, so there is no replication or sync job to drift.
- **Live updates:** Supabase Realtime `postgres_changes` on `checklist_items`, `documents`, `item_proposals`, `subscriptions` and `notification_log`, filtered by `organization_id`. RLS applies to Realtime too. When a manager attaches a document, or an operator assigns a plan, every open session updates within about a second. Supabase Realtime also covers Presence ("Ana is editing LEG-07"), which is optional.
- **Template rollout:** publishing a template version in the back office raises the "new version available" banner in each affected customer's ficha. Customers accept it on their own schedule, and the `ChecklistVersion` diff is computed server-side.
- **Conflict handling:** `row_version` optimistic locking on items, as in §5.
- **Billing sync:** gateways → webhooks → DB → Realtime → UI. Paid → Officegest, with retries and a back-office failure queue.

---

## 9. Backups & data recovery (evaluation area 10)

| Layer | Mechanism | RPO / RTO target |
|---|---|---|
| Postgres (managed) | Supabase Pro **daily backups** (7-day retention) + **PITR add-on** (WAL, restore to any second within the retention window) | RPO ≈ seconds; RTO < 1 h |
| Postgres (independent copy) | Nightly GitHub Action: `supabase db dump` (schema + data, roles) → **encrypted (age)** → Cloudflare R2 bucket in another provider/region, 35 daily + 12 monthly copies | RPO 24 h even if the Supabase account is lost |
| **Storage objects** | Not covered by Supabase DB backups. A nightly job syncs the `documents`/`reports`/`invoices` buckets to R2 (rclone, versioned bucket with object lock). | RPO 24 h |
| User mistakes | Soft delete + recycle bin (`recycle_days`) for documents. Full before/after values in `audit.log` let an admin restore a field ("revert this change") from the log. | Self-service |
| Restore drills | Quarterly: restore the latest dump into `staging`, run the e2e suite, record the time in `docs/runbooks/backup-restore.md` | Proves the RTO |
| Config | Migrations, seed, functions and infrastructure in git, so the database and app can be rebuilt from scratch | — |

---

## 10. The ten evaluation areas

| # | Area | How the design satisfies it |
|---|---|---|
| **1** | Security, data management & integrity | RLS on every table with deny-by-default and pgTAP cross-tenant tests. Helper functions are `security definer` with a fixed `search_path`. Secrets stay in Vault and Edge secrets, never in the client. Private storage, signed URLs and an OTP option protect downloads. Passwords are handled by Supabase Auth (bcrypt) with a min length of 8, leaked-password protection, email verification, and optional MFA (TOTP) for admins and required for platform staff. Operator access needs consent and is logged. Integrity comes from constraints, enums and checks (NUIT, phone, dates), FKs with explicit cascade rules, transactional RPCs, optimistic locking, idempotent webhooks, a hash-chained audit log and SHA-256 hashes on stored files. HTTPS everywhere, plus HSTS, CSP and Cloudflare WAF and rate limits on auth and functions. |
| **2** | Hosting | Supabase Cloud Pro (dev/staging/prod) + Cloudflare Pages/DNS/WAF. Infrastructure is in git, deploys go through CI, and there are no servers to patch (§2). |
| **3** | Front/back office features & sync | Full feature parity with Phase 1: every front-office screen and every back-office module (§7). Live sync through Realtime on a single database (§8). |
| **4** | UI/UX | The current information architecture and the Portuguese terminology users already know are kept. Material 3 components are themed to the current look. The layout is responsive down to phone width (the ficha table collapses to cards). Empty, loading and error states come from shared components. Keyboard and screen-reader accessibility targets WCAG 2.2 AA. Inline validation messages are in PT and EN. Quota and limit messages say what to do next ("Upgrade plan"). Live data means no reloading to see changes. |
| **5** | Sites | `www.` is a prerendered public site (SEO, pricing taken live from `plans`, terms, privacy). `app.` is the SPA for the front office, and the back office is lazily loaded under `/admin`. Both are on Cloudflare with custom domains, TLS and preview deploys per branch. Branded auth emails come from the same domain. |
| **6** | Business-flow validation | Every Phase 1 rule is enforced in the database (§5), mirrored in the forms, and covered by pgTAP rule tests plus Playwright end-to-end tests of the key flows (register → trial → ficha → upload → OCR accept → report; invite; subscribe with Stripe test mode / SISLOG sandbox / manual invoice; expiry → read-only). |
| **7** | Performance & stability | Indexes on every FK and on `(organization_id, due_date)`, `documents(organization_id) where deleted_at is null` and `audit.log(organization_id, occurred_at desc)`. RLS helpers are wrapped in `(select …)` so they are evaluated once per statement. Lists use server-side pagination and the audit log uses keyset pagination. Dashboard counts come from one RPC instead of N queries. On the client: lazy-loaded routes, zoneless signals, `@defer` for heavy widgets, and virtual scroll for long tables. Static assets are served from the CDN. AI/OCR calls are queued and quota-checked, with timeouts and retries. Sentry covers front-end and function errors, uptime is monitored on `/health`, and Supabase advisors (security and performance lints) run in CI. A k6 load test on staging runs before go-live. |
| **8** | Subscription & payment rules | The plans/prices/addons/vouchers model (§3.7). The subscription state machine has trial, grace and read-only states (§5). There are three gateways behind one `PaymentGateway` interface. Activation happens only on a verified webhook, and webhooks are idempotent and logged with raw payloads. Manual invoices have a confirm workflow. Officegest is synced with retries. Quotas are enforced in the database, with 80% and 95% warnings. Cancellation takes effect at period end. |
| **9** | Activity logging & audit | A trigger-based, append-only, hash-chained `audit.log` captures every insert, update and delete with field-level diffs, plus logins, logouts, downloads, shares, operator visits and exports. It records IP and user agent and can be filtered and exported to CSV per organization. Monthly partitions are archived, never deleted (§3.9). |
| **10** | Data recovery & backups | Daily backups and PITR, an independent encrypted nightly dump, a storage-object mirror, a recycle bin, field-level restore from the audit log, and quarterly restore drills (§9). |

---

## 11. Phase 3 build plan (iterations, each ends with a demo)

1. **Foundation:** git repo, Angular 22 workspace, Supabase local stack, migrations 0001–0009, seed (reference lists, plans, 39-item template), generated types, CI skeleton, pgTAP RLS tests.
2. **Auth & tenancy:** login, two-step registration (account + trial + ficha from template), verify and reset, invitations, org switcher, company tabs, members, PT/EN switcher.
3. **Core compliance:** ficha (categories, items, inline edit, validity, filters), compliance state and dashboard, document upload with multi-item linking, download through signed URL + OTP, recycle bin, branches and per-entity access.
4. **Audit & reports:** audit log page + CSV, report PDF/DOCX, XLSX export, notification cron + emails.
5. **Admin:** templates with versioning and the customer version review, organizations, operator access, settings, plans, vouchers.
6. **Billing:** plan selection, vouchers, Stripe Checkout + webhook, SISLOG push/reference + webhook, manual invoices, lifecycle cron, quotas and warnings, Officegest sync.
7. **OCR & AI:** Claude extraction → proposals review; AI chat with citations, quota and proposed actions.
8. **Hardening:** Playwright e2e, accessibility pass, performance indexes and load test, backup jobs + restore drill, runbooks.

I will start with iterations 1–3 locally and show you working screens after each.

---

## 12. Decisions I need from you

1. **Role matrix (§4):** confirm the rows marked **?**, especially what a "user" may edit.
2. **"depends" applicability:** are there rules (by entity type or subtype) that hide items automatically, or is "depends" just a flag the customer toggles? I designed for both (`applicability_rule`).
3. **Domain names** for `www` / `app`.
4. **Google Drive material:** it would help most now with report layouts, email wording, the full template catalogue per sector, and any contract or SLA requirements on backups and data residency.
