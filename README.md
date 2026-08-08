# Chadsound (repo: chatsound)

Browser DAW — sample timeline, Grok Accent Studio, live collab (local), guitar/MIDI capture.

## Run locally

```bash
npm install
cp .env.example .env   # set XAI_API_KEY
npm run generate-samples
npm run dev
```

- App: http://localhost:5173  
- API + collab WS: http://localhost:8787  

## Deploy (Vercel)

Projects/sessions save in the **browser (IndexedDB)** — no database required.

Set env var on Vercel:

- `XAI_API_KEY` — required for lyrics, TTS, voice clone  
- `XAI_MODEL` — optional (default `grok-3`)

Live collaboration WebSockets need a persistent Node process (`npm run dev` / own host). On Vercel, arranging + Accent AI still work; **Share live** is local-dev only.

## Stack

Vite · React · Tone.js · Zustand · Hono · xAI · Vercel
