/**
 * Shared types for the CarriageSimulator subsystem.
 *
 * The simulator is an emitter that ALSO maintains a structural prediction
 * of what the vendor (`knitout-to-kcode.cjs`) will produce. Callers can
 * inspect `predictedPasses()` to reason about kc shape before the vendor
 * even runs — which is what makes byte-identical emission tractable.
 *
 * See docs/carriage-simulator-plan.md for the full architecture.
 */

import type { BedNeedle, CarrierId, Direction } from '../types.js';

export type Side = 'left' | 'right';
export type CarrierSide = Side;
export type PassArrow = '>>' | '<<';

/** Vendor pass types as they appear in the .kc text. Phase A models the
 *  subset we currently emit; Phases B-E add more as walkers cut over. */
export type PassType =
  | 'Kn-Kn'
  | 'Tu-Tu'
  | 'Kn-Tu'
  | 'Tu-Kn'
  | 'Rr-Tr'
  | 'Rl-Tr'
  | 'Rl-Rl'
  | 'Rr-Rr';

/**
 * One predicted .kc pass.
 *
 * Structural prediction only — we predict direction/type/carrier/auto-move
 * flag, NOT the FRNT/STIF needle selection strings. The vendor still owns
 * those.
 */
export interface PredictedPass {
  readonly type: PassType;
  readonly direction: PassArrow;
  /** Carriers that participate. Empty array predicts the kc line will
   *  end in carrier slot `0` (no-carrier — auto-move, xfer, drop, park). */
  readonly carriers: readonly CarrierId[];
  readonly isAutoMove: boolean;
  /** True when this pass came from a `miss`/`out` op that vendor decays
   *  to Tu-Tu. Useful when downstream tests want to distinguish a true
   *  Tu-Tu (e.g. tuck/tuck) from a decay. */
  readonly isDecay: boolean;
  /** True when this pass came from an explicit `x-park-carriage` op. */
  readonly isPark: boolean;
  readonly speed: number;
  readonly roller: number;
  /** Optional debugging hint — which simulator call produced this pass. */
  readonly source?: string;
}

/**
 * Per-carrier physical state mirrored from the vendor.
 *
 * Vendor maintains `carrier.last` (where the carrier last stitched) and
 * `carrier.kick` (where the carrier last got kicked to). Initially both
 * are null; first knit/tuck/split sets them.
 */
export interface CarrierSimState {
  readonly carrier: CarrierId;
  readonly active: boolean;
  /** Tracked side after most recent op. `'left'` means carrier sits left
   *  of all needles it has touched; `'right'` means right. */
  readonly side: Side;
  /** Last needle the carrier actually knitted on, or null pre-firstUse. */
  readonly lastNeedle: BedNeedle | null;
  readonly lastDirection: Direction | null;
  /** Last needle the carrier was kicked to. Equal to `lastNeedle` after
   *  any stitch op, but diverges after a SOFT_MISS kick. */
  readonly kickNeedle: BedNeedle | null;
  readonly kickDirection: Direction | null;
}

/** Stitch-number value the vendor accepts: 0-9 or A-Z (encoded). The
 *  simulator stores numeric 0-35 internally; emission stringifies. */
export type StitchValue = number;
