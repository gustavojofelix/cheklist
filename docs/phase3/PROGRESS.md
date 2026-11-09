# Phase 3: Build progress

## Iterations 1–3 (foundation, auth & tenancy, core compliance)

### Done
**Database** (`supabase/migrations`, 10 migrations)
- Full schema from the Phase 2 plan: catalogue, tenancy, checklists, documents, AI, billing, notifications, operator access.
- RLS on every table, via security-definer helpers (`org_role`, `access_mode`, `can_read_org`, `can_write_org`, `operator_has_access`).
- Business rules enforced in Postgres:
  - quotas (users, branches, documents, storage, file size)
  - one parent entity per account; one level of branches
  - last-admin guard
  - immutable catalogue titles and immutable published template versions
  - optimistic locking (`row_version`)
  - subscription state machine with a history table
  - read-only mode when the subscription expires
  - Boletim da República auto-numbering
  - company-bound answers (sector, shareholders, social object)
- Sign-up provisioning in one transaction: profile → organization → trial subscription → admin membership → 39-item checklist from the published template.
- Append-only, hash-chained `audit.log`:
  - generic row-change trigger with field diffs
  - logins/logouts from `auth.sessions`
  - downloads written through `log_event` (service role only)
  - `audit_verify_chain()` checks the chain
- Private storage buckets. Documents can only be uploaded by members who can write. **There is no read policy**: downloads go through the `document-download` Edge Function (RLS check, OTP check, audit entry, 60-second signed URL).
- Realtime publication for live sync.
- pgTAP suite: `supabase/tests/rls_and_rules.test.sql` (24 assertions covering tenant isolation, roles, rules, read-only mode, staff without consent, audit immutability).
- Seed: reference lists, platform settings, 4 plans with prices, "Obrigações Gerais" v1 (5 categories / 39 items, PT + EN), and demo accounts.

**Angular 22 app** (standalone, signals, zoneless, Transloco PT/EN)
- Auth screens: login; 2-step registration (personal → company); forgot/reset password; invitation accept (sign-up or existing account); onboarding; terms/privacy placeholders.
- Shell: role-filtered sidebar, account switcher, user menu, PT/EN switcher (saved to the profile), read-only banner.
- Painel (dashboard): KPI tiles, compliance donut, recent activity, attention/critical items.
- Empresa (company): company data; platform-access consent; members (invite, change role, remove, pending invitations); per-company log; notification settings.
- Entidades (entities): parent entity and branch cards with compliance counts; create and delete branches (blocked at the plan limit).
- **Ficha** (entity checklist):
  - categories with progress, search and filters
  - inline editing of the description (descritivo), validity dates, and whether an item applies
  - edit mode: add, rename and remove customer items and categories
  - multi-item document upload with SHA-256, signed download, delete to the recycle bin
  - realtime refresh
- Recycle bin with restore; audit log (filters, keyset paging, CSV export); profile and password; subscription overview with usage bars and the plan catalogue.
- Back office: organizations list with plan, status and consent flag; other admin screens are placeholders.

### Deviations from the Phase 2 plan (to confirm)
| Plan | Built | Why |
|---|---|---|
| Angular Material 3 | Tailwind CSS 4 + Angular CDK (dialog, menu) | Closer to the current app's look, a smaller bundle, and the same accessibility primitives from the CDK. |
| `FORCE ROW LEVEL SECURITY` | `ENABLE` only | The SECURITY DEFINER helpers run as the table owner and must not recurse into RLS. Only the owner (migrations and the helpers) can skip RLS. |
| Audit CSV export via an Edge Function | Exported in the browser from the `audit_feed` RPC (same filters and permissions) | Simpler for now. Recording the export itself in the audit log moves to iteration 4 with the other Edge Functions. |
| Invitation e-mail | The invite link is shown on screen | E-mail delivery (Resend/SMTP) arrives with the notification Edge Functions in iteration 4. |

