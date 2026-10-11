import {
  appendProjectOperation,
  createColorworkProjectV1,
  sweaterObjectOf,
  type ColorworkProjectV1,
  type ProjectEdit,
  type ProjectEditEntry,
  type ProjectGauge,
  type ProjectState,
  type SweaterObject,
} from '@kniterate-studio/project-contract';
import { defaultMeasurements, draftSweater, edgeProblem, type DraftPiece, type Fit, type Measurements, type PieceId, type Silhouette, type Size, type SweaterDraft } from './draft';
import { rasterizePiece, type Gauge, type PanelPlan } from './rasterize';
import { RIBS, TEXTURES, textureById, textureMatching, textureProblem } from './textures';

/**
 * A sweater as a designer states it, and its plan: the drafted pieces at the
 * gauge, with every derived count, the seam checks and the findings that
 * block knitting. Shared by the CLI and the browser.
 */

export const SWEATER_WASTE_CARRIER = '6';
export const SWEATER_DRAW_CARRIER = '1';
/** Default rib gauge (2×2 rib, worsted at 7gg) while it is assumed. */
export const DEFAULT_RIB_GAUGE: Gauge = { stitchesPer10cm: 30, rowsPer10cm: 32 };
/** The 252-needle bed keeps a few needles clear at each end for carrier parking. */
export const SWEATER_MAX_NEEDLES = 240;
export const BED_CENTRE = 127;

export interface SweaterIntent {
  title: string;
  silhouette: Silhouette;
  neckline: SweaterObject['neckline'];
  size: Size;
  fit: Fit;
  textureId: string;
  yarn: { name: string; hex: string };
  /** Body gauge for the texture; the texture's typical gauge (assumed) when missing. */
  gauge?: Pick<ProjectGauge, 'stitchesPer10cm' | 'rowsPer10cm' | 'source'>;
  ribGauge?: Pick<ProjectGauge, 'stitchesPer10cm' | 'rowsPer10cm' | 'source'>;
  hemRib?: string;
  measurements?: Partial<Measurements>;
}

export function sweaterObjectFor(intent: SweaterIntent): SweaterObject {
  const texture = textureById(intent.textureId) ?? TEXTURES[0]!;
  const rib = intent.hemRib ?? 'kkpp';
  return {
    kind: 'sweater',
    silhouette: intent.silhouette,
    neckline: intent.neckline,
    size: `${intent.size} ${intent.fit}`,
    measurements: { ...defaultMeasurements(intent.size, intent.fit, intent.silhouette, intent.neckline), ...intent.measurements },
    body: { name: texture.name, texture: [...texture.rows] },
    trims: { hem: { rib, cm: 6 }, cuff: { rib, cm: 6 }, neck: { rib: 'kp', cm: 2.5 } },
    ribGauge: { ...(intent.ribGauge ?? { ...DEFAULT_RIB_GAUGE, source: 'assumed' as const }) },
  };
}

/** A new sweater project. The chart holds only the yarn: the pieces come from the drafted shapes. */
export function createSweaterProject(intent: SweaterIntent, options: { id: string; source: ProjectEditEntry['source']; group: string }): ColorworkProjectV1 {
  const texture = textureById(intent.textureId) ?? TEXTURES[0]!;
  const chart = {
    kind: 'knitlab-colorwork-chart' as const, version: 1 as const, title: intent.title, width: 1, height: 1, rowNumbering: 'bottom-up' as const,
    palette: [{ id: 'main', name: intent.yarn.name, hex: intent.yarn.hex }],
    cells: [[0]],
  };
  const project = createColorworkProjectV1(chart, { id: options.id, title: intent.title });
  const edits: ProjectEdit[] = [
    { kind: 'set-object', object: sweaterObjectFor(intent) },
    { kind: 'set-yarn-assignment', assignment: { paletteId: 'main', carrier: '3', yarnName: intent.yarn.name } },
    { kind: 'set-gauge', gauge: { ...(intent.gauge ?? { ...texture.gauge, source: 'assumed' as const }) } },
  ];
  return appendProjectOperation(project, { group: options.group, source: options.source, label: `Create ${intent.title}`, edits });
}

/** The measurements a hand-shaped edge replaces. */
export const SHAPE_MEASUREMENTS: Record<'body' | 'sleeve', readonly (keyof Measurements)[]> = {
  body: ['chest', 'length', 'armholeDepth', 'shoulderWidth'],
  sleeve: ['sleeveLength', 'upperArm', 'cuff'],
};

