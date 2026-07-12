/**
 * Phase 3: Fairisle carrier intro + stitch ramp.
 *
 * Sits between the waste section's body-settings re-assert and the
 * back-bed clear (`floats` mode only). Brings each pattern carrier in
 * one at a time with a single front-bed intro pass at intro
 * speed/STIF, then ramps STIF over a few transitional rows before the
 * body's normal STIF takes over.
 *
 * Matches the body-entry structure of `reference/fairisle.kc` (rows
 * 86-107):
 *   - One `Kn-Kn {carrier} {introSpeed} {introRoller}` pass per pattern
 *     carrier at STIF = `introStitch` (5 in the reference).
 *   - A short STIF ramp at body entry: STIF = `rampStitches[i]` for one
 *     pass each, knit by the primary carrier.
 *
 * NOT byte-identical to the reference:
 *   - Reference uses ALTERNATING-bed knit on intro passes (`-_-_-_-_`
 *     in FRNT + REAR). We use FRONT-BED ONLY because the existing
 *     `emitBackBedClear` only sweeps cast-on needles — alternating-bed
 *     intro loops at non-cast-on columns would orphan and fail
 *     bed-state validation at bind-off. Sweeping the whole back bed is
 *     a follow-up (would require xfer-from-empty awareness).
 *   - Reference interleaves `Kn-Kn 6 200 200` waste-carrier rows
 *     between intro passes; we omit those.
 *   - Reference has a one-pass STIF=3 dip with the primary carrier
 *     before the ramp; we include 3 in `rampStitches` instead.
 *
 * Carrier intro order matches the pattern-carrier list (typically
 * descending by carrier number, e.g. 4 → 3 → 1 in the reference). The
 * emitter doesn't sort; the caller decides order.
 */

import {
  comment,
  f,
  type CarrierId,
  type Direction,
  type KnitoutOp,
} from '../types.js';
import {
  seedSimulatorCarrierFromHandoff,
  type SimulatorHandoff,
} from './simulator-handoff.js';
import { CarriageSimulator } from '../sim/carriage-simulator.js';
import type { CarrierSimState, PredictedPass } from '../sim/types.js';

/**
 * Vendor-fixed choreography constants for the Customist fairisle intro
 * (decoded from `reference/fairisle.kc`, passes 86-112). Kept as module
 * constants rather than `FairisleCarrierIntro` config fields so they
 * never traverse the persisted-config sanitizer (which would drop them
 * and diverge the recipe path from the wizard-config path). The emitter
 * reads them directly; the recipe only needs to opt into the cameo.
 */
const INTRO_CHOREOGRAPHY = Object.freeze({
  /** Carrier-6 waste filler rows knit between pattern-carrier intros. */
  fillerSpeed: 200,
  fillerRoller: 200,
  /** Filler rows after each pattern carrier intro. Reference: 2 each
   *  (decoded from reference/fairisle.kc — C4 intro @88, fillers @89–90,
   *  auto-move @91, C3 intro @92, fillers @93–94). */
  fillerCountPattern: 2,
  /** Filler rows after the cameo intro (ref: 7, before the re-park). */
  fillerCountCameo: 7,
  /** Inter-segment vendor auto-move presser (the `Kn-Kn 0 600 0` moves). */
  autoMovePresserSpeed: 600,
  autoMovePresserRoller: 0,
  /** Presser for the single auto-move that precedes the cameo re-park
   *  (`Kn-Kn 0 100 400` at ref pass 104). Per-move, hence the simulator's
   *  per-pass presser snapshot. */
  reparkPresserSpeed: 100,
  reparkPresserRoller: 400,
});

