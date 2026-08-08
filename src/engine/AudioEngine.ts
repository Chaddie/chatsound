import * as Tone from 'tone';
import type { Clip, Sample, Track } from '../types';
import { beatsToSeconds } from '../lib/time';
import { computePeaks } from '../lib/waveform';

type TrackNodes = {
  channel: Tone.Channel;
};

class AudioEngine {
  private ready = false;
  private tracks = new Map<string, TrackNodes>();
  private buffers = new Map<string, Tone.ToneAudioBuffer>();
  /** Synced players for the current arrangement — disposed without Transport.cancel(0). */
  private clipPlayers: Tone.Player[] = [];
  private metronome: Tone.MembraneSynth | null = null;
  private metroEvent: number | null = null;
  private master: Tone.Volume | null = null;
  private analyser: Tone.Analyser | null = null;

  private ensureGraph(): { master: Tone.Volume; analyser: Tone.Analyser } {
    if (!this.master) {
      this.master = new Tone.Volume(0).toDestination();
      this.analyser = new Tone.Analyser('waveform', 256);
      this.master.connect(this.analyser);
    }
    if (!this.metronome) {
      this.metronome = new Tone.MembraneSynth({
        pitchDecay: 0.008,
        octaves: 2,
        envelope: { attack: 0.001, decay: 0.1, sustain: 0 },
      }).connect(this.master);
    }
    return { master: this.master, analyser: this.analyser! };
  }

  async init(): Promise<void> {
    if (this.ready) return;
    await Tone.start();
    this.ensureGraph();
    this.ready = true;
  }

  getAnalyser(): Tone.Analyser {
    return this.ensureGraph().analyser;
  }

  setBpm(bpm: number): void {
    Tone.getTransport().bpm.value = bpm;
  }

  getPositionBeats(): number {
    const bpm = Tone.getTransport().bpm.value;
    return (Tone.getTransport().seconds * bpm) / 60;
  }

  setPositionBeats(beats: number): void {
    const bpm = Tone.getTransport().bpm.value;
    Tone.getTransport().seconds = (beats * 60) / bpm;
  }

  async play(): Promise<void> {
    await this.init();
    Tone.getTransport().start();
  }

  pause(): void {
    Tone.getTransport().pause();
  }

  stop(): void {
    Tone.getTransport().stop();
    Tone.getTransport().position = 0;
  }

  ensureTrack(track: Track): TrackNodes {
    const { master } = this.ensureGraph();
    let nodes = this.tracks.get(track.id);
    if (!nodes) {
      const channel = new Tone.Channel({
        volume: Tone.gainToDb(Math.max(0.0001, track.volume)),
        pan: track.pan,
        mute: track.muted,
      }).connect(master);
      nodes = { channel };
      this.tracks.set(track.id, nodes);
    } else {
      nodes.channel.volume.value = Tone.gainToDb(Math.max(0.0001, track.volume));
      nodes.channel.pan.value = track.pan;
      nodes.channel.mute = track.muted;
    }
    return nodes;
  }

  removeTrack(trackId: string): void {
    const nodes = this.tracks.get(trackId);
    if (nodes) {
      nodes.channel.dispose();
      this.tracks.delete(trackId);
    }
  }

  applySoloMute(tracks: Track[]): void {
    const anySolo = tracks.some((t) => t.solo);
    for (const t of tracks) {
      const nodes = this.ensureTrack(t);
      const silenced = t.muted || (anySolo && !t.solo);
      nodes.channel.mute = silenced;
    }
  }

  async loadSample(sample: Sample): Promise<Tone.ToneAudioBuffer> {
    const existing = this.buffers.get(sample.id);
    if (existing?.loaded) return existing;
    const buffer = new Tone.ToneAudioBuffer();
    await buffer.load(sample.url);
    this.buffers.set(sample.id, buffer);
    return buffer;
  }

  registerBuffer(id: string, buffer: Tone.ToneAudioBuffer): void {
    this.buffers.set(id, buffer);
  }

  async decodeFile(file: File | Blob): Promise<{
    buffer: Tone.ToneAudioBuffer;
    duration: number;
    peaks: number[];
    blob: Blob;
  }> {
    await this.init();
    const blob = file instanceof Blob ? file : new Blob([file]);
    const url = URL.createObjectURL(blob);
    const buffer = new Tone.ToneAudioBuffer();
    await buffer.load(url);
    const audioBuffer = buffer.get()!;
    const peaks = computePeaks(audioBuffer, 160);
    return { buffer, duration: buffer.duration, peaks, blob };
  }

  /** Dispose clip players only — leave metronome / other transport events intact. */
  clearClipSchedule(): void {
    for (const player of this.clipPlayers) {
      try {
        player.unsync();
        player.dispose();
      } catch {
        /* already gone */
      }
    }
    this.clipPlayers = [];
  }

