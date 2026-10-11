import { describe, expect, it } from 'vitest';
import { appendProjectOperation, materializeColorworkProject, sweaterObjectOf, type ColorworkProjectV1 } from '@kniterate-studio/project-contract';
import { defaultMeasurements, draftSweater, edgeProblem, SIZES, type ShapePoint, type Silhouette } from './draft';
import { edgeRhythm } from './rhythm';
import { rasterizePiece, sliceOutline } from './rasterize';
import { sweaterPlanOf, createSweaterProject, planSweater, sweaterEdit, type SweaterIntent } from './sweater';
import { runSweaterPipeline } from './sweaterPipeline';
import { pieceSteps, sweaterInstructions, sweaterPackageFiles } from './sweaterHandoff';
import { summarizeSweaterRun } from './sweaterRun';
import { TEXTURES, textureProblem } from './textures';
import { assembledLayout, schematicLayout, sweaterSchematicSvg } from './schematic';

const intent = (overrides: Partial<SweaterIntent> = {}): SweaterIntent => ({
  title: 'Test sweater', silhouette: 'set-in', neckline: 'crew', size: 'M', fit: 'classic', textureId: 'stockinette',
  yarn: { name: 'Oatmeal', hex: '#D9CBB0' }, ...overrides,
});
const create = (overrides: Partial<SweaterIntent> = {}) => createSweaterProject(intent(overrides), { id: 'test-sweater', source: 'human', group: 'create' });
const planOf = (project: ColorworkProjectV1) => planSweater(materializeColorworkProject(project).state);

describe('sweater drafting', () => {
  it('drafts closed, symmetric outlines whose slices match the measurements', () => {
    for (const silhouette of ['drop-shoulder', 'j-sleeve', 'set-in'] as Silhouette[]) {
      const object = sweaterObjectOf(materializeColorworkProject(create({ silhouette })).state)!;
      const draft = draftSweater(object);
      const back = draft.pieces.find((piece) => piece.id === 'back')!;
      const [hem] = sliceOutline(back.outline, 1);
      expect(hem![1] - hem![0]).toBeCloseTo(object.measurements.chest / 2, 5);
      expect(hem![0]).toBeCloseTo(-hem![1], 5);
      // A crew neck splits the front's top into two shoulders.
      expect(sliceOutline(draft.pieces.find((piece) => piece.id === 'front')!.outline, object.measurements.length - 1)).toHaveLength(2);
      expect(draft.pieces.map((piece) => piece.id)).toEqual(['back', 'front', 'sleeve', 'neckband']);
    }
  });

  it('fits a set-in cap to the armhole and sizes drop-shoulder sleeves to both armhole edges', () => {
    const setIn = draftSweater(sweaterObjectOf(materializeColorworkProject(create()).state)!);
    expect(Math.abs(setIn.seams.sleeveTop - setIn.seams.armhole)).toBeLessThan(2.5);
    const capHeight = setIn.derived.find((item) => item.label === 'Sleeve cap height')!.cm;
    expect(capHeight).toBeGreaterThan(10);
    expect(capHeight).toBeLessThanOrEqual(defaultMeasurements('M', 'classic', 'set-in').armholeDepth * 0.8 + 0.1);
    for (const size of SIZES) {
      const drop = defaultMeasurements(size, 'relaxed', 'drop-shoulder');
      expect(drop.upperArm).toBeCloseTo(drop.armholeDepth * 2, 1);
    }
  });

  it('has no boat-neck neckband and finishes the top with a rib border instead', () => {
    const plan = planOf(create({ neckline: 'boat' }));
    expect(plan.pieces.map((piece) => piece.id)).toEqual(['back', 'front', 'sleeve']);
    expect(plan.pieces[1]!.raster!.realized.ribRows.top).toBeGreaterThan(0);
    expect(plan.carriers.second).toBeNull();
  });
});

