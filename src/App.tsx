import { useEffect } from 'react';
import { Studio } from './components/Studio';
import { useStudio, startPositionClock } from './store/studioStore';
import { wireCollabToStudio } from './collab/store';

export default function App() {
  const hydrate = useStudio((s) => s.hydrate);
  const hydrated = useStudio((s) => s.hydrated);

  useEffect(() => {
    void hydrate();
    const stopClock = startPositionClock();
    const unwire = wireCollabToStudio();
    return () => {
      stopClock();
      unwire();
    };
  }, [hydrate]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      const studio = useStudio.getState();
      const mod = e.metaKey || e.ctrlKey;

      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) studio.redo();
        else studio.undo();
        return;
      }
      if (mod && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        studio.redo();
        return;
      }
      if (mod && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        studio.duplicateSelectedClip();
        return;
      }

      if (e.code === 'Space') {
        e.preventDefault();
        if (studio.playing) studio.pause();
        else void studio.play();
      } else if (e.key === 'l' || e.key === 'L') {
        e.preventDefault();
        studio.setLoop({ enabled: !studio.loop.enabled });
      } else if (e.key === 's' || e.key === 'S') {
        if (mod) return;
        e.preventDefault();
        studio.splitClipAtPlayhead();
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        studio.deleteSelectedClip();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        studio.nudgeSelectedClip(-(studio.snap || 0.25));
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        studio.nudgeSelectedClip(studio.snap || 0.25);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  if (!hydrated) {
    return (
      <div className="boot-screen">
        <div className="boot-glow" aria-hidden />
        <div className="boot-card">
          <div className="brand" style={{ alignItems: 'center' }}>
            <div className="brand-mark boot-logo">CHADSOUND</div>
            <div className="brand-sub">Sample Lattice · Accent Vocals</div>
          </div>
          <div className="boot-eq" aria-hidden>
            {Array.from({ length: 12 }, (_, i) => (
              <span key={i} style={{ animationDelay: `${i * 0.08}s` }} />
            ))}
          </div>
          <div className="boot-status">
            <span className="boot-spinner" aria-hidden />
            <span>Booting studio…</span>
          </div>
          <div className="boot-bar" aria-hidden>
            <div className="boot-bar-fill" />
          </div>
        </div>
      </div>
    );
  }

  return <Studio />;
}
