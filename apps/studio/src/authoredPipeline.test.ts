import { describe, expect, it } from 'vitest';
import { appendProjectEdit, createColorworkProjectV1 } from '@kniterate-studio/project-contract';
import { runAuthoredPipeline } from './authoredPipeline';

const chart = {
  kind: 'knitlab-colorwork-chart', version: 1, title: 'Pipeline fixture', width: 4, height: 3, rowNumbering: 'bottom-up',
  palette: [
    { id: 'natural', name: 'Natural', hex: '#F4F0E6' },
    { id: 'red', name: 'Red', hex: '#C2413A' },
  ],
  cells: [[0, 1, 0, 1], [1, 0, 1, 0], [0, 1, 1, 0]],
};

describe('headless authored pipeline', () => {
  it('reaches the same export gate as Studio for a clean project', { timeout: 20_000 }, async () => {
    const result = await runAuthoredPipeline(createColorworkProjectV1(chart, { id: 'pipeline-clean', needleOffset: 40 }));
    expect(result.verdict.state).toBe('surface');
    expect(result.exportReady).toBe(true);
    expect(result.kcode?.ok).toBe(true);
    expect(result.kcode?.kcText).toContain('FRNT:');
  });

  it('refuses export when the compiler blocks the project', { timeout: 20_000 }, async () => {
    let project = createColorworkProjectV1(chart, { id: 'pipeline-blocked' });
    project = appendProjectEdit(project, { id: 'tuck', source: 'assistant', edit: { kind: 'add-override', override: { id: 'tuck-1', kind: 'stitch', anchor: { rowId: project.base.rowIds[0]!, needleIndex: 1 }, operation: 'tuck' } } });
    const result = await runAuthoredPipeline(project);
    expect(result.verdict.state).toBe('blocked');
    expect(result.exportReady).toBe(false);
    expect(result.kcode).toBeNull();
  });
});
