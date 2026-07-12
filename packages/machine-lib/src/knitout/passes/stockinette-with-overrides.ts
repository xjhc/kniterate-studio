/**
 * P6 stockinette walker with per-cell stitch overrides.
 *
 * Extends the plain stockinette walker (single color, front bed) with
 * stitch-type overrides per cell:
 *
 *   - 'knit'  → knit f(n) C            (default)
 *   - 'purl'  → knit b(n) C            (front purl = back knit on V-bed)
 *   - 'tuck'  → tuck f(n) C
 *   - 'tuck-back' → tuck b(n) C        (brioche: tuck the held back loop)
 *   - 'slip'  → miss f(n) C            (carrier passes, no loop)
 *   - 'drop'  → knit + then drop f(n)  (intentional ladder)
 *   - 'pause' → knit f(n) C plus a `pause` op at row start (once/row)
 *
 * The CAST-ON row must be aware of column bed assignments so purl
 * columns start on the back bed. `castOnBedPattern(row0)` derives the
 * per-column bed array.
 *
 * No-stitch cells are still rejected — Track A is rectangular only.
 */

import { opForKey, type KnitlabKnitOp } from '../../colorwork/knitlab1-contract.js';
import { rackingAtRow, type RowRackEntry } from '../../colorwork/row-rack-schedule.js';
import {
  comment,
  drop,
  f,
  b as backBed,
  pause,
  rack,
  type CarrierId,
  type Direction,
  type KnitoutOp,
  type StitchType,
} from '../types.js';
import {
  seedSimulatorCarrierFromHandoff,
  type SimulatorHandoff,
} from './simulator-handoff.js';
import { CarriageSimulator } from '../sim/carriage-simulator.js';
import type { CarrierSimState, PredictedPass } from '../sim/types.js';
import { cableEventIsSupported, dispatchCableEvent, type CableScheduleEvent, type ShiftScheduleEvent } from './stockinette.js';
import { emitLateralShift } from './lateral-shift.js';
import type { ResolvedChartProjection } from '../../chart-core/types.js';
import {
  applyFirstRowSpeedOverride,
  restoreFirstRowSpeedOverride,
  type FirstRowSpeedOverride,
} from './first-row-speed.js';

export interface StitchOverrideWalkInput {
  /** Phase 1c (2026-05-24): walker consumes the chart-core projection
   *  (per-cell `semanticOp` + `keyDef` + `keyId`). Multi-cell-tile
   *  per-cell op overrides ride along on the projection instead of a
   *  parallel `cellOps` sidecar. The projection's row index space must
   *  match `needleStart`/cable+shift event coords (caller threads the
   *  row-reversed projection in shape-mode bottom-up). */
  projection: ResolvedChartProjection;
  carrier: CarrierId;
  needleStart: number;
  handoff: SimulatorHandoff;
  /** keyId → StitchType. Cells whose keyId isn't here default to 'knit'. */
  stitchTypeForKey: Map<string, StitchType>;
  /**
   * Batch D Phase 0 §0.8 (2026-05-22): cable events scheduled into the
   * walker's row space. Mirror of `StockinetteWalkInput.cableEvents` —
   * without this, cables painted on a chart that also carries purl /
   * tuck cells (which forces routing through the overrides walker)
   * would silently drop the cross. Width filter happens here; widths
   * other than 2/4/6/8 stay gated by chart-track-a.
   */
  cableEvents?: ReadonlyArray<CableScheduleEvent>;
  /**
   * Batch D Phase 2 (2026-05-22): lateral-shift events. Mirror of
   * `StockinetteWalkInput.shiftEvents`. Same rationale as cableEvents —
   * a shift painted on a chart that also carries purl/tuck cells routes
   * through this walker, so the dispatch must live here too.
   */
  shiftEvents?: ReadonlyArray<ShiftScheduleEvent>;
  /**
   * Batch D Phase 4 (2026-05-22): row-rack schedule. Mirror of
   * `StockinetteWalkInput.rowRackSchedule`. At each row boundary, the
   * walker emits `rack(N)` if the value differs from the current
   * ambient; cables/shifts on the row receive the ambient and restore
   * to it instead of clobbering to 0.
   */
  rowRackSchedule?: ReadonlyArray<RowRackEntry>;
  /** Carriage-pause annotation (Milestone B, 2026-05-26): set of row indices
   *  that carry a `kind: 'pause'` row annotation. The walker emits a knitout
   *  `pause` op before each such row's knit pass. */
  rowPauseSet?: ReadonlySet<number>;
  /** Phase 4b (2026-05-24): seed the simulator's `nextDirection` from
   *  the previous section's projected end-direction. */
  initialNextDirection?: Direction;
  /** Slow the first actual body row after cast-on, then restore body
   *  speed for row 1+. */
  firstRowSpeedOverride?: FirstRowSpeedOverride;
}

