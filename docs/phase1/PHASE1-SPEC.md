# Phase 1: Feature Inventory, Data Model & Business Rules

**Source app:** https://checklists.fragoso.io ("Checklist Legal" / "Checklists - Legal")
**Explored:** 2026-11-09, read-only
**Stack observed:** Laravel + Inertia.js v2 + **Vue 3** (Vite build, shadcn-vue style components), Laravel Fortify auth, Wayfinder route helpers, behind Cloudflare. UI default locale `pt`; translation keys are English strings.

> **Coverage note.** I explored as **Gustavo Felix** (`gustavojofelix@gmail.com`). This is a brand-new org-admin account for org #16 "Alvor Software", on the Trial plan, with no documents. The account in the brief (claudio.nelasi@…) was **not** used. Every **front-office** screen was opened live.
> The **back office** (Superadmin, Back-Office settings, Plans, Vouchers, Checklist Templates, Gateways, Webhook logs) returns 403 for this account. It is documented from the app's **own front-end bundles**: page list, route list, form field names and every UI label. I did not open those screens. To confirm them visually, sign in with a superadmin account and I will do a second pass.
> **Not exercised:** saving or submitting forms, uploads, the OCR/AI calls, report generation/download, payments, invitations, deletes. Each one is noted where it appears.

---

## 1. What the product actually is

The app is not a generic checklist builder. It is a **multi-tenant corporate-compliance register** for Mozambican legal entities ("Ficha da Entidade"):

- Each **customer account** has one **parent entity** (organization) and optionally **branches** (sucursais).
- Each entity gets a **compliance checklist** created from the **sector template** published by LTS (Law Technology Solutions, the platform operator). The template has **categories → items**, with stable catalogue codes such as `LEG-01` and `SOC-16`.
- Each item holds an **answer/description** ("Descritivo"), an optional **validity/due date**, and optionally **attached documents**. Its **compliance state** (Regular / Atenção / Crítico) comes from the due date relative to the org's thresholds.
- Uploaded documents can be **OCR'd** to suggest field values, which the user validates. An **AI assistant** answers questions over the account's documents.
- **Notifications** go out at configurable day intervals before expiry (90/60/30/15/1).
- The business runs on **subscriptions** (Trial / Essencial / Profissional / Empresarial) with quotas and payments via **Stripe**, **SISLOG (M-Pesa / e-Mola / reference payments)** or **manual bank transfer + invoice**. Paid invoices sync to **Officegest** (an ERP).
- There is a full **audit log**, a **recycle bin** with retention, **OTP** gating for document downloads and back-office login, and an operator **"platform access" consent** model.

---

## 2. Roles & permissions

| Level | Role | Where stored | Notes |
|---|---|---|---|
| Platform | **Superadmin** | `users.is_superadmin = true` | Not a member of any org. Has its own `/superadmin/*` area. |
| Platform | **LTS operator** | `users.lts_role` (null for customers) | Back-office operators, managed in `/back-office/settings/operators`. |
| Organization | **admin** | `organization_user.role` | Full control of the company, members, branches, notifications, subscription. |
| Organization | **manager** | same | Inferred from the labels: manages checklists and documents. |
| Organization | **user** | same | Inferred: works on the items they can see. |

A shared `auth.permissions` map is sent to the UI. Values for an org admin:
`auditLogs.viewAny ✔, organizations.viewAny ✔, users.viewAny ✔, users.create ✔, subscriptions.viewAny ✔, subscriptions.create ✔, payments.viewAny ✔, ai.viewAny ✔`
and `plans.* ✘, checklistTemplates.* ✘, vouchers.* ✘, webhookLogs.viewAny ✘`.

Per-row capability flags are also sent: `can_edit`, `can_manage_documents`, `can_add`, `can_delete`, `can_rename`, `canManageMembers`, `canManageCompany`, `canManageBranches`, `canInviteUsers` (false once the user limit is reached), `can_open`, `can_manage_access`.

**Platform access consent:** an org admin ticks "Permitir que os operadores da plataforma acedam a esta conta". Only then can operators "Access account" (impersonate) from `/superadmin/organizations`. Every visit is written to the org's log (`platform_access_authorized_at/_by`).

