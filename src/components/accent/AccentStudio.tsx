import { useEffect, useRef, useState } from 'react';
import {
  ACCENT_PRESETS,
  SPEECH_TAG_HINTS,
  VOICE_CLONE_SCRIPT,
  buildTtsText,
  type AccentPreset,
} from '../../lib/accents';
import {
  customVoiceToPreset,
  loadCustomVoices,
  saveCustomVoices,
  type SavedCustomVoice,
} from '../../lib/customVoices';
import { InputRecorder } from '../../lib/recorder';
import { useStudio } from '../../store/studioStore';

type LyricStyle = 'hook' | 'verse' | 'rap' | 'chorus' | 'bridge';

const LYRIC_STYLES: { id: LyricStyle; label: string }[] = [
  { id: 'rap', label: 'Rap' },
  { id: 'hook', label: 'Hook' },
  { id: 'chorus', label: 'Chorus' },
  { id: 'verse', label: 'Verse' },
  { id: 'bridge', label: 'Bridge' },
];

export function AccentStudio() {
  const [presetId, setPresetId] = useState(ACCENT_PRESETS[0]!.id);
  const [customVoices, setCustomVoices] = useState<SavedCustomVoice[]>([]);
  const [idea, setIdea] = useState('late nights in the city, ambition, neon, never clocking out');
  const [lyricStyle, setLyricStyle] = useState<LyricStyle>('rap');
  const [lyrics, setLyrics] = useState('');
  const [busy, setBusy] = useState<'lyrics' | 'voice' | 'clone' | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Clone UI
  const [voiceName, setVoiceName] = useState('My Voice');
  const [voiceAccent, setVoiceAccent] = useState('');
  const [voiceLang, setVoiceLang] = useState('en');
  const [recording, setRecording] = useState(false);
  const [recordSecs, setRecordSecs] = useState(0);
  const [level, setLevel] = useState(0);
  const [pendingBlob, setPendingBlob] = useState<Blob | null>(null);
  const [pasteId, setPasteId] = useState('');

  const recorderRef = useRef(new InputRecorder());
  const tickRef = useRef<number | null>(null);
  const levelRef = useRef<number | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const addGeneratedSample = useStudio((s) => s.addGeneratedSample);
  const addClipFromSample = useStudio((s) => s.addClipFromSample);
  const selectedTrackId = useStudio((s) => s.selectedTrackId);
  const positionBeat = useStudio((s) => s.positionBeat);
  const setStatus = useStudio((s) => s.setStatus);
  const ttsConfigured = useStudio((s) => s.ttsConfigured);
  const tracks = useStudio((s) => s.tracks);

  const customPresets = customVoices.map(customVoiceToPreset);
  const allPresets: AccentPreset[] = [...customPresets, ...ACCENT_PRESETS];
  const preset = allPresets.find((p) => p.id === presetId) ?? allPresets[0]!;

  useEffect(() => {
    void loadCustomVoices().then(setCustomVoices);

    return () => {
      void recorderRef.current.stop();
      if (tickRef.current) window.clearInterval(tickRef.current);
      if (levelRef.current) window.clearInterval(levelRef.current);
    };
  }, []);

  const persistCustoms = async (next: SavedCustomVoice[]) => {
    setCustomVoices(next);
    await saveCustomVoices(next);
  };

  const insertTag = (tag: string) => {
    setLyrics((prev) => `${prev.trim()} ${tag} `);
  };

  const startCloneRecord = async () => {
    setError(null);
    setPendingBlob(null);
    try {
      await recorderRef.current.start();
      setRecording(true);
      setRecordSecs(0);
      tickRef.current = window.setInterval(() => setRecordSecs((s) => s + 1), 1000);
      levelRef.current = window.setInterval(() => setLevel(recorderRef.current.inputLevel), 80);
      setStatus('Recording your voice — speak naturally for 30–120s');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Mic permission denied');
    }
  };

  const stopCloneRecord = async () => {
    if (tickRef.current) window.clearInterval(tickRef.current);
    if (levelRef.current) window.clearInterval(levelRef.current);
    setRecording(false);
    setLevel(0);
    const blob = await recorderRef.current.stop();
    if (!blob) {
      setError('No audio captured');
      return;
    }
    if (recordSecs < 5) {
      setError('Record at least ~30 seconds for a decent clone (5s minimum to try).');
    }
    setPendingBlob(blob);
    setStatus(`Reference take ready (${recordSecs}s) — clone it`);
  };

  const onUploadRef = (file: File | null) => {
    if (!file) return;
    setPendingBlob(file);
    setStatus(`Loaded ${file.name} as voice reference`);
  };

  const cloneVoice = async () => {
    if (!pendingBlob) {
      setError('Record or upload a reference clip first');
      return;
    }
    setError(null);
    setBusy('clone');
    setStatus('Cloning your voice with Grok…');
    try {
      const form = new FormData();
      form.append('file', pendingBlob, 'reference.wav');
      form.append('name', voiceName.trim() || 'My Voice');
      form.append('language', voiceLang.trim() || 'en');
      form.append('accent', voiceAccent.trim());
      form.append('tone', 'expressive');
      form.append('use_case', 'entertainment');
      form.append('gender', 'neutral');

      const res = await fetch('/api/voices', { method: 'POST', body: form });
      const data = (await res.json().catch(() => null)) as {
        voice_id?: string;
        name?: string;
        language?: string;
        accent?: string;
        error?: string;
        hint?: string;
        detail?: unknown;
      } | null;

      if (!res.ok || !data?.voice_id) {
        throw new Error(
          data?.hint ||
            data?.error ||
            (typeof data?.detail === 'string' ? data.detail : null) ||
            `Clone failed (${res.status})`,
        );
      }

      const saved: SavedCustomVoice = {
        voiceId: data.voice_id,
        label: data.name || voiceName.trim() || 'My Voice',
        language: data.language || voiceLang || 'en',
        accent: data.accent || voiceAccent || undefined,
        createdAt: Date.now(),
      };
      const next = [saved, ...customVoices.filter((v) => v.voiceId !== saved.voiceId)];
      await persistCustoms(next);
      setPresetId(`custom_${saved.voiceId}`);
      setPendingBlob(null);
      setStatus(`Voice cloned — “${saved.label}” is ready for TTS`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Clone failed';
      setError(msg);
      setStatus(msg);
    } finally {
      setBusy(null);
    }
  };

  const addPastedVoice = async () => {
    const id = pasteId.trim().toLowerCase();
    if (!/^[a-z0-9]{6,12}$/.test(id)) {
      setError('Paste a valid xAI voice_id (from console or API)');
      return;
    }
    const saved: SavedCustomVoice = {
      voiceId: id,
      label: voiceName.trim() || `Voice ${id}`,
      language: voiceLang || 'en',
      accent: voiceAccent || undefined,
      createdAt: Date.now(),
    };
    const next = [saved, ...customVoices.filter((v) => v.voiceId !== id)];
    await persistCustoms(next);
    setPresetId(`custom_${id}`);
    setPasteId('');
    setStatus(`Added custom voice ${id}`);
  };

  const removeCustom = async (voiceId: string) => {
    const next = customVoices.filter((v) => v.voiceId !== voiceId);
    await persistCustoms(next);
    if (presetId === `custom_${voiceId}`) {
      setPresetId(ACCENT_PRESETS[0]!.id);
    }
    // Best-effort remote delete
    void fetch(`/api/voices/${encodeURIComponent(voiceId)}`, { method: 'DELETE' });
  };

  const writeLyrics = async () => {
    setError(null);
    setBusy('lyrics');
    setStatus('Grok is writing lyrics…');
    try {
      const res = await fetch('/api/lyrics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          idea,
          style: lyricStyle,
          accentLabel: `${preset.label} (${preset.region})`,
          language: preset.language,
        }),
      });
      const data = (await res.json().catch(() => null)) as
        | { lyrics?: string; error?: string; hint?: string; detail?: string }
        | null;
      if (!res.ok) {
        throw new Error(data?.hint || data?.error || data?.detail || `Lyrics failed (${res.status})`);
      }
      if (!data?.lyrics) throw new Error('No lyrics returned');
      setLyrics(data.lyrics);
      setStatus(`${lyricStyle} draft ready — edit then generate voice`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Lyric generation failed';
      setError(msg);
      setStatus(msg);
    } finally {
      setBusy(null);
    }
  };

  const generate = async () => {
    setError(null);
    setBusy('voice');
    setStatus(
      preset.custom ? `Generating TTS in your voice (${preset.label})…` : 'Generating accent vocal…',
    );
    try {
      const text = buildTtsText(lyrics, preset);
      const res = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text,
          voice_id: preset.voiceId,
          language: preset.language,
        }),
      });

      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as
          | { error?: string; hint?: string; detail?: string }
          | null;
        const msg = data?.hint || data?.error || data?.detail || `TTS failed (${res.status})`;
        throw new Error(msg);
      }

      const blob = await res.blob();
      const name = `${preset.tag} · ${lyrics.trim().slice(0, 28) || 'vocal'}`;
      const sample = await addGeneratedSample(name, blob);

      let trackId = selectedTrackId;
      if (!trackId || !tracks.some((t) => t.id === trackId)) {
        trackId = tracks.find((t) => /vox|vocal/i.test(t.name))?.id ?? tracks[0]?.id ?? null;
      }
      if (trackId) {
        addClipFromSample(sample.id, trackId, positionBeat);
      }
      setStatus(`Accent take ready — ${preset.label}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Generation failed';
      setError(msg);
      setStatus(msg);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="accent-form">
      <p className="panel-title">Accent Studio · Grok</p>

      {ttsConfigured === false && (
        <div className="hint-box">
          Add your xAI key to unlock AI lyrics, vocals, and voice clone. Set{' '}
          <code>XAI_API_KEY</code> in Vercel env (hosted) or local <code>.env</code>, then restart /
          redeploy.
        </div>
      )}

      <div className="clone-panel">
        <p className="panel-title">Clone your voice</p>
        <p className="sample-meta">
          Record 30–120s in a quiet room (one speaker). Read naturally — Grok clones your timbre +
          delivery, then you can TTS any lyrics in your voice.
        </p>

        <label className="field" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
          <span>Script (optional — read this)</span>
          <textarea readOnly rows={4} value={VOICE_CLONE_SCRIPT} />
        </label>

        <div className="field" style={{ gap: 8, flexWrap: 'wrap' }}>
          <input
            value={voiceName}
            onChange={(e) => setVoiceName(e.target.value)}
            placeholder="Voice name"
            aria-label="Voice name"
          />
          <input
            value={voiceAccent}
            onChange={(e) => setVoiceAccent(e.target.value)}
            placeholder="Accent (e.g. London, Lagos)"
            aria-label="Accent"
          />
          <input
            value={voiceLang}
            onChange={(e) => setVoiceLang(e.target.value)}
            placeholder="en"
            style={{ width: 56 }}
            aria-label="Language"
          />
        </div>

        <div className="level-meter" aria-hidden>
          <div className="level-fill" style={{ width: `${Math.min(100, level * 140)}%` }} />
        </div>

        <div className="tag-row">
          {!recording ? (
            <button type="button" className="btn" disabled={busy !== null} onClick={() => void startCloneRecord()}>
              Record voice
            </button>
          ) : (
            <button type="button" className="btn btn-danger" onClick={() => void stopCloneRecord()}>
              Stop ({recordSecs}s)
            </button>
          )}
          <button type="button" className="btn" disabled={busy !== null} onClick={() => fileRef.current?.click()}>
            Upload WAV/MP3
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="audio/*,.wav,.mp3,.m4a,.ogg,.flac"
            hidden
            onChange={(e) => {
              onUploadRef(e.target.files?.[0] ?? null);
              e.target.value = '';
            }}
          />
        </div>

        {pendingBlob && (
          <div className="sample-meta">
            Reference ready ({Math.round(pendingBlob.size / 1024)} KB)
          </div>
        )}

        <button
          type="button"
          className={`btn btn-primary ${busy === 'clone' ? 'generating' : ''}`}
          disabled={busy !== null || !pendingBlob}
          onClick={() => void cloneVoice()}
        >
          {busy === 'clone' ? 'Cloning…' : 'Clone voice for TTS'}
        </button>

        <div className="field" style={{ marginTop: 4 }}>
          <input
            value={pasteId}
            onChange={(e) => setPasteId(e.target.value)}
            placeholder="Or paste xAI voice_id"
            aria-label="Paste voice id"
          />
          <button type="button" className="btn" onClick={() => void addPastedVoice()}>
            Add ID
          </button>
        </div>
      </div>

      {customPresets.length > 0 && (
        <>
          <p className="panel-title">Your voices</p>
          <div className="accent-grid">
            {customPresets.map((p) => (
              <div key={p.id} className="accent-card-wrap">
                <button
                  type="button"
                  className={`accent-card ${p.id === presetId ? 'active' : ''}`}
                  onClick={() => setPresetId(p.id)}
                >
                  <strong>{p.label}</strong>
                  <span>
                    {p.region} · {p.voiceId}
                  </span>
                </button>
                <button
                  type="button"
                  className="chip"
                  title="Remove"
                  onClick={() => void removeCustom(p.voiceId)}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        </>
      )}

      <p className="panel-title">Stock accents</p>
      <div className="accent-grid">
        {ACCENT_PRESETS.map((p) => (
          <button
            key={p.id}
            type="button"
            className={`accent-card ${p.id === presetId ? 'active' : ''}`}
            onClick={() => setPresetId(p.id)}
          >
            <strong>{p.label}</strong>
            <span>
              {p.region} · {p.language}
            </span>
          </button>
        ))}
      </div>

      <label className="field" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
        <span>Idea / words / vibe</span>
        <textarea
          value={idea}
          onChange={(e) => setIdea(e.target.value)}
          placeholder="e.g. payday Friday, cheap champagne, still hungry…"
          rows={3}
        />
      </label>

      <div className="tag-row">
        {LYRIC_STYLES.map((s) => (
          <button
            key={s.id}
            type="button"
            className={`chip ${lyricStyle === s.id ? 'on' : ''}`}
            onClick={() => setLyricStyle(s.id)}
          >
            {s.label}
          </button>
        ))}
      </div>

      <button
        type="button"
        className={`btn ${busy === 'lyrics' ? 'generating' : ''}`}
        disabled={busy !== null || !idea.trim()}
        onClick={() => void writeLyrics()}
      >
        {busy === 'lyrics' ? 'Writing…' : 'AI Write Lyrics'}
      </button>

      <label className="field" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
        <span>Lyrics / hook</span>
        <textarea
          value={lyrics}
          onChange={(e) => setLyrics(e.target.value)}
          placeholder="AI fills this — or write your own bars…"
          rows={8}
        />
      </label>

      <div className="tag-row">
        {SPEECH_TAG_HINTS.map((t) => (
          <button key={t.tag} type="button" className="chip" onClick={() => insertTag(t.tag)}>
            {t.label}
          </button>
        ))}
      </div>

      <div className="sample-meta">
        Voice <strong style={{ color: 'var(--text)' }}>{preset.voiceId}</strong>
        {preset.custom ? ' · YOUR CLONE' : ''} · {preset.styleHint.slice(0, 56)}…
      </div>

      <button
        type="button"
        className={`btn btn-primary ${busy === 'voice' ? 'generating' : ''}`}
        disabled={busy !== null || !lyrics.trim()}
        onClick={() => void generate()}
      >
        {busy === 'voice'
          ? 'Generating voice…'
          : preset.custom
            ? 'Generate in My Voice & Drop'
            : 'Generate Voice & Drop'}
      </button>

      {error && (
        <div className="hint-box" style={{ borderColor: 'var(--danger)', color: '#ffb4b4' }}>
          {error}
        </div>
      )}
    </div>
  );
}
