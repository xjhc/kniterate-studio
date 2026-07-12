/**
 * Lined-back jacquard walker — DEFERRED to a follow-up phase.
 *
 * The original implementation (kept below for reference) is NOT a
 * correct jacquard model. For each color C in a row, it emits a back-bed
 * `knit` at every needle where cell != C. Multiple colors can knit at
 * the same back-bed needle in different passes, and each successive
 * knit knocks the previous loop OFF the needle — so only the last
 * color's loop survives. Floats from other colors are NOT actually
 * captured. The "no floats" promise was incorrect.
 *
 * Real lined-back / float-free double jacquard on a v-bed requires
 * partitioning back-bed needles across colors (birdseye stippling) or
 * across rows (cycle rotation, which is what `jacquard-ladder` already
 * provides). A correct N-color algorithm is a separate piece of work.
 *
 * Current behavior: `compileChartToKnitout` no longer dispatches here;
 * it routes all multi-color charts to the ladder walker regardless of
 * `backBedStyle`. Selecting `'lined'` produces a warning explaining the
 * fallback. This module remains as a documented stub so callers don't
 * break and so the future correct implementation has a known location.
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

export interface JacquardLinedInput {
  resolved: ResolvedChart;
  bindings: Map<string, CarrierId>;
  needleStart: number;
  handoff: SimulatorHandoff;
  /** Phase 4b (2026-05-24): seed the simulator's `nextDirection` from
   *  the previous section's projected end-direction. */
  initialNextDirection?: Direction;
}

export interface JacquardLinedResult {
  ops: KnitoutOp[];
  /** Phase 4 (2026-05-24): per-section CarriageSimulator predicted-pass
   *  trace. See StockinetteWalkResult.predictedPasses. */
  predictedPasses: readonly PredictedPass[];
  /** Phase 4b (2026-05-24): vendor's runtime `nextDirection` after the
   *  last logical pass in this section. */
  finalNextDirection: Direction;
  finalCarrierStates: ReadonlyMap<CarrierId, CarrierSimState>;
}

export function emitJacquardLinedWalk(input: JacquardLinedInput): JacquardLinedResult {
  const { resolved, bindings, needleStart, handoff } = input;
  const ops: KnitoutOp[] = [];

  if (bindings.size < 2) {
    throw new Error(`jacquard-lined requires ≥2 bindings; got ${bindings.size}`);
  }

  const keyIdForCarrier = new Map<CarrierId, string>();
  for (const [keyId, carrier] of bindings.entries()) {
    keyIdForCarrier.set(carrier, keyId);
  }
  const carriersSorted: CarrierId[] = [...bindings.values()].sort();

  // Phase E cutover: sim owns lined-body local state. NOTE: this walker
  // is no longer dispatched in production (the front-end remaps 'lined'
  // -> 'ladder'); the cutover is for codebase consistency.
  const sim = new CarriageSimulator({
    carriers: ['1', '2', '3', '4', '5', '6'],
    initialNextDirection: input.initialNextDirection,
  });
  for (const c of handoff.keys()) {
    // chart-core/dimension-read-ok: chart width for carrier anchor needle.
    const cols = resolved.cells[0]?.length ?? 1;
    seedSimulatorCarrierFromHandoff(sim, handoff, c, (side) => ({
      anchorNeedle: side === 'left' ? f(needleStart) : f(needleStart + cols - 1),
      anchorDirection: side === 'left' ? '-' : '+',
    }));
  }
  for (const c of carriersSorted) {
    if (!sim.positionOf(c)) {
      throw new Error(`jacquard-lined: carrier "${c}" must be brought in before walking`);
    }
  }

  for (let r = 0; r < resolved.rows; r++) {
    ops.push(...sim.drainOps());
    ops.push(comment(`row ${r}`));
    const colorsInRow = colorsPresentInRow(resolved, r, bindings);

    // Step 1: front-bed passes.
    for (const c of carriersSorted) {
      if (!colorsInRow.has(c)) continue;
      const keyId = keyIdForCarrier.get(c)!;
      const dir = directionForCarrier(sim, c);
      pushFrontPassForColor(sim, r, dir, resolved, keyId, c, needleStart);
    }

    // Step 2: back-bed complementary passes.
    for (const c of carriersSorted) {
      if (!colorsInRow.has(c)) continue;
      const keyId = keyIdForCarrier.get(c)!;
      const dir = directionForCarrier(sim, c);
      pushBackComplementaryPassForColor(sim, r, dir, resolved, keyId, c, needleStart);
    }
  }
  ops.push(...sim.drainOps());

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
    throw new Error(`jacquard-lined: carrier "${carrier}" must be brought in before walking`);
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
  // resolved keyIds (identity).
  const cells = resolved.cells[row];
  if (!cells) return present;
  for (const cell of cells) {
    if (cell === KEY_ID_EMPTY) {
      throw new Error(`jacquard-lined: no-stitch cell at row ${row} — should have been rejected by Track A validator`);
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
  // chart-core/color-binding-read-ok: front-pass per-needle pattern is
  // identity-driven (`cell === keyId` picks the color).
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

function pushBackComplementaryPassForColor(
  sim: CarriageSimulator,
  row: number,
  direction: Direction,
  resolved: ResolvedChart,
  keyId: string,
  carrier: CarrierId,
  needleStart: number,
): void {
  // chart-core/color-binding-read-ok: back-pass mirrors the front-pass
  // pattern (knit where THIS color isn't on the front).
  const cells = resolved.cells[row]!;
  if (direction === '+') {
    for (let c = 0; c < cells.length; c++) {
      const cell = cells[c]!;
      const needle = backBed(needleStart + c);
      // This color on the front → miss the back. Otherwise → knit (capture
      // the float).
      if (cell === keyId) sim.miss(carrier, direction, needle);
      else sim.knit(carrier, direction, needle);
    }
  } else {
    for (let c = cells.length - 1; c >= 0; c--) {
      const cell = cells[c]!;
      const needle = backBed(needleStart + c);
      if (cell === keyId) sim.miss(carrier, direction, needle);
      else sim.knit(carrier, direction, needle);
    }
  }
}
