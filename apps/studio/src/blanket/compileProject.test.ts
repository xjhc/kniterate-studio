import { describe, expect, it } from 'vitest';
import { appendProjectEdit, createColorworkProjectV1 } from '@kniterate-studio/project-contract';
import { compileColorworkProject } from './compileProject';
import { compileKCodeArtifact } from '../kcode/compileKCodeArtifact';

const chart = {
  kind: 'knitlab-colorwork-chart', version: 1, title: 'Compile fixture', width: 4, height: 3, rowNumbering: 'bottom-up',
  palette: [
    { id: 'natural', name: 'Natural', hex: '#F4F0E6' },
    { id: 'red', name: 'Red', hex: '#C2413A' },
  ],
  cells: [[0, 1, 0, 1], [1, 0, 1, 0], [0, 1, 1, 0]],
};

describe('blanket project compiler', () => {
  it('derives a deterministic surface-proven artifact with reserved frame carriers', () => {
    const project = createColorworkProjectV1(chart, { id: 'compile-fixture', needleOffset: 40 });
    const first = compileColorworkProject(project);
    const second = compileColorworkProject(project);
    expect(first.ok).toBe(true);
    expect(first.compileVerdict).toBe('surface');
    expect(first.inputHash).toBe(second.inputHash);
    expect(first.knitoutText).toBe(second.knitoutText);
    expect(first.stats.passCount).toBeGreaterThan(0);
    expect(first.knitoutText).toContain(';;Carriers: 1 2 3 4 5 6');
    expect(first.rowProvenance.map((row) => row.displayRow)).toEqual([3, 2, 1]);
    expect(first.rowProvenance.every((row) => row.passIndices.length > 0)).toBe(true);
    expect(first.passes.some((pass) => pass.sourceRows?.includes(0))).toBe(true);
    expect(first.knitoutText).not.toContain('sourceRows');
    expect(first.backFace?.cells.flat().some((cell) => cell.kind === 'float')).toBe(true);
  });

  it('blocks before compile when a used color has no assignment', () => {
    let project = createColorworkProjectV1(chart, { id: 'missing-yarn' });
    project = appendProjectEdit(project, { id: 'remove-red', source: 'human', edit: { kind: 'remove-yarn-assignment', paletteId: 'red' } });
    const artifact = compileColorworkProject(project);
    expect(artifact.ok).toBe(false);
    expect(artifact.messages).toContainEqual(expect.objectContaining({ rule: 'project-yarn-assignment-required', severity: 'error' }));
    expect(artifact.knitoutText).toBeNull();
  });

  it('blocks complement when the project does not use exactly two colors', () => {
    const oneColor = { ...chart, palette: chart.palette.slice(0, 1), cells: chart.cells.map((row) => row.map(() => 0)) };
    let project = createColorworkProjectV1(oneColor, { id: 'bad-complement' });
    project = appendProjectEdit(project, { id: 'complement', source: 'human', edit: { kind: 'set-strategy', strategy: { technique: 'complement', floatLimit: 5 } } });
    expect(compileColorworkProject(project).messages).toContainEqual(expect.objectContaining({ rule: 'project-complement-two-colors' }));
  });

  it('joins op diagnostics to chart rows through typed engine provenance', () => {
    let project = createColorworkProjectV1(chart, { id: 'typed-provenance' });
    project = appendProjectEdit(project, {
      id: 'strict-floats',
      source: 'human',
      edit: { kind: 'set-strategy', strategy: { technique: 'fairisle', floatLimit: 1 } },
    });
    const artifact = compileColorworkProject(project);
    const floatDiagnostic = artifact.diagnostics.find((diagnostic) => diagnostic.rule === 'bed-state-long-float');
    expect(floatDiagnostic).toBeDefined();
    expect(floatDiagnostic?.opIndex).not.toBeNull();
    expect(floatDiagnostic?.rowId).not.toBeNull();
    expect(floatDiagnostic?.passIndices.length).toBeGreaterThan(0);
  });

  it('keeps predicted and emitted pass positions as distinct provenance spaces', async () => {
    const width = 24;
    const height = 10;
    const blocks = {
      kind: 'knitlab-colorwork-chart',
      version: 1,
      title: 'Predicted versus emitted provenance',
      width,
      height,
      rowNumbering: 'bottom-up',
      palette: [
        { id: 'ground', name: 'Ground', hex: '#F4F0E6' },
        { id: 'ink', name: 'Ink', hex: '#24211F' },
      ],
      cells: Array.from({ length: height }, () =>
        Array.from({ length: width }, (_, column) => Math.floor(column / 3) % 2)),
    };
    let project = createColorworkProjectV1(blocks, { id: 'pass-space-regression' });
    project = appendProjectEdit(project, {
      id: 'strict-floats',
      source: 'human',
      edit: { kind: 'set-strategy', strategy: { technique: 'fairisle', floatLimit: 1 } },
    });
    project = appendProjectEdit(project, {
      id: 'short-frame',
      source: 'human',
      edit: { kind: 'set-frame', frame: { wasteRows: 4, drawThread: false, bindOff: 'waste-and-drop' } },
    });

    const compiled = compileColorworkProject(project);
    expect(compiled.ok).toBe(true);
    expect(compiled.passes).toHaveLength(40);
    const emitted = await compileKCodeArtifact({
      kind: 'convert-kcode',
      requestId: 1,
      inputHash: compiled.inputHash!,
      knitoutText: compiled.knitoutText!,
      programOpSourceRows: compiled.programOpSourceRows,
      rowProvenance: compiled.rowProvenance.map(({ rowId, chartRow, machineRow }) => ({ rowId, chartRow, machineRow })),
    });

    expect(emitted.ok).toBe(true);
    expect(emitted.passCount).toBe(70);
    expect(compiled.rowProvenance[0]).toMatchObject({ rowId: 'row_0001', passIndices: [28, 29] });
    expect(emitted.rowPasses[0]).toEqual({ rowId: 'row_0001', passIndices: [30, 31] });
    expect(compiled.diagnostics.find((item) => item.rowId === 'row_0001')).toMatchObject({
      rule: 'bed-state-long-float',
      passIndices: [28, 29],
    });
  });
});
