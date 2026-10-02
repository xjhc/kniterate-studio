import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  AUTHORED_CAPACITY_LIMITS_V1,
  appendProjectEdit,
  appendProjectOperation,
  assessAuthoredCapacityV1,
  createColorworkProjectV1,
  inspectColorworkProjectStructureCapacityV1,
  materializeColorworkProject,
  parseColorworkProjectV1,
  parseColorworkProjectV1Json,
  redoProjectEdit,
  refuseAuthoredCapacityFromLowerBoundV1,
  renameColorworkProject,
  serializeColorworkProjectV1,
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

  it('admits the backend minimum of four waste rows and rejects one through three at project boundaries', () => {
    const base = createColorworkProjectV1(chart, { id: 'waste-row-boundary' });
    for (const wasteRows of [1, 3]) {
      const imported = structuredClone(base);
      imported.base.frame.wasteRows = wasteRows;
      expect(() => parseColorworkProjectV1Json(JSON.stringify(imported))).toThrow(/>=4/);
      expect(() => appendProjectEdit(base, {
        id: `waste-${wasteRows}`,
        source: 'human',
        edit: { kind: 'set-frame', frame: { wasteRows, drawThread: true, bindOff: 'machine-bindoff' } },
      })).toThrow(/>=4/);
    }
    const valid = appendProjectEdit(base, {
      id: 'waste-4',
      source: 'human',
      edit: { kind: 'set-frame', frame: { wasteRows: 4, drawThread: true, bindOff: 'machine-bindoff' } },
    });
    expect(materializeColorworkProject(valid).state.frame.wasteRows).toBe(4);
  });

  it('renames project metadata and palette entries without breaking checkpoints', () => {
    let project = createColorworkProjectV1(chart, { id: 'metadata' });
    for (let index = 0; index < 50; index += 1) project = appendProjectEdit(project, { id: `paint-${index}`, source: 'human', edit: { kind: 'paint-cells', cells: [{ rowId: 'row_0001', column: 0, paletteIndex: index % 2 }] } });
    project = renameColorworkProject(project, 'Client blanket');
    project = appendProjectEdit(project, { id: 'palette-red', source: 'human', edit: { kind: 'set-palette-entry', paletteId: 'red', name: 'Brick', hex: '#a12b34' } });
    const state = materializeColorworkProject(project).state;
    expect(project.title).toBe('Client blanket');
    expect(state.chart.title).toBe('Client blanket');
    expect(state.chart.palette[1]).toMatchObject({ name: 'Brick', hex: '#A12B34' });
    expect(parseColorworkProjectV1Json(JSON.stringify(project))).toEqual(project);
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

  it('rejects oversized raw charts and edit amplification before chart parsing or replay', () => {
    const oversizedChart = {
      ...chart,
      width: 1,
      height: 50_000,
      cells: Array.from({ length: 50_000 }, () => [0]),
    };
    expect(() => createColorworkProjectV1(oversizedChart, { id: 'oversized-chart' }))
      .toThrow(/50,000 rows.*capacity is 1,200/);

    const project = createColorworkProjectV1(chart, { id: 'oversized-edit' });
    const hostile = structuredClone(project) as unknown as Record<string, unknown>;
    const history = (hostile.history as { entries: unknown[]; cursor: number });
    history.entries.push({
      id: 'grow-hostile',
      source: 'human',
      edit: { kind: 'set-height', height: 50_000, fillPaletteIndex: 0, newRowIds: [] },
    });
    history.cursor = 1;
    expect(inspectColorworkProjectStructureCapacityV1(hostile)).toMatchObject({
      metric: 'chart-height',
      required: 50_000,
      limit: AUTHORED_CAPACITY_LIMITS_V1.chartHeight,
    });
    expect(() => parseColorworkProjectV1(hostile)).toThrow(/50,000 rows.*capacity is 1,200/);
  });

  it('rebases old checkpointed history so ordinary editing stays bounded past 256 gestures', () => {
    let project = createColorworkProjectV1(chart, { id: 'bounded-history' });
    for (let index = 0; index < 310; index += 1) {
      project = appendProjectEdit(project, {
        id: `bounded-paint-${index}`,
        source: 'human',
        edit: {
          kind: 'paint-cells',
          cells: [{ rowId: 'row_0001', column: 0, paletteIndex: index % 2 }],
        },
      });
    }

    expect(project.history.entries.length).toBeLessThanOrEqual(AUTHORED_CAPACITY_LIMITS_V1.historyEntries);
    expect(project.history.cursor).toBe(project.history.entries.length);
    expect(project.history.checkpoints.length).toBeLessThanOrEqual(AUTHORED_CAPACITY_LIMITS_V1.historyCheckpoints);
    expect(project.history.entries[0]?.id).toBe('bounded-paint-100');
    expect(materializeColorworkProject(project).state.chart.cells[0]![0]).toBe(1);
    expect(parseColorworkProjectV1Json(JSON.stringify(project))).toEqual(project);
  });

  it('keeps aborted lowering evidence as a lower bound without fabricating an exact observation', () => {
    const capacity = assessAuthoredCapacityV1(createColorworkProjectV1(chart, { id: 'lower-bound-evidence' }));
    if (capacity.status === 'blocked') throw new Error(capacity.message);
    const refused = refuseAuthoredCapacityFromLowerBoundV1(
      capacity,
      'lowered-passes',
      capacity.limits.loweredPasses + 1,
    );
    expect(refused).toMatchObject({
      status: 'blocked',
      evidence: 'lower-bound',
      metric: 'lowered-passes',
      required: capacity.limits.loweredPasses + 1,
      observed: capacity.observed,
    });
    expect(refused.message).toContain(`requires at least ${(capacity.limits.loweredPasses + 1).toLocaleString('en-US')}`);
  });

  it('reads version 1 files losslessly and writes version 2', () => {
    const fixture = JSON.parse(readFileSync(resolve('../../fixtures/colorwork-project-v1/four-color-checker-project.json'), 'utf8')) as Record<string, unknown>;
    expect(fixture.version).toBe(1);
    const project = parseColorworkProjectV1(fixture);
    expect(project.version).toBe(2);
    const { version: _from, ...fixtureRest } = fixture;
    const { version: _to, ...projectRest } = JSON.parse(JSON.stringify(project)) as Record<string, unknown>;
    expect(projectRest).toEqual(fixtureRest);
    expect(JSON.parse(serializeColorworkProjectV1(project)).version).toBe(2);
    expect(() => parseColorworkProjectV1({ ...fixture, version: 3 })).toThrow(/version/);
  });

  it('records gauge and target as undoable intent without touching the chart', () => {
    let project = createColorworkProjectV1(chart, { id: 'sized' });
    const before = materializeColorworkProject(project).state;
    project = appendProjectEdit(project, { id: 'g', source: 'assistant', edit: { kind: 'set-gauge', gauge: { stitchesPer10cm: 26, rowsPer10cm: 34, source: 'measured' } } });
    project = appendProjectEdit(project, { id: 't', source: 'assistant', edit: { kind: 'set-target', target: { widthCm: 25, heightCm: 180 } } });
    const after = materializeColorworkProject(project).state;
    expect(after.gauge).toEqual({ stitchesPer10cm: 26, rowsPer10cm: 34, source: 'measured' });
    expect(after.target).toEqual({ widthCm: 25, heightCm: 180 });
    expect(after.chart).toEqual(before.chart);
    expect(parseColorworkProjectV1Json(serializeColorworkProjectV1(project))).toEqual(project);
    project = appendProjectEdit(project, { id: 'clear', source: 'human', edit: { kind: 'set-gauge', gauge: null } });
    expect(materializeColorworkProject(project).state.gauge).toBeUndefined();
    expect(materializeColorworkProject(undoProjectEdit(project)).state.gauge?.rowsPer10cm).toBe(34);
    expect(() => appendProjectEdit(project, { id: 'bad', source: 'human', edit: { kind: 'set-target', target: {} } as never })).toThrow();
  });

  it('admits long narrow charts up to the raised row capacity', () => {
    const long = { ...chart, width: 2, height: 1_000, cells: Array.from({ length: 1_000 }, () => [0, 1]) };
    const project = createColorworkProjectV1(long, { id: 'long-scarf' });
    expect(project.base.rowIds).toHaveLength(1_000);
    expect(AUTHORED_CAPACITY_LIMITS_V1.chartCellsPerState).toBe(75_600);
  });

  it('upgrades a v1 project with a real edit history without changing any cursor position', () => {
    // Written by the v1 (pre-M5) contract: 18 edits, cursor 16 (a redo branch), an active and a quarantined override.
    const source = readFileSync(resolve('../../fixtures/colorwork-project-v1/edited-history-project.json'), 'utf8');
    const raw = JSON.parse(source) as { version: number; history: { cursor: number; entries: unknown[] } };
    expect(raw.version).toBe(1);
    const upgraded = parseColorworkProjectV1Json(source);
    const reopened = parseColorworkProjectV1Json(serializeColorworkProjectV1(upgraded));
    expect(reopened.version).toBe(2);
    expect(reopened.history.cursor).toBe(raw.history.cursor);
    expect(reopened.history.entries).toEqual(raw.history.entries);
    const statuses: string[] = [];
    for (let cursor = 0; cursor <= raw.history.entries.length; cursor += 1) {
      const at = (project: typeof upgraded) => materializeColorworkProject({ ...project, history: { ...project.history, cursor, checkpoints: project.history.checkpoints.filter((checkpoint) => checkpoint.cursor <= cursor) } });
      expect(at(reopened)).toEqual(at(upgraded));
      statuses.push(at(reopened).overrides.map((item) => item.status).join(','));
    }
    expect(statuses).toContain('quarantined');
    expect(materializeColorworkProject(redoProjectEdit(reopened)).state.machine.yarnAssignments).toHaveLength(1);
  });

  it('records the beanie object as undoable intent', () => {
    let project = createColorworkProjectV1(chart, { id: 'beanie-object' });
    project = appendProjectEdit(project, { id: 'o', source: 'assistant', edit: { kind: 'set-object', object: { kind: 'beanie', construction: 'flat-rib-2x2' } } });
    expect(materializeColorworkProject(project).state.object).toEqual({ kind: 'beanie', construction: 'flat-rib-2x2' });
    expect(parseColorworkProjectV1Json(serializeColorworkProjectV1(project))).toEqual(project);
    expect(materializeColorworkProject(undoProjectEdit(project)).state.object).toBeUndefined();
    expect(() => appendProjectEdit(project, { id: 'bad', source: 'human', edit: { kind: 'set-object', object: { kind: 'sweater' } } as never })).toThrow();
  });

  it('draws placements from their anchor, keeps checkpoints authored, and reports what does not fit', () => {
    const ground = { ...chart, width: 20, height: 12, cells: Array.from({ length: 12 }, () => Array<number>(20).fill(0)) };
    const motif = { ...chart, width: 4, height: 2, cells: [[1, 1, 0, 0], [0, 1, 1, 0]] };
    let project = appendProjectEdit(createColorworkProjectV1(ground, { id: 'placed' }), { id: 'cuff', source: 'assistant', edit: { kind: 'set-object', object: { kind: 'beanie', construction: 'rib-cuff-jersey-body', cuffRows: 4 } } });
    project = appendProjectEdit(project, { id: 'p1', source: 'assistant', edit: { kind: 'set-placement', placement: { id: 'logo', motif: motif as never, x: 'center', rowsAboveCuff: 1, colors: { 1: 'red' } } } });
    const placed = materializeColorworkProject(project);
    expect(placed.placements).toEqual([expect.objectContaining({ status: 'placed', at: { column: 8, knitRow: 5 } })]);
    // Knit rows 5 (motif bottom) and 6 (motif top) are chart rows 6 and 5 counted from the top; color 0 is transparent.
    expect(placed.state.chart.cells[6]!.slice(8, 12)).toEqual([0, 1, 1, 0]);
    expect(placed.state.chart.cells[5]!.slice(8, 12)).toEqual([1, 1, 0, 0]);
    expect(placed.state.chart.cells.flat().filter(Boolean)).toHaveLength(4);
    // Narrowing keeps the motif centred.
    const narrow = appendProjectEdit(project, { id: 'w', source: 'assistant', edit: { kind: 'set-width', width: 10, fillPaletteIndex: 0 } });
    expect(materializeColorworkProject(narrow).placements[0]).toMatchObject({ status: 'placed', at: { column: 3, knitRow: 5 } });
    // Too narrow: a conflict, and nothing is drawn.
    const tiny = appendProjectEdit(project, { id: 'w', source: 'assistant', edit: { kind: 'set-width', width: 3, fillPaletteIndex: 0 } });
    const conflict = materializeColorworkProject(tiny);
    expect(conflict.placements[0]).toMatchObject({ status: 'conflict', at: null, reason: expect.stringContaining('4 stitches wide') });
    expect(conflict.state.chart.cells.flat().filter(Boolean)).toHaveLength(0);
    // History stores the authored chart; placements are never baked into checkpoints.
    for (let index = 0; index < 30; index += 1) project = appendProjectEdit(project, { id: `g${index}`, source: 'assistant', edit: { kind: 'set-gauge', gauge: { stitchesPer10cm: 20 + index, rowsPer10cm: 30, source: 'measured' } } });
    for (const checkpoint of project.history.checkpoints) expect(checkpoint.state.chart.cells.flat().filter(Boolean)).toHaveLength(0);
    expect(parseColorworkProjectV1Json(serializeColorworkProjectV1(project))).toEqual(project);
    const removed = appendProjectEdit(project, { id: 'rm', source: 'assistant', edit: { kind: 'remove-placement', placementId: 'logo' } });
    expect(materializeColorworkProject(removed).state.chart.cells.flat().filter(Boolean)).toHaveLength(0);
    expect(() => appendProjectEdit(removed, { id: 'rm2', source: 'assistant', edit: { kind: 'remove-placement', placementId: 'logo' } })).toThrow(/does not exist/);
  });

  it('undoes and redoes an operation as one step, and records trials as intent', () => {
    let project = createColorworkProjectV1(chart, { id: 'grouped' });
    project = appendProjectEdit(project, { id: 'single', source: 'human', edit: { kind: 'set-target', target: { widthCm: 10 } } });
    project = appendProjectOperation(project, { group: 'fit-1', source: 'assistant', label: 'Change fit', edits: [
      { kind: 'set-gauge', gauge: { stitchesPer10cm: 20, rowsPer10cm: 30, source: 'measured' } },
      { kind: 'set-width', width: 6, fillPaletteIndex: 0 },
    ] });
    expect(project.history.entries.slice(1).map((entry) => [entry.group, entry.label])).toEqual([['fit-1', 'Change fit'], ['fit-1', undefined]]);
    const undone = undoProjectEdit(project);
    expect(undone.history.cursor).toBe(1);
    expect(redoProjectEdit(undone).history.cursor).toBe(3);
    expect(undoProjectEdit(undone).history.cursor).toBe(0);
    // A failing operation leaves the project unchanged.
    expect(() => appendProjectOperation(project, { group: 'bad', source: 'human', label: 'Bad', edits: [{ kind: 'set-width', width: 5, fillPaletteIndex: 0 }, { kind: 'delete-row', rowId: 'row_9999' }] })).toThrow();
    const trial = { id: 'trial-1', candidate: { kcodeSha256: 'b'.repeat(64) }, recordedAt: '2026-10-02T10:00:00Z', synthetic: true, outcome: 'clean' as const, bodyGauge: { stitchesPer10cm: 24, rowsPer10cm: 30 } };
    project = appendProjectEdit(project, { id: 'trial', source: 'human', edit: { kind: 'record-trial', trial } });
    expect(materializeColorworkProject(project).state.trials).toEqual([trial]);
    expect(parseColorworkProjectV1Json(serializeColorworkProjectV1(project))).toEqual(project);
    expect(() => appendProjectEdit(project, { id: 'trial-again', source: 'human', edit: { kind: 'record-trial', trial } })).toThrow(/already exists/);
  });
});