User status: `active | suspended`. Admins can **suspend**, **reactivate** and **force password reset**.

---

## 3. Screen inventory

Screenshots are in [screenshots/](screenshots/). They were captured at reduced resolution and are meant as layout references.

### 3.1 Public / auth (Laravel Fortify)

| Screen | URL | Contents |
|---|---|---|
| Login | `/login` | Email, password, "Lembrar-me", forgot-password link, sign-up link, PT/EN switcher, marketing panel ("Modelos com histórico de versões", "Documentos associados a itens", "Permissões baseadas em funções"). |
| Register (2 steps) | `/register` | **Step 1, personal:** full name, email, phone country + phone (9 digits, default MZ), password (min 8) + confirm, accept Terms + Privacy. **Step 2, company:** entity name, entity type → subtype, company size, sector, country, province, NUIT (**exactly 9 digits**), address, postal box, "use same email as user" or a separate org email, has branches + how many. Ends with "Account created. A confirmation e-mail was sent. You have a 14-day trial." The same page doubles as **invitation acceptance** ("Join :name… as :role", `invitation_token`). |
| Forgot / reset password | `/forgot-password`, `/reset-password/{token}` | Standard. |
| Verify email | `/email/verification-notification` | Resend link. |
| Confirm password | `/user/confirm-password` | Re-auth before sensitive actions. |
| Terms / Privacy | `/terms`, `/privacy` | Static. Acceptance timestamps are stored on the user. |
| Invitation errors | — | `Invitations/Expired`, `Invalid`, `WrongAccount`. |
| Onboarding | `Onboarding/Entity` | "Create your organization": shown when a user has no org (same company fields as step 2). |
| OTP challenge | `/otp/challenges` | Email OTP for document download/upload and back-office login. |

### 3.2 Front office (customer). Sidebar: Painel, Empresa, Entidades, Assistente de IA, Documentos Apagados, Relatórios, Registos, Definições, Subscrições. Footer: active-organization switcher and user menu. Header: breadcrumb, global search (`/search`), language switcher.

