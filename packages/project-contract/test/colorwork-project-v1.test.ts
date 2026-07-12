import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  appendProjectEdit,
  createColorworkProjectV1,
  materializeColorworkProject,
  parseColorworkProjectV1Json,
  redoProjectEdit,
  undoProjectEdit,
} from '../src/index';

const chart = {
  kind: 'knitlab-colorwork-chart', version: 1, title: 'Test blanket', width: 4, height: 2,
  rowNumbering: 'bottom-up',
  palette: [
    { id: 'natural', name: 'Natural', hex: '#F4F0E8' },
    { id: 'red', name: 'Red', hex: '#B93A32' },
  ],
  cells: [[0, 1, 0, 1], [1, 0, 1, 0]],
};

describe('ColorworkProjectV1', () => {
  it('parses the shared project fixture', () => {
    const fixture = readFileSync(resolve('../../fixtures/colorwork-project-v1/four-color-checker-project.json'), 'utf8');
    expect(parseColorworkProjectV1Json(fixture).base.machine.yarnAssignments).toHaveLength(4);
  });

  it('creates and JSON-round-trips a valid project', () => {
    const project = createColorworkProjectV1(chart, { id: 'blanket-1' });
    expect(parseColorworkProjectV1Json(JSON.stringify(project))).toEqual(project);
    expect(project.base.rowIds).toEqual(['row_0001', 'row_0002']);
  });

  it('keeps an override anchored when a row is inserted below it', () => {
    let project = createColorworkProjectV1(chart, { id: 'blanket-1' });
    project = appendProjectEdit(project, { id: 'edit-1', source: 'human', edit: { kind: 'add-override', override: { id: 'override-1', kind: 'stitch', anchor: { rowId: 'row_0002', needleIndex: 2 }, operation: 'tuck' } } });
    project = appendProjectEdit(project, { id: 'edit-2', source: 'human', edit: { kind: 'insert-row', rowId: 'row-new', afterRowId: 'row_0001', cells: [0, 0, 0, 0] } });
    const result = materializeColorworkProject(project);
    expect(result.state.rowIds).toEqual(['row_0001', 'row-new', 'row_0002']);
    expect(result.overrides[0]).toMatchObject({ status: 'active', override: { anchor: { rowId: 'row_0002' } } });
  });

  it('quarantines rather than drops an override whose row is deleted', () => {
    let project = createColorworkProjectV1(chart, { id: 'blanket-1' });
    project = appendProjectEdit(project, { id: 'edit-1', source: 'human', edit: { kind: 'add-override', override: { id: 'override-1', kind: 'pass', anchor: { rowId: 'row_0002', purpose: 'body', ordinal: 0 }, setting: { kind: 'speed', value: 220 } } } });
    project = appendProjectEdit(project, { id: 'edit-2', source: 'human', edit: { kind: 'delete-row', rowId: 'row_0002' } });
    const result = materializeColorworkProject(project);
    expect(result.state.overrides).toHaveLength(1);
    expect(result.overrides[0]).toMatchObject({ status: 'quarantined', reason: expect.stringContaining('no longer exists') });
  });

  it('resizes height away from the row-numbering origin and preserves stable rows', () => {
    let project = createColorworkProjectV1(chart, { id: 'resize-height' });
    const original = [...project.base.rowIds];
    project = appendProjectEdit(project, { id: 'grow', source: 'human', edit: { kind: 'set-height', height: 4, fillPaletteIndex: 0, newRowIds: ['row_new_1', 'row_new_2'] } });
    expect(materializeColorworkProject(project).state.rowIds).toEqual(['row_new_1', 'row_new_2', ...original]);
    project = appendProjectEdit(project, { id: 'shrink', source: 'human', edit: { kind: 'set-height', height: 2, fillPaletteIndex: 0, newRowIds: [] } });
    expect(materializeColorworkProject(project).state.rowIds).toEqual(original);
  });

  it('edits machine placement and frame through project history', () => {
    let project = createColorworkProjectV1(chart, { id: 'machine-setup' });
    project = appendProjectEdit(project, { id: 'place', source: 'human', edit: { kind: 'set-needle-offset', needleOffset: 20 } });
    project = appendProjectEdit(project, { id: 'frame', source: 'human', edit: { kind: 'set-frame', frame: { wasteRows: 30, drawThread: true, bindOff: 'machine-bindoff' } } });
    const state = materializeColorworkProject(project).state;
    expect(state.machine.needleOffset).toBe(20);
    expect(state.frame).toEqual({ wasteRows: 30, drawThread: true, bindOff: 'machine-bindoff' });
  });

  it('uses one history for human and assistant edits with deterministic undo/redo', () => {
    let project = createColorworkProjectV1(chart, { id: 'blanket-1' });
    project = appendProjectEdit(project, { id: 'human-paint', source: 'human', edit: { kind: 'paint-cells', cells: [{ rowId: 'row_0001', column: 0, paletteIndex: 1 }] } });
    project = appendProjectEdit(project, { id: 'assistant-paint', source: 'assistant', edit: { kind: 'paint-cells', cells: [{ rowId: 'row_0002', column: 0, paletteIndex: 0 }] } });
    expect(materializeColorworkProject(project).state.chart.cells).toEqual([[1, 1, 0, 1], [0, 0, 1, 0]]);
    project = undoProjectEdit(project);
    expect(materializeColorworkProject(project).state.chart.cells).toEqual([[1, 1, 0, 1], [1, 0, 1, 0]]);
    project = redoProjectEdit(project);
    expect(materializeColorworkProject(project).state.chart.cells[1]![0]).toBe(0);
  });

  it('truncates redo history after a new edit and checkpoints every 50 edits', () => {
    let project = createColorworkProjectV1(chart, { id: 'blanket-1' });
    for (let index = 0; index < 50; index += 1) {
      project = appendProjectEdit(project, { id: `paint-${index}`, source: 'human', edit: { kind: 'paint-cells', cells: [{ rowId: 'row_0001', column: 0, paletteIndex: index % 2 }] } });
    }
    expect(project.history.checkpoints).toHaveLength(1);
    project = undoProjectEdit(project);
    project = appendProjectEdit(project, { id: 'replacement', source: 'human', edit: { kind: 'paint-cells', cells: [{ rowId: 'row_0001', column: 1, paletteIndex: 0 }] } });
    expect(project.history.entries).toHaveLength(50);
    expect(project.history.entries.at(-1)?.id).toBe('replacement');
  });

  it('rejects duplicate carrier assignments and out-of-bed dimensions', () => {
    const project = createColorworkProjectV1(chart, { id: 'blanket-1' });
    const invalid = structuredClone(project);
    invalid.base.machine.yarnAssignments[1]!.carrier = '2';
    invalid.base.machine.needleOffset = 250;
    expect(() => parseColorworkProjectV1Json(JSON.stringify(invalid))).toThrow(/assigned twice|252-needle/);
  });

  it('rejects a checkpoint that disagrees with authoritative history', () => {
    let project = createColorworkProjectV1(chart, { id: 'blanket-1' });
    for (let index = 0; index < 50; index += 1) project = appendProjectEdit(project, { id: `paint-${index}`, source: 'human', edit: { kind: 'paint-cells', cells: [{ rowId: 'row_0001', column: 0, paletteIndex: index % 2 }] } });
    project.history.checkpoints[0]!.state.chart.cells[0]![0] = 0;
    expect(() => parseColorworkProjectV1Json(JSON.stringify(project))).toThrow(/checkpoint at cursor 50/);
  });
});
