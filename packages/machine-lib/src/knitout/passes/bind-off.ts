/**
 * Bind-off for Kniterate. Four options:
 *
 *  - `'machine-bindoff'` — Kniterate xfer-style chain bind-off, matching
 *    the fairisle parity recipe's reference output (see
 *    `/reference/color-swatch-bindoff.kc`) and Cameron's Shima-style
 *    sequence from https://soup.agnescameron.info/2026/04/01/transfers.html.
 *    Per stitch: xfer f→b, rack ±1, xfer b→f (stacking on neighbor),
 *    rack 0, soft-miss to wrap the carrier back, then knit the merged
 *    pair. Four carriage passes per stitch with the carrier ending where
 *    it started — keeps the vendor compiler from inserting auto-moves
 *    between bind-off steps. (Cameron's blog also shows `rack 0.25`
 *    mid-sequence; that's Shima syntax leaking through and we drop it
 *    — Kniterate accepts integer or ±0.5 only.)
 *
 *  - `'waste-and-drop'` — knit several rows of waste yarn over the live
 *    stitches, then drop. The fabric releases cleanly via the waste; user
 *    binds off by hand. Safest for early swatching; recommended default.
 *
 *  - `'drop'` — just drop the live stitches. For throwaway test swatches
 *    only.
 *
 *  - `'fairisle-park-bindoff'` (Phase 4, 2026-05-23) — closing-waste
 *    section + naked drop pass + Tu-Tu park-out per carrier. Matches the
 *    end of `reference/fairisle.kc` (rows 206-end): N rows of
 *    front-bed-only carrier-6 knit at speed 150 with a downward STIF
 *    ramp (body STIF → 6), an `x-park-carriage` drop pass at speed 150
 *    / roller 450 / STIF 4, then `out` for each remaining active
 *    carrier in numeric order. Only valid in floats mode (front-bed
 *    body); other modes route the bind-off through a fallback.
 */

import {
  comment,
  f,
  b as backBed,
  type CarrierId,
  type Direction,
  type KnitoutOp,
} from '../types.js';
import {
  seedSimulatorCarrierFromHandoff,
  type SimulatorHandoff,
} from './simulator-handoff.js';
import {
  CarriageSimulator,
} from '../sim/carriage-simulator.js';
import type { CarrierSimState, PredictedPass } from '../sim/types.js';

export type BindOffStyle =
  | 'machine-bindoff'
  | 'waste-and-drop'
  | 'drop'
  | 'fairisle-park-bindoff';

/** Fairisle parity defaults for the chain bind-off. The xfer pair runs
 *  slower (speed 120, stitch 4) than the knit (speed 300, stitch 6), and
 *  the knit's roller advance ramps down as the live-stitch width shrinks
 *  — high pull at the start, easing as the corner forms. Exposed on
 *  BindOffInput so the wizard can override them. */
export interface BindOffMachineConfig {
  /** Speed during the front→back and back→front xfer passes. */
  xferSpeed: number;
  /** STIF/STIR stitch number printed on the xfer passes. */
  xferStitch: number;
  /** Speed of the knit-merge pass (and the carrier-wrap soft-miss that
   *  precedes it). Body speed; usually 300. */
  knitSpeed: number;
  /** STIF stitch number printed on the knit-merge pass. */
  knitStitch: number;
  /** Per-iteration roller advance for the knit-merge pass. The wizard
   *  may emit a ramp (high pull on the first stitches, tapering as the
   *  fabric narrows) or a single value held flat. If the array is
   *  shorter than the iteration count, the last value sticks for the
   *  remaining iterations. */
  knitRollerRamp: number[];
}

export const CHAIN_BINDOFF_DEFAULTS: BindOffMachineConfig = Object.freeze({
  xferSpeed: 120,
  xferStitch: 4,
  knitSpeed: 300,
  knitStitch: 6,
  // Reference ramp from reference/color-swatch-bindoff.kc: 250, 200,
  // 150×5, then 100 held for the rest.
  knitRollerRamp: [250, 200, 150, 150, 150, 150, 150, 100],
});

/** Fairisle closing-waste config. Matches rows 206-end of
 *  `reference/fairisle.kc`. */