export interface FairisleCarrierIntro {
  /** Speed for the per-carrier intro pass. fairisle reference: 100. */
  introSpeed: number;
  /** Roller advance for the per-carrier intro pass. Reference: 400. */
  introRoller: number;
  /** STIF stitch number on the per-carrier intro pass. Reference: 5. */
  introStitch: number;
  /** STIF ramp at body entry (one pass per value, applied to the
   *  primary pattern carrier). Reference: [3, 5, 6] then body STIF=9.
   *  Values are inserted between intro and body; the final body value
   *  is set separately by the body-settings re-assert. */
  rampStitches: number[];
  /** Roller advance held during the ramp passes. Reference body uses
   *  450 across the ramp (Kn-Kn 4 100 450 / Kn-Kn 4 100 400). */
  rampRoller: number;
  /** Speed held during the ramp passes. Reference: 100 for the first
   *  ramp pass, accelerating to body speed on the final ramp row. */
  rampSpeed: number;
  /** Cameo carriers — brought in during the intro phase but never used
   *  for body knit. The park-out bind-off catches them via
   *  `carriage.activeCarriers()`. Reference uses `['1']` (the C1
   *  cameo). Empty by default. */
  cameoCarriers: readonly CarrierId[];
}

export const FAIRISLE_CARRIER_INTRO_DEFAULTS: FairisleCarrierIntro = Object.freeze({
  introSpeed: 100,
  introRoller: 400,
  introStitch: 5,
  rampStitches: [3, 5, 6],
  rampRoller: 450,
  rampSpeed: 100,
  // Cameo carriers default to empty. Reference uses ['1'] (C1 cameo,
  // intro'd at row 92, parked at row 222), but a single intro pass
  // leaves the cameo physically parked at the right edge of the
  // chart — the vendor's `kickOthers` logic then kicks it out of
  // the way on every body knit, producing dozens of spurious Tu-Tu
  // passes throughout the body. The reference dodges this with a
  // second intro pass (row 101) that returns C1 to the left edge;
  // emulating that needs another knob and another pass. Skipped
  // until someone demands it — until then, opt in via
  // `fairisleCarrierIntro: { cameoCarriers: ['1'] }`.
  cameoCarriers: [] as readonly CarrierId[],
});

export interface CarrierIntroInput {
  needleStart: number;
  needleEnd: number;
  /** Pattern carriers in intro order. fairisle reference uses the
   *  highest-numbered pattern carrier first (4, then 3, then any cameo
   *  like 1); the caller decides. */
  patternCarriers: readonly CarrierId[];
  /** "Cameo" carriers that aren't bound to a chart color but are
   *  intro'd anyway so they sit in the gripper for the final
   *  park-out — matches the C1 cameo in `reference/fairisle.kc`
   *  (rows 92, 101 intro; rows 222 park-out). Each gets one intro
   *  pass at the same intro speed/roller/STIF as pattern carriers.
   *  Optional. */
  cameoCarriers?: readonly CarrierId[];
  /** Carrier that will knit the body's first row — receives the ramp
   *  passes. Usually `patternCarriers[0]`. */
  primaryCarrier: CarrierId;
  /** Waste/draw carrier (C6) that knits the interleaved filler rows
   *  between pattern-carrier intros. Must be active in `handoff` (the
   *  compiler keeps it alive past the post-waste release when the intro
   *  runs). When omitted or inactive, the filler rows are skipped. */
  wasteFillerCarrier?: CarrierId;
  /** Number of edge needles to leave inert on the intro/ramp passes
   *  (mirrors `WasteMachineConfig.edgeInertNeedles`). Default 1 to
   *  match the fairisle parity reference. */
  edgeInertNeedles?: number;
  /** Compatibility boundary state carried across waste -> intro -> body.
   *  The intro section seeds its simulator from this snapshot and returns
   *  final carrier states for the compiler to apply at the boundary. */
  handoff: SimulatorHandoff;
  transition: FairisleCarrierIntro;
  /** Phase 4b (2026-05-24): seed the simulator's `nextDirection` from
   *  the previous section's projected end-direction. */
  initialNextDirection?: Direction;
}

export interface CarrierIntroResult {
  ops: KnitoutOp[];
  /** Phase 4 (2026-05-24): per-section CarriageSimulator predicted-pass
   *  trace. Empty when the function early-returns before constructing
   *  a simulator. */
  predictedPasses: readonly PredictedPass[];
  /** Phase 4b (2026-05-24): vendor's runtime `nextDirection` after the
   *  last logical pass in this section. Equals `initialNextDirection`
   *  (defaulting to `+`) on the early-return paths that emit nothing. */
  finalNextDirection: Direction;
  finalCarrierStates: ReadonlyMap<CarrierId, CarrierSimState>;
}

