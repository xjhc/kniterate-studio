import type { SweaterObject, SweaterShapePoint } from '@kniterate-studio/project-contract';

/**
 * Drafting: a sweater's finished measurements become the outline of each
 * flat piece, in cm. x is measured from the piece's centre line, y up from
 * its cast-on edge. Pieces are symmetric; the outline is a closed polygon
 * whose horizontal slices are the rows' live widths (two slices above a
 * crew neck's split).
 */

export type Silhouette = SweaterObject['silhouette'];
export type Measurements = SweaterObject['measurements'];
export type PieceId = 'back' | 'front' | 'sleeve' | 'neckband';

export interface Point { x: number; y: number }

export interface DraftPiece {
  id: PieceId;
  name: string;
  /** How many of this piece the sweater needs (two sleeves from one program). */
  copies: number;
  /** Closed outline, counter-clockwise from the bottom left. */
  outline: Point[];
  /** Height of the rib at the bottom edge, cm. */
  bottomRibCm: number;
  /** Height of a rib border at the top edge (a boat neck), cm; 0 for none. */
  topRibCm: number;
  /** Every row is rib (the neckband). */
  allRib: boolean;
  /** Named edges for the schematic and the seam checks. */
  edges: Partial<Record<EdgeName, Point[]>>;
}

export type EdgeName = 'hem' | 'side' | 'armhole' | 'shoulder' | 'neck' | 'top' | 'cuff' | 'underarm' | 'cap';

export interface SweaterDraft {
  pieces: DraftPiece[];
  /** Lengths that pieces are sewn along, cm, for the seam checks. */
  seams: {
    sideSeam: number;
    sleeveSeam: number;
    /** One armhole edge of the front (or back), underarm to shoulder point. */
    armhole: number;
    /** One side of the sleeve top that sews into the armhole. */
    sleeveTop: number;
    /** The whole neck opening: front and back neck edges. */
    neckline: number;
  };
  /** Heights that the measurements are taken between, cm above the cast-on edge. */
  levels: { underarm: number; shoulderPoint: number; top: number; sleeveUnderarm: number };
  /** The body and sleeve edges the pieces were drafted from: the style's, or the knitter's own. */
  edges: { body: ShapePoint[]; sleeve: ShapePoint[] };
  /** Derived drafting values, each with how it was found. */
  derived: { label: string; cm: number; how: string }[];
}

export const SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL'] as const;
export type Size = (typeof SIZES)[number];
export const FITS = ['fitted', 'classic', 'relaxed', 'oversized'] as const;
export type Fit = (typeof FITS)[number];

/** Body measurements (not the garment) per size, cm: a unisex adult chart. */
const BODY: Record<Size, { chest: number; length: number; sleeve: number; upperArm: number; wrist: number; armhole: number; shoulder: number; neck: number; neckDepth: number }> = {
  XS: { chest: 84, length: 60, sleeve: 44, upperArm: 26, wrist: 15, armhole: 18, shoulder: 36, neck: 16, neckDepth: 7 },
  S: { chest: 92, length: 62, sleeve: 45, upperArm: 28, wrist: 16, armhole: 19, shoulder: 38, neck: 17, neckDepth: 7 },
  M: { chest: 100, length: 64, sleeve: 46, upperArm: 30, wrist: 17, armhole: 20, shoulder: 40, neck: 18, neckDepth: 8 },
  L: { chest: 108, length: 66, sleeve: 47, upperArm: 32, wrist: 17, armhole: 21, shoulder: 42, neck: 18, neckDepth: 8 },
  XL: { chest: 116, length: 68, sleeve: 48, upperArm: 35, wrist: 18, armhole: 22, shoulder: 44, neck: 19, neckDepth: 8.5 },
  XXL: { chest: 124, length: 70, sleeve: 48, upperArm: 38, wrist: 19, armhole: 23, shoulder: 46, neck: 20, neckDepth: 9 },
};

/** Chest ease per fit, cm; the upper arm gets about half. */
const EASE: Record<Fit, number> = { fitted: 4, classic: 10, relaxed: 20, oversized: 32 };

/** J-sleeve: how far the armhole steps in from the side, cm. */
export const J_SLEEVE_STEP_CM = 3;

const round1 = (value: number) => Math.round(value * 10) / 10;

