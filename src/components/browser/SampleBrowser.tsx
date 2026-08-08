import { useMemo, useRef, useState } from 'react';
import { useStudio } from '../../store/studioStore';
import type { ArrangementPlan } from '../../types';

const CATEGORY_ORDER = [
  'Upload',
  'Recorded',
  'MIDI',
  'Drums',
  'Bass',
  'Synths',
  'Guitar',
  'Keys',
  'Orchestra',
  'Mallet',
  'FX',
  'Accent',
];

const PROMPT_EXAMPLES = [
  'metal and dubstep drop',
  'lofi night drive',
  'uk garage rollers',
  'cinematic trailer hits',
];

export function SampleBrowser() {
  const samples = useStudio((s) => s.samples);
  const importFiles = useStudio((s) => s.importFiles);
  const selectedTrackId = useStudio((s) => s.selectedTrackId);
  const positionBeat = useStudio((s) => s.positionBeat);
  const addClipFromSample = useStudio((s) => s.addClipFromSample);
  const applyArrangement = useStudio((s) => s.applyArrangement);
  const addGeneratedSample = useStudio((s) => s.addGeneratedSample);
  const ttsConfigured = useStudio((s) => s.ttsConfigured);
  const setStatus = useStudio((s) => s.setStatus);
  const [dragOver, setDragOver] = useState(false);
  const [filter, setFilter] = useState<string>('All');
  const [uploading, setUploading] = useState(false);
  const [prompt, setPrompt] = useState('metal and dubstep — heavy drop, wobble bass, crunchy guitars');
  const [arranging, setArranging] = useState(false);
  const [arrangeError, setArrangeError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const grouped = useMemo(() => {
    const map = new Map<string, typeof samples>();
    for (const s of samples) {
      const cat =
        s.category ??
        (s.source === 'accent'
          ? 'Accent'
          : s.source === 'upload'
            ? 'Upload'
            : s.source === 'record'
              ? 'Recorded'
              : s.source === 'midi'
                ? 'MIDI'
                : 'Other');
      if (!map.has(cat)) map.set(cat, []);
      map.get(cat)!.push(s);
    }
    const keys = [...map.keys()].sort((a, b) => {
      const ia = CATEGORY_ORDER.indexOf(a);
      const ib = CATEGORY_ORDER.indexOf(b);
      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    });
    return keys.map((k) => ({ category: k, items: map.get(k)! }));
  }, [samples]);

  const uploadedCount = samples.filter((s) => s.source === 'upload').length;
  const visible = filter === 'All' ? grouped : grouped.filter((g) => g.category === filter);

  const handleFiles = async (files: FileList | File[]) => {
    setUploading(true);
    try {
      await importFiles(files);
      setFilter('Upload');
    } finally {
      setUploading(false);
    }
  };

  const generateArrangement = async () => {
    const idea = prompt.trim();
    if (!idea) return;
    setArrangeError(null);
    setArranging(true);
    setStatus('Grok is arranging your track…');
    try {
      const res = await fetch('/api/arrange', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: idea, bars: 8 }),
      });
      const data = (await res.json().catch(() => null)) as
        | (ArrangementPlan & { error?: string; hint?: string })
        | null;
      if (!res.ok || !data?.clips?.length) {
        throw new Error(data?.hint || data?.error || `Arrange failed (${res.status})`);
      }

      await applyArrangement(data);

      if (data.vocal?.lyrics && ttsConfigured) {
        setStatus('Adding AI vocal hook…');
        const tts = await fetch('/api/tts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text: data.vocal.lyrics,
            voice_id: 'eve',
            language: 'en',
            provider: 'xai',
          }),
        });
        if (tts.ok) {
          const blob = await tts.blob();
          const sample = await addGeneratedSample('AI Hook', blob);
          const vox =
            useStudio.getState().tracks.find((t) => /vox|vocal/i.test(t.name)) ??
            useStudio.getState().tracks[0];
          if (vox) addClipFromSample(sample.id, vox.id, 0);
          setStatus('Arrangement + vocal ready — hit play');
        } else {
          setStatus('Arrangement ready (vocal TTS skipped)');
        }
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Arrange failed';
      setArrangeError(msg);
      setStatus(msg);
    } finally {
      setArranging(false);
    }
  };

  return (
    <div>
      <p className="panel-title">Library · {samples.length} sounds</p>

      <div className="ai-arrange">
        <p className="panel-title">AI arrange</p>
        <p className="sample-meta">
          Describe a vibe — Grok builds a session from the kit (drums, bass, leads, FX).
        </p>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="e.g. metal + dubstep drop with wobble bass"
          aria-label="Track description"
        />
        <div className="ai-chip-row">
          {PROMPT_EXAMPLES.map((ex) => (
            <button key={ex} type="button" className="chip" onClick={() => setPrompt(ex)}>
              {ex}
            </button>
          ))}
        </div>
        <button
          type="button"
          className={`btn btn-primary ${arranging ? 'generating' : ''}`}
          disabled={arranging || !prompt.trim() || ttsConfigured === false}
          onClick={() => void generateArrangement()}
        >
          {arranging ? 'Arranging…' : 'Generate arrangement'}
        </button>
        {ttsConfigured === false && (
          <p className="sample-meta">Needs <code>XAI_API_KEY</code> for AI arrange.</p>
        )}
        {arrangeError && <div className="hint-box">{arrangeError}</div>}
      </div>

      <div
        className={`upload-zone ${dragOver ? 'dragover' : ''}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          if (e.dataTransfer.files.length) void handleFiles(e.dataTransfer.files);
        }}
      >
        <strong style={{ display: 'block', color: 'var(--text)', marginBottom: 6 }}>
          Upload your samples
        </strong>
        <span>WAV, MP3, OGG, M4A, FLAC — drag & drop or pick files</span>
        <div style={{ marginTop: 10, display: 'flex', gap: 8, justifyContent: 'center' }}>
          <button
            type="button"
            className="btn btn-primary"
            disabled={uploading}
            onClick={(e) => {
              e.stopPropagation();
              inputRef.current?.click();
            }}
          >
            {uploading ? 'Importing…' : 'Choose files'}
          </button>
          {uploadedCount > 0 && (
            <button type="button" className="btn" onClick={() => setFilter('Upload')}>
              Yours ({uploadedCount})
            </button>
          )}
        </div>
        <input
          ref={inputRef}
          type="file"
          accept="audio/*,.wav,.mp3,.ogg,.m4a,.flac"
          multiple
          hidden
          onChange={(e) => {
            if (e.target.files?.length) void handleFiles(e.target.files);
            e.target.value = '';
          }}
        />
      </div>

      <div className="tag-row" style={{ marginBottom: '0.75rem' }}>
        <button
          type="button"
          className={`chip ${filter === 'All' ? 'on' : ''}`}
          onClick={() => setFilter('All')}
        >
          All
        </button>
        {grouped.map((g) => (
          <button
            key={g.category}
            type="button"
            className={`chip ${filter === g.category ? 'on' : ''}`}
            onClick={() => setFilter(g.category)}
          >
            {g.category}
          </button>
        ))}
      </div>

      {visible.map((group) => (
        <div key={group.category} style={{ marginBottom: '0.85rem' }}>
          <p className="panel-title">
            {group.category} · {group.items.length}
          </p>
          <div className="sample-list">
            {group.items.map((s) => (
              <button
                key={s.id}
                type="button"
                className="sample-item"
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData('application/x-chadsound-sample', s.id);
                  e.dataTransfer.effectAllowed = 'copy';
                }}
                onDoubleClick={() => {
                  if (selectedTrackId) addClipFromSample(s.id, selectedTrackId, positionBeat);
                }}
                title="Drag to timeline · double-click to drop at playhead"
              >
                <div>
                  <div className="sample-name">{s.name}</div>
                  <div className="sample-meta">{s.duration.toFixed(2)}s</div>
                </div>
                <span className={`badge ${s.source === 'accent' ? 'badge-accent' : ''}`}>
                  {s.source === 'bundled'
                    ? 'KIT'
                    : s.source === 'accent'
                      ? 'VOX'
                      : s.source === 'record'
                        ? 'REC'
                        : s.source === 'midi'
                          ? 'MIDI'
                          : 'YOURS'}
                </span>
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
