export function beatsToSeconds(beats: number, bpm: number): number {
  return (beats * 60) / bpm;
}

export function secondsToBeats(seconds: number, bpm: number): number {
  return (seconds * bpm) / 60;
}

export function snapBeat(beat: number, grid = 0.25): number {
  return Math.round(beat / grid) * grid;
}

export function formatBarsBeats(beat: number, beatsPerBar = 4): string {
  const bar = Math.floor(beat / beatsPerBar) + 1;
  const b = (beat % beatsPerBar) + 1;
  const beatWhole = Math.floor(b);
  const frac = b - beatWhole;
  if (frac < 0.01) return `${bar}.${beatWhole}`;
  return `${bar}.${beatWhole}.${Math.round(frac * 100)}`;
}

export function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}
