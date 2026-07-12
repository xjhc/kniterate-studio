/**
 * Phase 3 shaped stockinette walker.
 *
 * This is intentionally narrow: single-color front-bed stockinette with
 * no-stitch edge wedges and edge shaping cells. Shaping transfers fire before
 * the result row's knit pass: the shaping symbol lives on the row it produces,
 * and the source stitch lives on the previous row.
 */

import {
  decreaseSpanForOp,
  opForKey,
  type KnitlabChartAnnotation,
} from '../../colorwork/knitlab1-contract.js';
import { rackingAtRow, type RowRackEntry } from '../../colorwork/row-rack-schedule.js';
import {
  b as backBed,
  comment,
  f,
  type CarrierId,
  type Direction,
  type KnitoutOp,
  xfer,
} from '../types.js';
import {
  seedSimulatorCarrierFromHandoff,
  type SimulatorHandoff,
} from './simulator-handoff.js';
import { CarriageSimulator } from '../sim/carriage-simulator.js';
import type { CarrierSide, CarrierSimState, PredictedPass } from '../sim/types.js';
import type { ResolvedChartProjection } from '../../chart-core/types.js';
import { detectCanonicalFashioningWedge } from '../../chart-core/fashioning.js';
import {
  cableEventIsSupported,
  dispatchCableEvent,
  type CableScheduleEvent,
  type ShiftScheduleEvent,
} from './stockinette.js';
import { emitLateralShift } from './lateral-shift.js';
import { emitNonAdjacentXferBatches } from './bed-transition.js';
import {
  applyFirstRowSpeedOverride,
  restoreFirstRowSpeedOverride,
  type FirstRowSpeedOverride,
} from './first-row-speed.js';

export interface ShapedStockinetteWalkInput {
  /** Phase 1c (2026-05-24): canonical per-cell semanticOp source. The
   *  shape walker's `opAt` reads through this projection so multi-cell
   *  tile per-cell overrides (atomic ssk source = no-stitch, etc.) honor
   *  the same rules every renderer sees.
   *
   *  Row-space contract (2026-05-24): the projection MUST be in
   *  knit-order — `cellAt(0, c)` is the cast-on row, rows advance in
   *  knitting order. For bottom-up shape charts that means routing
   *  through `reverseProjectionRows`; for top-down (or test fixtures
   *  built knit-order-first) use `tagAsKnitOrder`. */
  projection: ResolvedChartProjection<'knit-order'>;
  /** Default carrier for rows that don't appear in `rowCarriers`. Must be
   *  active in `carriage` before calling the walker (the guard below
   *  throws otherwise). */
  carrier: CarrierId;
  needleStart: number;
  handoff: SimulatorHandoff;
  annotations?: readonly KnitlabChartAnnotation[];
  /**
   * B5 (2026-05-20): per-row carrier override for shaped horizontal-stripe
   * charts. When provided, `rowCarriers[r]` is the carrier used to knit
   * row `r` and any of its shaping ops. Skipped (falls back to
   * `carrier`) when the entry is undefined. Every carrier that appears
   * in `rowCarriers` MUST be active in `carriage` before the walker
   * runs — the walker does not bring carriers in or out; the caller
   * orchestrates that.
   */
  rowCarriers?: ReadonlyArray<CarrierId | undefined>;
  /**
   * B5 (2026-05-20) — within-row multicolor extension: when present, the
   * walker emits per-color front-bed passes for each row, interlacing
   * knit-on-own-color + miss-elsewhere across the active range (skipping
   * no-stitch wedges). Replaces the single-carrier result-row pass.
   * Map keyId → carrier; every value MUST be active before the walker
   * runs. Floats are visible on the front; back-bed birdseye is opt-in
   * via `backBedStyle`. When this option is set, `rowCarriers` is
   * ignored (the per-cell carrier supersedes the per-row override).
   */
  colorBindings?: Map<string, CarrierId>;
  /**
   * B5 (2026-05-20) — back-bed scheme for within-row multicolor mode.
   * 'none' (default): single-bed jacquard, floats visible on the back.
   * 'birdseye': adds per-color back-bed passes using the stippling
   * formula `(needleCol + row) % N === colorIndex` so floats are caught.
   * 'complement' (Campaign 4, 2026-06-13): two-color inverse-image
   * lining — each carrier knits front-at-its-color + back-at-the-
   * complement in ONE pass (rack 0). The construction the reference
   * sweater uses. Only consulted when `colorBindings` is provided.
   */
  backBedStyle?: 'none' | 'birdseye' | 'complement';
  /**
   * Batch D Phase 4 (2026-05-22): row-rack schedule for racking
   * annotations. At each row boundary, the walker emits `rack(N)` if
   * the value differs from the current ambient.
   */
  rowRackSchedule?: ReadonlyArray<RowRackEntry>;
  /**
   * Batch D shape-dispatch (2026-05-27): cable events bucketed by row,
   * fired before the row's shape ops + result-row knit pass. Row indices
   * are in walker-row-space (the caller is responsible for flipping
   * author-row indices through the same projection reversal applied to
   * `projection` for bottom-up shape charts).
   */
  cableEvents?: ReadonlyArray<CableScheduleEvent>;
  /**
   * Batch D shape-dispatch (2026-05-27): lateral-shift events bucketed
   * by row, fired before the row's shape ops + result-row knit pass.
   * Row indices follow the same walker-row-space contract as
   * `cableEvents`.
   */
  shiftEvents?: ReadonlyArray<ShiftScheduleEvent>;
  /** Phase 4b (2026-05-24): seed the simulator's `nextDirection` from
   *  the previous section's projected end-direction. */
  initialNextDirection?: Direction;
  /** Slow the first actual body row after cast-on, then restore body
   *  speed for row 1+. */
  firstRowSpeedOverride?: FirstRowSpeedOverride;
}

export interface ShapedStockinetteWalkResult {
  ops: KnitoutOp[];
  finalNeedleStart: number;
  finalNeedleEnd: number;
  /** Phase 4 (2026-05-24): per-section CarriageSimulator predicted-pass
   *  trace. See StockinetteWalkResult.predictedPasses. */
  predictedPasses: readonly PredictedPass[];
  /** Phase 4b (2026-05-24): vendor's runtime `nextDirection` after the
   *  last logical pass in this section. */
  finalNextDirection: Direction;
  finalCarrierStates: ReadonlyMap<CarrierId, CarrierSimState>;
}

