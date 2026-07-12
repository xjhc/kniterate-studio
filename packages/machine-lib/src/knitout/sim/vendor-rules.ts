/**
 * Pure predicates mirroring the vendor's pass-construction rules.
 *
 * Each function in this file is a direct port of a specific slice of
 * `src/knitout/vendor/knitout-to-kcode.cjs`. If the vendor changes, the
 * matching predicate here must change too — the
 * `test/knitout/sim/vendor-oracle.test.ts` golden tests guard against
 * drift.
 *
 * Mapped vendor slices:
 *   - slotNumber/slotString:  vendor lines 572-581
 *   - kickOthers:             vendor lines 722-795
 *   - carriageMove auto-move: vendor lines 1242-1300
 *   - `out` op shape:         vendor lines 890-928
 *   - soft-miss decay:        vendor lines 1308-1313
 *
 * What we DON'T model here (vendor owns):
 *   - FRNT/REAR string layout, STIF/STIR encoding
 *   - 4-pass vs 2-pass xfer splitting
 *   - kc text emission, ;; comment headers
 */

import type { BedNeedle, CarrierId, Direction } from '../types.js';
import type { CarrierSimState } from './types.js';

/* ----- slot math (vendor:572-581) ---------------------------------- */

export function frontSlot(needle: number): number {
  return needle;
}

export function backSlot(needle: number, racking: number): number {
  return needle + Math.floor(racking);
}

export function slotOf(n: BedNeedle, racking: number): number {
  return n.bed === 'f' ? frontSlot(n.needle) : backSlot(n.needle, racking);
}

/* ----- auto-move (vendor:1242-1300) -------------------------------- */

/** Whether the vendor will insert a Kn-Kn 0 carriage-move pass before
 *  the next pass. True iff next-pass direction ≠ current nextDirection. */
export function willAutoMove(currentNextDirection: Direction, nextDirection: Direction): boolean {
  return nextDirection !== currentNextDirection;
}

/* ----- kickOthers (vendor:722-795) --------------------------------- */

/** A predicted soft-miss kick the vendor will insert for a parked carrier
 *  that sits in the path of an upcoming knit. */
export interface PredictedKick {
  readonly carrier: CarrierId;
  readonly direction: Direction;
}

/**
 * Predict the kicks the vendor will insert before a knit/tuck/split/xfer
 * at `knitNeedle` involving carriers `cs`. Returns kicks in the order the
 * vendor will emit them (iteration order over the carrier map — which the
 * simulator preserves by storing carriers in insertion order via Map).
 *
 * NOTE: Only knit/tuck/xfer/split trigger kickOthers in the vendor;
 * plain `miss` does NOT (vendor:1023-1024).
 */
export function predictKickOthers(
  knitNeedle: BedNeedle,
  cs: readonly CarrierId[],
  racking: number,
  carriersInOrder: readonly CarrierSimState[],
): PredictedKick[] {
  const needleSlot = slotOf(knitNeedle, racking);
  const ignore = new Set(cs);
  const kicks: PredictedKick[] = [];

  for (const cstate of carriersInOrder) {
    if (ignore.has(cstate.carrier)) continue;
    if (!cstate.active) continue;
    if (cstate.lastNeedle === null) continue; // never stitched yet

    const lastSlot = slotOf(cstate.lastNeedle, racking);
    const lastDirOffset = cstate.lastDirection === '-' ? -0.1 : 0.1;
    const lastSlotSide = lastSlot + lastDirOffset;

    const kickSlot =
      cstate.kickNeedle !== null ? slotOf(cstate.kickNeedle, racking) : lastSlot;

    if (lastSlotSide < needleSlot) {
      // Parked left of the knit → kick LEFT (away).
      const alreadyKickedLeft =
        cstate.kickDirection === '-' && kickSlot <= needleSlot;
      if (!alreadyKickedLeft) {
        kicks.push({ carrier: cstate.carrier, direction: '-' });
      }
    } else if (lastSlotSide > needleSlot) {
      // Parked right of the knit → kick RIGHT.
      const alreadyKickedRight =
        cstate.kickDirection === '+' && kickSlot >= needleSlot;
      if (!alreadyKickedRight) {
        kicks.push({ carrier: cstate.carrier, direction: '+' });
      }
    }
    // lastSlotSide === needleSlot is impossible because of ±0.1 offset.
  }

  return kicks;
}

