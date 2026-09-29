import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { buildCustomistRibBeanieProgram, ribBed } from '../../src/knitout/passes/customist-rib-beanie.js'
import { writeKnitoutProgram } from '../../src/knitout/emitter.js'
import { authoredKnitoutToKCodeWithTrace } from '../../src/knitout/kniterate/to-kcode.js'
import { diffKCodeMachineTrace } from '../../src/knitout/kc-diff.js'
import { KNITERATE_7GG_KCODE_PROFILE_V2 } from '../../src/knitout/kcode/machine-profile.js'
import { parseKCodeDocument } from '../../src/knitout/kcode/parser.js'
import { projectKCodeMachineTrace } from '../../src/knitout/kcode/machine-trace.js'
import { validateKCodeMachineTrace } from '../../src/knitout/kcode/machine-validator.js'
import { renderRibBeanieCrownModule } from '../../scripts/extract-rib-beanie-crown.js'

const REFERENCE = resolve(__dirname, '../../reference/2x2-rib-beanie.kc')
// Knitout needles 30-223 land on the reference's KCode columns 29-222.
const PIECE = { needleStart: 30, needleEnd: 223, bodyCarrier: '3', wasteCarrier: '6', drawCarrier: '1' } as const

function kcode(ribRows: number): string {
  const converted = authoredKnitoutToKCodeWithTrace(writeKnitoutProgram(buildCustomistRibBeanieProgram({ ...PIECE, ribRows, crown: 'customist-194' })))
  if (!converted.ok) throw new Error(converted.error)
  return converted.kcode
}

describe('Customist 2x2 rib beanie', () => {
  it('reproduces reference/2x2-rib-beanie.kc exactly at its 102 rib rows', { timeout: 60_000 }, () => {
    const diff = diffKCodeMachineTrace(kcode(102), readFileSync(REFERENCE, 'utf8'), {
      profile: KNITERATE_7GG_KCODE_PROFILE_V2, dialect: 'knitout-vendor', maxDeltas: 20,
    })
    expect(diff.status).toBe('compared')
    expect(diff.identical).toBe(true)
  })

  it('regenerates the crown data from the reference byte for byte', () => {
    const committed = readFileSync(resolve(__dirname, '../../src/knitout/passes/customist-rib-beanie-crown.ts'), 'utf8')
    expect(renderRibBeanieCrownModule(readFileSync(REFERENCE, 'utf8'))).toBe(committed)
  })

  it('stays machine-valid at other heights, adding exactly one pass per rib row', { timeout: 60_000 }, () => {
    for (const ribRows of [40, 160]) {
      const parsed = parseKCodeDocument(kcode(ribRows), { profile: KNITERATE_7GG_KCODE_PROFILE_V2, dialect: 'knitout-vendor', strict: true })
      expect(parsed.ok).toBe(true)
      if (!parsed.ok) continue
      const trace = projectKCodeMachineTrace(parsed.document, KNITERATE_7GG_KCODE_PROFILE_V2)
      expect(trace.passes).toHaveLength(530 + ribRows - 102)
      const report = validateKCodeMachineTrace(trace, KNITERATE_7GG_KCODE_PROFILE_V2)
      expect(report.diagnostics.filter((diagnostic) => diagnostic.severity === 'error')).toEqual([])
    }
  })

  it('refuses widths the replayed crown was not captured for', () => {
    expect(() => buildCustomistRibBeanieProgram({ ...PIECE, needleEnd: 227, ribRows: 60, crown: 'customist-194' })).toThrow(/194 needles/)
    expect(() => buildCustomistRibBeanieProgram({ ...PIECE, needleEnd: 226, ribRows: 60, crown: 'none' })).toThrow(/even/)
  })

  it('lays 2x2 rib as front offsets 1 and 2, rear 0 and 3', () => {
    expect([0, 1, 2, 3, 4, 5, 6, 7].map(ribBed).join('')).toBe('bffbbffb')
  })
})
