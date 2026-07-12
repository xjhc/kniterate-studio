/**
 * Phase 1 Slice A — wizard-config migration boundary.
 *
 * The persisted blob carried by saved knitlab1 charts (and its
 * predecessor formats) is V0/V1 `KniterateExportState`. The wizard
 * now wants V2 `KniterateWizardConfig`. This module is the seam:
 * any `unknown` blob arriving from storage runs through
 * `parseKniterateWizardConfig` and exits as a typed config.
 *
 * Path V0/V1 -> V2:
 *   1. Delegate scalar shape validation to the existing
 *      `parseKniterateConfig`.
 *   2. Try `matchRecipeFingerprint` to recover provenance. On match,
 *      adopt the recipe id with empty overrides — the user's saved
 *      state was exactly the recipe's projection, so no drift.
 *   3. On no match, fold the legacy state's recipe-projected fields
 *      into a `RecipeOverrides` patch under `recipeId: null`. Derive
 *      from that config will reproduce the legacy state's engine
 *      input, so the user's machine settings survive intact.
 *
 * Why fold instead of detaching with a no-overrides empty config: the
 * legacy state may have had hand-tuned stitch numbers, speed, roller
 * settings, etc. Dropping them silently is a UX regression.
 */

import { parseKniterateConfig } from './export-helpers.js'
import type { KniterateExportState } from './export-helpers.js'
import { normalizeColorMerges, type ColorMerge } from './color-merge.js'
import { normalizeRowTensionBlocks, type RowTensionBlock } from './row-tension-blocks.js'
import { matchRecipeFingerprint } from './recipes/recipe-fingerprint.js'
import type { MachineRecipeRegistry } from './recipes/types.js'
import {
  DEFAULT_KNITERATE_WIZARD_CONFIG,
  DEFAULT_USER_INTENT,
  KNITERATE_WIZARD_CONFIG_SCHEMA_VERSION,
  USER_INTENT_MAX,
  USER_INTENT_MIN,
  clampUserIntent,
  foldStateToOverrides,
  type KniterateWizardConfig,
  type RecipeOverrides,
  type SwatchTensionBand,
  type UserIntent,
} from './wizard-config.js'

export interface ParseKniterateWizardConfigResult {
  config: KniterateWizardConfig
  /** Warnings from the migration. Surfaced inline by the wizard UI so
   *  the user sees what changed during the upgrade. */
  warnings: string[]
}

export function parseKniterateWizardConfig(
  blob: unknown,
  registry: MachineRecipeRegistry,
): ParseKniterateWizardConfigResult {
  if (typeof blob !== 'object' || blob === null) {
    return {
      config: { ...DEFAULT_KNITERATE_WIZARD_CONFIG },
      warnings: ['kniterateWizardConfig: expected object; using defaults'],
    }
  }

  const blobObj = blob as Record<string, unknown>
  const claimedVersion = blobObj.schemaVersion

  if (claimedVersion === KNITERATE_WIZARD_CONFIG_SCHEMA_VERSION) {
    return validateV2(blobObj)
  }

  // V0/V1: legacy KniterateExportState. Delegate scalar shape parsing
  // and migrate the result.
  const legacy = parseKniterateConfig(blob)
  if (!legacy.config) {
    return {
      config: { ...DEFAULT_KNITERATE_WIZARD_CONFIG },
      warnings: [
        ...legacy.warnings,
        'kniterateWizardConfig: legacy blob unusable; loaded defaults',
      ],
    }
  }

  // parseKniterateConfig backfills optional fields with engine defaults
  // when the blob doesn't carry a value (e.g. `birdseyeMode = 'full'`
  // for any blob lacking it). For fingerprint matching + round-trip
  // correctness we need to preserve the original absences — a Customist
  // projection has `birdseyeMode: undefined`, so backfilling 'full'
  // breaks identity.
  const legacyState = restoreOriginalAbsences(legacy.config, blobObj)

  const matchedRecipeId = matchRecipeFingerprint(legacyState, registry)
  if (matchedRecipeId !== null) {
    return {
      config: {
        schemaVersion: KNITERATE_WIZARD_CONFIG_SCHEMA_VERSION,
        recipeId: matchedRecipeId,
        yarns: [...legacyState.bindings],
        colorMerges: [],
        rowTensionBlocks: [],
        allocationMode: legacyState.carrierMode,
        needleOffset: legacyState.needleOffset,
        protectFirstBodyRow: legacyState.protectFirstBodyRow !== false,
        swatchConfirmed: legacyState.swatchConfirmed,
        recipeOverrides: {},
      },
      warnings: [
        ...legacy.warnings,
        `kniterateWizardConfig: recovered recipe provenance "${matchedRecipeId}"`,
      ],
    }
  }

  return {
    config: {
      schemaVersion: KNITERATE_WIZARD_CONFIG_SCHEMA_VERSION,
      recipeId: null,
      yarns: [...legacyState.bindings],
      colorMerges: [],
      rowTensionBlocks: [],
      allocationMode: legacyState.carrierMode,
      needleOffset: legacyState.needleOffset,
      protectFirstBodyRow: legacyState.protectFirstBodyRow !== false,
      swatchConfirmed: legacyState.swatchConfirmed,
      recipeOverrides: foldStateToOverrides(legacyState),
    },
    warnings: [
      ...legacy.warnings,
      'kniterateWizardConfig: legacy state did not match any registered recipe; loaded as detached manual config',
    ],
  }
}

