import { useStudio } from '../../store/studioStore';

export function Mixer() {
  const tracks = useStudio((s) => s.tracks);
  const updateTrack = useStudio((s) => s.updateTrack);

  return (
    <div className="mixer">
      {tracks.map((t) => (
        <div key={t.id} className="mixer-strip">
          <h4>
            <span className="swatch" style={{ background: t.color, display: 'inline-block', marginRight: 6 }} />
            {t.name}
          </h4>
          <label>
            Vol
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={t.volume}
              onChange={(e) => updateTrack(t.id, { volume: Number(e.target.value) })}
            />
          </label>
          <label>
            Pan
            <input
              type="range"
              min={-1}
              max={1}
              step={0.01}
              value={t.pan}
              onChange={(e) => updateTrack(t.id, { pan: Number(e.target.value) })}
            />
          </label>
        </div>
      ))}
    </div>
  );
}
