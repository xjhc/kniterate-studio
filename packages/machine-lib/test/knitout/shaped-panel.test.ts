import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { emitShapedPanelV1, ShapedPanelError, type PanelRowV1, type PanelSegmentV1, type PanelStitchV1, type ShapedPanelInputV1 } from '../../src/knitout/passes/shaped-panel.js'
import { writeKnitoutProgram } from '../../src/knitout/emitter.js'
import { authoredKnitoutToKCodeWithTrace } from '../../src/knitout/kniterate/to-kcode.js'
import { KNITERATE_7GG_KCODE_PROFILE_V2 } from '../../src/knitout/kcode/machine-profile.js'
import { parseKCodeDocument } from '../../src/knitout/kcode/parser.js'
import { projectKCodeMachineTrace, type MachineTraceV1 } from '../../src/knitout/kcode/machine-trace.js'
import { validateKCodeMachineTrace } from '../../src/knitout/kcode/machine-validator.js'
import { validateKCodeMachineSafetyV1 } from '../../src/knitout/kcode/machine-safety.js'

const CARRIERS = { mainCarrier: '3', secondCarrier: '4', wasteCarrier: '6', drawCarrier: '1' } as const

function strictTrace(input: ShapedPanelInputV1): MachineTraceV1 {
  const converted = authoredKnitoutToKCodeWithTrace(writeKnitoutProgram(emitShapedPanelV1(input).program))
  if (!converted.ok) throw new Error(converted.error)
  return traceOf(converted.kcode)
}

