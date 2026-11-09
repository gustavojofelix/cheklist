// Writes Netlify's _headers into the build output, with a Content-Security-Policy that allows
// exactly the Supabase project this build talks to (see scripts/build-env.mjs).
import { readFileSync, writeFileSync } from 'node:fs';

const { env, url } = JSON.parse(readFileSync('.build-env.json', 'utf8'));
const host = new URL(url).host;
const out = 'dist/checklist-legal/browser/_headers';

const csp = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: blob: https://${host}`,
  "font-src 'self' data:",
  `connect-src 'self' https://${host} wss://${host}`,
  `frame-src https://${host}`,
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  'upgrade-insecure-requests',
].join('; ');

const headers = `/*
  Strict-Transport-Security: max-age=63072000; includeSubDomains; preload
  X-Content-Type-Options: nosniff
  X-Frame-Options: DENY
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(self)
  Cross-Origin-Opener-Policy: same-origin
  Content-Security-Policy: ${csp}
${env === 'production' ? '' : '  X-Robots-Tag: noindex, nofollow\n'}
/*.js
  Cache-Control: public, max-age=31536000, immutable

/*.css
  Cache-Control: public, max-age=31536000, immutable

/index.html
  Cache-Control: no-cache

/i18n/*
  Cache-Control: no-cache
`;
writeFileSync(out, headers);
console.log(`write-headers: ${out} (${env}, ${host})`);