describe('sweater rasterizing', () => {
  it('follows the outline with only machine-legal steps', () => {
    for (const silhouette of ['drop-shoulder', 'j-sleeve', 'set-in'] as Silhouette[]) {
      const plan = planOf(create({ silhouette }));
      for (const piece of plan.pieces) {
        const raster = piece.raster!;
        // The cast-on is even and centred.
        expect(raster.realized.castOnStitches % 2).toBe(0);
        raster.rows.forEach((row, index) => {
          if (index === 0) return;
          const previous = raster.rows[index - 1]!.segments;
          if (previous.length !== row.segments.length) {
            expect(row.segments).toHaveLength(2);
            // The neck splits on a row that starts on the right (odd rows).
            expect(index % 2).toBe(1);
            return;
          }
          row.segments.forEach((segment, s) => {
            const left = segment.lo - previous[s]!.lo;
            const right = previous[s]!.hi - segment.hi;
            for (const change of [left, right]) expect(change).toBeGreaterThanOrEqual(-1);
            // Big steps are bind-offs, made from the side the yarn starts the row on.
            const outerLeft = s === 0 ? left : 0;
            const outerRight = s === row.segments.length - 1 ? right : 0;
            if (outerLeft >= 3 && row.segments.length === 1) expect(index % 2).toBe(0);
            if (outerRight >= 3 && row.segments.length === 1) expect(index % 2).toBe(1);
          });
        });
        expect(raster.lag.stitches).toBeLessThan(3);
      }
    }
  });

  it('reports the knitted measurements within a stitch or row of the wanted ones', () => {
    const plan = planOf(create());
    const wanted = plan.object.measurements;
    for (const key of ['chest', 'length', 'sleeveLength', 'upperArm', 'cuff', 'armholeDepth', 'shoulderWidth', 'frontNeckDepth'] as const) {
      expect(Math.abs(plan.knitted[key]! - wanted[key]!), key).toBeLessThan(1.2);
    }
  });

  it('centres the texture and starts ribs at the cast-on edge', () => {
    const plan = planOf(create({ textureId: 'seed' }));
    const back = plan.pieces[0]!.raster!;
    const bodyRow = back.realized.ribRows.bottom;
    expect(back.stitchAt(bodyRow, back.centre)).not.toBe(back.stitchAt(bodyRow, back.centre + 1));
    expect(back.stitchAt(bodyRow, back.centre)).not.toBe(back.stitchAt(bodyRow + 1, back.centre));
    const castOn = back.rows[0]!.segments[0]!;
    expect([0, 1, 2, 3].map((k) => back.stitchAt(0, castOn.lo + k)).join('')).toBe('kkpp');
  });

  it('refuses textures one carriage pass cannot knit', () => {
    expect(textureProblem(['kt'])).toMatch(/knits and tucks on the front bed/);
    expect(textureProblem(['t', 't'])).toMatch(/two rows running/);
    expect(textureProblem(['ss'])).toMatch(/slips every stitch/);
    for (const texture of TEXTURES) expect(textureProblem(texture.rows), texture.id).toBeNull();
    const project = create();
    const object = sweaterObjectOf(materializeColorworkProject(project).state)!;
    const bad = appendProjectOperation(project, { group: 'bad', source: 'human', label: 'bad', edits: [sweaterEdit({ ...object, body: { name: 'Bad', texture: ['kt'] } })] });
    expect(planOf(bad).findings.some((finding) => finding.rule === 'sweater-texture-unknittable' && finding.severity === 'error')).toBe(true);
  });

  it('refuses a piece wider than the bed', () => {
    const project = create();
    const object = sweaterObjectOf(materializeColorworkProject(project).state)!;
    const huge = appendProjectOperation(project, { group: 'huge', source: 'human', label: 'huge', edits: [sweaterEdit({ ...object, measurements: { ...object.measurements, chest: 220 } })] });
    expect(planOf(huge).findings.some((finding) => finding.rule === 'sweater-piece-too-wide')).toBe(true);
  });

  it('rasterizes a plain rectangle exactly', () => {
    const raster = rasterizePiece({
      piece: { id: 'neckband', name: 'Band', copies: 1, outline: [{ x: -10, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 5 }, { x: -10, y: 5 }], bottomRibCm: 5, topRibCm: 0, allRib: true, edges: {} },
      gauge: { stitchesPer10cm: 20, rowsPer10cm: 30 }, ribGauge: { stitchesPer10cm: 20, rowsPer10cm: 30 }, texture: ['k'], rib: 'kp',
    });
    expect(raster.realized).toMatchObject({ castOnStitches: 40, rows: 15 });
    expect(raster.events).toEqual([]);
  });
});