/** Restore optional fields that `parseKniterateConfig` backfilled with
 *  engine defaults. We need the parsed state to mirror what the blob
 *  actually carried, not what the parser thought looked safe. Currently
 *  `birdseyeMode` is the only field with this issue (the parser
 *  injects `'full'` when the blob's value is undefined, but Customist's
 *  projection has `birdseyeMode: undefined`). If more fields turn out
 *  to suffer the same backfill, add them here. */
function restoreOriginalAbsences(
  state: KniterateExportState,
  rawBlob: Record<string, unknown>,
): KniterateExportState {
  if (rawBlob.birdseyeMode === undefined) {
    return { ...state, birdseyeMode: undefined }
  }
  return state
}

/** V2 blob validation. Conservative: drops malformed sub-fields with
 *  a warning rather than rejecting the whole blob. */
function validateV2(blob: Record<string, unknown>): ParseKniterateWizardConfigResult {
  const warnings: string[] = []
  const recipeId =
    blob.recipeId === null || typeof blob.recipeId === 'string'
      ? (blob.recipeId as string | null)
      : null
  if (blob.recipeId !== undefined && blob.recipeId !== null && typeof blob.recipeId !== 'string') {
    warnings.push('recipeId: expected string or null; coerced to null')
  }

  const yarns = Array.isArray(blob.yarns)
    ? (blob.yarns.filter(isYarnBindingLike) as KniterateWizardConfig['yarns'])
    : []
  if (!Array.isArray(blob.yarns)) {
    warnings.push('yarns: expected array; coerced to empty')
  }

  const colorMerges = parseColorMerges(blob.colorMerges, warnings)
  const rowTensionBlocks = parseRowTensionBlocks(blob.rowTensionBlocks, warnings)

  const allocationMode: KniterateWizardConfig['allocationMode'] =
    blob.allocationMode === 'experimental' || blob.allocationMode === 'default'
      ? blob.allocationMode
      : 'default'
  if (
    blob.allocationMode !== undefined
    && blob.allocationMode !== 'experimental'
    && blob.allocationMode !== 'default'
  ) {
    warnings.push(`allocationMode: expected 'default'|'experimental'; coerced to 'default'`)
  }

  const needleOffset =
    typeof blob.needleOffset === 'number' && Number.isFinite(blob.needleOffset)
      ? blob.needleOffset
      : undefined

  const swatchConfirmed =
    typeof blob.swatchConfirmed === 'boolean' ? blob.swatchConfirmed : undefined
  const protectFirstBodyRow =
    typeof blob.protectFirstBodyRow === 'boolean' ? blob.protectFirstBodyRow : true
  if (blob.protectFirstBodyRow !== undefined && typeof blob.protectFirstBodyRow !== 'boolean') {
    warnings.push('protectFirstBodyRow: expected boolean; enabled')
  }

  const recipeOverrides = parseRecipeOverrides(blob.recipeOverrides, warnings)

  const userIntent = parseUserIntent(blob.userIntent, warnings)

  const swatch = parseSwatch(blob.swatch, warnings)

  return {
    config: {
      schemaVersion: KNITERATE_WIZARD_CONFIG_SCHEMA_VERSION,
      recipeId,
      yarns,
      colorMerges,
      rowTensionBlocks,
      allocationMode,
      needleOffset,
      protectFirstBodyRow,
      swatchConfirmed,
      recipeOverrides,
      userIntent,
      swatch,
    },
    warnings,
  }
}

