/**
 * Track A: Chart → KniteratePlan compiler.
 *
 * Single-pass build that produces both the Plan IR and (via
 * compilePlanToKnitout) a byte-identical KnitoutProgram. This is the
 * B1.0a refactor — Track A's existing compileChartToKnitout now routes
 * through this, with a snapshot test gating that the .k output is
 * unchanged.
 *
 * Pipeline:
 *   chart + bindings + machine settings
 *     → resolveChart           (placement composition rules)
 *     → validateChartForTrackA (no no-stitch; op support; ≤ N colors; bed width)
 *     → assemble passes        (settings + waste + body + bind-off + release)
 *     → KniteratePlan
 */

import {
  opForKey,
  primitiveForOp,
  type KnitlabChartAnnotation,
  type KnitlabChartSheetAnnotation,
  type KnitlabChartState,
  type KnitlabKeyDefinition,
} from '../../colorwork/knitlab1-contract.js';
import type { KnitOp } from '../../primitives/knit-op.js';
import { validateChartContinuity } from '../../validators/chart-continuity.js';
import {
  resolveChartWarningsToMessages,
  validateChartForTrackA,
} from '../../validators/chart-track-a.js';
import type { ValidationMessage } from '../../validators/knitout-program.js';
import {
  DEFAULT_KNITERATE_HEADERS,
  DEFAULT_POSITION,
  DEFAULT_WASTE_PASSES,
  DRAW_THREAD_CARRIER,
  WASTE_YARN_CARRIER,
  selectExperimentalWasteCarrier,
} from '../kniterate/constants.js';
import { castOnBedFor, emitBackBedClear } from '../passes/back-bed-clear.js';
import { CUSTOMIST_FLOATS_BODY_AUTO_MOVE_PRESSER } from '../passes/jacquard-floats.js';
import {
  FAIRISLE_CARRIER_INTRO_DEFAULTS,
  emitFairisleCarrierIntro,
  type FairisleCarrierIntro,
} from '../passes/carrier-intro.js';
import { resolveChart, type ResolvedChart } from '../passes/resolve-chart.js';
import {
  projectChart,
  reverseProjectionRows,
  tagAsKnitOrder,
} from '../../chart-core/projection.js';
import { annotationAffectsShapeMode } from '../../chart-core/annotation-registry.js';
import type { ResolvedChartProjection } from '../../chart-core/types.js';
import { detectShapedColorMode } from '../../colorwork/shaped-color-mode.js';
import { cableEventsFromChart } from '../../colorwork/cable-events-from-chart.js';
import { shiftEventsFromChart, type ChartShiftEvent } from '../../colorwork/shift-events-from-chart.js';
import { rowPauseSetFromAnnotations, rowRackScheduleFromAnnotations, rowStitchScheduleFromAnnotations } from '../../colorwork/row-rack-schedule.js';
import { castOnBedPattern } from '../passes/stockinette-with-overrides.js';
import { emitWasteSection, type WasteMachineConfig } from '../passes/waste-section.js';
import {
  seedSimulatorCarrierFromHandoff,
  simulatorHandoffFromBoundary,
  type SimulatorHandoff,
} from '../passes/simulator-handoff.js';
import {
  emitBindOff,
  type BindOffMachineConfig,
  type BindOffStyle,
  type FairisleParkConfig,
} from '../passes/bind-off.js';
import { CarriageSimulator } from '../sim/carriage-simulator.js';
import type { CarrierSimState, PredictedPass } from '../sim/types.js';
import {
  comment,
  xRollerAdvance,
  xSpeedNumber,
  xStitchNumber,
  type CarrierId,
  type Direction,
  type KniterateExtensionHeaders,
  type KnitoutOp,
  type Position,
  type StitchType,
  type YarnBinding,
} from '../types.js';
import type {
  CarrierAssignment,
  KniteratePlan,
  KniteratePlanSettings,
  NotesContent,
  PlannedPass,
  WastePlan,
} from './types.js';
import { emitChartBodyWalker, chooseChartBodyWalkerDispatch } from './chart-body-walker.js';
import { machineSettingConsumptionWarnings } from './machine-settings-consumption.js';
import { emitKniterateSettingsOps } from './kniterate-settings-ops.js';

const ALL_KNITERATE_CARRIERS: readonly CarrierId[] = ['1', '2', '3', '4', '5', '6'];

export interface CompileChartToPlanInput {
  chart: KnitlabChartState;
  keyPalette: KnitlabKeyDefinition[];
  yarnBindings: YarnBinding[];
  needleOffset?: number;
  wastePasses?: number;
  kniterate?: Partial<KniterateExtensionHeaders>;
  gauge?: number;
  position?: Position;
  experimental6ColorMode?: boolean;
  bindOff?: BindOffStyle;
  /** Per-pass machine settings for `style: 'machine-bindoff'`. Defaults
   *  to the fairisle parity recipe's chain bind-off (xfer @ speed 120 stitch 4;
   *  knit @ speed 300 stitch 6 with roller advance ramp 250 → 200 →
   *  150×5 → 100). Override individual fields to retune. */
  bindOffMachineConfig?: Partial<BindOffMachineConfig>;
  /** Per-pass machine settings for `style: 'fairisle-park-bindoff'`.
   *  Defaults to FAIRISLE_PARK_BINDOFF_DEFAULTS (closing-waste @
   *  speed 150 roller 450, STIF ramp 9×8 → 6×7; park @ speed 150
   *  roller 450 STIF 4). Only honored when bindOff is set to the
   *  fairisle-park style. */
  fairisleParkConfig?: Partial<FairisleParkConfig>;
  /** Carrier override for the waste yarn. Default mode uses C6;
   *  experimental selects from unbound carriers. Setting this picks
   *  the supplied carrier instead. */
  wasteCarrierOverride?: CarrierId;
  /** Draw thread carrier override. `'none'` skips the draw-thread row
   *  entirely. `undefined` falls back to default-mode C1 / experimental
   *  null. */
  drawCarrierOverride?: CarrierId | 'none';
  /** Per-pass machine settings for the waste section. When provided the
   *  emitter inserts x-stitch-number / x-speed-number / x-roller-advance
   *  ops to drive the cast-on and waste rows to the fairisle parity reference
   *  values. Also controls `castOnFirstBed` parity and `edgeInertNeedles`
   *  edge trimming. */
  wasteMachineConfig?: Partial<WasteMachineConfig>;
  releaseCarriersAtEnd?: boolean;
  /** Back-bed scheme for multi-color charts.
   *  - `'ladder'`: historical default for ≤ 2 colors (fast, bounded floats).
   *  - `'birdseye'`: float-free option (stippled back-bed, +0.5 rack — see
   *     src/knitout/passes/jacquard-birdseye.ts).
   *  - `'floats'`: front-bed only, no back-bed knit. Unsecured floats run
   *     across the back. Classic stranded fairisle on a v-bed — matches
   *     the body structure of the fairisle parity recipe's `.kc` fairisle exports.
   *  - `'lined'`: deferred; falls back to `'ladder'` with a warning. */
  backBedStyle?: 'ladder' | 'lined' | 'birdseye' | 'floats';
  /** Project-level DBJ intent. Overrides the legacy chart annotation. */
  dbjBackingStrategy?: 'birdseye' | 'twill' | 'striped' | 'full' | 'complement';
  /** Birdseye-specific knob: 'minimal' emits back-bed passes only for
   *  colors present in the current row; 'full' emits them for all
   *  design colors. Default 'minimal'. */
  birdseyeMode?: 'minimal' | 'full';
  /** Phase 3 (2026-05-23): Fairisle carrier intro + stitch
   *  ramp. When set + `backBedStyle === 'floats'`, the compiler emits
   *  per-carrier intro passes and a STIF ramp at body entry — matches
   *  rows 86-107 of `reference/fairisle.kc`. Pass `true` for the
   *  defaults (FAIRISLE_CARRIER_INTRO_DEFAULTS) or an explicit
   *  partial to override. Ignored for non-floats modes. */
  fairisleCarrierIntro?: boolean | Partial<FairisleCarrierIntro>;
  /** W-1 (2026-06-30): slow the first actual body row after cast-on,
   *  then restore the configured body speed for row 1+. Default true.
   *  This mitigates Kniterate's right-edge stitch-drop timing bug
   *  without inserting extra rows. */
  protectFirstBodyRow?: boolean;
  stitchBindings?: Map<string, StitchType>;
  /** P1.3 (2026-05-23): developer-mode capability. Required to compile
   *  with `bindOff: 'drop'` — that style intentionally drops live loops
   *  off the bed and is for test swatches only, not production output. */
  developerMode?: boolean;
}

