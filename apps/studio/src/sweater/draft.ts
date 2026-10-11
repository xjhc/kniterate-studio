import type { SweaterObject } from '@kniterate-studio/project-contract';

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

/** The garment's finished measurements for a standard size and fit. */
export function defaultMeasurements(size: Size, fit: Fit, silhouette: Silhouette): Measurements {
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
    frontNeckDepth: body.neckDepth,
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

/** The armhole edge of a body piece, from the underarm at the side to the shoulder point. */
function armholeEdge(silhouette: Silhouette, width: number, shoulderWidth: number, underarm: number, shoulderPoint: number): Point[] {
  const side = width / 2;
  const inset = Math.max(0, side - shoulderWidth / 2);
  if (silhouette === 'drop-shoulder' || inset < 0.5) return [{ x: side, y: underarm }, { x: side, y: shoulderPoint }];
  // A bind-off at the underarm, then a curve into the straight armhole.
  const bindOff = inset * (silhouette === 'j-sleeve' ? 0.6 : 0.4);
  const curveHeight = silhouette === 'j-sleeve' ? inset : Math.min((shoulderPoint - underarm) * 0.4, inset * 1.6);
  const start = { x: side - bindOff, y: underarm };
  const end = { x: shoulderWidth / 2, y: underarm + curveHeight };
  const curve = bezier(start, { x: start.x - (start.x - end.x) * 0.55, y: underarm }, { x: end.x, y: underarm + curveHeight * 0.45 }, end, 16);
  return [{ x: side, y: underarm }, ...curve, { x: end.x, y: shoulderPoint }];
}

/** Draft every piece of the sweater from its finished measurements. */
export function draftSweater(object: SweaterObject): SweaterDraft {
  const m = object.measurements;
  const { silhouette, neckline } = object;
  const width = m.chest / 2;
  const shoulderWidth = silhouette === 'drop-shoulder' ? width : Math.min(width, m.shoulderWidth);
  const drop = neckline === 'boat' ? 0 : Math.max(0, m.shoulderDrop ?? (silhouette === 'set-in' ? 2 : 1.5));
  const top = m.length;
  const shoulderPoint = top - drop;
  const underarm = Math.max(object.trims.hem.cm + 5, shoulderPoint - m.armholeDepth);
  const neckHalf = Math.min(m.neckWidth / 2, shoulderWidth / 2 - 4);
  const derived: SweaterDraft['derived'] = [];

  const armhole = armholeEdge(silhouette, width, shoulderWidth, underarm, shoulderPoint);
  const shoulderLine = [{ x: shoulderWidth / 2, y: shoulderPoint }, { x: neckHalf, y: top }];
  const bodyPiece = (id: 'back' | 'front', neckDepth: number, flat: number): DraftPiece => {
    const neck = neckline === 'crew' ? neckCurve(neckHalf, top, neckDepth, flat) : [{ x: shoulderWidth / 2, y: top }, { x: 0, y: top }];
    const right: Point[] = [
      { x: 0, y: 0 },
      { x: width / 2, y: 0 },
      ...armhole,
      ...(neckline === 'crew' ? [...shoulderLine.slice(1), ...neck.slice(1)] : neck),
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
        side: [{ x: width / 2, y: 0 }, { x: width / 2, y: underarm }],
        armhole,
        ...(neckline === 'crew' ? { shoulder: shoulderLine, neck } : { top: [{ x: -shoulderWidth / 2, y: top }, { x: shoulderWidth / 2, y: top }] }),
      },
    };
  };
  const back = bodyPiece('back', Math.min(m.backNeckDepth, m.frontNeckDepth), 0.7);
  const front = bodyPiece('front', m.frontNeckDepth, 0.4);
  const armholeLength = polylineLength(armhole);

  // Sleeve: cuff rib, a straight taper to the upper arm 4 cm below the underarm, then the top.
  const cuffHalf = m.cuff / 2;
  const armHalf = Math.max(cuffHalf, m.upperArm / 2);
  const sleeveUnderarm = Math.max(object.trims.cuff.cm + 6, m.sleeveLength);
  const taperEnd = Math.max(object.trims.cuff.cm + 2, sleeveUnderarm - 4);
  const bodyInset = width / 2 - shoulderWidth / 2;
  let sleeveTop: Point[];
  let sleeveTopLength: number;
  if (silhouette === 'drop-shoulder' || bodyInset < 0.5) {
    sleeveTop = [{ x: armHalf, y: sleeveUnderarm }, { x: 0, y: sleeveUnderarm }];
    sleeveTopLength = armHalf;
    derived.push({ label: 'Sleeve top width', cm: round1(armHalf * 2), how: 'the upper arm; it sews straight along both armhole edges' });
  } else {
    // The cap starts with the armhole's underarm bind-off. A J-sleeve's cap
    // mirrors its short armhole curve under a flat top; a set-in cap curves
    // in, then slopes to a rounded top, with the slope's height fitted so one
    // cap edge matches one armhole edge.
    const bindOff = armhole[0]!.x - armhole[1]!.x;
    if (silhouette === 'j-sleeve') {
      const curve = armhole.slice(1, -1).map((p) => ({ x: armHalf - (armhole[0]!.x - p.x), y: sleeveUnderarm + (p.y - underarm) }));
      const curveEnd = curve.at(-1)!;
      const straightArmhole = shoulderPoint - armhole.at(-2)!.y;
      const capCurveLength = bindOff + polylineLength(curve);
      // The flat top sews along the straight part of both armhole edges.
      sleeveTop = [{ x: armHalf, y: sleeveUnderarm }, ...curve, { x: 0, y: curveEnd.y }];
      sleeveTopLength = capCurveLength + curveEnd.x;
      derived.push({ label: 'Sleeve top width', cm: round1(curveEnd.x * 2), how: `sews along the straight armhole edges (${round1(straightArmhole * 2)} cm front and back)` });
    } else {
      const topHalf = Math.max(2.5, m.upperArm * 0.12);
      // A short underarm curve (the rest of the armhole's inset), then the slope.
      const capStart = { x: armHalf - bindOff, y: sleeveUnderarm };
      const inset = Math.max(0.5, Math.min(capStart.x - topHalf - 1, armhole[0]!.x - shoulderWidth / 2 - bindOff));
      const underCurveHeight = Math.min(3, inset);
      const underCurve = bezier(capStart, { x: capStart.x - inset * 0.6, y: capStart.y }, { x: capStart.x - inset, y: capStart.y + underCurveHeight * 0.4 }, { x: capStart.x - inset, y: capStart.y + underCurveHeight }, 10);
      const curveTop = underCurve.at(-1)!;
      const round = Math.min(2, Math.max(0.5, (curveTop.x - topHalf) / 3));
      const capFor = (slope: number): Point[] => {
        const slopeEnd = { x: topHalf + round, y: curveTop.y + slope };
        const arc = Array.from({ length: 9 }, (_, i) => {
          const angle = (Math.PI / 2) * (i / 8);
          return { x: topHalf + round * Math.cos(angle), y: slopeEnd.y + round * Math.sin(angle) };
        });
        return [...underCurve, slopeEnd, ...arc.slice(1)];
      };
      const wanted = armholeLength + 0.5;
      const maxSlope = Math.max(0.5, m.armholeDepth * 0.8 - underCurveHeight - round);
      let lo = 0;
      let hi = maxSlope;
      for (let i = 0; i < 40; i++) {
        const mid = (lo + hi) / 2;
        if (bindOff + polylineLength(capFor(mid)) < wanted) lo = mid; else hi = mid;
      }
      const cap = capFor(hi);
      const capTop = cap.at(-1)!;
      sleeveTop = [{ x: armHalf, y: sleeveUnderarm }, ...cap, { x: 0, y: capTop.y }];
      sleeveTopLength = bindOff + polylineLength(cap);
      derived.push({ label: 'Sleeve cap height', cm: round1(capTop.y - sleeveUnderarm), how: `the armhole's bind-off and curve, then a slope fitted so the cap edge (${round1(sleeveTopLength)} cm) matches the armhole edge (${round1(armholeLength)} cm), at most 80% of the armhole depth` });
    }
  }
  const sleeveRight: Point[] = [
    { x: 0, y: 0 },
    { x: cuffHalf, y: 0 },
    { x: cuffHalf, y: object.trims.cuff.cm },
    { x: armHalf, y: taperEnd },
    ...sleeveTop,
  ];
  const sleeve: DraftPiece = {
    id: 'sleeve',
    name: 'Sleeve',
    copies: 2,
    outline: mirror(dedupe(sleeveRight)),
    bottomRibCm: object.trims.cuff.cm,
    topRibCm: 0,
    allRib: false,
    edges: {
      cuff: [{ x: -cuffHalf, y: 0 }, { x: cuffHalf, y: 0 }],
      underarm: [{ x: cuffHalf, y: 0 }, { x: cuffHalf, y: object.trims.cuff.cm }, { x: armHalf, y: taperEnd }, { x: armHalf, y: sleeveUnderarm }],
      cap: sleeveTop,
    },
  };

  const pieces: DraftPiece[] = [back, front, sleeve];
  const frontNeck = neckline === 'crew' ? 2 * polylineLength(front.edges.neck!) : 0;
  const backNeck = neckline === 'crew' ? 2 * polylineLength(back.edges.neck!) : 0;
  const neckOpening = frontNeck + backNeck;
  if (neckline === 'crew') {
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
    { label: 'Body width', cm: round1(width), how: 'half the chest' },
    { label: 'Underarm height', cm: round1(underarm), how: 'length − shoulder drop − armhole depth' },
  );
  return {
    pieces,
    seams: {
      sideSeam: underarm,
      sleeveSeam: sleeveUnderarm,
      armhole: armholeLength,
      sleeveTop: sleeveTopLength,
      neckline: neckOpening,
    },
    levels: { underarm, shoulderPoint, top, sleeveUnderarm },
    derived,
  };
}

function dedupe(points: Point[]): Point[] {
  return points.filter((p, i) => i === 0 || Math.hypot(p.x - points[i - 1]!.x, p.y - points[i - 1]!.y) > 1e-6);
}