/** The design without the knitter's own shapes, for a change that redraws them (a style or size). */
export function withoutShapes(object: SweaterObject): SweaterObject {
  const { shapes: _shapes, ...rest } = object;
  return rest;
}

/** The edit that replaces the sweater's design with `next`. */
export function sweaterEdit(next: SweaterObject): ProjectEdit {
  return { kind: 'set-object', object: next };
}

export interface SweaterPieceFinding {
  rule: string;
  severity: 'error' | 'warning' | 'info';
  /** The piece it concerns, or null for the whole sweater. */
  piece: PieceId | null;
  path: string;
  message: string;
}

export interface SweaterPiecePlan {
  id: PieceId;
  name: string;
  copies: number;
  draft: DraftPiece;
  raster: PanelPlan | null;
  /** Why the piece cannot be rasterized (it does not fit the bed, the shape is degenerate). */
  error: string | null;
}

/**
 * What the piece pipeline needs from any flat-piece project (a sweater, or a
 * one-yarn scarf or blanket): its pieces, carriers and findings, and the body
 * stitch and finish they are knitted with.
 */
export interface PiecesPlan {
  object: { body: { name: string; texture: readonly string[] }; top?: 'bind-off' | 'waste'; fashion?: number };
  gauge: Gauge & { source: 'measured' | 'assumed' };
  ribGauge: Gauge & { source: 'measured' | 'assumed' };
  pieces: SweaterPiecePlan[];
  carriers: { main: string; second: string | null; waste: string; draw: string };
  findings: SweaterPieceFinding[];
  yarn: { metres: number; stitches: number; how: string };
}

/** A pipeline plan that is a sweater's (it has a draft), not a one-yarn panel's. */
export function sweaterPlanOf(plan: PiecesPlan): SweaterPlan {
  if (!('draft' in plan)) throw new Error('This project is not a sweater.');
  return plan as SweaterPlan;
}

export interface SweaterPlan extends PiecesPlan {
  object: SweaterObject;
  draft: SweaterDraft;
  gauge: Gauge & { source: 'measured' | 'assumed' };
  ribGauge: Gauge & { source: 'measured' | 'assumed' };
  pieces: SweaterPiecePlan[];
  /** Main yarn carrier, and the second carrier (same yarn) that knits the right shoulder after a crew neck's split. */
  carriers: { main: string; second: string | null; waste: string; draw: string };
  findings: SweaterPieceFinding[];
  /** Realized measurements of the finished garment, from the knitted counts. */
  realized: { label: string; target: number | null; cm: number; how: string }[];
  /** Each measurement as knitted, cm, where the pieces define it. */
  knitted: Partial<Record<keyof Measurements, number>>;
  /** Edges the knitter shaped by hand: the measurements that drew them no longer apply. */
  custom: { body: boolean; sleeve: boolean };
  /** Main yarn for every piece, from the stitch count: an estimate for buying yarn, not a measurement. */
  yarn: { metres: number; stitches: number; how: string };
}

const round1 = (value: number) => Math.round(value * 10) / 10;

/** The yarn's carrier and a free one for the second neck yarn. */
function carriersOf(state: ProjectState, needsSecond: boolean): SweaterPlan['carriers'] {
  const main = state.machine.yarnAssignments.find((item) => item.paletteId === state.chart.palette[0]?.id)?.carrier ?? '3';
  const second = needsSecond ? (['4', '5', '2', '3'] as const).find((carrier) => carrier !== main) ?? null : null;
  return { main, second, waste: SWEATER_WASTE_CARRIER, draw: SWEATER_DRAW_CARRIER };
}

