import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { appendProjectOperation, materializeColorworkProject, type ProjectPlacement } from '@kniterate-studio/project-contract';
import { decodePng, encodePng } from '../../../scripts/lib/png';
import { runAuthoredPipeline } from './authoredPipeline';
import { createBeanieProject } from './beanie';
import type { MeasurementRecord } from './handoff';
import { convertPlacementImage, PlacementColorDecisionError, refreshedPlacement, type PlacementImage } from './placements';
import { planProject } from './plan';
import { collectFindings, resolveReadiness } from './readiness';
import { trialRevision } from './trials';

function image(): PlacementImage {
  const width = 40; const height = 40;
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
    const color = x >= 10 && x < 30 && y >= 10 && y < 30
      ? x >= 18 && x < 22 && y >= 18 && y < 22 ? [255, 0, 0, 255] : [0, 0, 0, 255]
      : [255, 255, 255, 255];
    data.set(color, (y * width + x) * 4);
  }
  const bytes = encodePng({ width, height, data });
  return { pixels: decodePng(bytes), bytesBase64: bytes.toString('base64'), sha256: createHash('sha256').update(bytes).digest('hex') };
}

const originalGauge = { stitchesPer10cm: 30, rowsPer10cm: 30 };
const changedGauge = { stitchesPer10cm: 40, rowsPer10cm: 40 };

function placed(sourceImage: PlacementImage): ProjectPlacement {
  const converted = convertPlacementImage(sourceImage, { heightCm: 4, colors: 3, pooling: 'mode' }, originalGauge);
  return { id: 'mark', ...converted, x: 'center', rowsAboveCuff: 3, colors: { '1': 'accent' } };
}

