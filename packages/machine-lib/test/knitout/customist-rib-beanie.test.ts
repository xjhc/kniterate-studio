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
import { EIGHT_LINE_CROWN_V1, planEightLineCrown } from '../../src/knitout/passes/rib-crown-plan.js'

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

describe('eight-line crown for any width', () => {
  /** Replays loop counts per needle through the trace; returns stitches per crown knit row and the deepest stack. */
  function replay(kcodeText: string) {
    const parsed = parseKCodeDocument(kcodeText, { profile: KNITERATE_7GG_KCODE_PROFILE_V2, dialect: 'knitout-vendor', strict: true })
    if (!parsed.ok) throw new Error('not strict KCode')
    const trace = projectKCodeMachineTrace(parsed.document, KNITERATE_7GG_KCODE_PROFILE_V2)
    const loops = new Map<string, number>()
    const key = (bed: string, column: number) => `${bed}${column}`
    const rows: number[] = []
    let deepest = 0
    for (const pass of trace.passes) {
      let knitted = 0
      for (const action of pass.actions) {
        if (action.kind === 'knit') { deepest = Math.max(deepest, loops.get(key(action.at.bed, action.at.kcodeColumn)) ?? 0); loops.set(key(action.at.bed, action.at.kcodeColumn), 1); knitted += 1 }
        else if (action.kind === 'drop') loops.set(key(action.at.bed, action.at.kcodeColumn), 0)
        else if (action.kind === 'xfer') {
          const from = key(action.source.bed, action.source.kcodeColumn), to = key(action.target.bed, action.target.kcodeColumn)
          loops.set(to, (loops.get(to) ?? 0) + (loops.get(from) ?? 0)); loops.set(from, 0)
        }
      }
      if (knitted > 0 && pass.carrier === '3') rows.push(knitted)
    }
    return { rows, deepest }
  }

  it('plans even, symmetric decreases within the machine limits at every width', () => {
    for (let width = 60; width <= 244; width += 4) {
      const plan = planEightLineCrown(width, '+')
      const steps = plan.counts.slice(1, -1).map((count, i) => plan.counts[i]! - count)
      expect(steps.every((removed) => removed === 16 || removed === 8), `width ${width}: ${plan.counts.join('>')}`).toBe(true)
      expect(plan.counts.at(-2)!).toBeGreaterThanOrEqual(EIGHT_LINE_CROWN_V1.minCrownStitches)
      expect(plan.maxLoopsPerNeedle).toBeLessThanOrEqual(2)
      for (const step of plan.steps) if (step[0] === 'x') expect(Math.abs(step[1])).toBeLessThanOrEqual(4)
    }
  })

  it('emits clean, strictly valid programs whose knitted stitches follow the plan', { timeout: 120_000 }, () => {
    for (const width of [98, 150, 194, 242]) {
      const needleStart = Math.floor((252 - width) / 2) + 1
      const converted = authoredKnitoutToKCodeWithTrace(writeKnitoutProgram(buildCustomistRibBeanieProgram({
        ...PIECE, needleStart, needleEnd: needleStart + width - 1, ribRows: 30, crown: 'eight-line',
      })))
      if (!converted.ok) throw new Error(converted.error)
      const parsed = parseKCodeDocument(converted.kcode, { profile: KNITERATE_7GG_KCODE_PROFILE_V2, dialect: 'knitout-vendor', strict: true })
      if (!parsed.ok) throw new Error('not strict KCode')
      const report = validateKCodeMachineTrace(projectKCodeMachineTrace(parsed.document, KNITERATE_7GG_KCODE_PROFILE_V2), KNITERATE_7GG_KCODE_PROFILE_V2)
      expect(report.diagnostics, `width ${width}`).toEqual([])
      const { rows, deepest } = replay(converted.kcode)
      const plan = planEightLineCrown(width, '+')
      // Rib body rows, then one crown row per plan count after the rib (top rows knit the top count).
      const crownRows = rows.slice(-plan.steps.filter((step) => step[0] === 'k').length)
      expect(new Set(crownRows)).toEqual(new Set(plan.counts.slice(1)))
      expect(deepest).toBeLessThanOrEqual(2)
    }
  })
})
