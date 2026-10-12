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

describe('Customist fairisle partial reproduction (physical trial candidate)', () => {
  it('confines the full emitted-program difference to the exact known reference-only knits', { timeout: 60_000 }, async () => {
    const { readFileSync } = await import('node:fs');
    const { createHash } = await import('node:crypto');
    const { resolve } = await import('node:path');
    const { diffKc, diffKCodeMachineTrace, diffTraceStitchesV1, parseKCodeDocument, projectKCodeMachineTrace, KNITERATE_7GG_KCODE_PROFILE_V2 } = await import('@kniterate-studio/machine-lib/browser');
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
    const referenceTrace = projectKCodeMachineTrace(parsed.document, KNITERATE_7GG_KCODE_PROFILE_V2);
    const emittedTrace = result.kcode!.trace!;
    const stitches = diffTraceStitchesV1(referenceTrace, emittedTrace);
    const knownPasses = [116, 149, 173, 197, 221, 245];
    expect(stitches).toMatchObject({ comparedPasses: 286, identicalPasses: 280, offset: 0, differingPassIndices: knownPasses });

    const strict = diffKCodeMachineTrace(result.kcode!.kcText, reference, {
      profile: KNITERATE_7GG_KCODE_PROFILE_V2, dialect: 'knitout-vendor', maxDeltas: 1_000,
    });
    expect(strict).toMatchObject({ status: 'compared', identical: false, generatedPassCount: 286, referencePassCount: 286, deltaCount: 468 });
    // Inspect the entire result, not a capped prefix. The 468 leaf changes
    // include array-index shifts caused by 21 extra reference actions.
    expect(strict.deltas).toHaveLength(strict.deltaCount);
    expect([...new Set(strict.deltas.map((delta) => delta.index))]).toEqual(knownPasses);
    expect([...new Set(strict.deltas.map((delta) => delta.field.replace(/\[\d+\]/g, '[]')))].sort()).toEqual([
      'actions.length', 'actions[]', 'actions[].at.kcodeColumn', 'actions[].at.payloadIndex', 'actions[].at.traceCoordinate',
      'raw.FRNT', 'selections.front.length', 'selections.front[]', 'selections.front[].kcodeColumn',
      'selections.front[].payloadIndex', 'selections.front[].traceCoordinate',
    ].sort());
    // Bind every complete canonical delta value, including raw selections:
    // rack, footer, target selectors, rear-bed or other changes cannot hide
    // behind the same aggregate count or the same six pass indices.
    expect(createHash('sha256').update(JSON.stringify(strict.deltas)).digest('hex'))
      .toBe('162c444a715f67e31cdb5027d9f8812e11071fe200101845b3823c1e38a7d2d9');

    const referenceOnlyCoordinates = [
      [100, 102, 108, 110, 116, 118, 124, 126, 132, 134, 140, 142, 148, 150, 156, 157],
      [94], [94], [94], [94], [94],
    ];
    for (const [ordinal, index] of knownPasses.entries()) {
      const actual = emittedTrace.passes[index]!;
      const expected = referenceTrace.passes[index]!;
      expect(actual.carrier).toBe('4');
      expect(expected.carrier).toBe('4');
      const signatures = (pass: typeof actual) => pass.actions.map((action) => {
        if (action.kind !== 'knit') throw new Error(`unexpected ${action.kind} action in known differing pass ${index}`);
        return `${action.at.bed}:${action.at.traceCoordinate}@${action.at.stitchSelector.encodedValue}`;
      });
      const remaining = signatures(expected);
      for (const coordinate of referenceOnlyCoordinates[ordinal]!) {
        const extra = remaining.indexOf(`front:${coordinate}@9`);
        expect(extra, `reference-only C4 knit at pass ${index}, coordinate ${coordinate}`).toBeGreaterThanOrEqual(0);
        remaining.splice(extra, 1);
      }
      expect(signatures(actual).sort()).toEqual(remaining.sort());
    }
    // These are verified additional reference knits. Their intended fabric
    // function is not inferred from this single captured program.
  });

  it('records the canonical strict difference in the pure trial manifest without claiming exact reproduction', { timeout: 60_000 }, async () => {
    const { compileCurrentV1KnitTrial } = await import('../../../scripts/build-v1-knit-trial');
    const trial = compileCurrentV1KnitTrial();
    expect(trial.manifest.customistParity).toMatchObject({
      reproduction: 'partial', footerDeltas: 0, comparedPasses: 286, stitchIdenticalPasses: 280,
      differingPassIndices: [116, 149, 173, 197, 221, 245],
      machineTraceComparison: { comparison: 'strict-machine-trace-v1', status: 'compared', identical: false, deltaCount: 468, detailsTruncated: true },
    });
    expect(trial.manifest.customistParity.machineTraceComparison.deltas).toHaveLength(50);
    expect(trial.operatorChecklist).toContain('partial reproduction');
    expect(trial.operatorChecklist).toContain('468 strict machine-trace field differences');
  });
});
