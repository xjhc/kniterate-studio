import { describe, expect, it } from 'vitest'

import { KNITERATE_LOOP_STACK_SOFTWARE_POLICY_V1 } from '../../src/knitout/kcode/machine-profile.js'
import type { KniteratePlan } from '../../src/knitout/plan/types.js'
import { validateBedState } from '../../src/validators/bed-state.js'

function tuckPlan(count: number): KniteratePlan {
  return {
    passes: Array.from({ length: count }, (_, index) => ({
      index,
      purpose: index === 0 ? 'cast-on' : 'body',
      ops: [
        ...(index === 0 ? [{ kind: 'in' as const, carriers: ['2' as const] }] : []),
        {
          kind: 'tuck' as const,
          direction: (index % 2 === 0 ? '+' : '-') as '+' | '-',
          needle: { bed: 'f' as const, needle: 1 },
          carriers: ['2' as const],
        },
      ],
    })),
  } as KniteratePlan
}

describe('shared loop-stack software policy', () => {
  it.each([
    { count: 3, warningCount: 1, errorCount: 0, ok: true },
    { count: 4, warningCount: 1, errorCount: 1, ok: false },
    { count: 6, warningCount: 1, errorCount: 3, ok: false },
  ])('applies authored warning/error policy to $count tucks', ({
    count,
    warningCount,
    errorCount,
    ok,
  }) => {
    const report = validateBedState(tuckPlan(count))
    const stackMessages = report.messages.filter((message) =>
      message.rule === 'bed-state-too-many-loops')

    expect(KNITERATE_LOOP_STACK_SOFTWARE_POLICY_V1).toEqual({
      validationRole: 'conservative-software-policy',
      warningAbove: 2,
      errorAbove: 3,
      physicalSafetyClaim: 'not-established',
    })
    expect(report.ok).toBe(ok)
    expect(stackMessages.filter((message) =>
      message.severity === 'warning')).toHaveLength(warningCount)
    expect(stackMessages.filter((message) =>
      message.severity === 'error')).toHaveLength(errorCount)
    expect(stackMessages.every((message) =>
      message.message.includes('not a physical'))).toBe(true)
  })
})
