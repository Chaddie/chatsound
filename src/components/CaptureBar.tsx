import { useEffect, useRef, useState } from 'react';
import { useStudio } from '../store/studioStore';
import { InputRecorder, listAudioInputs, type AudioDevice } from '../lib/recorder';
import {
  MidiController,
  listMidiInputs,
  renderMidiNotesToWav,
  type MidiDeviceInfo,
} from '../lib/midi';

export function CaptureBar() {
  const recording = useStudio((s) => s.recording);
  const setRecording = useStudio((s) => s.setRecording);
  const addCapturedSample = useStudio((s) => s.addCapturedSample);
  const play = useStudio((s) => s.play);
  const positionBeat = useStudio((s) => s.positionBeat);
  const setStatus = useStudio((s) => s.setStatus);
  const selectedTrackId = useStudio((s) => s.selectedTrackId);

  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<'audio' | 'midi'>('audio');
  const [inputs, setInputs] = useState<AudioDevice[]>([]);
  const [midiDevices, setMidiDevices] = useState<MidiDeviceInfo[]>([]);
  const [inputId, setInputId] = useState('default');
  const [midiId, setMidiId] = useState('');
  const [level, setLevel] = useState(0);
  const [midiOk, setMidiOk] = useState<boolean | null>(null);
  const [monitor, setMonitor] = useState(true);

  const recorderRef = useRef(new InputRecorder());
  const midiRef = useRef(new MidiController());
  const levelTimer = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      void recorderRef.current.stop();
      midiRef.current.dispose();
      if (levelTimer.current) window.clearInterval(levelTimer.current);
    };
  }, []);

  const refreshDevices = async () => {
    const audio = await listAudioInputs();
    setInputs(audio);
    const ok = await midiRef.current.init();
    setMidiOk(ok);
    const midis = await listMidiInputs();
    setMidiDevices(midis);
    if (midis[0] && !midiId) {
      setMidiId(midis[0].id);
      await midiRef.current.selectInput(midis[0].id);
    }
  };

  useEffect(() => {
    if (open) void refreshDevices();
  }, [open]);

  useEffect(() => {
    midiRef.current.setMonitor(monitor);
  }, [monitor]);

  useEffect(() => {
    if (midiId) void midiRef.current.selectInput(midiId);
  }, [midiId]);

  const start = async () => {
    try {
      const startBeat = positionBeat;
      setRecording(true, startBeat);
      if (mode === 'audio') {
        await recorderRef.current.start(inputId === 'default' ? undefined : inputId);
        levelTimer.current = window.setInterval(() => {
          setLevel(recorderRef.current.inputLevel);
        }, 80);
        setStatus('Recording guitar / input…');
      } else {
        midiRef.current.startRecording();
        setStatus('Recording MIDI… play your controller');
      }
      await play();
    } catch (e) {
      setRecording(false);
      setStatus(e instanceof Error ? e.message : 'Could not start recording');
    }
  };

  const stop = async () => {
    const startBeat = useStudio.getState().recordStartBeat;
    setRecording(false);
    if (levelTimer.current) {
      window.clearInterval(levelTimer.current);
      levelTimer.current = null;
    }
    setLevel(0);

    if (mode === 'audio') {
      const blob = await recorderRef.current.stop();
      if (!blob) {
        setStatus('No audio captured');
        return;
      }
      await addCapturedSample(`Take ${new Date().toLocaleTimeString()}`, blob, {
        source: 'record',
        category: 'Recorded',
        startBeat,
        trackId: selectedTrackId ?? undefined,
      });
      setStatus('Guitar / input take dropped on timeline');
    } else {
      const events = midiRef.current.stopRecording();
      const blob = await renderMidiNotesToWav(events);
      if (!blob) {
        setStatus('No MIDI notes captured');
        return;
      }
      await addCapturedSample(`MIDI ${new Date().toLocaleTimeString()}`, blob, {
        source: 'midi',
        category: 'MIDI',
        startBeat,
        trackId: selectedTrackId ?? undefined,
      });
      setStatus('MIDI take rendered to timeline');
    }
  };

  return (
    <div className="capture-wrap">
      <button
        type="button"
        className={`transport-btn ${recording ? 'rec-on' : ''}`}
        title="Record guitar / MIDI"
        onClick={() => (recording ? void stop() : setOpen((v) => !v))}
      >
        ●
      </button>

      {(open || recording) && (
        <div className="capture-popover">
          <p className="panel-title">Capture</p>
          <div className="tag-row">
            <button
              type="button"
              className={`chip ${mode === 'audio' ? 'on' : ''}`}
              onClick={() => setMode('audio')}
              disabled={recording}
            >
              Guitar / Mic
            </button>
            <button
              type="button"
              className={`chip ${mode === 'midi' ? 'on' : ''}`}
              onClick={() => setMode('midi')}
              disabled={recording}
            >
              MIDI
            </button>
          </div>

          {mode === 'audio' ? (
            <>
              <label className="field" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
                <span>Input (interface / Bluetooth / mic)</span>
                <select value={inputId} onChange={(e) => setInputId(e.target.value)} disabled={recording}>
                  <option value="default">System default</option>
                  {inputs.map((d) => (
                    <option key={d.deviceId} value={d.deviceId}>
                      {d.label}
                    </option>
                  ))}
                </select>
              </label>
              <div className="level-meter" aria-hidden>
                <div className="level-fill" style={{ width: `${Math.min(100, level * 140)}%` }} />
              </div>
              <p className="sample-meta">
                Plug a guitar into an audio interface, or use a Bluetooth receiver. On iPad, pick the
                Bluetooth / USB input above, arm record, then play.
              </p>
            </>
          ) : (
            <>
              {midiOk === false && (
                <div className="hint-box">
                  Web MIDI isn’t available in this browser (common on iOS). Use Guitar / Mic recording
                  for audio guitars, or open Chadsound in desktop Chrome / Edge for MIDI controllers.
                </div>
              )}
              <label className="field" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
                <span>MIDI device</span>
                <select value={midiId} onChange={(e) => setMidiId(e.target.value)} disabled={recording}>
                  {midiDevices.length === 0 && <option value="">No devices found</option>}
                  {midiDevices.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                className={`chip ${monitor ? 'on' : ''}`}
                onClick={() => setMonitor((v) => !v)}
              >
                Monitor synth
              </button>
              <p className="sample-meta">
                MIDI guitar / keyboard notes play a built-in synth and can be recorded to a clip.
              </p>
            </>
          )}

          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            {!recording ? (
              <button type="button" className="btn btn-primary" onClick={() => void start()}>
                Arm & record
              </button>
            ) : (
              <button type="button" className="btn btn-danger" onClick={() => void stop()}>
                Stop & drop
              </button>
            )}
            <button type="button" className="btn" onClick={() => void refreshDevices()} disabled={recording}>
              Refresh devices
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
