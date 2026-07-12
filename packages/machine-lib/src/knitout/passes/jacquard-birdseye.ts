/**
 * Birdseye-back jacquard walker — N pattern colors, N back-bed passes
 * per chart row with each color knitting a stippled subset of needles
 * so the back surface is uniformly covered and every float gets caught.
 *
 * Per Kniterate's [Birdseye Jacquard
 * blog](https://www.kniterate.com/2025/05/21/birdseye-backs-in-jacquard-knitting/):
 *
 *   "Knit-knit-miss and miss-miss-knit (the second one filling the
 *    missed needle with a knit)."
 *
 * For two colors that's a 3-needle repeat — color A does knit-knit-miss,
 * color B does miss-miss-knit, so out of every 3 back-bed needles A
 * gets 2 and B gets 1, and across rows the assignment alternates so the
 * coverage averages to half-half. For N colors we generalize:
 *
 *   back-bed needle `n` on row `r` belongs to color index
 *   `(n + r) % N` where colors are ordered by carrier number.
 *
 * Each color knits its assigned needles and misses the rest. Across the
 * whole row, every back-bed needle is knit by exactly one color, so the
 * back fabric is uniformly covered and no front-bed float spans an
 * un-captured back needle.
 *
 * The "+0.5 rack on most non-tubular rows" rule from the blog: a
 * half-needle racking offset prevents bed collisions when the same
 * needle position is knit on both beds. We emit `rack(0.5)` before the
 * back-bed passes and `rack(0)` after.
 *
 * Two modes:
 *
 *   - **Minimal**: only colors present in this row participate in the
 *     back-bed pass. Lighter fabric — needles assigned to colors not
 *     active on this row stay un-knit on the back. Floats may show if
 *     a color is missing from a row but assigned to many needles.
 *   - **Full**: all design colors knit their assigned back-bed needles
 *     regardless of whether they appear on the front. Heavier, denser
 *     fabric. Matches what the Kniterate editor's birdseye does by
 *     default for ≥ 3 colors.
 *
 * Today's default is 'minimal' (matches the lighter-fabric Kniterate
 * editor option). The wizard exposes both as a step-2 knob.
 *
 * Pass-count cost summary (matches docs/knitlab1-kniterate-export-plan.md §6.2):
 *
 *   2 colors → 4 passes / row (2 front + 2 back)
 *   3 colors → 6 passes / row
 *   4 colors → 8 passes / row
 *   5 colors → 10 passes / row
 *
 * Same cost profile as lined-back; the *structural* advantage over
 * lined-back is that needle assignments are precomputed and disjoint,
 * so no two colors compete for the same back-bed needle (the bug that
 * disabled `jacquard-lined.ts`).
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

export type BirdseyeMode = 'minimal' | 'full';

/**
 * Back-bed stippling strategy. Each strategy assigns each (row, needle)
 * pair to exactly one color index; the corresponding carrier knits that
 * needle, the others miss.
 *
 *  - **birdseye**: scattered single-needle assignment via `(c + r) % N`.
 *    Best small-scale anti-float coverage; default for 2-3 colors.
 *  - **twill**: 2-needle diagonal stripes via `floor((c + r) / 2) % N`.
 *    Heavier hand; offset shifts each row to create the diagonal.
 *  - **striped**: full-row horizontal stripes via `r % N`. Heaviest hand,
 *    creates wider visible stripes on the back if seen.
 */
export type DbjBackingStrategy = 'birdseye' | 'twill' | 'striped' | 'full';

export interface JacquardBirdseyeInput {
  resolved: ResolvedChart;
  /** keyId → carrier mapping. */
  bindings: Map<string, CarrierId>;
  /** First needle of the pattern range. */
  needleStart: number;
  handoff: SimulatorHandoff;
  /** Whether to emit back-bed passes for all design colors (`'full'`)
   *  or only those present in the current row (`'minimal'`). Default
   *  `'minimal'`. */
  mode?: BirdseyeMode;
  /** B4 extension: choose the back-bed stippling formula. Default
   *  `'birdseye'`. */
  strategy?: DbjBackingStrategy;
  /** Phase 4b (2026-05-24): seed the simulator's `nextDirection` from
   *  the previous section's projected end-direction. */
  initialNextDirection?: Direction;
  /** Slow the first actual body row after cast-on, then restore body
   *  speed for row 1+. */
  firstRowSpeedOverride?: FirstRowSpeedOverride;
}

