import { describe, expect, it } from 'vitest';
import {
  appendProjectEdit,
  appendProjectOperation,
  createColorworkProjectV1,
  materializeColorworkProject,
  undoProjectEdit,
  redoProjectEdit,
  type ColorworkProjectV1,
  type ProjectEdit,
} from '@kniterate-studio/project-contract';
import { beanieFitEdits, createBeanieProject, type BeanieIntent } from './beanie';
import { compileColorworkProject } from './blanket/compileProject';
import { handoffFiles, readinessStory, schematicSvg, type MeasurementRecord } from './handoff';
import { planProject } from './plan';
import { convertPlacementImage, defaultPlacementColors, nextPlacementId, refreshedPlacement, type PlacementImage } from './placements';
import { collectFindings, resolveReadiness } from './readiness';
import { runAuthoredPipeline } from './authoredPipeline';
import { trialRevision } from './trials';

const TOQUE: BeanieIntent = {
  title: 'Bird toque',
  headCircumferenceCm: 56,
  ease: -0.1,
  bodyCm: 13,
  bodyGauge: { stitchesPer10cm: 26, rowsPer10cm: 34, source: 'measured' },
  cuffCm: 7,
  ribGauge: { stitchesPer10cm: 30, rowsPer10cm: 32, source: 'measured' },
  fold: true,
  main: { name: 'Black', hex: '#111111' },
  accent: { name: 'White', hex: '#F2F2F2' },
};

let counter = 0;
const toque = (intent: Partial<BeanieIntent> = {}) => createBeanieProject({ ...TOQUE, ...intent }, { id: `toque-${counter}`, source: 'assistant', group: `create-${counter++}` });
const planOf = (project: ColorworkProjectV1) => { const { state, placements } = materializeColorworkProject(project); return planProject(state, placements); };
const operate = (project: ColorworkProjectV1, edits: ProjectEdit[], label = 'test operation') => appendProjectOperation(project, { group: `op-${counter++}`, source: 'human', label, edits });

/** A 40 × 30 image: a dark ring with a 4-pixel transparent margin, so trimming and cropping are visible. */
function ringImage(): PlacementImage {
  const width = 48; const height = 38;
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
    const inside = x >= 4 && x < 44 && y >= 4 && y < 34 && (x < 10 || x >= 38 || y < 10 || y >= 28);
    data.set(inside ? [20, 20, 20, 255] : [250, 250, 250, 255], (y * width + x) * 4);
  }
  return { pixels: { width, height, data }, bytesBase64: 'AA==', sha256: 'a'.repeat(64) };
}

function place(project: ColorworkProjectV1, id: string | null, heightCm = 4, rowsAboveCuff = 3): ColorworkProjectV1 {
  const { state } = materializeColorworkProject(project);
  const { motif, source } = convertPlacementImage(ringImage(), { heightCm, colors: 2, pooling: 'mode' }, state.gauge!);
  const placement = { id: id ?? nextPlacementId(state), motif, x: 'center' as const, rowsAboveCuff, colors: defaultPlacementColors(state, motif), source };
  return operate(project, [{ kind: 'set-placement', placement }], 'Place motif');
}