export interface FairisleParkConfig {
  /** Carrier used for the closing-waste knit rows. Reference: C6. */
  closingWasteCarrier: CarrierId;
  /** Speed for closing-waste knit rows. Reference: 150. */
  closingWasteSpeed: number;
  /** Roller advance for closing-waste knit rows. Reference: 450. */
  closingWasteRoller: number;
  /** STIF ramp for the closing-waste rows. One pass per value, knit by
   *  the closing-waste carrier alternating direction. Reference is
   *  16 rows: 8 at STIF=9 then 8 at STIF=6. The row count must produce
   *  an EVEN total so the carriage ends parked on the left and the
   *  park pass goes `>>` (matches the reference). */
  closingWasteStitchRamp: number[];
  /** Speed for the final drop pass + Tu-Tu park-outs. Reference: 150. */
  parkSpeed: number;
  /** Roller advance for the final drop pass (presser roller for the
   *  `x-park-carriage` Kn-Kn 0 line). Reference: 450. */
  parkRoller: number;
  /** STIF stitch number on the final drop pass. Reference: 4. */
  parkStitch: number;
  /** Speed for the auto-move that the vendor inserts between the park
   *  pass and the first carrier-out Tu-Tu. Set via `x-presser-speed`.
   *  Reference: 600. */
  parkAutoMoveSpeed: number;
  /** Roller-advance for that same auto-move. Reference: 0. */
  parkAutoMoveRoller: number;
}

export const FAIRISLE_PARK_BINDOFF_DEFAULTS: FairisleParkConfig = Object.freeze({
  closingWasteCarrier: '6',
  closingWasteSpeed: 150,
  closingWasteRoller: 450,
  // 16 rows: 8 at STIF=9, 8 at STIF=6. Matches the reference's
  // down-ramp (rows 206-221). EVEN row count is load-bearing: with the
  // closing-waste carrier brought in at 'left', 16 alternating passes
  // end with the carriage on the LEFT, so the park pass goes `>>` to
  // match the reference's `>> Kn-Kn 0 150 450` line.
  closingWasteStitchRamp: [9, 9, 9, 9, 9, 9, 9, 9, 6, 6, 6, 6, 6, 6, 6, 6],
  parkSpeed: 150,
  parkRoller: 450,
  parkStitch: 4,
  parkAutoMoveSpeed: 600,
  parkAutoMoveRoller: 0,
});

export interface BindOffInput {
  style: BindOffStyle;
  needleStart: number;
  needleEnd: number;
  /** Carrier holding live stitches (typically the dominant pattern
   *  color from the last row knitted). */
  knitCarrier: CarrierId;
  /** Required for 'waste-and-drop'. Carrier providing the waste yarn for
   *  the release rows. */
  wasteCarrier?: CarrierId;
  /** Number of waste rows to knit before dropping. Default 6. */
  wasteRows?: number;
  /** Compatibility boundary state at bind-off time. Bind-off seeds the
   *  simulator from it and returns boundary facts for the compiler to
   *  apply after the section. */
  handoff: SimulatorHandoff;
  /** Optional per-pass machine settings for the chain bind-off. Defaults
   *  to {@link CHAIN_BINDOFF_DEFAULTS} (the fairisle parity
   *  reference). Only used by `style: 'machine-bindoff'`. */
  machineConfig?: Partial<BindOffMachineConfig>;
  /** Per-pass machine settings for the fairisle-park-bindoff bind-off.
   *  Defaults to {@link FAIRISLE_PARK_BINDOFF_DEFAULTS}. Only used by
   *  `style: 'fairisle-park-bindoff'`. */
  fairisleParkConfig?: Partial<FairisleParkConfig>;
  /** Phase 4b (2026-05-24): seed the simulator's `nextDirection` from
   *  the previous section's projected end-direction. */
  initialNextDirection?: Direction;
  /** DBJ-garment campaign (2026-06-10): the body walker homed birdseye
   *  lining onto the front bed, so live needles hold DOUBLED loops.
   *  `machine-bindoff` knits one consolidation row before chaining so
   *  the chain walks singles (the reference chains doubles at 4-loop
   *  stacks — above our bed-state gate). Waste/drop styles need no
   *  change: the first waste row merges the doubles, drop drops them. */
  linedBackBed?: boolean;
}

export interface BindOffResult {
  ops: KnitoutOp[];
  /** Phase 4 (2026-05-24): per-section CarriageSimulator predicted-pass
   *  trace. Populated for styles that emit carrier-bearing passes through
   *  the simulator (`machine-bindoff`, `waste-and-drop`, `drop`,
   *  `fairisle-park-bindoff`). */
  predictedPasses: readonly PredictedPass[];
  /** Phase 4b (2026-05-24): vendor's runtime `nextDirection` after the
   *  last logical pass in this section. Sim-backed styles derive this
   *  from `CarriageSimulator.finalNextDirection()`. */
  finalNextDirection: Direction;
  finalCarrierStates: ReadonlyMap<CarrierId, CarrierSimState>;
  releasedCarriers: readonly CarrierId[];
}

