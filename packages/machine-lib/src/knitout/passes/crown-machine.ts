/**
 * Crown machine choreography — the shared, topology-driven emitter for a tube's
 * convergent crown (gathered draw-thread or machine-decrease), factored out of
 * the standalone beanie emitter so ONE implementation drives every crown.
 *
 * The beanie path (`src/knitout/passes/beanie.ts`) delegates to this module
 * (byte-identical by construction — guarded by the beanie `.kc` parity tests),
 * and the shared canvas tube/hat lowering drives the SAME emitter from a tube
 * topology, so the crown a hat *exports* is the crown the reference hat knits.
 *
 * This is the *machine* side. The *shape* side — the crown as FabricIR
 * `decrease` rows — lives in `src/shells/crown.ts`; the two agree on the
 * convergence trajectory (proven by `beanie-recipe.ts`'s crown parity guard).
 *
 * Coordinate model (the every-other-needle interleave): a face of `faceWidth`
 * columns lives on one needle parity; `frontSlot(i)` / `backSlot(i)` map a
 * column to its bed slot. A k2tog stacks a column onto its inward neighbour via
 * a racked transfer through the free (scratch) bed; survivors re-pack onto the
 * lowest contiguous slots of the face's parity, hopping in steps of
 * ≤ `KNITERATE_MAX_RACK` so no single transfer exceeds the machine rack limit.
 */

import {
  f, b, knit, xfer, rack, comment, carrierIn, carrierOut,
  xSpeedNumber, xRollerAdvance, xXferStitchNumber,
  type KnitoutOp, type CarrierId, type BedNeedle,
} from '../types.js';
import { KNITERATE_MAX_RACK } from '../kniterate/constants.js';

// ---- Crown spec (the contract — single source) -----------------------------

export type CrownSpec =
  | { style: 'gathered' }
  | {
      style: 'decrease';
      /** Decreases per face per decrease-round (evenly spaced). Default 3. */
      decreasesPerRound?: number;
      /** Plain rounds knit between decrease rounds. Default 1. */
      plainRoundsBetween?: number;
      /** Stop decreasing once a face reaches this many stitches. Default 8. */
      minFaceStitches?: number;
    };

/** Default decreases per face per crown round when unspecified. Six spiral
 *  lines (3/face) close a clean fitted dome. */
export const DEFAULT_DECREASES_PER_ROUND = 3;

/** Upper bound on decreases per face per round. The re-pack re-homes survivors
 *  in hops of ≤ KNITERATE_MAX_RACK, so racking is no longer the limit — this cap
 *  is about crown *roundness*: more decrease points (up to 6/face = 12 spiral
 *  lines) round the dome; beyond that it gathers. */
export const MAX_DECREASES_PER_ROUND = 6;

/** The decreases-per-round actually used after defaulting + clamping. */
export function effectiveDecreasesPerRound(requested?: number): number {
  return Math.min(requested ?? DEFAULT_DECREASES_PER_ROUND, MAX_DECREASES_PER_ROUND);
}

// ---- Machine context -------------------------------------------------------

/**
 * Everything the crown choreography needs that a producer (beanie `Resolved`
 * or tube `TubeTopology` + settings) supplies. Decoupling the emitter from the
 * beanie's resolved spec is what lets the shared canvas tube lowering drive it.
 */
export interface CrownMachineContext {
  faceWidth: number;
  /** Front-bed slot for front-face column `i` (= offset + 2i). */
  frontSlot: (i: number) => number;
  /** Back-bed slot for back-face column `i` (= offset + 2i + 1). */
  backSlot: (i: number) => number;
  mainCarrier: CarrierId;
  /** Draw-thread carrier for the gather; null skips the gather round. */
  drawCarrier: CarrierId | null;
  knitSpeed: number;
  knitRoller: number;
  xferSpeed: number;
  xferStitchNumber: number;
}

