/**
 * Waste section + cast-on prologue for Kniterate.
 *
 * Adapted from Cameron's refactored waste-section script
 * (https://soup.agnescameron.info/2026/04/10/notes.html). The original
 * stateless version had carrier-direction bugs; this one is stateful
 * through CarriageSimulator so rows always start where the carrier is
 * parked.
 *
 * Structure produced (default-mode, 1-5 colors with draw thread):
 *   1. waste carrier brought in, ~N rows of alternating front/back
 *      interlock (creates the takedown anchor)
 *   2. draw thread carrier brought in, 1 row (separator yanked later)
 *   3. drop back-bed stitches (clean transition)
 *   4. pattern carriers brought in (still cold; first knit on row 0)
 *   5. both-beds row with the cast-on yarn for a sturdy edge
 * Returns the ops list and the simulator handoff consumed by downstream
 * sections.
 *
 * Experimental 6-color mode skips step 2 entirely (no draw thread —
 * dropping it to fit a 6th color is the explicit risk Cameron flags).
 */

import {
  comment,
  f,
  b as backBed,
  miss,
  opposite,
  type CarrierId,
  type Direction,
  type KnitoutOp,
} from '../types.js';
import {
  simulatorHandoffFromBoundary,
  type SimulatorHandoff,
} from './simulator-handoff.js';
import { CarriageSimulator } from '../sim/carriage-simulator.js';
import type { PredictedPass } from '../sim/types.js';

/** Per-pass machine settings for the waste section. the fairisle parity recipe's
 *  default ramping (matched by `WASTE_BASE_DEFAULTS`):
 *    - cast-on row: speed 100, roller 440, stitch 5
 *    - first `flatRollerPasses` post-cast-on passes: roller 0 both
 *      directions while the takedown rollers engage
 *    - subsequent passes: `<<` roller 440, `>>` roller 0 (the ramped
 *      takedown that builds the waste plug)
 *  Override any field to retune; undefined fields fall back to the
 *  engine's default values. */
export interface WasteMachineConfig {
  /** Stitch number printed on STIF/STIR throughout the waste section. */
  stitchNumber: number;
  /** Speed of the cast-on passes. */
  castOnSpeed: number;
  /** Roller advance of the cast-on passes. */
  castOnRoller: number;
  /** Number of initial waste passes knit at cast-on tension
   *  (castOnSpeed / castOnRoller) before the waste-body ramp engages.
   *  Customist's fairisle export holds 6 cast-on passes; the legacy
   *  swatch path holds 1. */
  castOnPasses: number;
  /** Number of tuck passes immediately after the cast-on tension rows.
   *  Customist fairisle uses two C6 tubular-tuck passes before the waste
   *  body resumes; default 0 preserves the legacy waste section. */
  castOnTuckPasses: number;
  /** Speed for the optional post-cast-on tubular tuck passes. */
  castOnTuckSpeed: number;
  /** Roller advance for the optional post-cast-on tubular tuck passes. */
  castOnTuckRoller: number;
  /** Speed of post-cast-on waste rows. */
  wasteSpeed: number;
  /** Number of carriage passes after the cast-on that hold roller 0
   *  before the alternating ramp kicks in. */
  flatRollerPasses: number;
  /** Roller advance for `<<` (left-going) passes once the alternating
   *  ramp engages. */
  rampRollerLeft: number;
  /** Roller advance for `>>` (right-going) passes once the alternating
   *  ramp engages. */
  rampRollerRight: number;
  /** Which bed receives the first column of the cast-on interlock.
   *  the fairisle parity reference starts on the BACK bed, so column 0 lands
   *  on back, column 1 on front, etc. Default is back-first to match. */
  castOnFirstBed: 'front' | 'back';
  /** Number of needles at each edge to leave inert (no knit) in the
   *  interlock waste rows. the fairisle parity reference leaves 1 needle inert
   *  at each edge — 60-stitch design knits 58 needles per waste row
   *  (29 fronts + 29 backs). Default 1 to match. */
  edgeInertNeedles: number;
}

export const WASTE_BASE_DEFAULTS: WasteMachineConfig = Object.freeze({
  stitchNumber: 5,
  castOnSpeed: 100,
  castOnRoller: 440,
  wasteSpeed: 300,
  flatRollerPasses: 4,
  rampRollerLeft: 440,
  rampRollerRight: 0,
  castOnFirstBed: 'back',
  edgeInertNeedles: 1,
  castOnPasses: 1,
  castOnTuckPasses: 0,
  castOnTuckSpeed: 300,
  castOnTuckRoller: 0,
});

