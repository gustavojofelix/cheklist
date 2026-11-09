// ai-chat: assistant over the caller's own account (checklist items + documents), read with the
// caller's rights (RLS). Answers cite item codes; the model may PROPOSE updates through a tool,
// which are stored as pending actions and only applied after the user confirms them.
import { Anthropic, claudeClient, claudeModel, FALLBACK_BETA, textOf } from '../_shared/claude.ts';
import { adminClient, corsHeaders, fail, json, requireUser, setOrigin } from '../_shared/http.ts';

const MAX_TURNS = 3;
const PROPOSE_TOOL: Anthropic.Beta.BetaTool = {
  name: 'propose_update',
  description: 'Propose a change to one checklist item (its description or its validity date). The change is NOT applied: ' +
    'the user sees it and decides. Use only when the user asks to update something or when a document clearly shows a value.',
  strict: true,
  input_schema: {
    type: 'object',
    additionalProperties: false,
    required: ['item_code', 'field', 'value', 'reason'],
    properties: {
      item_code: { type: 'string', description: 'Catalogue code, e.g. LIC-01' },
      field: { type: 'string', enum: ['answer', 'due_date'] },
      value: { type: 'string', description: 'New description, or ISO date YYYY-MM-DD for due_date' },
      reason: { type: 'string' },
    },
  },
};

interface Item { id: string; organization_id: string; catalog_code: string | null; title: string; answer: string | null;
                 due_date: string | null; compliance_state: string; is_applicable: boolean; is_category: boolean; parent_id: string | null }

