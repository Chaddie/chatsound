import type { WSContext } from 'hono/ws';

/** Mirrors client ProjectSnapshot without importing React app paths. */
export type ProjectSnapshot = {
  version: 1;
  name: string;
  bpm: number;
  tracks: unknown[];
  clips: unknown[];
  loop: { enabled: boolean; startBeat: number; endBeat: number };
  selectedTrackId: string | null;
  selectedClipId: string | null;
};

export type CollabPeer = {
  id: string;
  name: string;
  color: string;
  ws: WSContext;
};

export type SamplePayload = {
  id: string;
  name: string;
  duration: number;
  peaks: number[];
  source: string;
  category?: string;
  mime: string;
  dataBase64: string;
};

export type ClientMessage =
  | { type: 'join'; roomId: string; peerId: string; name: string; color: string }
  | { type: 'state'; snapshot: ProjectSnapshot; ts: number }
  | { type: 'sample'; sample: SamplePayload; ts: number }
  | { type: 'transport'; playing: boolean; positionBeat: number; bpm: number; ts: number }
  | { type: 'ping' };

export type ServerMessage =
  | { type: 'welcome'; peerId: string; roomId: string; peers: Omit<CollabPeer, 'ws'>[] }
  | { type: 'peers'; peers: { id: string; name: string; color: string }[] }
  | { type: 'state'; snapshot: ProjectSnapshot; ts: number; from: string }
  | { type: 'sample'; sample: SamplePayload; ts: number; from: string }
  | { type: 'transport'; playing: boolean; positionBeat: number; bpm: number; ts: number; from: string }
  | { type: 'error'; message: string }
  | { type: 'pong' };

type Room = {
  id: string;
  peers: Map<string, CollabPeer>;
  latestState?: { snapshot: ProjectSnapshot; ts: number; from: string };
  samples: Map<string, SamplePayload>;
};

const rooms = new Map<string, Room>();

function peerList(room: Room) {
  return [...room.peers.values()].map(({ id, name, color }) => ({ id, name, color }));
}

function send(ws: WSContext, msg: ServerMessage) {
  try {
    ws.send(JSON.stringify(msg));
  } catch {
    /* closed */
  }
}

function broadcast(room: Room, msg: ServerMessage, exceptPeerId?: string) {
  for (const peer of room.peers.values()) {
    if (exceptPeerId && peer.id === exceptPeerId) continue;
    send(peer.ws, msg);
  }
}

export function handleCollabMessage(ws: WSContext, raw: string): void {
  let msg: ClientMessage;
  try {
    msg = JSON.parse(raw) as ClientMessage;
  } catch {
    send(ws, { type: 'error', message: 'Invalid JSON' });
    return;
  }

  if (msg.type === 'ping') {
    send(ws, { type: 'pong' });
    return;
  }

  if (msg.type === 'join') {
    const roomId = msg.roomId.trim().toLowerCase().slice(0, 32);
    if (!roomId) {
      send(ws, { type: 'error', message: 'roomId required' });
      return;
    }

    // Leave previous rooms
    leaveAll(ws);

    let room = rooms.get(roomId);
    if (!room) {
      room = { id: roomId, peers: new Map(), samples: new Map() };
      rooms.set(roomId, room);
    }

    const peer: CollabPeer = {
      id: msg.peerId,
      name: msg.name.slice(0, 32) || 'Producer',
      color: msg.color,
      ws,
    };
    room.peers.set(peer.id, peer);
    (ws as WSContext & { __roomId?: string; __peerId?: string }).__roomId = roomId;
    (ws as WSContext & { __roomId?: string; __peerId?: string }).__peerId = peer.id;

    send(ws, {
      type: 'welcome',
      peerId: peer.id,
      roomId,
      peers: peerList(room),
    });
    broadcast(room, { type: 'peers', peers: peerList(room) }, peer.id);

    if (room.latestState) {
      send(ws, {
        type: 'state',
        snapshot: room.latestState.snapshot,
        ts: room.latestState.ts,
        from: room.latestState.from,
      });
    }
    for (const sample of room.samples.values()) {
      send(ws, { type: 'sample', sample, ts: Date.now(), from: 'server' });
    }
    return;
  }

  const meta = ws as WSContext & { __roomId?: string; __peerId?: string };
  const room = meta.__roomId ? rooms.get(meta.__roomId) : undefined;
  const peerId = meta.__peerId;
  if (!room || !peerId) {
    send(ws, { type: 'error', message: 'Join a room first' });
    return;
  }

  if (msg.type === 'state') {
    room.latestState = { snapshot: msg.snapshot, ts: msg.ts, from: peerId };
    broadcast(room, { type: 'state', snapshot: msg.snapshot, ts: msg.ts, from: peerId }, peerId);
    return;
  }

  if (msg.type === 'sample') {
    // Cap room sample cache (~25MB base64 ~18MB binary rough)
    const size = msg.sample.dataBase64.length;
    let total = 0;
    for (const s of room.samples.values()) total += s.dataBase64.length;
    if (total + size < 30_000_000) {
      room.samples.set(msg.sample.id, msg.sample);
    }
    broadcast(room, { type: 'sample', sample: msg.sample, ts: msg.ts, from: peerId }, peerId);
    return;
  }

  if (msg.type === 'transport') {
    broadcast(
      room,
      {
        type: 'transport',
        playing: msg.playing,
        positionBeat: msg.positionBeat,
        bpm: msg.bpm,
        ts: msg.ts,
        from: peerId,
      },
      peerId,
    );
  }
}

export function handleCollabClose(ws: WSContext): void {
  leaveAll(ws);
}

function leaveAll(ws: WSContext) {
  const meta = ws as WSContext & { __roomId?: string; __peerId?: string };
  const roomId = meta.__roomId;
  const peerId = meta.__peerId;
  if (!roomId || !peerId) return;
  const room = rooms.get(roomId);
  if (!room) return;
  room.peers.delete(peerId);
  meta.__roomId = undefined;
  meta.__peerId = undefined;
  if (room.peers.size === 0) {
    rooms.delete(roomId);
  } else {
    broadcast(room, { type: 'peers', peers: peerList(room) });
  }
}
