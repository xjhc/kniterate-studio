/**
 * Track A entry point — compile a knitlab1 chart to a KnitoutProgram.
 *
 * As of B1.0a, this function is a thin shim: chart → KniteratePlan →
 * KnitoutProgram. The plan is the load-bearing IR; this function
 * preserves the original signature for backward compatibility but
 * surfaces the plan through `result.plan` so newer callers (wizard,
 * notes generator) can read it directly.
 *
 * Pipeline:
 *   chart + bindings + machine settings
 *     → compileChartToKniteratePlan  (plan builder; validates chart)
 *     → compilePlanToKnitout         (flatten passes into program ops)
 *     → validateKnitoutProgram       (op-level invariants)
 *     → CompileResult
 *
 * Pure: given the same input, produces the same KnitoutProgram bytewise.
 */

import {
  type KnitlabChartState,
  type KnitlabKeyDefinition,
} from '../../colorwork/knitlab1-contract.js';
import {
  validateKnitoutProgram,
  type ValidationMessage,
} from '../../validators/knitout-program.js';
import { validateBedState } from '../../validators/bed-state.js';
import { compileChartToKniteratePlan } from '../plan/compile-chart.js';
import { dispatchCustomOpChart } from './custom-op-charts.js';
import { compilePlanToKnitout } from '../plan/plan-to-knitout.js';
import type { KniteratePlan } from '../plan/types.js';
import type { BindOffStyle } from '../passes/bind-off.js';
import {
  type KniterateExtensionHeaders,
  type KnitoutProgram,
  type Position,
  type StitchType,
  type YarnBinding,
} from '../types.js';

export interface CompileChartInput {
  chart: KnitlabChartState;
  keyPalette: KnitlabKeyDefinition[];
  /** keyId → yarn binding. */
  yarnBindings: YarnBinding[];
  /** First needle on the bed where the chart starts. */
  needleOffset?: number;
  /** Number of waste rows. Default 20. */
  wastePasses?: number;
  /** Machine settings, fully overridable. */
  kniterate?: Partial<KniterateExtensionHeaders>;
  /** Gauge for the ;;Gauge: header. Default 7. */
  gauge?: number;
  /** Position header. Default Center. */
  position?: Position;
  /** Explicit 6-color experimental opt-in. Default false. */
  experimental6ColorMode?: boolean;
  /** Bind-off style. Default 'waste-and-drop' for safety. */
  bindOff?: BindOffStyle;
  /** Per-pass machine settings for `bindOff: 'machine-bindoff'`. Forwarded
   *  to `emitMachineBindOff`; see `BindOffMachineConfig`. */
  bindOffMachineConfig?: Partial<{
    xferSpeed: number;
    xferStitch: number;
    knitSpeed: number;
    knitStitch: number;
    knitRollerRamp: number[];
  }>;
  /** Per-pass machine settings for `bindOff: 'fairisle-park-bindoff'`.
   *  Forwarded to `emitFairisleParkBindoff`; see `FairisleParkConfig`. */
  fairisleParkConfig?: Partial<{
    closingWasteCarrier: import('../types.js').CarrierId;
    closingWasteSpeed: number;
    closingWasteRoller: number;
    closingWasteStitchRamp: number[];
    parkSpeed: number;
    parkRoller: number;
    parkStitch: number;
    parkAutoMoveSpeed: number;
    parkAutoMoveRoller: number;
  }>;
  /** Carrier override for the waste yarn. When set, replaces the default
   *  C6 (or experimental-mode selection). */
  wasteCarrierOverride?: import('../types.js').CarrierId;
  /** Draw thread carrier override. `'none'` skips the draw-thread row
   *  (matches the fairisle no-separator cast-on). */
  drawCarrierOverride?: import('../types.js').CarrierId | 'none';
  /** Per-pass machine settings for the waste section. See
   *  `WasteMachineConfig`. */
  wasteMachineConfig?: Partial<{
    stitchNumber: number;
    castOnSpeed: number;
    castOnRoller: number;
    castOnPasses: number;
    castOnTuckPasses: number;
    castOnTuckSpeed: number;
    castOnTuckRoller: number;
    wasteSpeed: number;
    flatRollerPasses: number;
    rampRollerLeft: number;
    rampRollerRight: number;
    castOnFirstBed: 'front' | 'back';
    edgeInertNeedles: number;
  }>;
  /** Wrap-up draw-thread row + carrier release. Default true. */
  releaseCarriersAtEnd?: boolean;
  /** Back-bed scheme for multi-color charts.
   *  - `'ladder'` / `'birdseye'` / `'lined'`: see compile-chart.ts.
   *  - `'floats'`: front-bed only, no back-bed knit. Classic stranded
   *     fairisle. Matches the fairisle parity recipe's `.kc` fairisle body style. */
  backBedStyle?: 'ladder' | 'lined' | 'birdseye' | 'floats';
  /** Birdseye-specific knob — 'minimal' or 'full'. Default 'minimal'. */
  birdseyeMode?: 'minimal' | 'full';
  /** Phase 3 (2026-05-23): Fairisle carrier intro + stitch ramp.
   *  When set + `backBedStyle === 'floats'`, the compiler emits per-carrier
   *  intro passes and a STIF ramp at body entry — matches rows 86-107 of
   *  `reference/fairisle.kc`. Pass `true` for defaults or a partial to
   *  override. */
  fairisleCarrierIntro?: boolean | Partial<{
    introSpeed: number;
    introRoller: number;
    introStitch: number;
    rampStitches: number[];
    rampRoller: number;
    rampSpeed: number;
    cameoCarriers: readonly import('../types.js').CarrierId[];
  }>;
  /** Slow the first actual body row after cast-on, then restore body
   *  speed for row 1+. Default true. */
  protectFirstBodyRow?: boolean;
  /** Per-cell stitch type overrides. */
  stitchBindings?: Map<string, StitchType>;
  /** P1.3 (2026-05-23): developer-mode capability. Required to compile
   *  with `bindOff: 'drop'` — that style intentionally drops live loops
   *  off the bed and is for test swatches only, not production output.
   *  Off by default; the wizard does not expose it. Surface via the
   *  app's existing dev-tools layer (D3 in the rearchitecture plan). */
  developerMode?: boolean;
  /** P3.2 G2 (2026-05-23): per-recipe front-bed float-ceiling policy.
   *  Forwarded to `validateBedState`. When `mode === 'reject-above'`,
   *  exceeding `threshold` becomes a hard error; default is warn at 5.
   *  Recipes populate this from `recipe.validation.floats`. */
  floatPolicy?: import('../plan/bed-state.js').FloatPolicy;
}

