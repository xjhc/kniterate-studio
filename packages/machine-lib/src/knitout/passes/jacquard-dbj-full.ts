/**
 * Customist-framed Birdseye walker.
 *
 * The captured DBJ program supplies the carrier introduction and finish.
 * It was captured in four colours; a chart in two or three brings in only
 * its own carriers, in the captured order and with each carrier's captured
 * moves, so no carrier is knitted that has no yarn on it.
 * Its sample-specific body ordering and incomplete last row are not a
 * general chart algorithm. The body uses the established full-mode
 * Birdseye walker: every requested front stitch and one rear stitch per
 * needle per design row, partitioned among the assigned colors. This is
 * deliberately not a reproduction of the reference's heavier full back.
 */

import {
  b as backBed,
  comment,
  f,
  type CarrierId,
  type Direction,
  type KnitoutOp,
} from '../types.js';
import { CarriageSimulator } from '../sim/carriage-simulator.js';
import type { CarrierSimState, PredictedPass } from '../sim/types.js';
import {
  seedSimulatorCarrierFromHandoff,
  simulatorHandoffFromBoundary,
  type SimulatorHandoff,
} from './simulator-handoff.js';
import type { ResolvedChart } from './resolve-chart.js';
import type { FirstRowSpeedOverride } from './first-row-speed.js';
import { emitJacquardBirdseyeWalk } from './jacquard-birdseye.js';

export interface JacquardDbjFullInput {
  resolved: ResolvedChart;
  bindings: Map<string, CarrierId>;
  needleStart: number;
  handoff: SimulatorHandoff;
  wasteCarrier: CarrierId;
  initialNextDirection?: Direction;
  /** Slow the first actual DBJ body row after cast-on, then restore
   *  DBJ-full's own body speed for row 1+. */
  firstRowSpeedOverride?: FirstRowSpeedOverride;
}

export interface JacquardDbjFullResult {
  ops: KnitoutOp[];
  predictedPasses: readonly PredictedPass[];
  finalNextDirection: Direction;
  finalCarrierStates: ReadonlyMap<CarrierId, CarrierSimState>;
  finalKnitCarrier: CarrierId;
}

/** The captured introduction order of the pattern carriers. */
const INTRO_ORDER: readonly CarrierId[] = ['3', '2', '4', '5'];
/** Waste rows after each carrier is brought in; the captured program runs more after the last one, before the draw thread. */
const INTRO_FILLER_ROWS = 2;
const INTRO_LAST_FILLER_ROWS = 7;
const CAMEO_CARRIER: CarrierId = '1';
const DBJ_FULL_BODY_SPEED = 400;

export function emitJacquardDbjFullWalk(input: JacquardDbjFullInput): JacquardDbjFullResult {
  const { resolved, bindings, needleStart, handoff, wasteCarrier } = input;
  const ops: KnitoutOp[] = [];
  const needleEnd = needleStart + resolved.cols - 1;
  // Only the chart's own pattern carriers are brought in. The ground (which
  // starts the back layer) is C3 as captured, else the first one in.
  const bound = new Set(bindings.values());
  const introCarriers = INTRO_ORDER.filter((carrier) => bound.has(carrier));
  if (introCarriers.length === 0 || introCarriers.length !== bound.size) {
    throw new Error(`dbj-full: pattern carriers must be among C2-C5; got ${[...bound].join(', ') || 'none'}`);
  }
  const ground = introCarriers.includes('3') ? '3' : introCarriers[0]!;

  let sim = new CarriageSimulator({
    carriers: ['1', '2', '3', '4', '5', '6'],
    initialNextDirection: input.initialNextDirection,
  });
  for (const c of handoff.keys()) {
    seedSimulatorCarrierFromHandoff(sim, handoff, c, (side) => ({
      anchorNeedle: side === 'left' ? f(needleStart) : f(needleEnd),
      anchorDirection: side === 'left' ? '-' : '+',
    }));
  }

  ops.push(comment('--- DBJ FULL-BACK INTRO ---'));
  emitIntro(sim, needleStart, needleEnd, wasteCarrier, introCarriers, ground);
  ops.push(...sim.drainOps());

  ops.push(comment('--- DBJ FULL-BACK BODY ---'));
  sim.setSpeed(DBJ_FULL_BODY_SPEED);
  sim.setRoller(450);
  sim.setStitch(7);
  sim.setPresserSpeed(600);
  sim.setPresserRoller(0);
  const firstRowSpeedOverride = input.firstRowSpeedOverride
    ? { ...input.firstRowSpeedOverride, restoreSpeed: DBJ_FULL_BODY_SPEED }
    : undefined;

  const body = emitJacquardBirdseyeWalk({
    resolved,
    bindings,
    needleStart,
    handoff: simulatorHandoffFromBoundary({ finalCarrierStates: sim.snapshot() }),
    mode: 'full',
    strategy: 'birdseye',
    homeBackBed: false,
    initialNextDirection: sim.finalNextDirection(),
    firstRowSpeedOverride,
  });
  ops.push(...sim.drainOps());
  for (const op of body.ops) ops.push(op);
  const predictedPasses = [...sim.predictedPasses(), ...body.predictedPasses];
  sim = new CarriageSimulator({
    carriers: ['1', '2', '3', '4', '5', '6'],
    initialNextDirection: body.finalNextDirection,
  });
  const bodyHandoff = simulatorHandoffFromBoundary(body);
  for (const c of bodyHandoff.keys()) {
    seedSimulatorCarrierFromHandoff(sim, bodyHandoff, c, (side) => ({
      anchorNeedle: side === 'left' ? f(needleStart) : f(needleEnd),
      anchorDirection: side === 'left' ? '-' : '+',
    }));
  }

  ops.push(comment('--- DBJ FULL-BACK TRANSFER + CLOSING SETUP ---'));
  sim.setSpeed(DBJ_FULL_BODY_SPEED);
  sim.setRoller(450);
  sim.setStitch(5);
  xferBackToFrontSplit(sim, needleStart, needleEnd);
  sim.setSpeed(300);
  sim.setRoller(450);
  sim.setStitch(6);
  sim.setPresserSpeed(600);
  sim.setPresserRoller(0);
  ops.push(...sim.drainOps());

  let finalKnitCarrier: CarrierId = ground; // The final intro knit if the body is empty.
  for (let index = body.ops.length - 1; index >= 0; index--) {
    const op = body.ops[index]!;
    if (op.kind === 'knit') {
      finalKnitCarrier = op.carriers[0]!;
      break;
    }
  }
  return {
    ops,
    predictedPasses: [...predictedPasses, ...sim.predictedPasses()],
    finalNextDirection: sim.finalNextDirection(),
    finalCarrierStates: sim.snapshot(),
    finalKnitCarrier,
  };
}

