/**
 * Beanie / toque emitter — a knit-in-the-round hat as a flat-bed tube.
 *
 * Reverse-engineered from `reference/fox-baby-beanie.kc` (colorwork tube,
 * gathered crown) and `reference/2x2-rib-beanie.kc` (ribbed brim, machine
 * crown decreases). Both are vendor-generated tubes that use the classic
 * *every-other-needle interleave*: the front face of the tube lives on one
 * needle parity, the back face on the other, so the carriage can knit a
 * whole face in one pass and the alternate (free) needles leave room for
 * transfers (rib + crown gathering).
 *
 * Coordinate model
 * ----------------
 *   - The tube circumference is `circumference` stitches (must be even).
 *   - faceWidth `W = circumference / 2` stitches per face.
 *   - Needle slots span [offset .. offset + circumference - 1].
 *   - FRONT face occupies front-bed needles at slots offset, offset+2, …
 *   - BACK  face occupies back-bed  needles at slots offset+1, offset+3, …
 *
 * A plain stockinette *round* is two passes — knit the front face left→
 * right on the front bed, then the back face right→left on the back bed —
 * so the yarn wraps both edges and closes the tube. No per-round transfers.
 *
 * Rib (brim)
 * ----------
 * A purl column on the front face is simply transferred to the back bed at
 * the SAME slot (free, because the back face uses the other parity) and
 * knit there; symmetric for the back face onto the free front-bed needle.
 * 1×1 and 2×2 ribs are pure rack-0 transfers — no racking. At the brim→
 * body boundary the purl columns transfer home so the body is smooth.
 *
 * Crown
 * -----
 *   - 'gathered'  : knit the full-width tube to the top, run a draw thread,
 *                   release the carriers and leave the live loops on a
 *                   thread to cinch by hand (the fox-baby finish).
 *   - 'decrease'  : evenly distributed k2tog (racked stacking) over several
 *                   rounds, re-packing the survivors contiguous each round,
 *                   until each face is small; then gather (the 2x2-rib
 *                   finish, machine-shaped).
 *
 * The emitter returns a flat `KnitoutOp[]`; `buildBeanieProgram` wraps it
 * into a standalone `KnitoutProgram` ready for `writeKnitoutProgram` +
 * `knitoutToKCode`.
 */

import {
  f, b, knit, tuck, xfer, rack, comment, carrierIn, carrierOut,
  xStitchNumber, xXferStitchNumber, xSpeedNumber, xRollerAdvance,
  type KnitoutOp, type CarrierId, type KnitoutProgram,
} from '../types.js';
import { DEFAULT_KNITERATE_HEADERS, DRAW_THREAD_CARRIER, WASTE_YARN_CARRIER } from '../kniterate/constants.js';
import {
  emitTubeJacquardBodyOps,
  knitColourFace,
  tubeBackIsSolidBackground,
  type BeanieTubeJacquardBody,
  type TubeFaceGeometry,
} from './tube-fabric.js';

// The per-face tube jacquard body type lives with its emitter; re-export so the
// chart→tube adapter + tests can keep importing it from this module.
export type { BeanieTubeJacquardBody } from './tube-fabric.js';
import {
  emitCrownGatheredOps,
  emitCrownDecreaseOps,
  type CrownSpec,
  type CrownMachineContext,
} from './crown-machine.js';
// Crown spec + decrease clamp now live with the shared crown choreography
// (crown-machine.ts); re-export so existing consumers (beanie-readiness,
// toque/types, shells/crown) keep importing them from this module.
export type { CrownSpec };
export {
  effectiveDecreasesPerRound,
  DEFAULT_DECREASES_PER_ROUND,
  MAX_DECREASES_PER_ROUND,
} from './crown-machine.js';

export type BrimStyle = 'plain' | 'rib1x1' | 'rib2x2';

export interface StripeBand {
  carrier: CarrierId;
  rounds: number;
}

/**
 * Multi-colour jacquard body. `chart[round][col]` is a colour index into
 * `colors` (col 0..faceWidth-1, low→high across the front face); the same
 * row is mirrored onto the back face so the pattern wraps the tube. Each
 * colour knits its own needles in its own carriage pass and floats over the
 * others — inside the tube, so the floats are hidden. `chart.length` sets
 * the body round count (overrides `bodyRounds`). Every column in a row must
 * carry a colour (full coverage) so no needle is left unknit.
 */
