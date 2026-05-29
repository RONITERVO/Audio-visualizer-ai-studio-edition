# Living Sketchbook Music

A local music visualizer for synced bilingual lyrics.

The app pipeline is:

```txt
Audio file -> ElevenLabs Scribe Realtime -> word-timed source lyrics -> Google Translate -> synced bilingual playback
```

## Local Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Copy `.env.example` to `.env` and set:

   ```env
   ELEVENLABS_API_KEY=
   GOOGLE_TRANSLATE_API_KEY=
   ```

   The UI can also accept keys per device.

3. Run locally:

   ```bash
   npm run dev
   ```

## Checks

```bash
npm run lint
npm run build
```