function parseColorMerges(raw: unknown, warnings: string[]): ColorMerge[] {
  if (raw === undefined) return []
  if (!Array.isArray(raw)) {
    warnings.push('colorMerges: expected array; coerced to empty')
    return []
  }
  const merges: ColorMerge[] = []
  raw.forEach((entry, idx) => {
    if (!isPlainObject(entry)) {
      warnings.push(`colorMerges[${idx}]: expected object; entry dropped`)
      return
    }
    if (typeof entry.fromKeyId !== 'string' || typeof entry.toKeyId !== 'string') {
      warnings.push(`colorMerges[${idx}]: expected fromKeyId/toKeyId strings; entry dropped`)
      return
    }
    merges.push({ fromKeyId: entry.fromKeyId, toKeyId: entry.toKeyId })
  })
  return normalizeColorMerges(merges)
}

function parseRowTensionBlocks(raw: unknown, warnings: string[]): RowTensionBlock[] {
  if (raw === undefined) return []
  if (!Array.isArray(raw)) {
    warnings.push('rowTensionBlocks: expected array; coerced to empty')
    return []
  }
  const blocks: RowTensionBlock[] = []
  raw.forEach((entry, idx) => {
    if (!isPlainObject(entry)) {
      warnings.push(`rowTensionBlocks[${idx}]: expected object; block dropped`)
      return
    }
    const startRow = asFiniteNumber(entry.startRow)
    const endRow = asFiniteNumber(entry.endRow)
    const stitchNumber = asFiniteNumber(entry.stitchNumber)
    if (
      startRow === undefined
      || endRow === undefined
      || !Number.isInteger(startRow)
      || !Number.isInteger(endRow)
      || startRow < 0
      || endRow < startRow
    ) {
      warnings.push(`rowTensionBlocks[${idx}]: expected integer startRow/endRow range; block dropped`)
      return
    }
    if (
      stitchNumber === undefined
      || !Number.isInteger(stitchNumber)
      || stitchNumber < 1
      || stitchNumber > 35
    ) {
      warnings.push(`rowTensionBlocks[${idx}].stitchNumber: expected integer 1-35; block dropped`)
      return
    }
    blocks.push({ startRow, endRow, stitchNumber })
  })
  return normalizeRowTensionBlocks(blocks, Number.MAX_SAFE_INTEGER)
}

/** Parse a persisted `swatch` blob. Bad bands are DROPPED with a warning
 *  (not clamped) so corrupt saved calibration intent stays visible
 *  rather than being silently rewritten — live UI edits clamp instead.
 *  Stitch numbers must be integers 1–35; rows positive integers. */