## Iteration 4 (e-mails, download codes, reports): deployed to checklist-legal-dev
- **E-mail outbox** (`email_outbox`) with PT/EN templates (invitation, verification code, due reminder):
  - every e-mail is queued first, then `send-emails` delivers it through Resend;
  - queued e-mails retry up to 5 times and are never lost;
  - one-time codes are hidden from staff and redacted after delivery.
- **Invitations** are e-mailed; there is a resend option, which rotates the link.
- **Download codes:** each organization can require an e-mailed 6-digit code to download documents.
  - Codes are rate limited (1 per minute, 10 per hour) and allow 5 attempts.
  - A correct code unlocks downloads for 30 minutes, and the unlock is written to the audit log.
  - When a download needs a code, the app opens the code dialog automatically.
- **Daily expiry reminders** (pg_cron, 07:00 Maputo):
  - sent at each configured interval (90/60/30/15/1 days by default);
  - a weekly repeat while an item is Crítico;
  - one e-mail per recipient and entity listing all its items;
  - each reminder is logged once, even if the job runs twice.
  - Recipients are the notification e-mails, the admins (when "notify admin" is on) and the item's assignee.
- **Reports:** choose the points, then the `report-generate` function produces PDF + Word.
  - Data is read under the caller's permissions (RLS).
  - Files are stored in the private `reports` bucket and served through 10-minute links.
  - Each report is recorded and written to the audit log.
- **Recycle-bin purge** (daily) removes expired documents and orphan uploads from storage.
- **Audit CSV exports** are themselves audited (fail closed: no log entry, no export).
- **Back office → E-mails:** the outgoing queue.
- pgTAP: 31/31 passing on the hosted project.
- **Pending (needs you):** the cron secret and the Resend key, see [docs/runbooks/secrets.md](../runbooks/secrets.md). Until then reminders and e-mails queue up but are not delivered.
- Not yet: XLSX export of the ficha, monthly digest, quota-warning e-mails (they arrive with billing in iteration 6).

## Iteration 5 (back office): deployed to checklist-legal-dev
- **Templates:**
  - list of templates, each with its version and the number of organizations using it;
  - draft editor for HQ and branch item sets: categories, codes, PT/EN titles, validity, attachment, applicability, ordering;
  - publishing checks that the template has categories and that every item has a code;
  - published versions are immutable snapshots, and the version history is listed.
- **Customer version upgrade:**
  - a banner in the entity checklist leads to a review page showing added, removed, changed and customer-added items;
  - the admin then either **keeps their own changes** or **takes the new version**;
  - answers, dates and documents are kept either way, and each upgrade is written to the audit log.
