import { get, set, del, keys } from 'idb-keyval';
import type { ProjectSnapshot, Sample } from '../types';
import { uid } from '../types';

const INDEX_KEY = 'chadsound-sessions-index';
const ACTIVE_KEY = 'chadsound-active-session';
/** Legacy single-project keys (migrated on first load). */
const LEGACY_PROJECT_KEY = 'chadsound-project';
const LEGACY_SAMPLES_META_KEY = 'chadsound-samples-meta';

export type SessionMeta = {
  id: string;
  name: string;
  updatedAt: number;
};

function projectKey(sessionId: string) {
  return `chadsound-session-${sessionId}-project`;
}
function samplesMetaKey(sessionId: string) {
  return `chadsound-session-${sessionId}-samples-meta`;
}
function sampleBlobKey(sessionId: string, sampleId: string) {
  return `chadsound-session-${sessionId}-sample-${sampleId}`;
}
function legacySampleBlobKey(id: string) {
  return `chadsound-sample-${id}`;
}

export interface PersistedSampleMeta {
  id: string;
  name: string;
  duration: number;
  peaks: number[];
  source: Sample['source'];
  category?: string;
}

export async function listSessions(): Promise<SessionMeta[]> {
  await migrateLegacyIfNeeded();
  const list = (await get<SessionMeta[]>(INDEX_KEY)) ?? [];
  return [...list].sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function getActiveSessionId(): Promise<string | null> {
  await migrateLegacyIfNeeded();
  return (await get<string>(ACTIVE_KEY)) ?? null;
}

export async function setActiveSessionId(id: string): Promise<void> {
  await set(ACTIVE_KEY, id);
}

async function writeIndex(list: SessionMeta[]): Promise<void> {
  await set(INDEX_KEY, list);
}

export async function createSession(name = 'Untitled Session'): Promise<SessionMeta> {
  await migrateLegacyIfNeeded();
  const meta: SessionMeta = {
    id: uid('sess'),
    name,
    updatedAt: Date.now(),
  };
  const list = (await get<SessionMeta[]>(INDEX_KEY)) ?? [];
  list.unshift(meta);
  await writeIndex(list);
  await setActiveSessionId(meta.id);
  await set(projectKey(meta.id), emptyProject(name));
  await set(samplesMetaKey(meta.id), [] as PersistedSampleMeta[]);
  return meta;
}

function emptyProject(name: string): ProjectSnapshot {
  return {
    version: 1,
    name,
    bpm: 128,
    tracks: [],
    clips: [],
    loop: { enabled: false, startBeat: 0, endBeat: 16 },
    selectedTrackId: null,
    selectedClipId: null,
  };
}

export async function renameSession(id: string, name: string): Promise<void> {
  const list = (await get<SessionMeta[]>(INDEX_KEY)) ?? [];
  const next = list.map((s) =>
    s.id === id ? { ...s, name, updatedAt: Date.now() } : s,
  );
  await writeIndex(next);
  const project = await get<ProjectSnapshot>(projectKey(id));
  if (project) {
    await set(projectKey(id), { ...project, name });
  }
}

export async function touchSession(id: string, name?: string): Promise<void> {
  const list = (await get<SessionMeta[]>(INDEX_KEY)) ?? [];
  const next = list.map((s) =>
    s.id === id
      ? { ...s, name: name ?? s.name, updatedAt: Date.now() }
      : s,
  );
  await writeIndex(next);
}

export async function deleteSession(id: string): Promise<void> {
  const list = ((await get<SessionMeta[]>(INDEX_KEY)) ?? []).filter((s) => s.id !== id);
  await writeIndex(list);

  const meta = (await get<PersistedSampleMeta[]>(samplesMetaKey(id))) ?? [];
  await del(projectKey(id));
  await del(samplesMetaKey(id));
  for (const m of meta) {
    if (m.source !== 'bundled') await del(sampleBlobKey(id, m.id));
  }

  const active = await get<string>(ACTIVE_KEY);
  if (active === id) {
    if (list[0]) await setActiveSessionId(list[0].id);
    else await del(ACTIVE_KEY);
  }
}

export async function saveProject(sessionId: string, snapshot: ProjectSnapshot): Promise<void> {
  await set(projectKey(sessionId), snapshot);
  await touchSession(sessionId, snapshot.name);
}

export async function loadProject(sessionId: string): Promise<ProjectSnapshot | undefined> {
  return get<ProjectSnapshot>(projectKey(sessionId));
}

export async function saveSampleBlobs(sessionId: string, samples: Sample[]): Promise<void> {
  const prevMeta = (await get<PersistedSampleMeta[]>(samplesMetaKey(sessionId))) ?? [];
  const prevIds = new Set(prevMeta.filter((m) => m.source !== 'bundled').map((m) => m.id));
  const meta: PersistedSampleMeta[] = [];
  const keepIds = new Set<string>();

  for (const s of samples) {
    if (s.source === 'bundled') {
      meta.push({
        id: s.id,
        name: s.name,
        duration: s.duration,
        peaks: s.peaks,
        source: s.source,
        category: s.category,
      });
      continue;
    }
    if (s.blob) {
      await set(sampleBlobKey(sessionId, s.id), s.blob);
      keepIds.add(s.id);
      meta.push({
        id: s.id,
        name: s.name,
        duration: s.duration,
        peaks: s.peaks,
        source: s.source,
        category: s.category,
      });
    }
  }

  for (const id of prevIds) {
    if (!keepIds.has(id)) await del(sampleBlobKey(sessionId, id));
  }
  await set(samplesMetaKey(sessionId), meta);
}

export async function loadSampleBlobs(sessionId: string): Promise<Sample[]> {
  const meta = (await get<PersistedSampleMeta[]>(samplesMetaKey(sessionId))) ?? [];
  const samples: Sample[] = [];
  for (const m of meta) {
    if (m.source === 'bundled') continue;
    const blob = await get<Blob>(sampleBlobKey(sessionId, m.id));
    if (!blob) continue;
    samples.push({
      ...m,
      blob,
      url: URL.createObjectURL(blob),
    });
  }
  return samples;
}

/** Ensure at least one session exists; migrate legacy single-project store. */
export async function ensureActiveSession(): Promise<{ sessionId: string; meta: SessionMeta }> {
  await migrateLegacyIfNeeded();
  let list = (await get<SessionMeta[]>(INDEX_KEY)) ?? [];
  let active = await get<string>(ACTIVE_KEY);

  if (!list.length) {
    const created = await createSession('Untitled Session');
    return { sessionId: created.id, meta: created };
  }

  if (!active || !list.some((s) => s.id === active)) {
    active = list[0]!.id;
    await setActiveSessionId(active);
  }

  const meta = list.find((s) => s.id === active)!;
  return { sessionId: active, meta };
}

let migrated = false;

async function migrateLegacyIfNeeded(): Promise<void> {
  if (migrated) return;
  migrated = true;

  const existing = await get<SessionMeta[]>(INDEX_KEY);
  if (existing?.length) return;

  const legacyProject = await get<ProjectSnapshot>(LEGACY_PROJECT_KEY);
  if (!legacyProject) return;

  const id = uid('sess');
  const meta: SessionMeta = {
    id,
    name: legacyProject.name || 'Untitled Session',
    updatedAt: Date.now(),
  };
  await writeIndex([meta]);
  await setActiveSessionId(id);
  await set(projectKey(id), legacyProject);

  const legacyMeta = (await get<PersistedSampleMeta[]>(LEGACY_SAMPLES_META_KEY)) ?? [];
  const nextMeta: PersistedSampleMeta[] = [];
  for (const m of legacyMeta) {
    if (m.source === 'bundled') {
      nextMeta.push(m);
      continue;
    }
    const blob = await get<Blob>(legacySampleBlobKey(m.id));
    if (blob) {
      await set(sampleBlobKey(id, m.id), blob);
      nextMeta.push(m);
    }
  }
  await set(samplesMetaKey(id), nextMeta);

  await del(LEGACY_PROJECT_KEY);
  await del(LEGACY_SAMPLES_META_KEY);
  // Best-effort: leave old blob keys; they'll be unused. Optional sweep:
  const allKeys = await keys();
  for (const k of allKeys) {
    if (typeof k === 'string' && k.startsWith('chadsound-sample-') && !k.includes('-session-')) {
      await del(k);
    }
  }
}

/** @deprecated use session-scoped APIs */
export async function clearPersisted(): Promise<void> {
  const list = (await get<SessionMeta[]>(INDEX_KEY)) ?? [];
  for (const s of list) await deleteSession(s.id);
  await del(INDEX_KEY);
  await del(ACTIVE_KEY);
}
