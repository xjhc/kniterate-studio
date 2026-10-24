import fc from 'fast-check'
import { describe, expect, it } from 'vitest'

import { KNITERATE_7GG_KCODE_PROFILE_V2 } from '../../src/knitout/kcode/machine-profile.js'
import { validateKCodeMachineSafetyV1 } from '../../src/knitout/kcode/machine-safety.js'
import type {
  MachineTraceActionV1,
  MachineTraceBedV1,
  MachineTracePassV1,
  MachineTraceSelectionV1,
} from '../../src/knitout/kcode/machine-trace.js'
import type { KCodeSourceSpan } from '../../src/knitout/kcode/types.js'

/*
 * An independent oracle for the envelope's needle geometry, written from the
 * documented rules rather than from machine-safety.ts:
 *
 * - at a whole-number rack r, front needle n faces rear needle n - r, and
 *   facing needles must not both be operated in one pass;
 * - the position facing an operated needle (front n - r, rear n + r) must be
 *   on the bed, columns 0 to 252;
 * - the carriage turns at least 2.5 past the outermost operated needle, in
 *   the stop frame: front n, rear n + floor(r), a transfer's source column;
 * - an idle feeder rests at least 2.5 from every needle it meets: front n,
 *   rear n + floor(r), and a transfer at its front-bed needle;
 * - neighbouring needles on one bed never transfer in the same pass.
 *
 * Seeded random passes cover both beds, both directions, every rack from -4
 * to 4 and idle feeders anywhere along the bed.
 */

const profile = KNITERATE_7GG_KCODE_PROFILE_V2
const STOPPING_DISTANCE = 2.5
const HOME: Record<string, number> = { 1: -11.5, 2: -9.5, 3: -9.5, 4: -7.5, 5: -7.5, 6: -7.5 }
const GEOMETRY_RULES = [
  'machine-safety.facing-needles',
  'machine-safety.unsafe-bed-range',
  'machine-safety.stop-overrun',
  'machine-safety.feeder-clearance',
  'machine-safety.adjacent-transfers',
] as const
type GeometryRule = typeof GEOMETRY_RULES[number]

const span = (offset: number): KCodeSourceSpan => ({
  start: { offset, line: 1, column: 1 },
  end: { offset: offset + 1, line: 1, column: 2 },
})

function selection(bed: MachineTraceBedV1, column: number): MachineTraceSelectionV1 {
  return {
    bed,
    payloadIndex: column + 15,
    kcodeColumn: column,
    traceCoordinate: column,
    stitchSelector: { token: '6', encodedValue: 6, sourceSpan: span(column * 2 + 1) },
    sourceSpan: span(column * 2 + (bed === 'front' ? 0 : 1000)),
  }
}

function pass(input: {
  index: number
  direction: '>>' | '<<'
  carrier: '0' | '1' | '2' | '3' | '4' | '5' | '6'
  rack: number
  carriage: { left: number; right: number }
  carrierStops: { left: number; right: number } | null
  actions: MachineTraceActionV1[]
}): MachineTracePassV1 {
  const selections = input.actions.flatMap((action) => 'at' in action ? [action.at] : 'source' in action ? [action.source, action.target] : [])
  return {
    index: input.index,
    raw: { FRNT: '', STIF: '', REAR: '', STIR: '', footer: '' },
    source: { span: span(0), fullSpan: span(0), FRNT: span(0), STIF: span(0), REAR: span(0), STIR: span(0), footer: span(0) },
    rack: input.rack,
    direction: input.direction,
    operation: input.actions.some((action) => action.kind === 'xfer') ? 'Tr-Rr' : 'Kn-Kn',
    carrier: input.carrier,
    speedRaw: '300',
    speed: 300,
    rollerRaw: '100',
    roller: 100,
    carriageStops: input.carriage,
    carrierStops: input.carrierStops,
    selections: {
      front: selections.filter((item) => item.bed === 'front'),
      rear: selections.filter((item) => item.bed === 'rear'),
    },
    actions: input.actions,
  }
}