| # | Screen | URL | Purpose & contents | Actions |
|---|---|---|---|---|
| 01 | **Painel** (dashboard) | `/dashboard` | "Bom dia, {name} — situação do {org}". KPI tiles: Total de documentos (+ entity count), Em conformidade (% of total), Prestes a expirar (30–90 day window), Expirado (immediate action). Donut chart of compliance state (live). "Pontos críticos — a expirar em 30 a 90 dias" list. "Actividades recentes" (audit feed). "Logs — acessos por dia e utilizador" (login/logout per day). | Ver todos → `/checklists`; Ver todas → `/audit-logs` |
| 02 | **Empresa → Dados da empresa** | `/organization` (= `/organizations/{id}`) | Platform-access consent checkbox. Company form: name, email, type, NUIT, NUEL, subtype, company size, sector, constitution date, share capital, shareholders (number), social object, fiscal activity start date, postal box, address, country, province, phone, AI-assistant toggle, logo (PNG/JPG/SVG ≤ 2 MB). Branches section ("Adicionar Filial", blocked by plan branch limit). | Atualizar *(not submitted)* |
| 14 | **Empresa → Utilizadores / Perfis** | `?tab=utilizadores` | Members table: ID, name, role (Admin/Manager/User select), email, phone, status, last access, remove. Invite by email + role. Pending invitations: invited date, expiry, by, resend or cancel. User-limit banner with a link to choose a plan. | Send invitation, change role, remove member *(none exercised)* |
| — | **Empresa → Registos** | `?tab=logs` | The org's audit log (paginated, 20/page). | — |
| 15 | **Empresa → Notificações automáticas** | `?tab=notificacoes` | Dias para Atenção (default 90), Dias para Crítico (default 15), warning intervals [90, 60, 30, 15, 1] as checkboxes, destination emails (textarea), repeat while critical, also notify admin, monthly compliance digest. | Atualizar *(not submitted)* |
| 03 | **Entidades** | `/organizations` | Card per entity (parent + branches): type/subtype, name, NUIT, province, counters (Itens / Conforme / Atenção / Crítico), shared-access avatars. Rule banner: **"Uma única entidade mãe por conta… apenas podem ser adicionadas sucursais. Para registar uma entidade diferente, crie uma nova conta."** | Adicionar sucursal (disabled when the limit is reached), Abrir ficha da entidade, Gerir acesso |
| — | Branches CRUD | `/organizations/{org}/branches[/create, /{b}/edit]` | Name, email, type, tax ID, address, province, country, phone. Delete is permanent. | *(not exercised)* |
| 04 | **Ficha da Entidade** (core screen) | `/organizations/{id}/ficha` | "39 itens em 5 categorias · Última actualização há X". Search, filters (Validade, Anexo), "Limpar filtros". One collapsible card per category with a progress bar (regular/total). Table columns: **ID** (catalogue code), **Item**, **Descritivo** (answer), **Validade** (date picker on items with validity), **Anexo** ("Anexar" on items requiring an attachment), **Estado** chip. A "new version available" banner leads to Review. A document preview drawer shows OCR marks ("The marks show where each value was read"). An OCR review dialog ("Review extracted fields… accept to save") shows the source quotes. | Editar checklist, Adicionar documento, Gerar relatório |
| 05 | Ficha edit mode | same, "Editar checklist" | Per item: title (renamable only for non-catalogue items), description, "Validade" checkbox, "Anexo" checkbox, remove. Add Item per category, Add category, "Concluído". | *(nothing saved)* |
| — | **Adicionar documento** dialog | same | "Choose the items this document belongs to, then upload the file". Multi-select of every item that requires an attachment; **one file can be linked to several items**. Accepts .png .jpg .jpeg .pdf .docx. | *(no upload)* |
| — | Checklist version review | `/organizations/{id}/checklist-version` | "Version :v of :template is ready". Diff ("What will change", customer-added and customer-removed items). Choice: **Keep my changes** or **Take the new version**. | *(not available, no pending version)* |
| 08 | Checklist editor (advanced) | `/checklists/{id}` | Title, description, status (Ativo/Arquivado), delete. Item tree with drag-to-reorder and nesting (sub-items). Per item: title (marks the source-language value being edited), has document, has due date, due date, **notification ranges** (per-item days-before list), description, **assignee** (org member), notes, documents dropzone. | Save Changes, Eliminar *(not exercised)* |
| — | Checklist read view | `/checklists/{id}/view` | Read-only tree with compliance chips. **Boletim da República** items (SOC-16) get sub-entries "SOC-16.nn" (assigned automatically) with subtype (`constituicao_sa, constituicao_quotas, constituicao_sucursal, constituicao_associacao, constituicao_consorcio, alteracao_nome, alteracao_pacto, alteracao_orgao, alteracao_capital, outros`), publication date and series/number. Shows OCR proposals ("Proposed descritivo", "I have validated this proposal"). | Download XLSX (`/checklists/{id}/export`), Edit |
| — | Document actions | `/checklist-item-documents/{doc}[/preview, /share, /ocr/*]` | Preview. **Share by email** (recipients + optional message). OCR: suggest, apply, confirm, cancel. Soft delete → recycle bin. | *(not exercised)* |
| 06/07 | **Relatórios** | `/reports` → `/reports/select-points/{checklist}` | Choose a checklist, then tick the points to include (counters: Selected / On track / Overdue). Generates a **PDF preview + Word download** (`/reports/download/{r}/pdf|word`). | Gerar relatório *(not generated)* |
| 09 | **Registos** (audit log) | `/audit-logs` | Columns: date/time, user, organization, event, detail (headline + field changes "from → to"), IP. Filters: event (e.g. `auth.login`, `updated`), IP, date from/to, sortable. **Exportar CSV** (`/audit-logs/export`). | Export *(not downloaded)* |
| 10 | **Assistente de IA** | `/ai/conversations[/{c}]` | Conversation history (search, rename, delete), new conversation, question box. Answers cite **sources** (document, checklist item, quote). The AI can **propose actions** that the user must **confirm or reject** (`/ai/proposed-actions/{a}/confirm|reject`). Stop generation. Disclaimer: "As respostas são informativas… Não constituem aconselhamento jurídico." Can be disabled per org (`ai_enabled`) and globally. | *(no question asked: it consumes IA quota)* |
| — | **Documentos Apagados** | `/recycle-bin` | Deleted documents: file name, deleted at, **days remaining** (retention configured in the back office), Restore, Delete permanently. | *(empty)* |
| 11 | **Definições** (profile) | `/profile` | Name, email (re-verification when changed), phone. Password change (current, new, confirm). | *(not submitted)* |
| 12 | **Subscrições** | `/subscriptions` | Table: organization, plan, status, plan price, next billing, gateway. Status filter `trial, active, past_due, canceled, expired`. | Subscrever |
| — | Subscription detail | `/subscriptions/{id}` | Usage bars (users, documents, storage, OCR, IA). Trial end / current period / days remaining. Change plan (with optional max-users override, admin only). **Cancel subscription** ("revokes access at the end of the current billing period"). Payment history. Invoices (due, generated by, confirmed by, mark as paid). | *(not exercised)* |
| 13 | **Escolher plano** | `/subscriptions/choose` | Usage summary ("Os documentos reciclados não contam para a quota até serem restaurados"). Billing period toggle: Mensal / Semestral / Anual. Plan cards. Voucher code + "Apply voucher" → discounted price. Payment method: **Stripe Checkout** (card), **SISLOG** with phone (M-Pesa / e-Mola, push to `25884xxxxxxx`) or a **reference** payment, and **bank** transfer. "Add 5 GB" storage add-on. | **Not clicked (payment)** |
| — | Payment reference | `Subscriptions/PaymentReference` | Amount, **Entity + Reference** to pay at M-Pesa/e-Mola/agent. Auto-activates when the provider's webhook confirms. | — |
| — | Payments | `/payments` | Organization, plan, method (stripe/sislog/manual), amount, currency, date, status (pending/paid/failed/refunded), **Officegest sync** status. CSV export. | — |
| — | Invoices / Statements | `/subscriptions/invoices`, `Statements/Index` | Manual invoices: upload PDF, bank details, mark as paid, activate. Statements: monthly, generated/sent/pending, download. | — |
| — | Users (org-scoped) | `/users`, `/users/{id}`, `/users/create` | List with search, status, last-access range. Suspend, reactivate, force reset password. Detail: attach/detach the user to an org with a role. | *(not exercised)* |
| 16 | Language switcher | header | English / Português. | *(left on PT)* |

