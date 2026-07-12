/**
 * Ladder-back jacquard walker — N pattern colors, 1 back-bed pass per
 * chart row with the back color rotating through a cycle.
 *
 * Per chart row R:
 *   1. For each color present in row R (in carrier order), emit a
 *      front-bed pass: knit where chart cell == color, miss elsewhere.
 *      Direction follows where the carrier is currently parked.
 *   2. Emit one back-bed pass with `ladderCycle[R % ladderCycle.length]`,
 *      full-width knit at every live needle.
 *
 * Floats are bounded by the cycle length: color X's misses on row R get
 * captured on the back ~(R + position-of-X-in-cycle) rows later. The
 * `validate-floats` step (P5) surfaces a warning when block sizes
 * exceed the configured threshold.
 *
 * No-stitch cells should have been rejected by validateChartForTrackA;
 * this walker treats them as a hard error.
 */

import { KEY_ID_EMPTY } from '../../colorwork/knitlab1-contract.js';
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
import { CarriageSimulator } from '../sim/carriage-simulator.js';
import type { CarrierSimState, PredictedPass } from '../sim/types.js';
import type { ResolvedChart } from './resolve-chart.js';
import {
  applyFirstRowSpeedOverride,
  restoreFirstRowSpeedOverride,
  type FirstRowSpeedOverride,
} from './first-row-speed.js';
import { emitNonAdjacentXferBatches } from './bed-transition.js';

export interface JacquardLadderInput {
  resolved: ResolvedChart;
  /** keyId → carrier for each pattern color. */
  bindings: Map<string, CarrierId>;
  /** Order in which back-bed ladder colors cycle. Usually the carrier
   *  numerical order of the bindings; the wizard can override. */
  ladderCycle: readonly CarrierId[];
  /** First needle on the bed. */
  needleStart: number;
  handoff: SimulatorHandoff;
  /** Phase 4b (2026-05-24): seed the simulator's `nextDirection` from
   *  the previous section's projected end-direction. */
  initialNextDirection?: Direction;
  /** Slow the first actual body row after cast-on, then restore body
   *  speed for row 1+. */
  firstRowSpeedOverride?: FirstRowSpeedOverride;
}

export interface JacquardLadderResult {
  ops: KnitoutOp[];
  /** Phase 4 (2026-05-24): per-section CarriageSimulator predicted-pass
   *  trace. See StockinetteWalkResult.predictedPasses. */
  predictedPasses: readonly PredictedPass[];
  /** Phase 4b (2026-05-24): vendor's runtime `nextDirection` after the
   *  last logical pass in this section. */
  finalNextDirection: Direction;
  finalCarrierStates: ReadonlyMap<CarrierId, CarrierSimState>;
}

