/**
 * Pure state + helpers for the Kniterate export UI surface.
 *
 * Canonical wrapper: knitlab1's `reference/knitlab/lib/kniterate-export.ts`
 * (a thin re-export). This file is the single source of truth. Lift
 * here, not there. The CLI in `scripts/chart-to-knitout.ts` reads the
 * same constants via `src/knitout/kniterate/constants.ts`.
 *
 * History: a second `/?kniterate=1` developer-preview wizard lived at
 * `app/src/components/KniterateWizard.tsx`; retired 2026-05-18.
 *
 * The module mirrors `CompileChartInput` from `compile/from-chart.ts`
 * but with UI-friendly defaults and a "mode" abstraction
 * (default / advanced / experimental) mapping onto the 1-4 / 5 / 6
 * color carrier-budget tiers documented in
 * `docs/knitlab1-kniterate-export-plan.md` §6.3.
 */

import type {
  KnitlabChartState,
  KnitlabKeyDefinition,
  KnitlabKeyInstance,
} from '../colorwork/knitlab1-contract.js'
import { KEY_ID_EMPTY, KEY_ID_KNIT_DEFAULT } from '../colorwork/knitlab1-contract.js'
import { sortPlacementsForPaint } from '../chart-core/paint-order.js'
import { resolveChart } from './passes/resolve-chart.js'
import { compileChartToKnitout } from './compile/from-chart.js'
import type { CompileChartResult } from './compile/from-chart.js'
import { writeKnitoutProgram } from './emitter.js'
import {
  DEFAULT_KNITERATE_HEADERS,
  DEFAULT_WASTE_PASSES,
  selectExperimentalWasteCarrier,
} from './kniterate/constants.js'
import type { BindOffStyle } from './passes/bind-off.js'
import type { MachineRecipe } from './recipes/types.js'
import type { CarrierId, YarnBinding } from './types.js'
import type { PatternProgram } from './pattern-program.js'
import type { FloatPolicy } from './plan/bed-state.js'
import {
  KNITERATE_WIZARD_CONFIG_SCHEMA_VERSION,
  deriveKniterateExportState,
  foldStateToOverrides,
  type KniterateWizardConfig,
} from './wizard-config.js'

/** Sentinel: real (canonical) build. The standalone-build stub at
 *  reference/knitlab/lib/kniterate-export-stub.ts overrides this to
 *  `true` via vite alias when KNITLAB_STANDALONE_BUILD=1 — see
 *  plan doc §13.16. UI consumers test this flag to render a "not
 *  available" notice instead of trying to compile. */
export const STANDALONE_BUILD_STUB = false

/** Carrier policy is binary post-G18 (2026-05-18): either default
 *  (Cameron's reservation honored — C1 = draw, C6 = waste, C2-C5 =
 *  pattern; max 4 colors) or experimental (draw thread dropped to free
 *  C1 for pattern use, max 6 colors). G26 (2026-05-18): the legacy
 *  'advanced' mode (5 colors via C2-C6 with C6 dual-purposed) was
 *  retired — the engine refuses to silently overload C6, so 5+ colors
 *  *only* compile via experimental. */
export type CarrierMode = 'default' | 'experimental'

/** Current persisted schema version for `KniterateExportState`. Bump
 *  whenever the shape changes in a way that pre-existing payloads can't
 *  satisfy. `parseKniterateConfig` migrates older payloads forward up to
 *  this version. */
export const KNITERATE_EXPORT_STATE_SCHEMA_VERSION = 1

export interface KniterateExportState {
  /** Schema version of this persisted blob. Absent on legacy payloads
   *  (pre-2026-05-23); the parser treats absence as version 0 and
   *  migrates forward. */
  schemaVersion?: number
  bindings: YarnBinding[]
  /** `'floats'` (front-bed only, unsecured back floats) is the canonical
   *  fairisle parity style — see the fairisle recipe in
   *  `src/knitout/recipes/`. */
  backBedStyle: 'ladder' | 'lined' | 'birdseye' | 'floats'
  /** Birdseye-specific: 'full' = every color knits the back every row
   *  (float-free); 'minimal' = only colors present in a row knit the
   *  back (lighter, may leave floats). */
  birdseyeMode?: 'minimal' | 'full'
  carrierMode: CarrierMode
  stitchNumber: number
  speedNumber: number
  rollerAdvance: number
  /** Transfer-pass stitch number. Per Cameron 2025-09-20 "quite
   *  important" — leaving this at 0 produces brittle xfer rows. */
  xferStitchNumber: number
  wastePasses: number
  bindOff: BindOffStyle
  /** Per-pass machine settings for the chain bind-off (`bindOff:
   *  'machine-bindoff'`). Defaults to the fairisle parity recipe's reference (xfer
   *  @ speed 120 stitch 4; knit @ speed 300 stitch 6 with roller advance
   *  ramp 250 → 200 → 150×5 → 100). When undefined, the engine applies
   *  these defaults. Wizard surfaces individual fields under
   *  "Bind-off (advanced)". */
  bindOffMachineConfig?: Partial<{
    xferSpeed: number
    xferStitch: number
    knitSpeed: number
    knitStitch: number
    knitRollerRamp: number[]
  }>
  /** Per-pass machine settings for the fairisle parity park bind-off
   *  (`bindOff: 'fairisle-park-bindoff'`). Defaults to
   *  FAIRISLE_PARK_BINDOFF_DEFAULTS (16-row closing waste on C6 at
   *  speed 150 / roller 450 with STIF ramp 9×8→6×8; park pass at speed
   *  150 / roller 450 / STIF 4; presser speed 600 / roller 0 for the
   *  auto-move between park and first carrier-out Tu-Tu). Set by
   *  `applyMachineRecipe` from a fairisle recipe. */
  fairisleParkConfig?: Partial<{
    closingWasteCarrier: CarrierId
    closingWasteSpeed: number
    closingWasteRoller: number
    closingWasteStitchRamp: number[]
    parkSpeed: number
    parkRoller: number
    parkStitch: number
    parkAutoMoveSpeed: number
    parkAutoMoveRoller: number
  }>
  /** Phase 3 (2026-05-23): Fairisle carrier intro + stitch
   *  ramp. Pass `true` for defaults or a partial to override. Only
   *  honored when `backBedStyle === 'floats'`. */
  fairisleCarrierIntro?: boolean | Partial<{
    introSpeed: number
    introRoller: number
    introStitch: number
    rampStitches: number[]
    rampRoller: number
    rampSpeed: number
    cameoCarriers: readonly CarrierId[]
  }>
  /** Carrier override for the waste yarn (default mode uses C6;
   *  experimental selects from the unbound carriers). Setting this lets
   *  the user pick any of 1-6 to match an external reference (e.g. a
   *  fairisle reference's `castonYarn=6` maps to carrier 5 in its kc
   *  output). */
  wasteCarrierOverride?: CarrierId
  /** Draw thread carrier override. `'none'` skips the draw-thread row
   *  entirely (matches the fairisle behavior when the waste section flows
   *  directly into the body without a separator). `undefined` falls back
   *  to the default mode's reserved C1. */
  drawCarrierOverride?: CarrierId | 'none'
  /** Per-pass machine settings for the waste section. Mirrors
   *  `WasteMachineConfig`. Defaults to the fairisle parity recipe's ramp (cast-on
   *  speed 100 roller 440 stitch 5; first ~4 post-cast-on passes hold
   *  roller 0; subsequent passes alternate << roller 440 / >> roller 0).
   *  When undefined, no per-row machine ops are inserted and the
   *  upstream `stitchNumber`/`speedNumber`/`rollerAdvance` defaults
   *  stick. */
  wasteMachineConfig?: Partial<{
    stitchNumber: number
    castOnSpeed: number
    castOnRoller: number
    castOnPasses: number
    castOnTuckPasses: number
    castOnTuckSpeed: number
    castOnTuckRoller: number
    wasteSpeed: number
    flatRollerPasses: number
    rampRollerLeft: number
    rampRollerRight: number
    castOnFirstBed: 'front' | 'back'
    edgeInertNeedles: number
  }>
  needleOffset: number | undefined
  /** Default-on machine safety guard: slow the first body row after
   *  cast-on and restore body speed for row 1+. */
  protectFirstBodyRow?: boolean
  /** Slice 4 (2026-05-20): has the operator measured a swatch in this
   *  yarn at this stitch number, or are they relying on nominal gauge?
   *  Surfaces in the tech pack so the bundle records whether dimensions
   *  are calibrated or aspirational. Default `false` = nominal. */
  swatchConfirmed?: boolean
  /** P3.2 (2026-05-23): extension-header overrides flowed in by
   *  `applyMachineRecipe` from `recipe.extensionHeaders` (carrier
   *  spacing, stopping distance, xfer style, etc.). When undefined the
   *  engine's `DEFAULT_KNITERATE_HEADERS` apply. Top-level scalar fields
   *  (`stitchNumber`, `speedNumber`, `rollerAdvance`, `xferStitchNumber`)
   *  still win over the matching keys here so the wizard's per-field
   *  controls remain authoritative. */
  extensionHeaderOverrides?: Partial<Pick<
    import('./types.js').KniterateExtensionHeaders,
    'carrierSpacing' | 'carrierStoppingDistance' | 'xferStyle'
  >>
}

