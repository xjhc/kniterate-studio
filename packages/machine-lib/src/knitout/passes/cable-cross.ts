/**
 * B2b (2026-05-20): cable-cross transfer choreography.
 *
 * A cable cross of width W swaps the left W/2 stitches with the right
 * W/2 stitches. The machine does this by transferring all W stitches
 * to the back bed, racking by W/2 (then -W/2), and transferring back
 * in swapped positions. The direction (`front` vs `back`) controls
 * which strand visually crosses on top — the strand transferred to
 * the back FIRST ends up underneath:
 *
 *  - CWF (left strand in front): move the right W/2 to back first.
 *  - CWB (right strand in front): move the left W/2 to back first.
 *
 * The cross row is a real knit row: after the dance fires, the walker's
 * normal knit pass over the affected cells (which carry the parent cable
 * tile's footprint op 'knit') anchors the swapped stitches with new loops.
 *
 * Adjacent xfers on the same bed in a single pass trip the Kniterate
 * bed-state validator (cheatsheet rule: spread adjacent transfers across
 * passes). We insert `rack` ops between adjacent same-bed sources to
 * act as pass boundaries.
 *
 * --- Batch D Phase 0 §0.2 ADR (2026-05-22) ---
 *
 * Axis A: helper shape. We keep `emitCableCross` as the symmetric
 * C2/4/6/8 path so the existing 34 fabric-IR fixtures stay byte-frozen.
 * Asymmetric cables-over-purl (LPC/RPC) and 1×1 travellers (LT/RT) land
 * in Phase 1 via sibling helpers `emitAsymmetricCableCross` and
 * `emitTraveller` (stubs below). Each new helper carries its own
 * outside-in transfer ordering; reusing `emitCableCross` with a fake
 * symmetric width would lie to the visualizer and the bed-state
 * validator.
 *
 * Axis B: ambient rack threading. The Phase 4 row-rack schedule lets
 * the walker carry a non-zero rack into rows that also contain cable
 * helpers. Every helper takes an `ambientRack` parameter (default 0
 * for back-compat with existing callers); rack ops emit `rack(ambient
 * + delta)` during the dance and restore to `rack(ambient)` at the
 * end instead of clobbering the carriage state with `rack(0)`. With
 * `ambientRack = 0` the byte output is identical to the pre-Phase-0
 * version.
 *
 * Axis C: schema. `KnitlabCableSpan` carries optional `workedWidth`
 * and `purlWidth` (`src/colorwork/knitlab1-contract.ts`); both
 * `ChartCableEvent` (`src/colorwork/cable-events-from-chart.ts`) and
 * `CableScheduleEvent` (`src/knitout/passes/stockinette.ts`) plumb
 * them through. Legacy cables omit them and consumers default to
 * `floor(width / 2)`.
 */

import { b as backBed, comment, f, rack, xfer, type KnitoutOp } from '../types.js';

export type CableWidth = 2 | 4 | 6 | 8;

export interface CableCrossInput {
  /** Direction of the front-most strand. */
  direction: 'front' | 'back';
  /** Width of the cable (number of stitches involved). Supported: 2, 4, 6, 8. */
  width: CableWidth;
  /** Absolute needle index of the LEFT stitch on the front bed. */
  leftNeedle: number;
  /**
   * Ambient rack the carriage is already at when the helper fires
   * (Phase 0 §0.2 Axis B). Defaults to 0. The helper restores to this
   * value at end so the walker's subsequent passes do not need to
   * re-rack.
   */
  ambientRack?: number;
}

/** Width-2 entry point preserved for callers that still address the old
 *  helper by name. New callers should use `emitCableCross`. */
export function emitCableCrossWidth2(input: { direction: 'front' | 'back'; leftNeedle: number; ambientRack?: number }): KnitoutOp[] {
  return emitCableCross({ ...input, width: 2 });
}