export interface JacquardBody {
  chart: number[][];
  colors: CarrierId[];
  /**
   * Maximum consecutive skipped stitches a colour may float before the
   * yarn is caught with a tuck (on a needle the owning colour knits over,
   * securing it). Default 5 — standard fair-isle practice. Set to a large
   * number to disable securing (unsecured floats).
   */
  floatLimit?: number;
  /**
   * What the back face of the tube shows:
   *  - 'mirror' (default): the same chart as the front (pattern wraps).
   *  - 'background': solid colour 0, so a front-only motif (e.g. a logo)
   *    has a plain back.
   */
  backFace?: 'mirror' | 'background';
  /**
   * Where float-securing tucks land (front-only / 'background' backs only):
   *  - false (default): tuck on the front bed → the catch shows as a faint
   *    fleck of the floating colour on the front face.
   *  - true: tuck on the back face instead. The back is knit solid every round
   *    so the tuck is bound in and hidden on the *inside*, leaving the front
   *    face clean. (This is not full double-bed jacquard — the dominant
   *    colour's float still runs on the inside; it just isn't shown on the
   *    front.) Requires `backFace: 'background'`.
   */
  hideCatches?: boolean;
}

export interface MotifPlacement {
  /** Motif chart in bottom-up knit order, motif[round][col]. */
  motif: number[][];
  /** Full front width in stitches (>= motif width). Circumference = 2×faceWidth. */
  faceWidth: number;
  /** Total composed body rounds (>= motif height). Background fills the rest. */
  bodyRounds: number;
  /** Background colour index (default 0). */
  background?: number;
  /** Horizontal placement: 'center' (default) | 'left' | 'right' | explicit column. */
  hAlign?: 'center' | 'left' | 'right' | number;
  /** Vertical placement, rounds from the brim: 'center' (default) | 'top' (crown) | 'bottom' (brim) | explicit round. */
  vAlign?: 'center' | 'top' | 'bottom' | number;
}

function resolveAlign(
  a: 'center' | 'left' | 'right' | 'top' | 'bottom' | number,
  total: number,
  span: number,
): number {
  const slack = total - span;
  if (typeof a === 'number') return Math.max(0, Math.min(slack, Math.round(a)));
  if (a === 'left' || a === 'bottom') return 0;
  if (a === 'right' || a === 'top') return slack;
  return Math.floor(slack / 2);
}

/**
 * Pad a narrow motif into a full beanie-front chart so a logo sits at its
 * natural scale on an adult-width front instead of being stretched to fill it.
 * Returns chart[bodyRounds][faceWidth] with `background` everywhere the motif
 * doesn't cover. Feed the result as `JacquardBody.chart`.
 */
export function composeBeanieFront(p: MotifPlacement): number[][] {
  const bg = p.background ?? 0;
  const motifH = p.motif.length;
  const motifW = motifH > 0 ? Math.max(...p.motif.map((row) => row.length)) : 0;
  if (p.faceWidth < motifW) {
    throw new Error(`composeBeanieFront: faceWidth ${p.faceWidth} < motif width ${motifW}`);
  }
  if (p.bodyRounds < motifH) {
    throw new Error(`composeBeanieFront: bodyRounds ${p.bodyRounds} < motif height ${motifH}`);
  }
  const col = resolveAlign(p.hAlign ?? 'center', p.faceWidth, motifW);
  const row = resolveAlign(p.vAlign ?? 'center', p.bodyRounds, motifH);
  const out: number[][] = Array.from({ length: p.bodyRounds }, () =>
    Array.from({ length: p.faceWidth }, () => bg),
  );
  for (let mr = 0; mr < motifH; mr++) {
    const dest = out[row + mr]!;
    const src = p.motif[mr]!;
    for (let mc = 0; mc < src.length; mc++) dest[col + mc] = src[mc]!;
  }
  return out;
}

export interface BeanieSpec {
  /** Total stitches around the tube (even; split into two faces). */
  circumference: number;
  /** Plain body rounds knit after the brim, before the crown. */
  bodyRounds: number;
  /** Brim ribbing. */
  brim: { style: BrimStyle; rounds: number };
  /** Crown finish. */
  crown: CrownSpec;
  /** Optional stripe schedule for the body (cycled). Falls back to mainCarrier. */
  stripes?: StripeBand[];
  /** Optional multi-colour jacquard body (overrides stripes + bodyRounds). */
  jacquard?: JacquardBody;
  /** Optional per-face tube jacquard body (overrides stripes + bodyRounds).
   *  Mutually exclusive with `jacquard`; produced by the chart→tube adapter. */
  tubeJacquard?: BeanieTubeJacquardBody;
  /** Main body yarn carrier. Default '3'. */
  mainCarrier?: CarrierId;
  /** Waste yarn carrier. Default '6'. */
  wasteCarrier?: CarrierId;
  /** Draw-thread carrier (separator above waste). Default '1'. null = skip. */
  drawCarrier?: CarrierId | null;
  /** Leftmost needle slot. Default 50. */
  needleOffset?: number;
  /** Waste rounds knit before the body (roller takedown). Default 12. */
  wasteRounds?: number;
  /** Machine tuning. */
  stitchNumber?: number;
  ribStitchNumber?: number;
  speedNumber?: number;
  rollerAdvance?: number;
  xferSpeed?: number;
  xferStitchNumber?: number;
}

