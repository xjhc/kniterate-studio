/**
 * Compile the tension swatch through the SAME chart-export path the
 * garment uses (Design A): a plain stockinette chart whose per-section
 * tensions are `stitch-number` row annotations → `trackAPatternProgram`
 * → `compileExport`. The active recipe owns machine setup (waste,
 * cast-on, bind-off, draw/waste carriers); the body stitch / speed /
 * roller derive from recipe + userIntent + overrides exactly as the
 * garment's own compile does (`deriveStateFromProgram`).
 *
 * This is the wizard's Screen-3 calibration swatch. It is a structurally
 * valid, configurable swatch — NOT byte-faithful to the Kniterate App's
 * `reference/swatch.kc`. That parity oracle stays the bespoke
 * `buildTensionSwatch` emitter in `./tension-swatch.ts`. The chart itself
 * is authored by the canonical builder in
 * `src/colorwork/tension-swatch-chart.ts`.
 */
import {
  buildTensionSwatchChart,
  type Band,
} from '../../colorwork/tension-swatch-chart.js'
import {
  KEY_ID_KNITERATE_KNIT,
  type KnitlabChartState,
  type KnitlabKeyDefinition,
} from '../../colorwork/knitlab1-contract.js'
import type { CompileChartResult } from '../compile/from-chart.js'
import { compileExport } from '../export-helpers.js'
import {
  defaultYarnsForRecipe,
  trackAPatternProgram,
  type PatternProgram,
} from '../pattern-program.js'
import type { MachineRecipe } from '../recipes/types.js'
import type { CarrierId, YarnBinding } from '../types.js'
import {
  deriveKniterateExportState,
  type KniterateWizardConfig,
  type SwatchTensionBand,
} from '../wizard-config.js'

/** Swatch rectangle width (wales) when the caller doesn't override it.
 *  Matches the bespoke swatch's reference geometry. */
export const DEFAULT_SWATCH_WIDTH = 80

/** Rows per auto-derived tension band. Matches the bespoke swatch's
 *  `rowsPerSection`. */
export const DEFAULT_SWATCH_BAND_ROWS = 80

const clampStitch = (n: number): number => Math.min(35, Math.max(1, Math.round(n)))

/**
 * The effective tension bands for the swatch: the user's explicit
 * `config.swatch.tensionBands` when set, else three bands centered on
 * the effective density (`center-1, center, center+1`) so the printed
 * swatch compares three densities around the current intent. Same
 * convention the bespoke wizard adapter used.
 */
export function deriveSwatchBands(
  config: KniterateWizardConfig,
  recipe: MachineRecipe | null,
): SwatchTensionBand[] {
  const custom = config.swatch?.tensionBands
  if (custom && custom.length > 0) {
    return custom.map(b => ({
      stitchNumber: clampStitch(b.stitchNumber),
      rows: Math.max(1, Math.round(b.rows)),
    }))
  }
  const center = deriveKniterateExportState(config, recipe).stitchNumber
  return [center - 1, center, center + 1].map(s => ({
    stitchNumber: clampStitch(s),
    rows: DEFAULT_SWATCH_BAND_ROWS,
  }))
}

/** The recipe's setup carriers (waste + draw) that a swatch body carrier
 *  must not alias. Empty for a detached (recipe-less) config. */
function setupReservedCarriers(recipe: MachineRecipe | null): Set<CarrierId> {
  const reserved = new Set<CarrierId>()
  if (recipe) {
    reserved.add(recipe.sections.start.wasteCarrier)
    if (recipe.sections.start.drawCarrier !== 'none') {
      reserved.add(recipe.sections.start.drawCarrier)
    }
  }
  return reserved
}

/**
 * Bind the swatch's single knit key (`KEY_ID_KNITERATE_KNIT`) to a body
 * carrier that does NOT alias the recipe's waste/draw setup carriers.
 * The chart compiler silently lets a pattern carrier share a slot with a
 * setup carrier (it only rejects duplicates *within* the pattern
 * bindings), so a body yarn left on the waste/draw slot would emit a
 * structurally broken swatch with no error — the swatch path must pick a
 * safe carrier itself.
 *
 * Prefer the first assigned yarn whose carrier is free; if every assigned
 * yarn collides (or none are assigned), reassign to a recipe-safe slot,
 * keeping the primary yarn's name. Carrier index doesn't affect gauge, so
 * reassigning is harmless for a swatch.
 */
