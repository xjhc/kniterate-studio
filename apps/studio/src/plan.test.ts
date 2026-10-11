import { describe, expect, it } from 'vitest';
import { appendProjectEdit, createColorworkProjectV1, materializeColorworkProject, type ColorworkProjectV1, type ProjectEdit } from '@kniterate-studio/project-contract';
import { planProject } from './plan';
import { imageToChart } from './imageChart';
import { resolveReadiness, type Finding } from './readiness';

const chart = {
  kind: 'knitlab-colorwork-chart', version: 1, title: 'Plan fixture', width: 60, height: 100, rowNumbering: 'bottom-up',
  palette: [{ id: 'oat', name: 'Oat', hex: '#E8DFCF' }, { id: 'rust', name: 'Rust', hex: '#B5532E' }],
  cells: Array.from({ length: 100 }, (_, row) => Array.from({ length: 60 }, () => Math.floor(row / 17) % 2)),
};

let editCount = 0;
function edit(project: ColorworkProjectV1, ...edits: ProjectEdit[]): ColorworkProjectV1 {
  return edits.reduce((current, value) => appendProjectEdit(current, { id: `e${editCount++}`, source: 'assistant', edit: value }), project);
}
const plan = (project: ColorworkProjectV1) => planProject(materializeColorworkProject(project).state);
const measured = { stitchesPer10cm: 26, rowsPer10cm: 34, source: 'measured' as const };

