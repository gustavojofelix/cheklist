// checkout-create: starts a purchase (plan period or storage add-on) for the caller's account.
// The amount is always computed by the database (checkout_quote), never by the browser.
//   method 'stripe' → Stripe Checkout Session URL (card)
//   method 'manual' → pending invoice with bank-transfer details (activated when LTS confirms receipt)
//   method 'sislog' → M-Pesa / e-Mola via SISLOG (adapter pending the provider's API specification)
import { adminClient, clientIp, corsHeaders, fail, json, requireUser, setOrigin } from '../_shared/http.ts';

interface Quote { amount: number; original: number; discount: number; currency: string; voucher_valid: boolean | null;
                  voucher_id: string | null; period: string | null; plan_id: string | null }

Deno.serve(async (req) => {
  setOrigin(req);
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders() });
  const auth = await requireUser(req);
  if (auth instanceof Response) return auth;
  const { user, db } = auth;

  const body = await req.json().catch(() => ({}));
  const method = String(body.method ?? '');
  const org = String(body.org ?? '');
  const priceId = body.plan_price_id ? String(body.plan_price_id) : null;
  const addon = body.addon === 'storage_5gb' ? 'storage_5gb' : null;
  const voucher = body.voucher ? String(body.voucher) : null;
  if (!['stripe', 'manual', 'sislog'].includes(method)) return fail('invalid_method');
  if (!priceId && !addon) return fail('nothing_to_buy');

  // Authorisation (account admin) + price, both enforced in SQL.
  const { data: quote, error: qErr } = await db.rpc('checkout_quote', { org, p_price: priceId, p_addon: addon, p_voucher: voucher });
  if (qErr) return fail(qErr.message.split(' ')[0], qErr.code === '42501' ? 403 : 400);
  const q = quote as Quote;
  if (voucher && !q.voucher_valid) return fail('invalid_voucher');

  if (method === 'sislog') return fail('gateway_not_configured', 501);
  const stripeKey = Deno.env.get('STRIPE_SECRET_KEY');
  if (method === 'stripe' && !stripeKey && q.amount > 0) return fail('gateway_not_configured', 501);

  const admin = adminClient();
  const { data: orgRow } = await admin.from('organizations').select('id, parent_id, name').eq('id', org).single();
  const rootId = orgRow?.parent_id ?? orgRow?.id;
  const { data: sub } = await admin.from('subscriptions').select('id').eq('organization_id', rootId).single();
  const { data: plan } = q.plan_id ? await admin.from('plans').select('name').eq('id', q.plan_id).single() : { data: null };
  const description = addon ? 'Armazenamento +5 GB' : `${plan?.name ?? 'Plano'} (${q.period})`;

  const { data: payment, error: pErr } = await admin.from('payments').insert({
    organization_id: rootId, subscription_id: sub?.id, plan_price_id: priceId, gateway: method, amount: q.amount,
    amount_discounted: q.discount, currency: q.currency, status: 'pending', description, voucher_id: q.voucher_id,
    kind: addon ? 'storage_addon' : 'subscription', created_by: user.id,
    meta: { ip: clientIp(req) },
  }).select('id').single();
  if (pErr || !payment) return fail('db_error', 500);

  const { data: appUrlRow } = await admin.from('platform_settings').select('value').eq('key', 'app_url').single();
  const appUrl = String(appUrlRow?.value ?? '');

  // 100 % voucher: nothing to charge.
  if (q.amount <= 0) {
    await admin.rpc('webhook_confirm_payment', { p_payment: payment.id, p_gateway_ref: 'voucher' });
    return json({ status: 'paid' });
  }

  if (method === 'manual') {
    const [{ data: bank }, { data: due }] = await Promise.all([
      admin.from('platform_settings').select('value').eq('key', 'bank_details').single(),
      admin.from('platform_settings').select('value').eq('key', 'manual_invoice_due_days').single(),
    ]);
    const dueDate = new Date(Date.now() + Number(due?.value ?? 7) * 86400000).toISOString().slice(0, 10);
    const { data: invoice, error: iErr } = await admin.from('invoices').insert({
      organization_id: rootId, subscription_id: sub?.id, payment_id: payment.id, status: 'pending', amount: q.amount,
      currency: q.currency, due_date: dueDate, bank_details: String(bank?.value ?? ''), generated_by: user.id,
    }).select('id, number, amount, currency, due_date, bank_details').single();
    if (iErr) return fail('db_error', 500);
    return json({ status: 'invoice', invoice });
  }

  // Stripe Checkout (one payment per billing period; amounts in minor units).
  const form = new URLSearchParams({
    mode: 'payment',
    'line_items[0][quantity]': '1',
    'line_items[0][price_data][currency]': q.currency.toLowerCase(),
    'line_items[0][price_data][unit_amount]': String(Math.round(q.amount * 100)),
    'line_items[0][price_data][product_data][name]': `Checklist Legal — ${description}`,
    client_reference_id: payment.id,
    'metadata[payment_id]': payment.id,
    'payment_intent_data[metadata][payment_id]': payment.id,
    customer_email: user.email ?? '',
    success_url: `${appUrl}/billing?paid=1`,
    cancel_url: `${appUrl}/billing?canceled=1`,
  });
  const res = await fetch('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${stripeKey}`, 'Content-Type': 'application/x-www-form-urlencoded', 'Idempotency-Key': payment.id },
    body: form,
  });
  const session = await res.json();
  if (!res.ok) {
    await admin.rpc('webhook_fail_payment', { p_payment: payment.id, p_reason: session?.error?.message ?? `HTTP ${res.status}` });
    return fail('gateway_error', 502);
  }
  await admin.from('payments').update({ gateway_ref: session.id }).eq('id', payment.id);
  return json({ status: 'redirect', url: session.url });
});