/** Fairisle parity recipe uses stitch number 4 throughout the waste section
 *  (vs. swatch.kc's 5). Body switches to a higher stitch number — see
 *  FAIRISLE_BODY_DEFAULTS in src/knitout/kniterate/constants.ts. */
export const FAIRISLE_PARK_WASTE_DEFAULTS: WasteMachineConfig = Object.freeze({
  ...WASTE_BASE_DEFAULTS,
  stitchNumber: 4,
  // Customist holds 6 cast-on passes at 100/440, then ramps immediately
  // (no flat-roller phase).
  castOnPasses: 6,
  castOnTuckPasses: 2,
  flatRollerPasses: 0,
});

export interface WasteSectionInput {
  /** First needle of the pattern range. */
  needleStart: number;
  /** Last needle of the pattern range (inclusive). */
  needleEnd: number;
  /** Carrier dedicated to waste yarn (C6 in default mode). */
  wasteCarrier: CarrierId;
  /** Carrier for draw thread (C1 in default mode). `null` skips the
   *  draw-thread row — experimental 6-color mode. */
  drawThreadCarrier: CarrierId | null;
  /** Pattern carriers to pre-introduce so they're available for row 0. */
  patternCarriers: readonly CarrierId[];
  /** Number of interlock waste rows. Default 20. */
  wastePasses: number;
  /** Which carrier knits the both-beds cast-on row. Usually one of the
   *  pattern carriers (the dominant color). */
  castOnCarrier: CarrierId;
  /** Initial side for all freshly-brought-in carriers. Default 'left'. */
  initialSide?: 'left' | 'right';
  /** Per-column bed assignment for the both-beds cast-on row. Length
   *  must equal needleEnd - needleStart + 1. Index 0 is the column at
   *  needleStart. If omitted, the cast-on alternates by needle parity
   *  (even → front, odd → back). For charts with per-cell purl
   *  overrides, pass an explicit pattern so cast-on stitches land on
   *  the right bed per column. */
  castOnBedPattern?: ('f' | 'b')[];
  /** Per-pass machine settings. When provided, the emitter inserts
   *  x-speed-number / x-roller-advance / x-stitch-number ops to drive
   *  the kc passes' machine-knob columns to the fairisle parity reference
   *  values. When omitted, no machine-knob ops are inserted and the
   *  upstream defaults stick (legacy behavior). */
  machineConfig?: Partial<WasteMachineConfig>;
  /** Phase 4b (2026-05-24): seed the simulator's `nextDirection` to the
   *  previous section's projected end-direction so cross-section auto-
   *  move prediction stays consistent. Waste is the first section in a
   *  Track A program so the default `+` is correct; the field is here
   *  for symmetry with the other emitters. */
  initialNextDirection?: Direction;
  /** Fairisle parity (`wantsIntro`) path: knit C6 interlock continuously
   *  and skip the mid-waste drop / pattern-carrier bring-in / both-beds
   *  cast-on block (Steps 3–5). The carrier intro brings the pattern
   *  carriers in instead, and the back-bed clear transfers the interlock's
   *  residual back loops (see `residualBackBedCols`). Matches
   *  `reference/fairisle.kc`, which has no separate garment cast-on — the
   *  waste plug IS the provisional cast-on. Default false (every non-
   *  fairisle chart keeps the cast-on block). */
  continuousWaste?: boolean;
}

export interface WasteSectionResult {
  ops: KnitoutOp[];
  handoff: SimulatorHandoff;
  /** Simulator-derived active carriers at the waste/body boundary. */
  activeCarriers: readonly CarrierId[];
  /** Direction of the both-beds cast-on row, used by back-bed clear.
   *  In `continuousWaste` mode there is no cast-on row, so this carries
   *  the LAST interlock pass's direction (what the back-bed clear needs to
   *  know to pick its xfer direction). */
  castOnDirection: Direction;
  /** Per-column residual back-bed occupancy after the waste section, indexed
   *  by `col = needle - needleStart` over `[needleStart, needleEnd]`. `'b'`
   *  marks a column whose back-bed needle still holds a live loop the
   *  back-bed clear must transfer to the front; `'f'` marks none. Only the
   *  `continuousWaste` path populates this (the interlock leaves residual
   *  back loops since Step 3's drop is skipped); the default cast-on path
   *  returns `[]` and the clear keeps mirroring `castOnBedFor`. */
  residualBackBedCols: readonly ('f' | 'b')[];
  /** Phase 4 (2026-05-24): per-section CarriageSimulator predicted-pass
   *  trace. See StockinetteWalkResult.predictedPasses. */
  predictedPasses: readonly PredictedPass[];
  /** Phase 4b (2026-05-24): vendor's runtime `nextDirection` after the
   *  last logical pass in this section. Threaded into the next section's
   *  `initialNextDirection` so auto-move predictions don't drift. */
  finalNextDirection: Direction;
}

