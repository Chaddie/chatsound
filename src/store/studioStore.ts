import { create } from 'zustand';
import type { ArrangementPlan, Clip, LoopRegion, ProjectSnapshot, Sample, Track } from '../types';
import { TRACK_COLORS, uid } from '../types';
import { secondsToBeats, snapBeat, clamp } from '../lib/time';
import { audioEngine } from '../engine/AudioEngine';
import { loadProject, loadSampleBlobs, saveProject, saveSampleBlobs, ensureActiveSession, listSessions, createSession, deleteSession, setActiveSessionId, type SessionMeta } from '../lib/idb';

const BUNDLED: { id: string; name: string; file: string; category: string }[] = [
  // Drums
  { id: 'kick', name: 'Kick Punch', file: 'kick.wav', category: 'Drums' },
  { id: 'kick_808', name: 'Kick 808', file: 'kick_808.wav', category: 'Drums' },
  { id: 'snare', name: 'Snare Crack', file: 'snare.wav', category: 'Drums' },
  { id: 'snare_rim', name: 'Snare Rim', file: 'snare_rim.wav', category: 'Drums' },
  { id: 'hat', name: 'Hat Closed', file: 'hat.wav', category: 'Drums' },
  { id: 'hat_open', name: 'Hat Open', file: 'hat_open.wav', category: 'Drums' },
  { id: 'clap', name: 'Clap Room', file: 'clap.wav', category: 'Drums' },
  { id: 'perc', name: 'Perc Metal', file: 'perc.wav', category: 'Drums' },
  { id: 'tom_low', name: 'Tom Low', file: 'tom_low.wav', category: 'Drums' },
  { id: 'tom_high', name: 'Tom High', file: 'tom_high.wav', category: 'Drums' },
  { id: 'ride', name: 'Ride Cymbal', file: 'ride.wav', category: 'Drums' },
  { id: 'crash', name: 'Crash Cymbal', file: 'crash.wav', category: 'Drums' },
  { id: 'shaker', name: 'Shaker', file: 'shaker.wav', category: 'Drums' },
  // Bass
  { id: 'bass', name: 'Bass Sub', file: 'bass.wav', category: 'Bass' },
  { id: 'bass_reese', name: 'Bass Reese', file: 'bass_reese.wav', category: 'Bass' },
  { id: 'bass_acid', name: 'Bass Acid', file: 'bass_acid.wav', category: 'Bass' },
  { id: 'bass_wobble', name: 'Bass Wobble', file: 'bass_wobble.wav', category: 'Bass' },
  { id: 'bass_pluck', name: 'Bass Pluck', file: 'bass_pluck.wav', category: 'Bass' },
  // Synths
  { id: 'chord', name: 'Chord Stab', file: 'chord.wav', category: 'Synths' },
  { id: 'synth_saw_lead', name: 'Saw Lead', file: 'synth_saw_lead.wav', category: 'Synths' },
  { id: 'synth_square_lead', name: 'Square Lead', file: 'synth_square_lead.wav', category: 'Synths' },
  { id: 'synth_pluck', name: 'Synth Pluck', file: 'synth_pluck.wav', category: 'Synths' },
  { id: 'synth_pad_warm', name: 'Pad Warm', file: 'synth_pad_warm.wav', category: 'Synths' },
  { id: 'synth_pad_air', name: 'Pad Air', file: 'synth_pad_air.wav', category: 'Synths' },
  { id: 'synth_keys_bell', name: 'Bell Keys', file: 'synth_keys_bell.wav', category: 'Synths' },
  { id: 'synth_fm_stab', name: 'FM Stab', file: 'synth_fm_stab.wav', category: 'Synths' },
  { id: 'synth_arp', name: 'Arp Blip', file: 'synth_arp.wav', category: 'Synths' },
  { id: 'synth_supersaw', name: 'Supersaw', file: 'synth_supersaw.wav', category: 'Synths' },
  { id: 'synth_pulse_width', name: 'Pulse Width', file: 'synth_pulse_width.wav', category: 'Synths' },
  { id: 'synth_hoover', name: 'Hoover', file: 'synth_hoover.wav', category: 'Synths' },
  { id: 'synth_chord_minor', name: 'Minor Chord', file: 'synth_chord_minor.wav', category: 'Synths' },
  { id: 'synth_chord_maj7', name: 'Maj7 Chord', file: 'synth_chord_maj7.wav', category: 'Synths' },
  // Guitar
  { id: 'guitar_e', name: 'Guitar Low E', file: 'guitar_e.wav', category: 'Guitar' },
  { id: 'guitar_a', name: 'Guitar A', file: 'guitar_a.wav', category: 'Guitar' },
  { id: 'guitar_d', name: 'Guitar D', file: 'guitar_d.wav', category: 'Guitar' },
  { id: 'guitar_g', name: 'Guitar G', file: 'guitar_g.wav', category: 'Guitar' },
  { id: 'guitar_b', name: 'Guitar B', file: 'guitar_b.wav', category: 'Guitar' },
  { id: 'guitar_e_high', name: 'Guitar High E', file: 'guitar_e_high.wav', category: 'Guitar' },
  { id: 'guitar_chord_open', name: 'Guitar Open Chord', file: 'guitar_chord_open.wav', category: 'Guitar' },
  { id: 'guitar_power_chord', name: 'Guitar Power Chord', file: 'guitar_power_chord.wav', category: 'Guitar' },
  { id: 'guitar_mute', name: 'Guitar Mute', file: 'guitar_mute.wav', category: 'Guitar' },
  { id: 'guitar_harmonics', name: 'Guitar Harmonics', file: 'guitar_harmonics.wav', category: 'Guitar' },
  // Keys
  { id: 'piano_c3', name: 'Piano C3', file: 'piano_c3.wav', category: 'Keys' },
  { id: 'piano_e3', name: 'Piano E3', file: 'piano_e3.wav', category: 'Keys' },
  { id: 'piano_g3', name: 'Piano G3', file: 'piano_g3.wav', category: 'Keys' },
  { id: 'piano_c4', name: 'Piano C4', file: 'piano_c4.wav', category: 'Keys' },
  { id: 'piano_e4', name: 'Piano E4', file: 'piano_e4.wav', category: 'Keys' },
  { id: 'piano_chord', name: 'Piano Chord', file: 'piano_chord.wav', category: 'Keys' },
  { id: 'epiano', name: 'Electric Piano', file: 'epiano.wav', category: 'Keys' },
  { id: 'organ', name: 'Organ Drawbar', file: 'organ.wav', category: 'Keys' },
  // Strings / Brass / Winds
  { id: 'strings_pad', name: 'Strings Pad', file: 'strings_pad.wav', category: 'Orchestra' },
  { id: 'violin_lead', name: 'Violin Lead', file: 'violin_lead.wav', category: 'Orchestra' },
  { id: 'cello', name: 'Cello', file: 'cello.wav', category: 'Orchestra' },
  { id: 'brass_stab', name: 'Brass Stab', file: 'brass_stab.wav', category: 'Orchestra' },
  { id: 'trumpet', name: 'Trumpet', file: 'trumpet.wav', category: 'Orchestra' },
  { id: 'flute', name: 'Flute', file: 'flute.wav', category: 'Orchestra' },
  { id: 'sax', name: 'Sax', file: 'sax.wav', category: 'Orchestra' },
  // Melodic perc
  { id: 'kalimba', name: 'Kalimba', file: 'kalimba.wav', category: 'Mallet' },
  { id: 'marimba', name: 'Marimba', file: 'marimba.wav', category: 'Mallet' },
  { id: 'steel_drum', name: 'Steel Drum', file: 'steel_drum.wav', category: 'Mallet' },
  { id: 'bell_church', name: 'Church Bell', file: 'bell_church.wav', category: 'Mallet' },
  // FX
  { id: 'fx', name: 'FX Sweep', file: 'fx.wav', category: 'FX' },
  { id: 'fx_riser', name: 'FX Riser', file: 'fx_riser.wav', category: 'FX' },
  { id: 'fx_downlifter', name: 'FX Downlifter', file: 'fx_downlifter.wav', category: 'FX' },
  { id: 'fx_impact', name: 'FX Impact', file: 'fx_impact.wav', category: 'FX' },
  { id: 'fx_noise_hit', name: 'FX Noise Hit', file: 'fx_noise_hit.wav', category: 'FX' },
  { id: 'fx_laser', name: 'FX Laser', file: 'fx_laser.wav', category: 'FX' },
];