export interface JacquardBirdseyeResult {
  ops: KnitoutOp[];
  /** Phase 4 (2026-05-24): per-section CarriageSimulator predicted-pass
   *  trace. See StockinetteWalkResult.predictedPasses. */
  predictedPasses: readonly PredictedPass[];
  /** Phase 4b (2026-05-24): vendor's runtime `nextDirection` after the
   *  last logical pass in this section. */
  finalNextDirection: Direction;
  finalCarrierStates: ReadonlyMap<CarrierId, CarrierSimState>;
}

export function emitJacquardBirdseyeWalk(input: JacquardBirdseyeInput): JacquardBirdseyeResult {
  const { resolved, bindings, needleStart, handoff, mode = 'minimal' } = input;
  const strategy: DbjBackingStrategy = input.strategy ?? 'birdseye';
  const ops: KnitoutOp[] = [];

  if (bindings.size < 2) {
    throw new Error(`jacquard-birdseye requires ≥2 bindings; got ${bindings.size}`);
  }

  // Stable color order — carrier numeric value. The color index in this
  // sorted list IS what feeds the stippling formula `(n + r) % N`, so
  // it must be deterministic.
  const allColors: CarrierId[] = [...bindings.values()].sort();
  const N = allColors.length;
  const keyIdForCarrier = new Map<CarrierId, string>();
  for (const [keyId, carrier] of bindings.entries()) {
    keyIdForCarrier.set(carrier, keyId);
  }

  // Phase E cutover: sim owns birdseye-body local state from the section handoff.
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
  for (const c of allColors) {
    if (!sim.positionOf(c)) {
      throw new Error(`jacquard-birdseye: carrier "${c}" must be brought in before walking`);
    }
  }

  for (let r = 0; r < resolved.rows; r++) {
    ops.push(...sim.drainOps());
    ops.push(comment(`row ${r}`));
    applyFirstRowSpeedOverride(sim, r, input.firstRowSpeedOverride);

    // Step 1: front-bed passes — one per color present in this row.
    const colorsInRow = colorsPresentInRow(resolved, r, bindings);
    for (const c of allColors) {
      if (!colorsInRow.has(c)) continue;
      const keyId = keyIdForCarrier.get(c)!;
      const dir = directionForCarrier(sim, c);
      pushFrontPassForColor(sim, r, dir, resolved, keyId, c, needleStart);
    }

    // Step 2: rack to +0.5 for the back-bed passes.
    const backColorIndices: number[] = [];
    for (let i = 0; i < N; i++) {
      const c = allColors[i]!;
      if (mode === 'minimal' && !colorsInRow.has(c)) continue;
      backColorIndices.push(i);
    }
    if (backColorIndices.length > 0) sim.setRacking(0.5);

    // Step 3: back-bed passes — stippled per `strategy`.
    for (const ci of backColorIndices) {
      const c = allColors[ci]!;
      const dir = directionForCarrier(sim, c);
      pushDbjBackPass(sim, r, ci, N, dir, resolved.cols, c, needleStart, strategy);
    }

    // Step 4: rack back to neutral.
    if (backColorIndices.length > 0) sim.setRacking(0);
    restoreFirstRowSpeedOverride(sim, r, input.firstRowSpeedOverride);
  }
  ops.push(...sim.drainOps());

  // Lined finish (DBJ-garment campaign 2026-06-13, mirrors the shaped
  // walker's finish in stockinette-shaped.ts): the last chart row leaves
  // its lining loops on the back bed. Bring them home (b->f) so the
  // doubled front loops merge on the first finish knit — the waste-and-drop
  // waste rows are front-bed only, so an un-homed back loop would drop
  // live and the top lining row would unravel. The shaped path already
  // does this; without it a NON-shaped rectangle birdseye chart drops its
  // top lining row at finish. `machine-bindoff` consumes the resulting
  // doubles via its `linedBackBed` consolidation row.
  const homeCols = finalRowLinedCols(resolved, bindings, allColors, N, mode, strategy);
  if (homeCols.length > 0) {
    ops.push(comment('-- lined finish: home final-row lining b->f --'));
    ops.push(...emitNonAdjacentXferBatches(
      homeCols.map(c => ({ needle: needleStart + c, direction: 'b-to-f' as const })),
    ));
  }

  const finalCarrierStates = sim.snapshot();

  return {
    ops,
    predictedPasses: sim.predictedPasses(),
    finalNextDirection: sim.finalNextDirection(),
    finalCarrierStates,
  };
}

