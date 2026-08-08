/**
 * Procedural Chadsound starter pack — synths, guitars, keys, strings, brass, drums, FX.
 * All royalty-free; generated at install / via `npm run generate-samples`.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = join(__dirname, '..', 'public', 'samples');
mkdirSync(outDir, { recursive: true });

const SR = 44100;

function writeWav(path: string, samples: Float32Array, sampleRate = SR): void {
  const numChannels = 1;
  const bitDepth = 16;
  const blockAlign = (numChannels * bitDepth) / 8;
  const byteRate = sampleRate * blockAlign;
  const dataSize = samples.length * blockAlign;
  const buffer = Buffer.alloc(44 + dataSize);
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(numChannels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(byteRate, 28);
  buffer.writeUInt16LE(blockAlign, 32);
  buffer.writeUInt16LE(bitDepth, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);
  let offset = 44;
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]!));
    buffer.writeInt16LE(s < 0 ? s * 0x8000 : s * 0x7fff, offset);
    offset += 2;
  }
  writeFileSync(path, buffer);
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function clamp(n: number, min = -1, max = 1): number {
  return Math.min(max, Math.max(min, n));
}

function midi(n: number): number {
  return 440 * Math.pow(2, (n - 69) / 12);
}

function soft(x: number): number {
  return Math.tanh(x);
}

function adsr(t: number, a: number, d: number, s: number, r: number, hold: number): number {
  if (t < a) return t / Math.max(a, 1e-6);
  if (t < a + d) return 1 - ((1 - s) * (t - a)) / Math.max(d, 1e-6);
  if (t < a + d + hold) return s;
  const rel = t - (a + d + hold);
  if (rel < r) return s * (1 - rel / Math.max(r, 1e-6));
  return 0;
}

function synth(
  duration: number,
  fn: (t: number, rnd: () => number) => number,
  seed = 1,
): Float32Array {
  const len = Math.floor(SR * duration);
  const rnd = mulberry32(seed);
  const out = new Float32Array(len);
  for (let i = 0; i < len; i++) {
    out[i] = clamp(fn(i / SR, rnd));
  }
  // tiny fade to avoid clicks
  const fade = Math.min(64, len);
  for (let i = 0; i < fade; i++) {
    out[i]! *= i / fade;
    out[len - 1 - i]! *= i / fade;
  }
  return out;
}

function mix(...parts: number[]): number {
  let s = 0;
  for (const p of parts) s += p;
  return soft(s);
}

function saw(phase: number): number {
  return 2 * (phase - Math.floor(phase + 0.5));
}

function square(phase: number, pw = 0.5): number {
  return phase % 1 < pw ? 1 : -1;
}

function tri(phase: number): number {
  return 1 - 4 * Math.abs(Math.round(phase) - phase);
}

function noise(rnd: () => number): number {
  return rnd() * 2 - 1;
}

/** Karplus–Strong-ish plucked string */
function pluck(duration: number, freq: number, brightness: number, seed: number): Float32Array {
  const len = Math.floor(SR * duration);
  const delay = Math.max(2, Math.floor(SR / freq));
  const buf = new Float32Array(delay);
  const rnd = mulberry32(seed);
  for (let i = 0; i < delay; i++) buf[i] = (rnd() * 2 - 1) * brightness;
  const out = new Float32Array(len);
  let idx = 0;
  let prev = 0;
  for (let i = 0; i < len; i++) {
    const v = buf[idx]!;
    out[i] = v;
    const filtered = 0.5 * (v + prev) * 0.996;
    prev = v;
    buf[idx] = filtered;
    idx = (idx + 1) % delay;
  }
  const fade = Math.min(256, len);
  for (let i = 0; i < fade; i++) out[len - 1 - i]! *= i / fade;
  return out;
}

type Spec = { file: string; data: Float32Array };

const pack: Spec[] = [];

function add(file: string, data: Float32Array): void {
  pack.push({ file, data });
}