const D = {
  mainCarrier: '3' as CarrierId,
  needleOffset: 50,
  wasteRounds: 12,
  stitchNumber: DEFAULT_KNITERATE_HEADERS.stitchNumber!,
  ribStitchNumber: 5,
  speedNumber: DEFAULT_KNITERATE_HEADERS.speedNumber!,
  rollerAdvance: 450,
  xferSpeed: 60,
  xferStitchNumber: DEFAULT_KNITERATE_HEADERS.xferStitchNumber!,
} as const;

/** Resolved, defaulted spec + derived layout. */
interface Resolved {
  spec: Required<Omit<BeanieSpec, 'stripes' | 'jacquard' | 'tubeJacquard' | 'drawCarrier' | 'crown' | 'brim'>> & {
    stripes?: StripeBand[];
    jacquard?: JacquardBody;
    tubeJacquard?: BeanieTubeJacquardBody;
    drawCarrier: CarrierId | null;
    crown: CrownSpec;
    brim: { style: BrimStyle; rounds: number };
  };
  W: number;
  offset: number;
  knitSpeed: number;
  knitRoller: number;
  xferSpeed: number;
}

function resolve(spec: BeanieSpec): Resolved {
  if (spec.circumference % 2 !== 0) {
    throw new Error(`beanie circumference must be even (got ${spec.circumference})`);
  }
  if (spec.circumference < 8) {
    throw new Error(`beanie circumference too small (got ${spec.circumference})`);
  }
  const offset = spec.needleOffset ?? D.needleOffset;
  const lastSlot = offset + spec.circumference - 1;
  if (lastSlot > 252 || offset < 1) {
    throw new Error(`beanie needles ${offset}..${lastSlot} out of range 1..252`);
  }
  if (spec.crown.style === 'decrease') {
    const c = spec.crown;
    const posInt = (v: number | undefined, name: string) => {
      if (v !== undefined && (!Number.isInteger(v) || v < 1)) {
        throw new Error(`crown ${name} must be a positive integer (got ${v})`);
      }
    };
    posInt(c.decreasesPerRound, 'decreasesPerRound');
    posInt(c.minFaceStitches, 'minFaceStitches');
    // Each decrease round only transfers (k2tog); the knit that locks the
    // decreased loops in comes from the plain rounds. So plainRoundsBetween
    // must be ≥ 1 — with 0 the crown carrier is brought in and out without
    // ever stitching, which the vendor backend rejects. plainRoundsBetween 1
    // = decrease every row (tightest dome); 2 = decrease every other row.
    if (c.plainRoundsBetween !== undefined && (!Number.isInteger(c.plainRoundsBetween) || c.plainRoundsBetween < 1)) {
      throw new Error(`crown plainRoundsBetween must be a positive integer — the decrease round needs a knit to lock it in (got ${c.plainRoundsBetween})`);
    }
  }
  if (spec.jacquard) {
    const W = spec.circumference / 2;
    const fl = spec.jacquard.floatLimit;
    if (fl !== undefined && (!Number.isInteger(fl) || fl < 1)) {
      throw new Error(`jacquard floatLimit must be a positive integer (got ${fl})`);
    }
    if (spec.jacquard.hideCatches && (spec.jacquard.backFace ?? 'mirror') !== 'background') {
      throw new Error(`jacquard hideCatches needs backFace 'background' — a mirrored back is patterned, so catches can't hide there`);
    }
    spec.jacquard.chart.forEach((row, ri) => {
      if (row.length !== W) {
        throw new Error(`jacquard chart row ${ri} has ${row.length} columns, expected faceWidth ${W}`);
      }
      for (const ci of row) {
        if (!Number.isInteger(ci) || ci < 0 || ci >= spec.jacquard!.colors.length) {
          throw new Error(`jacquard chart row ${ri} has colour index ${ci} outside 0..${spec.jacquard!.colors.length - 1}`);
        }
      }
    });
  }
  if (spec.tubeJacquard) {
    if (spec.jacquard) throw new Error('beanie spec cannot set both jacquard and tubeJacquard');
    const W = spec.circumference / 2;
    const tj = spec.tubeJacquard;
    const fl = tj.floatLimit;
    if (fl !== undefined && (!Number.isInteger(fl) || fl < 1)) {
      throw new Error(`tubeJacquard floatLimit must be a positive integer (got ${fl})`);
    }
    if (tj.front.length !== tj.back.length) {
      throw new Error(`tubeJacquard front/back must have equal rounds (front ${tj.front.length}, back ${tj.back.length})`);
    }
    if (tj.front.length === 0) throw new Error('tubeJacquard must have at least one round');
    if (tj.hideCatches && !tubeBackIsSolidBackground(tj)) {
      throw new Error(`tubeJacquard hideCatches needs a solid (colour 0) back — a patterned back can't hide a catch`);
    }
    for (const [name, grid] of [['front', tj.front], ['back', tj.back]] as const) {
      grid.forEach((row, ri) => {
        if (row.length !== W) {
          throw new Error(`tubeJacquard ${name} row ${ri} has ${row.length} columns, expected faceWidth ${W}`);
        }
        for (const ci of row) {
          if (!Number.isInteger(ci) || ci < 0 || ci >= tj.colors.length) {
            throw new Error(`tubeJacquard ${name} row ${ri} has colour index ${ci} outside 0..${tj.colors.length - 1}`);
          }
        }
      });
    }
  }
  return {
    spec: {
      circumference: spec.circumference,
      bodyRounds: spec.bodyRounds,
      brim: spec.brim,
      crown: spec.crown,
      stripes: spec.stripes,
      jacquard: spec.jacquard,
      tubeJacquard: spec.tubeJacquard,
      mainCarrier: spec.mainCarrier ?? D.mainCarrier,
      wasteCarrier: spec.wasteCarrier ?? WASTE_YARN_CARRIER,
      drawCarrier: spec.drawCarrier === undefined ? DRAW_THREAD_CARRIER : spec.drawCarrier,
      needleOffset: offset,
      wasteRounds: spec.wasteRounds ?? D.wasteRounds,
      stitchNumber: spec.stitchNumber ?? D.stitchNumber,
      ribStitchNumber: spec.ribStitchNumber ?? D.ribStitchNumber,
      speedNumber: spec.speedNumber ?? D.speedNumber,
      rollerAdvance: spec.rollerAdvance ?? D.rollerAdvance,
      xferSpeed: spec.xferSpeed ?? D.xferSpeed,
      xferStitchNumber: spec.xferStitchNumber ?? D.xferStitchNumber,
    },
    W: spec.circumference / 2,
    offset,
    knitSpeed: spec.speedNumber ?? D.speedNumber,
    knitRoller: spec.rollerAdvance ?? D.rollerAdvance,
    xferSpeed: spec.xferSpeed ?? D.xferSpeed,
  };
}

