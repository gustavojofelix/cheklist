// Adds the pt-BR voice-over to the walkthrough and writes an MP4 (H.264 + AAC).
// No ffmpeg needed: Edge plays the silent WebM, mixes the narration clips at the times in
// timeline.json with Web Audio, and re-records both with MediaRecorder in real time.
//   node scripts/presentation/mux-video.mjs        (after narration.mjs and record-video.mjs)
// Size presets (env MUX_PRESET):
//   full      1600x900, 4 Mbit/s     (default, about 115 MB)
//   hd        1600x900, 1 Mbit/s     (about 45 MB; WhatsApp as a document)
//   whatsapp  1280x720 at 15 fps, 0.28 Mbit/s (about 15 MB; plays inside the WhatsApp chat)
import { chromium } from '@playwright/test';
import { createReadStream, createWriteStream, existsSync, readFileSync, statSync } from 'node:fs';
import { createServer } from 'node:http';

const DIR = 'docs/presentation';
const SRC = `${DIR}/Checklist-Legal-Video.webm`;
const PRESETS = {
  full: { suffix: '', width: 0, fps: 25, vbr: 4_000_000, abr: 128_000 },
  hd: { suffix: '-HD', width: 0, fps: 25, vbr: 1_000_000, abr: 96_000 },
  whatsapp: { suffix: '-WhatsApp', width: 1280, fps: 15, vbr: 280_000, abr: 48_000 },
};
const P = PRESETS[process.env.MUX_PRESET ?? 'full'];
if (!P) throw new Error(`unknown MUX_PRESET; use ${Object.keys(PRESETS).join(', ')}`);
const OUT = `${DIR}/Checklist-Legal-Video-ptBR${P.suffix}.mp4`;
const timeline = JSON.parse(readFileSync(`${DIR}/.narration/timeline.json`, 'utf8'));
const OFFSET = Number(process.env.NARRATION_OFFSET ?? 0.25);   // the recording starts slightly before the scene clock

const browser = await chromium.launch({ channel: 'msedge', args: ['--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage();
// files are served by a tiny local server (with Range support, which <video> needs)
const server = createServer((req, res) => {
  const name = decodeURIComponent(new URL(req.url, 'http://x').pathname.slice(1));
  if (!name) { res.writeHead(200, { 'content-type': 'text/html' }); return res.end('<!doctype html><title>mux</title><video id="v" playsinline></video>'); }
  const file = name === 'video.webm' ? SRC : `${DIR}/.narration/${name}`;
  if (!/^[\w.-]+\.(webm|mp3)$/.test(name) || !existsSync(file)) { res.writeHead(404); return res.end(); }
  const size = statSync(file).size;
  const type = name.endsWith('.webm') ? 'video/webm' : 'audio/mpeg';
  const m = /bytes=(\d*)-(\d*)/.exec(req.headers.range ?? '');
  if (!m) { res.writeHead(200, { 'content-type': type, 'content-length': size, 'accept-ranges': 'bytes' }); return createReadStream(file).pipe(res); }
  const start = m[1] ? Number(m[1]) : 0, end = m[2] ? Number(m[2]) : size - 1;
  res.writeHead(206, { 'content-type': type, 'content-length': end - start + 1, 'content-range': `bytes ${start}-${end}/${size}`, 'accept-ranges': 'bytes' });
  createReadStream(file, { start, end }).pipe(res);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
await page.goto(`http://127.0.0.1:${server.address().port}/`);

const out = createWriteStream(OUT);
await page.exposeFunction('__chunk', (b64) => { out.write(Buffer.from(b64, 'base64')); });
page.on('console', (m) => console.log('[page]', m.text()));

const seconds = await page.evaluate(async ({ timeline, OFFSET, P }) => {
  const v = document.getElementById('v');
  v.src = '/video.webm';
  await new Promise((r) => { v.onloadedmetadata = r; });
  const ac = new AudioContext({ sampleRate: 48000 });
  const dest = ac.createMediaStreamDestination();
  const voice = ac.createGain(); voice.gain.value = 1.0; voice.connect(dest);
  const clips = await Promise.all(timeline.map(async (s) =>
    ({ t: s.t + OFFSET, buf: await ac.decodeAudioData(await (await fetch(`/${s.id}.mp3`)).arrayBuffer()) })));

  // smaller presets draw each frame onto a scaled canvas and record that instead
  let videoTrack;
  if (P.width) {
    const c = document.createElement('canvas');
    c.width = P.width; c.height = Math.round(P.width * v.videoHeight / v.videoWidth);
    const g = c.getContext('2d'); g.imageSmoothingQuality = 'high';
    const draw = () => { g.drawImage(v, 0, 0, c.width, c.height); v.requestVideoFrameCallback(draw); };
    v.requestVideoFrameCallback(draw);
    videoTrack = c.captureStream(P.fps).getVideoTracks()[0];
  } else {
    videoTrack = v.captureStream().getVideoTracks()[0];
  }
  const stream = new MediaStream([videoTrack, ...dest.stream.getAudioTracks()]);
  const rec = new MediaRecorder(stream, { mimeType: 'video/mp4;codecs=avc1.640028,mp4a.40.2', videoBitsPerSecond: P.vbr, audioBitsPerSecond: P.abr });
  let chain = Promise.resolve();                // write chunks strictly in order
  rec.ondataavailable = (e) => { if (e.data.size) chain = chain.then(() => e.data.arrayBuffer()).then((ab) => {
    let s = ''; const u = new Uint8Array(ab); for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000));
    return window.__chunk(btoa(s));
  }); };
  const stopped = new Promise((r) => { rec.onstop = r; });

  await ac.resume();
  await v.play();
  rec.start(1000);
  const base = ac.currentTime;
  for (const c of clips) { const src = ac.createBufferSource(); src.buffer = c.buf; src.connect(voice); src.start(base + c.t); }
  console.log('recording', v.duration.toFixed(1), 's with', clips.length, 'narration clips');
  await new Promise((r) => { v.onended = r; });
  await new Promise((r) => setTimeout(r, 400));
  rec.stop();
  await stopped;
  await chain;
  return v.duration;
}, { timeline, OFFSET, P });

await new Promise((r) => out.end(r));
await browser.close();
server.close();
console.log('mp4:', OUT, (statSync(OUT).size / 1e6).toFixed(1), 'MB,', seconds.toFixed(1), 's');