export interface CompileChartToPlanResult {
  ok: boolean;
  plan?: KniteratePlan;
  /** Surface validations the wizard reads even when ok = false. */
  messages: ValidationMessage[];
  /**
   * B2a follow-up (2026-05-20): cable events extracted from the source
   * chart, available at the plan-result level so callers can inspect
   * them even when the compile fails (e.g. with `track-a-cable-unsupported`).
   * Same shape as `KniteratePlan.notes.cableEvents`; populated whenever
   * the chart places a cable-marked tile.
   */
  cableEvents?: Array<{
    row: number;
    startCol: number;
    width: number;
    /** Batch D Phase 0 §0.2 (2026-05-22): worked/purl split for asymmetric
     *  cables. Symmetric C2/4/6/8 events default to floor(width/2). */
    workedWidth: number;
    purlWidth: number;
    direction: 'front' | 'back';
    /** Batch D Phase 1 (2026-05-22): true for LPC/RPC tiles. */
    hasPurlBackground: boolean;
    keyId: string;
  }>;
}

export function compileChartToKniteratePlan(
  input: CompileChartToPlanInput,
): CompileChartToPlanResult {
  const messages: ValidationMessage[] = [];

  // 1. Resolve chart cells deterministically. Phase 2 Step 5 (2026-05-23)
  //    also builds a chart-core projection so per-cell semantic-op + role
  //    lookups go through one canonical layer instead of `semanticOpForCell`
  //    + `keyById.get` rebuilt at each call site.
  const resolvedAsAuthored = resolveChart(input.chart, input.keyPalette);
  const projectionAsAuthored = projectChart(input.chart, input.keyPalette);
  messages.push(...resolveChartWarningsToMessages(resolvedAsAuthored));

  // B2a follow-up + Batch D Phase 2 (2026-05-22): extract cable + shift
  // events from the authored chart BEFORE shape-mode detection. Both
  // analyzers read placements directly (not the shape-reversed cells), so
  // they're computed once here against the authored chart. Shift events
  // exempt their source/dest cells from `chartUsesShapeCells` so a
  // shift-only chart doesn't accidentally enter shape mode and trip the
  // shape-mode shift gate.
  const cableChartEvents = cableEventsFromChart(input.chart, input.keyPalette);
  const shiftChartEvents = shiftEventsFromChart(input.chart, input.keyPalette);
  // Batch D Phase 4 (2026-05-22): row-rack schedule. Annotation rows are
  // already in author-space; the compile-chart pipeline normalizes them
  // for shape-mode reversal at `chartAnnotations` below, so we build the
  // schedule from those POST-reversal annotations.

  const shapeMode =
    chartUsesShapeCells(projectionAsAuthored, shiftChartEvents) ||
    chartUsesShapeAnnotations(input.chart.annotations ?? []);
  // knitlab1 stores row 0 at the top of the canvas. For shaped bottom-up
  // charts, row labels run bottom->top, and result-row decreases/increases
  // need to be lowered in knitting order. Preserve legacy colorwork parity by
  // applying this reversal only to the shaped-chart path.
  const resolved = shapeMode && input.chart.orientation === 'bottom-up'
    ? reverseResolvedRows(resolvedAsAuthored)
    : resolvedAsAuthored;
  // Projection mirror of the row reversal: helpers indexed against
  // `resolved` rows must see matching projection cells. Shape mode +
  // bottom-up reverses chart rows so the walker can lower in knit
  // order; non-shape mode leaves the projection in chart-display
  // order (colorwork walkers iterate the authored row layout).
  const projection = shapeMode && input.chart.orientation === 'bottom-up'
    ? reverseProjectionRows(projectionAsAuthored)
    : projectionAsAuthored;
  // Batch D shape-dispatch (2026-05-27): both the chart-continuity
  // validator (when shapeMode is on) AND the shape walker iterate
  // against `projection`'s row index, so any shift / cable event row
  // must be in the same row space. For bottom-up shape mode that
  // requires flipping `event.row` through `resolvedAsAuthored.rows`.
  // Validators that read against `projectionAsAuthored`
  // (`validateShiftSourceColumns`, `validateCablePurlBackground`)
  // keep the unflipped author-space events.
  const shouldFlipEventRows = shapeMode && input.chart.orientation === 'bottom-up';
  const walkerCableEvents = shouldFlipEventRows
    ? cableChartEvents.map(e => ({ ...e, row: resolvedAsAuthored.rows - 1 - e.row }))
    : cableChartEvents;
  const walkerShiftEvents = shouldFlipEventRows
    ? shiftChartEvents.map(e => ({ ...e, row: resolvedAsAuthored.rows - 1 - e.row }))
    : shiftChartEvents;
  // `walkerProjection` carries the knit-order type tag that
  // `emitShapedStockinetteWalk` requires. In shape mode we already
  // reversed (bottom-up) or know rows are structurally knit-order
  // (top-down); use the corresponding constructor. In non-shape mode,
  // the shape walker is still used as an optimization for the
  // horizontal-stripe path — each row is independent, so the chart-
  // display order works structurally. `tagAsKnitOrder` is a pure
  // brand flip that documents this contract while preserving historical
  // behavior; if a future shape op gets added to a non-shape branch,
  // the wrong row direction will surface as a visible regression.
  const walkerProjection: ResolvedChartProjection<'knit-order'> =
    projection === projectionAsAuthored
      ? tagAsKnitOrder(projectionAsAuthored)
      : (projection as ResolvedChartProjection<'knit-order'>);
  const chartAnnotations = normalizeAnnotationsForResolvedRows({
    annotations: input.chart.annotations ?? [],
    rows: resolvedAsAuthored.rows,
    reverseRows: shapeMode && input.chart.orientation === 'bottom-up',
  });
  // Phase 4: schedule lives in resolved-row space so the walker can query
  // by row index without re-doing the reversal.
  const rowRackSchedule = rowRackScheduleFromAnnotations(chartAnnotations);
  const rowStitchSchedule = rowStitchScheduleFromAnnotations(chartAnnotations);
  const rowPauseSet = rowPauseSetFromAnnotations(chartAnnotations);

  // Batch D Phase 1 followup (2026-05-22): compile-safety gate for LPC/RPC
  // cables. `emitAsymmetricCableCross` assumes the purl-background loops
  // already live on the back bed when the cross fires; that bed state only
  // holds when the row immediately below the cable purled the right
  // columns. Without it, the helper emits xfer ops against empty needles
  // and the bed-state simulator rejects the program. Catch this at compile
  // boundary with a clear chart-level diagnostic — the alternative is a
  // wall of `bed-state-xfer-from-empty` messages that don't explain WHY.
  messages.push(...validateCablePurlBackground({
    cableEvents: cableChartEvents,
    projection: projectionAsAuthored,
  }));

  // Batch D Phase 2 (2026-05-22): compile-safety gate for lateral shifts.
  // `emitLateralShift` xfers loops from the source columns onto the
  // destination columns; the source loops must exist (previous row had
  // active stitches there) and the same-row source cells must be no-stitch
  // (otherwise the row's knit pass would double-anchor the destination).
  // Same rationale as `validateCablePurlBackground` — surface the missing
  // setup with a chart-level diagnostic instead of cryptic
  // `bed-state-xfer-from-empty` walls.
  //
  // Note: `event.row - 1` reads as "row immediately above in author
  // canvas." For top-down that's the previous knit-direction row; for
  // bottom-up it's the next knit-direction row. Existing fixtures
  // (`from-chart-lateral-shift.test.ts`) were authored against the
  // canvas-up semantic and pass uniformly. The orientation-aware
  // version of this check is a separate clean-up — not blocking Batch
  // D shape-dispatch.
  messages.push(...validateShiftSourceColumns({
    shiftEvents: shiftChartEvents,
    projection: projectionAsAuthored,
  }));

  // 2. Compute needle offset.
  const needleOffset = input.needleOffset ?? centerNeedleOffset(resolved.cols);
  const needleStart = needleOffset;
  const needleEnd = needleOffset + resolved.cols - 1;

  // 3. Resolve yarn bindings and pattern carriers.
  const patternColorKeyIds = input.yarnBindings.map(y => y.keyId);
  const patternColorKeyIdSet = new Set(patternColorKeyIds);
  const patternCarriers = input.yarnBindings.map(y => y.carrier);
  const experimental = input.experimental6ColorMode ?? false;

  // 4. Track A chart validation.
  const stitchBindings = stitchBindingsWithKeyOps(
    input.keyPalette,
    resolved,
    input.stitchBindings,
  );
  // B1 walker migration (2026-05-20): also count keys whose CELLS carry
  // stitch-override ops (tuck/purl) as stitch-override keys, even if the
  // key-level op is plain 'knit'. Otherwise chart-track-a would reject a
  // waffle/tuck-rib tile as "unbound" because it's not a pattern color
  // and not a key-level stitch override.
  const perCellOverrideKeyIds = new Set<string>();
  // chart-core/identity-read-ok: enumerate which keyIds appear on the
  // chart so we can later inspect their per-cell op overrides.
  const usedKeyIds = new Set(resolved.cells.flat());
  for (const key of input.keyPalette) {
    if (!usedKeyIds.has(key.id)) continue;
    if (!key.cells) continue;
    let hasOverride = false;
    for (const row of key.cells) {
      for (const cell of row) {
        const op = cell?.op;
        if (op === 'tuck' || op === 'tuck-back' || op === 'purl' || op === 'yarn-over') {
          hasOverride = true;
          break;
        }
      }
      if (hasOverride) break;
    }
    if (hasOverride) perCellOverrideKeyIds.add(key.id);
  }
  const stitchOverrideKeyIds = [
    ...(stitchBindings ? stitchBindings.keys() : []),
    ...perCellOverrideKeyIds,
  ];
  if (shapeMode) {
    messages.push(...validateChartContinuity({
      projection,
      annotations: chartAnnotations,
      // Batch D Phase 2 (2026-05-22): exempt lateral-shift source/dest
      // columns from the per-column dec/inc checks. Use the walker-row-
      // space events here — `projection` is row-flipped for bottom-up
      // shape mode (line 233), so the validator's row indices need to
      // match. Pre-shape-dispatch (2026-05-27) this passed
      // `shiftChartEvents` directly; the Track A gate masked the
      // misalignment because shape+shift was rejected outright.
      shiftEvents: walkerShiftEvents.map(e => ({
        row: e.row,
        destStartCol: e.destStartCol,
        sourceStartCol: e.sourceStartCol,
        count: e.count,
      })),
    }));
  }
  messages.push(
    ...validateChartForTrackA({
      resolved,
      projection,
      keyPalette: input.keyPalette,
      shapeMode,
      patternColorKeyIds,
      stitchOverrideKeyIds,
      experimental6ColorMode: experimental,
      needleOffset,
      orientation: input.chart.orientation,
      // Slice 1.5 (2026-05-21): pass row-remapped annotations so trim-region
      // ranges are in resolved-row space (matches the indices the validator
      // iterates `resolved.cells` with). Pre-Slice-1.5 callers passed the
      // raw author-space annotations; `short-row-turn` / `dbj-backing` checks
      // do not read row coords so this is a safe upgrade.
      annotations: chartAnnotations,
      // Batch D Phase 2 (2026-05-22): shift events power the no-stitch
      // exemption for shift-source columns. Shape mode rejects shifts via
      // `track-a-shift-shape-mode-unsupported` so the exemption only fires
      // in non-shape charts.
      shiftEvents: shiftChartEvents,
    }),
  );

  // 4b. Duplicate-carrier check.
  const seenCarriers = new Map<CarrierId, string>();
  for (const b of input.yarnBindings) {
    const prior = seenCarriers.get(b.carrier);
    if (prior !== undefined) {
      messages.push({
        severity: 'error',
        rule: 'track-a-duplicate-carrier',
        message: `Carrier C${b.carrier} is bound to both "${prior}" and "${b.keyId}". Each pattern color needs its own carrier.`,
      });
    }
    seenCarriers.set(b.carrier, b.keyId);
  }

  // Cable events are extracted from the authored chart up-front so they
  // ride along on the result even when the early-error gate fires below
  // (e.g. when `track-a-cable-unsupported` blocks compile).
  const cableEventsResultField = cableChartEvents.length > 0
    ? { cableEvents: cableChartEvents }
    : {};

  // P1.3 (2026-05-23): bindOff: 'drop' is for test swatches only — it
  // intentionally drops live loops off the bed and produces fabric that
  // can't be removed cleanly. Gate behind developerMode so the UI must
  // explicitly opt in to expose it. Production-style bind-offs
  // (machine-bindoff, waste-and-drop, fairisle-park-bindoff) are
  // unaffected.
  if (input.bindOff === 'drop' && input.developerMode !== true) {
    messages.push({
      severity: 'error',
      rule: 'compile-bindoff-drop-developer-only',
      message: `bindOff: 'drop' produces unfinished fabric (live loops drop off the bed) and is for test swatches only. Enable developer mode to use it, or pick 'machine-bindoff' or 'waste-and-drop' for production output.`,
    });
  }

  // Batch D shape-dispatch (2026-05-27): the shaped walker now dispatches
  // cable + shift events (see `emitShapedStockinetteWalk`'s `cableEvents`
  // / `shiftEvents` params). The legacy `compile-shape-mode-cable-events`
  // / `compile-shape-mode-shift-events` belt-and-suspenders gates are
  // retired alongside `track-a-cable-shape-mode-unsupported` /
  // `track-a-shift-shape-mode-unsupported`. Bed-state simulator catches
  // column-overlap collisions between shape ops and same-row cables /
  // shifts downstream.

  // Pre-build error gate.
  if (messages.some(m => m.severity === 'error')) {
    return { ok: false, messages, ...cableEventsResultField };
  }
  if (patternCarriers.length === 0) {
    messages.push({
      severity: 'error',
      rule: 'compile-no-pattern-carriers',
      message: 'No pattern carriers — at least one yarn binding required.',
    });
    return { ok: false, messages, ...cableEventsResultField };
  }
  const patternCarrier = patternCarriers[0]!;

  // 5. Resolve settings.
  const headers: KniterateExtensionHeaders = {
    ...DEFAULT_KNITERATE_HEADERS,
    ...input.kniterate,
  };
  const wastePasses = input.wastePasses ?? DEFAULT_WASTE_PASSES;
  const settings: KniteratePlanSettings = {
    rollerAdvance: headers.rollerAdvance,
    stitchNumber: headers.stitchNumber,
    xferStitchNumber: headers.xferStitchNumber,
    speedNumber: headers.speedNumber,
    carrierSpacing: headers.carrierSpacing,
    carrierStoppingDistance: headers.carrierStoppingDistance,
    xferStyle: headers.xferStyle,
    position: input.position ?? DEFAULT_POSITION,
    gauge: input.gauge ?? 7,
    wastePasses,
    bindOff: input.bindOff ?? 'waste-and-drop',
  };
  messages.push(...machineSettingConsumptionWarnings(input, settings.bindOff));

  // 6. Build waste plan + carrier assignments.
  // Default draw thread: C1 (default mode) or none (experimental). User
  // can override to `'none'` to skip the separator row entirely (matches
  // the fairisle cast-on which flows directly from waste into body).
  const drawCarrier: CarrierId | null = input.drawCarrierOverride === 'none'
    ? null
    : (input.drawCarrierOverride ?? (experimental ? null : DRAW_THREAD_CARRIER));
  // G18.2: experimental waste-carrier selection is shared with the notes
  // generator via selectExperimentalWasteCarrier so the engine and the
  // user-facing instructions can't drift apart.
  // User override (`wasteCarrierOverride`) takes precedence — needed to
  // match external references like the fairisle reference's `castonYarn` mapping.
  const wasteCarrier: CarrierId = input.wasteCarrierOverride
    ?? (experimental
      ? selectExperimentalWasteCarrier(patternCarriers).carrier
      : WASTE_YARN_CARRIER);

  const firstActiveRange = shapeMode
    ? activeNeedleRange(projection, 0, needleStart)
    : null;
  const wasteNeedleStart = firstActiveRange?.needleStart ?? needleStart;
  const wasteNeedleEnd = firstActiveRange?.needleEnd ?? needleEnd;

  const wastePlan: WastePlan = {
    needleStart: wasteNeedleStart,
    needleEnd: wasteNeedleEnd,
    wasteCarrier,
    drawThreadCarrier: drawCarrier,
    patternCarriers: [...patternCarriers],
    wastePasses,
    castOnCarrier: patternCarrier,
  };

  // Phase 1c (2026-05-24): also fire the overrides walker when the chart
  // has per-cell op overrides inside multi-cell tiles, even if no key-level
  // stitch binding exists. Without this, a pure-knit-keyed chart that
  // places a tuck-rib tile (whose CELL ops are tuck) would route through
  // plain stockinette and silently lose the tucks. Mirrors the sparse-
  // override semantics of the retired `cellOps` sidecar: an override is
  // recognized only when the cell sits inside a multi-cell tile AND its
  // semanticOp differs from the parent key's footprint op.
  const chartHasPerCellOverrides = (() => {
    for (const { cell } of projection.cells()) {
      const keyDef = cell.keyDef;
      if (!keyDef) continue;
      if (keyDef.width <= 1 && keyDef.height <= 1) continue;
      if (cell.semanticOp === opForKey(keyDef)) continue;
      if (cell.semanticOp === 'tuck' || cell.semanticOp === 'tuck-back' || cell.semanticOp === 'purl' || cell.semanticOp === 'yarn-over') return true;
    }
    return false;
  })();
  const useStockinetteOverrides =
    patternCarriers.length === 1 &&
    ((stitchBindings !== undefined && stitchBindings.size > 0) || chartHasPerCellOverrides);
  const multiColorAnalysis = patternCarriers.length > 1
    ? detectShapedColorMode({
        resolved,
        patternColorKeyIds: patternColorKeyIdSet,
      })
    : null;
  if (shapeMode) {
    // The shaped walker applies transfer/split shaping before result rows.
    // Seed only the first active row on the front bed; inactive edge columns
    // are created later by M1 cells instead of being secretly cast on.
    // Slice 1.5 (2026-05-21): if the cast-on row has purl cells (e.g. a rib
    // hem on a bottom-up flat panel), seed those columns on the back bed so
    // the first knit pass can knit them as front-purl without an immediate
    // transfer dance.
    const castOnStartCol = Math.max(0, wasteNeedleStart - needleStart);
    const castOnLen = Math.max(0, wasteNeedleEnd - wasteNeedleStart + 1);
    wastePlan.castOnBedPattern = Array.from({ length: castOnLen }, (_, i) => {
      const col = castOnStartCol + i;
      // EC2 owner-aware bed for the cast-on row: per-cell tile
      // overrides (atomic ssk source / shift source) resolve through
      // the projection rather than the parent keyId's primary op.
      return projection.cellAt(0, col).semanticOp === 'purl' ? 'b' as const : 'f' as const;
    });
  } else if (useStockinetteOverrides) {
    // stitchBindings can be undefined when the only overrides come from
    // per-cell tile ops (B1). castOnBedPattern reads through the projection's
    // per-cell semanticOp for those, so passing an empty Map is safe.
    wastePlan.castOnBedPattern = castOnBedPattern(projection, stitchBindings ?? new Map());
  }
  if (
    !useStockinetteOverrides &&
    stitchBindings !== undefined &&
    stitchBindings.size > 0 &&
    patternCarriers.length > 1
  ) {
    // Passed-in but unused override bindings in jacquard are a warning for
    // backward compatibility. If an override key is actually painted in the
    // chart, validateChartForTrackA emits track-a-overrides-jacquard-unsupported.
    messages.push({
      severity: 'warning',
      rule: 'p6-overrides-jacquard-unsupported',
      message: `${stitchBindings.size} stitch override binding${stitchBindings.size === 1 ? '' : 's'} ignored — P6 supports overrides in single-color (stockinette) mode only. Jacquard + per-cell overrides is a follow-up phase.`,
    });
  }

  const carriers: CarrierAssignment[] = [];
  if (drawCarrier !== null) {
    carriers.push({
      carrier: drawCarrier,
      role: 'draw',
      yarnName: 'draw thread',
      initialSide: 'left',
    });
  }
  if (!experimental) {
    carriers.push({
      carrier: wasteCarrier,
      role: 'waste',
      yarnName: 'waste yarn',
      initialSide: 'left',
    });
  }
  for (const yb of input.yarnBindings) {
    carriers.push({
      carrier: yb.carrier,
      role: 'pattern',
      yarnName: yb.name,
      keyId: yb.keyId,
      initialSide: 'left',
    });
  }

  // 7. Walker dispatch + per-pass assembly.
  const passes: PlannedPass[] = [];

  // Phase 4 (2026-05-24): accumulate predicted-pass traces from each
  // per-section emitter. Sections that don't construct a simulator
  // (settings, release) and bind-off styles that haven't cut over
  // (waste-and-drop, machine-bindoff, drop) contribute nothing.
  //
  // Phase 4b (2026-05-24): thread the vendor's runtime `nextDirection`
  // across section boundaries. Each emitter accepts `initialNextDirection`
  // (defaulting to `+`) and returns `finalNextDirection`; the next
  // emitter's input picks up from there. Closes the cross-section drift
  // that Phase 4a's per-section sims couldn't see.
  const predictedPasses: PredictedPass[] = [];
  let threadedNextDirection: Direction = '+';

  // Pass 0 — settings ops (machine extension knobs as inline ops). The
  // vendor compiler only reads these as ops; the matching `;;X-` headers
  // are emitted for diagnostics but get silently ignored.
  const settingsOps = emitKniterateSettingsOps(settings);
  if (settingsOps.length > 0) {
    passes.push({ index: passes.length, purpose: 'settings', ops: settingsOps });
  }

  // The fairisle carrier intro reuses the waste carrier (C6) for the
  // interleaved filler rows between pattern-carrier intros, and the closing
  // reuses it for the post-body waste/draw section, so C6 must stay alive
  // end-to-end when the intro runs. Also gates `continuousWaste` (the
  // intro brings the pattern carriers in and the back-bed clear transfers
  // the interlock residual, so the waste section skips its cast-on block).
  // Hoisted above the waste call so it can drive `continuousWaste`; reused
  // far below for the intro / back-bed-clear / body-presser gates.
  const dbjBacking = chartAnnotations.find(
    (a): a is KnitlabChartSheetAnnotation => a.kind === 'dbj-backing',
  );
  const dbjBackingStrategy = input.dbjBackingStrategy ?? dbjBacking?.dbjStrategy;
  const wantsDbjFull = input.backBedStyle === 'birdseye' && dbjBackingStrategy === 'full';
  const wantsIntro = input.backBedStyle === 'floats' && !!input.fairisleCarrierIntro;
  const wantsContinuousWaste = wantsIntro || wantsDbjFull;

  // Which body walker this chart dispatches to, decided up-front so the waste
  // section can pre-introduce exactly the carriers that walker needs.
  const bodyWalkerDispatch = chooseChartBodyWalkerDispatch({
    patternCarrierCount: patternCarriers.length,
    shapeMode,
    hasStockinetteOverrides: useStockinetteOverrides,
    ...(multiColorAnalysis ? { colorMode: multiColorAnalysis.mode } : {}),
    ...(input.backBedStyle !== undefined ? { backBedStyle: input.backBedStyle } : {}),
    ...(dbjBackingStrategy !== undefined ? { dbjBackingStrategy } : {}),
  });

  // The per-row stripe walker (`stockinette-shaped-stripes`) brings carriers in
  // ON DEMAND, one per row, and only for the colours that actually appear — it
  // never touches a bound carrier whose colour is absent, and never releases it.
  // So pre-introducing every bound carrier in the waste section would STRAND any
  // colour this chart never knits: the carrier is brought `in` but never taken
  // `out`, and the vendor `.kc` converter rejects the program ("out missing on
  // carriers"). This is exactly the multi-carrier garment export — every panel is
  // compiled with the SAME full yarn bindings, so a plain mirrored sleeve (or any
  // panel a stripe never reaches) would orphan that stripe's carrier. For the
  // stripe walker, pre-introduce only the carriers whose colour is present (plus
  // the primary cast-on carrier); every other technique (single-colour, the
  // jacquard/birdseye/floats walkers that REQUIRE all carriers pre-introduced,
  // within-row multicolour that brings them in itself) keeps the full set, so
  // those programs — and every fully-painted stripe chart — are byte-unchanged.
  const wasteIntroCarriers =
    bodyWalkerDispatch.technique === 'stockinette-shaped-stripes'
      ? patternCarriers.filter(
          (carrier, i) => carrier === patternCarrier || usedKeyIds.has(input.yarnBindings[i]!.keyId),
        )
      : patternCarriers;

  // Pass 1 — waste section + cast-on prologue.
  const wasteResult = emitWasteSection({
    needleStart: wastePlan.needleStart,
    needleEnd: wastePlan.needleEnd,
    wasteCarrier,
    drawThreadCarrier: drawCarrier,
    patternCarriers: wasteIntroCarriers,
    wastePasses,
    castOnCarrier: patternCarrier,
    castOnBedPattern: wastePlan.castOnBedPattern,
    machineConfig: input.wasteMachineConfig,
    initialNextDirection: threadedNextDirection,
    continuousWaste: wantsContinuousWaste,
  });
  threadedNextDirection = wasteResult.finalNextDirection;
  let currentHandoff: SimulatorHandoff = wasteResult.handoff;
  const wasteOps: KnitoutOp[] = [...wasteResult.ops];
  const postWasteActiveCarriers = new Set(wasteResult.activeCarriers);

  const postWasteReleaseCarriers: CarrierId[] = [];
  const queuePostWasteRelease = (carrier: CarrierId) => {
    if (!postWasteReleaseCarriers.includes(carrier)) {
      postWasteReleaseCarriers.push(carrier);
    }
  };

  // Take waste / draw carriers out after cast-on if they're not used as
  // pattern carriers. The membership check covers Advanced mode where C6
  // doubles as waste yarn AND a non-dominant pattern color — comparing
  // only against the dominant `patternCarrier` would release C6 even
  // though the ladder walker still needs it. See plan §13 #6 / §14 A.5.1
  // and test/knitout/from-chart-jacquard-5color.test.ts.
  if (
    postWasteActiveCarriers.has(wasteCarrier) &&
    !patternCarriers.includes(wasteCarrier) &&
    !wantsContinuousWaste
  ) {
    queuePostWasteRelease(wasteCarrier);
  }
  if (
    drawCarrier !== null &&
    postWasteActiveCarriers.has(drawCarrier) &&
    !patternCarriers.includes(drawCarrier)
  ) {
    queuePostWasteRelease(drawCarrier);
  }

  // Phase E bridge (2026-05-25): post-waste releases are vendor-level
  // Tu-Tu passes, so emit them through a tiny simulator segment instead
  // of as raw `out` ops plus manual nextDirection accounting.
  const postWastePredictedPasses: PredictedPass[] = [];
  if (postWasteReleaseCarriers.length > 0) {
    const releaseResult = emitCarrierReleaseSegment({
      handoff: currentHandoff,
      carriers: postWasteReleaseCarriers,
      needleStart: wastePlan.needleStart,
      needleEnd: wastePlan.needleEnd,
      initialNextDirection: threadedNextDirection,
    });
    wasteOps.push(...releaseResult.ops);
    postWastePredictedPasses.push(...releaseResult.predictedPasses);
    threadedNextDirection = releaseResult.finalNextDirection;
    currentHandoff = simulatorHandoffFromBoundary(releaseResult);
  }
  passes.push({ index: passes.length, purpose: 'waste', ops: wasteOps });
  predictedPasses.push(...wasteResult.predictedPasses, ...postWastePredictedPasses);

  // Pass 2 — body (walker). The waste section may have overridden the
  // engine's machine settings via per-pass x-* ops; re-emit the body's
  // configured roller / stitch / speed so the body's first knit doesn't
  // inherit waste-row residue.
  const bodyOps: KnitoutOp[] = [comment('--- PATTERN ---')];
  if (settings.rollerAdvance !== undefined) bodyOps.push(xRollerAdvance(settings.rollerAdvance));
  if (settings.stitchNumber !== undefined) bodyOps.push(xStitchNumber(settings.stitchNumber));
  if (settings.speedNumber !== undefined) bodyOps.push(xSpeedNumber(settings.speedNumber));

  // Phase 3 (2026-05-23): Fairisle carrier intro + stitch
  // ramp. Sits BEFORE the back-bed clear; intro passes are front-bed
  // only (see emitFairisleCarrierIntro for the orphan-loop
  // rationale) and they bring the pattern carriers in so the
  // back-bed-clear pass doesn't have to. The intro freely overrides
  // STIF/speed/roller; the body re-assert below restores body values
  // before the walker runs. (`wantsIntro` computed near the post-waste
  // release above, which it gates.)
  // Hoisted so the post-clear stitch ramp (emitted after the back-bed
  // clear, matching the reference order re-park → clear → ramp) can reuse
  // the same transition config.
  const introTransition: FairisleCarrierIntro = {
    ...FAIRISLE_CARRIER_INTRO_DEFAULTS,
    ...(typeof input.fairisleCarrierIntro === 'object'
      ? input.fairisleCarrierIntro
      : {}),
  };
  if (wantsIntro) {
    // Carrier intro order = highest-numbered pattern carrier first
    // (matches the fairisle reference: 4 → 3 → 1). Sort descending.
    const introOrder = [...patternCarriers].sort((a, b) => Number(b) - Number(a));
    // Cameo carriers must be disjoint from pattern carriers (else
    // they get intro'd twice). Filter defensively.
    const patternSet = new Set(patternCarriers);
    const cameoCarriers = (introTransition.cameoCarriers ?? []).filter(c => !patternSet.has(c));
    const introResult = emitFairisleCarrierIntro({
      needleStart: wastePlan.needleStart,
      needleEnd: wastePlan.needleEnd,
      patternCarriers: introOrder,
      cameoCarriers,
      primaryCarrier: patternCarrier,
      // C6 (kept alive past the post-waste release for the intro) knits
      // the interleaved filler rows between pattern-carrier intros.
      wasteFillerCarrier: wasteCarrier,
      edgeInertNeedles: input.wasteMachineConfig?.edgeInertNeedles ?? 1,
      handoff: currentHandoff,
      transition: introTransition,
      initialNextDirection: threadedNextDirection,
    });
    bodyOps.push(...introResult.ops);
    predictedPasses.push(...introResult.predictedPasses);
    threadedNextDirection = introResult.finalNextDirection;
    currentHandoff = simulatorHandoffFromBoundary(introResult);
  }

  // For single-bed bodies, transfer all back-bed cast-on loops to the front
  // so floats jacquard and plain stockinette cannot retain orphaned loops.
  // The vendor splits a batched run of `xfer
  // b{n} f{n}` into the two `[back-to-front, even/odd]` passes that
  // appear at rows 105-106 of `reference/fairisle.kc`. Without this, a
  // single-bed chart leaves cast-on loops on the back bed for the entire run
  // and rejects on bed-state validation at bind-off.
  const needsBackBedClear = input.backBedStyle === 'floats' || bodyWalkerDispatch.kind === 'single-color-stockinette';
  if (needsBackBedClear) {
    // The cast-on row direction is encoded in where `castOnCarrier`
    // ended up: a '+' pass moves it from left → right, a '-' pass
    // moves it right → left. Since the cast-on always starts from
    // wherever the carrier was brought in (initialSide 'left' by
    // default), POST-pass side='right' means cast-on direction='+'.
    const castOnDir = wasteResult.castOnDirection;
    // In `continuousWaste` mode there is no cast-on row to mirror — the
    // clear transfers the interlock's residual back loops the waste section
    // reported instead.
    const residualBackBedCols = wasteResult.residualBackBedCols;
    const bedAssignment = wantsIntro && residualBackBedCols.length > 0
      ? (col: number) => residualBackBedCols[col] ?? 'f'
      : (col: number) => castOnBedFor(
        col,
        wastePlan.needleStart,
        castOnDir,
        wastePlan.castOnBedPattern,
      );
    const clearResult = emitBackBedClear({
      needleStart: wastePlan.needleStart,
      needleEnd: wastePlan.needleEnd,
      bedAssignment,
      // the fairisle reference's `Rr-Tr` / `Rl-Tr` pair runs at speed 120 (vs
      // body speed). When the body speed is set on `settings`,
      // sandwich the xfers between 120 and a restore-to-body-speed
      // op so the next body knit doesn't inherit the xfer speed.
      xferSpeed: 120,
      restoreSpeed: settings.speedNumber,
      initialNextDirection: threadedNextDirection,
      xferStyle: settings.xferStyle,
    });
    bodyOps.push(...clearResult.ops);
    predictedPasses.push(...clearResult.predictedPasses);
    threadedNextDirection = clearResult.finalNextDirection;
  }

  // Second body-settings re-assert. Carrier-intro phase mutates
  // STIF/speed/roller via its own ramp; back-bed clear sandwiches the
  // xfers with `xferSpeed` (restored to body speed at the end but
  // doesn't touch STIF/roller). Re-emit body STIF/roller here so the
  // walker's first knit lands with the configured body values even
  // when intro/clear ran.
  if (wantsIntro || needsBackBedClear) {
    if (settings.rollerAdvance !== undefined) bodyOps.push(xRollerAdvance(settings.rollerAdvance));
    if (settings.stitchNumber !== undefined) bodyOps.push(xStitchNumber(settings.stitchNumber));
    if (settings.speedNumber !== undefined) bodyOps.push(xSpeedNumber(settings.speedNumber));
  }

  // `walkerCableEvents` / `walkerShiftEvents` were computed above —
  // right after `projection` was constructed — so the chart-continuity
  // validator and the walker see the same row space.
  const bodyWalkerResult = emitChartBodyWalker({
    patternCarrierCount: patternCarriers.length,
    shapeMode,
    hasStockinetteOverrides: useStockinetteOverrides,
    colorMode: multiColorAnalysis?.mode,
    backBedStyle: input.backBedStyle,
    dbjBackingStrategy,
    resolved,
    projection,
    walkerProjection,
    colorAnalysis: multiColorAnalysis,
    yarnBindings: input.yarnBindings,
    patternCarriers,
    patternCarrier,
    stitchTypeForKey: stitchBindings ?? new Map(),
    cableEvents: walkerCableEvents,
    shiftEvents: walkerShiftEvents,
    rowRackSchedule,
    rowStitchSchedule,
    bodyStitchNumber: settings.stitchNumber,
    rowPauseSet,
    annotations: chartAnnotations,
    birdseyeMode: input.birdseyeMode,
    // The fast 600/0 body auto-move presser is a Customist fairisle
    // recipe behavior, gated on the same signal as the carrier intro —
    // not a global default for every floats chart.
    floatsBodyAutoMovePresser: wantsIntro
      ? CUSTOMIST_FLOATS_BODY_AUTO_MOVE_PRESSER
      : undefined,
    firstRowSpeedOverride: input.protectFirstBodyRow !== false && settings.speedNumber !== undefined
      ? { speed: introTransition.rampSpeed, restoreSpeed: settings.speedNumber }
      : undefined,
    needleStart,
    needleEnd,
    handoff: currentHandoff,
    initialNextDirection: threadedNextDirection,
  });
  // Element-by-element append: the body walk for a large chart can emit
  // hundreds of thousands of ops, and `push(...bodyWalkerResult.ops)` would
  // spread that many arguments and overflow the call stack. The loop is
  // stack-safe (matches plan-to-knitout's pass flattening).
  for (const op of bodyWalkerResult.ops) bodyOps.push(op);
  for (const pass of bodyWalkerResult.predictedPasses) predictedPasses.push(pass);
  threadedNextDirection = bodyWalkerResult.finalNextDirection;
  currentHandoff = simulatorHandoffFromBoundary({
    finalCarrierStates: bodyWalkerResult.finalCarrierStates,
  });
  messages.push(...bodyWalkerResult.messages);
  const bindOffNeedleStart = bodyWalkerResult.bindOffNeedleStart;
  const bindOffNeedleEnd = bodyWalkerResult.bindOffNeedleEnd;
  const finalKnitCarrier = bodyWalkerResult.finalKnitCarrier;
  const technique = bodyWalkerResult.technique;
  passes.push({ index: passes.length, purpose: 'body', ops: bodyOps });

  // Pass 3 — bind-off. Uses `finalKnitCarrier` (set per technique branch
  // above; defaults to patternCarrier) so the bind-off addresses the
  // carrier that actually holds the live stitches.
  const bindResult = emitBindOff({
    style: settings.bindOff,
    needleStart: bindOffNeedleStart,
    needleEnd: bindOffNeedleEnd,
    knitCarrier: finalKnitCarrier,
    wasteCarrier,
    handoff: currentHandoff,
    machineConfig: input.bindOffMachineConfig,
    fairisleParkConfig: input.fairisleParkConfig,
    initialNextDirection: threadedNextDirection,
    // Backed jacquard walkers home the final back-bed row onto the front,
    // walker homed the final row's lining onto the front bed, so chain
    // bind-off must consolidate the doubled loops before walking.
    linedBackBed:
      (technique === 'stockinette-shaped-jacquard'
        || technique === 'birdseye-jacquard'
        || technique === 'complement-jacquard'
        || technique === 'ladder-jacquard')
      && (input.backBedStyle === 'birdseye' || input.backBedStyle === 'ladder' || input.backBedStyle === 'lined'),
  });
  passes.push({ index: passes.length, purpose: 'bind-off', ops: bindResult.ops });
  predictedPasses.push(...bindResult.predictedPasses);
  threadedNextDirection = bindResult.finalNextDirection;
  currentHandoff = simulatorHandoffFromBoundary(bindResult);

  // Pass 4 — release trailing carriers.
  if (input.releaseCarriersAtEnd !== false) {
    const stillActive = [...currentHandoff.keys()];
    if (stillActive.length > 0) {
      const releaseOps: KnitoutOp[] = [comment('--- RELEASE TRAILING CARRIERS ---')];
      const releaseResult = emitCarrierReleaseSegment({
        handoff: currentHandoff,
        carriers: stillActive,
        needleStart: bindOffNeedleStart,
        needleEnd: bindOffNeedleEnd,
        initialNextDirection: threadedNextDirection,
      });
      releaseOps.push(...releaseResult.ops);
      predictedPasses.push(...releaseResult.predictedPasses);
      threadedNextDirection = releaseResult.finalNextDirection;
      currentHandoff = simulatorHandoffFromBoundary(releaseResult);
      passes.push({ index: passes.length, purpose: 'release', ops: releaseOps });
    }
  }

  // 8. Build derived metadata.
  const yarnBindingsRecord: Record<string, YarnBinding> = {};
  for (const yb of input.yarnBindings) yarnBindingsRecord[yb.keyId] = yb;
  const stitchBindingsRecord: Record<string, StitchType> = {};
  if (stitchBindings) {
    for (const [keyId, st] of stitchBindings.entries()) stitchBindingsRecord[keyId] = st;
  }

  const opCount = passes.reduce((sum, p) => sum + p.ops.length, 0);

  // Crude wall-clock estimate. `countTimedPasses` actually returns the count
  // of timed *ops* (knit/tuck/miss/xfer/split), not passes — a pass bundles
  // ~50 such ops on a typical garment-width row. The Kniterate takes ~10s per
  // pass at speed 150, so seconds ≈ (timedOps / 50) * 10, scaled by (150 /
  // speed). The `/ 50` mirrors compile-package.ts; without it the chart path
  // over-reported knit time by 50× (a 4-panel sweater read ~95h, not ~2h).
  const passesForTime = countTimedPasses(passes);
  const speedFactor = settings.speedNumber !== undefined && settings.speedNumber > 0
    ? 150 / settings.speedNumber
    : 1;
  const estimatedKnitTimeSeconds = Math.round(passesForTime * 10 * speedFactor / 50);

  const warningMessages = messages.filter(m => m.severity === 'warning').map(m => m.message);

  const notes: NotesContent = {
    title: input.chart.name ?? `chart-${input.chart.id}`,
    yarn: carriers.map(c => ({
      carrier: c.carrier,
      role: c.role,
      name: c.yarnName,
      keyId: c.keyId,
    })),
    machineSettings: {
      stitchNumber: settings.stitchNumber,
      speedNumber: settings.speedNumber,
      rollerAdvance: settings.rollerAdvance,
      xferStitchNumber: settings.xferStitchNumber,
      wastePasses: settings.wastePasses,
      position: settings.position,
      gauge: settings.gauge,
    },
    dimensions: {
      needleStart,
      needleEnd,
      needleCount: needleEnd - needleStart + 1,
      estimatedRows: input.chart.rows,
    },
    estimatedKnitTimeSeconds,
    passCount: passes.length,
    opCount,
    warnings: warningMessages,
    // B2a follow-up (2026-05-20): wire the cable analyzer into production
    // compile output. Present only when the chart actually placed a
    // cable-marked tile; downstream consumers (tech pack, future B2b
    // lowering) read this to know cables exist before falling back to
    // re-scanning the chart.
    ...(cableChartEvents.length > 0 ? { cableEvents: cableChartEvents } : {}),
  };

  const plan: KniteratePlan = {
    schemaVersion: 1,
    machine: 'kniterate',
    source: {
      kind: 'chart',
      chartId: input.chart.id,
      chartName: input.chart.name,
      rows: input.chart.rows,
      cols: input.chart.cols,
    },
    technique,
    // chart-core/identity-read-ok: forwards the cells matrix to the
    // walker entry point (still consumes ResolvedChart, not the
    // projection — Phase 1c will migrate).
    resolvedCells: resolved.cells,
    yarnBindings: yarnBindingsRecord,
    stitchBindings: stitchBindingsRecord,
    carriers,
    settings,
    waste: wastePlan,
    passes,
    estimatedRows: input.chart.rows,
    estimatedKnitTimeSeconds,
    validations: messages,
    notes,
    predictedPasses,
  };

  return { ok: true, plan, messages, ...cableEventsResultField };
}

