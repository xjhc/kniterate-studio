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

describe('Customist fairisle reproduction (physical trial candidate)', () => {
  it('compiles the trial chart to the captured Customist program through the Studio pipeline', { timeout: 60_000 }, async () => {
    const { readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    const { diffKc, diffTraceStitchesV1, parseKCodeDocument, projectKCodeMachineTrace, KNITERATE_7GG_KCODE_PROFILE_V2 } = await import('@kniterate-studio/machine-lib/browser');
    const root = resolve(__dirname, '../../..');
    const chart = JSON.parse(readFileSync(resolve(root, 'fixtures/colorwork-chart-v1/customist-fairisle-reference.json'), 'utf8'));
    const reference = readFileSync(resolve(root, 'packages/machine-lib/reference/fairisle.kc'), 'utf8');
    let project = createColorworkProjectV1(chart, { id: 'customist-fairisle-reproduction' });
    project = appendProjectEdit(project, { id: 'ground', source: 'system', edit: { kind: 'set-yarn-assignment', assignment: { paletteId: 'ground', carrier: '4', yarnName: 'Ground' } } });
    project = appendProjectEdit(project, { id: 'motif', source: 'system', edit: { kind: 'set-yarn-assignment', assignment: { paletteId: 'motif', carrier: '3', yarnName: 'Motif' } } });
    const result = await runAuthoredPipeline(project);
    expect(result.exportReady).toBe(true);
    expect(diffKc(result.kcode!.kcText, reference).deltaCount).toBe(0);
    const parsed = parseKCodeDocument(reference, { profile: KNITERATE_7GG_KCODE_PROFILE_V2, dialect: 'knitout-vendor', strict: true });
    if (!parsed.ok) throw new Error('reference is not strict KCode');
    const stitches = diffTraceStitchesV1(projectKCodeMachineTrace(parsed.document, KNITERATE_7GG_KCODE_PROFILE_V2), result.kcode!.trace!);
    // Same bed position; only the six Customist catch-loop passes differ.
    expect(stitches).toMatchObject({ comparedPasses: 286, identicalPasses: 280, offset: 0 });
  });
});
