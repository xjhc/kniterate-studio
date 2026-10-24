import { describe, expect, it } from 'vitest'

import {
  isKCodeCommandLegalityExportEligible,
  isKCodeMachineExportEligible,
} from '../../src/knitout/kcode/export-eligibility.js'
import {
  KNITERATE_7GG_KCODE_PROFILE_V2,
  type KCodeCarrierToken,
  type KCodeOperationV1,
} from '../../src/knitout/kcode/machine-profile.js'
import {
  KNITERATE_7GG_MACHINE_SAFETY_ENVELOPE_V1,
  MACHINE_SAFETY_RULES_V1,
  validateKCodeMachineSafetyV1 as validateKCodeMachineSafetyV1Impl,
  type MachineSafetyReportV1,
  type MachineSafetyRuleV1,
} from '../../src/knitout/kcode/machine-safety.js'
import {
  projectKCodeMachineTrace,
  type MachineTraceActionV1,
  type MachineTraceBedV1,
  type MachineTracePassV1,
  type MachineTraceSelectionV1,
  type MachineTraceStopRangeV1,
  type MachineTraceV1,
} from '../../src/knitout/kcode/machine-trace.js'
import { validateKCodeMachineTrace } from '../../src/knitout/kcode/machine-validator.js'
import { parseKCodeDocument } from '../../src/knitout/kcode/parser.js'
import type { KCodeSourceSpan } from '../../src/knitout/kcode/types.js'
import { knitoutToKCodeWithTrace } from '../../src/knitout/kniterate/to-kcode.js'
import {
  recordKCodeRuntimeRules,
  recordKCodeTargetedRuntimeWitness,
} from '../../scripts/kcode-rule-runtime-ledger.js'

const WITNESS_SOURCE = 'test/knitout/kcode-machine-safety.test.ts'
const profile = KNITERATE_7GG_KCODE_PROFILE_V2

const validateKCodeMachineSafetyV1 = (
  ...args: Parameters<typeof validateKCodeMachineSafetyV1Impl>
): MachineSafetyReportV1 => {
  const report = validateKCodeMachineSafetyV1Impl(...args)
  recordKCodeRuntimeRules('machine-safety', WITNESS_SOURCE, report.diagnostics)
  return report
}

function span(line: number, column = 1): KCodeSourceSpan {
  return {
    start: { offset: line * 1000 + column, line, column },
    end: { offset: line * 1000 + column + 1, line, column: column + 1 },
  }
}

function at(
  bed: MachineTraceBedV1,
  coordinate: number,
  selector = 6,
  line = 1,
): MachineTraceSelectionV1 {
  const column = coordinate + 16 + (bed === 'rear' ? 400 : 0)
  return {
    bed,
    payloadIndex: coordinate + 15,
    kcodeColumn: coordinate,
    traceCoordinate: coordinate,
    stitchSelector: {
      token: '0123456789ABCDEF'[selector]!,
      encodedValue: selector,
      sourceSpan: span(line + 1, column),
    },
    sourceSpan: span(line, column),
  }
}

const knit = (bed: MachineTraceBedV1, coordinate: number, selector?: number): MachineTraceActionV1 =>
  ({ kind: 'knit', at: at(bed, coordinate, selector) })
const tuck = (bed: MachineTraceBedV1, coordinate: number, selector?: number): MachineTraceActionV1 =>
  ({ kind: 'tuck', at: at(bed, coordinate, selector) })
const drop = (bed: MachineTraceBedV1, coordinate: number, selector?: number): MachineTraceActionV1 =>
  ({ kind: 'drop', at: at(bed, coordinate, selector) })
const xfer = (source: number, target: number): MachineTraceActionV1 =>
  ({ kind: 'xfer', source: at('front', source, 0), target: at('rear', target, 0) })
const split = (source: number, target: number, carrier: Exclude<KCodeCarrierToken, '0'>): MachineTraceActionV1 =>
  ({ kind: 'split', source: at('front', source), target: at('rear', target), carrier })

interface PassSpec {
  readonly direction: '>>' | '<<'
  readonly carrier: KCodeCarrierToken
  readonly operation?: KCodeOperationV1
  readonly rack?: number
  readonly speed?: number
  readonly roller?: number
  readonly carriage?: MachineTraceStopRangeV1
  /** Defaults to the carriage stops for a yarn pass; ignored for carrier 0. */
  readonly carrierStops?: MachineTraceStopRangeV1 | null
  readonly actions?: readonly MachineTraceActionV1[]
}

