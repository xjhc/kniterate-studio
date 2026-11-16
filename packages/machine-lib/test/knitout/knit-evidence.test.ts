import { describe, expect, it } from 'vitest'
import { buildKnitEvidenceV1, checkTraceAgainstKnitsV1, describeTracePassesV1, type MachineTraceV1 } from '../../src/browser.js'

type Bed = 'front' | 'rear'
type Act = ['knit' | 'tuck' | 'drop', Bed, number] | ['xfer', Bed, number, Bed, number]
interface Row { carrier: string; acts: Act[]; roller?: number; stops?: [number, number] }
const at = (bed: Bed, n: number) => ({ bed, traceCoordinate: n, stitchSelector: { encodedValue: 7 } })
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
      actions: row.acts.map((act) => (act[0] === 'xfer' ? { kind: 'xfer', source: at(act[1], act[2]), target: at(act[3], act[4]) } : { kind: act[0], at: at(act[1], act[2]) })),
    })),
    rackCommands: [],
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
    expect(passes[2]!.facets['xfer f>b']).toBe('R0>R0/1>0')
    // The loop now sits on the rear bed at the right edge; the front fabric ends one needle in.
    expect(passes[3]!.facets['xfer b>f']).toBe('R0>R1/1>1')
    expect(passes[4]!.facets['knit f']).toBe('stitch 7 at L0 R0/2 in:all')
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
})

describe('knit evidence', () => {
  const plain = (n: number) => n === 10 || n === 29
  /** Three rows whose yarns cross between the beds only at the two edges. */
  const knitted = reversible(10, 29, 3, plain)

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
    expect(check.fresh[0]!.closest).toEqual({ knits: ['rectangle'], faulted: false, differences: [{ facet: 'roller', known: '450', here: '100' }] })
  })

  it('marks a pass that only knitted on a wider fabric', () => {
    const evidence = buildKnitEvidenceV1([{ id: 'rectangle', trace: trace(knitted), events: [] }])
    const narrow = reversible(10, 17, 2, (n) => n === 10 || n === 17)
    const check = checkTraceAgainstKnitsV1(trace(narrow), evidence)
    expect(check.counts).toMatchObject({ new: 0, 'other-width': 4, knitted: 1 })
    expect(check.otherWidth.flatMap((group) => group.passes).sort((a, b) => a - b)).toEqual([2, 3, 4, 5])
    expect(check.otherWidth[0]).toMatchObject({ width: [8, 8], knittedAt: [20, 20], knits: ['rectangle'] })
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