/** Front-face slot for column i (0-based), low→high. */
const frontSlot = (r: Resolved, i: number): number => r.offset + 2 * i;
/** Back-face slot for column i (0-based), low→high. */
const backSlot = (r: Resolved, i: number): number => r.offset + 2 * i + 1;

/** The shared tube-fabric geometry for this resolved beanie (face width + slot
 *  maps), so the jacquard emitter is the same one the canvas tube lowering uses. */
const tubeGeo = (r: Resolved): TubeFaceGeometry => ({
  faceWidth: r.W,
  frontSlot: (i) => frontSlot(r, i),
  backSlot: (i) => backSlot(r, i),
});

/* --------------------------------------------------------------------- */
/* Waste + cast-on                                                        */
/* --------------------------------------------------------------------- */

/** Tubular cast-on: a tuck comb across both beds on the interleave, then a
 *  locking knit pass. Establishes loops the waste rounds knit on. */
function emitCastOn(r: Resolved, carrier: CarrierId, ops: KnitoutOp[]): void {
  const { W } = r;
  ops.push(comment('-- tube cast-on --'));
  ops.push(xStitchNumber(r.spec.stitchNumber));
  ops.push(xSpeedNumber(r.knitSpeed), xRollerAdvance(r.knitRoller), rack(0));
  // Tuck right→left across every slot on its home bed (zigzag comb).
  for (let i = W - 1; i >= 0; i--) {
    ops.push(tuck('-', b(backSlot(r, i)), carrier));
    ops.push(tuck('-', f(frontSlot(r, i)), carrier));
  }
  // Lock with a knit pass left→right.
  for (let i = 0; i < W; i++) {
    ops.push(knit('+', f(frontSlot(r, i)), carrier));
    ops.push(knit('+', b(backSlot(r, i)), carrier));
  }
}

