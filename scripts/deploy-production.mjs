#!/usr/bin/env node
// Production deployment for the Supabase side of Checklist Legal.
// Run it yourself from a terminal (it asks for confirmation before every change):
//
//   node scripts/deploy-production.mjs --ref <PROD_PROJECT_REF> --app-url https://app.example.co.mz [--step all|migrate|seed|config|functions|superadmin] [--superadmin you@firm.co.mz]
//
// It never links the production project (your dev link stays as it is): every command passes --remote=<ref>.
// It never applies seed.dev.sql (demo accounts) and refuses to target the dev project.
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';

const DEV_REF = 'baojazqhxrhayipiylbh';
const NO_JWT = [
  'send-emails',
  'recycle-purge',
  'stripe-webhook',
  'sislog-webhook',
  'officegest-sync',
];

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, all) => {
    if (a.startsWith('--'))
      acc.push([a.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : 'true']);
    return acc;
  }, []),
);
const ref = args.ref;
const appUrl = (args['app-url'] ?? '').replace(/\/$/, '');
const step = args.step ?? 'all';

if (!/^[a-z]{20}$/.test(ref ?? ''))
  fail('--ref yqkawioecihkaticxolj is required (20 lowercase letters, from the dashboard URL)');
if (ref === DEV_REF) fail('that is the DEV project — refusing');
if (!/^https:\/\/[a-z0-9.-]+$/.test(appUrl))
  fail('--app-url https://<production domain> is required');

const rl = createInterface({ input: stdin, output: stdout });
const sb = (...a) =>
  execFileSync('npx', ['supabase', ...a], {
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });

async function confirm(what) {
  const answer = (
    await rl.question(`\n▶ ${what}\n  Type the project ref to continue (or Enter to skip): `)
  ).trim();
  if (answer === ref) return true;
  console.log('  skipped');
  return false;
}

const run = (s) => step === 'all' || step === s;

if (run('migrate') && (await confirm(`Apply all migrations to PRODUCTION (${ref})`))) {
  sb('db', 'push', `--remote=${ref}`, '--yes'); // no --include-seed: demo data never goes to production
}

if (
  run('seed') &&
  (await confirm('Install reference data (lists, plans, settings, default template) — idempotent'))
) {
  sb('db', 'query', `--remote=${ref}`, '--yes', '-f', 'supabase/seed.sql');
  const sql = `update public.platform_settings set value = to_jsonb('${appUrl}'::text) where key = 'app_url';`;
  sb('db', 'query', `--remote=${ref}`, '--yes', sql);
}

if (
  run('config') &&
  (await confirm(`Push Auth settings with site URL ${appUrl} (a diff is shown first)`))
) {
  const cfg = readFileSync('supabase/config.toml', 'utf8')
    .replace(/^site_url = .*$/m, `site_url = "${appUrl}"`)
    .replace(/^additional_redirect_urls = .*$/m, `additional_redirect_urls = ["${appUrl}/**"]`)
    .replace(/^project_id = .*$/m, 'project_id = "checklist-legal-prod"');
  const dir = '.deploy/production/supabase';
  mkdirSync(dir, { recursive: true });
  writeFileSync(`${dir}/config.toml`, cfg);
  sb('config', 'push', `--remote=${ref}`, '--workdir', '.deploy/production'); // shows the diff, no --yes
  if (await confirm('Apply the diff above'))
    sb('config', 'push', `--remote=${ref}`, '--workdir', '.deploy/production', '--yes');
}

if (run('functions') && (await confirm('Deploy all Edge Functions'))) {
  for (const fn of readdirSync('supabase/functions').filter(
    (f) => !f.startsWith('_') && existsSync(`supabase/functions/${f}/index.ts`),
  )) {
    sb(
      'functions',
      'deploy',
      fn,
      `--remote=${ref}`,
      '--use-api',
      '--yes',
      ...(NO_JWT.includes(fn) ? ['--no-verify-jwt'] : []),
    );
  }
}

if (args.superadmin && (step === 'superadmin' || step === 'all')) {
  const email = String(args.superadmin).toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) fail('invalid --superadmin e-mail');
  if (
    await confirm(
      `Make ${email} a platform superadmin (the user must already exist: Auth → Users → Invite)`,
    )
  ) {
    sb(
      'db',
      'query',
      `--remote=${ref}`,
      '--yes',
      `update public.profiles set platform_role = 'superadmin' where email = '${email}' returning email, platform_role;`,
    );
  }
}

rl.close();
console.log(`
Done. Remaining manual steps (docs/runbooks/production.md):
  • Edge Function secrets + Vault (cron secret, Resend, Anthropic, Stripe)      → docs/runbooks/secrets.md
  • Netlify production site: APP_ENV=production, SUPABASE_URL=https://${ref}.supabase.co, SUPABASE_ANON_KEY=<anon key>
  • Custom domain + SMTP for Auth e-mails + leaked-password protection + MFA for staff
  • Pro plan + PITR, nightly backup workflow secrets                             → docs/runbooks/backup-restore.md`);

function fail(msg) {
  console.error(`✖ ${msg}`);
  process.exit(1);
}
