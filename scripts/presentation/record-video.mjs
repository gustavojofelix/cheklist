// Records the full walkthrough video of Checklist Legal (desktop front office, phone, back office),
// timed to the pt-BR narration made by narration.mjs. mux-video.mjs then adds the voice-over.
// Read-only: it opens screens and dialogs, types without sending, and closes every dialog with Escape.
//   node scripts/presentation/record-video.mjs   (dev server on http://localhost:4200, DEV seed users)
import { chromium } from '@playwright/test';
import { existsSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { SCENES } from './scenes.mjs';

const BASE = process.env.BASE_URL ?? 'http://localhost:4200';
const OUT = 'docs/presentation';
const TMP = `${OUT}/.video-tmp`;
const W = 1600, H = 900;
const USERS = {
  admin: ['demo@checklist.test', 'Checklist#Demo2026'],
  super: ['superadmin@checklist.test', 'Checklist#Admin2026'],
};
const LOGO = readFileSync('docs/presentation/assets/logo.png').toString('base64');
const TILE = readFileSync('docs/presentation/assets/tile.png').toString('base64');

// ----------------------------------------------------------- overlay layer (captions, cards, cursor)
const OVERLAY = `(() => {
  if (window.top !== window) return;
  const LOGO = 'data:image/png;base64,${LOGO}';
  const TILE = 'data:image/png;base64,${TILE}';
  const css = \`
    #pv-cap{position:fixed;left:50%;bottom:28px;transform:translateX(-50%) translateY(20px);opacity:0;z-index:2147483646;
      max-width:1100px;padding:14px 26px 14px 22px;border-radius:14px;background:rgba(5,47,28,.94);color:#fff;
      font:500 22px/1.35 'Segoe UI',Arial,sans-serif;box-shadow:0 10px 30px rgba(0,0,0,.25);border-left:6px solid #fcd116;
      transition:opacity .35s, transform .35s;pointer-events:none}
    #pv-cap.on{opacity:1;transform:translateX(-50%) translateY(0)}
    #pv-cap b{color:#fcd116;font-weight:700}
    #pv-card{position:fixed;inset:0;z-index:2147483647;display:flex;align-items:center;opacity:0;transition:opacity .6s;pointer-events:none;
      background:linear-gradient(90deg,#052f1c 0%,#052f1cf0 50%,#07472acc 100%),url(\${TILE}) 0 0/96px 96px #07472a;
      font-family:'Segoe UI',Arial,sans-serif;color:#fff}
    #pv-card.on{opacity:1}
    #pv-card .in{padding:0 120px;max-width:1150px}
    #pv-card .brand{display:flex;align-items:center;gap:16px;margin-bottom:56px}
    #pv-card .brand img{width:64px;height:64px}
    #pv-card .brand b{display:block;font-size:28px}
    #pv-card .brand small{display:block;color:#fcd116;letter-spacing:.3em;font-size:13px;font-weight:700}
    #pv-card .num{color:#fcd116;font-size:96px;font-weight:800;line-height:1}
    #pv-card h1{font-size:60px;line-height:1.1;margin:12px 0 22px;font-weight:700}
    #pv-card p{font-size:26px;line-height:1.45;color:#d2eedd;margin:0}
    #pv-card .stripe{position:absolute;left:0;right:0;top:0;height:8px;background:linear-gradient(90deg,#c0102b 0 14%,#fff 14% 15%,#0d7744 15% 46%,#fff 46% 47%,#141414 47% 72%,#fff 72% 73%,#fcd116 73% 100%)}
    #pv-cursor{position:fixed;left:0;top:0;width:22px;height:22px;margin:-3px 0 0 -3px;z-index:2147483645;pointer-events:none;transition:transform .08s}
    #pv-cursor.down{transform:scale(.8)}
    #pv-ring{position:fixed;width:44px;height:44px;margin:-22px 0 0 -22px;border-radius:50%;border:3px solid #fcd116;z-index:2147483644;pointer-events:none;opacity:0}
    #pv-ring.go{animation:pvr .5s ease-out}
    @keyframes pvr{from{opacity:1;transform:scale(.4)}to{opacity:0;transform:scale(1.3)}}\`;
  const boot = () => {
    if (document.getElementById('pv-cap')) return;
    const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
    const cap = document.createElement('div'); cap.id = 'pv-cap'; document.body.appendChild(cap);
    const card = document.createElement('div'); card.id = 'pv-card'; document.body.appendChild(card);
    const cur = document.createElement('div'); cur.id = 'pv-cursor';
    cur.innerHTML = '<svg width="22" height="22" viewBox="0 0 22 22"><path d="M3 2l14 8-6 1.6L8 18z" fill="#141414" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg>';
    document.body.appendChild(cur);
    const ring = document.createElement('div'); ring.id = 'pv-ring'; document.body.appendChild(ring);
    const pos = window.__pvPos || [${W / 2}, ${H / 2}];
    cur.style.left = pos[0] + 'px'; cur.style.top = pos[1] + 'px';
    window.__pvMove = (x, y) => { window.__pvPos = [x, y]; cur.style.left = x + 'px'; cur.style.top = y + 'px'; };
    window.__pvClick = () => { cur.classList.add('down'); ring.style.left = cur.style.left; ring.style.top = cur.style.top;
      ring.classList.remove('go'); void ring.offsetWidth; ring.classList.add('go'); setTimeout(() => cur.classList.remove('down'), 160); };
    window.__cap = (html) => { if (!html) { cap.classList.remove('on'); return; } cap.innerHTML = html; cap.classList.add('on'); };
    window.__card = (html) => { if (!html) { card.classList.remove('on'); return; }
      card.innerHTML = '<div class="stripe"></div><div class="in"><div class="brand"><img src="' + LOGO + '"><span><b>Checklist Legal</b><small>MOÇAMBIQUE</small></span></div>' + html + '</div>';
      card.classList.add('on'); };
    document.addEventListener('mousemove', (e) => window.__pvMove(e.clientX, e.clientY), true);
  };
  if (document.body) boot(); else document.addEventListener('DOMContentLoaded', boot);
})();`;

// ----------------------------------------------------------- narration timing
// Each scene lasts at least as long as its narration clip (docs/presentation/.narration/<id>.mp3,
// made by narration.mjs). The start time of every scene is written to timeline.json for mux-video.mjs.
const BY_ID = Object.fromEntries(SCENES.map((s) => [s.id, s]));
const NARR = `${OUT}/.narration`;
const DUR = {};
{
  const b = await chromium.launch({ channel: 'msedge' });
  const p = await b.newPage();
  await p.route('http://narration.local/**', (r) => r.fulfill({ contentType: 'audio/mpeg', body: readFileSync(`${NARR}/${r.request().url().split('/').pop()}`) }));
  await p.route('http://narration.local/', (r) => r.fulfill({ contentType: 'text/html', body: '<!doctype html><title>n</title>' }));
  await p.goto('http://narration.local/');
  for (const s of SCENES) {
    if (!existsSync(`${NARR}/${s.id}.mp3`)) throw new Error(`missing narration ${s.id}: run narration.mjs`);
    DUR[s.id] = await p.evaluate(async (u) => {
      const buf = await (await fetch(u)).arrayBuffer();
      return (await new OfflineAudioContext(1, 1, 24000).decodeAudioData(buf)).duration;
    }, `http://narration.local/${s.id}.mp3`);
  }
  await b.close();
  console.log('narration total', Object.values(DUR).reduce((a, b) => a + b, 0).toFixed(1), 's');
}

// ----------------------------------------------------------- helpers
const browser = await chromium.launch({ channel: 'msedge' });
const ctx = await browser.newContext({
  viewport: { width: W, height: H }, deviceScaleFactor: 1, locale: 'pt-PT',
  recordVideo: { dir: TMP, size: { width: W, height: H } },
});
await ctx.addInitScript(OVERLAY);
const page = await ctx.newPage();
const T0 = Date.now();                                   // the recording starts with the page
const now = () => (Date.now() - T0) / 1000;
const timeline = [];
const wait = (ms) => page.waitForTimeout(ms);

async function cap(html) { await page.evaluate((h) => window.__cap?.(h), html ?? null); }
async function moveTo(x, y, steps = 25) { await page.mouse.move(x, y, { steps }); }
/** Glide the cursor to an element, then click it (works inside the phone iframe too). */
async function click(locator, { pause = 350, scroll = true } = {}) {
  if (scroll) await locator.scrollIntoViewIfNeeded();
  const b = await locator.boundingBox();
  await moveTo(b.x + b.width / 2, b.y + b.height / 2);
  await wait(pause);
  await page.evaluate(() => window.__pvClick?.());
  await locator.click();
}
async function hover(locator, ms = 900) {
  const b = await locator.boundingBox();
  if (b) await moveTo(b.x + b.width / 2, b.y + b.height / 2);
  await wait(ms);
}
async function scroll(total, step = 120, delay = 60) {
  const n = Math.abs(Math.round(total / step));
  for (let i = 0; i < n; i++) { await page.mouse.wheel(0, Math.sign(total) * step); await wait(delay); }
}
async function typeSlow(locator, text) { await click(locator); await locator.pressSequentially(text, { delay: 55 }); }
async function settle(ms = 800) { await page.waitForLoadState('networkidle').catch(() => {}); await wait(ms); }
const nav = (name) => page.getByRole('navigation').getByRole('link', { name, exact: true }).first();

/** Runs a scene: shows its caption, plays its actions, and holds until its narration has finished. */
async function scene(id, actions) {
  const s = BY_ID[id];
  const t = now();
  timeline.push({ id, t });
  if (s.cap) await cap(s.cap);
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

// =========================================================== 0. intro
await page.goto(`${BASE}/login`);
await page.evaluate(() => localStorage.setItem('cl.lang', 'pt'));
await page.goto(`${BASE}/login`);
await settle(300);
await page.evaluate(() => window.__card('<h1>Conformidade legal das empresas, num só lugar</h1><p>Apresentação completa da plataforma: front office, telemóvel e back office.</p>'));
await wait(1200);
await scene('intro');
await wait(600);
await page.evaluate(() => window.__card(null)); await wait(800);

// =========================================================== 1. front office (desktop)
await cardScene('ch1', '<div class="num">01</div><h1>Front office</h1><p>O dia-a-dia das empresas e dos consultores.</p>');

await scene('login', async () => {
  await wait(800);
  await typeSlow(page.getByLabel('Endereço de e-mail'), USERS.admin[0]);
  await typeSlow(page.getByLabel('Palavra-passe'), USERS.admin[1]);
  await click(page.getByRole('button', { name: 'Iniciar sessão' }));
  await page.waitForURL(/dashboard/);
  await settle(600);
});
await scene('dash', async () => {
  await hover(page.getByText('Total de itens').first(), 1800);
  await hover(page.getByText('Em conformidade').first(), 1800);
  await hover(page.getByText('Prestes a expirar').first(), 1800);
  await hover(page.getByText('Expirado').first(), 1500);
});
await scene('dash2', async () => {
  await moveTo(700, 600); await wait(1500);
  await scroll(500); await wait(3500); await scroll(-500);
});
await scene('company', async () => {
  await click(nav('Empresa')); await settle(1500);
  await scroll(400); await wait(1500); await scroll(-400);
});
await scene('users', async () => { await click(page.getByRole('tab', { name: /Utilizadores/ }).first()); await settle(1500); });
await scene('notif', async () => { await click(page.getByRole('tab', { name: /Notificações/ }).first()); await settle(1500); });
await scene('entities', async () => { await click(nav('Entidades')); await settle(1500); });
await scene('ficha', async () => {
  await click(page.getByRole('link', { name: 'Abrir ficha da entidade' }).first());
  await page.waitForURL(/ficha/); await settle(1500);
  await hover(page.getByRole('row').filter({ hasText: 'LEG-04' }).first(), 1500);
});
await scene('ficha2', async () => {
  await scroll(1300, 100, 90); await wait(1800);
  await scroll(1300, 100, 90); await wait(1800);
  await scroll(-2600, 200, 40);
});
await scene('filters', async () => {
  await typeSlow(page.getByPlaceholder(/Pesquisar/), 'licença'); await wait(1600);
  await page.getByPlaceholder(/Pesquisar/).fill('');
});
await scene('edit', async () => {
  await click(page.getByRole('button', { name: 'Editar checklist' })); await wait(4500);
  const done = page.getByRole('button', { name: 'Concluído' });
  if (await done.count()) await click(done);
});
await scene('doc', async () => {
  await click(page.getByRole('button', { name: 'Adicionar documento' }).first()); await wait(6500);
  await page.keyboard.press('Escape');
});
await scene('reports', async () => { await click(nav('Relatórios')); await settle(1200); });
await scene('reports2', async () => {
  await click(page.getByRole('link', { name: /Gerar relatório/ }).first());
  await page.waitForURL(/reports\//); await settle(900);
  await click(page.locator('label', { hasText: 'Seleccionar todos os itens' }).locator('input')); await wait(1500);
  await scroll(500); await wait(1200); await scroll(-500);
});
await scene('audit', async () => { await click(nav('Registos')); await settle(1500); await scroll(400); await wait(1500); await scroll(-400); });
await scene('recycle', async () => { await click(nav('Documentos Apagados')); await settle(1000); });
await scene('ai', async () => {
  await click(nav('Assistente de IA')); await settle(800);
  const ask = page.getByRole('textbox').last();
  await typeSlow(ask, 'Que documentos expiram nos próximos 90 dias?'); await wait(2500);
  await ask.fill('');
});
await scene('billing', async () => { await click(nav('Subscrições')); await settle(1200); await scroll(400); await wait(1200); });
await scene('checkout', async () => {
  await click(page.getByRole('button', { name: 'Escolher plano' }).nth(1)); await wait(5500);
  await page.keyboard.press('Escape'); await wait(300);
  await scroll(-400);
});
await scene('lang', async () => {
  await click(page.getByRole('button', { name: /Idioma/ }));
  await click(page.getByRole('menuitem', { name: 'English' })); await wait(2000);
  await click(page.getByRole('button', { name: /Language/ }));
  await click(page.getByRole('menuitem', { name: 'Português' }));
});

// =========================================================== 2. phone (same app inside a phone frame)
await cardScene('ch2', '<div class="num">02</div><h1>No telemóvel</h1><p>A mesma plataforma, desenhada para o ecrã pequeno.</p>');
const PHONE = `<!doctype html><html><head><meta charset="utf-8"><title>Checklist Legal</title><style>
  html,body{margin:0;height:100%;overflow:hidden;font-family:'Segoe UI',Arial,sans-serif}
  body{background:linear-gradient(90deg,#052f1c 0%,#052f1cf0 45%,#07472acc 100%),url(data:image/png;base64,${TILE}) 0 0/96px 96px #07472a;display:flex;align-items:center;gap:90px;padding-left:170px}
  .phone{width:410px;height:864px;border-radius:56px;background:#141414;padding:10px;box-sizing:border-box;box-shadow:0 20px 50px rgba(0,0,0,.45);flex:none}
  iframe{width:390px;height:844px;border:0;border-radius:46px;background:#fbf8f2;display:block}
  .txt{color:#fff;max-width:640px} .txt small{color:#fcd116;letter-spacing:.3em;font-weight:700;font-size:15px}
  .txt h2{font-size:46px;margin:14px 0 18px;line-height:1.15} .txt p{font-size:24px;line-height:1.5;color:#d2eedd;margin:0}
  </style></head><body><div class="phone"><iframe id="app" src="${BASE}/dashboard"></iframe></div>
  <div class="txt"><small>TELEMÓVEL</small><h2 id="h">Painel</h2><p id="p"></p></div></body></html>`;
await page.route(`${BASE}/__phone`, (r) => r.fulfill({ contentType: 'text/html; charset=utf-8', body: PHONE }));
await page.goto(`${BASE}/__phone`);
const app = page.frameLocator('#app');
await app.getByText('Total de itens').first().waitFor();
await wait(1500);
const side = async (h, p) => { await page.evaluate(([a, b]) => { document.getElementById('h').textContent = a; document.getElementById('p').textContent = b; }, [h, p]); };
// phone taps: no scrolling by the recorder, and undo any sideways scroll the drawer animation may cause
const appFrame = () => page.frames().find((f) => f !== page.mainFrame());
const unshift = () => appFrame().evaluate(() => document.querySelectorAll('*').forEach((e) => { if (e.scrollLeft) e.scrollLeft = 0; }));
const tap = async (locator, ms) => { await click(locator, { scroll: false }); await wait(ms); await unshift(); };
const menuTo = async (name, ms) => { await tap(app.getByRole('button', { name: 'Abrir menu' }), 900); await tap(app.getByRole('link', { name }), ms); };
const swipe = async (n, dy, ms = 110) => { await page.mouse.move(375, 520); for (let i = 0; i < n; i++) { await page.mouse.wheel(0, dy); await wait(ms); } };

await scene('m-dash', async () => {
  await side('Painel', 'Os indicadores em grelha e o estado de conformidade, à medida do polegar.'); await wait(1500);
  await swipe(6, 120, 90); await wait(1500); await swipe(6, -120, 40);
});
await scene('m-menu', async () => { await side('Menu', 'Toda a navegação numa gaveta lateral.'); await tap(app.getByRole('button', { name: 'Abrir menu' }), 1200); });
await scene('m-entities', async () => {
  await side('Entidades', 'A sede e as sucursais, cada uma com a sua ficha.');
  await tap(app.getByRole('link', { name: 'Entidades' }), 1600);
  await tap(app.getByRole('link', { name: 'Abrir ficha da entidade' }).first(), 1600);
});
await scene('m-cards', async () => {
  await side('Ficha em cartões', 'Cada obrigação é um cartão com a borda na cor do estado. Toque no descritivo para editar.');
  await swipe(26, 110);
});
await scene('m-doc', async () => {
  await side('Anexar documento', 'O botão verde está sempre à mão: fotografe a certidão e ligue-a às obrigações.');
  await tap(app.getByRole('button', { name: 'Adicionar documento' }).last(), 4200);
  await app.locator('body').press('Escape'); await wait(300);
});
await scene('m-ai', async () => { await side('Assistente de IA', 'Perguntas sobre a conformidade, também no telemóvel.'); await menuTo('Assistente de IA', 1400); });
await scene('m-billing', async () => { await side('Subscrição', 'Plano, limites e pagamento.'); await menuTo('Subscrições', 1400); });
await scene('m-audit', async () => { await side('Registos', 'O histórico completo em qualquer lugar.'); await menuTo('Registos', 1800); });
await page.unroute(`${BASE}/__phone`);

// =========================================================== 3. back office
await page.goto(`${BASE}/dashboard`); await settle(400);
await cardScene('ch3', '<div class="num">03</div><h1>Back office</h1><p>A consola da equipa da plataforma.</p>');
await scene('bo-login', async () => {
  await page.getByRole('button', { name: /Ana Demo/ }).click();
  await page.getByRole('menuitem', { name: 'Terminar sessão' }).click();
  await page.waitForURL(/login/); await settle(300);
  await typeSlow(page.getByLabel('Endereço de e-mail'), USERS.super[0]);
  await typeSlow(page.getByLabel('Palavra-passe'), USERS.super[1]);
  await click(page.getByRole('button', { name: 'Iniciar sessão' }));
  await page.waitForURL(/dashboard|admin/); await settle(400);
});
await scene('orgs', async () => { await click(nav('Organizações')); await settle(1500); });
await scene('templates', async () => { await click(nav('Modelos de checklist')); await settle(1200); });
await scene('versions', async () => {
  await click(page.getByRole('link', { name: 'Abrir' }).first()); await page.waitForURL(/templates\//); await settle(1500);
  await hover(page.getByRole('button', { name: /Publicar versão/ }), 1500);
});
await scene('plans', async () => { await click(nav('Planos')); await settle(1200); await scroll(500); await wait(1200); await scroll(-500); });
await scene('vouchers', async () => { await click(nav('Vouchers')); await settle(1000); });
await scene('payments', async () => { await click(nav('Pagamentos')); await settle(1000); });
await scene('staff', async () => { await click(nav('Equipa da plataforma')); await settle(1000); });
await scene('settings', async () => { await click(nav('Definições')); await settle(1000); });
await scene('emails', async () => { await click(nav('E-mails')); await settle(800); });
await scene('bo-audit', async () => { await click(nav('Registos')); await settle(1000); });
await cap(null);

// =========================================================== outro
await page.evaluate(() => window.__card('<h1>Checklist Legal</h1><p>Conformidade legal feita em Moçambique, para empresas moçambicanas.<br><br>Segura · Bilingue · No computador e no telemóvel</p>'));
await wait(800);
await scene('outro');
await wait(1500);

const video = page.video();
await ctx.close();
await browser.close();
const out = `${OUT}/Checklist-Legal-Video.webm`;
rmSync(out, { force: true });
renameSync(await video.path(), out);
rmSync(TMP, { recursive: true, force: true });
writeFileSync(`${OUT}/.narration/timeline.json`, JSON.stringify(timeline, null, 1));
console.log('video:', out, 'length ~', now().toFixed(1), 's');