export const DEFAULT_KNITERATE_EXPORT_STATE: KniterateExportState = {
  schemaVersion: KNITERATE_EXPORT_STATE_SCHEMA_VERSION,
  bindings: [],
  backBedStyle: 'birdseye',
  // 'full' matches the float-free promise of birdseye; 'minimal' is a
  // lighter alternative that only knits the back where colors are
  // present in that row — efficient but may leave floats. Default to
  // the promise, not the optimization. Engine fallback in
  // src/knitout/plan/compile-chart.ts must match.
  birdseyeMode: 'full',
  carrierMode: 'default',
  // Machine settings derive from DEFAULT_KNITERATE_HEADERS (the engine
  // constants module). Keep both in sync via this import, not by
  // duplicating literals — contract-layer drift is its own bug class.
  stitchNumber: DEFAULT_KNITERATE_HEADERS.stitchNumber,
  speedNumber: DEFAULT_KNITERATE_HEADERS.speedNumber,
  rollerAdvance: DEFAULT_KNITERATE_HEADERS.rollerAdvance,
  xferStitchNumber: DEFAULT_KNITERATE_HEADERS.xferStitchNumber ?? 5,
  wastePasses: DEFAULT_WASTE_PASSES,
  bindOff: 'waste-and-drop',
  needleOffset: undefined,
  protectFirstBodyRow: true,
}

/** Outcome of `parseKniterateConfig`. `config` is the migrated state
 *  (or `null` if the blob is unusable). `warnings` enumerate any
 *  legacy/dropped fields the parser had to migrate or discard — UI can
 *  surface them inline so the user sees that older settings were ported
 *  forward (or lost). */
export interface ParseKniterateConfigResult {
  config: KniterateExportState | null
  warnings: string[]
}

const VALID_BACK_BED_STYLES = new Set<KniterateExportState['backBedStyle']>([
  'ladder',
  'lined',
  'birdseye',
  'floats',
])
const VALID_BIRDSEYE_MODES = new Set<NonNullable<KniterateExportState['birdseyeMode']>>([
  'minimal',
  'full',
])
const VALID_CARRIER_MODES = new Set<CarrierMode>(['default', 'experimental'])
const VALID_BIND_OFF_STYLES = new Set<BindOffStyle>([
  'machine-bindoff',
  'waste-and-drop',
  'drop',
  'fairisle-park-bindoff',
])
const VALID_CARRIERS = new Set<CarrierId>(['1', '2', '3', '4', '5', '6'])

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function asNumber(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined
}

function asBoolean(v: unknown): boolean | undefined {
  return typeof v === 'boolean' ? v : undefined
}

function asCarrierId(v: unknown): CarrierId | undefined {
  if (typeof v !== 'string') return undefined
  return VALID_CARRIERS.has(v as CarrierId) ? (v as CarrierId) : undefined
}

function parseYarnBindings(v: unknown, warnings: string[]): YarnBinding[] {
  if (!Array.isArray(v)) {
    if (v !== undefined) warnings.push('bindings: expected array; dropped')
    return []
  }
  const out: YarnBinding[] = []
  for (const entry of v) {
    if (!isPlainObject(entry)) {
      warnings.push('bindings: skipped non-object entry')
      continue
    }
    const keyId = typeof entry.keyId === 'string' ? entry.keyId : undefined
    const carrier = asCarrierId(entry.carrier)
    const name = typeof entry.name === 'string' ? entry.name : undefined
    if (!keyId || !carrier) {
      warnings.push(`bindings: skipped entry with missing keyId/carrier`)
      continue
    }
    const binding: YarnBinding = { keyId, carrier, name: name ?? keyId }
    if (entry.role === 'background' || entry.role === 'pattern') {
      binding.role = entry.role
    }
    out.push(binding)
  }
  return out
}

/**
 * Parse and migrate a persisted Kniterate config blob into a typed
 * `KniterateExportState`. Fixes the unsafe boundary cast at
 * `reference/knitlab/components/ExportPreviewModal.tsx:104` —
 * `chartState.kniterateConfig` is `unknown` in storage on purpose
 * (chart format is machine-agnostic) but the wizard needs a typed
 * runtime shape.
 *
 * Returns `{ config: null, warnings: [...] }` when the blob is so
 * malformed (or so old) that nothing usable can be migrated forward;
 * callers should fall back to `DEFAULT_KNITERATE_EXPORT_STATE` in that
 * case. Partial blobs migrate field-by-field and fall back to defaults
 * for unrecognized values — warnings list every drop.
 */
