import fc from 'fast-check'
import { describe, expect, it } from 'vitest'

import {
  KNITERATE_7GG_KCODE_PROFILE_V1,
} from '../../src/knitout/kcode/machine-profile.js'
import {
  projectKCodeMachineTrace,
  regularActionTraversalCoordinate,
  type MachineTraceActionV1,
  type MachineTraceBedV1,
  type MachineTracePassV1,
  type MachineTraceSelectionV1,
  type MachineTraceV1,
} from '../../src/knitout/kcode/machine-trace.js'
import {
  validateKCodeMachineTrace,
} from '../../src/knitout/kcode/machine-validator.js'
import { parseKCodeDocument } from '../../src/knitout/kcode/parser.js'
import type { KCodeSourceSpan } from '../../src/knitout/kcode/types.js'
import { knitoutToKCodeWithTrace } from '../../src/knitout/kniterate/to-kcode.js'

const semanticProgram = [
  ';!knitout-2',
  ';;Machine: kniterate',
  ';;Carriers: 1 2 3 4 5 6',
  'x-stitch-number 6',
  'x-speed-number 300',
  'x-roller-advance 450',
  'in 2',
  'tuck + f40 2',
  'knit - f40 2',
  'split + f40 b40 2',
  'drop f40',
  'out 2',
  '',
].join('\n')

function compileTrace(source = semanticProgram): MachineTraceV1 {
  const compiled = knitoutToKCodeWithTrace(source, 'validator.k')
  if (!compiled.ok) throw new Error(compiled.error)
  const parsed = parseKCodeDocument(compiled.kcode, {
    profile: KNITERATE_7GG_KCODE_PROFILE_V1,
    dialect: 'knitout-vendor',
    strict: true,
  })
  expect(parsed.diagnostics).toEqual([])
  expect(parsed.ok).toBe(true)
  return projectKCodeMachineTrace(
    parsed.document,
    KNITERATE_7GG_KCODE_PROFILE_V1,
  )
}

function withPasses(
  trace: MachineTraceV1,
  passes: readonly MachineTracePassV1[],
): MachineTraceV1 {
  const indexedPasses = passes.map((pass, index) => ({ ...pass, index }))
  return {
    ...trace,
    rackCommands: rackCommandsForPasses(indexedPasses),
    passes: indexedPasses,
  }
}

function rules(trace: MachineTraceV1): string[] {
  return validateKCodeMachineTrace(
    trace,
    KNITERATE_7GG_KCODE_PROFILE_V1,
  ).diagnostics.map((diagnostic) => diagnostic.rule)
}

function sourceSpan(offset: number, line: number): KCodeSourceSpan {
  return {
    start: { offset, line, column: 1 },
    end: { offset: offset + 1, line, column: 2 },
  }
}

function rackCommandsForPasses(
  passes: readonly MachineTracePassV1[],
): MachineTraceV1['rackCommands'] {
  const fallback = sourceSpan(0, 1)
  const firstSource = passes[0]?.source.span ?? fallback
  const commands: Array<MachineTraceV1['rackCommands'][number]> = [{
    index: 0,
    beforePassIndex: 0,
    valueRaw: '0',
    value: 0,
    source: { span: firstSource, fullSpan: firstSource },
  }]
  let currentRack = 0
  for (const [beforePassIndex, pass] of passes.entries()) {
    if (Object.is(pass.rack, currentRack)) continue
    commands.push({
      index: commands.length,
      beforePassIndex,
      valueRaw: String(pass.rack),
      value: pass.rack,
      source: { span: pass.source.span, fullSpan: pass.source.fullSpan },
    })
    currentRack = pass.rack
  }
  return commands
}

function selection(
  passIndex: number,
  bed: MachineTraceBedV1,
  coordinate = 0,
): MachineTraceSelectionV1 {
  const offset = passIndex * 100 + (bed === 'front' ? 10 : 20)
  return {
    bed,
    payloadIndex: coordinate + 15,
    kcodeColumn: coordinate,
    traceCoordinate: coordinate,
    stitchSelector: {
      token: '5',
      encodedValue: 5,
      sourceSpan: sourceSpan(offset + 1, passIndex * 5 + 2),
    },
    sourceSpan: sourceSpan(offset, passIndex * 5 + 1),
  }
}

type SmallAction = 'K' | 'T' | 'D' | 'X' | 'S' | 'Y'