export function emitWasteSection(input: WasteSectionInput): WasteSectionResult {
  const ops: KnitoutOp[] = [];
  const initialSide = input.initialSide ?? 'left';
  const {
    needleStart,
    needleEnd,
    wasteCarrier,
    drawThreadCarrier,
    patternCarriers,
    wastePasses,
    castOnCarrier,
  } = input;

  if (needleStart < 1) {
    throw new Error(`waste-section: needleStart=${needleStart} must be >= 1 (needle 0 is not addressable on Kniterate)`);
  }
  if (needleEnd < needleStart) {
    throw new Error(`waste-section: needleEnd=${needleEnd} must be >= needleStart=${needleStart}`);
  }
  if (wastePasses < 4) {
    throw new Error(`waste-section: wastePasses=${wastePasses} must be >= 4 to engage the takedown rollers reliably`);
  }

  const sim = new CarriageSimulator({
    carriers: ['1', '2', '3', '4', '5', '6'],
    initialNextDirection: input.initialNextDirection,
  });
  const drain = () => ops.push(...sim.drainOps());

  ops.push(comment('--- WASTE SECTION ---'));

  // Per-pass machine settings (fairisle-parity).
  const mc = input.machineConfig;
  const stitchNumber = mc?.stitchNumber;
  const castOnSpeed = mc?.castOnSpeed;
  const castOnRoller = mc?.castOnRoller;
  const castOnTuckSpeed = mc?.castOnTuckSpeed;
  const castOnTuckRoller = mc?.castOnTuckRoller;
  const wasteSpeed = mc?.wasteSpeed;
  const flatRollerPasses = mc?.flatRollerPasses;
  const rampRollerLeft = mc?.rampRollerLeft;
  const rampRollerRight = mc?.rampRollerRight;
  const castOnFirstBed = mc?.castOnFirstBed ?? 'front';
  const edgeInertNeedles = Math.max(0, mc?.edgeInertNeedles ?? 0);
  const emitMachineSettings = stitchNumber !== undefined
    || castOnSpeed !== undefined
    || castOnRoller !== undefined
    || mc?.castOnPasses !== undefined
    || mc?.castOnTuckPasses !== undefined
    || castOnTuckSpeed !== undefined
    || castOnTuckRoller !== undefined
    || wasteSpeed !== undefined
    || flatRollerPasses !== undefined
    || rampRollerLeft !== undefined
    || rampRollerRight !== undefined;

  // Step 1: bring in waste carrier and knit alternating-bed interlock rows.
  sim.bringIn(wasteCarrier, { side: initialSide });
  drain();
  if (emitMachineSettings && stitchNumber !== undefined) {
    sim.setStitch(stitchNumber);
  }
  const interlockStart = needleStart + edgeInertNeedles;
  const interlockEnd = needleEnd - edgeInertNeedles;
  // Track the last interlock pass's direction so `continuousWaste` mode can
  // tell the back-bed clear which way to xfer and which columns hold residual
  // back loops (no cast-on row exists to derive these from).
  let lastInterlockDir: Direction = '+';
  for (let p = 0; p < wastePasses; p++) {
    const dir = directionForSim(sim, wasteCarrier);
    if (emitMachineSettings) {
      // Rows 0..castOnPasses-1 = cast-on tension; subsequent rows depend
      // on optional tubular tucks, then `flatRollerPasses`, then the
      // alternating ramp.
      const castOnPasses = Math.max(1, mc?.castOnPasses ?? 1);
      const castOnTuckPasses = Math.max(0, mc?.castOnTuckPasses ?? 0);
      const isCastOn = p < castOnPasses;
      const isCastOnTuck = !isCastOn && p < castOnPasses + castOnTuckPasses;
      const inFlatPhase = !isCastOn && !isCastOnTuck
        && p < castOnPasses + castOnTuckPasses + (flatRollerPasses ?? 0);
      const speed = isCastOn
        ? (castOnSpeed ?? wasteSpeed ?? 300)
        : isCastOnTuck
          ? (castOnTuckSpeed ?? wasteSpeed ?? 300)
        : (wasteSpeed ?? 300);
      const roller = isCastOn
        ? (castOnRoller ?? 0)
        : isCastOnTuck
          ? (castOnTuckRoller ?? 0)
        : inFlatPhase
          ? 0
          : (dir === '-' ? (rampRollerLeft ?? 0) : (rampRollerRight ?? 0));
      sim.setSpeed(speed);
      sim.setRoller(roller);
    }
    if (interlockEnd >= interlockStart) {
      const castOnPasses = Math.max(1, mc?.castOnPasses ?? 1);
      const castOnTuckPasses = Math.max(0, mc?.castOnTuckPasses ?? 0);
      const isCastOnTuck = p >= castOnPasses && p < castOnPasses + castOnTuckPasses;
      if (isCastOnTuck) {
        tuckInterlockRow(sim, wasteCarrier, dir, interlockStart, interlockEnd, castOnFirstBed);
      } else {
        sim.interlockRow(wasteCarrier, dir, interlockStart, interlockEnd, castOnFirstBed);
      }
      lastInterlockDir = dir;
    }
  }
  drain();

  // Step 2: draw thread (optional — skipped in experimental 6-color mode).
  if (drawThreadCarrier !== null) {
    ops.push(comment('--- DRAW THREAD ---'));
    sim.bringIn(drawThreadCarrier, { side: initialSide });
    const dir = directionForSim(sim, drawThreadCarrier);
    const passStart = dir === '+' ? needleStart : needleEnd;
    const passEnd = dir === '+' ? needleEnd : needleStart;
    sim.frontBedRow(drawThreadCarrier, dir, passStart, passEnd);
    drain();
  }

  // Continuous-waste (fairisle parity) path: the carrier intro brings the
  // pattern carriers in and the back-bed clear transfers the interlock's
  // residual back loops, so the mid-waste drop / bring-in / both-beds
  // cast-on block (Steps 3–5) is skipped entirely. Matches
  // `reference/fairisle.kc`: C6 interlock runs continuously and the garment
  // knits directly onto the waste plug (no separate cast-on row). See
  // docs/fairisle-slice-b-ground-truth.md.
  if (input.continuousWaste) {
    // The interlock alternates beds per column every pass, so after the
    // last pass every interlock column holds a live back loop (the most
    // recent back knit). Edge-inert columns were never knit → no loop →
    // marked 'f' so the clear never xfers-from-empty on them.
    const residualBackBedCols: ('f' | 'b')[] = [];
    for (let n = needleStart; n <= needleEnd; n++) {
      const inInterlock = n >= interlockStart && n <= interlockEnd;
      residualBackBedCols.push(inInterlock ? 'b' : 'f');
    }
    ops.push(comment('--- END WASTE SECTION ---'));
    const finalCarrierStates = sim.snapshot();
    return {
      ops,
      handoff: simulatorHandoffFromBoundary({ finalCarrierStates }),
      activeCarriers: sim.activeCarriers(),
      // No cast-on row; the clear keys off the last interlock pass direction.
      castOnDirection: lastInterlockDir,
      residualBackBedCols,
      predictedPasses: sim.predictedPasses(),
      finalNextDirection: sim.finalNextDirection(),
    };
  }

  // Step 3: drop back-bed stitches so we have a clean front-only fabric to
  // start the pattern on. The interlock pattern leaves loops on opposite
  // back-bed needles depending on the LAST direction:
  //   - last `+` pass: back-bed loops at ODD needles
  //   - last `-` pass: back-bed loops at EVEN needles
  // The earlier implementation only handled the `+` case, so any chart
  // compiled with the default (even) `wastePasses` left live even-needle
  // back-bed loops, which then interfered with the both-beds cast-on.
  // Conservative fix: drop EVERY needle on the back bed in range. `drop`
  // on an empty needle is a safe no-op in knitout.
  ops.push(comment('--- DROP BACK-BED WASTE STITCHES ---'));
  for (let n = needleStart; n <= needleEnd; n++) {
    sim.drop(backBed(n));
  }
  drain();

  // Step 4: pre-introduce pattern carriers so the row walker can use them.
  if (patternCarriers.length > 0) {
    ops.push(comment('--- BRING IN PATTERN CARRIERS ---'));
    for (const c of patternCarriers) {
      if (sim.positionOf(c)) continue;
      sim.bringIn(c, { side: initialSide });
    }
    drain();
  }

  // Step 5: both-beds cast-on row using the dominant cast-on carrier.
  // Each needle alternates which bed — odd needles knit on front, even on
  // back (or vice versa). This builds the sturdy interlocking edge that
  // doesn't unravel when the draw thread is removed.
  ops.push(comment('--- BOTH-BEDS CAST-ON ROW ---'));
  if (!sim.positionOf(castOnCarrier)) {
    sim.bringIn(castOnCarrier, { side: initialSide });
  }
  const castOnDir = directionForSim(sim, castOnCarrier);
  pushBothBedsCastOnRow(
    ops,
    castOnDir,
    needleStart,
    needleEnd,
    castOnCarrier,
    input.castOnBedPattern,
    sim,
  );
  drain();

  ops.push(comment('--- END WASTE SECTION ---'));
  const finalCarrierStates = sim.snapshot();
  const boundary = { finalCarrierStates };

  return {
    ops,
    handoff: simulatorHandoffFromBoundary(boundary),
    activeCarriers: sim.activeCarriers(),
    castOnDirection: castOnDir,
    residualBackBedCols: [],
    predictedPasses: sim.predictedPasses(),
    finalNextDirection: sim.finalNextDirection(),
  };
}

