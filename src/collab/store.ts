import { create } from 'zustand';
import PartySocket from 'partysocket';
import type { ProjectSnapshot, Sample } from '../types';
import { TRACK_COLORS, uid } from '../types';
import {
  base64ToBlob,
  blobToBase64,
  peerColor,
  partykitHost,
  PARTY_NAME,
  randomRoomId,
  type ClientMessage,
  type CollabPeerInfo,
  type SamplePayload,
  type ServerMessage,
} from './protocol';
import { useStudio } from '../store/studioStore';
import { audioEngine } from '../engine/AudioEngine';

type CollabState = {
  connected: boolean;
  roomId: string | null;
  peerId: string;
  displayName: string;
  peers: CollabPeerInfo[];
  shareUrl: string | null;
  syncing: boolean;
  lastError: string | null;
  applyingRemote: boolean;

  setDisplayName: (name: string) => void;
  createRoom: () => void;
  joinRoom: (roomId: string) => void;
  leaveRoom: () => void;
  broadcastState: () => void;
  broadcastSample: (sample: Sample) => Promise<void>;
  broadcastTransport: () => void;
};

let socket: PartySocket | WebSocket | null = null;
let stateTimer: ReturnType<typeof setTimeout> | null = null;
let lastAppliedTs = 0;
const knownSampleIds = new Set<string>();

function send(msg: ClientMessage) {
  if (socket?.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(msg));
  }
}

function openCollabSocket(roomId: string, peerId: string): PartySocket | WebSocket {
  const host = partykitHost();
  if (host) {
    return new PartySocket({
      host,
      room: roomId,
      party: PARTY_NAME,
      id: peerId,
      maxRetries: 8,
    });
  }
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return new WebSocket(`${proto}//${window.location.host}/ws`);
}

function snapshotFromStudio(): ProjectSnapshot {
  const s = useStudio.getState();
  return {
    version: 1,
    name: s.projectName,
    bpm: s.bpm,
    tracks: s.tracks,
    clips: s.clips,
    loop: s.loop,
    selectedTrackId: s.selectedTrackId,
    selectedClipId: s.selectedClipId,
  };
}

async function ingestSample(payload: SamplePayload) {
  if (knownSampleIds.has(payload.id)) return;
  knownSampleIds.add(payload.id);
  const existing = useStudio.getState().samples.find((s) => s.id === payload.id);
  if (existing) return;

  const blob = base64ToBlob(payload.dataBase64, payload.mime || 'audio/wav');
  const decoded = await audioEngine.decodeFile(blob);
  const sample: Sample = {
    id: payload.id,
    name: payload.name,
    url: URL.createObjectURL(decoded.blob),
    duration: payload.duration || decoded.duration,
    peaks: payload.peaks?.length ? payload.peaks : decoded.peaks,
    source: (payload.source as Sample['source']) || 'upload',
    category: payload.category,
    blob: decoded.blob,
  };
  audioEngine.registerBuffer(sample.id, decoded.buffer);
  useStudio.setState({ samples: [...useStudio.getState().samples, sample] });
}

