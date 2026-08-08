import { useStudio } from '../store/studioStore';
import { CollabBar } from './CollabBar';

export function Header() {
  const projectName = useStudio((s) => s.projectName);
  const statusMessage = useStudio((s) => s.statusMessage);
  const exporting = useStudio((s) => s.exporting);
  const exportWav = useStudio((s) => s.exportWav);
  const addTrack = useStudio((s) => s.addTrack);

  return (
    <header className="header">
      <div className="brand">
        <div className="brand-mark">CHADSOUND</div>
        <div className="brand-sub">Sample Lattice · Accent Vocals</div>
      </div>
      <div className="field">
        <span>Session</span>
        <input
          value={projectName}
          onChange={(e) => useStudio.setState({ projectName: e.target.value })}
          aria-label="Project name"
        />
      </div>
      <div className="header-meta">
        {statusMessage && <div className="status-pill">{statusMessage}</div>}
        <CollabBar />
        <button type="button" className="btn" onClick={addTrack}>
          + Track
        </button>
        <button type="button" className="btn btn-primary" disabled={exporting} onClick={() => void exportWav()}>
          {exporting ? 'Rendering…' : 'Export WAV'}
        </button>
      </div>
    </header>
  );
}
