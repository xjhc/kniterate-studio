/**
 * PatternProgram — the canonical input shape that goes into the compile
 * path. Both Track A (knitlab1 chart export) and Track B (garment-package
 * export) build a PatternProgram and feed it through the same compile
 * helpers (`compileExport` for the chart path; the package planner for
 * Track B).
 *
 * Phase 2 (2026-05-24): PatternProgram is now a production input, not
 * a test-only adapter. It carries everything `compileExport` needs to
 * derive engine state — recipe + yarns + structured overrides — so the
 * wizard panel can no longer call compile with a hand-built
 * `KniterateExportState`. The overrides field is the bridge that lets
 * the persisted `KniterateWizardConfig` flow into the compile path
 * intact; the derive step happens inside compile.
 *
 * Shape:
 *   - `chart: KnitlabChartState` — required for both tracks. Track A
 *     authors it directly; Track B derives it via
 *     `panelGridsFromPackage` / synthesize-panels and bundles it here.
 *   - `shape?: ShapeContract` — Track B only.
 *   - `recipe: MachineRecipe | null` — `null` represents a detached
 *     manual config; the compile path falls back to engine defaults +
 *     overrides.
 *   - `yarns: YarnAssignment[]` — keyId → carrier mapping.
 *   - `recipeOverrides: RecipeOverrides` — structured user overrides
 *     applied on top of the recipe baseline (or engine defaults when
 *     `recipe === null`).
 *
 * See docs/kniterate-wizard-completion-plan.md §Phase 2.
 */

import type { KnitlabChartState } from '../colorwork/knitlab1-contract.js'
import type { ShapeContract } from '../shape/types.js'
import type { CarrierMode } from './export-helpers.js'
import type { MachineRecipe } from './recipes/types.js'
import type { CarrierId, YarnBinding } from './types.js'
import type { RecipeOverrides, UserIntent } from './wizard-config.js'

/** Per-keyId yarn assignment. Mirrors the YarnBinding the engine
 *  consumes; the wizard adapts user-facing labels into this shape. */
export type YarnAssignment = YarnBinding

export interface PatternProgram {
  /** The chart to compile. Required for both tracks. */
  chart: KnitlabChartState
  /** Optional structural projection of the garment package. Present
   *  for Track B; absent for Track A. */
  shape?: ShapeContract
  /** The active MachineRecipe, or `null` for a detached manual
   *  config. The compile path uses this to compute the recipe
   *  baseline before applying overrides. */
  recipe: MachineRecipe | null
  /** keyId → carrier assignment. Chart-driven; not part of any
   *  recipe's projection. */
  yarns: readonly YarnAssignment[]
  /** Carrier allocation mode. Chart-driven (derived from the chart's
   *  unique-color count) but the user can override via the "Default
   *  (1-4)" / "Experimental (5-6)" toggle. Phase 2 (2026-05-24)
   *  surfaced this on PatternProgram so 5+-color charts no longer
   *  fail the safe-default cap during compile. */
  allocationMode: CarrierMode
  /** Optional needle-offset override for the bed alignment. */
  needleOffset?: number
  /** Default-on first-body-row speed protection; explicit false opts out. */
  protectFirstBodyRow?: boolean
  /** Whether the user has confirmed a swatch in this yarn at this
   *  stitch number. Surfaces in the tech pack as gauge provenance. */
  swatchConfirmed?: boolean
  /** User overrides applied on top of the recipe baseline (or engine
   *  defaults when `recipe === null`). Carries the structured intent
   *  from `KniterateWizardConfig.recipeOverrides`. */
  recipeOverrides: RecipeOverrides
  /** Density + speed slider state from the wizard's Feel screen. The
   *  compile path applies this via `applyUserIntent` between the recipe
   *  baseline and `recipeOverrides`. Omitted → `{ density: 0, speed: 0 }`
   *  (i.e. recipe defaults). */
  userIntent?: UserIntent
}

/** Convenience: build a PatternProgram for Track A (knitlab1 chart
 *  export). The wizard panel calls this for each source chart sharing
 *  one recipe + yarns + overrides. */
export function trackAPatternProgram(input: {
  chart: KnitlabChartState
  recipe: MachineRecipe | null
  yarns: readonly YarnAssignment[]
  allocationMode: CarrierMode
  needleOffset?: number
  protectFirstBodyRow?: boolean
  swatchConfirmed?: boolean
  recipeOverrides: RecipeOverrides
  userIntent?: UserIntent
}): PatternProgram {
  return {
    chart: input.chart,
    recipe: input.recipe,
    yarns: input.yarns,
    allocationMode: input.allocationMode,
    needleOffset: input.needleOffset,
    protectFirstBodyRow: input.protectFirstBodyRow,
    swatchConfirmed: input.swatchConfirmed,
    recipeOverrides: input.recipeOverrides,
    userIntent: input.userIntent,
  }
}

/** Convenience: build a PatternProgram for Track B (garment-package
 *  export). Caller is responsible for synthesizing the chart from the
 *  package before compile; the PatternProgram carries the synthesized
 *  chart so the compile pipeline treats it uniformly with Track A. */
export function trackBPatternProgram(input: {
  shape: ShapeContract
  chart: KnitlabChartState
  recipe: MachineRecipe | null
  yarns: readonly YarnAssignment[]
  allocationMode: CarrierMode
  needleOffset?: number
  protectFirstBodyRow?: boolean
  swatchConfirmed?: boolean
  recipeOverrides: RecipeOverrides
  userIntent?: UserIntent
}): PatternProgram {
  return {
    shape: input.shape,
    chart: input.chart,
    recipe: input.recipe,
    yarns: input.yarns,
    allocationMode: input.allocationMode,
    needleOffset: input.needleOffset,
    protectFirstBodyRow: input.protectFirstBodyRow,
    swatchConfirmed: input.swatchConfirmed,
    recipeOverrides: input.recipeOverrides,
    userIntent: input.userIntent,
  }
}

/** Type guard for selecting Track A vs Track B in the wizard shell. */
export function isTrackA(program: PatternProgram): boolean {
  return program.shape === undefined
}

export function isTrackB(program: PatternProgram): boolean {
  return program.shape !== undefined
}

/** Mint a default YarnAssignment list from the recipe's swatch + a list
 *  of keyIds. Wizard uses this when the user picks a recipe; the
 *  assignment can be further tweaked.
 *
 *  P3.2 #3 (2026-05-23): respect carrier reservations. The recipe's
 *  `start.wasteCarrier` and `start.drawCarrier` are excluded from the
 *  pattern allocation pool so pattern yarns never collide with the
 *  waste/draw slots. `'none'` for draw means no reservation.
 */
export function defaultYarnsForRecipe(
  keyIds: readonly string[],
  recipe: MachineRecipe,
): YarnAssignment[] {
  const reserved = new Set<CarrierId>()
  reserved.add(recipe.sections.start.wasteCarrier)
  if (recipe.sections.start.drawCarrier !== 'none') {
    reserved.add(recipe.sections.start.drawCarrier)
  }
  const slots = recipe.swatch.machine.carrierSlots.filter(c => !reserved.has(c))
  return keyIds.slice(0, slots.length).map((keyId, i) => ({
    keyId,
    carrier: slots[i] as CarrierId,
    name: keyId,
  }))
}