/** How much deeper than a crew neck each neckline dips at the front. */
const FRONT_NECK_DEPTH: Record<SweaterObject['neckline'], number> = { crew: 1, v: 2.2, square: 1.25, boat: 1 };

/** The garment's finished measurements for a standard size and fit. */
export function defaultMeasurements(size: Size, fit: Fit, silhouette: Silhouette, neckline: SweaterObject['neckline'] = 'crew'): Measurements {
  const body = BODY[size];
  const chest = body.chest + EASE[fit];
  const width = chest / 2;
  const upperArm = body.upperArm + Math.max(4, EASE[fit] * 0.6);
  const setIn = {
    chest,
    length: body.length + (fit === 'oversized' ? 4 : fit === 'relaxed' ? 2 : 0),
    sleeveLength: body.sleeve,
    upperArm,
    cuff: body.wrist + 4,
    armholeDepth: body.armhole + EASE[fit] * 0.1,
    shoulderWidth: Math.min(width, body.shoulder + EASE[fit] * 0.15),
    neckWidth: body.neck,
    frontNeckDepth: body.neckDepth * FRONT_NECK_DEPTH[neckline],
    backNeckDepth: 2,
    shoulderDrop: 2,
  };
  if (silhouette === 'set-in') return roundMeasurements(setIn);
  // Drop shoulder and J-sleeve: the shoulder seam sits out on the arm, so the
  // sleeve is shorter by the drop and its top is as wide as both armhole edges.
  const shoulderWidth = silhouette === 'j-sleeve' ? width - 2 * J_SLEEVE_STEP_CM : width;
  const drop = (shoulderWidth - setIn.shoulderWidth) / 2;
  const armholeDepth = Math.max(setIn.armholeDepth + 2, upperArm / 2 + (silhouette === 'j-sleeve' ? 1 : 0));
  return roundMeasurements({
    ...setIn,
    sleeveLength: Math.max(20, setIn.sleeveLength - drop),
    // The sleeve top sews along the front and back armhole edges.
    upperArm: armholeDepth * 2,
    armholeDepth,
    shoulderWidth,
    shoulderDrop: 1.5,
  });
}

/** The size and fit a size label names, when it names a standard one. */
export function parseSize(label: string | undefined): { size: Size | null; fit: Fit | null } {
  const [size, fit] = (label ?? '').split(' ');
  return { size: (SIZES as readonly string[]).includes(size ?? '') ? size as Size : null, fit: (FITS as readonly string[]).includes(fit ?? '') ? fit as Fit : null };
}

/**
 * Changes the neckline. A front neck depth still at the old neckline's
 * standard value moves to the new one's (a V dips further than a crew); one
 * the knitter typed is kept.
 */
export function withNeckline(object: SweaterObject, neckline: SweaterObject['neckline']): SweaterObject {
  const { size, fit } = parseSize(object.size);
  if (size === null || fit === null) return { ...object, neckline };
  const standard = defaultMeasurements(size, fit, object.silhouette, object.neckline).frontNeckDepth;
  if (Math.abs(object.measurements.frontNeckDepth - standard) > 0.05) return { ...object, neckline };
  return { ...object, neckline, measurements: { ...object.measurements, frontNeckDepth: defaultMeasurements(size, fit, object.silhouette, neckline).frontNeckDepth } };
}

function roundMeasurements(m: Measurements): Measurements {
  return Object.fromEntries(Object.entries(m).map(([key, value]) => [key, round1(value as number)])) as unknown as Measurements;
}

/** Samples a cubic Bézier from p0 to p3. */
function bezier(p0: Point, p1: Point, p2: Point, p3: Point, steps = 24): Point[] {
  const out: Point[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const u = 1 - t;
    out.push({
      x: u * u * u * p0.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * p3.x,
      y: u * u * u * p0.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t * t * t * p3.y,
    });
  }
  return out;
}

export function polylineLength(points: readonly Point[]): number {
  let length = 0;
  for (let i = 1; i < points.length; i++) length += Math.hypot(points[i]!.x - points[i - 1]!.x, points[i]!.y - points[i - 1]!.y);
  return length;
}

