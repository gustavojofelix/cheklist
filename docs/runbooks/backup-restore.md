# Runbook: backups and restore

| Layer | Mechanism | Covers | RPO | Owner |
|---|---|---|---|---|
| 1. Supabase daily backups | Pro plan, 7 days | Postgres | 24 h | Supabase |
| 2. Point-in-time recovery | Supabase PITR add-on | Postgres, to the second | seconds | Supabase |
| 3. Independent dump | `.github/workflows/backup.yml` (01:30 UTC) → age-encrypted → Cloudflare R2 (35 daily + 12 monthly) | Postgres (roles, schema, data, **audit log**) | 24 h | LTS |
| 4. Storage mirror | same workflow, rclone over the Supabase Storage S3 protocol → R2 (versioned bucket, object lock) | uploaded documents, reports, invoices, logos | 24 h | LTS |
| 5. User mistakes | recycle bin (`recycle_days`), field-level history in `audit.log` | single documents / fields | instant | customer admin |

> Supabase backups (1, 2) **do not include Storage files**. Layer 4 is what protects uploaded documents.

## One-time setup
1. Supabase: upgrade production to **Pro** and enable **PITR**.
2. Cloudflare R2: create a bucket with **versioning** and **object lock (governance, 35 days)**, and lifecycle rules: `db/daily/` expires after 35 days, `db/monthly/` after 400 days, and noncurrent `storage/` versions after 90 days.
3. Generate the encryption key **offline**: `age-keygen -o backup-key.txt`. Store the private key in two separate safes (for example, a password manager plus a sealed copy). Put only the public key (`age1…`) in the GitHub variable `BACKUP_AGE_RECIPIENT`.
4. Supabase → Storage → S3 connection: create an access key and set the `SUPABASE_S3_*` secrets.
5. GitHub environment `production-backup`: add the secrets listed in the workflow and restrict who can run it.

## Restore: the whole database (disaster)
1. **Within 7 days, or with PITR:** Supabase dashboard → Database → Backups → *Restore* (choose a point in time with PITR). This restores the same project in place.
2. **From R2 (Supabase project lost, or older than PITR):**
   ```bash
   rclone copy r2:<bucket>/db/daily/db-<STAMP>.tar.gz.age .
   sha256sum -c db-<STAMP>.sha256
   age -d -i backup-key.txt db-<STAMP>.tar.gz.age | tar -xzf -
   # new Supabase project → Settings → Database → connection string (session pooler)
   psql "$NEW_DB_URL" -f dump/roles.sql
   psql "$NEW_DB_URL" -f dump/schema.sql
   psql "$NEW_DB_URL" -c 'set session_replication_role = replica' -f dump/data.sql   # triggers off while loading
   ```
3. Re-create the Vault secrets, Edge Function secrets and cron secret (docs/runbooks/secrets.md), then deploy the functions: `npx supabase functions deploy --project-ref <new>`.
4. Point the app at the new project (`environment.ts` → Netlify deploy) and update the Auth site URL (`supabase config push`).

## Restore: storage files
```bash
for b in documents reports invoices logos; do rclone copy "r2:<bucket>/storage/$b" "sb:$b" --checksum; done
```
For a single file, find its `storage_path` in `public.documents` and copy just that path.

## Restore: a single document or field
- Document deleted by mistake, within `recycle_days`: the customer clicks **Documentos Apagados → Restaurar** (no LTS action needed).
- A field overwritten: Back office → Registos (platform audit) → filter by organization and date. The `update` entry shows the old value; re-enter it, and the correction is itself audited.

## Verify after any restore
1. `npx supabase test db --remote --yes` → all pgTAP tests pass.
2. `npx playwright test` against the restored environment.
3. Audit chain: as superadmin, run `select public.audit_verify_chain();`. It must return `null`; otherwise it returns the id of the first broken link.
4. Count spot-checks: organizations, checklist_items, documents, and storage object counts per bucket against the last backup log.

## Restore drill (quarterly)
Restore the latest R2 dump into a **staging** project (layer 3, then layer 4 for one organization), run the checks above, and record the result:

| Date | Who | Backup used | Time to restore (RTO) | Checks passed | Notes |
|---|---|---|---|---|---|
| | | | | | |
