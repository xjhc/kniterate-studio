import { describe, expect, it } from 'vitest'
import { doubleJacquardEdgeTransfers, validateDoubleJacquardEdgeCrown } from '../../src/knitout/passes/dbj-edge-decrease.js'
import { buildCustomistRibBeanieProgram } from '../../src/knitout/passes/customist-rib-beanie.js'
import { writeKnitoutProgram } from '../../src/knitout/emitter.js'
import { authoredKnitoutToKCodeWithTrace } from '../../src/knitout/kniterate/to-kcode.js'
import { KNITERATE_7GG_KCODE_PROFILE_V2 as profile } from '../../src/knitout/kcode/machine-profile.js'
import { parseKCodeDocument } from '../../src/knitout/kcode/parser.js'
import { projectKCodeMachineTrace } from '../../src/knitout/kcode/machine-trace.js'
import { validateKCodeMachineTrace } from '../../src/knitout/kcode/machine-validator.js'
import type { BedNeedle } from '../../src/knitout/types.js'

const key = (n: BedNeedle) => `${n.bed}${n.needle}`

describe('experimental double-jacquard edge decreases', () => {
  it('conserves every loop, returns each layer to its own bed, and only merges two same-layer loops', () => {
    for (const width of [10, 32, 62, 98, 194, 244]) {
      let lo = Math.floor((252 - width) / 2) + 1
      let hi = lo + width - 1
      const loops = new Map<string, string[]>()
      for (const bed of ['f', 'b']) for (let n = lo; n <= hi; n++) loops.set(`${bed}${n}`, [`${bed}:${n}`])
      while (hi - lo + 1 >= 10) {
        const before = [...loops.values()].flat().sort()
        for (const t of doubleJacquardEdgeTransfers(lo, hi)) {
          const source = loops.get(key(t.from)) ?? []
          const target = loops.get(key(t.to)) ?? []
          expect(source).toHaveLength(1)
          expect(target).toHaveLength(t.landing === 'empty' ? 0 : 1)
          if (target.length) expect(source[0]![0]).toBe(target[0]![0])
          expect(Math.abs(t.rack)).toBeLessThanOrEqual(2)
          expect(t.from.bed === 'f' ? t.from.needle - t.to.needle : t.to.needle - t.from.needle).toBe(t.rack)
          loops.set(key(t.to), [...target, ...source])
          loops.delete(key(t.from))
        }
        expect([...loops.values()].flat().sort()).toEqual(before)
        lo++; hi--
        expect(loops.size).toBe(2 * (hi - lo + 1))
        for (const bed of ['f', 'b']) for (let n = lo; n <= hi; n++) {
          const held = loops.get(`${bed}${n}`)!
          expect(held.length).toBe(n === lo || n === hi ? 2 : 1)
          expect(held.every(id => id.startsWith(`${bed}:`))).toBe(true)
          // One completed DBJ design row consumes each intended merge.
          loops.set(`${bed}${n}`, [`${bed}:${n}`])
        }
      }
    }
  })

  it('rejects unavailable scratch space and crowns without recovery rows or sufficient surviving width', () => {
    expect(() => validateDoubleJacquardEdgeCrown(1, 62, { steps: 8, rowsPerStep: 2 })).toThrow(/scratch/)
    expect(() => validateDoubleJacquardEdgeCrown(191, 252, { steps: 8, rowsPerStep: 2 })).toThrow(/scratch/)
    expect(() => validateDoubleJacquardEdgeCrown(96, 157, { steps: 28, rowsPerStep: 2 })).toThrow(/eight/)
    expect(() => validateDoubleJacquardEdgeCrown(96, 157, { steps: 8, rowsPerStep: 1 })).toThrow(/2..20/)
  })

  it('emits valid KCode with both beds narrowing together, unchanged stitch size and waste before release', { timeout: 120_000 }, () => {
    for (const width of [32, 62, 98]) {
      const lo = Math.floor((252 - width) / 2) + 1
      const hi = lo + width - 1
      const steps = 8
      const rows = Array.from({ length: 8 }, (_, r) => Array.from({ length: width }, (_, c) => (r + c) % 7 === 0 ? '4' as const : '3' as const))
      const input = {
        needleStart: lo, needleEnd: hi, bodyCarrier: '3' as const, wasteCarrier: '6' as const, drawCarrier: '1' as const,
        ribRows: 0, crown: 'none' as const, straightDoubleJacquard: true,
        jerseyBody: { rows, backing: 'birdseye' as const }, topWasteRows: 8,
        bodySettings: { stitch: 7, speed: 100, roller: 700 },
        sections: { waste: { speed: 100 }, castOn: { speed: 100 }, transfers: { speed: 100 } },
      }
      const program = buildCustomistRibBeanieProgram({ ...input, experimentalDoubleJacquardCrown: { steps, rowsPerStep: 2 } })
      const baseline = buildCustomistRibBeanieProgram(input)
      // Existing design rows retain their exact needle/carrier selection.
      expect(program.ops.filter(op => op.sourceRows && op.kind === 'knit')).toEqual(baseline.ops.filter(op => op.sourceRows && op.kind === 'knit'))
      const marker = program.ops.findIndex(op => op.kind === 'comment' && op.text.includes('EXPERIMENTAL DOUBLE JACQUARD EDGE CROWN'))
      const waste = program.ops.findIndex(op => op.kind === 'comment' && op.text.includes('WASTE ON TOP: BOTH BEDS'))
      expect(marker).toBeGreaterThan(0)
      const crown = program.ops.slice(marker, waste)
      expect(crown.some(op => op.kind === 'drop')).toBe(false)
      expect(crown.filter(op => op.kind === 'xfer')).toHaveLength(steps * 8)
      const sizes = crown.filter(op => op.kind === 'x-stitch-number').map(op => op.value)
      expect(sizes.every(size => size === 7)).toBe(true)
      const crownKnits = crown.filter(op => op.kind === 'knit')
      for (const bed of ['f', 'b']) {
        expect(crownKnits.filter(op => op.needle.bed === bed)).toHaveLength(Array.from({ length: steps }, (_, s) => 2 * (width - 2 * (s + 1))).reduce((a, b) => a + b, 0))
      }
      const top = program.ops.slice(waste)
      for (const bed of ['f', 'b']) {
        const knits = top.filter(op => op.kind === 'knit' && op.needle.bed === bed)
        const drops = top.filter(op => op.kind === 'drop' && op.needle.bed === bed)
        expect(knits).toHaveLength((width - steps * 2) * 8)
        expect(drops).toHaveLength(width - steps * 2)
      }
      expect(top.findIndex(op => op.kind === 'drop')).toBeGreaterThan(top.findLastIndex(op => op.kind === 'knit'))
      const converted = authoredKnitoutToKCodeWithTrace(writeKnitoutProgram(program))
      if (!converted.ok) throw new Error(converted.error)
      const parsed = parseKCodeDocument(converted.kcode, { profile, dialect: 'knitout-vendor', strict: true })
      if (!parsed.ok) throw new Error('not strict KCode')
      const trace = projectKCodeMachineTrace(parsed.document, profile)
      expect(validateKCodeMachineTrace(trace, profile).diagnostics).toEqual([])
      const actualCrownTransfers = trace.passes.flatMap(pass => pass.actions.filter(action => action.kind === 'xfer')).slice(-steps * 8)
      const expectedCrownTransfers = Array.from({ length: steps }, (_, step) => doubleJacquardEdgeTransfers(lo + step, hi - step)).flat()
      expect(actualCrownTransfers.map(action => ({
        from: `${action.source.bed === 'front' ? 'f' : 'b'}${action.source.kcodeColumn + 1}`,
        to: `${action.target.bed === 'front' ? 'f' : 'b'}${action.target.kcodeColumn + 1}`,
      }))).toEqual(expectedCrownTransfers.map(t => ({ from: key(t.from), to: key(t.to) })))
      // Replay the actual converted machine actions, not just authored ops.
      const held = new Map<string, number>()
      for (const pass of trace.passes) for (const action of pass.actions) {
        if (action.kind === 'knit' || action.kind === 'tuck') {
          const at = `${action.at.bed}:${action.at.kcodeColumn}`
          expect(held.get(at) ?? 0).toBeLessThanOrEqual(2)
          held.set(at, action.kind === 'knit' ? 1 : (held.get(at) ?? 0) + 1)
        } else if (action.kind === 'xfer') {
          const from = `${action.source.bed}:${action.source.kcodeColumn}`
          const to = `${action.target.bed}:${action.target.kcodeColumn}`
          held.set(to, (held.get(to) ?? 0) + (held.get(from) ?? 0)); held.delete(from)
          expect(held.get(to)).toBeLessThanOrEqual(2)
        } else if (action.kind === 'drop') held.delete(`${action.at.bed}:${action.at.kcodeColumn}`)
      }
      expect([...held.values()].filter(n => n > 0)).toEqual([])
    }
  })
})