/** One plain stockinette round: front face '+' then back face '-'. */
function knitPlainRound(r: Resolved, carrier: CarrierId, ops: KnitoutOp[]): void {
  ops.push(xSpeedNumber(r.knitSpeed), xRollerAdvance(r.knitRoller), rack(0));
  for (let i = 0; i < r.W; i++) ops.push(knit('+', f(frontSlot(r, i)), carrier));
  for (let i = r.W - 1; i >= 0; i--) ops.push(knit('-', b(backSlot(r, i)), carrier));
}

function emitWaste(r: Resolved, ops: KnitoutOp[]): void {
  const waste = r.spec.wasteCarrier;
  ops.push(comment('--- WASTE ---'));
  ops.push(carrierIn(waste));
  emitCastOn(r, waste, ops);
  for (let n = 0; n < r.spec.wasteRounds; n++) knitPlainRound(r, waste, ops);

  if (r.spec.drawCarrier) {
    const draw = r.spec.drawCarrier;
    ops.push(comment('-- draw thread (separator) --'));
    ops.push(carrierIn(draw));
    knitPlainRound(r, draw, ops);
    ops.push(carrierOut(draw));
  }
  ops.push(carrierOut(waste));
}

/* --------------------------------------------------------------------- */
/* Brim (rib)                                                             */
/* --------------------------------------------------------------------- */

/** Is front-face / back-face column `i` a purl column for the given rib? */
function isPurlColumn(style: BrimStyle, i: number): boolean {
  if (style === 'rib1x1') return i % 2 === 1;
  if (style === 'rib2x2') return Math.floor(i / 2) % 2 === 1;
  return false;
}

/** Move purl columns to their opposite (free) bed, or back home. */
function shiftPurlColumns(r: Resolved, style: BrimStyle, toPurl: boolean, ops: KnitoutOp[]): void {
  ops.push(xSpeedNumber(r.xferSpeed), xRollerAdvance(0), rack(0));
  ops.push(xXferStitchNumber(r.spec.xferStitchNumber));
  for (let i = 0; i < r.W; i++) {
    if (!isPurlColumn(style, i)) continue;
    const fs = frontSlot(r, i);
    const bs = backSlot(r, i);
    if (toPurl) {
      // front-face purl → onto free back needle at same slot; back-face
      // purl → onto free front needle at same slot. rack 0 (same slot).
      ops.push(xfer(f(fs), b(fs)));
      ops.push(xfer(b(bs), f(bs)));
    } else {
      ops.push(xfer(b(fs), f(fs)));
      ops.push(xfer(f(bs), b(bs)));
    }
  }
}

/** One rib round: knit every column on its current bed (front '+', back '-'). */
function knitRibRound(r: Resolved, style: BrimStyle, carrier: CarrierId, ops: KnitoutOp[]): void {
  ops.push(xStitchNumber(r.spec.ribStitchNumber));
  ops.push(xSpeedNumber(r.knitSpeed), xRollerAdvance(r.knitRoller), rack(0));
  // Front face, left→right: knit columns on front bed, purl columns on
  // the back bed (same slot).
  for (let i = 0; i < r.W; i++) {
    const fs = frontSlot(r, i);
    ops.push(knit('+', isPurlColumn(style, i) ? b(fs) : f(fs), carrier));
  }
  // Back face, right→left: knit columns on back bed, purl columns on front.
  for (let i = r.W - 1; i >= 0; i--) {
    const bs = backSlot(r, i);
    ops.push(knit('-', isPurlColumn(style, i) ? f(bs) : b(bs), carrier));
  }
  ops.push(xStitchNumber(r.spec.stitchNumber));
}

function emitBrim(r: Resolved, carrier: CarrierId, ops: KnitoutOp[]): void {
  const { style, rounds } = r.spec.brim;
  if (rounds <= 0 || style === 'plain') {
    for (let n = 0; n < rounds; n++) knitPlainRound(r, carrier, ops);
    return;
  }
  ops.push(comment(`--- BRIM ${style} (${rounds} rounds) ---`));
  shiftPurlColumns(r, style, true, ops);
  for (let n = 0; n < rounds; n++) knitRibRound(r, style, carrier, ops);
  ops.push(comment('-- rib → stockinette --'));
  shiftPurlColumns(r, style, false, ops);
}

