/**
 * Phase 1 Slice A — canonical wizard config + derivation.
 *
 * The Kniterate export wizard persists user *intent*, not engine
 * input. Intent is:
 *   - which recipe (if any) provides the baseline,
 *   - which yarns sit on which carriers (chart-driven),
 *   - which scalar overrides + optional-section clears the user has
 *     applied on top of the recipe.
 *
 * `deriveKniterateExportState(config, recipe)` turns that intent into
 * a `KniterateExportState` that the engine consumes. The derivation
 * order is recipe-projection → userIntent → overrides → chart-driven
 * stamp. That ordering is the contract: a recipe pick is destructive
 * of stale optional sections; userIntent shifts the recipe-projected
 * state on the slider axes; explicit overrides win over both (so the
 * advanced disclosure bypasses the slider per the UX plan);
 * chart-driven fields (yarn bindings, needleOffset) always win.
 *
 * See docs/kniterate-wizard-completion-plan.md §Phase 1 for the
 * larger context. Slice B will wire the wizard UI through this
 * derivation and migrate persisted blobs at the boundary.
 */

import {
  DEFAULT_KNITERATE_EXPORT_STATE,
  KNITERATE_EXPORT_STATE_SCHEMA_VERSION,
  applyMachineRecipe,
  autoAssignBindings,
  carrierModeForColorCount,
  carriersForMode,
  uniqueYarnKeysInChart,
  type CarrierMode,
  type KniterateExportState,
} from './export-helpers.js'
import type {
  KnitlabChartState,
  KnitlabKeyDefinition,
} from '../colorwork/knitlab1-contract.js'
import type { MachineRecipe } from './recipes/types.js'
import type { ColorMerge } from './color-merge.js'
import type { RowTensionBlock } from './row-tension-blocks.js'
import type { BindOffStyle } from './passes/bind-off.js'
import type { CarrierId, YarnBinding } from './types.js'
import { structuralEq } from './recipes/recipe-fingerprint.js'

/** Current persisted schema version for `KniterateWizardConfig`. */
export const KNITERATE_WIZARD_CONFIG_SCHEMA_VERSION = 2 as const

/**
 * Screen 3 (Fabric Feel) slider values. Both are integer-snapped on the
 * UI (-2..+2); the type is `number` so an unclamped slider drag can be
 * stored mid-transition. `applyUserIntent` is responsible for the
 * concrete mapping to engine settings; the curve is intentionally
 * wizard-local pre-schema.
 *
 * Sign convention:
 *   - `density > 0` → tighter fabric (smaller cam → smaller loops on
 *     Kniterate). +1 step = stitch number −1, roller advance +50.
 *   - `speed > 0` → faster carriage. +1 step = speed number +50.
 *   - `0` means "recipe default" on both axes (identity).
 */
export interface UserIntent {
  density: number
  speed: number
}

export const DEFAULT_USER_INTENT: UserIntent = { density: 0, speed: 0 }

/** Slider domain — matches the 5-stop FabricFeelSlider in
 *  KniterateWizardShell (`-midIndex..stops-1-midIndex` with stops=5).
 *  Persisted blobs and programmatic patches are clamped to this range
 *  via `clampUserIntent` so a hand-edited or malformed config can't
 *  push linear shifts (stitch number, roller, speed) into nonsense. */
export const USER_INTENT_MIN = -2
export const USER_INTENT_MAX = 2

const DENSITY_STEP_STITCH = 1
const DENSITY_STEP_ROLLER = 50
const SPEED_STEP_SPEED = 50

function clampStep(value: number): number {
  if (!Number.isFinite(value)) return 0
  const rounded = Math.round(value)
  if (rounded < USER_INTENT_MIN) return USER_INTENT_MIN
  if (rounded > USER_INTENT_MAX) return USER_INTENT_MAX
  return rounded
}

/** Round to integer and clamp to [USER_INTENT_MIN, USER_INTENT_MAX].
 *  Non-finite (NaN, ±Infinity) coerces to 0 — same convention as
 *  `parseUserIntent`'s missing-field fallback. */
export function clampUserIntent(intent: UserIntent): UserIntent {
  return {
    density: clampStep(intent.density),
    speed: clampStep(intent.speed),
  }
}

