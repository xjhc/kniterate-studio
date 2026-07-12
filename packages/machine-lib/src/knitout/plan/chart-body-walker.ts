/**
 * Chart body-walker registry.
 *
 * Pattern 4 closure shape: one record per body-walker family owns matching,
 * technique metadata, warning metadata, and the adapter to the low-level
 * emitter. `compile-chart.ts` stays the outer plan orchestrator; it no
 * longer branches over walker families.
 */

import type {
  KnitlabChartAnnotation,
} from '../../colorwork/knitlab1-contract.js';
import type { RowRackEntry, RowStitchEntry } from '../../colorwork/row-rack-schedule.js';
import type { ShapedColorMode, ShapedColorModeResult } from '../../colorwork/shaped-color-mode.js';
import type { ResolvedChartProjection } from '../../chart-core/types.js';
import type { ValidationMessage } from '../../validators/knitout-program.js';
import { emitJacquardBirdseyeWalk } from '../passes/jacquard-birdseye.js';
import { emitJacquardComplementWalk } from '../passes/jacquard-complement.js';
import { emitJacquardDbjFullWalk } from '../passes/jacquard-dbj-full.js';
import { emitJacquardFloatsWalk } from '../passes/jacquard-floats.js';
import { emitJacquardLadderWalk } from '../passes/jacquard-ladder.js';
import {
  seedSimulatorCarrierFromHandoff,
  simulatorHandoffFromBoundary,
  type SimulatorHandoff,
} from '../passes/simulator-handoff.js';
import {
  emitStockinetteWalk,
  type CableScheduleEvent,
  type ShiftScheduleEvent,
} from '../passes/stockinette.js';
import type { FirstRowSpeedOverride } from '../passes/first-row-speed.js';
import { emitShapedStockinetteWalk } from '../passes/stockinette-shaped.js';
import { emitStockinetteWithOverridesWalk } from '../passes/stockinette-with-overrides.js';
import type { ResolvedChart } from '../passes/resolve-chart.js';
import { CarriageSimulator } from '../sim/carriage-simulator.js';
import type { CarrierSimState, PredictedPass } from '../sim/types.js';
import {
  type CarrierId,
  type Direction,
  type KnitoutOp,
  type StitchType,
  type YarnBinding,
} from '../types.js';
import type { KniteratePlan } from './types.js';

export type ChartWalkerBackBedStyle = 'ladder' | 'lined' | 'birdseye' | 'floats';

const ALL_KNITERATE_CARRIERS: readonly CarrierId[] = ['1', '2', '3', '4', '5', '6'];

export type ChartBodyWalkerDispatchKind =
  | 'single-color-shaped'
  | 'single-color-overrides'
  | 'single-color-stockinette'
  | 'shaped-within-row-color'
  | 'shaped-row-stripes'
  | 'nonshape-row-stripes'
  | 'jacquard-floats'
  | 'jacquard-dbj-full'
  | 'jacquard-complement'
  | 'jacquard-birdseye'
  | 'jacquard-ladder';

export interface ChartBodyWalkerDispatch {
  readonly kind: ChartBodyWalkerDispatchKind;
  readonly technique: KniteratePlan['technique'];
  readonly linedBackFallsBack: boolean;
}

export interface ChooseChartBodyWalkerDispatchInput {
  readonly patternCarrierCount: number;
  readonly shapeMode: boolean;
  readonly hasStockinetteOverrides: boolean;
  /**
   * Required when patternCarrierCount > 1. For single-carrier paths the
   * carrier count already determines the family.
   */
  readonly colorMode?: ShapedColorMode;
  readonly backBedStyle?: ChartWalkerBackBedStyle;
  readonly dbjBackingStrategy?: 'birdseye' | 'twill' | 'striped' | 'full' | 'complement';
}

