# Poster Video Generator

Turn vertical job/recruitment poster images into short animated videos:

1. **Blue intro** — blurred poster under a blue overlay
2. **Section reveal** — auto-detected horizontal bands slide in one at a time
3. **Scatter outro** — poster breaks into particles and flies apart

Runs entirely in the browser (Canvas + MediaRecorder), so it deploys cleanly on **Vercel** without FFmpeg on the server.

## Media folders

| Path | Files |
|------|--------|
| `public/samples/` | Poster PNG images |
| `public/media/music/` | Background MP3 & WAV tracks (select in UI) |
| `public/media/reference-videos/` | Example MP4 references |

Add new MP3 or WAV files to `music/` and register them in `lib/media-catalog.ts`.

## Git / required files

After `git clone`, run `npm install` — the **postinstall** script copies FFmpeg binaries into `public/vendor/ffmpeg/` (those files are gitignored because they are ~32MB).

**Commit to git:** source code, `public/samples/`, `public/media/`, `package-lock.json`, config files.

**Ignored:** `node_modules`, `.next`, `.env.local`, generated FFmpeg wasm, local video exports.

See `.gitignore` for the full list.

## Local development

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000), pick a sample or upload a poster, then click **Generate video**.

Use **Chrome** or **Edge** for MP4 export.

## Deploy to Vercel

1. Push this repo to GitHub.
2. Import the project at [vercel.com/new](https://vercel.com/new).
3. Framework preset: **Next.js** (auto-detected).
4. Deploy — no environment variables required.

## Output

Generation produces **MP4 only** (H.264 + AAC) with metadata tags from the **Media metadata** form. Optional **Metadata JSON** sidecar download.

MP4 encoding runs in the browser via FFmpeg.wasm (first run may take a minute to load the encoder).

## How sections are detected

The generator scans each row for light grey divider lines (common on these posters), groups content between them, and falls back to 10 equal bands if detection finds too few sections.

## Background music

Choose a track under **Background music** before generating. Audio is mixed into the WebM during recording (loops if the track is shorter than the video).

## Customize timing (UI)

- **Blue intro** — blurred poster under blue overlay
- **Per section reveal** — wipe time for each horizontal band
- **Hold full poster** — pause with mild pendulum sway (pivots from top, slow swing)
- **Hold pendulum** — slider 0–1.5 (off / mild / bit more)
- **Scatter outro** — particle burst duration
- **Sections** — auto-detect or fixed count (6–14)