// ─── Drums ───────────────────────────────────────────────
add(
  'kick.wav',
  synth(0.4, (t) => Math.sin(2 * Math.PI * (150 * Math.exp(-t * 18) + 40) * t) * Math.exp(-t * 12), 11),
);
add(
  'kick_808.wav',
  synth(1.1, (t) => {
    const f = 55 * Math.exp(-t * 2.2) + 28;
    return Math.sin(2 * Math.PI * f * t) * Math.exp(-t * 1.6) * 0.95;
  }, 12),
);
add(
  'snare.wav',
  synth(0.3, (t, rnd) => {
    const amp = Math.exp(-t * 16);
    return (Math.sin(2 * Math.PI * 180 * t) * 0.35 + noise(rnd) * 0.7 * Math.exp(-t * 22)) * amp;
  }, 21),
);
add(
  'snare_rim.wav',
  synth(0.18, (t, rnd) => Math.sin(2 * Math.PI * 420 * t) * Math.exp(-t * 40) * 0.5 + noise(rnd) * Math.exp(-t * 55) * 0.35, 22),
);
add(
  'hat.wav',
  synth(0.09, (t, rnd) => noise(rnd) * Math.exp(-t * 55) * 0.55, 31),
);
add(
  'hat_open.wav',
  synth(0.45, (t, rnd) => noise(rnd) * Math.exp(-t * 8) * 0.4, 32),
);
add(
  'clap.wav',
  synth(0.25, (t, rnd) => {
    let v = 0;
    for (const b of [0, 0.012, 0.024]) {
      const local = t - b;
      if (local >= 0 && local < 0.05) v += noise(rnd) * Math.exp(-local * 80) * 0.7;
    }
    return v;
  }, 41),
);
add(
  'perc.wav',
  synth(0.2, (t, rnd) => Math.sin(2 * Math.PI * 780 * t) * Math.exp(-t * 28) * 0.5 + noise(rnd) * Math.exp(-t * 28) * 0.2, 51),
);
add(
  'tom_low.wav',
  synth(0.45, (t) => Math.sin(2 * Math.PI * (180 * Math.exp(-t * 8) + 70) * t) * Math.exp(-t * 7), 52),
);
add(
  'tom_high.wav',
  synth(0.35, (t) => Math.sin(2 * Math.PI * (320 * Math.exp(-t * 10) + 110) * t) * Math.exp(-t * 9), 53),
);
add(
  'ride.wav',
  synth(1.2, (t, rnd) => {
    const metallic =
      Math.sin(2 * Math.PI * 880 * t) * 0.2 +
      Math.sin(2 * Math.PI * 1320 * t) * 0.12 +
      Math.sin(2 * Math.PI * 1980 * t) * 0.08;
    return (metallic + noise(rnd) * 0.15) * Math.exp(-t * 2.2);
  }, 54),
);
add(
  'crash.wav',
  synth(1.8, (t, rnd) => {
    const metallic =
      Math.sin(2 * Math.PI * 540 * t) * 0.15 +
      Math.sin(2 * Math.PI * 910 * t) * 0.12 +
      Math.sin(2 * Math.PI * 1450 * t) * 0.1;
    return (metallic + noise(rnd) * 0.45) * Math.exp(-t * 1.5);
  }, 55),
);
add(
  'shaker.wav',
  synth(0.22, (t, rnd) => noise(rnd) * (0.3 + 0.7 * Math.abs(Math.sin(2 * Math.PI * 18 * t))) * Math.exp(-t * 10) * 0.45, 56),
);

// ─── Bass ────────────────────────────────────────────────
add(
  'bass.wav',
  synth(0.55, (t) => Math.sin(2 * Math.PI * 55 * t) * adsr(t, 0.01, 0.08, 0.7, 0.25, 0.15) * 0.9, 61),
);
add(
  'bass_reese.wav',
  synth(0.9, (t) => {
    const f = 55;
    const a = saw(f * t) * 0.45 + saw(f * 1.01 * t) * 0.45;
    return soft(a * 1.4) * adsr(t, 0.02, 0.15, 0.75, 0.3, 0.25);
  }, 62),
);
add(
  'bass_acid.wav',
  synth(0.7, (t) => {
    const f = 73.4;
    const env = adsr(t, 0.005, 0.2, 0.2, 0.2, 0.1);
    const cutoff = 200 + env * 2200;
    // cheap resonant-ish: blend saw with filtered feel via phase
    const raw = saw(f * t);
    return soft(raw * (0.3 + cutoff / 4000) + Math.sin(2 * Math.PI * f * t) * 0.4) * env;
  }, 63),
);
add(
  'bass_wobble.wav',
  synth(1.2, (t) => {
    const f = 49;
    const lfo = 0.5 + 0.5 * Math.sin(2 * Math.PI * 4.5 * t);
    return soft(saw(f * t) * lfo + saw(f * 1.005 * t) * (1 - lfo)) * adsr(t, 0.02, 0.1, 0.8, 0.35, 0.5);
  }, 64),
);
add(
  'bass_pluck.wav',
  pluck(0.7, 82.4, 0.85, 65),
);

