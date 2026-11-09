// Screens of the Legislação module for the "acasalamento" deck (after legislation-demo.mjs load).
//   node scripts/presentation/capture-legislacao.mjs   (dev server on http://localhost:4200)
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { ACT } from './legislation-demo.mjs';

const BASE = process.env.BASE_URL ?? 'http://localhost:4200';
const OUT = 'docs/presentation/screens';
mkdirSync(`${OUT}/desktop`, { recursive: true });
mkdirSync(`${OUT}/mobile`, { recursive: true });
const USERS = { admin: ['demo@checklist.test', 'Checklist#Demo2026'], super: ['superadmin@checklist.test', 'Checklist#Admin2026'] };
const browser = await chromium.launch({ channel: 'msedge' });

async function session(kind, who) {
  const ctx = await browser.newContext(kind === 'desktop'
    ? { viewport: { width: 1440, height: 900 }, locale: 'pt-PT' }
    : { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'pt-PT' });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/login`);
  await page.evaluate(() => localStorage.setItem('cl.lang', 'pt'));
  await page.goto(`${BASE}/login`);
  await page.getByLabel('Endereço de e-mail').fill(USERS[who][0]);
  await page.getByLabel('Palavra-passe').fill(USERS[who][1]);
  await page.getByRole('button', { name: 'Iniciar sessão' }).click();
  await page.waitForURL(/dashboard|admin/);
  return { ctx, page };
}
async function shot(page, kind, name, path, prepare) {
  if (path) await page.goto(`${BASE}${path}`);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(800);
  if (prepare) { await prepare(page); await page.waitForTimeout(600); }
  await page.screenshot({ path: `${OUT}/${kind}/${name}.png` });
  console.log(`${kind}/${name}`);
}
const openAct = async (page) => { await page.getByRole('link', { name: new RegExp(ACT.title) }).click(); await page.waitForURL(/legislation\/[0-9a-f-]{36}/); };

{
  const { ctx, page } = await session('desktop', 'super');
  await shot(page, 'desktop', 'leg-01-admin-list', '/admin/legislation');
  await openAct(page);
  await shot(page, 'desktop', 'leg-02-admin-detail', null);
  await shot(page, 'desktop', 'leg-03-admin-chain', null, (p) => p.mouse.wheel(0, 520));
  await shot(page, 'desktop', 'leg-04-add-document', null, async (p) => {
    await p.mouse.wheel(0, -2000);
    await p.getByRole('button', { name: 'Adicionar documento' }).click();
    const dlg = p.getByRole('dialog', { name: 'Adicionar documento' });
    await dlg.getByLabel('Alteração', { exact: true }).check();
    await dlg.getByLabel('Diploma', { exact: true }).fill('Decreto-Lei n.º 1/2013, de 4 de Julho');
    await dlg.getByLabel('Publicação', { exact: true }).fill('Boletim da República, I Série, n.º 53');
    await dlg.getByLabel('Data de publicação', { exact: true }).fill('2013-07-04');
    await dlg.getByLabel('O que altera', { exact: true }).fill('Revoga os artigos 147.º e 148.º do Código das Execuções Fiscais.');
  });
  await ctx.close();
}
{
  const { ctx, page } = await session('desktop', 'admin');
  await shot(page, 'desktop', 'leg-05-client-list', '/legislation');
  await openAct(page);
  await shot(page, 'desktop', 'leg-06-client-detail', null);
  await shot(page, 'desktop', 'leg-07-client-chain', null, (p) => p.mouse.wheel(0, 620));
  await ctx.close();
}
{
  const { ctx, page } = await session('mobile', 'admin');
  await page.goto(`${BASE}/legislation`);
  await page.waitForLoadState('networkidle');
  await shot(page, 'mobile', 'leg-01-list', null);
  await openAct(page);
  await shot(page, 'mobile', 'leg-02-detail', null);
  await shot(page, 'mobile', 'leg-03-chain', null, (p) => p.evaluate(() => window.scrollTo(0, 900)));
  await ctx.close();
}
await browser.close();
