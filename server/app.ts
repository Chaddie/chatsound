import { Hono } from 'hono';
import { cors } from 'hono/cors';

type EnvMap = Record<string, string | undefined>;

function readEnv(name: string): string | undefined {
  const env = (globalThis as { process?: { env?: EnvMap } }).process?.env;
  return env?.[name];
}

const XAI_MODEL = readEnv('XAI_MODEL') ?? 'grok-3';
const ELEVEN_BASE = (readEnv('ELEVENLABS_API_BASE') ?? 'https://api.elevenlabs.io').replace(/\/$/, '');
const ELEVEN_TTS_MODEL = readEnv('ELEVENLABS_TTS_MODEL') ?? 'eleven_multilingual_v2';

export function apiKey(): string | null {
  const key = readEnv('XAI_API_KEY');
  if (!key || key === 'your_xai_api_key_here') return null;
  return key;
}

export function elevenLabsKey(): string | null {
  const key = readEnv('ELEVENLABS_API_KEY');
  if (!key || key === 'your_elevenlabs_api_key_here') return null;
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
      xaiConfigured: Boolean(apiKey()),
      elevenLabsConfigured: Boolean(elevenLabsKey()),
      cloneConfigured: Boolean(elevenLabsKey()),
      model: XAI_MODEL,
      elevenLabsModel: ELEVEN_TTS_MODEL,
      collab,
      hosting: collab ? 'local' : 'vercel',
    }),
  );

  app.post('/api/tts', async (c) => {
    let body: {
      text?: string;
      voice_id?: string;
      language?: string;
      provider?: 'xai' | 'elevenlabs';
    };
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: 'Invalid JSON body' }, 400);
    }

    const text = body.text?.trim();
    if (!text) return c.json({ error: 'text is required' }, 400);

    const voiceId = body.voice_id?.trim();
    const useEleven =
      body.provider === 'elevenlabs' ||
      (body.provider !== 'xai' && Boolean(voiceId && voiceId.length > 12 && elevenLabsKey()));

    if (useEleven) {
      const key = elevenLabsKey();
      if (!key) {
        return c.json(
          {
            error: 'ELEVENLABS_API_KEY not configured',
            hint: 'Set ELEVENLABS_API_KEY in Vercel env or local .env for voice clones',
          },
          503,
        );
      }
      if (!voiceId) return c.json({ error: 'voice_id is required for ElevenLabs TTS' }, 400);

      const res = await fetch(
        `${ELEVEN_BASE}/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=mp3_44100_128`,
        {
          method: 'POST',
          headers: {
            'xi-api-key': key,
            'Content-Type': 'application/json',
            Accept: 'audio/mpeg',
          },
          body: JSON.stringify({
            text,
            model_id: ELEVEN_TTS_MODEL,
          }),
        },
      );

      if (!res.ok) {
        const errText = await res.text();
        return c.json({ error: 'ElevenLabs TTS failed', detail: errText }, 502);
      }

      const audio = await res.arrayBuffer();
      return new Response(audio, {
        status: 200,
        headers: {
          'Content-Type': res.headers.get('Content-Type') ?? 'audio/mpeg',
          'Cache-Control': 'no-store',
        },
      });
    }

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

    const payload = {
      text,
      voice_id: voiceId ?? 'eve',
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

  const KIT_SAMPLE_IDS = [
    'kick',
    'kick_808',
    'snare',
    'snare_rim',
    'hat',
    'hat_open',
    'clap',
    'perc',
    'tom_low',
    'tom_high',
    'ride',
    'crash',
    'shaker',
    'bass',
    'bass_reese',
    'bass_acid',
    'bass_wobble',
    'bass_pluck',
    'chord',
    'synth_saw_lead',
    'synth_square_lead',
    'synth_pluck',
    'synth_pad_warm',
    'synth_pad_air',
    'synth_keys_bell',
    'synth_fm_stab',
    'synth_arp',
    'synth_supersaw',
    'synth_pulse_width',
    'synth_hoover',
    'synth_chord_minor',
    'synth_chord_maj7',
    'guitar_e',
    'guitar_a',
    'guitar_d',
    'guitar_g',
    'guitar_b',
    'guitar_e_high',
    'guitar_chord_open',
    'guitar_power_chord',
    'guitar_mute',
    'guitar_harmonics',
    'piano_c3',
    'piano_e3',
    'piano_g3',
    'piano_c4',
    'piano_e4',
    'piano_chord',
    'epiano',
    'organ',
    'strings_pad',
    'violin_lead',
    'cello',
    'brass_stab',
    'trumpet',
    'flute',
    'sax',
    'kalimba',
    'marimba',
    'steel_drum',
    'bell_church',
    'fx',
    'fx_riser',
    'fx_downlifter',
    'fx_impact',
    'fx_noise_hit',
    'fx_laser',
  ] as const;

  app.post('/api/arrange', async (c) => {
    const key = apiKey();
    if (!key) {
      return c.json(
        {
          error: 'XAI_API_KEY not configured',
          hint: 'Set XAI_API_KEY to generate AI arrangements',
        },
        503,
      );
    }

    let body: { prompt?: string; bars?: number };
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: 'Invalid JSON body' }, 400);
    }

    const prompt = body.prompt?.trim();
    if (!prompt) return c.json({ error: 'prompt is required' }, 400);
    const bars = Math.min(32, Math.max(4, Number(body.bars) || 8));
    const totalBeats = bars * 4;

    const system = `You are a music producer arranging a track inside Chadsound DAW.
Return ONLY valid JSON (no markdown fences, no commentary).
You MUST only use sampleId values from this allow-list:
${KIT_SAMPLE_IDS.join(', ')}

Schema:
{
  "bpm": number (70-180),
  "name": string (short session title),
  "tracks": [{"name": string, "role": "drums"|"bass"|"synths"|"guitar"|"keys"|"fx"|"vox"}],
  "clips": [{"sampleId": string, "trackIndex": number, "startBeat": number, "durationBeats": number}],
  "vocal": {"lyrics": string, "style": "hook"|"rap"|"chorus"} | null
}

Rules:
- trackIndex is 0-based into the tracks array.
- Prefer 4 tracks: drums, bass, lead/synth or guitar, fx.
- Fill ~${totalBeats} beats (about ${bars} bars). Use repeating rhythmic patterns.
- durationBeats typically 0.25–4 for drums/hats, 1–8 for pads/bass.
- startBeat >= 0 and startBeat + durationBeats <= ${totalBeats + 4}.
- Match the user's genre/vibe (e.g. metal + dubstep => heavy kick_808, bass_wobble/bass_reese, guitar_power_chord, crash, fx_riser).
- Include 12–40 clips total. Avoid empty arrangements.
- vocal may be null; if present, keep lyrics short (4–8 lines) matching the vibe.`;

    const user = `User request: ${prompt}

Create the arrangement JSON now.`;

    const res = await fetch('https://api.x.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: XAI_MODEL,
        temperature: 0.7,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      return c.json({ error: 'Arrangement generation failed', detail: errText }, 502);
    }

    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    let raw = data.choices?.[0]?.message?.content?.trim() ?? '';
    raw = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();

    let plan: unknown;
    try {
      plan = JSON.parse(raw);
    } catch {
      return c.json({ error: 'Model returned non-JSON arrangement', detail: raw.slice(0, 800) }, 502);
    }

    const obj = plan as {
      bpm?: number;
      name?: string;
      tracks?: { name?: string; role?: string }[];
      clips?: { sampleId?: string; trackIndex?: number; startBeat?: number; durationBeats?: number }[];
      vocal?: { lyrics?: string; style?: string } | null;
    };

    const allow = new Set<string>(KIT_SAMPLE_IDS);
    const tracks = (obj.tracks ?? [])
      .slice(0, 8)
      .map((t, i) => ({
        name: String(t.name || `Track ${i + 1}`).slice(0, 32),
        role: String(t.role || 'synths'),
      }));

    const clips = (obj.clips ?? [])
      .filter((cl) => cl.sampleId && allow.has(cl.sampleId))
      .slice(0, 64)
      .map((cl) => ({
        sampleId: cl.sampleId!,
        trackIndex: Math.max(0, Math.min(tracks.length - 1, Number(cl.trackIndex) || 0)),
        startBeat: Math.max(0, Number(cl.startBeat) || 0),
        durationBeats: Math.max(0.125, Math.min(16, Number(cl.durationBeats) || 1)),
      }));

    if (!tracks.length || !clips.length) {
      return c.json({ error: 'Arrangement had no usable clips', detail: obj }, 502);
    }

    const vocal =
      obj.vocal && typeof obj.vocal.lyrics === 'string' && obj.vocal.lyrics.trim()
        ? {
            lyrics: obj.vocal.lyrics.trim().slice(0, 1200),
            style: obj.vocal.style || 'hook',
          }
        : null;

    return c.json({
      bpm: Math.min(180, Math.max(70, Number(obj.bpm) || 128)),
      name: String(obj.name || 'AI Session').slice(0, 48),
      tracks,
      clips,
      vocal,
      model: XAI_MODEL,
    });
  });

  app.get('/api/voices', async (c) => {
    const key = elevenLabsKey();
    if (!key) {
      return c.json(
        {
          error: 'ELEVENLABS_API_KEY not configured',
          hint: 'Set ELEVENLABS_API_KEY in Vercel env or local .env',
        },
        503,
      );
    }
    const res = await fetch(`${ELEVEN_BASE}/v1/voices`, {
      headers: { 'xi-api-key': key },
    });
    if (!res.ok) {
      const detail = await res.text();
      return c.json({ error: 'Failed to list ElevenLabs voices', detail, status: res.status }, 502);
    }
    const data = (await res.json()) as {
      voices?: { voice_id: string; name: string; category?: string; labels?: Record<string, string> }[];
    };
    return c.json({
      provider: 'elevenlabs',
      voices: (data.voices ?? []).map((v) => ({
        voice_id: v.voice_id,
        name: v.name,
        category: v.category,
        labels: v.labels,
      })),
    });
  });

  app.post('/api/voices', async (c) => {
    const key = elevenLabsKey();
    if (!key) {
      return c.json(
        {
          error: 'ELEVENLABS_API_KEY not configured',
          hint: 'Set ELEVENLABS_API_KEY in Vercel env or local .env for Instant Voice Cloning',
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
    const isBlob =
      typeof file === 'object' &&
      file !== null &&
      typeof (file as Blob).arrayBuffer === 'function';
    if (!isBlob) {
      return c.json({ error: 'file is required (audio reference for Instant Voice Clone)' }, 400);
    }

    const name = String(form.get('name') ?? 'My Voice').trim() || 'My Voice';
    const language = String(form.get('language') ?? 'en').trim() || 'en';
    const accent = String(form.get('accent') ?? '').trim();

    const outbound = new FormData();
    const blob = file as Blob;
    const filename =
      'name' in blob && typeof (blob as File).name === 'string' && (blob as File).name
        ? (blob as File).name
        : 'reference.wav';
    outbound.append('files', blob, filename);
    outbound.append('name', name.slice(0, 64));
    outbound.append(
      'description',
      `Chadsound Instant Voice Clone${accent ? ` · ${accent}` : ''}`,
    );
    const labels: Record<string, string> = { language };
    if (accent) labels.accent = accent.slice(0, 64);
    outbound.append('labels', JSON.stringify(labels));

    const res = await fetch(`${ELEVEN_BASE}/v1/voices/add`, {
      method: 'POST',
      headers: { 'xi-api-key': key },
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
        res.status === 401 || res.status === 403
          ? 'Check ELEVENLABS_API_KEY and that your plan includes Instant Voice Cloning (Starter+).'
          : res.status === 400
            ? 'Use a clear solo reference clip (a few seconds to a couple minutes). Quiet room, one speaker.'
            : undefined;
      return c.json(
        {
          error: 'ElevenLabs voice clone failed',
          detail: parsed,
          hint,
          status: res.status,
        },
        502,
      );
    }

    return c.json(
      {
        provider: 'elevenlabs',
        voice_id: parsed.voice_id,
        name,
        language,
        accent: accent || undefined,
        requires_verification: parsed.requires_verification,
      },
      201,
    );
  });

  app.delete('/api/voices/:voiceId', async (c) => {
    const key = elevenLabsKey();
    if (!key) {
      return c.json({ error: 'ELEVENLABS_API_KEY not configured' }, 503);
    }
    const voiceId = c.req.param('voiceId');
    const res = await fetch(`${ELEVEN_BASE}/v1/voices/${encodeURIComponent(voiceId)}`, {
      method: 'DELETE',
      headers: { 'xi-api-key': key },
    });
    if (!res.ok) {
      const detail = await res.text();
      return c.json({ error: 'Delete failed', detail }, 502);
    }
    return c.json({ deleted: true, provider: 'elevenlabs' });
  });

  return app;
}

export const app = createApp({ collab: false });
