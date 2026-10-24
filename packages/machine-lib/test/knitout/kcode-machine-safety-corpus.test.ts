import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import { KNITERATE_7GG_KCODE_PROFILE_V2 } from '../../src/knitout/kcode/machine-profile.js'
import { validateKCodeMachineSafetyV1 } from '../../src/knitout/kcode/machine-safety.js'
import { projectKCodeMachineTrace } from '../../src/knitout/kcode/machine-trace.js'
import { parseKCodeDocument } from '../../src/knitout/kcode/parser.js'

const profile = KNITERATE_7GG_KCODE_PROFILE_V2

// Kniterate's own programs set the envelope's observed limits, so any finding
// here would be a false positive. Kept out of the mutation suite: the 13 large
// files make every mutant slow, and the proof receipt audits them again.
describe('KCode machine-safety envelope on the reference corpus', () => {
  it('finds nothing in any reference program', () => {
    const findings: Record<string, number> = {}
    for (const name of readdirSync(resolve(__dirname, '../../reference')).filter((item) => item.endsWith('.kc')).sort()) {
      const parsed = parseKCodeDocument(readFileSync(resolve(__dirname, '../../reference', name), 'latin1'), {
        profile,
        dialect: 'knitout-vendor',
        strict: true,
      })
      expect(parsed.ok, name).toBe(true)
      const report = validateKCodeMachineSafetyV1(projectKCodeMachineTrace(parsed.document, profile), profile)
      if (!report.ok) findings[name] = report.errorCount
    }
    expect(findings).toEqual({})
  }, 60_000)
})