export interface EmitChartBodyWalkerInput extends ChooseChartBodyWalkerDispatchInput {
  readonly resolved: ResolvedChart;
  readonly projection: ResolvedChartProjection;
  readonly walkerProjection: ResolvedChartProjection<'knit-order'>;
  readonly colorAnalysis: ShapedColorModeResult | null;
  readonly yarnBindings: readonly YarnBinding[];
  readonly patternCarriers: readonly CarrierId[];
  readonly patternCarrier: CarrierId;
  readonly stitchTypeForKey: Map<string, StitchType>;
  readonly cableEvents: ReadonlyArray<CableScheduleEvent>;
  readonly shiftEvents: ReadonlyArray<ShiftScheduleEvent>;
  readonly rowRackSchedule: ReadonlyArray<RowRackEntry>;
  readonly rowStitchSchedule: ReadonlyArray<RowStitchEntry>;
  /** The body's pre-walk stitch number — seeds the walker's ambient
   *  tension so a `stitch-number` annotation matching the body default
   *  isn't redundantly re-emitted. */
  readonly bodyStitchNumber?: number;
  readonly rowPauseSet: ReadonlySet<number>;
  readonly annotations: readonly KnitlabChartAnnotation[];
  readonly birdseyeMode?: 'minimal' | 'full';
  /** Presser speed/roller for the floats-body vendor auto-moves
   *  (Customist fairisle: 600/0). Forwarded to the floats walker;
   *  omitted leaves the vendor default. */
  readonly floatsBodyAutoMovePresser?: { speed: number; roller: number };
  readonly firstRowSpeedOverride?: FirstRowSpeedOverride;
  readonly needleStart: number;
  readonly needleEnd: number;
  readonly handoff: SimulatorHandoff;
  readonly initialNextDirection: Direction;
}

export interface EmitChartBodyWalkerResult {
  readonly ops: KnitoutOp[];
  readonly predictedPasses: readonly PredictedPass[];
  readonly finalNextDirection: Direction;
  readonly bindOffNeedleStart: number;
  readonly bindOffNeedleEnd: number;
  readonly finalKnitCarrier: CarrierId;
  readonly technique: KniteratePlan['technique'];
  readonly messages: readonly ValidationMessage[];
  readonly finalCarrierStates: ReadonlyMap<CarrierId, CarrierSimState>;
}

interface ChartBodyWalkerRecord {
  readonly kind: ChartBodyWalkerDispatchKind;
  readonly technique: KniteratePlan['technique'];
  readonly matches: (input: ChooseChartBodyWalkerDispatchInput) => boolean;
  readonly linedBackFallsBack?: (input: ChooseChartBodyWalkerDispatchInput) => boolean;
  readonly emit: (ctx: ChartBodyWalkerContext) => void;
}

interface ChartBodyWalkerContext {
  readonly input: EmitChartBodyWalkerInput;
  readonly bindingMap: Map<string, CarrierId>;
  handoff: SimulatorHandoff;
  readonly ops: KnitoutOp[];
  readonly predictedPasses: PredictedPass[];
  readonly messages: ValidationMessage[];
  appendWalkResult(result: {
    readonly ops: readonly KnitoutOp[];
    readonly predictedPasses: readonly PredictedPass[];
    readonly finalNextDirection: Direction;
    readonly finalNeedleStart?: number;
    readonly finalNeedleEnd?: number;
    readonly finalCarrierStates?: ReadonlyMap<CarrierId, CarrierSimState>;
  }): void;
  setFinalKnitCarrier(carrier: CarrierId): void;
  currentNextDirection(): Direction;
}