function smallPass(kind: SmallAction, index: number): MachineTracePassV1 {
  const front = selection(index, 'front')
  const rear = selection(index, 'rear')
  let carrier: MachineTracePassV1['carrier'] = '2'
  let operation = 'Kn-Kn'
  let selections: MachineTracePassV1['selections'] = { front: [front], rear: [] }
  let actions: readonly MachineTraceActionV1[]

  switch (kind) {
    case 'K':
      actions = [{ kind: 'knit', at: front }]
      break
    case 'T':
      operation = 'Tu-Tu'
      actions = [{ kind: 'tuck', at: front }]
      break
    case 'D':
      carrier = '0'
      actions = [{ kind: 'drop', at: front }]
      break
    case 'X':
      carrier = '0'
      operation = 'Tr-Rr'
      selections = { front: [front], rear: [rear] }
      actions = [{ kind: 'xfer', source: front, target: rear }]
      break
    case 'S':
      operation = 'Tr-Rr'
      selections = { front: [front], rear: [rear] }
      actions = [{ kind: 'split', source: front, target: rear, carrier: '2' }]
      break
    case 'Y':
      carrier = '0'
      operation = 'Rr-Tr'
      selections = { front: [front], rear: [rear] }
      actions = [{ kind: 'xfer', source: rear, target: front }]
      break
  }

  const span = sourceSpan(index * 100, index * 5 + 1)
  const direction = index % 2 === 0 ? '>>' : '<<'
  return {
    index,
    raw: { FRNT: '', STIF: '', REAR: '', STIR: '', footer: '' },
    source: {
      span,
      fullSpan: span,
      FRNT: span,
      STIF: span,
      REAR: span,
      STIR: span,
      footer: span,
    },
    rack: 0,
    direction,
    operation,
    carrier,
    speedRaw: '300',
    speed: 300,
    rollerRaw: '0',
    roller: 0,
    carriageStops: { left: -0.5, right: 1.5 },
    carrierStops: carrier === '0' ? null : { left: -0.5, right: 1.5 },
    selections,
    actions,
  }
}

function smallTrace(sequence: readonly SmallAction[]): MachineTraceV1 {
  const passes = sequence.map(smallPass)
  return {
    schemaVersion: 1,
    sourceDocumentSchemaVersion: 1,
    profileId: KNITERATE_7GG_KCODE_PROFILE_V1.profileId,
    profileVersion: KNITERATE_7GG_KCODE_PROFILE_V1.profileVersion,
    dialect: 'knitout-vendor',
    rackCommands: rackCommandsForPasses(passes),
    passes,
  }
}

function allSequences(
  alphabet: readonly SmallAction[],
  length: number,
): SmallAction[][] {
  let sequences: SmallAction[][] = [[]]
  for (let index = 0; index < length; index++) {
    sequences = sequences.flatMap((sequence) =>
      alphabet.map((token) => [...sequence, token]))
  }
  return sequences
}

