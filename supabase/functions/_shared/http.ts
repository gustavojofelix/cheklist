// Shared helpers for Edge Functions: CORS, JSON responses, authenticated clients.
import { createClient, SupabaseClient, User } from 'npm:@supabase/supabase-js@2.119.0';

// Browser origins allowed to call the functions (override with the ALLOWED_ORIGINS secret, comma separated).
const ALLOWED = (Deno.env.get('ALLOWED_ORIGINS') ??
  'https://cosmic-melomakarona-b9586f.netlify.app,http://localhost:4200').split(',').map((s) => s.trim());

let currentOrigin = ALLOWED[0];

/** Call at the start of each request: echoes the caller's origin only if it is allowed. */
export function setOrigin(req: Request): void {
  const o = req.headers.get('origin') ?? '';
  currentOrigin = ALLOWED.includes(o) ? o : ALLOWED[0];
}

export function corsHeaders(): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': currentOrigin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
  };
}

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders(), 'Content-Type': 'application/json' } });
}

export function fail(code: string, status = 400): Response {
  return json({ error: code }, status);
}

const url = () => Deno.env.get('SUPABASE_URL')!;

/** Client that acts as the caller (RLS applies). */
export function userClient(req: Request): SupabaseClient {
  return createClient(url(), Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    auth: { persistSession: false },
  });
}

/** Service-role client — only after the caller has been authorised. */
export function adminClient(): SupabaseClient {
  return createClient(url(), Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
}

export async function requireUser(req: Request): Promise<{ user: User; db: SupabaseClient } | Response> {
  const db = userClient(req);
  const { data, error } = await db.auth.getUser();
  if (error || !data.user) return fail('not_authenticated', 401);
  return { user: data.user, db };
}

export function clientIp(req: Request): string | null {
  return req.headers.get('cf-connecting-ip') ?? req.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? null;
}