describe('hand-shaped edges', () => {
  it('drafts front and back from one shared body edge and refits a set-in cap to a hand-made armhole', () => {
    const project = create();
    const object = sweaterObjectOf(materializeColorworkProject(project).state)!;
    const before = planOf(project);
    const body = before.draft.edges.body.map((point) => ({ ...point }));
    // Deepen the armhole: drop the underarm (and the step beside it) by 4 cm.
    const underarmY = body.find((item) => item.underarm)!.y;
    for (const point of body) if (point.y === underarmY) point.y -= 4;
    const shaped = appendProjectOperation(project, { group: 'shape', source: 'human', label: 'shape', edits: [sweaterEdit({ ...object, shapes: { body } })] });
    const after = planOf(shaped);
    expect(after.custom).toEqual({ body: true, sleeve: false });
    expect(after.draft.edges.body).toEqual(body);
    expect(after.draft.seams.armhole).toBeGreaterThan(before.draft.seams.armhole + 1.5);
    // The sleeve cap follows the longer armhole.
    expect(after.draft.seams.sleeveTop).toBeGreaterThan(before.draft.seams.sleeveTop + 1);
    expect(after.knitted.armholeDepth).toBeGreaterThan(before.knitted.armholeDepth! + 3);
    const back = after.pieces.find((piece) => piece.id === 'back')!.raster!;
    const front = after.pieces.find((piece) => piece.id === 'front')!.raster!;
    expect(back.events.find((event) => event.kind === 'bind-off')!.row).toBe(front.events.find((event) => event.kind === 'bind-off')!.row);
  });

  it('compiles any hand shape the editor allows, or refuses it in words: never an invalid program', { timeout: 240_000 }, async () => {
    let seed = 777;
    const rand = () => (seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;
    const jiggle = (edge: readonly ShapePoint[]) => edge.map((point, index) => ({ ...point, x: Math.max(2, Math.round(point.x * (0.5 + rand()) * 2) / 2), y: index === 0 ? point.y : point.y + Math.round((rand() - 0.5) * 16) / 2 }))
      .map((point, index, all) => (index > 0 ? { ...point, y: Math.max(point.y, all.slice(0, index).reduce((top, item) => Math.max(top, item.y), 0)) } : point));
    for (const [silhouette, neckline, textureId] of [['set-in', 'v', 'seed'], ['j-sleeve', 'crew', 'stockinette'], ['drop-shoulder', 'square', 'full-cardigan'], ['set-in', 'boat', 'stockinette']] as const) {
      const project = create({ silhouette, neckline, textureId });
      const object = sweaterObjectOf(materializeColorworkProject(project).state)!;
      const drafted = planOf(project).draft.edges;
      const shaped = appendProjectOperation(project, { group: 'jiggle', source: 'human', label: 'jiggle', edits: [sweaterEdit({ ...object, shapes: { body: jiggle(drafted.body), sleeve: jiggle(drafted.sleeve) } })] });
      const plan = planOf(shaped);
      expect(plan.custom, `${silhouette}: the shapes are used, not refused`).toEqual({ body: true, sleeve: true });
      const result = await runSweaterPipeline(shaped);
      for (const piece of result.pieces) {
        expect(piece.kcode?.validation?.diagnostics.filter((diagnostic) => diagnostic.severity === 'error') ?? []).toEqual([]);
        if (piece.verdict.state !== 'surface') expect(piece.compileError ?? plan.findings.find((finding) => finding.severity === 'error')?.message, `${silhouette} ${piece.id} is blocked with a reason`).toBeTruthy();
      }
    }
  });

  it('refuses an edge that goes down or has no underarm', () => {
    expect(edgeProblem([{ x: 20, y: 0 }, { x: 20, y: 30, underarm: true }, { x: 18, y: 20 }], 'body')).toMatch(/goes down/);
    expect(edgeProblem([{ x: 20, y: 0 }, { x: 18, y: 40 }], 'body')).toMatch(/exactly one underarm/);
    const project = create();
    const object = sweaterObjectOf(materializeColorworkProject(project).state)!;
    const bad = appendProjectOperation(project, { group: 'bad', source: 'human', label: 'bad', edits: [sweaterEdit({ ...object, shapes: { body: [{ x: 20, y: 0 }, { x: 18, y: 40 }] } })] });
    expect(planOf(bad).findings).toContainEqual(expect.objectContaining({ rule: 'sweater-shape-invalid', severity: 'error' }));
  });

  it('reads shaping as a machine knitter does: steady runs, alternating intervals, bind-offs on their own', () => {
    const events = [
      { row: 10, kind: 'decrease' as const, edge: 'left' as const, stitches: 1 },
      { row: 14, kind: 'decrease' as const, edge: 'left' as const, stitches: 1 },
      { row: 18, kind: 'decrease' as const, edge: 'left' as const, stitches: 1 },
      { row: 40, kind: 'bind-off' as const, edge: 'left' as const, stitches: 6 },
      { row: 50, kind: 'increase' as const, edge: 'left' as const, stitches: 1 },
      { row: 56, kind: 'increase' as const, edge: 'left' as const, stitches: 1 },
      { row: 63, kind: 'increase' as const, edge: 'left' as const, stitches: 1 },
      { row: 69, kind: 'increase' as const, edge: 'right' as const, stitches: 1 },
    ];
    expect(edgeRhythm(events, ['left']).map((step) => step.text)).toEqual([
      'Rows 11–19: decrease 1 every 4th row, 3 times',
      'Row 41: bind off 6',
      'Rows 51–64: increase 1 every 6–7 rows, 3 times',
    ]);
  });
});

describe('sweater views', () => {
  it('lays out every style flat and as worn, with the sleeves hinged at the shoulders', () => {
    for (const silhouette of ['drop-shoulder', 'j-sleeve', 'set-in'] as Silhouette[]) {
      for (const neckline of ['crew', 'v', 'square', 'boat'] as const) {
        const plan = planOf(create({ silhouette, neckline }));
        const flat = schematicLayout(plan);
        expect(flat.pieces.map((piece) => piece.id)).toEqual(plan.pieces.map((piece) => piece.id));
        const worn = assembledLayout(plan)!;
        expect(worn.sleeves).toHaveLength(2);
        expect(worn.sleeves.every((sleeve) => sleeve.path.length > 0)).toBe(true);
        expect(worn.neckband === null).toBe(neckline === 'boat');
        // Both sleeves reach out past the body, mirrored.
        expect(worn.minX).toBeLessThan(-plan.object.measurements.chest / 4);
        expect(worn.minX + worn.width).toBeGreaterThan(plan.object.measurements.chest / 4);
        expect(sweaterSchematicSvg(plan, '#D9CBB0')).toMatch(/^<svg[^]*Sleeve ×2[^]*<\/svg>$/);
      }
    }
  });
});

describe('sweater pipeline', () => {
  it('compiles every piece of every silhouette and neckline to strict, Surface-proven KCode', { timeout: 240_000 }, async () => {
    for (const [silhouette, neckline, textureId] of [['set-in', 'crew', 'stockinette'], ['j-sleeve', 'crew', 'seed'], ['drop-shoulder', 'boat', 'full-cardigan'], ['set-in', 'v', 'stockinette'], ['j-sleeve', 'v', 'seed'], ['drop-shoulder', 'square', 'stockinette'], ['set-in', 'square', 'full-cardigan']] as const) {
      const result = await runSweaterPipeline(create({ silhouette, neckline, textureId }));
      for (const piece of result.pieces) {
        expect(piece.verdict.state, `${silhouette} ${piece.id}: ${piece.compileError ?? piece.outputError}`).toBe('surface');
        expect(piece.kcode?.validation?.diagnostics.filter((diagnostic) => diagnostic.severity === 'error')).toEqual([]);
      }
      expect(result.exportReady).toBe(true);
      // The gauges are assumed, so the sweater is knittable but not ready: sizes are not confirmed.
      expect(result.readiness.ready).toBe(false);
      expect(result.readiness.blockers.some((blocker) => blocker.kind === 'assumed-value')).toBe(true);
    }
  });

  it('is ready once both gauges are measured, and blocks when a piece cannot be made', { timeout: 60_000 }, async () => {
    const measured = create({ gauge: { stitchesPer10cm: 26, rowsPer10cm: 34, source: 'measured' }, ribGauge: { stitchesPer10cm: 30, rowsPer10cm: 32, source: 'measured' } });
    const ready = await runSweaterPipeline(measured);
    expect(ready.readiness).toMatchObject({ ready: true, blockers: [] });
    expect(ready.readiness.operatorChecks.join(' ')).toMatch(/second cone of the same yarn on C4/);
    const object = sweaterObjectOf(materializeColorworkProject(measured).state)!;
    const blocked = await runSweaterPipeline(appendProjectOperation(measured, { group: 'wide', source: 'human', label: 'wide', edits: [sweaterEdit({ ...object, measurements: { ...object.measurements, chest: 220 } })] }));
    expect(blocked.verdict.state).toBe('blocked');
    expect(blocked.exportReady).toBe(false);
  });

  it('explains a piece too large to check in one program as a design change, not a backing', { timeout: 120_000 }, async () => {
    const result = await runSweaterPipeline(create({ size: 'XXL', fit: 'oversized', silhouette: 'drop-shoulder', textureId: 'garter' }));
    const tooLarge = result.findings.filter((finding) => finding.rule === 'sweater-piece-too-large');
    expect(tooLarge.map((finding) => finding.path)).toEqual(['pieces/back', 'pieces/front']);
    expect(tooLarge[0]).toMatchObject({ owner: 'design', severity: 'error' });
    expect(tooLarge[0]!.message).toMatch(/^Back needs more needle selections than Studio checks in one program\. Make it smaller, use a coarser gauge, or choose a stitch that moves fewer stitches/);
    expect(result.verdict.state).toBe('blocked');
    expect(result.plan.yarn.metres).toBeGreaterThan(1000);
  });

  it('writes a package with every program, the pattern and a hash manifest', { timeout: 60_000 }, async () => {
    const project = create({ silhouette: 'j-sleeve' });
    const result = await runSweaterPipeline(project);
    const summary = summarizeSweaterRun(result);
    const plan = sweaterPlanOf(result.plan);
    const files = await sweaterPackageFiles({ project, serializedProject: JSON.stringify(project), plan, summary, sha256: async (bytes) => String(bytes.length) });
    expect(Object.keys(files).sort()).toEqual(['back.k', 'back.kc', 'front.k', 'front.kc', 'instructions.md', 'manifest.json', 'neckband.k', 'neckband.kc', 'project.json', 'schematic.svg', 'sleeve.k', 'sleeve.kc']);
    const manifest = JSON.parse(new TextDecoder().decode(files['manifest.json']));
    expect(manifest.pieces.find((piece: { id: string }) => piece.id === 'sleeve')).toMatchObject({ copies: 2, file: 'sleeve.kc', verdict: 'Surface-proven' });
    const pattern = sweaterInstructions(project, plan, summary);
    expect(pattern).toMatch(/### Sleeve — knit 2/);
    expect(pattern).toMatch(/Row \d+: neck\. Bind off the centre \d+ stitches/);
    expect(pieceSteps(plan.pieces[2]!, plan).join(' ')).toMatch(/Rows \d+–\d+ at each side: increase 1 every (\d+–)?\d+(th|rd|nd)? rows?, \d+ times → \d+ stitches\./);
  });
});