/* ----- self-kick (vendor:611-688, in merge()) ---------------------- */

/**
 * Predict whether the vendor will insert a self-kick soft-miss for the
 * new pass's own carrier, BEFORE the main pass.
 *
 * Vendor rule (vendor:611-642): when a new pass is created (not merged
 * into prev), the carrier's previous kick direction is consulted:
 *  - If kick.direction === pass.direction (matching): ALWAYS kick. The
 *    "stopping distance" of the carrier in the matching direction is
 *    unknown, so vendor inserts a soft-miss to nail down its position.
 *  - If kick.direction !== pass.direction (opposite): kick only when the
 *    carrier sits in the path of the new pass (kickSlot > passSlot for
 *    a right-going pass; kickSlot < passSlot for a left-going pass).
 *
 * Returns `null` if no kick needed, or the kick direction otherwise.
 * `null` is also returned when the carrier has never stitched
 * (`lastNeedle === null`) — `setLast` hasn't run yet, so vendor has no
 * kick state to consult.
 */
export function predictSelfKick(
  passDir: Direction,
  passSlot: number,
  carrier: CarrierSimState,
  racking: number,
): Direction | null {
  if (carrier.lastNeedle === null) return null;
  const kickNeedle = carrier.kickNeedle ?? carrier.lastNeedle;
  const kickSlot = slotOf(kickNeedle, racking);
  const kickDir = carrier.kickDirection ?? carrier.lastDirection;
  if (kickDir === null) return null;

  const oppositeDir: Direction = passDir === '+' ? '-' : '+';

  if (kickDir === passDir) {
    // matching — always kick opposite the pass direction
    return oppositeDir;
  }
  // opposite — only when in the path
  if (passDir === '+' && kickSlot > passSlot) return '-';
  if (passDir === '-' && kickSlot < passSlot) return '+';
  return null;
}

/* ----- `out` op shape (vendor:890-928) ----------------------------- */

/**
 * Predict the vendor's `out` decomposition: a leftward SOFT_MISS at the
 * RIGHTMOST `carrier.last.needle` (max slot), with `gripper:OUT` and
 * `roller:0`. Decays to a Tu-Tu line in kc output.
 *
 * Returns the carrier whose `last.needle` was chosen for the slot anchor
 * — useful for state updates downstream.
 */
export interface PredictedOut {
  readonly direction: Direction; // always '-'
  readonly anchorCarrier: CarrierId;
}

export function predictOut(
  cs: readonly CarrierId[],
  racking: number,
  carriersInOrder: readonly CarrierSimState[],
): PredictedOut {
  if (cs.length === 0) throw new Error('predictOut: empty carrier set');
  let bestSlot = -Infinity;
  let anchor: CarrierId | undefined;
  for (const cstate of carriersInOrder) {
    if (!cs.includes(cstate.carrier)) continue;
    if (cstate.lastNeedle === null) {
      throw new Error(
        `predictOut: carrier "${cstate.carrier}" has not yet stitched`,
      );
    }
    const slot = slotOf(cstate.lastNeedle, racking);
    if (slot > bestSlot) {
      bestSlot = slot;
      anchor = cstate.carrier;
    }
  }
  if (anchor === undefined) {
    throw new Error(
      `predictOut: no requested carrier (${cs.join(',')}) found in carrier map`,
    );
  }
  return { direction: '-', anchorCarrier: anchor };
}