export function emitShapedStockinetteWalk(
  input: ShapedStockinetteWalkInput,
): ShapedStockinetteWalkResult {
  const { projection, carrier, needleStart, handoff, rowCarriers, colorBindings, rowRackSchedule, cableEvents, shiftEvents } = input;
  const backBedStyle = input.backBedStyle ?? 'none';
  // Batch D Phase 4 (2026-05-22): track ambient rack to emit `rack(N)`
  // only at boundaries. Cables/shifts dispatched in shape mode
  // (2026-05-27) read the same ambient so their internal restore points
  // honor it.
  let shapedAmbientRack = 0;
  // Batch D shape-dispatch (2026-05-27): bucket cable + shift events by
  // walker-row index. Walker iterates `projection.rows`, which the
  // caller has already row-flipped for bottom-up shape mode — so the
  // events' `row` field must already match this iteration's `r`.
  const cablesByRow = new Map<number, CableScheduleEvent[]>();
  for (const event of cableEvents ?? []) {
    if (!cableEventIsSupported(event)) continue;
    const bucket = cablesByRow.get(event.row);
    if (bucket) bucket.push(event);
    else cablesByRow.set(event.row, [event]);
  }
  const shiftsByRow = new Map<number, ShiftScheduleEvent[]>();
  for (const event of shiftEvents ?? []) {
    const bucket = shiftsByRow.get(event.row);
    if (bucket) bucket.push(event);
    else shiftsByRow.set(event.row, [event]);
  }
  const ops: KnitoutOp[] = [];
  const splitSegmentSides = new Map<SplitSegmentId, CarrierSide>();

  // Phase D cutover (2026-05-23): all carrier-bearing ops (result-row
  // knit, jacquard per-color passes, short-row turn, bind-off span knits,
  // split-segment cut/rejoin, split-increase) route through sim.
  // K-1 Phase 1 (2026-06-10): decrease/fashioning/double-dec dances and
  // split-increase transfers also route through sim (`xferBatch` +
  // `setRacking`/`rackRelief`), so predicted passes include their
  // transfer sub-passes. Bed transitions and bind-off span xfers stay
  // raw-op via drain-around (K-2). Seed the sim from the section handoff
  // for every active carrier this walk may touch — default + per-row +
  // per-color carriers — since the body emitter may have parked any of
  // them on either side via prior segments.
  const sim = new CarriageSimulator({
    carriers: ['1', '2', '3', '4', '5', '6'],
    initialNextDirection: input.initialNextDirection,
  });
  const carriersToSeed = new Set<CarrierId>([carrier]);
  if (rowCarriers) for (const c of rowCarriers) if (c) carriersToSeed.add(c);
  if (colorBindings) for (const c of colorBindings.values()) carriersToSeed.add(c);
  for (const c of carriersToSeed) {
    seedSimulatorCarrierFromHandoff(sim, handoff, c, (side) => ({
      anchorNeedle: side === 'left' ? f(needleStart) : f(needleStart + projection.cols - 1),
      anchorDirection: side === 'left' ? '-' : '+',
    }));
  }
  const drain = () => ops.push(...sim.drainOps());

  // Slice 1.5 (2026-05-21): per-column live bed tracker. Carries purl
  // stitches on the back bed across trim rows; transfers them back to
  // the front when transitioning into knit body rows. Seeded from row 0
  // (the cast-on bed pattern in compile-chart matches this seeding).
  const currentBed: ('f' | 'b' | 'empty')[] = new Array(projection.cols).fill('empty');
  if (projection.rows > 0) {
    for (let c = 0; c < projection.cols; c++) {
      currentBed[c] = bedForOp(opAt(projection, 0, c));
    }
  }

  if (!sim.positionOf(carrier)) {
    throw new Error(`shaped-stockinette walk: carrier "${carrier}" must be active before walking`);
  }
  // B5: every per-row carrier in `rowCarriers` must also be active. The
  // walker doesn't bring carriers in/out — the compile-chart caller is
  // responsible for that orchestration (it has the chart-level context).
  if (rowCarriers) {
    const distinct = new Set<CarrierId>();
    for (const c of rowCarriers) if (c) distinct.add(c);
    for (const c of distinct) {
      if (!sim.positionOf(c)) {
        throw new Error(`shaped-stockinette walk: row carrier "${c}" must be active before walking (B5 horizontal-stripes)`);
      }
    }
  }
  // B5 within-row multicolor: same active-carrier guard. Stable carrier
  // ordering by numeric value drives the front+back pass order.
  const colorOrder: CarrierId[] = colorBindings
    ? [...new Set(colorBindings.values())].sort()
    : [];
  if (colorBindings) {
    for (const c of colorOrder) {
      if (!sim.positionOf(c)) {
        throw new Error(`shaped-stockinette walk: color carrier "${c}" must be active before walking (B5 within-row multicolor)`);
      }
    }
  }

  // E2E-3 (2026-06-10): in within-row-multicolor mode, `trim-region`
  // rows route through the single-carrier result-row path so rib purls
  // lower as back-bed knits via the bed tracker — same lowering the
  // horizontal-stripes path gets from `rowCarriers`. A trim row is
  // color-uniform by construction (the validator's
  // `track-a-overrides-jacquard-unsupported` gate keeps rejecting purls
  // in non-uniform trim rows), so the row knits with its single bound
  // carrier, falling back to the default carrier when the trim band has
  // no color-bound cells.
  const trimRows = colorBindings && colorOrder.length > 1
    ? trimRowSetFromAnnotations(input.annotations ?? [])
    : new Set<number>();
  const uniformTrimRowCarrier = (r: number): CarrierId | null => {
    if (!colorBindings || !trimRows.has(r)) return null;
    const bound = new Set<CarrierId>();
    for (let c = 0; c < projection.cols; c++) {
      const keyId = projection.cellAt(r, c).keyId;
      const cellCarrier = keyId ? colorBindings.get(keyId) : undefined;
      if (cellCarrier) bound.add(cellCarrier);
    }
    if (bound.size > 1) return null; // multicolor trim row — jacquard path
    return [...bound][0] ?? carrier;
  };

  // Neck-suffix block scheduling (2026-05-29): when the panel ends in a
  // clean 2-shoulder split (plain single-carrier garment front/back), knit
  // one whole shoulder through all its rows, cut the carrier ONCE, then the
  // other — instead of cutting/rejoining the carrier on every split row
  // (which left ~1 yarn end per split row, e.g. 17 on a set-in front neck).
  // Guarded off for stripe / jacquard / cable / shift / racked panels;
  // those keep the per-row `emitSplitSegmentPass` path.
  const neckSuffix =
    !rowCarriers &&
    !colorBindings &&
    (cableEvents?.length ?? 0) === 0 &&
    (shiftEvents?.length ?? 0) === 0 &&
    (rowRackSchedule ?? []).every((e) => e.racking === 0)
      ? detectNeckSuffix(projection)
      : null;

  const emitNeckBlocks = (startRow: number, center: number): void => {
    const annotations = input.annotations ?? [];
    const lastRow = projection.rows - 1;
    const blockNeedleStart = needleStart;
    const blockNeedleEnd = needleStart + projection.cols - 1;

    // 1. Centre bind-offs (the span that straddles the gap and opens the
    //    neck) fire once, in row order, before either shoulder knits.
    for (let r = startRow; r < projection.rows; r++) {
      for (const span of bindOffSpansForRow(r, annotations)) {
        if (!(span.start < center && span.end > center)) continue;
        emitBindOffSpan({ row: r, span, projection, needleStart, carrier, sim, ops, currentBed });
      }
    }

    // 2. Two shoulder blocks. Each knits all suffix rows on its side; the
    //    carrier is cut exactly once between them.
    for (const side of ['left', 'right'] as const) {
      if (side === 'right') {
        ops.push(comment(`-- finished left shoulder; cut carrier C${carrier} once before right shoulder --`));
        ensureShapedOutAnchor(sim, carrier, blockNeedleStart, blockNeedleEnd);
        if (sim.positionOf(carrier)) sim.out(carrier);
        drain();
        ops.push(comment(`-- rejoin carrier C${carrier} for right shoulder --`));
        if (!sim.positionOf(carrier)) sim.bringIn(carrier, { side: 'left' });
        drain();
      } else {
        ops.push(comment(`-- neck suffix: knit left shoulder block (rows ${startRow}-${lastRow}), single cut --`));
      }
      for (let r = startRow; r < projection.rows; r++) {
        const runs = rawRuns(activeCols(projection, r));
        const seg = side === 'left'
          ? runs.find(run => run.end <= center)
          : runs.find(run => run.start >= center);
        if (!seg) continue;
        const segSet = new Set(seg.cols);
        const skipCols = new Set<number>();
        for (let c = 0; c < projection.cols; c++) if (!segSet.has(c)) skipCols.add(c);
        // per-side bind-off spans (neck-edge shaping for this shoulder)
        for (const span of bindOffSpansForRow(r, annotations)) {
          const spanSide = span.end <= center ? 'left' : span.start >= center ? 'right' : 'center';
          if (spanSide !== side) continue;
          const res = emitBindOffSpan({ row: r, span, projection, needleStart, carrier, sim, ops, currentBed });
          for (const c of res.skipCols) skipCols.add(c);
        }
        const transitions = emitBedTransitionsForRow({ projection, r, needleStart, skipCols, currentBed });
        if (transitions.length > 0) { drain(); ops.push(...transitions); }
        drain();
        ops.push(comment(`row ${r} (${side} shoulder)`));
        emitResultRowPass({ projection, r, skipCols, needleStart, carrier, splitSegmentSides, sim, ops });
        for (const c of seg.cols) currentBed[c] = bedForOp(opAt(projection, r, c));
      }
    }
    drain();
  };

  // K-6 (2026-06-10): with birdseye backing, the back bed holds lining
  // loops on every active needle — transit-needle dances would sweep
  // them. Gates the lined decrease/increase units and the lined
  // bind-off-span + finish handling below. Complement lining (Campaign 4)
  // is also a fully-occupied back bed, so the same units apply.
  const linedBackBed =
    colorBindings !== undefined && colorOrder.length > 1
    && (backBedStyle === 'birdseye' || backBedStyle === 'complement');

  for (let r = 0; r < projection.rows; r++) {
    if (neckSuffix && r === neckSuffix.start) {
      emitNeckBlocks(neckSuffix.start, neckSuffix.center);
      break;
    }
    const skipCols = new Set<number>();
    // B5: row carrier override (falls back to default `carrier` when
    // rowCarriers is absent or this row's slot is undefined).
    const rowCarrier: CarrierId = rowCarriers?.[r] ?? carrier;
    drain();
    ops.push(comment(`row ${r}`));
    applyFirstRowSpeedOverride(sim, r, input.firstRowSpeedOverride);

    // Batch D Phase 4 (2026-05-22): rack boundary BEFORE any row ops.
    if (rowRackSchedule) {
      const requested = rackingAtRow(rowRackSchedule, r);
      if (requested !== shapedAmbientRack) {
        sim.setRacking(requested);
        shapedAmbientRack = requested;
      }
    }

    // Batch D shape-dispatch (2026-05-27): cable / lateral-shift
    // choreography fires after rack boundary and before the row's shape
    // ops + result-row knit pass. Raw ops (no carriers); drain the sim
    // before emission so any pending knit pass settles first. Matches
    // the ordering in `emitStockinetteWithOverridesWalk` (the non-shape
    // mode dispatcher). When a row carries BOTH a cable/shift AND a
    // shape op (decrease/increase), the shape op runs after the
    // cable/shift dispatch; the bed-state simulator catches column-
    // overlap collisions downstream.
    const cablesThisRow = cablesByRow.get(r) ?? [];
    if (cablesThisRow.length > 0) drain();
    for (const event of cablesThisRow) {
      ops.push(...dispatchCableEvent(event, needleStart, shapedAmbientRack));
    }
    const shiftsThisRow = shiftsByRow.get(r) ?? [];
    if (shiftsThisRow.length > 0) drain();
    for (const event of shiftsThisRow) {
      ops.push(...emitLateralShift({
        direction: event.direction,
        count: event.count,
        destLeftNeedle: needleStart + event.destStartCol,
        ambientRack: shapedAmbientRack,
      }));
    }

    if (r > 0) {
      for (const span of bindOffSpansForRow(r, input.annotations ?? [])) {
        const result = emitBindOffSpan({
          row: r,
          span,
          projection,
          needleStart,
          carrier: rowCarrier,
          sim,
          ops,
          currentBed,
          linedBackBed,
        });
        for (const col of result.skipCols) skipCols.add(col);
      }

      for (let c = 0; c < projection.cols; c++) {
        const op = opAt(projection, r, c);
        const decreaseSpan = decreaseSpanForOp(op);
        if (decreaseSpan?.consumes === 2) {
          // P2tog: same loop-merge dance as k2tog. The "purl" aspect of
          // p2tog is the face presentation — back-bed bed-routing would be
          // needed for a true purl decrease on the WS. Today we lower as
          // a knit decrease; the WS face is preview-grade. Acceptable
          // because flat-panel hand-knit charts read directly and Kniterate
          // pieces are knit-side-out.
          emitDecreaseForCell({
            row: r,
            col: c,
            projection,
            needleStart,
            sim,
            ops,
            linedBackBed,
          });
        } else if (decreaseSpan?.consumes === 3) {
          // Purl-face triples reuse the knit transfer dance implied by
          // their canonical source offsets. The purl presentation is still
          // preview-grade — see p2tog comment above.
          emitDoubleDecreaseForCell({
            row: r,
            col: c,
            op,
            projection,
            needleStart,
            sim,
            ops,
          });
        } else if (op === 'm1l' || op === 'm1r' || op === 'm1lp' || op === 'm1rp' || op === 'kfb' || op === 'pfb') {
          // Kfb / pfb: same +1 outcome as m1l/m1r — route through the
          // generic increase emitter. The "twice into the same loop"
          // mechanics aren't modeled mechanically; pfb's purl face is
          // preview-grade (knit-face on machine, same caveat as p2tog).
          emitIncreaseForCell({
            row: r,
            col: c,
            projection,
            needleStart,
            carrier: rowCarrier,
            sim,
            ops,
            linedBackBed,
          });
        } else {
          assertSupportedResultRowOp(op, r, c);
        }
      }
    } else {
      for (let c = 0; c < projection.cols; c++) {
        assertSupportedResultRowOp(opAt(projection, r, c), r, c);
      }
    }

    // Slice 1.5 (2026-05-21): before the result-row pass, transfer cells
    // whose desired bed (front for knit, back for purl) doesn't match where
    // the live stitch currently sits. Fires at trim → body transitions to
    // bring back-bed rib stitches back to the front bed for plain knit
    // body rows. No-op when bed state already matches the desired op.
    if (r > 0) {
      const transitions = emitBedTransitionsForRow({
        projection,
        r,
        needleStart,
        skipCols,
        currentBed,
      });
      if (transitions.length > 0) {
        drain();
        ops.push(comment(`-- bed transitions before row ${r} --`));
        ops.push(...transitions);
      }
    }

    // Short-row turn replaces the normal result-row pass with a partial
    // pass + wrap. The next row's pass continues from the reversed
    // direction; the wrap loop is picked up by a later full-width pass
    // (knit-stacks-on-tuck semantics handle the merge).
    const shortRowTurn = shortRowTurnForRow(r, input.annotations ?? []);
    if (shortRowTurn) {
      emitChartShortRowTurn({
        row: r,
        turn: shortRowTurn,
        cols: activeCols(projection, r, skipCols),
        needleStart,
        carrier: rowCarrier,
        sim,
        ops,
      });
      updateBedAfterRow(currentBed, projection, r, skipCols);
      restoreFirstRowSpeedOverride(sim, r, input.firstRowSpeedOverride);
      continue;
    }

    if (colorBindings && colorOrder.length > 1) {
      // E2E-3: uniform trim rows take the single-carrier path below so
      // their purls lower through the bed tracker.
      const trimCarrier = uniformTrimRowCarrier(r);
      if (trimCarrier !== null) {
        emitResultRowPass({
          projection,
          r,
          skipCols,
          needleStart,
          carrier: trimCarrier,
          splitSegmentSides,
          sim,
          ops,
        });
        updateBedAfterRow(currentBed, projection, r, skipCols);
        restoreFirstRowSpeedOverride(sim, r, input.firstRowSpeedOverride);
        continue;
      }
      // B5 within-row multicolor: replace the single-carrier result-row
      // pass with per-color front-bed passes (knit on own color, miss
      // elsewhere) over the active range. Optional back-bed birdseye
      // pass per color catches floats.
      emitShapedJacquardResultRow({
        row: r,
        projection,
        skipCols,
        needleStart,
        colorBindings,
        colorOrder,
        backBedStyle,
        defaultCarrier: carrier,
        sim,
      });
      restoreFirstRowSpeedOverride(sim, r, input.firstRowSpeedOverride);
      continue;
    }

    emitResultRowPass({
      projection,
      r,
      skipCols,
      needleStart,
      carrier: rowCarrier,
      splitSegmentSides,
      sim,
      ops,
    });
    updateBedAfterRow(currentBed, projection, r, skipCols);
    restoreFirstRowSpeedOverride(sim, r, input.firstRowSpeedOverride);
  }
  drain();

  // Lined finish (§Reference sweater finish in the tracker: "xfer lining
  // loops to front" before the waste rows / drop): bring the final row's
  // lining home so the doubled front loops merge on the first finish
  // knit. Without this the top lining row drops live and unravels.
  if (linedBackBed) {
    const homeCols = activeCols(projection, projection.rows - 1);
    if (homeCols.length > 0) {
      ops.push(comment('-- lined finish: home final-row lining b->f --'));
      ops.push(...emitNonAdjacentXferBatches(
        homeCols.map(c => ({ needle: needleStart + c, direction: 'b-to-f' as const })),
      ));
    }
  }

  const finalCarrierStates = sim.snapshot();

  const finalCols = activeCols(projection, projection.rows - 1);
  const first = finalCols[0];
  const last = finalCols[finalCols.length - 1];
  return {
    ops,
    finalNeedleStart: first === undefined ? needleStart : needleStart + first,
    finalNeedleEnd: last === undefined ? needleStart - 1 : needleStart + last,
    predictedPasses: sim.predictedPasses(),
    finalNextDirection: sim.finalNextDirection(),
    finalCarrierStates,
  };
}