  scheduleArrangement(
    clips: Clip[],
    tracks: Track[],
    samples: Map<string, Sample>,
    bpm: number,
    loop: { enabled: boolean; startBeat: number; endBeat: number },
  ): void {
    this.clearClipSchedule();
    this.setBpm(bpm);
    this.applySoloMute(tracks);

    const transport = Tone.getTransport();
    if (loop.enabled && loop.endBeat > loop.startBeat) {
      transport.loop = true;
      transport.loopStart = beatsToSeconds(loop.startBeat, bpm);
      transport.loopEnd = beatsToSeconds(loop.endBeat, bpm);
    } else {
      transport.loop = false;
    }

    for (const clip of clips) {
      const sample = samples.get(clip.sampleId);
      if (!sample) continue;
      const track = tracks.find((t) => t.id === clip.trackId);
      if (!track) continue;
      const nodes = this.ensureTrack(track);
      const buf = this.buffers.get(sample.id);
      if (!buf?.loaded) continue;

      const startSec = beatsToSeconds(clip.startBeat, bpm);
      const offsetSec = beatsToSeconds(clip.offsetBeats, bpm);
      const durSec = beatsToSeconds(clip.durationBeats, bpm);
      const maxDur = Math.max(0.01, buf.duration - offsetSec);
      const playDur = Math.min(durSec, maxDur);

      // Synced Player = Transport-accurate, no per-hit ToneEvent / setTimeout dispose
      const player = new Tone.Player({
        url: buf,
        fadeIn: 0.008,
        fadeOut: 0.02,
      }).connect(nodes.channel);
      player.sync().start(startSec, offsetSec, playDur);
      this.clipPlayers.push(player);
    }
  }

  async loadSamplesById(ids: string[], samples: Map<string, Sample>): Promise<void> {
    const unique = [...new Set(ids)];
    await Promise.all(
      unique.map(async (id) => {
        const sample = samples.get(id);
        if (!sample) return;
        try {
          await this.loadSample(sample);
        } catch {
          /* skip missing */
        }
      }),
    );
  }

  setMetronome(enabled: boolean, bpm: number): void {
    if (this.metroEvent !== null) {
      Tone.getTransport().clear(this.metroEvent);
      this.metroEvent = null;
    }
    if (!enabled) return;
    this.ensureGraph();
    this.setBpm(bpm);
    this.metroEvent = Tone.getTransport().scheduleRepeat((time) => {
      // ticks-based downbeat: 0 when on a bar boundary (4/4)
      const beats = this.getPositionBeats();
      const beatInBar = ((beats % 4) + 4) % 4;
      const onDownbeat = beatInBar < 0.001 || beatInBar > 3.999;
      const note = onDownbeat ? 'C2' : 'G1';
      this.metronome?.triggerAttackRelease(note, '32n', time, onDownbeat ? 0.8 : 0.35);
    }, '4n');
  }

  async bounceWav(
    clips: Clip[],
    tracks: Track[],
    samples: Map<string, Sample>,
    bpm: number,
    durationBeats: number,
  ): Promise<Blob> {
    await this.init();
    const needed = clips.map((c) => c.sampleId);
    await this.loadSamplesById(needed, samples);

    const durationSec = beatsToSeconds(Math.max(durationBeats, 4), bpm);
    const rendered = await Tone.Offline(() => {
      const master = new Tone.Volume(0).toDestination();
      const channelMap = new Map<string, Tone.Channel>();
      const anySolo = tracks.some((t) => t.solo);

      for (const t of tracks) {
        const ch = new Tone.Channel({
          volume: Tone.gainToDb(Math.max(0.0001, t.volume)),
          pan: t.pan,
          mute: t.muted || (anySolo && !t.solo),
        }).connect(master);
        channelMap.set(t.id, ch);
      }

      for (const clip of clips) {
        const sample = samples.get(clip.sampleId);
        const track = tracks.find((tr) => tr.id === clip.trackId);
        const ch = track ? channelMap.get(track.id) : undefined;
        const srcBuf = sample ? this.buffers.get(sample.id) : undefined;
        const audio = srcBuf?.get();
        if (!sample || !track || !ch || !audio) continue;

        const player = new Tone.Player({
          url: new Tone.ToneAudioBuffer(audio),
          fadeIn: 0.008,
          fadeOut: 0.02,
        }).connect(ch);
        const startSec = beatsToSeconds(clip.startBeat, bpm);
        const offsetSec = beatsToSeconds(clip.offsetBeats, bpm);
        const durSec = Math.min(
          beatsToSeconds(clip.durationBeats, bpm),
          Math.max(0.01, audio.duration - offsetSec),
        );
        player.start(startSec, offsetSec, durSec);
      }
    }, durationSec);

    const ab = rendered.get();
    if (!ab) throw new Error('Render produced no audio');
    return audioBufferToWav(ab);
  }
}

function audioBufferToWav(buffer: AudioBuffer): Blob {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const format = 1;
  const bitDepth = 16;
  const samples = buffer.length;
  const blockAlign = (numChannels * bitDepth) / 8;
  const byteRate = sampleRate * blockAlign;
  const dataSize = samples * blockAlign;
  const headerSize = 44;
  const arrayBuffer = new ArrayBuffer(headerSize + dataSize);
  const view = new DataView(arrayBuffer);

  const writeStr = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
  };

  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, format, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitDepth, true);
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

export const audioEngine = new AudioEngine();