/** B1 walker migration: convert a per-cell KnitOp override to the
 *  walker's `StitchType`. Mirrors `stitchTypeForOp` in compile-chart.ts —
 *  duplicated here to keep this pass dependency-free from the plan
 *  layer. Any future op additions must be threaded through both. */
function stitchTypeForCellOp(op: KnitlabKnitOp): StitchType | null {
  switch (op) {
    case 'purl': return { kind: 'purl' };
    case 'tuck': return { kind: 'tuck' };
    case 'tuck-back': return { kind: 'tuck-back' };
    case 'knit': return { kind: 'knit' };
    case 'no-stitch': return { kind: 'no-stitch' };
    case 'yarn-over': return { kind: 'yarn-over' };
    // k2tog / ssk / sk2p / k3tog / sssk / m1l / m1r aren't lowered by this
    // walker. Returning null lets the per-cell branch fall through to the
    // key-level binding (which validateChartForTrackA has already gated as
    // needed for shape mode).
    case 'k2tog':
    case 'ssk':
    case 'sk2p':
    case 'k3tog':
    case 'sssk':
    case 'p2tog':
    case 'ssp':
    case 'sp2p':
    case 'p3tog':
    case 'sssp':
    case 'sl-wyif':
    case 'sl-wyib':
    case 'k-tbl':
    case 'p-tbl':
    case 'kfb':
    case 'pfb':
    case 'knit-below':
    case 'mb':
    case 'kpk-in-1':
    case 'm1l':
    case 'm1r':
    // Batch D Phase 1 (2026-05-22): traveller / asymmetric cable ops lower
    // via cable-event dispatch (Phase 0 §0.8 plumbing). The per-cell op is
    // not consulted here — return null so the key-level binding (typically
    // knit on the worked side, purl on the bg side) drives the row's pass.
    case 'lt':
    case 'rt':
    case 'lpc-1-1':
    case 'lpc-1-2':
    case 'lpc-2-1':
    case 'rpc-1-1':
    case 'rpc-1-2':
    case 'rpc-2-1':
    // Structural-soundness goal (2026-05-23): shift-1 destination cells
    // lower to plain knit at the destination columns; the rack+xfer
    // fires through the shift-event channel before the row's knit pass.
    case 'shift-1-l':
    case 'shift-1-r':
    // Batch D Phase 3 (2026-05-22): purl-symmetry + drop ops. Not lowered
    // by the per-cell overrides walker — they're shape-walker territory
    // (M1Lp/M1Rp via emitIncreaseForCell) or hand-knit only (p1-below /
    // drop-st). Return null so the key-level binding drives the row's
    // pass; chart-track-a gates the shape ops outside shape mode.
    case 'm1lp':
    case 'm1rp':
    case 'p1-below':
    case 'drop-st':
    case 'rack-plus-1':
    case 'rack-minus-1':
    case 'wt-left':
    case 'wt-right':
    // Carriage pause is an annotation tool; the row annotation fires the knitout
    // pause op via rowPauseSet, not via per-cell stitch placement.
    case 'pause':
      return null;
  }
}

export interface StitchOverrideWalkResult {
  ops: KnitoutOp[];
  /** Phase 4 (2026-05-24): per-section CarriageSimulator predicted-pass
   *  trace. See StockinetteWalkResult.predictedPasses. */
  predictedPasses: readonly PredictedPass[];
  /** Phase 4b (2026-05-24): vendor's runtime `nextDirection` after the
   *  last logical pass in this section. */
  finalNextDirection: Direction;
  finalCarrierStates: ReadonlyMap<CarrierId, CarrierSimState>;
}