function parseSwatch(
  raw: unknown,
  warnings: string[],
): KniterateWizardConfig['swatch'] | undefined {
  if (raw === undefined) return undefined
  if (!isPlainObject(raw)) {
    warnings.push('swatch: expected object; dropped')
    return undefined
  }
  if (!Array.isArray(raw.tensionBands)) {
    warnings.push('swatch.tensionBands: expected array; dropped')
    return undefined
  }
  const bands: SwatchTensionBand[] = []
  raw.tensionBands.forEach((entry, idx) => {
    if (!isPlainObject(entry)) {
      warnings.push(`swatch.tensionBands[${idx}]: expected object; band dropped`)
      return
    }
    const stitchNumber = asFiniteNumber(entry.stitchNumber)
    const rows = asFiniteNumber(entry.rows)
    if (stitchNumber === undefined || !Number.isInteger(stitchNumber) || stitchNumber < 1 || stitchNumber > 35) {
      warnings.push(`swatch.tensionBands[${idx}].stitchNumber: expected integer 1-35; band dropped`)
      return
    }
    if (rows === undefined || !Number.isInteger(rows) || rows < 1) {
      warnings.push(`swatch.tensionBands[${idx}].rows: expected positive integer; band dropped`)
      return
    }
    bands.push({ stitchNumber, rows })
  })
  return bands.length > 0 ? { tensionBands: bands } : undefined
}

const VALID_BIRDSEYE_MODES = new Set<'minimal' | 'full'>(['minimal', 'full'])
const VALID_BACK_BED_STYLES = new Set<'ladder' | 'lined' | 'birdseye' | 'floats'>([
  'ladder', 'lined', 'birdseye', 'floats',
])
const VALID_BIND_OFF_STYLES = new Set<
  'machine-bindoff' | 'waste-and-drop' | 'drop' | 'fairisle-park-bindoff'
>(['machine-bindoff', 'waste-and-drop', 'drop', 'fairisle-park-bindoff'])
const VALID_CARRIERS = new Set<string>(['1', '2', '3', '4', '5', '6'])

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function asFiniteNumber(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined
}

/** Validate a persisted `RecipeOverrides` blob field-by-field. Unknown
 *  fields are dropped silently (forward-compat for new override slots);
 *  malformed *known* fields are dropped with a warning. Nested
 *  machine-config objects are passed through as opaque records once
 *  shape-checked — full deep validation lives in the engine consumers
 *  (`applyMachineRecipe`, the per-pass builders) so the migration
 *  surface stays focused on the persisted-blob trust boundary. */
function parseRecipeOverrides(blob: unknown, warnings: string[]): RecipeOverrides {
  if (blob === undefined) return {}
  if (!isPlainObject(blob)) {
    warnings.push('recipeOverrides: expected object; coerced to empty')
    return {}
  }
  const out: RecipeOverrides = {}

  const body = parseBodyOverrides(blob.body, warnings)
  if (body) out.body = body

  const start = parseStartOverrides(blob.start, warnings)
  if (start) out.start = start

  const finish = parseFinishOverrides(blob.finish, warnings)
  if (finish) out.finish = finish

  if (blob.extensionHeaders !== undefined) {
    if (blob.extensionHeaders === null) {
      out.extensionHeaders = null
    } else if (isPlainObject(blob.extensionHeaders)) {
      // Opaque pass-through; the engine's renderer is the consumer of
      // record for individual extension header keys.
      out.extensionHeaders = blob.extensionHeaders as RecipeOverrides['extensionHeaders']
    } else {
      warnings.push('recipeOverrides.extensionHeaders: expected object or null; dropped')
    }
  }

  return out
}

