// recycle-purge (daily, pg_cron): permanently removes documents whose retention expired,
// plus orphan uploads (files stored but never registered, e.g. a failed quota check).
import { adminClient, fail, json } from '../_shared/http.ts';
import { isCronCall } from '../_shared/cron.ts';

Deno.serve(async (req) => {
  if (!isCronCall(req)) return fail('forbidden', 403);
  const db = adminClient();
  const { data, error } = await db.rpc('purge_candidates');
  if (error) return fail('db_error', 500);
  const rows = (data ?? []) as { kind: string; path: string; document_id: string | null }[];
  if (!rows.length) return json({ removed: 0 });

  const paths = rows.map((r) => r.path);
  for (let i = 0; i < paths.length; i += 100) {
    const { error: rmErr } = await db.storage.from('documents').remove(paths.slice(i, i + 100));
    if (rmErr) return fail('storage_error', 500);
  }
  const ids = rows.filter((r) => r.document_id).map((r) => r.document_id!);
  const { data: deleted } = ids.length ? await db.rpc('purge_finalize', { p_document_ids: ids }) : { data: 0 };
  return json({ files: paths.length, documents: deleted });
});
