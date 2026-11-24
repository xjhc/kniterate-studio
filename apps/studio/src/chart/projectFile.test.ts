import { describe, expect, it } from 'vitest';
import { AUTHORED_CAPACITY_LIMITS_V1, appendProjectEdit, materializeColorworkProject } from '@kniterate-studio/project-contract';
import { MAX_STUDIO_PROJECT_FILE_BYTES_V1, openStudioDocumentFile, openStudioProjectFile, openStudioProjectJson, projectFileProblem } from './projectFile';
import { figCamelPalette, figCamelTarget, proportionalFigCamelTarget, originalFigCamelTarget, planTriangle, triangleDraft } from '../scarf/triangle';

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

  it.each([figCamelTarget, proportionalFigCamelTarget, originalFigCamelTarget])('opens a shaped scarf at %j without changing its stitches', async target => {
    const stitches = 21 * 10 / 5.5;
    const rows = 45;
    const plan = planTriangle(stitches, rows, target);
    const cells = plan.widths.map((width, row) =>
      Array.from({ length: plan.columns }, (_, column) => Number(column === width - 1 && row % 2 === 1)));
    const draft = triangleDraft(plan, cells, stitches, rows, {
      id: 'fig-camel', title: 'Fig / Camel paisley', target, palette: figCamelPalette,
    });
    const open = (value: unknown) => {
      const json = JSON.stringify(value);
      return openStudioDocumentFile({ size: json.length, text: async () => json });
    };

    const opened = await open(draft);
    expect(opened.kind).toBe('triangle');
    if (opened.kind !== 'triangle') throw new Error('Expected a triangle project');
    expect(opened.project.plan).toEqual(plan);
    expect(opened.project.cells).toEqual(cells);
    const changedIntervals = [[0, 8], ...draft.activeIntervalsExclusive.slice(1)];
    await expect(open({ ...draft, activeIntervalsExclusive: changedIntervals })).rejects.toThrow(/active needles/);
  });

  it('accepts a valid one-color chart without inventing another palette entry', () => {
    const oneColor = JSON.stringify({
      kind: 'knitlab-colorwork-chart', version: 1, width: 1, height: 1, rowNumbering: 'bottom-up',
      palette: [{ id: 'natural', name: 'Natural', hex: '#FFFFFF' }], cells: [[0]],
    });
    expect(openStudioProjectJson(oneColor, () => 'one').project.base.chart.palette).toHaveLength(1);
  });

  it('rejects oversized source before JSON parsing and oversized chart dimensions before chart parsing', () => {
    const oversizedSource = ' '.repeat(AUTHORED_CAPACITY_LIMITS_V1.projectSourceCodeUnits + 1);
    expect(() => openStudioProjectJson(oversizedSource)).toThrow(/Project source exceeds.*code-unit authored V1 limit/);

    const oversizedChart = JSON.stringify({
      kind: 'knitlab-colorwork-chart', version: 1, width: 1, height: 50_000,
      rowNumbering: 'bottom-up',
      palette: [{ id: 'ink', name: 'Ink', hex: '#000000' }],
      cells: Array.from({ length: 50_000 }, () => [0]),
    });
    expect(() => openStudioProjectJson(oversizedChart)).toThrow(/50,000 rows.*capacity is 1,200/);
  });

  it('rejects an oversized browser project before reading its text', async () => {
    let textRequested = false;
    await expect(openStudioProjectFile({
      size: MAX_STUDIO_PROJECT_FILE_BYTES_V1 + 1,
      text: async () => {
        textRequested = true;
        return chart;
      },
    })).rejects.toThrow(/Project file exceeds.*byte authored V1 limit/);
    expect(textRequested).toBe(false);
  });
});

describe('a file that does not open', () => {
  const problem = (json: string) => { try { openStudioProjectJson(json); return null; } catch (error) { return projectFileProblem('notes.json', error); } };

  it('says in plain words why, and what to choose instead', () => {
    expect(problem('{"name": "package", "version": "1.0.0"}')).toBe('“notes.json” isn\'t a Studio project. Choose a file saved with File → Save project, or a KnitLab chart.');
    expect(problem('not json')).toContain('isn\'t a Studio project');
    expect(problem(JSON.stringify({ kind: 'kniterate-studio-project', version: 1, id: 'x' }))).toBe('“notes.json” could not be opened: it may be damaged, or saved by a newer version of Studio.');
    expect(problem('x'.repeat(AUTHORED_CAPACITY_LIMITS_V1.projectSourceCodeUnits + 1))).toBe('“notes.json” is too large to open as a project.');
    expect(problem(chart)).toBeNull();
  });
});