/**
 * Recipe-scoped override patches. Each group mirrors the projection
 * groups in `applyMachineRecipe` (body / start / finish /
 * extensionHeaders) so reasoning about "what does the user want
 * different from the recipe" stays local.
 *
 * Convention for optional sub-objects (e.g. `fairisleCarrierIntro`):
 *   - `undefined`/absent → use the recipe's value
 *   - explicit value → override with that value
 *   - `null` → CLEAR the recipe's value (derived state: undefined)
 *
 * For required scalars (e.g. `stitchNumber`), only present/absent
 * matter — `null` is not meaningful and is not permitted by the type.
 */
export interface RecipeOverrides {
  body?: {
    stitchNumber?: number
    speedNumber?: number
    rollerAdvance?: number
    xferStitchNumber?: number
    backBedStyle?: KniterateExportState['backBedStyle']
    /** Pass `null` to clear (derived state will omit `birdseyeMode`). */
    birdseyeMode?: KniterateExportState['birdseyeMode'] | null
  }
  start?: {
    wastePasses?: number
    /** Pass `null` to clear the recipe's waste-carrier override. */
    wasteCarrierOverride?: CarrierId | null
    /** Pass `null` to clear the recipe's draw-carrier override. */
    drawCarrierOverride?: CarrierId | 'none' | null
    /** Pass `null` to clear the recipe's waste-machine config. */
    wasteMachineConfig?: KniterateExportState['wasteMachineConfig'] | null
    /** Pass `null` to clear the recipe's carrier-intro. */
    fairisleCarrierIntro?: KniterateExportState['fairisleCarrierIntro'] | null
  }
  finish?: {
    bindOff?: BindOffStyle
    /** Pass `null` to clear the recipe's chain-bindoff config. */
    bindOffMachineConfig?: KniterateExportState['bindOffMachineConfig'] | null
    /** Pass `null` to clear the recipe's fairisle-park config. */
    fairisleParkConfig?: KniterateExportState['fairisleParkConfig'] | null
  }
  /** Pass `null` to clear the recipe's extension-header overrides. */
  extensionHeaders?: KniterateExportState['extensionHeaderOverrides'] | null
}

/** One section of the Screen-3 calibration swatch: a stitch number knit
 *  for `rows` rows. The swatch knits these sections bottom-to-top so the
 *  knitter can compare densities on one piece. Swatch-only — does NOT
 *  affect the garment-body compile (which uses a single stitchNumber). */
export interface SwatchTensionBand {
  /** Machine stitch number for this section. Integer 1–35 (the machine
   *  token domain is 0–35; 0 is excluded as a meaningless body tension). */
  stitchNumber: number
  /** Rows knit at this stitch number. Positive integer. */
  rows: number
}

/**
 * Persisted wizard config — the user's intent. Engine input
 * (`KniterateExportState`) is derived from this via
 * `deriveKniterateExportState`.
 */
export interface KniterateWizardConfig {
  readonly schemaVersion: typeof KNITERATE_WIZARD_CONFIG_SCHEMA_VERSION
  /** Selected recipe id, or `null` for a detached/manual config. */
  recipeId: string | null
  /** Yarn → carrier bindings. Chart-driven; preserved across recipe
   *  changes. */
  yarns: readonly YarnBinding[]
  /** Export-only color aliases. Each entry means "treat fromKeyId as
   *  toKeyId for this machine export" without mutating the source chart. */
  colorMerges?: readonly ColorMerge[]
  /** Export-only row tension blocks. These become generated
   *  `stitch-number` row annotations on the chart copy that is compiled,
   *  so they affect the downloaded machine file without mutating the
   *  source chart. */
  rowTensionBlocks?: readonly RowTensionBlock[]
  allocationMode: CarrierMode
  needleOffset?: number
  /** Default-on Kniterate safety guard. Missing means enabled for older
   *  saved configs; explicit false opts out. */
  protectFirstBodyRow?: boolean
  swatchConfirmed?: boolean
  /** Overrides applied on top of the recipe (or on top of base
   *  defaults when `recipeId === null`). */
  recipeOverrides: RecipeOverrides
  /** Screen 3 sliders. Optional with `{density:0, speed:0}` default so
   *  V2 blobs predating this field migrate to a no-op userIntent. */
  userIntent?: UserIntent
  /** Per-section tension bands for the Screen-3 calibration swatch.
   *  Absent → `deriveSwatchBands` auto-derives [center-1, center,
   *  center+1] around the effective density. Swatch-only; read by
   *  `src/knitout/swatch/tension-swatch-chart.ts`. */
  swatch?: { tensionBands: SwatchTensionBand[] }
}

