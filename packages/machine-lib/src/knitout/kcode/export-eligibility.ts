import type { MachineValidationReportV1 } from './machine-validator.js'

/**
 * The command-legality portion of every KCode export decision. Callers may
 * impose additional provenance, differential, or product-policy gates, but
 * they must not weaken this shared fail-closed predicate.
 */
export function isKCodeCommandLegalityExportEligible(input: {
  readonly parseOk: boolean
  readonly validation: MachineValidationReportV1 | null
}): boolean {
  return input.parseOk
    && input.validation?.ok === true
    && input.validation.profileConformance === 'conformant'
}