export function parseKniterateConfig(blob: unknown): ParseKniterateConfigResult {
  const warnings: string[] = []
  if (blob === undefined || blob === null) {
    return { config: null, warnings }
  }
  if (!isPlainObject(blob)) {
    return { config: null, warnings: ['kniterateConfig: expected object; dropped'] }
  }

  const claimedVersion = asNumber(blob.schemaVersion) ?? 0
  if (claimedVersion > KNITERATE_EXPORT_STATE_SCHEMA_VERSION) {
    warnings.push(
      `kniterateConfig: schemaVersion ${claimedVersion} is newer than this build (${KNITERATE_EXPORT_STATE_SCHEMA_VERSION}); some fields may be ignored`,
    )
  }

  const defaults = DEFAULT_KNITERATE_EXPORT_STATE

  const backBedStyle = typeof blob.backBedStyle === 'string'
    && VALID_BACK_BED_STYLES.has(blob.backBedStyle as KniterateExportState['backBedStyle'])
    ? (blob.backBedStyle as KniterateExportState['backBedStyle'])
    : defaults.backBedStyle
  if (blob.backBedStyle !== undefined && blob.backBedStyle !== backBedStyle) {
    warnings.push(`backBedStyle: unrecognized "${String(blob.backBedStyle)}"; fell back to "${backBedStyle}"`)
  }

  let birdseyeMode = defaults.birdseyeMode
  if (blob.birdseyeMode !== undefined) {
    if (typeof blob.birdseyeMode === 'string'
      && VALID_BIRDSEYE_MODES.has(blob.birdseyeMode as NonNullable<KniterateExportState['birdseyeMode']>)) {
      birdseyeMode = blob.birdseyeMode as KniterateExportState['birdseyeMode']
    } else {
      warnings.push(`birdseyeMode: unrecognized "${String(blob.birdseyeMode)}"; fell back to "${birdseyeMode}"`)
    }
  }

  // Legacy migration first: 2026-05-18 G26 retired the 'advanced'
  // middle ground. Promote it to 'experimental' without surfacing the
  // generic "unrecognized" warning the validity check below would emit.
  let migratedCarrierMode: CarrierMode
  if (blob.carrierMode === 'advanced') {
    warnings.push('carrierMode: legacy "advanced" promoted to "experimental" (G26 2026-05-18)')
    migratedCarrierMode = 'experimental'
  } else if (typeof blob.carrierMode === 'string'
    && VALID_CARRIER_MODES.has(blob.carrierMode as CarrierMode)) {
    migratedCarrierMode = blob.carrierMode as CarrierMode
  } else {
    if (blob.carrierMode !== undefined) {
      warnings.push(`carrierMode: unrecognized "${String(blob.carrierMode)}"; fell back to "${defaults.carrierMode}"`)
    }
    migratedCarrierMode = defaults.carrierMode
  }

  const bindOff = typeof blob.bindOff === 'string'
    && VALID_BIND_OFF_STYLES.has(blob.bindOff as BindOffStyle)
    ? (blob.bindOff as BindOffStyle)
    : defaults.bindOff
  if (blob.bindOff !== undefined && blob.bindOff !== bindOff) {
    warnings.push(`bindOff: unrecognized "${String(blob.bindOff)}"; fell back to "${bindOff}"`)
  }

  const bindings = parseYarnBindings(blob.bindings, warnings)

  const config: KniterateExportState = {
    schemaVersion: KNITERATE_EXPORT_STATE_SCHEMA_VERSION,
    bindings,
    backBedStyle,
    birdseyeMode,
    carrierMode: migratedCarrierMode,
    stitchNumber: asNumber(blob.stitchNumber) ?? defaults.stitchNumber,
    speedNumber: asNumber(blob.speedNumber) ?? defaults.speedNumber,
    rollerAdvance: asNumber(blob.rollerAdvance) ?? defaults.rollerAdvance,
    xferStitchNumber: asNumber(blob.xferStitchNumber) ?? defaults.xferStitchNumber,
    wastePasses: asNumber(blob.wastePasses) ?? defaults.wastePasses,
    bindOff,
    needleOffset: asNumber(blob.needleOffset),
    protectFirstBodyRow: asBoolean(blob.protectFirstBodyRow) ?? defaults.protectFirstBodyRow,
  }

  // Nested object configs — filter to the known-shape keys with the
  // expected value types. Unknown keys and wrong-typed values are
  // dropped with a warning. The KniterateExportState's nested types
  // are all "numbers-or-number-arrays" with one exception (xferStyle,
  // castOnFirstBed) which we whitelist explicitly.
  const configRecord = config as unknown as Record<string, unknown>
  const sanitizeNested = (
    key: keyof KniterateExportState,
    shape: Record<string, 'number' | 'numberArray' | string[]>,
  ): void => {
    const raw = (blob as Record<string, unknown>)[key as string]
    if (raw === undefined) return
    if (!isPlainObject(raw)) {
      warnings.push(`${String(key)}: expected object; dropped`)
      return
    }
    const cleaned: Record<string, unknown> = {}
    for (const [field, expected] of Object.entries(shape)) {
      const v = raw[field]
      if (v === undefined) continue
      if (expected === 'number') {
        if (typeof v === 'number' && Number.isFinite(v)) cleaned[field] = v
        else warnings.push(`${String(key)}.${field}: expected number; dropped`)
      } else if (expected === 'numberArray') {
        if (Array.isArray(v) && v.every(x => typeof x === 'number' && Number.isFinite(x))) {
          cleaned[field] = v
        } else warnings.push(`${String(key)}.${field}: expected number[]; dropped`)
      } else {
        // Enum: array of allowed string values.
        if (typeof v === 'string' && expected.includes(v)) cleaned[field] = v
        else warnings.push(`${String(key)}.${field}: expected one of ${expected.join('|')}; dropped`)
      }
    }
    // Surface unknown keys so renames are caught.
    for (const k of Object.keys(raw)) {
      if (!(k in shape)) {
        warnings.push(`${String(key)}.${k}: unknown field; dropped`)
      }
    }
    if (Object.keys(cleaned).length > 0) configRecord[key as string] = cleaned
  }
  sanitizeNested('bindOffMachineConfig', {
    xferSpeed: 'number',
    xferStitch: 'number',
    knitSpeed: 'number',
    knitStitch: 'number',
    knitRollerRamp: 'numberArray',
  })
  sanitizeNested('fairisleParkConfig', {
    closingWasteCarrier: ['1', '2', '3', '4', '5', '6'],
    closingWasteSpeed: 'number',
    closingWasteRoller: 'number',
    closingWasteStitchRamp: 'numberArray',
    parkSpeed: 'number',
    parkRoller: 'number',
    parkStitch: 'number',
    parkAutoMoveSpeed: 'number',
    parkAutoMoveRoller: 'number',
  })
  sanitizeNested('wasteMachineConfig', {
    stitchNumber: 'number',
    castOnSpeed: 'number',
    castOnRoller: 'number',
    castOnPasses: 'number',
    castOnTuckPasses: 'number',
    castOnTuckSpeed: 'number',
    castOnTuckRoller: 'number',
    wasteSpeed: 'number',
    flatRollerPasses: 'number',
    rampRollerLeft: 'number',
    rampRollerRight: 'number',
    castOnFirstBed: ['front', 'back'],
    edgeInertNeedles: 'number',
  })
  sanitizeNested('extensionHeaderOverrides', {
    carrierSpacing: 'number',
    carrierStoppingDistance: 'number',
    xferStyle: ['four-pass', 'two-pass'],
  })

  // P3.1 rename migration (2026-05-23): legacy persisted blobs carry
  // `customistFairisleTransition` instead of `fairisleCarrierIntro`. If
  // we see only the old name, forward it to the new slot with a
  // warning; if both are present, the new name wins.
  const fairisleIntroSrc = blob.fairisleCarrierIntro !== undefined
    ? blob.fairisleCarrierIntro
    : blob.customistFairisleTransition
  if (blob.customistFairisleTransition !== undefined && blob.fairisleCarrierIntro === undefined) {
    warnings.push('customistFairisleTransition: legacy field name migrated to "fairisleCarrierIntro" (P3.1 rename 2026-05-23)')
  }
  if (fairisleIntroSrc !== undefined) {
    if (typeof fairisleIntroSrc === 'boolean') {
      config.fairisleCarrierIntro = fairisleIntroSrc
    } else if (isPlainObject(fairisleIntroSrc)) {
      // #4 (2026-05-23): per-field sanitization. The compiler spreads
      // this object into FairisleCarrierIntro and assumes typed
      // fields; a stale `{ cameoCarriers: "1" }` would break the
      // walker. Filter each field to its expected type, drop unknown
      // keys with a warning.
      const cleaned: Record<string, unknown> = {}
      const numFields = ['introSpeed', 'introRoller', 'introStitch', 'rampRoller', 'rampSpeed']
      for (const f of numFields) {
        const v = fairisleIntroSrc[f]
        if (v === undefined) continue
        if (typeof v === 'number' && Number.isFinite(v)) cleaned[f] = v
        else warnings.push(`fairisleCarrierIntro.${f}: expected number; dropped`)
      }
      if (fairisleIntroSrc.rampStitches !== undefined) {
        const v = fairisleIntroSrc.rampStitches
        if (Array.isArray(v) && v.every(x => typeof x === 'number' && Number.isFinite(x))) {
          cleaned.rampStitches = v
        } else {
          warnings.push('fairisleCarrierIntro.rampStitches: expected number[]; dropped')
        }
      }
      if (fairisleIntroSrc.cameoCarriers !== undefined) {
        const v = fairisleIntroSrc.cameoCarriers
        if (Array.isArray(v) && v.every(x => typeof x === 'string' && VALID_CARRIERS.has(x as CarrierId))) {
          cleaned.cameoCarriers = v
        } else {
          warnings.push('fairisleCarrierIntro.cameoCarriers: expected CarrierId[]; dropped')
        }
      }
      for (const k of Object.keys(fairisleIntroSrc)) {
        if (!numFields.includes(k) && k !== 'rampStitches' && k !== 'cameoCarriers') {
          warnings.push(`fairisleCarrierIntro.${k}: unknown field; dropped`)
        }
      }
      config.fairisleCarrierIntro = cleaned as KniterateExportState['fairisleCarrierIntro']
    } else {
      warnings.push('fairisleCarrierIntro: expected boolean or object; dropped')
    }
  }
  if (blob.wasteCarrierOverride !== undefined) {
    const c = asCarrierId(blob.wasteCarrierOverride)
    if (c) config.wasteCarrierOverride = c
    else warnings.push(`wasteCarrierOverride: invalid "${String(blob.wasteCarrierOverride)}"; dropped`)
  }
  if (blob.drawCarrierOverride !== undefined) {
    if (blob.drawCarrierOverride === 'none') {
      config.drawCarrierOverride = 'none'
    } else {
      const c = asCarrierId(blob.drawCarrierOverride)
      if (c) config.drawCarrierOverride = c
      else warnings.push(`drawCarrierOverride: invalid "${String(blob.drawCarrierOverride)}"; dropped`)
    }
  }
  const swatchConfirmed = asBoolean(blob.swatchConfirmed)
  if (swatchConfirmed !== undefined) config.swatchConfirmed = swatchConfirmed

  return { config, warnings }
}