export const DEFAULT_KNITERATE_WIZARD_CONFIG: KniterateWizardConfig = {
  schemaVersion: KNITERATE_WIZARD_CONFIG_SCHEMA_VERSION,
  recipeId: null,
  yarns: [],
  colorMerges: [],
  rowTensionBlocks: [],
  allocationMode: 'default',
  needleOffset: undefined,
  protectFirstBodyRow: true,
  swatchConfirmed: undefined,
  recipeOverrides: {},
  userIntent: DEFAULT_USER_INTENT,
}

/** Returns true if any override field is present. UI uses this to
 *  decide whether to show the "modified from <recipe>" badge. */
export function hasOverrides(overrides: RecipeOverrides): boolean {
  if (overrides.body && Object.keys(overrides.body).length > 0) return true
  if (overrides.start && Object.keys(overrides.start).length > 0) return true
  if (overrides.finish && Object.keys(overrides.finish).length > 0) return true
  if (overrides.extensionHeaders !== undefined) return true
  return false
}

/**
 * Derive the engine input from the persisted config.
 *
 * Order:
 *   1. Base = `applyMachineRecipe(DEFAULT_KNITERATE_EXPORT_STATE, recipe)`
 *      when `recipe` is non-null, else a clone of the engine defaults.
 *   2. Overrides applied on top.
 *   3. Chart-driven fields (yarns → bindings, allocationMode →
 *      carrierMode, needleOffset, swatchConfirmed) stamped from config.
 *
 * Callers resolve `config.recipeId` against the registry themselves;
 * we take the recipe object explicitly so this function has no
 * registry dependency and stays trivially testable.
 */
export function deriveKniterateExportState(
  config: KniterateWizardConfig,
  recipe: MachineRecipe | null,
): KniterateExportState {
  const base: KniterateExportState = recipe
    ? applyMachineRecipe(DEFAULT_KNITERATE_EXPORT_STATE, recipe)
    : { ...DEFAULT_KNITERATE_EXPORT_STATE }

  // Order: recipe → userIntent → overrides. Explicit overrides win over
  // both, which is the contract Screen 3's "override bypasses the
  // slider" UX is built on.
  const withIntent = applyUserIntent(base, config.userIntent ?? DEFAULT_USER_INTENT)
  const withOverrides = applyRecipeOverrides(withIntent, config.recipeOverrides)

  return {
    ...withOverrides,
    bindings: [...config.yarns],
    carrierMode: config.allocationMode,
    needleOffset: config.needleOffset,
    protectFirstBodyRow: config.protectFirstBodyRow !== false,
    swatchConfirmed: config.swatchConfirmed,
    schemaVersion: KNITERATE_EXPORT_STATE_SCHEMA_VERSION,
  }
}

/** Project a `KniterateExportState` into a `RecipeOverrides` patch
 *  such that `deriveKniterateExportState({...config, recipeOverrides:
 *  foldStateToOverrides(state, baseline)}, recipe)` reproduces
 *  `state`'s recipe-projected fields, where `baseline` is the value
 *  derive starts from (engine defaults when `recipe === null`, or
 *  `applyMachineRecipe(DEFAULT, recipe)` when set).
 *
 *  Used by two callers: (a) the migration boundary folds a legacy
 *  `KniterateExportState` against `DEFAULT_KNITERATE_EXPORT_STATE` so
 *  detached configs derive back to the same engine input; (b) the
 *  wizard's setState adapter folds an edited derived state against
 *  the active recipe's projection to compute the new overrides.
 *
 *  Fields equal to baseline are omitted; fields where baseline has a
 *  value but the state's is undefined emit a `null` clear-override. */
