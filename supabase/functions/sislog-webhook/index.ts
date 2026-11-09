// sislog-webhook: SISLOG (M-Pesa / e-Mola) payment notifications.
//
// STATUS: adapter pending the SISLOG C2B/MPAG API specification (payload fields and how the
// notification is authenticated). Until then every call is stored in webhook_events for
// inspection and NOTHING is activated. When the spec arrives, implement `parse()` and
// `authenticate()` below; activation then reuses webhook_confirm_payment like Stripe.
import { adminClient, clientIp, fail, json } from '../_shared/http.ts';

interface Parsed { eventId: string; paymentId: string | null; success: boolean; ref: string }

function authenticate(_req: Request, _raw: string): boolean {
  // TODO(SISLOG spec): verify the provider's signature / shared secret (SISLOG_WEBHOOK_SECRET) and source IPs.
  return false;
}

function parse(_payload: Record<string, unknown>): Parsed | null {
  // TODO(SISLOG spec): map transaction id, our reference (payment id), status and amount.
  return null;
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return fail('method_not_allowed', 405);
  const raw = await req.text();
  let payload: Record<string, unknown> = {};
  try { payload = JSON.parse(raw); } catch { payload = { raw }; }
  const valid = authenticate(req, raw);
  const parsed = valid ? parse(payload) : null;

  const db = adminClient();
  await db.from('webhook_events').upsert({
    provider: 'sislog', event_id: parsed?.eventId ?? crypto.randomUUID(), event_type: 'notification',
    signature_valid: valid, payload, ip: clientIp(req), handled: false,
    error: valid ? (parsed ? null : 'unparsed') : 'adapter_pending_spec',
  }, { onConflict: 'provider,event_id', ignoreDuplicates: true });

  if (!valid || !parsed) return fail('not_processed', 501);
  if (parsed.paymentId && parsed.success) {
    const { error } = await db.rpc('webhook_confirm_payment', { p_payment: parsed.paymentId, p_gateway_ref: parsed.ref });
    if (error) return fail('processing_error', 500);
  }
  return json({ received: true });
});