interface Case {
  readonly rack: number
  readonly direction: '>>' | '<<'
  readonly transfer: boolean
  readonly sourceBed: MachineTraceBedV1
  readonly front: readonly number[]
  readonly rear: readonly number[]
  readonly leftMargin: number
  readonly rightMargin: number
  readonly feeders: readonly { carrier: '1' | '2' | '3' | '4' | '5' | '6'; rest: number }[]
}

// Anywhere on the bed, clustered in the middle (facing and neighbours) and at both ends (bed range).
const column = fc.oneof(
  fc.integer({ min: 0, max: 252 }),
  fc.integer({ min: 120, max: 130 }),
  fc.integer({ min: 0, max: 4 }),
  fc.integer({ min: 248, max: 252 }),
)

const caseArbitrary: fc.Arbitrary<Case> = fc.record({
  rack: fc.integer({ min: -8, max: 8 }).map((half) => half / 2),
  direction: fc.constantFrom('>>' as const, '<<' as const),
  transfer: fc.boolean(),
  sourceBed: fc.constantFrom('front' as const, 'rear' as const),
  front: fc.uniqueArray(column, { maxLength: 6 }),
  rear: fc.uniqueArray(column, { maxLength: 6 }),
  leftMargin: fc.integer({ min: 0, max: 6 }).map((steps) => steps + 0.5),
  rightMargin: fc.integer({ min: 0, max: 6 }).map((steps) => steps + 0.5),
  feeders: fc.uniqueArray(fc.record({
    carrier: fc.constantFrom('1' as const, '2' as const, '3' as const, '4' as const, '5' as const, '6' as const),
    rest: fc.oneof(fc.integer({ min: -10, max: 262 }), fc.integer({ min: 115, max: 135 })).map((step) => step + 0.5),
  }), { maxLength: 3, selector: (feeder) => feeder.carrier }),
})

function actionsFor(test: Case): MachineTraceActionV1[] {
  if (!test.transfer) {
    return [
      ...test.front.map((column): MachineTraceActionV1 => ({ kind: 'knit', at: selection('front', column) })),
      ...test.rear.map((column): MachineTraceActionV1 => ({ kind: 'drop', at: selection('rear', column) })),
    ]
  }
  // Transfers happen at a whole-number rack: front n meets rear n - r.
  const rack = Math.trunc(test.rack)
  const sources = test.sourceBed === 'front' ? test.front : test.rear
  return sources.flatMap((column): MachineTraceActionV1[] => {
    const target = test.sourceBed === 'front' ? column - rack : column + rack
    if (target < 0 || target > 252) return []
    return [{
      kind: 'xfer',
      source: selection(test.sourceBed, column),
      target: selection(test.sourceBed === 'front' ? 'rear' : 'front', target),
    }]
  })
}

/** The oracle: expected findings of each geometry rule in the operating pass. */
function expected(test: Case, rack: number, actions: readonly MachineTraceActionV1[], carriage: { left: number; right: number }): Record<GeometryRule, number> {
  const counts: Record<GeometryRule, number> = {
    'machine-safety.facing-needles': 0,
    'machine-safety.unsafe-bed-range': 0,
    'machine-safety.stop-overrun': 0,
    'machine-safety.feeder-clearance': 0,
    'machine-safety.adjacent-transfers': 0,
  }
  const regular = actions.filter((action): action is Extract<MachineTraceActionV1, { at: MachineTraceSelectionV1 }> => 'at' in action)
  const transfers = actions.filter((action): action is Extract<MachineTraceActionV1, { kind: 'xfer' }> => action.kind === 'xfer')
  if (Number.isInteger(rack)) {
    const frontColumns = regular.filter((action) => action.at.bed === 'front').map((action) => action.at.kcodeColumn)
    for (const action of regular) {
      if (action.at.bed === 'rear' && frontColumns.includes(action.at.kcodeColumn + rack)) counts['machine-safety.facing-needles'] += 1
    }
  }
  for (const action of regular) {
    const facing = action.at.bed === 'front' ? action.at.kcodeColumn - rack : action.at.kcodeColumn + rack
    if (facing < 0 || facing > 252) counts['machine-safety.unsafe-bed-range'] += 1
  }
  const stopFrame = [
    ...regular.map((action) => action.at.kcodeColumn + (action.at.bed === 'rear' ? Math.floor(rack) : 0)),
    ...transfers.map((action) => action.source.kcodeColumn),
  ]
  const feederFrame = [
    ...regular.map((action) => action.at.kcodeColumn + (action.at.bed === 'rear' ? Math.floor(rack) : 0)),
    ...transfers.map((action) => (action.source.bed === 'front' ? action.source : action.target).kcodeColumn),
  ]
  if (stopFrame.length > 0) {
    if (Math.min(...stopFrame) - carriage.left < STOPPING_DISTANCE || carriage.right - Math.max(...stopFrame) < STOPPING_DISTANCE) {
      counts['machine-safety.stop-overrun'] += 1
    }
    for (const carrier of ['1', '2', '3', '4', '5', '6']) {
      const rest = test.feeders.find((feeder) => feeder.carrier === carrier)?.rest ?? HOME[carrier]!
      if (feederFrame.some((position) => Math.abs(position - rest) < STOPPING_DISTANCE)) counts['machine-safety.feeder-clearance'] += 1
    }
  }
  for (const bed of ['front', 'rear'] as const) {
    const sources = transfers.filter((action) => action.source.bed === bed).map((action) => action.source.kcodeColumn).sort((a, b) => a - b)
    if (sources.some((column, index) => index > 0 && column - sources[index - 1]! === 1)) counts['machine-safety.adjacent-transfers'] += 1
  }
  return counts
}

