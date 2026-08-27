import { appendFileSync } from 'node:fs'

export type KCodeRuntimeWitnessRail = 'raw-kcode-parser' | 'machine-trace-validator'

/**
 * The proof ledger launches selected Vitest files with a private sidecar path.
 * Recording is inert in normal test runs. Each line is an observed diagnostic,
 * not a lexical assertion or a copy of the production rule declarations.
 */
export function recordKCodeRuntimeRules(
  rail: KCodeRuntimeWitnessRail,
  sourcePath: string,
  rules: readonly string[],
): void {
  const outputPath = process.env.KCODE_RULE_WITNESS_OUTPUT
  if (outputPath === undefined) return
  for (const rule of new Set(rules)) {
    appendFileSync(outputPath, `${JSON.stringify({ rail, rule, sourcePath })}\n`)
  }
}