/** B5 (2026-05-20): within-row multicolor result-row pass for shaped
 *  jacquard. Replaces the single-carrier `emitResultRowPass` when the
 *  caller provides `colorBindings`. For each color (in stable carrier
 *  order), emit a full-active-range front-bed pass: knit on cells whose
 *  keyId binds to this color, miss elsewhere. Floats are visible on the
 *  back; `backBedStyle='birdseye'` adds per-color back-bed passes using
 *  the stippling formula `(needleCol + row) % N === colorIndex` to catch
 *  floats. No-stitch cells are skipped (the carriage still travels via
 *  a `miss`, mirroring `emitResultRowPass`). */
function emitShapedJacquardResultRow(input: {
  row: number;
  projection: ResolvedChartProjection;
  skipCols: ReadonlySet<number>;
  needleStart: number;
  colorBindings: Map<string, CarrierId>;
  colorOrder: readonly CarrierId[];
  backBedStyle: 'none' | 'birdseye' | 'complement';
  /** K-6 (2026-06-10): carrier that knits active cells whose keyId has
   *  no color binding — shape-tile cells (ssk/k2tog result slots).
   *  Without a fallback every color pass MISSES the decrease target on
   *  its own row, leaving the merged stack unconsolidated until the
   *  next row (an elongated held stitch at the fashioning line). */
  defaultCarrier: CarrierId;
  sim: CarriageSimulator;
}): void {
  const { row, projection, skipCols, needleStart, colorBindings, colorOrder, backBedStyle, defaultCarrier, sim } = input;
  const cols = activeCols(projection, row, skipCols);
  if (cols.length === 0) return;
  const first = cols[0]!;
  const last = cols[cols.length - 1]!;
  const active = new Set(cols);

  // keyId → carrier lookup for this row, via projection identity reads.
  // Unbound keyIds (shape tiles) knit on the default carrier's pass.
  const carrierForCell = (col: number): CarrierId | null => {
    const keyId = projection.cellAt(row, col).keyId;
    if (!keyId) return null;
    return colorBindings.get(keyId) ?? defaultCarrier;
  };

  // Complement (inverse-image) lining: each carrier knits front at its
  // color's cells and the BACK bed everywhere else, in a single combined
  // pass (rack 0). For two colors the result is the full inverse-image
  // backing the reference sweater uses; see jacquard-complement.ts.
  if (backBedStyle === 'complement' && colorOrder.length === 2) {
    for (const c of colorOrder) {
      const dir = directionForCarrier(sim, c, 'shaped-jacquard complement row');
      const range = dir === '+'
        ? rangeAscNumbers(first, last)
        : rangeDescNumbers(first, last);
      for (const col of range) {
        if (!active.has(col)) {
          sim.miss(c, dir, f(needleStart + col));
          continue;
        }
        const cellCarrier = carrierForCell(col);
        if (cellCarrier === c) sim.knit(c, dir, f(needleStart + col));
        else sim.knit(c, dir, backBed(needleStart + col));
      }
    }
    return;
  }

  // Front-bed passes — one per color, in stable carrier order.
  for (const c of colorOrder) {
    const dir = directionForCarrier(sim, c, 'shaped-jacquard result row');
    const range = dir === '+'
      ? rangeAscNumbers(first, last)
      : rangeDescNumbers(first, last);
    for (const col of range) {
      const needle = f(needleStart + col);
      if (!active.has(col)) {
        sim.miss(c, dir, needle);
        continue;
      }
      const cellCarrier = carrierForCell(col);
      if (cellCarrier === c) sim.knit(c, dir, needle);
      else sim.miss(c, dir, needle);
    }
  }

  if (backBedStyle === 'birdseye' && colorOrder.length >= 2) {
    const N = colorOrder.length;
    sim.setRacking(0.5);
    for (let ci = 0; ci < N; ci++) {
      const c = colorOrder[ci]!;
      const dir = directionForCarrier(sim, c, 'shaped-jacquard birdseye back row');
      const range = dir === '+'
        ? rangeAscNumbers(first, last)
        : rangeDescNumbers(first, last);
      for (const col of range) {
        const needle = backBed(needleStart + col);
        if (!active.has(col)) {
          sim.miss(c, dir, needle);
          continue;
        }
        const owns = (col + row) % N === ci;
        if (owns) sim.knit(c, dir, needle);
        else sim.miss(c, dir, needle);
      }
    }
    sim.setRacking(0);
  }
}

function rangeAscNumbers(start: number, end: number): number[] {
  const out: number[] = [];
  for (let i = start; i <= end; i++) out.push(i);
  return out;
}

function rangeDescNumbers(start: number, end: number): number[] {
  const out: number[] = [];
  for (let i = end; i >= start; i--) out.push(i);
  return out;
}

function sideOfCarrier(
  sim: CarriageSimulator,
  carrier: CarrierId,
  context: string,
): CarrierSide {
  const state = sim.positionOf(carrier);
  if (!state) {
    throw new Error(`shaped-stockinette ${context}: carrier "${carrier}" must be active before walking`);
  }
  return state.side;
}

