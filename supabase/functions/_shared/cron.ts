// Scheduled / internal calls (pg_cron via pg_net) authenticate with a shared secret.
export function isCronCall(req: Request): boolean {
  const expected = Deno.env.get('CRON_SECRET');
  const got = req.headers.get('x-cron-secret');
  if (!expected || !got || expected.length !== got.length) return false;
  // constant-time comparison
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ got.charCodeAt(i);
  return diff === 0;
}
