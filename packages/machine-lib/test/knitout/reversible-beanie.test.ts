import { describe, expect, it } from 'vitest'
import { buildCustomistRibBeanieProgram, type CustomistRibBeanieInput } from '../../src/knitout/passes/customist-rib-beanie.js'
import { writeKnitoutProgram } from '../../src/knitout/emitter.js'
import { authoredKnitoutToKCodeWithTrace } from '../../src/knitout/kniterate/to-kcode.js'
import { parseKCodeDocument } from '../../src/knitout/kcode/parser.js'
import { projectKCodeMachineTrace } from '../../src/knitout/kcode/machine-trace.js'
import { KNITERATE_7GG_KCODE_PROFILE_V2 as profile } from '../../src/knitout/kcode/machine-profile.js'
import { validateKCodeMachineTrace } from '../../src/knitout/kcode/machine-validator.js'
import type { CarrierId } from '../../src/knitout/types.js'

const rows: CarrierId[][] = [
  Array<CarrierId>(12).fill('3'), Array<CarrierId>(12).fill('4'),
  Array.from({ length: 12 }, (_, x) => x % 2 ? '3' : '4'),
  Array.from({ length: 12 }, (_, x) => x < 2 || x > 8 ? '4' : '3'),
]
const input: CustomistRibBeanieInput = {
  needleStart: 120, needleEnd: 131, bodyCarrier: '3', wasteCarrier: '6', drawCarrier: '1',
  ribRows: 0, crown: 'none', straightDoubleJacquard: true, experimentalReversibleJacquard: true,
  topWasteRows: 8, bodySettings: { speed: 100 },
  sections: { waste: { speed: 100 }, castOn: { speed: 100 }, transfers: { speed: 100 } },
  jerseyBody: { backing: 'birdseye', rows },
}

describe('experimental reversible beanie', () => {
  it('refreshes the original rear-left waste loop before a new carrier can knit it', () => {
    for (const width of [32, 62, 98]) {
      const lo = Math.floor((252 - width) / 2) + 1
      for (const fixed of [false, true]) {
        const trial: CustomistRibBeanieInput = { ...input, needleStart: lo, needleEnd: lo + width - 1,
          jerseyBody: { backing: 'birdseye', rows: [Array.from({ length: width }, (_, x) => x % 3 ? '3' : '4')] },
          ...(fixed ? { experimentalStartup: 'run2-waste-and-intro' } : {}) }
        const converted = authoredKnitoutToKCodeWithTrace(writeKnitoutProgram(buildCustomistRibBeanieProgram(trial)))
        if (!converted.ok) throw new Error(converted.error)
        const parsed = parseKCodeDocument(converted.kcode, { profile, dialect: 'knitout-vendor', strict: true })
        if (!parsed.ok) throw new Error('strict parse failed')
        const trace = projectKCodeMachineTrace(parsed.document, profile)
        expect(validateKCodeMachineTrace(trace, profile).diagnostics).toEqual([])
        const held = new Map<string, { pass: number; carrier: string }>()
        const stale: { carrier: string; from: number }[] = []
        let introKnits = 0
        for (const pass of trace.passes) {
          for (const action of pass.actions) if (action.kind === 'knit') {
            const key = `${action.at.bed}:${action.at.traceCoordinate}`
            const old = held.get(key)
            if (pass.carrier !== '6' && old?.carrier === '6' && old.pass <= 2) stale.push({ carrier: pass.carrier, from: old.pass })
            if (pass.carrier !== '6') introKnits++
            held.set(key, { pass: pass.index + 1, carrier: pass.carrier })
          }
          // C1's initial catch and full intro are complete; stop before the
          // different garment-specific draw/cast-on section.
          if (pass.carrier === '1' && pass.actions.filter(a => a.kind === 'knit').length === width) break
        }
        expect(introKnits).toBe(3 * (40 + width))
        expect(stale).toEqual(fixed ? [] : [{ carrier: '3', from: 2 }])
      }
    }
  })

  it('emits inverse faces at rack zero even across solid rows and edge colour changes, then protects both beds', () => {
    const converted = authoredKnitoutToKCodeWithTrace(writeKnitoutProgram(buildCustomistRibBeanieProgram(input)))
    if (!converted.ok) throw new Error(converted.error)
    const parsed = parseKCodeDocument(converted.kcode, { profile, dialect: 'knitout-vendor', strict: true })
    if (!parsed.ok) throw new Error('strict parse failed')
    const trace = projectKCodeMachineTrace(parsed.document, profile)
    expect(validateKCodeMachineTrace(trace, profile).diagnostics).toEqual([])
    const main = trace.passes.flatMap(pass => ['3', '4'].includes(pass.carrier)
      ? pass.actions.flatMap(a => a.kind === 'knit' ? [{ pass, a }] : []) : [])
    const body = main.slice(-rows.length * 24)
    for (let r = 0; r < rows.length; r++) for (const [c, carrier] of ['3', '4'].entries()) {
      const block = body.slice((r * 2 + c) * 12, (r * 2 + c + 1) * 12)
      expect(block.every(k => k.pass.carrier === carrier && k.pass.rack === 0)).toBe(true)
      expect(block.map(k => `${k.a.at.kcodeColumn}:${k.a.at.bed}`).sort()).toEqual(
        rows[r]!.map((cell, x) => `${119 + x}:${cell === carrier ? 'front' : 'rear'}`).sort())
    }
    const bodyFirst = trace.passes.indexOf(body[0]!.pass)
    const bodyLast = trace.passes.indexOf(body.at(-1)!.pass)
    expect(trace.passes.slice(bodyFirst, bodyLast + 1).flatMap(p => p.actions).some(a => a.kind === 'xfer' || a.kind === 'drop')).toBe(false)
    const top = trace.passes.slice(bodyLast + 1)
    const lastWaste = top.findLastIndex(p => p.actions.some(a => a.kind === 'knit'))
    expect(top.slice(0, lastWaste + 1).flatMap(p => p.actions).some(a => a.kind === 'drop' || a.kind === 'xfer')).toBe(false)
    for (const bed of ['front', 'rear']) for (let col = 119; col <= 130; col++) {
      const stitches = top.flatMap(p => p.actions.flatMap(a => a.kind === 'knit' && a.at.bed === bed && a.at.kcodeColumn === col ? [p.carrier] : []))
      expect(stitches).toEqual(Array(8).fill('6'))
      expect(top.flatMap(p => p.actions).filter(a => a.kind === 'drop' && a.at.bed === bed && a.at.kcodeColumn === col)).toHaveLength(1)
    }
  })

  it('refuses unsupported combinations instead of silently emitting another fabric', () => {
    expect(() => buildCustomistRibBeanieProgram({ ...input, straightDoubleJacquard: false })).toThrow(/straight panel/)
    expect(() => buildCustomistRibBeanieProgram({ ...input, experimentalDoubleJacquardCrown: { steps: 1, rowsPerStep: 2 } })).toThrow(/without experimental decreases/)
    expect(() => buildCustomistRibBeanieProgram({ ...input, jerseyBody: { backing: 'birdseye', rows: [rows[0]!] } })).toThrow(/exactly two/)
    expect(() => buildCustomistRibBeanieProgram({ ...input, jerseyBody: { backing: 'birdseye', rows: [...rows, Array<CarrierId>(12).fill('5')] } })).toThrow(/exactly two/)
    expect(() => buildCustomistRibBeanieProgram({ ...input, topWasteRows: 0 })).toThrow(/waste rows/)
  })
})
