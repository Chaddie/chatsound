import type { ProjectSnapshot } from '../types';

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

export type CollabPeerInfo = { id: string; name: string; color: string };

export type ServerMessage =
  | { type: 'welcome'; peerId: string; roomId: string; peers: CollabPeerInfo[] }
  | { type: 'peers'; peers: CollabPeerInfo[] }
  | { type: 'state'; snapshot: ProjectSnapshot; ts: number; from: string }
  | { type: 'sample'; sample: SamplePayload; ts: number; from: string }
  | { type: 'transport'; playing: boolean; positionBeat: number; bpm: number; ts: number; from: string }
  | { type: 'error'; message: string }
  | { type: 'pong' };

export type ClientMessage =
  | { type: 'join'; roomId: string; peerId: string; name: string; color: string }
  | { type: 'state'; snapshot: ProjectSnapshot; ts: number }
  | { type: 'sample'; sample: SamplePayload; ts: number }
  | { type: 'transport'; playing: boolean; positionBeat: number; bpm: number; ts: number }
  | { type: 'ping' };

export function randomRoomId(): string {
  return Math.random().toString(36).slice(2, 8);
}

export function peerColor(id: string): string {
  const colors = ['#c8f135', '#f0a830', '#5ec8ff', '#ff6b6b', '#d4a5ff', '#7dffb3'];
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h + id.charCodeAt(i) * 17) % colors.length;
  return colors[h]!;
}

export async function blobToBase64(blob: Blob): Promise<string> {
  const buf = await blob.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

export function base64ToBlob(base64: string, mime: string): Blob {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

/** Party name for PartySocket (kebab-case of Durable Object binding). */
export const PARTY_NAME = 'collab-server';

/** PartyKit / Workers host (no protocol). Dev defaults to local wrangler; prod uses VITE_PARTYKIT_HOST. */
export function partykitHost(): string | null {
  const fromEnv = (import.meta.env.VITE_PARTYKIT_HOST as string | undefined)?.trim();
  if (fromEnv) {
    return fromEnv.replace(/^https?:\/\//i, '').replace(/\/$/, '');
  }
  if (import.meta.env.DEV) return '127.0.0.1:1999';
  return null;
}

export function collabAvailable(): boolean {
  return Boolean(partykitHost()) || import.meta.env.DEV;
}