export function planSweater(state: ProjectState): SweaterPlan {
  const object = sweaterObjectOf(state);
  if (object === undefined) throw new Error('This project is not a sweater.');
  const draft = draftSweater(object);
  const gauge = state.gauge ?? { ...(textureMatching(object.body.texture)?.gauge ?? TEXTURES[0]!.gauge), source: 'assumed' as const };
  const ribGauge = object.ribGauge ?? { ...DEFAULT_RIB_GAUGE, source: 'assumed' as const };
  const findings: SweaterPieceFinding[] = [];
  const problem = textureProblem(object.body.texture);
  if (problem !== null) findings.push({ rule: 'sweater-texture-unknittable', severity: 'error', piece: null, path: 'object.body.texture', message: problem });
  for (const kind of ['body', 'sleeve'] as const) {
    const edge = object.shapes?.[kind];
    const issue = edge ? edgeProblem(edge, kind) : null;
    if (issue !== null) findings.push({ rule: 'sweater-shape-invalid', severity: 'error', piece: kind === 'sleeve' ? 'sleeve' : null, path: `object.shapes.${kind}`, message: issue });
  }
  const pieces: SweaterPiecePlan[] = draft.pieces.map((piece) => {
    const rib = piece.id === 'sleeve' ? object.trims.cuff.rib : piece.id === 'neckband' ? object.trims.neck.rib : object.trims.hem.rib;
    try {
      const raster = rasterizePiece({
        piece,
        gauge,
        ribGauge,
        texture: problem === null ? object.body.texture : ['k'],
        rib,
        topRib: object.trims.neck.rib,
        centre: BED_CENTRE,
      });
      return { id: piece.id, name: piece.name, copies: piece.copies, draft: piece, raster, error: null };
    } catch (error) {
      return { id: piece.id, name: piece.name, copies: piece.copies, draft: piece, raster: null, error: error instanceof Error ? error.message : String(error) };
    }
  });
  const needsSecond = pieces.some((piece) => piece.raster?.rows.some((row) => row.segments.length === 2) ?? false);
  const carriers = carriersOf(state, needsSecond);

  if (gauge.source === 'assumed') findings.push({ rule: 'gauge-assumed', severity: 'warning', piece: null, path: 'gauge', message: `Body gauge ${gauge.stitchesPer10cm} st / ${gauge.rowsPer10cm} rows per 10 cm is a guess: measure a ${object.body.name.toLowerCase()} swatch.` });
  if (ribGauge.source === 'assumed') findings.push({ rule: 'gauge-assumed', severity: 'warning', piece: null, path: 'object.ribGauge', message: `Rib gauge ${ribGauge.rowsPer10cm} rows per 10 cm is a guess: measure a rib swatch.` });
  for (const piece of pieces) {
    if (piece.error !== null) { findings.push({ rule: 'sweater-piece-unplanned', severity: 'error', piece: piece.id, path: `pieces/${piece.id}`, message: `${piece.name}: ${piece.error}` }); continue; }
    const raster = piece.raster!;
    if (raster.realized.widestStitches > SWEATER_MAX_NEEDLES) findings.push({ rule: 'sweater-piece-too-wide', severity: 'error', piece: piece.id, path: `pieces/${piece.id}`, message: `${piece.name} is ${raster.realized.widestStitches} stitches at its widest (${raster.realized.widthCm} cm); the bed takes ${SWEATER_MAX_NEEDLES}. Use a finer gauge or a smaller measurement.` });
    if (raster.lag.stitches >= 3) findings.push({ rule: 'sweater-shape-lag', severity: 'warning', piece: piece.id, path: `pieces/${piece.id}`, message: `${piece.name} narrows or widens faster than the machine can follow: at row ${raster.lag.row + 1} it is ${raster.lag.cm} cm off the drafted shape.` });
    if (raster.realized.castOnStitches < 8) findings.push({ rule: 'sweater-piece-too-narrow', severity: 'error', piece: piece.id, path: `pieces/${piece.id}`, message: `${piece.name} casts on ${raster.realized.castOnStitches} stitches; a piece needs at least 8.` });
  }

  // Seam checks, from the knitted counts.
  const byId = new Map(pieces.map((piece) => [piece.id, piece.raster]));
  const front = byId.get('front');
  const back = byId.get('back');
  const sleeve = byId.get('sleeve');
  /** The first row at or above the drafted underarm (where the side seam ends). */
  const rowsToUnderarm = (raster: PanelPlan | null | undefined) => {
    if (!raster) return null;
    const row = raster.rows.findIndex((item) => item.y >= draft.seams.sideSeam);
    return row < 0 ? null : row;
  };
  const realized: SweaterPlan['realized'] = [];
  if (front && back) {
    // Chest is taken just below the underarm, where the hem's shape no longer matters.
    const below = (raster: PanelPlan) => { const row = raster.rows[Math.max(0, (rowsToUnderarm(raster) ?? raster.rows.length) - 1)]!; return row.segments.at(-1)!.hi - row.segments[0]!.lo + 1; };
    realized.push({ label: 'Chest', target: object.measurements.chest, cm: round1((below(front) + below(back)) * front.stitchCm), how: `${below(front)} + ${below(back)} stitches below the underarm` });
    if (front.realized.castOnStitches !== below(front)) realized.push({ label: 'Hem', target: null, cm: round1((front.realized.castOnStitches + back.realized.castOnStitches) * front.stitchCm), how: `${front.realized.castOnStitches} + ${back.realized.castOnStitches} stitches cast on` });
    realized.push({ label: 'Length', target: object.measurements.length, cm: back.realized.heightCm, how: `${back.realized.rows} rows` });
    const frontUnderarm = rowsToUnderarm(front);
    const backUnderarm = rowsToUnderarm(back);
    if (frontUnderarm !== null && backUnderarm !== null && frontUnderarm !== backUnderarm) {
      findings.push({ rule: 'sweater-seam-mismatch', severity: 'warning', piece: null, path: 'seams/side', message: `The front reaches the underarm at row ${frontUnderarm + 1} and the back at row ${backUnderarm + 1}; the side seams will not match.` });
    }
  }
  if (sleeve && back) {
    realized.push({ label: 'Upper arm', target: object.measurements.upperArm, cm: round1(sleeve.realized.widestStitches * sleeve.stitchCm), how: `${sleeve.realized.widestStitches} stitches` });
    realized.push({ label: 'Cuff', target: object.measurements.cuff, cm: round1(sleeve.realized.castOnStitches * sleeve.stitchCm), how: `${sleeve.realized.castOnStitches} stitches` });
    // The sleeve top sews into the armhole: compare the edges' knitted lengths.
    const armholeRows = back.rows.length - (rowsToUnderarm(back) ?? back.rows.length);
    const armholeCm = object.silhouette === 'drop-shoulder' ? round1(armholeRows * back.rowCm.body) : round1(draft.seams.armhole);
    const sleeveTopCm = object.silhouette === 'drop-shoulder' ? round1((sleeve.rows.at(-1)!.segments[0]!.hi - sleeve.rows.at(-1)!.segments[0]!.lo + 1) * sleeve.stitchCm / 2) : round1(draft.seams.sleeveTop);
    realized.push({ label: 'Armhole edge', target: null, cm: armholeCm, how: object.silhouette === 'drop-shoulder' ? `${armholeRows} rows from the underarm to the shoulder` : 'one armhole edge, as drafted' });
    realized.push({ label: 'Sleeve top (one side)', target: null, cm: sleeveTopCm, how: object.silhouette === 'drop-shoulder' ? 'half the sleeve top' : 'one cap edge, as drafted' });
    const tolerance = object.silhouette === 'set-in' ? 2.5 : 1.5;
    if (Math.abs(armholeCm - sleeveTopCm) > tolerance) {
      findings.push({ rule: 'sweater-seam-mismatch', severity: 'warning', piece: 'sleeve', path: 'seams/armhole', message: `One side of the sleeve top is ${sleeveTopCm} cm but the armhole edge it sews to is ${armholeCm} cm (${round1(sleeveTopCm - armholeCm)} cm difference; up to ${tolerance} cm eases in). ${object.silhouette === 'drop-shoulder' ? 'Make the upper arm twice the armhole depth.' : 'Adjust the upper arm or the armhole depth.'}` });
    }
  }
  if (object.neckline !== 'boat') realized.push({ label: 'Neck opening', target: null, cm: round1(draft.seams.neckline), how: 'front and back neck edges' });
  return { object, draft, gauge, ribGauge, pieces, carriers, findings, realized, knitted: knittedMeasurements(draft, front, back, sleeve), yarn: yarnEstimate(pieces), custom: { body: object.shapes?.body !== undefined, sleeve: object.shapes?.sleeve !== undefined } };
}

