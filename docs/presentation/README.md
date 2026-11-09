# Presentation material

| File | What it is |
|---|---|
| `Checklist-Legal-Apresentacao.pptx` | 32-slide deck in Portuguese, with speaker notes on every slide: overview, front office, phone, back office, technology and security, plans and next steps. |
| `Checklist-Legal-Video.webm` | 3.5-minute silent walkthrough with on-screen captions (1600×900, VP9). It covers the desktop front office, the phone (the app inside a phone frame) and the back office. Not committed, because of its size (about 60 MB). |
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
5. Record the video:
   ```bash
   node scripts/presentation/record-video.mjs
   ```

To get an MP4, for example for WhatsApp or to embed in PowerPoint, convert the WebM with any full ffmpeg build. Clipchamp, which ships with Windows 11, also works:

```bash
ffmpeg -i Checklist-Legal-Video.webm -c:v libx264 -crf 20 -pix_fmt yuv420p Checklist-Legal-Video.mp4
```
