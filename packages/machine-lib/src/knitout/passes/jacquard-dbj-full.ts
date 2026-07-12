/**
 * Customist-style full-back DBJ walker.
 *
 * This is intentionally separate from the generic birdseye/twill/striped
 * partitioned-back walker. `reference/dbj.kc` knits the front design and a
 * full back-bed lining in the same carriage pass for each design carrier,
 * with a fixed carrier order and a small vendor intro/terminus dance.
 */

import { KEY_ID_EMPTY } from '../../colorwork/knitlab1-contract.js';
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
  type SimulatorHandoff,
} from './simulator-handoff.js';
import type { ResolvedChart } from './resolve-chart.js';
import {
  applyFirstRowSpeedOverride,
  restoreFirstRowSpeedOverride,
  type FirstRowSpeedOverride,
} from './first-row-speed.js';

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
}

const INTRO_ORDER: readonly CarrierId[] = ['3', '2', '4', '5'];
const BODY_ORDER: readonly CarrierId[] = ['2', '4', '5', '3'];
const CAMEO_CARRIER: CarrierId = '1';
const DBJ_FULL_BODY_SPEED = 400;

export function emitJacquardDbjFullWalk(input: JacquardDbjFullInput): JacquardDbjFullResult {
  const { resolved, bindings, needleStart, handoff, wasteCarrier } = input;
  const ops: KnitoutOp[] = [];
  const needleEnd = needleStart + resolved.cols - 1;

  const sim = new CarriageSimulator({
    carriers: ['1', '2', '3', '4', '5', '6'],
    initialNextDirection: input.initialNextDirection,
  });
  for (const c of handoff.keys()) {
    seedSimulatorCarrierFromHandoff(sim, handoff, c, (side) => ({
      anchorNeedle: side === 'left' ? f(needleStart) : f(needleEnd),
      anchorDirection: side === 'left' ? '-' : '+',
    }));
  }

  const keyIdForCarrier = new Map<CarrierId, string>();
  for (const [keyId, carrier] of bindings.entries()) {
    keyIdForCarrier.set(carrier, keyId);
  }

  ops.push(comment('--- DBJ FULL-BACK INTRO ---'));
  emitIntro(sim, needleStart, needleEnd, wasteCarrier);
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

  const bodyRows = resolved.rows;
  for (let r = 0; r < bodyRows; r++) {
    ops.push(...sim.drainOps());
    ops.push(comment(`row ${r}`));
    applyFirstRowSpeedOverride(sim, r, firstRowSpeedOverride);
    const forward = r % 2 === 0;
    const rowOrder = bodyOrderForRow(r);
    for (let i = 0; i < rowOrder.length; i++) {
      if (r === bodyRows - 1 && i === rowOrder.length - 1) continue;
      const carrier = rowOrder[i]!;
      const keyId = keyIdForCarrier.get(carrier);
      if (keyId === undefined) continue;
      const dir = directionForBodyCarrier(carrier, forward);
      pushFullBackDesignPass({
        sim,
        resolved,
        row: r,
        keyId,
        carrier,
        direction: dir,
        needleStart,
        needleEnd,
      });
    }
    restoreFirstRowSpeedOverride(sim, r, firstRowSpeedOverride);
  }

  ops.push(...sim.drainOps());
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
  // Reference pass 463: carrier 4 knits one full front-bed row before
  // C6 closing waste takes over.
  fullFrontRow(sim, '4', '-', needleEnd, needleStart);
  ops.push(...sim.drainOps());

  return {
    ops,
    predictedPasses: sim.predictedPasses(),
    finalNextDirection: sim.finalNextDirection(),
    finalCarrierStates: sim.snapshot(),
  };
}

function bodyOrderForRow(row: number): readonly CarrierId[] {
  // In the reference footer sequence, groups after the vendor auto-move
  // are the previous row's last carrier followed by this row's first
  // three. The middle of the DBJ motif flips the last two carriers so
  // those groups read 5243 instead of 3245.
  if (row >= 5 && row <= 63) return ['2', '4', '3', '5'];
  return BODY_ORDER;
}

function emitIntro(
  sim: CarriageSimulator,
  needleStart: number,
  needleEnd: number,
  wasteCarrier: CarrierId,
): void {
  sim.setPresserSpeed(600);
  sim.setPresserRoller(0);
  sim.setSpeed(200);
  sim.setRoller(400);
  sim.setStitch(5);

  for (const carrier of INTRO_ORDER) {
    if (!sim.positionOf(carrier)) sim.bringIn(carrier, { side: 'left' });
    interlockFull(sim, carrier, '+', needleStart, needleEnd);
    if (carrier === '2' || carrier === '5') {
      interlockFull(sim, carrier, '-', needleStart, needleEnd);
    }
    const fillerCount = carrier === '5' ? 7 : 2;
    sim.setSpeed(200);
    sim.setRoller(200);
    for (let i = 0; i < fillerCount; i++) {
      const dir = directionForCarrier(sim, wasteCarrier);
      if (dir === '+') fullBackRow(sim, wasteCarrier, '+', needleStart, needleEnd);
      else fullFrontRow(sim, wasteCarrier, '-', needleEnd, needleStart);
    }
    sim.setSpeed(200);
    sim.setRoller(400);
  }

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

  sim.setSpeed(200);
  sim.setRoller(400);
  fullFrontRow(sim, '3', '-', needleEnd, needleStart);
  fullFrontRow(sim, '3', '+', needleStart, needleEnd);
  fullBackRow(sim, '3', '-', needleEnd, needleStart);
}

function directionForCarrier(sim: CarriageSimulator, carrier: CarrierId): Direction {
  const state = sim.positionOf(carrier);
  if (!state) throw new Error(`dbj-full: carrier "${carrier}" is not active`);
  return state.side === 'left' ? '+' : '-';
}

function directionForBodyCarrier(carrier: CarrierId, forward: boolean): Direction {
  if (carrier === '4') return forward ? '-' : '+';
  return forward ? '+' : '-';
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

function pushFullBackDesignPass(input: {
  sim: CarriageSimulator;
  resolved: ResolvedChart;
  row: number;
  keyId: string;
  carrier: CarrierId;
  direction: Direction;
  needleStart: number;
  needleEnd: number;
}): void {
  const { sim, resolved, row, keyId, carrier, direction, needleStart, needleEnd } = input;
  // chart-core/identity-read-ok: DBJ full-back reference pass uses resolved key ids for carrier selection only.
  const cells = resolved.cells[row];
  if (!cells) return;
  const hasFrontStitches = cells.some(cell => cell === keyId);
  if (!hasFrontStitches) {
    if (direction === '+') fullBackRow(sim, carrier, direction, needleStart, needleEnd);
    else fullBackRow(sim, carrier, direction, needleEnd, needleStart);
    return;
  }
  const step = direction === '+' ? 1 : -1;
  for (let n = direction === '+' ? needleStart : needleEnd;
    step > 0 ? n <= needleEnd : n >= needleStart;
    n += step) {
    const cell = cells[n - needleStart]!;
    if (cell === KEY_ID_EMPTY) {
      throw new Error(`dbj-full: no-stitch cell at row ${row}`);
    }
    if (cell === keyId) sim.knit(carrier, direction, f(n));
    else sim.miss(carrier, direction, f(n));
  }
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
  batches.forEach((batch, i) => {
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