/** Apply a registered MachineRecipe to an export state. The chart's
 *  yarn bindings and needle offset are left untouched (chart-driven,
 *  not recipe-driven). Used by the wizard's preset surface — pick a
 *  recipe id, get a populated `KniterateExportState` back.
 *
 *  P3.2 (2026-05-23): replaces the original hardcoded preset functions.
 *  See `src/knitout/recipes/` for the registered set and
 *  docs/SYSTEM-DESIGN.md §A.5 (intent vs. derived state).
 */
export function applyMachineRecipe(
  state: KniterateExportState,
  recipe: MachineRecipe,
): KniterateExportState {
  const { start, body, finish } = recipe.sections
  // P3.2 #3 (2026-05-23): project, don't overlay. Switching from a
  // fairisle recipe to a swatch recipe must clear stale optional
  // sections, not leave them in place. The next state is the
  // chart-driven fields (bindings, needleOffset, schemaVersion,
  // swatchConfirmed) plus the new recipe's full projection.
  const next: KniterateExportState = {
    schemaVersion: state.schemaVersion,
    bindings: state.bindings,
    needleOffset: state.needleOffset,
    protectFirstBodyRow: state.protectFirstBodyRow !== false,
    swatchConfirmed: state.swatchConfirmed,
    // Carrier mode is chart-driven (number of pattern colors), not
    // recipe-driven; preserve.
    carrierMode: state.carrierMode,
    // Body
    stitchNumber: body.stitchNumber,
    speedNumber: body.speedNumber,
    rollerAdvance: body.rollerAdvance,
    xferStitchNumber: body.xferStitchNumber,
    backBedStyle: body.backBedStyle,
    birdseyeMode: body.birdseyeMode,
    // Start
    wastePasses: start.wastePasses,
    wasteCarrierOverride: start.wasteCarrier,
    drawCarrierOverride: start.drawCarrier,
    wasteMachineConfig: { ...start.wasteMachine },
    fairisleCarrierIntro: start.carrierIntro
      ? {
        ...start.carrierIntro,
        rampStitches: [...start.carrierIntro.rampStitches],
        ...(start.carrierIntro.cameoCarriers
          ? { cameoCarriers: [...start.carrierIntro.cameoCarriers] }
          : {}),
      }
      : undefined,
    // Finish
    bindOff: finish.bindOff,
    bindOffMachineConfig: finish.chainBindoff
      ? {
        ...finish.chainBindoff,
        knitRollerRamp: [...finish.chainBindoff.knitRollerRamp],
      }
      : undefined,
    fairisleParkConfig: finish.fairisleParkBindoff
      ? {
        ...finish.fairisleParkBindoff,
        closingWasteStitchRamp: [...finish.fairisleParkBindoff.closingWasteStitchRamp],
      }
      : undefined,
    // Extension headers
    extensionHeaderOverrides: recipe.extensionHeaders
      ? {
        ...(recipe.extensionHeaders.carrierSpacing !== undefined
          ? { carrierSpacing: recipe.extensionHeaders.carrierSpacing }
          : {}),
        ...(recipe.extensionHeaders.carrierStoppingDistance !== undefined
          ? { carrierStoppingDistance: recipe.extensionHeaders.carrierStoppingDistance }
          : {}),
        ...(recipe.extensionHeaders.xferStyle !== undefined
          ? { xferStyle: recipe.extensionHeaders.xferStyle }
          : {}),
      }
      : undefined,
  }
  return next
}