export function emitStockinetteWithOverridesWalk(input: StitchOverrideWalkInput): StitchOverrideWalkResult {
  const { projection, carrier, needleStart, handoff, stitchTypeForKey, cableEvents, shiftEvents, rowRackSchedule, rowPauseSet } = input;
  const ops: KnitoutOp[] = [];
  if (!handoff.has(carrier)) {
    throw new Error(`stockinette-with-overrides: carrier "${carrier}" must be active before walking`);
  }

  // Batch D Phase 4 (2026-05-22): track ambient rack — see the long
  // comment in the plain walker for the rationale.
  let ambientRack = 0;

  /** Phase 1c (2026-05-24): per-cell op override first, key-level binding
   *  second, knit default. The per-cell override comes from the projection
   *  (only honored when the cell sits inside a multi-cell tile AND its
   *  semanticOp differs from the parent key's footprint op — preserves
   *  the sparse-override semantics of the retired `cellOps` sidecar so a
   *  1×1 user-bound keyId still routes through `stitchTypeForKey`). */
  function stitchTypeAt(r: number, c: number, cellId: string): StitchType {
    const projected = projection.cellAt(r, c);
    const keyDef = projected.keyDef;
    if (keyDef && (keyDef.width > 1 || keyDef.height > 1)) {
      const cellOp = projected.semanticOp;
      if (cellOp !== opForKey(keyDef)) {
        const fromCellOp = stitchTypeForCellOp(cellOp);
        if (fromCellOp) return fromCellOp;
      }
    }
    return stitchTypeForKey.get(cellId) ?? { kind: 'knit' };
  }

  // Batch D Phase 0 §0.8 + Phase 1 (2026-05-22): bucket cable events by
  // row. Dispatch routes to `emitCableCross` / `emitTraveller` /
  // `emitAsymmetricCableCross` via `dispatchCableEvent`; events that
  // don't match a supported shape are filtered (chart-track-a should
  // have raised an error already).
  const cablesByRow = new Map<number, CableScheduleEvent[]>();
  for (const event of cableEvents ?? []) {
    if (!cableEventIsSupported(event)) continue;
    const bucket = cablesByRow.get(event.row);
    if (bucket) bucket.push(event);
    else cablesByRow.set(event.row, [event]);
  }

  // Batch D Phase 2 (2026-05-22): bucket lateral-shift events by row.
  const shiftsByRow = new Map<number, ShiftScheduleEvent[]>();
  for (const event of shiftEvents ?? []) {
    const bucket = shiftsByRow.get(event.row);
    if (bucket) bucket.push(event);
    else shiftsByRow.set(event.row, [event]);
  }

  // Phase E cutover: per-cell knit/tuck/miss go through the simulator,
  // which owns row-local carrier state. Cable/shift helpers + drop/pause
  // stay on the raw-op path with
  // drain-around. Sim's per-needle primitives handle merge/kick/auto-
  // move; mixed knit+tuck rows split correctly (vendor doesn't merge
  // same-bed knit+tuck).
  const sim = new CarriageSimulator({
    carriers: ['1', '2', '3', '4', '5', '6'],
    initialNextDirection: input.initialNextDirection,
  });
  seedSimulatorCarrierFromHandoff(sim, handoff, carrier, (side) => ({
    anchorNeedle: side === 'left'
      ? f(needleStart)
      : f(needleStart + projection.cols - 1),
    anchorDirection: side === 'left' ? '-' : '+',
  }));

  for (let r = 0; r < projection.rows; r++) {
    sim.setSourceRows([r]);
    ops.push(...sim.drainOps());
    const dir = directionForCarrier(sim, carrier);
    ops.push(comment(`row ${r}`));
    applyFirstRowSpeedOverride(sim, r, input.firstRowSpeedOverride);

    // Rack boundary BEFORE any row ops.
    if (rowRackSchedule) {
      const requested = rackingAtRow(rowRackSchedule, r);
      if (requested !== ambientRack) {
        ops.push(...sim.drainOps());
        ops.push(rack(requested));
        ambientRack = requested;
      }
    }

    // Cable / shift choreography: raw ops (no carriers).
    const cablesThisRow = cablesByRow.get(r) ?? [];
    if (cablesThisRow.length > 0) ops.push(...sim.drainOps());
    for (const event of cablesThisRow) {
      ops.push(...dispatchCableEvent(event, needleStart, ambientRack));
    }

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

    // Pause op (once per row). Annotation-based set (rowPauseSet) takes
    // priority; cell-scan is a fallback for charts authored with explicit
    // carrier bindings that carry { kind: 'pause' } StitchType.
    const cols = projection.cols;
    let hasPause: string | null = null;
    if (rowPauseSet?.has(r)) {
      hasPause = `pause at row ${r}`;
    } else {
      for (let probe = 0; probe < cols; probe++) {
        const stitch = stitchTypeAt(r, probe, projection.cellAt(r, probe).keyId);
        if (stitch.kind === 'pause') {
          hasPause = stitch.message ?? `pause at row ${r}`;
          break;
        }
      }
    }
    if (hasPause !== null) {
      ops.push(...sim.drainOps());
      ops.push(pause(hasPause));
    }

    // Walk in carriage direction, per-cell stitch type.
    const colsInOrder = dir === '+'
      ? range(0, cols)
      : reverseRange(0, cols);
    const dropsToEmitAfter: number[] = [];
    for (const c of colsInOrder) {
      const projected = projection.cellAt(r, c);
      if (projected.semanticOp === 'no-stitch') {
        throw new Error(`stockinette-with-overrides: no-stitch cell at (${r},${c})`);
      }
      const stitch: StitchType = stitchTypeAt(r, c, projected.keyId);
      const n = needleStart + c;
      switch (stitch.kind) {
        case 'knit':
        case 'pause':
          sim.knit(carrier, dir, f(n));
          break;
        case 'purl':
          sim.knit(carrier, dir, backBed(n));
          break;
        case 'tuck':
          sim.tuck(carrier, dir, f(n));
          break;
        case 'tuck-back':
          sim.tuck(carrier, dir, backBed(n));
          break;
        case 'slip':
          sim.miss(carrier, dir, f(n));
          break;
        case 'drop':
          sim.knit(carrier, dir, f(n));
          dropsToEmitAfter.push(n);
          break;
        case 'yarn-over':
          // V-bed yarn-over: carriage knits over the YO needle like any
          // other. Eyelet appears when the needle was emptied by a paired
          // decrease; otherwise it's an ordinary knit. Walker doesn't
          // enforce emptiness — bed-state validator's job.
          ops.push(...sim.drainOps());
          ops.push(comment(`yarn-over @ f${n}`));
          sim.knit(carrier, dir, f(n));
          break;
        case 'no-stitch':
          throw new Error(`stockinette-with-overrides: 'no-stitch' StitchType at (${r},${c}); should be Track B feature`);
      }
    }

    // Drop ops happen after the row's passes complete.
    if (dropsToEmitAfter.length > 0) ops.push(...sim.drainOps());
    for (const n of dropsToEmitAfter) {
      ops.push(drop(f(n)));
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
    throw new Error(`stockinette-with-overrides: carrier "${carrier}" must be active before walking`);
  }
  return state.side === 'left' ? '+' : '-';
}

/** Compute the per-column bed assignment for the cast-on row based on
 *  row 0's stitch types. Used by the prologue's both-beds cast-on.
 *  Phase 1c (2026-05-24): consults the projection's per-cell semanticOp
 *  (which encodes multi-cell tile per-cell overrides) so a tile-driven
 *  purl at cast-on starts on the right bed. Sparse-override semantics
 *  match `stitchTypeAt` — only multi-cell tile overrides win over the
 *  per-key binding; 1×1 keys defer to `stitchTypeForKey`. */
export function castOnBedPattern(
  projection: ResolvedChartProjection,
  stitchTypeForKey: Map<string, StitchType>,
): ('f' | 'b')[] {
  const pattern: ('f' | 'b')[] = [];
  for (let c = 0; c < projection.cols; c++) {
    const projected = projection.cellAt(0, c);
    const keyDef = projected.keyDef;
    let stitch: StitchType | undefined;
    if (keyDef && (keyDef.width > 1 || keyDef.height > 1)) {
      const cellOp = projected.semanticOp;
      if (cellOp !== opForKey(keyDef)) {
        stitch = stitchTypeForCellOp(cellOp) ?? undefined;
      }
    }
    if (!stitch) stitch = stitchTypeForKey.get(projected.keyId);
    // tuck-back columns seed on the back bed like purl — a brioche chart's
    // back columns hold their loop on b from cast-on onward.
    pattern.push(stitch?.kind === 'purl' || stitch?.kind === 'tuck-back' ? 'b' : 'f');
  }
  return pattern;
}

function range(start: number, end: number): number[] {
  const out: number[] = [];
  for (let i = start; i < end; i++) out.push(i);
  return out;
}

function reverseRange(start: number, end: number): number[] {
  const out: number[] = [];
  for (let i = end - 1; i >= start; i--) out.push(i);
  return out;
}