describe('project plan', () => {
  it('reports authored counts and no sizing claims without a gauge', () => {
    const result = plan(createColorworkProjectV1(chart, { id: 'plain' }));
    expect(result.stitches).toMatchObject({ value: 60, provenance: 'authored' });
    expect(result.rows).toMatchObject({ value: 100, provenance: 'authored' });
    expect(result.needles).toEqual({ first: 97, last: 156 });
    expect(result.predicted).toBeNull();
    expect(result.findings).toEqual([]);
  });

  it('derives stitch and row counts from target × gauge and offers fixes that clear the finding', () => {
    const project = edit(createColorworkProjectV1(chart, { id: 'scarf' }), { kind: 'set-gauge', gauge: measured }, { kind: 'set-target', target: { widthCm: 25, heightCm: 180 } });
    const before = plan(project);
    expect(before.predicted).toMatchObject({ widthCm: { value: 23.1 }, heightCm: { value: 29.4 } });
    expect(before.sizeChecks).toEqual([
      expect.objectContaining({ dimension: 'width', actual: 60, ok: false, required: expect.objectContaining({ value: 65, how: '25 cm × 26 st/10 cm = 65 → 65' }) }),
      expect.objectContaining({ dimension: 'height', actual: 100, ok: false, required: expect.objectContaining({ value: 612 }) }),
    ]);
    expect(before.findings.map((finding) => finding.rule)).toEqual(['size-off-target', 'size-off-target']);
    const fixed = edit(project, ...before.findings.flatMap((finding) => finding.fixes.flatMap((fix) => fix.edits)));
    const after = plan(fixed);
    expect(after.sizeChecks.every((check) => check.ok)).toBe(true);
    expect(after.findings).toEqual([]);
    expect(after.predicted).toMatchObject({ widthCm: { value: 25 }, heightCm: { value: 180 } });
  });

  it('recentres the chart when a width fix would run off the bed', () => {
    const project = edit(createColorworkProjectV1(chart, { id: 'wide' }), { kind: 'set-needle-offset', needleOffset: 190 }, { kind: 'set-gauge', gauge: measured }, { kind: 'set-target', target: { widthCm: 50 } });
    const fixes = plan(project).findings[0]!.fixes[0]!.edits;
    expect(fixes.map((item) => item.kind)).toEqual(['set-needle-offset', 'set-width']);
    expect(plan(edit(project, ...fixes)).findings).toEqual([]);
  });

  it('refuses sizes the bed cannot hold, and flags missing or assumed gauges', () => {
    const base = createColorworkProjectV1(chart, { id: 'limits' });
    expect(plan(edit(base, { kind: 'set-target', target: { widthCm: 25 } })).findings.map((f) => f.rule)).toEqual(['size-needs-gauge']);
    const assumed = plan(edit(base, { kind: 'set-gauge', gauge: { ...measured, source: 'assumed' } }, { kind: 'set-target', target: { widthCm: 23.1 } }));
    expect(assumed.findings.map((f) => f.rule)).toEqual(['gauge-assumed']);
    const tooWide = plan(edit(base, { kind: 'set-gauge', gauge: measured }, { kind: 'set-target', target: { widthCm: 120 } }));
    expect(tooWide.findings).toEqual([expect.objectContaining({ rule: 'size-exceeds-capacity', severity: 'error', fixes: [] })]);
  });

  it('never reuses a row ID that an override still anchors, so a quarantined override stays quarantined', () => {
    let project = createColorworkProjectV1(chart, { id: 'row-ids' });
    const { state } = materializeColorworkProject(project);
    // Delete the ten highest-numbered rows, each anchoring an override: a counter starting after the remaining 90 rows would hand those IDs out again.
    const removed = state.rowIds.filter((rowId) => Number(rowId.slice(4)) > 90);
    project = edit(project, ...removed.map((rowId, index): ProjectEdit => ({ kind: 'add-override', override: { id: `o${index}`, kind: 'stitch', anchor: { rowId, needleIndex: 0 }, operation: 'tuck' } })),
      ...removed.map((rowId): ProjectEdit => ({ kind: 'delete-row', rowId })));
    expect(materializeColorworkProject(project).overrides.every((resolved) => resolved.status === 'quarantined')).toBe(true);
    const grow = plan(edit(project, { kind: 'set-gauge', gauge: measured }, { kind: 'set-target', target: { heightCm: 32 } })).findings[0]!.fixes[0]!.edits;
    const added = grow.flatMap((item) => item.kind === 'set-height' ? item.newRowIds : []);
    expect(added).toHaveLength(19);
    expect(added.filter((rowId) => removed.includes(rowId) || state.rowIds.includes(rowId))).toEqual([]);
    const grown = materializeColorworkProject(edit(project, { kind: 'set-gauge', gauge: measured }, { kind: 'set-target', target: { heightCm: 32 } }, ...grow));
    expect(grown.overrides.every((resolved) => resolved.status === 'quarantined')).toBe(true);
  });

  it('flags a yarn name that contradicts its carrier and offers a rename', () => {
    const project = edit(createColorworkProjectV1(chart, { id: 'names' }), { kind: 'set-yarn-assignment', assignment: { paletteId: 'oat', carrier: '2', yarnName: 'Ground (C4)' } });
    const finding = plan(project).findings.find((item) => item.rule === 'name-encodes-carrier')!;
    expect(finding.path).toBe('yarns/oat');
    expect(finding.fixes[0]!.edits).toEqual([{ kind: 'set-yarn-assignment', assignment: { paletteId: 'oat', carrier: '2', yarnName: 'Ground' } }]);
    expect(plan(edit(project, ...finding.fixes[0]!.edits)).findings).toEqual([]);
    const consistent = edit(createColorworkProjectV1(chart, { id: 'names-ok' }), { kind: 'set-yarn-assignment', assignment: { paletteId: 'oat', carrier: '2', yarnName: 'Ground C2' } });
    expect(plan(consistent).findings).toEqual([]);
  });
});