const CHART_BODY_WALKER_RECORDS: readonly ChartBodyWalkerRecord[] = [
  {
    kind: 'single-color-shaped',
    matches: ({ patternCarrierCount, shapeMode }) => patternCarrierCount === 1 && shapeMode,
    technique: 'stockinette-shaped',
    emit: (ctx) => {
      const input = ctx.input;
      ctx.appendWalkResult(emitShapedStockinetteWalk({
        projection: input.walkerProjection,
        carrier: input.patternCarrier,
        needleStart: input.needleStart,
        handoff: handoffFor(ctx),
        annotations: input.annotations,
        rowRackSchedule: input.rowRackSchedule,
        cableEvents: input.cableEvents,
        shiftEvents: input.shiftEvents,
        firstRowSpeedOverride: input.firstRowSpeedOverride,
        initialNextDirection: ctx.currentNextDirection(),
      }));
    },
  },
  {
    kind: 'single-color-overrides',
    matches: ({ patternCarrierCount, shapeMode, hasStockinetteOverrides }) =>
      patternCarrierCount === 1 && !shapeMode && hasStockinetteOverrides,
    technique: 'stockinette-with-overrides',
    emit: (ctx) => {
      const input = ctx.input;
      ctx.appendWalkResult(emitStockinetteWithOverridesWalk({
        projection: input.projection,
        carrier: input.patternCarrier,
        needleStart: input.needleStart,
        handoff: handoffFor(ctx),
        stitchTypeForKey: input.stitchTypeForKey,
        cableEvents: input.cableEvents,
        shiftEvents: input.shiftEvents,
        rowRackSchedule: input.rowRackSchedule,
        rowPauseSet: input.rowPauseSet,
        firstRowSpeedOverride: input.firstRowSpeedOverride,
        initialNextDirection: ctx.currentNextDirection(),
      }));
    },
  },
  {
    kind: 'single-color-stockinette',
    matches: ({ patternCarrierCount, shapeMode }) => patternCarrierCount === 1 && !shapeMode,
    technique: 'stockinette',
    emit: (ctx) => {
      const input = ctx.input;
      ctx.appendWalkResult(emitStockinetteWalk({
        projection: input.projection,
        carrier: input.patternCarrier,
        needleStart: input.needleStart,
        handoff: handoffFor(ctx),
        cableEvents: input.cableEvents,
        shiftEvents: input.shiftEvents,
        rowRackSchedule: input.rowRackSchedule,
        rowStitchSchedule: input.rowStitchSchedule,
        bodyStitchNumber: input.bodyStitchNumber,
        rowPauseSet: input.rowPauseSet,
        firstRowSpeedOverride: input.firstRowSpeedOverride,
        initialNextDirection: ctx.currentNextDirection(),
      }));
    },
  },
  {
    kind: 'shaped-within-row-color',
    matches: ({ patternCarrierCount, shapeMode, colorMode }) =>
      patternCarrierCount > 1 && shapeMode && colorMode === 'within-row-multicolor',
    technique: 'stockinette-shaped-jacquard',
    emit: (ctx) => {
      const input = ctx.input;
      for (const c of [...new Set(ctx.bindingMap.values())]) {
        bringInCarrierIfNeeded(ctx, c);
      }
      ctx.appendWalkResult(emitShapedStockinetteWalk({
        projection: input.walkerProjection,
        carrier: input.patternCarrier,
        colorBindings: ctx.bindingMap,
        backBedStyle: input.backBedStyle === 'birdseye'
          ? (input.dbjBackingStrategy === 'complement' && input.patternCarrierCount === 2
            ? 'complement'
            : 'birdseye')
          : 'none',
        needleStart: input.needleStart,
        handoff: handoffFor(ctx),
        annotations: input.annotations,
        rowRackSchedule: input.rowRackSchedule,
        cableEvents: input.cableEvents,
        shiftEvents: input.shiftEvents,
        firstRowSpeedOverride: input.firstRowSpeedOverride,
        initialNextDirection: ctx.currentNextDirection(),
      }));
      ctx.setFinalKnitCarrier(input.patternCarrier);
    },
  },
  {
    kind: 'shaped-row-stripes',
    matches: ({ patternCarrierCount, shapeMode, colorMode }) =>
      patternCarrierCount > 1 && shapeMode && colorMode !== undefined && colorMode !== 'within-row-multicolor',
    technique: 'stockinette-shaped-stripes',
    emit: emitRowStripeWalker,
  },
  {
    kind: 'nonshape-row-stripes',
    matches: ({ patternCarrierCount, shapeMode, colorMode }) =>
      patternCarrierCount > 1 && !shapeMode && colorMode === 'horizontal-stripes',
    technique: 'stockinette-shaped-stripes',
    emit: emitRowStripeWalker,
  },
  {
    kind: 'jacquard-floats',
    matches: ({ patternCarrierCount, shapeMode, backBedStyle }) =>
      patternCarrierCount > 1 && !shapeMode && backBedStyle === 'floats',
    technique: 'floats-jacquard',
    emit: (ctx) => {
      const input = ctx.input;
      ctx.appendWalkResult(emitJacquardFloatsWalk({
        resolved: input.resolved,
        bindings: ctx.bindingMap,
        needleStart: input.needleStart,
        handoff: handoffFor(ctx),
        initialNextDirection: ctx.currentNextDirection(),
        bodyAutoMovePresser: input.floatsBodyAutoMovePresser,
        firstRowSpeedOverride: input.firstRowSpeedOverride,
      }));
    },
  },
  {
    kind: 'jacquard-dbj-full',
    matches: ({ patternCarrierCount, shapeMode, backBedStyle, dbjBackingStrategy }) =>
      patternCarrierCount > 1 && !shapeMode && backBedStyle === 'birdseye' && dbjBackingStrategy === 'full',
    technique: 'lined-jacquard',
    emit: (ctx) => {
      const input = ctx.input;
      ctx.appendWalkResult(emitJacquardDbjFullWalk({
        resolved: input.resolved,
        bindings: ctx.bindingMap,
        needleStart: input.needleStart,
        handoff: handoffFor(ctx),
        wasteCarrier: '6',
        firstRowSpeedOverride: input.firstRowSpeedOverride,
        initialNextDirection: ctx.currentNextDirection(),
      }));
      ctx.setFinalKnitCarrier('4');
    },
  },
  {
    kind: 'jacquard-complement',
    matches: ({ patternCarrierCount, shapeMode, backBedStyle, dbjBackingStrategy }) =>
      patternCarrierCount === 2 && !shapeMode && backBedStyle === 'birdseye'
      && dbjBackingStrategy === 'complement',
    technique: 'complement-jacquard',
    emit: (ctx) => {
      const input = ctx.input;
      ctx.appendWalkResult(emitJacquardComplementWalk({
        resolved: input.resolved,
        bindings: ctx.bindingMap,
        needleStart: input.needleStart,
        handoff: handoffFor(ctx),
        firstRowSpeedOverride: input.firstRowSpeedOverride,
        initialNextDirection: ctx.currentNextDirection(),
      }));
    },
  },
  {
    kind: 'jacquard-birdseye',
    matches: ({ patternCarrierCount, shapeMode, backBedStyle }) =>
      patternCarrierCount > 1 && !shapeMode && backBedStyle === 'birdseye',
    technique: 'birdseye-jacquard',
    emit: (ctx) => {
      const input = ctx.input;
      const dbjAnnotation = input.annotations.find(a => a.kind === 'dbj-backing');
      const annotated = dbjAnnotation?.kind === 'dbj-backing'
        ? (dbjAnnotation.dbjStrategy ?? 'birdseye')
        : 'birdseye';
      // 'complement' is a dedicated two-color walker (matched above when
      // patternCarrierCount === 2). Reaching the birdseye record with a
      // 'complement' annotation means a 3+-color chart asked for it —
      // inverse-image lining is undefined for >2 colors, so fall back to
      // birdseye stippling (still float-free).
      const strategy = annotated === 'complement' ? 'birdseye' : annotated;
      ctx.appendWalkResult(emitJacquardBirdseyeWalk({
        resolved: input.resolved,
        bindings: ctx.bindingMap,
        needleStart: input.needleStart,
        handoff: handoffFor(ctx),
        mode: input.birdseyeMode ?? 'full',
        strategy,
        firstRowSpeedOverride: input.firstRowSpeedOverride,
        initialNextDirection: ctx.currentNextDirection(),
      }));
    },
  },
  {
    kind: 'jacquard-ladder',
    matches: ({ patternCarrierCount, shapeMode }) => patternCarrierCount > 1 && !shapeMode,
    technique: 'ladder-jacquard',
    linedBackFallsBack: ({ backBedStyle }) => backBedStyle === 'lined',
    emit: (ctx) => {
      const input = ctx.input;
      if (selectedRecord(ctx.input).linedBackFallsBack?.(ctx.input)) {
        ctx.messages.push({
          severity: 'warning',
          rule: 'lined-back-not-implemented',
          message: `'lined' back-bed style is deferred — the implementation is not yet a correct jacquard model. Falling back to ladder back; floats up to N-1 chart rows long may appear (N = color count). Use 'birdseye' for the float-free option.`,
        });
      }
      ctx.appendWalkResult(emitJacquardLadderWalk({
        resolved: input.resolved,
        bindings: ctx.bindingMap,
        ladderCycle: [...input.patternCarriers].sort(),
        needleStart: input.needleStart,
        handoff: handoffFor(ctx),
        firstRowSpeedOverride: input.firstRowSpeedOverride,
        initialNextDirection: ctx.currentNextDirection(),
      }));
    },
  },
];

