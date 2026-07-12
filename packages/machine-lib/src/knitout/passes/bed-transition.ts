/**
 * Shared bed-transition helper: transfer a set of needles across beds
 * in non-adjacent batches.
 *
 * The bed-state validator rejects two transfer sources on adjacent
 * needles within a single pass (`adjacent-xfer-same-pass`); its tracker
 * only resets on a `rack` op. So a run of `xfer b{n} f{n}` over a dense
 * column range is greedily split into batches where each batch holds
 * only non-adjacent sources, separated by a `rack(0)` relief — which is
 * also what the vendor's four-pass xfer does physically (the `Rr-Tr`
 * even / `Rl-Tr` odd split). Non-adjacent input collapses to a single
 * batch, so sparse callers pay no cost.
 *
 * Every batch — including the first — opens with a `rack(0)`. These are
 * b↔f straight transfers, which require rack 0 anyway, so asserting it is
 * correct; it also resets the validator's per-pass adjacency tracker so a
 * homing batch can't collide with a STALE xfer source left earlier in the
 * pass by an unrelated transfer many rack-free knit rows back. (The
 * complement-jacquard body knits at rack 0 with no per-row rack, so the
 * rib→body bed-transition sources would otherwise linger until the
 * armhole bind-off span — Campaign 4 C4-4.)
 *
 * Used by every lined-fabric "home the lining to the front bed" finish:
 * the shaped walker's neck bind-off spans + lined finish
 * (stockinette-shaped.ts) and the non-shaped birdseye walker's lined
 * finish (jacquard-birdseye.ts). One implementation keeps both finishes
 * byte-identical in their transfer choreography.
 */

import {
  b as backBed,
  f,
  rack,
  xfer,
  type KnitoutOp,
} from '../types.js';

export function emitNonAdjacentXferBatches(
  transfers: ReadonlyArray<{ needle: number; direction: 'f-to-b' | 'b-to-f' }>,
): KnitoutOp[] {
  const ops: KnitoutOp[] = [];
  const remaining = [...transfers].sort((a, b) => a.needle - b.needle);
  let batchIndex = 0;
  while (remaining.length > 0) {
    // Leading rack(0) on every batch: a relief between batches AND a
    // tracker reset before the first, so a stale same-bed xfer source from
    // earlier in a rack-free pass can't make this batch look adjacent.
    ops.push(rack(0));
    const usedSourceF = new Set<number>();
    const usedSourceB = new Set<number>();
    for (let i = 0; i < remaining.length; ) {
      const t = remaining[i]!;
      const used = t.direction === 'f-to-b' ? usedSourceF : usedSourceB;
      if (used.has(t.needle - 1) || used.has(t.needle + 1)) {
        i++;
        continue;
      }
      if (t.direction === 'f-to-b') {
        ops.push(xfer(f(t.needle), backBed(t.needle)));
      } else {
        ops.push(xfer(backBed(t.needle), f(t.needle)));
      }
      used.add(t.needle);
      remaining.splice(i, 1);
    }
    batchIndex++;
    if (batchIndex > 16) {
      throw new Error('bed-transition: split exceeded 16 batches — input adjacency is degenerate');
    }
  }
  return ops;
}