/* --------------------------------------------------------------------- */
/* Body                                                                   */
/* --------------------------------------------------------------------- */

function emitBody(r: Resolved, ops: KnitoutOp[]): void {
  ops.push(comment(`--- BODY (${r.spec.bodyRounds} rounds) ---`));
  const stripes = r.spec.stripes;
  if (!stripes || stripes.length === 0) {
    if (r.spec.bodyRounds <= 0) return; // rib-throughout / no plain body
    ops.push(carrierIn(r.spec.mainCarrier));
    for (let n = 0; n < r.spec.bodyRounds; n++) knitPlainRound(r, r.spec.mainCarrier, ops);
    ops.push(carrierOut(r.spec.mainCarrier));
    return;
  }
  // Cycle the stripe schedule, bringing each carrier in on first use and
  // out on the last; only one carrier knits at a time (no floats).
  const active = new Set<CarrierId>();
  let knitRound = 0;
  let bandIdx = 0;
  let cur: CarrierId | null = null;
  while (knitRound < r.spec.bodyRounds) {
    const band = stripes[bandIdx % stripes.length]!;
    bandIdx++;
    if (band.rounds <= 0) continue;
    if (cur && cur !== band.carrier) {
      ops.push(carrierOut(cur));
      active.delete(cur);
    }
    if (!active.has(band.carrier)) {
      ops.push(carrierIn(band.carrier));
      active.add(band.carrier);
    }
    cur = band.carrier;
    for (let n = 0; n < band.rounds && knitRound < r.spec.bodyRounds; n++) {
      knitPlainRound(r, band.carrier, ops);
      knitRound++;
    }
  }
  for (const c of active) ops.push(carrierOut(c));
}

/**
 * Multi-colour jacquard body. Each row knits one carriage pass per colour
 * (front face '+', then mirrored back face '-'), so a colour floats over
 * the needles it doesn't own — on the inside of the tube. Carriers are
 * brought in lazily on first use and released at the end.
 */
function emitJacquardBody(r: Resolved, jac: JacquardBody, ops: KnitoutOp[]): void {
  ops.push(comment(`--- BODY jacquard (${jac.chart.length} rounds, ${jac.colors.length} colours) ---`));
  const floatLimit = jac.floatLimit ?? 5;
  const backMode = jac.backFace ?? 'mirror';
  const hideCatch = backMode === 'background' && !!jac.hideCatches;
  const bgCarrier = jac.colors[0]!;
  const active = new Set<CarrierId>();
  const ensureIn = (c: CarrierId) => { if (!active.has(c)) { ops.push(carrierIn(c)); active.add(c); } };
  for (const row of jac.chart) {
    // Distinct colours in this row, in first-appearance order.
    const order: number[] = [];
    for (const ci of row) if (!order.includes(ci)) order.push(ci);
    for (const ci of order) {
      const carrier = jac.colors[ci]!;
      ensureIn(carrier);
      ops.push(xStitchNumber(r.spec.stitchNumber));
      ops.push(xSpeedNumber(r.knitSpeed), xRollerAdvance(r.knitRoller), rack(0));
      knitColourFace(tubeGeo(r), row, ci, carrier, 'f', '+', floatLimit, ops, hideCatch);
      if (backMode === 'mirror') knitColourFace(tubeGeo(r), row, ci, carrier, 'b', '-', floatLimit, ops);
    }
    if (backMode === 'background') {
      // Solid back face in the background colour (front-only motif).
      ensureIn(bgCarrier);
      ops.push(xStitchNumber(r.spec.stitchNumber));
      ops.push(xSpeedNumber(r.knitSpeed), xRollerAdvance(r.knitRoller), rack(0));
      for (let i = r.W - 1; i >= 0; i--) ops.push(knit('-', b(backSlot(r, i)), bgCarrier));
    }
  }
  for (const c of active) ops.push(carrierOut(c));
}

/**
 * Per-face tube jacquard body — delegates to the shared topology-driven emitter
 * (`tube-fabric.ts`) so the standalone beanie and the canvas-driven tube
 * lowering produce byte-identical ops. The geometry + machine settings are the
 * only beanie-specific inputs.
 */
function emitTubeJacquardBody(r: Resolved, body: BeanieTubeJacquardBody, ops: KnitoutOp[]): void {
  ops.push(...emitTubeJacquardBodyOps(tubeGeo(r), body, {
    stitchNumber: r.spec.stitchNumber,
    speedNumber: r.knitSpeed,
    rollerAdvance: r.knitRoller,
  }));
}

