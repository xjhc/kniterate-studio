/**
 * Back-bed clear pass — transfers all back-bed cast-on loops to the
 * front bed so the body can knit single-bed. Used by `floats` jacquard
 * mode, which doesn't touch the back bed during the body and would
 * otherwise leave orphaned cast-on loops on the back.
 *
 * Matches the `Rr-Tr` / `Rl-Tr` pair that appears at rows 105-106 of
 * `reference/fairisle.kc`. The vendor `knitout-to-kcode.cjs` splits a
 * single batch of `xfer b{n} f{n}` ops into two `[back-to-front, even]`
 * and `[back-to-front, odd]` carriage passes (its four-pass xfer style),
 * so we emit the xfers in needle order and let the vendor handle the
 * even/odd split.
 *
 * The function takes a `bedAssignment(col)` callback because the
 * cast-on bed pattern is computed by the waste section based on its own
 * direction + `castOnBedPattern` (when set). The caller is responsible
 * for mirroring that logic so we only xfer back-bed needles that
 * actually have loops — xfer-from-empty is rejected by the bed-state
 * validator.
 */

import {
  ALL_CARRIERS,
  b as backBed,
  comment,
  f,
  type BedNeedle,
  type Direction,
  type KnitoutOp,
} from '../types.js';
import { CarriageSimulator } from '../sim/carriage-simulator.js';
import type { PredictedPass } from '../sim/types.js';

export interface BackBedClearInput {
  needleStart: number;
  needleEnd: number;
  /** Returns 'b' if the cast-on landed on the back bed for column
   *  `col` (0-indexed, col 0 = needleStart). Caller mirrors the
   *  cast-on logic — see `castOnBedFor` below. */
  bedAssignment: (col: number) => 'f' | 'b';
  /** Speed for the xfer carriage passes themselves. The fairisle parity
   *  reference uses 120 here (vs the body speed of 200). When set, the
   *  emitter inserts `x-speed-number` before the xfers and a follow-up
   *  `x-speed-number` to restore `restoreSpeed` afterwards. Omit to
   *  inherit whatever the surrounding context already set. */
  xferSpeed?: number;
  /** Speed to restore after the xfer pair completes. Only honored when
   *  `xferSpeed` is also set. Typically the body speed (200 for
   *  fairisle parity). */
  restoreSpeed?: number;
  /** Vendor runtime nextDirection at the start of this xfer sandwich. */
  initialNextDirection?: Direction;
  /** Prediction-only xfer style. This is seeded into the simulator
   *  without emitting an extra x-xfer-style op. */
  xferStyle?: 'four-pass' | 'two-pass';
}

export interface BackBedClearResult {
  ops: KnitoutOp[];
  predictedPasses: PredictedPass[];
  finalNextDirection: Direction;
}

