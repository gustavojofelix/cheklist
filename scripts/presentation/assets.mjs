// Renders the presentation's graphic assets (logo, capulana backgrounds, framed screenshots)
// from HTML with Playwright, so the deck uses exactly the platform's own visual language.
//   node scripts/presentation/assets.mjs
import { chromium } from '@playwright/test';
import { mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const SCREENS = 'docs/presentation/screens';
const OUT = 'docs/presentation/assets';
mkdirSync(`${OUT}/framed`, { recursive: true });

const LOGO = `<svg viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg">
  <rect width="40" height="40" rx="10" fill="#0d7744"/>
  <path d="M0 30 L10 40 H0 Z" fill="#c0102b"/><path d="M40 30 L30 40 H40 Z" fill="#c0102b"/>
  <path d="M20 5 L35 20 L20 35 L5 20 Z" fill="#fcd116"/><path d="M20 10 L30 20 L20 30 L10 20 Z" fill="#141414"/>
  <path d="M15.5 20.5 L19 24 L25 16.5" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

const TILE = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='72' height='72' viewBox='0 0 72 72'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cpath fill='%23fcd116' d='M36 6l12 12-12 12-12-12z'/%3E%3Cpath fill='%23141414' d='M36 12l6 6-6 6-6-6z'/%3E%3Cpath fill='%23c0102b' d='M0 42h18L9 54zM54 42h18l-9 12zM18 66h36l-18-12z'/%3E%3Cpath fill='%2316955a' d='M0 0h12L0 12zM72 0H60l12 12zM0 72h12L0 60zM72 72H60l12-12z'/%3E%3Ccircle cx='36' cy='42' r='3' fill='%23fff'/%3E%3Ccircle cx='9' cy='24' r='2.5' fill='%23fff' opacity='.8'/%3E%3Ccircle cx='63' cy='24' r='2.5' fill='%23fff' opacity='.8'/%3E%3Cpath stroke='%23fcd116' stroke-width='1.5' d='M0 36h72' stroke-dasharray='4 4' opacity='.6'/%3E%3C/g%3E%3C/svg%3E")`;
const BAND = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='20' height='10'%3E%3Cpath fill='%230d7744' d='M0 0h20v10H0z'/%3E%3Cpath fill='%23fcd116' d='M0 10L5 0l5 10z'/%3E%3Cpath fill='%23c0102b' d='M10 10l5-10 5 10z'/%3E%3Ccircle cx='10' cy='3' r='1.4' fill='%23141414'/%3E%3C/svg%3E")`;

const browser = await chromium.launch({ channel: 'msedge' });
let page = await browser.newPage({ deviceScaleFactor: 1 });

async function render(name, w, h, html, transparent = false) {
  await page.setViewportSize({ width: w, height: h });
  await page.setContent(`<!doctype html><html><head><style>
    *{box-sizing:border-box;margin:0} html,body{width:${w}px;height:${h}px;${transparent ? 'background:transparent' : ''}}
    body{font-family:'Segoe UI',Arial,sans-serif}
    .tile{background-color:#07472a;background-image:${TILE};background-size:96px 96px}
    .band{background-image:${BAND};background-size:80px 40px}</style></head><body>${html}</body></html>`);
  await page.waitForLoadState('networkidle');
  await page.screenshot({ path: `${OUT}/${name}.png`, omitBackground: transparent });
  console.log(name);
}

// logo (transparent, high resolution)
await render('logo', 512, 512, `<div style="width:512px;height:512px">${LOGO.replace('<svg ', '<svg width="512" height="512" ')}</div>`, true);

// full-bleed capulana background, faded towards the left so text stays readable
await render('bg-cover', 1920, 1080, `
  <div class="tile" style="position:absolute;inset:0"></div>
  <div style="position:absolute;inset:0;background:linear-gradient(90deg,#052f1c 0%,#052f1cf2 42%,#07472acc 62%,#07472a55 100%)"></div>`);
// darker, uniform variant for section dividers
await render('bg-divider', 1920, 1080, `
  <div class="tile" style="position:absolute;inset:0"></div>
  <div style="position:absolute;inset:0;background:linear-gradient(90deg,#052f1c 0%,#052f1ce6 55%,#052f1c99 100%)"></div>`);
// thin capulana band and flag stripe
await render('band', 3840, 40, `<div class="band" style="width:100%;height:100%"></div>`);
await render('stripe', 3840, 24, `<div style="width:100%;height:100%;background:linear-gradient(90deg,#c0102b 0 14%,#fff 14% 15%,#0d7744 15% 46%,#fff 46% 47%,#141414 47% 72%,#fff 72% 73%,#fcd116 73% 100%)"></div>`);
// a square capulana tile for panels
await render('tile', 960, 960, `<div class="tile" style="width:100%;height:100%"></div>`);

// desktop screenshots in a browser window frame
const uri = (f) => `data:image/png;base64,${readFileSync(f).toString('base64')}`;
for (const f of readdirSync(`${SCREENS}/desktop`)) {
  const W = 1440, H = 900;
  await render(`framed/d-${f.replace('.png', '')}`, W + 48, H + 92, `
    <div style="padding:20px 24px 28px">
      <div style="border-radius:14px;overflow:hidden;box-shadow:0 14px 30px rgba(5,47,28,.28);border:1px solid #d9cfba">
        <div style="height:44px;background:#f4eee2;display:flex;align-items:center;gap:8px;padding:0 16px;border-bottom:1px solid #e9dfcc">
          <span style="width:12px;height:12px;border-radius:6px;background:#c0102b"></span>
          <span style="width:12px;height:12px;border-radius:6px;background:#fcd116"></span>
          <span style="width:12px;height:12px;border-radius:6px;background:#0d7744"></span>
          <span style="margin-left:18px;flex:0 0 420px;height:26px;border-radius:13px;background:#fff;color:#5b5b5b;font-size:13px;display:flex;align-items:center;padding:0 14px">checklists.legal.co.mz</span>
        </div>
        <img src="${uri(`${SCREENS}/desktop/${f}`)}" style="display:block;width:${W}px;height:${H}px">
      </div></div>`, true);
}

// phone screenshots in a phone frame (390x844 CSS px captured at 2x, so render at 2x too)
page = await browser.newPage({ deviceScaleFactor: 2 });
for (const f of readdirSync(`${SCREENS}/mobile`)) {
  await render(`framed/m-${f.replace('.png', '')}`, 460, 960, `
    <div style="padding:18px 23px">
      <div style="width:414px;height:924px;border-radius:60px;background:#141414;padding:12px;box-shadow:0 16px 30px rgba(5,47,28,.3)">
        <div style="width:390px;height:900px;border-radius:48px;overflow:hidden;background:#fbf8f2">
          <div style="height:56px;display:flex;align-items:center;justify-content:space-between;padding:6px 34px 0;font:600 15px 'Segoe UI',Arial;color:#141414">
            <span>9:41</span><span style="width:112px;height:32px;border-radius:16px;background:#141414"></span><span>5G ▮</span></div>
          <img src="${uri(`${SCREENS}/mobile/${f}`)}" style="display:block;width:390px;height:844px">
        </div></div></div>`, true);
}
await browser.close();
console.log('assets in', resolve(OUT));