/* --------------------------------------------------------------------- */
/* Crown                                                                  */
/* --------------------------------------------------------------------- */

/** Build the shared crown machine context from a resolved beanie. The slot
 *  formulas (offset + 2i / +1) match the tube topology, so the SAME crown
 *  choreography drives both the beanie CLI and the canvas tube/hat lowering. */
function crownCtx(r: Resolved): CrownMachineContext {
  return {
    faceWidth: r.W,
    frontSlot: (i) => frontSlot(r, i),
    backSlot: (i) => backSlot(r, i),
    mainCarrier: r.spec.mainCarrier,
    drawCarrier: r.spec.drawCarrier,
    knitSpeed: r.knitSpeed,
    knitRoller: r.knitRoller,
    xferSpeed: r.xferSpeed,
    xferStitchNumber: r.spec.xferStitchNumber,
  };
}

/** Gathered crown — delegates to the shared crown choreography. */
function emitCrownGathered(r: Resolved, ops: KnitoutOp[]): void {
  emitCrownGatheredOps(crownCtx(r), ops);
}

/** Decrease crown — delegates to the shared crown choreography. */
function emitCrownDecrease(r: Resolved, crown: Extract<CrownSpec, { style: 'decrease' }>, ops: KnitoutOp[]): void {
  emitCrownDecreaseOps(crownCtx(r), crown, ops);
}

/* --------------------------------------------------------------------- */
/* Top-level                                                              */
/* --------------------------------------------------------------------- */

/** Emit the full beanie op stream (waste through crown). */
export function emitBeanie(spec: BeanieSpec): KnitoutOp[] {
  const r = resolve(spec);
  const ops: KnitoutOp[] = [];

  emitWaste(r, ops);

  // Uniform carrier lifecycle: every section brings its own carriers in
  // and out, so each phase starts with nothing active.
  ops.push(comment('--- HAT BODY ---'));
  if (r.spec.brim.rounds > 0) {
    ops.push(carrierIn(r.spec.mainCarrier));
    emitBrim(r, r.spec.mainCarrier, ops);
    ops.push(carrierOut(r.spec.mainCarrier));
  }

  if (r.spec.tubeJacquard) {
    emitTubeJacquardBody(r, r.spec.tubeJacquard, ops);
  } else if (r.spec.jacquard) {
    emitJacquardBody(r, r.spec.jacquard, ops);
  } else {
    emitBody(r, ops);
  }

  if (r.spec.crown.style === 'gathered') {
    emitCrownGathered(r, ops);
  } else {
    emitCrownDecrease(r, r.spec.crown, ops);
  }

  return ops;
}

/* --------------------------------------------------------------------- */
/* Preview / visualization                                                */
/* --------------------------------------------------------------------- */

export interface BeaniePreview {
  /** Front-face colour grid in knit order: rows[0] is the first (bottom)
   *  round, rows[last] the crown. Each cell is the carrier that formed the
   *  stitch (knit OR purl), or null where the round is narrower than the
   *  widest round. */
  rows: (CarrierId | null)[][];
  /** Same shape as `rows`: true where a float-catch tuck sits behind the
   *  stitch — a caught float that may show faintly on the front. */
  catches: boolean[][];
  /** Widest round (stitches across the front face). */
  width: number;
  /** Total float-catch tucks on the front face. */
  catchCount: number;
}

/**
 * Reconstruct the front face of the knitted tube from a built program — the
 * carrier that formed each stitch, round by round, INCLUDING purl columns
 * (which live on the back bed at front-face slots during rib) so ribbed
 * fabric previews at full width. Waste/draw carriers are skipped. Round
 * boundaries are detected when a column is revisited, so a decrease crown
 * shows up as narrowing rows.
 *
 * Front-face slots are one needle parity; the back face is the other. With
 * `base` = the lowest pattern needle (front-face column 0), an op is on the
 * front face iff `(needle − base)` is even — that captures front-bed knits
 * (knit columns), back-bed knits at front slots (purl columns), and
 * front-bed float-catch tucks (`catches`). Back-face ops (odd) are dropped.
 */
