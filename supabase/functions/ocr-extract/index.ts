// ocr-extract: Claude reads an uploaded document (PDF or image) and PROPOSES values for the
// checklist items it is linked to (description and/or validity date), each with the quote and
// page it came from. Nothing is written to the checklist: a user must accept every proposal.
import { Anthropic, claudeClient, claudeModel, FALLBACK_BETA, textOf } from '../_shared/claude.ts';
import { adminClient, clientIp, corsHeaders, fail, json, requireUser, setOrigin } from '../_shared/http.ts';

const IMAGE_TYPES = ['image/png', 'image/jpeg'];
const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['proposals'],
  properties: {
    proposals: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['item_code', 'field', 'value', 'quote', 'page'],
        properties: {
          item_code: { type: 'string' },
          field: { type: 'string', enum: ['answer', 'due_date'] },
          value: { type: 'string' },
          quote: { type: 'string' },
          page: { type: 'integer' },
        },
      },
    },
  },
};

Deno.serve(async (req) => {
  setOrigin(req);
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders() });
  const auth = await requireUser(req);
  if (auth instanceof Response) return auth;
  const { user, db } = auth;
  const { document_id } = await req.json().catch(() => ({}));
  if (typeof document_id !== 'string') return fail('document_id_required');

  // RLS: the caller must be able to read the document and its items.
  const { data: doc } = await db.from('documents')
    .select('id, organization_id, storage_path, original_name, mime_type, deleted_at, document_items(checklist_item_id)')
    .eq('id', document_id).maybeSingle();
  if (!doc || doc.deleted_at) return fail('not_found', 404);
  if (doc.mime_type !== 'application/pdf' && !IMAGE_TYPES.includes(doc.mime_type)) return fail('ocr_unsupported_type');

  const { data: check } = await db.rpc('ai_check', { org: doc.organization_id, p_metric: 'ocr' });
  if (check !== 'ok') return fail(check === 'quota' ? 'quota_exceeded:ocr' : `ai_${check}`, 403);
  const claude = claudeClient();
  if (!claude) return fail('ai_not_configured', 501);

  const itemIds = (doc.document_items as { checklist_item_id: string }[]).map((x) => x.checklist_item_id);
  const { data: items } = await db.from('checklist_items')
    .select('id, catalog_code, title, answer, due_date, has_validity').in('id', itemIds);
  const byCode = new Map((items ?? []).map((i) => [i.catalog_code ?? i.id, i]));
  if (!byCode.size) return fail('select_at_least_one_item');

  const admin = adminClient();
  await admin.from('documents').update({ ocr_status: 'processing' }).eq('id', doc.id);
  const file = await admin.storage.from('documents').download(doc.storage_path);
  if (file.error || !file.data) return fail('storage_error', 500);
  const b64 = encodeBase64(new Uint8Array(await file.data.arrayBuffer()));

  const fileBlock: Anthropic.Beta.BetaContentBlockParam = doc.mime_type === 'application/pdf'
    ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: b64 }, title: doc.original_name }
    : { type: 'image', source: { type: 'base64', media_type: doc.mime_type as 'image/png' | 'image/jpeg', data: b64 } };
  const itemList = [...byCode.entries()].map(([code, i]) =>
    `- ${code}: ${i.title}${i.has_validity ? ' (has a validity/expiry date)' : ''}`).join('\n');

  try {
    const response = await claude.beta.messages.create({
      model: await claudeModel(admin),
      max_tokens: 16000,
      betas: [FALLBACK_BETA],
      fallbacks: 'default',
      output_config: { effort: 'medium', format: { type: 'json_schema', schema: SCHEMA } },
      system: 'You read Mozambican corporate and legal documents (certidões, alvarás, actas, Boletim da República, NUIT, etc.) ' +
        'for a compliance register. Only report values that are literally present in the document; never infer or invent. ' +
        'Dates must be ISO (YYYY-MM-DD). "answer" is a short factual description in the document\'s language (Portuguese).',
      messages: [{
        role: 'user',
        content: [
          fileBlock,
          { type: 'text', text:
            `This document was attached to these checklist items:\n${itemList}\n\n` +
            'For each item, propose: "answer" (the relevant fact, e.g. licence number, names, capital) and, only for items that have ' +
            'a validity date, "due_date" (the expiry / validity end date). Include the exact quote from the document and its page ' +
            '(1 for images). Omit an item or field if the document does not state it.' },
        ],
      }],
    });
    if (response.stop_reason === 'refusal') throw new Error('ai_refused');
    const parsed = JSON.parse(textOf(response.content) || '{"proposals":[]}') as
      { proposals: { item_code: string; field: 'answer' | 'due_date'; value: string; quote: string; page: number }[] };

    const rows = parsed.proposals
      .filter((p) => byCode.has(p.item_code) && p.value.trim()
        && (p.field === 'answer' || (byCode.get(p.item_code)!.has_validity && /^\d{4}-\d{2}-\d{2}$/.test(p.value))))
      .map((p) => ({ organization_id: doc.organization_id, document_id: doc.id, checklist_item_id: byCode.get(p.item_code)!.id,
                     field: p.field, proposed_value: p.value.trim().slice(0, 2000), source_quote: p.quote.slice(0, 1000), page: p.page }));
    if (rows.length) await admin.from('item_proposals').insert(rows);
    await admin.from('documents').update({ ocr_status: 'ready', ocr_result: { proposals: rows.length, model: response.model } }).eq('id', doc.id);
    await admin.rpc('ai_record_usage', { org: doc.organization_id, p_metric: 'ocr' });
    await admin.rpc('log_event', { p_event: 'ocr.extract', p_org: doc.organization_id, p_table: 'documents', p_record: doc.id,
      p_title: `${doc.original_name} → ${rows.length}`, p_actor: user.id, p_ip: clientIp(req), p_user_agent: req.headers.get('user-agent') });
    return json({ proposals: rows.length });
  } catch (e) {
    await admin.from('documents').update({ ocr_status: 'failed' }).eq('id', doc.id);
    const msg = (e as Error).message;
    if (msg === 'ai_refused') return fail('ai_refused', 422);
    if (e instanceof Anthropic.RateLimitError) return fail('ai_busy', 429);
    return fail('ai_error', 502);
  }
});

function encodeBase64(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}
