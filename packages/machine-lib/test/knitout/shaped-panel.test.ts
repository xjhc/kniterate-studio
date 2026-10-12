import { describe, expect, it } from 'vitest'
import { emitShapedPanelV1, ShapedPanelError, type PanelRowV1, type PanelSegmentV1, type PanelStitchV1, type ShapedPanelInputV1 } from '../../src/knitout/passes/shaped-panel.js'
import { writeKnitoutProgram } from '../../src/knitout/emitter.js'
import { authoredKnitoutToKCodeWithTrace } from '../../src/knitout/kniterate/to-kcode.js'
import { KNITERATE_7GG_KCODE_PROFILE_V2 } from '../../src/knitout/kcode/machine-profile.js'
import { parseKCodeDocument } from '../../src/knitout/kcode/parser.js'
import { projectKCodeMachineTrace, type MachineTraceV1 } from '../../src/knitout/kcode/machine-trace.js'
import { validateKCodeMachineTrace } from '../../src/knitout/kcode/machine-validator.js'

const CARRIERS = { mainCarrier: '3', secondCarrier: '4', wasteCarrier: '6', drawCarrier: '1' } as const

function strictTrace(input: ShapedPanelInputV1): MachineTraceV1 {
  const converted = authoredKnitoutToKCodeWithTrace(writeKnitoutProgram(emitShapedPanelV1(input).program))
  if (!converted.ok) throw new Error(converted.error)
  const parsed = parseKCodeDocument(converted.kcode, { profile: KNITERATE_7GG_KCODE_PROFILE_V2, dialect: 'knitout-vendor', strict: true })
  if (!parsed.ok) throw new Error('not strict KCode')
  return projectKCodeMachineTrace(parsed.document, KNITERATE_7GG_KCODE_PROFILE_V2)
}

/** Replays loops per needle through the trace; returns the deepest stack any knit or transfer met, and the widest racking. */
function replay(trace: MachineTraceV1) {
  const loops = new Map<string, number>()
  const key = (bed: string, column: number) => `${bed}${column}`
  let deepest = 0
  let rack = 0
  for (const pass of trace.passes) {
    rack = Math.max(rack, Math.abs(pass.rack))
    for (const action of pass.actions) {
      if (action.kind === 'knit') { const k = key(action.at.bed, action.at.kcodeColumn); deepest = Math.max(deepest, loops.get(k) ?? 0); loops.set(k, 1) }
      else if (action.kind === 'tuck') { const k = key(action.at.bed, action.at.kcodeColumn); loops.set(k, (loops.get(k) ?? 0) + 1); deepest = Math.max(deepest, loops.get(k)!) }
      else if (action.kind === 'drop') loops.set(key(action.at.bed, action.at.kcodeColumn), 0)
      else if (action.kind === 'xfer') {
        const from = key(action.source.bed, action.source.kcodeColumn)
        const to = key(action.target.bed, action.target.kcodeColumn)
        loops.set(to, (loops.get(to) ?? 0) + (loops.get(from) ?? 0))
        deepest = Math.max(deepest, loops.get(to)!)
        loops.set(from, 0)
      }
    }
  }
  return { deepest, rack }
}

function expectMachineValid(input: ShapedPanelInputV1) {
  const trace = strictTrace(input)
  const report = validateKCodeMachineTrace(trace, KNITERATE_7GG_KCODE_PROFILE_V2)
  expect(report.diagnostics.filter((diagnostic) => diagnostic.severity === 'error')).toEqual([])
  const { deepest, rack } = replay(trace)
  expect(deepest).toBeLessThanOrEqual(2)
  expect(rack).toBeLessThanOrEqual(2)
  return trace
}

const row = (segments: PanelSegmentV1[], stitch: (n: number) => PanelStitchV1, settings: 'rib' | 'body' = 'body'): PanelRowV1 => ({ segments, stitch, settings })
const knit = () => 'k' as const
const rib2x2 = (lo: number) => (n: number): PanelStitchV1 => ((n - lo) % 4 < 2 ? 'k' : 'p')

