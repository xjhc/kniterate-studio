import {
  AUTHORED_CAPACITY_LIMITS_V1,
  parseColorworkProjectV1,
  type ColorworkProjectV1,
} from '@kniterate-studio/project-contract';

export const PROJECT_AUTOSAVE_KEY = 'kniterate-studio:active-project:v1';

interface AutosaveEnvelope {
  schemaVersion: 1;
  savedAt: string;
  project: ColorworkProjectV1;
}

export function serializeProjectAutosave(project: ColorworkProjectV1, savedAt = new Date().toISOString()): string {
  return JSON.stringify({ schemaVersion: 1, savedAt, project } satisfies AutosaveEnvelope);
}

export function parseProjectAutosave(value: string | null): AutosaveEnvelope | null {
  if (!value) return null;
  if (value.length > AUTHORED_CAPACITY_LIMITS_V1.projectSourceCodeUnits) return null;
  try {
    const parsed = JSON.parse(value) as Partial<AutosaveEnvelope>;
    if (parsed.schemaVersion !== 1 || typeof parsed.savedAt !== 'string' || parsed.project === undefined) return null;
    return { schemaVersion: 1, savedAt: parsed.savedAt, project: parseColorworkProjectV1(parsed.project) };
  } catch {
    return null;
  }
}

export function readProjectAutosave(storage: Pick<Storage, 'getItem'>): AutosaveEnvelope | null {
  return parseProjectAutosave(storage.getItem(PROJECT_AUTOSAVE_KEY));
}

/** A save this version can't open (damaged, or from a newer Studio), moved here so the next save doesn't replace it. */
export const UNREADABLE_AUTOSAVE_KEY = 'kniterate-studio:unreadable-project:v1';

/**
 * Called once at start with whether the save opened. A save that didn't is
 * moved aside. Returns whether a set-aside copy is waiting, from this start
 * or an earlier one.
 */
export function setAsideUnreadableAutosave(storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>, opened: boolean): boolean {
  const raw = storage.getItem(PROJECT_AUTOSAVE_KEY);
  if (!opened && raw !== null) {
    // Removed first: with the storage full, the copy only fits in the space the save gives up.
    storage.removeItem(PROJECT_AUTOSAVE_KEY);
    try { storage.setItem(UNREADABLE_AUTOSAVE_KEY, raw); } catch { storage.setItem(PROJECT_AUTOSAVE_KEY, raw); throw new Error('The unreadable save could not be moved.'); }
  }
  return storage.getItem(UNREADABLE_AUTOSAVE_KEY) !== null;
}

export function readUnreadableAutosave(storage: Pick<Storage, 'getItem'>): string | null {
  try { return storage.getItem(UNREADABLE_AUTOSAVE_KEY); } catch { return null; }
}

export function clearUnreadableAutosave(storage: Pick<Storage, 'removeItem'>): void {
  try { storage.removeItem(UNREADABLE_AUTOSAVE_KEY); } catch { /* nothing to clear */ }
}