### 3.3 Back office: operator (`/back-office/*`, LTS staff) *(from bundles)*

| Screen | Contents |
|---|---|
| Dashboard | Period filter. Total revenue, customers (active / trial / cancelled), monthly revenue, new customers. |
| Companies → Create | Name, email, type, NUIT, address, country, province, phone, **admin user (name, email)**, **checklist template** to provision. |
| Gateways | **Stripe** (environment, public/secret key, webhook secret, webhook URL, test connection). **SISLOG C2B/MPAG** (API key, username, base URL, test). **Officegest** (API token, base URL, timeout, test). "Failed Officegest syncs" table with Resync. Secrets are only ever shown masked. |
| Settings → General | `trial_duration_days`, `grace_days` (payment-failure grace), `recycle_days` (recycle-bin retention), `max_file_size_bytes`. |
| Settings → Lists | Editable reference lists: entity types/subtypes, company sizes, provinces, Ficha categories, warning intervals. |
| Settings → OCR & IA | `ai_enabled_global`, AI welcome message, suggested questions. Hard rules: **"Non-legal advice (IA-18) is not disableable"** and **"OCR final validation is not disableable"**. |
| Settings → Emails | Templates (subject/body), `quota_warnings_enabled` (80% / 95% quota warnings). |
| Settings → Security | `bo_otp` (email OTP on back-office login), `document_otp_default` (OTP on document downloads). |
| Settings → Operators | LTS operators: name, email, `lts_role`, status, last access. |
| Checklist Templates | List (sector, items/sub-items, **version**, orgs on version, status published/draft/archived; duplicate/restore/archive). Create/Show: name, description, **sector** ("One published template covers every customer in this sector"), **Headquarters items** and **Branch items** trees ("A new branch starts from the version the customer has already accepted"), categories, items (validity, attachment), **Publish new version**, version history (read-only snapshots, draft/current/historical), and an **entity-specific template** copied for one customer ("applies only after that customer accepts it"). |
| Plans | CRUD: name, slug, description, max branches, max users, trial days, sort order, active, **prices per period** (monthly/semestral/annual/quarterly/storage_addon, price, currency), Stripe product sync. |
| Vouchers | CRUD: code, name, description, active, discount type (percentage/fixed), value, max uses, plan (or any), valid from/until. Redemptions list. Deleting a used voucher deactivates it instead of deleting it. |

