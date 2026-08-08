import { Header } from './Header';
import { SampleBrowser } from './browser/SampleBrowser';
import { AccentStudio } from './accent/AccentStudio';
import { Timeline } from './timeline/Timeline';
import { Mixer } from './mixer/Mixer';
import { Transport } from './transport/Transport';
import { useStudio } from '../store/studioStore';

export function Studio() {
  const leftTab = useStudio((s) => s.leftTab);
  const setLeftTab = useStudio((s) => s.setLeftTab);

  return (
    <div className="app">
      <Header />
      <div className="studio">
        <aside className="sidebar">
          <div className="side-tabs">
            <button
              type="button"
              className={leftTab === 'samples' ? 'active' : ''}
              onClick={() => setLeftTab('samples')}
            >
              Samples
            </button>
            <button
              type="button"
              className={leftTab === 'accent' ? 'active' : ''}
              onClick={() => setLeftTab('accent')}
            >
              Accent
            </button>
          </div>
          <div className="side-body">{leftTab === 'samples' ? <SampleBrowser /> : <AccentStudio />}</div>
        </aside>
        <div className="main-stage">
          <Timeline />
          <Mixer />
        </div>
      </div>
      <Transport />
    </div>
  );
}
