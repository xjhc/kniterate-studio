import { describe, expect, it } from 'vitest'
import { buildKnitEvidenceV1, checkTraceAgainstKnitsV1, compareTraceRangesV1, describeTracePassesV1, type MachineTraceV1 } from '../../src/browser.js'

type Bed = 'front' | 'rear'
type Act = ['knit' | 'tuck' | 'drop', Bed, number] | ['xfer' | 'split', Bed, number, Bed, number]
interface Row { carrier: string; acts: Act[]; roller?: number; stops?: [number, number]; rack?: number; sizes?: Record<number, number> }
const at = (bed: Bed, n: number, size = 7) => ({ bed, traceCoordinate: n, stitchSelector: { encodedValue: size } })
/** A hand-built trace: one entry per pass, alternating direction from left to right. */
function trace(rows: Row[]): MachineTraceV1 {
  return {
    passes: rows.map((row, index) => ({
      index,
      direction: index % 2 === 0 ? '>>' : '<<',
      operation: 'Kn-Kn',
      carrier: row.carrier,
      speed: 200,
      roller: row.roller ?? 450,
      carrierStops: row.stops ? { left: row.stops[0], right: row.stops[1] } : null,
      actions: row.acts.map((act) => (act[0] === 'xfer' || act[0] === 'split' ? { kind: act[0], source: at(act[1], act[2], row.sizes?.[act[2]]), target: at(act[3], act[4], row.sizes?.[act[4]]), carrier: row.carrier } : { kind: act[0], at: at(act[1], act[2], row.sizes?.[act[2]]) })),
    })),
    rackCommands: rows.flatMap((row, index) => (row.rack === undefined ? [] : [{ beforePassIndex: index, value: row.rack }])),
  } as never
}
const span = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => from + i)
/** A cast-on on both beds, then two-colour reversible rows: yarn 3 knits the front where `front(n)` holds, yarn 4 the rest. */
function reversible(from: number, to: number, rows: number, front: (n: number, row: number) => boolean, carriers: [string, string] = ['3', '4']): Row[] {
  const needles = span(from, to)
  const castOn: Row = { carrier: carriers[0], acts: needles.flatMap((n) => [['knit', 'front', n], ['knit', 'rear', n]] as Act[]) }
  const body = Array.from({ length: rows }, (_, row) => [
    { carrier: carriers[0], acts: needles.map((n) => ['knit', front(n, row) ? 'front' : 'rear', n] as Act) },
    { carrier: carriers[1], acts: needles.map((n) => ['knit', front(n, row) ? 'rear' : 'front', n] as Act) },
  ]).flat()
  return [castOn, ...body]
}
const texts = (rows: Row[]) => describeTracePassesV1(trace(rows)).map((pass) => pass.text)