/** Carriers permitted by each mode. Mirrors autoAssignBindings's allocation
 *  pool so UI dropdowns agree with auto-assignment. */
export function carriersForMode(mode: CarrierMode): CarrierId[] {
  if (mode === 'experimental') return ['1', '2', '3', '4', '5', '6']
  return ['2', '3', '4', '5']
}

/** Knitting passes per chart row for the chosen back-bed scheme. Used
 *  for knit-time estimates. Lined and birdseye are 2N (N front + N back);
 *  ladder is N+1; floats is N (front only, no back); single-color is 1. */
export function passesPerRowFor(
  state: Pick<KniterateExportState, 'backBedStyle' | 'bindings'>,
): number {
  const n = state.bindings.length
  if (n < 2) return 1
  if (state.backBedStyle === 'lined' || state.backBedStyle === 'birdseye') return n * 2
  if (state.backBedStyle === 'floats') return n
  return n + 1 // ladder
}

/** Rough yarn-need estimate for a Kniterate panel. Multiplies the
 *  rectangular stitch area (`needleCount × estimatedRows`) by a per-stitch
 *  loop-length constant. Shaping decreases and no-stitch wedges shrink the
 *  real consumption below this rectangle, so the estimate skews
 *  conservative — exactly what a stash check wants. The 12 mm/stitch
 *  constant is calibrated for 7gg stockinette (~3.6 mm needle pitch, ~3.3×
 *  loop length); other gauges drift but stay in the same order of
 *  magnitude.
 *
 *  Pure: returns meters as a number. Caller decides how to format. */
export function estimateYarnMetersFromDimensions(dimensions: {
  needleCount: number
  estimatedRows: number
}): number {
  const STITCH_LOOP_LENGTH_MM = 12
  return (dimensions.needleCount * dimensions.estimatedRows * STITCH_LOOP_LENGTH_MM) / 1000
}

/** Resolve a key's yarn-slot role. Explicit `yarnSlotRole` wins; legacy
 *  custom keys (no role) fall back to "own-yarn" when their `op` is
 *  'knit' or unset, matching the historical "every non-empty key is a
 *  yarn slot" behavior so existing user charts keep auto-binding. */
function effectiveYarnSlotRole(
  def: KnitlabKeyDefinition | undefined,
): 'own-yarn' | 'base-yarn' | 'none' {
  if (!def) return 'own-yarn'
  if (def.yarnSlotRole) return def.yarnSlotRole
  const op = def.op ?? 'knit'
  return op === 'knit' ? 'own-yarn' : 'base-yarn'
}

function requirePositiveChartDimensions(chart: KnitlabChartState, caller: string): void {
  if (!Number.isInteger(chart.rows) || chart.rows <= 0) {
    throw new Error(`${caller}: invalid rows=${chart.rows}; must be a positive integer`)
  }
  if (!Number.isInteger(chart.cols) || chart.cols <= 0) {
    throw new Error(`${caller}: invalid cols=${chart.cols}; must be a positive integer`)
  }
}

function gridCellKeyId(layerGrid: Record<string, unknown> | undefined, row: number, col: number): string | null {
  const rowValue = layerGrid?.[String(row)]
  if (!rowValue || typeof rowValue !== 'object' || Array.isArray(rowValue)) return null
  const cellValue = (rowValue as Record<string, unknown>)[String(col)]
  if (!cellValue || typeof cellValue !== 'object' || Array.isArray(cellValue)) return null
  const keyId = (cellValue as { keyId?: unknown }).keyId
  return typeof keyId === 'string' ? keyId : null
}

function layerGridHasKeyIds(layerGrid: Record<string, unknown> | undefined): boolean {
  for (const rowValue of Object.values(layerGrid ?? {})) {
    if (!rowValue || typeof rowValue !== 'object' || Array.isArray(rowValue)) continue
    for (const cellValue of Object.values(rowValue as Record<string, unknown>)) {
      if (!cellValue || typeof cellValue !== 'object' || Array.isArray(cellValue)) continue
      if (typeof (cellValue as { keyId?: unknown }).keyId === 'string') return true
    }
  }
  return false
}

function visitLayerPaintedCells(
  layer: NonNullable<KnitlabChartState['layers']>[number],
  rows: number,
  cols: number,
  paletteById: Map<string, KnitlabKeyDefinition>,
  visit: (row: number, col: number, keyId: string, keyDef: KnitlabKeyDefinition | undefined) => void,
): void {
  if (layerGridHasKeyIds(layer.grid)) {
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const keyId = gridCellKeyId(layer.grid, row, col)
        if (!keyId) continue
        visit(row, col, keyId, paletteById.get(keyId))
      }
    }
    return
  }

  const sortedPlacements = sortPlacementsForPaint(layer, paletteById)
  for (const placement of sortedPlacements) {
    const keyDef = paletteById.get(placement.keyId)
    if (!keyDef) continue
    const width = Math.max(1, Math.floor(Number(keyDef.width) || 1))
    const height = Math.max(1, Math.floor(Number(keyDef.height) || 1))
    const ax = Number(placement.anchor?.x)
    const ay = Number(placement.anchor?.y)
    if (!Number.isInteger(ax) || !Number.isInteger(ay)) continue
    for (let dy = 0; dy < height; dy++) {
      for (let dx = 0; dx < width; dx++) {
        const row = ay + dy
        const col = ax + dx
        if (row < 0 || row >= rows || col < 0 || col >= cols) continue
        visit(row, col, placement.keyId, keyDef)
      }
    }
  }
}

/**
 * Per-cell physical yarn key for export UI decisions.
 *
 * The authored chart has two channels: structural stitch ops and colorwork.
 * Structural base-yarn keys (purl, decreases, cables, annotations) do not
 * consume their own carrier; they ride whatever yarn color is active at that
 * cell. Colorwork keys do consume carriers. The canvas renders from
 * `layer.grid`, so this helper reads grid cells first and falls back to
 * `keyPlacements` for engine-built charts/tests whose grids are intentionally
 * sparse.
 */