describe('KCode machine-safety geometry against an independent oracle', () => {
  it('agrees on facing needles, bed range, stop overrun, feeder clearance and neighbouring transfers', () => {
    const fired = Object.fromEntries(GEOMETRY_RULES.map((rule) => [rule, 0])) as Record<GeometryRule, number>
    const clean = { count: 0 }
    fc.assert(fc.property(caseArbitrary, (test) => {
      const actions = actionsFor(test)
      const rack = test.transfer ? Math.trunc(test.rack) : test.rack
      const stops = actions.flatMap((action) => 'at' in action
        ? [action.at.kcodeColumn + (action.at.bed === 'rear' ? Math.floor(rack) : 0)]
        : 'source' in action ? [action.source.kcodeColumn] : [])
      const carriage = stops.length === 0
        ? { left: -15.5, right: 267.5 }
        : { left: Math.min(...stops) - test.leftMargin, right: Math.max(...stops) + test.rightMargin }
      // Each idle feeder first moves from home to where it rests.
      const placements = test.feeders.map((feeder, index) => pass({
        index,
        direction: '>>',
        carrier: feeder.carrier,
        rack: 0,
        carriage: { left: HOME[feeder.carrier]!, right: Math.max(feeder.rest, HOME[feeder.carrier]! + 1) },
        carrierStops: { left: HOME[feeder.carrier]!, right: Math.max(feeder.rest, HOME[feeder.carrier]! + 1) },
        actions: [{ kind: 'move', carrier: feeder.carrier }],
      }))
      const operating = pass({ index: placements.length, direction: test.direction, carrier: '0', rack, carriage, carrierStops: null, actions })
      const report = validateKCodeMachineSafetyV1({ passes: [...placements, operating] }, profile)
      const actual = Object.fromEntries(GEOMETRY_RULES.map((rule) => [rule, report.diagnostics.filter((diagnostic) =>
        diagnostic.rule === rule && diagnostic.passIndex === operating.index).length]))
      const resting = test.feeders.map((feeder) => ({ ...feeder, rest: Math.max(feeder.rest, HOME[feeder.carrier]! + 1) }))
      const oracle = expected({ ...test, feeders: resting }, rack, actions, carriage)
      expect(actual).toEqual(oracle)
      for (const rule of GEOMETRY_RULES) if (oracle[rule] > 0) fired[rule] += 1
      if (GEOMETRY_RULES.every((rule) => oracle[rule] === 0)) clean.count += 1
    }), { seed: 1_366_207_815, numRuns: 2_000 })
    // The cases exercise every rule and plenty of clean passes, not just one side.
    for (const rule of GEOMETRY_RULES) expect(fired[rule], rule).toBeGreaterThan(50)
    expect(clean.count).toBeGreaterThan(50)
  }, 60_000)
})
