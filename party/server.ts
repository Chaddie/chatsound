import { Server, type Connection, routePartykitRequest } from 'partyserver';

type ProjectSnapshot = {
  version: 1;
  name: string;
  bpm: number;
  tracks: unknown[];
  clips: unknown[];
  loop: { enabled: boolean; startBeat: number; endBeat: number };
  selectedTrackId: string | null;
  selectedClipId: string | null;
};

type SamplePayload = {
  id: string;
  name: string;
  duration: number;
  peaks: number[];
  source: string;
  category?: string;
  mime: string;
  dataBase64: string;
};

type PeerInfo = { id: string; name: string; color: string };

type ClientMessage =
  | { type: 'join'; roomId: string; peerId: string; name: string; color: string }
  | { type: 'state'; snapshot: ProjectSnapshot; ts: number }
  | { type: 'sample'; sample: SamplePayload; ts: number }
  | { type: 'transport'; playing: boolean; positionBeat: number; bpm: number; ts: number }
  | { type: 'ping' };

type ServerMessage =
  | { type: 'welcome'; peerId: string; roomId: string; peers: PeerInfo[] }
  | { type: 'peers'; peers: PeerInfo[] }
  | { type: 'state'; snapshot: ProjectSnapshot; ts: number; from: string }
  | { type: 'sample'; sample: SamplePayload; ts: number; from: string }
  | { type: 'transport'; playing: boolean; positionBeat: number; bpm: number; ts: number; from: string }
  | { type: 'error'; message: string }
  | { type: 'pong' };

type ConnState = { peerId: string; name: string; color: string };

export type Env = {
  CollabServer: DurableObjectNamespace<CollabServer>;
};

function send(conn: Connection<ConnState>, msg: ServerMessage) {
  try {
    conn.send(JSON.stringify(msg));
  } catch {
    /* closed */
  }
}

export class CollabServer extends Server<Env, ConnState> {
  static options = { hibernate: false };

  latestState?: { snapshot: ProjectSnapshot; ts: number; from: string };
  samples = new Map<string, SamplePayload>();

  peerList(): PeerInfo[] {
    const peers: PeerInfo[] = [];
    for (const conn of this.getConnections<ConnState>()) {
      const s = conn.state;
      if (s?.peerId) peers.push({ id: s.peerId, name: s.name, color: s.color });
    }
    return peers;
  }

  onMessage(sender: Connection<ConnState>, message: string | ArrayBuffer) {
    if (typeof message !== 'string') return;

    let msg: ClientMessage;
    try {
      msg = JSON.parse(message) as ClientMessage;
    } catch {
      send(sender, { type: 'error', message: 'Invalid JSON' });
      return;
    }

    if (msg.type === 'ping') {
      send(sender, { type: 'pong' });
      return;
    }

    if (msg.type === 'join') {
      const peer: ConnState = {
        peerId: msg.peerId,
        name: (msg.name || 'Producer').slice(0, 32),
        color: msg.color,
      };
      sender.setState(peer);

      send(sender, {
        type: 'welcome',
        peerId: peer.peerId,
        roomId: this.name,
        peers: this.peerList(),
      });
      this.broadcast(JSON.stringify({ type: 'peers', peers: this.peerList() }), [sender.id]);

      if (this.latestState) {
        send(sender, {
          type: 'state',
          snapshot: this.latestState.snapshot,
          ts: this.latestState.ts,
          from: this.latestState.from,
        });
      }
      for (const sample of this.samples.values()) {
        send(sender, { type: 'sample', sample, ts: Date.now(), from: 'server' });
      }
      return;
    }

    const peerId = sender.state?.peerId;
    if (!peerId) {
      send(sender, { type: 'error', message: 'Join a room first' });
      return;
    }

    if (msg.type === 'state') {
      this.latestState = { snapshot: msg.snapshot, ts: msg.ts, from: peerId };
      this.broadcast(
        JSON.stringify({ type: 'state', snapshot: msg.snapshot, ts: msg.ts, from: peerId }),
        [sender.id],
      );
      return;
    }

    if (msg.type === 'sample') {
      const size = msg.sample.dataBase64.length;
      let total = 0;
      for (const s of this.samples.values()) total += s.dataBase64.length;
      if (total + size < 30_000_000) {
        this.samples.set(msg.sample.id, msg.sample);
      }
      this.broadcast(
        JSON.stringify({ type: 'sample', sample: msg.sample, ts: msg.ts, from: peerId }),
        [sender.id],
      );
      return;
    }

    if (msg.type === 'transport') {
      this.broadcast(
        JSON.stringify({
          type: 'transport',
          playing: msg.playing,
          positionBeat: msg.positionBeat,
          bpm: msg.bpm,
          ts: msg.ts,
          from: peerId,
        }),
        [sender.id],
      );
    }
  }

  onClose(conn: Connection<ConnState>) {
    if (!conn.state?.peerId) return;
    this.broadcast(JSON.stringify({ type: 'peers', peers: this.peerList() }), [conn.id]);
  }

  onError(conn: Connection<ConnState>) {
    this.onClose(conn);
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const routed = await routePartykitRequest(request, env);
    if (routed) return routed;
    return new Response('Chatsound collab — connect via /parties/collab-server/:room', {
      status: 200,
    });
  },
};