/** A sweater front in miniature: 2x2 rib, waist decreases, armhole bind-offs and decreases, a neck split with neck decreases. */
function front(stitch: (n: number, r: number) => PanelStitchV1 = knit): PanelRowV1[] {
  const rows: PanelRowV1[] = []
  let lo = 40
  let hi = 119
  for (let r = 0; r < 10; r++) rows.push(row([{ lo, hi }], rib2x2(40), 'rib'))
  for (let r = 10; r < 40; r++) {
    if (r % 6 === 0) { lo += 1; hi -= 1 }
    rows.push(row([{ lo, hi }], (n) => stitch(n, r)))
  }
  // Even rows start on the left, odd rows on the right: bind off left on row 40, right on row 41.
  lo += 5; rows.push(row([{ lo, hi }], (n) => stitch(n, 40)))
  hi -= 5; rows.push(row([{ lo, hi }], (n) => stitch(n, 41)))
  for (let r = 42; r < 61; r++) {
    if (r < 50) { lo += 1; hi -= 1 }
    rows.push(row([{ lo, hi }], (n) => stitch(n, r)))
  }
  const mid = (lo + hi) >> 1
  let left = { lo, hi: mid - 6 }
  let right = { lo: mid + 6, hi }
  rows.push(row([left, right], (n) => stitch(n, 61)))
  for (let r = 62; r < 76; r++) {
    if (r < 64) { left = { lo: left.lo, hi: left.hi - 2 }; right = { lo: right.lo + 2, hi: right.hi } }
    else if (r < 70) { left = { lo: left.lo, hi: left.hi - 1 }; right = { lo: right.lo + 1, hi: right.hi } }
    rows.push(row([left, right], (n) => stitch(n, r)))
  }
  return rows
}