export function emitBindOff(input: BindOffInput): BindOffResult {
  const ops: KnitoutOp[] = [];
  let predictedPasses: readonly PredictedPass[] = [];
  let finalNextDirection: Direction = input.initialNextDirection ?? '+';
  let finalCarrierStates: ReadonlyMap<CarrierId, CarrierSimState> = new Map();
  let releasedCarriers: readonly CarrierId[] = [];
  switch (input.style) {
    case 'machine-bindoff': {
      const result = emitMachineBindOff(input);
      ops.push(...result.ops);
      predictedPasses = result.predictedPasses;
      finalNextDirection = result.finalNextDirection;
      finalCarrierStates = result.finalCarrierStates;
      releasedCarriers = result.releasedCarriers;
      break;
    }
    case 'waste-and-drop': {
      const result = emitWasteAndDrop(input);
      ops.push(...result.ops);
      predictedPasses = result.predictedPasses;
      finalNextDirection = result.finalNextDirection;
      finalCarrierStates = result.finalCarrierStates;
      releasedCarriers = result.releasedCarriers;
      break;
    }
    case 'drop': {
      const result = emitDrop(input);
      ops.push(...result.ops);
      predictedPasses = result.predictedPasses;
      finalNextDirection = result.finalNextDirection;
      finalCarrierStates = result.finalCarrierStates;
      releasedCarriers = result.releasedCarriers;
      break;
    }
    case 'fairisle-park-bindoff': {
      const result = emitFairisleParkBindoff(input);
      ops.push(...result.ops);
      predictedPasses = result.predictedPasses;
      finalNextDirection = result.finalNextDirection;
      finalCarrierStates = result.finalCarrierStates;
      releasedCarriers = result.releasedCarriers;
      break;
    }
  }
  return {
    ops,
    predictedPasses,
    finalNextDirection,
    finalCarrierStates,
    releasedCarriers,
  };
}

