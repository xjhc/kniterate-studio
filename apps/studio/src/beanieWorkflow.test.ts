import { describe, expect, it } from 'vitest';
import { beanieObjectOf,
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
import { isSamePlacement, placementToStitchesEdits, unmappedColors } from './placements';
import { planProject } from './plan';
import { convertPlacementImage, defaultPlacementColors, nextPlacementId, refreshedPlacement, type PlacementImage } from './placements';
import { collectFindings, resolveReadiness } from './readiness';
import { runAuthoredPipeline } from './authoredPipeline';
import { trialRevision } from './trials';
import { continuationFrom } from './garment/ChangesPanel';

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
    expect(beanieObjectOf(after)?.cuffRows).toBe(51);
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
    expect(story).toMatchObject({ status: 'needs-measurements', headline: 'Ready to knit, sizes not confirmed', detail: 'The body and rib gauges are typical values until you measure a swatch.' });
    expect(story.evidence).toBe('Software checks passed · Surface-proven · physical knit pending');
    expect(story.items.map((item) => item.target).sort()).toEqual(['gauge.body', 'gauge.rib']);
    expect(schematicSvg(project, plan)).toContain('fold line');
    const files = await handoffFiles({ project, serializedProject: JSON.stringify(project), plan, result, findings, readiness, sha256: async (bytes) => String(typeof bytes === 'string' ? bytes.length : bytes.byteLength) });
    expect(Object.keys(files).sort()).toEqual(['instructions.md', 'manifest.json', 'measurement-form.md', 'measurements.json', 'program.k', 'program.kc', 'project.kniterate-studio.json', 'schematic.svg']);
    expect(files['instructions.md']).toContain('**Ready to knit, sizes not confirmed.**');
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
    const revision = trialRevision(project, record, { id: 'trial-1', recordedAt: '2026-10-02T10:00:00Z', currentCandidateSha256: candidate });
    expect(revision.comparisons).toEqual([{ measure: 'circumference', predictedCm: 50.8, measuredCm: 55.1, deviation: 0.085 }]);
    const revised = operate(project, revision.edits, 'Record measurements and revise');
    const { state } = materializeColorworkProject(revised);
    expect(state.trials).toEqual([expect.objectContaining({ id: 'trial-1', synthetic: true, candidate: { kcodeSha256: candidate, label: 'Bird toque' } })]);
    // Synthetic values revise the design but count as assumed, never measured.
    expect(state.gauge).toMatchObject({ stitchesPer10cm: 24, rowsPer10cm: 30, source: 'assumed', note: expect.stringContaining('SYNTHETIC') });
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
    expect(planOf(operate(project, revision.edits)).findings.map((finding) => finding.rule)).not.toContain('placement-size-off');
  });
});

