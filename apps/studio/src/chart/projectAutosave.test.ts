import { describe, expect, it } from 'vitest';
import { AUTHORED_CAPACITY_LIMITS_V1, createColorworkProjectV1 } from '@kniterate-studio/project-contract';
import { PROJECT_AUTOSAVE_KEY, UNREADABLE_AUTOSAVE_KEY, parseProjectAutosave, serializeProjectAutosave, setAsideUnreadableAutosave } from './projectAutosave';

const project = createColorworkProjectV1({
  kind: 'knitlab-colorwork-chart', version: 1, title: 'Recovery', width: 2, height: 2,
  rowNumbering: 'bottom-up', palette: [{ id: 'ink', name: 'Ink', hex: '#112233' }],
  cells: [[0, 0], [0, 0]],
}, { id: 'recovery' });

describe('project autosave', () => {
  it('round-trips through a validated versioned envelope', () => {
    const restored = parseProjectAutosave(serializeProjectAutosave(project, '2026-07-12T00:00:00.000Z'));
    expect(restored).toEqual({ schemaVersion: 1, savedAt: '2026-07-12T00:00:00.000Z', project });
  });

  it('rejects malformed or invalid saved projects', () => {
    expect(parseProjectAutosave('{')).toBeNull();
    expect(parseProjectAutosave(JSON.stringify({ schemaVersion: 1, savedAt: 'now', project: { kind: 'wrong' } }))).toBeNull();
    expect(parseProjectAutosave(' '.repeat(AUTHORED_CAPACITY_LIMITS_V1.projectSourceCodeUnits + 1))).toBeNull();
  });

  it('moves a save that did not open aside, and leaves one that opened alone', () => {
    const memory = (entries: Record<string, string>) => {
      const map = new Map(Object.entries(entries));
      return { map, getItem: (key: string) => map.get(key) ?? null, setItem: (key: string, value: string) => void map.set(key, value), removeItem: (key: string) => void map.delete(key) };
    };
    const damaged = memory({ [PROJECT_AUTOSAVE_KEY]: '{' });
    expect(setAsideUnreadableAutosave(damaged, false)).toBe(true);
    expect(Object.fromEntries(damaged.map)).toEqual({ [UNREADABLE_AUTOSAVE_KEY]: '{' });
    // The copy is still reported on a later start, until it is dismissed.
    expect(setAsideUnreadableAutosave(damaged, false)).toBe(true);

    const fine = memory({ [PROJECT_AUTOSAVE_KEY]: serializeProjectAutosave(project) });
    expect(setAsideUnreadableAutosave(fine, true)).toBe(false);
    expect(fine.map.has(UNREADABLE_AUTOSAVE_KEY)).toBe(false);
    expect(setAsideUnreadableAutosave(memory({}), false)).toBe(false);
  });
});