function emitMachineBindOff(input: BindOffInput): BindOffResult {
  const { needleStart, needleEnd, knitCarrier, handoff } = input;
  const config: BindOffMachineConfig = {
    ...CHAIN_BINDOFF_DEFAULTS,
    ...(input.machineConfig ?? {}),
  };
  const ops: KnitoutOp[] = [];
  ops.push(comment('--- BIND OFF (machine xfer-style) ---'));
  const sim = new CarriageSimulator({
    carriers: ['1', '2', '3', '4', '5', '6'],
    initialNextDirection: input.initialNextDirection,
  });
  seedActiveCarriersForBindOff(sim, handoff, needleStart, needleEnd);
  const drain = () => ops.push(...sim.drainOps());

  // Bind-off consumes stitches left→right. Each iteration's merged stitch
  // lives at the RIGHT neighbor (rack +1 shifts the back-bed right; the
  // b→f transfer lands at f(n+1)). The knit always travels right→left so
  // the carrier ends parked on the LEFT — far from the next iteration's
  // active needles, which are moving rightward. Keeping the carrier clear
  // of the xfer needles is what prevents the vendor compiler from
  // inserting per-iteration kick passes; the resulting choreography
  // matches the fairisle parity recipe's reference (Tr-Rr / Rl-Tr / Tu-Tu / Kn-Kn,
  // four carriage passes per stitch).
  const order = rangeAsc(needleStart, needleEnd);
  const direction: Direction = '-';

  // Lined fabric: the walker homed the lining, so every live front
  // needle holds 2 loops. Knit one consolidation row first; the chain
  // below then walks singles (max stack 2 instead of 4).
  if (input.linedBackBed) {
    ops.push(comment('-- lined chain bind-off: consolidate doubled loops --'));
    const side = sideOfSim(sim, knitCarrier);
    const dir: Direction = side === 'left' ? '+' : '-';
    if (dir === '+') {
      sim.frontBedRow(knitCarrier, dir, needleStart, needleEnd);
    } else {
      sim.frontBedRow(knitCarrier, dir, needleEnd, needleStart);
    }
    drain();
  }

  // Pre-position the knit carrier on the LEFT (away from the bind-off
  // needles, which march rightward). Emit a leftward miss if it's
  // currently parked on the right; that also flips the vendor's
  // `nextDirection` to right, so iteration 1's first xfer is Tr-Rr
  // going right — matching the reference's per-stitch shape exactly.
  if (order.length > 0 && sideOfSim(sim, knitCarrier) === 'right') {
    sim.miss(knitCarrier, '-', f(needleStart));
    drain();
  }

  const ramp = config.knitRollerRamp;
  for (let i = 0; i < order.length - 1; i++) {
    const n = order[i]!;
    const next = order[i + 1]!;
    // Xfer pair (no carrier engaged). Slow speed + small stitch number
    // gives the back-bed transfer time to settle without snagging.
    sim.setSpeed(config.xferSpeed, { force: true });
    sim.setXferStitch(config.xferStitch, { force: true });
    sim.xferBatch([{ from: f(n), to: backBed(n) }]);
    sim.setRacking(1);
    sim.xferBatch([{ from: backBed(n), to: f(next) }]);
    sim.setRacking(0);
    // Knit-merge pass. Body speed; per-iteration roller advance ramps
    // the takedown pull as the live-stitch width shrinks.
    sim.setSpeed(config.knitSpeed, { force: true });
    sim.setStitch(config.knitStitch, { force: true });
    const rollerAdvance = ramp[Math.min(i, ramp.length - 1)] ?? 100;
    sim.setRoller(rollerAdvance, { force: true });
    sim.knit(knitCarrier, direction, f(next));
    drain();
  }
  // Drop the final (rightmost) stitch — it has no neighbor left to merge
  // with on the right.
  if (order.length > 0) {
    sim.drop(f(order[order.length - 1]!));
    drain();
  }

  // Release the knit carrier — at end-of-piece, trailing is fine (hand-snip).
  const released = new Set<CarrierId>();
  if (sim.positionOf(knitCarrier)) {
    ensureOutAnchorForBindOff(sim, knitCarrier, needleStart, needleEnd);
    sim.out(knitCarrier);
    released.add(knitCarrier);
    drain();
  }
  return {
    ops,
    predictedPasses: sim.predictedPasses(),
    finalNextDirection: sim.finalNextDirection(),
    finalCarrierStates: sim.snapshot(),
    releasedCarriers: [...released],
  };
}

function emitWasteAndDrop(input: BindOffInput): BindOffResult {
  const { needleStart, needleEnd, knitCarrier, wasteCarrier, wasteRows = 6, handoff } = input;
  if (!wasteCarrier) {
    throw new Error('emitBindOff: waste-and-drop requires wasteCarrier');
  }
  const ops: KnitoutOp[] = [];
  ops.push(comment('--- BIND OFF (waste-and-drop) ---'));
  const sim = new CarriageSimulator({
    carriers: ['1', '2', '3', '4', '5', '6'],
    initialNextDirection: input.initialNextDirection,
  });
  seedActiveCarriersForBindOff(sim, handoff, needleStart, needleEnd);
  const drain = () => ops.push(...sim.drainOps());
  const released = new Set<CarrierId>();

  // Bring waste carrier in if not already active. Park at left so we can
  // knit + on the first waste row regardless of current pattern-carrier
  // state.
  if (!sim.positionOf(wasteCarrier)) {
    sim.bringIn(wasteCarrier, { side: 'left' });
    drain();
  }

  // Take the knit carrier out first so it doesn't trail through the
  // waste-yarn section.
  if (sim.positionOf(knitCarrier)) {
    ensureOutAnchorForBindOff(sim, knitCarrier, needleStart, needleEnd);
    sim.out(knitCarrier);
    released.add(knitCarrier);
    drain();
  }

  // Knit `wasteRows` of plain front-bed stockinette in waste yarn over
  // whatever pattern stitches live on the front. (Charts that use purl
  // overrides have some loops on the back bed — we drop both beds below
  // so the waste handles both cases.)
  for (let r = 0; r < wasteRows; r++) {
    const side = sideOfSim(sim, wasteCarrier);
    const dir: Direction = side === 'left' ? '+' : '-';
    if (dir === '+') {
      sim.frontBedRow(wasteCarrier, dir, needleStart, needleEnd);
    } else {
      sim.frontBedRow(wasteCarrier, dir, needleEnd, needleStart);
    }
    drain();
  }

  // Drop all live stitches on BOTH beds. Charts with purl cells leave
  // some loops on the back bed (back-bed knit for the purl override);
  // dropping front only would leave those stranded. `drop` on an empty
  // needle is a safe no-op, so dropping the full range on both beds
  // works regardless of which cells used overrides.
  for (let n = needleStart; n <= needleEnd; n++) {
    sim.drop(f(n));
    sim.drop(backBed(n));
  }
  drain();

  // Release the waste carrier.
  if (sim.positionOf(wasteCarrier)) {
    ensureOutAnchorForBindOff(sim, wasteCarrier, needleStart, needleEnd);
    sim.out(wasteCarrier);
    released.add(wasteCarrier);
    drain();
  }

  return {
    ops,
    predictedPasses: sim.predictedPasses(),
    finalNextDirection: sim.finalNextDirection(),
    finalCarrierStates: sim.snapshot(),
    releasedCarriers: [...released],
  };
}