function emitCarrierReleaseSegment(input: {
  handoff: SimulatorHandoff;
  carriers: readonly CarrierId[];
  needleStart: number;
  needleEnd: number;
  initialNextDirection: Direction;
}): {
  ops: KnitoutOp[];
  predictedPasses: PredictedPass[];
  finalNextDirection: Direction;
  finalCarrierStates: ReadonlyMap<CarrierId, CarrierSimState>;
  releasedCarriers: readonly CarrierId[];
} {
  const sim = new CarriageSimulator({
    carriers: ALL_KNITERATE_CARRIERS,
    initialNextDirection: input.initialNextDirection,
  });
  seedActiveCarriersForChartRelease(
    sim,
    input.handoff,
    input.needleStart,
    input.needleEnd,
  );

  const released = new Set<CarrierId>();
  for (const c of input.carriers) {
    if (released.has(c) || !sim.positionOf(c)) continue;
    ensureChartReleaseOutAnchor(sim, c, input.needleStart, input.needleEnd);
    sim.out(c);
    released.add(c);
  }

  const ops = sim.drainOps();
  const predictedPasses = [...sim.predictedPasses()];
  const finalNextDirection = sim.finalNextDirection();
  const finalCarrierStates = sim.snapshot();
  return {
    ops,
    predictedPasses,
    finalNextDirection,
    finalCarrierStates,
    releasedCarriers: [...released],
  };
}