export function emitJacquardLadderWalk(input: JacquardLadderInput): JacquardLadderResult {
  const { resolved, bindings, ladderCycle, needleStart, handoff } = input;
  const ops: KnitoutOp[] = [];

  if (bindings.size < 2) {
    throw new Error(`jacquard-ladder requires ≥2 bindings; got ${bindings.size}`);
  }
  if (ladderCycle.length === 0) {
    throw new Error('jacquard-ladder requires a non-empty ladderCycle');
  }

  // Inverse map (carrier → keyId) for fast cell-to-carrier lookup.
  const keyIdForCarrier = new Map<CarrierId, string>();
  for (const [keyId, carrier] of bindings.entries()) {
    keyIdForCarrier.set(carrier, keyId);
  }

  // Stable iteration order for pattern carriers — carrier numeric
  // value. This determines per-row pass order; the simulator handles
  // direction per pass.
  const carriersSorted: CarrierId[] = [...bindings.values()].sort();

  // Phase E cutover: sim owns ladder-body local state from the section handoff.
  const sim = new CarriageSimulator({
    carriers: ['1', '2', '3', '4', '5', '6'],
    initialNextDirection: input.initialNextDirection,
  });
  for (const c of handoff.keys()) {
    // chart-core/dimension-read-ok: chart width to size the carrier's
    // anchor needle. No per-cell semantics involved.
    const cols = resolved.cells[0]?.length ?? 1;
    seedSimulatorCarrierFromHandoff(sim, handoff, c, (side) => ({
      anchorNeedle: side === 'left' ? f(needleStart) : f(needleStart + cols - 1),
      anchorDirection: side === 'left' ? '-' : '+',
    }));
  }
  for (const c of carriersSorted) {
    if (!sim.positionOf(c)) {
      throw new Error(`jacquard-ladder: carrier "${c}" must be brought in before walking`);
    }
  }

  for (let r = 0; r < resolved.rows; r++) {
    sim.setSourceRows([r]);
    ops.push(...sim.drainOps());
    ops.push(comment(`row ${r}`));
    applyFirstRowSpeedOverride(sim, r, input.firstRowSpeedOverride);

    // Step 1: front-bed pass per color present in this row.
    const colorsInRow = colorsPresentInRow(resolved, r, bindings);
    for (const c of carriersSorted) {
      if (!colorsInRow.has(c)) continue;
      const keyId = keyIdForCarrier.get(c)!;
      const dir = directionForCarrier(sim, c);
      pushFrontPassForColor(sim, r, dir, resolved, keyId, c, needleStart);
    }

    // Step 2: back-bed pass with the ladder color for this row.
    const ladderColor = ladderCycle[r % ladderCycle.length]!;
    if (!sim.positionOf(ladderColor)) {
      sim.bringIn(ladderColor, { side: 'left' });
    }
    const ladderDir = directionForCarrier(sim, ladderColor);
    pushFullBackPass(sim, ladderDir, resolved, ladderColor, needleStart);
    restoreFirstRowSpeedOverride(sim, r, input.firstRowSpeedOverride);
  }
  sim.setSourceRows();
  ops.push(...sim.drainOps());

  // The last ladder row leaves one lining loop on every back-bed needle.
  // Home those loops before the chain bind-off; the bind-off then performs
  // its doubled-loop consolidation row just like birdseye/complement.
  ops.push(comment('-- lined finish: home final-row ladder backing b->f --'));
  const finishTransfers = Array.from({ length: resolved.cols }, (_, column) => ({
    needle: needleStart + column,
    direction: 'b-to-f' as const,
  }));
  ops.push(...emitNonAdjacentXferBatches(finishTransfers));

  const finalCarrierStates = sim.snapshot();

  return {
    ops,
    predictedPasses: sim.predictedPasses(),
    finalNextDirection: sim.finalNextDirection(),
    finalCarrierStates,
  };
}

function directionForCarrier(sim: CarriageSimulator, carrier: CarrierId): Direction {
  const state = sim.positionOf(carrier);
  if (!state) {
    throw new Error(`jacquard-ladder: carrier "${carrier}" must be brought in before walking`);
  }
  return state.side === 'left' ? '+' : '-';
}

function colorsPresentInRow(
  resolved: ResolvedChart,
  row: number,
  bindings: Map<string, CarrierId>,
): Set<CarrierId> {
  const present = new Set<CarrierId>();
  // chart-core/color-binding-read-ok: gather row's carriers by reading
  // resolved keyIds (identity). No per-cell semantic dispatch.
  const cells = resolved.cells[row];
  if (!cells) return present;
  for (const cell of cells) {
    if (cell === KEY_ID_EMPTY) {
      throw new Error(`jacquard-ladder: no-stitch cell at row ${row} — should have been rejected by Track A validator`);
    }
    const carrier = bindings.get(cell);
    if (carrier !== undefined) present.add(carrier);
  }
  return present;
}

function pushFrontPassForColor(
  sim: CarriageSimulator,
  row: number,
  direction: Direction,
  resolved: ResolvedChart,
  keyId: string,
  carrier: CarrierId,
  needleStart: number,
): void {
  // chart-core/color-binding-read-ok: per-needle knit/miss pattern is
  // identity-driven (`cell === keyId` picks the color for this pass).
  const cells = resolved.cells[row]!;
  if (direction === '+') {
    for (let c = 0; c < cells.length; c++) {
      const cell = cells[c]!;
      const needle = f(needleStart + c);
      if (cell === keyId) sim.knit(carrier, direction, needle);
      else sim.miss(carrier, direction, needle);
    }
  } else {
    for (let c = cells.length - 1; c >= 0; c--) {
      const cell = cells[c]!;
      const needle = f(needleStart + c);
      if (cell === keyId) sim.knit(carrier, direction, needle);
      else sim.miss(carrier, direction, needle);
    }
  }
}

function pushFullBackPass(
  sim: CarriageSimulator,
  direction: Direction,
  resolved: ResolvedChart,
  carrier: CarrierId,
  needleStart: number,
): void {
  const cols = resolved.cols;
  if (direction === '+') {
    for (let c = 0; c < cols; c++) sim.knit(carrier, direction, backBed(needleStart + c));
  } else {
    for (let c = cols - 1; c >= 0; c--) sim.knit(carrier, direction, backBed(needleStart + c));
  }
}