function emitDrop(input: BindOffInput): BindOffResult {
  const { needleStart, needleEnd, knitCarrier, handoff } = input;
  const ops: KnitoutOp[] = [];
  ops.push(comment('--- BIND OFF (drop — test only) ---'));
  const sim = new CarriageSimulator({
    carriers: ['1', '2', '3', '4', '5', '6'],
    initialNextDirection: input.initialNextDirection,
  });
  seedActiveCarriersForBindOff(sim, handoff, needleStart, needleEnd);
  const drain = () => ops.push(...sim.drainOps());
  // Drop both beds — handles purl overrides (back-bed live loops) and
  // any leftover back-bed waste that didn't get cleared in the cast-on
  // prologue. `drop` on empty needles is a no-op.
  for (let n = needleStart; n <= needleEnd; n++) {
    sim.drop(f(n));
    sim.drop(backBed(n));
  }
  drain();
  const released = new Set<CarrierId>();
  if (sim.positionOf(knitCarrier)) {
    ensureOutAnchorForBindOff(sim, knitCarrier, needleStart, needleEnd);
    sim.out(knitCarrier);
    released.add(knitCarrier);
    drain();
  }
  return {
    ops,
    predictedPasses: sim.predictedPasses(),
    finalNextDirection: sim.finalNextDirection(),
    finalCarrierStates: sim.snapshot(),
    releasedCarriers: [...released],
  };
}

function rangeAsc(start: number, end: number): number[] {
  const out: number[] = [];
  for (let n = start; n <= end; n++) out.push(n);
  return out;
}

function seedActiveCarriersForBindOff(
  sim: CarriageSimulator,
  handoff: SimulatorHandoff,
  needleStart: number,
  needleEnd: number,
): void {
  for (const c of handoff.keys()) {
    seedSimulatorCarrierFromHandoff(sim, handoff, c, (side) => ({
      anchorNeedle: side === 'left' ? f(needleStart) : f(needleEnd),
      anchorDirection: side === 'left' ? '-' : '+',
    }));
  }
}

function sideOfSim(sim: CarriageSimulator, carrier: CarrierId): 'left' | 'right' {
  const state = sim.positionOf(carrier);
  if (!state) {
    throw new Error(`bind-off: carrier "${carrier}" is not active`);
  }
  return state.side;
}

function ensureOutAnchorForBindOff(
  sim: CarriageSimulator,
  carrier: CarrierId,
  needleStart: number,
  needleEnd: number,
): void {
  const state = sim.positionOf(carrier);
  if (!state) {
    throw new Error(`bind-off: carrier "${carrier}" is not active`);
  }
  if (state.lastNeedle) return;
  const side = state.side;
  sim.seedActiveCarrierAnchor(carrier, {
    side,
    anchorNeedle: side === 'left' ? f(needleStart) : f(needleEnd),
    anchorDirection: side === 'left' ? '-' : '+',
  });
}

/** Phase 4 (2026-05-23): Fairisle closing-waste + park-out
 *  bind-off.
 *
 *  Sequence:
 *    1. Closing-waste rows on the closingWasteCarrier (C6), front-bed
 *       only, with a downward STIF ramp from body STIF → final ramp
 *       value (default 9→6 over 15 rows). Roller / speed held constant.
 *    2. `out` the closing-waste carrier — produces a Tu-Tu park-out
 *       pass.
 *    3. An `x-park-carriage` pass at parkSpeed/parkRoller/parkStitch.
 *       This is the `>> Kn-Kn 0 150 450` STIF 4 line in the reference;
 *       a synthetic carriage move with no carrier engaged that holds
 *       the carriage at the closing position for the park-outs to
 *       follow.
 *    4. `out` for every remaining active carrier in numeric order. Each
 *       produces its own Tu-Tu line.
 *
 *  No actual drop ops — the live stitches stay on the bed and release
 *  cleanly when the user pulls the closing waste plug after taking
 *  the piece off the machine. */