### 3.4 Back office: superadmin (`/superadmin/*`) *(from bundles)*

| Screen | Contents |
|---|---|
| Dashboard | Date range. New organizations, active subscriptions, payments received, active users. |
| Organizations | All customers: search by name/NUIT, filter by plan/sector/state (active/read_only), columns sector/type, users, storage, models, state, trial days, expired days. Actions: **Add plan** (manual billing), **Access account** (only if the org consented), manage users. Create org with **new or existing admin user**. |
| Users | Superadmin accounts CRUD (active/suspended). |
| Webhook logs | SISLOG callbacks: event, transaction ID, entity, reference, channel, value, success, handled, IP, raw payload. |

---

## 4. Seeded reference data

- **Entity types → subtypes:** commercial (E.I., SNC, Lda, SA, SAS, Holding, Representação Comercial Estrangeira, Empresa Pública), nonprofit (Associações, Fundações, ONGs, Cooperativas, +3), public (Empresas Públicas, Institutos, Agências, Autarquias), other.
- **Company sizes:** micro (≤10), pequena (11–30), média (31–100), grande (>100).
- **Provinces:** 11 Mozambican provinces + Maputo Cidade.
- **Sectors:** 21 CAE-style sectors (1 Agricultura … 21 Organismos internacionais).
- **Notification days:** 90, 60, 30, 15, 1. **Phone:** default MZ, max 9 digits. **Password:** min 8.
- **Countries** (~194), **currencies** (~45, default **MZN**).
- **Default template "Obrigações Gerais"** (39 items, 5 categories):

| Cat | Codes | Items (★ validity, 📎 attachment, ? applicable = "depends") |
|---|---|---|
| 1 Legal: Dados constitutivos | LEG-01…12 | Nome 📎, Tipo de Entidade, NUEL, Data Constituição, Capital Subscrito, Capital Realizado, Sócios/Accionistas 📎 (kind `shareholders`), Endereço 📎, Tem Sucursais ?, Objecto (kind `social_object`), Beneficiário Efectivo ★📎, Sector (kind `sector`, auto-filled from the company) |
| 2 Societário: Órgãos sociais, mandatos, actas, BR | SOC-01…16 | Administração ★📎, Administradores ★📎, Mandato Admin ★, Mandatários ?★📎, Mesa AG ★📎, Presidente AG ★📎, Mandato AG ★, Conselho Fiscal ?★📎, Pres. CF ?★📎, Mandato CF ?★, Secretário ?★, Mandato Secretário ?★, Actas AG 📎, Actas CA ?📎, Actas CF ?📎, **Boletins da República** ★📎 (gazette sub-entries) |
| 3 Licenciamento | LIC-01…04 | Alvará principal ★📎, Alvarás secundários ?★📎, Licença Impacto Ambiental ?★📎, Outros alvarás ?★📎 |
| 4 Fiscal | FIS-01…04 | NUIT 📎, Início actividade fiscal 📎, Certidão Quitação Fiscal ?★📎, Tem Sucursal ? |
| 5 Direitos de PI | PI-01…03 | Marcas/Patentes locais, regionais, globais ?★📎 |

**Plans (MZN):**

| Plan | Monthly / Semestral / Annual | Users | Branches | Documents | Storage | OCR | IA questions | Extras |
|---|---|---|---|---|---|---|---|---|
| Trial | free, 14 days | 1 | 0 | 102 | 0.2 GB | 10 / period | 10 / period | — |
| Essencial | 2 000 / 10 800 / 19 200 | 3 | 0 | 1 024 | 2 GB | 20 | 0 | +5 GB 300 |
| Profissional | 3 500 / 18 900 / 33 600 | 5 | 3 | 5 120 | 10 GB | ∞ | 100 | extra user 1 000, extra branch 500, assisted IA |
| Empresarial | 8 500 / 45 900 / 81 600 | 10 | ∞ | 25 600 | 50 GB | ∞ | ∞ | extra user 300, assisted IA |

