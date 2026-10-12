import { appendFileSync } from 'node:fs'

export type KCodeRuntimeWitnessRail = 'raw-kcode-parser' | 'machine-trace-validator'

export interface KCodeRuntimeDiagnostic {
  readonly rule: string
  readonly severity: 'error' | 'warning'
}

/**
 * The proof ledger launches selected Vitest files with a private sidecar path.
 * Recording is inert in normal test runs. Each line is an observed diagnostic,
 * not a lexical assertion or a copy of the production rule declarations.
 */
export function recordKCodeRuntimeRules(
  rail: KCodeRuntimeWitnessRail,
  sourcePath: string,
  diagnostics: readonly (string | KCodeRuntimeDiagnostic)[],
): void {
  const outputPath = process.env.KCODE_RULE_WITNESS_OUTPUT
  if (outputPath === undefined) return
  const unique = new Map<string, KCodeRuntimeDiagnostic>()
  for (const diagnostic of diagnostics) {
    const normalized = typeof diagnostic === 'string'
      ? { rule: diagnostic, severity: 'error' as const }
      : diagnostic
    unique.set(`${normalized.rule}:${normalized.severity}`, normalized)
  }
  for (const diagnostic of unique.values()) {
    appendFileSync(outputPath, `${JSON.stringify({
      kind: 'observation',
      rail,
      sourcePath,
      ...diagnostic,
    })}\n`)
  }
}

/** Record an asserted rule target together with the complete diagnostic set. */
export function recordKCodeTargetedRuntimeWitness(input: {
  readonly rail: KCodeRuntimeWitnessRail
  readonly sourcePath: string
  readonly caseId: string
  readonly expectedRule: string
  readonly expectedSeverity?: 'error' | 'warning'
  readonly diagnostics: readonly KCodeRuntimeDiagnostic[]
}): void {
  if (!input.diagnostics.some((diagnostic) => diagnostic.rule === input.expectedRule
    && (input.expectedSeverity === undefined || diagnostic.severity === input.expectedSeverity))) {
    throw new Error(`${input.caseId} did not emit expected ${input.expectedSeverity ?? ''} rule ${input.expectedRule}`)
  }
  const outputPath = process.env.KCODE_RULE_WITNESS_OUTPUT
  if (outputPath === undefined) return
  appendFileSync(outputPath, `${JSON.stringify({ kind: 'targeted', ...input })}\n`)
}
