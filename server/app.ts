import { Hono } from 'hono';
import { cors } from 'hono/cors';

const XAI_MODEL = process.env.XAI_MODEL ?? 'grok-3';

export function apiKey(): string | null {
  const key = process.env.XAI_API_KEY;
  if (!key || key === 'your_xai_api_key_here') return null;
  return key;
}

/** Shared HTTP API (local Node + Vercel). WebSocket collab is local-only. */
export function createApp(options?: { collab?: boolean }) {
  const app = new Hono();
  const collab = Boolean(options?.collab);

  app.use(
    '/api/*',
    cors({
      origin: '*',
    }),
  );

  app.get('/api/health', (c) =>
    c.json({
      ok: true,
      ttsConfigured: Boolean(apiKey()),
      model: XAI_MODEL,
      collab,
      hosting: collab ? 'local' : 'vercel',
    }),
  );

  app.post('/api/tts', async (c) => {
    const key = apiKey();
    if (!key) {
      return c.json(
        {
          error: 'XAI_API_KEY not configured',
          hint: 'Set XAI_API_KEY in Vercel project env or local .env',
        },
        503,
      );
    }

    let body: {
      text?: string;
      voice_id?: string;
      language?: string;
    };
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: 'Invalid JSON body' }, 400);
    }

    const text = body.text?.trim();
    if (!text) return c.json({ error: 'text is required' }, 400);

    const payload = {
      text,
      voice_id: body.voice_id ?? 'eve',
      language: body.language ?? 'en',
      output_format: {
        codec: 'mp3',
        sample_rate: 44100,
        bit_rate: 128000,
      },
    };

    const res = await fetch('https://api.x.ai/v1/tts', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const errText = await res.text();
      return c.json({ error: 'TTS request failed', detail: errText }, 502);
    }

    const audio = await res.arrayBuffer();
    return new Response(audio, {
      status: 200,
      headers: {
        'Content-Type': res.headers.get('Content-Type') ?? 'audio/mpeg',
        'Cache-Control': 'no-store',
      },
    });
  });

  type LyricStyle = 'hook' | 'verse' | 'rap' | 'chorus' | 'bridge';

  app.post('/api/lyrics', async (c) => {
    const key = apiKey();
    if (!key) {
      return c.json(
        {
          error: 'XAI_API_KEY not configured',
          hint: 'Set XAI_API_KEY in Vercel project env or local .env',
        },
        503,
      );
    }

    let body: {
      idea?: string;
      style?: LyricStyle;
      accentLabel?: string;
      language?: string;
    };
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: 'Invalid JSON body' }, 400);
    }

    const idea = body.idea?.trim();
    if (!idea) return c.json({ error: 'idea is required' }, 400);

    const style = body.style ?? 'rap';
    const accentLabel = body.accentLabel ?? 'neutral English';
    const language = body.language ?? 'en';

    const styleGuide: Record<LyricStyle, string> = {
      hook: 'Write a short catchy hook / chorus (4–8 lines). Tight, memorable, repeatable.',
      verse: 'Write one verse (8–12 lines) that develops the idea with concrete images.',
      rap: 'Write a rap verse (8–16 lines) with strong rhythm, internal rhyme, and punchlines. Make it sound good spoken aloud.',
      chorus: 'Write a chorus (4–8 lines) with a clear title phrase and emotional payoff.',
      bridge: 'Write a bridge (4–6 lines) that shifts perspective or energy before returning to the hook.',
    };

    const system = `You are a hit songwriter and MC writing for a music production DAW called Chadsound.
Return ONLY the lyrics — no title, no commentary, no markdown fences, no stage directions.
You may include occasional speech tags like [pause], [whisper], or [laugh] where they help delivery.
Match the vibe of the accent/region: ${accentLabel}.
Language for lyrics: prefer natural phrasing for locale ${language} (English is fine if that fits the vibe unless the accent is clearly non-English).
Keep it radio-clean enough for a demo unless the user idea is explicitly filthy.`;

    const user = `Style: ${style}
Brief: ${styleGuide[style]}

User idea / themes / words:
${idea}

Write the lyrics now.`;

    const res = await fetch('https://api.x.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: XAI_MODEL,
        temperature: 0.9,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      return c.json({ error: 'Lyric generation failed', detail: errText }, 502);
    }

    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const lyrics = data.choices?.[0]?.message?.content?.trim();
    if (!lyrics) {
      return c.json({ error: 'Empty lyric response from model' }, 502);
    }

    return c.json({ lyrics, style, model: XAI_MODEL });
  });

  app.get('/api/voices', async (c) => {
    const key = apiKey();
    if (!key) {
      return c.json(
        { error: 'XAI_API_KEY not configured', hint: 'Set XAI_API_KEY in Vercel env' },
        503,
      );
    }
    const res = await fetch('https://api.x.ai/v1/custom-voices?limit=50', {
      headers: { Authorization: `Bearer ${key}` },
    });
    if (!res.ok) {
      const detail = await res.text();
      return c.json({ error: 'Failed to list custom voices', detail, status: res.status }, 502);
    }
    const data = (await res.json()) as { voices?: unknown[] };
    return c.json({ voices: data.voices ?? [] });
  });

  app.post('/api/voices', async (c) => {
    const key = apiKey();
    if (!key) {
      return c.json(
        {
          error: 'XAI_API_KEY not configured',
          hint: 'Set XAI_API_KEY in Vercel env',
        },
        503,
      );
    }

    let form: FormData;
    try {
      form = await c.req.formData();
    } catch {
      return c.json({ error: 'Expected multipart form data with an audio file' }, 400);
    }

    const file = form.get('file');
    if (!(file instanceof File) && !(file instanceof Blob)) {
      return c.json({ error: 'file is required (audio reference, max 120s)' }, 400);
    }

    const name = String(form.get('name') ?? 'My Voice').trim() || 'My Voice';
    const language = String(form.get('language') ?? 'en').trim() || 'en';
    const accent = String(form.get('accent') ?? '').trim();
    const tone = String(form.get('tone') ?? 'expressive').trim() || 'expressive';
    const useCase = String(form.get('use_case') ?? 'entertainment').trim() || 'entertainment';
    const gender = String(form.get('gender') ?? 'neutral').trim() || 'neutral';

    const outbound = new FormData();
    const filename = file instanceof File && file.name ? file.name : 'reference.wav';
    const blob = file instanceof Blob ? file : new Blob([file]);
    outbound.append('file', blob, filename);
    outbound.append('name', name.slice(0, 64));
    outbound.append('language', language);
    outbound.append('tone', tone);
    outbound.append('use_case', useCase);
    outbound.append('gender', gender);
    if (accent) outbound.append('accent', accent.slice(0, 64));
    outbound.append(
      'description',
      `Chadsound custom voice${accent ? ` · ${accent}` : ''} · cloned for Accent Studio TTS`,
    );

    const res = await fetch('https://api.x.ai/v1/custom-voices', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}` },
      body: outbound,
    });

    const text = await res.text();
    let parsed: Record<string, unknown> = {};
    try {
      parsed = JSON.parse(text) as Record<string, unknown>;
    } catch {
      parsed = { detail: text };
    }

    if (!res.ok) {
      const hint =
        res.status === 403
          ? 'Custom voice create via API may require Enterprise. Clone in the xAI console and paste the voice ID.'
          : res.status === 400
            ? 'Check the clip is under 120 seconds, one speaker, quiet room. Aim for 30–120s of natural speech.'
            : undefined;
      return c.json(
        {
          error: 'Voice clone failed',
          detail: parsed,
          hint,
          status: res.status,
        },
        502,
      );
    }

    return c.json(parsed, 201);
  });

  app.delete('/api/voices/:voiceId', async (c) => {
    const key = apiKey();
    if (!key) {
      return c.json({ error: 'XAI_API_KEY not configured' }, 503);
    }
    const voiceId = c.req.param('voiceId');
    const res = await fetch(`https://api.x.ai/v1/custom-voices/${encodeURIComponent(voiceId)}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${key}` },
    });
    if (!res.ok) {
      const detail = await res.text();
      return c.json({ error: 'Delete failed', detail }, 502);
    }
    return c.json({ deleted: true });
  });

  return app;
}

export const app = createApp({ collab: false });
