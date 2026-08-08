import * as Tone from 'tone';

export type MidiDeviceInfo = { id: string; name: string };

export type MidiNoteEvent = {
  note: number;
  velocity: number;
  startMs: number;
  endMs?: number;
};

type Handler = (note: number, velocity: number, down: boolean) => void;

function getMidiAccess(options?: MIDIOptions): Promise<MIDIAccess> {
  const req = (
    navigator as Navigator & {
      requestMIDIAccess?: (options?: MIDIOptions) => Promise<MIDIAccess>;
    }
  ).requestMIDIAccess;
  if (!req) return Promise.reject(new Error('Web MIDI unavailable'));
  return req.call(navigator, options);
}

export async function listMidiInputs(): Promise<MidiDeviceInfo[]> {
  try {
    const access = await getMidiAccess({ sysex: false });
    const devices: MidiDeviceInfo[] = [];
    access.inputs.forEach((input) => {
      devices.push({ id: input.id, name: input.name || input.id });
    });
    return devices;
  } catch {
    return [];
  }
}

export class MidiController {
  private access: MIDIAccess | null = null;
  private input: MIDIInput | null = null;
  private synth: Tone.PolySynth | null = null;
  private handler: Handler | null = null;
  private recording = false;
  private recordOrigin = 0;
  private active = new Map<number, MidiNoteEvent>();
  private events: MidiNoteEvent[] = [];
  private monitor = true;

  async init(): Promise<boolean> {
    try {
      this.access = await getMidiAccess({ sysex: false });
      await Tone.start();
      if (!this.synth) {
        this.synth = new Tone.PolySynth(Tone.Synth, {
          oscillator: { type: 'triangle' },
          envelope: { attack: 0.01, decay: 0.2, sustain: 0.4, release: 0.4 },
        }).toDestination();
        this.synth.volume.value = -8;
      }
      return true;
    } catch {
      return false;
    }
  }

  setMonitor(on: boolean) {
    this.monitor = on;
  }

  onNote(handler: Handler | null) {
    this.handler = handler;
  }

  async selectInput(deviceId: string | null): Promise<void> {
    if (this.input) {
      this.input.onmidimessage = null;
      this.input = null;
    }
    if (!deviceId || !this.access) return;
    const input = this.access.inputs.get(deviceId);
    if (!input) return;
    this.input = input;
    input.onmidimessage = (e) => this.handleMessage(e);
  }

  startRecording() {
    this.recording = true;
    this.recordOrigin = performance.now();
    this.events = [];
    this.active.clear();
  }

  stopRecording(): MidiNoteEvent[] {
    this.recording = false;
    const now = performance.now() - this.recordOrigin;
    for (const ev of this.active.values()) {
      ev.endMs = now;
      this.events.push(ev);
    }
    this.active.clear();
    return [...this.events];
  }

  private handleMessage(e: MIDIMessageEvent) {
    const data = e.data;
    if (!data || data.length < 2) return;
    const status = data[0]! & 0xf0;
    const note = data[1]!;
    const velocity = data[2] ?? 0;

    if (status === 0x90 && velocity > 0) {
      this.noteOn(note, velocity);
    } else if (status === 0x80 || (status === 0x90 && velocity === 0)) {
      this.noteOff(note);
    }
  }

  private noteOn(note: number, velocity: number) {
    if (this.monitor && this.synth) {
      const freq = Tone.Frequency(note, 'midi').toFrequency();
      this.synth.triggerAttack(freq, Tone.now(), velocity / 127);
    }
    this.handler?.(note, velocity, true);
    if (this.recording) {
      this.active.set(note, {
        note,
        velocity,
        startMs: performance.now() - this.recordOrigin,
      });
    }
  }

  private noteOff(note: number) {
    if (this.monitor && this.synth) {
      const freq = Tone.Frequency(note, 'midi').toFrequency();
      this.synth.triggerRelease(freq, Tone.now());
    }
    this.handler?.(note, 0, false);
    if (this.recording) {
      const ev = this.active.get(note);
      if (ev) {
        ev.endMs = performance.now() - this.recordOrigin;
        this.events.push(ev);
        this.active.delete(note);
      }
    }
  }

  dispose() {
    if (this.input) this.input.onmidimessage = null;
    this.synth?.dispose();
    this.synth = null;
  }
}

/** Render recorded MIDI notes to a WAV blob via Tone.Offline. */
export async function renderMidiNotesToWav(events: MidiNoteEvent[]): Promise<Blob | null> {
  if (!events.length) return null;
  const durationSec = Math.max(...events.map((e) => (e.endMs ?? e.startMs + 200) / 1000)) + 0.4;

  const buffer = await Tone.Offline(() => {
    const synth = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: 'triangle' },
      envelope: { attack: 0.01, decay: 0.2, sustain: 0.35, release: 0.35 },
    }).toDestination();
    for (const ev of events) {
      const start = ev.startMs / 1000;
      const end = (ev.endMs ?? ev.startMs + 200) / 1000;
      const freq = Tone.Frequency(ev.note, 'midi').toFrequency();
      synth.triggerAttackRelease(freq, Math.max(0.05, end - start), start, ev.velocity / 127);
    }
  }, durationSec);

  const ab = buffer.get();
  if (!ab) return null;
  return audioBufferToWav(ab);
}

function audioBufferToWav(buffer: AudioBuffer): Blob {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const samples = buffer.length;
  const blockAlign = (numChannels * 16) / 8;
  const dataSize = samples * blockAlign;
  const arrayBuffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(arrayBuffer);
  const writeStr = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
  };
  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true);
  writeStr(36, 'data');
  view.setUint32(40, dataSize, true);
  const channels: Float32Array[] = [];
  for (let c = 0; c < numChannels; c++) channels.push(buffer.getChannelData(c));
  let offset = 44;
  for (let i = 0; i < samples; i++) {
    for (let c = 0; c < numChannels; c++) {
      const sample = Math.max(-1, Math.min(1, channels[c]![i]!));
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
      offset += 2;
    }
  }
  return new Blob([arrayBuffer], { type: 'audio/wav' });
}