describe('beanie intent', () => {
  it('creates the 56 cm toque from intent alone, sized by the plan, as one undoable operation', () => {
    const project = toque();
    const plan = planOf(project);
    expect(plan.stitches.value).toBe(134);
    expect(plan.sections).toMatchObject({ cuff: { rows: 45, folds: true }, body: { rows: 44 } });
    expect(plan.findings).toEqual([]);
    expect(plan.sizeChecks[0]!.required.how).toContain('56 cm head × (1 − 10% ease) = 50.4 cm finished circumference');
    expect(undoProjectEdit(project).history.cursor).toBe(0);
  });

  it('resizes for another head in one operation, keeps a placed motif centred, and undoes in one step', () => {
    const placed = place(toque(), 'bird');
    const narrower = operate(placed, beanieFitEdits(placed, { headCircumferenceCm: 52 }), 'Fit 52 cm');
    expect(planOf(narrower).stitches.value).toBe(122);
    expect(planOf(narrower).findings).toEqual([]);
    const resolved = materializeColorworkProject(narrower).placements[0]!;
    expect(resolved.status).toBe('placed');
    expect(Math.abs(2 * resolved.at!.column + resolved.placement.motif.width - 122)).toBeLessThanOrEqual(1);
    expect(planOf(undoProjectEdit(narrower)).stitches.value).toBe(134);
    expect(planOf(redoProjectEdit(undoProjectEdit(narrower))).stitches.value).toBe(122);
  });

  it('changes the cuff at the cuff/body boundary, so painted body stitches stay in the body (review 5)', () => {
    let project = toque();
    const { state } = materializeColorworkProject(project);
    // Accent stitches on the first body row, just above the 45-row cuff.
    const firstBodyRow = state.rowIds[state.chart.height - 1 - 45]!;
    project = appendProjectEdit(project, { id: 'paint', source: 'human', edit: { kind: 'paint-cells', cells: [60, 61, 62, 63].map((column) => ({ rowId: firstBodyRow, column, paletteIndex: 1 })) } });
    const taller = operate(project, beanieFitEdits(project, { cuffCm: 8 }), 'Cuff 8 cm');
    const after = materializeColorworkProject(taller).state;
    expect(after.object?.cuffRows).toBe(51);
    // The painted row is still the first body row, and the cuff is still one color.
    expect(after.rowIds[after.chart.height - 1 - 51]).toBe(firstBodyRow);
    expect(compileColorworkProject(taller).messages.filter((message) => message.severity === 'error')).toEqual([]);
    expect(planOf(taller).findings).toEqual([]);
  });

  it('reports an invalid width as a finding with a fix instead of crashing planning (review 6)', () => {
    const project = appendProjectEdit(toque(), { id: 'odd', source: 'human', edit: { kind: 'set-width', width: 133, fillPaletteIndex: 0 } });
    const plan = planOf(project);
    const finding = plan.findings.find((item) => item.rule === 'beanie-width-invalid')!;
    expect(finding.severity).toBe('error');
    expect(plan.sections!.crown).toBeNull();
    const fixed = operate(project, finding.fixes[0]!.edits);
    expect(planOf(fixed).findings.filter((item) => item.rule === 'beanie-width-invalid')).toEqual([]);
  });
});

