import { describe, expect, it } from 'vitest';
import { appendProjectEdit, materializeColorworkProject } from '@kniterate-studio/project-contract';
import { openStudioProjectJson } from './projectFile';

const chart = JSON.stringify({
  kind: 'knitlab-colorwork-chart', version: 1, title: 'Shared checker', width: 2, height: 2,
  rowNumbering: 'bottom-up',
  palette: [{ id: 'natural', name: 'Natural', hex: '#FFFFFF' }, { id: 'ink', name: 'Ink', hex: '#000000' }],
  cells: [[0, 1], [1, 0]],
});

describe('Studio chart/project intake', () => {
  it('wraps ColorworkChartV1 in a new durable project without changing cells', () => {
    const opened = openStudioProjectJson(chart, () => 'fixture');
    expect(opened.source).toBe('chart');
    expect(opened.project.id).toBe('shared-checker-fixture');
    expect(opened.project.base.chart.cells).toEqual([[0, 1], [1, 0]]);
  });

  it('reopens a saved ColorworkProjectV1 with its cells and history cursor intact', () => {
    const initial = openStudioProjectJson(chart, () => 'fixture').project;
    const created = appendProjectEdit(initial, {
      id: 'paint-one-cell', source: 'human',
      edit: { kind: 'paint-cells', cells: [{ rowId: initial.base.rowIds[0]!, column: 0, paletteIndex: 1 }] },
    });
    const reopened = openStudioProjectJson(JSON.stringify(created));
    expect(reopened).toEqual({ project: created, source: 'project' });
    expect(reopened.project.history.cursor).toBe(1);
    expect(materializeColorworkProject(reopened.project).state.chart.cells[0]![0]).toBe(1);
  });

  it('accepts a valid one-color chart without inventing another palette entry', () => {
    const oneColor = JSON.stringify({
      kind: 'knitlab-colorwork-chart', version: 1, width: 1, height: 1, rowNumbering: 'bottom-up',
      palette: [{ id: 'natural', name: 'Natural', hex: '#FFFFFF' }], cells: [[0]],
    });
    expect(openStudioProjectJson(oneColor, () => 'one').project.base.chart.palette).toHaveLength(1);
  });
});