Max file size 20 MB (plan-level `max_file_size_bytes`). Semestral is 10% off and annual 20% off the monthly price.

---

## 5. Inferred data model

Field lists come from the payloads the server sends, so they reflect real columns. PK `id` and `created_at/updated_at` are omitted throughout.

```
users
  name, email, email_verified_at, password, phone_number, phone_country,
  is_superadmin bool, lts_role nullable, status (active|suspended),
  last_access_at, terms_accepted_at, privacy_accepted_at, locale?

organizations                       -- parent entity AND branches (self-ref)
  parent_organization_id → organizations (null = parent entity)
  name, email, type, entity_subtype, company_size, sector, tax_id (NUIT, 9 digits),
  nuel, constitution_date, share_capital, shareholders int, social_object,
  fiscal_activity_start_date, address, postal_box, country, province, phone,
  has_sucursais, sucursal_count, logo_path,
  ai_enabled bool,
  -- notification settings
  notification_emails text, notification_days int[], attention_days_before,
  critical_days_before, repeat_while_critical, notify_admin, monthly_compliance_digest,
  quota_warnings json,
  -- platform access consent
  platform_access_authorized_at, platform_access_authorized_by → users,
  -- template binding
  accepted_checklist_template_id → checklist_templates,
  accepted_checklist_snapshot_id → checklist_template_versions

organization_user (pivot)           user_id, organization_id, role (admin|manager|user)
organization_invitations            organization_id, email, role, token, invited_by, invited_at, expires_at, accepted_at
organization_licenses?              (`licenses: []` on org; purpose unconfirmed)

checklist_templates                 name, description, sector, status (draft|published|archived),
                                    organization_id nullable (entity-specific copy), created_by
checklist_template_versions         template_id, version_number, is_draft, is_current, snapshot json/tree, published_at
checklist_template_items            template_version_id, parent_id, scope (headquarters|branch), is_category,
                                    catalog_code, catalog_group, title, description, sort_order,
                                    has_validity, requires_attachment, applicable (yes|depends),
                                    answer_kind (text|shareholders|social_object|sector|…), is_immutable

checklists                          organization_id, checklist_template_id, template_version, title,
                                    description, status (active|archived), created_by
checklist_items                     checklist_id, parent_id (category header = top-level row),
                                    catalog_code, catalog_group, title, description (= "descritivo"),
                                    prompt, answer, answer_kind, applicable, has_validity (has_due_date),
                                    due_date, due_date_notification_days_before int[],
                                    requires_attachment (has_document), assigned_to_id → users, notes,
                                    sort_order, is_official_gazette,
                                    br_subtype, publication_date, publication_series,   -- Boletim da República
                                    translations json {field: {original_locale, original}}
                                    -- derived: compliance_state (regular|atencao|critico), is_overdue
checklist_item_documents            original_name, path, mime, size_bytes, uploaded_by,
                                    ocr_status, extracted_json, pending_validation, validated_by_user,
                                    deleted_at (soft delete → recycle bin)
checklist_item_document_links       document_id, checklist_item_id        -- 1 file ↔ N items
document_shares                     document_id, recipients[], message, shared_by, sent_at
reports                             checklist_id, item_ids[], pdf_path, word_path, generated_by

ai_conversations                    organization_id, user_id, title, last_message_at
ai_messages                         conversation_id, role (user|assistant), content, sources json
ai_proposed_actions                 message_id, item_id, document_id, payload, status (pending|confirmed|rejected), decided_by
usage_counters                      organization_id, metric (ocr|ia), period_start, used

plans                               name, slug, description, max_branches, max_users, max_documents,
                                    max_storage_bytes, max_ocr_readings, ocr_period, max_ia_questions,
                                    ia_period, extra_user_price, extra_branch_price, allows_assisted_ia,
                                    max_file_size_bytes, trial_duration_days, is_active, sort_order,
                                    stripe_product_id                      -- null limit = unlimited
plan_prices                         plan_id, period (monthly|quarterly|semestral|annual|storage_addon),
                                    price decimal, currency, stripe_price_id
subscriptions                       organization_id, plan_id, plan_price_id,
                                    status (trial|active|past_due|canceled|expired),
                                    current_period_starts_at, current_period_ends_at, trial_ends_at,
                                    max_users_override, extra_storage_bytes,
                                    payment_gateway (stripe|sislog|manual), gateway_id, canceled_at
payments                            subscription_id, organization_id, gateway, amount, currency,
                                    status (pending|paid|failed|refunded), paid_at,
                                    sislog_entity, sislog_reference, transaction_id,
                                    officegest_sync_status, officegest_attempts, last_error, last_attempted_at
invoices                            subscription_id, due_date, amount, status (pending|pending_manual|paid|overdue),
                                    pdf_file, bank_details, generated_by, confirmed_by, paid_at
statements                          organization_id, period_start, sent_at, file
vouchers                            code, name, description, discount_type (percentage|fixed),
                                    discount_value, max_uses, uses_count, plan_id nullable,
                                    valid_from, valid_until, is_active
voucher_redemptions                 voucher_id, user_id, organization_id, subscription_id,
                                    amount_discounted, redeemed_at
webhook_logs                        provider, event, transaction_id, entity, reference, channel, value,
                                    success, handled, error_message, payload json, ip_address, user_agent

audit_logs                          organization_id, user_id, event (auth.login|auth.logout|created|
                                    updated|deleted|…), auditable_type, auditable_id, auditable_title,
                                    properties json {subject, changes{field:{from,to}}},
                                    ip_address, user_agent
otp_challenges                      user_id, purpose (document|bo_login), code_hash, expires_at, consumed_at
                                    -- session: documentOtp {upload, unlocked_until}
platform_settings (key/value)       trial_duration_days, grace_days, recycle_days, max_file_size_bytes,
                                    bo_otp, document_otp_default, ai_enabled_global, ai_welcome,
                                    ai_suggestions, quota_warnings_enabled, email templates
reference_lists                     entity_types/subtypes, company_sizes, provinces, sectors,
                                    ficha categories, notification_days
gateway_settings                    stripe/sislog/officegest credentials (encrypted)
```

