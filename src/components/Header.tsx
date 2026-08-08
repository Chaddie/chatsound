import { useState } from 'react';
import { useStudio } from '../store/studioStore';
import { CollabBar } from './CollabBar';
import logoUrl from '../assets/logo.png';

export function Header() {
  const projectName = useStudio((s) => s.projectName);
  const sessionId = useStudio((s) => s.sessionId);
  const sessions = useStudio((s) => s.sessions);
  const statusMessage = useStudio((s) => s.statusMessage);
  const exporting = useStudio((s) => s.exporting);
  const exportWav = useStudio((s) => s.exportWav);
  const addTrack = useStudio((s) => s.addTrack);
  const setProjectName = useStudio((s) => s.setProjectName);
  const newSession = useStudio((s) => s.newSession);
  const switchSession = useStudio((s) => s.switchSession);
  const removeSession = useStudio((s) => s.removeSession);
  const [sessionsOpen, setSessionsOpen] = useState(false);

  return (
    <header className="header">
      <div className="brand">
        <img className="brand-logo" src={logoUrl} alt="Chad Sound" width={44} height={44} />
        <div className="brand-text">
          <div className="brand-mark">CHAD SOUND</div>
          <div className="brand-sub">Sample Lattice · Accent Vocals</div>
        </div>
      </div>

      <div className="session-field">
        <label className="field" style={{ margin: 0 }}>
          <span>Session</span>
          <input
            value={projectName}
            onChange={(e) => setProjectName(e.target.value)}
            aria-label="Session name"
          />
        </label>
        <div className="session-menu-wrap">
          <button
            type="button"
            className="btn"
            onClick={() => setSessionsOpen((v) => !v)}
            title="Saved sessions in this browser"
          >
            Library
          </button>
          {sessionsOpen && (
            <div className="session-popover">
              <p className="panel-title">Browser sessions</p>
              <p className="sample-meta">Autosaved locally — reopen anytime on this device.</p>
              <ul className="session-list">
                {sessions.map((s) => (
                  <li key={s.id} className={s.id === sessionId ? 'active' : ''}>
                    <button type="button" className="session-pick" onClick={() => {
                      void switchSession(s.id);
                      setSessionsOpen(false);
                    }}>
                      <strong>{s.name}</strong>
                      <span>{new Date(s.updatedAt).toLocaleString()}</span>
                    </button>
                    <button
                      type="button"
                      className="btn btn-danger session-del"
                      disabled={sessions.length <= 1}
                      onClick={() => void removeSession(s.id)}
                      title="Delete session"
                    >
                      ×
                    </button>
                  </li>
                ))}
              </ul>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => {
                  void newSession();
                  setSessionsOpen(false);
                }}
              >
                + New session
              </button>
            </div>
          )}
        </div>
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
