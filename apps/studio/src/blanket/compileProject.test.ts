import { describe, expect, it } from 'vitest';
import { appendProjectEdit, createColorworkProjectV1 } from '@kniterate-studio/project-contract';
import { compileColorworkProject } from './compileProject';

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
    expect(first.verdict).toBe('surface');
    expect(first.inputHash).toBe(second.inputHash);
    expect(first.knitoutText).toBe(second.knitoutText);
    expect(first.stats.passCount).toBeGreaterThan(0);
    expect(first.knitoutText).toContain(';;Carriers: 1 2 3 4 5 6');
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
});
