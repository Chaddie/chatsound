import { useMemo, useRef, useState } from 'react';
import { useStudio } from '../../store/studioStore';

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

export function SampleBrowser() {
  const samples = useStudio((s) => s.samples);
  const importFiles = useStudio((s) => s.importFiles);
  const selectedTrackId = useStudio((s) => s.selectedTrackId);
  const positionBeat = useStudio((s) => s.positionBeat);
  const addClipFromSample = useStudio((s) => s.addClipFromSample);
  const [dragOver, setDragOver] = useState(false);
  const [filter, setFilter] = useState<string>('All');
  const [uploading, setUploading] = useState(false);
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

  return (
    <div>
      <p className="panel-title">Library · {samples.length} sounds</p>

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