function seedActiveCarriersForChartRelease(
  sim: CarriageSimulator,
  handoff: SimulatorHandoff,
  needleStart: number,
  needleEnd: number,
): void {
  for (const c of handoff.keys()) {
    seedSimulatorCarrierFromHandoff(sim, handoff, c, (side) => ({
      anchorNeedle: {
        bed: 'f',
        needle: side === 'left' ? needleStart : needleEnd,
      },
      anchorDirection: side === 'left' ? '-' : '+',
    }));
  }
}

function ensureChartReleaseOutAnchor(
  sim: CarriageSimulator,
  carrier: CarrierId,
  needleStart: number,
  needleEnd: number,
): void {
  const state = sim.positionOf(carrier);
  if (!state) {
    throw new Error(`chart release: carrier "${carrier}" not active`);
  }
  if (state.lastNeedle) return;
  const side = state.side;
  sim.seedActiveCarrierAnchor(carrier, {
    side,
    anchorNeedle: {
      bed: 'f',
      needle: side === 'left' ? needleStart : needleEnd,
    },
    anchorDirection: side === 'left' ? '-' : '+',
  });
}

function stitchBindingsWithKeyOps(
  keyPalette: KnitlabKeyDefinition[],
  resolved: { cells: string[][] },
  explicitBindings: Map<string, StitchType> | undefined,
): Map<string, StitchType> | undefined {
  // Permissive by design: this only derives known machine stitch overrides.
  // validateChartForTrackA is the gate that prevents unsupported semantic ops
  // such as yarn-over from reaching lowering as accidental plain knits.
  let merged: Map<string, StitchType> | undefined = explicitBindings
    ? new Map(explicitBindings)
    : undefined;
  // chart-core/identity-read-ok: enumerate which keyIds appear so we can
  // bind a default StitchType for unbound keys with a key-level op.
  const usedKeyIds = new Set(resolved.cells.flat());

  for (const key of keyPalette) {
    if (!usedKeyIds.has(key.id)) continue;
    if (merged?.has(key.id)) continue;
    const stitch = stitchTypeForKeyOp(key);
    if (!stitch) continue;
    if (!merged) merged = new Map<string, StitchType>();
    merged.set(key.id, stitch);
  }

  return merged;
}

