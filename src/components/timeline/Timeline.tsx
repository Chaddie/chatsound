import { useEffect, useMemo, useRef, type PointerEvent as ReactPointerEvent } from 'react';
import { useStudio } from '../../store/studioStore';
import { TrackLane } from './TrackLane';
import { snapBeat } from '../../lib/time';

const MIN_BEATS = 64;
const PAD_BEATS = 16;

export function Timeline() {
  const tracks = useStudio((s) => s.tracks);
  const clips = useStudio((s) => s.clips);
  const samples = useStudio((s) => s.samples);
  const pxPerBeat = useStudio((s) => s.pxPerBeat);
  const positionBeat = useStudio((s) => s.positionBeat);
  const playing = useStudio((s) => s.playing);
  const loop = useStudio((s) => s.loop);
  const selectedTrackId = useStudio((s) => s.selectedTrackId);
  const selectedClipId = useStudio((s) => s.selectedClipId);
  const snap = useStudio((s) => s.snap);
  const seek = useStudio((s) => s.seek);
  const selectTrack = useStudio((s) => s.selectTrack);
  const selectClip = useStudio((s) => s.selectClip);
  const addClipFromSample = useStudio((s) => s.addClipFromSample);
  const commitClipEdit = useStudio((s) => s.commitClipEdit);
  const updateTrack = useStudio((s) => s.updateTrack);
  const removeTrack = useStudio((s) => s.removeTrack);

  const scrollRef = useRef<HTMLDivElement>(null);
  const scrubbing = useRef(false);

  const totalBeats = useMemo(() => {
    const clipEnd = clips.reduce((m, c) => Math.max(m, c.startBeat + c.durationBeats), 0);
    const loopEnd = loop.endBeat;
    return Math.max(MIN_BEATS, Math.ceil(clipEnd + PAD_BEATS), Math.ceil(loopEnd + PAD_BEATS));
  }, [clips, loop.endBeat]);

  const width = totalBeats * pxPerBeat;

  const marks = useMemo(() => {
    const out: { beat: number; bar: boolean }[] = [];
    for (let b = 0; b <= totalBeats; b++) {
      if (b % 1 === 0) out.push({ beat: b, bar: b % 4 === 0 });
    }
    return out;
  }, [totalBeats]);

  const sampleMap = useMemo(() => new Map(samples.map((s) => [s.id, s])), [samples]);

  const beatFromRulerX = (clientX: number) => {
    const el = scrollRef.current;
    if (!el) return 0;
    const rect = el.getBoundingClientRect();
    const x = clientX - rect.left + el.scrollLeft - 160;
    const grid = snap || 0.25;
    return snapBeat(Math.max(0, x / pxPerBeat), grid);
  };

  // Playhead follow
  useEffect(() => {
    if (!playing || scrubbing.current) return;
    const el = scrollRef.current;
    if (!el) return;
    const x = 160 + positionBeat * pxPerBeat;
    const left = el.scrollLeft;
    const right = left + el.clientWidth;
    const margin = 80;
    if (x > right - margin) {
      el.scrollLeft = x - el.clientWidth + margin * 2;
    } else if (x < left + 160 + margin) {
      el.scrollLeft = Math.max(0, x - 160 - margin);
    }
  }, [positionBeat, playing, pxPerBeat]);

  const onRulerPointerDown = (e: ReactPointerEvent) => {
    if ((e.target as HTMLElement).closest('.loop-handle')) return;
    scrubbing.current = true;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    seek(beatFromRulerX(e.clientX));
  };

  const onRulerPointerMove = (e: ReactPointerEvent) => {
    if (!scrubbing.current) return;
    seek(beatFromRulerX(e.clientX));
  };

  const onRulerPointerUp = () => {
    scrubbing.current = false;
  };

  const onLoopHandle = (which: 'start' | 'end', e: ReactPointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    const target = e.currentTarget as HTMLElement;
    target.setPointerCapture(e.pointerId);
    const grid = snap || 0.25;
    useStudio.getState().pushHistory();

    const onMoveLive = (ev: PointerEvent) => {
      const beat = beatFromRulerX(ev.clientX);
      if (which === 'start') {
        useStudio.setState((s) => ({
          loop: {
            ...s.loop,
            enabled: true,
            startBeat: Math.min(beat, s.loop.endBeat - grid),
          },
        }));
      } else {
        useStudio.setState((s) => ({
          loop: {
            ...s.loop,
            enabled: true,
            endBeat: Math.max(beat, s.loop.startBeat + grid),
          },
        }));
      }
    };
    const onUpLive = () => {
      void useStudio.getState().reschedule();
      void useStudio.getState().persist();
      target.releasePointerCapture(e.pointerId);
      window.removeEventListener('pointermove', onMoveLive);
      window.removeEventListener('pointerup', onUpLive);
    };
    window.addEventListener('pointermove', onMoveLive);
    window.addEventListener('pointerup', onUpLive);
  };

  return (
    <div
      className="timeline-wrap"
      ref={scrollRef}
      style={{ ['--px-beat' as string]: `${pxPerBeat}px` }}
      onDragOver={(e) => e.preventDefault()}
      onWheel={(e) => {
        if (e.ctrlKey || e.metaKey) {
          e.preventDefault();
          const next = clampZoom(pxPerBeat + (e.deltaY > 0 ? -4 : 4));
          useStudio.getState().setPxPerBeat(next);
        }
      }}
    >
      <div style={{ minWidth: 160 + width }}>
        <div
          className="timeline-ruler"
          style={{ marginLeft: 160, width, position: 'relative' }}
          onPointerDown={onRulerPointerDown}
          onPointerMove={onRulerPointerMove}
          onPointerUp={onRulerPointerUp}
          onPointerCancel={onRulerPointerUp}
        >
          {marks.map((m) =>
            m.bar || m.beat % 1 === 0 ? (
              <div
                key={m.beat}
                className={`ruler-mark ${m.bar ? 'bar' : ''}`}
                style={{ left: m.beat * pxPerBeat }}
              >
                {m.bar ? Math.floor(m.beat / 4) + 1 : ''}
              </div>
            ) : null,
          )}

          <div
            className={`loop-region ${loop.enabled ? 'on' : ''}`}
            style={{
              left: loop.startBeat * pxPerBeat,
              width: Math.max(4, (loop.endBeat - loop.startBeat) * pxPerBeat),
            }}
          >
            <div
              className="loop-handle start"
              onPointerDown={(e) => onLoopHandle('start', e)}
              title="Loop start"
            />
            <div
              className="loop-handle end"
              onPointerDown={(e) => onLoopHandle('end', e)}
              title="Loop end"
            />
          </div>
        </div>

        <div style={{ position: 'relative' }}>
          <div
            className={`playhead ${scrubbing.current ? 'seeking' : ''}`}
            style={{ left: 160 + positionBeat * pxPerBeat }}
          />

          {tracks.map((track) => (
            <TrackLane
              key={track.id}
              track={track}
              clips={clips.filter((c) => c.trackId === track.id)}
              sampleMap={sampleMap}
              pxPerBeat={pxPerBeat}
              width={width}
              selected={selectedTrackId === track.id}
              selectedClipId={selectedClipId}
              onSelectTrack={() => selectTrack(track.id)}
              onSelectClip={selectClip}
              onDropSample={(sampleId, beat) => addClipFromSample(sampleId, track.id, beat)}
              onCommitClip={(id, patch) => commitClipEdit(id, patch)}
              onUpdateTrack={(patch) => updateTrack(track.id, patch)}
              onRemoveTrack={() => removeTrack(track.id)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function clampZoom(v: number) {
  return Math.min(160, Math.max(20, v));
}