describe('KCode-native MachineTrace validation', () => {
  it('replays emitted knit, tuck, split, drop, transfer, and move passes exactly', () => {
    const trace = compileTrace()
    const report = validateKCodeMachineTrace(
      trace,
      KNITERATE_7GG_KCODE_PROFILE_V1,
    )

    expect(report.ok).toBe(true)
    expect(report.diagnostics).toEqual([])
    expect(report.passStates).toHaveLength(trace.passes.length)

    const splitIndex = trace.passes.findIndex((pass) =>
      pass.actions.some((action) => action.kind === 'split'))
    expect(splitIndex).toBeGreaterThanOrEqual(0)
    const split = report.passStates[splitIndex]!
    expect(split.before).toEqual({
      occupiedNeedles: 1,
      totalLoops: 1,
      maxStack: 1,
    })
    expect(split.after).toEqual({
      occupiedNeedles: 2,
      totalLoops: 2,
      maxStack: 1,
    })
    expect(split.stackDeltas).toEqual([
      {
        bed: 'front',
        traceCoordinate: 126,
        beforeCount: 1,
        afterCount: 1,
      },
      {
        bed: 'rear',
        traceCoordinate: 126,
        beforeCount: 0,
        afterCount: 1,
      },
    ])
    expect(report.finalState).toMatchObject({
      stacks: { 'rear:126': 1 },
      occupiedNeedles: 1,
      totalLoops: 1,
      maxStack: 1,
    })

    // The strict marker-free coordinate is the identity shared by a producer
    // pass and its later carrierless transfer source.
    const producer = trace.passes.find((pass) =>
      pass.actions.some((action) => action.kind === 'knit'))!
    const transfer = trace.passes.find((pass) =>
      pass.actions.some((action) => action.kind === 'split'))!
    const knit = producer.actions.find((action) => action.kind === 'knit')!
    const xfer = transfer.actions.find((action) => action.kind === 'split')!
    if (knit.kind !== 'knit') throw new Error('Expected knit action')
    if (xfer.kind !== 'split') throw new Error('Expected split action')
    expect(knit.at.traceCoordinate).toBe(126)
    expect(xfer.source.traceCoordinate).toBe(knit.at.traceCoordinate)

    expect(JSON.stringify(validateKCodeMachineTrace(
      trace,
      KNITERATE_7GG_KCODE_PROFILE_V1,
    ))).toBe(JSON.stringify(report))
  })

  it('retains action-local pass deltas and exact global metrics instead of full-bed snapshots', () => {
    const base = smallTrace(['K'])
    const passes = Array.from({ length: 64 }, (_, index): MachineTracePassV1 => {
      const at = selection(index, 'front', index)
      return {
        ...smallPass('K', index),
        carriageStops: { left: -0.5, right: 64.5 },
        carrierStops: { left: -0.5, right: 64.5 },
        selections: { front: [at], rear: [] },
        actions: [{ kind: 'knit', at }],
      }
    })
    const report = validateKCodeMachineTrace(
      withPasses(base, passes),
      KNITERATE_7GG_KCODE_PROFILE_V1,
    )

    expect(report.ok).toBe(true)
    expect(report.passStates).toHaveLength(64)
    expect(report.passStates.every((passState) =>
      passState.stackDeltas.length === 1)).toBe(true)
    expect(report.passStates[63]).toEqual({
      passIndex: 63,
      before: { occupiedNeedles: 63, totalLoops: 63, maxStack: 1 },
      after: { occupiedNeedles: 64, totalLoops: 64, maxStack: 1 },
      stackDeltas: [{
        bed: 'front',
        traceCoordinate: 63,
        beforeCount: 0,
        afterCount: 1,
      }],
    })
    expect(report.finalState.front).toHaveLength(64)
    expect(report.finalState.occupiedNeedles).toBe(64)
  })

  it('blocks unknown/empty-transfer actions and warns on model-observed empty cleanup at exact spans', () => {
    const trace = compileTrace()
    const first = trace.passes[0]!
    const unknown = withPasses(trace, [{
      ...first,
      actions: [{
        kind: 'unknown',
        operation: first.operation,
        reason: 'unsupported-operation',
        selections: [...first.selections.front, ...first.selections.rear],
      }],
    }])
    const unknownReport = validateKCodeMachineTrace(
      unknown,
      KNITERATE_7GG_KCODE_PROFILE_V1,
    )
    expect(unknownReport.ok).toBe(false)
    expect(unknownReport.diagnostics).toContainEqual(expect.objectContaining({
      severity: 'error',
      class: 'semantic',
      rule: 'machine-trace.unknown-action',
      passIndex: 0,
      sourceSpan: first.selections.front[0]!.sourceSpan,
    }))

    const xferPass = trace.passes.find((pass) =>
      pass.actions.some((action) => action.kind === 'split'))!
    const emptyXfer = withPasses(trace, [xferPass])
    expect(rules(emptyXfer)).toContain('machine-trace.transfer-source-empty')

    const dropPass = trace.passes.find((pass) =>
      pass.actions.some((action) => action.kind === 'drop'))!
    const emptyDrop = withPasses(trace, [dropPass])
    const emptyDropReport = validateKCodeMachineTrace(
      emptyDrop,
      KNITERATE_7GG_KCODE_PROFILE_V1,
    )
    expect(emptyDropReport.ok).toBe(true)
    expect(emptyDropReport.diagnostics).toContainEqual(expect.objectContaining({
      severity: 'warning',
      class: 'semantic',
      rule: 'machine-trace.drop-empty',
      message: expect.stringContaining('Operational machine consequence is unverified.'),
    }))
  })

  it('fails closed without throwing on forged dialects and empty action lists', () => {
    const trace = smallTrace(['K'])
    const forgedDialect = {
      ...trace,
      dialect: 'future-unknown-dialect',
    } as unknown as MachineTraceV1
    expect(() => validateKCodeMachineTrace(
      forgedDialect,
      KNITERATE_7GG_KCODE_PROFILE_V1,
    )).not.toThrow()
    expect(rules(forgedDialect)).toContain('machine-trace.dialect-profile')

    const noActions = withPasses(trace, [{
      ...trace.passes[0]!,
      selections: { front: [], rear: [] },
      actions: [],
    }])
    expect(rules(noActions)).toContain('machine-trace.action-operation')
  })

  it('checks rack/bed pairing, stop containment, and programmed continuity', () => {
    const trace = compileTrace()
    const splitIndex = trace.passes.findIndex((pass) =>
      pass.actions.some((action) => action.kind === 'split'))
    const splitPass = trace.passes[splitIndex]!
    const splitAction = splitPass.actions.find((action) => action.kind === 'split')!
    const shiftedTarget: MachineTraceSelectionV1 = {
      ...splitAction.target,
      payloadIndex: splitAction.target.payloadIndex + 1,
      kcodeColumn: splitAction.target.kcodeColumn + 1,
      traceCoordinate: splitAction.target.traceCoordinate + 1,
    }
    const mismatchedPass: MachineTracePassV1 = {
      ...splitPass,
      selections: {
        front: splitPass.selections.front,
        rear: splitPass.selections.rear.map((candidate) =>
          candidate === splitAction.target ? shiftedTarget : candidate),
      },
      actions: [{ ...splitAction, target: shiftedTarget }],
    }
    const badPairPasses = [...trace.passes]
    badPairPasses[splitIndex] = mismatchedPass
    expect(rules({ ...trace, passes: badPairPasses })).toContain(
      'machine-trace.transfer-rack-pair',
    )

    expect(rules(withPasses(trace, [{ ...splitPass, rack: 0.25 }]))).toContain(
      'machine-trace.rack-profile',
    )

    const second = trace.passes[1]!
    const discontinuous = {
      ...second,
      carriageStops: {
        left: second.carriageStops.left,
        right: second.carriageStops.right + 1,
      },
      carrierStops: second.carrierStops === null ? null : {
        left: second.carrierStops.left,
        right: second.carrierStops.right + 1,
      },
    }
    const discontinuousPasses = [...trace.passes]
    discontinuousPasses[1] = discontinuous
    const discontinuityRules = rules({ ...trace, passes: discontinuousPasses })
    expect(discontinuityRules).toContain('machine-trace.carriage-discontinuity')
    expect(discontinuityRules).toContain('machine-trace.carrier-discontinuity')
  })

  it('checks traversal order globally across both beds', () => {
    const front = selection(0, 'front', 1)
    const rear = selection(0, 'rear', 0)
    const base = smallPass('K', 0)
    const outOfOrder: MachineTracePassV1 = {
      ...base,
      direction: '>>',
      operation: 'Kn-Kn',
      carrier: '2',
      carriageStops: { left: -0.5, right: 2.5 },
      carrierStops: { left: -0.5, right: 2.5 },
      selections: { front: [front], rear: [rear] },
      actions: [
        { kind: 'knit', at: front },
        { kind: 'knit', at: rear },
      ],
    }
    expect(rules(withPasses(smallTrace(['K']), [outOfOrder]))).toContain(
      'machine-trace.action-direction-order',
    )
  })

  it.each([
    { rack: 2, direction: '+', operations: ['knit + f2 2', 'knit + b1 2'], beds: ['front', 'rear'] },
    { rack: -2, direction: '+', operations: ['knit + b3 2', 'knit + f2 2'], beds: ['rear', 'front'] },
    { rack: 2, direction: '-', operations: ['knit - b1 2', 'knit - f2 2'], beds: ['rear', 'front'] },
    { rack: -2, direction: '-', operations: ['knit - f2 2', 'knit - b3 2'], beds: ['front', 'rear'] },
  ] as const)(
    'orders pinned-backend both-bed actions by rack-adjusted slots at rack $rack direction $direction',
    ({ rack, direction, operations, beds }) => {
      const trace = compileTrace([
        ';!knitout-2',
        ';;Machine: kniterate',
        ';;Carriers: 1 2 3 4 5 6',
        'x-speed-number 300',
        'x-roller-advance 100',
        'in 2',
        ...(direction === '-' ? ['knit + f10 2'] : []),
        `rack ${rack}`,
        ...operations,
        'out 2',
        '',
      ].join('\n'))
      const pass = trace.passes.find((candidate) =>
        candidate.selections.front.length > 0
        && candidate.selections.rear.length > 0)!
      const report = validateKCodeMachineTrace(
        trace,
        KNITERATE_7GG_KCODE_PROFILE_V1,
      )
      const regularActions = pass.actions.filter((action) =>
        action.kind === 'knit' || action.kind === 'tuck' || action.kind === 'drop')
      const coordinates = regularActions.map((action) => {
        if (action.kind !== 'knit' && action.kind !== 'tuck' && action.kind !== 'drop') {
          throw new Error('Expected regular action')
        }
        return regularActionTraversalCoordinate(action.at, pass.rack)
      })

      expect(pass.rack).toBe(rack)
      expect(pass.direction).toBe(direction === '+' ? '>>' : '<<')
      expect(regularActions.map((action) =>
        action.kind === 'knit' || action.kind === 'tuck' || action.kind === 'drop'
          ? action.at.bed
          : null)).toEqual(beds)
      expect(coordinates).toEqual(
        direction === '+'
          ? [...coordinates].sort((a, b) => a - b)
          : [...coordinates].sort((a, b) => b - a),
      )
      expect(report.diagnostics).not.toContainEqual(expect.objectContaining({
        rule: 'machine-trace.action-direction-order',
      }))
      expect(report.ok).toBe(true)
    },
  )

  it('validates the complete ordered rack-command stream against pass state', () => {
    const trace = smallTrace(['K', 'K'])
    const span = trace.passes[1]!.source.span
    const transient: MachineTraceV1 = {
      ...trace,
      rackCommands: [
        trace.rackCommands[0]!,
        {
          index: 1,
          beforePassIndex: 1,
          valueRaw: '4',
          value: 4,
          source: { span, fullSpan: span },
        },
        {
          index: 2,
          beforePassIndex: 1,
          valueRaw: '0',
          value: 0,
          source: { span, fullSpan: span },
        },
      ],
    }
    expect(rules(transient)).not.toContain('machine-trace.rack-state')

    const missingReturn: MachineTraceV1 = {
      ...transient,
      rackCommands: transient.rackCommands.slice(0, 2),
    }
    expect(rules(missingReturn)).toContain('machine-trace.rack-state')

    const badIndex: MachineTraceV1 = {
      ...transient,
      rackCommands: transient.rackCommands.map((command, index) =>
        index === 1 ? { ...command, index: 9 } : command),
    }
    expect(rules(badIndex)).toContain('machine-trace.rack-command-index')
  })

  it.each([
    { count: 3, warningCount: 1, errorCount: 0, ok: true },
    { count: 4, warningCount: 1, errorCount: 1, ok: false },
    { count: 6, warningCount: 1, errorCount: 3, ok: false },
  ])('applies the shared conservative software policy to $count tucks', ({
    count,
    warningCount,
    errorCount,
    ok,
  }) => {
    const report = validateKCodeMachineTrace(
      smallTrace(Array.from({ length: count }, () => 'T')),
      KNITERATE_7GG_KCODE_PROFILE_V1,
    )
    const policyDiagnostics = report.diagnostics.filter((diagnostic) =>
      diagnostic.rule === 'machine-trace.loop-stack-policy')

    expect(report.ok).toBe(ok)
    expect(policyDiagnostics.filter((diagnostic) =>
      diagnostic.severity === 'warning')).toHaveLength(warningCount)
    expect(policyDiagnostics.filter((diagnostic) =>
      diagnostic.severity === 'error')).toHaveLength(errorCount)
    expect(policyDiagnostics.every((diagnostic) =>
      diagnostic.class === 'operational-advisory')).toBe(true)
    expect(policyDiagnostics.every((diagnostic) =>
      diagnostic.message.includes('physical'))).toBe(true)
    expect(report.finalState).toMatchObject({
      stacks: { 'front:0': count },
      maxStack: count,
      totalLoops: count,
    })
    expect(report.operationalAssurance).toMatchObject({
      status: 'not-established-by-software-validation',
      carrierLifecycle: 'not-encoded-in-kcode',
      initialLoopState: 'empty-bed-job-assumption',
    })
    expect(report.operationalAssurance.limitations.map((item) => item.code)).toContain(
      'loop-stack-operational-limit-unverified',
    )
  })

  it('keeps documented-setting findings advisory and carrier lifecycle unclaimed', () => {
    const first = compileTrace().passes[0]!
    const highSpeed = withPasses(compileTrace(), [{
      ...first,
      speedRaw: '801',
      speed: 801,
    }])
    const highSpeedReport = validateKCodeMachineTrace(
      highSpeed,
      KNITERATE_7GG_KCODE_PROFILE_V1,
    )
    expect(highSpeedReport.ok).toBe(true)
    expect(highSpeedReport.diagnostics).toContainEqual(expect.objectContaining({
      severity: 'warning',
      class: 'operational-advisory',
      rule: 'machine-trace.setting-documented-range',
    }))
    expect(highSpeedReport.diagnostics.some((diagnostic) =>
      diagnostic.rule.includes('carrier-active'))).toBe(false)
  })

  it('keeps capped mixed-severity totals exact without reclassifying omissions', () => {
    const report = validateKCodeMachineTrace(
      smallTrace([
        ...Array.from({ length: 600 }, () => 'D' as const),
        ...Array.from({ length: 600 }, () => 'X' as const),
      ]),
      KNITERATE_7GG_KCODE_PROFILE_V1,
    )
    const represented = (severity: 'error' | 'warning'): number =>
      report.diagnostics
        .filter((diagnostic) => diagnostic.severity === severity)
        .reduce((count, diagnostic) => count + (diagnostic.occurrences ?? 1), 0)

    expect(report.diagnostics.length).toBeLessThanOrEqual(520)
    expect(represented('error')).toBe(report.errorCount)
    expect(represented('warning')).toBe(report.warningCount)
    expect(report.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({
        rule: 'machine-trace.transfer-source-empty',
        severity: 'error',
        occurrences: 600,
      }),
      expect.objectContaining({
        rule: 'machine-trace.drop-empty',
        severity: 'warning',
        occurrences: 88,
      }),
    ]))
  })

  it('property-checks stop containment with a fixed seed', () => {
    const trace = compileTrace()
    const first = trace.passes.find((pass) =>
      pass.carrier !== '0' && pass.selections.front.length > 0)!
    const operated = first.selections.front[0]!

    fc.assert(fc.property(
      fc.integer({ min: 1, max: 200 }),
      (width) => {
        const right = operated.traceCoordinate - 0.5
        const left = right - width
        const narrowed: MachineTracePassV1 = {
          ...first,
          carriageStops: { left, right },
          carrierStops: { left, right },
        }
        const result = rules(withPasses(trace, [narrowed]))
        expect(result).toContain('machine-trace.selection-outside-carriage')
        expect(result).toContain('machine-trace.selection-outside-carrier')
      },
    ), {
      seed: 0x56414c49,
      numRuns: 300,
    })
  })

  it('exhaustively replays all 1,296 depth-four small-state transitions', () => {
    const sequences = allSequences(['K', 'T', 'D', 'X', 'S', 'Y'], 4)
    expect(sequences).toHaveLength(1_296)

    for (const sequence of sequences) {
      let front = 0
      let rear = 0
      let emptyDrop = 0
      let emptyTransfer = 0
      for (const action of sequence) {
        switch (action) {
          case 'K':
            front = 1
            break
          case 'T':
            front += 1
            break
          case 'D':
            if (front === 0) emptyDrop++
            else front = 0
            break
          case 'X':
            if (front === 0) emptyTransfer++
            else {
              rear += front
              front = 0
            }
            break
          case 'S':
            if (front === 0) emptyTransfer++
            else {
              rear += front
              front = 1
            }
            break
          case 'Y':
            if (rear === 0) emptyTransfer++
            else {
              front += rear
              rear = 0
            }
            break
        }
      }

      const report = validateKCodeMachineTrace(
        smallTrace(sequence),
        KNITERATE_7GG_KCODE_PROFILE_V1,
      )
      const ruleCount = (rule: string) => report.diagnostics.filter(
        (diagnostic) => diagnostic.rule === rule,
      ).length
      expect(ruleCount('machine-trace.drop-empty'), sequence.join('')).toBe(emptyDrop)
      expect(ruleCount('machine-trace.transfer-source-empty'), sequence.join('')).toBe(emptyTransfer)
      expect(report.finalState.stacks['front:0'], sequence.join('')).toBe(
        front === 0 ? undefined : front,
      )
      expect(report.finalState.stacks['rear:0'], sequence.join('')).toBe(
        rear === 0 ? undefined : rear,
      )
      expect(report.passStates, sequence.join('')).toHaveLength(sequence.length)
    }
  })
})