describe('placement refresh color decisions', () => {
  it('refuses newly visible colors without changing the existing placement', () => {
    const sourceImage = image(); const placement = placed(sourceImage);
    const before = JSON.stringify(placement);
    expect(new Set(placement.motif.cells.flat())).toEqual(new Set([1]));
    let caught: unknown;
    try { refreshedPlacement(placement, sourceImage.pixels, changedGauge); } catch (error) { caught = error; }
    expect(caught).toBeInstanceOf(PlacementColorDecisionError);
    const error = caught as PlacementColorDecisionError;
    expect(error.missing).toEqual([{ color: 2, stitches: 9 }]);
    expect(error.message).toContain('Image color 2 (9 stitches)');
    expect(error.motif.cells.flat().filter((color) => color === 2)).toHaveLength(9);
    expect(JSON.stringify(placement)).toBe(before);
  });

  it('accepts a yarn decision and preserves existing mappings and placement intent', () => {
    const sourceImage = image(); const placement = placed(sourceImage);
    const refreshed = refreshedPlacement(placement, sourceImage.pixels, changedGauge, {}, { '2': 'detail' });
    expect(refreshed.colors).toEqual({ '1': 'accent', '2': 'detail' });
    expect(refreshed).toMatchObject({ id: 'mark', x: 'center', rowsAboveCuff: 3, source: { gauge: changedGauge } });
    expect(refreshedPlacement(refreshed, sourceImage.pixels, changedGauge).colors).toEqual(refreshed.colors);
  });

  it('retains explicit ground decisions on repeated refreshes and can clear an existing mapping', () => {
    const sourceImage = image(); const placement = placed(sourceImage);
    const refreshed = refreshedPlacement(placement, sourceImage.pixels, changedGauge, {}, { '2': null });
    expect(refreshed.colors).toEqual({ '1': 'accent' });
    expect(refreshedPlacement(refreshed, sourceImage.pixels, changedGauge).colors).toEqual({ '1': 'accent' });
    expect(refreshedPlacement(refreshed, sourceImage.pixels, changedGauge, {}, { '1': null }).colors).toEqual({});
  });

  it('preserves old intentionally transparent colors while requiring a decision for new ones', () => {
    const sourceImage = image(); const placement = { ...placed(sourceImage), colors: {} };
    expect(refreshedPlacement(placement, sourceImage.pixels, originalGauge).colors).toEqual({});
    expect(() => refreshedPlacement(placement, sourceImage.pixels, changedGauge)).toThrow(PlacementColorDecisionError);
    expect(refreshedPlacement(placement, sourceImage.pixels, changedGauge, {}, { '2': 'detail' }).colors).toEqual({ '2': 'detail' });
  });

  it('requires the same decisions when resizing reveals a color', () => {
    const sourceImage = image(); const placement = placed(sourceImage);
    expect(() => refreshedPlacement(placement, sourceImage.pixels, originalGauge, { heightCm: 6 })).toThrow(PlacementColorDecisionError);
    const resized = refreshedPlacement(placement, sourceImage.pixels, originalGauge, { heightCm: 6 }, { '2': 'detail' });
    expect(resized.source?.heightCm).toBe(6);
    expect(resized.colors).toEqual({ '1': 'accent', '2': 'detail' });
  });

  it('leaves the existing successful refresh result unchanged', () => {
    const sourceImage = image(); const placement = placed(sourceImage);
    const converted = convertPlacementImage(sourceImage, { heightCm: 4, colors: 3, pooling: 'mode' }, originalGauge);
    const previousResult = { ...placement, motif: converted.motif, source: converted.source };
    expect(JSON.stringify(refreshedPlacement(placement, sourceImage.pixels, originalGauge))).toBe(JSON.stringify(previousResult));
  });

  it.each([
    { label: 'stored conversion gauge', legacy: false, measuredGauge: changedGauge },
    { label: 'legacy source with a stitch-only gauge change', legacy: true, measuredGauge: { stitchesPer10cm: 40, rowsPer10cm: 30 } },
  ])('records measurements while unresolved new colors keep its motif stale: $label', async ({ legacy, measuredGauge }) => {
    const sourceImage = image(); const placement = placed(sourceImage);
    if (legacy) delete placement.source!.gauge;
    const project = appendProjectOperation(createBeanieProject({
      title: 'Refresh trial', headCircumferenceCm: 56, bodyCm: 13,
      bodyGauge: { ...originalGauge, source: 'measured' },
      cuffCm: 7, fold: true, ribGauge: { stitchesPer10cm: 30, rowsPer10cm: 32, source: 'measured' },
      main: { name: 'Ground', hex: '#111111' }, accent: { name: 'Accent', hex: '#eeeeee' }, backing: 'birdseye',
    }, { id: 'refresh-trial', source: 'human', group: 'create' }), {
      group: 'place', source: 'human', label: 'Place motif', edits: [{ kind: 'set-placement', placement }],
    });
    const original = JSON.stringify(project);
    const candidate = (await runAuthoredPipeline(project)).kcode!.kcHash;
    // Exercise the measured branch with fixture values; this test is not physical evidence.
    const record: MeasurementRecord = {
      kind: 'kniterate-studio-measurements', schemaVersion: 1,
      candidate: { kcodeSha256: candidate, label: 'Refresh trial' }, synthetic: false, outcome: 'issues',
      bodyGauge: measuredGauge, ribGauge: { stitchesPer10cm: null, rowsPer10cm: null },
      finishedCm: { circumference: 38, cuffVisible: null, body: 9.75, crown: null, total: null },
      notes: 'Measurement fixture for the unresolved refresh branch.',
    };
    const revision = trialRevision(project, record, {
      id: 'trial-color-choice', recordedAt: '2026-10-03T12:00:00Z', currentCandidateSha256: candidate,
      pixels: new Map([[placement.id, sourceImage.pixels]]),
    });
    expect(revision.edits.filter((edit) => edit.kind === 'set-placement')).toHaveLength(legacy ? 1 : 0);
    expect(revision.changes).toContainEqual(expect.stringMatching(/kept unchanged.*Refresh.*mark: image color 2/));
    expect(revision.changes.some((change) => change.startsWith('Motifs re-converted'))).toBe(false);
    const revised = appendProjectOperation(project, { group: 'measure', source: 'human', label: 'Record measurements', edits: revision.edits });
    const { state, placements } = materializeColorworkProject(revised);
    expect(state.trials).toEqual([expect.objectContaining({
      id: 'trial-color-choice', candidate: record.candidate, synthetic: false, outcome: 'issues',
      bodyGauge: measuredGauge, finishedCm: { circumference: 38, body: 9.75 }, notes: record.notes,
    })]);
    expect(state.gauge).toMatchObject({ ...measuredGauge, source: 'measured' });
    expect(state.placements).toEqual([{ ...placement, source: { ...placement.source, gauge: originalGauge } }]);
    expect(state.placements![0]!.source!.gauge).toEqual(originalGauge);
    const plan = planProject(state, placements);
    expect(plan.stitches.value).toBe(202);
    const result = await runAuthoredPipeline(revised);
    const readiness = resolveReadiness({ verdict: result.verdict, findings: collectFindings(plan, result) });
    expect(readiness.ready).toBe(false);
    expect(readiness.blockers).toEqual([expect.objectContaining({ rule: 'placement-size-off', path: 'placements/mark' })]);

    const resolved = refreshedPlacement(state.placements![0]!, sourceImage.pixels, measuredGauge, {}, { '2': 'accent' });
    const readyProject = appendProjectOperation(revised, { group: 'resolve', source: 'human', label: 'Resolve new motif color', edits: [{ kind: 'set-placement', placement: resolved }] });
    const readyState = materializeColorworkProject(readyProject);
    expect(readyState.state.trials).toEqual(state.trials);
    expect(readyState.state.placements![0]!.source!.gauge).toEqual(measuredGauge);
    expect(readyState.state.placements![0]!.motif.cells.flat().filter((color) => color === 2)).toHaveLength(9);
    expect(readyState.state.placements![0]!.colors['2']).toBe('accent');
    const readyPlan = planProject(readyState.state, readyState.placements);
    const readyResult = await runAuthoredPipeline(readyProject);
    expect(resolveReadiness({ verdict: readyResult.verdict, findings: collectFindings(readyPlan, readyResult) }).ready).toBe(true);
    expect(JSON.stringify(project)).toBe(original);
  });
});