export function foldStateToOverrides(
  state: KniterateExportState,
  baseline: KniterateExportState = DEFAULT_KNITERATE_EXPORT_STATE,
): RecipeOverrides {
  const D = baseline
  const overrides: RecipeOverrides = {}

  const body: NonNullable<RecipeOverrides['body']> = {}
  if (state.stitchNumber !== D.stitchNumber) body.stitchNumber = state.stitchNumber
  if (state.speedNumber !== D.speedNumber) body.speedNumber = state.speedNumber
  if (state.rollerAdvance !== D.rollerAdvance) body.rollerAdvance = state.rollerAdvance
  if (state.xferStitchNumber !== D.xferStitchNumber) body.xferStitchNumber = state.xferStitchNumber
  if (state.backBedStyle !== D.backBedStyle) body.backBedStyle = state.backBedStyle
  if (state.birdseyeMode !== D.birdseyeMode) {
    body.birdseyeMode = state.birdseyeMode ?? null
  }
  if (Object.keys(body).length > 0) overrides.body = body

  const start: NonNullable<RecipeOverrides['start']> = {}
  if (state.wastePasses !== D.wastePasses) start.wastePasses = state.wastePasses
  if (state.wasteCarrierOverride !== D.wasteCarrierOverride) {
    start.wasteCarrierOverride = state.wasteCarrierOverride ?? null
  }
  if (state.drawCarrierOverride !== D.drawCarrierOverride) {
    start.drawCarrierOverride = state.drawCarrierOverride ?? null
  }
  if (!structuralEq(state.wasteMachineConfig, D.wasteMachineConfig)) {
    start.wasteMachineConfig = state.wasteMachineConfig ?? null
  }
  if (!structuralEq(state.fairisleCarrierIntro, D.fairisleCarrierIntro)) {
    start.fairisleCarrierIntro = state.fairisleCarrierIntro ?? null
  }
  if (Object.keys(start).length > 0) overrides.start = start

  const finish: NonNullable<RecipeOverrides['finish']> = {}
  if (state.bindOff !== D.bindOff) finish.bindOff = state.bindOff
  if (!structuralEq(state.bindOffMachineConfig, D.bindOffMachineConfig)) {
    finish.bindOffMachineConfig = state.bindOffMachineConfig ?? null
  }
  if (!structuralEq(state.fairisleParkConfig, D.fairisleParkConfig)) {
    finish.fairisleParkConfig = state.fairisleParkConfig ?? null
  }
  if (Object.keys(finish).length > 0) overrides.finish = finish

  if (!structuralEq(state.extensionHeaderOverrides, D.extensionHeaderOverrides)) {
    overrides.extensionHeaders = state.extensionHeaderOverrides ?? null
  }

  return overrides
}

/** Adapter for the wizard's setState-style sub-panels. Takes the
 *  updated `KniterateExportState` produced by a sub-panel, splits its
 *  changes back into the canonical `KniterateWizardConfig` shape:
 *  chart-driven fields land directly on the config; recipe-projected
 *  fields are folded against the active recipe's baseline into
 *  `recipeOverrides`. The chart-driven split is what lets sub-panels
 *  keep their `setState`-style interface during the Slice B
 *  refactor; without it, every existing sub-panel would need a
 *  bespoke config-shaped writer. */
export function reconcileStateIntoConfig(
  nextState: KniterateExportState,
  config: KniterateWizardConfig,
  recipe: MachineRecipe | null,
): KniterateWizardConfig {
  const baseline = recipe
    ? applyMachineRecipe(DEFAULT_KNITERATE_EXPORT_STATE, recipe)
    : DEFAULT_KNITERATE_EXPORT_STATE
  // Fold against the post-userIntent baseline so a setState write that
  // didn't actually touch a slider-affected field doesn't snapshot the
  // slider's shift into recipeOverrides on the next pass.
  const foldBaseline = applyUserIntent(baseline, config.userIntent ?? DEFAULT_USER_INTENT)
  return {
    ...config,
    yarns: [...nextState.bindings],
    allocationMode: nextState.carrierMode,
    needleOffset: nextState.needleOffset,
    protectFirstBodyRow: nextState.protectFirstBodyRow,
    swatchConfirmed: nextState.swatchConfirmed,
    recipeOverrides: foldStateToOverrides(nextState, foldBaseline),
  }
}