// ─── Synths ──────────────────────────────────────────────
add(
  'chord.wav',
  synth(0.65, (t) => {
    const freqs = [220, 277.18, 329.63];
    let v = 0;
    for (const f of freqs) v += Math.sin(2 * Math.PI * f * t);
    return (v / freqs.length) * adsr(t, 0.01, 0.12, 0.5, 0.25, 0.15) * 0.75;
  }, 71),
);
add(
  'synth_saw_lead.wav',
  synth(0.9, (t) => soft(saw(midi(69) * t) * 0.7 + saw(midi(69) * 1.002 * t) * 0.4) * adsr(t, 0.02, 0.15, 0.55, 0.35, 0.2), 72),
);
add(
  'synth_square_lead.wav',
  synth(0.85, (t) => soft(square(midi(72) * t, 0.35) * 0.55) * adsr(t, 0.01, 0.12, 0.45, 0.3, 0.2), 73),
);
add(
  'synth_pluck.wav',
  synth(0.55, (t) => soft(saw(midi(76) * t) + tri(midi(76) * t) * 0.3) * adsr(t, 0.002, 0.18, 0.1, 0.2, 0.05), 74),
);
add(
  'synth_pad_warm.wav',
  synth(2.4, (t) => {
    const freqs = [midi(60), midi(64), midi(67), midi(71)];
    let v = 0;
    for (let i = 0; i < freqs.length; i++) {
      const f = freqs[i]!;
      v += tri(f * t + i * 0.1) * 0.35 + Math.sin(2 * Math.PI * f * 0.5 * t) * 0.15;
    }
    return soft(v) * adsr(t, 0.35, 0.4, 0.7, 0.7, 0.6);
  }, 75),
);
add(
  'synth_pad_air.wav',
  synth(2.6, (t, rnd) => {
    const freqs = [midi(67), midi(71), midi(74)];
    let v = 0;
    for (const f of freqs) v += Math.sin(2 * Math.PI * f * t) + Math.sin(2 * Math.PI * f * 2.01 * t) * 0.2;
    return soft(v / 4 + noise(rnd) * 0.02) * adsr(t, 0.5, 0.5, 0.65, 0.8, 0.5);
  }, 76),
);
add(
  'synth_keys_bell.wav',
  synth(1.4, (t) => {
    const f = midi(84);
    return soft(
      Math.sin(2 * Math.PI * f * t) * Math.exp(-t * 2) +
        Math.sin(2 * Math.PI * f * 2.76 * t) * Math.exp(-t * 3.2) * 0.4 +
        Math.sin(2 * Math.PI * f * 5.4 * t) * Math.exp(-t * 5) * 0.15,
    );
  }, 77),
);
add(
  'synth_fm_stab.wav',
  synth(0.5, (t) => {
    const car = midi(57);
    const mod = car * 2.0;
    const idx = 4 * Math.exp(-t * 8);
    return Math.sin(2 * Math.PI * car * t + idx * Math.sin(2 * Math.PI * mod * t)) * adsr(t, 0.005, 0.12, 0.25, 0.2, 0.08);
  }, 78),
);
add(
  'synth_arp.wav',
  synth(0.35, (t) => soft(saw(midi(79) * t) * 0.6) * adsr(t, 0.002, 0.08, 0.15, 0.12, 0.05), 79),
);
add(
  'synth_supersaw.wav',
  synth(1.0, (t) => {
    const f = midi(64);
    const det = [-0.12, -0.05, 0, 0.05, 0.12];
    let v = 0;
    for (const d of det) v += saw((f + d) * t);
    return soft(v / 3) * adsr(t, 0.04, 0.2, 0.6, 0.35, 0.25);
  }, 80),
);
add(
  'synth_pulse_width.wav',
  synth(0.95, (t) => {
    const pw = 0.2 + 0.3 * (0.5 + 0.5 * Math.sin(2 * Math.PI * 3 * t));
    return soft(square(midi(62) * t, pw) * 0.5) * adsr(t, 0.02, 0.15, 0.5, 0.3, 0.25);
  }, 81),
);
add(
  'synth_hoover.wav',
  synth(1.1, (t) => {
    const f = midi(48);
    return soft(saw(f * t) * 0.5 + saw(f * 1.007 * t) * 0.5 + saw(f * 0.5 * t) * 0.35) * adsr(t, 0.03, 0.2, 0.7, 0.35, 0.35);
  }, 82),
);
add(
  'synth_chord_minor.wav',
  synth(1.3, (t) => {
    const freqs = [midi(60), midi(63), midi(67), midi(70)];
    let v = 0;
    for (const f of freqs) v += saw(f * t) * 0.35 + Math.sin(2 * Math.PI * f * t) * 0.2;
    return soft(v / 2) * adsr(t, 0.05, 0.25, 0.55, 0.45, 0.3);
  }, 83),
);
add(
  'synth_chord_maj7.wav',
  synth(1.4, (t) => {
    const freqs = [midi(60), midi(64), midi(67), midi(71)];
    let v = 0;
    for (const f of freqs) v += tri(f * t) * 0.45;
    return soft(v) * adsr(t, 0.08, 0.3, 0.6, 0.5, 0.3);
  }, 84),
);