describe('placements', () => {
  it('gives each new motif a fresh id, so adding after a removal never replaces artwork (review 3)', () => {
    let project = place(place(toque(), null, 3, 2), null, 3, 14);
    expect(materializeColorworkProject(project).state.placements!.map((item) => item.id)).toEqual(['motif-1', 'motif-2']);
    project = operate(project, [{ kind: 'remove-placement', placementId: 'motif-1' }]);
    project = place(project, null, 3, 26);
    expect(materializeColorworkProject(project).state.placements!.map((item) => item.id)).toEqual(['motif-2', 'motif-3']);
  });

  it('crops the image to its artwork, so the requested height is the visible motif and its box is its stitches', () => {
    const { motif } = convertPlacementImage(ringImage(), { heightCm: 4, colors: 2, pooling: 'mode' }, { stitchesPer10cm: 26, rowsPer10cm: 34 });
    expect(Math.abs(motif.height - 14)).toBeLessThanOrEqual(1);
    expect(motif.cells[0]!.some((cell) => cell !== 0)).toBe(true);
    expect(motif.cells.at(-1)!.some((cell) => cell !== 0)).toBe(true);
    expect(motif.cells.some((row) => row[0] !== 0)).toBe(true);
  });

  it('flags a motif converted at another stitch or row gauge, and refresh re-converts it (review 4)', () => {
    const project = place(toque(), 'bird');
    const wider = operate(project, beanieFitEdits(project, { bodyGauge: { stitchesPer10cm: 39, rowsPer10cm: 34, source: 'measured' } }));
    expect(planOf(wider).findings.map((item) => item.rule)).toContain('placement-size-off');
    const stale = materializeColorworkProject(wider).state.placements![0]!;
    const refreshed = refreshedPlacement(stale, ringImage().pixels, { stitchesPer10cm: 39, rowsPer10cm: 34 });
    expect(refreshed.motif.width).toBeGreaterThan(stale.motif.width);
    expect(planOf(operate(wider, [{ kind: 'set-placement', placement: refreshed }])).findings).toEqual([]);
  });

  it('refuses to export a panel whose placement does not fit (review 2)', () => {
    const panel = createColorworkProjectV1({
      kind: 'knitlab-colorwork-chart', version: 1, title: 'Panel', width: 98, height: 40, rowNumbering: 'bottom-up',
      palette: [{ id: 'ground', name: 'Ground', hex: '#EEEEEE' }, { id: 'ink', name: 'Ink', hex: '#222222' }],
      cells: Array.from({ length: 40 }, () => Array<number>(98).fill(0)),
    }, { id: 'panel-conflict' });
    const motif = { kind: 'knitlab-colorwork-chart', version: 1, title: 'm', width: 4, height: 4, rowNumbering: 'bottom-up', palette: [{ id: 'a', name: 'a', hex: '#000000' }, { id: 'b', name: 'b', hex: '#FFFFFF' }], cells: Array.from({ length: 4 }, () => [1, 1, 1, 1]) } as never;
    const project = operate(panel, [
      { kind: 'set-yarn-assignment', assignment: { paletteId: 'ground', carrier: '2', yarnName: 'Ground' } },
      { kind: 'set-yarn-assignment', assignment: { paletteId: 'ink', carrier: '3', yarnName: 'Ink' } },
      { kind: 'set-placement', placement: { id: 'edge', motif, x: 97, rowsAboveCuff: 2, colors: { 1: 'ink' } } },
    ]);
    const compiled = compileColorworkProject(project);
    expect(compiled.ok).toBe(false);
    expect(compiled.messages).toContainEqual(expect.objectContaining({ rule: 'project-placement-conflict' }));
  });
});

describe('yarn paths', () => {
  it('blocks an accent that sits unused up the inside of the hat for many rows, though no row has a float (review 1)', () => {
    const project = toque();
    const { state } = materializeColorworkProject(project);
    const bodyRowId = (bodyRow: number) => state.rowIds[state.chart.height - 1 - (45 + bodyRow)]!;
    const painted = operate(project, [{ kind: 'paint-cells', cells: [1, 40].map((bodyRow) => ({ rowId: bodyRowId(bodyRow), column: 67, paletteIndex: 1 })) }]);
    const compiled = compileColorworkProject(painted);
    expect(compiled.messages).toContainEqual(expect.objectContaining({ rule: 'project-long-carry', severity: 'warning' }));
    expect(compiled.messages).toContainEqual(expect.objectContaining({ rule: 'carried-yarn', severity: 'info' }));
    // Birdseye ties every color into the back on every row: no carry.
    const birdseye = compileColorworkProject(operate(painted, beanieFitEdits(painted, { backing: 'birdseye' })));
    expect(birdseye.messages.filter((message) => message.rule === 'project-long-carry')).toEqual([]);
  });
});