/** Detach the active recipe while preserving the user's current
 *  derived settings as overrides. The resulting config has
 *  `recipeId: null` and `recipeOverrides` capturing every field that
 *  differed from the engine defaults (i.e., the recipe's
 *  contributions plus the user's prior overrides, collapsed into one
 *  set of overrides against the default baseline).
 *
 *  Decision 3 in docs/kniterate-wizard-completion-plan.md §Phase 1:
 *  the user's effective settings should not visibly shift when they
 *  click "Detach". */
export function detachRecipe(
  config: KniterateWizardConfig,
  recipe: MachineRecipe | null,
): KniterateWizardConfig {
  if (config.recipeId === null) return config
  const currentDerived = deriveKniterateExportState(config, recipe)
  return {
    ...config,
    recipeId: null,
    recipeOverrides: foldStateToOverrides(currentDerived, DEFAULT_KNITERATE_EXPORT_STATE),
  }
}

/** Reset overrides while keeping the active recipe selected. After
 *  this, the derived state matches the recipe's projection exactly. */
export function resetRecipeOverrides(
  config: KniterateWizardConfig,
): KniterateWizardConfig {
  return { ...config, recipeOverrides: {} }
}

/** Apply a recipe — set `recipeId` and clear overrides (Decision 1's
 *  "recipe picker sets recipeId and clears overrides by default"). */
export function applyRecipeToConfig(
  config: KniterateWizardConfig,
  recipeId: string,
): KniterateWizardConfig {
  return { ...config, recipeId, recipeOverrides: {} }
}

/** First-open auto-assign: derive the carrier mode from the chart's
 *  color count and stamp `yarns` + `allocationMode` accordingly.
 *  Called by `KniterateWizardShell` on first mount; previously also by
 *  the legacy `KniterateExportPanel` (deleted 2026-05-26). */
export function applyFirstOpenAutoAssign(
  config: KniterateWizardConfig,
  chart: KnitlabChartState,
  keyPalette: KnitlabKeyDefinition[],
): KniterateWizardConfig {
  const colorCount = uniqueYarnKeysInChart(chart, keyPalette).length
  const mode = carrierModeForColorCount(colorCount)
  return {
    ...config,
    yarns: autoAssignBindings(chart, keyPalette, mode),
    allocationMode: mode,
  }
}

function labelForYarnKey(keyId: string, keyPalette: KnitlabKeyDefinition[]): string {
  return keyPalette.find(key => key.id === keyId)?.name ?? keyId
}

export interface ReconcileChartYarnsOptions {
  /** Keep bindings whose key is not currently present in the chart.
   *  Package-export stripe flows use this to preserve deliberately-added
   *  stripe yarns; direct chart export leaves it false so the wizard stays
   *  honest to the visible export chart. */
  preserveExtraYarns?: boolean
}

/** Keep persisted yarn bindings aligned with the visible export chart.
 *
 * Unlike `applyFirstOpenAutoAssign`, this is not a destructive reset: it
 * preserves existing carrier/name choices for still-visible yarns, appends
 * newly-visible chart colors, and prunes stale chart-color bindings unless
 * the host explicitly opts into extra yarns. */
export function reconcileChartYarns(
  config: KniterateWizardConfig,
  chart: KnitlabChartState,
  keyPalette: KnitlabKeyDefinition[],
  options: ReconcileChartYarnsOptions = {},
): KniterateWizardConfig {
  const chartKeyIds = uniqueYarnKeysInChart(chart, keyPalette)
  const chartKeySet = new Set(chartKeyIds)
  let allocationMode = config.allocationMode
  if (chartKeyIds.length > carriersForMode(allocationMode).length) {
    allocationMode = carrierModeForColorCount(chartKeyIds.length)
  }

  const usedCarriers = new Set<CarrierId>()
  if (options.preserveExtraYarns) {
    for (const yarn of config.yarns) usedCarriers.add(yarn.carrier)
  }
  const nextYarns: YarnBinding[] = []
  const existingByKey = new Map<string, YarnBinding>()
  for (const yarn of config.yarns) {
    if (!existingByKey.has(yarn.keyId)) existingByKey.set(yarn.keyId, yarn)
  }

  for (const keyId of chartKeyIds) {
    const existing = existingByKey.get(keyId)
    if (existing) {
      nextYarns.push(existing)
      usedCarriers.add(existing.carrier)
      continue
    }
    let carrier = carriersForMode(allocationMode).find(candidate => !usedCarriers.has(candidate))
    if (!carrier && allocationMode === 'default') {
      allocationMode = 'experimental'
      carrier = carriersForMode(allocationMode).find(candidate => !usedCarriers.has(candidate))
    }
    if (!carrier) continue
    nextYarns.push({ keyId, carrier, name: labelForYarnKey(keyId, keyPalette) })
    usedCarriers.add(carrier)
  }

  if (options.preserveExtraYarns) {
    for (const yarn of config.yarns) {
      if (chartKeySet.has(yarn.keyId)) continue
      nextYarns.push(yarn)
      usedCarriers.add(yarn.carrier)
    }
    if (nextYarns.length > carriersForMode(allocationMode).length) {
      allocationMode = carrierModeForColorCount(nextYarns.length)
    }
  }

  if (allocationMode === config.allocationMode && structuralEq(nextYarns, config.yarns)) {
    return config
  }
  return { ...config, allocationMode, yarns: nextYarns }
}

