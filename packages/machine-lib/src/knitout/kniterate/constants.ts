/**
 * Kniterate machine constants. Values from the Kniterate product page,
 * the knitout-backend-kniterate README, and Agnes Cameron's working
 * notes — see docs/knitlab1-kniterate-export-plan.md §4 for sources.
 */

import type { CarrierId, KniterateExtensionHeaders, Position } from '../types.js';

/** Total needles per bed at 7gg / 3.63mm pitch. */
export const KNITERATE_NEEDLE_COUNT = 252;

/** Cameron's advice: don't start a design at needle 0; center around at
 *  least needle 50 to give the carriages safe start positions. */
export const KNITERATE_MIN_RECOMMENDED_NEEDLE = 1;
export const KNITERATE_PREFERRED_NEEDLE_OFFSET_FLOOR = 50;

/** Knitlab default machine profile — Chelsea convention: draw thread on
 *  carrier 1, waste yarn on carrier 6, pattern colors on 2-5. */
export const DRAW_THREAD_CARRIER: CarrierId = '1';
export const WASTE_YARN_CARRIER: CarrierId = '6';
export const DEFAULT_PATTERN_CARRIERS: readonly CarrierId[] = ['2', '3', '4', '5'];

/** Pattern-color caps per operating mode.
 *  - DEFAULT (4): C2-C5 pattern, C1 reserved for draw thread, C6 for
 *    waste yarn. Cameron's reservations honored.
 *  - ADVANCED (5): pseudo-threshold — exists for the validator's
 *    error message to name the "5-color" case explicitly, but post-G18
 *    (2026-05-18) the engine has no 5-color mode that keeps both
 *    reservations. Five pattern colors require experimental mode.
 *  - EXPERIMENTAL (6): C1-C6 all pattern, no draw thread. Cast-on
 *    separation is harder; opt-in only. See doc §6.3 + memory
 *    [[reference-cameron-kniterate-conventions]]. */
export const MAX_PATTERN_COLORS_DEFAULT = 4;
export const MAX_PATTERN_COLORS_ADVANCED = 5;
export const MAX_PATTERN_COLORS_EXPERIMENTAL = 6;

/** Default machine settings, calibrated for **7gg / 3.63mm wool worsted**
 *  (Cameron's reference yarn). Values track her 2025-09-20 notes on
 *  soup.agnescameron.info: stitch 6, transferStitch 5, speed 300,
 *  rollerAdvance 100-450 — we pick 200 as a midrange that doesn't tear
 *  thin fabric but engages takedown reliably for 7gg. Other yarn weights
 *  (cotton, lace, bulky) need a swatch; the wizard surfaces these for
 *  per-project override. See [[reference-cameron-kniterate-conventions]]
 *  in agent memory. */
export const DEFAULT_KNITERATE_HEADERS = {
  rollerAdvance: 200,
  stitchNumber: 6,
  xferStitchNumber: 5,
  speedNumber: 300,
  carrierSpacing: 2,
  carrierStoppingDistance: 2.5,
  xferStyle: 'four-pass',
} as const satisfies KniterateExtensionHeaders;

export const DEFAULT_POSITION: Position = 'Center';
/** Kniterate's start-of-knit doc recommends ~80 interlock rows of waste
 *  before pattern body so the fabric "pulls itself down until it's caught
 *  by the rollers." Cameron's posts use 80+. Earlier 20 default risked
 *  not engaging the takedown rollers before the pattern started. */
export const DEFAULT_WASTE_PASSES = 80;
export const DEFAULT_MAX_FLOAT_STITCHES = 5;

/** Allowed racking increments. Kniterate accepts integer or ±0.5; Shima's
 *  ±0.25 is rejected. */
export const RACK_INCREMENT = 0.5;

/** the fairisle parity recipe's fairisle body settings (matches the `Kn-Kn N 200 450`
 *  passes in `reference/fairisle.kc` body rows). Pair with
 *  `FAIRISLE_PARK_WASTE_DEFAULTS` in src/knitout/passes/waste-section.ts
 *  (waste/cast-on at stitch 4 / speed 100 / roller 440 → 0). */
export const FAIRISLE_BODY_DEFAULTS = {
  rollerAdvance: 450,
  stitchNumber: 9,
  xferStitchNumber: 5,
  speedNumber: 200,
  carrierSpacing: 2,
  carrierStoppingDistance: 2.5,
  xferStyle: 'four-pass',
} as const satisfies KniterateExtensionHeaders;

/** Largest practical racking magnitude on the Kniterate. `isLegalRack`
 *  only validates the *increment* (integer or ±0.5); the bed also can't
 *  shift arbitrarily far. Both reference hats (and Customist's exports)
 *  keep every transfer within ±4, so emitters that gather/cascade should
 *  bound their shifts to this. */
export const KNITERATE_MAX_RACK = 4;

export function isLegalRack(offset: number): boolean {
  if (!Number.isFinite(offset)) return false;
  const doubled = offset * 2;
  return Number.isInteger(doubled);
}

/** Pick the carrier the waste yarn should load on in experimental mode.
 *
 *  G18.2 (2026-05-18): shared between the engine
 *  (`src/knitout/plan/compile-chart.ts`) and the notes generator
 *  (`src/knitout/export-helpers.ts`) so the waste section, the user-facing
 *  instructions, and the binding-map stay in lockstep. Previously the
 *  engine returned `patternCarriers[length-1]` while the notes generator
 *  found the first unbound carrier — for a 5-color experimental flow with
 *  C1-C5 bound, engine picked C5 (waste appeared in gold) while notes
 *  told the user to thread C6. Same dual-purpose bug G18 was supposed to
 *  eliminate, just gated behind the experimental flag.
 *
 *  Returns `isShared: true` only when all six carriers are bound (true
 *  6-color experimental) — in that case there is no spare carrier and the
 *  waste yarn must share with the last pattern color. The notes generator
 *  surfaces this case explicitly so the user isn't told to load a phantom
 *  carrier. */
export function selectExperimentalWasteCarrier(
  patternCarriers: readonly CarrierId[],
): { carrier: CarrierId; isShared: boolean } {
  const bound = new Set(patternCarriers);
  // Prefer C6 (Cameron's reserved waste carrier), then walk back. Walking
  // from C6 → C1 keeps Cameron's convention intact when a spare exists.
  for (const c of ['6', '5', '4', '3', '2', '1'] as const) {
    if (!bound.has(c)) return { carrier: c, isShared: false };
  }
  // All six bound — waste shares a carrier with a pattern color. Pick C6
  // by convention; the caller is responsible for warning the user that
  // the waste section will knit in that pattern color.
  return { carrier: '6', isShared: true };
}
