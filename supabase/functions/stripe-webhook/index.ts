// stripe-webhook: the ONLY way a card payment activates a subscription.
// Verifies the Stripe-Signature (HMAC-SHA256, 5-minute tolerance), stores every event once
// (idempotent on Stripe's event id) and confirms / fails the matching payment.
import { adminClient, clientIp, fail, json } from '../_shared/http.ts';

const TOLERANCE_S = 300;

async function verify(raw: string, header: string | null, secret: string): Promise<boolean> {
  if (!header) return false;
  const parts = Object.fromEntries(header.split(',').map((p) => p.split('=') as [string, string]).filter((p) => p.length === 2));
  const t = Number(parts['t']);
  const sigs = header.split(',').filter((p) => p.startsWith('v1=')).map((p) => p.slice(3));
  if (!t || !sigs.length || Math.abs(Date.now() / 1000 - t) > TOLERANCE_S) return false;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${t}.${raw}`)));
  const hex = [...mac].map((b) => b.toString(16).padStart(2, '0')).join('');
  return sigs.some((s) => s.length === hex.length && [...s].reduce((d, c, i) => d | (c.charCodeAt(0) ^ hex.charCodeAt(i)), 0) === 0);
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return fail('method_not_allowed', 405);
  const secret = Deno.env.get('STRIPE_WEBHOOK_SECRET');
  if (!secret) return fail('gateway_not_configured', 501);
  const raw = await req.text();
  const valid = await verify(raw, req.headers.get('stripe-signature'), secret);
  let event: { id?: string; type?: string; data?: { object?: Record<string, unknown> } } = {};
  try { event = JSON.parse(raw); } catch { return fail('bad_payload'); }

  const db = adminClient();
  // Forged calls are logged under a random id so they can never "reserve" a real event id.
  const eventId = valid && event.id ? event.id : `invalid:${crypto.randomUUID()}`;
  let { data: stored } = await db.from('webhook_events').upsert({
    provider: 'stripe', event_id: eventId, event_type: event.type ?? null, signature_valid: valid,
    payload: event, ip: clientIp(req),
  }, { onConflict: 'provider,event_id', ignoreDuplicates: true }).select('id, handled').maybeSingle();
  if (!valid) return fail('invalid_signature', 400);       // logged, never processed
  if (!stored) {
    // Stripe retry of an event we already have: skip if handled, otherwise process it again.
    const { data: prev } = await db.from('webhook_events').select('id, handled').eq('provider', 'stripe').eq('event_id', eventId).single();
    if (!prev || prev.handled) return json({ received: true, duplicate: true });
    stored = prev;
  }

  const obj = event.data?.object ?? {};
  const paymentId = (obj['client_reference_id'] ?? (obj['metadata'] as Record<string, string> | undefined)?.['payment_id']) as string | undefined;
  let error: string | null = null;
  try {
    if (paymentId) {
      if ((event.type === 'checkout.session.completed' && obj['payment_status'] === 'paid')
          || event.type === 'checkout.session.async_payment_succeeded') {
        const { error: e } = await db.rpc('webhook_confirm_payment', { p_payment: paymentId, p_gateway_ref: String(obj['id'] ?? '') });
        if (e) throw e;
      } else if (event.type === 'checkout.session.expired' || event.type === 'checkout.session.async_payment_failed') {
        const { error: e } = await db.rpc('webhook_fail_payment', { p_payment: paymentId, p_reason: event.type });
        if (e) throw e;
      }
    }
  } catch (e) {
    error = (e as Error).message;
  }
  await db.from('webhook_events').update({ handled: !error, error }).eq('id', stored.id);
  return error ? fail('processing_error', 500) : json({ received: true });   // 500 → Stripe retries
});
