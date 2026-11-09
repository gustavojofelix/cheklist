// officegest-sync (pg_cron / after each confirmed payment): pushes paid payments to Officegest
// so an official invoice is issued there. Retries with backoff (max 8 attempts) and records errors
// for the back office.
//
// STATUS: the queue, retries and back-office visibility are complete; the Officegest API call
// itself is pending its specification (endpoint, document type, customer/NUIT mapping).
// Without OFFICEGEST_API_TOKEN the queue is left untouched.
import { adminClient, fail, json } from '../_shared/http.ts';
import { isCronCall } from '../_shared/cron.ts';

const MAX_ATTEMPTS = 8;

interface Row { payment_id: string; attempts: number;
  payments: { amount: number; currency: string; description: string | null; paid_at: string;
              organizations: { name: string; tax_id: string | null; address: string | null; email: string | null } } }

async function pushToOfficegest(_row: Row, _token: string): Promise<string> {
  // TODO(Officegest spec): create the invoice/receipt and return its document id.
  throw new Error('officegest_adapter_pending_spec');
}

Deno.serve(async (req) => {
  if (!isCronCall(req)) return fail('forbidden', 403);
  const token = Deno.env.get('OFFICEGEST_API_TOKEN');
  if (!token) return json({ synced: 0, reason: 'not_configured' });

  const db = adminClient();
  const { data } = await db.from('officegest_sync')
    .select('payment_id, attempts, payments(amount, currency, description, paid_at, organizations(name, tax_id, address, email))')
    .neq('status', 'synced').lt('attempts', MAX_ATTEMPTS).limit(20);
  let synced = 0;
  for (const row of (data ?? []) as unknown as Row[]) {
    const now = new Date().toISOString();
    try {
      const externalId = await pushToOfficegest(row, token);
      await db.from('officegest_sync').update({ status: 'synced', external_id: externalId, synced_at: now, last_attempted_at: now,
        attempts: row.attempts + 1, last_error: null }).eq('payment_id', row.payment_id);
      synced++;
    } catch (e) {
      await db.from('officegest_sync').update({ status: 'failed', attempts: row.attempts + 1, last_attempted_at: now,
        last_error: String((e as Error).message).slice(0, 500) }).eq('payment_id', row.payment_id);
    }
  }
  return json({ synced });
});