function directionForCarrier(
  sim: CarriageSimulator,
  carrier: CarrierId,
  context: string,
): Direction {
  return sideOfCarrier(sim, carrier, context) === 'left' ? '+' : '-';
}

function emitResultRowPass(input: {
  projection: ResolvedChartProjection;
  r: number;
  skipCols: ReadonlySet<number>;
  needleStart: number;
  carrier: CarrierId;
  splitSegmentSides: Map<SplitSegmentId, CarrierSide>;
  sim: CarriageSimulator;
  ops: KnitoutOp[];
}): void {
  const { projection, r, skipCols, needleStart, carrier, sim, ops } = input;
  const cols = activeCols(projection, r, skipCols);
  if (cols.length === 0) return;
  const segments = activeSegments(cols);
  if (segments.length > 1) {
    emitSplitSegmentPass({
      segments,
      needleStart,
      carrier,
      splitSegmentSides: input.splitSegmentSides,
      sim,
      ops,
    });
    return;
  }

  const first = cols[0]!;
  const last = cols[cols.length - 1]!;
  const active = new Set(cols);
  const dir = directionForCarrier(sim, carrier, 'shaped result row');
  const emitCol = (c: number) => {
    if (!active.has(c)) {
      sim.miss(carrier, dir, f(needleStart + c));
      return;
    }
    // Slice 1.5 (2026-05-21): purl cells lower as back-bed knits. The bed
    // tracker upstream has already transferred this column's stitch to the
    // back bed (or seeded it there at cast-on), so emitting `knit(b(n))`
    // produces a front-purl bump in the fabric.
    // Slice 3 (2026-05-21): tuck cells lower as a front-bed tuck op (no
    // bed swap); the live loop stays on the front bed, mirroring the
    // behavior of `stockinette-with-overrides` for plain Track A.
    // B-1 brioche (2026-06-09): tuck-back tucks the held BACK loop — the
    // bed tracker routes the column to 'b' via the same transition
    // machinery as purl, so the tuck lands on the resident loop.
    const op = opAt(projection, r, c);
    if (op === 'tuck') {
      sim.tuck(carrier, dir, f(needleStart + c));
      return;
    }
    if (op === 'tuck-back') {
      sim.tuck(carrier, dir, backBed(needleStart + c));
      return;
    }
    const needle = op === 'purl' ? backBed(needleStart + c) : f(needleStart + c);
    sim.knit(carrier, dir, needle);
  };

  // Interior no-stitch gaps are still carriage travel. Emit explicit miss ops
  // so bed-state's long-float rule can see split-neck shoulder floats.
  if (dir === '+') {
    for (let c = first; c <= last; c++) emitCol(c);
  } else {
    for (let c = last; c >= first; c--) emitCol(c);
  }
}

/** Slice 1.5 (2026-05-21): map a cell op to the bed its live loop sits on
 *  after the row's pass. `purl` ops live on the back bed (front-purl =
 *  back-knit on a V-bed); everything else lives on the front bed; no-stitch
 *  cells have no loop. */
function bedForOp(op: ReturnType<typeof opForKey>): 'f' | 'b' | 'empty' {
  if (op === 'no-stitch') return 'empty';
  if (op === 'purl' || op === 'tuck-back') return 'b';
  return 'f';
}

function emitBedTransitionsForRow(input: {
  projection: ResolvedChartProjection;
  r: number;
  needleStart: number;
  skipCols: ReadonlySet<number>;
  currentBed: ('f' | 'b' | 'empty')[];
}): KnitoutOp[] {
  const { projection, r, needleStart, skipCols, currentBed } = input;
  const transfers: Array<{ needle: number; direction: 'f-to-b' | 'b-to-f' }> = [];
  for (let c = 0; c < projection.cols; c++) {
    if (skipCols.has(c)) continue;
    const op = opAt(projection, r, c);
    if (op === 'no-stitch') continue;
    if (currentBed[c] === 'empty') continue; // newly-active (m1 / inc); already on f
    const desired = bedForOp(op);
    if (desired === 'empty') continue;
    if (currentBed[c] === desired) continue;
    transfers.push({
      needle: needleStart + c,
      direction: desired === 'b' ? 'f-to-b' : 'b-to-f',
    });
    currentBed[c] = desired;
  }
  if (transfers.length === 0) return [];
  // Kniterate cheatsheet: adjacent xfer sources on the same bed within one
  // pass cause needle collisions. The bed-state validator enforces this as
  // `adjacent-xfer-same-pass`. Greedy-split into non-adjacent batches and
  // separate them with a `rack(0)` so the validator's source-tracker resets.
  return emitNonAdjacentXferBatches(transfers);
}

function updateBedAfterRow(
  currentBed: ('f' | 'b' | 'empty')[],
  projection: ResolvedChartProjection,
  r: number,
  skipCols: ReadonlySet<number>,
): void {
  for (let c = 0; c < projection.cols; c++) {
    if (skipCols.has(c)) {
      currentBed[c] = 'empty';
      continue;
    }
    currentBed[c] = bedForOp(opAt(projection, r, c));
  }
}

type SplitSegmentId = 'left' | 'right';

interface ActiveSegment {
  id: SplitSegmentId;
  cols: number[];
}

function activeSegments(cols: readonly number[]): ActiveSegment[] {
  if (cols.length === 0) return [];
  const rawSegments: number[][] = [[cols[0]!]];
  for (let i = 1; i < cols.length; i++) {
    const c = cols[i]!;
    const current = rawSegments[rawSegments.length - 1]!;
    if (c === current[current.length - 1]! + 1) {
      current.push(c);
    } else {
      rawSegments.push([c]);
    }
  }
  // 2026-05-21: a single-cell middle segment (e.g. CDD residue between
  // two no-stitch wedges) is not a separate shoulder — fold it into the
  // adjacent segments so the result-row pass treats the row as one range
  // and just misses across the no-stitch gaps. Real shoulder splits have
  // multi-cell segments per shoulder.
  while (rawSegments.length >= 3) {
    let folded = false;
    for (let i = 1; i < rawSegments.length - 1; i++) {
      const mid = rawSegments[i]!;
      if (mid.length === 1) {
        const left = rawSegments[i - 1]!;
        const right = rawSegments[i + 1]!;
        const merged = [...left, ...mid, ...right];
        // Fill the no-stitch gap so the emitter's `active` set still
        // contains only originally-active cols; we just need a unified
        // range. The miss helper inside emitResultRowPass already skips
        // non-active cols.
        rawSegments.splice(i - 1, 3, merged);
        folded = true;
        break;
      }
    }
    if (!folded) break;
  }
  if (rawSegments.length > 2) {
    throw new Error(`shaped-stockinette: split row has ${rawSegments.length} active segments; only two-shoulder split rows are supported`);
  }
  if (rawSegments.length === 1) return [{ id: 'left', cols: rawSegments[0]! }];
  return [
    { id: 'left', cols: rawSegments[0]! },
    { id: 'right', cols: rawSegments[1]! },
  ];
}

// Non-folding, non-throwing contiguous-run segmenter for neck-suffix
// detection. `activeSegments` folds single-cell residues and throws on >2,
// so it's unsafe to probe arbitrary rows with — this just reports raw runs.
function rawRuns(cols: readonly number[]): Array<{ start: number; end: number; cols: number[] }> {
  if (cols.length === 0) return [];
  const runs: Array<{ start: number; end: number; cols: number[] }> = [
    { start: cols[0]!, end: cols[0]!, cols: [cols[0]!] },
  ];
  for (let i = 1; i < cols.length; i++) {
    const c = cols[i]!;
    const cur = runs[runs.length - 1]!;
    if (c === cur.end + 1) { cur.end = c; cur.cols.push(c); }
    else runs.push({ start: c, end: c, cols: [c] });
  }
  return runs;
}

// Detect a "neck suffix" — a contiguous tail of rows where the active
// stitches split into exactly two shoulder segments and stay split to the
// top of the panel, with no decrease/increase cells in the suffix (the neck
// edge is shaped purely by bind-off spans, as the panel-grid generator
// emits). Returns the first split row + the gap centre, or null when the
// panel isn't a clean 2-shoulder suffix (→ keep the per-row cut/rejoin path).
function detectNeckSuffix(
  projection: ResolvedChartProjection,
): { start: number; center: number } | null {
  let start = -1;
  for (let r = 0; r < projection.rows; r++) {
    const runs = rawRuns(activeCols(projection, r));
    if (runs.length > 2) return null;
    if (runs.length === 2 && start === -1) start = r;
    if (start !== -1) {
      if (runs.length < 2) return null; // gap re-closes → not a suffix
      for (let c = 0; c < projection.cols; c++) {
        const op = opAt(projection, r, c);
        if (op === 'no-stitch' || op === 'knit' || op === 'purl' || op === 'tuck' || op === 'tuck-back') continue;
        return null; // decrease/increase in suffix → fall back
      }
    }
  }
  if (start === -1) return null;
  const runs = rawRuns(activeCols(projection, start));
  const left = runs[0]!;
  const right = runs[1]!;
  return { start, center: (left.end + right.start) / 2 };
}