function buildSwatchYarns(
  config: KniterateWizardConfig,
  recipe: MachineRecipe | null,
): YarnBinding[] {
  const reserved = setupReservedCarriers(recipe)
  const safe = config.yarns.find(y => !reserved.has(y.carrier))
  if (safe) {
    return [{ keyId: KEY_ID_KNITERATE_KNIT, carrier: safe.carrier, name: safe.name }]
  }
  const name = config.yarns[0]?.name ?? 'body'
  const fallbackCarrier = recipe
    ? defaultYarnsForRecipe([KEY_ID_KNITERATE_KNIT], recipe)[0]?.carrier
    : undefined
  return [{ keyId: KEY_ID_KNITERATE_KNIT, carrier: fallbackCarrier ?? '5', name }]
}

/** The effective settings the chart-export swatch is built with — used
 *  by the host's tech-pack "Swatch settings" section so it describes the
 *  actual download (not the retired bespoke choreography). Cast-on,
 *  waste and bind-off all follow the recipe, so only the recipe's setup
 *  carriers are reported here. */
export interface SwatchSettings {
  bands: SwatchTensionBand[]
  bodyCarrier: CarrierId
  bodyYarnName: string
  speedNumber: number
  rollerAdvance: number
  xferStitchNumber: number
  /** Recipe-owned setup carriers; `undefined` for a detached config. */
  wasteCarrier?: CarrierId
  drawCarrier?: CarrierId | 'none'
}

export function describeSwatchSettings(
  config: KniterateWizardConfig,
  recipe: MachineRecipe | null,
): SwatchSettings {
  const derived = deriveKniterateExportState(config, recipe)
  const body = buildSwatchYarns(config, recipe)[0]!
  return {
    bands: deriveSwatchBands(config, recipe),
    bodyCarrier: body.carrier,
    bodyYarnName: body.name,
    speedNumber: derived.speedNumber,
    rollerAdvance: derived.rollerAdvance,
    xferStitchNumber: derived.xferStitchNumber,
    wasteCarrier: recipe?.sections.start.wasteCarrier,
    drawCarrier: recipe?.sections.start.drawCarrier,
  }
}

export interface SwatchChartCompileInput {
  config: KniterateWizardConfig
  recipe: MachineRecipe | null
  keyPalette: KnitlabKeyDefinition[]
  /** Swatch rectangle width (wales). Default `DEFAULT_SWATCH_WIDTH`. */
  width?: number
  developerMode?: boolean
}

export interface SwatchChartCompileResult {
  /** Effective bands (custom or auto) used to build the chart — the
   *  wizard's Screen-3 band editor renders these. */
  bands: SwatchTensionBand[]
  chart: KnitlabChartState
  program: PatternProgram
  result: CompileChartResult
}

/**
 * Pure: build the swatch chart from the wizard config + recipe and
 * compile it through `compileExport`. The wizard's Screen-3 preview and
 * `.kc` download both consume `result.program`.
 */
export function compileTensionSwatchChart(
  input: SwatchChartCompileInput,
): SwatchChartCompileResult {
  const bands = deriveSwatchBands(input.config, input.recipe)
  const builderBands: Band[] = bands.map(b => ({ stitch: b.stitchNumber, rows: b.rows }))
  const state = buildTensionSwatchChart(input.width ?? DEFAULT_SWATCH_WIDTH, builderBands)
  const chart = state.sheets[0]!

  const program = trackAPatternProgram({
    chart,
    recipe: input.recipe,
    yarns: buildSwatchYarns(input.config, input.recipe),
    // The swatch is single-color stockinette; force the default carrier
    // allocation even when the garment is in experimental 5-6 color mode.
    allocationMode: 'default',
    needleOffset: input.config.needleOffset,
    recipeOverrides: input.config.recipeOverrides,
    userIntent: input.config.userIntent,
  })

  const result = compileExport(program, {
    keyPalette: input.keyPalette,
    developerMode: input.developerMode ?? false,
  })

  return { bands, chart, program, result }
}
