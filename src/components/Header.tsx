import { useEffect, useState } from 'react';
import { useStudio } from '../store/studioStore';
import { CollabBar } from './CollabBar';
import logoUrl from '../assets/logo.png';
import {
  ACCENT_PRESETS,
  applyTheme,
  loadTheme,
  type AccentId,
  type ThemeMode,
  type ThemeState,
} from '../lib/theme';

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
  const [themeOpen, setThemeOpen] = useState(false);
  const [theme, setTheme] = useState<ThemeState>(() => loadTheme());

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  const setMode = (mode: ThemeMode) => setTheme((t) => ({ ...t, mode }));
  const setAccent = (accentId: AccentId) => setTheme((t) => ({ ...t, accentId }));

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
            onClick={() => {
              setSessionsOpen((v) => !v);
              setThemeOpen(false);
            }}
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
                    <button
                      type="button"
                      className="session-pick"
                      onClick={() => {
                        void switchSession(s.id);
                        setSessionsOpen(false);
                      }}
                    >
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
        <div className="theme-wrap">
          <button
            type="button"
            className="btn"
            onClick={() => {
              setThemeOpen((v) => !v);
              setSessionsOpen(false);
            }}
            title="Theme & accent"
          >
            {theme.mode === 'dark' ? 'Dark' : 'Light'}
          </button>
          {themeOpen && (
            <div className="theme-popover">
              <p className="panel-title">Appearance</p>
              <div className="theme-mode">
                <button
                  type="button"
                  className={`btn ${theme.mode === 'dark' ? 'btn-primary' : ''}`}
                  onClick={() => setMode('dark')}
                >
                  Dark
                </button>
                <button
                  type="button"
                  className={`btn ${theme.mode === 'light' ? 'btn-primary' : ''}`}
                  onClick={() => setMode('light')}
                >
                  Light
                </button>
              </div>
              <p className="sample-meta">Accent</p>
              <div className="theme-row">
                {ACCENT_PRESETS.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    className={`swatch ${theme.accentId === p.id ? 'on' : ''}`}
                    style={{ background: p.hex }}
                    title={p.label}
                    aria-label={p.label}
                    onClick={() => setAccent(p.id)}
                  />
                ))}
                <input
                  type="color"
                  className={`swatch-custom ${theme.accentId === 'custom' ? 'on' : ''}`}
                  value={theme.customHex}
                  title="Custom accent"
                  aria-label="Custom accent"
                  onChange={(e) =>
                    setTheme((t) => ({ ...t, accentId: 'custom', customHex: e.target.value }))
                  }
                />
              </div>
            </div>
          )}
        </div>
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
