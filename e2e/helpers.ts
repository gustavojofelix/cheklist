import { expect, Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

// Seeded local/dev test accounts (supabase/seed.sql). Override with env vars in CI.
export const USERS = {
  admin: { email: process.env['E2E_ADMIN_EMAIL'] ?? 'demo@checklist.test', password: process.env['E2E_ADMIN_PASSWORD'] ?? 'Checklist#Demo2026' },
  manager: { email: process.env['E2E_MANAGER_EMAIL'] ?? 'gestor@checklist.test', password: process.env['E2E_MANAGER_PASSWORD'] ?? 'Checklist#Demo2026' },
  superadmin: { email: process.env['E2E_SUPER_EMAIL'] ?? 'superadmin@checklist.test', password: process.env['E2E_SUPER_PASSWORD'] ?? 'Checklist#Admin2026' },
};

export async function login(page: Page, who: keyof typeof USERS): Promise<void> {
  await page.goto('/login');
  await page.evaluate(() => localStorage.setItem('cl.lang', 'pt'));
  await page.goto('/login');
  await page.getByLabel('Endereço de e-mail').fill(USERS[who].email);
  await page.getByLabel('Palavra-passe').fill(USERS[who].password);
  await page.getByRole('button', { name: 'Iniciar sessão' }).click();
  await expect(page).toHaveURL(who === 'superadmin' ? /\/admin/ : /\/dashboard/);
}

/** Fails on serious/critical WCAG 2.2 A/AA violations. */
export async function expectAccessible(page: Page, label: string): Promise<void> {
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
  const serious = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  const summary = serious.map((v) => `${v.id} (${v.impact}): ${v.help} — ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`);
  expect(summary, `${label}: accessibility violations`).toEqual([]);
}
