// Overlay injected into recorded pages: captions, chapter cards, a visible cursor and click ripples.
import { readFileSync } from 'node:fs';

export function overlayScript(W, H) {
  const LOGO = readFileSync('docs/presentation/assets/logo.png').toString('base64');
  const TILE = readFileSync('docs/presentation/assets/tile.png').toString('base64');
  return `(() => {
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
}
