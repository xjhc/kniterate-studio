import type { MachineSafetyReportV1 } from './machine-safety.js'
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

/**
 * Every machine-file export decision: command legality and the machine-safety
 * envelope. A file that conforms to the command contract but breaks the
 * envelope must not reach the machine.
 */
export function isKCodeMachineExportEligible(input: {
  readonly parseOk: boolean
  readonly validation: MachineValidationReportV1 | null
  readonly safety: MachineSafetyReportV1 | null
}): boolean {
  return isKCodeCommandLegalityExportEligible(input)
    && input.safety?.ok === true
}