describe('third review', () => {
  const baseRecord = (candidate: string, overrides: Partial<MeasurementRecord> = {}): MeasurementRecord => ({
    kind: 'kniterate-studio-measurements', schemaVersion: 1, candidate: { kcodeSha256: candidate, label: 'x' }, synthetic: false, outcome: 'clean',
    bodyGauge: { stitchesPer10cm: null, rowsPer10cm: null }, ribGauge: { stitchesPer10cm: null, rowsPer10cm: null },
    finishedCm: { circumference: null, cuffVisible: null, body: null, crown: null, total: null }, notes: '', ...overrides,
  });

  it('1: synthetic measurements never count as measured, and every output says so', async () => {
    const project = toque({ backing: 'birdseye', bodyGauge: { stitchesPer10cm: 26, rowsPer10cm: 34, source: 'assumed' }, ribGauge: { stitchesPer10cm: 30, rowsPer10cm: 32, source: 'assumed' } });
    const candidate = (await runAuthoredPipeline(project)).kcode!.kcHash;
    const revision = trialRevision(project, baseRecord(candidate, { synthetic: true, bodyGauge: { stitchesPer10cm: 26, rowsPer10cm: 34 }, ribGauge: { stitchesPer10cm: 30, rowsPer10cm: 32 } }), { id: 's1', recordedAt: '2026-10-02T10:00:00Z' });
    const revised = operate(project, revision.edits);
    const plan = planOf(revised);
    const result = await runAuthoredPipeline(revised);
    const findings = collectFindings(plan, result);
    const readiness = resolveReadiness({ verdict: result.verdict, findings });
    expect(readiness.ready).toBe(false);
    const story = readinessStory(plan, findings, readiness, result.verdict, materializeColorworkProject(revised).state.trials);
    expect(story.headline).toBe('Ready to knit, sizes not confirmed');
    expect(story.notices[0]).toContain('test data');
    const files = await handoffFiles({ project: revised, serializedProject: JSON.stringify(revised), plan, result, findings, readiness, sha256: async () => 'h' });
    expect(files['instructions.md']).toContain('SYNTHETIC (software test, not knitted)');
    expect(JSON.parse(files['manifest.json'] as string).trials[0]).toMatchObject({ synthetic: true });
  });

  it('2: the ground yarn carried from the cuff to the crown past an all-accent body is a long carry', () => {
    const project = toque();
    const { state } = materializeColorworkProject(project);
    const cells = state.rowIds.slice(0, state.chart.height - 45).flatMap((rowId) => Array.from({ length: state.chart.width }, (_, column) => ({ rowId, column, paletteIndex: 1 })));
    const solid = operate(project, [{ kind: 'paint-cells', cells }]);
    const compiled = compileColorworkProject(solid);
    expect(compiled.messages).toContainEqual(expect.objectContaining({ rule: 'project-long-carry', message: expect.stringContaining('C3 is unused for 44 body rows (from the cuff to the crown)') }));
  });

  it('3: the returnable forms are not part of the hashed candidate', async () => {
    const project = toque();
    const plan = planOf(project);
    const result = await runAuthoredPipeline(project);
    const findings = collectFindings(plan, result);
    const files = await handoffFiles({ project, serializedProject: JSON.stringify(project), plan, result, findings, readiness: resolveReadiness({ verdict: result.verdict, findings }), sha256: async () => 'h' });
    const manifest = JSON.parse(files['manifest.json'] as string);
    expect(Object.keys(manifest.files)).not.toContain('measurements.json');
    expect(manifest.forms).toEqual(['measurement-form.md', 'measurements.json']);
    expect(JSON.parse(files['measurements.json'] as string).candidate.predictedCm).toMatchObject({ circumference: 50.8, body: 12.9 });
  });

  it('4: measurements are compared with the knitted candidate, not a later draft', () => {
    const project = toque();
    const predictedCm = { circumference: 50.8, cuffVisible: 7, body: 12.9, crown: 8.8, total: 28.7 };
    const draft = operate(project, beanieFitEdits(project, { bodyCm: 26 }));
    const revision = trialRevision(draft, baseRecord('d'.repeat(64), { candidate: { kcodeSha256: 'd'.repeat(64), label: 'x', predictedCm }, finishedCm: { circumference: null, cuffVisible: null, body: 12.9, crown: null, total: null } }), { id: 'c1', recordedAt: '2026-10-02T10:00:00Z' });
    expect(revision.comparisonBasis).toBe('candidate-form');
    expect(revision.comparisons).toEqual([{ measure: 'body', predictedCm: 12.9, measuredCm: 12.9, deviation: 0 }]);
    const unknown = trialRevision(draft, baseRecord('e'.repeat(64), { finishedCm: { circumference: null, cuffVisible: null, body: 12.9, crown: null, total: null } }), { id: 'c2', recordedAt: '2026-10-02T10:00:00Z', currentCandidateSha256: 'f'.repeat(64) });
    expect(unknown.comparisonBasis).toBe('unknown');
    expect(unknown.comparisons[0]!.predictedCm).toBeNull();
  });

  it('5: a large cuff change and long histories stay one-step undoable', () => {
    let project = toque({ ribGauge: { stitchesPer10cm: 30, rowsPer10cm: 60, source: 'measured' } });
    const before = materializeColorworkProject(project).state;
    const big = operate(project, beanieFitEdits(project, { cuffCm: 30 }), 'Cuff 30 cm');
    expect(beanieObjectOf(materializeColorworkProject(big).state)?.cuffRows).toBe(360);
    const undone = materializeColorworkProject(undoProjectEdit(big)).state;
    expect([undone.chart.height, beanieObjectOf(undone)?.cuffRows, beanieObjectOf(undone)?.cuffTargetCm]).toEqual([before.chart.height, beanieObjectOf(before)?.cuffRows, 7]);
    // Fill history past its limit with multi-edit operations: compaction never splits one.
    for (let index = 0; index < 140; index += 1) project = operate(project, [{ kind: 'set-target', target: { heightCm: 13 + (index % 2) } }, { kind: 'set-target', target: { heightCm: 13 } }]);
    const groups = project.history.entries.map((entry) => entry.group);
    expect(groups[0] !== undefined && groups[1] === groups[0]).toBe(true);
    expect(undoProjectEdit(project).history.cursor).toBe(project.history.cursor - 2);
  });

  it('6: the schematic draws the actual chart, also after converting a motif to stitches, and only the front in the front view', () => {
    const project = place(toque(), 'bird');
    const countAccent = (p: ColorworkProjectV1) => (schematicSvg(p, planOf(p))!.match(/fill="#F2F2F2"/g) ?? []).length;
    const placed = countAccent(project);
    expect(placed).toBeGreaterThan(0);
    const { state, placements } = materializeColorworkProject(project);
    const converted = operate(project, placementToStitchesEdits(state, placements[0]!));
    expect(countAccent(converted)).toBe(placed);
    // Moved to the back (an edge), the motif is not drawn in the front view: only the flat view shows it.
    const atBack = operate(project, [{ kind: 'set-placement', placement: { ...state.placements![0]!, x: 0 } }]);
    expect(countAccent(atBack)).toBeLessThan(placed);
  });

  it('7: switching a fairisle beanie to birdseye compiles', () => {
    const fairisle = toque({ backing: 'fairisle' });
    expect(materializeColorworkProject(fairisle).state.strategy.birdseyeMode).toBeUndefined();
    const switched = operate(fairisle, beanieFitEdits(fairisle, { backing: 'birdseye' }));
    const compiled = compileColorworkProject(switched);
    expect(compiled.ok).toBe(true);
  });

  it('8: an unmapped image color is left as the ground; a missing yarn is a color problem, not a size one', () => {
    const project = place(toque(), 'bird');
    const placement = materializeColorworkProject(project).state.placements![0]!;
    const ground = operate(project, [{ kind: 'set-placement', placement: { ...placement, colors: {} } }]);
    expect(materializeColorworkProject(ground).placements[0]).toMatchObject({ status: 'placed' });
    const missing = operate(project, [{ kind: 'set-placement', placement: { ...placement, colors: { 1: 'nope' } } }]);
    expect(materializeColorworkProject(missing).placements[0]).toMatchObject({ status: 'conflict', problem: 'color' });
  });

  it('10: an opened file continues the active history even after an undo replaced the redo branch', () => {
    const project = toque();
    const fitted = operate(project, beanieFitEdits(project, { headCircumferenceCm: 52 }));
    const undone = undoProjectEdit(fitted);
    const agent = appendProjectOperation(undone, { group: 'agent-1', source: 'assistant', label: 'Head 58 cm', edits: beanieFitEdits(undone, { headCircumferenceCm: 58 }) });
    expect(continuationFrom(undone, agent)).toBe(undone.history.cursor);
    expect(continuationFrom(fitted, createColorworkProjectV1({ ...materializeColorworkProject(project).state.chart, title: 'x' }, { id: 'other' }))).toBeNull();
  });

  it('11: registration parses both modes', async () => {
    const { parseRegisterArguments } = await import('../../../scripts/register-v1-knit-trial');
    expect(parseRegisterArguments(['--', 'acrylic-control'])).toEqual({ shortName: 'acrylic-control', packageDirectory: undefined });
    expect(parseRegisterArguments(['bird', '--package', 'out/pkg'])).toEqual({ shortName: 'bird', packageDirectory: 'out/pkg' });
    expect(parseRegisterArguments(['--package', 'out/pkg', 'bird'])).toEqual({ shortName: 'bird', packageDirectory: 'out/pkg' });
    expect(() => parseRegisterArguments(['--package'])).toThrow(/needs a handoff package/);
  });

  it('labels beanie passes by section: rib and body rows carry design-row provenance', () => {
    const compiled = compileColorworkProject(place(toque({ backing: 'birdseye' }), 'bird'));
    expect(compiled.programOpSourceRows.some((rows) => rows !== null)).toBe(true);
    expect(compiled.rowProvenance.filter((row) => row.passIndices.length > 0)).toHaveLength(compiled.rowProvenance.length);
  });
});