describe('pass descriptions', () => {
  it.each(['xfer', 'split'] as const)('distinguishes both selected stitch settings of a %s at the same edge', (kind) => {
    const before: Row = { carrier: '3', acts: span(10, 29).map((n) => ['knit', 'front', n]) }
    const transfer = (from: number, to: number) => trace([before, {
      carrier: kind === 'xfer' ? '0' : '3', rack: 1, acts: [[kind, 'front', 29, 'rear', 28]], sizes: { 29: from, 28: to },
    }])
    const mark = (from: number, to: number) => describeTracePassesV1(transfer(from, to))[1]!.text
    expect(new Set([mark(5, 7), mark(6, 7), mark(5, 8), mark(7, 5)]).size).toBe(4)
    const pass = { from: 2, to: 2 }
    expect(compareTraceRangesV1(transfer(5, 7), pass, transfer(5, 8), pass).differences[0]!.fields).toEqual(['stitches'])
  })
  it.each(['knit', 'tuck', 'split'] as const)('keeps the stitch selector attached to each %s edge', (kind) => {
    const castOn: Row = { carrier: '3', acts: span(10, 29).map((n) => ['knit', 'front', n]) }
    const acts: Act[] = span(10, 29).map((n) => n === 10 || n === 29
      ? kind === 'split' ? ['split', 'front', n, 'rear', n] : [kind, 'front', n]
      : ['knit', 'front', n])
    const original = trace([castOn, { carrier: '3', acts, sizes: { 10: 4, 29: 7 } }])
    const swapped = trace([castOn, { carrier: '3', acts, sizes: { 10: 7, 29: 4 } }])
    const evidence = buildKnitEvidenceV1([{ id: 'original', trace: original, events: [] }])
    expect(checkTraceAgainstKnitsV1(swapped, evidence).statuses).toEqual(['knitted', 'new'])
    const pass = { from: 2, to: 2 }
    expect(compareTraceRangesV1(original, pass, swapped, pass).differences[0]!.fields).toEqual(['stitches'])
    if (kind === 'knit') {
      const movedInside = trace([castOn, { carrier: '3', acts, sizes: { 20: 4 } }])
      expect(checkTraceAgainstKnitsV1(movedInside, evidence).statuses[1]).toBe('new')
    }
  })

  it('ignore the artwork between the edges, the width, the place on the bed and which carriers hold the yarns', () => {
    const dots = reversible(10, 29, 4, (n, row) => n === 10 || n === 29 || (n + row) % 5 === 0)
    const stripes = reversible(100, 139, 4, (n, row) => n === 100 || n === 139 || (n * 3 + row) % 4 < 2, ['2', '5'])
    expect(texts(stripes)).toEqual(texts(dots))
    expect(describeTracePassesV1(trace(dots))[3]!.width).toBe(20)
    expect(describeTracePassesV1(trace(stripes))[3]!.width).toBe(40)
  })

  it('tell apart a pass that knits the edge needle on the other bed', () => {
    const joined = reversible(10, 29, 2, (n) => n === 10 || n === 29)
    const openRight = reversible(10, 29, 2, (n) => n === 10)
    expect(texts(openRight)[1]).not.toBe(texts(joined)[1])
    expect(describeTracePassesV1(trace(joined))[1]!.facets['knit f']).toBe('stitch 7 at L0 R0')
    expect(describeTracePassesV1(trace(openRight))[1]!.facets['knit f']).toBe('stitch 7 at L0')
  })

  it('name a knit on an empty needle beyond the edge, and a knit through stacked loops beside it', () => {
    const rows: Row[] = [
      { carrier: '3', acts: span(10, 19).map((n) => ['knit', 'front', n] as Act) },
      // Widen by one: the new needle is empty.
      { carrier: '3', acts: span(10, 20).map((n) => ['knit', 'front', n] as Act) },
      // Narrow by one: the edge loop moves in over its neighbour, by way of the rear bed.
      { carrier: '0', acts: [['xfer', 'front', 20, 'rear', 20]] },
      { carrier: '0', acts: [['xfer', 'rear', 20, 'front', 19]] },
      { carrier: '3', acts: span(10, 19).map((n) => ['knit', 'front', n] as Act) },
    ]
    const passes = describeTracePassesV1(trace(rows))
    expect(passes[1]!.facets['knit f']).toBe('stitch 7 at L0 R+1/0 R0 in:all')
    expect(passes[2]!.facets['xfer f>b']).toBe('stitch 7 at R0>R0/1>0/receive7')
    // The loop now sits on the rear bed at the right edge; the front fabric ends one needle in.
    expect(passes[3]!.facets['xfer b>f']).toBe('stitch 7 at R0>R1/1>1/receive7')
    expect(passes[4]!.facets['knit f']).toBe('stitch 7 at L0 R0/2 in:all')
  })

  it('read a full row beside one stacked needle as a full row, and tell three loops from two', () => {
    const row = (n: number[]) => ({ carrier: '3', acts: n.map((needle) => ['knit', 'front', needle] as Act) })
    const stackOnto = (target: number, times: number): Row[] => Array.from({ length: times }, () => ({ carrier: '3', acts: [['tuck', 'front', target] as Act] }))
    const two = describeTracePassesV1(trace([row(span(10, 29)), ...stackOnto(11, 1), row(span(10, 29))])).at(-1)!
    const three = describeTracePassesV1(trace([row(span(10, 29)), ...stackOnto(11, 2), row(span(10, 29))])).at(-1)!
    expect(two.facets['knit f']).toBe('stitch 7 at L0 L1/2 R0 in:all')
    expect(three.facets['knit f']).toBe('stitch 7 at L0 L1/3 R0 in:all')
    // A tuck adds a loop; a drop takes the needle's loops away, and the next knit there is on an empty needle.
    const dropped = describeTracePassesV1(trace([row(span(10, 29)), { carrier: '0', acts: [['drop', 'front', 12]] }, row(span(10, 29))]))
    expect(dropped[1]!.facets['drop f']).toBe('in:some')
    expect(dropped[2]!.facets['knit f']).toBe('stitch 7 at L0 L2/0 R0 in:all')
  })

  it('describe a split and the racking it is made at', () => {
    const rows: Row[] = [
      { carrier: '3', acts: span(10, 19).map((n) => ['knit', 'front', n] as Act) },
      // The edge loop goes to the rear while a new one is knitted in its place.
      { carrier: '3', acts: [...span(10, 18).map((n) => ['knit', 'front', n] as Act), ['split', 'front', 19, 'rear', 19]], rack: 1 },
    ]
    const split = describeTracePassesV1(trace(rows))[1]!
    expect(split.facets.rack).toBe('1')
    expect(split.facets['split f>b']).toBe('stitch 7 at R0>R0/1>0/receive7')
    expect(split.facets['knit f']).toBe('stitch 7 at L0 in:all')
    expect(describeTracePassesV1(trace(rows.map((row) => ({ ...row, rack: undefined }))))[1]!.text).not.toBe(split.text)
  })

  it('keep every-other-needle rows reading the same on a narrow fabric', () => {
    const interlock = (from: number, to: number): Row[] => [
      { carrier: '6', acts: span(from, to).flatMap((n) => [['knit', 'front', n], ['knit', 'rear', n]] as Act[]) },
      { carrier: '6', acts: span(from, to).filter((n) => (n - from) % 2 === 0).map((n) => ['knit', 'front', n] as Act) },
    ]
    expect(describeTracePassesV1(trace(interlock(10, 17)))[1]!.facets['knit f']).toBe('stitch 7 at L0 in:alternate')
    expect(describeTracePassesV1(trace(interlock(10, 49)))[1]!.text).toBe(describeTracePassesV1(trace(interlock(110, 117)))[1]!.text)
    // Needles that merely share a parity are artwork, not every other needle.
    const scattered: Row[] = [interlock(10, 49)[0]!, { carrier: '6', acts: [10, 14, 16, 22, 30, 49].map((n) => ['knit', 'front', n] as Act) }]
    expect(describeTracePassesV1(trace(scattered))[1]!.facets['knit f']).toBe('stitch 7 at L0 R0 in:some')
  })

  it('say whether the carrier arrives from near the fabric or from far away', () => {
    const near = describeTracePassesV1(trace([{ carrier: '3', acts: span(100, 119).map((n) => ['knit', 'front', n] as Act), stops: [97.5, 121.5] }]))[0]!
    const far = describeTracePassesV1(trace([{ carrier: '3', acts: span(100, 119).map((n) => ['knit', 'front', n] as Act), stops: [-9.5, 121.5] }]))[0]!
    expect(near.facets['carrier from']).toBe('left, near')
    expect(far.facets['carrier from']).toBe('left, far')
    expect(far.text).not.toBe(near.text)
  })

  it('name a loop that waited long before it is knitted again', () => {
    const waste = (n: number[]) => ({ carrier: '6', acts: n.map((needle) => ['knit', 'front', needle] as Act) })
    // Needle 10 is knitted once, then left while the rest knits on; the last row knits through it.
    const rows = (waits: number): Row[] => [waste(span(10, 19)), ...Array.from({ length: waits }, () => waste(span(11, 19))), waste(span(10, 19))]
    const soon = describeTracePassesV1(trace(rows(4))).at(-1)!
    const late = describeTracePassesV1(trace(rows(20))).at(-1)!
    expect(soon.facets['knit f']).toBe('stitch 7 at L0 R0 in:all')
    expect(late.facets['knit f']).toBe('stitch 7 at L0/held R0 in:all')
  })

  it('report a long gap between worked needles', () => {
    const rows: Row[] = [
      { carrier: '3', acts: span(10, 29).map((n) => ['knit', 'front', n] as Act) },
      { carrier: '4', acts: [10, 14, 29].map((n) => ['knit', 'front', n] as Act) },
    ]
    expect(describeTracePassesV1(trace(rows))[1]!.facets.gaps).toBe('6 or more')
  })

  it('count the fabric a yarn crosses before its first stitch and after its last', () => {
    const base: Row = { carrier: '3', acts: span(10, 29).map((n) => ['knit', 'front', n] as Act) }
    // Yarn 4 travels the whole fabric but only knits needles 20 to 29: ten needles of float first.
    const late = describeTracePassesV1(trace([base, { carrier: '4', acts: span(20, 29).map((n) => ['knit', 'front', n] as Act), stops: [7.5, 31.5] }]))[1]!
    expect(late.facets.gaps).toBe('6 or more')
    // The same stitches with the carrier starting beside them: no float.
    const beside = describeTracePassesV1(trace([base, { carrier: '4', acts: span(20, 29).map((n) => ['knit', 'front', n] as Act), stops: [19.5, 31.5] }]))[1]!
    expect(beside.facets.gaps).toBeUndefined()
    // A carrier that only crosses the fabric carries its yarn over all of it.
    const crossing = describeTracePassesV1(trace([base, { carrier: '6', acts: [], stops: [7.5, 31.5] }]))[1]!
    expect(crossing.facets.gaps).toBe('6 or more')
  })
})

