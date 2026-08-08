export type SampleSource = 'bundled' | 'upload' | 'accent' | 'record' | 'midi';

export interface Sample {
  id: string;
  name: string;
  /** Object URL or public path */
  url: string;
  duration: number;
  peaks: number[];
  source: SampleSource;
  category?: string;
  /** Keep blob for persistence / export */
  blob?: Blob;
}

export interface Clip {
  id: string;
  trackId: string;
  sampleId: string;
  /** Start position on timeline in beats */
  startBeat: number;
  /** Visible length on timeline in beats */
  durationBeats: number;
  /** Trim offset into the sample in beats */
  offsetBeats: number;
}

export interface Track {
  id: string;
  name: string;
  color: string;
  volume: number;
  pan: number;
  muted: boolean;
  solo: boolean;
}

export interface LoopRegion {
  enabled: boolean;
  startBeat: number;
  endBeat: number;
}

export interface ProjectSnapshot {
  version: 1;
  name: string;
  bpm: number;
  tracks: Track[];
  clips: Clip[];
  loop: LoopRegion;
  selectedTrackId: string | null;
  selectedClipId: string | null;
}

export const TRACK_COLORS = [
  '#c8f135',
  '#f0a830',
  '#5ec8ff',
  '#ff6b6b',
  '#d4a5ff',
  '#7dffb3',
  '#ff8c42',
  '#a8e6ff',
] as const;

export function uid(prefix = 'id'): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}