// ─── Guitar ──────────────────────────────────────────────
add('guitar_e.wav', pluck(1.4, midi(40), 0.95, 91));
add('guitar_a.wav', pluck(1.3, midi(45), 0.9, 92));
add('guitar_d.wav', pluck(1.2, midi(50), 0.9, 93));
add('guitar_g.wav', pluck(1.1, midi(55), 0.88, 94));
add('guitar_b.wav', pluck(1.0, midi(59), 0.85, 95));
add('guitar_e_high.wav', pluck(0.95, midi(64), 0.82, 96));
add(
  'guitar_chord_open.wav',
  (() => {
    const strings = [midi(40), midi(47), midi(52), midi(56), midi(59), midi(64)].map((f, i) =>
      pluck(1.5, f, 0.75 - i * 0.04, 100 + i),
    );
    const len = Math.max(...strings.map((s) => s.length));
    const out = new Float32Array(len);
    for (const s of strings) {
      for (let i = 0; i < s.length; i++) out[i]! += s[i]! * 0.28;
    }
    for (let i = 0; i < out.length; i++) out[i] = soft(out[i]!);
    return out;
  })(),
);
add(
  'guitar_power_chord.wav',
  (() => {
    const strings = [midi(48), midi(55), midi(60)].map((f, i) => pluck(1.2, f, 0.92, 110 + i));
    const len = Math.max(...strings.map((s) => s.length));
    const out = new Float32Array(len);
    for (const s of strings) {
      for (let i = 0; i < s.length; i++) out[i]! += s[i]! * 0.4;
    }
    for (let i = 0; i < out.length; i++) out[i] = soft(out[i]!);
    return out;
  })(),
);
add(
  'guitar_mute.wav',
  synth(0.18, (t, rnd) => {
    const f = midi(52);
    return (saw(f * t) * 0.3 + noise(rnd) * 0.25) * Math.exp(-t * 35);
  }, 120),
);
add(
  'guitar_harmonics.wav',
  synth(1.6, (t) => {
    const f = midi(64);
    return soft(
      Math.sin(2 * Math.PI * f * 2 * t) * Math.exp(-t * 1.5) * 0.5 +
        Math.sin(2 * Math.PI * f * 3 * t) * Math.exp(-t * 2) * 0.35 +
        Math.sin(2 * Math.PI * f * 4 * t) * Math.exp(-t * 2.5) * 0.2,
    );
  }, 121),
);

// ─── Keys / Piano ────────────────────────────────────────
function pianoHit(freq: number, duration: number, seed: number): Float32Array {
  return synth(
    duration,
    (t) => {
      const env = Math.exp(-t * 2.8);
      return soft(
        Math.sin(2 * Math.PI * freq * t) * env +
          Math.sin(2 * Math.PI * freq * 2 * t) * Math.exp(-t * 4) * 0.35 +
          Math.sin(2 * Math.PI * freq * 3 * t) * Math.exp(-t * 6) * 0.12 +
          Math.sin(2 * Math.PI * freq * 4.2 * t) * Math.exp(-t * 9) * 0.05,
      );
    },
    seed,
  );
}
add('piano_c3.wav', pianoHit(midi(48), 1.8, 131));
add('piano_e3.wav', pianoHit(midi(52), 1.7, 132));
add('piano_g3.wav', pianoHit(midi(55), 1.6, 133));
add('piano_c4.wav', pianoHit(midi(60), 1.5, 134));
add('piano_e4.wav', pianoHit(midi(64), 1.4, 135));
add(
  'piano_chord.wav',
  (() => {
    const notes = [midi(48), midi(52), midi(55), midi(60)].map((f, i) => pianoHit(f, 2.0, 140 + i));
    const len = Math.max(...notes.map((n) => n.length));
    const out = new Float32Array(len);
    for (const n of notes) {
      for (let i = 0; i < n.length; i++) out[i]! += n[i]! * 0.32;
    }
    for (let i = 0; i < out.length; i++) out[i] = soft(out[i]!);
    return out;
  })(),
);
add(
  'epiano.wav',
  synth(1.5, (t) => {
    const f = midi(64);
    const trem = 0.85 + 0.15 * Math.sin(2 * Math.PI * 5 * t);
    return soft(
      Math.sin(2 * Math.PI * f * t) * Math.exp(-t * 2) +
        Math.sin(2 * Math.PI * f * 2 * t + 0.3) * Math.exp(-t * 3.5) * 0.45,
    ) * trem;
  }, 150),
);
add(
  'organ.wav',
  synth(1.8, (t) => {
    const f = midi(60);
    const draw = [1, 0.6, 0.4, 0.35, 0.2, 0.15];
    let v = 0;
    for (let h = 1; h <= draw.length; h++) v += Math.sin(2 * Math.PI * f * h * t) * draw[h - 1]!;
    return soft(v * 0.45) * adsr(t, 0.02, 0.05, 0.85, 0.25, 1.2);
  }, 151),
);