function emitFairisleParkBindoff(input: BindOffInput): {
  ops: KnitoutOp[];
  predictedPasses: readonly PredictedPass[];
  finalNextDirection: Direction;
  finalCarrierStates: ReadonlyMap<CarrierId, CarrierSimState>;
  releasedCarriers: readonly CarrierId[];
} {
  const { needleStart, needleEnd, handoff } = input;
  const config: FairisleParkConfig = {
    ...FAIRISLE_PARK_BINDOFF_DEFAULTS,
    ...(input.fairisleParkConfig ?? {}),
  };
  const ops: KnitoutOp[] = [];
  ops.push(comment('--- BIND OFF (fairisle parity park) ---'));

  // Phase E cutover: sim owns bind-off local state from the section handoff.
  const sim = new CarriageSimulator({
    carriers: ['1', '2', '3', '4', '5', '6'],
    initialNextDirection: input.initialNextDirection,
  });

  // Seed every currently-active carrier from the section handoff. Full
  // simulator state preserves last/kick physics; side-only handoffs fall
  // back to a bind-off-range anchor.
  for (const c of handoff.keys()) {
    seedSimulatorCarrierFromHandoff(sim, handoff, c, (side) => ({
      anchorNeedle: side === 'left' ? f(needleStart) : f(needleEnd),
      anchorDirection: side === 'left' ? '-' : '+',
    }));
  }

  // Closing-waste carrier setup. If not active, bring in at left.
  if (!sim.positionOf(config.closingWasteCarrier)) {
    sim.bringIn(config.closingWasteCarrier, { side: 'left' });
  }

  // Closing-waste rows: front-bed only knit at constant speed/roller,
  // STIF ramps down per pass. Direction determined by the closing-
  // waste carrier's current side after each pass.
  sim.setSpeed(config.closingWasteSpeed);
  sim.setRoller(config.closingWasteRoller);
  let prevStitch: number | undefined;
  for (const stitch of config.closingWasteStitchRamp) {
    if (stitch !== prevStitch) {
      sim.setStitch(stitch);
      prevStitch = stitch;
    }
    const side = sim.positionOf(config.closingWasteCarrier)?.side ?? 'left';
    const dir: Direction = side === 'left' ? '+' : '-';
    if (dir === '+') {
      sim.frontBedRow(config.closingWasteCarrier, '+', needleStart, needleEnd);
    } else {
      sim.frontBedRow(config.closingWasteCarrier, '-', needleEnd, needleStart);
    }
  }

  // Park sequence. Speed/roller/stitch for the park pass; vendor binds
  // the direction at emit time using runtime nextDirection — for an
  // even-length closing-waste ramp the carriage is on the LEFT so the
  // park pass goes `>>` (matches the reference).
  sim.setSpeed(config.parkSpeed);
  sim.setRoller(config.parkRoller);
  sim.setStitch(config.parkStitch);
  sim.parkCarriage();

  // Presser settings for the auto-move that the vendor inserts between
  // the park pass and the first carrier-out Tu-Tu. Reference: speed 600,
  // roller 0 — fast move because the carriage has nothing to engage.
  sim.setPresserSpeed(config.parkAutoMoveSpeed);
  sim.setPresserRoller(config.parkAutoMoveRoller);
  // Force roller 0 for the carrier-out Tu-Tu lines (vendor hardcodes
  // roller 0 for `out` but the parkAt repositioning miss needs it).
  sim.setRoller(0);

  // Park-out remaining active carriers in numeric order. `out(c, 'left')`
  // emits a parkAt miss if needed (only when the carrier isn't already
  // left) then the `out` op itself; the sim handles merge between them
  // when the directions align.
  const stillActive = [...sim.activeCarriers()].sort();
  const released = new Set<CarrierId>();
  for (const c of stillActive) {
    sim.out(c, 'left');
    released.add(c);
  }

  const predictedPasses = sim.predictedPasses();
  ops.push(...sim.finalize());
  return {
    ops,
    predictedPasses,
    finalNextDirection: sim.finalNextDirection(),
    finalCarrierStates: sim.snapshot(),
    releasedCarriers: [...released],
  };
}