function emitSplitSegmentPass(input: {
  segments: ActiveSegment[];
  needleStart: number;
  carrier: CarrierId;
  splitSegmentSides: Map<SplitSegmentId, CarrierSide>;
  sim: CarriageSimulator;
  ops: KnitoutOp[];
}): void {
  const { segments, needleStart, carrier, splitSegmentSides, sim, ops } = input;
  ops.push(...sim.drainOps());
  ops.push(comment('-- split-neck shoulder schedule: cut/rejoin carrier between active segments --'));
  const ordered = orderSplitSegmentsForCarrier(
    segments,
    sideOfCarrier(sim, carrier, 'split-neck shoulder schedule'),
    splitSegmentSides,
  );

  for (let i = 0; i < ordered.length; i++) {
    const segment = ordered[i]!;
    const desiredSide = segmentStartSide(segment.id, splitSegmentSides);
    ensureCarrierOnSide({
      ops,
      carrier,
      side: desiredSide,
      label: `${segment.id} shoulder`,
      needleStart: needleStart + segment.cols[0]!,
      needleEnd: needleStart + segment.cols[segment.cols.length - 1]!,
      sim,
    });

    const dir = directionForCarrier(sim, carrier, 'split-neck segment pass');
    const colsInOrder = dir === '+' ? segment.cols : [...segment.cols].reverse();
    ops.push(...sim.drainOps());
    ops.push(comment(`-- knit ${segment.id} shoulder segment --`));
    for (const c of colsInOrder) {
      sim.knit(carrier, dir, f(needleStart + c));
    }
    ops.push(...sim.drainOps());
    splitSegmentSides.set(segment.id, sideOfCarrier(sim, carrier, 'split-neck segment pass'));

    if (i < ordered.length - 1) {
      ops.push(comment(`-- cut carrier C${carrier} before next shoulder segment --`));
      if (sim.positionOf(carrier)) {
        ensureShapedOutAnchor(
          sim,
          carrier,
          needleStart + segment.cols[0]!,
          needleStart + segment.cols[segment.cols.length - 1]!,
        );
        sim.out(carrier);
        ops.push(...sim.drainOps());
      }
    }
  }
}

function orderSplitSegmentsForCarrier(
  segments: readonly ActiveSegment[],
  currentSide: CarrierSide,
  splitSegmentSides: ReadonlyMap<SplitSegmentId, CarrierSide>,
): ActiveSegment[] {
  const matching = segments.find(segment => segmentStartSide(segment.id, splitSegmentSides) === currentSide);
  if (!matching) return [...segments];
  return [
    matching,
    ...segments.filter(segment => segment !== matching),
  ];
}

function segmentStartSide(
  id: SplitSegmentId,
  splitSegmentSides: ReadonlyMap<SplitSegmentId, CarrierSide>,
): CarrierSide {
  return splitSegmentSides.get(id) ?? (id === 'left' ? 'left' : 'right');
}

function ensureCarrierOnSide(input: {
  ops: KnitoutOp[];
  carrier: CarrierId;
  side: CarrierSide;
  label: string;
  needleStart: number;
  needleEnd: number;
  sim: CarriageSimulator;
}): void {
  const { ops, carrier, side, label, needleStart, needleEnd, sim } = input;
  const current = sim.positionOf(carrier);
  if (current?.side === side) return;
  if (current) {
    ops.push(comment(`-- cut carrier C${carrier} before rejoining ${label} from ${side} --`));
    ops.push(...sim.drainOps());
    ensureShapedOutAnchor(sim, carrier, needleStart, needleEnd);
    sim.out(carrier);
    ops.push(...sim.drainOps());
  }
  ops.push(comment(`-- rejoin carrier C${carrier} for ${label} from ${side} --`));
  if (!sim.positionOf(carrier)) {
    sim.bringIn(carrier, { side });
    ops.push(...sim.drainOps());
  }
}

function ensureShapedOutAnchor(
  sim: CarriageSimulator,
  carrier: CarrierId,
  needleStart: number,
  needleEnd: number,
): void {
  const state = sim.positionOf(carrier);
  if (!state || state.lastNeedle) return;
  const side = state.side;
  sim.seedActiveCarrierAnchor(carrier, {
    side,
    anchorNeedle: side === 'left' ? f(needleStart) : f(needleEnd),
    anchorDirection: side === 'left' ? '-' : '+',
  });
}

interface BindOffSpan {
  start: number;
  end: number;
  side: 'left' | 'right' | 'top' | 'bottom';
}

function bindOffSpansForRow(
  row: number,
  annotations: readonly KnitlabChartAnnotation[],
): BindOffSpan[] {
  const spans: BindOffSpan[] = [];
  for (const annotation of annotations) {
    if (annotation.kind !== 'bind-off-span') continue;
    if (annotation.anchor.scope !== 'edge' || annotation.anchor.row !== row) continue;
    if (
      annotation.anchor.side !== 'left' &&
      annotation.anchor.side !== 'right' &&
      annotation.anchor.side !== 'top' &&
      annotation.anchor.side !== 'bottom'
    ) continue;
    const start = Math.min(annotation.anchor.start, annotation.anchor.end);
    const end = Math.max(annotation.anchor.start, annotation.anchor.end);
    if (end <= start) continue;
    spans.push({ start, end, side: annotation.anchor.side });
  }
  return spans;
}

/** E2E-3 (2026-06-10): rows covered by any `trim-region` annotation, in
 *  the walker's (knit-order) row space — the caller has already
 *  row-remapped annotations alongside the projection. Mirrors the
 *  validator's private helper of the same name (`chart-track-a.ts`). */
function trimRowSetFromAnnotations(
  annotations: readonly KnitlabChartAnnotation[],
): Set<number> {
  const rows = new Set<number>();
  for (const annotation of annotations) {
    if (annotation.kind !== 'trim-region') continue;
    const region = annotation.trimRegion;
    if (!region) continue;
    const start = Math.min(region.startRow, region.endRow);
    const end = Math.max(region.startRow, region.endRow);
    for (let r = start; r <= end; r++) rows.add(r);
  }
  return rows;
}

interface ShortRowTurn {
  direction: 'left' | 'right';
  stitches: number;
  turnMethod: 'wrap-and-turn' | 'german' | 'shadow' | 'unspecified';
}

function shortRowTurnForRow(
  row: number,
  annotations: readonly KnitlabChartAnnotation[],
): ShortRowTurn | null {
  for (const annotation of annotations) {
    if (annotation.kind !== 'short-row-turn') continue;
    if (annotation.anchor.scope !== 'cell' || annotation.anchor.row !== row) continue;
    return {
      direction: annotation.direction ?? 'left',
      stitches: Math.max(1, annotation.stitches ?? 1),
      turnMethod: annotation.turnMethod ?? 'unspecified',
    };
  }
  return null;
}

/** Emit a wrap-and-turn pass for one row. Mirrors `emitWrapTurn` in
 *  `shape-events-to-knitout.ts`, adapted for chart-mode where the active
 *  range comes from the row's non-no-stitch cells. The result-row pass
 *  is replaced by this partial pass; the next row continues with the
 *  reversed carriage direction, and the eventual full-width pass over
 *  the wrapped range picks up the wrap loops automatically. */
function emitChartShortRowTurn(input: {
  row: number;
  turn: ShortRowTurn;
  cols: readonly number[];
  needleStart: number;
  carrier: CarrierId;
  sim: CarriageSimulator;
  ops: KnitoutOp[];
}): void {
  const { row, turn, cols, needleStart, carrier, sim, ops } = input;
  if (cols.length === 0) {
    ops.push(...sim.drainOps());
    ops.push(comment(`-- short-row turn (${turn.direction}) @ row ${row}: no active range; skipping --`));
    return;
  }
  const first = cols[0]!;
  const last = cols[cols.length - 1]!;
  if (!sim.positionOf(carrier)) {
    ops.push(...sim.drainOps());
    ops.push(comment(`-- short-row turn (${turn.direction}) @ row ${row}: carrier not active --`));
    return;
  }
  const dir = directionForCarrier(sim, carrier, 'short-row turn');
  // Turn needle is `stitches` in from the carriage's leading edge.
  const turnNeedle = turn.direction === 'right'
    ? needleStart + last - turn.stitches
    : needleStart + first + turn.stitches;
  const wrapNeedle = dir === '+' ? turnNeedle + 1 : turnNeedle - 1;
  const isGerman = turn.turnMethod === 'german';
  const isShadowNoWrap = turn.turnMethod === 'shadow';
  // 'wrap-and-turn' and 'unspecified' default to the shipped wrap dance.
  // 'german' falls through to the no-wrap preview placeholder for now
  // (still preview-grade, surfaced by chart-track-a).
  ops.push(...sim.drainOps());
  if (isGerman) {
    ops.push(comment(`-- PREVIEW [german]: short-row turn (${turn.direction}) @ row ${row}, ${turn.stitches} sts (placeholder no-wrap shape) --`));
  } else if (isShadowNoWrap) {
    ops.push(comment(`-- short-row turn (no-wrap / shadow) (${turn.direction}) @ row ${row}, ${turn.stitches} sts --`));
  } else {
    ops.push(comment(`-- short-row turn (wrap) (${turn.direction}) @ row ${row}, ${turn.stitches} sts --`));
  }

  if (dir === '+') {
    for (let n = needleStart + first; n <= turnNeedle; n++) sim.knit(carrier, dir, f(n));
    if (!isGerman && !isShadowNoWrap && wrapNeedle <= needleStart + last) {
      sim.tuck(carrier, dir, f(wrapNeedle));
    }
  } else {
    for (let n = needleStart + last; n >= turnNeedle; n--) sim.knit(carrier, dir, f(n));
    if (!isGerman && !isShadowNoWrap && wrapNeedle >= needleStart + first) {
      sim.tuck(carrier, dir, f(wrapNeedle));
    }
  }
}

