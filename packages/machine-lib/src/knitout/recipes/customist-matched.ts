/**
 * Compile inputs with frames derived from captured Customist Studio programs.
 *
 * Studio's authored backings use reference-derived configurations: fairisle through
 * `CUSTOMIST_STUDIO_FAIRISLE_7GG_RECIPE` (reference/fairisle.kc) and
 * birdseye through `CUSTOMIST_STUDIO_BIRDSEYE_7GG_OVERRIDES`
 * (reference/dbj.kc frame, generic Birdseye body). Frame, carrier roles, and
 * machine settings come from those configurations, not from the caller.
 * This routes through `buildCompileInputForExport` so the input is the one
 * the parity harnesses verify.
 */

import type { KnitlabChartState, KnitlabKeyDefinition } from '../../colorwork/knitlab1-contract.js'
import type { CompileChartInput } from '../compile/from-chart.js'
import { buildCompileInputForExport, carrierModeForColorCount } from '../export-helpers.js'
import type { FloatPolicy } from '../plan/bed-state.js'
import type { YarnBinding } from '../types.js'
import type { RecipeOverrides } from '../wizard-config.js'
import { CUSTOMIST_RIB_BEANIE_SETTINGS_V1 } from '../passes/customist-flat-start.js'
import { SHAPED_PANEL_TOP_WASTE_ROWS } from '../passes/shaped-panel.js'
import { CUSTOMIST_STUDIO_BIRDSEYE_7GG_OVERRIDES } from './customist-studio-birdseye-7gg.js'
import { CUSTOMIST_STUDIO_FAIRISLE_7GG_RECIPE } from './customist-studio-fairisle-7gg.js'

export type CustomistMatchedTechniqueV1 = 'fairisle' | 'birdseye'

/**
 * `frameCarriers`: carriers the matched frame brings in besides the pattern
 * yarns and waste (Customist's draw/cameo yarn). Any other carrier in a
 * compiled program has no declared yarn and must be refused by the caller.
 */
export const CUSTOMIST_MATCHED_PRESETS_V1 = {
  fairisle: { id: 'customist-studio-fairisle-7gg', reference: 'reference/fairisle.kc', frameCarriers: ['1'] },
  birdseye: { id: 'customist-studio-birdseye-7gg', reference: 'reference/dbj.kc', frameCarriers: ['1'] },
} as const satisfies Record<CustomistMatchedTechniqueV1, { id: string, reference: string, frameCarriers: readonly string[] }>

export interface CustomistMatchedCompileRequestV1 {
  readonly technique: CustomistMatchedTechniqueV1
  readonly chart: KnitlabChartState
  readonly keyPalette: KnitlabKeyDefinition[]
  /** Binding order is semantic: the first binding casts on and leads each row. */
  readonly yarnBindings: readonly YarnBinding[]
  readonly needleOffset?: number
  /** Fairisle float warning threshold; does not change the program. */
  readonly floatPolicy?: FloatPolicy
  /** Waste interlock passes at the start, in place of the reference's (fairisle 87, birdseye 80). */
  readonly wastePasses?: number
  /** The top: the reference's closing waste, or a machine chain bind-off. */
  readonly top?: 'waste' | 'bind-off'
  /** Closing waste rows, in place of the reference's (fairisle 16, birdseye 20); kept even, rounding up. */
  readonly topWasteRows?: number
}

/** The reference's closing waste and park-out for each chart backing. */
function referencePark(technique: CustomistMatchedTechniqueV1) {
  return technique === 'fairisle'
    ? CUSTOMIST_STUDIO_FAIRISLE_7GG_RECIPE.sections.finish.fairisleParkBindoff!
    : CUSTOMIST_STUDIO_BIRDSEYE_7GG_OVERRIDES.finish!.fairisleParkConfig!
}

/** The reference's rows of waste yarn on top: what a project finishes on unless it sets its own. */
export const CUSTOMIST_STANDARD_TOP_WASTE_ROWS_V1 = {
  fairisle: referencePark('fairisle').closingWasteStitchRamp!.length,
  birdseye: referencePark('birdseye').closingWasteStitchRamp!.length,
  /** Sweater pieces, scarves and blankets, when their top is waste. */
  flat: SHAPED_PANEL_TOP_WASTE_ROWS,
} as const