export function renderBeaniePreview(program: KnitoutProgram): BeaniePreview {
  const skip = new Set<CarrierId>();
  for (const c of Object.keys(program.yarns) as CarrierId[]) {
    const name = program.yarns[c];
    if (name === 'waste' || name === 'draw thread') skip.add(c);
  }
  let base = Infinity;
  for (const op of program.ops) {
    if ((op.kind === 'knit' || op.kind === 'tuck') && !skip.has(op.carriers[0]!)) {
      base = Math.min(base, op.needle.needle);
    }
  }
  if (!Number.isFinite(base)) return { rows: [], catches: [], width: 0, catchCount: 0 };

  const rows: (CarrierId | null)[][] = [];
  const catchRows: boolean[][] = [];
  let acc = new Map<number, CarrierId>();
  let catchSet = new Set<number>();
  const flush = () => {
    if (acc.size === 0 && catchSet.size === 0) return;
    const w = Math.max(0, ...acc.keys(), ...catchSet) + 1;
    rows.push(Array.from({ length: w }, (_, i) => acc.get(i) ?? null));
    catchRows.push(Array.from({ length: w }, (_, i) => catchSet.has(i)));
    acc = new Map();
    catchSet = new Set();
  };
  for (const op of program.ops) {
    if (op.kind !== 'knit' && op.kind !== 'tuck') continue;
    const c = op.carriers[0]!;
    if (skip.has(c)) continue;
    const d = op.needle.needle - base;
    if (d < 0 || d % 2 !== 0) continue; // back face (odd parity)
    const col = d / 2;
    if (op.kind === 'knit') {
      if (acc.has(col)) flush();
      acc.set(col, c);
    } else {
      catchSet.add(col); // float-catch tuck on the front face
    }
  }
  flush();
  const width = rows.reduce((m, r) => Math.max(m, r.length), 0);
  const catchCount = catchRows.reduce((n, r) => n + r.filter(Boolean).length, 0);
  return { rows, catches: catchRows, width, catchCount };
}

/** ASCII view of a preview, crown at the top. Maps each carrier to a glyph
 *  (defaults to distinct characters); unknit cells render as spaces. With
 *  `markCatches`, caught-float cells render as `+` so possible show-through
 *  is visible rather than hidden. */
export function beaniePreviewToAscii(
  preview: BeaniePreview,
  glyphs: Partial<Record<CarrierId, string>> = {},
  opts: { markCatches?: boolean } = {},
): string {
  const palette = ['·', '█', '▒', '▓', '◆', '○'];
  const seen: CarrierId[] = [];
  const glyphFor = (c: CarrierId): string => {
    if (glyphs[c]) return glyphs[c]!;
    if (!seen.includes(c)) seen.push(c);
    return palette[seen.indexOf(c) % palette.length]!;
  };
  const lines: string[] = [];
  for (let r = preview.rows.length - 1; r >= 0; r--) {
    const row = preview.rows[r]!;
    const catchRow = preview.catches[r] ?? [];
    const pad = Math.floor((preview.width - row.length) / 2); // centre narrow (crown) rows
    let line = ' '.repeat(pad);
    for (let i = 0; i < row.length; i++) {
      const cell = row[i];
      if (opts.markCatches && catchRow[i]) line += '+';
      else line += cell ? glyphFor(cell) : ' ';
    }
    lines.push(line);
  }
  return lines.join('\n');
}

/** Wrap the beanie op stream into a standalone KnitoutProgram. */
export function buildBeanieProgram(spec: BeanieSpec): KnitoutProgram {
  const r = resolve(spec);
  const ops = emitBeanie(spec);
  const yarns: Partial<Record<CarrierId, string>> = {
    [r.spec.mainCarrier]: 'main',
    [r.spec.wasteCarrier]: 'waste',
  };
  if (r.spec.drawCarrier) yarns[r.spec.drawCarrier] = 'draw thread';
  for (const band of r.spec.stripes ?? []) yarns[band.carrier] = yarns[band.carrier] ?? `stripe ${band.carrier}`;
  (r.spec.jacquard?.colors ?? r.spec.tubeJacquard?.colors ?? []).forEach((c, i) => { yarns[c] = yarns[c] ?? `colour ${i}`; });

  return {
    version: 2,
    carriers: ['1', '2', '3', '4', '5', '6'],
    machine: 'kniterate',
    gauge: 7,
    position: 'Center',
    yarns,
    kniterate: {
      // carrierSpacing / carrierStoppingDistance are only honored as inline
      // ops, not headers (the vendor backend ignores the header form), so
      // they're omitted here to keep the .k clean — machine defaults apply.
      stitchNumber: r.spec.stitchNumber,
      xferStitchNumber: r.spec.xferStitchNumber,
      speedNumber: r.spec.speedNumber,
      rollerAdvance: r.spec.rollerAdvance,
      xferStyle: DEFAULT_KNITERATE_HEADERS.xferStyle,
    },
    ops,
  };
}
