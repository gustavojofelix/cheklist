// Exports the pt-BR narration as MP3:
//   docs/presentation/narracao/Checklist-Legal-Narracao-ptBR.mp3  one track, timed to the video (scene starts from timeline.json)
//   docs/presentation/narracao/NN-<scene>.mp3                     one clip per scene, in order
// No re-encoding: the clips are MPEG-2 Layer III frames (24 kHz mono, 48 kbit/s, 144 bytes = 24 ms each),
// joined frame by frame, with silent frames for the gaps.
//   node scripts/presentation/narration-mp3.mjs      (after narration.mjs and record-video.mjs)
import { copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { SCENES } from './scenes.mjs';

const NARR = 'docs/presentation/.narration';
const OUT = 'docs/presentation/narracao';
const OFFSET = Number(process.env.NARRATION_OFFSET ?? 0.25);   // same offset mux-video.mjs uses
const FRAME_S = 576 / 24000;

/** Splits an MP3 into frames, checking they all have the expected format. */
function frames(buf, name) {
  const out = [];
  let i = buf.subarray(0, 3).toString() === 'ID3' ? 10 + ((buf[6] << 21) | (buf[7] << 14) | (buf[8] << 7) | buf[9]) : 0;
  while (i + 4 <= buf.length) {
    if (buf[i] !== 0xff || (buf[i + 1] & 0xe0) !== 0xe0) throw new Error(`${name}: not an MP3 frame at byte ${i}`);
    const br = [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160][buf[i + 2] >> 4];
    const sr = [22050, 24000, 16000][(buf[i + 2] >> 2) & 3];
    if (sr !== 24000 || ((buf[i + 1] >> 3) & 3) !== 2) throw new Error(`${name}: unexpected format (${sr} Hz)`);
    const len = Math.floor((72 * br * 1000) / sr) + ((buf[i + 2] >> 1) & 1);
    out.push(buf.subarray(i, i + len));
    i += len;
  }
  return out;
}

// a silent frame that does not borrow bits from earlier frames (main_data_begin = 0), so it can repeat freely:
// the first frame of a clip is the encoder's lead-in, before the voice starts
const silent = frames(readFileSync(`${NARR}/${SCENES[0].id}.mp3`), 'lead-in')[0];
if (silent[(silent[1] & 1) ? 4 : 6] !== 0) throw new Error('lead-in frame borrows bits; cannot repeat it');

const timeline = JSON.parse(readFileSync(`${NARR}/timeline.json`, 'utf8'));
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

const track = [];
timeline.forEach((s, n) => {
  const file = `${NARR}/${s.id}.mp3`;
  copyFileSync(file, `${OUT}/${String(n + 1).padStart(2, '0')}-${s.id}.mp3`);
  const target = Math.round((s.t + OFFSET) / FRAME_S);
  while (track.length < target) track.push(silent);
  track.push(...frames(readFileSync(file), s.id));
});
for (let i = 0; i < Math.round(2 / FRAME_S); i++) track.push(silent);   // 2 s of tail, like the video's outro

writeFileSync(`${OUT}/Checklist-Legal-Narracao-ptBR.mp3`, Buffer.concat(track));
writeFileSync(`${OUT}/LEIA-ME.txt`, [
  'Narração do vídeo de apresentação do Checklist Legal (português do Brasil, voz Francisca).',
  'Checklist-Legal-Narracao-ptBR.mp3: faixa completa, sincronizada com o vídeo.',
  'NN-<cena>.mp3: uma fala por cena, pela ordem do vídeo.', '',
  ...timeline.map((s, n) => `${String(n + 1).padStart(2, '0')}  ${new Date((s.t + OFFSET) * 1000).toISOString().slice(14, 19)}  ${s.id.padEnd(11)} ${SCENES.find((x) => x.id === s.id).say}`),
].join('\r\n'));
console.log('full track', (track.length * FRAME_S).toFixed(1), 's,', timeline.length, 'clips ->', OUT);
