/** Capture mic / interface / Bluetooth audio into a WAV blob. */

export type AudioDevice = { deviceId: string; label: string };

export async function listAudioInputs(): Promise<AudioDevice[]> {
  // Permission first so labels populate
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach((t) => t.stop());
  } catch {
    /* may already be granted or denied */
  }
  const devices = await navigator.mediaDevices.enumerateDevices();
  return devices
    .filter((d) => d.kind === 'audioinput')
    .map((d, i) => ({
      deviceId: d.deviceId,
      label: d.label || `Input ${i + 1}`,
    }));
}

function encodeWav(samples: Float32Array, sampleRate: number): Blob {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  const writeStr = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
  };
  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + samples.length * 2, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, 'data');
  view.setUint32(40, samples.length * 2, true);
  let offset = 44;
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]!));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    offset += 2;
  }
  return new Blob([buffer], { type: 'audio/wav' });
}

export class InputRecorder {
  private stream: MediaStream | null = null;
  private context: AudioContext | null = null;
  private processor: ScriptProcessorNode | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private chunks: Float32Array[] = [];
  private sampleRate = 44100;
  private level = 0;

  get inputLevel(): number {
    return this.level;
  }

  async start(deviceId?: string): Promise<void> {
    await this.stop();
    this.chunks = [];
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        deviceId: deviceId && deviceId !== 'default' ? { exact: deviceId } : undefined,
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
      },
    });
    this.context = new AudioContext();
    this.sampleRate = this.context.sampleRate;
    this.source = this.context.createMediaStreamSource(this.stream);
    // ScriptProcessor is deprecated but widely supported (incl. iPad Safari)
    this.processor = this.context.createScriptProcessor(4096, 1, 1);
    this.processor.onaudioprocess = (e) => {
      const input = e.inputBuffer.getChannelData(0);
      this.chunks.push(new Float32Array(input));
      let peak = 0;
      for (let i = 0; i < input.length; i++) peak = Math.max(peak, Math.abs(input[i]!));
      this.level = peak;
    };
    this.source.connect(this.processor);
    this.processor.connect(this.context.destination);
    // Mute monitoring through destination by gaining 0 — keep graph alive
    const mute = this.context.createGain();
    mute.gain.value = 0;
    this.processor.disconnect();
    this.source.connect(this.processor);
    this.processor.connect(mute);
    mute.connect(this.context.destination);
  }

  async stop(): Promise<Blob | null> {
    if (this.processor) {
      this.processor.onaudioprocess = null;
      this.processor.disconnect();
      this.processor = null;
    }
    this.source?.disconnect();
    this.source = null;
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    const ctx = this.context;
    this.context = null;
    await ctx?.close().catch(() => undefined);

    if (!this.chunks.length) return null;
    let total = 0;
    for (const c of this.chunks) total += c.length;
    const merged = new Float32Array(total);
    let offset = 0;
    for (const c of this.chunks) {
      merged.set(c, offset);
      offset += c.length;
    }
    this.chunks = [];
    this.level = 0;
    return encodeWav(merged, this.sampleRate);
  }
}