export function chooseChartBodyWalkerDispatch(
  input: ChooseChartBodyWalkerDispatchInput,
): ChartBodyWalkerDispatch {
  const record = selectedRecord(input);
  return {
    kind: record.kind,
    technique: record.technique,
    linedBackFallsBack: record.linedBackFallsBack?.(input) ?? false,
  };
}

export function registeredChartBodyWalkerDispatchKinds(): readonly ChartBodyWalkerDispatchKind[] {
  return CHART_BODY_WALKER_RECORDS.map((record) => record.kind);
}

export function emitChartBodyWalker(input: EmitChartBodyWalkerInput): EmitChartBodyWalkerResult {
  const record = selectedRecord(input);
  const ops: KnitoutOp[] = [];
  const predictedPasses: PredictedPass[] = [];
  const messages: ValidationMessage[] = [];
  let threadedNextDirection = input.initialNextDirection;
  let bindOffNeedleStart = input.needleStart;
  let bindOffNeedleEnd = input.needleEnd;
  let finalKnitCarrier: CarrierId = input.patternCarrier;
  let finalCarrierStates: ReadonlyMap<CarrierId, CarrierSimState> = new Map();
  const bindingMap = new Map<string, CarrierId>();
  for (const yb of input.yarnBindings) bindingMap.set(yb.keyId, yb.carrier);

  const ctx: ChartBodyWalkerContext = {
    input,
    bindingMap,
    handoff: input.handoff,
    ops,
    predictedPasses,
    messages,
    appendWalkResult: (result) => {
      // Append element-by-element rather than `push(...result.ops)`: a body
      // walk for a large chart (e.g. a high-resolution placed image) can
      // produce hundreds of thousands of ops, and spreading that many
      // arguments overflows the call stack ("Maximum call stack size
      // exceeded"). The loop is O(n) and stack-safe.
      for (const op of result.ops) ops.push(op);
      for (const pass of result.predictedPasses) predictedPasses.push(pass);
      threadedNextDirection = result.finalNextDirection;
      if (result.finalNeedleStart !== undefined) bindOffNeedleStart = result.finalNeedleStart;
      if (result.finalNeedleEnd !== undefined) bindOffNeedleEnd = result.finalNeedleEnd;
      if (result.finalCarrierStates) {
        finalCarrierStates = result.finalCarrierStates;
        ctx.handoff = simulatorHandoffFromBoundary({
          finalCarrierStates: result.finalCarrierStates,
        });
      }
    },
    setFinalKnitCarrier: (carrier) => {
      finalKnitCarrier = carrier;
    },
    currentNextDirection: () => threadedNextDirection,
  };

  record.emit(ctx);

  return {
    ops,
    predictedPasses,
    finalNextDirection: threadedNextDirection,
    bindOffNeedleStart,
    bindOffNeedleEnd,
    finalKnitCarrier,
    technique: record.technique,
    messages,
    finalCarrierStates,
  };
}

