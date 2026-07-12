/**
 * Traveling i-cord emitter.
 *
 * An i-cord is a narrow tube knit on a few needle slots, the stitches
 * interleaved across the front and back beds so the carriage can knit
 * the whole round in one pass. One *round* of the cord is:
 *
 *   1. a `Kn-Kn` knit pass over every cord stitch (both beds), then
 *   2. a swap-bed transfer (front-to-back / back-to-front) that wraps
 *      the yarn around to close the tube,
 *
 * with the carriage direction alternating each round. Knitting in place
 * grows the cord vertically; *traveling* slides the whole tube one
 * column at a time via a racked transfer ladder (the same primitive
 * `lateral-shift.ts` uses for fully-fashioned shaping).
 *
 * This is the choreography Customist Studio emits for i-cord designs
 * such as `reference/sophie.kc` — verified pass-for-pass against that
 * reference (knit footer `Kn-Kn <c> 300 450`, transfer footers
 * `Tr-Rr / Tr-Rl / Rr-Tr / Rl-Tr 0 60 0`). The emitted knitout compiles
 * through the vendored `knitout-to-kcode.cjs` to matching k-code.
 *
 * Coordinate convention: `startCol` is the leftmost needle slot of the
 * cord; the cord occupies `[startCol, startCol + width - 1]`. Slots at
 * an even offset from `startCol` start on the front bed, odd offsets on
 * the back bed (a regular every-other-needle tube).
 */

import {
  f, b, knit, tuck, xfer, rack, drop, comment,
  xStitchNumber, xXferStitchNumber, xSpeedNumber, xRollerAdvance,
  type KnitoutOp, type CarrierId, type Direction, type BedNeedle,
} from '../types.js';

export type IcordStep =
  | { kind: 'knit'; rounds: number }
  | { kind: 'travel'; dir: 'left' | 'right'; cols: number };

export interface IcordSpec {
  carrier: CarrierId;
  /** Leftmost needle slot of the cord. */
  startCol: number;
  /** Number of needle slots the cord spans (cord circumference). */
  width: number;
  /** Ordered list of knit-in-place / travel steps. */
  steps: IcordStep[];
  /** Knit-pass speed/roller — sophie uses 300 / 450. */
  knitSpeed?: number;
  knitRoller?: number;
  /** Transfer-pass speed — sophie uses 60. */
  xferSpeed?: number;
  /** Stitch number for knit rows (sophie uses 6). */
  stitchNumber?: number;
}

const DEFAULTS = {
  knitSpeed: 300,
  knitRoller: 450,
  xferSpeed: 60,
  stitchNumber: 6,
} as const;

/** Mutable cord state: which bed each occupied slot currently lives on,
 *  and the carriage direction for the next knit pass. */
interface CordState {
  /** col -> bed ('f' | 'b'). */
  bed: Map<number, 'f' | 'b'>;
  /** Sorted occupied columns (low -> high). */
  cols: number[];
  /** Direction of the next knit pass. */
  dir: Direction;
}

const needle = (bed: 'f' | 'b', n: number): BedNeedle => (bed === 'f' ? f(n) : b(n));

function initialState(startCol: number, width: number): CordState {
  const bed = new Map<number, 'f' | 'b'>();
  const cols: number[] = [];
  for (let i = 0; i < width; i++) {
    const c = startCol + i;
    bed.set(c, i % 2 === 0 ? 'f' : 'b');
    cols.push(c);
  }
  return { bed, cols, dir: '-' };
}

/** Cast the cord on with a tuck on every slot, both beds alternating to
 *  match the interleave the body expects. */
function castOn(state: CordState, carrier: CarrierId, ops: KnitoutOp[]): void {
  ops.push(comment('-- i-cord cast-on --'));
  // Tuck right-to-left then knit left-to-right to anchor.
  for (const c of [...state.cols].reverse()) {
    ops.push(tuck('-', needle(state.bed.get(c)!, c), carrier));
  }
  for (const c of state.cols) {
    ops.push(knit('+', needle(state.bed.get(c)!, c), carrier));
  }
  state.dir = '-';
}

/** One knit-in-place round: knit every cord stitch, then swap all to the
 *  opposite bed (closes the tube), flipping the carriage direction. */
