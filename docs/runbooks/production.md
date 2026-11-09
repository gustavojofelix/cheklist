# Runbook: production environment

| | Dev (today) | Production |
|---|---|---|
| Supabase project | `checklist-legal-dev` (`baojazqhxrhayipiylbh`, eu-west-1) | `checklist-legal-prod`, **new project** |
| Plan | Free | **Pro + PITR add-on** (daily backups, point-in-time recovery) |
| Data | demo accounts (`seed.dev.sql`) | **reference data only** (`seed.sql`); no demo accounts, ever |
| App | Netlify `cosmic-melomakarona-b9586f` | a **second Netlify site** from the same repo, on your domain |
| Payments | Stripe test mode | Stripe live keys (after testing) |

## 1. Create the project (you, in the Supabase dashboard)
1. New project in the same organization: name `checklist-legal-prod`, **same region as dev (eu-west-1)** unless you decide otherwise, and a strong database password saved in your password manager.
2. Billing: upgrade the organization to **Pro**, then Project → Add-ons → **Point-in-time recovery**.
3. Note the **project ref** (in the dashboard URL) and, under Settings → API, the **anon** key. The anon key is public by design. Never copy the service-role key anywhere.

## 2. Deploy the database, settings and functions (script)
From the repository, in your own terminal:
```bash
npx supabase login        # if the CLI says it lacks privileges
node scripts/deploy-production.mjs --ref <PROD_REF> --app-url https://<your production domain>
```
Before each step the script asks you to type the project ref:
1. `migrate`: applies every migration. Demo data is never included.
2. `seed`: installs the reference data (lists, plans, settings, the "Obrigações Gerais" template) and sets `app_url`. It is idempotent.
3. `config`: pushes the Auth settings with the **production** site URL. It shows the diff first, then asks again.
4. `functions`: deploys all Edge Functions. Webhook and cron functions are deployed without JWT verification; they verify their own secrets.

You can re-run a single step with `--step migrate|seed|config|functions`.

## 3. First superadmin
1. Dashboard → Authentication → Users → **Invite user** (your e-mail). Accept the e-mail and set a password.
2. `node scripts/deploy-production.mjs --ref <PROD_REF> --app-url https://<domain> --step superadmin --superadmin you@firm.co.mz`
3. Sign in, then go to Back office → Settings → General and check `app_url` and the bank details.

## 4. Secrets (you, in your terminal: never paste them into chats or tickets)
Follow docs/runbooks/secrets.md with `--project-ref <PROD_REF>`:
- the cron secret, in both Edge secrets **and** Vault (`project_url` + `cron_secret`). Without it, reminders, lifecycle, quota warnings and e-mail delivery do not run;
- `RESEND_API_KEY` + `EMAIL_FROM` (a verified domain);
- `ANTHROPIC_API_KEY`;
- `STRIPE_SECRET_KEY` + `STRIPE_WEBHOOK_SECRET`. Use **test** keys until a test purchase has been verified end to end, then switch to live keys. The webhook goes to `https://<PROD_REF>.supabase.co/functions/v1/stripe-webhook`.
- `ALLOWED_ORIGINS=https://<your production domain>` (Edge Function CORS).

## 5. Auth hardening (dashboard)
- Authentication → Emails → **SMTP**: your provider (Resend SMTP), so sign-up and reset e-mails come from your domain without the built-in rate limit.
- Authentication → Passwords: **leaked password protection ON**, minimum length 8 (already pushed by step 2).
- Authentication → MFA: TOTP enabled (already pushed). Require it for platform staff in your internal policy until enforcement is added to the app.

## 6. Netlify production site
1. Add new site → import the same GitHub repository → branch `main` (or a `production` branch if you want manual promotion).
2. Site settings → Environment variables:
   `APP_ENV=production`, `SUPABASE_URL=https://<PROD_REF>.supabase.co`, `SUPABASE_ANON_KEY=<anon key>`.
   The build fails on purpose if these are missing, or if a secret key is supplied.
3. Domain management → add your domain (e.g. `app.checklistlegal.co.mz`) and enable HTTPS.
4. The build generates `_headers` with a Content-Security-Policy for the production Supabase project and HSTS. Dev and staging sites also get `noindex`.

## 7. Backups
Configure `.github/workflows/backup.yml` for the **production** project (docs/runbooks/backup-restore.md), run it once by hand (`workflow_dispatch`), then do the first restore drill into the dev or a staging project.

## 8. Go-live checks
- [ ] `npx supabase test db --remote=<PROD_REF> --yes` passes. It runs inside a rolled-back transaction and leaves no data.
- [ ] `npx supabase db advisors --remote=<PROD_REF>` shows only the accepted findings (see PROGRESS.md, iteration 8).
- [ ] Sign up with a real e-mail, then: confirmation e-mail → trial → entity checklist created.
- [ ] Upload a document, download it, and check the audit log.
- [ ] A test card payment with Stripe test keys activates the plan through the webhook.
- [ ] `select jobname, active from cron.job;` shows 7 active jobs, and `email_outbox` drains.
- [ ] `E2E_BASE_URL=https://<domain> npx playwright test` against a staging copy, **not** production. The tests create data.

## Deployment log
| Date | Project | What | Result |
|---|---|---|---|
| 2026-11-09 | `checklist-legal-prod` (`yqkawioecihkaticxolj`, eu-north-1) | migrations 0001–0019, reference data (`seed.sql` only), Auth config (site URL `https://checklist-legal.netlify.app`), 11 Edge Functions | pgTAP 67/67, advisors: accepted findings only, 0 users / 0 organizations, 7 cron jobs active |