function selectedRecord(input: ChooseChartBodyWalkerDispatchInput): ChartBodyWalkerRecord {
  for (const record of CHART_BODY_WALKER_RECORDS) {
    if (record.matches(input)) return record;
  }

  throw new Error(
    `No chart body walker dispatch for carrierCount=${input.patternCarrierCount}, shapeMode=${String(input.shapeMode)}, colorMode=${input.colorMode ?? 'n/a'}, backBedStyle=${input.backBedStyle ?? 'default'}`,
  );
}

function emitRowStripeWalker(ctx: ChartBodyWalkerContext): void {
  const input = ctx.input;
  const colorAnalysis = requireColorAnalysis(input);
  const rowCarriers: Array<CarrierId | undefined> = colorAnalysis.rowColors.map(
    (color) => (color ? ctx.bindingMap.get(color) : undefined),
  );
  for (const c of new Set(rowCarriers.filter((c): c is CarrierId => Boolean(c)))) {
    bringInCarrierIfNeeded(ctx, c);
  }
  ctx.appendWalkResult(emitShapedStockinetteWalk({
    projection: input.walkerProjection,
    carrier: input.patternCarrier,
    rowCarriers,
    needleStart: input.needleStart,
    handoff: handoffFor(ctx),
    annotations: input.annotations,
    rowRackSchedule: input.rowRackSchedule,
    cableEvents: input.cableEvents,
    shiftEvents: input.shiftEvents,
    firstRowSpeedOverride: input.firstRowSpeedOverride,
    initialNextDirection: ctx.currentNextDirection(),
  }));
  ctx.setFinalKnitCarrier(lastRowCarrier(rowCarriers) ?? input.patternCarrier);
}