function defaultTracks(): Track[] {
  return [
    { id: 'tr_drums', name: 'Drums', color: TRACK_COLORS[0], volume: 0.85, pan: 0, muted: false, solo: false },
    { id: 'tr_bass', name: 'Bass', color: TRACK_COLORS[1], volume: 0.8, pan: 0, muted: false, solo: false },
    { id: 'tr_vox', name: 'Vocals', color: TRACK_COLORS[2], volume: 0.9, pan: 0, muted: false, solo: false },
    { id: 'tr_fx', name: 'Texture', color: TRACK_COLORS[3], volume: 0.7, pan: 0, muted: false, solo: false },
  ];
}

type ArrSnapshot = {
  tracks: Track[];
  clips: Clip[];
  bpm: number;
  loop: LoopRegion;
};

function takeArrSnapshot(s: { tracks: Track[]; clips: Clip[]; bpm: number; loop: LoopRegion }): ArrSnapshot {
  return {
    tracks: structuredClone(s.tracks),
    clips: structuredClone(s.clips),
    bpm: s.bpm,
    loop: structuredClone(s.loop),
  };
}

const HISTORY_MAX = 60;

interface StudioState {
  hydrated: boolean;
  sessionId: string | null;
  sessions: SessionMeta[];
  projectName: string;
  bpm: number;
  playing: boolean;
  metronome: boolean;
  positionBeat: number;
  pxPerBeat: number;
  snap: number;
  tracks: Track[];
  clips: Clip[];
  samples: Sample[];
  loop: LoopRegion;
  selectedTrackId: string | null;
  selectedClipId: string | null;
  leftTab: 'samples' | 'accent';
  exporting: boolean;
  statusMessage: string | null;
  /** null = still checking; false = show setup hint; true = xAI key present (lyrics / stock TTS) */
  ttsConfigured: boolean | null;
  /** ElevenLabs Instant Voice Cloning + clone TTS */
  cloneConfigured: boolean | null;
  recording: boolean;
  recordStartBeat: number;
  past: ArrSnapshot[];
  future: ArrSnapshot[];