function chartUsesShapeCells(
  projection: ResolvedChartProjection,
  shiftEvents?: readonly ChartShiftEvent[],
): boolean {
  // Cells covered by a shift event (either the source or destination
  // side) are NOT shape cells — the rack+xfer dance handles them outside
  // the shape walker. Without this exemption, a shift-only chart's no-
  // stitch source cell would trigger shape mode and be blocked by the
  // shape-mode shift gate. Per-stitch shift-1 vacates exactly one source
  // column, but the destination block still spans `count` columns.
  const shiftExempt = new Set<string>();
  for (const event of shiftEvents ?? []) {
    shiftExempt.add(`${event.row}:${event.sourceStartCol}`);
    for (let i = 0; i < event.count; i++) {
      shiftExempt.add(`${event.row}:${event.destStartCol + i}`);
    }
  }
  for (let r = 0; r < projection.rows; r++) {
    for (let c = 0; c < projection.cols; c++) {
      if (shiftExempt.has(`${r}:${c}`)) continue;
      // Owner-aware via the projection: atomic-tile source cells
      // resolve as 'no-stitch', so a 2-wide ssk is read as one ssk +
      // one no-stitch, not as two ssks.
      const op = projection.cellAt(r, c).semanticOp;
      if (op === 'no-stitch' || op === 'k2tog' || op === 'ssk') return true;
      if ((primitiveForOp(op).stitchDelta ?? 0) !== 0) return true;
    }
  }
  return false;
}