function emitBindOffSpan(input: {
  row: number;
  span: BindOffSpan;
  projection: ResolvedChartProjection;
  needleStart: number;
  carrier: CarrierId;
  sim: CarriageSimulator;
  ops: KnitoutOp[];
  currentBed: ('f' | 'b' | 'empty')[];
  linedBackBed?: boolean;
}): { skipCols: number[] } {
  const { row, span, projection, needleStart, carrier, sim, ops, currentBed, linedBackBed } = input;
  // B-3 (2026-06-09): the chain dances below transfer FRONT loops. A
  // column whose live loop sits on the back bed (rib/brioche cells on
  // the rows below) must come home first — otherwise the chain xfers
  // from an empty front needle and stacks loops on its neighbor
  // (bed-state-xfer-from-empty / bed-state-too-many-loops, caught live
  // in the B-3 browser smoke). Includes one neighbor column each side:
  // the chain knits its final loop into the active neighbor on the
  // front bed before that column's own row transition has run.
  const homeTransfers: Array<{ needle: number; direction: 'f-to-b' | 'b-to-f' }> = [];
  const lo = Math.max(0, span.start - 1);
  const hi = Math.min(projection.cols - 1, span.end);
  for (let c = lo; c <= hi; c++) {
    if (currentBed[c] === 'b') {
      homeTransfers.push({ needle: needleStart + c, direction: 'b-to-f' });
      currentBed[c] = 'f';
    }
  }
  if (homeTransfers.length > 0) {
    ops.push(...sim.drainOps());
    ops.push(...emitNonAdjacentXferBatches(homeTransfers));
  }

  // Lined fabric (§Reference sweater armhole decode): the chain dances
  // below use b(n) as a TRANSIT needle — on birdseye fabric every span
  // column's b(n) holds a lining loop, so the chain would sweep lining
  // into the bound-off edge at 3-stacks per step. The reference doubles
  // the span up and chains both layers at 4-loop stacks (machine-fine,
  // above our bed-state gate); we home the span's lining and knit each
  // doubled column once so the chain walks singles — same closed
  // two-layer edge, max stack 2. The NEIGHBOR's lining stays put (its
  // fabric continues).
  if (linedBackBed && span.end > span.start) {
    ops.push(...sim.drainOps());
    ops.push(comment(`-- lined bind-off span: home lining + consolidate f${needleStart + span.start}..f${needleStart + span.end - 1} --`));
    ops.push(...emitNonAdjacentXferBatches(
      Array.from({ length: span.end - span.start }, (_, i) => ({
        needle: needleStart + span.start + i,
        direction: 'b-to-f' as const,
      })),
    ));
    const dir = directionForCarrier(sim, carrier, 'lined bind-off span consolidation');
    const colsInOrder = Array.from({ length: span.end - span.start }, (_, i) => span.start + i);
    if (dir === '-') colsInOrder.reverse();
    for (const c of colsInOrder) sim.knit(carrier, dir, f(needleStart + c));
    ops.push(...sim.drainOps());
  }

  if (span.side === 'left') {
    const targetCol = span.end;
    assertBindOffSpanCells({ row, span, projection, label: 'left' });
    if (opAt(projection, row, targetCol) !== 'no-stitch') {
      emitLeftEdgeBindOff(needleStart + span.start, needleStart + span.end, carrier, 'left', sim, ops);
      return { skipCols: [targetCol] };
    }
    const interiorTargetCol = span.start - 1;
    if (opAt(projection, row, interiorTargetCol) !== 'no-stitch') {
      emitRightEdgeBindOff(needleStart + span.start, needleStart + span.end - 1, carrier, 'center', sim, ops);
      return { skipCols: [interiorTargetCol] };
    }
    throw new Error(`shaped-stockinette: left bind-off span on row ${row} has no active neighbor at col ${targetCol} or ${interiorTargetCol}`);
  }

  if (span.side === 'right') {
    const targetCol = span.start - 1;
    assertBindOffSpanCells({ row, span, projection, label: 'right' });
    if (opAt(projection, row, targetCol) !== 'no-stitch') {
      emitRightEdgeBindOff(needleStart + span.start, needleStart + span.end - 1, carrier, 'right', sim, ops);
      return { skipCols: [targetCol] };
    }
    const interiorTargetCol = span.end;
    if (opAt(projection, row, interiorTargetCol) !== 'no-stitch') {
      emitLeftEdgeBindOff(needleStart + span.start, needleStart + span.end, carrier, 'center', sim, ops);
      return { skipCols: [interiorTargetCol] };
    }
    throw new Error(`shaped-stockinette: right bind-off span on row ${row} has no active neighbor at col ${targetCol} or ${interiorTargetCol}`);
  }

  return emitCenterBindOffSpan(input);
}

function assertBindOffSpanCells(input: {
  row: number;
  span: BindOffSpan;
  projection: ResolvedChartProjection;
  label: string;
}): void {
  const { row, span, projection, label } = input;
  for (let c = span.start; c < span.end; c++) {
    if (opAt(projection, row - 1, c) === 'no-stitch') {
      throw new Error(`shaped-stockinette: ${label} bind-off span on row ${row} references inactive source col ${c}`);
    }
    if (opAt(projection, row, c) !== 'no-stitch') {
      throw new Error(`shaped-stockinette: ${label} bind-off span on row ${row} must cover inactive result col ${c}`);
    }
  }
}

function emitCenterBindOffSpan(input: {
  row: number;
  span: BindOffSpan;
  projection: ResolvedChartProjection;
  needleStart: number;
  carrier: CarrierId;
  sim: CarriageSimulator;
  ops: KnitoutOp[];
}): { skipCols: number[] } {
  const { row, span, projection, needleStart, carrier, sim, ops } = input;
  assertBindOffSpanCells({ row, span, projection, label: 'center' });
  const leftNeighborCol = span.start - 1;
  const rightNeighborCol = span.end;
  const leftNeighborActive = opAt(projection, row, leftNeighborCol) !== 'no-stitch';
  const rightNeighborActive = opAt(projection, row, rightNeighborCol) !== 'no-stitch';
  const dir = directionForCarrier(sim, carrier, 'center bind-off span');

  if (dir === '+' && rightNeighborActive) {
    emitLeftEdgeBindOff(needleStart + span.start, needleStart + span.end, carrier, 'center', sim, ops);
    return { skipCols: [rightNeighborCol] };
  }
  if (dir === '-' && leftNeighborActive) {
    emitRightEdgeBindOff(needleStart + span.start, needleStart + span.end - 1, carrier, 'center', sim, ops);
    return { skipCols: [leftNeighborCol] };
  }
  if (rightNeighborActive) {
    emitLeftEdgeBindOff(needleStart + span.start, needleStart + span.end, carrier, 'center', sim, ops);
    return { skipCols: [rightNeighborCol] };
  }
  if (leftNeighborActive) {
    emitRightEdgeBindOff(needleStart + span.start, needleStart + span.end - 1, carrier, 'center', sim, ops);
    return { skipCols: [leftNeighborCol] };
  }

  throw new Error(`shaped-stockinette: center bind-off span on row ${row} needs an active shoulder neighbor`);
}

function emitLeftEdgeBindOff(
  firstNeedle: number,
  activeNeighborNeedle: number,
  carrier: CarrierId,
  label: 'left' | 'center',
  sim: CarriageSimulator,
  ops: KnitoutOp[],
): void {
  ops.push(...sim.drainOps());
  ops.push(comment(`-- chart bind-off ${label} f${firstNeedle}..f${activeNeighborNeedle - 1} --`));
  for (let n = firstNeedle; n < activeNeighborNeedle; n++) {
    ops.push(...sim.drainOps());
    ops.push(xfer(f(n), backBed(n)));
    sim.setRacking(1);
    ops.push(...sim.drainOps());
    ops.push(xfer(backBed(n), f(n + 1)));
    sim.setRacking(0);
    sim.knit(carrier, '+', f(n + 1));
  }
  ops.push(...sim.drainOps());
}

function emitRightEdgeBindOff(
  firstNeedle: number,
  lastNeedle: number,
  carrier: CarrierId,
  label: 'right' | 'center',
  sim: CarriageSimulator,
  ops: KnitoutOp[],
): void {
  const activeNeighborNeedle = firstNeedle - 1;
  ops.push(...sim.drainOps());
  ops.push(comment(`-- chart bind-off ${label} f${firstNeedle}..f${lastNeedle} --`));
  for (let n = lastNeedle; n >= firstNeedle; n--) {
    ops.push(...sim.drainOps());
    ops.push(xfer(f(n), backBed(n)));
    sim.setRacking(-1);
    ops.push(...sim.drainOps());
    ops.push(xfer(backBed(n), f(n - 1)));
    sim.setRacking(0);
    sim.knit(carrier, '-', f(n - 1));
  }
  ops.push(...sim.drainOps());
  if (activeNeighborNeedle < 1) {
    throw new Error(`shaped-stockinette: right bind-off span needs an active neighbor before f${firstNeedle}`);
  }
}

function assertSupportedResultRowOp(
  op: ReturnType<typeof opForKey>,
  row: number,
  col: number,
): void {
  if (
    op === 'knit' ||
    op === 'no-stitch' ||
    op === 'k2tog' ||
    op === 'ssk' ||
    op === 'sk2p' ||
    op === 'k3tog' ||
    op === 'sssk' ||
    op === 'p2tog' ||
    op === 'ssp' ||
    op === 'sp2p' ||
    op === 'p3tog' ||
    op === 'sssp' ||
    // 2026-05-21 Batch A: slip-with-yarn-position is preview-grade in shape
    // mode — lowers as plain knit (the slip mechanism would need carrier-
    // route choreography we don't model). Accept the op here so the walker
    // doesn't throw; per-cell stitchTypeForCellOp returns null so the
    // overrides walker also falls through to knit.
    op === 'sl-wyif' ||
    op === 'sl-wyib' ||
    // 2026-05-21 Batch B: twisted-stitch ops (k-tbl / p-tbl) lower as the
    // base knit/purl; the twist would need opposite-leg bed routing we
    // don't model. Kfb / pfb route through emitIncreaseForCell above, but
    // we list them here so the validator-bypass branch (no-shape-op rows)
    // accepts the symbol without throwing.
    op === 'k-tbl' ||
    op === 'p-tbl' ||
    op === 'kfb' ||
    op === 'pfb' ||
    // 2026-05-21 Batch C: textural ops are hand-knit only (validator rejects
    // them on kniterate-bound charts). Listed here so the exhaustiveness
    // check passes; the walker never actually receives them.
    op === 'knit-below' ||
    op === 'mb' ||
    op === 'kpk-in-1' ||
    op === 'm1l' ||
    op === 'm1r' ||
    op === 'm1lp' ||
    op === 'm1rp' ||
    op === 'yarn-over' ||
    // Slice 1.5 (2026-05-21): purl cells inside a `trim-region` band
    // lower as back-bed knits — the front face reads as a purl bump.
    // The validator (`track-a-shape-overrides-unsupported`) gates purl
    // OUTSIDE trim rows; reaching here means trim-region-approved.
    op === 'purl' ||
    // Slice 3 (2026-05-21): tuck cells lower as `tuck f(n) C` on the
    // front bed. Tuck preserves stitch count so it's compatible with
    // shape mode anywhere — the validator allows it globally.
    op === 'tuck' ||
    // B-1 brioche (2026-06-09): back-bed tuck. Conserves stitch count
    // like tuck; the bed tracker owns the column's back-bed residency.
    op === 'tuck-back' ||
    // Batch D shape-dispatch (2026-05-27): shift-1 destination cells
    // lower to plain knit on the row's knit pass. The rack-and-xfer
    // dance fires through `shiftEvents` BEFORE the knit pass (handled
    // earlier in this walker). Accept the op so the walker doesn't
    // throw on shape+shift charts.
    op === 'shift-1-l' ||
    op === 'shift-1-r'
  ) {
    return;
  }
  throw new Error(
    `shaped-stockinette: unexpected op "${op}" at (${row},${col}) - validator should have rejected it before lowering`,
  );
}