  hydrate: () => Promise<void>;
  refreshSessions: () => Promise<void>;
  newSession: () => Promise<void>;
  switchSession: (id: string) => Promise<void>;
  removeSession: (id: string) => Promise<void>;
  setProjectName: (name: string) => void;
  setBpm: (bpm: number) => void;
  setPxPerBeat: (v: number) => void;
  setSnap: (snap: number) => void;
  setLeftTab: (tab: 'samples' | 'accent') => void;
  setStatus: (msg: string | null) => void;
  setTtsConfigured: (ready: boolean | null) => void;
  setCloneConfigured: (ready: boolean | null) => void;
  applyRemoteSnapshot: (snap: ProjectSnapshot) => void;
  addCapturedSample: (
    name: string,
    blob: Blob,
    opts: {
      source: Sample['source'];
      category: string;
      startBeat?: number;
      trackId?: string;
      place?: boolean;
    },
  ) => Promise<Sample>;
  setRecording: (recording: boolean, startBeat?: number) => void;

  play: () => Promise<void>;
  pause: () => void;
  stop: () => void;
  toggleMetronome: () => void;
  seek: (beat: number) => void;
  tickPosition: () => void;

  selectTrack: (id: string | null) => void;
  selectClip: (id: string | null) => void;
  addTrack: () => void;
  removeTrack: (id: string) => void;
  updateTrack: (id: string, patch: Partial<Track>) => void;

  addClipFromSample: (sampleId: string, trackId: string, startBeat: number) => void;
  applyArrangement: (plan: ArrangementPlan) => Promise<void>;
  commitClipEdit: (
    id: string,
    patch: { startBeat: number; durationBeats: number; offsetBeats: number; trackId?: string },
  ) => void;
  splitClipAtPlayhead: () => void;
  deleteSelectedClip: () => void;
  duplicateSelectedClip: () => void;
  nudgeSelectedClip: (beats: number) => void;