// ─── Strings ─────────────────────────────────────────────
add(
  'strings_pad.wav',
  synth(2.5, (t) => {
    const freqs = [midi(57), midi(60), midi(64), midi(67)];
    let v = 0;
    for (let i = 0; i < freqs.length; i++) {
      const f = freqs[i]!;
      const vib = 1 + 0.002 * Math.sin(2 * Math.PI * (5 + i * 0.3) * t);
      v += saw(f * vib * t) * 0.2 + Math.sin(2 * Math.PI * f * vib * t) * 0.25;
    }
    return soft(v) * adsr(t, 0.4, 0.5, 0.75, 0.7, 0.6);
  }, 161),
);
add(
  'violin_lead.wav',
  synth(1.6, (t) => {
    const f = midi(76);
    const vib = 1 + 0.004 * Math.sin(2 * Math.PI * 5.5 * t);
    return soft(saw(f * vib * t) * 0.35 + Math.sin(2 * Math.PI * f * vib * t) * 0.55) * adsr(t, 0.08, 0.2, 0.7, 0.4, 0.7);
  }, 162),
);
add(
  'cello.wav',
  synth(1.8, (t) => {
    const f = midi(45);
    const vib = 1 + 0.003 * Math.sin(2 * Math.PI * 4.8 * t);
    return soft(saw(f * vib * t) * 0.4 + Math.sin(2 * Math.PI * f * vib * t) * 0.5) * adsr(t, 0.1, 0.25, 0.75, 0.45, 0.7);
  }, 163),
);

// ─── Brass / Winds ───────────────────────────────────────
add(
  'brass_stab.wav',
  synth(0.55, (t) => {
    const f = midi(60);
    return soft(
      saw(f * t) * 0.4 +
        saw(f * 1.5 * t) * 0.2 +
        Math.sin(2 * Math.PI * f * t) * 0.35,
    ) * adsr(t, 0.02, 0.1, 0.4, 0.2, 0.12);
  }, 171),
);
add(
  'trumpet.wav',
  synth(1.0, (t) => {
    const f = midi(67);
    return soft(
      Math.sin(2 * Math.PI * f * t) +
        Math.sin(2 * Math.PI * f * 2 * t) * 0.35 +
        Math.sin(2 * Math.PI * f * 3 * t) * 0.15,
    ) * adsr(t, 0.04, 0.15, 0.65, 0.3, 0.35);
  }, 172),
);
add(
  'flute.wav',
  synth(1.2, (t, rnd) => {
    const f = midi(72);
    const breath = noise(rnd) * 0.04 * (1 - Math.exp(-t * 20));
    return soft(Math.sin(2 * Math.PI * f * t) * 0.7 + breath) * adsr(t, 0.06, 0.15, 0.7, 0.35, 0.45);
  }, 173),
);
add(
  'sax.wav',
  synth(1.1, (t) => {
    const f = midi(58);
    const vib = 1 + 0.003 * Math.sin(2 * Math.PI * 4.2 * t);
    return soft(
      Math.sin(2 * Math.PI * f * vib * t) * 0.55 +
        Math.sin(2 * Math.PI * f * 2 * vib * t) * 0.3 +
        saw(f * vib * t) * 0.15,
    ) * adsr(t, 0.05, 0.18, 0.7, 0.35, 0.4);
  }, 174),
);

