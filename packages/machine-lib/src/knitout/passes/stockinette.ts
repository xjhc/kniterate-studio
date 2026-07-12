/**
 * Phase 1 row walker — single-color front-bed stockinette.
 *
 * Walks the resolved chart bottom-up (row 0 = first knit row), one
 * carrier, alternating direction every row. Trivial but proves the
 * compile pipeline end-to-end.
 *
 * No-stitch cells are not allowed in Track A and should have been
 * rejected by the validator already; this walker treats them as a hard
 * error if encountered.
 */

import {
  rackingAtRow,
  stitchNumberAtRow,
  type RowRackEntry,
  type RowStitchEntry,
} from '../../colorwork/row-rack-schedule.js';
import {
  comment,
  f,
  pause,
  rack,
  xStitchNumber,
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
import { emitLateralShift } from './lateral-shift.js';
import {
  applyFirstRowSpeedOverride,
  restoreFirstRowSpeedOverride,
  type FirstRowSpeedOverride,
} from './first-row-speed.js';
import {
  chooseDispatch,
  shapeFromCableSpan,
  unsupportedCableReason,
} from '../../chart-core/cable-registry.js';
import type { ResolvedChartProjection } from '../../chart-core/types.js';

/** B2b (2026-05-20): cable events scheduled into the walker's row space.
 *  Caller supplies them in the same row index space as `resolved.cells`
 *  (e.g. after any bottom-up reversal).
 *
 *  Batch D Phase 0 §0.2 (2026-05-22): carries `workedWidth`/`purlWidth`
 *  for asymmetric cables-over-purl. For symmetric C2/4/6/8 events these
 *  default to `floor(width / 2)` and the legacy `emitCableCross` path
 *  ignores them. */
export interface CableScheduleEvent {
  row: number;
  startCol: number;
  width: number;
  workedWidth: number;
  purlWidth: number;
  direction: 'front' | 'back';
  /** Batch D Phase 1 (2026-05-22): see `ChartCableEvent.hasPurlBackground`.
   *  Drives walker dispatch between `emitCableCross` (all-front-bed) and
   *  `emitAsymmetricCableCross` (purl loops live on the back bed). */
  hasPurlBackground: boolean;
}

/** Lateral-shift event scheduled into the walker's row space. Caller
 *  supplies them in the same row index space as `resolved.cells`. The
 *  walker fires `emitLateralShift` BEFORE the row's knit pass, which
 *  rides `count` stitches across a 1-column rack-and-xfer dance and
 *  ends with a k2tog at the source-side dest column. Per-stitch shift-1
 *  semantics: the block always slides by 1 column regardless of `count`;
 *  exactly one column is vacated (at destStartCol+count for L direction,
 *  destStartCol-1 for R direction). */
export interface ShiftScheduleEvent {
  row: number;
  destStartCol: number;
  count: number;
  direction: 'left' | 'right';
}

export interface StockinetteWalkInput {
  /** Phase 1c (2026-05-24): walker reads per-cell semantics from the
   *  chart-core projection. The walker only ever asks "is this cell
   *  no-stitch?" (defensive — Track A validator should have caught it
   *  already); every other cell is treated as plain knit. */
  projection: ResolvedChartProjection;
  /** Pattern carrier (single color). */
  carrier: CarrierId;
  needleStart: number;
  handoff: SimulatorHandoff;
  /** B2b + Batch D Phase 1 (2026-05-22): cable events to lower into
   *  transfer choreography. Dispatch goes through `dispatchCableEvent`:
   *  symmetric C2/4/6/8 → `emitCableCross`; 1×1 traveller → `emitTraveller`;
   *  LPC/RPC (any cable with `hasPurlBackground=true`) →
   *  `emitAsymmetricCableCross`. Unsupported shapes are filtered via
   *  `cableEventIsSupported`; the chart-track-a gate rejects them upstream
   *  with a clear diagnostic. */
  cableEvents?: ReadonlyArray<CableScheduleEvent>;
  /** Batch D Phase 2 (2026-05-22): lateral-shift events to lower into
   *  rack-and-xfer choreography via `emitLateralShift`. Fired BEFORE the
   *  row's knit pass; the chart-continuity validator enforces that the
   *  source columns (at destStartCol ± count) are no-stitch on the same
   *  row and were active on the previous row, so the source loops are
   *  on the front bed when the helper fires. */
  shiftEvents?: ReadonlyArray<ShiftScheduleEvent>;
  /** Carriage-pause annotation (Milestone B, 2026-05-26): mirror of
   *  `StitchOverrideWalkInput.rowPauseSet`. */
  rowPauseSet?: ReadonlySet<number>;
  /** Batch D Phase 4 (2026-05-22): row-rack schedule derived from
   *  `racking` row annotations. At each row boundary the walker queries
   *  the schedule; if the value differs from the current ambient, the
   *  walker emits a `rack(newValue)` op before the row's knit pass.
   *  Cable / traveller / shift helpers fired on that row receive the
   *  ambient rack and restore to it (not 0) at end. */
  rowRackSchedule?: ReadonlyArray<RowRackEntry>;
  /** Per-row stitch-number (tension) schedule from `stitch-number` row
   *  annotations — "these rows knit at tension X." At each row boundary
   *  the walker queries the schedule; if a row carries an annotation that
   *  differs from the current ambient stitch number, it emits
   *  `x-stitch-number` before the row's knit pass. Sticky: unannotated
   *  rows keep the last value. */
  rowStitchSchedule?: ReadonlyArray<RowStitchEntry>;
  /** Body's pre-walk stitch number — seeds ambient tension so a
   *  `stitch-number` annotation equal to the body default isn't
   *  redundantly re-emitted. */
  bodyStitchNumber?: number;
  /** Phase 4b (2026-05-24): seed the simulator's `nextDirection` from
   *  the previous section's projected end-direction. */
  initialNextDirection?: Direction;
  /** W-1 (2026-06-30): slow the first actual body row after cast-on,
   *  then restore body speed for row 1+. This mitigates Kniterate's
   *  right-edge stitch-drop timing bug without inserting extra rows. */
  firstRowSpeedOverride?: FirstRowSpeedOverride;
}

export interface StockinetteWalkResult {
  ops: KnitoutOp[];
  /** Phase 4 (2026-05-24): per-section CarriageSimulator predicted-pass
   *  trace. Read by `compileChartToKniteratePlan` to assemble a
   *  whole-program `predictedPasses` for the RunArtifact. Observability
   *  only — no validator consumes this. */
  predictedPasses: readonly PredictedPass[];
  /** Phase 4b (2026-05-24): vendor's runtime `nextDirection` after the
   *  last logical pass in this section. */
  finalNextDirection: Direction;
  finalCarrierStates: ReadonlyMap<CarrierId, CarrierSimState>;
}

export function emitStockinetteWalk(input: StockinetteWalkInput): StockinetteWalkResult {
  const { projection, carrier, needleStart, handoff, cableEvents, shiftEvents, rowRackSchedule, rowStitchSchedule, rowPauseSet } = input;
  const ops: KnitoutOp[] = [];

  if (!handoff.has(carrier)) {
    throw new Error(`stockinette walk: carrier "${carrier}" must be brought in by the waste section before walking`);
  }

  // Batch D Phase 4 (2026-05-22): track the carriage's current ambient
  // rack so we only emit `rack(N)` ops at boundaries (value changes).
  // Cable / shift helpers fired this row are passed `ambientRack` and
  // restore to it instead of clobbering with rack(0).
  let ambientRack = 0;

  // Track the current ambient stitch number (tension), seeded from the
  // body's pre-walk x-stitch-number so an annotation equal to the default
  // isn't redundantly re-emitted. Sticky: only re-emitted when an
  // annotated row changes it.
  let ambientStitch: number | undefined = input.bodyStitchNumber;

  // Group cable events by row for fast lookup during the walk.
  // - Symmetric knit-over-knit (hasPurlBackground=false): widths 2/4/6/8 via
  //   `emitCableCross`; LT/RT (width=2) take the same path.
  // - Asymmetric / over-purl (hasPurlBackground=true, Batch D Phase 1):
  //   widths 2 (1/1) and 3 (1/2 or 2/1) via `emitAsymmetricCableCross`.
  // Anything else stays gated by `chart-track-a-cable-unsupported`.
  const cablesByRow = new Map<number, CableScheduleEvent[]>();
  for (const event of cableEvents ?? []) {
    if (!cableEventIsSupported(event)) continue;
    const bucket = cablesByRow.get(event.row);
    if (bucket) bucket.push(event);
    else cablesByRow.set(event.row, [event]);
  }

  // Batch D Phase 2 (2026-05-22): bucket shift events by row. Fired BEFORE
  // the row's knit pass (same as cables) so the loops are at their final
  // destination columns when the knit pass anchors them.
  const shiftsByRow = new Map<number, ShiftScheduleEvent[]>();
  for (const event of shiftEvents ?? []) {
    const bucket = shiftsByRow.get(event.row);
    if (bucket) bucket.push(event);
    else shiftsByRow.set(event.row, [event]);
  }

  // Phase E cutover: use CarriageSimulator for stockinette local state.
  // Cable/shift helpers emit raw ops directly (they touch
  // no carriers and restore racking to ambient at end), so we drain sim
  // ops before each helper invocation and let the helper's ops slot in
  // between sim-tracked sections. The sim's racking belief stays
  // consistent because the helper restores to whatever ambient it
  // received from us.
  const sim = new CarriageSimulator({
    carriers: ['1', '2', '3', '4', '5', '6'],
    initialNextDirection: input.initialNextDirection,
  });
  seedSimulatorCarrierFromHandoff(sim, handoff, carrier, (side) => ({
    anchorNeedle: side === 'left' ? f(needleStart) : f(needleStart + projection.cols - 1),
    anchorDirection: side === 'left' ? '-' : '+',
  }));

  // Walk rows from BOTTOM to TOP of the chart. The chart's row 0 is the
  // cast-on edge (visually bottom in bottom-up knitting); the chart's
  // row (rows-1) is the bind-off edge (visually top).
  //
  // knitlab1 ChartState.orientation can be 'bottom-up' / 'top-down' /
  // 'left-right' / 'in-the-round', but the compiler always walks
  // bottom-up. The Track A validator (G16, src/validators/chart-track-a.ts)
  // warns when a non-bottom-up chart reaches us so the user can flip in
  // knitlab1 if they care about the on-machine orientation matching the
  // visual one. Honoring top-down / left-right / in-the-round natively
  // would require row reversal + dimension swap and is deferred.
  for (let r = 0; r < projection.rows; r++) {
    sim.setSourceRows([r]);
    ops.push(...sim.drainOps());
    const dir = directionForCarrier(sim, carrier);
    ops.push(comment(`row ${r}`));
    applyFirstRowSpeedOverride(sim, r, input.firstRowSpeedOverride);

    // Batch D Phase 4 (2026-05-22): rack boundary. If the schedule
    // requests a new ambient rack, emit it BEFORE cables/shifts/knit
    // so the rest of the row inherits the new value. Drain sim first
    // so the rack op lands at the right place.
    if (rowRackSchedule) {
      const requested = rackingAtRow(rowRackSchedule, r);
      if (requested !== ambientRack) {
        ops.push(...sim.drainOps());
        ops.push(rack(requested));
        ambientRack = requested;
      }
    }
    // "These rows are tension X": emit x-stitch-number before the row's
    // knit pass when a stitch-number annotation changes the ambient value.
    if (rowStitchSchedule) {
      const requested = stitchNumberAtRow(rowStitchSchedule, r);
      if (requested !== undefined && requested !== ambientStitch) {
        ops.push(...sim.drainOps());
        ops.push(xStitchNumber(requested));
        ambientStitch = requested;
      }
    }
    // Carriage-pause annotation: emit pause op before this row's knit pass.
    if (rowPauseSet?.has(r)) {
      ops.push(...sim.drainOps());
      ops.push(pause(`pause at row ${r}`));
    }

    // B2b: fire cable transfer choreography BEFORE the row's knit pass.
    // Helpers emit raw ops directly (no carriers). Drain sim first.
    const cablesThisRow = cablesByRow.get(r) ?? [];
    if (cablesThisRow.length > 0) ops.push(...sim.drainOps());
    for (const event of cablesThisRow) {
      ops.push(...dispatchCableEvent(event, needleStart, ambientRack));
    }

    // Batch D Phase 2 (2026-05-22): fire lateral-shift choreography after
    // cables.
    const shiftsThisRow = shiftsByRow.get(r) ?? [];
    if (shiftsThisRow.length > 0) ops.push(...sim.drainOps());
    for (const event of shiftsThisRow) {
      ops.push(...emitLateralShift({
        direction: event.direction,
        count: event.count,
        destLeftNeedle: needleStart + event.destStartCol,
        ambientRack,
      }));
    }

    // Defensive: surface the no-stitch error before sim emits anything.
    // Phase 1c (2026-05-24): consult the projection's per-cell semanticOp
    // instead of the raw keyId. Catches both explicit KEY_ID_EMPTY
    // placements AND atomic-tile source cells (whose semanticOp is
    // 'no-stitch' even though the cell carries a non-empty owner keyId).
    for (let c = 0; c < projection.cols; c++) {
      if (projection.cellAt(r, c).semanticOp === 'no-stitch') {
        throw new Error(`stockinette walk: no-stitch cell at (${r},${c}) — should have been rejected by Track A validator`);
      }
    }
    if (dir === '+') {
      sim.frontBedRow(carrier, '+', needleStart, needleStart + projection.cols - 1);
    } else {
      sim.frontBedRow(carrier, '-', needleStart + projection.cols - 1, needleStart);
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
    throw new Error(`stockinette walk: carrier "${carrier}" must be active before walking`);
  }
  return state.side === 'left' ? '+' : '-';
}

/**
 * Batch D Phase 1 (2026-05-22): dispatch a single cable event to the
 * correct helper. Hoisted to a free function so the plain walker and the
 * overrides walker share the routing.
 *
 * - `hasPurlBackground` → `emitAsymmetricCableCross` (LPC/RPC family).
 * - 1×1 knit-over-knit (workedWidth=1, purlWidth=1, no purl bg, width=2):
 *   `emitTraveller` (chart-level LT/RT shorthand; mechanically C2F/C2B).
 * - Symmetric knit-over-knit (workedWidth === purlWidth, width ∈ {2,4,6,8}):
 *   legacy `emitCableCross`.
 * - Anything else: throw (caller should have gated via
 *   `cableEventIsSupported` so this is a programmer-error path).
 */
/**
 * Phase 2 cable registry (Task #40, 2026-05-24): both `dispatchCableEvent`
 * and `cableEventIsSupported` now thin-wrap `chooseDispatch` from
 * `src/chart-core/cable-registry.ts`. The triplicated truth table
 * (validator + supported predicate + dispatch) collapsed into one
 * shape→dispatch function in chart-core. Adding a new cable family
 * means editing `chooseDispatch` and adding an OperationSpec in
 * `src/chart-core/spec-registry.ts` — never touching this file.
 */
function shapeForEvent(event: CableScheduleEvent) {
  return shapeFromCableSpan(event, event.hasPurlBackground);
}

export function dispatchCableEvent(
  event: CableScheduleEvent,
  needleStart: number,
  ambientRack: number = 0,
): KnitoutOp[] {
  const shape = shapeForEvent(event);
  const dispatch = chooseDispatch(shape);
  if (!dispatch) {
    throw new Error(
      `dispatchCableEvent: ${unsupportedCableReason(shape)}; chart-track-a should have rejected this.`,
    );
  }
  return dispatch.emit({
    needleStart,
    startCol: event.startCol,
    ambientRack,
  });
}

export function cableEventIsSupported(event: CableScheduleEvent): boolean {
  return chooseDispatch(shapeForEvent(event)) !== null;
}