function chartUsesShapeAnnotations(annotations: readonly KnitlabChartAnnotation[]): boolean {
  return annotations.some(annotationAffectsShapeMode);
}

function normalizeAnnotationsForResolvedRows(input: {
  annotations: readonly KnitlabChartAnnotation[];
  rows: number;
  reverseRows: boolean;
}): KnitlabChartAnnotation[] {
  const { annotations, rows, reverseRows } = input;
  if (!reverseRows) return [...annotations];
  return annotations.map(annotation => remapAnnotationRow(annotation, row => rows - 1 - row));
}

function remapAnnotationRow(
  annotation: KnitlabChartAnnotation,
  remap: (row: number) => number,
): KnitlabChartAnnotation {
  if (annotation.anchor.scope === 'cell') {
    const cell = annotation as Extract<KnitlabChartAnnotation, { anchor: { scope: 'cell' } }>;
    return { ...cell, anchor: { ...cell.anchor, row: remap(cell.anchor.row) } };
  }
  if (annotation.anchor.scope === 'row') {
    const row = annotation as Extract<KnitlabChartAnnotation, { anchor: { scope: 'row' } }>;
    return { ...row, anchor: { ...row.anchor, row: remap(row.anchor.row) } };
  }
  if (annotation.anchor.scope === 'edge') {
    const edge = annotation as Extract<KnitlabChartAnnotation, { anchor: { scope: 'edge' } }>;
    return { ...edge, anchor: { ...edge.anchor, row: remap(edge.anchor.row) } };
  }
  // Slice 1.5 (2026-05-21): sheet-scope `trim-region` carries a row range that
  // also needs remapping when shape-mode reverses rows. After remap, the
  // start/end may flip; normalize so start <= end.
  if (annotation.anchor.scope === 'sheet' && annotation.kind === 'trim-region' && annotation.trimRegion) {
    const a = remap(annotation.trimRegion.startRow);
    const b = remap(annotation.trimRegion.endRow);
    return {
      ...annotation,
      trimRegion: { startRow: Math.min(a, b), endRow: Math.max(a, b) },
    };
  }
  return { ...annotation };
}

