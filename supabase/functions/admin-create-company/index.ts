// admin-create-company (superadmin): creates a customer account and its administrator.
// The administrator receives Supabase's invitation e-mail and sets a password on first sign-in.
// The database trigger on auth.users provisions the organization, trial subscription and checklist.
import { adminClient, clientIp, corsHeaders, fail, json, requireUser, setOrigin } from '../_shared/http.ts';

Deno.serve(async (req) => {
  setOrigin(req);
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders() });
  const auth = await requireUser(req);
  if (auth instanceof Response) return auth;
  const { user, db } = auth;

  const { data: me } = await db.from('profiles').select('platform_role, status').eq('id', user.id).single();
  if (me?.platform_role !== 'superadmin' || me.status !== 'active') return fail('forbidden', 403);

  const body = await req.json().catch(() => ({}));
  const org = body.organization ?? {};
  const email = String(body.admin_email ?? '').trim().toLowerCase();
  const name = String(body.admin_name ?? '').trim();
  if (!org.name || !String(org.name).trim()) return fail('organization_name_required');
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return fail('invalid_email');
  if (org.tax_id && !/^[0-9]{9}$/.test(String(org.tax_id))) return fail('invalid_value');

  const admin = adminClient();
  const { data: existing } = await admin.from('profiles').select('id').eq('email', email).maybeSingle();
  if (existing) return fail('user_exists', 409);

  const { data: appUrl } = await admin.from('platform_settings').select('value').eq('key', 'app_url').single();
  const { data: invited, error } = await admin.auth.admin.inviteUserByEmail(email, {
    redirectTo: `${appUrl?.value ?? ''}/reset-password`,
    data: { full_name: name, locale: 'pt', organization: org },
  });
  if (error || !invited?.user) return fail(error?.message?.includes('registered') ? 'user_exists' : 'invite_failed', 400);

  const { data: membership } = await admin.from('memberships').select('org_id').eq('user_id', invited.user.id).maybeSingle();
  await admin.rpc('log_event', { p_event: 'admin.company_created', p_org: membership?.org_id ?? null, p_table: 'organizations',
    p_record: membership?.org_id ?? null, p_title: String(org.name), p_actor: user.id, p_ip: clientIp(req),
    p_user_agent: req.headers.get('user-agent') });
  return json({ organization_id: membership?.org_id ?? null, user_id: invited.user.id });
});
