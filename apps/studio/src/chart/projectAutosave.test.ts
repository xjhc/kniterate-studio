import { describe, expect, it } from 'vitest';
import { createColorworkProjectV1 } from '@kniterate-studio/project-contract';
import { parseProjectAutosave, serializeProjectAutosave } from './projectAutosave';

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
  });
});