function reverseResolvedRows(resolved: ResolvedChart): ResolvedChart {
  // Phase 1c (2026-05-24): walker no longer consumes `cellOps`; reversal
  // of per-cell semantic-op overrides now rides on the row-reversed
  // projection (`reverseProjectionRows`) computed alongside this. Only
  // the cells matrix is mirrored here for downstream identity/color
  // reads (cast-on bed seeding, shape-mode color analysis).
  return {
    ...resolved,
    // chart-core/identity-read-ok: row-mirror the cells matrix for the
    // shape-mode walker input (structural reshape; preserves all keyIds
    // and roles, just flips the row index).
    cells: [...resolved.cells].reverse(),
  };
}

function stitchTypeForKeyOp(key: KnitlabKeyDefinition): StitchType | null {
  return stitchTypeForOp(opForKey(key));
}

/** B1 walker migration (2026-05-20): KnitOp → StitchType extracted so
 *  key-level and projection-level consumers share the same mapping. */
export function stitchTypeForOp(op: KnitOp): StitchType | null {
  switch (op) {
    case 'purl':
      return { kind: 'purl' };
    case 'tuck':
      return { kind: 'tuck' };
    case 'tuck-back':
      return { kind: 'tuck-back' };
    case 'yarn-over':
      return { kind: 'yarn-over' };
    case 'knit':
      return null;
    case 'no-stitch':
      return null;
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
    // Batch D Phase 1 (2026-05-22): traveller + asymmetric cable ops carry
    // their machine choreography through the cable-event channel (the cell's
    // own `op` lowers to plain knit; the cross is fired by `emitCableCross`
    // / `emitTraveller` / `emitAsymmetricCableCross` BEFORE the row's knit
    // pass per the parent tile's `cableSpan`). The walker still knits the
    // cells as plain knit, so `null` defaults are correct here.
    case 'lt':
    case 'rt':
    case 'lpc-1-1':
    case 'lpc-1-2':
    case 'lpc-2-1':
    case 'rpc-1-1':
    case 'rpc-1-2':
    case 'rpc-2-1':
    // Structural-soundness goal (2026-05-23): shift-1 destination cells
    // lower to plain knit at the destination columns. The rack-and-xfer
    // dance is fired through the shift-event channel BEFORE the row's
    // knit pass; the walker's knit-pass over the destination cells
    // anchors the shifted loops. Adjacent shift-1 cells in a row
    // compose into one event by `shiftEventsFromChart`.
    case 'shift-1-l':
    case 'shift-1-r':
    // Batch D Phase 3 (2026-05-22): purl-symmetry + drop. M1Lp/M1Rp lower
    // via emitIncreaseForCell in the shape walker (kniterate path is
    // preview-grade — the back-bed purl-leg routing isn't modeled). p1-below
    // and drop-st are hand-knit only (chart-track-a rejects on kniterate
    // via the existing TRACK_A_SHAPE_OPS / hand-knit-only gates).
    case 'm1lp':
    case 'm1rp':
    case 'p1-below':
    case 'drop-st':
    // Machine annotation ops (Milestone B): these are palette-layer triggers
    // that activate annotation tools; they never appear as cell ops in a
    // compiled chart (validateChartForTrackA gates them out if somehow placed).
    case 'rack-plus-1':
    case 'rack-minus-1':
    case 'wt-left':
    case 'wt-right':
    case 'pause':
      return null;
  }
}