/**
 * Emit Phase 3 intro + ramp.
 *
 * Carrier intros: one alternating-bed pass per carrier at intro
 * speed/roller/STIF. Each pass enters from the carrier's current
 * parked side; the first intro pass for a carrier brings it in.
 *
 * Ramp: one alternating-bed pass per `rampStitches[i]` value, knit by
 * the primary carrier, at ramp speed/roller. The body-settings
 * re-assert (driven by `compile-chart.ts`) restores the body STIF
 * after these. */
export function emitFairisleCarrierIntro(input: CarrierIntroInput): CarrierIntroResult {
  const ops: KnitoutOp[] = [];
  const {
    needleStart,
    needleEnd,
    patternCarriers,
    primaryCarrier,
    handoff,
    transition,
  } = input;
  const edgeInertNeedles = Math.max(0, input.edgeInertNeedles ?? 1);
  const interlockStart = needleStart + edgeInertNeedles;
  const interlockEnd = needleEnd - edgeInertNeedles;

  if (patternCarriers.length === 0) {
    return {
      ops,
      predictedPasses: [],
      finalNextDirection: input.initialNextDirection ?? '+',
      finalCarrierStates: new Map(),
    };
  }
  if (interlockEnd < interlockStart) {
    return {
      ops,
      predictedPasses: [],
      finalNextDirection: input.initialNextDirection ?? '+',
      finalCarrierStates: new Map(),
    };
  }

  ops.push(comment('--- CARRIER INTRO (fairisle parity) ---'));

  // Phase E cutover: sim owns intro+ramp local state from the section handoff.
  const sim = new CarriageSimulator({
    carriers: ['1', '2', '3', '4', '5', '6'],
    initialNextDirection: input.initialNextDirection,
  });
  for (const c of handoff.keys()) {
    // Waste section leaves side-only legacy carriers at `initialSide`
    // (default 'left'); anchor those at the corresponding end of the
    // pattern range.
    seedSimulatorCarrierFromHandoff(sim, handoff, c, (side) => ({
      anchorNeedle: side === 'left' ? f(needleStart) : f(needleEnd),
      anchorDirection: side === 'left' ? '-' : '+',
    }));
  }

  // Full front-bed pass by `c`, direction derived from its current parked
  // side (left → `+`, right → `-`). A freshly-introduced carrier enters on
  // the left, so its first pass is `+`; the waste filler carrier ping-pongs
  // from wherever the waste section left it. This reproduces the reference
  // intro's exact pass directions without hard-coding them.
  const frontPass = (c: CarrierId): void => {
    if (!sim.positionOf(c)) sim.bringIn(c, { side: 'left' });
    const side = sim.positionOf(c)?.side ?? 'left';
    if (side === 'left') sim.frontBedRow(c, '+', interlockStart, interlockEnd);
    else sim.frontBedRow(c, '-', interlockEnd, interlockStart);
  };

  // Idle-carrier home park: a LEFTWARD pass that reaches `needleStart`
  // (the body's leftmost knit needle), not `interlockStart`. The vendor's
  // kickOthers skips a carrier only when it last moved LEFT AND its slot is
  // <= the operated needle; parking at interlockStart (needleStart+1) is
  // off by one, so the body still kicks it. See
  // docs/fairisle-slice-b-ground-truth.md "Sharper root cause".
  const homeParkLeft = (c: CarrierId): void => {
    if (!sim.positionOf(c)) sim.bringIn(c, { side: 'right' });
    sim.frontBedRow(c, '-', interlockEnd, needleStart);
  };

  // Inter-segment vendor auto-moves render at the 600/0 presser.
  sim.setPresserSpeed(INTRO_CHOREOGRAPHY.autoMovePresserSpeed);
  sim.setPresserRoller(INTRO_CHOREOGRAPHY.autoMovePresserRoller);

  const fillerCarrier = input.wasteFillerCarrier;
  const cameoCarriers = input.cameoCarriers ?? [];
  // Pattern carriers (caller-ordered, highest-first) then cameos. Each
  // gets one front-bed intro pass at intro speed/roller/STIF, followed by
  // carrier-6 waste filler rows at 200/200 (2 per pattern carrier, 7 after
  // the cameo).
  const introSegments: Array<{ c: CarrierId; cameo: boolean }> = [
    ...patternCarriers.map((c) => ({ c, cameo: false })),
    ...cameoCarriers.map((c) => ({ c, cameo: true })),
  ];
  for (const { c, cameo } of introSegments) {
    sim.setSpeed(transition.introSpeed);
    sim.setRoller(transition.introRoller);
    sim.setStitch(transition.introStitch);
    frontPass(c);
    if (!cameo) {
      // Keep the footer shape of the intro pass while extending the
      // carrier's vendor slot to the true right edge. A same-direction
      // soft miss merges into the preceding Kn-Kn pass and avoids
      // kickOthers, but it makes later leftward body rows see C3/C4 as
      // already parked safely to the right instead of one needle short.
      sim.miss(c, '+', f(needleEnd));
    }
    if (fillerCarrier && sim.positionOf(fillerCarrier)) {
      sim.setSpeed(INTRO_CHOREOGRAPHY.fillerSpeed);
      sim.setRoller(INTRO_CHOREOGRAPHY.fillerRoller);
      const count = cameo
        ? INTRO_CHOREOGRAPHY.fillerCountCameo
        : INTRO_CHOREOGRAPHY.fillerCountPattern;
      for (let k = 0; k < count; k++) {
        // The LAST filler of the final (cameo) segment parks the filler
        // carrier (C6) LEFTWARD at needleStart so the body never kicks it
        // (REF pass 103 `<< Kn-Kn 6`). All other fillers ping-pong normally.
        const lastCameoFiller = cameo && k === count - 1;
        if (lastCameoFiller) homeParkLeft(fillerCarrier);
        else frontPass(fillerCarrier);
      }
    }
  }
  ops.push(...sim.drainOps());

  // Cameo re-park: return each cameo carrier to the left edge with one
  // pass at intro speed/roller. The vendor auto-move that precedes it
  // renders at the per-move 100/400 presser; restore 600/0 after so the
  // ramp's preceding auto-move is back to normal.
  if (cameoCarriers.length > 0) {
    sim.setSpeed(transition.introSpeed);
    sim.setRoller(transition.introRoller);
    sim.setPresserSpeed(INTRO_CHOREOGRAPHY.reparkPresserSpeed);
    sim.setPresserRoller(INTRO_CHOREOGRAPHY.reparkPresserRoller);
    // Park each cameo LEFTWARD to needleStart so the body never kicks it.
    for (const c of cameoCarriers) homeParkLeft(c);
    sim.setPresserSpeed(INTRO_CHOREOGRAPHY.autoMovePresserSpeed);
    sim.setPresserRoller(INTRO_CHOREOGRAPHY.autoMovePresserRoller);
    ops.push(...sim.drainOps());
  }

  // Stitch ramp: primary carrier knits one pass per ramp value at ramp
  // speed. Reference rollers are [rampRoller, introRoller, introRoller]
  // (450, 400, 400). Directions alternate via the side-derived `frontPass`.
  if (transition.rampStitches.length > 0) {
    ops.push(comment('--- STITCH RAMP (fairisle parity) ---'));
    sim.setSpeed(transition.rampSpeed);
    transition.rampStitches.forEach((stitch, i) => {
      sim.setStitch(stitch);
      sim.setRoller(i === 0 ? transition.rampRoller : transition.introRoller);
      // The final handoff pass must park C4 at `needleStart`, not
      // `interlockStart`, or the first body row's leftmost stitch still
      // sits just outside the vendor's self-kick immunity window.
      if (i === 2) homeParkLeft(primaryCarrier);
      else frontPass(primaryCarrier);
    });
    ops.push(...sim.drainOps());
  }

  const finalCarrierStates = sim.snapshot();

  return {
    ops,
    predictedPasses: sim.predictedPasses(),
    finalNextDirection: sim.finalNextDirection(),
    finalCarrierStates,
  };
}
