import { useRef } from 'react';
import type { Clip, Sample, Track } from '../../types';
import { ClipBlock } from './ClipBlock';
import { snapBeat } from '../../lib/time';
import { useStudio } from '../../store/studioStore';

interface Props {
  track: Track;
  clips: Clip[];
  sampleMap: Map<string, Sample>;
  pxPerBeat: number;
  width: number;
  selected: boolean;
  selectedClipId: string | null;
  onSelectTrack: () => void;
  onSelectClip: (id: string | null) => void;
  onDropSample: (sampleId: string, beat: number) => void;
  onCommitClip: (
    id: string,
    patch: { startBeat: number; durationBeats: number; offsetBeats: number },
  ) => void;
  onUpdateTrack: (patch: Partial<Track>) => void;
  onRemoveTrack: () => void;
}

export function TrackLane({
  track,
  clips,
  sampleMap,
  pxPerBeat,
  width,
  selected,
  selectedClipId,
  onSelectTrack,
  onSelectClip,
  onDropSample,
  onCommitClip,
  onUpdateTrack,
  onRemoveTrack,
}: Props) {
  const laneRef = useRef<HTMLDivElement>(null);
  const snap = useStudio((s) => s.snap);

  const beatFromClientX = (clientX: number, doSnap = true) => {
    const el = laneRef.current;
    if (!el) return 0;
    const rect = el.getBoundingClientRect();
    const raw = Math.max(0, (clientX - rect.left) / pxPerBeat);
    return doSnap ? snapBeat(raw, snap || 0.001) : raw;
  };

  return (
    <div className="track-row">
      <div className="track-header" onClick={onSelectTrack}>
        <div className="track-name">
          <span className="swatch" style={{ background: track.color }} />
          {track.name}
        </div>
        <div className="track-controls">
          <button
            type="button"
            className={`chip ${track.muted ? 'on' : ''}`}
            title="Mute"
            onClick={(e) => {
              e.stopPropagation();
              onUpdateTrack({ muted: !track.muted });
            }}
          >
            M
          </button>
          <button
            type="button"
            className={`chip ${track.solo ? 'solo-on' : ''}`}
            title="Solo"
            onClick={(e) => {
              e.stopPropagation();
              onUpdateTrack({ solo: !track.solo });
            }}
          >
            S
          </button>
          <button
            type="button"
            className="chip"
            title="Remove track"
            onClick={(e) => {
              e.stopPropagation();
              if (window.confirm(`Delete track “${track.name}” and all its clips?`)) {
                onRemoveTrack();
              }
            }}
          >
            ×
          </button>
        </div>
      </div>
      <div
        ref={laneRef}
        className={`track-lane ${selected ? 'selected' : ''}`}
        style={{ width, ['--px-beat' as string]: `${pxPerBeat}px` }}
        onClick={() => {
          onSelectTrack();
          onSelectClip(null);
        }}
        onDragOver={(e) => {
          e.preventDefault();
          e.dataTransfer.dropEffect = 'copy';
        }}
        onDrop={(e) => {
          e.preventDefault();
          const sampleId = e.dataTransfer.getData('application/x-chadsound-sample');
          if (!sampleId) return;
          onDropSample(sampleId, beatFromClientX(e.clientX, true));
        }}
      >
        {clips.map((clip) => {
          const sample = sampleMap.get(clip.sampleId);
          if (!sample) return null;
          return (
            <ClipBlock
              key={clip.id}
              clip={clip}
              sample={sample}
              color={track.color}
              pxPerBeat={pxPerBeat}
              selected={selectedClipId === clip.id}
              onSelect={() => {
                onSelectTrack();
                onSelectClip(clip.id);
              }}
              onCommit={(patch) => onCommitClip(clip.id, patch)}
              beatFromClientX={beatFromClientX}
            />
          );
        })}
      </div>
    </div>
  );
}
