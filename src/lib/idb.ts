import { get, set, del } from 'idb-keyval';
import type { ProjectSnapshot, Sample } from '../types';

const PROJECT_KEY = 'chadsound-project';
const SAMPLES_META_KEY = 'chadsound-samples-meta';
const sampleBlobKey = (id: string) => `chadsound-sample-${id}`;

export interface PersistedSampleMeta {
  id: string;
  name: string;
  duration: number;
  peaks: number[];
  source: Sample['source'];
  category?: string;
}

export async function saveProject(snapshot: ProjectSnapshot): Promise<void> {
  await set(PROJECT_KEY, snapshot);
}

export async function loadProject(): Promise<ProjectSnapshot | undefined> {
  return get<ProjectSnapshot>(PROJECT_KEY);
}

export async function saveSampleBlobs(samples: Sample[]): Promise<void> {
  const meta: PersistedSampleMeta[] = [];
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
      await set(sampleBlobKey(s.id), s.blob);
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
  await set(SAMPLES_META_KEY, meta);
}

export async function loadSampleBlobs(): Promise<Sample[]> {
  const meta = (await get<PersistedSampleMeta[]>(SAMPLES_META_KEY)) ?? [];
  const samples: Sample[] = [];
  for (const m of meta) {
    if (m.source === 'bundled') {
      samples.push({
        ...m,
        url: `/samples/${m.id}.wav`,
      });
      continue;
    }
    const blob = await get<Blob>(sampleBlobKey(m.id));
    if (!blob) continue;
    samples.push({
      ...m,
      blob,
      url: URL.createObjectURL(blob),
    });
  }
  return samples;
}

export async function clearPersisted(): Promise<void> {
  await del(PROJECT_KEY);
  await del(SAMPLES_META_KEY);
}
