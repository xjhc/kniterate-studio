/**
 * Floats jacquard walker — N pattern colors, front-bed only. Each row
 * gets one front-bed pass per color present (knit-this-color /
 * miss-elsewhere). No back-bed pass. The unworked yarn floats unsecured
 * behind the work.
 *
 * This is the classic "stranded fairisle" technique on a v-bed machine:
 * the back bed holds initial loops but is not knit again during the
 * pattern. Pass count is N per chart row (vs. ladder's N+1 and
 * birdseye's 2N).
 *
 * Tradeoff: long floats are unsecured. The float length cap depends on
 * yarn weight and finished use — Cameron's notes recommend ≤ 5
 * stitches at 7gg for wool worsted. Use birdseye if floats need to be
 * captured.
 *
 * Matches the output style of the fairisle parity recipe's `.kc` exports for
 * fairisle patterns (see `reference/fairisle.kc`).
 */

import { KEY_ID_EMPTY } from '../../colorwork/knitlab1-contract.js';
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
import type { ResolvedChart } from './resolve-chart.js';
import {
  applyFirstRowSpeedOverride,
  restoreFirstRowSpeedOverride,
  type FirstRowSpeedOverride,
} from './first-row-speed.js';

export interface JacquardFloatsInput {
  resolved: ResolvedChart;
  /** keyId → carrier mapping. */
  bindings: Map<string, CarrierId>;
  /** First needle of the pattern range. */
  needleStart: number;
  handoff: SimulatorHandoff;
  /** Phase 4b (2026-05-24): seed the simulator's `nextDirection` from
   *  the previous section's projected end-direction. */
  initialNextDirection?: Direction;
  /** Presser speed/roller for the vendor auto-moves the carriage makes
   *  between same-direction front passes. Customist's fairisle body uses
   *  a fast 600/0 move (the carriage has no yarn to engage on the
   *  return) — see {@link CUSTOMIST_FLOATS_BODY_AUTO_MOVE_PRESSER}. When
   *  omitted, no presser op is emitted and the vendor's default applies
   *  (so plain floats charts aren't silently retuned). */
  bodyAutoMovePresser?: { speed: number; roller: number };
  /** Optional one-row speed dip for the first emitted body row. Customist
   *  fairisle keeps the handoff row at ramp speed 100, then restores the
   *  normal body speed for row 1+. */
  firstRowSpeedOverride?: FirstRowSpeedOverride;
}

/** Customist fairisle body auto-move presser (fast move, no yarn
 *  engaged). The compiler passes this only for the Customist fairisle
 *  recipe path; it is NOT a global default for every floats chart. */
export const CUSTOMIST_FLOATS_BODY_AUTO_MOVE_PRESSER = Object.freeze({ speed: 600, roller: 0 });

export interface JacquardFloatsResult {
  ops: KnitoutOp[];
  /** Phase 4 (2026-05-24): per-section CarriageSimulator predicted-pass
   *  trace. See StockinetteWalkResult.predictedPasses. */
  predictedPasses: readonly PredictedPass[];
  /** Phase 4b (2026-05-24): vendor's runtime `nextDirection` after the
   *  last logical pass in this section. */
  finalNextDirection: Direction;
  finalCarrierStates: ReadonlyMap<CarrierId, CarrierSimState>;
}