/**
 * Columns whose back-bed needle holds a lining loop after the final chart
 * row — exactly the needles the lined finish must home. Each column is
 * owned by one color index under the stippling formula; it carries a loop
 * iff that owner color knit the back bed on the final row ('full' mode →
 * always; 'minimal' mode → only when the owner color appears in the row).
 */
function finalRowLinedCols(
  resolved: ResolvedChart,
  bindings: Map<string, CarrierId>,
  allColors: readonly CarrierId[],
  totalColors: number,
  mode: BirdseyeMode,
  strategy: DbjBackingStrategy,
): number[] {
  const r = resolved.rows - 1;
  if (r < 0) return [];
  const colorsInRow = colorsPresentInRow(resolved, r, bindings);
  const cols: number[] = [];
  for (let c = 0; c < resolved.cols; c++) {
    for (let ci = 0; ci < totalColors; ci++) {
      if (!ownsNeedle(strategy, c, r, totalColors, ci)) continue;
      // Exactly one owner per column; covered iff full mode or the owner
      // color is present in the final row's front pass.
      if (mode === 'full' || colorsInRow.has(allColors[ci]!)) cols.push(c);
      break;
    }
  }
  return cols;
}

// ---- Internal helpers --------------------------------------------------

function directionForCarrier(sim: CarriageSimulator, carrier: CarrierId): Direction {
  const state = sim.positionOf(carrier);
  if (!state) {
    throw new Error(`jacquard-birdseye: carrier "${carrier}" must be brought in before walking`);
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
      throw new Error(`jacquard-birdseye: no-stitch cell at row ${row} — should have been rejected by Track A validator`);
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

/**
 * Back-bed pass for one color. Stippling formula:
 *   needle column `c` (0-indexed within the chart's width) on row `r`
 *   belongs to color index `(c + r) % N`.
 *
 * The color knits its assigned needles and misses the rest. Across all
 * N color passes, every back-bed needle is knit exactly once → full
 * coverage, no floats.
 */
function ownsNeedle(
  strategy: DbjBackingStrategy,
  col: number,
  row: number,
  totalColors: number,
  colorIndex: number,
): boolean {
  switch (strategy) {
    case 'birdseye':
      return (col + row) % totalColors === colorIndex;
    case 'twill':
      // 2-needle diagonal stripes. The +row term shifts the stripe each
      // row to create the diagonal.
      return Math.floor((col + row) / 2) % totalColors === colorIndex;
    case 'striped':
      // Each row is entirely one color (cycles by row).
      return row % totalColors === colorIndex;
    case 'full':
      // Handled by the Customist DBJ full-back walker, not this generic
      // partitioned-back walker.
      return false;
  }
}

function pushDbjBackPass(
  sim: CarriageSimulator,
  row: number,
  colorIndex: number,
  totalColors: number,
  direction: Direction,
  cols: number,
  carrier: CarrierId,
  needleStart: number,
  strategy: DbjBackingStrategy,
): void {
  if (direction === '+') {
    for (let c = 0; c < cols; c++) {
      const needle = backBed(needleStart + c);
      const owns = ownsNeedle(strategy, c, row, totalColors, colorIndex);
      if (owns) sim.knit(carrier, direction, needle);
      else sim.miss(carrier, direction, needle);
    }
  } else {
    for (let c = cols - 1; c >= 0; c--) {
      const needle = backBed(needleStart + c);
      const owns = ownsNeedle(strategy, c, row, totalColors, colorIndex);
      if (owns) sim.knit(carrier, direction, needle);
      else sim.miss(carrier, direction, needle);
    }
  }
}