function emitDecreaseForCell(input: {
  row: number;
  col: number;
  projection: ResolvedChartProjection;
  needleStart: number;
  sim: CarriageSimulator;
  ops: KnitoutOp[];
  /** K-6: birdseye-lined fabric — simple decs use the two-diagonal unit. */
  linedBackBed?: boolean;
}): void {
  const { row, col, projection, needleStart, sim, ops, linedBackBed } = input;
  const targetNeedle = needleStart + col;
  const op = opAt(projection, row, col);
  const sourceOffsets = nonzeroDecreaseSourceOffsets(op);
  const targetIsActive = op !== 'no-stitch';
  if (!targetIsActive) {
    throw new Error(`shaped-stockinette: decrease at (${row},${col}) must be on an active result-row cell`);
  }

  for (const offset of sourceOffsets) {
    const sourceCol = col + offset;
    const sourceDisappears = opAt(projection, row - 1, sourceCol) !== 'no-stitch'
      && opAt(projection, row, sourceCol) === 'no-stitch';
    if (sourceDisappears) {
      // Canonical 2-wide ssk/k2tog tiles place the source slot at offset
      // ±1 (structurally no-stitch). If the chart ALSO carries an EMPTY
      // at offset ±2 (CANONICAL_FASHIONING_DISTANCE), this is a fashioned
      // dec — emit the transfer dance that shifts the outer stitch
      // inward by one needle and stacks the merged source onto the
      // target. Deeper wedges aren't physically realizable by this
      // dance and aren't recognized as fashioning (see
      // `src/chart-core/fashioning.ts`).
      const direction: 1 | -1 = offset > 0 ? 1 : -1;
      if (detectCanonicalFashioningWedge({ projection, row, col, direction }) != null) {
        // Single inward shift: dance depth = 1 (the one extra wedge cell
        // beyond the tile's own source slot). On lined fabric the
        // multi-shift transit still sweeps lining loops; the bed-state
        // gate guards it (fashioned wedges don't occur in generated
        // jacquard panels today).
        if (direction > 0) emitFashionedDecreaseTowardLeft(targetNeedle, 1, sim, ops);
        else emitFashionedDecreaseTowardRight(targetNeedle, 1, sim, ops);
        return;
      }
      if (linedBackBed) {
        if (offset < 0) emitLinedDecreaseTowardRight(targetNeedle + offset, sim, ops);
        else emitLinedDecreaseTowardLeft(targetNeedle + offset, sim, ops);
        return;
      }
      emitSingleSourceDecrease(targetNeedle, offset, sim, ops);
      return;
    }
  }

  // Balanced same-row YO + dec: the YO at col±1 will fill the freed needle
  // when the result-row pass knits it, so f(col±1) is no longer "consumed"
  // visually but the transfer dance still works — the YO sits topologically
  // where the dec's merged source came from. The continuity validator's
  // balanced-pair exemption keeps the chart consistent; here we just emit
  // the matching transfer dance.
  for (const offset of sourceOffsets) {
    const sourceCol = col + offset;
    const sourceIsBalancedYO = opAt(projection, row, sourceCol) === 'yarn-over'
      && opAt(projection, row - 1, sourceCol) !== 'no-stitch';
    if (sourceIsBalancedYO) {
      emitSingleSourceDecrease(targetNeedle, offset, sim, ops);
      return;
    }
  }

  throw new Error(`shaped-stockinette: decrease ${op} at (${row},${col}) has no expected disappearing source stitch`);
}

function nonzeroDecreaseSourceOffsets(op: ReturnType<typeof opForKey>): number[] {
  const span = decreaseSpanForOp(op);
  if (!span) return [-1, 1];
  return span.sourceOffsets.filter(offset => offset !== 0);
}

function emitSingleSourceDecrease(
  targetNeedle: number,
  sourceOffset: number,
  sim: CarriageSimulator,
  ops: KnitoutOp[],
): void {
  if (sourceOffset < 0) emitDecreaseTowardRight(targetNeedle + sourceOffset, sim, ops);
  else emitDecreaseTowardLeft(targetNeedle + sourceOffset, sim, ops);
}

/** Right-side fashioning dance: k2tog at f(target), with the no-stitch
 *  appearing `offset` needles to the right. Shift each stitch in cols
 *  [target+2 .. target+offset+1] inward by 1 onto f(target+1 .. target+offset).
 *  The stitch at f(target+1) lands on f(target), creating the k2tog stack.
 *  rack(-1) so b(n) aligns with f(n-1).
 *
 *  Phase 1c follow-up (2026-05-24): each of the two phases (f→b and b→f)
 *  walks consecutive needles, which would violate the Kniterate
 *  `adjacent-xfer-same-pass` rule if emitted in one pass. Insert a rack
 *  op between each xfer to reset the bed-state validator's source
 *  tracker (rack ops act as adjacency relief). The rack value is
 *  re-asserted at the current value, so the geometry doesn't actually
 *  change — only the pass boundary does. */
function emitFashionedDecreaseTowardLeft(
  target: number,
  offset: number,
  sim: CarriageSimulator,
  ops: KnitoutOp[],
): void {
  ops.push(...sim.drainOps());
  ops.push(comment(`-- chart fashioned dec (right, ${offset}-in) @ f${target} stack source f${target + 1} <- f${target + 2}..f${target + offset + 1} --`));
  for (let i = 1; i <= offset + 1; i++) {
    if (i > 1) sim.rackRelief();
    sim.xferBatch([{ from: f(target + i), to: backBed(target + i) }]);
  }
  sim.setRacking(-1);
  for (let i = 1; i <= offset + 1; i++) {
    if (i > 1) sim.rackRelief();
    sim.xferBatch([{ from: backBed(target + i), to: f(target + i - 1) }]);
  }
  sim.setRacking(0);
}

/** Left-side fashioning dance: ssk at f(target), with the no-stitch
 *  appearing `offset` needles to the left. Mirror of the right version. */
function emitFashionedDecreaseTowardRight(
  target: number,
  offset: number,
  sim: CarriageSimulator,
  ops: KnitoutOp[],
): void {
  ops.push(...sim.drainOps());
  ops.push(comment(`-- chart fashioned dec (left, ${offset}-in) @ f${target} stack source f${target - 1} <- f${target - 2}..f${target - offset - 1} --`));
  for (let i = 1; i <= offset + 1; i++) {
    if (i > 1) sim.rackRelief();
    sim.xferBatch([{ from: f(target - i), to: backBed(target - i) }]);
  }
  sim.setRacking(1);
  for (let i = 1; i <= offset + 1; i++) {
    if (i > 1) sim.rackRelief();
    sim.xferBatch([{ from: backBed(target - i), to: f(target - i + 1) }]);
  }
  sim.setRacking(0);
}

function emitIncreaseForCell(input: {
  row: number;
  col: number;
  projection: ResolvedChartProjection;
  needleStart: number;
  carrier: CarrierId;
  sim: CarriageSimulator;
  ops: KnitoutOp[];
  linedBackBed?: boolean;
}): void {
  const { row, col, projection, needleStart, carrier, sim, ops, linedBackBed } = input;
  const targetNeedle = needleStart + col;
  const targetIsActive = opAt(projection, row, col) !== 'no-stitch';
  if (!targetIsActive) {
    throw new Error(`shaped-stockinette: increase at (${row},${col}) must be on an active result-row cell`);
  }

  const targetWasInactive = opAt(projection, row - 1, col) === 'no-stitch';
  if (!targetWasInactive) {
    throw new Error(`shaped-stockinette: increase at (${row},${col}) must create a newly active result-row cell`);
  }

  const leftSourcePersists = opAt(projection, row - 1, col - 1) !== 'no-stitch'
    && opAt(projection, row, col - 1) !== 'no-stitch';
  const rightSourcePersists = opAt(projection, row - 1, col + 1) !== 'no-stitch'
    && opAt(projection, row, col + 1) !== 'no-stitch';

  if (rightSourcePersists && !leftSourcePersists) {
    if (linedBackBed) emitLinedIncreaseTowardLeft(targetNeedle + 1, sim, ops);
    else emitSplitIncreaseTowardLeft(targetNeedle + 1, carrier, sim, ops);
    return;
  }
  if (leftSourcePersists && !rightSourcePersists) {
    if (linedBackBed) emitLinedIncreaseTowardRight(targetNeedle - 1, sim, ops);
    else emitSplitIncreaseTowardRight(targetNeedle - 1, carrier, sim, ops);
    return;
  }
  if (leftSourcePersists && rightSourcePersists) {
    throw new Error(`shaped-stockinette: increase at (${row},${col}) has sources on both sides; interior increases are not supported yet`);
  }

  throw new Error(`shaped-stockinette: increase at (${row},${col}) has no adjacent source stitch from the previous row`);
}