const N = (bed: 'f' | 'b', n: number): BedNeedle => (bed === 'f' ? f(n) : b(n));

/** One full stockinette round on the current face columns: front '+' then
 *  back '-'. */
function knitCrownFullRound(ctx: CrownMachineContext, carrier: CarrierId, ops: KnitoutOp[]): void {
  ops.push(xSpeedNumber(ctx.knitSpeed), xRollerAdvance(ctx.knitRoller), rack(0));
  for (let i = 0; i < ctx.faceWidth; i++) ops.push(knit('+', f(ctx.frontSlot(i)), carrier));
  for (let i = ctx.faceWidth - 1; i >= 0; i--) ops.push(knit('-', b(ctx.backSlot(i)), carrier));
}

// ---- Gathered crown --------------------------------------------------------

/** Gathered crown: a draw-thread round + release. Live loops left to cinch. */
export function emitCrownGatheredOps(ctx: CrownMachineContext, ops: KnitoutOp[]): void {
  ops.push(comment('--- CROWN: gathered (cinch live loops) ---'));
  if (ctx.drawCarrier) {
    const draw = ctx.drawCarrier;
    ops.push(carrierIn(draw));
    knitCrownFullRound(ctx, draw, ops);
    ops.push(carrierOut(draw));
  }
}

// ---- Decrease crown --------------------------------------------------------

/**
 * Decrease crown. Each decrease round k2togs `d` evenly-spaced columns per
 * face (stacking a loop onto its inward neighbour via a racked transfer),
 * then re-packs the survivors onto the lowest contiguous slots of the face's
 * parity, then knits a round. Repeats until faces are small, then gathers.
 */
export function emitCrownDecreaseOps(
  ctx: CrownMachineContext,
  crown: Extract<CrownSpec, { style: 'decrease' }>,
  ops: KnitoutOp[],
): void {
  const carrier = ctx.mainCarrier;
  // `d` decreases/round shifts the rightmost survivors 2(d−1) columns, so clamp
  // to MAX_DECREASES_PER_ROUND to keep every transfer within KNITERATE_MAX_RACK.
  // Larger requested counts just take more rounds.
  const d = effectiveDecreasesPerRound(crown.decreasesPerRound);
  const plainBetween = crown.plainRoundsBetween ?? 1;
  const minFace = crown.minFaceStitches ?? 8;
  ops.push(comment('--- CROWN: machine decrease ---'));
  ops.push(carrierIn(carrier));

  // Track live columns per face as ordered slot lists.
  let front: number[] = Array.from({ length: ctx.faceWidth }, (_, i) => ctx.frontSlot(i));
  let back: number[] = Array.from({ length: ctx.faceWidth }, (_, i) => ctx.backSlot(i));

  const knitCurrent = (): void => {
    ops.push(xSpeedNumber(ctx.knitSpeed), xRollerAdvance(ctx.knitRoller), rack(0));
    for (const s of front) ops.push(knit('+', f(s), carrier));
    for (let i = back.length - 1; i >= 0; i--) ops.push(knit('-', b(back[i]!), carrier));
  };

  let guard = 0;
  while (front.length > minFace && guard++ < 200) {
    const decN = Math.min(d, front.length - minFace);
    ops.push(comment(`-- dec round: ${front.length} → ${front.length - decN} per face --`));
    front = decreaseFaceOps(ctx, 'f', front, decN, ops);
    back = decreaseFaceOps(ctx, 'b', back, decN, ops);
    for (let p = 0; p < plainBetween; p++) knitCurrent();
  }

  // Gather the survivors.
  if (ctx.drawCarrier) {
    const draw = ctx.drawCarrier;
    ops.push(comment('-- crown gather (draw thread) --'));
    ops.push(carrierIn(draw));
    ops.push(xSpeedNumber(ctx.knitSpeed), xRollerAdvance(ctx.knitRoller), rack(0));
    for (const s of front) ops.push(knit('+', f(s), draw));
    for (let i = back.length - 1; i >= 0; i--) ops.push(knit('-', b(back[i]!), draw));
    ops.push(carrierOut(draw));
  }
  ops.push(carrierOut(carrier));
}