// (Removed pushInterlockRow / pushPlainBedRow — Phase D cutover routes
//  these through sim.interlockRow and sim.frontBedRow.)

/** Tuck variant of CarriageSimulator.interlockRow. Kept local to the
 *  waste emitter because it is only used for the Customist tubular
 *  cast-on pair; the default waste section remains knit-interlock. */
function tuckInterlockRow(
  sim: CarriageSimulator,
  carrier: CarrierId,
  direction: Direction,
  lowNeedle: number,
  highNeedle: number,
  firstColBed: 'front' | 'back',
): void {
  const firstIsFront = firstColBed === 'front';
  if (direction === '+') {
    for (let n = lowNeedle; n <= highNeedle; n++) {
      const fabricColEven = (n - lowNeedle) % 2 === 0;
      const bed = firstIsFront ? fabricColEven : !fabricColEven;
      sim.tuck(carrier, direction, { bed: bed ? 'f' : 'b', needle: n });
    }
  } else {
    for (let n = highNeedle; n >= lowNeedle; n--) {
      const fabricColEven = (n - lowNeedle) % 2 === 0;
      const bed = firstIsFront ? !fabricColEven : fabricColEven;
      sim.tuck(carrier, direction, { bed: bed ? 'f' : 'b', needle: n });
    }
  }
}

