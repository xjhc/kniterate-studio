import type { ColorworkProjectV1, ProjectObject } from '@kniterate-studio/project-contract';
import { parseProjectAutosave, serializeProjectAutosave } from './projectAutosave';

/**
 * Every project kept on this device, not only the open one, so starting or
 * opening another project never replaces one. Each project lives in its own
 * slot: a file opened twice gets two, so an older file never overwrites newer
 * work. The index lists them, newest first. Nothing is dropped to make room:
 * when the browser's storage is full, saving fails and says so.
 */

export const RECENT_INDEX_KEY = 'kniterate-studio:recent-projects:v1';
/** The open project's slot, beside the open project's own autosave. */
export const ACTIVE_SLOT_KEY = 'kniterate-studio:active-slot:v1';
const SLOT_PREFIX = 'kniterate-studio:recent-project:v1:';

export type RecentKind = ProjectObject['kind'] | 'chart';

export interface RecentProject {
  slot: string;
  id: string;
  title: string;
  kind: RecentKind;
  savedAt: string;
}

const KINDS: readonly RecentKind[] = ['sweater', 'beanie', 'panel', 'chart'];

export function newRecentSlot(): string {
  return crypto.randomUUID().replace(/-/g, '').slice(0, 12);
}

export function recentKind(object: ProjectObject | null | undefined): RecentKind {
  return object?.kind ?? 'chart';
}

export function readRecentProjects(storage: Pick<Storage, 'getItem'>): RecentProject[] {
  try {
    const parsed: unknown = JSON.parse(storage.getItem(RECENT_INDEX_KEY) ?? '[]');
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is RecentProject => typeof item === 'object' && item !== null
      && (['slot', 'id', 'title', 'savedAt'] as const).every((field) => typeof (item as Record<string, unknown>)[field] === 'string')
      && KINDS.includes((item as RecentProject).kind));
  } catch {
    return [];
  }
}

/** The slot a storage key holds a project for, or null for any other key. */
export function recentSlotOf(key: string | null): string | null {
  return key?.startsWith(SLOT_PREFIX) ? key.slice(SLOT_PREFIX.length) : null;
}

export function readRecentProject(storage: Pick<Storage, 'getItem'>, slot: string): ColorworkProjectV1 | null {
  return parseProjectAutosave(storage.getItem(SLOT_PREFIX + slot))?.project ?? null;
}

/** Saves a project in its slot and moves it to the top of the list. Throws when the browser's storage is full. */
export function rememberProject(storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>, entry: { slot: string; project: ColorworkProjectV1; kind: RecentKind; savedAt?: string }): RecentProject[] {
  const savedAt = entry.savedAt ?? new Date().toISOString();
  const earlier = readRecentProjects(storage);
  const list = [
    { slot: entry.slot, id: entry.project.id, title: entry.project.title, kind: entry.kind, savedAt },
    ...earlier.filter((item) => item.slot !== entry.slot),
  ];
  // The project first, then the list that points to it.
  storage.setItem(SLOT_PREFIX + entry.slot, serializeProjectAutosave(entry.project, savedAt));
  try {
    storage.setItem(RECENT_INDEX_KEY, JSON.stringify(list));
  } catch (error) {
    if (!earlier.some((item) => item.slot === entry.slot)) storage.removeItem(SLOT_PREFIX + entry.slot);
    throw error;
  }
  return list;
}

/** Removes a project from this device for good. */
export function forgetProject(storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>, slot: string): RecentProject[] {
  const list = readRecentProjects(storage).filter((item) => item.slot !== slot);
  storage.setItem(RECENT_INDEX_KEY, JSON.stringify(list));
  storage.removeItem(SLOT_PREFIX + slot);
  return list;
}
