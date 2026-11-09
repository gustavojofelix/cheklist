// send-emails: delivers pending rows of public.email_outbox through Resend.
// Triggered by pg_cron / database functions (x-cron-secret). Without RESEND_API_KEY the
// queue is left untouched so nothing is lost; configure the key and the queue drains.
import { adminClient, fail, json } from '../_shared/http.ts';
import { isCronCall } from '../_shared/cron.ts';

const MAX_ATTEMPTS = 5;

Deno.serve(async (req) => {
  if (!isCronCall(req)) return fail('forbidden', 403);
  const apiKey = Deno.env.get('RESEND_API_KEY');
  const from = Deno.env.get('EMAIL_FROM') ?? 'Checklist Legal <onboarding@resend.dev>';
  if (!apiKey) return json({ sent: 0, reason: 'no_provider_configured' });

  const db = adminClient();
  const { data: rows, error } = await db.from('email_outbox')
    .select('id, to_email, subject, body_text, attempts, template')
    .eq('status', 'pending').lt('attempts', MAX_ATTEMPTS).order('created_at').limit(50);
  if (error) return fail('db_error', 500);

  let sent = 0, failed = 0;
  for (const r of rows ?? []) {
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json',
                   'Idempotency-Key': r.id },
        body: JSON.stringify({ from, to: [r.to_email], subject: r.subject, text: r.body_text, html: toHtml(r.body_text) }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.message ?? `HTTP ${res.status}`);
      await db.from('email_outbox').update({
        status: 'sent', sent_at: new Date().toISOString(), provider_id: body.id ?? null, attempts: r.attempts + 1,
        // one-time codes are not kept after delivery
        ...(r.template === 'otp_code' ? { body_text: '[redacted after delivery]', subject: '[redacted]' } : {}),
      }).eq('id', r.id);
      sent++;
    } catch (e) {
      const attempts = r.attempts + 1;
      await db.from('email_outbox').update({
        attempts, last_error: String((e as Error).message).slice(0, 500),
        status: attempts >= MAX_ATTEMPTS ? 'failed' : 'pending',
      }).eq('id', r.id);
      failed++;
    }
  }
  return json({ sent, failed });
});

function toHtml(text: string): string {
  const esc = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const linked = esc.replace(/(https?:\/\/[^\s]+)/g, '<a href="$1">$1</a>');
  return `<div style="font-family:Segoe UI,Arial,sans-serif;font-size:14px;line-height:1.5;color:#1e293b;max-width:560px">
    <p style="font-weight:600;color:#1d4ed8">Checklist Legal</p>${linked.split('\n\n').map((p) => `<p>${p.replace(/\n/g, '<br>')}</p>`).join('')}
    <p style="color:#94a3b8;font-size:12px">Mobilelegis · Checklist Legal</p></div>`;
}
