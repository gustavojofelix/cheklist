// Generates one narration clip per scene (pt-BR neural voice) into docs/presentation/.narration/<id>.mp3.
// Uses the `msedge-tts` package (Microsoft Edge "Read aloud" voices); point MSEDGE_TTS at its folder.
//   MSEDGE_TTS=<…>/node_modules/msedge-tts node scripts/presentation/narration.mjs     (VIDEO=legislacao for the pairing video)
import { existsSync, mkdirSync, renameSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { SCENES, V, VOICE } from './lib/variant.mjs';

const lib = process.env.MSEDGE_TTS ? pathToFileURL(join(resolve(process.env.MSEDGE_TTS), 'dist/index.js')).href : 'msedge-tts';
const { MsEdgeTTS, OUTPUT_FORMAT } = await import(lib);

const OUT = V.narr;
mkdirSync(OUT, { recursive: true });
const force = process.argv.includes('--force');

for (const s of SCENES) {
  const file = `${OUT}/${s.id}.mp3`;
  if (existsSync(file) && !force) continue;
  const dir = `${OUT}/_tmp`;
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir);
  const tts = new MsEdgeTTS();
  await tts.setMetadata(VOICE, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
  const { audioFilePath } = await tts.toFile(dir, s.say, { rate: '+4%' });
  tts.close?.();
  renameSync(audioFilePath, file);
  rmSync(dir, { recursive: true, force: true });
  console.log('narration', s.id);
}