export interface CompileChartResult {
  ok: boolean;
  program?: KnitoutProgram;
  /**
   * Direct Kniterate `.kc` text from a custom op that bypasses the vendor
   * transfer scheduler (see `CustomOpChartResult.kcText`). Propagated to the
   * export wizard, which packages it verbatim instead of running `program`
   * through `knitout-to-kcode`. Mutually exclusive with the vendor-lowered
   * `program` path.
   */
  kcText?: string;
  plan?: KniteratePlan;
  messages: ValidationMessage[];
  /**
   * B2a follow-up (2026-05-20): cable events extracted from the source
   * chart, surfaced at the result level so downstream consumers (tech
   * pack, future B2b lowering) can read them even when compile fails
   * with `track-a-cable-unsupported`. Empty array when the chart has no
   * `cableSpan`-marked tiles.
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

export function compileChartToKnitout(input: CompileChartInput): CompileChartResult {
  // Custom-op symbol-key charts (i-cord, shaped tube, …) have no
  // background fabric — the painted symbols ARE the design. Route them to
  // their dedicated emitter instead of the stockinette walker. Pass the
  // full bindings (so the op knits on its own key's carrier) and the
  // wizard machine settings (stitch number / speed / roller).
  const custom = dispatchCustomOpChart({
    chart: input.chart,
    keyPalette: input.keyPalette,
    yarnBindings: input.yarnBindings,
    ...(input.kniterate !== undefined ? { kniterate: input.kniterate } : {}),
    ...(input.needleOffset !== undefined ? { needleOffset: input.needleOffset } : {}),
    ...(input.gauge !== undefined ? { gauge: input.gauge } : {}),
  });
  if (custom) {
    // The custom-op path skips the plan/bed-state pipeline, but its program
    // must still clear op-level validation before reaching the machine.
    const programReport = custom.program
      ? validateKnitoutProgram(custom.program)
      : undefined;
    return {
      ok: custom.ok && (programReport?.errorCount ?? 0) === 0,
      ...(custom.program ? { program: custom.program } : {}),
      // A direct-.kc artifact has no KnitoutProgram to validate; it bypasses
      // the vendor and is packaged verbatim by the export wizard (Step 4).
      ...(custom.kcText !== undefined ? { kcText: custom.kcText } : {}),
      messages: programReport
        ? [...custom.messages, ...programReport.messages]
        : custom.messages,
    };
  }

  const planResult = compileChartToKniteratePlan(input);
  // B2a follow-up: always pass through cable events, even on failure paths.
  const cableEventsField = planResult.cableEvents
    ? { cableEvents: planResult.cableEvents }
    : {};
  if (!planResult.ok || planResult.plan === undefined) {
    return { ok: false, messages: planResult.messages, ...cableEventsField };
  }

  const plan = planResult.plan;
  const program = compilePlanToKnitout(plan);

  // Op-level validation + bed-state simulator gating (B1.0b).
  const programReport = validateKnitoutProgram(program);
  const bedReport = validateBedState(plan, { floatPolicy: input.floatPolicy });
  const messages = [
    ...planResult.messages,
    ...programReport.messages,
    ...bedReport.messages,
  ];

  return {
    ok: programReport.errorCount === 0 && bedReport.errorCount === 0,
    program,
    plan,
    messages,
    ...cableEventsField,
  };
}