export const useCollab = create<CollabState>((set, get) => ({
  connected: false,
  roomId: null,
  peerId: uid('peer'),
  displayName: 'Producer',
  peers: [],
  shareUrl: null,
  syncing: false,
  lastError: null,
  applyingRemote: false,

  setDisplayName: (name) => set({ displayName: name.slice(0, 32) || 'Producer' }),

  createRoom: () => {
    const id = randomRoomId();
    get().joinRoom(id);
    const url = `${window.location.origin}${window.location.pathname}?room=${id}`;
    window.history.replaceState({}, '', `?room=${id}`);
    set({ shareUrl: url });
    void navigator.clipboard?.writeText(url).catch(() => undefined);
    useStudio.getState().setStatus(`Room ${id} — link copied`);
  },

  joinRoom: (roomId) => {
    const clean = roomId.trim().toLowerCase().slice(0, 32);
    if (!clean) return;
    get().leaveRoom();
    knownSampleIds.clear();
    for (const s of useStudio.getState().samples) {
      if (s.source !== 'bundled') knownSampleIds.add(s.id);
    }

    const peerId = get().peerId;
    const host = partykitHost();
    if (!host && !import.meta.env.DEV) {
      set({
        lastError: 'Live share is not configured (missing VITE_PARTYKIT_HOST)',
        syncing: false,
      });
      useStudio.getState().setStatus('Live share unavailable — PartyKit host not set');
      return;
    }

    const ws = openCollabSocket(clean, peerId);
    socket = ws;
    set({
      roomId: clean,
      shareUrl: `${window.location.origin}${window.location.pathname}?room=${clean}`,
      lastError: null,
      syncing: true,
    });
    window.history.replaceState({}, '', `?room=${clean}`);

    ws.onopen = () => {
      set({ connected: true, syncing: false });
      send({
        type: 'join',
        roomId: clean,
        peerId,
        name: get().displayName,
        color: peerColor(peerId),
      });
      // Push our current arrangement shortly after join
      window.setTimeout(() => {
        get().broadcastState();
        for (const s of useStudio.getState().samples) {
          if (s.source !== 'bundled' && s.blob) void get().broadcastSample(s);
        }
      }, 400);
    };

    ws.onmessage = (ev) => {
      let msg: ServerMessage;
      try {
        msg = JSON.parse(String(ev.data)) as ServerMessage;
      } catch {
        return;
      }

      if (msg.type === 'welcome' || msg.type === 'peers') {
        set({ peers: msg.peers });
        return;
      }

      if (msg.type === 'error') {
        set({ lastError: msg.message });
        useStudio.getState().setStatus(msg.message);
        return;
      }

      if (msg.type === 'state') {
        if (msg.from === get().peerId) return;
        if (msg.ts <= lastAppliedTs) return;
        lastAppliedTs = msg.ts;
        set({ applyingRemote: true });
        useStudio.getState().applyRemoteSnapshot(msg.snapshot);
        set({ applyingRemote: false });
        return;
      }

      if (msg.type === 'sample') {
        if (msg.from === get().peerId) return;
        void ingestSample(msg.sample);
        return;
      }

      if (msg.type === 'transport') {
        if (msg.from === get().peerId) return;
        const studio = useStudio.getState();
        if (msg.bpm !== studio.bpm) studio.setBpm(msg.bpm);
        studio.seek(msg.positionBeat);
        if (msg.playing && !studio.playing) void studio.play();
        if (!msg.playing && studio.playing) studio.pause();
      }
    };

    ws.onclose = () => {
      set({ connected: false, syncing: false });
      if (socket === ws) socket = null;
    };

    ws.onerror = () => {
      set({ lastError: 'Collaboration socket error', connected: false });
    };
  },

  leaveRoom: () => {
    if (socket) {
      socket.close();
      socket = null;
    }
    if (stateTimer) clearTimeout(stateTimer);
    set({ roomId: null, peers: [], shareUrl: null, connected: false });
    window.history.replaceState({}, '', window.location.pathname);
  },

  broadcastState: () => {
    if (!get().connected || get().applyingRemote) return;
    if (stateTimer) clearTimeout(stateTimer);
    stateTimer = setTimeout(() => {
      const ts = Date.now();
      lastAppliedTs = Math.max(lastAppliedTs, ts);
      send({ type: 'state', snapshot: snapshotFromStudio(), ts });
    }, 180);
  },

  broadcastSample: async (sample) => {
    if (!get().connected || !sample.blob) return;
    if (sample.source === 'bundled') return;
    knownSampleIds.add(sample.id);
    try {
      const dataBase64 = await blobToBase64(sample.blob);
      const payload: SamplePayload = {
        id: sample.id,
        name: sample.name,
        duration: sample.duration,
        peaks: sample.peaks,
        source: sample.source,
        category: sample.category,
        mime: sample.blob.type || 'audio/wav',
        dataBase64,
      };
      send({ type: 'sample', sample: payload, ts: Date.now() });
    } catch (e) {
      console.warn('Failed to sync sample', e);
    }
  },

  broadcastTransport: () => {
    if (!get().connected || get().applyingRemote) return;
    const s = useStudio.getState();
    send({
      type: 'transport',
      playing: s.playing,
      positionBeat: s.positionBeat,
      bpm: s.bpm,
      ts: Date.now(),
    });
  },
}));

/** Hook studio mutations into collab broadcast. */
export function wireCollabToStudio(): () => void {
  const unsub = useStudio.subscribe((state, prev) => {
    const collab = useCollab.getState();
    if (!collab.connected || collab.applyingRemote) return;

    const arrangementChanged =
      state.tracks !== prev.tracks ||
      state.clips !== prev.clips ||
      state.bpm !== prev.bpm ||
      state.loop !== prev.loop ||
      state.projectName !== prev.projectName;

    if (arrangementChanged) collab.broadcastState();

    if (state.samples !== prev.samples) {
      for (const s of state.samples) {
        if (s.source === 'bundled' || !s.blob) continue;
        if (!prev.samples.find((p) => p.id === s.id)) {
          void collab.broadcastSample(s);
        }
      }
    }

    if (state.playing !== prev.playing || (state.playing && state.positionBeat === 0 && prev.positionBeat !== 0)) {
      collab.broadcastTransport();
    }
  });

  return unsub;
}

export const DISPLAY_COLORS = TRACK_COLORS;