  setLoop: (loop: Partial<LoopRegion>) => void;
  importFiles: (files: FileList | File[]) => Promise<void>;
  addGeneratedSample: (name: string, blob: Blob) => Promise<Sample>;
  reschedule: () => Promise<void>;
  persist: () => Promise<void>;
  exportWav: () => Promise<void>;
  undo: () => void;
  redo: () => void;
  pushHistory: () => void;
}

let persistTimer: ReturnType<typeof setTimeout> | null = null;

function schedulePersist(get: () => StudioState) {
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    void get().persist();
  }, 600);
}

export const useStudio = create<StudioState>((set, get) => ({
  hydrated: false,
  sessionId: null,
  sessions: [],
  projectName: 'Untitled Session',
  bpm: 128,
  playing: false,
  metronome: false,
  positionBeat: 0,
  pxPerBeat: 48,
  snap: 0.25,
  tracks: defaultTracks(),
  clips: [],
  samples: [],
  loop: { enabled: false, startBeat: 0, endBeat: 16 },
  selectedTrackId: 'tr_vox',
  selectedClipId: null,
  leftTab: 'samples',
  exporting: false,
  statusMessage: null,
  ttsConfigured: null,
  cloneConfigured: null,
  recording: false,
  recordStartBeat: 0,
  past: [],
  future: [],

  setProjectName: (name) => {
    set({ projectName: name.slice(0, 64) || 'Untitled Session' });
    schedulePersist(get);
  },

  setBpm: (bpm) => {
    const v = clamp(bpm, 40, 240);
    get().pushHistory();
    audioEngine.setBpm(v);
    set({ bpm: v });
    void get().reschedule();
    schedulePersist(get);
  },

  setPxPerBeat: (v) => set({ pxPerBeat: clamp(v, 20, 160) }),
  setSnap: (snap) => set({ snap }),
  setLeftTab: (tab) => set({ leftTab: tab }),
  setStatus: (msg) => set({ statusMessage: msg }),
  setTtsConfigured: (ready) => set({ ttsConfigured: ready }),
  setCloneConfigured: (ready) => set({ cloneConfigured: ready }),
  setRecording: (recording, startBeat) =>
    set({ recording, recordStartBeat: startBeat ?? get().positionBeat }),

  pushHistory: () => {
    const snap = takeArrSnapshot(get());
    set({
      past: [...get().past, snap].slice(-HISTORY_MAX),
      future: [],
    });
  },

  undo: () => {
    const { past, future } = get();
    if (!past.length) return;
    const prev = past[past.length - 1]!;
    const current = takeArrSnapshot(get());
    set({
      tracks: prev.tracks,
      clips: prev.clips,
      bpm: prev.bpm,
      loop: prev.loop,
      past: past.slice(0, -1),
      future: [current, ...future].slice(0, HISTORY_MAX),
      selectedClipId: null,
    });
    audioEngine.setBpm(prev.bpm);
    void get().reschedule();
    schedulePersist(get);
    get().setStatus('Undo');
  },

  redo: () => {
    const { past, future } = get();
    if (!future.length) return;
    const next = future[0]!;
    const current = takeArrSnapshot(get());
    set({
      tracks: next.tracks,
      clips: next.clips,
      bpm: next.bpm,
      loop: next.loop,
      past: [...past, current].slice(-HISTORY_MAX),
      future: future.slice(1),
      selectedClipId: null,
    });
    audioEngine.setBpm(next.bpm);
    void get().reschedule();
    schedulePersist(get);
    get().setStatus('Redo');
  },

  applyRemoteSnapshot: (snap) => {
    set({
      projectName: snap.name,
      bpm: snap.bpm,
      tracks: snap.tracks,
      clips: snap.clips,
      loop: snap.loop,
    });
    audioEngine.setBpm(snap.bpm);
    void get().reschedule();
    schedulePersist(get);
  },

  hydrate: async () => {
    type Manifest = {
      samples: { id: string; file: string; duration: number; peaks: number[] }[];
    };

    void fetch('/api/health')
      .then((r) => r.json())
      .then(
        (d: {
          ttsConfigured?: boolean;
          xaiConfigured?: boolean;
          elevenLabsConfigured?: boolean;
          cloneConfigured?: boolean;
        }) => {
          set({
            ttsConfigured: Boolean(d.xaiConfigured ?? d.ttsConfigured),
            cloneConfigured: Boolean(d.cloneConfigured ?? d.elevenLabsConfigured),
          });
        },
      )
      .catch(() => set({ ttsConfigured: false, cloneConfigured: false }));

    const { sessionId, meta } = await ensureActiveSession();
    const sessions = await listSessions();

    const [manifest, savedProject, savedSamples] = await Promise.all([
      fetch('/samples/manifest.json')
        .then((r) => (r.ok ? (r.json() as Promise<Manifest>) : null))
        .catch(() => null),
      loadProject(sessionId),
      loadSampleBlobs(sessionId),
    ]);

    const metaByFile = new Map(
      (manifest?.samples ?? []).map((m) => [m.file, m] as const),
    );

    const bundled: Sample[] = BUNDLED.map((b) => {
      const m = metaByFile.get(b.file);
      return {
        id: b.id,
        name: b.name,
        url: `/samples/${b.file}`,
        duration: m?.duration ?? 0.5,
        peaks: m?.peaks ?? [],
        source: 'bundled' as const,
        category: b.category,
      };
    });

    const byId = new Map<string, Sample>();
    for (const s of savedSamples) {
      if (s.source === 'bundled') continue;
      byId.set(s.id, s);
    }
    for (const s of bundled) byId.set(s.id, s);

    const tracks =
      savedProject?.tracks?.length ? savedProject.tracks : defaultTracks();
    const selectedTrackId =
      savedProject?.selectedTrackId && tracks.some((t) => t.id === savedProject.selectedTrackId)
        ? savedProject.selectedTrackId
        : tracks[0]?.id ?? null;

    set({
      hydrated: true,
      sessionId,
      sessions,
      projectName: savedProject?.name ?? meta.name,
      bpm: savedProject?.bpm ?? 128,
      tracks,
      clips: savedProject?.clips ?? [],
      loop: savedProject?.loop ?? { enabled: false, startBeat: 0, endBeat: 16 },
      selectedTrackId,
      selectedClipId: savedProject?.selectedClipId ?? null,
      samples: [...byId.values()],
      playing: false,
      positionBeat: 0,
      past: [],
      future: [],
      statusMessage: savedProject ? `Restored “${savedProject.name}”` : 'Session ready',
    });

    const needed = new Set((savedProject?.clips ?? []).map((c) => c.sampleId));
    if (needed.size) {
      void (async () => {
        try {
          const map = new Map(get().samples.map((s) => [s.id, s]));
          await audioEngine.loadSamplesById([...needed], map);
          audioEngine.setBpm(get().bpm);
        } catch {
          /* first play will retry */
        }
      })();
    }
  },

  refreshSessions: async () => {
    set({ sessions: await listSessions() });
  },

  newSession: async () => {
    await get().persist();
    audioEngine.stop();
    const created = await createSession('Untitled Session');
    set({ sessionId: created.id, hydrated: false, playing: false, positionBeat: 0 });
    await get().hydrate();
    get().setStatus('New session');
  },

  switchSession: async (id) => {
    if (id === get().sessionId) return;
    await get().persist();
    audioEngine.stop();
    await setActiveSessionId(id);
    set({ sessionId: id, hydrated: false, playing: false, positionBeat: 0 });
    await get().hydrate();
  },

  removeSession: async (id) => {
    const list = get().sessions;
    if (list.length <= 1) {
      get().setStatus('Keep at least one session');
      return;
    }
    const wasActive = get().sessionId === id;
    await deleteSession(id);
    if (wasActive) {
      audioEngine.stop();
      set({ hydrated: false, playing: false, positionBeat: 0 });
      await get().hydrate();
    } else {
      await get().refreshSessions();
    }
    get().setStatus('Session deleted');
  },

  play: async () => {
    await audioEngine.init();
    await get().reschedule();
    await audioEngine.play();
    set({ playing: true });
  },

  pause: () => {
    audioEngine.pause();
    set({ playing: false, positionBeat: audioEngine.getPositionBeats() });
  },

  stop: () => {
    audioEngine.stop();
    set({ playing: false, positionBeat: 0 });
  },

  toggleMetronome: () => {
    const next = !get().metronome;
    audioEngine.setMetronome(next, get().bpm);
    set({ metronome: next });
  },

  seek: (beat) => {
    const b = Math.max(0, beat);
    audioEngine.setPositionBeats(b);
    set({ positionBeat: b });
  },

  tickPosition: () => {
    if (!get().playing) return;
    set({ positionBeat: audioEngine.getPositionBeats() });
  },

  selectTrack: (id) => set({ selectedTrackId: id }),
  selectClip: (id) => set({ selectedClipId: id }),

  addTrack: () => {
    get().pushHistory();
    const tracks = get().tracks;
    const color = TRACK_COLORS[tracks.length % TRACK_COLORS.length]!;
    const track: Track = {
      id: uid('tr'),
      name: `Track ${tracks.length + 1}`,
      color,
      volume: 0.85,
      pan: 0,
      muted: false,
      solo: false,
    };
    set({ tracks: [...tracks, track], selectedTrackId: track.id });
    schedulePersist(get);
  },

  removeTrack: (id) => {
    get().pushHistory();
    audioEngine.removeTrack(id);
    set({
      tracks: get().tracks.filter((t) => t.id !== id),
      clips: get().clips.filter((c) => c.trackId !== id),
      selectedTrackId: get().selectedTrackId === id ? null : get().selectedTrackId,
    });
    void get().reschedule();
    schedulePersist(get);
  },

  updateTrack: (id, patch) => {
    const tracks = get().tracks.map((t) => (t.id === id ? { ...t, ...patch } : t));
    set({ tracks });
    // Mute/solo/vol/pan — update graph only, don't rebuild clip schedule
    audioEngine.applySoloMute(tracks);
    const t = tracks.find((x) => x.id === id);
    if (t) audioEngine.ensureTrack(t);
    schedulePersist(get);
  },

  addClipFromSample: (sampleId, trackId, startBeat) => {
    const sample = get().samples.find((s) => s.id === sampleId);
    if (!sample) return;
    get().pushHistory();
    const { bpm, snap } = get();
    const grid = snap || 0.25;
    const durationBeats = Math.max(grid, secondsToBeats(sample.duration, bpm));
    const clip: Clip = {
      id: uid('clip'),
      trackId,
      sampleId,
      startBeat: snapBeat(Math.max(0, startBeat), grid),
      durationBeats: snapBeat(durationBeats, grid) || durationBeats,
      offsetBeats: 0,
    };
    set({ clips: [...get().clips, clip], selectedClipId: clip.id, selectedTrackId: trackId });
    void get().reschedule();
    schedulePersist(get);
  },

  applyArrangement: async (plan) => {
    get().pushHistory();
    audioEngine.stop();

    const bpm = clamp(plan.bpm || 128, 40, 240);
    const tracks: Track[] = plan.tracks.map((t, i) => ({
      id: uid('tr'),
      name: t.name.slice(0, 32) || `Track ${i + 1}`,
      color: TRACK_COLORS[i % TRACK_COLORS.length]!,
      volume: t.role === 'drums' || t.role === 'bass' ? 0.85 : 0.75,
      pan: 0,
      muted: false,
      solo: false,
    }));

    if (!tracks.length) {
      tracks.push(...defaultTracks());
    }

    const grid = get().snap || 0.25;
    const clips: Clip[] = [];
    for (const cl of plan.clips) {
      const sample = get().samples.find((s) => s.id === cl.sampleId);
      if (!sample) continue;
      const track = tracks[cl.trackIndex] ?? tracks[0];
      if (!track) continue;
      const maxDur = Math.max(grid, secondsToBeats(sample.duration, bpm));
      const durationBeats = Math.min(maxDur, Math.max(grid, cl.durationBeats));
      clips.push({
        id: uid('clip'),
        trackId: track.id,
        sampleId: sample.id,
        startBeat: snapBeat(Math.max(0, cl.startBeat), grid),
        durationBeats: snapBeat(durationBeats, grid) || durationBeats,
        offsetBeats: 0,
      });
    }

    const endBeat = Math.max(16, ...clips.map((c) => c.startBeat + c.durationBeats), 16);

    set({
      projectName: plan.name?.slice(0, 48) || 'AI Session',
      bpm,
      tracks,
      clips,
      loop: { enabled: true, startBeat: 0, endBeat: Math.ceil(endBeat / 4) * 4 },
      selectedTrackId: tracks[0]?.id ?? null,
      selectedClipId: null,
      playing: false,
      positionBeat: 0,
      statusMessage: `Arranged “${plan.name || 'AI Session'}” · ${clips.length} clips`,
    });
    audioEngine.setBpm(bpm);
    await get().reschedule();
    schedulePersist(get);
  },

  commitClipEdit: (id, patch) => {
    const clip = get().clips.find((c) => c.id === id);
    if (!clip) return;
    const same =
      clip.startBeat === patch.startBeat &&
      clip.durationBeats === patch.durationBeats &&
      clip.offsetBeats === patch.offsetBeats &&
      (patch.trackId === undefined || patch.trackId === clip.trackId);
    if (same) return;
    get().pushHistory();
    const { snap } = get();
    const grid = snap || 0.25;
    set({
      clips: get().clips.map((c) =>
        c.id === id
          ? {
              ...c,
              startBeat: snapBeat(Math.max(0, patch.startBeat), grid),
              durationBeats: Math.max(grid, patch.durationBeats),
              offsetBeats: Math.max(0, patch.offsetBeats),
              trackId: patch.trackId ?? c.trackId,
            }
          : c,
      ),
    });
    void get().reschedule();
    schedulePersist(get);
  },

  splitClipAtPlayhead: () => {
    const { selectedClipId, clips, positionBeat, snap, bpm, samples } = get();
    if (!selectedClipId) {
      get().setStatus('Select a clip to split');
      return;
    }
    const clip = clips.find((c) => c.id === selectedClipId);
    if (!clip) return;
    const grid = snap || 0.25;
    const cut = snapBeat(positionBeat, grid);
    if (cut <= clip.startBeat + grid || cut >= clip.startBeat + clip.durationBeats - grid) {
      get().setStatus('Move playhead inside the clip to split');
      return;
    }
    const sample = samples.find((s) => s.id === clip.sampleId);
    const localBeat = cut - clip.startBeat;
    const rightOffset = clip.offsetBeats + localBeat;
    const maxBeats = sample ? secondsToBeats(sample.duration, bpm) : rightOffset + 1;
    if (rightOffset >= maxBeats) return;

    get().pushHistory();
    const left: Clip = { ...clip, durationBeats: localBeat };
    const right: Clip = {
      ...clip,
      id: uid('clip'),
      startBeat: cut,
      durationBeats: clip.durationBeats - localBeat,
      offsetBeats: rightOffset,
    };
    set({
      clips: [...clips.filter((c) => c.id !== clip.id), left, right],
      selectedClipId: right.id,
    });
    void get().reschedule();
    schedulePersist(get);
  },

  deleteSelectedClip: () => {
    const id = get().selectedClipId;
    if (!id) return;
    get().pushHistory();
    set({ clips: get().clips.filter((c) => c.id !== id), selectedClipId: null });
    void get().reschedule();
    schedulePersist(get);
  },

  duplicateSelectedClip: () => {
    const { selectedClipId, clips, snap } = get();
    const clip = clips.find((c) => c.id === selectedClipId);
    if (!clip) return;
    get().pushHistory();
    const grid = snap || 0.25;
    const dup: Clip = {
      ...clip,
      id: uid('clip'),
      startBeat: snapBeat(clip.startBeat + clip.durationBeats, grid),
    };
    set({ clips: [...clips, dup], selectedClipId: dup.id });
    void get().reschedule();
    schedulePersist(get);
  },

  nudgeSelectedClip: (beats) => {
    const { selectedClipId, clips, snap } = get();
    const clip = clips.find((c) => c.id === selectedClipId);
    if (!clip) return;
    const grid = snap || 0.25;
    const startBeat = snapBeat(Math.max(0, clip.startBeat + beats), grid);
    get().commitClipEdit(clip.id, {
      startBeat,
      durationBeats: clip.durationBeats,
      offsetBeats: clip.offsetBeats,
    });
  },

  setLoop: (loop) => {
    get().pushHistory();
    set({ loop: { ...get().loop, ...loop } });
    void get().reschedule();
    schedulePersist(get);
  },

  importFiles: async (files) => {
    await audioEngine.init();
    const list = [...files];
    const added: Sample[] = [];
    for (const file of list) {
      if (!file.type.startsWith('audio/') && !/\.(wav|mp3|ogg|m4a|flac)$/i.test(file.name)) continue;
      const decoded = await audioEngine.decodeFile(file);
      const id = uid('smp');
      const sample: Sample = {
        id,
        name: file.name.replace(/\.[^.]+$/, ''),
        url: URL.createObjectURL(decoded.blob),
        duration: decoded.duration,
        peaks: decoded.peaks,
        source: 'upload',
        category: 'Upload',
        blob: decoded.blob,
      };
      audioEngine.registerBuffer(id, decoded.buffer);
      added.push(sample);
    }
    if (!added.length) return;
    set({ samples: [...get().samples, ...added], statusMessage: `Imported ${added.length} sample(s)` });
    schedulePersist(get);
  },

  addGeneratedSample: async (name, blob) => {
    return get().addCapturedSample(name, blob, {
      source: 'accent',
      category: 'Accent',
      place: false,
    });
  },

  addCapturedSample: async (name, blob, opts) => {
    await audioEngine.init();
    const decoded = await audioEngine.decodeFile(blob);
    const id = uid(opts.source === 'midi' ? 'midi' : opts.source === 'record' ? 'rec' : 'smp');
    const sample: Sample = {
      id,
      name,
      url: URL.createObjectURL(decoded.blob),
      duration: decoded.duration,
      peaks: decoded.peaks,
      source: opts.source,
      category: opts.category,
      blob: decoded.blob,
    };
    audioEngine.registerBuffer(id, decoded.buffer);
    set({ samples: [...get().samples, sample] });

    const shouldPlace = opts.place ?? (opts.source === 'record' || opts.source === 'midi');
    const trackId =
      opts.trackId ??
      get().selectedTrackId ??
      get().tracks.find((t) => /guitar|vox|vocal|texture/i.test(t.name))?.id ??
      get().tracks[0]?.id;
    const startBeat = opts.startBeat ?? get().positionBeat;
    if (shouldPlace && trackId) {
      get().addClipFromSample(sample.id, trackId, startBeat);
    } else {
      schedulePersist(get);
    }
    return sample;
  },

  reschedule: async () => {
    const { clips, tracks, samples, bpm, loop } = get();
    const map = new Map(samples.map((s) => [s.id, s]));
    // Only decode audio for clips actually on the timeline
    const needed = clips.map((c) => c.sampleId);
    await audioEngine.loadSamplesById(needed, map);
    audioEngine.scheduleArrangement(clips, tracks, map, bpm, loop);
    audioEngine.setMetronome(get().metronome, bpm);
  },

  persist: async () => {
    const s = get();
    if (!s.sessionId) return;
    const snap: ProjectSnapshot = {
      version: 1,
      name: s.projectName,
      bpm: s.bpm,
      tracks: s.tracks,
      clips: s.clips,
      loop: s.loop,
      selectedTrackId: s.selectedTrackId,
      selectedClipId: s.selectedClipId,
    };
    await saveProject(s.sessionId, snap);
    await saveSampleBlobs(s.sessionId, s.samples);
    await get().refreshSessions();
  },

  exportWav: async () => {
    const { clips, tracks, samples, bpm } = get();
    if (!clips.length) {
      set({ statusMessage: 'Nothing to export — add some clips first.' });
      return;
    }
    set({ exporting: true, statusMessage: 'Rendering mixdown…' });
    try {
      const end = Math.max(...clips.map((c) => c.startBeat + c.durationBeats), 4) + 1;
      const map = new Map(samples.map((s) => [s.id, s]));
      const blob = await audioEngine.bounceWav(clips, tracks, map, bpm, end);
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `${get().projectName.replace(/\s+/g, '_').toLowerCase() || 'chadsound'}.wav`;
      a.click();
      set({ statusMessage: 'WAV exported.' });
    } catch (e) {
      set({ statusMessage: e instanceof Error ? e.message : 'Export failed' });
    } finally {
      set({ exporting: false });
    }
  },
}));

// Keep playhead UI in sync while transport is running
export function startPositionClock(): () => void {
  const id = window.setInterval(() => {
    if (useStudio.getState().playing) {
      useStudio.getState().tickPosition();
    }
  }, 40);
  return () => clearInterval(id);
}