describe('beanie plan', () => {
  const body = { ...chart, width: 194, height: 102, cells: Array.from({ length: 102 }, () => Array<number>(194).fill(0)) };
  const beanie = (...edits: ProjectEdit[]) => edit(createColorworkProjectV1(body, { id: `beanie-${editCount}` }), { kind: 'set-object', object: { kind: 'beanie', construction: 'flat-rib-2x2' } }, ...edits);

  it('sizes the finished circumference with seam stitches and symmetric rib, centred on the bed', () => {
    const project = beanie({ kind: 'set-gauge', gauge: { stitchesPer10cm: 30, rowsPer10cm: 32, source: 'measured' } }, { kind: 'set-target', target: { widthCm: 50.4, heightCm: 18 } });
    const before = plan(project);
    expect(before.piece).toBe('beanie');
    expect(before.sizeChecks[0]).toMatchObject({ required: { value: 154, how: '50.4 cm finished circumference × 30 st/10 cm = 151.2 st, + 2 seam stitches, rounded to 2 (mod 4) → 154' } });
    const fixes = before.findings.flatMap((finding) => finding.fixes.flatMap((fix) => fix.edits));
    // Shrinking 194 → 154: the width changes before the piece re-centres, so every step fits the bed.
    expect(fixes.map((item) => item.kind)).toEqual(['set-width', 'set-needle-offset', 'set-height']);
    const after = plan(edit(project, ...fixes));
    expect(after.findings).toEqual([]);
    expect(after.needles).toEqual({ first: 50, last: 203 });
    expect(after.predicted?.widthCm).toMatchObject({ value: 50.7, how: 'finished circumference: (154 − 2 seam st) ÷ 30 st/10 cm' });
    expect(after.finishing.join(' ')).toContain('mattress stitch');
  });

  it('reports cuff, body, crown and finished height, and checks the cuff against its recorded intent', () => {
    const rib = { stitchesPer10cm: 30, rowsPer10cm: 32, source: 'measured' as const };
    const allRib = plan(beanie({ kind: 'set-gauge', gauge: rib }));
    expect(allRib.sections).toMatchObject({ cuff: null, body: { rows: 102, fabric: 'rib', cm: { value: 31.9 } }, crown: { recipe: expect.stringContaining('Customist'), finalStitches: 25 } });
    const toque = { kind: 'beanie' as const, construction: 'rib-cuff-jersey-body' as const, cuffRows: 40, cuffFold: true, cuffTargetCm: 7, ribGauge: rib };
    const project = beanie({ kind: 'set-gauge', gauge: measured }, { kind: 'set-object', object: toque });
    const before = plan(project);
    expect(before.findings).toEqual([expect.objectContaining({ rule: 'cuff-off-target', message: expect.stringContaining('should be 45 rows') })]);
    const after = plan(edit(project, ...before.findings[0]!.fixes[0]!.edits));
    expect(after.findings).toEqual([]);
    expect(after.sections).toMatchObject({
      cuff: { rows: 45, knittedCm: { value: 14.1 }, visibleCm: { value: 7 }, folds: true },
      body: { rows: 62, chartRows: 62, fabric: 'fairisle colorwork', cm: { value: 18.2 } },
      crown: { recipe: 'eight-line (jersey)' },
    });
    const { cuff, body, crown, finishedHeightCm } = after.sections!;
    expect(finishedHeightCm!.value).toBeCloseTo(cuff!.visibleCm!.value + body.cm!.value + crown!.cm!.value, 1);
    // The crown's shape, row by row, as the construction knits it: narrowing to the top, centred on the piece.
    const width = after.stitches.value;
    expect(crown!.needles).toHaveLength(crown!.rows);
    expect(crown!.needles.at(-1)).toHaveLength(crown!.finalStitches);
    for (const [index, row] of crown!.needles.entries()) {
      expect(row.length).toBeLessThan(width);
      expect(row.length).toBeLessThanOrEqual(crown!.needles[index - 1]?.length ?? width);
      expect(row[0]! + row.at(-1)!).toBe(width - 1);
    }
    expect(allRib.sections!.crown!.needles).toHaveLength(allRib.sections!.crown!.rows);
    // Without a rib gauge the cuff cannot be checked, and the plan says so.
    const unknown = plan(beanie({ kind: 'set-gauge', gauge: measured }, { kind: 'set-object', object: { ...toque, ribGauge: undefined } }));
    expect(unknown.findings).toEqual([expect.objectContaining({ rule: 'size-needs-gauge', path: 'object.ribGauge' })]);
    expect(unknown.sections!.finishedHeightCm).toBeNull();
  });

  it('refuses circumferences outside the beanie widths', () => {
    const tooBig = plan(beanie({ kind: 'set-gauge', gauge: { stitchesPer10cm: 30, rowsPer10cm: 32, source: 'measured' } }, { kind: 'set-target', target: { widthCm: 90 } }));
    expect(tooBig.findings).toEqual([expect.objectContaining({ rule: 'size-exceeds-capacity', message: expect.stringContaining('60 to 244') })]);
  });
});