export function emitJacquardFloatsWalk(input: JacquardFloatsInput): JacquardFloatsResult {
  const { resolved, bindings, needleStart, handoff } = input;
  const ops: KnitoutOp[] = [];

  if (bindings.size < 2) {
    throw new Error(`jacquard-floats requires ≥2 bindings; got ${bindings.size}`);
  }

  const keyIdForCarrier = new Map<CarrierId, string>();
  for (const [keyId, carrier] of bindings.entries()) {
    keyIdForCarrier.set(carrier, keyId);
  }
  // Binding order is semantic: recipes put their primary body carrier first.
  // The row scheduler uses this only as a tie-break after physical side /
  // nextDirection, so it improves reference parity without overriding the
  // carriage-first choice.
  const carrierPriority: CarrierId[] = [...bindings.values()];

  // Phase E cutover: sim owns floats-body local state from the section handoff.
  const sim = new CarriageSimulator({
    carriers: ['1', '2', '3', '4', '5', '6'],
    initialNextDirection: input.initialNextDirection,
  });
  // Seed every active carrier from the section handoff. Body emitter is
  // often the first sim consumer for these carriers (intro can be handled
  // separately upstream); side-only legacy state anchors at the pattern
  // range edge.
  for (const c of handoff.keys()) {
    seedSimulatorCarrierFromHandoff(sim, handoff, c, (side) => ({
      // chart-core/dimension-read-ok: chart width for carrier anchor needle.
      anchorNeedle: side === 'left' ? f(needleStart) : f(needleStart + (resolved.cells[0]?.length ?? 1) - 1),
      anchorDirection: side === 'left' ? '-' : '+',
    }));
  }
  for (const c of carrierPriority) {
    if (!sim.positionOf(c)) {
      throw new Error(`jacquard-floats: carrier "${c}" must be brought in before walking`);
    }
  }

  // Body auto-moves (the no-carrier `Kn-Kn 0` returns the vendor inserts
  // between same-direction front passes) run at the configured presser
  // when supplied (Customist fairisle: 600/0). Left unset otherwise so
  // plain floats charts keep the vendor default.
  if (input.bodyAutoMovePresser) {
    sim.setPresserSpeed(input.bodyAutoMovePresser.speed);
    sim.setPresserRoller(input.bodyAutoMovePresser.roller);
  }

  const firstRowColors = colorsPresentInRow(resolved, 0, bindings);
  prepositionSecondCarrierForAlternation(
    sim,
    carrierPriority.filter(c => firstRowColors.has(c)),
  );

  for (let r = 0; r < resolved.rows; r++) {
    sim.setSourceRows([r]);
    ops.push(...sim.drainOps());
    ops.push(comment(`row ${r}`));
    applyFirstRowSpeedOverride(sim, r, input.firstRowSpeedOverride);
    const colorsInRow = colorsPresentInRow(resolved, r, bindings);
    const carriersInRow = carrierPriority.filter(c => colorsInRow.has(c));
    while (carriersInRow.length > 0) {
      const nextDirection = sim.finalNextDirection();
      const nextIndex = carriersInRow.findIndex(
        c => directionForCarrier(sim, c) === nextDirection,
      );
      const [c] = carriersInRow.splice(nextIndex >= 0 ? nextIndex : 0, 1);
      if (!c) continue;
      const keyId = keyIdForCarrier.get(c)!;
      const dir = directionForCarrier(sim, c);
      pushFrontPassForColor(sim, r, dir, resolved, keyId, c, needleStart);
    }
    restoreFirstRowSpeedOverride(sim, r, input.firstRowSpeedOverride);
  }
  sim.setSourceRows();
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
    throw new Error(`jacquard-floats: carrier "${carrier}" must be brought in before walking`);
  }
  return state.side === 'left' ? '+' : '-';
}

function prepositionSecondCarrierForAlternation(
  sim: CarriageSimulator,
  carriersInFirstRow: readonly CarrierId[],
): void {
  if (carriersInFirstRow.length !== 2) return;
  const [first, second] = carriersInFirstRow;
  if (!first || !second) return;

  const firstDirection = directionForCarrier(sim, first);
  if (firstDirection !== sim.finalNextDirection()) return;
  const secondDirection = directionForCarrier(sim, second);
  if (secondDirection !== firstDirection) return;

  // When both two-color body carriers start on the same side, the old
  // shape paid one vendor auto-move per body row. Park the second carrier
  // to the opposite side once, before row 0, so the normal row scheduler
  // can alternate carriers without row-scaling no-carrier moves.
  sim.parkAt(second, secondDirection === '+' ? 'right' : 'left');
}

function colorsPresentInRow(
  resolved: ResolvedChart,
  row: number,
  bindings: Map<string, CarrierId>,
): Set<CarrierId> {
  const present = new Set<CarrierId>();
  // chart-core/color-binding-read-ok: iterate the row's resolved keyIds
  // to gather the set of carriers needed for this row. Identity-only:
  // no semantic op interpretation, no per-cell role lookup.
  const cells = resolved.cells[row];
  if (!cells) return present;
  for (const cell of cells) {
    if (cell === KEY_ID_EMPTY) {
      throw new Error(`jacquard-floats: no-stitch cell at row ${row} — should have been rejected by Track A validator`);
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
  // chart-core/color-binding-read-ok: drive the per-needle knit/miss
  // pattern from the row's resolved keyIds — `cell === keyId` is an
  // identity check picking which color this front-pass belongs to.
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