function parseBodyOverrides(
  raw: unknown,
  warnings: string[],
): NonNullable<RecipeOverrides['body']> | undefined {
  if (raw === undefined) return undefined
  if (!isPlainObject(raw)) {
    warnings.push('recipeOverrides.body: expected object; dropped')
    return undefined
  }
  const body: NonNullable<RecipeOverrides['body']> = {}
  for (const key of ['stitchNumber', 'speedNumber', 'rollerAdvance', 'xferStitchNumber'] as const) {
    if (raw[key] !== undefined) {
      const n = asFiniteNumber(raw[key])
      if (n !== undefined) body[key] = n
      else warnings.push(`recipeOverrides.body.${key}: expected finite number; dropped`)
    }
  }
  if (raw.backBedStyle !== undefined) {
    if (typeof raw.backBedStyle === 'string'
      && VALID_BACK_BED_STYLES.has(raw.backBedStyle as 'ladder')) {
      body.backBedStyle = raw.backBedStyle as 'ladder' | 'lined' | 'birdseye' | 'floats'
    } else {
      warnings.push(`recipeOverrides.body.backBedStyle: invalid "${String(raw.backBedStyle)}"; dropped`)
    }
  }
  if (raw.birdseyeMode !== undefined) {
    if (raw.birdseyeMode === null) {
      body.birdseyeMode = null
    } else if (typeof raw.birdseyeMode === 'string'
      && VALID_BIRDSEYE_MODES.has(raw.birdseyeMode as 'minimal')) {
      body.birdseyeMode = raw.birdseyeMode as 'minimal' | 'full'
    } else {
      warnings.push(`recipeOverrides.body.birdseyeMode: invalid "${String(raw.birdseyeMode)}"; dropped`)
    }
  }
  return Object.keys(body).length > 0 ? body : undefined
}

function parseStartOverrides(
  raw: unknown,
  warnings: string[],
): NonNullable<RecipeOverrides['start']> | undefined {
  if (raw === undefined) return undefined
  if (!isPlainObject(raw)) {
    warnings.push('recipeOverrides.start: expected object; dropped')
    return undefined
  }
  const start: NonNullable<RecipeOverrides['start']> = {}

  if (raw.wastePasses !== undefined) {
    const n = asFiniteNumber(raw.wastePasses)
    if (n !== undefined) start.wastePasses = n
    else warnings.push('recipeOverrides.start.wastePasses: expected finite number; dropped')
  }

  if (raw.wasteCarrierOverride !== undefined) {
    if (raw.wasteCarrierOverride === null) {
      start.wasteCarrierOverride = null
    } else if (typeof raw.wasteCarrierOverride === 'string'
      && VALID_CARRIERS.has(raw.wasteCarrierOverride)) {
      start.wasteCarrierOverride = raw.wasteCarrierOverride as RecipeOverrides['start'] extends infer S
        ? S extends { wasteCarrierOverride?: infer T } ? Exclude<T, null | undefined> : never
        : never
    } else {
      warnings.push(`recipeOverrides.start.wasteCarrierOverride: invalid "${String(raw.wasteCarrierOverride)}"; dropped`)
    }
  }

  if (raw.drawCarrierOverride !== undefined) {
    if (raw.drawCarrierOverride === null) {
      start.drawCarrierOverride = null
    } else if (raw.drawCarrierOverride === 'none') {
      start.drawCarrierOverride = 'none'
    } else if (typeof raw.drawCarrierOverride === 'string'
      && VALID_CARRIERS.has(raw.drawCarrierOverride)) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      start.drawCarrierOverride = raw.drawCarrierOverride as any
    } else {
      warnings.push(`recipeOverrides.start.drawCarrierOverride: invalid "${String(raw.drawCarrierOverride)}"; dropped`)
    }
  }

  if (raw.wasteMachineConfig !== undefined) {
    if (raw.wasteMachineConfig === null) {
      start.wasteMachineConfig = null
    } else if (isPlainObject(raw.wasteMachineConfig)) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      start.wasteMachineConfig = raw.wasteMachineConfig as any
    } else {
      warnings.push('recipeOverrides.start.wasteMachineConfig: expected object or null; dropped')
    }
  }

  if (raw.fairisleCarrierIntro !== undefined) {
    if (raw.fairisleCarrierIntro === null) {
      start.fairisleCarrierIntro = null
    } else if (isPlainObject(raw.fairisleCarrierIntro)) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      start.fairisleCarrierIntro = raw.fairisleCarrierIntro as any
    } else {
      warnings.push('recipeOverrides.start.fairisleCarrierIntro: expected object or null; dropped')
    }
  }

  return Object.keys(start).length > 0 ? start : undefined
}