describe('handoff', () => {
  it('tells the readiness story for assumed gauges, and packages consistent files', async () => {
    const assumed = toque({
      backing: 'birdseye',
      bodyGauge: { stitchesPer10cm: 26, rowsPer10cm: 34, source: 'assumed' },
      ribGauge: { stitchesPer10cm: 30, rowsPer10cm: 32, source: 'assumed' },
    });
    const project = place(assumed, 'bird');
    const plan = planOf(project);
    const result = await runAuthoredPipeline(project);
    const findings = collectFindings(plan, result);
    const readiness = resolveReadiness({ verdict: result.verdict, findings });
    const story = readinessStory(plan, findings, readiness, result.verdict);
    expect(story).toMatchObject({ status: 'needs-measurements', headline: 'Fit needs measurements', detail: 'Body and rib gauges are assumed. Enter measured gauges to check the finished dimensions.' });
    expect(story.evidence).toBe('Software checks passed · Surface-proven · physical knit pending');
    expect(story.items.map((item) => item.target).sort()).toEqual(['gauge.body', 'gauge.rib']);
    expect(schematicSvg(project, plan)).toContain('fold line');
    const files = await handoffFiles({ project, serializedProject: JSON.stringify(project), plan, result, findings, readiness, sha256: async (bytes) => String(typeof bytes === 'string' ? bytes.length : bytes.byteLength) });
    expect(Object.keys(files).sort()).toEqual(['instructions.md', 'manifest.json', 'measurement-form.md', 'measurements.json', 'program.k', 'program.kc', 'project.kniterate-studio.json', 'schematic.svg']);
    expect(files['instructions.md']).toContain('**Fit needs measurements.**');
    expect(files['instructions.md']).toContain('Fold the rib cuff up');
    expect(JSON.parse(files['manifest.json'] as string).identity.kcodeSha256).toBe(result.kcode!.kcHash);
  });

  it('turns returned measurements into a recorded trial and a revised candidate in one operation', async () => {
    const project = toque({ backing: 'birdseye', bodyGauge: { stitchesPer10cm: 26, rowsPer10cm: 34, source: 'assumed' } });
    const candidate = (await runAuthoredPipeline(project)).kcode!.kcHash;
    const record: MeasurementRecord = {
      kind: 'kniterate-studio-measurements', schemaVersion: 1, candidate: { kcodeSha256: candidate, label: 'Bird toque' },
      synthetic: true, outcome: 'clean',
      bodyGauge: { stitchesPer10cm: 24, rowsPer10cm: 30 }, ribGauge: { stitchesPer10cm: null, rowsPer10cm: null },
      finishedCm: { circumference: 55.1, cuffVisible: null, body: null, crown: null, total: null }, notes: 'Synthetic values for a software test.',
    };
    const revision = trialRevision(project, record, { id: 'trial-1', recordedAt: '2026-10-02T10:00:00Z' });
    expect(revision.comparisons).toEqual([{ measure: 'circumference', predictedCm: 50.8, measuredCm: 55.1, deviation: 0.085 }]);
    const revised = operate(project, revision.edits, 'Record measurements and revise');
    const { state } = materializeColorworkProject(revised);
    expect(state.trials).toEqual([expect.objectContaining({ id: 'trial-1', synthetic: true, candidate: { kcodeSha256: candidate, label: 'Bird toque' } })]);
    expect(state.gauge).toMatchObject({ stitchesPer10cm: 24, rowsPer10cm: 30, source: 'measured', note: expect.stringContaining('SYNTHETIC') });
    expect(planOf(revised).stitches.value).toBe(122);
    expect(revision.changes).toContain('Needles 134 → 122');
    expect(undoProjectEdit(revised).history.cursor).toBe(project.history.cursor);
  });

  it('re-converts motifs at the measured gauge in the same revision, so the candidate is coherent', async () => {
    const project = place(toque({ backing: 'birdseye', bodyGauge: { stitchesPer10cm: 26, rowsPer10cm: 34, source: 'assumed' } }), 'bird');
    const record: MeasurementRecord = {
      kind: 'kniterate-studio-measurements', schemaVersion: 1, candidate: { kcodeSha256: 'c'.repeat(64), label: 'x' }, synthetic: true, outcome: 'clean',
      bodyGauge: { stitchesPer10cm: 22, rowsPer10cm: 30 }, ribGauge: { stitchesPer10cm: null, rowsPer10cm: null },
      finishedCm: { circumference: null, cuffVisible: null, body: null, crown: null, total: null }, notes: '',
    };
    const stale = operate(project, trialRevision(project, record, { id: 't1', recordedAt: '2026-10-02T10:00:00Z' }).edits);
    expect(planOf(stale).findings.map((finding) => finding.rule)).toContain('placement-size-off');
    const revision = trialRevision(project, record, { id: 't2', recordedAt: '2026-10-02T10:00:00Z', pixels: new Map([['bird', ringImage().pixels]]) });
    expect(revision.changes).toContain('Motifs re-converted at the measured gauge: bird');
    expect(planOf(operate(project, revision.edits)).findings).toEqual([]);
  });
});
