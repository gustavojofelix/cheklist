// Records the "acasalamento de documentos" video with the LACI047 example (DEV project):
// staff create the act, upload the original, three alterations (out of order) and the revised text;
// then a customer reads the chain on desktop and phone. Timed to the pt-BR narration.
//   node scripts/presentation/legislation-demo.mjs reset
//   VIDEO=legislacao node scripts/presentation/narration.mjs     (MSEDGE_TTS=…)
//   node scripts/presentation/record-legislacao.mjs
//   VIDEO=legislacao node scripts/presentation/mux-video.mjs
import { chromium } from '@playwright/test';
import { existsSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { overlayScript } from './lib/overlay.mjs';
import { ACT, DOCS, filePath } from './legislation-demo.mjs';
import { SCENES } from './scenes-legislacao.mjs';

const BASE = process.env.BASE_URL ?? 'http://localhost:4200';
const OUT = 'docs/presentation';
const NARR = `${OUT}/.narration-legislacao`;
const TMP = `${OUT}/.video-tmp-legislacao`;
const W = 1600, H = 900;
const USERS = { admin: ['demo@checklist.test', 'Checklist#Demo2026'], super: ['superadmin@checklist.test', 'Checklist#Admin2026'] };
const TILE = readFileSync('docs/presentation/assets/tile.png').toString('base64');
for (const d of DOCS) if (!existsSync(filePath(d))) throw new Error(`missing ${filePath(d)}`);

// ----------------------------------------------------------- narration lengths
const BY_ID = Object.fromEntries(SCENES.map((s) => [s.id, s]));
const DUR = {};
{
  const b = await chromium.launch({ channel: 'msedge' });
  const p = await b.newPage();
  await p.route('http://narration.local/**', (r) => r.fulfill({ contentType: 'audio/mpeg', body: readFileSync(`${NARR}/${r.request().url().split('/').pop()}`) }));
  await p.route('http://narration.local/', (r) => r.fulfill({ contentType: 'text/html', body: '<!doctype html><title>n</title>' }));
  await p.goto('http://narration.local/');
  for (const s of SCENES) {
    if (!existsSync(`${NARR}/${s.id}.mp3`)) throw new Error(`missing narration ${s.id}: run VIDEO=legislacao narration.mjs`);
    DUR[s.id] = await p.evaluate(async (u) => (await new OfflineAudioContext(1, 1, 24000).decodeAudioData(await (await fetch(u)).arrayBuffer())).duration,
      `http://narration.local/${s.id}.mp3`);
  }
  await b.close();
}

// ----------------------------------------------------------- recorder helpers
const browser = await chromium.launch({ channel: 'msedge' });
const ctx = await browser.newContext({ viewport: { width: W, height: H }, locale: 'pt-PT', recordVideo: { dir: TMP, size: { width: W, height: H } } });
await ctx.addInitScript(overlayScript(W, H));
const page = await ctx.newPage();
const T0 = Date.now();
const now = () => (Date.now() - T0) / 1000;
const timeline = [];
const wait = (ms) => page.waitForTimeout(ms);
const cap = (html) => page.evaluate((h) => window.__cap?.(h), html ?? null);
const moveTo = (x, y, steps = 22) => page.mouse.move(x, y, { steps });
async function click(locator, { scroll = true } = {}) {
  if (scroll) await locator.scrollIntoViewIfNeeded();
  const b = await locator.boundingBox();
  await moveTo(b.x + b.width / 2, b.y + b.height / 2);
  await wait(250);
  await page.evaluate(() => window.__pvClick?.());
  await locator.click();
}
async function hover(locator, ms = 900) { const b = await locator.boundingBox(); if (b) await moveTo(b.x + b.width / 2, b.y + b.height / 2); await wait(ms); }
async function type(locator, text, delay = 30) { await click(locator); await locator.pressSequentially(text, { delay }); }
async function settle(ms = 600) { await page.waitForLoadState('networkidle').catch(() => {}); await wait(ms); }
async function scroll(total, step = 100, delay = 70) { for (let i = 0; i < Math.abs(Math.round(total / step)); i++) { await page.mouse.wheel(0, Math.sign(total) * step); await wait(delay); } }
const nav = (name) => page.getByRole('navigation').getByRole('link', { name, exact: true }).first();
async function scene(id, actions) {
  const t = now();
  timeline.push({ id, t });
  if (BY_ID[id].cap) await cap(BY_ID[id].cap);
  if (actions) await actions();
  const left = DUR[id] + 0.5 - (now() - t);
  if (left > 0) await wait(left * 1000);
}
async function cardScene(id, html) {
  await cap(null);
  await page.evaluate((h) => window.__card(h), html);
  await wait(600);
  await scene(id);
  await page.evaluate(() => window.__card(null));
  await wait(800);
}
async function login(who) {
  await type(page.getByLabel('Endereço de e-mail'), USERS[who][0], 25);
  await type(page.getByLabel('Palavra-passe'), USERS[who][1], 25);
  await click(page.getByRole('button', { name: 'Iniciar sessão' }));
  await page.waitForURL(/dashboard|admin/);
  await settle(500);
}
/** Back office: upload one document of the act through the dialog. */
async function addDoc(d, roleLabel, { submit = true } = {}) {
  await click(page.getByRole('button', { name: 'Adicionar documento' }));
  const dlg = page.getByRole('dialog', { name: 'Adicionar documento' });
  await dlg.waitFor();
  await wait(400);
  await click(dlg.getByLabel(roleLabel));
  await type(dlg.getByLabel('Diploma'), d.diploma, 18);
  if (d.publication) await type(dlg.getByLabel('Publicação'), d.publication, 12);
  if (d.published_on) { await click(dlg.getByLabel('Data de publicação')); await dlg.getByLabel('Data de publicação').fill(d.published_on); }
  if (d.effect) await type(dlg.getByLabel('O que altera'), d.effect, 10);
  await dlg.locator('input[type=file]').setInputFiles(filePath(d));
  await wait(600);
  if (!submit) return dlg;
  await click(dlg.getByRole('button', { name: 'Carregar' }));
  await page.getByText('Documento adicionado.').first().waitFor({ timeout: 60_000 });
  await settle(400);
  return dlg;
}
const doc = (role, year) => DOCS.find((d) => d.role === role && (!year || d.published_on?.startsWith(year)));

// =========================================================== intro
await page.goto(`${BASE}/login`);
await page.evaluate(() => localStorage.setItem('cl.lang', 'pt'));
await page.goto(`${BASE}/login`);
await settle(300);
await page.evaluate(() => window.__card('<div class="num" style="font-size:72px">Acasalamento</div><h1>de documentos</h1><p>Original + alterações → versão revista</p>'));
await wait(1000);
await scene('intro');
await page.evaluate(() => window.__card(`<h1 style="font-size:46px">Código das Execuções Fiscais</h1>
  <p style="margin-bottom:28px">Decreto n.º 38.088, de 1950 — e as leis que o alteraram</p>
  <div style="display:flex;gap:14px;align-items:center;font:600 24px 'Segoe UI'">
    <span style="background:#fcd116;color:#141414;padding:10px 18px;border-radius:12px">1950 · Original</span><span>→</span>
    <span style="background:#16955a;padding:10px 18px;border-radius:12px">1951</span><span>→</span>
    <span style="background:#16955a;padding:10px 18px;border-radius:12px">1966</span><span>→</span>
    <span style="background:#16955a;padding:10px 18px;border-radius:12px">2013</span><span>=</span>
    <span style="background:#fff;color:#07472a;padding:10px 18px;border-radius:12px">Texto em vigor</span></div>`));
await wait(500);
await scene('problem');
await page.evaluate(() => window.__card(null)); await wait(800);

// =========================================================== back office: build the chain
await scene('bo', async () => {
  await login('super');
  await click(nav('Legislação')); await settle(800);
});
await scene('new-act', async () => {
  await click(page.getByRole('button', { name: 'Novo diploma' })); await wait(400);
  await type(page.getByLabel('Título'), ACT.title, 25);
  await type(page.getByLabel('Referência'), ACT.reference, 40);
  await type(page.getByLabel('Área'), ACT.area, 40);
  await page.getByLabel('Tipo').selectOption(ACT.kind);
  await type(page.getByLabel('Número'), ACT.number, 50);
  await click(page.getByLabel('Data', { exact: true })); await page.getByLabel('Data', { exact: true }).fill(ACT.act_date);
  await wait(500);
  await click(page.getByRole('button', { name: 'Criar' }));
  await page.waitForURL(/admin\/legislation\/[0-9a-f-]{36}/); await settle(600);
});
const actUrl = page.url();
await scene('original', async () => { await addDoc(doc('original'), 'Original'); });
await scene('alt-2013', async () => { await addDoc(doc('alteracao', '2013'), 'Alteração'); });
await scene('alt-1966', async () => { await addDoc(doc('alteracao', '1966'), 'Alteração'); });
await scene('alt-1951', async () => { await addDoc(doc('alteracao', '1951'), 'Alteração'); });
await scene('order', async () => {
  const chain = page.getByRole('list', { name: 'Cadeia do diploma' });
  await chain.scrollIntoViewIfNeeded();
  for (let i = 0; i < 4; i++) { await hover(chain.getByRole('listitem').nth(i), 1700); await scroll(160, 80, 60); }
});
await scene('guard', async () => {
  await scroll(-2000, 250, 30);
  const dlg = await addDoc({ diploma: 'Decreto de teste', published_on: '1940-01-01', file: DOCS[1].file }, 'Alteração', { submit: false });
  await click(dlg.getByRole('button', { name: 'Carregar' }));
  await dlg.getByText('não pode ter data anterior').waitFor({ timeout: 60_000 });
  await wait(2200);
  await click(dlg.getByRole('button', { name: 'Cancelar' }));
});
await scene('revised', async () => { await addDoc(doc('revisto'), 'Versão revista'); });
await scene('pairing', async () => {
  await scroll(-2000, 250, 30);
  await hover(page.getByRole('region', { name: 'Original, alterações e versão revista' }), 2500);
  await scroll(900, 90, 90); await wait(1500); await scroll(-900, 150, 40);
});

// =========================================================== client side
await cardScene('ch-client', '<div class="num">Cliente</div><h1>Front office</h1><p>A mesma cadeia, em modo de leitura.</p>');
await page.getByRole('button', { name: /Super Admin/ }).click();
await page.getByRole('menuitem', { name: 'Terminar sessão' }).click();
await page.waitForURL(/login/); await settle(300);
await scene('client-list', async () => {
  await login('admin');
  await click(nav('Legislação')); await settle(800);
  await hover(page.getByRole('link', { name: new RegExp(ACT.title) }), 1500);
});
await scene('client-detail', async () => {
  await click(page.getByRole('link', { name: new RegExp(ACT.title) })); await settle(800);
  await scroll(700, 90, 90); await wait(1200);
  await hover(page.getByRole('button', { name: 'Abrir PDF' }).last(), 1800);
  await scroll(-700, 150, 40);
});

// =========================================================== phone
const actId = actUrl.split('/').pop();
const PHONE = `<!doctype html><html><head><meta charset="utf-8"><title>Checklist Legal</title><style>
  html,body{margin:0;height:100%;overflow:hidden;font-family:'Segoe UI',Arial,sans-serif}
  body{background:linear-gradient(90deg,#052f1c 0%,#052f1cf0 45%,#07472acc 100%),url(data:image/png;base64,${TILE}) 0 0/96px 96px #07472a;display:flex;align-items:center;gap:90px;padding-left:170px}
  .phone{width:410px;height:864px;border-radius:56px;background:#141414;padding:10px;box-sizing:border-box;box-shadow:0 20px 50px rgba(0,0,0,.45);flex:none}
  iframe{width:390px;height:844px;border:0;border-radius:46px;background:#fbf8f2;display:block}
  .txt{color:#fff;max-width:640px} .txt small{color:#fcd116;letter-spacing:.3em;font-weight:700;font-size:15px}
  .txt h2{font-size:46px;margin:14px 0 18px;line-height:1.15} .txt p{font-size:24px;line-height:1.5;color:#d2eedd;margin:0}
  </style></head><body><div class="phone"><iframe id="app" src="${BASE}/legislation/${actId}"></iframe></div>
  <div class="txt"><small>TELEMÓVEL</small><h2>Acasalamento no telemóvel</h2><p>Original, alterações e versão revista, de cima para baixo.</p></div></body></html>`;
await page.route(`${BASE}/__phone`, (r) => r.fulfill({ contentType: 'text/html; charset=utf-8', body: PHONE }));
await page.goto(`${BASE}/__phone`);
await page.frameLocator('#app').getByText(ACT.title).first().waitFor();
await wait(800);
await scene('phone', async () => {
  await page.mouse.move(375, 520);
  for (let i = 0; i < 30; i++) { await page.mouse.wheel(0, 90); await wait(140); }
});
await page.unroute(`${BASE}/__phone`);

// =========================================================== outro
await page.evaluate(() => window.__card('<h1>Checklist Legal</h1><p>O original, as alterações e o texto em vigor, lado a lado.</p>'));
await wait(800);
await scene('outro');
await wait(1500);

const video = page.video();
await ctx.close();
await browser.close();
const out = `${OUT}/Checklist-Legal-Acasalamento.webm`;
rmSync(out, { force: true });
renameSync(await video.path(), out);
rmSync(TMP, { recursive: true, force: true });
writeFileSync(`${NARR}/timeline.json`, JSON.stringify(timeline, null, 1));
console.log('video:', out, '~', now().toFixed(1), 's');