function knitRound(state: CordState, spec: IcordSpec, ops: KnitoutOp[]): void {
  const knitSpeed = spec.knitSpeed ?? DEFAULTS.knitSpeed;
  const knitRoller = spec.knitRoller ?? DEFAULTS.knitRoller;
  const xferSpeed = spec.xferSpeed ?? DEFAULTS.xferSpeed;

  ops.push(comment('-- i-cord knit round --'));
  ops.push(xSpeedNumber(knitSpeed), xRollerAdvance(knitRoller));
  const order = state.dir === '-' ? [...state.cols].reverse() : [...state.cols];
  for (const c of order) {
    ops.push(knit(state.dir, needle(state.bed.get(c)!, c), spec.carrier));
  }

  // Swap every stitch to the opposite bed. The vendor splits adjacent
  // same-bed sources into even/odd passes automatically.
  ops.push(comment('-- i-cord swap beds --'));
  ops.push(xSpeedNumber(xferSpeed), xRollerAdvance(0));
  ops.push(rack(0));
  for (const c of state.cols) {
    const from = state.bed.get(c)!;
    ops.push(xfer(needle(from, c), needle(from === 'f' ? 'b' : 'f', c)));
  }
  for (const c of state.cols) state.bed.set(c, state.bed.get(c)! === 'f' ? 'b' : 'f');

  state.dir = state.dir === '-' ? '+' : '-';
}

/** Slide the whole cord one column toward `dir` via a racked transfer
 *  ladder: consolidate to the back bed, rack ±1, transfer to the front
 *  shifted by one, then restore the interleave. */
function travelOneColumn(state: CordState, dir: 'left' | 'right', spec: IcordSpec, ops: KnitoutOp[]): void {
  const xferSpeed = spec.xferSpeed ?? DEFAULTS.xferSpeed;
  const delta = dir === 'left' ? -1 : 1;

  ops.push(comment(`-- i-cord travel 1 col ${dir} --`));
  ops.push(xSpeedNumber(xferSpeed), xRollerAdvance(0));

  // 1. Consolidate every stitch onto the back bed (in place).
  ops.push(rack(0));
  for (const c of state.cols) {
    if (state.bed.get(c) === 'f') ops.push(xfer(f(c), b(c)));
  }
  // 2. Rack ±1 and transfer back -> front shifted by one column.
  //    xfer b(n) -> f(n + delta) is legal at rack = delta.
  ops.push(rack(delta));
  for (const c of state.cols) {
    ops.push(xfer(b(c), f(c + delta)));
  }
  ops.push(rack(0));

  // 3. New column set, all on front; restore the every-other interleave.
  const newCols = state.cols.map(c => c + delta);
  state.cols = newCols;
  state.bed = new Map();
  newCols.forEach((c, i) => {
    if (i % 2 === 1) {
      ops.push(xfer(f(c), b(c)));
      state.bed.set(c, 'b');
    } else {
      state.bed.set(c, 'f');
    }
  });
}

/** Drop the cord stitches off the machine (clean finish). A real bind-off
 *  is a separate refinement; dropping releases the tube safely. */
function finishDrop(state: CordState, ops: KnitoutOp[]): void {
  ops.push(comment('-- i-cord finish (drop) --'));
  for (const c of state.cols) ops.push(drop(needle(state.bed.get(c)!, c)));
}

export interface EmitICordOptions {
  /** Include a tuck cast-on at the start. Default true. */
  castOn?: boolean;
  /** Drop the cord at the end. Default true. */
  finish?: boolean;
}

/** Emit the knitout op stream for a traveling i-cord. */
export function emitICord(spec: IcordSpec, opts: EmitICordOptions = {}): KnitoutOp[] {
  const ops: KnitoutOp[] = [];
  ops.push(xStitchNumber(spec.stitchNumber ?? DEFAULTS.stitchNumber));
  ops.push(xXferStitchNumber(spec.stitchNumber ?? DEFAULTS.stitchNumber));

  const state = initialState(spec.startCol, spec.width);
  if (opts.castOn ?? true) castOn(state, spec.carrier, ops);

  for (const step of spec.steps) {
    if (step.kind === 'knit') {
      for (let r = 0; r < step.rounds; r++) knitRound(state, spec, ops);
    } else {
      for (let c = 0; c < step.cols; c++) travelOneColumn(state, step.dir, spec, ops);
    }
  }

  if (opts.finish ?? true) finishDrop(state, ops);
  return ops;
}
