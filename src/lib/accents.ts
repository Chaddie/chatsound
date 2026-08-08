export interface AccentPreset {
  id: string;
  label: string;
  region: string;
  voiceId: string;
  language: string;
  /** Soft coaching prepended for delivery feel */
  styleHint: string;
  tag: string;
  custom?: boolean;
  provider?: 'elevenlabs' | 'xai';
}

export const ACCENT_PRESETS: AccentPreset[] = [
  {
    id: 'uk-grime',
    label: 'UK Grime',
    region: 'London',
    voiceId: 'rex',
    language: 'en-GB',
    styleHint: 'Deliver this like a sharp UK grime MC — punchy, rhythmic, confident.',
    tag: 'GRIME',
  },
  {
    id: 'nyc',
    label: 'NYC Streets',
    region: 'New York',
    voiceId: 'leo',
    language: 'en-US',
    styleHint: 'Deliver this like a New York rapper — laid-back pocket, streetwise cool.',
    tag: 'NYC',
  },
  {
    id: 'lagos',
    label: 'Lagos Heat',
    region: 'Nigeria',
    voiceId: 'atlas',
    language: 'en',
    styleHint: 'Deliver this with warm West African English rhythm — melodic, buoyant, Afrobeats energy.',
    tag: 'LAGOS',
  },
  {
    id: 'tokyo',
    label: 'Soft Tokyo',
    region: 'Japan',
    voiceId: 'luna',
    language: 'en',
    styleHint: 'Soft, intimate delivery with careful pacing — dreamy late-night city vibe. [whisper]',
    tag: 'TOKYO',
  },
  {
    id: 'rio',
    label: 'Rio Flow',
    region: 'Brazil',
    voiceId: 'carina',
    language: 'pt-BR',
    styleHint: 'Fale com swing brasileiro, caloroso e rítmico.',
    tag: 'RIO',
  },
  {
    id: 'glasgow',
    label: 'Glasgow Grit',
    region: 'Scotland',
    voiceId: 'zagan',
    language: 'en-GB',
    styleHint: 'Scottish-accented English — earthy, direct, a bit of grit and humour.',
    tag: 'GLA',
  },
  {
    id: 'sydney',
    label: 'Sydney Sun',
    region: 'Australia',
    voiceId: 'orion',
    language: 'en',
    styleHint: 'Australian English — sunny, casual, slightly cheeky.',
    tag: 'SYD',
  },
  {
    id: 'madrid',
    label: 'Madrid Pulse',
    region: 'Spain',
    voiceId: 'eve',
    language: 'es-ES',
    styleHint: 'Habla con energía española clara y rítmica.',
    tag: 'MAD',
  },
];

export function buildTtsText(lyrics: string, preset: AccentPreset): string {
  const trimmed = lyrics.trim();
  // ElevenLabs: speak lyrics as-written (strip xAI-style coaching tags if present).
  if (preset.provider === 'elevenlabs' || preset.custom) {
    return trimmed.replace(/\[(?:pause|whisper|laugh)\]/gi, ' ').replace(/\s+/g, ' ').trim();
  }
  // Keep style coaching out of spoken text when possible; rely on language + voice.
  // For expressive tags, allow user tags to pass through; prepend a short pause for studio feel.
  if (preset.id === 'tokyo' && !trimmed.includes('[')) {
    return `[whisper] ${trimmed}`;
  }
  return trimmed;
}

export const VOICE_CLONE_SCRIPT = `Alright — this is my voice for Chadsound.
I'm speaking naturally, like I'm in the booth cutting a take.
Late nights, cheap coffee, big ideas — that's the energy.
[pause] Yeah. Keep it loose, keep it real, and let's make something that hits.`;

export const SPEECH_TAG_HINTS = [
  { tag: '[pause]', label: 'Pause' },
  { tag: '[whisper]', label: 'Whisper' },
  { tag: '[laugh]', label: 'Laugh' },
] as const;