function pass(spec: PassSpec, index: number): MachineTracePassV1 {
  const carriage = spec.carriage ?? { left: -9.5, right: 105.5 }
  const line = index * 10 + 3
  const speed = spec.speed ?? 300
  const roller = spec.roller ?? 100
  const actions = spec.actions ?? [{ kind: 'move', carrier: spec.carrier }]
  const selections = actions.flatMap((action) => 'at' in action ? [action.at] : 'source' in action ? [action.source, action.target] : [])
  return {
    index,
    raw: { FRNT: '', STIF: '', REAR: '', STIR: '', footer: '' },
    source: {
      span: span(line),
      fullSpan: span(line),
      FRNT: span(line),
      STIF: span(line + 1),
      REAR: span(line + 2),
      STIR: span(line + 3),
      footer: span(line + 4),
    },
    rack: spec.rack ?? 0,
    direction: spec.direction,
    operation: spec.operation ?? 'Kn-Kn',
    carrier: spec.carrier,
    speedRaw: String(speed),
    speed,
    rollerRaw: String(roller),
    roller,
    carriageStops: carriage,
    carrierStops: spec.carrier === '0' ? null : spec.carrierStops === undefined ? carriage : spec.carrierStops,
    selections: {
      front: selections.filter((selection) => selection.bed === 'front'),
      rear: selections.filter((selection) => selection.bed === 'rear'),
    },
    actions,
  }
}

function job(...specs: readonly PassSpec[]): Pick<MachineTraceV1, 'passes'> {
  return { passes: specs.map((spec, index) => pass(spec, index)) }
}

const front = (...coordinates: number[]): MachineTraceActionV1[] => coordinates.map((coordinate) => knit('front', coordinate))

// Carrier 3 (home -9.5) knits front 100..103 out and back, then returns home.
const OUT: PassSpec = { direction: '>>', carrier: '3', carriage: { left: -9.5, right: 105.5 }, actions: front(100, 101, 102, 103) }
const BACK: PassSpec = { direction: '<<', carrier: '3', carriage: { left: 97.5, right: 105.5 }, actions: front(103, 102, 101, 100) }
const HOME: PassSpec = { direction: '<<', carrier: '3', operation: 'Tu-Tu', carriage: { left: -9.5, right: 97.5 } }

function safety(trace: Pick<MachineTraceV1, 'passes'>): MachineSafetyReportV1 {
  return validateKCodeMachineSafetyV1(trace, profile)
}

function rules(report: MachineSafetyReportV1): MachineSafetyRuleV1[] {
  return report.diagnostics.map((diagnostic) => diagnostic.rule)
}

function messages(report: MachineSafetyReportV1): string[] {
  return report.diagnostics.map((diagnostic) => diagnostic.message)
}

function expectTargeted(caseId: string, rule: MachineSafetyRuleV1, report: MachineSafetyReportV1): void {
  recordKCodeTargetedRuntimeWitness({
    rail: 'machine-safety',
    sourcePath: WITNESS_SOURCE,
    caseId,
    expectedRule: rule,
    expectedSeverity: 'error',
    diagnostics: report.diagnostics.map((diagnostic) => ({ rule: diagnostic.rule, severity: diagnostic.severity })),
  })
  expect(report.ok).toBe(false)
  expect(new Set(rules(report))).toEqual(new Set([rule]))
}

function knitoutTrace(body: readonly string[]): MachineTraceV1 {
  const converted = knitoutToKCodeWithTrace([
    ';!knitout-2',
    ';;Machine: kniterate',
    ';;Carriers: 1 2 3 4 5 6',
    'x-stitch-number 6',
    'x-speed-number 300',
    'x-roller-advance 450',
    ...body,
    '',
  ].join('\n'), 'safety.k')
  if (!converted.ok) throw new Error(converted.error)
  const parsed = parseKCodeDocument(converted.kcode, { profile, dialect: 'knitout-vendor', strict: true })
  expect(parsed.ok).toBe(true)
  return projectKCodeMachineTrace(parsed.document, profile)
}