/**
 * k2tog `decN` evenly-spaced columns on one face, then re-pack the survivors
 * onto the lowest contiguous slots of the face's parity. Returns the new
 * occupied-slot list. All transfers cross beds; the helper uses the opposite
 * (free) bed as scratch.
 */
function decreaseFaceOps(
  ctx: CrownMachineContext,
  bed: 'f' | 'b',
  slots: number[],
  decN: number,
  ops: KnitoutOp[],
): number[] {
  if (decN <= 0) return slots;
  const scratch = bed === 'f' ? 'b' : 'f';
  const W = slots.length;
  ops.push(xSpeedNumber(ctx.xferSpeed), xRollerAdvance(0), xXferStitchNumber(ctx.xferStitchNumber), rack(0));

  // Choose up to decN evenly-spread interior columns to consume, never adjacent
  // (each consumed column k stacks onto a surviving k-1) and never column 0
  // (the edge stays put). Non-adjacency also bounds the count to ⌊(W-1)/2⌋.
  const useDec = Math.min(decN, Math.floor((W - 1) / 2));
  const consume = new Set<number>();
  const spacing = W / (useDec + 1);
  let last = -2;
  for (let j = 0; j < useDec; j++) {
    let k = Math.max(1, Math.min(W - 1, Math.round((j + 1) * spacing)));
    if (k <= last + 1) k = last + 2; // keep consumed columns non-adjacent
    if (k > W - 1) break;
    consume.add(k);
    last = k;
  }

  // Stack each consumed column onto its left neighbour (k2tog) via scratch.
  for (const k of [...consume].sort((a, c) => a - c)) {
    const src = slots[k]!;
    const dst = slots[k - 1]!;
    ops.push(rack(0));
    ops.push(xfer(N(bed, src), N(scratch, src)));
    const frontNeedle = bed === 'f' ? dst : src;
    const backNeedle = bed === 'f' ? src : dst;
    ops.push(rack(frontNeedle - backNeedle)); // |dst-src| = 2 (adjacent columns)
    ops.push(xfer(N(scratch, src), N(bed, dst)));
    ops.push(rack(0));
  }

  // Survivors in slot order, then re-pack onto contiguous parity slots.
  const survivors = slots.filter((_, k) => !consume.has(k));
  const target = survivors.map((_, i) => (bed === 'f' ? ctx.frontSlot(i) : ctx.backSlot(i)));
  for (let i = 0; i < survivors.length; i++) {
    moveStitchHopsOps(bed, scratch, survivors[i]!, target[i]!, ops);
  }
  return target;
}

/** Re-home one held loop from slot `from` to slot `to` on `bed`, hopping
 *  through the free `scratch` bed in steps of ≤ KNITERATE_MAX_RACK so no single
 *  transfer exceeds the machine rack limit. `from`/`to` share parity, so every
 *  hop is an even rack landing on a valid same-parity slot. */
function moveStitchHopsOps(bed: 'f' | 'b', scratch: 'f' | 'b', from: number, to: number, ops: KnitoutOp[]): void {
  let cur = from;
  while (cur !== to) {
    const dir = to < cur ? -1 : 1;
    const step = Math.min(KNITERATE_MAX_RACK, Math.abs(cur - to));
    const next = cur + dir * step;
    ops.push(rack(0));
    ops.push(xfer(N(bed, cur), N(scratch, cur)));
    const frontNeedle = bed === 'f' ? next : cur;
    const backNeedle = bed === 'f' ? cur : next;
    ops.push(rack(frontNeedle - backNeedle)); // |next-cur| = step ≤ KNITERATE_MAX_RACK
    ops.push(xfer(N(scratch, cur), N(bed, next)));
    cur = next;
  }
  ops.push(rack(0));
}