function activeNeedleRange(
  projection: ResolvedChartProjection,
  r: number,
  needleStart: number,
): { needleStart: number; needleEnd: number } | null {
  let first: number | undefined;
  let last: number | undefined;
  for (let c = 0; c < projection.cols; c++) {
    // EC2 owner-aware via the projection: a multi-cell atomic tile's
    // source cell resolves to 'no-stitch' even though its parent
    // keyId paints the whole footprint.
    const op = projection.cellAt(r, c).semanticOp;
    if (op === 'no-stitch') continue;
    if (first === undefined) first = c;
    last = c;
  }
  if (first === undefined || last === undefined) return null;
  return {
    needleStart: needleStart + first,
    needleEnd: needleStart + last,
  };
}

/** Center the chart on the 252-needle bed. */
function centerNeedleOffset(cols: number): number {
  const KNITERATE_NEEDLE_COUNT = 252;
  return Math.max(1, Math.floor((KNITERATE_NEEDLE_COUNT - cols) / 2) + 1);
}

/** Count ops that correspond to physical machine passes for time estimate.
 *  Knit / tuck / miss / xfer drive a pass; rack / drop / in / out / comment
 *  / settings ops do not. */
function countTimedPasses(passes: readonly PlannedPass[]): number {
  let n = 0;
  for (const p of passes) {
    for (const op of p.ops) {
      if (
        op.kind === 'knit' ||
        op.kind === 'tuck' ||
        op.kind === 'miss' ||
        op.kind === 'xfer' ||
        op.kind === 'split'
      ) {
        n++;
      }
    }
  }
  // Roughly: ops within a pass cluster, so divide by typical pass width.
  // Using a coarse estimate to match the existing wizard formula:
  // rows * passesPerRow ≈ countTimedPasses / cols.
  return n;
}

/**
 * Batch D Phase 1 followup (2026-05-22): chart-level compile-safety gate
 * for asymmetric cables-over-purl (LPC/RPC). Each event whose
 * `hasPurlBackground` is true relies on the purl loops sitting on the
 * back bed when the cross fires. That bed state is established by the
 * row IMMEDIATELY BELOW the cable row purling the right columns; an
 * author who paints the LPC/RPC tile alone produces a chart that compiles
 * past Track A but trips `bed-state-xfer-from-empty` inside
 * `emitAsymmetricCableCross`. Catch this here with a clear chart-level
 * diagnostic that names the exact columns that need to be purled.
 *
 * Notes on direction:
 *   - LPC (direction='front'): worked moves LEFT, so PRE-cross purls sit
 *     on the LEFT of the footprint at columns [startCol, startCol+purlWidth).
 *   - RPC (direction='back'): worked moves RIGHT, so PRE-cross purls sit
 *     on the RIGHT at columns [startCol+workedWidth, startCol+width).
 *
 * `resolvedAsAuthored.cells` is in time order (row 0 = first knit; the
 * compiler walks it bottom-up regardless of chart orientation flag —
 * see the long comment in `stockinette.ts`'s walker), so the pre-cross
 * row for cable row K is row K-1.
 */
export function validateCablePurlBackground(input: {
  cableEvents: ReadonlyArray<{
    row: number;
    startCol: number;
    width: number;
    workedWidth: number;
    purlWidth: number;
    direction: 'front' | 'back';
    hasPurlBackground: boolean;
    keyId: string;
  }>;
  /** Phase 2 Step 5 (2026-05-23): chart-core projection over the same
   *  row-space the cable events were extracted from (author-space for
   *  the standard authoring + compile-chart callers). */
  projection: ResolvedChartProjection;
}): ValidationMessage[] {
  const out: ValidationMessage[] = [];

  for (const event of input.cableEvents) {
    if (!event.hasPurlBackground) continue;
    const preCrossRow = event.row - 1;
    if (preCrossRow < 0) {
      out.push({
        severity: 'error',
        rule: 'chart-continuity-cable-purl-bg-mismatch',
        message: `Cable ${event.keyId} at row ${event.row} needs a row below to establish the purl background, but it is on the cast-on row (no prior row exists). Move the cable up at least one row.`,
      });
      continue;
    }
    const purlStart = event.direction === 'front'
      ? event.startCol
      : event.startCol + event.workedWidth;
    const missing: number[] = [];
    for (let i = 0; i < event.purlWidth; i++) {
      const c = purlStart + i;
      if (c < 0 || c >= input.projection.cols) {
        missing.push(c);
        continue;
      }
      const op = input.projection.cellAt(preCrossRow, c).semanticOp;
      if (op !== 'purl') missing.push(c);
    }
    if (missing.length > 0) {
      const dirLabel = event.direction === 'front' ? 'LPC' : 'RPC';
      out.push({
        severity: 'error',
        rule: 'chart-continuity-cable-purl-bg-mismatch',
        message: `${dirLabel} cable ${event.keyId} at row ${event.row} requires the row below (row ${preCrossRow}) to be purl at column${missing.length === 1 ? '' : 's'} ${missing.sort((a, b) => a - b).join(', ')}. Paint purl cells there so the back-bed loops are in place before the cross fires.`,
      });
    }
  }
  return out;
}

/**
 * Batch D Phase 2 (2026-05-22): chart-level compile-safety gate for
 * lateral shifts. `emitLateralShift` xfers loops from the source columns
 * onto the destination columns; if the source columns are not active on
 * the row immediately below the shift (or extend off-chart), the
 * bed-state simulator would emit `xfer-from-empty`. If the same-row
 * source cells are not no-stitch, the upcoming knit pass would
 * double-anchor (the source loop persists on the front bed AND the
 * shifted loop lands on top). Both cases surface as cryptic bed-state
 * errors downstream; gate them here with column-specific copy.
 *
 * Exported so the authoring path (`reference/knitlab/authoringValidation.ts`)
 * can fire the same warnings mid-paint instead of waiting for compile.
 */
export function validateShiftSourceColumns(input: {
  shiftEvents: ReadonlyArray<ChartShiftEvent>;
  /** Phase 2 Step 5 (2026-05-23): chart-core projection over the same
   *  row-space the shift events were extracted from (author-space for
   *  the standard authoring + compile-chart callers). */
  projection: ResolvedChartProjection;
}): ValidationMessage[] {
  const out: ValidationMessage[] = [];

  for (const event of input.shiftEvents) {
    const dirLabel = event.direction === 'left' ? 'shift-L' : 'shift-R';
    // Per-stitch shift-1 vacates exactly one source column regardless of
    // run length.
    const sourceCols: number[] = [event.sourceStartCol];

    const offChart = sourceCols.filter(c => c < 0 || c >= input.projection.cols);
    if (offChart.length > 0) {
      out.push({
        severity: 'error',
        rule: 'chart-continuity-shift-without-source',
        message: `${dirLabel} ${event.keyId} at row ${event.row} needs source columns at ${sourceCols.join(', ')}, but ${offChart.length === 1 ? 'column extends' : 'columns extend'} off the chart edge. Move the shift inward.`,
      });
      continue;
    }

    // Source cells on the shift row must be no-stitch (the shift removes
    // those loops; the upcoming knit pass would otherwise double-anchor).
    const notNoStitch: number[] = [];
    for (const c of sourceCols) {
      const op = input.projection.cellAt(event.row, c).semanticOp;
      if (op !== 'no-stitch') notNoStitch.push(c);
    }
    if (notNoStitch.length > 0) {
      out.push({
        severity: 'error',
        rule: 'chart-continuity-shift-without-source',
        message: `${dirLabel} ${event.keyId} at row ${event.row} requires no-stitch cells at the source column${notNoStitch.length === 1 ? '' : 's'} ${notNoStitch.sort((a, b) => a - b).join(', ')} (the shift vacates them). Paint no-stitch there so the row's knit pass doesn't double-anchor.`,
      });
      continue;
    }

    // Previous row's source cells must be active (the shift moves real
    // loops, not air). Cast-on (row 0) trivially has no previous row.
    if (event.row === 0) {
      out.push({
        severity: 'error',
        rule: 'chart-continuity-shift-without-source',
        message: `${dirLabel} ${event.keyId} at row ${event.row} is on the cast-on row; lateral shift needs a previous row with active source stitches.`,
      });
      continue;
    }
    const inactivePrev: number[] = [];
    for (const c of sourceCols) {
      const op = input.projection.cellAt(event.row - 1, c).semanticOp;
      if (op === 'no-stitch') inactivePrev.push(c);
    }
    if (inactivePrev.length > 0) {
      out.push({
        severity: 'error',
        rule: 'chart-continuity-shift-without-source',
        message: `${dirLabel} ${event.keyId} at row ${event.row} needs active stitches at source column${inactivePrev.length === 1 ? '' : 's'} ${inactivePrev.sort((a, b) => a - b).join(', ')} on row ${event.row - 1}, but ${inactivePrev.length === 1 ? 'that column is' : 'those columns are'} no-stitch. Paint knit cells there so the shift has loops to move.`,
      });
    }
  }
  return out;
}