describe('knit evidence', () => {
  const plain = (n: number) => n === 10 || n === 29
  /** Three rows whose yarns cross between the beds only at the two edges. */
  const knitted = reversible(10, 29, 3, plain)

  it('distinguishes exact, between and outside observed widths', () => {
    const atWidth = (width: number) => trace(reversible(10, 9 + width, 2, (n) => n === 10 || n === 9 + width))
    const evidence = buildKnitEvidenceV1([
      { id: 'narrow', trace: atWidth(20), events: [] },
      { id: 'wide', trace: atWidth(60), events: [] },
    ])
    const between = checkTraceAgainstKnitsV1(atWidth(40), evidence)
    expect(between.statuses).toEqual(Array(5).fill('between-widths'))
    expect(between.betweenWidths.every((group) => JSON.stringify(group.knittedAt) === '[20,60]')).toBe(true)
    expect(between.counts['other-width']).toBe(0)
    for (const width of [10, 80]) expect(checkTraceAgainstKnitsV1(atWidth(width), evidence).statuses).toEqual(Array(5).fill('other-width'))
    expect(checkTraceAgainstKnitsV1(atWidth(60), evidence).statuses).toEqual(Array(5).fill('knitted'))
  })

  it.each([
    [[4, 7], [4, 5, 6, 7]],
    [[5, 5], [5, 7]],
  ] as const)('keeps a stopped-section fault at %s without crediting execution or blaming the known prefix', (range, warned) => {
    const later = trace(knitted.map((row, index) => index > 2 ? { ...row, roller: 100 } : row))
    const evidence = buildKnitEvidenceV1([{ id: 'stopped', trace: later, knittedThrough: 3, stopWithin: [4, 7], events: [{ kind: 'fault', passes: [range], approximate: true, what: 'missed loop before stopping' }] }])
    const check = checkTraceAgainstKnitsV1(later, evidence)
    expect(check.statuses).toEqual(['knitted', 'knitted', 'knitted', 'new', 'new', 'new', 'new'])
    expect(check.counts).toMatchObject({ knitted: 3, new: 4, faulted: warned.length, unclear: 0 })
    expect(check.faulted.flatMap((group) => group.passes).sort((a, b) => a - b)).toEqual(warned)
    expect(check.faulted.every((group) => group.faults.every((fault) => fault.executionConfirmed === false))).toBe(true)
    expect(check.cleared).toEqual([])
    for (const d of check.descriptions.slice(3)) {
      expect(evidence.passes.get(d.text)!.knitted).toEqual([])
      expect(evidence.passes.get(d.text)!.widths).toEqual([])
    }
  })

  it('retains startup-abort warnings without inventing a knitted pass or a closest match', () => {
    const aborted = trace(knitted)
    const check = checkTraceAgainstKnitsV1(aborted, buildKnitEvidenceV1([{ id: 'aborted', trace: aborted, knittedThrough: 0, stopWithin: [1, 7], events: [{ kind: 'fault', passes: [[1, 7]], approximate: true, what: 'aborted during startup' }] }]))
    expect(check.counts).toMatchObject({ knitted: 0, faulted: 7, new: 7, unclear: 0 })
    expect(check.fresh.every((group) => group.closest === null)).toBe(true)
    expect(check.placement.knitted).toBeNull()
  })

  it('clears a stopped-section warning only after two confirmed clean executions', () => {
    const t = trace(knitted)
    const stopped = { id: 'stopped', trace: t, knittedThrough: 0, stopWithin: [1, 7] as const, events: [{ kind: 'fault' as const, passes: [[1, 7] as const], approximate: true, what: 'stopped during startup' }] }
    const clean = (id: string) => ({ id, trace: t, events: [] })
    const once = checkTraceAgainstKnitsV1(t, buildKnitEvidenceV1([stopped, clean('once')]))
    expect(once.counts).toMatchObject({ new: 0, faulted: 7 })
    const twice = checkTraceAgainstKnitsV1(t, buildKnitEvidenceV1([stopped, clean('once'), clean('twice')]))
    expect(twice.counts).toMatchObject({ knitted: 7, faulted: 0 })
    expect(twice.cleared.flatMap((group) => group.passes)).toHaveLength(7)
  })

  it('uses the selected span for the width of a cast-on on an empty bed', () => {
    const wide = trace(reversible(10, 69, 1, (n) => n === 10 || n === 69))
    const check = checkTraceAgainstKnitsV1(wide, buildKnitEvidenceV1([{ id: 'narrow', trace: trace(knitted), events: [] }]))
    expect(check.descriptions[0]!.width).toBe(60)
    expect(check.statuses[0]).toBe('other-width')
  })

  it('requires two reported runs at each implicated width to clear a fault, counting each run once', () => {
    const runAt = (id: string, width: number) => ({
      id, trace: trace(reversible(10, 9 + width, 3, (n) => n === 10 || n === 9 + width)), events: [],
    })
    const narrow = runAt('narrow', 20)
    const faultAt = (id: string, width: number) => ({
      ...runAt(id, width), events: [{ kind: 'fault' as const, passes: [[2, 2] as const], what: 'dropped' }],
    })
    const history = [faultAt('narrow-fault', 20), faultAt('wide-fault', 60), runAt('wide-one', 60), runAt('wide-two', 60)]
    const check = (extra: ReturnType<typeof runAt>[]) => checkTraceAgainstKnitsV1(narrow.trace, buildKnitEvidenceV1([...history, ...extra]))
    expect(check([]).statuses[1]).toBe('faulted')
    expect(check([narrow]).statuses[1]).toBe('faulted')
    expect(check([narrow, runAt('repeat', 20)]).statuses[1]).toBe('knitted')
  })

  it.each([true, false])('does not clear a fault by excluding suspects from an approximate range (novel=%s)', (novel) => {
    const suspect = knitted.map((row, index) => index >= 5 ? { ...row, roller: 100 } : row)
    const known = trace(novel ? knitted : suspect)
    const ambiguous = (id: string) => ({ id, trace: trace(suspect), events: [{ kind: 'fault' as const, passes: [[4, 7] as const], approximate: true, what: 'dropped somewhere near the top' }] })
    const evidence = buildKnitEvidenceV1([
      { id: 'earlier', trace: known, events: [] },
      { id: 'located-fault', trace: known, events: [{ kind: 'fault', passes: [[2, 2]], what: 'edge dropped' }] },
      ambiguous('ambiguous-1'), ambiguous('ambiguous-2'),
    ])
    const check = checkTraceAgainstKnitsV1(known, evidence)
    expect(check.statuses[1]).toBe('faulted')
    expect(check.cleared).toEqual([])
    const pass = evidence.passes.get(check.descriptions[1]!.text)!
    expect(pass.knittedSinceFault).toBe(0)
    expect(pass.knitted).toEqual(['earlier'])
    expect(pass.unclear).toEqual(['ambiguous-1', 'ambiguous-2'])
  })

  it('counts a pass as knitted when a knit ran it with no fault reported on it', () => {
    const dotted = reversible(10, 29, 2, (n, row) => plain(n) || (n + row) % 5 === 0)
    const evidence = buildKnitEvidenceV1([{ id: 'rectangle', trace: trace(dotted), events: [] }])
    const check = checkTraceAgainstKnitsV1(trace(reversible(60, 79, 8, (n, row) => plain(n - 50) || (n + row) % 3 === 0)), evidence)
    expect(check.counts).toMatchObject({ knitted: 17, new: 0, faulted: 0, 'other-width': 0 })
    // A plain row is a different pass from a patterned one: its yarns cross between the beds only at the edges.
    expect(checkTraceAgainstKnitsV1(trace(knitted), evidence).counts.new).toBe(6)
    expect(check.placement).toEqual({ here: [60, 79], knitted: [10, 29] })
  })

  it('names a new pass, the knitted pass closest to it and how the two differ', () => {
    const evidence = buildKnitEvidenceV1([{ id: 'rectangle', trace: trace(knitted), events: [] }])
    const slower = reversible(10, 29, 3, plain).map((row, index) => (index === 3 ? { ...row, roller: 100 } : row))
    const check = checkTraceAgainstKnitsV1(trace(slower), evidence)
    expect(check.counts.new).toBe(1)
    expect(check.fresh).toHaveLength(1)
    expect(check.fresh[0]!.passes).toEqual([4])
    expect(check.fresh[0]!.closest).toEqual({ knits: ['rectangle'], standing: 'knitted', differences: [{ facet: 'roller', known: '450', here: '100' }] })
  })

  it('says where the closest pass stands when it has a fault on record', () => {
    // The first yarn's rows (passes 2, 4 and 6) all knit at a slack roller.
    const slack = knitted.map((row, index) => (index % 2 === 1 ? { ...row, roller: 100 } : row))
    const evidence = buildKnitEvidenceV1([
      { id: 'clean', trace: trace(slack), events: [] },
      { id: 'dropped', trace: trace(slack), events: [{ kind: 'fault', passes: [[4, 4]], what: 'dropped a stitch' }] },
    ])
    const slower = knitted.map((row, index) => (index % 2 === 1 ? { ...row, roller: 50 } : row))
    const closest = checkTraceAgainstKnitsV1(trace(slower), evidence).fresh[0]!.closest!
    // It knitted once and then faulted: the closest pass is one with a fault on record.
    expect(closest).toMatchObject({ standing: 'faulted', knits: ['clean', 'dropped'], differences: [{ facet: 'roller', known: '100', here: '50' }] })
  })

  it('marks a pass that only knitted on a narrower fabric', () => {
    const evidence = buildKnitEvidenceV1([{ id: 'rectangle', trace: trace(knitted), events: [] }])
    const wide = reversible(10, 69, 2, (n) => n === 10 || n === 69)
    const check = checkTraceAgainstKnitsV1(trace(wide), evidence)
    expect(check.counts).toMatchObject({ new: 0, 'other-width': 5, knitted: 0 })
    expect(check.otherWidth[0]).toMatchObject({ width: [60, 60], knittedAt: [20] })
  })

  it('marks a pass that only knitted on a wider fabric', () => {
    const evidence = buildKnitEvidenceV1([{ id: 'rectangle', trace: trace(knitted), events: [] }])
    const narrow = reversible(10, 17, 2, (n) => n === 10 || n === 17)
    const check = checkTraceAgainstKnitsV1(trace(narrow), evidence)
    expect(check.counts).toMatchObject({ new: 0, 'other-width': 5, knitted: 0 })
    expect(check.otherWidth.flatMap((group) => group.passes).sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5])
    expect(check.otherWidth[0]).toMatchObject({ width: [8, 8], knittedAt: [20], knits: ['rectangle'] })
    // On six needles every needle is near an edge, so the cast-on itself reads as a different pass.
    expect(checkTraceAgainstKnitsV1(trace(reversible(10, 15, 2, (n) => n === 10 || n === 15)), evidence).fresh[0]!.passes).toEqual([1])
  })

  it('carries a located fault to every file with that pass, and keeps the knit as evidence elsewhere', () => {
    // Row 2 (passes 4 and 5) knits at a slack roller; the fault was reported on pass 4.
    const faulty = reversible(10, 29, 3, plain).map((row, index) => (index === 3 || index === 4 ? { ...row, roller: 100 } : row))
    const evidence = buildKnitEvidenceV1([
      { id: 'clean', trace: trace(knitted), events: [] },
      { id: 'dropped', trace: trace(faulty), events: [{ kind: 'fault', passes: [[4, 4]], what: 'dropped the right edge stitch' }] },
    ])
    const check = checkTraceAgainstKnitsV1(trace(faulty), evidence)
    expect(check.statuses[3]).toBe('faulted')
    expect(check.faulted[0]).toMatchObject({ passes: [4], faults: [{ knit: 'dropped', what: 'dropped the right edge stitch' }] })
    // Pass 5 ran in the same knit with nothing reported on it.
    expect(check.statuses[4]).toBe('knitted')
    expect(check.statuses[1]).toBe('knitted')
  })

  it('places a fault that the report only points to on the passes that were new in that knit', () => {
    // Rows 2 and 3 (passes 4 to 7) are where the report points. Only row 3 knits at a slack roller.
    const suspect = knitted.map((row, index) => (index === 5 || index === 6 ? { ...row, roller: 100 } : row))
    const pointsTo = { kind: 'fault' as const, passes: [[4, 7] as const], approximate: true, what: 'a stitch dropped near the top' }
    const earlier = { id: 'earlier', trace: trace(knitted), events: [] }
    const report = checkTraceAgainstKnitsV1(trace(suspect), buildKnitEvidenceV1([earlier, { id: 'later', trace: trace(suspect), events: [pointsTo] }]))
    expect(report.possibleFaultHistory.flatMap((group) => group.passes)).toEqual(expect.arrayContaining([4, 5]))
    const check = (runs: Parameters<typeof buildKnitEvidenceV1>[0]) => checkTraceAgainstKnitsV1(trace(suspect), buildKnitEvidenceV1(runs)).statuses
    // The ordinary rows had knitted before, so the slack rows carry the fault.
    expect(check([earlier, { id: 'dropped', trace: trace(suspect), events: [pointsTo] }])).toEqual(['knitted', 'knitted', 'knitted', 'knitted', 'knitted', 'faulted', 'faulted'])
    // With no earlier knit every pass of the stretch is new; the cast-on, outside it, is not blamed.
    expect(check([{ id: 'dropped', trace: trace(suspect), events: [pointsTo] }])).toEqual(['knitted', 'faulted', 'faulted', 'faulted', 'faulted', 'faulted', 'faulted'])
    // Read off the machine, the same range counts against every pass in it.
    expect(check([earlier, { id: 'dropped', trace: trace(suspect), events: [{ ...pointsTo, approximate: false }] }])).toEqual(['knitted', 'faulted', 'faulted', 'faulted', 'faulted', 'faulted', 'faulted'])
  })

  it('places a pointed-to fault on the passes that knit runs nowhere else, when none was new', () => {
    const slackTop = knitted.map((row, index) => (index === 5 || index === 6 ? { ...row, roller: 100 } : row))
    const evidence = buildKnitEvidenceV1([
      { id: 'first', trace: trace(slackTop), events: [] },
      { id: 'second', trace: trace(slackTop), events: [{ kind: 'fault', passes: [[4, 7]], approximate: true, what: 'a stitch dropped near the top' }] },
    ])
    expect(checkTraceAgainstKnitsV1(trace(slackTop), evidence).statuses).toEqual(['knitted', 'knitted', 'knitted', 'knitted', 'knitted', 'faulted', 'faulted'])
  })

  it('clears a fault once two later knits have run the pass with none reported', () => {
    const fault = { id: 'dropped', trace: trace(knitted), events: [{ kind: 'fault' as const, passes: [[2, 2] as const], what: 'dropped the right edge stitch' }] }
    const clean = (id: string) => ({ id, trace: trace(knitted), events: [] })
    const second = (runs: Parameters<typeof buildKnitEvidenceV1>[0]) => checkTraceAgainstKnitsV1(trace(knitted), buildKnitEvidenceV1(runs))
    expect(second([clean('before'), fault]).statuses[1]).toBe('faulted')
    expect(second([fault, clean('after')]).statuses[1]).toBe('faulted')
    const cleared = second([fault, clean('after'), clean('again')])
    expect(cleared.statuses[1]).toBe('knitted')
    // The history stays readable.
    expect(cleared.cleared).toMatchObject([{ passes: [2, 4, 6], knittedSinceFault: 2, faults: [{ knit: 'dropped' }] }])
    // A new fault counts again.
    expect(second([fault, clean('after'), clean('again'), { ...fault, id: 'dropped again' }]).statuses[1]).toBe('faulted')
  })

  it('does not let a knit nobody reported on clear a fault', () => {
    const fault = { id: 'dropped', trace: trace(knitted), events: [{ kind: 'fault' as const, passes: [[2, 2] as const], what: 'dropped the right edge stitch' }] }
    const photoOnly = (id: string) => ({ id, trace: trace(knitted), clears: false, events: [] })
    const check = checkTraceAgainstKnitsV1(trace(knitted), buildKnitEvidenceV1([fault, photoOnly('photo 1'), photoOnly('photo 2'), photoOnly('photo 3')]))
    expect(check.statuses[1]).toBe('faulted')
    expect(check.faulted[0]).toMatchObject({ knittedSinceFault: 0, knitted: ['photo 1', 'photo 2', 'photo 3'] })
    // Where there was no fault, those knits still show the pass has been on the machine.
    expect(check.statuses[0]).toBe('knitted')
  })

  it('treats a fault placed after an early stop as a fault with no place', () => {
    const later = knitted.map((row, index) => (index > 2 ? { ...row, roller: 100 } : row))
    const evidence = buildKnitEvidenceV1([{ id: 'stopped', trace: trace(later), knittedThrough: 3, events: [{ kind: 'fault', passes: [[5, 5]], what: 'a break somewhere later' }] }])
    const check = checkTraceAgainstKnitsV1(trace(later), evidence)
    // The fault is not dropped: nothing in the knit counts as knitted.
    expect(check.statuses.slice(0, 3)).toEqual(['unclear', 'unclear', 'unclear'])
    expect(check.statuses.slice(3)).toEqual(['new', 'new', 'new', 'new'])
  })

  it('does not count passes after an early stop, or a knit whose fault has no place', () => {
    // The rows after the stop knit at another roller, so they are passes the machine never reached.
    const later = knitted.map((row, index) => (index > 2 ? { ...row, roller: 100 } : row))
    const stopped = buildKnitEvidenceV1([{ id: 'stopped', trace: trace(later), knittedThrough: 3, events: [] }])
    expect(checkTraceAgainstKnitsV1(trace(later), stopped).statuses).toEqual(['knitted', 'knitted', 'knitted', 'new', 'new', 'new', 'new'])
    const vague = buildKnitEvidenceV1([{ id: 'vague', trace: trace(knitted), events: [{ kind: 'fault', passes: null, what: 'a stitch dropped somewhere' }] }])
    const check = checkTraceAgainstKnitsV1(trace(knitted), vague)
    expect(check.counts).toMatchObject({ unclear: 7, knitted: 0, new: 0 })
    expect(check.unclear[0]!.knits).toEqual(['vague'])
  })

  it('keeps a note on how the fabric looked without treating it as a fault', () => {
    const evidence = buildKnitEvidenceV1([{ id: 'loose', trace: trace(knitted), events: [{ kind: 'note', passes: [[2, 3]], what: 'the turning edge looks loose' }] }])
    const check = checkTraceAgainstKnitsV1(trace(knitted), evidence)
    expect(check.counts.knitted).toBe(7)
    expect(check.notes.flatMap((group) => group.notes.map((note) => note.what))).toContain('the turning edge looks loose')
  })

  it("says when a new pass is in one of Kniterate's own files", () => {
    const slack = reversible(10, 29, 1, plain).map((row) => ({ ...row, roller: 100 }))
    const evidence = buildKnitEvidenceV1([{ id: 'rectangle', trace: trace(knitted), events: [] }], [{ name: 'jacquard', trace: trace(slack) }])
    const check = checkTraceAgainstKnitsV1(trace(slack), evidence)
    expect(check.counts.new).toBe(3)
    expect(check.fresh.every((group) => group.kniterate.includes('jacquard'))).toBe(true)
  })
})
