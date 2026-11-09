# Presentation material

| File | What it is |
|---|---|
| `Checklist-Legal-Apresentacao.pptx` | 32-slide deck in Portuguese, with speaker notes on every slide: overview, front office, phone, back office, technology and security, plans and next steps. |
| `Checklist-Legal-Video-ptBR.mp4` | 5:23 walkthrough with a Brazilian Portuguese voice-over (Microsoft Francisca neural voice) and on-screen captions, 1600×900, H.264 + AAC. It covers the desktop front office, the phone (the app inside a phone frame) and the back office. Not committed, because of its size (about 115 MB). |
| `…-ptBR-WhatsApp.mp4` / `…-ptBR-HD.mp4` | Smaller copies: 1280×720 at 15 fps (14 MB, plays inside a WhatsApp chat) and 1600×900 at 1 Mbit/s (39 MB, sent as a document). Not committed. |
| `narracao/` | The narration as MP3: `Checklist-Legal-Narracao-ptBR.mp3` (the full 5:23 track, timed to the video), the 44 per-scene clips (`NN-<scene>.mp3`, also zipped), and `LEIA-ME.txt` with each clip's start time and text. Made by `node scripts/presentation/narration-mp3.mjs`. Not committed. |
| `Checklist-Legal-Video.webm` | The same walkthrough without audio, an intermediate file. Not committed. |
| `Checklist-Legal-Acasalamento.pptx` | 13-slide deck on document pairing in the Legislação module (original + alterations → revised text), with the LACI047 example (Decreto n.º 38.088, Código das Execuções Fiscais). |
| `Checklist-Legal-Acasalamento-ptBR.mp4` / `…-WhatsApp.mp4` | 3:02 narrated video of the pairing (65 MB / 8 MB). Made by `legislation-demo.mjs reset`, `VIDEO=legislacao narration.mjs`, `record-legislacao.mjs` and `VIDEO=legislacao mux-video.mjs`. Not committed. |
| `screens/desktop`, `screens/mobile` | Raw screen captures (29 desktop, 11 phone). |
| `assets/` | Logo, capulana backgrounds and framed screens used by the deck. |

Everything is regenerated from the DEV seed data, with the dev server running on http://localhost:4200. The scripts only open screens and dialogs: nothing is saved, sent or paid.

1. Tidy the demo data (optional). This renames test uploads and fills two descriptive fields:
   ```bash
   node scripts/presentation/tidy-demo.mjs .
   ```
2. Capture the screens:
   ```bash
   node scripts/presentation/capture.mjs
   ```
3. Render the frames and backgrounds:
   ```bash
   node scripts/presentation/assets.mjs
   ```
4. Build the deck. It needs `pptxgenjs` and the pptx skill's `apply_theme.js`, which are passed in by path:
   ```bash
   PPTXGENJS=<…>/node_modules/pptxgenjs APPLY_THEME=<…>/apply_theme.js node scripts/presentation/build-deck.cjs
   ```
5. Generate the narration. The text is in `scripts/presentation/scenes.mjs`, and this step needs the `msedge-tts` package, passed in by path. Add `--force` to regenerate clips that already exist:
   ```bash
   MSEDGE_TTS=<…>/node_modules/msedge-tts node scripts/presentation/narration.mjs
   ```
6. Record the video. Each scene lasts as long as its narration:
   ```bash
   node scripts/presentation/record-video.mjs
   ```
7. Add the voice-over and write the MP4. This runs in real time (about 5 minutes) and needs no ffmpeg:
   ```bash
   node scripts/presentation/mux-video.mjs
   ```

For the smaller copies, set `MUX_PRESET=whatsapp` or `MUX_PRESET=hd` before running `mux-video.mjs`.