/** Structural equality on wizard configs. The wizard shell's
 *  unmount-cleanup uses this to skip a no-op persist (and the undo-
 *  history entry it would create) when the user edits a field then
 *  edits it back — the references differ but the values match. */
export function kniterateWizardConfigsEqual(
  a: KniterateWizardConfig,
  b: KniterateWizardConfig,
): boolean {
  return structuralEq(a, b)
}

/** Fields whose change invalidates a prior swatch confirmation. The
 *  tech pack's §3 "gauge confirmed" badge claims the user has knit a
 *  swatch *at these settings*; changing the yarn, recipe, intent, or
 *  body machine knobs makes that claim stale, so we clear
 *  `swatchConfirmed` automatically rather than let a confirmed badge
 *  outlive the conditions it was measured under. */
function swatchInvalidatingChange(
  prev: KniterateWizardConfig,
  next: KniterateWizardConfig,
): boolean {
  if (!structuralEq(prev.yarns, next.yarns)) return true
  if (!structuralEq(prev.colorMerges ?? [], next.colorMerges ?? [])) return true
  if (!structuralEq(prev.rowTensionBlocks ?? [], next.rowTensionBlocks ?? [])) return true
  if (prev.recipeId !== next.recipeId) return true
  if (!structuralEq(prev.userIntent ?? DEFAULT_USER_INTENT, next.userIntent ?? DEFAULT_USER_INTENT)) {
    return true
  }
  if (!structuralEq(prev.recipeOverrides.body, next.recipeOverrides.body)) return true
  // Tension bands live outside recipeOverrides (swatch-only, no
  // export-state scalar to fold into), so they aren't covered by the
  // body check above — watch them explicitly or a band edit would let a
  // confirmed gauge badge outlive the densities it was measured at.
  if (!structuralEq(prev.swatch, next.swatch)) return true
  return false
}

/** Parse + clamp a raw `<input type="number">` value before writing it
 *  to a recipe override. The shell's `AdvancedField` calls this so the
 *  user can't paste / arrow / direct-type an override that the engine
 *  will reject at compile time (e.g. `wastePasses < 4` throws in
 *  `src/knitout/passes/waste-section.ts:174`).
 *
 *  Returns:
 *   - `null` when the raw input is empty or doesn't parse to a finite
 *     number — caller should treat as "no change."
 *   - The parsed integer otherwise, clamped up to `min` if provided.
 *
 *  Pure: `min`/`max` are optional clamp bounds. The swatch tension-band
 *  inputs pass `max: 35` (the machine's single-token stitch ceiling);
 *  most engine fields have only a floor. */
export function parseAdvancedFieldInput(
  rawText: string,
  min?: number,
  max?: number,
): number | null {
  const trimmed = rawText.trim()
  if (trimmed === '') return null
  const parsed = parseInt(trimmed, 10)
  if (!Number.isFinite(parsed)) return null
  let clamped = parsed
  if (min !== undefined && clamped < min) clamped = min
  if (max !== undefined && clamped > max) clamped = max
  return clamped
}

/** Clear `swatchConfirmed` if a swatch-relevant field changed between
 *  `prev` and `next`. Only invalidates an *active* confirmation
 *  (`prev.swatchConfirmed === true` AND `next.swatchConfirmed === true`)
 *  — explicit user toggles of the checkbox itself pass through
 *  untouched. Pure: the wizard shell wraps its `setWizardConfig`
 *  through this so every update path inherits the invalidation. */