export function resolveExportYarnKeyCells(
  chart: KnitlabChartState,
  keyPalette: KnitlabKeyDefinition[],
): string[][] {
  requirePositiveChartDimensions(chart, 'resolveExportYarnKeyCells')
  const paletteById = new Map<string, KnitlabKeyDefinition>()
  for (const key of keyPalette) {
    if (key && typeof key.id === 'string') paletteById.set(key.id, key)
  }

  const yarnCells: string[][] = Array.from({ length: chart.rows }, () =>
    Array.from({ length: chart.cols }, () => KEY_ID_KNIT_DEFAULT),
  )
  const activeCells: boolean[][] = Array.from({ length: chart.rows }, () =>
    Array.from({ length: chart.cols }, () => true),
  )

  for (const layer of chart.layers ?? []) {
    if (!layer || layer.isVisible === false || layer.kind === 'color') continue
    visitLayerPaintedCells(layer, chart.rows, chart.cols, paletteById, (row, col, keyId, keyDef) => {
      if (keyId === KEY_ID_EMPTY || effectiveYarnSlotRole(keyDef) === 'none') {
        activeCells[row]![col] = false
        return
      }
      activeCells[row]![col] = true
      if (effectiveYarnSlotRole(keyDef) === 'own-yarn') {
        yarnCells[row]![col] = keyId
      }
    })
  }

  for (const layer of chart.layers ?? []) {
    if (!layer || layer.isVisible === false || layer.kind !== 'color') continue
    visitLayerPaintedCells(layer, chart.rows, chart.cols, paletteById, (row, col, keyId, keyDef) => {
      if (keyId === KEY_ID_EMPTY) return
      if (effectiveYarnSlotRole(keyDef) === 'own-yarn') {
        yarnCells[row]![col] = keyId
      }
    })
  }

  return yarnCells.map((row, r) =>
    row.map((keyId, c) => (activeCells[r]![c] ? keyId : KEY_ID_EMPTY)),
  )
}

/**
 * Keep the machine compile path honest for charts whose visible colorwork was
 * stored in `layer.grid` but not yet reflected in `keyPlacements`.
 *
 * The low-level compiler still reads placements for color identity. This
 * export adapter only materializes Colorwork-channel, own-yarn grid cells;
 * structural placements stay untouched so validation/projection semantics do
 * not get flattened into color swatches.
 */
export function materializeColorworkGridPlacementsForExport(
  chart: KnitlabChartState,
  keyPalette: KnitlabKeyDefinition[],
): KnitlabChartState {
  requirePositiveChartDimensions(chart, 'materializeColorworkGridPlacementsForExport')
  const paletteById = new Map<string, KnitlabKeyDefinition>()
  for (const key of keyPalette) {
    if (key && typeof key.id === 'string') paletteById.set(key.id, key)
  }
  let changed = false
  const layers = (chart.layers ?? []).map(layer => {
    if (!layer || layer.isVisible === false || layer.kind !== 'color' || !layerGridHasKeyIds(layer.grid)) return layer
    const keyPlacements: KnitlabKeyInstance[] = []
    for (let row = 0; row < chart.rows; row++) {
      for (let col = 0; col < chart.cols; col++) {
        const keyId = gridCellKeyId(layer.grid, row, col)
        if (!keyId || keyId === KEY_ID_EMPTY || keyId === KEY_ID_KNIT_DEFAULT) continue
        const keyDef = paletteById.get(keyId)
        if (effectiveYarnSlotRole(keyDef) !== 'own-yarn') continue
        keyPlacements.push({ anchor: { x: col, y: row }, keyId })
      }
    }
    changed = true
    return { ...layer, keyPlacements }
  })
  return changed ? { ...chart, layers } : chart
}

/** All distinct, non-empty keyIds present in the chart's resolved
 *  cells. Uses the full resolve pipeline so we honor placement
 *  composition (hidden layers skipped, M×N overlap, last-paint-wins).
 *  Returns every painted key regardless of yarn-slot role — useful
 *  for diagnostics and palette inspection. For yarn-carrier
 *  allocation, prefer `uniqueYarnKeysInChart` which filters to
 *  own-yarn keys only. */
export function uniqueColorKeysInChart(
  chart: KnitlabChartState,
  keyPalette: KnitlabKeyDefinition[],
): string[] {
  const resolved = resolveChart(chart, keyPalette)
  const present = new Set<string>()
  // chart-core/identity-read-ok: enumerate distinct non-empty keyIds for
  // the color picker. No per-cell semantic dispatch.
  for (const row of resolved.cells) {
    for (const cell of row) {
      if (cell !== KEY_ID_EMPTY) present.add(cell)
    }
  }
  const counts = new Map<string, number>()
  // chart-core/identity-read-ok: count occurrences of each keyId so the
  // picker can surface most-used colors first.
  for (const row of resolved.cells) {
    for (const cell of row) {
      if (cell === KEY_ID_EMPTY) continue
      counts.set(cell, (counts.get(cell) ?? 0) + 1)
    }
  }
  return [...present].sort((a, b) => {
    if (a === KEY_ID_KNIT_DEFAULT && b !== KEY_ID_KNIT_DEFAULT) return -1
    if (b === KEY_ID_KNIT_DEFAULT && a !== KEY_ID_KNIT_DEFAULT) return 1
    const diff = (counts.get(b) ?? 0) - (counts.get(a) ?? 0)
    if (diff !== 0) return diff
    return a.localeCompare(b)
  })
}

/** Distinct keyIds whose `yarnSlotRole === 'own-yarn'` (or legacy
 *  knit-op equivalents). These are the keys that consume a physical
 *  carrier slot, so the wizard uses this for color-count tagging and
 *  carrier auto-assignment. Decreases, increases, purls, cables,
 *  slips, shifts, and texture tiles do NOT show up here — they ride
 *  the active yarn. */
export function uniqueYarnKeysInChart(
  chart: KnitlabChartState,
  keyPalette: KnitlabKeyDefinition[],
): string[] {
  const cells = resolveExportYarnKeyCells(chart, keyPalette)
  const counts = new Map<string, number>()
  for (const row of cells) {
    for (const keyId of row) {
      if (keyId === KEY_ID_EMPTY) continue
      const def = keyPalette.find(k => k.id === keyId)
      if (effectiveYarnSlotRole(def) !== 'own-yarn') continue
      counts.set(keyId, (counts.get(keyId) ?? 0) + 1)
    }
  }
  return [...counts.keys()].sort((a, b) => {
    if (a === KEY_ID_KNIT_DEFAULT && b !== KEY_ID_KNIT_DEFAULT) return -1
    if (b === KEY_ID_KNIT_DEFAULT && a !== KEY_ID_KNIT_DEFAULT) return 1
    const diff = (counts.get(b) ?? 0) - (counts.get(a) ?? 0)
    if (diff !== 0) return diff
    return a.localeCompare(b)
  })
}