export function emitCableCross(input: CableCrossInput): KnitoutOp[] {
  const { direction, width, leftNeedle: n, ambientRack = 0 } = input;
  if (width !== 2 && width !== 4 && width !== 6 && width !== 8) {
    throw new Error(`emitCableCross: unsupported cable width ${width}; expected 2 | 4 | 6 | 8.`);
  }
  const half = width / 2;
  const ops: KnitoutOp[] = [];
  const label = `C${width}${direction === 'front' ? 'F' : 'B'}`;
  ops.push(comment(`-- cable ${label} @ f${n}-f${n + width - 1} --`));

  // Phase 1: move all `width` stitches from front bed to back bed.
  // Order matters for visual layering: the half that goes back FIRST
  // ends up visually under the other half after the cross. So:
  //   - direction='front' (CWF, left strand in front): right half first
  //   - direction='back'  (CWB, right strand in front): left half first
  // Within each half, walk outside-in (right→left for right half, left→right
  // for left half) so consecutive xfers are still adjacent and need a
  // rack(0) separator between them.
  //
  // Phase 4 ambient-rack correction (2026-05-22): the in-place f→b xfers
  // require ABSOLUTE rack=0 (the bed-state rule is `xfer f(N) → b(M)` at
  // rack R needs `M = N - R`, so `M = N` requires `R = 0`). The earlier
  // `ambientRack + delta` formulation was wrong; it accidentally worked
  // only at ambient=0 because 0+delta = delta. Use absolute deltas here;
  // the helper restores to `ambientRack` at the end so the walker's
  // subsequent passes don't need to re-rack.
  const firstHalf = direction === 'front'
    ? rangeDesc(n + half, n + width - 1) // right half, right-to-left
    : rangeAsc(n, n + half - 1);          // left half, left-to-right
  const secondHalf = direction === 'front'
    ? rangeDesc(n, n + half - 1)          // left half, right-to-left
    : rangeAsc(n + half, n + width - 1);  // right half, left-to-right

  // If we're at non-zero ambient, reset to rack 0 before the in-place
  // xfers. At ambient 0 this is a no-op (byte-identical with pre-Phase-4).
  if (ambientRack !== 0) ops.push(rack(0));
  appendXfersToBackInPlace(ops, firstHalf);
  ops.push(rack(0)); // separator between the two halves
  appendXfersToBackInPlace(ops, secondHalf);

  // Phase 2: rack +half (absolute), transfer back-left-half to front-right
  // positions. xfer b(N) → f(N+half) at rack=+half requires M = N + R =
  // N + half ✓.
  for (let i = 0; i < half; i++) {
    if (i === 0) {
      ops.push(rack(half));
    } else {
      ops.push(rack(0));
      ops.push(rack(half));
    }
    ops.push(xfer(backBed(n + i), f(n + i + half)));
  }

  // Phase 3: rack -half (absolute), transfer back-right-half to front-left.
  for (let i = 0; i < half; i++) {
    if (i === 0) {
      ops.push(rack(-half));
    } else {
      ops.push(rack(0));
      ops.push(rack(-half));
    }
    ops.push(xfer(backBed(n + i + half), f(n + i)));
  }
  // Restore the carriage to ambient so subsequent ops inherit it.
  ops.push(rack(ambientRack));
  return ops;
}

/**
 * Phase 1 (Batch D) sibling helper: 1×1 traveller (LT/RT).
 *
 * Mechanically identical to C2F/C2B at width=2 — the two stitches live
 * on the front bed and swap via the same four-phase f→b→f dance — but
 * the named entry point keeps chart-level "LT/RT" distinct from
 * "cable needle held in front/back" in instruction output. Implemented
 * as a thin wrapper over `emitCableCross(width=2)`.
 */
export interface TravellerInput {
  /** Direction of the cross: `'front'` = LT (left over right), `'back'` = RT (right over left). */
  direction: 'front' | 'back';
  /** Absolute needle index of the LEFT stitch on the front bed. */
  leftNeedle: number;
  /** Ambient rack (Phase 0 §0.2 Axis B). */
  ambientRack?: number;
}

export function emitTraveller(input: TravellerInput): KnitoutOp[] {
  // Mechanically identical to C2F/C2B at width=2 — both stitches live on
  // the front bed and swap via the same f→b→f dance. The named entry
  // point exists so chart-level "LT/RT" stays distinct from "cable
  // needle held in front/back" in render / instruction output, but the
  // helper just delegates.
  const ops: KnitoutOp[] = [];
  const label = input.direction === 'front' ? 'LT' : 'RT';
  ops.push(comment(`-- traveller ${label} @ f${input.leftNeedle}-f${input.leftNeedle + 1} --`));
  ops.push(...emitCableCross({
    direction: input.direction,
    width: 2,
    leftNeedle: input.leftNeedle,
    ambientRack: input.ambientRack ?? 0,
  }));
  return ops;
}

/**
 * Phase 1 (Batch D) sibling helper: asymmetric cable-over-purl cross
 * (LPC/RPC family).
 *
 * Total crossed stitches = `workedWidth + purlWidth`. Worked stitches
 * live on the front bed when the cross fires; purls live on the back
 * bed (placed there by the row immediately below the cable row, which
 * must purl the right columns — `validateCablePurlBackground` in
 * `compile-chart.ts` gates this at chart-level so the bed-state
 * simulator doesn't have to). Implementation in `emitAsymmetricCableCross`
 * below; the four-phase routine is documented inline.
 */
export interface AsymmetricCableCrossInput {
  /** Direction of the worked strand: `'front'` = worked passes in front of purl bg. */
  direction: 'front' | 'back';
  /** Stitch count on the worked (knit) side. */
  workedWidth: number;
  /** Stitch count on the purl-background side. */
  purlWidth: number;
  /** Absolute needle index of the LEFT stitch on the front bed. */
  leftNeedle: number;
  /** Ambient rack (Phase 0 §0.2 Axis B). */
  ambientRack?: number;
}