**Key relationships:** User ⇄ Organization (M:N with role) · Organization ⟶ Branches (self 1:N) · Organization 1:1 active Subscription → Plan/PlanPrice · Organization 1:N Checklist (one per entity, from the accepted template version) · Checklist 1:N ChecklistItem (tree, category header → items → sub-items/BR publications) · ChecklistItem N:M Document · Template 1:N Versions 1:N TemplateItems.

---

## 6. Business rules to preserve

**Tenancy & entities**
1. Every row of customer data is scoped to an organization. A user sees only the orgs they belong to. An "active organization" is chosen in the sidebar.
2. **One parent entity per account.** Only branches can be added, and a different entity needs a new account.
3. The branch count is capped by `plan.max_branches` (0 on Trial/Essencial), with a "branch limit reached" notice. Profissional can buy extra branches.
4. Registration creates the user, the org (role **admin**), a **14-day trial subscription** and the entity's checklist from the **sector template**. Terms/privacy acceptance is timestamped.
5. NUIT is exactly 9 digits. Phone numbers are 9 digits with a country code (default MZ). Passwords are at least 8 characters. Email must be verified.

**Checklist / compliance**

6. Each entity's checklist is created from the published template version for its sector, or from an entity-specific template the customer has accepted. Branches use the branch item set.
7. Catalogue items carry immutable codes (`LEG-01`…). Catalogue titles cannot be renamed (`can_rename=false`). Customers can add their own categories and items.
8. **Template versioning:** LTS publishes a new version and customers see "Version X is ready → Review". The diff shows customer-added and customer-removed items, and the customer either keeps their changes or takes the new version. Older versions stay as read-only snapshots.
9. **Compliance state** is computed from `due_date` against org thresholds: **Crítico** when expired or within `critical_days_before` (default 15), **Atenção** within `attention_days_before` (default 90), otherwise **Regular**. Items without validity are Regular. The dashboard's "Prestes a expirar" covers the 30–90 day window and "Expirado" covers past due dates.
10. `applicable = depends` items are conditional, for example Conselho Fiscal applies only to certain company types. This is the app's **conditional logic**: it is data, not a rules engine.
11. Some answer kinds are bound to company data (`sector`, `shareholders`, `social_object`) and fill in automatically from the company record.
12. The **Boletim da República** item holds numbered publications `SOC-16.nn` (auto-incremented), each with a subtype, publication date and series.
13. **Documents:** one upload can be linked to several items. Allowed types are png/jpg/jpeg/pdf/docx. Size is limited by `max_file_size_bytes` (20 MB). Documents and storage count against plan quotas, but documents in the recycle bin do not.
14. **OCR:** extracted values are only ever *proposals*. The user must review and accept them, and this final validation **cannot be disabled**. OCR readings count against the plan quota.
15. **Deletion is soft.** Documents go to the recycle bin for `recycle_days`, can be restored, and are then purged. Permanent deletion needs confirmation.
16. **OTP:** document download (and upload, per org) can require an email OTP, which unlocks for a time window. Back-office login can require OTP.
17. Document sharing goes by email to validated, de-duplicated recipients with an optional message.

