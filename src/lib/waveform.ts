/** Downsample an AudioBuffer into peak magnitudes for waveform drawing. */
export function computePeaks(buffer: AudioBuffer, buckets = 128): number[] {
  const channel = buffer.getChannelData(0);
  const block = Math.max(1, Math.floor(channel.length / buckets));
  const peaks: number[] = [];
  for (let i = 0; i < buckets; i++) {
    const start = i * block;
    const end = Math.min(channel.length, start + block);
    let max = 0;
    for (let j = start; j < end; j++) {
      const v = Math.abs(channel[j]!);
      if (v > max) max = v;
    }
    peaks.push(max);
  }
  return peaks;
}

export function drawWaveform(
  ctx: CanvasRenderingContext2D,
  peaks: number[],
  width: number,
  height: number,
  color: string,
  offsetRatio = 0,
  visibleRatio = 1,
): void {
  ctx.clearRect(0, 0, width, height);
  if (!peaks.length) return;

  const start = Math.floor(offsetRatio * peaks.length);
  const count = Math.max(1, Math.floor(visibleRatio * peaks.length));
  const slice = peaks.slice(start, start + count);
  const mid = height / 2;
  const barW = width / slice.length;

  ctx.fillStyle = color;
  for (let i = 0; i < slice.length; i++) {
    const amp = slice[i]! * (height * 0.9);
    const x = i * barW;
    ctx.fillRect(x, mid - amp / 2, Math.max(1, barW * 0.85), Math.max(1, amp));
  }
}