/** Auto-assign yarn carriers given the colors in a chart and a mode. */
export function autoAssignBindings(
  chart: KnitlabChartState,
  keyPalette: KnitlabKeyDefinition[],
  mode: CarrierMode,
): YarnBinding[] {
  const colorKeys = uniqueYarnKeysInChart(chart, keyPalette)
  const available = carriersForMode(mode)
  return colorKeys.slice(0, available.length).map((keyId, i) => {
    const def = keyPalette.find(k => k.id === keyId)
    return {
      keyId,
      carrier: available[i]!,
      name: def?.name ?? keyId,
    }
  })
}

/** Determine the carrier mode from the number of bound colors. Post-G26
 *  (2026-05-18) the mapping is binary — 5 or 6 colors require
 *  experimental because the engine refuses to dual-purpose C6 as both
 *  waste and pattern (the prior 'advanced' middle ground was retired). */
export function carrierModeForColorCount(n: number): CarrierMode {
  if (n >= 5) return 'experimental'
  return 'default'
}

/** Optional capability flags piped through from the host app. Kept
 *  separate from `KniterateExportState` so capabilities are not
 *  persisted as part of the chart export config (D3 in the
 *  rearchitecture plan — developerMode is a global app capability, not
 *  a per-pattern field).
 *
 *  Phase 2 (2026-05-24): `recipe` was removed — the active recipe now
 *  travels inside `PatternProgram.recipe`. This stops the legacy
 *  KniterateExportState path from re-piping a recipe behind the
 *  wizard's back. */
export interface CompileExportCapabilities {
  /** P1.3 (2026-05-23): forwarded to `compileChartToKnitout`. Required
   *  to compile with `bindOff: 'drop'`. */
  developerMode?: boolean
}

/** Phase 2 (2026-05-24): options bag for the PatternProgram-based
 *  compile entry point. `keyPalette` is environment (it lives with
 *  the host's chart palette, not the persisted PatternProgram);
 *  `developerMode` is a host-app capability. */
export interface CompileExportOptions {
  keyPalette: KnitlabKeyDefinition[]
  developerMode?: boolean
  /** Optional explicit test/tooling override. Production wizard flows
   *  normally take this from `PatternProgram.recipe.validation.floats`. */
  floatPolicy?: FloatPolicy
}

/** Phase 2 (2026-05-24): derive the engine state from a PatternProgram
 *  using the wizard-config derivation pipeline. The wizard panel calls
 *  this exactly once per source via `compileExport`; the Run/Checks
 *  panel calls the same function for hashing so the two views see
 *  byte-identical compile inputs. */
function deriveStateFromProgram(program: PatternProgram): KniterateExportState {
  // Synthesize a transient wizard config from the PatternProgram and
  // derive the engine state through the canonical Slice A path. The
  // config is throwaway — its only purpose is to route through the
  // single derivation function so the recipe + overrides combination
  // behaves identically to the persisted-config flow.
  const transientConfig: KniterateWizardConfig = {
    schemaVersion: KNITERATE_WIZARD_CONFIG_SCHEMA_VERSION,
    recipeId: program.recipe?.id ?? null,
    yarns: program.yarns,
    allocationMode: program.allocationMode,
    needleOffset: program.needleOffset,
    protectFirstBodyRow: program.protectFirstBodyRow !== false,
    swatchConfirmed: program.swatchConfirmed,
    recipeOverrides: program.recipeOverrides,
    userIntent: program.userIntent,
  }
  return deriveKniterateExportState(transientConfig, program.recipe)
}

/** Single source of truth for the `CompileChartInput` shape that the
 *  wizard derives from a `PatternProgram`. Both `compileExport` (the
 *  actual compile) and any consumer hashing the input (the Run/Checks
 *  panel) MUST go through this function so the artifact's `inputHash`
 *  can't drift from what the compiler actually sees.
 *
 *  Phase 2 (2026-05-24): refactored to take PatternProgram. The legacy
 *  `(chart, keyPalette, state, capabilities)` signature is intentionally
 *  removed — the wizard panel can no longer hand-build a
 *  KniterateExportState; it MUST build a PatternProgram first. */
export function buildCompileInputForExport(
  program: PatternProgram,
  options: CompileExportOptions,
): Parameters<typeof compileChartToKnitout>[0] {
  if (!program.chart) {
    throw new Error('buildCompileInputForExport: PatternProgram.chart is required')
  }
  const state = deriveStateFromProgram(program)
  return {
    chart: materializeColorworkGridPlacementsForExport(program.chart, options.keyPalette),
    keyPalette: options.keyPalette,
    yarnBindings: [...program.yarns],
    backBedStyle: state.backBedStyle,
    birdseyeMode: state.birdseyeMode,
    bindOff: state.bindOff,
    bindOffMachineConfig: state.bindOffMachineConfig,
    fairisleParkConfig: state.fairisleParkConfig,
    fairisleCarrierIntro: state.fairisleCarrierIntro,
    wasteCarrierOverride: state.wasteCarrierOverride,
    drawCarrierOverride: state.drawCarrierOverride,
    wasteMachineConfig: state.wasteMachineConfig,
    wastePasses: state.wastePasses,
    kniterate: {
      // Recipe-driven extension headers first so the wizard's per-field
      // scalar controls (stitch/speed/roller/xfer) win on overlap.
      ...(state.extensionHeaderOverrides ?? {}),
      stitchNumber: state.stitchNumber,
      speedNumber: state.speedNumber,
      rollerAdvance: state.rollerAdvance,
      xferStitchNumber: state.xferStitchNumber,
    },
    experimental6ColorMode: state.carrierMode === 'experimental',
    needleOffset: state.needleOffset,
    protectFirstBodyRow: state.protectFirstBodyRow !== false,
    developerMode: options.developerMode,
    // The recipe's validation policy (today: float ceiling) reaches
    // the compiler through here. PatternProgram.recipe carries the
    // active recipe — when `null`, no policy is applied.
    floatPolicy: options.floatPolicy ?? program.recipe?.validation.floats,
  }
}

export function compileExport(
  program: PatternProgram,
  options: CompileExportOptions,
): CompileChartResult {
  return compileChartToKnitout(buildCompileInputForExport(program, options))
}

/** Phase 2 (2026-05-24): for tests + the stub builds that don't have
 *  recipe/overrides plumbing yet, this back-compat wrapper accepts the
 *  legacy `(chart, palette, state)` triple and synthesizes a
 *  PatternProgram with no recipe + empty overrides + the state folded
 *  back into the program. Equivalent to the previous compileExport
 *  call shape; production code should NOT use this. */
export function compileExportFromState(
  chart: KnitlabChartState,
  keyPalette: KnitlabKeyDefinition[],
  state: KniterateExportState,
  capabilities: CompileExportCapabilities = {},
): CompileChartResult {
  const program: PatternProgram = {
    chart,
    recipe: null,
    yarns: state.bindings,
    allocationMode: state.carrierMode,
    needleOffset: state.needleOffset,
    protectFirstBodyRow: state.protectFirstBodyRow !== false,
    swatchConfirmed: state.swatchConfirmed,
    recipeOverrides: foldStateToOverrides(state),
  }
  return compileExport(program, {
    keyPalette,
    developerMode: capabilities.developerMode,
  })
}