/**
 * One edge of a piece's right half, as key points from the bottom up: x cm
 * from the centre line, y cm above the cast-on. Each point says how the edge
 * arrives at it from the point before: straight, `concave` (setting off
 * across, arriving upright: an armhole) or `convex` (setting off upright,
 * arriving across: the top of a sleeve cap). `underarm` marks where the
 * armhole (or the sleeve cap) starts.
 */
export type ShapePoint = SweaterShapePoint;
export type EdgeKind = 'body' | 'sleeve';

/** The edge as a polyline, curves sampled. */
export function sampleEdge(points: readonly ShapePoint[]): Point[] {
  const out: Point[] = points.length > 0 ? [{ x: points[0]!.x, y: points[0]!.y }] : [];
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1]!;
    const cur = points[i]!;
    if (cur.curve === 'concave') out.push(...bezier(prev, { x: prev.x + (cur.x - prev.x) * 0.55, y: prev.y }, { x: cur.x, y: prev.y + (cur.y - prev.y) * 0.45 }, cur, 16).slice(1));
    else if (cur.curve === 'convex') out.push(...bezier(prev, { x: prev.x, y: prev.y + (cur.y - prev.y) * 0.55 }, { x: prev.x + (cur.x - prev.x) * 0.45, y: cur.y }, cur, 12).slice(1));
    else out.push({ x: cur.x, y: cur.y });
  }
  return out;
}

/** Why an edge cannot be knitted from the bottom up, or null. */
export function edgeProblem(points: readonly ShapePoint[], kind: EdgeKind): string | null {
  const name = kind === 'body' ? 'The body edge' : 'The sleeve edge';
  if (points.length < 2) return `${name} needs at least two points.`;
  if (points[0]!.y !== 0) return `${name} must start at the cast-on (height 0).`;
  for (let i = 1; i < points.length; i++) if (points[i]!.y < points[i - 1]!.y) return `${name} goes down between point ${i} and point ${i + 1}; a knitted edge only rises.`;
  if (points.some((point) => point.x < 1)) return `${name} comes within 1 cm of the centre line.`;
  const underarm = points.filter((point) => point.underarm).length;
  if (underarm !== 1) return `${name} needs exactly one underarm point (it has ${underarm}).`;
  if (kind === 'body' && points[0]!.underarm) return 'The body’s underarm cannot be at the hem.';
  return null;
}

/** A neck edge from the neck point (half width at the top) down to the centre front, flat at the bottom. */
function neckCurve(halfWidth: number, top: number, depth: number, flatFraction: number): Point[] {
  if (depth <= 0) return [{ x: halfWidth, y: top }, { x: 0, y: top }];
  const flat = halfWidth * flatFraction;
  const steps = 20;
  const out: Point[] = [];
  // Near-vertical at the neck point, widening quickly toward the flat bottom.
  for (let i = 0; i <= steps; i++) {
    const t = 1 - i / steps;
    out.push({ x: flat + (halfWidth - flat) * Math.sin((Math.PI / 2) * t), y: top - depth + depth * t });
  }
  out.push({ x: 0, y: top - depth });
  return out;
}

/** Mirrors a right half (from the centre bottom, counter-clockwise to the centre top) into a closed outline. */
function mirror(right: Point[]): Point[] {
  const left = right.slice(1, -1).reverse().map((p) => ({ x: -p.x, y: p.y }));
  return [...right, ...left];
}

/** A shaped neck finished with a separate rib neckband (all but the boat neck). */
export const hasNeckband = (neckline: SweaterObject['neckline']) => neckline !== 'boat';

/** The front neck edge, from the neck point down to the centre. */
function frontNeckEdge(neckline: SweaterObject['neckline'], halfWidth: number, top: number, depth: number): Point[] {
  if (neckline === 'v') return [{ x: halfWidth, y: top }, { x: 0, y: top - depth }];
  if (neckline === 'square') return [{ x: halfWidth, y: top }, { x: halfWidth, y: top - depth }, { x: 0, y: top - depth }];
  return neckCurve(halfWidth, top, depth, 0.4);
}

const shoulderDropOf = (object: SweaterObject) => (object.neckline === 'boat' ? 0 : Math.max(0, object.measurements.shoulderDrop ?? (object.silhouette === 'set-in' ? 2 : 1.5)));

