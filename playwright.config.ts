import { defineConfig, devices } from '@playwright/test';

// End-to-end tests run against the Angular dev server and the Supabase project in environment.ts
// (the hosted *dev* project — never production). Test accounts come from supabase/seed.sql.
export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env['CI'] ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'e2e-report' }]],
  use: {
    baseURL: process.env['E2E_BASE_URL'] ?? 'http://localhost:4200',
    locale: 'pt-PT',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    // Locally: the installed Edge (no browser download). In CI: Playwright's bundled Chromium.
    { name: 'desktop', use: { ...devices['Desktop Edge'], channel: process.env['CI'] ? undefined : 'msedge' }, grepInvert: /@mobile/ },
    { name: 'mobile', use: { ...devices['Pixel 7'], channel: process.env['CI'] ? undefined : 'msedge' }, grep: /@mobile/ },
  ],
  webServer: {
    command: 'npx ng serve --port 4200',
    url: 'http://localhost:4200',
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