/** Materialize the .k text from a successful compile, or null if the
 *  compile failed. Used by the visualizer iframe handoff (G3+G17) so
 *  the modal can postMessage the knitout text into the embedded
 *  visualizer without re-importing the emitter. */
export function serializeKnitout(result: CompileChartResult): string | null {
  if (!result.ok || !result.program) return null
  return writeKnitoutProgram(result.program)
}

/** Trigger a browser download of the .k file. Pure-browser helper —
 *  CLI callers should write the program text themselves. */
export function downloadKnitout(filename: string, result: CompileChartResult): void {
  if (!result.ok || !result.program) return
  const text = writeKnitoutProgram(result.program)
  const blob = new Blob([text], { type: 'text/plain; charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename.endsWith('.k') ? filename : `${filename}.k`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

/** Generate the notes.md content (knitter's checklist + how to make
 *  the .kc + visualizer handoff). */
export function generateNotesMd(
  chart: KnitlabChartState,
  state: KniterateExportState,
  result: CompileChartResult,
): string {
  if (!result.ok) return '# Compile failed\n\nFix errors and re-export.\n'
  const program = result.program!
  const yarnLines = state.bindings.map(b => `- Carrier **${b.carrier}**: ${b.name}`).join('\n')
  const warnings = result.messages
    .filter(m => m.severity === 'warning')
    .map(m => `- ${m.message}`)
    .join('\n') || '_None._'
  const baseName = chart.name?.replace(/\s+/g, '_').toLowerCase() ?? 'mychart'
  // Cast-on instruction varies by carrier mode. Per Cameron's
  // 2025-09-20 reservation (see [[reference-cameron-kniterate-conventions]]):
  //   - default mode (1-4 pattern colors): C1 = draw thread, C6 = waste
  //     yarn, both on separate carriers from the pattern.
  //   - experimental mode (5-6 pattern colors): draw thread dropped; C1
  //     freed for pattern use. Waste yarn still loads on a separate
  //     carrier from pattern when one is spare; in the all-6-bound case
  //     it shares with the last pattern color (notes must say so).
  // G18 (2026-05-18) + G18.2: the waste-carrier choice is shared with the
  // engine via selectExperimentalWasteCarrier so the binding-map, the
  // engine's waste pass, and these notes can't drift apart.
  const patternCarriers = state.bindings.map(b => b.carrier)
  const { carrier: wasteCarrier, isShared } = selectExperimentalWasteCarrier(patternCarriers)
  const castOnLine = state.carrierMode === 'experimental'
    ? (isShared
        ? `- ⚠ Experimental 6-color mode: draw thread disabled and all 6 carriers carry pattern yarn. Waste rows will knit in the color on carrier **${wasteCarrier}** (no spare carrier); cast-on separation is harder without a dedicated waste yarn.`
        : `- ⚠ Experimental 6-color mode: draw thread disabled. Waste yarn on carrier **${wasteCarrier}** (the unbound carrier); cast-on separation is harder without the draw thread.`)
    : '- Draw thread on carrier **1**, waste yarn on carrier **6** (Cameron\'s convention; both reserved from pattern).'
  return `# Knitting card — ${chart.name ?? chart.id}

## At the machine

### Yarn loading
${yarnLines}

### Machine settings
- Stitch number: **${state.stitchNumber}**
- Speed: **${state.speedNumber}**
- Roller advance: **${state.rollerAdvance}**
- Xfer stitch number: **${state.xferStitchNumber}**
- Bind-off style: ${state.bindOff}

### Cast-on
- Waste passes: ${state.wastePasses}
${castOnLine}

### Chart info
- Rows: ${chart.rows}
- Stitches: ${chart.cols}
- Back-bed scheme: ${state.backBedStyle}${state.backBedStyle === 'birdseye' && state.birdseyeMode ? ` (${state.birdseyeMode})` : ''}
- Total knitout ops: ${program.ops.length}

## Pre-flight warnings

${warnings}

## Make the .kc (Kniterate-runnable file)

The browser exports the \`.k\` (knitout text). Converting it to \`.kc\`
(the Kniterate's executable format) runs out-of-browser:

**In the knitlab2 monorepo:**

\`\`\`
pnpm tsx scripts/knitout-to-kcode.ts ${baseName}.k
# → ${baseName}.kc
\`\`\`

**Or:** upload the \`.k\` to the [Textiles Lab Kniterate backend][backend]
(stays on your machine; same vendored converter, web-hosted). Both
paths produce the same \`.kc\` from the same \`.k\`.

[backend]: https://textiles-lab.github.io/knitout-backend-kniterate/

## Preview in a knitout visualizer

Before sending the \`.k\` to the backend, load it into a knitout
visualizer to inspect the stitch graph by eye. These tools are for
**preview / inspection only** — they do not confirm correctness and
make no claim about how the file will behave on the machine.

Same upstream vendor regardless of which host you use:

- **Bundled with knitlab (preferred):** if your knitlab dev server is
  running, open \`/knitlab/visualizer/\` on the same origin (typically
  http://localhost:5295/knitlab/visualizer/). Nothing leaves your machine.
- [Textiles Lab live visualizer](https://textiles-lab.github.io/knitout-live-visualizer/)
- [Cameron's hosted fork](https://agnescameron.github.io/knitout-live-visualizer/)

**How:** download the \`.k\` (the button next to this notes file), open
the visualizer, then load the file via its local-file picker. The
\`.k\` file itself is never uploaded — all three visualizers parse it
in the browser. (External hosts still serve the visualizer page
itself; the local option avoids even that.)

**Checklist while inspecting:**

- Waste section and cast-on shape look like a normal both-beds anchor row?
- Carrier colors match the yarn binding you intended? (C${state.bindings[0]?.carrier ?? '?'} = ${state.bindings[0]?.name ?? 'main yarn'})
- Row direction alternates correctly across the body?
- No unexpected transfers / drops mid-body?
- Final bind-off matches the chosen style (\`${state.bindOff}\`)?

A clean visualizer view doesn't prove the \`.kc\` will knit cleanly —
that needs backend compile, bed-state simulation, and ultimately a
physical swatch. Use the visualizer to catch gross knitout mistakes
(wrong bed, missing rows, carrier confusion) early.

## After knitting

1. Snip carriers, lift the piece off the bed.
2. If using draw thread, pull it out to separate the waste section.
3. If using \`waste-and-drop\` bind-off, the live stitches are released
   into the waste yarn; finish by hand or with a linker.

_Generated by knitlab Kniterate export_
`
}

/** Browser download helper for arbitrary text content (notes.md etc). */
export function downloadText(filename: string, content: string, mime = 'text/plain'): void {
  const blob = new Blob([content], { type: mime + '; charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
