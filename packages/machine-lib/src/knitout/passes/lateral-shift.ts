/**
 * Fully-fashioned lateral shift helper (per-stitch shift-1 semantics,
 * refactored from Batch D Phase 2's atomic shift-3 tile).
 *
 * A lateral shift slides an N-stitch block by ONE column to the left or
 * right via a rack-and-xfer dance. Unlike a cable cross (which swaps two
 * strands and preserves their column homes), a shift permanently
 * relocates the block — the single source-side edge column becomes empty
 * after the shift and stays empty on subsequent rows unless the user
 * paints over it. The source-side dest column ends up with two loops
 * (a k2tog on the next knit pass); the other N-1 stitches just ride
 * along on the rack.
 *
 * Layout convention (N = `count`, D = `destLeftNeedle`):
 *   - shift-1-L (direction='left'): worked stitches at source columns
 *     [D+1, D+N] move LEFT onto destination columns [D, D+N-1]. Net: one
 *     vacated column at D+N; D ends up with a k2tog.
 *   - shift-1-R (direction='right'): worked stitches at source columns
 *     [D-1, D+N-2] move RIGHT onto destination columns [D, D+N-1]. Net:
 *     one vacated column at D-1; D+N-1 ends up with a k2tog.
 *
 * Choreography (2 phases):
 *   1. Source stitches xfer f → b in place (scratch on the back bed).
 *   2. Rack ±1, then xfer b → f at the destination columns.
 *
 * The bed-state validator treats `xfer b(N) → f(M)` as legal when
 * `M = N + R` (where R is the current rack). For shift-LEFT we want
 * M = N - 1, so R = -1. For shift-RIGHT we want M = N + 1, so R = +1.
 *
 * Adjacent xfers on the same bed in a single pass trip the bed-state
 * validator, so we insert `rack` ops between consecutive same-bed
 * sources as pass boundaries — the same trick `emitCableCross` uses.
 *
 * The chart-continuity validator gates the source-column requirements
 * (`chart-continuity-shift-without-source`) so the user is told to add
 * the matching no-stitch column before the bed-state simulator can
 * trip an `xfer-from-empty` error.
 */

import { b as backBed, comment, f, rack, xfer, type KnitoutOp } from '../types.js';

export interface LateralShiftInput {
  /** Direction of the shift. 'left' = worked moves LEFT (shift-1-L run); */
  /** 'right' = worked moves RIGHT (shift-1-R run). */
  direction: 'left' | 'right';
  /** Number of stitches riding on the dance (== run length); the block
   *  slides by 1 column total, not `count` columns. */
  count: number;
  /** Absolute needle index of the LEFT stitch of the DESTINATION block. */
  destLeftNeedle: number;
  /**
   * Ambient rack (Phase 0 §0.2 Axis B parity). The helper restores to
   * this value at end so the walker's subsequent passes don't need to
   * re-rack. Defaults to 0 for back-compat with the pre-Phase-4 walker.
   */
  ambientRack?: number;
}

export function emitLateralShift(input: LateralShiftInput): KnitoutOp[] {
  const { direction, count, destLeftNeedle, ambientRack = 0 } = input;
  if (count < 1) {
    throw new Error(`emitLateralShift: count must be >= 1; got ${count}.`);
  }
  // Per-stitch shift-1 semantics: source block is offset by exactly one
  // column from the destination block (regardless of run length). The
  // block slides by 1 col; the source-side edge stitch becomes a k2tog.
  const sourceLeft = direction === 'left'
    ? destLeftNeedle + 1
    : destLeftNeedle - 1;
  const ops: KnitoutOp[] = [];
  const label = `shift-${count}-${direction === 'left' ? 'L' : 'R'}`;
  ops.push(comment(`-- ${label} source f${sourceLeft}-f${sourceLeft + count - 1} -> dest f${destLeftNeedle}-f${destLeftNeedle + count - 1} --`));

  // Phase 4 ambient-rack correction (2026-05-22): see cable-cross.ts.
  // xfer destinations are ABSOLUTE — use absolute rack values during the
  // dance and restore to ambient at end.
  //
  // Phase 1: source stitches → back bed in-place. Requires rack 0.
  if (ambientRack !== 0) ops.push(rack(0));
  for (let i = 0; i < count; i++) {
    if (i > 0) ops.push(rack(0));
    ops.push(xfer(f(sourceLeft + i), backBed(sourceLeft + i)));
  }

  // Phase 2: rack to the shift offset (always ±1 for the per-stitch
  // primitive), xfer b → f at destination.
  //   shift-LEFT  (worked moves left):  M = N - 1 → R = M - N = -1
  //   shift-RIGHT (worked moves right): M = N + 1 → R = M - N = +1
  const rackForShift = direction === 'left' ? -1 : +1;
  for (let i = 0; i < count; i++) {
    if (i === 0) {
      ops.push(rack(rackForShift));
    } else {
      ops.push(rack(0));
      ops.push(rack(rackForShift));
    }
    ops.push(xfer(backBed(sourceLeft + i), f(destLeftNeedle + i)));
  }

  ops.push(rack(ambientRack));
  return ops;
}