Deno.serve(async (req) => {
  setOrigin(req);
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders() });
  const auth = await requireUser(req);
  if (auth instanceof Response) return auth;
  const { user, db } = auth;
  const body = await req.json().catch(() => ({}));
  const org = String(body.org ?? '');
  const question = String(body.question ?? '').trim().slice(0, 4000);
  let conversationId = body.conversation_id ? String(body.conversation_id) : null;
  const lang = body.lang === 'en' ? 'en' : 'pt';
  if (!org || !question) return fail('question_required');

  const { data: check } = await db.rpc('ai_check', { org, p_metric: 'ia' });
  if (check !== 'ok') return fail(check === 'quota' ? 'quota_exceeded:ia' : `ai_${check}`, 403);
  const claude = claudeClient();
  if (!claude) return fail('ai_not_configured', 501);

  // ---- context, read with the caller's permissions
  const { data: orgs } = await db.from('organizations').select('id, name, parent_id').or(`id.eq.${org},parent_id.eq.${org}`);
  const orgIds = (orgs ?? []).map((o) => o.id);
  const orgName = new Map((orgs ?? []).map((o) => [o.id, o.name]));
  const [{ data: items }, { data: docs }] = await Promise.all([
    db.from('checklist_items_state').select('id, organization_id, catalog_code, title, answer, due_date, compliance_state, is_applicable, is_category, parent_id')
      .in('organization_id', orgIds).order('sort_order'),
    db.from('documents').select('original_name, created_at, document_items(checklist_item_id)').in('organization_id', orgIds).is('deleted_at', null),
  ]);
  const all = (items ?? []) as Item[];
  const docsByItem = new Map<string, string[]>();
  for (const d of (docs ?? []) as { original_name: string; document_items: { checklist_item_id: string }[] }[]) {
    for (const l of d.document_items) docsByItem.set(l.checklist_item_id, [...(docsByItem.get(l.checklist_item_id) ?? []), d.original_name]);
  }
  const lines: string[] = [];
  for (const o of orgIds) {
    lines.push(`## ${orgName.get(o)}`);
    for (const i of all.filter((x) => x.organization_id === o && !x.is_category)) {
      lines.push(`[${i.catalog_code ?? i.id.slice(0, 8)}] ${i.title} | descritivo: ${i.answer ?? '—'} | validade: ${i.due_date ?? '—'}` +
        ` | estado: ${i.is_applicable ? i.compliance_state : 'não aplicável'} | documentos: ${(docsByItem.get(i.id) ?? []).join(', ') || '—'}`);
    }
  }
  const byCode = new Map(all.filter((i) => i.catalog_code && i.organization_id === org).map((i) => [i.catalog_code!, i]));

  // ---- conversation
  if (!conversationId) {
    const { data: conv, error } = await db.from('ai_conversations')
      .insert({ organization_id: org, user_id: user.id, title: question.slice(0, 80) }).select('id').single();
    if (error) return fail('forbidden', 403);
    conversationId = conv.id;
  }
  const { data: conv } = await db.from('ai_conversations').select('id').eq('id', conversationId).maybeSingle();
  if (!conv) return fail('not_found', 404);
  const { data: history } = await db.from('ai_messages').select('role, content').eq('conversation_id', conversationId)
    .order('created_at', { ascending: false }).limit(20);
  const messages: Anthropic.Beta.BetaMessageParam[] = ((history ?? []).reverse() as { role: 'user' | 'assistant'; content: string }[])
    .map((m) => ({ role: m.role, content: m.content }));
  messages.push({ role: 'user', content: question });

  const admin = adminClient();
  await admin.from('ai_messages').insert({ conversation_id: conversationId, role: 'user', content: question });
  const today = new Date().toISOString().slice(0, 10);
  const system: Anthropic.Beta.BetaTextBlockParam[] = [
    { type: 'text', text:
      'You are the compliance assistant of Checklist Legal, used by companies in Mozambique to track their corporate, licensing, ' +
      'tax and IP obligations. Answer ONLY from the account data below; if the data does not contain the answer, say so. ' +
      'Cite every item you rely on with its code in square brackets, e.g. [LIC-01]. Be concise. ' +
      `Reply in ${lang === 'en' ? 'English' : 'European/Mozambican Portuguese'}. ` +
      'You give information, not legal advice; do not draft legal opinions. ' +
      'To change data, call propose_update — it only creates a proposal the user must confirm; never claim a change was made.' },
    { type: 'text', text: `Account data (today is ${today}):\n${lines.join('\n')}`, cache_control: { type: 'ephemeral' } },
  ];

  const proposals: { item: Item; field: string; value: string; reason: string }[] = [];
  let final: Anthropic.Beta.BetaMessage | null = null;
  try {
    for (let turn = 0; turn < MAX_TURNS; turn++) {
      const response = await claude.beta.messages.create({
        model: await claudeModel(admin),
        max_tokens: 16000,
        betas: [FALLBACK_BETA],
        fallbacks: 'default',
        output_config: { effort: 'medium' },
        system,
        tools: [PROPOSE_TOOL],
        messages,
      });
      final = response;
      if (response.stop_reason === 'refusal') break;
      if (response.stop_reason !== 'tool_use') break;
      messages.push({ role: 'assistant', content: response.content });   // full content (thinking blocks kept)
      const results: Anthropic.Beta.BetaToolResultBlockParam[] = [];
      for (const block of response.content) {
        if (block.type !== 'tool_use') continue;
        const input = block.input as { item_code?: string; field?: string; value?: string; reason?: string };
        const item = input.item_code ? byCode.get(input.item_code) : undefined;
        const validDate = input.field !== 'due_date' || /^\d{4}-\d{2}-\d{2}$/.test(input.value ?? '');
        if (!item || !input.value || !['answer', 'due_date'].includes(input.field ?? '') || !validDate) {
          results.push({ type: 'tool_result', tool_use_id: block.id, is_error: true, content: 'Unknown item code or invalid value.' });
          continue;
        }
        proposals.push({ item, field: input.field!, value: input.value, reason: input.reason ?? '' });
        results.push({ type: 'tool_result', tool_use_id: block.id, content: 'Recorded as a proposal awaiting the user\'s confirmation.' });
      }
      messages.push({ role: 'user', content: results });
    }
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) return fail('ai_busy', 429);
    return fail('ai_error', 502);
  }
  if (!final) return fail('ai_error', 502);
  if (final.stop_reason === 'refusal') return fail('ai_refused', 422);

  const answer = textOf(final.content).trim() || (lang === 'en' ? 'I could not produce an answer.' : 'Não consegui produzir uma resposta.');
  const codes = [...new Set([...answer.matchAll(/\[([A-Z]{2,4}-\d{2}(?:\.\d{2})?)\]/g)].map((m) => m[1]))];
  const sources = codes.map((c) => byCode.get(c)).filter(Boolean).map((i) => ({ code: i!.catalog_code, title: i!.title, item_id: i!.id }));
  const { data: msg } = await admin.from('ai_messages').insert({
    conversation_id: conversationId, role: 'assistant', content: answer, sources,
    input_tokens: final.usage.input_tokens, output_tokens: final.usage.output_tokens,
  }).select('id, created_at').single();
  let actions: unknown[] = [];
  if (proposals.length && msg) {
    const { data } = await admin.from('ai_proposed_actions').insert(proposals.map((p) => ({
      message_id: msg.id, organization_id: p.item.organization_id, checklist_item_id: p.item.id,
      action: { field: p.field, value: p.value, reason: p.reason, code: p.item.catalog_code, title: p.item.title },
    }))).select('id, action, status');
    actions = data ?? [];
  }
  await admin.from('ai_conversations').update({ last_message_at: new Date().toISOString() }).eq('id', conversationId);
  await admin.rpc('ai_record_usage', { org, p_metric: 'ia' });
  return json({ conversation_id: conversationId, message: { id: msg?.id, role: 'assistant', content: answer, sources, created_at: msg?.created_at }, actions });
});