describe('readiness', () => {
  const surface = { state: 'surface', label: 'Surface-proven', annotation: '', evidenceId: null } as const;
  const finding = (overrides: Partial<Finding>): Finding => ({ stage: 'compile', rule: 'long-float', severity: 'warning', owner: 'design', path: null, title: '', message: 'm', fixes: [], ...overrides });

  it('is ready only with a non-blocked verdict and no warning or error findings', () => {
    expect(resolveReadiness({ verdict: surface, findings: [] })).toEqual({ ready: true, blockers: [], operatorChecks: [] });
    expect(resolveReadiness({ verdict: surface, findings: [finding({})] }).ready).toBe(false);
    expect(resolveReadiness({ verdict: { ...surface, state: 'blocked', label: 'Blocked' }, findings: [] }).blockers).toEqual([{ kind: 'verdict-blocked', label: 'Blocked' }]);
  });

  it('keeps compiler-owned warnings as blockers and lists operator info as checks', () => {
    const result = resolveReadiness({ verdict: surface, findings: [
      finding({ rule: 'machine-setting-ignored', owner: 'compiler' }),
      finding({ stage: 'kcode', rule: 'vendor-converter-note', severity: 'info', owner: 'operator', message: 'X-carrier-spacing = 2 is not encoded' }),
      finding({ stage: 'plan', rule: 'gauge-assumed', path: 'gauge' }),
      finding({ stage: 'plan', rule: 'size-needs-gauge', path: 'gauge' }),
      finding({ stage: 'plan', rule: 'size-exceeds-capacity', severity: 'error', path: 'target.widthCm' }),
    ] });
    expect(result.ready).toBe(false);
    expect(result.blockers.map((blocker) => blocker.kind)).toEqual(['finding', 'assumed-value', 'missing-input', 'unsupported']);
    expect(result.operatorChecks).toEqual(['X-carrier-spacing = 2 is not encoded']);
  });
});

describe('image to chart', () => {
  // 40 × 20 image: left half dark, right half light, with a transparent corner.
  const width = 40;
  const height = 20;
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const dark = x < width / 2;
      data.set(dark ? [20, 20, 20, 255] : [240, 240, 240, 255], (y * width + x) * 4);
    }
  }
  data.set([0, 0, 0, 0], 0);
  const image = { width, height, data };

  it('uses the gauge for the row count and orders the palette by frequency', () => {
    const result = imageToChart(image, { size: { widthStitches: 20 }, colors: 2, gauge: { stitchesPer10cm: 26, rowsPer10cm: 34 }, pooling: 'mean' });
    // aspect 0.5 × (34 / 26) rows per stitch → 13.08 → 13 rows.
    expect(result.chart).toMatchObject({ width: 20, height: 13, rowNumbering: 'bottom-up' });
    expect(result.receipt.aspect).toBe('gauge-corrected');
    // The transparent corner pixel lightens only the top-left cell, so check the remaining rows.
    expect(result.chart.cells.slice(1).every((row) => row.slice(0, 10).every((cell) => cell === row[0]) && row[0] !== row[19])).toBe(true);
    expect(result).toEqual(imageToChart(image, { size: { widthStitches: 20 }, colors: 2, gauge: { stitchesPer10cm: 26, rowsPer10cm: 34 }, pooling: 'mean' }));
  });

  it('treats cells as square without a gauge and sizes in cm with one', () => {
    expect(imageToChart(image, { size: { widthStitches: 20 }, colors: 2, gauge: null, pooling: 'mode' }).chart.height).toBe(10);
    const cm = imageToChart(image, { size: { heightCm: 8 }, colors: 2, gauge: { stitchesPer10cm: 26, rowsPer10cm: 34 }, pooling: 'mean' });
    expect(cm.receipt).toMatchObject({ stitches: 42, rows: 27, predictedCm: { width: 16.2, height: 7.9 } });
    expect(() => imageToChart(image, { size: { heightCm: 8 }, colors: 2, gauge: null, pooling: 'mean' })).toThrow(/gauge/);
    expect(() => imageToChart(image, { size: { widthStitches: 300 }, colors: 2, gauge: null, pooling: 'mean' })).toThrow(/252/);
  });
});