/** The style's body edge from the measurements: side seam, armhole and the shoulder point. */
export function templateBodyEdge(object: SweaterObject): ShapePoint[] {
  const m = object.measurements;
  const side = m.chest / 4;
  const shoulderWidth = object.silhouette === 'drop-shoulder' ? m.chest / 2 : Math.min(m.chest / 2, m.shoulderWidth);
  const shoulderPoint = m.length - shoulderDropOf(object);
  const underarm = Math.max(object.trims.hem.cm + 5, shoulderPoint - m.armholeDepth);
  const inset = Math.max(0, side - shoulderWidth / 2);
  if (object.silhouette === 'drop-shoulder' || inset < 0.5) return [{ x: side, y: 0 }, { x: side, y: underarm, underarm: true }, { x: side, y: shoulderPoint }];
  // A bind-off at the underarm, then a curve into the straight armhole.
  const bindOff = inset * (object.silhouette === 'j-sleeve' ? 0.6 : 0.4);
  const curveHeight = object.silhouette === 'j-sleeve' ? inset : Math.min((shoulderPoint - underarm) * 0.4, inset * 1.6);
  return [
    { x: side, y: 0 },
    { x: side, y: underarm, underarm: true },
    { x: side - bindOff, y: underarm },
    { x: shoulderWidth / 2, y: underarm + curveHeight, curve: 'concave' },
    { x: shoulderWidth / 2, y: shoulderPoint },
  ];
}

/**
 * The style's sleeve edge: cuff rib, a taper to the upper arm 4 cm below the
 * underarm, then the top. The top is fitted to the body's actual armhole
 * (its own, or the one the knitter shaped): flat for a drop shoulder, the
 * armhole's step and curve under a flat top for a J-sleeve, and for a set-in
 * sleeve the step, a short curve, a slope and a rounded top, the slope's
 * height fitted so one cap edge matches one armhole edge (at most 80% of the
 * armhole depth).
 */
export function templateSleeveEdge(object: SweaterObject, body: readonly ShapePoint[]): { edge: ShapePoint[]; derived: SweaterDraft['derived'] } {
  const m = object.measurements;
  const cuffHalf = m.cuff / 2;
  const armHalf = Math.max(cuffHalf, m.upperArm / 2);
  const sleeveUnderarm = Math.max(object.trims.cuff.cm + 6, m.sleeveLength);
  const taperEnd = Math.max(object.trims.cuff.cm + 2, sleeveUnderarm - 4);
  const base: ShapePoint[] = [
    { x: cuffHalf, y: 0 },
    { x: cuffHalf, y: object.trims.cuff.cm },
    ...(armHalf - cuffHalf > 0.05 ? [{ x: armHalf, y: taperEnd }] : []),
    { x: armHalf, y: sleeveUnderarm, underarm: true },
  ];
  const at = body.findIndex((point) => point.underarm);
  const armhole = body.slice(Math.max(0, at));
  const underarm = armhole[0]!;
  const last = armhole.at(-1)!;
  const inset = underarm.x - last.x;
  if (object.silhouette === 'drop-shoulder' || inset < 0.5) {
    return { edge: base, derived: [{ label: 'Sleeve top width', cm: round1(armHalf * 2), how: 'the upper arm; it sews straight along both armhole edges' }] };
  }
  // The armhole's step and curve: the points after the underarm, without the straight run up to the shoulder.
  let curveEnd = armhole.length - 1;
  while (curveEnd > 1 && Math.abs(armhole[curveEnd - 1]!.x - last.x) < 1e-6) curveEnd--;
  const shaped = armhole.slice(1, curveEnd + 1);
  const map = (point: ShapePoint): ShapePoint => ({ x: armHalf - (underarm.x - point.x), y: sleeveUnderarm + (point.y - underarm.y), ...(point.curve ? { curve: point.curve } : {}) });
  if (object.silhouette === 'j-sleeve') {
    const edge = [...base, ...shaped.map(map)];
    const straight = last.y - (shaped.at(-1)?.y ?? underarm.y);
    return { edge, derived: [{ label: 'Sleeve top width', cm: round1(edge.at(-1)!.x * 2), how: `sews along the straight armhole edges (${round1(straight * 2)} cm front and back)` }] };
  }
  const armholeLength = polylineLength(sampleEdge(armhole));
  const bindOff = shaped[0] && Math.abs(shaped[0].y - underarm.y) < 1e-6 ? underarm.x - shaped[0].x : 0;
  const topHalf = Math.max(2.5, m.upperArm * 0.12);
  const capStart: ShapePoint = { x: armHalf - bindOff, y: sleeveUnderarm };
  const curveInset = Math.max(0.5, Math.min(capStart.x - topHalf - 1, inset - bindOff));
  const underCurveHeight = Math.min(3, curveInset);
  const curveTop: ShapePoint = { x: capStart.x - curveInset, y: capStart.y + underCurveHeight, curve: 'concave' };
  const round = Math.min(2, Math.max(0.5, (curveTop.x - topHalf) / 3));
  const capFor = (slope: number): ShapePoint[] => [capStart, curveTop, { x: topHalf + round, y: curveTop.y + slope }, { x: topHalf, y: curveTop.y + slope + round, curve: 'convex' }];
  const wanted = armholeLength + 0.5;
  // The cap's height limit follows the armhole actually drafted (the measurement, unless the knitter shaped it).
  const armholeDepth = last.y - underarm.y;
  const maxSlope = Math.max(0.5, armholeDepth * 0.8 - underCurveHeight - round);
  let lo = 0;
  let hi = maxSlope;
  const capLength = (slope: number) => bindOff + polylineLength(sampleEdge([capStart, ...capFor(slope).slice(1)]));
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (capLength(mid) < wanted) lo = mid; else hi = mid;
  }
  const cap = capFor(hi);
  const edge = [...base, ...(bindOff > 0 ? [cap[0]!] : []), ...cap.slice(1)];
  return { edge, derived: [{ label: 'Sleeve cap height', cm: round1(edge.at(-1)!.y - sleeveUnderarm), how: `the armhole's bind-off and curve, then a slope fitted so the cap edge (${round1(capLength(hi))} cm) matches the armhole edge (${round1(armholeLength)} cm), at most 80% of the armhole depth` }] };
}

