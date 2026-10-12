import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  diagnosticProseDirectives,
  effectiveGloballyExcludedMutations,
} from '../../scripts/kcode-mutation.js'

describe('KCode mutation suppression policy', () => {
  it('scopes diagnostic prose exclusions to one following AST node', () => {
    const directives = [
      'src/knitout/kcode/parser.ts',
      'src/knitout/kcode/machine-trace.ts',
      'src/knitout/kcode/machine-validator.ts',
      'src/knitout/kcode/scheduled-trace-diff.ts',
    ].flatMap((path) => diagnosticProseDirectives(resolve(import.meta.dirname, '../..', path)))

    expect(directives.length).toBeGreaterThan(0)
    expect(directives.every((directive) => directive.endLine - directive.startLine <= 5))
      .toBe(true)
    const traceDirectives = directives.filter((directive) =>
      directive.path.endsWith('machine-trace.ts'))
    expect(traceDirectives.length).toBeGreaterThanOrEqual(6)
    expect(traceDirectives.some((directive) =>
      directive.startLine <= 535 && directive.endLine >= 375)).toBe(false)
  })

  it('derives and rejects global mutation exclusions from effective configuration', async () => {
    await expect(effectiveGloballyExcludedMutations(
      resolve(import.meta.dirname, '../../stryker.config.mjs'),
    )).resolves.toEqual([])
  })
})
