# Chadsound (repo: chatsound)

Browser DAW — sample timeline, Grok Accent Studio, live collab (Cloudflare PartyServer), guitar/MIDI capture.

## Run locally

```bash
npm install
cp .env.example .env   # set XAI_API_KEY
npm run generate-samples
npx wrangler login     # once, for collab Worker
npm run dev
```

- App: http://localhost:5173  
- API (TTS/lyrics): http://localhost:8787  
- Live share (Workers): ws://127.0.0.1:1999  

## Deploy

### Vercel (app + AI API)

Projects/sessions save in the **browser (IndexedDB)** — no database required.

Env vars:

- `XAI_API_KEY` — lyrics, TTS, voice clone  
- `XAI_MODEL` — optional (default `grok-3`)  
- `VITE_PARTYKIT_HOST` — Workers host after collab deploy (e.g. `chatsound-collab.<account>.workers.dev`)

### Cloudflare (live share)

```bash
npx wrangler login
npm run deploy:party
```

Copy the printed `*.workers.dev` host into Vercel as `VITE_PARTYKIT_HOST` (no `https://`), then redeploy the frontend.

Uses free Durable Objects (`new_sqlite_classes`) via PartyServer.

## Stack

Vite · React · Tone.js · Zustand · Hono · PartyServer · Cloudflare · xAI · Vercel
