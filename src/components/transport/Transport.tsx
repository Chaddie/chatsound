import { useStudio } from '../../store/studioStore';
import { formatBarsBeats } from '../../lib/time';
import { CaptureBar } from '../CaptureBar';

const SNAP_OPTIONS = [
  { value: 1, label: '1/4' },
  { value: 0.5, label: '1/8' },
  { value: 0.25, label: '1/16' },
  { value: 0.125, label: '1/32' },
  { value: 0, label: 'Off' },
];

export function Transport() {
  const playing = useStudio((s) => s.playing);
  const bpm = useStudio((s) => s.bpm);
  const positionBeat = useStudio((s) => s.positionBeat);
  const metronome = useStudio((s) => s.metronome);
  const loop = useStudio((s) => s.loop);
  const pxPerBeat = useStudio((s) => s.pxPerBeat);
  const snap = useStudio((s) => s.snap);
  const recording = useStudio((s) => s.recording);
  const past = useStudio((s) => s.past);
  const future = useStudio((s) => s.future);
  const play = useStudio((s) => s.play);
  const pause = useStudio((s) => s.pause);
  const stop = useStudio((s) => s.stop);
  const setBpm = useStudio((s) => s.setBpm);
  const toggleMetronome = useStudio((s) => s.toggleMetronome);
  const setLoop = useStudio((s) => s.setLoop);
  const setPxPerBeat = useStudio((s) => s.setPxPerBeat);
  const setSnap = useStudio((s) => s.setSnap);
  const seek = useStudio((s) => s.seek);
  const undo = useStudio((s) => s.undo);
  const redo = useStudio((s) => s.redo);

  return (
    <footer className="transport">
      <div className="transport-group">
        <CaptureBar />
        <button type="button" className="transport-btn" onClick={stop} title="Stop">
          ■
        </button>
        <button
          type="button"
          className="transport-btn play"
          onClick={() => void (playing ? pause() : play())}
          title="Play / Pause (Space)"
        >
          {playing ? '❚❚' : '▶'}
        </button>
        <button type="button" className="transport-btn" onClick={() => seek(0)} title="Return to start">
          ⇤
        </button>
      </div>

      <div className="transport-readout">
        {recording && <span className="rec-badge">REC</span>}
        {formatBarsBeats(positionBeat)}
      </div>

      <label className="field">
        BPM
        <input
          type="number"
          min={40}
          max={240}
          value={bpm}
          onChange={(e) => setBpm(Number(e.target.value) || 120)}
        />
      </label>

      <label className="field">
        Grid
        <select value={snap} onChange={(e) => setSnap(Number(e.target.value))}>
          {SNAP_OPTIONS.map((o) => (
            <option key={o.label} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>

      <button
        type="button"
        className={`chip ${metronome ? 'on' : ''}`}
        onClick={toggleMetronome}
        title="Metronome"
      >
        CLICK
      </button>

      <button
        type="button"
        className={`chip ${loop.enabled ? 'solo-on' : ''}`}
        onClick={() => setLoop({ enabled: !loop.enabled })}
        title="Toggle loop (L) — drag braces on the ruler"
      >
        LOOP {Math.round(loop.startBeat / 4) + 1}–{Math.round(loop.endBeat / 4)}
      </button>

      <button type="button" className="chip" disabled={!past.length} onClick={undo} title="Undo (Ctrl+Z)">
        Undo
      </button>
      <button type="button" className="chip" disabled={!future.length} onClick={redo} title="Redo (Ctrl+Shift+Z)">
        Redo
      </button>

      <label className="field">
        Zoom
        <input
          type="range"
          min={20}
          max={160}
          value={pxPerBeat}
          onChange={(e) => setPxPerBeat(Number(e.target.value))}
        />
      </label>

      <div className="shortcuts">Space · L loop · ⌘Z undo · ⌘D dup · ←→ nudge · Ctrl+wheel zoom</div>
    </footer>
  );
}