/**
 * Closing waste rows for a requested count: even, so the carriage parks on
 * the left as the reference's does, rounding up.
 */
export function customistTopWasteRowsV1(requested: number): number {
  return requested + (requested % 2)
}

/** The reference's waste interlock passes for each construction: what a project knits unless it sets its own. */
export const CUSTOMIST_STANDARD_WASTE_PASSES_V1 = {
  fairisle: CUSTOMIST_STUDIO_FAIRISLE_7GG_RECIPE.sections.start.wastePasses,
  birdseye: CUSTOMIST_STUDIO_BIRDSEYE_7GG_OVERRIDES.start!.wastePasses!,
  /** Beanies, sweaters, scarves and blankets: the shared flat start. */
  flat: CUSTOMIST_RIB_BEANIE_SETTINGS_V1.wastePasses,
} as const

/**
 * The waste passes a construction knits for a requested count. The interlock
 * alternates direction, so the count keeps the reference's parity: the waste
 * yarn then ends on the side the next section expects. (Flipping it costs
 * seven extra passes to move the yarn back.) A count of the other parity is
 * rounded up, never down.
 */
export function customistWastePassesV1(construction: keyof typeof CUSTOMIST_STANDARD_WASTE_PASSES_V1, requested: number): number {
  const standard = CUSTOMIST_STANDARD_WASTE_PASSES_V1[construction]
  return requested + (Math.abs(standard - requested) % 2)
}

export function buildCustomistMatchedCompileInputV1(request: CustomistMatchedCompileRequestV1): CompileChartInput {
  const chart: KnitlabChartState = request.technique === 'birdseye'
    ? {
        ...request.chart,
        annotations: [
          ...(request.chart.annotations ?? []).filter((annotation) => annotation.kind !== 'dbj-backing'),
          { id: 'customist-birdseye', kind: 'dbj-backing', anchor: { scope: 'sheet' }, dbjStrategy: 'full' },
        ],
      }
    : request.chart
  return buildCompileInputForExport({
    chart,
    recipe: request.technique === 'fairisle' ? CUSTOMIST_STUDIO_FAIRISLE_7GG_RECIPE : null,
    yarns: request.yarnBindings,
    allocationMode: carrierModeForColorCount(request.yarnBindings.length),
    ...(request.needleOffset !== undefined ? { needleOffset: request.needleOffset } : {}),
    protectFirstBodyRow: true,
    recipeOverrides: withFinish(withWastePasses(request.technique === 'birdseye' ? CUSTOMIST_STUDIO_BIRDSEYE_7GG_OVERRIDES : {}, request.wastePasses), request),
  }, {
    keyPalette: request.keyPalette,
    ...(request.floatPolicy ? { floatPolicy: request.floatPolicy } : {}),
  })
}

function withWastePasses(overrides: RecipeOverrides, wastePasses: number | undefined): RecipeOverrides {
  return wastePasses === undefined ? overrides : { ...overrides, start: { ...overrides.start, wastePasses } }
}

/** The reference's ramp of stitch sizes stretched or shrunk to `rows`, keeping its shape. */
function rampOf(ramp: readonly number[], rows: number): number[] {
  return Array.from({ length: rows }, (_, row) => ramp[Math.floor((row * ramp.length) / rows)]!)
}

function withFinish(overrides: RecipeOverrides, request: CustomistMatchedCompileRequestV1): RecipeOverrides {
  if (request.top === 'bind-off') return { ...overrides, finish: { ...overrides.finish, bindOff: 'machine-bindoff', fairisleParkConfig: null } }
  if (request.topWasteRows === undefined) return overrides
  const park = referencePark(request.technique)
  return { ...overrides, finish: { ...overrides.finish, bindOff: 'fairisle-park-bindoff', fairisleParkConfig: { ...park, closingWasteStitchRamp: rampOf(park.closingWasteStitchRamp!, customistTopWasteRowsV1(request.topWasteRows)) } } }
}
