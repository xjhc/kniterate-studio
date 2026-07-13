import { parseColorworkProjectV1, type ColorworkProjectV1 } from '@kniterate-studio/project-contract';

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