describe('KCode machine-safety envelope', () => {
  it('accepts a complete job that starts and ends with its carrier at home', () => {
    const report = safety(job(OUT, BACK, HOME))
    expect(report).toEqual({
      schemaVersion: 1,
      envelope: { id: 'kniterate-7gg-machine-safety', version: 1 },
      ok: true,
      errorCount: 0,
      counts: Object.fromEntries(MACHINE_SAFETY_RULES_V1.map((rule) => [rule, 0])),
      diagnostics: [],
    })
    expect(safety({ passes: [] }).ok).toBe(true)
  })

  it('accepts what the pinned backend lowers from ordinary Knitout', () => {
    const trace = knitoutTrace([
      'in 3',
      'knit + f100 3', 'knit + f101 3', 'knit + f102 3',
      'knit - f102 3', 'knit - f101 3', 'knit - f100 3',
      'xfer f101 b101',
      'rack 1', 'xfer b101 f102', 'rack 0',
      'knit + f100 3', 'knit + f102 3',
      'out 3',
    ])
    expect(validateKCodeMachineTrace(trace, profile).ok).toBe(true)
    expect(safety(trace).diagnostics).toEqual([])
  })

  describe('facing needles', () => {
    it('refuses both beds on facing needles at a whole-number rack', () => {
      const report = safety(job({ ...OUT, actions: [...front(100, 101), knit('rear', 101), ...front(102, 103)] }, BACK, HOME))
      expectTargeted('facing-knit-rack-0', 'machine-safety.facing-needles', report)
      expect(report.diagnostics).toEqual([expect.objectContaining({
        severity: 'error',
        class: 'machine-safety',
        passIndex: 0,
        actionIndex: 2,
        sourceSpan: at('rear', 101).sourceSpan,
        line: 1,
        column: 517,
        endLine: 1,
        endColumn: 518,
        message: 'Pass 1 operates front 101 and the rear needle facing it, 101, at whole-number rack 0; facing needles collide. Rack to a half pitch or split the pass.',
      })])
    })

    it('pairs front n with rear n - rack for tucks and drops at every whole-number rack', () => {
      const carriage = { left: 90.5, right: 112.5 }
      const facing = (rack: number, actions: MachineTraceActionV1[], carrier: KCodeCarrierToken = '0') =>
        safety(job({ direction: '>>', carrier, rack, carriage, actions })).counts['machine-safety.facing-needles']
      expect(facing(1, [knit('front', 100), knit('rear', 99)])).toBe(1)
      expect(facing(1, [knit('front', 100), knit('rear', 100)])).toBe(0)
      expect(facing(-1, [knit('front', 100), knit('rear', 101)])).toBe(1)
      expect(facing(-2, [tuck('front', 100), tuck('rear', 102)], '3')).toBe(1)
      expect(facing(0, [drop('front', 100), drop('rear', 100)])).toBe(1)
      expect(facing(0, [knit('front', 100), knit('front', 101)])).toBe(0)
      expect(facing(0, [knit('rear', 100), knit('rear', 101)])).toBe(0)
      expect(facing(0.5, [knit('front', 100), knit('rear', 100)])).toBe(0)
      expect(facing(-0.5, [knit('front', 100), knit('rear', 100)])).toBe(0)
      expect(facing(0, [xfer(100, 100)])).toBe(0)
    })
  })

  describe('bed range', () => {
    it('refuses a needle whose facing position is off the bed', () => {
      const report = safety(job(
        { direction: '>>', carrier: '0', rack: 2, carriage: { left: -9.5, right: 5.5 }, actions: [knit('front', 1), knit('front', 2)] },
      ))
      expectTargeted('unsafe-bed-range-rack-2', 'machine-safety.unsafe-bed-range', report)
      expect(messages(report)).toEqual([
        'Pass 1 knits front KCode column 1 at rack 2; the facing position -1 is off the bed (0 to 252).',
      ])
      expect(report.diagnostics[0]).toMatchObject({ actionIndex: 0, sourceSpan: at('front', 1).sourceSpan })
    })

    it('measures the facing position on both beds and at half racks', () => {
      const count = (rack: number, action: MachineTraceActionV1) =>
        safety(job({ direction: '>>', carrier: '0', rack, carriage: { left: -9.5, right: 260.5 }, actions: [action] }))
          .counts['machine-safety.unsafe-bed-range']
      expect(count(2, knit('front', 2))).toBe(0)
      expect(count(-1, knit('front', 252))).toBe(1)
      expect(count(-1, knit('front', 251))).toBe(0)
      expect(count(1, tuck('rear', 251))).toBe(0)
      expect(count(1, tuck('rear', 252))).toBe(1)
      expect(count(-1, drop('rear', 0))).toBe(1)
      expect(count(-1, drop('rear', 1))).toBe(0)
      expect(count(0, knit('front', 0))).toBe(0)
      expect(count(0, knit('front', 252))).toBe(0)
      expect(count(0.5, knit('front', 0))).toBe(1)
      expect(count(4, xfer(2, 0))).toBe(0)
      const half = safety(job({ direction: '>>', carrier: '0', rack: 0.5, carriage: { left: -9.5, right: 5.5 }, actions: [tuck('front', 0)] }))
      expect(messages(half)).toEqual([
        'Pass 1 tucks front KCode column 0 at rack 0.5; the facing position -0.5 is off the bed (0 to 252).',
      ])
    })
  })

  describe('stopping distance', () => {
    it('refuses a carriage or carrier that turns inside the stopping distance', () => {
      const report = safety(job({ ...OUT, carriage: { left: -9.5, right: 104.5 } }, { ...BACK, carriage: { left: 97.5, right: 104.5 } }, HOME))
      expectTargeted('stop-overrun-right', 'machine-safety.stop-overrun', report)
      expect(messages(report)).toEqual([
        'Pass 1 turns the carriage at -9.5..104.5, less than 2.5 past the operated needles 100..103.',
        'Pass 1 turns the carrier 3 at -9.5..104.5, less than 2.5 past the operated needles 100..103.',
        'Pass 2 turns the carriage at 97.5..104.5, less than 2.5 past the operated needles 100..103.',
        'Pass 2 turns the carrier 3 at 97.5..104.5, less than 2.5 past the operated needles 100..103.',
      ])
      expect(report.diagnostics[0]).toMatchObject({ passIndex: 0, sourceSpan: span(3) })
    })

    it('measures both sides exactly at the boundary for each stop range', () => {
      const overruns = (spec: Partial<PassSpec>) => safety(job({
        direction: '>>',
        carrier: '0',
        carriage: { left: 97.5, right: 105.5 },
        actions: front(100, 103),
        ...spec,
      })).counts['machine-safety.stop-overrun']
      expect(overruns({})).toBe(0)
      expect(overruns({ carriage: { left: 98.5, right: 105.5 } })).toBe(1)
      expect(overruns({ carriage: { left: 97.5, right: 104.5 } })).toBe(1)
      expect(overruns({ carriage: { left: 98.5, right: 104.5 } })).toBe(1)
      expect(overruns({ carrier: '3', carrierStops: { left: 97.5, right: 105.5 } })).toBe(0)
      expect(overruns({ carrier: '3', carrierStops: { left: 98.5, right: 105.5 } })).toBe(1)
      expect(overruns({ carrier: '3', carrierStops: { left: 97.5, right: 104.5 } })).toBe(1)
      expect(overruns({ carrier: '3', carrierStops: null })).toBe(0)
      expect(overruns({ actions: [] })).toBe(0)
      // Transfers use the source column; rear stitches use rear + floor(rack).
      expect(overruns({ actions: [xfer(100, 100), xfer(103, 103)] })).toBe(0)
      expect(overruns({ rack: 1.5, actions: [knit('rear', 99), knit('rear', 102)] })).toBe(0)
      expect(overruns({ rack: 1.5, actions: [knit('rear', 99), knit('rear', 103)] })).toBe(1)
      // Every kind of needle action counts as operated.
      const tight = { carriage: { left: 98.5, right: 105.5 } }
      expect(overruns({ ...tight, actions: [tuck('front', 100)] })).toBe(1)
      expect(overruns({ ...tight, actions: [drop('front', 100)] })).toBe(1)
      expect(overruns({ ...tight, actions: [xfer(100, 100)] })).toBe(1)
      expect(overruns({ ...tight, carrier: '3', carrierStops: { left: 98.5, right: 105.5 }, actions: [split(100, 100, '3')] })).toBe(2)
      expect(overruns({ ...tight, actions: [{ kind: 'move', carrier: '0' }] })).toBe(0)
      // A carrierless pass has no carrier stops to check, even if it encodes some.
      const carrierless = pass({ direction: '>>', carrier: '0', carriage: { left: 97.5, right: 105.5 }, actions: front(100) }, 0)
      expect(safety({ passes: [{ ...carrierless, carrierStops: { left: 99.5, right: 100.5 } }] }).ok).toBe(true)
    })

    it('refuses an idle carrier resting within the stopping distance of an operated needle', () => {
      const report = safety(job(
        { direction: '>>', carrier: '4', carriage: { left: -7.5, right: 102.5 }, actions: front(100) },
        { direction: '<<', carrier: '0', carriage: { left: 95.5, right: 102.5 }, actions: [] },
        { ...OUT, carriage: { left: -9.5, right: 105.5 }, actions: front(100, 101, 102, 103) },
        { ...BACK },
        HOME,
        { direction: '<<', carrier: '4', operation: 'Tu-Tu', carriage: { left: -7.5, right: 102.5 } },
      ))
      expectTargeted('feeder-over-needles', 'machine-safety.feeder-clearance', report)
      expect(messages(report)).toEqual([
        'Pass 3 operates needle 102 while carrier 4 rests at 102.5, closer than 2.5; a feeder over the needles collides with them.',
        'Pass 4 operates needle 103 while carrier 4 rests at 102.5, closer than 2.5; a feeder over the needles collides with them.',
      ])
      expect(report.diagnostics[0]).toMatchObject({ passIndex: 2, actionIndex: 2, sourceSpan: at('front', 102).sourceSpan })
    })

    it('measures idle carriers from the nearest operated needle on either side', () => {
      const clearance = (rest: number, actions: MachineTraceActionV1[]) => {
        const report = safety(job(
          { direction: '>>', carrier: '4', carriage: { left: -7.5, right: rest }, carrierStops: { left: -7.5, right: rest }, actions: [] },
          { direction: '<<', carrier: '0', carriage: { left: 80.5, right: rest }, actions },
        ))
        return report.diagnostics.filter((diagnostic) => diagnostic.rule === 'machine-safety.feeder-clearance')
      }
      expect(clearance(102.5, front(100))).toEqual([])
      expect(clearance(101.5, front(100))).toHaveLength(1)
      expect(clearance(97.5, front(100))).toEqual([])
      expect(clearance(98.5, front(100))).toHaveLength(1)
      expect(clearance(97.5, front(95, 100))).toEqual([])
      expect(clearance(98.5, front(95, 100))).toEqual([expect.objectContaining({ actionIndex: 1 })])
      expect(clearance(96.5, front(95, 100))).toEqual([expect.objectContaining({ actionIndex: 0 })])
      expect(clearance(96.5, front(100, 95))).toEqual([expect.objectContaining({ actionIndex: 1 })])
      // Equal distances keep the first operated needle.
      expect(clearance(97.5, front(96, 99))).toEqual([expect.objectContaining({ actionIndex: 0, message: expect.stringContaining('needle 96') })])
      expect(clearance(101.5, [tuck('front', 100)])).toHaveLength(1)
      expect(clearance(101.5, [drop('front', 100)])).toHaveLength(1)
      expect(clearance(101.5, [xfer(100, 100)])).toHaveLength(1)
      // The pass's own carrier travels with the carriage.
      const own = safety(job({ direction: '>>', carrier: '4', carriage: { left: -7.5, right: 102.5 }, actions: front(100) }))
      expect(own.counts['machine-safety.feeder-clearance']).toBe(0)
    })
  })

  describe('transfers', () => {
    it('refuses a transfer with a carrier once per pass', () => {
      const report = safety(job(
        OUT,
        { direction: '<<', carrier: '3', operation: 'Tr-Rl', carriage: { left: 97.5, right: 105.5 }, actions: [split(103, 103, '3'), split(100, 100, '3')] },
        HOME,
      ))
      expectTargeted('transfer-with-carrier', 'machine-safety.transfer-with-carrier', report)
      expect(messages(report)).toEqual([
        'Pass 2 transfers with carrier 3; the machine transfers only on rows with no yarn carrier.',
      ])
      expect(report.diagnostics[0]).toMatchObject({ passIndex: 1, sourceSpan: span(17) })
    })

    it('refuses transfer passes faster or harder than the transfer envelope', () => {
      const transfer = (speed: number, roller: number, actions = [xfer(100, 100)]) => safety(job(
        OUT,
        { direction: '<<', carrier: '0', operation: 'Tr-Rl', speed, roller, carriage: { left: 97.5, right: 105.5 }, actions },
        { ...HOME, carriage: { left: -9.5, right: 105.5 }, carrierStops: { left: -9.5, right: 105.5 } },
      ))
      expect(transfer(400, 450).ok).toBe(true)
      expectTargeted('transfer-speed', 'machine-safety.transfer-settings', transfer(400.5, 0))
      expect(messages(transfer(400.5, 0))).toEqual([
        'Transfer pass 2 runs at speed 400.5 with roller 0; transfers stay at or below speed 400 and roller 450.',
      ])
      expect(transfer(100, 451).counts['machine-safety.transfer-settings']).toBe(1)
      expect(transfer(500, 0, [drop('front', 100)]).counts['machine-safety.transfer-settings']).toBe(0)
      expect(transfer(500, 0, [drop('front', 103), xfer(100, 100)]).counts['machine-safety.transfer-settings']).toBe(1)
    })
  })

  it('refuses a carrierless pass that selects needles with anything but Kn-Kn', () => {
    const carrierless = (operation: KCodeOperationV1, actions: MachineTraceActionV1[], carrier: KCodeCarrierToken = '0') =>
      safety(job({ direction: '>>', carrier, operation, carriage: { left: 97.5, right: 105.5 }, actions }))
    const report = carrierless('Tu-Tu', [drop('front', 100)])
    expectTargeted('carrierless-tuck', 'machine-safety.carrierless-tuck', report)
    expect(messages(report)).toEqual([
      'Pass 1 selects needles with Tu-Tu and no carrier; a carrierless pass that selects needles must be a Kn-Kn drop.',
    ])
    expect(report.diagnostics[0]).toMatchObject({ sourceSpan: span(7) })
    expect(carrierless('Kn-Tu', [drop('front', 100), drop('front', 101)]).diagnostics).toHaveLength(1)
    expect(carrierless('Kn-Kn', [drop('front', 100)]).ok).toBe(true)
    expect(carrierless('Tu-Tu', []).ok).toBe(true)
    expect(carrierless('Tr-Rr', [xfer(100, 100)]).ok).toBe(true)
    // Only a carrierless pass can drop; a yarn pass is not checked here.
    expect(carrierless('Tu-Tu', [drop('front', 100)], '3').counts['machine-safety.carrierless-tuck']).toBe(0)
  })

  describe('carrier home positions', () => {
    it('refuses a carrier whose first move is not rightward from its home stop', () => {
      const leftward = safety(job(
        { direction: '<<', carrier: '3', carriage: { left: 97.5, right: 105.5 }, actions: front(103, 102, 101, 100) },
        HOME,
      ))
      expectTargeted('carrier-starts-right', 'machine-safety.carrier-start', leftward)
      expect(messages(leftward)).toEqual([
        'Carrier 3 first moves left from 105.5 in pass 1; every carrier starts parked at its home stop -9.5 and first moves right.',
      ])
      const away = safety(job({ ...OUT, carriage: { left: -5.5, right: 105.5 } }, BACK, HOME))
      expect(messages(away)).toEqual([
        'Carrier 3 first moves right from -5.5 in pass 1; every carrier starts parked at its home stop -9.5 and first moves right.',
      ])
      expect(away.diagnostics[0]).toMatchObject({ passIndex: 0, sourceSpan: span(3) })
      // Arriving at home is not starting there: the first move must be rightward.
      const intoHome = safety(job({ ...HOME, carriage: { left: -9.5, right: 97.5 } }))
      expect(messages(intoHome)).toEqual([
        'Carrier 3 first moves left from 97.5 in pass 1; every carrier starts parked at its home stop -9.5 and first moves right.',
      ])
    })

    it('checks each carrier against its own home stop', () => {
      const fromHome = (carrier: Exclude<KCodeCarrierToken, '0'>, left: number) => safety(job(
        { direction: '>>', carrier, carriage: { left, right: 105.5 }, actions: front(100, 103) },
        { direction: '<<', carrier, operation: 'Tu-Tu', carriage: { left, right: 105.5 } },
      ))
      expect(fromHome('1', -11.5).ok).toBe(true)
      expect(fromHome('2', -9.5).ok).toBe(true)
      expect(fromHome('5', -7.5).ok).toBe(true)
      expect(fromHome('6', -7.5).ok).toBe(true)
      expect(rules(fromHome('1', -9.5))).toEqual(['machine-safety.carrier-start', 'machine-safety.carrier-not-home'])
      expect(messages(fromHome('4', -9.5))).toEqual([
        'Carrier 4 first moves right from -9.5 in pass 1; every carrier starts parked at its home stop -7.5 and first moves right.',
        'Pass 1 starts carrier 4 from -9.5, left of its home stop -7.5.',
        'Pass 2 takes carrier 4 to -9.5, left of its home stop -7.5.',
        'The job leaves carrier 4 at -9.5 after pass 2; it must end parked at its home stop -7.5, where the next job expects it.',
      ])
    })

    it('refuses a carrier taken left of its home stop', () => {
      const report = safety(job(
        OUT,
        BACK,
        { ...HOME, carriage: { left: -11.5, right: 97.5 } },
        { direction: '>>', carrier: '3', operation: 'Tu-Tu', carriage: { left: -11.5, right: -9.5 } },
      ))
      expectTargeted('carrier-behind-home', 'machine-safety.carrier-behind-home', report)
      expect(messages(report)).toEqual([
        'Pass 3 takes carrier 3 to -11.5, left of its home stop -9.5.',
        'Pass 4 starts carrier 3 from -11.5, left of its home stop -9.5.',
      ])
      expect(report.diagnostics[0]).toMatchObject({ passIndex: 2, sourceSpan: span(23) })
    })

    it('refuses a job that leaves a carrier away from home', () => {
      const report = safety(job(OUT, BACK))
      expectTargeted('carrier-left-on-bed', 'machine-safety.carrier-not-home', report)
      expect(messages(report)).toEqual([
        'The job leaves carrier 3 at 97.5 after pass 2; it must end parked at its home stop -9.5, where the next job expects it.',
      ])
      expect(report.diagnostics[0]).toMatchObject({ passIndex: 1, sourceSpan: span(17) })
      expect(rules(safety(job(OUT)))).toEqual(['machine-safety.carrier-not-home'])
      expect(safety(job(OUT, { ...BACK, carrierStops: null })).diagnostics).toHaveLength(1)
    })
  })

  describe('speed and roller', () => {
    const withSettings = (speed: number, roller: number) => safety(job({ ...OUT, speed, roller }, BACK, HOME))

    it('refuses a speed outside the machine range', () => {
      expect(withSettings(10, 100).ok).toBe(true)
      expect(withSettings(800, 100).ok).toBe(true)
      const slow = withSettings(9.5, 100)
      expectTargeted('speed-below-range', 'machine-safety.speed-range', slow)
      expect(messages(slow)).toEqual(['Pass 1 runs at speed 9.5; the machine\'s range is 10 to 800.'])
      expect(slow.diagnostics[0]).toMatchObject({ passIndex: 0, sourceSpan: span(7) })
      expect(Object.keys(slow.diagnostics[0]!)).not.toContain('actionIndex')
      expect(withSettings(800.5, 100).counts['machine-safety.speed-range']).toBe(1)
      expect(withSettings(Number.NaN, 100).counts['machine-safety.speed-range']).toBe(1)
    })

    it('refuses a roller outside the takedown range', () => {
      expect(withSettings(300, 999).ok).toBe(true)
      const reversed = withSettings(300, -1)
      expectTargeted('roller-reversed', 'machine-safety.roller-range', reversed)
      expect(messages(reversed)).toEqual([
        'Pass 1 sets the roller to -1; it must stay between 0 and 999, and a negative value pushes the fabric back up into the needles.',
      ])
      expect(reversed.diagnostics[0]).toMatchObject({ sourceSpan: span(7) })
      expect(withSettings(300, 1000).counts['machine-safety.roller-range']).toBe(1)
      expect(withSettings(300, Number.NaN).counts['machine-safety.roller-range']).toBe(1)
    })

    it('refuses more than four knitting passes in a row without takedown', () => {
      const row = (index: number, roller: number, actions?: MachineTraceActionV1[]): PassSpec => index % 2 === 0
        ? { ...OUT, roller, ...(index === 0 ? {} : { carriage: { left: 97.5, right: 105.5 } }), ...(actions === undefined ? {} : { actions }) }
        : { ...BACK, roller, ...(actions === undefined ? {} : { actions }) }
      const rows = (rollers: readonly number[]) => {
        const passes = rollers.map((roller, index) => row(index, roller))
        const last = passes.at(-1)!
        return safety(job(...passes, { ...HOME, carriage: { left: -9.5, right: last.direction === '>>' ? 105.5 : 97.5 } }))
      }
      expect(rows([0, 0, 0, 0]).ok).toBe(true)
      const five = rows([0, 0, 0, 0, 0])
      expectTargeted('takedown-gap', 'machine-safety.takedown-gap', five)
      expect(messages(five)).toEqual([
        'Pass 5 makes 5 knitting passes in a row with the roller at 0 or below; with no pull-down the loops cannot clear the needles (at most 4).',
      ])
      expect(five.diagnostics[0]).toMatchObject({ passIndex: 4, sourceSpan: span(47) })
      expect(rows([0, 0, 0, 0, 0, 0, 0]).counts['machine-safety.takedown-gap']).toBe(1)
      expect(rows([0, 0, 0, 0, 1, 0, 0, 0, 0]).ok).toBe(true)
      expect(rows([100, 0, 0, 0, 0]).ok).toBe(true)
      expect(rows([0, 0, 0, 0, 0, 100, 0, 0, 0, 0, 0]).counts['machine-safety.takedown-gap']).toBe(2)
      // Tucks and splits form loops; transfers and drops do not.
      const tucks = [tuck('front', 100), tuck('front', 103)]
      const tucked = safety(job(...[0, 1, 2, 3, 4].map((index) => row(index, 0, tucks)), { ...HOME, carriage: { left: -9.5, right: 105.5 } }))
      expect(tucked.counts['machine-safety.takedown-gap']).toBe(1)
      // A transfer with the roller on does not end the run...
      const pulledTransfer = safety(job(
        ...[0, 1, 2, 3].map((index) => row(index, 0)),
        { direction: '<<', carrier: '0', operation: 'Tr-Rl', roller: 100, carriage: { left: 97.5, right: 105.5 }, actions: [xfer(100, 100)] },
        { ...row(4, 0), carriage: { left: 97.5, right: 105.5 } },
        { ...HOME, carriage: { left: -9.5, right: 105.5 } },
      ))
      expect(pulledTransfer.diagnostics).toEqual([expect.objectContaining({ rule: 'machine-safety.takedown-gap', passIndex: 5 })])
      // ...and drops and moves without the roller do not lengthen it.
      const idle = safety(job(
        ...[0, 1, 2].map((index) => row(index, 0)),
        { direction: '<<', carrier: '0', roller: 0, carriage: { left: 97.5, right: 105.5 }, actions: [drop('front', 103)] },
        { direction: '>>', carrier: '0', roller: 0, carriage: { left: 97.5, right: 105.5 }, actions: [] },
        { ...row(3, 0), carriage: { left: 97.5, right: 105.5 } },
        { ...HOME, carriage: { left: -9.5, right: 97.5 } },
      ))
      expect(idle.counts['machine-safety.takedown-gap']).toBe(0)
      const mixed = safety(job(...[0, 1, 2, 3].map((index) => row(index, 0)),
        { ...row(4, 0, [drop('front', 100), knit('front', 103)]), carriage: { left: 97.5, right: 105.5 } },
        { ...HOME, carriage: { left: -9.5, right: 105.5 } }))
      expect(mixed.counts['machine-safety.takedown-gap']).toBe(1)
      const splits = safety(job(...[0, 1, 2, 3].map((index) => row(index, 0)),
        { direction: '>>', carrier: '3', operation: 'Tr-Rr', roller: 0, carriage: { left: 97.5, right: 105.5 }, actions: [split(100, 100, '3')] },
        { ...HOME, carriage: { left: -9.5, right: 105.5 } }))
      expect(splits.counts['machine-safety.takedown-gap']).toBe(1)
    })
  })

  it('refuses a knit or tuck below the smallest stitch size', () => {
    const sized = (actions: MachineTraceActionV1[]) => safety(job({ ...OUT, actions }, BACK, HOME))
    expect(sized([knit('front', 100, 2), tuck('front', 103, 2)]).ok).toBe(true)
    const tight = sized([knit('front', 100, 1), knit('front', 103, 6)])
    expectTargeted('stitch-too-small', 'machine-safety.stitch-too-small', tight)
    expect(messages(tight)).toEqual(['Pass 1 knits at stitch size 1; a stitch below 2 can break the yarn or the needles.'])
    expect(tight.diagnostics[0]).toMatchObject({ actionIndex: 0, sourceSpan: at('front', 100, 1).stitchSelector.sourceSpan })
    expect(sized([knit('front', 100), tuck('front', 103, 0)]).diagnostics[0]).toMatchObject({
      actionIndex: 1,
      message: 'Pass 1 tucks at stitch size 0; a stitch below 2 can break the yarn or the needles.',
    })
    expect(safety(job(OUT, { direction: '<<', carrier: '0', carriage: { left: 97.5, right: 105.5 }, actions: [drop('front', 100, 0)] }, HOME)).ok).toBe(true)
    expect(safety(job(OUT, { direction: '<<', carrier: '0', operation: 'Tr-Rl', carriage: { left: 97.5, right: 105.5 }, actions: [xfer(100, 100)] }, HOME)).ok).toBe(true)
  })

  it('bounds retained details and keeps exact counts', () => {
    const passes: PassSpec[] = Array.from({ length: 600 }, (_, index) => ({
      ...(index % 2 === 0 ? OUT : BACK),
      ...(index === 0 ? {} : index % 2 === 0 ? { carriage: { left: 97.5, right: 105.5 } } : {}),
      speed: 5,
    }))
    const report = safety(job(...passes, HOME))
    expect(report.errorCount).toBe(600)
    expect(report.counts['machine-safety.speed-range']).toBe(600)
    expect(report.diagnostics).toHaveLength(513)
    expect(report.diagnostics.at(-2)).toMatchObject({ passIndex: 511 })
    expect(report.diagnostics.at(-1)).toMatchObject({
      severity: 'error',
      class: 'machine-safety',
      rule: 'machine-safety.speed-range',
      passIndex: null,
      sourceSpan: null,
      line: null,
      column: null,
      endLine: null,
      endColumn: null,
      occurrences: 88,
    })
  })

  it('reads its thresholds from the supplied envelope', () => {
    const strict = { ...KNITERATE_7GG_MACHINE_SAFETY_ENVELOPE_V1, speed: { ...KNITERATE_7GG_MACHINE_SAFETY_ENVELOPE_V1.speed, max: 200 } }
    expect(validateKCodeMachineSafetyV1(job(OUT, BACK, HOME), profile, strict).counts['machine-safety.speed-range']).toBe(3)
  })

  it('makes export depend on both command legality and the safety envelope', () => {
    const trace = knitoutTrace(['in 3', 'knit + f100 3', 'knit - f100 3', 'out 3'])
    const validation = validateKCodeMachineTrace(trace, profile)
    const clean = safety(trace)
    expect(isKCodeMachineExportEligible({ parseOk: true, validation, safety: clean })).toBe(true)
    const unsafe = safety(job(OUT, BACK))
    expect(isKCodeCommandLegalityExportEligible({ parseOk: true, validation })).toBe(true)
    expect(isKCodeMachineExportEligible({ parseOk: true, validation, safety: unsafe })).toBe(false)
    expect(isKCodeMachineExportEligible({ parseOk: true, validation, safety: null })).toBe(false)
    expect(isKCodeMachineExportEligible({ parseOk: false, validation, safety: clean })).toBe(false)
  })

  it('documents every threshold with evidence', () => {
    const envelope = KNITERATE_7GG_MACHINE_SAFETY_ENVELOPE_V1
    expect(envelope.stoppingDistance.value).toBe(2.5)
    expect(envelope.carrierHomeStops.value).toEqual({ 1: -11.5, 2: -9.5, 3: -9.5, 4: -7.5, 5: -7.5, 6: -7.5 })
    expect([envelope.speed.min, envelope.speed.max]).toEqual([10, 800])
    expect([envelope.roller.min, envelope.roller.max]).toEqual([0, 999])
    expect(envelope.takedown.maxPassesWithoutRoller).toBe(4)
    expect(envelope.loopFormingStitch.min).toBe(2)
    expect([envelope.transfer.maxSpeed, envelope.transfer.maxRoller]).toEqual([400, 450])
    const racking = 'https://support.kniterate.com/hc/en-us/articles/360016699857'
    const checks = 'https://support.kniterate.com/hc/en-us/articles/11698092127005'
    const feeder = 'https://support.kniterate.com/hc/en-us/articles/360010645337'
    const transfers = 'https://support.kniterate.com/hc/en-us/articles/360012868118'
    const manual = 'https://support.kniterate.com/hc/article_attachments/360009727217'
    const customist = 'https://editor.kniterate.design/documentation'
    const backend = 'packages/machine-lib/src/knitout/vendor/knitout-to-kcode.cjs'
    const corpus = 'packages/machine-lib/reference/*.kc'
    const evidence = Object.fromEntries(Object.entries(envelope)
      .filter(([, value]) => typeof value === 'object')
      .map(([key, value]) => [key, [value.evidence.confidence, value.evidence.provenance]]))
    expect(evidence).toEqual({
      facingNeedles: ['official-documented', [racking, checks, customist]],
      bedRange: ['official-documented', [checks, customist, corpus]],
      stoppingDistance: ['official-documented', [feeder, customist, backend, corpus]],
      transferWithCarrier: ['official-documented', [transfers, checks, customist, corpus]],
      carrierlessTuck: ['reference-corpus-observed', [backend, corpus]],
      carrierHomeStops: ['official-documented', [checks, customist, backend, corpus]],
      speed: ['official-documented', [customist]],
      roller: ['official-documented', [customist, corpus]],
      takedown: ['reference-corpus-observed', [customist, corpus]],
      loopFormingStitch: ['official-documented', [manual, corpus]],
      transfer: ['reference-corpus-observed', [transfers, customist, corpus]],
    })
    for (const value of Object.values(envelope)) {
      if (typeof value !== 'object') continue
      expect(value.evidence.note.length).toBeGreaterThan(0)
    }
  })
})