export function emitAsymmetricCableCross(input: AsymmetricCableCrossInput): KnitoutOp[] {
  // Cable-over-purl cross. Worked stitches live on the front bed (knit
  // face); purls live on the back bed (placed there by the overrides
  // walker's first knit pass on the b-bed for those columns).
  //
  // Layout convention:
  //   - direction='front' (LPC, "Left Purl Cross"): worked starts on
  //     the RIGHT of the cable footprint and moves LEFT across the
  //     purl background.
  //   - direction='back'  (RPC, "Right Purl Cross"): worked starts on
  //     the LEFT and moves RIGHT.
  //
  // Choreography (4 phases). Each phase batches xfers that share the
  // same rack; an intervening rack op acts as a pass boundary between
  // adjacent same-bed xfers per the Kniterate bed-state validator.
  //
  // 1. Worked stitches xfer f → b in place (scratch).
  // 2. Purls xfer b → f at their FINAL positions (rack ±workedWidth).
  // 3. Worked xfer b → f at their FINAL positions (rack ∓purlWidth).
  // 4. Purls xfer f → b at their FINAL positions (rack 0).
  //
  // Conflict avoidance: after phase 1, the worked-side front-bed cells
  // are empty; after phase 2, the purl front-bed cells sit at their
  // post-cross columns, leaving the WORKED final positions empty for
  // phase 3 to land into. Verified by hand for 1/1, 1/2, 2/1 layouts.
  const { direction, workedWidth, purlWidth, leftNeedle: n, ambientRack = 0 } = input;
  if (workedWidth < 1 || purlWidth < 1) {
    throw new Error(
      `emitAsymmetricCableCross: workedWidth and purlWidth must each be >= 1; got ${workedWidth}/${purlWidth}.`,
    );
  }
  const total = workedWidth + purlWidth;
  const ops: KnitoutOp[] = [];
  const labelKind = direction === 'front' ? 'LPC' : 'RPC';
  ops.push(comment(`-- ${labelKind} ${workedWidth}/${purlWidth} @ f${n}-f${n + total - 1} --`));

  let workedStart: number;
  let purlStart: number;
  let workedFinal: number;
  let purlFinal: number;
  if (direction === 'front') {
    workedStart = n + purlWidth;
    purlStart = n;
    workedFinal = n;
    purlFinal = n + workedWidth;
  } else {
    workedStart = n;
    purlStart = n + workedWidth;
    workedFinal = n + purlWidth;
    purlFinal = n;
  }

  // Phase 4 ambient-rack correction (2026-05-22): xfer destinations are
  // computed from ABSOLUTE rack (not ambient + delta). The earlier
  // formulation worked only at ambient=0; at non-zero ambient the
  // bed-state validator caught the misalignment. Use absolute racks
  // throughout; restore to ambient at the end.
  //
  // Phase 1: worked stitches → back bed at their original columns.
  // In-place f→b requires rack 0.
  if (ambientRack !== 0) ops.push(rack(0));
  for (let i = 0; i < workedWidth; i++) {
    if (i > 0) ops.push(rack(0));
    ops.push(xfer(f(workedStart + i), backBed(workedStart + i)));
  }

  // Phase 2: purls → front bed at FINAL columns.
  //   LPC: purls shift RIGHT by workedWidth → rack(+workedWidth)
  //   RPC: purls shift LEFT by workedWidth  → rack(-workedWidth)
  const purlPhaseRack = direction === 'front' ? +workedWidth : -workedWidth;
  for (let i = 0; i < purlWidth; i++) {
    if (i === 0) {
      ops.push(rack(purlPhaseRack));
    } else {
      ops.push(rack(0));
      ops.push(rack(purlPhaseRack));
    }
    ops.push(xfer(backBed(purlStart + i), f(purlFinal + i)));
  }

  // Phase 3: worked → front bed at FINAL columns.
  //   LPC: worked shifts LEFT by purlWidth  → rack(-purlWidth)
  //   RPC: worked shifts RIGHT by purlWidth → rack(+purlWidth)
  const workedPhaseRack = direction === 'front' ? -purlWidth : +purlWidth;
  for (let i = 0; i < workedWidth; i++) {
    if (i === 0) {
      ops.push(rack(workedPhaseRack));
    } else {
      ops.push(rack(0));
      ops.push(rack(workedPhaseRack));
    }
    ops.push(xfer(backBed(workedStart + i), f(workedFinal + i)));
  }

  // Phase 4: purls → back bed at FINAL columns. In-place f→b requires rack 0.
  for (let i = 0; i < purlWidth; i++) {
    ops.push(rack(0));
    ops.push(xfer(f(purlFinal + i), backBed(purlFinal + i)));
  }

  // Restore to ambient so subsequent walker passes inherit it.
  ops.push(rack(ambientRack));
  return ops;
}

function appendXfersToBackInPlace(ops: KnitoutOp[], needles: number[]): void {
  // In-place f→b xfers ALWAYS require absolute rack 0. Separators
  // between adjacent same-bed sources are rack(0) for the same reason.
  for (let i = 0; i < needles.length; i++) {
    if (i > 0) ops.push(rack(0));
    ops.push(xfer(f(needles[i]!), backBed(needles[i]!)));
  }
}

function rangeAsc(start: number, end: number): number[] {
  const out: number[] = [];
  for (let i = start; i <= end; i++) out.push(i);
  return out;
}

function rangeDesc(start: number, end: number): number[] {
  const out: number[] = [];
  for (let i = end; i >= start; i--) out.push(i);
  return out;
}
