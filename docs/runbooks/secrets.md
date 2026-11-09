# Runbook: secrets for scheduled jobs and e-mail

The database scheduler (pg_cron → pg_net) calls the `send-emails` and `recycle-purge` Edge Functions. Those functions accept a call only when it carries a shared secret. **Until these secrets exist, scheduled jobs are silent no-ops and e-mails stay queued** in `public.email_outbox` (Back office → E-mails). Nothing is lost.

Run once per Supabase project. Use your own terminal so the values never appear in a chat or log.

## 1. Shared cron secret (Edge Functions + Vault)
```bash
# generate a random value and keep it only in this shell
CRON_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")

# Edge Functions side
npx supabase secrets set CRON_SECRET="$CRON_SECRET" --project-ref <PROJECT_REF>
```
Then, in the Supabase dashboard **SQL editor** (paste the value printed by `echo $CRON_SECRET`, then clear your terminal):
```sql
select vault.create_secret('https://<PROJECT_REF>.supabase.co', 'project_url');
select vault.create_secret('<CRON_SECRET value>', 'cron_secret');
```
To rotate: `vault.update_secret(id, new_value)` plus `supabase secrets set CRON_SECRET=...` with the same new value.

## 2. E-mail provider (Resend)
1. Create a Resend account and verify the sending domain (SPF + DKIM records), e.g. `mobilelegis.co.mz`.
2. Create an API key with "sending access" only.
3. Set the secrets:
```bash
npx supabase secrets set RESEND_API_KEY=<key> EMAIL_FROM="Checklist Legal <no-reply@your-domain>" --project-ref <PROJECT_REF>
```
Queued e-mails are delivered by the next `email-dispatch` run (every 10 minutes) or by the next action that sends an e-mail.

## 3. Supabase Auth e-mails (sign-up confirmation, password reset)
These use Supabase's built-in sender, which has a low hourly limit. For production, set **Authentication → Emails → SMTP** to the same provider (Resend SMTP: `smtp.resend.com`, port 465, user `resend`, password = API key).

## 4. Payments and AI
```bash
npx supabase secrets set ANTHROPIC_API_KEY=<key> --project-ref <PROJECT_REF>          # OCR + assistant (Claude)
npx supabase secrets set STRIPE_SECRET_KEY=sk_test_... STRIPE_WEBHOOK_SECRET=whsec_... --project-ref <PROJECT_REF>
```
Stripe webhook endpoint: `https://<PROJECT_REF>.supabase.co/functions/v1/stripe-webhook`. Events: `checkout.session.completed`,
`checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, `checkout.session.expired`.

## Check
```sql
select jobname, schedule, active from cron.job;                                   -- 3 active jobs
select status, count(*) from public.email_outbox group by 1;                      -- pending → sent
select status_code, created from net._http_response order by created desc limit 5; -- 200 from the functions
```