// ─── World / melodic perc ────────────────────────────────
add(
  'kalimba.wav',
  synth(1.3, (t) => {
    const f = midi(76);
    return soft(
      Math.sin(2 * Math.PI * f * t) * Math.exp(-t * 3) +
        Math.sin(2 * Math.PI * f * 3.2 * t) * Math.exp(-t * 6) * 0.25,
    );
  }, 181),
);
add(
  'marimba.wav',
  synth(1.0, (t) => {
    const f = midi(67);
    return soft(
      Math.sin(2 * Math.PI * f * t) * Math.exp(-t * 5) +
        Math.sin(2 * Math.PI * f * 4 * t) * Math.exp(-t * 12) * 0.2,
    );
  }, 182),
);
add(
  'steel_drum.wav',
  synth(1.2, (t) => {
    const f = midi(72);
    return soft(
      Math.sin(2 * Math.PI * f * t) * Math.exp(-t * 2.5) +
        Math.sin(2 * Math.PI * f * 2.1 * t) * Math.exp(-t * 4) * 0.4 +
        Math.sin(2 * Math.PI * f * 3.3 * t) * Math.exp(-t * 6) * 0.2,
    );
  }, 183),
);
add(
  'bell_church.wav',
  synth(2.2, (t) => {
    const f = midi(67);
    return soft(
      Math.sin(2 * Math.PI * f * t) * Math.exp(-t * 1.2) +
        Math.sin(2 * Math.PI * f * 2.4 * t) * Math.exp(-t * 1.8) * 0.4 +
        Math.sin(2 * Math.PI * f * 3.1 * t) * Math.exp(-t * 2.4) * 0.2,
    );
  }, 184),
);

// ─── FX ──────────────────────────────────────────────────
add(
  'fx.wav',
  synth(1.2, (t) => Math.sin(2 * Math.PI * (200 + t * 900) * t) * Math.sin((Math.PI * t) / 1.2) * 0.45, 191),
);
add(
  'fx_riser.wav',
  synth(2.0, (t, rnd) => {
    const f = 80 + t * t * 1200;
    return soft(saw(f * t) * 0.4 + noise(rnd) * 0.15 * t) * (t / 2);
  }, 192),
);
add(
  'fx_downlifter.wav',
  synth(1.6, (t, rnd) => {
    const f = 900 - t * 500;
    return soft(saw(f * t) * 0.35 + noise(rnd) * 0.2) * (1 - t / 1.6);
  }, 193),
);
add(
  'fx_impact.wav',
  synth(1.0, (t, rnd) => {
    const boom = Math.sin(2 * Math.PI * (80 * Math.exp(-t * 6) + 30) * t) * Math.exp(-t * 3);
    const noiseBurst = noise(rnd) * Math.exp(-t * 8) * 0.5;
    return soft(boom + noiseBurst);
  }, 194),
);
add(
  'fx_noise_hit.wav',
  synth(0.4, (t, rnd) => noise(rnd) * Math.exp(-t * 12) * 0.7, 195),
);
add(
  'fx_laser.wav',
  synth(0.55, (t) => Math.sin(2 * Math.PI * (1200 * Math.exp(-t * 6) + 100) * t) * Math.exp(-t * 4), 196),
);

// Write WAVs + peak/duration manifest for fast client boot (no decode-on-load)
type ManifestEntry = { id: string; file: string; duration: number; peaks: number[] };
const manifest: ManifestEntry[] = [];

function peaksFrom(data: Float32Array, buckets = 96): number[] {
  const block = Math.max(1, Math.floor(data.length / buckets));
  const peaks: number[] = [];
  for (let i = 0; i < buckets; i++) {
    const start = i * block;
    const end = Math.min(data.length, start + block);
    let max = 0;
    for (let j = start; j < end; j++) {
      const v = Math.abs(data[j]!);
      if (v > max) max = v;
    }
    peaks.push(Math.round(max * 1000) / 1000);
  }
  return peaks;
}

for (const { file, data } of pack) {
  writeWav(join(outDir, file), data);
  const id = file.replace(/\.wav$/i, '');
  manifest.push({
    id,
    file,
    duration: Math.round((data.length / SR) * 1000) / 1000,
    peaks: peaksFrom(data),
  });
  console.log('wrote', file);
}

writeFileSync(join(outDir, 'manifest.json'), JSON.stringify({ version: 1, samples: manifest }));
console.log(`\n${pack.length} starter samples + manifest ready in public/samples`);
