// Captures every screen of Checklist Legal (desktop + phone) for the presentation.
// Uses the seeded DEV accounts and only opens/reads screens (no data is changed).
//   node scripts/presentation/capture.mjs   (dev server on http://localhost:4200)
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const BASE = process.env.BASE_URL ?? 'http://localhost:4200';
const OUT = 'docs/presentation/screens';
mkdirSync(`${OUT}/desktop`, { recursive: true });
mkdirSync(`${OUT}/mobile`, { recursive: true });

const USERS = {
  admin: ['demo@checklist.test', 'Checklist#Demo2026'],
  super: ['superadmin@checklist.test', 'Checklist#Admin2026'],
};

const browser = await chromium.launch({ channel: 'msedge' });

async function session(kind, who) {
  const ctx = await browser.newContext(kind === 'desktop'
    ? { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, locale: 'pt-PT' }
    : { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'pt-PT' });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/login`);
  await page.evaluate(() => localStorage.setItem('cl.lang', 'pt'));
  if (who) {
    await page.goto(`${BASE}/login`);
    await page.getByLabel('Endereço de e-mail').fill(USERS[who][0]);
    await page.getByLabel('Palavra-passe').fill(USERS[who][1]);
    await page.getByRole('button', { name: 'Iniciar sessão' }).click();
    await page.waitForURL(/dashboard|admin/);
  }
  return { ctx, page };
}

async function shot(page, kind, name, path, prepare) {
  if (path) await page.goto(`${BASE}${path}`);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(900);
  if (prepare) { await prepare(page); await page.waitForTimeout(700); }
  await page.screenshot({ path: `${OUT}/${kind}/${name}.png` });
  console.log(`${kind}/${name}`);
}

const ficha = async (page) => {
  await page.goto(`${BASE}/entities`);
  await page.getByRole('link', { name: 'Abrir ficha da entidade' }).first().click();
  await page.waitForURL(/ficha/);
};

// ---------------------------------------------------------------- desktop
{
  const { ctx, page } = await session('desktop');
  await shot(page, 'desktop', '01-login', '/login');
  await shot(page, 'desktop', '02-register', '/register');
  await ctx.close();
}
{
  const { ctx, page } = await session('desktop', 'admin');
  await shot(page, 'desktop', '03-dashboard', '/dashboard');
  await shot(page, 'desktop', '04-company', '/company?tab=dados');
  await shot(page, 'desktop', '05-company-users', '/company?tab=utilizadores');
  await shot(page, 'desktop', '06-company-notifications', '/company?tab=notificacoes');
  await shot(page, 'desktop', '07-entities', '/entities');
  await ficha(page); await shot(page, 'desktop', '08-ficha', null);
  await shot(page, 'desktop', '09-ficha-scrolled', null, (p) => p.mouse.wheel(0, 1300));
  await shot(page, 'desktop', '10-ficha-edit', null, async (p) => {
    await p.mouse.wheel(0, -3000);
    await p.getByRole('button', { name: 'Editar checklist' }).click();
  });
  await p_close_edit(page);
  await shot(page, 'desktop', '11-add-document', null, (p) => p.getByRole('button', { name: 'Adicionar documento' }).first().click());
  await page.keyboard.press('Escape');
  await shot(page, 'desktop', '12-reports', '/reports');
  await shot(page, 'desktop', '13-report-points', null, async (p) => {
    await p.getByRole('link', { name: /Gerar relatório/ }).first().click();
    await p.waitForURL(/reports\//);
    await p.waitForLoadState('networkidle');
    await p.locator('label', { hasText: 'Seleccionar todos os itens' }).locator('input').check();
  });
  await shot(page, 'desktop', '14-audit', '/audit');
  await shot(page, 'desktop', '15-recycle-bin', '/recycle-bin');
  await shot(page, 'desktop', '16-ai', '/ai');
  await shot(page, 'desktop', '17-billing', '/billing');
  await shot(page, 'desktop', '18-billing-checkout', null, (p) => p.getByRole('button', { name: 'Escolher plano' }).nth(1).click());
  await shot(page, 'desktop', '19-profile', '/profile');
  await ctx.close();
}
{
  const { ctx, page } = await session('desktop', 'super');
  await shot(page, 'desktop', '20-admin-organizations', '/admin/organizations');
  await shot(page, 'desktop', '21-admin-templates', '/admin/templates');
  await shot(page, 'desktop', '22-admin-template-editor', null, async (p) => {
    await p.getByRole('link', { name: 'Abrir' }).first().click();
    await p.waitForURL(/templates\//);
  });
  await shot(page, 'desktop', '23-admin-plans', '/admin/plans');
  await shot(page, 'desktop', '24-admin-vouchers', '/admin/vouchers');
  await shot(page, 'desktop', '25-admin-payments', '/admin/payments');
  await shot(page, 'desktop', '26-admin-staff', '/admin/staff');
  await shot(page, 'desktop', '27-admin-settings', '/admin/settings');
  await shot(page, 'desktop', '28-admin-emails', '/admin/emails');
  await shot(page, 'desktop', '29-admin-audit', '/admin/audit');
  await ctx.close();
}

// ---------------------------------------------------------------- phone
{
  const { ctx, page } = await session('mobile');
  await shot(page, 'mobile', '01-login', '/login');
  await ctx.close();
}
{
  const { ctx, page } = await session('mobile', 'admin');
  await shot(page, 'mobile', '02-dashboard', '/dashboard');
  await shot(page, 'mobile', '03-menu', null, (p) => p.getByRole('button', { name: 'Abrir menu' }).click());
  await shot(page, 'mobile', '04-entities', '/entities');
  await ficha(page); await shot(page, 'mobile', '05-ficha', null);
  await shot(page, 'mobile', '06-ficha-cards', null, (p) => p.evaluate(() => window.scrollTo(0, 1900)));
  await shot(page, 'mobile', '07-add-document', null, (p) => p.getByRole('button', { name: 'Adicionar documento' }).click());
  await page.keyboard.press('Escape');
  await shot(page, 'mobile', '08-company', '/company?tab=utilizadores');
  await shot(page, 'mobile', '09-ai', '/ai');
  await shot(page, 'mobile', '10-billing', '/billing');
  await shot(page, 'mobile', '11-audit', '/audit');
  await ctx.close();
}
await browser.close();

async function p_close_edit(page) {
  const done = page.getByRole('button', { name: 'Concluído' });
  if (await done.count()) await done.click();
}
