/**
 * Phase 5 (2026-05-24): carriage-trace policy validator.
 *
 * Interprets `RunArtifact.predictedPasses` against a recipe's
 * `validation.carriage` policy and emits diagnostic messages. Today
 * the only policy is `maxAutoMoves`; more will follow (final park
 * side, carrier side mismatch, etc.) as use cases land.
 *
 * The validator is scoped to recipes whose `predictedPasses` trace is
 * trusted enough for the declared policy. Direction-aware ordering plus
 * explicit secondary-carrier pre-positioning removed the row-scaling
 * no-carrier moves from fairisle body handoff, so recipes can now declare
 * a stable auto-move ceiling even while the remaining whole-program
 * predicted-vs-vendor byte parity work continues in Phase E.
 */
import type { PredictedPass } from '../knitout/sim/types.js'
import type { RecipeCarriagePolicy } from '../knitout/recipes/types.js'
import type { ValidationMessage } from './knitout-program.js'

export interface CarriagePolicyReport {
  readonly messages: readonly ValidationMessage[]
  readonly errorCount: number
  readonly warningCount: number
}

/**
 * Validate `predictedPasses` against the recipe's carriage policy.
 * Returns an empty report when the policy is undefined or every gate
 * is unset; non-empty when any gate fires.
 */
export function validateCarriagePolicy(
  predictedPasses: readonly PredictedPass[],
  policy: RecipeCarriagePolicy | undefined,
): CarriagePolicyReport {
  if (!policy) return { messages: [], errorCount: 0, warningCount: 0 }
  const messages: ValidationMessage[] = []

  if (policy.maxAutoMoves) {
    const autoMoveCount = predictedPasses.reduce(
      (n, p) => (p.isAutoMove ? n + 1 : n),
      0,
    )
    if (autoMoveCount > policy.maxAutoMoves.threshold) {
      const severity: 'warning' | 'error' =
        policy.maxAutoMoves.mode === 'reject' ? 'error' : 'warning'
      messages.push({
        severity,
        rule: 'carriage-policy-max-auto-moves',
        message:
          `Carriage trace has ${autoMoveCount} auto-move pass${autoMoveCount === 1 ? '' : 'es'}` +
          ` (recipe ceiling: ${policy.maxAutoMoves.threshold}). ` +
          'Each auto-move is a vendor-inserted carriage move to ' +
          'reposition before a knit pass whose direction doesn\'t match ' +
          'runtime nextDirection. Tight-choreography recipes reduce ' +
          'these by re-ordering passes or adding explicit park moves.',
      })
    }
  }

  let errorCount = 0
  let warningCount = 0
  for (const m of messages) {
    if (m.severity === 'error') errorCount++
    else if (m.severity === 'warning') warningCount++
  }
  return { messages, errorCount, warningCount }
}
