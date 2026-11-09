/**
 * Maps database / auth errors to i18n keys. Business rules raise SQLSTATE P0001
 * with a stable code (e.g. `quota_exceeded:users`) — see supabase/migrations.
 */
export function errorKey(err: unknown): string {
  const e = err as { code?: string; message?: string } | null;
  const msg = (e?.message ?? '').toLowerCase();
  if (!e) return 'errors.generic';
  if (msg.startsWith('quota_exceeded:')) return 'errors.quota.' + msg.split(':')[1].split(/\s/)[0];
  const known = ['catalogue_item_not_renamable', 'stale_row', 'last_admin', 'account_already_has_entity',
    'branch_of_branch_not_allowed', 'invitation_invalid', 'invitation_expired', 'invitation_wrong_account',
    'already_member', 'invalid_email', 'select_at_least_one_item', 'forbidden', 'protected_field', 'otp_required',
    'otp_too_soon', 'otp_too_many', 'otp_invalid', 'not_found', 'no_platform_consent', 'reason_required', 'version_not_offered',
    'template_empty', 'template_item_needs_code_and_category', 'published_version_immutable', 'user_not_found',
    'cannot_change_own_role', 'cannot_change_own_status', 'user_exists', 'invite_failed', 'organization_name_required'];
  const hit = known.find((k) => msg.startsWith(k));
  if (hit) return 'errors.' + hit;
  if (e.code === '42501' || msg.includes('row-level security')) return 'errors.forbidden';
  if (msg.includes('invalid login credentials')) return 'errors.invalid_credentials';
  if (msg.includes('email not confirmed')) return 'errors.email_not_confirmed';
  if (msg.includes('already registered')) return 'errors.user_exists';
  if (msg.includes('password')) return 'errors.weak_password';
  if (e.code === '23505') return 'errors.duplicate';
  if (e.code === '23514') return 'errors.invalid_value';
  return 'errors.generic';
}
