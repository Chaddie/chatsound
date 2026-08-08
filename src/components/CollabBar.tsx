import { useEffect, useState } from 'react';
import { useCollab } from '../collab/store';
import { useStudio } from '../store/studioStore';

export function CollabBar() {
  const connected = useCollab((s) => s.connected);
  const roomId = useCollab((s) => s.roomId);
  const peers = useCollab((s) => s.peers);
  const shareUrl = useCollab((s) => s.shareUrl);
  const displayName = useCollab((s) => s.displayName);
  const lastError = useCollab((s) => s.lastError);
  const setDisplayName = useCollab((s) => s.setDisplayName);
  const createRoom = useCollab((s) => s.createRoom);
  const joinRoom = useCollab((s) => s.joinRoom);
  const leaveRoom = useCollab((s) => s.leaveRoom);
  const [open, setOpen] = useState(false);
  const [joinId, setJoinId] = useState('');

  useEffect(() => {
    void fetch('/api/health')
      .then((r) => r.json())
      .then((d: { collab?: boolean }) => {
        if (d.collab === false) {
          useStudio.getState().setStatus('Hosted mode: live share needs local API');
        }
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const room = params.get('room');
    if (room) joinRoom(room);
  }, [joinRoom]);

  return (
    <div className="collab-wrap">
      <button
        type="button"
        className={`btn ${connected ? 'btn-primary' : ''}`}
        onClick={() => setOpen((v) => !v)}
        title="Live collaboration"
      >
        {connected ? `Live · ${peers.length}` : 'Share live'}
      </button>

      {connected && (
        <div className="peer-dots" title={peers.map((p) => p.name).join(', ')}>
          {peers.map((p) => (
            <span key={p.id} className="peer-dot" style={{ background: p.color }} />
          ))}
        </div>
      )}

      {open && (
        <div className="collab-popover">
          <p className="panel-title">Live session</p>
          <label className="field" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
            <span>Your name</span>
            <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
          </label>

          {!connected ? (
            <>
              <button type="button" className="btn btn-primary" onClick={createRoom}>
                Create share link
              </button>
              <div className="field" style={{ marginTop: 8 }}>
                <input
                  placeholder="Room code"
                  value={joinId}
                  onChange={(e) => setJoinId(e.target.value)}
                />
                <button type="button" className="btn" onClick={() => joinRoom(joinId)}>
                  Join
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="sample-meta">
                Room <strong style={{ color: 'var(--text)' }}>{roomId}</strong>
              </div>
              {shareUrl && (
                <button
                  type="button"
                  className="btn"
                  onClick={() => void navigator.clipboard.writeText(shareUrl)}
                >
                  Copy link
                </button>
              )}
              <ul className="peer-list">
                {peers.map((p) => (
                  <li key={p.id}>
                    <span className="peer-dot" style={{ background: p.color }} />
                    {p.name}
                  </li>
                ))}
              </ul>
              <button type="button" className="btn btn-danger" onClick={leaveRoom}>
                Leave session
              </button>
            </>
          )}
          {lastError && <div className="hint-box">{lastError}</div>}
          <p className="sample-meta" style={{ marginTop: 8 }}>
            Arrangement + uploaded/recorded samples sync live. Share the link with collaborators.
          </p>
        </div>
      )}
    </div>
  );
}