/** Both-beds cast-on row: one stitch per needle, choosing front or back
 *  bed per column. If a `bedPattern` is provided, use it (index 0 = the
 *  column at `needleStart`). Otherwise default to alternating parity. */
function pushBothBedsCastOnRow(
  ops: KnitoutOp[],
  direction: Direction,
  needleStart: number,
  needleEnd: number,
  carrier: CarrierId,
  bedPattern: ('f' | 'b')[] | undefined,
  sim: CarriageSimulator,
): void {
  const span = needleEnd - needleStart + 1;
  const bedFor = (n: number): 'f' | 'b' => {
    if (bedPattern !== undefined && bedPattern.length === span) {
      const idx = n - needleStart;
      return bedPattern[idx] ?? 'f';
    }
    // Default: alternate by needle parity (matches prior behavior, which
    // also tracked the parity flip for the reverse direction).
    if (direction === '+') {
      return n % 2 === 0 ? 'f' : 'b';
    } else {
      return n % 2 === 0 ? 'b' : 'f';
    }
  };
  if (direction === '+') {
    for (let n = needleStart; n <= needleEnd; n++) {
      const needle = bedFor(n) === 'f' ? f(n) : backBed(n);
      sim.knit(carrier, direction, needle);
    }
  } else {
    for (let n = needleEnd; n >= needleStart; n--) {
      const needle = bedFor(n) === 'f' ? f(n) : backBed(n);
      sim.knit(carrier, direction, needle);
    }
  }
  // `ops` is unused — sim has its own buffer drained by the caller. Kept
  // in the signature for grep-ability with the legacy emitter.
  void ops;
}

// Re-export for convenience in row walkers that may want to nudge carriers
// past an empty section without forming loops.
export { miss, opposite };

function directionForSim(sim: CarriageSimulator, carrier: CarrierId): Direction {
  const state = sim.positionOf(carrier);
  if (!state) {
    throw new Error(`waste-section: carrier "${carrier}" is not active`);
  }
  return state.side === 'left' ? '+' : '-';
}