function traceOf(kcode: string): MachineTraceV1 {
  const parsed = parseKCodeDocument(kcode, { profile: KNITERATE_7GG_KCODE_PROFILE_V2, dialect: 'knitout-vendor', strict: true })
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
      if (action.kind === 'knit') { const k = key(action.at.bed, action.at.traceCoordinate); deepest = Math.max(deepest, loops.get(k) ?? 0); loops.set(k, 1) }
      else if (action.kind === 'tuck') { const k = key(action.at.bed, action.at.traceCoordinate); loops.set(k, (loops.get(k) ?? 0) + 1); deepest = Math.max(deepest, loops.get(k)!) }
      else if (action.kind === 'drop') loops.set(key(action.at.bed, action.at.traceCoordinate), 0)
      else if (action.kind === 'xfer' || action.kind === 'split') {
        const from = key(action.source.bed, action.source.traceCoordinate)
        const to = key(action.target.bed, action.target.traceCoordinate)
        loops.set(to, (loops.get(to) ?? 0) + (loops.get(from) ?? 0))
        deepest = Math.max(deepest, loops.get(to)!)
        loops.set(from, action.kind === 'split' ? 1 : 0)
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
  it('counts split loops in the same needle frame as carrierless transfers', () => {
    // Two held loops move to the rear during the split; returning them onto the new front loop
    // makes a deliberately excessive stack of three. Ignoring splits or the stroke offset misses it.
    const converted = authoredKnitoutToKCodeWithTrace([
      ';!knitout-2', ';;Machine: kniterate', ';;Carriers: 1 2 3 4 5 6',
      'x-stitch-number 6', 'x-speed-number 300', 'x-roller-advance 450', 'in 3',
      'tuck + f100 3', 'tuck - f100 3', 'split + f100 b100 3', 'xfer b100 f100', 'out 3', '',
    ].join('\n'))
    if (!converted.ok) throw new Error(converted.error)
    expect(replay(traceOf(converted.kcode))).toEqual({ deepest: 3, rack: 0 })
  })

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

  it('makes a right-edge increase three ways: open, at the edge needle, and filled with the strand below', { timeout: 60_000 }, () => {
    // Four plain rows, then four increases every second row at the right edge.
    const rowsWith = (increase: 'eyelet' | 'edge' | 'bar'): PanelRowV1[] => Array.from({ length: 12 }, (_, r) => {
      const grown = r < 4 ? 0 : Math.floor((r - 4) / 2) + 1
      return { segments: [{ lo: 100, hi: 119 + grown }], stitch: () => 'k' as PanelStitchV1, settings: 'body' as const, ...(r >= 4 && (r - 4) % 2 === 0 ? { increase } : {}) }
    })
    const measure = (increase: 'eyelet' | 'edge' | 'bar') => {
      const trace = strictTrace({ rows: rowsWith(increase), ...CARRIERS, top: 'waste', fashion: 3 })
      expect(validateKCodeMachineTrace(trace, KNITERATE_7GG_KCODE_PROFILE_V2).ok).toBe(true)
      const loops = new Set<string>()
      let emptyInside = 0
      let emptyEdge = 0
      let started = false
      const tuckPasses: { rack: number; knits: number; tucks: number }[] = []
      for (const pass of trace.passes) {
        // The body: the main yarn's passes once the draw thread has knitted.
        if (pass.carrier === '1') started = true
        const knits = pass.actions.filter((action) => action.kind === 'knit').length
        const tucks = pass.actions.filter((action) => action.kind === 'tuck').length
        if (started && pass.carrier === '3' && tucks > 0) tuckPasses.push({ rack: pass.rack, knits, tucks })
        for (const action of pass.actions) {
          if (action.kind === 'knit' || action.kind === 'tuck') {
            const k = `${action.at.bed}${action.at.kcodeColumn}`
            if (action.kind === 'knit' && started && pass.carrier === '3' && action.at.bed === 'front' && !loops.has(k) && knits < 30) {
              const neighbours = [-1, 1].every((d) => loops.has(`front${action.at.kcodeColumn + d}`))
              if (neighbours) emptyInside++
              else emptyEdge++
            }
            loops.add(k)
          } else if (action.kind === 'drop') loops.delete(`${action.at.bed}${action.at.kcodeColumn}`)
          else if (action.kind === 'xfer') { loops.delete(`${action.source.bed}${action.source.kcodeColumn}`); loops.add(`${action.target.bed}${action.target.kcodeColumn}`) }
        }
      }
      return { emptyInside, emptyEdge, tuckPasses, transfers: trace.passes.filter((pass) => started && pass.actions.some((action) => action.kind === 'xfer')).length }
    }
    // Open: each increase knits one empty needle inside the fabric, three stitches from the edge.
    expect(measure('eyelet')).toMatchObject({ emptyInside: 4, emptyEdge: 0, tuckPasses: [] })
    // Edge needle: no stitch moves; the new outermost needle knits empty.
    const edge = measure('edge')
    expect(edge).toMatchObject({ emptyInside: 0, emptyEdge: 4, tuckPasses: [] })
    // Lifted bar: no needle knits empty. The row before each increase knits whole at half racking with one
    // rear tuck, and that strand goes into the gap.
    const bar = measure('bar')
    expect(bar).toMatchObject({ emptyInside: 0, emptyEdge: 0 })
    expect(bar.tuckPasses).toEqual([20, 21, 22, 23].map((knits) => ({ rack: -0.5, knits, tucks: 1 })))
    expect(bar.transfers).toBeGreaterThan(edge.transfers)
  })

  describe('Customist split increases', () => {
    const captures = [
      ...([1, 4] as const).map((fashion) => ({
        name: `original right ${fashion}`, side: 'right' as const, phase: 0, fashion,
        file: `../../reference/customist-increase/split-increase-${fashion === 1 ? 'simple' : 'fashioned'}.kc`,
      })),
      ...(['left', 'right'] as const).flatMap((side) => [0, 1].flatMap((phase) => [1, 4].map((fashion) => ({
        name: `${side} phase${phase} fashion${fashion}`, side, phase, fashion,
        file: `../../../../fixtures/customist-debug/2026-11-13/raw/${side}-phase${phase}-${fashion === 1 ? 'simple' : 'fashioned'}.kc`,
      })))),
      ...[1, 4].map((fashion) => ({
        name: `both edges fashion${fashion}`, side: 'both' as const, phase: 0, fashion,
        file: `../../../../fixtures/customist-debug/2026-11-13-followup/raw/both-edges-full-${fashion === 1 ? 'simple' : 'fashioned'}.kc`,
      })),
      { name: 'right fashion2', side: 'right' as const, phase: 0, fashion: 2, file: '../../../../fixtures/customist-debug/2026-11-13-followup/raw/fashioned-width2.kc' },
    ]

    it.each(captures)('matches every increase pass in $name', { timeout: 60_000 }, ({ side, phase, fashion, file }) => {
      // Include the split, ALL transfers and empty carrier/carriage passes, and the first widened row.
      // Trace coordinates compensate for the carrier-stroke column shift. Compare needle selection,
      // direction, operation, rack and carrier stops; settings and carriage travel are separate.
      // In particular, transfer roller 50 is not supported by the pinned converter.
      const increases = (trace: MachineTraceV1) => trace.passes.flatMap((pass, index) => {
        if (!pass.actions.some((action) => action.kind === 'split')) return []
        const needles = pass.selections.front.map((selection) => selection.traceCoordinate)
        const edge = side === 'right' ? Math.max(...needles) : Math.min(...needles)
        const nextRow = trace.passes.findIndex((next, i) => i > index && next.carrier === '3' && next.selections.front.length > 0)
        expect(nextRow).toBeGreaterThan(index)
        return [trace.passes.slice(index, nextRow + 1).map((next) => ({
          direction: next.direction, operation: next.operation, carrier: next.carrier, rack: next.rack,
          front: next.selections.front.map((selection) => selection.traceCoordinate - edge),
          rear: next.selections.rear.map((selection) => selection.traceCoordinate - edge),
          // In particular, pin the two empty passes moving the widening-side carrier one needle out.
          carrierStops: next.carrierStops === null ? null : {
            left: next.carrierStops.left - edge, right: next.carrierStops.right - edge,
          },
        }))]
      })
      const width = side === 'both' ? 20 : 22
      const rows: PanelRowV1[] = Array.from({ length: 24 }, (_, r) => {
        const grown = r < 8 + phase ? 0 : r < 16 + phase ? 1 : 2
        return {
          segments: [{ lo: 100 - (side === 'right' ? 0 : grown), hi: 99 + width + (side === 'left' ? 0 : grown) }],
          stitch: knit, settings: 'body', increase: 'split',
        }
      })
      const reference = increases(traceOf(readFileSync(new URL(file, import.meta.url), 'utf8')))
      expect(reference).toHaveLength(2)
      const trace = expectMachineValid({ rows, ...CARRIERS, top: 'waste', fashion })
      expect(increases(trace)).toEqual(reference)
      expect(validateKCodeMachineSafetyV1(trace, KNITERATE_7GG_KCODE_PROFILE_V2).diagnostics).toEqual([])
      // No needle knits empty once the jersey body has started, and each increase is one split.
      const loops = new Set<string>()
      let started = false
      let empty = 0
      let splits = 0
      for (const pass of trace.passes) {
        if (pass.carrier === '3' && pass.actions.length === width && pass.actions.every((action) => action.kind === 'knit' && action.at.bed === 'front')) started = true
        for (const action of pass.actions) {
          if (action.kind === 'knit' || action.kind === 'tuck') {
            const k = `${action.at.bed}${action.at.traceCoordinate}`
            if (started && pass.carrier === '3' && !loops.has(k)) empty++
            loops.add(k)
          } else if (action.kind === 'drop') loops.delete(`${action.at.bed}${action.at.traceCoordinate}`)
          else if (action.kind === 'xfer' || action.kind === 'split') {
            const source = `${action.source.bed}${action.source.traceCoordinate}`
            expect(loops.has(source), `pass ${pass.index + 1} ${action.kind} source ${source}`).toBe(true)
            if (action.kind === 'xfer') loops.delete(source)
            else splits++
            loops.add(`${action.target.bed}${action.target.traceCoordinate}`)
          }
        }
      }
      expect(started).toBe(true)
      expect({ empty, splits }).toEqual({ empty: 0, splits: side === 'both' ? 4 : 2 })
    })
  })

  it('narrows both edges two ways: the edge stitches together, or one loop per pass in Kniterate\'s order', { timeout: 60_000 }, () => {
    // Four plain rows, then three decreases every second row at both edges.
    const rowsWith = (decrease: 'together' | 'single'): PanelRowV1[] => Array.from({ length: 10 }, (_, r) => {
      const lost = r < 4 ? 0 : Math.floor((r - 4) / 2) + 1
      return { segments: [{ lo: 100 + lost, hi: 139 - lost }], stitch: () => 'k' as PanelStitchV1, settings: 'body' as const, decrease }
    })
    const measure = (decrease: 'together' | 'single') => {
      const trace = expectMachineValid({ rows: rowsWith(decrease), ...CARRIERS, top: 'waste', fashion: 3 })
      const loops = new Map<string, number>()
      const key = (at: { bed: string; kcodeColumn: number }) => `${at.bed}${at.kcodeColumn}`
      let started = false
      const racked: number[] = []
      /** For each loop that lands on an occupied needle: how many needles it travelled from where it was last knitted. */
      const landedOnTop: number[] = []
      const home = new Map<string, number>()
      let doubledKnits = 0
      // The body ends with the main yarn's last knitting pass; the waste top after it is not shaping.
      const lastMain = trace.passes.findLastIndex((pass) => pass.carrier === '3' && pass.actions.some((action) => action.kind === 'knit'))
      // It starts with the first whole jersey row: forty front stitches in the main yarn.
      const firstRow = trace.passes.findIndex((pass) => pass.carrier === '3' && pass.actions.filter((action) => action.kind === 'knit' && action.at.bed === 'front').length === 40)
      for (const [index, pass] of trace.passes.entries()) {
        if (index > lastMain) break
        if (index === firstRow) started = true
        const moves = pass.actions.filter((action) => action.kind === 'xfer')
        if (started && moves.length > 0 && Math.abs(pass.rack) >= 1) racked.push(moves.length)
        for (const action of pass.actions) {
          if (action.kind === 'knit') {
            if (started && pass.carrier === '3' && (loops.get(key(action.at)) ?? 0) === 2) doubledKnits++
            loops.set(key(action.at), 1)
            home.set(key(action.at), action.at.kcodeColumn)
          } else if (action.kind === 'drop') loops.set(key(action.at), 0)
          else if (action.kind === 'xfer') {
            const there = loops.get(key(action.target)) ?? 0
            if (started && there > 0) landedOnTop.push(Math.abs(action.target.kcodeColumn - home.get(key(action.source))!))
            loops.set(key(action.target), there + (loops.get(key(action.source)) ?? 0))
            if (there === 0) home.set(key(action.target), home.get(key(action.source))!)
            loops.set(key(action.source), 0)
          }
        }
      }
      return { racked, landedOnTop, doubledKnits, transferPasses: trace.passes.slice(firstRow, lastMain).filter((pass) => pass.actions.some((action) => action.kind === 'xfer')).length }
    }
    const together = measure('together')
    const single = measure('single')
    // Both make one doubled stitch per decrease, knitted in the next row.
    expect(together.doubledKnits).toBe(6)
    expect(single.doubledKnits).toBe(6)
    // Together: a racked pass carries two of the three edge loops, and the loop that lands on top has moved one needle.
    expect(Math.max(...together.racked)).toBe(2)
    expect(together.landedOnTop).toEqual([1, 1, 1, 1, 1, 1])
    // Single: every racked pass carries one loop (as all 3,035 of Kniterate's do), and the loop that lands
    // on top is the covered stitch coming home, so it has not moved.
    expect(single.racked.every((count) => count === 1)).toBe(true)
    expect(single.landedOnTop).toEqual([0, 0, 0, 0, 0, 0])
    expect(single.transferPasses).toBe(6 * 8)
    expect(together.transferPasses).toBe(6 * 4)
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