function bringInCarrierIfNeeded(ctx: ChartBodyWalkerContext, carrier: CarrierId): void {
  const sim = new CarriageSimulator({
    carriers: ALL_KNITERATE_CARRIERS,
    initialNextDirection: ctx.currentNextDirection(),
  });
  seedActiveCarriersForBodyPrelude(sim, ctx.input, ctx.handoff);
  if (sim.positionOf(carrier)) return;
  sim.bringIn(carrier);
  ctx.ops.push(...sim.drainOps());
  ctx.handoff = simulatorHandoffFromBoundary({
    finalCarrierStates: sim.snapshot(),
  });
}

function handoffFor(ctx: ChartBodyWalkerContext) {
  return ctx.handoff;
}

function seedActiveCarriersForBodyPrelude(
  sim: CarriageSimulator,
  input: Pick<EmitChartBodyWalkerInput, 'needleStart' | 'needleEnd'>,
  handoff: SimulatorHandoff,
): void {
  for (const c of handoff.keys()) {
    seedSimulatorCarrierFromHandoff(sim, handoff, c, (side) => ({
      anchorNeedle: {
        bed: 'f',
        needle: side === 'left' ? input.needleStart : input.needleEnd,
      },
      anchorDirection: side === 'left' ? '-' : '+',
    }));
  }
}

function requireColorAnalysis(input: EmitChartBodyWalkerInput): ShapedColorModeResult {
  if (!input.colorAnalysis) {
    throw new Error(`Chart body walker dispatch ${selectedRecord(input).kind} requires color analysis`);
  }
  return input.colorAnalysis;
}

function lastRowCarrier(rowCarriers: ReadonlyArray<CarrierId | undefined>): CarrierId | undefined {
  for (let r = rowCarriers.length - 1; r >= 0; r--) {
    const c = rowCarriers[r];
    if (c) return c;
  }
  return undefined;
}
