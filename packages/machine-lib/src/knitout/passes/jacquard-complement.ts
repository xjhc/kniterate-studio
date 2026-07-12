/**
 * Complement-image (inverse) double-jacquard walker — the construction
 * the captured reference sweater uses (`reference/front.kc` / `back.kc` /
 * `sleeves.kc`; decoded op-exact in
 * docs/kniterate-improvement-tracker.md §Campaign 4 ground truth).
 *
 * Strictly a TWO-color scheme. Each fabric row is **two carriage passes**,
 * one per color. For colors A (the lower-numbered carrier) / B:
 *
 *   - A's pass: knit FRONT where the design is A, knit BACK where it is B.
 *   - B's pass: knit FRONT where the design is B, knit BACK where it is A.
 *
 * So the front bed shows the design and the back bed shows its negative
 * (inverse image). Across the two passes every needle is knit exactly
 * once on each bed. Confirmed against the reference (sleeve body runs
 * 128–131): `backKnit(A) == frontKnit(B)` and `backKnit(B) == frontKnit(A)`,
 * the front partition disjoint + complete over the full width.
 *
 * Why no +0.5 rack (unlike `jacquard-birdseye.ts`): within ONE pass a
 * carrier knits front at its color's columns and back at the other
 * color's columns — disjoint columns, so the carriage never engages both
 * beds at the same needle position in a single pass. The reference body
 * runs at rack 0 throughout (no inter-row transfers). The cross-bed
 * loops that DO end up aligned (front[n] from one carrier, back[n] from
 * the other) are ordinary full-needle rib/tube loops, knit on separate
 * passes — exactly what a rack-0 double-bed fabric is.
 *
 * Pass-count cost: 2 passes / row (vs birdseye's 4 for two colors), the
 * densest float-free 2-color backing.
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
import { emitNonAdjacentXferBatches } from './bed-transition.js';
import { CarriageSimulator } from '../sim/carriage-simulator.js';
import type { CarrierSimState, PredictedPass } from '../sim/types.js';
import type { ResolvedChart } from './resolve-chart.js';
import {
  applyFirstRowSpeedOverride,
  restoreFirstRowSpeedOverride,
  type FirstRowSpeedOverride,
} from './first-row-speed.js';

export interface JacquardComplementInput {
  resolved: ResolvedChart;
  /** keyId → carrier mapping. Exactly two entries. */
  bindings: Map<string, CarrierId>;
  /** First needle of the pattern range. */
  needleStart: number;
  handoff: SimulatorHandoff;
  initialNextDirection?: Direction;
  /** Slow the first actual body row after cast-on, then restore body
   *  speed for row 1+. */
  firstRowSpeedOverride?: FirstRowSpeedOverride;
}

export interface JacquardComplementResult {
  ops: KnitoutOp[];
  predictedPasses: readonly PredictedPass[];
  finalNextDirection: Direction;
  finalCarrierStates: ReadonlyMap<CarrierId, CarrierSimState>;
}

export function emitJacquardComplementWalk(
  input: JacquardComplementInput,
): JacquardComplementResult {
  const { resolved, bindings, needleStart, handoff } = input;
  const ops: KnitoutOp[] = [];

  if (bindings.size !== 2) {
    throw new Error(
      `jacquard-complement requires exactly 2 bindings (inverse-image lining is a two-color scheme); got ${bindings.size}`,
    );
  }

  // Deterministic color order — carrier numeric value. The reference
  // knits the lower-numbered carrier (C3) first in each row pair.
  const colors: CarrierId[] = [...bindings.values()].sort();
  const keyIdForCarrier = new Map<CarrierId, string>();
  for (const [keyId, carrier] of bindings.entries()) {
    keyIdForCarrier.set(carrier, keyId);
  }

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
  for (const c of colors) {
    if (!sim.positionOf(c)) {
      throw new Error(`jacquard-complement: carrier "${c}" must be brought in before walking`);
    }
  }

  for (let r = 0; r < resolved.rows; r++) {
    ops.push(...sim.drainOps());
    ops.push(comment(`row ${r}`));
    applyFirstRowSpeedOverride(sim, r, input.firstRowSpeedOverride);
    // Two passes — each carrier in its own travel direction (each
    // carrier alternates +/- off where it last ended, which reproduces
    // the reference's C3 +/-/+/- vs C4 -/+/-/+ opposition).
    for (const carrier of colors) {
      const keyId = keyIdForCarrier.get(carrier)!;
      const dir = directionForCarrier(sim, carrier);
      pushComplementPass(sim, r, dir, resolved, keyId, carrier, needleStart);
    }
    restoreFirstRowSpeedOverride(sim, r, input.firstRowSpeedOverride);
  }
  ops.push(...sim.drainOps());

  // Lined finish (mirrors jacquard-birdseye.ts): every column's back-bed
  // needle holds a lining loop after the final row (complement lining
  // covers the whole width every row). Home them b->f so the doubled
  // front loops merge on the first finish knit; otherwise the top lining
  // row drops live under waste-and-drop. `machine-bindoff`'s
  // `linedBackBed` consolidation row consumes the resulting doubles.
  const homeCols: number[] = [];
  for (let c = 0; c < resolved.cols; c++) homeCols.push(needleStart + c);
  if (homeCols.length > 0) {
    ops.push(comment('-- lined finish: home final-row lining b->f --'));
    ops.push(...emitNonAdjacentXferBatches(
      homeCols.map(needle => ({ needle, direction: 'b-to-f' as const })),
    ));
  }

  return {
    ops,
    predictedPasses: sim.predictedPasses(),
    finalNextDirection: sim.finalNextDirection(),
    finalCarrierStates: sim.snapshot(),
  };
}

// ---- Internal helpers --------------------------------------------------

function directionForCarrier(sim: CarriageSimulator, carrier: CarrierId): Direction {
  const state = sim.positionOf(carrier);
  if (!state) {
    throw new Error(`jacquard-complement: carrier "${carrier}" must be brought in before walking`);
  }
  return state.side === 'left' ? '+' : '-';
}

/**
 * One carrier's combined front+back pass for `row`. For each column:
 * knit the FRONT bed where the cell is this carrier's color, otherwise
 * knit the BACK bed (the inverse image). Every needle in the row is knit
 * exactly once across the two carriers' passes.
 */
function pushComplementPass(
  sim: CarriageSimulator,
  row: number,
  direction: Direction,
  resolved: ResolvedChart,
  keyId: string,
  carrier: CarrierId,
  needleStart: number,
): void {
  // chart-core/color-binding-read-ok: per-needle bed choice is
  // identity-driven (`cell === keyId` picks front, else back).
  const cells = resolved.cells[row]!;
  const visit = (c: number) => {
    const cell = cells[c]!;
    if (cell === KEY_ID_EMPTY) {
      throw new Error(
        `jacquard-complement: no-stitch cell at row ${row} — should have been rejected by the Track A validator`,
      );
    }
    if (cell === keyId) sim.knit(carrier, direction, f(needleStart + c));
    else sim.knit(carrier, direction, backBed(needleStart + c));
  };
  if (direction === '+') {
    for (let c = 0; c < cells.length; c++) visit(c);
  } else {
    for (let c = cells.length - 1; c >= 0; c--) visit(c);
  }
}