- **Organizations:**
  - create a company plus its administrator (`admin-create-company`; the admin receives Supabase's invitation e-mail);
  - assign a plan with manual billing;
  - **operator access** requires the customer's consent and a stated reason, starts a logged session, and shows a banner with "End access" inside the account.
- **Plans** (limits and prices per period), **vouchers** (create, activate or deactivate), **platform staff** (grant or revoke operator/superadmin, suspend users), **settings** (general, security, reference lists, e-mail templates), and a **platform-wide audit log**.
- Fix: the item guard now allows trusted server functions to relink items to a new template version.
- pgTAP: 47/47 passing on the hosted project.
- Not yet: e-mail OTP for back-office logins (the setting is hidden until it is enforced), MFA for staff, and voucher redemption at checkout (iteration 6).

## Iteration 6 (billing): deployed to checklist-legal-dev
- **Server-side pricing** (`checkout_quote`): the plan price per period or the +5 GB add-on, with vouchers (percentage or fixed, plan restriction, validity window, maximum uses). The browser never decides the amount.
- **One confirmation path for every gateway** (`private.confirm_payment`):
  - idempotent;
  - activates or extends the subscription (renewing the same plan extends from the current end date);
  - applies the storage add-on;
  - redeems the voucher exactly once;
  - marks the invoice paid, queues the Officegest sync, and writes the audit log.
- **Stripe:**
  - Checkout Session, one payment per billing period, with an idempotency key;
  - `stripe-webhook` verifies the signature (HMAC, 5-minute tolerance) and stores each event once;
  - forged calls are logged under random ids, and failed events are re-processed when Stripe retries;
  - activation happens only through the webhook.
- **Bank transfer:** a sequential invoice (`CL-YYYY-NNNNNN`) with bank details and a due date; a superadmin marks it paid in Back office → Payments.
- **SISLOG (M-Pesa / e-Mola) and Officegest:**
  - the queue, retries, webhook logging and back-office visibility are complete;
  - the provider-specific calls are stubs that wait for the API specifications;
  - nothing is activated or synced until they are implemented. In the UI the SISLOG option shows "being configured".
- **Lifecycle** (hourly):
  - trial → expired;
  - active → past_due with grace days (e-mail to admins);
  - past_due or canceled → expired (read-only).
  - Cancelling takes effect at the end of the paid period.
- **Quota warnings** at 80% and 95% (documents, storage, users), sent once per threshold per period. **Monthly compliance digest** on the 1st of each month.
- **Screens:** Subscriptions (period toggle, voucher, payment method, invoices, payments, cancel, +5 GB) and Back office → Payments (pending transfers, payments with Officegest status, webhook log).
- **Security fixes found by the tests** (migrations 0015/0016): `checkout_quote` authorised any caller. `is_service()` is always true inside SECURITY DEFINER functions, and a NULL role comparison inside an `IF NOT (...)` never raised. Both are fixed and the rule is documented on the function.
- pgTAP: 57/57 passing on the hosted project.
- **Needs from you:** Stripe test keys (`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, plus a webhook endpoint pointing at `/functions/v1/stripe-webhook`), the SISLOG and Officegest API documentation, and the real bank details (Back office → Settings → General: `bank_details`).

## Iteration 7 (OCR and AI assistant with Claude): deployed to checklist-legal-dev
- **Model:** Claude Opus 5.5 (`claude-opus-5-5`), configurable in `platform_settings.claude_model`. Effort is `medium`, and server-side refusal fallbacks are on (`fallbacks: "default"`). The SDK is pinned at `@anthropic-ai/sdk@1.2.0`.
- **Document reading** (`ocr-extract`):
  - Claude reads a PDF or image and proposes the description and/or validity date for the items the document is linked to;
  - each proposal carries the exact quote and page, and uses structured JSON output;
  - proposals appear in the entity checklist; the user can correct a value, then accepts or rejects it;
  - **nothing is saved without that validation** (rule IA: OCR final validation cannot be disabled);
  - applying a proposal uses the user's own permissions (RLS).
- **Assistant** (`ai-chat`):
  - answers only from the account's data, read with the caller's permissions;
  - cites item codes, which become chips linking to the entity checklist;
  - can only *propose* changes through a strict tool; changes are applied when the user clicks Confirm;
  - keeps conversation history, and the "not legal advice" notice is always shown.
- **Controls:** global and per-organization switches, plan quotas per period (OCR readings, AI questions), and read-only accounts blocked. Usage can only be recorded by the server.
- pgTAP: 67/67 passing on the hosted project. All Edge Functions type-check with `deno check`.
- **Needs from you:** `ANTHROPIC_API_KEY` as an Edge Function secret (see docs/runbooks/secrets.md). Until then the screens report "not configured".

### Next
- Iteration 5: back office (templates and versioning, plans, vouchers, operator access, settings).
- Iteration 6: billing (Stripe, SISLOG, manual invoices, lifecycle cron, Officegest).
- Iteration 7: OCR and AI assistant (Claude).
- Iteration 8: hardening (end-to-end tests, accessibility, performance, backups).