describe('fourth review', () => {
  it('5: continuation is found across history compaction', () => {
    let project = createColorworkProjectV1({ ...materializeColorworkProject(toque()).state.chart, title: 'c' }, { id: 'long' });
    for (let index = 0; index < 256; index += 1) project = appendProjectEdit(project, { id: `h${index}`, source: 'human', edit: { kind: 'set-target', target: { heightCm: 10 + (index % 5) } } });
    const agent = appendProjectOperation(project, { group: 'agent', source: 'assistant', label: 'Agent', edits: [{ kind: 'set-target', target: { heightCm: 30 } }] });
    expect(agent.history.entries[0]!.id).not.toBe(project.history.entries[0]!.id);
    const from = continuationFrom(project, agent);
    expect(from).not.toBeNull();
    expect(agent.history.entries[from!]!.group).toBe('agent');
  });

  it('1: an asynchronous result applies only to the placement it started from', () => {
    const project = place(toque(), 'bird');
    const started = materializeColorworkProject(project).state.placements![0]!;
    expect(isSamePlacement(started, structuredClone(started))).toBe(true);
    expect(isSamePlacement(undefined, started)).toBe(false);
    expect(isSamePlacement({ ...started, rowsAboveCuff: started.rowsAboveCuff + 1 }, started)).toBe(false);
  });

  it('2: image colors without a matching yarn are reported, so none is dropped silently', () => {
    const { state } = materializeColorworkProject(toque());
    const motif = { kind: 'knitlab-colorwork-chart', version: 1, title: 'm', width: 3, height: 1, rowNumbering: 'bottom-up', palette: [{ id: 'a', name: 'a', hex: '#FFFFFF' }, { id: 'b', name: 'b', hex: '#000000' }, { id: 'c', name: 'c', hex: '#FF0000' }], cells: [[1, 2, 2]] } as never;
    const colors = defaultPlacementColors(state, motif);
    expect(unmappedColors(motif, colors)).toEqual([{ color: 2, stitches: 2 }]);
  });
});