function emitIntro(
  sim: CarriageSimulator,
  needleStart: number,
  needleEnd: number,
  wasteCarrier: CarrierId,
  introCarriers: readonly CarrierId[],
  ground: CarrierId,
): void {
  sim.setPresserSpeed(600);
  sim.setPresserRoller(0);
  sim.setSpeed(200);
  sim.setRoller(400);
  sim.setStitch(5);

  introCarriers.forEach((carrier, index) => {
    if (!sim.positionOf(carrier)) sim.bringIn(carrier, { side: 'left' });
    interlockFull(sim, carrier, '+', needleStart, needleEnd);
    // As captured, C2 and C5 interlock back across and wait on the left.
    if (carrier === '2' || carrier === '5') {
      interlockFull(sim, carrier, '-', needleStart, needleEnd);
    }
    const fillerCount = index === introCarriers.length - 1 ? INTRO_LAST_FILLER_ROWS : INTRO_FILLER_ROWS;
    sim.setSpeed(200);
    sim.setRoller(200);
    for (let i = 0; i < fillerCount; i++) {
      const dir = directionForCarrier(sim, wasteCarrier);
      if (dir === '+') fullBackRow(sim, wasteCarrier, '+', needleStart, needleEnd);
      else fullFrontRow(sim, wasteCarrier, '-', needleEnd, needleStart);
    }
    sim.setSpeed(200);
    sim.setRoller(400);
  });

  if (!sim.positionOf(CAMEO_CARRIER)) sim.bringIn(CAMEO_CARRIER, { side: 'left' });
  interlockFull(sim, CAMEO_CARRIER, '+', needleStart, needleEnd);
  sim.setSpeed(200);
  sim.setRoller(200);
  fullBackRow(sim, wasteCarrier, '-', needleEnd, needleStart);
  fullFrontRow(sim, wasteCarrier, '+', needleStart, needleEnd);

  sim.setSpeed(300);
  sim.setRoller(450);
  sim.parkCarriage();

  sim.setSpeed(100);
  sim.setRoller(200);
  fullFrontRow(sim, CAMEO_CARRIER, '-', needleEnd, needleStart);

  // The ground starts the back layer from the side it waits on (C3: the right).
  sim.setSpeed(200);
  sim.setRoller(400);
  const out = directionForCarrier(sim, ground);
  const back: Direction = out === '+' ? '-' : '+';
  const span = (direction: Direction): [number, number] => (direction === '+' ? [needleStart, needleEnd] : [needleEnd, needleStart]);
  fullFrontRow(sim, ground, out, ...span(out));
  fullFrontRow(sim, ground, back, ...span(back));
  fullBackRow(sim, ground, out, ...span(out));
}

function directionForCarrier(sim: CarriageSimulator, carrier: CarrierId): Direction {
  const state = sim.positionOf(carrier);
  if (!state) throw new Error(`dbj-full: carrier "${carrier}" is not active`);
  return state.side === 'left' ? '+' : '-';
}

function interlockFull(
  sim: CarriageSimulator,
  carrier: CarrierId,
  direction: Direction,
  needleStart: number,
  needleEnd: number,
): void {
  sim.interlockRow(carrier, direction, needleStart, needleEnd, 'front');
}

function fullFrontRow(
  sim: CarriageSimulator,
  carrier: CarrierId,
  direction: Direction,
  start: number,
  end: number,
): void {
  sim.frontBedRow(carrier, direction, start, end);
}

function fullBackRow(
  sim: CarriageSimulator,
  carrier: CarrierId,
  direction: Direction,
  start: number,
  end: number,
): void {
  sim.knitRow(carrier, direction, 'b', start, end);
}

function xferBackToFrontSplit(
  sim: CarriageSimulator,
  needleStart: number,
  needleEnd: number,
): void {
  const batches = [0, 1].map(parity => {
    const pairs = [];
    for (let n = needleStart; n <= needleEnd; n++) {
      if ((n - needleStart) % 2 === parity) {
        pairs.push({ from: backBed(n), to: f(n) });
      }
    }
    return pairs;
  });
  // A one-needle panel has no odd transfer batch. Do not leave an
  // x-add-roller-advance with no transfer to consume it: the backend
  // would apply that setting to the following closing-waste knit.
  batches.filter((batch) => batch.length > 0).forEach((batch, i) => {
    if (i > 0) {
      sim.seedRacking(0);
      sim.setRacking(0);
    }
    // Customist's DBJ reference runs both transfer passes at roller 450.
    // The Kniterate converter's xfer default is roller 0, with
    // `x-add-roller-advance` as the existing per-pass override.
    sim.addRollerAdvance(450);
    sim.xferBatch(batch);
  });
}
