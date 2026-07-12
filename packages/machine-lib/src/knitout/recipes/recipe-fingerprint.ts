/**
 * Phase 1 Slice A — recipe-fingerprint matcher.
 *
 * Used at the wizard-config migration boundary: a legacy persisted
 * `KniterateExportState` carries no recipe identity, but if its
 * recipe-projected fields exactly match `applyMachineRecipe(empty,
 * recipe)` for some registered recipe, that recipe's id can be
 * recovered as provenance.
 *
 * Strictness: every recipe-projected field must match by structural
 * equality. Chart/user-driven fields (`bindings`, `needleOffset`,
 * `carrierMode`, `protectFirstBodyRow`, `swatchConfirmed`, `schemaVersion`)
 * are ignored —
 * they're orthogonal to recipe identity.
 *
 * False-positive provenance is worse than detaching to manual; this
 * function biases toward `null` on any doubt (Decision 2 in
 * docs/kniterate-wizard-completion-plan.md §Phase 1).
 */

import {
  DEFAULT_KNITERATE_EXPORT_STATE,
  applyMachineRecipe,
  type KniterateExportState,
} from '../export-helpers.js'
import type { MachineRecipeRegistry } from './types.js'

/** Return the id of the registered recipe whose projection exactly
 *  matches the recipe-projected fields of `state`, or `null` if none
 *  match. */
export function matchRecipeFingerprint(
  state: KniterateExportState,
  registry: MachineRecipeRegistry,
): string | null {
  for (const recipe of registry.list()) {
    const projected = applyMachineRecipe(DEFAULT_KNITERATE_EXPORT_STATE, recipe)
    if (recipeProjectedFieldsEqual(state, projected)) return recipe.id
  }
  return null
}

/** Compare only the fields that `applyMachineRecipe` projects. Chart-
 *  driven fields are intentionally skipped — a user with different
 *  yarn bindings still has the same recipe identity. */
function recipeProjectedFieldsEqual(
  a: KniterateExportState,
  b: KniterateExportState,
): boolean {
  // Body
  if (a.stitchNumber !== b.stitchNumber) return false
  if (a.speedNumber !== b.speedNumber) return false
  if (a.rollerAdvance !== b.rollerAdvance) return false
  if (a.xferStitchNumber !== b.xferStitchNumber) return false
  if (a.backBedStyle !== b.backBedStyle) return false
  if (a.birdseyeMode !== b.birdseyeMode) return false
  // Start
  if (a.wastePasses !== b.wastePasses) return false
  if (a.wasteCarrierOverride !== b.wasteCarrierOverride) return false
  if (a.drawCarrierOverride !== b.drawCarrierOverride) return false
  if (!structuralEq(a.wasteMachineConfig, b.wasteMachineConfig)) return false
  if (!structuralEq(a.fairisleCarrierIntro, b.fairisleCarrierIntro)) return false
  // Finish
  if (a.bindOff !== b.bindOff) return false
  if (!structuralEq(a.bindOffMachineConfig, b.bindOffMachineConfig)) return false
  if (!structuralEq(a.fairisleParkConfig, b.fairisleParkConfig)) return false
  // Extension
  if (!structuralEq(a.extensionHeaderOverrides, b.extensionHeaderOverrides)) return false
  return true
}

/** Structural equality for the optional sub-objects in
 *  `KniterateExportState`. These are flat-ish records (arrays of
 *  numbers + scalar primitives), so a recursive walk that handles
 *  arrays + plain objects is enough. We deliberately don't reach for
 *  a general deepEqual library — these shapes are known and small.
 *  Exported so the migration boundary's fold-to-overrides can reuse
 *  the same comparison as the matcher. */
export function structuralEq(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (a === null || b === null) return false
  if (a === undefined || b === undefined) return false
  if (typeof a !== typeof b) return false
  if (typeof a === 'boolean' || typeof a === 'number' || typeof a === 'string') {
    return a === b
  }
  if (Array.isArray(a)) {
    if (!Array.isArray(b)) return false
    if (a.length !== b.length) return false
    for (let i = 0; i < a.length; i++) {
      if (!structuralEq(a[i], b[i])) return false
    }
    return true
  }
  if (Array.isArray(b)) return false
  if (typeof a !== 'object' || typeof b !== 'object') return false
  const aKeys = Object.keys(a as object)
  const bKeys = Object.keys(b as object)
  if (aKeys.length !== bKeys.length) return false
  for (const k of aKeys) {
    if (!Object.prototype.hasOwnProperty.call(b, k)) return false
    if (!structuralEq(
      (a as Record<string, unknown>)[k],
      (b as Record<string, unknown>)[k],
    )) return false
  }
  return true
}
