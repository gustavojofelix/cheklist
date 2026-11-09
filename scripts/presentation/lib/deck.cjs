// Shared look of the Checklist Legal decks: theme, slide layouts (CAPA, SECCAO, CONTEUDO) and slide helpers.
const path = require('node:path');
const pptxgen = require(process.env.PPTXGENJS || 'pptxgenjs');

const ROOT = path.resolve(__dirname, '../../..');
const A = (f) => path.join(ROOT, 'docs/presentation/assets', f);
const D = (n) => A(`framed/d-${n}.png`);   // framed desktop screen, 1488 x 992 (3:2)
const M = (n) => A(`framed/m-${n}.png`);   // framed phone screen, 920 x 1920

function createDeck(title) {
  const THEME = {
    name: 'Checklist Legal Moçambique',
    headFontFace: 'Calibri',
    bodyFontFace: 'Calibri',
    colors: {
      dk1: '141414', lt1: 'FFFFFF', dk2: '07472A', lt2: 'FBF8F2',
      accent1: '0D7744', accent2: 'FCD116', accent3: 'C0102B', accent4: '16955A', accent5: '8A6D00', accent6: '5B5B5B',
      hlink: '0D7744', folHlink: '095E36',
    },
  };

  const pres = new pptxgen();
  pres.layout = 'LAYOUT_WIDE';                       // 13.333 x 7.5 in
  pres.theme = { headFontFace: THEME.headFontFace, bodyFontFace: THEME.bodyFontFace };
  pres.title = title;
  pres.author = 'Checklist Legal';
  pres.company = 'Checklist Legal Moçambique';
  const C = pres.SchemeColor;
  const W = 13.333;

  // ------------------------------------------------------------------ layouts
  pres.defineSlideMaster({
    title: 'CAPA',
    background: { path: A('bg-cover.png') },
    objects: [
      { image: { x: 0, y: 0, w: W, h: 0.08, path: A('stripe.png') } },
      { image: { x: 0.8, y: 0.85, w: 0.75, h: 0.75, path: A('logo.png') } },
      { text: { text: 'Checklist Legal', options: { x: 1.7, y: 0.86, w: 5, h: 0.42, fontSize: 22, bold: true, color: C.background1, margin: 0 } } },
      { text: { text: 'MOÇAMBIQUE', options: { x: 1.7, y: 1.28, w: 5, h: 0.3, fontSize: 11, bold: true, charSpacing: 4, color: C.accent2, margin: 0 } } },
      { placeholder: { options: { name: 'title', type: 'title', x: 0.8, y: 2.35, w: 7.6, h: 2.0, fontSize: 44, bold: true, color: C.background1, valign: 'top', align: 'left', margin: 0 }, text: '' } },
      { placeholder: { options: { name: 'body', type: 'body', x: 0.8, y: 4.55, w: 7.0, h: 1.3, fontSize: 18, color: 'FFE46B', valign: 'top', margin: 0 }, text: '' } },
      { placeholder: { options: { name: 'meta', type: 'body', x: 0.8, y: 6.55, w: 7.0, h: 0.4, fontSize: 12, color: C.background1, margin: 0 }, text: '' } },
    ],
  });

  pres.defineSlideMaster({
    title: 'SECCAO',
    background: { path: A('bg-divider.png') },
    objects: [
      { image: { x: 0, y: 0, w: W, h: 0.08, path: A('stripe.png') } },
      { placeholder: { options: { name: 'num', type: 'body', x: 0.8, y: 1.9, w: 3, h: 1.3, fontSize: 80, bold: true, color: C.accent2, margin: 0 }, text: '' } },
      { placeholder: { options: { name: 'title', type: 'title', x: 0.8, y: 3.3, w: 9, h: 1.0, fontSize: 40, bold: true, color: C.background1, align: 'left', margin: 0 }, text: '' } },
      { placeholder: { options: { name: 'body', type: 'body', x: 0.8, y: 4.4, w: 7.5, h: 1.2, fontSize: 18, color: 'D2EEDD', valign: 'top', margin: 0 }, text: '' } },
      { image: { x: 0, y: 7.38, w: W, h: 0.12, path: A('band.png') } },
    ],
  });

  pres.defineSlideMaster({
    title: 'CONTEUDO',
    background: { color: 'FBF8F2' },
    objects: [
      { image: { x: 0, y: 0, w: W, h: 0.06, path: A('stripe.png') } },
      { placeholder: { options: { name: 'kicker', type: 'body', x: 0.6, y: 0.32, w: 10, h: 0.3, fontSize: 11, bold: true, charSpacing: 3, color: C.accent1, margin: 0 }, text: '' } },
      { placeholder: { options: { name: 'title', type: 'title', x: 0.6, y: 0.62, w: 12.1, h: 0.7, fontSize: 28, bold: true, color: C.text2, valign: 'top', align: 'left', margin: 0 }, text: '' } },
      { image: { x: 0.6, y: 6.98, w: 0.26, h: 0.26, path: A('logo.png') } },
      { text: { text: 'Checklist Legal · Moçambique', options: { x: 0.95, y: 6.97, w: 5, h: 0.28, fontSize: 10, color: C.accent6, margin: 0 } } },
      { image: { x: 0, y: 7.42, w: W, h: 0.08, path: A('band.png') } },
    ],
    slideNumber: { x: 12.2, y: 6.97, w: 0.55, h: 0.28, fontSize: 10, color: '5B5B5B', align: 'right' },
  });

  // ------------------------------------------------------------------ helpers
  let section = '';
  const cover = () => pres.addSlide({ masterName: 'CAPA', sectionTitle: section });
  function sec(title) { section = title; pres.addSection({ title }); }
  function content(kicker, title, notes) {
    const s = pres.addSlide({ masterName: 'CONTEUDO', sectionTitle: section });
    s.addText(kicker.toUpperCase(), { placeholder: 'kicker' });
    s.addText(title, { placeholder: 'title' });
    if (notes) s.addNotes(notes);
    return s;
  }
  function divider(num, title, body, notes) {
    const s = pres.addSlide({ masterName: 'SECCAO', sectionTitle: section });
    s.addText(num, { placeholder: 'num' });
    s.addText(title, { placeholder: 'title' });
    s.addText(body, { placeholder: 'body' });
    if (notes) s.addNotes(notes);
    return s;
  }
  /** Feature list: bold green heading + one line of description per item. */
  function points(s, items, x, y, w, h, size = 13) {
    const runs = [];
    items.forEach(([head, desc], i) => {
      runs.push({ text: head, options: { bold: true, color: C.accent1, fontSize: size + 2, breakLine: true } });
      runs.push({ text: desc, options: { color: C.text1, fontSize: size, breakLine: i < items.length - 1, paraSpaceAfter: 12 } });
    });
    s.addText(runs, { x, y, w, h, valign: 'top', margin: 0, isTextBox: true, objectName: 'points' });
  }
  function caption(s, text, x, y, w, sub) {
    const runs = [{ text, options: { bold: true, fontSize: 13, color: C.text2, breakLine: !!sub } }];
    if (sub) runs.push({ text: sub, options: { fontSize: 11, color: C.accent6 } });
    s.addText(runs, { x, y, w, h: sub ? 0.6 : 0.32, align: 'center', valign: 'top', margin: 0, isTextBox: true });
  }
  /** One large desktop screen on the right, a feature list on the left. */
  function screen(kicker, title, shot, items, notes) {
    const s = content(kicker, title, notes);
    points(s, items, 0.6, 1.65, 3.85, 5.1);
    s.addImage({ path: D(shot), x: 4.7, y: 1.4, w: 8.2, h: 5.467, altText: title, objectName: 'screen' });
    return s;
  }
  function twoScreens(kicker, title, shots, notes) {
    const s = content(kicker, title, notes);
    shots.forEach(([shot, cap, sub], i) => {
      const x = 0.45 + i * 6.25;
      s.addImage({ path: D(shot), x, y: 1.5, w: 6.2, h: 4.133, altText: cap });
      caption(s, cap, x + 0.3, 5.75, 5.6, sub);
    });
    return s;
  }
  function threeScreens(kicker, title, shots, notes) {
    const s = content(kicker, title, notes);
    shots.forEach(([shot, cap, sub], i) => {
      const x = 0.45 + i * 4.16;
      s.addImage({ path: D(shot), x, y: 2.05, w: 4.1, h: 2.733, altText: cap });
      caption(s, cap, x + 0.15, 4.95, 3.8, sub);
    });
    return s;
  }
  function phones(kicker, title, shots, notes) {
    const s = content(kicker, title, notes);
    const h = 4.95, w = h * 920 / 1920, gap = (12.2 - shots.length * w) / (shots.length - 1);
    shots.forEach(([shot, cap], i) => {
      const x = 0.55 + i * (w + gap);
      s.addImage({ path: M(shot), x, y: 1.4, w, h, altText: cap });
      caption(s, cap, x - 0.1, 6.42, w + 0.2);
    });
    return s;
  }
  function card(s, x, y, w, h, fill, line) {
    s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y, w, h, rectRadius: 0.12, fill: { color: fill }, line: { color: line ?? fill, width: 1 } });
  }

  return { pres, C, W, THEME, sec, cover, content, divider, points, caption, screen, twoScreens, threeScreens, phones, card };
}

module.exports = { createDeck, ROOT, A, D, M };