/** Draft every piece of the sweater: the style's edges from the measurements, or the knitter's own shapes. */
export function draftSweater(object: SweaterObject): SweaterDraft {
  const m = object.measurements;
  const { neckline } = object;
  const bodyEdge = object.shapes?.body ?? templateBodyEdge(object);
  const sleeveTemplate = templateSleeveEdge(object, bodyEdge);
  const sleeveEdge = object.shapes?.sleeve ?? sleeveTemplate.edge;
  const derived: SweaterDraft['derived'] = object.shapes?.sleeve ? [] : [...sleeveTemplate.derived];
  const bodyPoints = sampleEdge(bodyEdge);
  const shoulder = bodyEdge.at(-1)!;
  const shoulderPoint = shoulder.y;
  const top = shoulderPoint + shoulderDropOf(object);
  const underarmPoint = bodyEdge.find((point) => point.underarm) ?? bodyEdge[0]!;
  const underarm = underarmPoint.y;
  const width = bodyEdge[0]!.x * 2;
  const neckHalf = Math.max(1, Math.min(m.neckWidth / 2, shoulder.x - 4));
  const armhole = sampleEdge(bodyEdge.slice(bodyEdge.indexOf(underarmPoint)));
  const shoulderLine = [{ x: shoulder.x, y: shoulderPoint }, { x: neckHalf, y: top }];
  const banded = hasNeckband(neckline);
  const bodyPiece = (id: 'back' | 'front', neckDepth: number): DraftPiece => {
    // The back neck is a shallow curve whatever the front's shape.
    const neck = !banded ? [{ x: shoulder.x, y: top }, { x: 0, y: top }] : id === 'back' ? neckCurve(neckHalf, top, neckDepth, 0.7) : frontNeckEdge(neckline, neckHalf, top, neckDepth);
    const right: Point[] = [
      { x: 0, y: 0 },
      ...bodyPoints,
      ...(banded ? [...shoulderLine.slice(1), ...neck.slice(1)] : neck),
    ];
    return {
      id,
      name: id === 'back' ? 'Back' : 'Front',
      copies: 1,
      outline: mirror(dedupe(right)),
      bottomRibCm: object.trims.hem.cm,
      topRibCm: neckline === 'boat' ? object.trims.neck.cm : 0,
      allRib: false,
      edges: {
        hem: [{ x: -width / 2, y: 0 }, { x: width / 2, y: 0 }],
        side: sampleEdge(bodyEdge.slice(0, bodyEdge.indexOf(underarmPoint) + 1)),
        armhole,
        ...(banded ? { shoulder: shoulderLine, neck } : { top: [{ x: -shoulder.x, y: top }, { x: shoulder.x, y: top }] }),
      },
    };
  };
  const back = bodyPiece('back', Math.min(m.backNeckDepth, m.frontNeckDepth));
  const front = bodyPiece('front', m.frontNeckDepth);

  const sleevePoints = sampleEdge(sleeveEdge);
  const sleeveUnderarmPoint = sleeveEdge.find((point) => point.underarm) ?? sleeveEdge.at(-1)!;
  const sleeveUnderarm = sleeveUnderarmPoint.y;
  const sleeveTopCorner = sleeveEdge.at(-1)!;
  const cap = sampleEdge(sleeveEdge.slice(sleeveEdge.indexOf(sleeveUnderarmPoint)));
  // A J-sleeve's or drop shoulder's flat top sews along the straight armhole too.
  const sleeveTopLength = polylineLength(cap) + (object.silhouette === 'set-in' ? 0 : sleeveTopCorner.x);
  const cuffHalf = sleeveEdge[0]!.x;
  const sleeve: DraftPiece = {
    id: 'sleeve',
    name: 'Sleeve',
    copies: 2,
    outline: mirror(dedupe([{ x: 0, y: 0 }, ...sleevePoints, { x: 0, y: sleeveTopCorner.y }])),
    bottomRibCm: object.trims.cuff.cm,
    topRibCm: 0,
    allRib: false,
    edges: {
      cuff: [{ x: -cuffHalf, y: 0 }, { x: cuffHalf, y: 0 }],
      underarm: sampleEdge(sleeveEdge.slice(0, sleeveEdge.indexOf(sleeveUnderarmPoint) + 1)),
      cap: [...cap, { x: 0, y: sleeveTopCorner.y }],
    },
  };

  const pieces: DraftPiece[] = [back, front, sleeve];
  const frontNeck = banded ? 2 * polylineLength(front.edges.neck!) : 0;
  const backNeck = banded ? 2 * polylineLength(back.edges.neck!) : 0;
  const neckOpening = frontNeck + backNeck;
  if (banded) {
    // The band is a little shorter than the opening so it sits flat; it is knitted as a strip and sewn on.
    const bandLength = neckOpening * 0.9;
    const bandHeight = Math.max(1, object.trims.neck.cm);
    pieces.push({
      id: 'neckband',
      name: 'Neckband',
      copies: 1,
      outline: [{ x: -bandLength / 2, y: 0 }, { x: bandLength / 2, y: 0 }, { x: bandLength / 2, y: bandHeight }, { x: -bandLength / 2, y: bandHeight }],
      bottomRibCm: bandHeight,
      topRibCm: 0,
      allRib: true,
      edges: { hem: [{ x: -bandLength / 2, y: 0 }, { x: bandLength / 2, y: 0 }] },
    });
    derived.push({ label: 'Neckband length', cm: round1(bandLength), how: `90% of the neck opening (${round1(neckOpening)} cm) so it sits flat` });
  }
  derived.unshift(
    { label: 'Body width', cm: round1(width), how: object.shapes?.body ? 'from your body shape' : 'half the chest' },
    { label: 'Underarm height', cm: round1(underarm), how: object.shapes?.body ? 'from your body shape' : 'length − shoulder drop − armhole depth' },
  );
  return {
    pieces,
    seams: {
      sideSeam: underarm,
      sleeveSeam: sleeveUnderarm,
      armhole: polylineLength(armhole),
      sleeveTop: sleeveTopLength,
      neckline: neckOpening,
    },
    levels: { underarm, shoulderPoint, top, sleeveUnderarm },
    edges: { body: bodyEdge, sleeve: sleeveEdge },
    derived,
  };
}

function dedupe(points: Point[]): Point[] {
  return points.filter((p, i) => i === 0 || Math.hypot(p.x - points[i - 1]!.x, p.y - points[i - 1]!.y) > 1e-6);
}