function parseFinishOverrides(
  raw: unknown,
  warnings: string[],
): NonNullable<RecipeOverrides['finish']> | undefined {
  if (raw === undefined) return undefined
  if (!isPlainObject(raw)) {
    warnings.push('recipeOverrides.finish: expected object; dropped')
    return undefined
  }
  const finish: NonNullable<RecipeOverrides['finish']> = {}

  if (raw.bindOff !== undefined) {
    if (typeof raw.bindOff === 'string' && VALID_BIND_OFF_STYLES.has(raw.bindOff as 'drop')) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      finish.bindOff = raw.bindOff as any
    } else {
      warnings.push(`recipeOverrides.finish.bindOff: invalid "${String(raw.bindOff)}"; dropped`)
    }
  }

  if (raw.bindOffMachineConfig !== undefined) {
    if (raw.bindOffMachineConfig === null) {
      finish.bindOffMachineConfig = null
    } else if (isPlainObject(raw.bindOffMachineConfig)) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      finish.bindOffMachineConfig = raw.bindOffMachineConfig as any
    } else {
      warnings.push('recipeOverrides.finish.bindOffMachineConfig: expected object or null; dropped')
    }
  }

  if (raw.fairisleParkConfig !== undefined) {
    if (raw.fairisleParkConfig === null) {
      finish.fairisleParkConfig = null
    } else if (isPlainObject(raw.fairisleParkConfig)) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      finish.fairisleParkConfig = raw.fairisleParkConfig as any
    } else {
      warnings.push('recipeOverrides.finish.fairisleParkConfig: expected object or null; dropped')
    }
  }

  return Object.keys(finish).length > 0 ? finish : undefined
}

function parseUserIntent(blob: unknown, warnings: string[]): UserIntent {
  if (blob === undefined) return { ...DEFAULT_USER_INTENT }
  if (typeof blob !== 'object' || blob === null) {
    warnings.push('userIntent: expected object; coerced to recipe defaults')
    return { ...DEFAULT_USER_INTENT }
  }
  const raw = blob as Record<string, unknown>
  const rawDensity = typeof raw.density === 'number' && Number.isFinite(raw.density)
    ? raw.density
    : DEFAULT_USER_INTENT.density
  const rawSpeed = typeof raw.speed === 'number' && Number.isFinite(raw.speed)
    ? raw.speed
    : DEFAULT_USER_INTENT.speed
  // Warn only when the rounded value is out of bounds — silent snap to
  // nearest integer is fine (the blob may have been hand-edited or
  // generated by a future float-step UI; either way the user doesn't
  // need to be told about the rounding, only about the saturation).
  const roundedDensity = Math.round(rawDensity)
  const roundedSpeed = Math.round(rawSpeed)
  const clamped = clampUserIntent({ density: rawDensity, speed: rawSpeed })
  if (roundedDensity < USER_INTENT_MIN || roundedDensity > USER_INTENT_MAX) {
    warnings.push(
      `userIntent.density: ${rawDensity} out of slider range; clamped to ${clamped.density} (allowed ${USER_INTENT_MIN}..${USER_INTENT_MAX})`,
    )
  }
  if (roundedSpeed < USER_INTENT_MIN || roundedSpeed > USER_INTENT_MAX) {
    warnings.push(
      `userIntent.speed: ${rawSpeed} out of slider range; clamped to ${clamped.speed} (allowed ${USER_INTENT_MIN}..${USER_INTENT_MAX})`,
    )
  }
  return clamped
}

function isYarnBindingLike(value: unknown): boolean {
  if (typeof value !== 'object' || value === null) return false
  const v = value as Record<string, unknown>
  return (
    typeof v.keyId === 'string'
    && typeof v.carrier === 'string'
    && typeof v.name === 'string'
  )
}