export function applySwatchInvalidation(
  prev: KniterateWizardConfig,
  next: KniterateWizardConfig,
): KniterateWizardConfig {
  if (next.swatchConfirmed !== true) return next
  if (prev.swatchConfirmed !== true) return next
  if (!swatchInvalidatingChange(prev, next)) return next
  return { ...next, swatchConfirmed: undefined }
}

/**
 * Apply Screen 3's fabric-feel sliders to a recipe-projected state.
 * Runs BEFORE `applyRecipeOverrides` in `deriveKniterateExportState`,
 * so an explicit override (e.g. user typed a stitchNumber in the
 * advanced disclosure) clobbers the slider-shifted value on the same
 * field. That makes the override semantically "bypass the slider" per
 * the UX plan: typing 8 into stitch-number with density=+1 yields 8,
 * not 7.
 *
 * Pre-schema calibration table — `docs/kniterate-wizard-ux-redesign-plan.md`
 * §"State" for Screen 3. Post-schema this swaps to
 * `FabricResolverRegistry.resolveBodyDefaults(intent, ctx)`.
 */
export function applyUserIntent(
  state: KniterateExportState,
  intent: UserIntent,
): KniterateExportState {
  const { density, speed } = intent
  if (density === 0 && speed === 0) return state
  return {
    ...state,
    stitchNumber: state.stitchNumber - density * DENSITY_STEP_STITCH,
    rollerAdvance: state.rollerAdvance + density * DENSITY_STEP_ROLLER,
    xferStitchNumber: state.xferStitchNumber - density * DENSITY_STEP_STITCH,
    speedNumber: state.speedNumber + speed * SPEED_STEP_SPEED,
  }
}

function applyRecipeOverrides(
  base: KniterateExportState,
  overrides: RecipeOverrides,
): KniterateExportState {
  const out: KniterateExportState = { ...base }
  const body = overrides.body
  if (body) {
    if (body.stitchNumber !== undefined) out.stitchNumber = body.stitchNumber
    if (body.speedNumber !== undefined) out.speedNumber = body.speedNumber
    if (body.rollerAdvance !== undefined) out.rollerAdvance = body.rollerAdvance
    if (body.xferStitchNumber !== undefined) out.xferStitchNumber = body.xferStitchNumber
    if (body.backBedStyle !== undefined) out.backBedStyle = body.backBedStyle
    if (body.birdseyeMode !== undefined) {
      out.birdseyeMode = body.birdseyeMode === null ? undefined : body.birdseyeMode
    }
  }
  const start = overrides.start
  if (start) {
    if (start.wastePasses !== undefined) out.wastePasses = start.wastePasses
    if (start.wasteCarrierOverride !== undefined) {
      out.wasteCarrierOverride =
        start.wasteCarrierOverride === null ? undefined : start.wasteCarrierOverride
    }
    if (start.drawCarrierOverride !== undefined) {
      out.drawCarrierOverride =
        start.drawCarrierOverride === null ? undefined : start.drawCarrierOverride
    }
    if (start.wasteMachineConfig !== undefined) {
      out.wasteMachineConfig =
        start.wasteMachineConfig === null ? undefined : start.wasteMachineConfig
    }
    if (start.fairisleCarrierIntro !== undefined) {
      out.fairisleCarrierIntro =
        start.fairisleCarrierIntro === null ? undefined : start.fairisleCarrierIntro
    }
  }
  const finish = overrides.finish
  if (finish) {
    if (finish.bindOff !== undefined) out.bindOff = finish.bindOff
    if (finish.bindOffMachineConfig !== undefined) {
      out.bindOffMachineConfig =
        finish.bindOffMachineConfig === null ? undefined : finish.bindOffMachineConfig
    }
    if (finish.fairisleParkConfig !== undefined) {
      out.fairisleParkConfig =
        finish.fairisleParkConfig === null ? undefined : finish.fairisleParkConfig
    }
  }
  if (overrides.extensionHeaders !== undefined) {
    out.extensionHeaderOverrides =
      overrides.extensionHeaders === null ? undefined : overrides.extensionHeaders
  }
  return out
}