**Notifications**

18. When an item's due date reaches each configured interval (90/60/30/15/1 days, per org and optionally per item), an email goes to `notification_emails` and to the admin if `notify_admin` is set. Notifications repeat while the item is Crítico if `repeat_while_critical` is set. An optional monthly compliance digest goes out. Quota warnings go at 80% and 95%.

**AI**

19. The AI is available only if it is enabled globally, enabled for the org and allowed by the plan (`max_ia_questions` > 0). Each question counts against the quota.
20. Answers are grounded in the account's documents and cite sources. The "not legal advice" disclaimer (IA-18) **cannot be disabled**. Actions the AI proposes need explicit user confirmation.

**Subscriptions & payments**

21. Statuses run `trial → active → past_due → (grace_days) → expired/read_only`. Canceling revokes access at **period end**. An expired org becomes **read-only**.
22. Limits per plan cover users (`max_users` + `max_users_override` + paid extras), branches, documents, storage (+5 GB add-ons), OCR/IA per period. Null means unlimited. Invitations are blocked at the user limit.
23. Billing periods are monthly/semestral/annual (quarterly exists in the back office). Vouchers are percentage or fixed, optionally tied to one plan, with a validity window and max uses. Every redemption is recorded.
24. Gateways: **Stripe Checkout** for cards, **SISLOG** as a mobile push (M-Pesa/e-Mola number) or an entity + reference, and **manual** bank transfer with an invoice PDF that admins mark as paid. Activation happens **only on the provider's confirmation (webhook)**. Every webhook is logged with its raw payload.
25. Paid payments are synced to **Officegest** (invoicing). Failed syncs are listed and can be retried.

**Audit & access**

26. Every login/logout and model create/update/delete is logged with the user, org, IP, user agent and field-level from→to changes. Logs can be exported to CSV and are visible per org.
27. Operators can enter a customer account only while the customer's consent flag is on, and each visit is logged in the customer's log.
28. Users can be suspended and reactivated, and an admin can force a password reset.

---

## 7. Observations for the rebuild

- **Vue, not Laravel Blade.** The front end is Inertia + Vue 3, so nothing server-rendered needs to be ported. Every screen is a page component with JSON props, which maps cleanly to Angular routes + Supabase queries.
- The bundle still ships the **Inertia "Features" demo pages** (`Features/*`, about 45 pages). That is starter-kit residue and should not be rebuilt.
- **i18n:** keys are English source strings with a PT dictionary, and checklist content stores `translations.original_locale`, so content translation is also in scope.
- **Defaults vs nulls:** the notifications UI shows 90/15 while the DB holds null. The rebuild should store explicit defaults.
- The audit log captured `email_verified_at` changes with an internal IP (10.x, behind Cloudflare). The rebuild needs to read the real client IP (`CF-Connecting-IP`).
- **Open questions for you** (the Google Drive material would likely answer most of them):
  1. Exact permissions of **manager** vs **user**.
  2. The exact applicability rules for `depends` items, by entity type or subtype.
  3. Report PDF/Word layout and branding.
  4. Email templates and wording.
  5. The OCR/AI providers currently in use.
  6. Whether SISLOG and Officegest must be kept, or Stripe alone is acceptable.
