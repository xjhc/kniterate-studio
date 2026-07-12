import { describe, expect, it } from 'vitest';
import { pen } from '@knitlab/colorwork-core';
import { createColorworkProjectV1, materializeColorworkProject } from '@kniterate-studio/project-contract';
import { pixelMutationToProjectEdit } from './projectCanvasAdapter';

describe('project canvas adapter', () => {
  it('deduplicates a complete pen gesture into one project paint edit', () => {
    const project = createColorworkProjectV1({ kind: 'knitlab-colorwork-chart', version: 1, width: 100, height: 1, rowNumbering: 'bottom-up', palette: [{ id: 'base', name: 'Base', hex: '#FFFFFF' }, { id: 'ink', name: 'Ink', hex: '#000000' }], cells: [Array(100).fill(0)] }, { id: 'drag' });
    const state = materializeColorworkProject(project).state;
    const mutation = pen(state.chart, Array.from({ length: 100 }, (_, column) => ({ column, row: 0 })), 1);
    const edit = pixelMutationToProjectEdit(project, state.rowIds, mutation);
    expect(edit?.kind).toBe('paint-cells');
    if (edit?.kind !== 'paint-cells') throw new Error('expected paint-cells edit');
    expect(edit.cells).toHaveLength(100);
    expect(edit.cells[0]).toMatchObject({ column: 0, paletteIndex: 1 });
    expect(edit.cells[99]).toMatchObject({ column: 99, paletteIndex: 1 });
  });
});