/**
 * Yarn for every stitch of every copy of every piece. A knitted loop takes
 * about 2.7 stitch widths of yarn; tucks and ribs take more, so the estimate
 * is rounded up and given ±20%.
 */
export function yarnEstimate(pieces: readonly SweaterPiecePlan[]): SweaterPlan['yarn'] {
  let stitches = 0;
  let centimetres = 0;
  for (const piece of pieces) {
    const raster = piece.raster;
    if (!raster) continue;
    const count = raster.rows.reduce((sum, row) => sum + row.segments.reduce((part, segment) => part + segment.hi - segment.lo + 1, 0), 0) * piece.copies;
    stitches += count;
    centimetres += count * raster.stitchCm * 2.7;
  }
  return { metres: Math.ceil((centimetres / 100) * 1.1 / 50) * 50, stitches, how: `${stitches.toLocaleString('en')} stitches × about 2.7 stitch widths each, plus 10%; a rough estimate, ±20%` };
}

/** Heights of row starts, cm above the cast-on. */
function rowStarts(raster: PanelPlan): number[] {
  let y = 0;
  return raster.rows.map((row) => { const start = y; y += row.zone === 'rib' ? raster.rowCm.rib : raster.rowCm.body; return start; });
}

function knittedMeasurements(draft: SweaterDraft, front: PanelPlan | null | undefined, back: PanelPlan | null | undefined, sleeve: PanelPlan | null | undefined): SweaterPlan['knitted'] {
  const out: SweaterPlan['knitted'] = {};
  const span = (raster: PanelPlan, row: number) => { const segments = raster.rows[row]!.segments; return (segments.at(-1)!.hi - segments[0]!.lo + 1) * raster.stitchCm; };
  // The first row at or above a level; a level at the very top (a drop shoulder's sleeve) is the end of the piece.
  const underarmRow = (raster: PanelPlan, y: number) => { const row = raster.rows.findIndex((item) => item.y >= y); return row < 0 ? raster.rows.length : row; };
  if (front && back) {
    const frontUnder = underarmRow(front, draft.seams.sideSeam);
    const backUnder = underarmRow(back, draft.seams.sideSeam);
    out.chest = round1(span(front, Math.max(0, frontUnder - 1)) + span(back, Math.max(0, backUnder - 1)));
    out.length = back.realized.heightCm;
    const starts = rowStarts(back);
    // Armhole depth runs from the underarm to the shoulder point; the shoulder slope sits above it.
    const shoulderRow = back.rows.findIndex((row) => row.y >= draft.levels.shoulderPoint);
    const shoulderTop = shoulderRow < 0 ? back.realized.heightCm : starts[shoulderRow]!;
    out.armholeDepth = round1(shoulderTop - (starts[backUnder] ?? back.realized.heightCm));
    out.shoulderDrop = round1(back.realized.heightCm - shoulderTop);
    out.shoulderWidth = round1(span(back, Math.max(0, (shoulderRow < 0 ? back.rows.length : shoulderRow) - 1)));
    const frontStarts = rowStarts(front);
    const frontSplit = front.rows.findIndex((row) => row.segments.length === 2);
    if (frontSplit > 0) {
      out.frontNeckDepth = round1(front.realized.heightCm - frontStarts[frontSplit]!);
      const top = front.rows.at(-1)!.segments;
      if (top.length === 2) out.neckWidth = round1((top[1]!.lo - top[0]!.hi - 1) * front.stitchCm);
    }
    const backSplit = back.rows.findIndex((row) => row.segments.length === 2);
    out.backNeckDepth = backSplit > 0 ? round1(back.realized.heightCm - starts[backSplit]!) : 0;
  }
  if (sleeve) {
    const under = underarmRow(sleeve, draft.seams.sleeveSeam);
    out.sleeveLength = round1(rowStarts(sleeve)[under] ?? sleeve.realized.heightCm);
    out.upperArm = round1(sleeve.realized.widestStitches * sleeve.stitchCm);
    out.cuff = round1(sleeve.realized.castOnStitches * sleeve.stitchCm);
  }
  return out;
}

/** Library and rib choices, for the UI and the CLI's help. */
export const SWEATER_CHOICES = {
  silhouettes: [
    { id: 'drop-shoulder', name: 'Drop shoulder', note: 'Straight body and a flat-topped sleeve: the easiest to knit and sew.' },
    { id: 'j-sleeve', name: 'J-sleeve', note: 'A drop shoulder with a short curved step under the arm: less bulk at the underarm.' },
    { id: 'set-in', name: 'Set-in sleeve', note: 'A shaped armhole and a capped sleeve: the most tailored fit.' },
  ] as const,
  necklines: [
    { id: 'crew', name: 'Crew neck', note: 'A round neck finished with a rib neckband.' },
    { id: 'v', name: 'V-neck', note: 'Straight from the shoulders to a point, finished with a rib band crossed at the V.' },
    { id: 'square', name: 'Square neck', note: 'Bound off flat with straight sides, finished with a rib band.' },
    { id: 'boat', name: 'Boat neck', note: 'A straight top with a rib edge; the shoulder seams leave the neck open.' },
  ] as const,
  ribs: RIBS,
  textures: TEXTURES,
} as const;
