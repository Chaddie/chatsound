import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import type { Clip, Sample } from '../../types';
import { drawWaveform } from '../../lib/waveform';
import { secondsToBeats, snapBeat } from '../../lib/time';
import { useStudio } from '../../store/studioStore';

interface Props {
  clip: Clip;
  sample: Sample;
  color: string;
  pxPerBeat: number;
  selected: boolean;
  onSelect: () => void;
  /** Commit geometry after drag ends — does not fire during move. */
  onCommit: (patch: {
    startBeat: number;
    durationBeats: number;
    offsetBeats: number;
  }) => void;
  beatFromClientX: (clientX: number, snap?: boolean) => number;
}

type DragMode = 'move' | 'resize-r' | 'resize-l';

export function ClipBlock({
  clip,
  sample,
  color,
  pxPerBeat,
  selected,
  onSelect,
  onCommit,
  beatFromClientX,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const bpm = useStudio((s) => s.bpm);
  const snap = useStudio((s) => s.snap);

  // Local preview while dragging — store only updates on pointerup
  const [preview, setPreview] = useState<{
    startBeat: number;
    durationBeats: number;
    offsetBeats: number;
  } | null>(null);

  const dragRef = useRef<{
    mode: DragMode;
    originX: number;
    originStart: number;
    originDur: number;
    originOffset: number;
  } | null>(null);

  const view = preview ?? {
    startBeat: clip.startBeat,
    durationBeats: clip.durationBeats,
    offsetBeats: clip.offsetBeats,
  };

  useEffect(() => {
    // Reset preview if clip changed externally (undo, etc.)
    setPreview(null);
  }, [clip.id, clip.startBeat, clip.durationBeats, clip.offsetBeats]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const w = Math.max(40, view.durationBeats * pxPerBeat);
    const h = 68;
    canvas.width = w * 2;
    canvas.height = h * 2;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(2, 2);
    const totalBeats = Math.max(0.01, secondsToBeats(sample.duration, bpm));
    const offsetRatio = view.offsetBeats / totalBeats;
    const visibleRatio = view.durationBeats / totalBeats;
    drawWaveform(ctx, sample.peaks, w, h, 'rgba(10,12,8,0.55)', offsetRatio, visibleRatio);
  }, [view, sample, pxPerBeat, bpm]);

  const onPointerDown = (e: ReactPointerEvent, mode: DragMode) => {
    e.stopPropagation();
    e.preventDefault();
    onSelect();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = {
      mode,
      originX: e.clientX,
      originStart: clip.startBeat,
      originDur: clip.durationBeats,
      originOffset: clip.offsetBeats,
    };
    setPreview({
      startBeat: clip.startBeat,
      durationBeats: clip.durationBeats,
      offsetBeats: clip.offsetBeats,
    });
  };

  const onPointerMove = (e: ReactPointerEvent) => {
    const drag = dragRef.current;
    if (!drag) return;

    if (drag.mode === 'move') {
      const deltaBeats = (e.clientX - drag.originX) / pxPerBeat;
      const startBeat = snapBeat(Math.max(0, drag.originStart + deltaBeats), snap);
      setPreview((p) =>
        p ? { ...p, startBeat } : { startBeat, durationBeats: drag.originDur, offsetBeats: drag.originOffset },
      );
    } else if (drag.mode === 'resize-r') {
      const end = beatFromClientX(e.clientX, true);
      const start = preview?.startBeat ?? clip.startBeat;
      const offset = preview?.offsetBeats ?? clip.offsetBeats;
      const maxDur = Math.max(snap || 0.25, secondsToBeats(sample.duration, bpm) - offset);
      const durationBeats = Math.min(maxDur, Math.max(snap || 0.25, end - start));
      setPreview({
        startBeat: start,
        offsetBeats: offset,
        durationBeats,
      });
    } else {
      const rawStart = beatFromClientX(e.clientX, false);
      let newStart = snapBeat(Math.max(0, rawStart), snap);
      const snappedDelta = newStart - drag.originStart;
      let newOffset = drag.originOffset + snappedDelta;
      let newDur = drag.originDur - snappedDelta;
      if (newOffset < 0) {
        newStart = snapBeat(drag.originStart - drag.originOffset, snap);
        newOffset = 0;
        newDur = drag.originDur + drag.originOffset;
      }
      const min = snap || 0.25;
      if (newDur >= min) {
        setPreview({ startBeat: newStart, offsetBeats: newOffset, durationBeats: newDur });
      }
    }
  };

  const onPointerUp = () => {
    const drag = dragRef.current;
    dragRef.current = null;
    if (!drag || !preview) {
      setPreview(null);
      return;
    }
    const changed =
      preview.startBeat !== clip.startBeat ||
      preview.durationBeats !== clip.durationBeats ||
      preview.offsetBeats !== clip.offsetBeats;
    if (changed) {
      onCommit(preview);
    }
    setPreview(null);
  };

  return (
    <div
      className={`clip ${selected ? 'selected' : ''} ${preview ? 'dragging' : ''}`}
      style={{
        left: view.startBeat * pxPerBeat,
        width: Math.max(12, view.durationBeats * pxPerBeat),
        background: color,
      }}
      onPointerDown={(e) => onPointerDown(e, 'move')}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onClick={(e) => {
        e.stopPropagation();
        onSelect();
      }}
    >
      <div className="clip-handle left" onPointerDown={(e) => onPointerDown(e, 'resize-l')} />
      <div className="clip-label">{sample.name}</div>
      <canvas ref={canvasRef} />
      <div className="clip-handle right" onPointerDown={(e) => onPointerDown(e, 'resize-r')} />
    </div>
  );
}