describe('shaped panel', () => {
  it('knits a jersey front with rib, armhole bind-offs and a split neck within machine limits', { timeout: 60_000 }, () => {
    const trace = expectMachineValid({ ...CARRIERS, rows: front(), top: 'bind-off' })
    // The right shoulder is knitted by the second yarn after the split.
    expect(trace.passes.some((pass) => pass.carrier === '4' && pass.actions.some((action) => action.kind === 'knit'))).toBe(true)
  })

  it('leaves the live loops exactly on the shaped needles before the top (an independent trace replay)', { timeout: 60_000 }, () => {
    for (const fashion of [1, 2, 3]) {
      const rows = front()
      const trace = strictTrace({ ...CARRIERS, rows, top: 'waste', wasteRows: 6, fashion })
      // Replay loops up to the first waste-yarn pass after the body; the waste top starts there.
      const loops = new Map<number, number>()
      const firstWaste = trace.passes.findIndex((pass, index) => index > 200 && pass.carrier === '6' && pass.actions.some((action) => action.kind === 'knit'))
      const coordinate = (bed: string, column: number) => (bed === 'f' ? 1 : -1) * (column + 1)
      for (const pass of trace.passes.slice(0, firstWaste)) {
        for (const action of pass.actions) {
          if (action.kind === 'knit') loops.set(coordinate(action.at.bed, action.at.kcodeColumn), 1)
          else if (action.kind === 'tuck') loops.set(coordinate(action.at.bed, action.at.kcodeColumn), (loops.get(coordinate(action.at.bed, action.at.kcodeColumn)) ?? 0) + 1)
          else if (action.kind === 'drop') loops.delete(coordinate(action.at.bed, action.at.kcodeColumn))
          else if (action.kind === 'xfer') {
            const from = coordinate(action.source.bed, action.source.kcodeColumn)
            const to = coordinate(action.target.bed, action.target.kcodeColumn)
            loops.set(to, (loops.get(to) ?? 0) + (loops.get(from) ?? 0))
            loops.delete(from)
          }
        }
      }
      // Waste yarn and draw thread loops below the cast-on are long gone; the live body loops are those knitted last.
      const live = [...loops.entries()].filter(([, count]) => count > 0).map(([key]) => Math.abs(key)).sort((a, b) => a - b)
      const expected = rows.at(-1)!.segments.flatMap((segment) => Array.from({ length: segment.hi - segment.lo + 1 }, (_, k) => segment.lo + k))
      const offset = live[0]! - expected[0]!
      expect(live.map((column) => column - offset), `fashion ${fashion}`).toEqual(expected)
    }
  })

  it('finishes the top with waste yarn', { timeout: 60_000 }, () => {
    const trace = expectMachineValid({ ...CARRIERS, rows: front(), top: 'waste', wasteRows: 6 })
    expect(trace.passes.some((pass) => pass.actions.some((action) => action.kind === 'drop'))).toBe(true)
  })

  it('knits textures that move stitches between beds every row', { timeout: 60_000 }, () => {
    const seed = (n: number, r: number): PanelStitchV1 => ((n + r) % 2 === 0 ? 'k' : 'p')
    const garter = (_n: number, r: number): PanelStitchV1 => (r % 2 === 0 ? 'k' : 'p')
    for (const stitch of [seed, garter]) expectMachineValid({ ...CARRIERS, rows: front(stitch), top: 'bind-off' })
  })

  it('knits a tuck rib (front knit, rear tuck) and slip stitches', { timeout: 60_000 }, () => {
    const tuckRib = (n: number, r: number): PanelStitchV1 => (n % 2 === 0 ? 'k' : r % 2 === 0 ? 'u' : 'p')
    const slip = (n: number, r: number): PanelStitchV1 => (n % 4 === 0 && r % 2 === 0 ? 's' : 'k')
    for (const stitch of [tuckRib, slip]) expectMachineValid({ ...CARRIERS, rows: front(stitch), top: 'bind-off' })
  })

  it('widens a sleeve with fashioned increases and shapes a cap', { timeout: 60_000 }, () => {
    const rows: PanelRowV1[] = []
    let lo = 90
    let hi = 147
    for (let r = 0; r < 8; r++) rows.push(row([{ lo, hi }], (n) => ((n - 90) % 2 === 0 ? 'k' : 'p'), 'rib'))
    for (let r = 8; r < 60; r++) { if (r % 4 === 0) { lo -= 1; hi += 1 } rows.push(row([{ lo, hi }], knit)) }
    lo += 4; rows.push(row([{ lo, hi }], knit))
    hi -= 4; rows.push(row([{ lo, hi }], knit))
    for (let r = 62; r < 80; r++) { if (r % 2 === 0) { lo += 1; hi -= 1 } rows.push(row([{ lo, hi }], knit)) }
    for (const fashion of [1, 2, 3]) expectMachineValid({ ...CARRIERS, rows, top: 'bind-off', fashion })
  })

  it('refuses shaping the machine cannot do, naming the row', () => {
    const base = [row([{ lo: 40, hi: 79 }], knit), row([{ lo: 40, hi: 79 }], knit)]
    const run = (rows: PanelRowV1[], extra: Partial<ShapedPanelInputV1> = {}) => () => emitShapedPanelV1({ ...CARRIERS, rows, top: 'bind-off', ...extra })
    expect(run([row([{ lo: 40, hi: 78 }], knit)])).toThrow(/even number of needles/)
    expect(run([...base, row([{ lo: 38, hi: 79 }], knit)])).toThrow(/row 3: the left edge widens by 2/)
    // Row 2 (index 1) knits leftward, so a left bind-off there has no yarn.
    expect(run([base[0]!, row([{ lo: 45, hi: 79 }], knit)])).toThrow(/row 2: binding off 5 stitches at the left edge needs the yarn there/)
    expect(run([...base, row([{ lo: 40, hi: 79 }], (n) => (n === 50 ? 't' : 'k')), ...base])).toThrow(/row 3: this row both knits and tucks on the front bed/)
    expect(run([base[0]!, row([{ lo: 40, hi: 55 }, { lo: 62, hi: 79 }], knit)], { secondCarrier: undefined })).toThrow(/second carrier/)
    expect(run([base[0]!, base[1]!, row([{ lo: 40, hi: 55 }, { lo: 62, hi: 79 }], knit)])).toThrow(ShapedPanelError)
  })
})