export function emitBackBedClear(input: BackBedClearInput): BackBedClearResult {
  const ops: KnitoutOp[] = [];
  const { needleStart, needleEnd, bedAssignment, xferSpeed, restoreSpeed } = input;
  let backCount = 0;
  for (let n = needleStart; n <= needleEnd; n++) {
    const col = n - needleStart;
    if (bedAssignment(col) === 'b') backCount++;
  }
  const initialNextDirection = input.initialNextDirection ?? '+';
  if (backCount === 0) {
    return { ops, predictedPasses: [], finalNextDirection: initialNextDirection };
  }

  ops.push(comment('--- BACK-BED CLEAR (floats body) ---'));
  const sim = new CarriageSimulator({
    carriers: ALL_CARRIERS,
    initialNextDirection,
  });
  if (input.xferStyle !== undefined) {
    sim.seedXferStyle(input.xferStyle);
  }
  if (xferSpeed !== undefined) sim.setSpeed(xferSpeed);
  const pairs: { from: BedNeedle; to: BedNeedle }[] = [];
  for (let n = needleStart; n <= needleEnd; n++) {
    const col = n - needleStart;
    if (bedAssignment(col) === 'b') {
      pairs.push({ from: backBed(n), to: f(n) });
    }
  }
  // The bed-state validator rejects adjacent same-bed xfer sources within a
  // single pass (`adjacent-xfer-same-pass`); its tracker only resets on a
  // `rack` op. The alternating cast-on path feeds non-adjacent sources, so a
  // single batch is fine; the `continuousWaste` interlock leaves a live back
  // loop on EVERY column, so transferring all at once would be 61 adjacency
  // violations. Greedy-split into non-adjacent batches separated by a rack(0)
  // relief — the same shape `emitNonAdjacentXferBatches` (stockinette-shaped)
  // uses, and what the vendor's four-pass xfer does physically (REF's
  // `Rr-Tr` even / `Rl-Tr` odd at passes 110–111). Non-adjacent input
  // collapses to one batch, so the cast-on path is byte-unchanged.
  const batches = splitNonAdjacentSources(pairs);
  batches.forEach((batch, i) => {
    if (i > 0) {
      // Force a rack(0) relief between batches so the validator's same-pass
      // source tracker resets. `setRacking(0)` alone is idempotent at
      // racking 0; `seedRacking` clears the emitted flag so it re-emits.
      sim.seedRacking(0);
      sim.setRacking(0);
    }
    sim.xferBatch(batch);
  });
  if (xferSpeed !== undefined && restoreSpeed !== undefined) {
    sim.setSpeed(restoreSpeed);
  }
  ops.push(...sim.drainOps());
  return {
    ops,
    predictedPasses: [...sim.predictedPasses()],
    finalNextDirection: sim.finalNextDirection(),
  };
}

/** Greedy-split xfer pairs so no batch contains two sources on adjacent
 *  needles (the `adjacent-xfer-same-pass` bed-state rule). Pairs are
 *  consumed in needle order; each batch takes the next source whose
 *  needle is ≥2 from the last source already in the batch. Non-adjacent
 *  input yields a single batch (callers that already alternate pay no
 *  cost). All sources here are on the back bed, so a single same-bed
 *  tracker suffices. */
function splitNonAdjacentSources(
  pairs: readonly { from: BedNeedle; to: BedNeedle }[],
): { from: BedNeedle; to: BedNeedle }[][] {
  if (pairs.length === 0) return [];
  const remaining = [...pairs].sort((a, b) => a.from.needle - b.from.needle);
  const batches: { from: BedNeedle; to: BedNeedle }[][] = [];
  while (remaining.length > 0) {
    const batch: { from: BedNeedle; to: BedNeedle }[] = [];
    let lastNeedle = Number.NEGATIVE_INFINITY;
    for (let i = 0; i < remaining.length; ) {
      const p = remaining[i]!;
      if (p.from.needle - lastNeedle >= 2) {
        batch.push(p);
        lastNeedle = p.from.needle;
        remaining.splice(i, 1);
      } else {
        i++;
      }
    }
    batches.push(batch);
  }
  return batches;
}

/** Mirror of the bed-assignment logic inside `pushBothBedsCastOnRow`
 *  (waste-section.ts). Returns the bed that cast-on landed on for
 *  column `col` (0-indexed; col 0 = needleStart).
 *
 *  When `bedPattern` is provided (chart-driven cast-on, e.g. rib hems),
 *  it wins. Otherwise the default is needle-parity alternation that
 *  depends on the cast-on carriage direction. The body's `castOnFirstBed`
 *  flag from `WasteMachineConfig` does NOT apply to this row — that
 *  flag governs the waste *interlock*, not the both-beds cast-on row.
 *  Keep this mirror in lockstep with `pushBothBedsCastOnRow` or the
 *  back-bed clear will xfer the wrong needles. */
export function castOnBedFor(
  col: number,
  needleStart: number,
  castOnDirection: '+' | '-',
  bedPattern?: ('f' | 'b')[],
): 'f' | 'b' {
  if (bedPattern !== undefined && col >= 0 && col < bedPattern.length) {
    return bedPattern[col] ?? 'f';
  }
  const n = needleStart + col;
  if (castOnDirection === '+') {
    return n % 2 === 0 ? 'f' : 'b';
  } else {
    return n % 2 === 0 ? 'b' : 'f';
  }
}
