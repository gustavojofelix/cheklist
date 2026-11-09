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

### Next
- Iteration 4: notification cron and e-mails, invitation e-mails, OTP for downloads, PDF/DOCX reports, XLSX export.
- Iteration 5: back office (templates and versioning, plans, vouchers, operator access, settings).
- Iteration 6: billing (Stripe, SISLOG, manual invoices, lifecycle cron, Officegest).
- Iteration 7: OCR and AI assistant (Claude).
- Iteration 8: hardening (end-to-end tests, accessibility, performance, backups).
