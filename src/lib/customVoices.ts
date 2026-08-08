import { get, set } from 'idb-keyval';
import type { AccentPreset } from './accents';

const CUSTOM_VOICES_KEY = 'chadsound-custom-voices';

export type VoiceProvider = 'elevenlabs' | 'xai';

export type SavedCustomVoice = {
  voiceId: string;
  label: string;
  language: string;
  accent?: string;
  createdAt: number;
  /** Voice clone / TTS backend. Defaults to elevenlabs for new clones. */
  provider?: VoiceProvider;
};

export async function loadCustomVoices(): Promise<SavedCustomVoice[]> {
  return (await get<SavedCustomVoice[]>(CUSTOM_VOICES_KEY)) ?? [];
}

export async function saveCustomVoices(voices: SavedCustomVoice[]): Promise<void> {
  await set(CUSTOM_VOICES_KEY, voices);
}

export function customVoiceToPreset(v: SavedCustomVoice): AccentPreset {
  return {
    id: `custom_${v.voiceId}`,
    label: v.label,
    region: v.accent || 'Your voice',
    voiceId: v.voiceId,
    language: v.language || 'en',
    styleHint: 'Speak naturally in the cloned voice — match the delivery of the reference recording.',
    tag: 'MINE',
    custom: true,
    provider: v.provider ?? 'elevenlabs',
  };
}
