// document-download: the ONLY way to read a stored document.
// 1. caller must be able to read the document under RLS;
// 2. if the organization requires OTP, the caller must have a valid unlock;
// 3. the download is written to the audit log;
// 4. returns a 60-second signed URL.
import { adminClient, clientIp, corsHeaders, fail, json, requireUser } from '../_shared/http.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return fail('method_not_allowed', 405);

  const auth = await requireUser(req);
  if (auth instanceof Response) return auth;
  const { user, db } = auth;

  const { document_id } = await req.json().catch(() => ({}));
  if (typeof document_id !== 'string') return fail('document_id_required');

  // RLS decides whether the caller may see this document.
  const { data: doc, error } = await db.from('documents')
    .select('id, organization_id, storage_path, original_name, deleted_at')
    .eq('id', document_id).maybeSingle();
  if (error || !doc || doc.deleted_at) return fail('not_found', 404);

  const admin = adminClient();
  const { data: org } = await admin.from('organizations').select('document_otp_required, parent_id').eq('id', doc.organization_id).single();
  if (org?.document_otp_required) {
    const { data: unlock } = await admin.from('document_unlocks').select('unlocked_until')
      .eq('user_id', user.id).eq('organization_id', org.parent_id ?? doc.organization_id).maybeSingle();
    if (!unlock || new Date(unlock.unlocked_until) < new Date()) return fail('otp_required', 403);
  }

  const { data: signed, error: signErr } = await admin.storage.from('documents')
    .createSignedUrl(doc.storage_path, 60, { download: doc.original_name });
  if (signErr || !signed) return fail('storage_error', 500);

  const { error: logErr } = await admin.rpc('log_event', {
    p_event: 'document.download', p_org: doc.organization_id, p_table: 'documents', p_record: doc.id,
    p_title: doc.original_name, p_actor: user.id, p_ip: clientIp(req), p_user_agent: req.headers.get('user-agent'),
  });
  if (logErr) return fail('audit_failed', 500);   // no download without an audit record

  return json({ url: signed.signedUrl });
});