/** 2026-05-21: decorative double decrease lowering. The chart cell consumes
 *  3 source stitches → 1 result according to its canonical `decreaseSpan`.
 *  Output is two xfer dances, each combining an expected source onto the
 *  target needle. The target ends with 3 loops stacked briefly; the next
 *  knit pass fuses them into 1.
 *
 *  Trade-off: 3-loop intermediate violates the bed-state soft 2-loop cap;
 *  the validator allows up to 3 with a `loop-stack-warning` (decorative
 *  decreases are preview-grade — swatch first).
 */
function emitDoubleDecreaseForCell(input: {
  row: number;
  col: number;
  op: ReturnType<typeof opForKey>;
  projection: ResolvedChartProjection;
  needleStart: number;
  sim: CarriageSimulator;
  ops: KnitoutOp[];
}): void {
  const { row, col, op, projection, needleStart, sim, ops } = input;
  const targetNeedle = needleStart + col;
  const targetIsActive = opAt(projection, row, col) !== 'no-stitch';
  if (!targetIsActive) {
    throw new Error(`shaped-stockinette: double-decrease at (${row},${col}) must be on an active result-row cell`);
  }

  const sourceOffsets = nonzeroDecreaseSourceOffsets(op);
  const disappeared = sourceOffsets.filter((d) => {
    const probeCol = col + d;
    return opAt(projection, row - 1, probeCol) !== 'no-stitch'
      && opAt(projection, row, probeCol) === 'no-stitch';
  });
  if (disappeared.length < 2) {
    throw new Error(`shaped-stockinette: double-decrease ${op} at (${row},${col}) needs expected source offsets ${sourceOffsets.join(',')}, found ${disappeared.length}`);
  }

  // Emit one transfer dance per source column, stacking onto the target.
  ops.push(...sim.drainOps());
  ops.push(comment(`-- chart ${op} @ f${targetNeedle} stacks 2 sources from cols ${disappeared.map(d => col + d + 1).join(',')} --`));
  for (const delta of disappeared) {
    const sourceNeedle = targetNeedle + delta;
    // rack offset such that backBed(sourceNeedle) aligns with f(targetNeedle).
    // rack = -delta (rack=1 means b(n) ↔ f(n-1)).
    const rackOffset = -delta;
    sim.xferBatch([{ from: f(sourceNeedle), to: backBed(sourceNeedle) }]);
    sim.setRacking(rackOffset);
    sim.xferBatch([{ from: backBed(sourceNeedle), to: f(targetNeedle) }]);
    sim.setRacking(0);
  }
}

/** K-1 Phase 1 (2026-06-10): decrease/fashioning dances route through the
 *  CarriageSimulator (`xferBatch` + `setRacking`/`rackRelief`) instead of
 *  raw drain-around ops, so predicted passes include the vendor's
 *  transfer sub-passes and rack state stays single-sourced. The emitted
 *  op stream is unchanged: same xfers, same rack boundaries, same
 *  adjacency-relief racks. */
function emitDecreaseTowardRight(n: number, sim: CarriageSimulator, ops: KnitoutOp[]): void {
  ops.push(...sim.drainOps());
  ops.push(comment(`-- chart dec right @ f${n} -> f${n + 1} --`));
  sim.xferBatch([{ from: f(n), to: backBed(n) }]);
  sim.setRacking(1);
  sim.xferBatch([{ from: backBed(n), to: f(n + 1) }]);
  sim.setRacking(0);
}

function emitDecreaseTowardLeft(n: number, sim: CarriageSimulator, ops: KnitoutOp[]): void {
  ops.push(...sim.drainOps());
  ops.push(comment(`-- chart dec left @ f${n} -> f${n - 1} --`));
  sim.xferBatch([{ from: f(n), to: backBed(n) }]);
  sim.setRacking(-1);
  sim.xferBatch([{ from: backBed(n), to: f(n - 1) }]);
  sim.setRacking(0);
}

/** K-6 (2026-06-10): paired edge decrease for birdseye-LINED fabric —
 *  the reference sweater's two-diagonal unit (§K-1 ground truth in
 *  docs/kniterate-improvement-tracker.md). No transit needle: the front
 *  edge loop merges diagonally inward onto the OCCUPIED lining needle
 *  (2-stack, knit through by a following backing pass), and the back
 *  edge loop merges diagonally inward onto the front target (2-stack,
 *  knit by the row's own pass). Both bed edges step inward together;
 *  max stack anywhere is 2 — the plain dance's b(n) transit would sweep
 *  the resident lining loop and stack 3+.
 *
 *  "TowardRight" = vanishing column n at the LEFT edge, target f(n+1). */
function emitLinedDecreaseTowardRight(n: number, sim: CarriageSimulator, ops: KnitoutOp[]): void {
  ops.push(...sim.drainOps());
  ops.push(comment(`-- chart lined dec right @ f${n}/b${n} -> f${n + 1}/b${n + 1} --`));
  sim.setRacking(-1);
  sim.xferBatch([{ from: f(n), to: backBed(n + 1) }]);
  sim.setRacking(1);
  sim.xferBatch([{ from: backBed(n), to: f(n + 1) }]);
  sim.setRacking(0);
}

/** Mirror of `emitLinedDecreaseTowardRight`: vanishing column n at the
 *  RIGHT edge, target f(n-1). */
function emitLinedDecreaseTowardLeft(n: number, sim: CarriageSimulator, ops: KnitoutOp[]): void {
  ops.push(...sim.drainOps());
  ops.push(comment(`-- chart lined dec left @ f${n}/b${n} -> f${n - 1}/b${n - 1} --`));
  sim.setRacking(1);
  sim.xferBatch([{ from: f(n), to: backBed(n - 1) }]);
  sim.setRacking(-1);
  sim.xferBatch([{ from: backBed(n), to: f(n - 1) }]);
  sim.setRacking(0);
}

/** DBJ-garment campaign (2026-06-10): edge increase for birdseye-LINED
 *  fabric — the reference sweater's lining-borrow unit (§K-1 ground truth
 *  in docs/kniterate-improvement-tracker.md). The split increase's
 *  `split f(s)→b(s)` lands the old loop on the OCCUPIED lining needle and
 *  the racked return sweeps both to the front target, knitting the lining
 *  yarn into the face at every increase edge. Instead, borrow the edge
 *  lining loop diagonally outward to seed the new front column — one
 *  xfer, no carrier, no stacks. The vacated b(source) and the new
 *  column's b(target) are both re-knit by the next backing passes
 *  (knit-on-empty is how lining establishes everywhere).
 *
 *  "TowardLeft" = left edge growing outward: target f(source-1). */
function emitLinedIncreaseTowardLeft(
  sourceNeedle: number,
  sim: CarriageSimulator,
  ops: KnitoutOp[],
): void {
  ops.push(...sim.drainOps());
  ops.push(comment(`-- chart lined inc left @ b${sourceNeedle} -> f${sourceNeedle - 1} --`));
  sim.setRacking(-1);
  sim.xferBatch([{ from: backBed(sourceNeedle), to: f(sourceNeedle - 1) }]);
  sim.setRacking(0);
}

/** Mirror of `emitLinedIncreaseTowardLeft`: right edge growing outward,
 *  target f(source+1). */
function emitLinedIncreaseTowardRight(
  sourceNeedle: number,
  sim: CarriageSimulator,
  ops: KnitoutOp[],
): void {
  ops.push(...sim.drainOps());
  ops.push(comment(`-- chart lined inc right @ b${sourceNeedle} -> f${sourceNeedle + 1} --`));
  sim.setRacking(1);
  sim.xferBatch([{ from: backBed(sourceNeedle), to: f(sourceNeedle + 1) }]);
  sim.setRacking(0);
}

function emitSplitIncreaseTowardRight(
  sourceNeedle: number,
  carrier: CarrierId,
  sim: CarriageSimulator,
  ops: KnitoutOp[],
): void {
  const dir = directionForCarrier(sim, carrier, 'split increase right');
  ops.push(...sim.drainOps());
  ops.push(comment(`-- chart split inc right @ f${sourceNeedle} -> f${sourceNeedle + 1} --`));
  sim.split(carrier, dir, f(sourceNeedle), backBed(sourceNeedle));
  sim.setRacking(1);
  sim.xferBatch([{ from: backBed(sourceNeedle), to: f(sourceNeedle + 1) }]);
  sim.setRacking(0);
}

function emitSplitIncreaseTowardLeft(
  sourceNeedle: number,
  carrier: CarrierId,
  sim: CarriageSimulator,
  ops: KnitoutOp[],
): void {
  const dir = directionForCarrier(sim, carrier, 'split increase left');
  ops.push(...sim.drainOps());
  ops.push(comment(`-- chart split inc left @ f${sourceNeedle} -> f${sourceNeedle - 1} --`));
  sim.split(carrier, dir, f(sourceNeedle), backBed(sourceNeedle));
  sim.setRacking(-1);
  sim.xferBatch([{ from: backBed(sourceNeedle), to: f(sourceNeedle - 1) }]);
  sim.setRacking(0);
}

function activeCols(
  projection: ResolvedChartProjection,
  r: number,
  skipCols: ReadonlySet<number> = new Set(),
): number[] {
  const out: number[] = [];
  if (r < 0 || r >= projection.rows) return out;
  for (let c = 0; c < projection.cols; c++) {
    if (skipCols.has(c)) continue;
    if (opAt(projection, r, c) !== 'no-stitch') out.push(c);
  }
  return out;
}

/**
 * Phase 1c (2026-05-24): owner-aware per-cell op via the chart-core
 * projection. Multi-cell tiles (atomic ssk / k2tog / shifts) honor
 * per-cell op overrides — the source half of a 2-wide ssk resolves to
 * `no-stitch`, not a second ssk event. Out-of-range coordinates collapse
 * to `no-stitch` (matching `projection.cellAt` background sentinel).
 */
function opAt(
  projection: ResolvedChartProjection,
  r: number,
  c: number,
): ReturnType<typeof opForKey> {
  if (r < 0 || r >= projection.rows) return 'no-stitch';
  if (c < 0 || c >= projection.cols) return 'no-stitch';
  return projection.cellAt(r, c).semanticOp;
}
