import { createHash } from 'node:crypto'

import fc from 'fast-check'
import { describe, expect, it } from 'vitest'

import {
  KNITERATE_7GG_KCODE_PROFILE_V1,
  KNITERATE_7GG_KCODE_PROFILE_V2,
  type KCodeMachineProfileV1,
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
  validateKCodeMachineTrace as validateKCodeMachineTraceImpl,
} from '../../src/knitout/kcode/machine-validator.js'
import { parseKCodeDocument } from '../../src/knitout/kcode/parser.js'
import type { KCodeSourceSpan } from '../../src/knitout/kcode/types.js'
import { knitoutToKCodeWithTrace } from '../../src/knitout/kniterate/to-kcode.js'
import {
  recordKCodeRuntimeRules,
  recordKCodeTargetedRuntimeWitness,
} from '../../scripts/kcode-rule-runtime-ledger.js'

const WITNESS_SOURCE = 'test/knitout/kcode-machine-validator.test.ts'
const validateKCodeMachineTrace = (
  ...args: Parameters<typeof validateKCodeMachineTraceImpl>
): ReturnType<typeof validateKCodeMachineTraceImpl> => {
  const result = validateKCodeMachineTraceImpl(...args)
  recordKCodeRuntimeRules(
    'machine-trace-validator',
    WITNESS_SOURCE,
    result.diagnostics,
  )
  return result
}

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
    profile: KNITERATE_7GG_KCODE_PROFILE_V2,
    dialect: 'knitout-vendor',
    strict: true,
  })
  expect(parsed.diagnostics).toEqual([])
  expect(parsed.ok).toBe(true)
  return projectKCodeMachineTrace(
    parsed.document,
    KNITERATE_7GG_KCODE_PROFILE_V2,
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
    KNITERATE_7GG_KCODE_PROFILE_V2,
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
    profileId: KNITERATE_7GG_KCODE_PROFILE_V2.profileId,
    profileVersion: KNITERATE_7GG_KCODE_PROFILE_V2.profileVersion,
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
      KNITERATE_7GG_KCODE_PROFILE_V2,
    )

    expect(report.ok).toBe(true)
    expect(report).toMatchObject({
      profileConformance: 'conformant',
      modeledState: 'conformant',
      operationalPolicy: 'clear',
      controllerAcceptance: 'not-established-by-software-validation',
    })
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
    expect(createHash('sha256').update(JSON.stringify(report)).digest('hex')).toBe(
      '5a9ae8998b1a8698768b8323a260e09302f6ad8695f1dcb5fffbd1bd976b779d',
    )

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
      KNITERATE_7GG_KCODE_PROFILE_V2,
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
      KNITERATE_7GG_KCODE_PROFILE_V2,
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
      KNITERATE_7GG_KCODE_PROFILE_V2,
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
    const emptyXferReport = validateKCodeMachineTrace(
      emptyXfer,
      KNITERATE_7GG_KCODE_PROFILE_V2,
    )
    expect(emptyXferReport.diagnostics.map((diagnostic) => diagnostic.rule))
      .toContain('machine-trace.transfer-source-empty')
    recordKCodeTargetedRuntimeWitness({
      rail: 'machine-trace-validator',
      sourcePath: WITNESS_SOURCE,
      caseId: 'transfer-source-empty:empty-bed-assumption',
      expectedRule: 'machine-trace.transfer-source-empty',
      diagnostics: emptyXferReport.diagnostics,
    })

    const dropPass = trace.passes.find((pass) =>
      pass.actions.some((action) => action.kind === 'drop'))!
    const emptyDrop = withPasses(trace, [dropPass])
    const emptyDropReport = validateKCodeMachineTrace(
      emptyDrop,
      KNITERATE_7GG_KCODE_PROFILE_V2,
    )
    expect(emptyDropReport.ok).toBe(true)
    expect(emptyDropReport).toMatchObject({
      profileConformance: 'conformant',
      modeledState: 'review',
      operationalPolicy: 'clear',
    })
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
      KNITERATE_7GG_KCODE_PROFILE_V2,
    )).not.toThrow()
    expect(rules(forgedDialect)).toContain('machine-trace.dialect-profile')

    const noActions = withPasses(trace, [{
      ...trace.passes[0]!,
      selections: { front: [], rear: [] },
      actions: [],
    }])
    expect(rules(noActions)).toContain('machine-trace.action-operation')
  })

  it('keeps an exact negative witness for every structural command-validation rule', () => {
    const base = smallTrace(['K'])
    const basePass = base.passes[0]!
    const withPass = (pass: MachineTracePassV1): MachineTraceV1 => ({
      ...base,
      passes: [pass],
    })
    const regularWithSelection = (
      at: MachineTraceSelectionV1,
    ): MachineTraceV1 => withPass({
      ...basePass,
      selections: { front: [at], rear: [] },
      actions: [{ kind: 'knit', at }],
    })
    const changedSelection = (
      change: Partial<MachineTraceSelectionV1>,
    ): MachineTraceSelectionV1 => ({ ...basePass.selections.front[0]!, ...change })

    const malformedTraces: ReadonlyArray<readonly [
      string,
      MachineTraceV1,
      KCodeMachineProfileV1?,
    ]> = [
      ['machine-trace.profile-mismatch', { ...base, profileId: 'wrong-profile' }],
      ['machine-trace.profile-mismatch', {
        ...base,
        profileVersion: 1 as MachineTraceV1['profileVersion'],
      }],
      ['machine-trace.profile-mismatch', {
        ...base,
        profileId: 'wrong-profile',
        rackCommands: [],
        passes: [],
      }],
      ['machine-trace.dialect-profile', {
        ...base,
        dialect: 'missing-contract' as MachineTraceV1['dialect'],
      }, {
        ...KNITERATE_7GG_KCODE_PROFILE_V2,
        supportedDialects: [
          ...KNITERATE_7GG_KCODE_PROFILE_V2.supportedDialects,
          'missing-contract' as MachineTraceV1['dialect'],
        ],
      }],
      ['machine-trace.dialect-profile', {
        ...base,
        dialect: 'app',
      }, {
        ...KNITERATE_7GG_KCODE_PROFILE_V2,
        supportedDialects: ['knitout-vendor'],
      }],
      ['machine-trace.dialect-profile', {
        ...base,
        dialect: 'missing-contract' as MachineTraceV1['dialect'],
        rackCommands: [],
        passes: [],
      }],
      ['machine-trace.passes-required', { ...base, passes: [] }],
      ['machine-trace.rack-command-index', {
        ...base,
        rackCommands: [{ ...base.rackCommands[0]!, index: 9 }],
      }],
      ['machine-trace.rack-command-index', {
        ...base,
        rackCommands: [{
          ...base.rackCommands[0]!,
          index: 9,
          beforePassIndex: base.passes.length,
        }],
      }],
      ['machine-trace.rack-command-position', {
        ...base,
        rackCommands: [{ ...base.rackCommands[0]!, beforePassIndex: 2 }],
      }],
      ['machine-trace.rack-command-position', {
        ...base,
        rackCommands: [{ ...base.rackCommands[0]!, beforePassIndex: -1 }],
      }],
      ['machine-trace.rack-command-position', {
        ...base,
        rackCommands: [{ ...base.rackCommands[0]!, beforePassIndex: 0.5 }],
      }],
      ['machine-trace.rack-command-position', (() => {
        const twoPass = withPasses(base, [basePass, smallPass('K', 1)])
        const span = twoPass.passes[1]!.source.span
        return {
          ...twoPass,
          rackCommands: [
            twoPass.rackCommands[0]!,
            { index: 1, beforePassIndex: 1, valueRaw: '0', value: 0, source: { span, fullSpan: span } },
            { index: 2, beforePassIndex: 0, valueRaw: '0', value: 0, source: { span, fullSpan: span } },
          ],
        }
      })()],
      ['machine-trace.rack-command-value', {
        ...base,
        rackCommands: [{ ...base.rackCommands[0]!, valueRaw: 'not-a-number' }],
      }],
      ...['', '+', '-', '.', '0.', '0..0', ' 0', '0 ', '0e0'].map((valueRaw) => [
        'machine-trace.rack-command-value',
        {
          ...base,
          rackCommands: [{ ...base.rackCommands[0]!, valueRaw }],
        },
      ] as const),
      ['machine-trace.rack-command-value', {
        ...base,
        rackCommands: [{ ...base.rackCommands[0]!, valueRaw: '0', value: 1 }],
      }],
      ['machine-trace.rack-command-value', {
        ...base,
        rackCommands: [{ ...base.rackCommands[0]!, valueRaw: '0.25', value: 0.25 }],
      }],
      ['machine-trace.rack-command-value', {
        ...base,
        rackCommands: [{ ...base.rackCommands[0]!, valueRaw: 'NaN', value: Number.NaN }],
      }],
      ['machine-trace.rack-command-initial', { ...base, rackCommands: [] }],
      ['machine-trace.rack-state', withPass({ ...basePass, rack: 1 })],
      ['machine-trace.pass-index', withPass({ ...basePass, index: 1 })],
      ['machine-trace.rack-profile', withPass({ ...basePass, rack: 0.25 })],
      ['machine-trace.setting-number', withPass({ ...basePass, speed: Number.NaN })],
      ['machine-trace.stop-coordinate', withPass({
        ...basePass,
        carriageStops: { ...basePass.carriageStops, left: 0 },
      })],
      ['machine-trace.stop-coordinate', withPass({
        ...basePass,
        carriageStops: { ...basePass.carriageStops, right: Number.POSITIVE_INFINITY },
      })],
      ['machine-trace.carriage-stop-order', withPass({
        ...basePass,
        carriageStops: { left: 1.5, right: 0.5 },
      })],
      ['machine-trace.carriage-stop-order', withPass({
        ...basePass,
        carriageStops: { left: 0.5, right: 0.5 },
      })],
      ['machine-trace.carrier-stops-required', withPass({ ...basePass, carrierStops: null })],
      ['machine-trace.carrier-stops-forbidden', withPass({
        ...smallPass('D', 0),
        carrierStops: { left: -0.5, right: 1.5 },
      })],
      ['machine-trace.carrier-stop-order', withPass({
        ...basePass,
        carrierStops: { left: 1.5, right: 0.5 },
      })],
      ['machine-trace.carrier-stop-order', withPass({
        ...basePass,
        carrierStops: { left: 0.5, right: 0.5 },
      })],
      ['machine-trace.stop-coordinate', withPass({
        ...basePass,
        carrierStops: { left: 0, right: 1.5 },
      })],
      ['machine-trace.stop-coordinate', withPass({
        ...basePass,
        carrierStops: { left: -0.5, right: Number.NaN },
      })],
      ['machine-trace.carrier-stops-outside-carriage', withPass({
        ...basePass,
        carrierStops: { left: -1.5, right: 1.5 },
      })],
      ['machine-trace.carrier-stops-outside-carriage', withPass({
        ...basePass,
        carrierStops: { left: -0.5, right: 2.5 },
      })],
      ['machine-trace.selection-bed', regularWithSelection(changedSelection({ bed: 'rear' }))],
      ['machine-trace.selection-coordinate', regularWithSelection(changedSelection({ payloadIndex: 15.5 }))],
      ['machine-trace.selection-payload-coordinate', regularWithSelection(changedSelection({ payloadIndex: 16 }))],
      ['machine-trace.selection-trace-coordinate', regularWithSelection(changedSelection({ traceCoordinate: 1 }))],
      ['machine-trace.selection-column-range', regularWithSelection(changedSelection({
        payloadIndex: 268,
        kcodeColumn: 253,
        traceCoordinate: 253,
      }))],
      ['machine-trace.selection-column-range', regularWithSelection(changedSelection({
        payloadIndex: 14,
        kcodeColumn: -1,
        traceCoordinate: -1,
      }))],
      ['machine-trace.selection-stitch-selector', regularWithSelection(changedSelection({
        stitchSelector: {
          ...basePass.selections.front[0]!.stitchSelector,
          token: '4',
        },
      }))],
      ['machine-trace.duplicate-selection', withPass({
        ...basePass,
        selections: {
          front: [
            basePass.selections.front[0]!,
            basePass.selections.front[0]!,
            basePass.selections.front[0]!,
          ],
          rear: [],
        },
      })],
      ['machine-trace.action-selection-missing', withPass({
        ...basePass,
        actions: [{
          kind: 'knit',
          at: changedSelection({ sourceSpan: sourceSpan(999, 99) }),
        }],
      })],
      ['machine-trace.action-selection-coverage', withPass({ ...basePass, actions: [] })],
      ['machine-trace.action-carrier', withPass({
        ...basePass,
        selections: { front: [], rear: [] },
        actions: [{ kind: 'move', carrier: '3' }],
      })],
      ['machine-trace.action-operation', withPass({
        ...basePass,
        selections: { front: [], rear: [] },
        actions: [
          { kind: 'move', carrier: '2' },
          { kind: 'move', carrier: '2' },
        ],
      })],
      ['machine-trace.action-operation', withPass({
        ...basePass,
        actions: [{ kind: 'move', carrier: '2' }],
      })],
      ['machine-trace.action-operation', withPass({
        ...smallPass('X', 0),
        selections: { front: [], rear: [] },
        actions: [{ kind: 'move', carrier: '0' }],
      })],
      ['machine-trace.action-operation', withPass({
        ...basePass,
        operation: 'Future-Operation' as MachineTracePassV1['operation'],
        selections: { front: [], rear: [] },
        actions: [{ kind: 'move', carrier: '2' }],
      })],
      ['machine-trace.action-operation', withPass({
        ...basePass,
        actions: [{ kind: 'tuck', at: basePass.selections.front[0]! }],
      })],
      ['machine-trace.action-operation', withPass({
        ...basePass,
        operation: 'Future-Operation' as MachineTracePassV1['operation'],
      })],
      ['machine-trace.action-operation', withPass({
        ...basePass,
        actions: [{ kind: 'drop', at: basePass.selections.front[0]! }],
      })],
      ['machine-trace.unknown-action', withPass({
        ...basePass,
        actions: [{
          kind: 'unknown',
          operation: basePass.operation,
          reason: 'forged-validator-witness',
          selections: basePass.selections.front,
        }],
      })],
      ['machine-trace.action-operation', withPass({
        ...basePass,
        carrier: '0',
        carrierStops: null,
      })],
      ['machine-trace.transfer-operation-direction', withPass({
        ...smallPass('X', 0),
        direction: '<<',
      })],
      ['machine-trace.action-operation', withPass((() => {
        const pass = smallPass('X', 0)
        const action = pass.actions[0]!
        if (action.kind !== 'xfer') throw new Error('Expected transfer witness')
        return {
          ...pass,
          operation: 'Tr-Rr',
          selections: { front: [action.target], rear: [action.source] },
          actions: [{ ...action, source: action.target, target: action.source }],
        }
      })())],
      ['machine-trace.action-operation', withPass({
        ...smallPass('X', 0),
        operation: 'Kn-Kn',
      })],
      ['machine-trace.action-operation', withPass({
        ...smallPass('X', 0),
        operation: 'Future-Operation' as MachineTracePassV1['operation'],
      })],
      ['machine-trace.action-operation', withPass((() => {
        const pass = smallPass('X', 0)
        const front = pass.selections.front[0]!
        return {
          ...pass,
          selections: { front: [front], rear: [] },
          actions: [{ kind: 'knit' as const, at: front }],
        }
      })())],
      ['machine-trace.transfer-rack-pair', withPass((() => {
        const pass = smallPass('X', 0)
        const action = pass.actions[0]!
        if (action.kind !== 'xfer') throw new Error('Expected transfer witness')
        const target = { ...action.target, traceCoordinate: 1 }
        return {
          ...pass,
          selections: { front: [action.source], rear: [target] },
          actions: [{ ...action, target }],
        }
      })())],
      ['machine-trace.action-carrier', withPass({
        ...smallPass('X', 0),
        carrier: '2',
        carrierStops: { left: -0.5, right: 1.5 },
      })],
      ['machine-trace.action-carrier', withPass({
        ...smallPass('S', 0),
        carrier: '0',
        carrierStops: null,
      })],
      ['machine-trace.action-carrier', withPass((() => {
        const pass = smallPass('S', 0)
        const action = pass.actions[0]!
        if (action.kind !== 'split') throw new Error('Expected split witness')
        return {
          ...pass,
          carrier: '0',
          carrierStops: null,
          actions: [{ ...action, carrier: '0' }],
        }
      })())],
      ['machine-trace.action-carrier', withPass((() => {
        const pass = smallPass('S', 0)
        const action = pass.actions[0]!
        if (action.kind !== 'split') throw new Error('Expected split witness')
        return { ...pass, actions: [{ ...action, carrier: '3' }] }
      })())],
      ['machine-trace.transfer-bed-pair', withPass((() => {
        const pass = smallPass('X', 0)
        const action = pass.actions[0]!
        if (action.kind !== 'xfer') throw new Error('Expected transfer witness')
        const target = { ...action.target, bed: 'front' as const }
        return {
          ...pass,
          selections: { front: [action.source], rear: [target] },
          actions: [{ ...action, target }],
        }
      })())],
    ]

    const malformedDigest = createHash('sha256')
    for (const [caseIndex, [rule, trace, profile = KNITERATE_7GG_KCODE_PROFILE_V2]] of malformedTraces.entries()) {
      const report = validateKCodeMachineTrace(
        trace,
        profile,
      )
      expect(report.diagnostics.map((diagnostic) => diagnostic.rule), rule).toContain(rule)
      recordKCodeTargetedRuntimeWitness({
        rail: 'machine-trace-validator',
        sourcePath: WITNESS_SOURCE,
        caseId: `${rule}:${caseIndex}`,
        expectedRule: rule,
        diagnostics: report.diagnostics,
      })
      malformedDigest.update(JSON.stringify(report))
    }
    expect(malformedDigest.digest('hex')).toBe(
      'e5a7d6df7d65a7c6c84ca6da87de0319fa67ce5204570ba910e80317a50aae2e',
    )

    const orphan = parseKCodeDocument('HOME\nRACK:0\nSTIF:_\n', {
      profile: KNITERATE_7GG_KCODE_PROFILE_V2,
      dialect: 'knitout-vendor',
      strict: true,
    })
    recordKCodeRuntimeRules(
      'raw-kcode-parser',
      WITNESS_SOURCE,
      orphan.diagnostics,
    )
    expect(orphan.diagnostics.map((diagnostic) => diagnostic.rule)).toContain(
      'kcode.orphan-field',
    )
    recordKCodeTargetedRuntimeWitness({
      rail: 'raw-kcode-parser',
      sourcePath: WITNESS_SOURCE,
      caseId: 'orphan-field:stif-without-frnt',
      expectedRule: 'kcode.orphan-field',
      diagnostics: orphan.diagnostics,
    })
  })

  it('treats allowed transfer directions as a membership contract', () => {
    const trace = smallTrace(['X'])
    const pass = trace.passes[0]!
    const wrongDirection = withPasses(trace, [{ ...pass, direction: '<<' }])
    expect(rules(wrongDirection)).toContain('machine-trace.transfer-operation-direction')

    const operation = KNITERATE_7GG_KCODE_PROFILE_V2.operations[pass.operation]
    if (operation.family !== 'transfer') throw new Error('Expected transfer contract')
    const bidirectionalProfile: KCodeMachineProfileV1 = {
      ...KNITERATE_7GG_KCODE_PROFILE_V2,
      operations: {
        ...KNITERATE_7GG_KCODE_PROFILE_V2.operations,
        [pass.operation]: { ...operation, allowedDirections: ['>>', '<<'] },
      },
    }
    const report = validateKCodeMachineTrace(wrongDirection, bidirectionalProfile)
    expect(report.diagnostics.map((diagnostic) => diagnostic.rule))
      .not.toContain('machine-trace.transfer-operation-direction')

    const regularTrace = smallTrace(['K'])
    const regularPass = regularTrace.passes[0]!
    const regularOperation = KNITERATE_7GG_KCODE_PROFILE_V2.operations[regularPass.operation]
    if (regularOperation.family !== 'regular') throw new Error('Expected regular contract')
    const leftOnlyRegularProfile: KCodeMachineProfileV1 = {
      ...KNITERATE_7GG_KCODE_PROFILE_V2,
      operations: {
        ...KNITERATE_7GG_KCODE_PROFILE_V2.operations,
        [regularPass.operation]: { ...regularOperation, allowedDirections: ['<<'] },
      },
    }
    const regularDirectionReport = validateKCodeMachineTrace(
      regularTrace,
      leftOnlyRegularProfile,
    )
    expect(regularDirectionReport.diagnostics.map((diagnostic) => diagnostic.rule))
      .toContain('machine-trace.operation-direction')
    recordKCodeTargetedRuntimeWitness({
      rail: 'machine-trace-validator',
      sourcePath: WITNESS_SOURCE,
      caseId: 'operation-direction:regular-contract',
      expectedRule: 'machine-trace.operation-direction',
      diagnostics: regularDirectionReport.diagnostics,
    })
  })

  it('derives regular action legality from family and carrier contract fields', () => {
    const regularTrace = smallTrace(['K'])
    const regularPass = regularTrace.passes[0]!
    const regularContract = KNITERATE_7GG_KCODE_PROFILE_V2.operations[regularPass.operation]
    if (regularContract.family !== 'regular') throw new Error('Expected regular contract')

    const reportWith = (contract: unknown, trace = regularTrace) =>
      validateKCodeMachineTrace(trace, {
        ...KNITERATE_7GG_KCODE_PROFILE_V2,
        operations: {
          ...KNITERATE_7GG_KCODE_PROFILE_V2.operations,
          [regularPass.operation]: contract,
        },
      } as KCodeMachineProfileV1)

    const forgedTransferFamily = reportWith({
      ...KNITERATE_7GG_KCODE_PROFILE_V2.operations['Tr-Rr'],
      operation: regularPass.operation,
      carrierAction: 'bed-operation',
      frontAction: 'knit',
      rearAction: 'knit',
    })
    expect(forgedTransferFamily.diagnostics.map((diagnostic) => diagnostic.rule))
      .toContain('machine-trace.action-operation')

    const dropTrace = smallTrace(['D'])
    const carrierZeroChanged = reportWith({
      ...regularContract,
      carrierZeroAction: 'xfer',
    }, dropTrace)
    expect(carrierZeroChanged.diagnostics.map((diagnostic) => diagnostic.rule))
      .toContain('machine-trace.action-operation')

    const carrierChanged = reportWith({
      ...regularContract,
      carrierAction: 'split',
    })
    expect(carrierChanged.diagnostics.map((diagnostic) => diagnostic.rule))
      .toContain('machine-trace.action-operation')
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
    const discontinuityReport = validateKCodeMachineTrace(
      { ...trace, passes: discontinuousPasses },
      KNITERATE_7GG_KCODE_PROFILE_V2,
    )
    expect(discontinuityReport.diagnostics).toContainEqual(expect.objectContaining({
      rule: 'machine-trace.carriage-discontinuity',
      severity: 'error',
      class: 'kinematic',
    }))
    for (const expectedRule of [
      'machine-trace.carriage-discontinuity',
      'machine-trace.carrier-discontinuity',
    ]) {
      recordKCodeTargetedRuntimeWitness({
        rail: 'machine-trace-validator',
        sourcePath: WITNESS_SOURCE,
        caseId: `continuity:${expectedRule}`,
        expectedRule,
        diagnostics: discontinuityReport.diagnostics,
      })
    }
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
    const report = validateKCodeMachineTrace(
      withPasses(smallTrace(['K']), [outOfOrder]),
      KNITERATE_7GG_KCODE_PROFILE_V2,
    )
    expect(report.diagnostics.map((diagnostic) => diagnostic.rule)).toContain(
      'machine-trace.action-direction-order',
    )
    expect(report.diagnostics).toContainEqual(expect.objectContaining({
      rule: 'machine-trace.action-direction-order',
      severity: 'error',
      class: 'kinematic',
      actionIndex: 1,
    }))
    recordKCodeTargetedRuntimeWitness({
      rail: 'machine-trace-validator',
      sourcePath: WITNESS_SOURCE,
      caseId: 'action-direction-order:cross-bed',
      expectedRule: 'machine-trace.action-direction-order',
      diagnostics: report.diagnostics,
    })
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
        KNITERATE_7GG_KCODE_PROFILE_V2,
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

  it('accepts every existing exact decimal spelling without widening the rack domain', () => {
    const underflowNine = `0.${'0'.repeat(400)}9`
    for (const [valueRaw, value] of [
      ['0', 0],
      ['+0', 0],
      ['-0', -0],
      ['.0', 0],
      ['+.0', 0],
      ['0.0', 0],
      [underflowNine, 0],
    ] as const) {
      const trace = smallTrace(['K'])
      const report = validateKCodeMachineTrace({
        ...trace,
        rackCommands: [{ ...trace.rackCommands[0]!, valueRaw, value }],
      }, KNITERATE_7GG_KCODE_PROFILE_V2)
      expect(
        report.diagnostics.map((diagnostic) => diagnostic.rule),
        valueRaw,
      ).not.toContain('machine-trace.rack-command-value')
    }
  })

  it('keeps legacy V1 selectors above F as an explicit documented-range review', () => {
    const trace = smallTrace(['K'])
    const pass = trace.passes[0]!
    const selected = pass.selections.front[0]!
    const legacySelection: MachineTraceSelectionV1 = {
      ...selected,
      stitchSelector: {
        ...selected.stitchSelector,
        token: 'G',
        encodedValue: 16,
      },
    }
    const report = validateKCodeMachineTrace({
      ...trace,
      profileVersion: KNITERATE_7GG_KCODE_PROFILE_V1.profileVersion,
      passes: [{
        ...pass,
        selections: { front: [legacySelection], rear: [] },
        actions: [{ kind: 'knit', at: legacySelection }],
      }],
    }, KNITERATE_7GG_KCODE_PROFILE_V1)
    expect(report.diagnostics).toContainEqual(expect.objectContaining({
      rule: 'machine-trace.selection-stitch-documented-range',
      severity: 'warning',
      class: 'operational-advisory',
    }))
    expect(report.profileConformance).toBe('conformant')
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
      KNITERATE_7GG_KCODE_PROFILE_V2,
    )
    const policyDiagnostics = report.diagnostics.filter((diagnostic) =>
      diagnostic.rule === 'machine-trace.loop-stack-policy')

    expect(report.ok).toBe(ok)
    expect(report.profileConformance).toBe('conformant')
    expect(report.modeledState).toBe(count >= 4 ? 'blocked' : 'review')
    expect(report.operationalPolicy).toBe(count >= 4 ? 'blocked' : 'review')
    expect(policyDiagnostics.filter((diagnostic) =>
      diagnostic.severity === 'warning')).toHaveLength(warningCount)
    expect(policyDiagnostics.filter((diagnostic) =>
      diagnostic.severity === 'error')).toHaveLength(errorCount)
    expect(policyDiagnostics.every((diagnostic) =>
      diagnostic.class === 'operational-advisory')).toBe(true)
    if (errorCount > 0) {
      recordKCodeTargetedRuntimeWitness({
        rail: 'machine-trace-validator',
        sourcePath: WITNESS_SOURCE,
        caseId: `loop-stack-policy:${count}-tucks`,
        expectedRule: 'machine-trace.loop-stack-policy',
        expectedSeverity: 'error',
        diagnostics: report.diagnostics,
      })
    }
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
    expect(report.operationalAssurance.limitations).toEqual([
      {
        code: 'physical-needle-numbering-unverified',
        message: 'Trace coordinates are exact KCode coordinates, not proven physical needle labels.',
      },
      {
        code: 'speed-operational-bounds-unverified',
        message: 'The profile does not establish operationally safe speed bounds.',
      },
      {
        code: 'roller-operational-bounds-unverified',
        message: 'The profile does not establish operationally safe signed roller bounds.',
      },
      {
        code: 'loop-stack-operational-limit-unverified',
        message: 'Stack depth is measured and checked against a conservative software policy; the policy is not a measured physical-safe or physical-failure limit.',
      },
      {
        code: 'transfer-physical-direction-conflict-unresolved',
        message: 'Transfer tokens conform to the official serialized KCode contract; conflicting machine-manual wording leaves controller-observed physical direction unestablished.',
      },
    ])
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
      KNITERATE_7GG_KCODE_PROFILE_V2,
    )
    expect(highSpeedReport.ok).toBe(true)
    expect(highSpeedReport).toMatchObject({
      profileConformance: 'conformant',
      modeledState: 'conformant',
      operationalPolicy: 'review',
    })
    expect(highSpeedReport.diagnostics).toContainEqual(expect.objectContaining({
      severity: 'warning',
      class: 'operational-advisory',
      rule: 'machine-trace.setting-documented-range',
    }))
    expect(highSpeedReport.diagnostics.some((diagnostic) =>
      diagnostic.rule.includes('carrier-active'))).toBe(false)
  })

  it('honors inclusive, exclusive, known, and unknown documented bounds exactly', () => {
    const first = smallTrace(['K']).passes[0]!
    const reportFor = (
      speed: number,
      roller: number,
      profile: KCodeMachineProfileV1 = KNITERATE_7GG_KCODE_PROFILE_V2,
    ) => validateKCodeMachineTrace(
      withPasses(smallTrace(['K']), [{
        ...first,
        speedRaw: String(speed),
        speed,
        rollerRaw: String(roller),
        roller,
      }]),
      profile,
    )
    const documentedRangeCount = (report: ReturnType<typeof reportFor>): number =>
      report.diagnostics.filter((diagnostic) =>
        diagnostic.rule === 'machine-trace.setting-documented-range').length

    expect(documentedRangeCount(reportFor(-10_000, -500))).toBe(0)
    expect(documentedRangeCount(reportFor(800, 999))).toBe(0)
    expect(documentedRangeCount(reportFor(801, -501))).toBe(2)
    expect(documentedRangeCount(reportFor(801, 1_000))).toBe(2)

    const exclusiveProfile: KCodeMachineProfileV1 = {
      ...KNITERATE_7GG_KCODE_PROFILE_V2,
      processSettings: {
        ...KNITERATE_7GG_KCODE_PROFILE_V2.processSettings,
        roller: {
          ...KNITERATE_7GG_KCODE_PROFILE_V2.processSettings.roller,
          editorDocumentedBounds: {
            lower: {
              ...KNITERATE_7GG_KCODE_PROFILE_V2.processSettings.roller.editorDocumentedBounds.lower,
              inclusive: false,
            },
            upper: {
              ...KNITERATE_7GG_KCODE_PROFILE_V2.processSettings.roller.editorDocumentedBounds.upper,
              inclusive: false,
            },
          },
        },
      },
    }
    expect(documentedRangeCount(reportFor(300, -500, exclusiveProfile))).toBe(1)
    expect(documentedRangeCount(reportFor(300, 999, exclusiveProfile))).toBe(1)
    expect(documentedRangeCount(reportFor(300, 0, exclusiveProfile))).toBe(0)

    const unknownUpperProfile: KCodeMachineProfileV1 = {
      ...KNITERATE_7GG_KCODE_PROFILE_V2,
      processSettings: {
        ...KNITERATE_7GG_KCODE_PROFILE_V2.processSettings,
        roller: {
          ...KNITERATE_7GG_KCODE_PROFILE_V2.processSettings.roller,
          editorDocumentedBounds: {
            ...KNITERATE_7GG_KCODE_PROFILE_V2.processSettings.roller.editorDocumentedBounds,
            upper: {
              ...KNITERATE_7GG_KCODE_PROFILE_V2.processSettings.roller.editorDocumentedBounds.upper,
              value: null,
              inclusive: null,
            },
          },
        },
      },
    }
    expect(documentedRangeCount(reportFor(300, 100_000, unknownUpperProfile))).toBe(0)
  })

  it('sorts final loop snapshots by bed and numeric coordinate independent of insertion order', () => {
    const rear = selection(0, 'rear', 3)
    const highFront = selection(0, 'front', 2)
    const lowFront = selection(0, 'front', -2)
    const base = smallPass('K', 0)
    const pass: MachineTracePassV1 = {
      ...base,
      direction: '>>',
      carriageStops: { left: -3.5, right: 3.5 },
      carrierStops: { left: -3.5, right: 3.5 },
      selections: { front: [highFront, lowFront], rear: [rear] },
      actions: [
        { kind: 'knit', at: lowFront },
        { kind: 'knit', at: highFront },
        { kind: 'knit', at: rear },
      ],
    }
    const report = validateKCodeMachineTrace(
      withPasses(smallTrace(['K']), [pass]),
      KNITERATE_7GG_KCODE_PROFILE_V2,
    )
    expect(report.finalState.front.map((cell) => cell.traceCoordinate)).toEqual([-2, 2])
    expect(report.finalState.rear.map((cell) => cell.traceCoordinate)).toEqual([3])
    expect(report.finalState.stacks).toEqual({
      'front:-2': 1,
      'front:2': 1,
      'rear:3': 1,
    })
    expect(report.passStates[0]!.stackDeltas.map((cell) =>
      `${cell.bed}:${cell.traceCoordinate}`)).toEqual([
      'front:-2',
      'front:2',
      'rear:3',
    ])

    const positiveHigh = selection(0, 'front', 3)
    const positiveLow = selection(0, 'front', 1)
    const descending: MachineTracePassV1 = {
      ...base,
      direction: '<<',
      carriageStops: { left: 0.5, right: 3.5 },
      carrierStops: { left: 0.5, right: 3.5 },
      selections: { front: [positiveHigh, positiveLow], rear: [] },
      actions: [
        { kind: 'knit', at: positiveHigh },
        { kind: 'knit', at: positiveLow },
      ],
    }
    const descendingReport = validateKCodeMachineTrace(
      withPasses(smallTrace(['K']), [descending]),
      KNITERATE_7GG_KCODE_PROFILE_V2,
    )
    expect(descendingReport.finalState.front.map((cell) =>
      cell.traceCoordinate)).toEqual([1, 3])
    expect(descendingReport.passStates[0]!.stackDeltas.map((cell) =>
      cell.traceCoordinate)).toEqual([1, 3])
  })

  it('uses the transfer source—not a rack-adjusted regular slot—for stop containment', () => {
    for (const kind of ['xfer', 'split'] as const) {
      const source = selection(0, 'rear', 0)
      const target = selection(0, 'front', 2)
      const carrier = kind === 'xfer' ? '0' as const : '2' as const
      const pass: MachineTracePassV1 = {
        ...smallPass(kind === 'xfer' ? 'Y' : 'S', 0),
        rack: 2,
        operation: 'Rr-Tr',
        direction: '>>',
        carrier,
        carriageStops: { left: -0.5, right: 0.5 },
        carrierStops: carrier === '0' ? null : { left: -0.5, right: 0.5 },
        selections: { front: [target], rear: [source] },
        actions: [kind === 'xfer'
          ? { kind, source, target }
          : { kind, source, target, carrier }],
      }
      const report = validateKCodeMachineTrace(
        withPasses(smallTrace(['K']), [pass]),
        KNITERATE_7GG_KCODE_PROFILE_V2,
      )
      expect(report.diagnostics.map((diagnostic) => diagnostic.rule)).not.toContain(
        'machine-trace.selection-outside-carriage',
      )
      expect(report.passStates[0]!.stackDeltas.map((cell) =>
        `${cell.bed}:${cell.traceCoordinate}`)).toEqual(['front:2', 'rear:0'])
    }
  })

  it('never applies structurally invalid actions to the empty-bed state model', () => {
    const source = selection(1, 'front', 0)
    const target = selection(1, 'rear', 0)
    const producer = smallPass('K', 0)
    const cases: MachineTracePassV1[] = [
      {
        ...smallPass('K', 1),
        operation: 'Kn-Kn',
        actions: [{ kind: 'tuck', at: source }],
      },
      {
        ...smallPass('K', 1),
        carrier: '0',
        carrierStops: null,
        actions: [{ kind: 'tuck', at: source }],
      },
      {
        ...smallPass('X', 1),
        carrier: '2',
        carrierStops: { left: -0.5, right: 1.5 },
        actions: [{ kind: 'xfer', source, target }],
      },
      (() => {
        const shiftedTarget = selection(1, 'rear', 1)
        return {
          ...smallPass('X', 1),
          selections: { front: [source], rear: [shiftedTarget] },
          actions: [{ kind: 'xfer' as const, source, target: shiftedTarget }],
        }
      })(),
    ]
    for (const invalid of cases) {
      const report = validateKCodeMachineTrace(
        withPasses(smallTrace(['K']), [producer, invalid]),
        KNITERATE_7GG_KCODE_PROFILE_V2,
      )
      expect(report.profileConformance).toBe('blocked')
      expect(report.finalState.stacks['front:0']).toBe(1)
      expect(report.finalState.stacks['rear:0']).toBeUndefined()
    }

    const rearSource = selection(0, 'rear', 0)
    const rearProducer: MachineTracePassV1 = {
      ...smallPass('K', 0),
      selections: { front: [], rear: [rearSource] },
      actions: [{ kind: 'knit', at: rearSource }],
    }
    const wrongSource: MachineTracePassV1 = {
      ...smallPass('X', 1),
      direction: '>>',
      selections: { front: [source], rear: [selection(1, 'rear', 0)] },
      actions: [{
        kind: 'xfer',
        source: selection(1, 'rear', 0),
        target: source,
      }],
    }
    const wrongSourceReport = validateKCodeMachineTrace(
      withPasses(smallTrace(['K']), [rearProducer, wrongSource]),
      KNITERATE_7GG_KCODE_PROFILE_V2,
    )
    expect(wrongSourceReport.diagnostics.map((diagnostic) => diagnostic.rule)).toContain(
      'machine-trace.action-operation',
    )
    expect(wrongSourceReport.finalState.stacks).toEqual({ 'rear:0': 1 })

    const outOfOrder = selection(0, 'rear', -1)
    const first = selection(0, 'front', 1)
    const pass: MachineTracePassV1 = {
      ...smallPass('K', 0),
      carriageStops: { left: -1.5, right: 1.5 },
      carrierStops: { left: -1.5, right: 1.5 },
      selections: { front: [first], rear: [outOfOrder] },
      actions: [{ kind: 'knit', at: first }, { kind: 'knit', at: outOfOrder }],
    }
    const report = validateKCodeMachineTrace(
      withPasses(smallTrace(['K']), [pass]),
      KNITERATE_7GG_KCODE_PROFILE_V2,
    )
    expect(report.diagnostics.map((diagnostic) => diagnostic.rule)).toContain(
      'machine-trace.action-direction-order',
    )
    expect(report.finalState.stacks).toEqual({ 'front:1': 1 })

    const reversePass: MachineTracePassV1 = {
      ...pass,
      direction: '<<',
      actions: [{ kind: 'knit', at: outOfOrder }, { kind: 'knit', at: first }],
    }
    const reverseReport = validateKCodeMachineTrace(
      withPasses(smallTrace(['K']), [reversePass]),
      KNITERATE_7GG_KCODE_PROFILE_V2,
    )
    expect(reverseReport.diagnostics.map((diagnostic) => diagnostic.rule)).toContain(
      'machine-trace.action-direction-order',
    )
    expect(reverseReport.finalState.stacks).toEqual({ 'rear:-1': 1 })
  })

  it('keeps diagnostic ordering deterministic across messages, rules, and action indexes', () => {
    const base = smallTrace(['K'])
    const first = base.passes[0]!
    const selected = first.selections.front[0]!
    const duplicates = validateKCodeMachineTrace(withPasses(base, [{
      ...first,
      selections: { front: [selected, selected, selected], rear: [] },
    }]), KNITERATE_7GG_KCODE_PROFILE_V2)
    expect(duplicates.diagnostics.filter((diagnostic) =>
      diagnostic.rule === 'machine-trace.duplicate-selection').map((diagnostic) =>
      diagnostic.message)).toEqual([
      'Needle front:0 is selected more than once in this pass.',
      'Selection front:0 appears more than once in this pass.',
    ])

    const repeatedActions = validateKCodeMachineTrace(withPasses(base, [{
      ...first,
      actions: [
        { kind: 'tuck', at: selected },
        { kind: 'tuck', at: selected },
      ],
    }]), KNITERATE_7GG_KCODE_PROFILE_V2)
    expect(repeatedActions.diagnostics.filter((diagnostic) =>
      diagnostic.rule === 'machine-trace.action-operation').map((diagnostic) =>
      diagnostic.actionIndex)).toEqual([0, 1])

    const sameActionRules = validateKCodeMachineTrace(withPasses(base, [{
      ...first,
      carrierStops: { left: 0.5, right: 1.5 },
      actions: [{ kind: 'tuck', at: selected }],
    }]), KNITERATE_7GG_KCODE_PROFILE_V2)
    expect(sameActionRules.diagnostics.filter((diagnostic) =>
      diagnostic.actionIndex === 0).map((diagnostic) => diagnostic.rule)).toEqual([
      'machine-trace.action-operation',
      'machine-trace.selection-outside-carrier',
    ])
    recordKCodeTargetedRuntimeWitness({
      rail: 'machine-trace-validator',
      sourcePath: WITNESS_SOURCE,
      caseId: 'selection-outside-carrier:narrow-stop',
      expectedRule: 'machine-trace.selection-outside-carrier',
      diagnostics: sameActionRules.diagnostics,
    })
  })

  it('keeps capped mixed-severity totals exact without reclassifying omissions', () => {
    const report = validateKCodeMachineTrace(
      smallTrace([
        ...Array.from({ length: 514 }, () => 'D' as const),
        'X',
      ]),
      KNITERATE_7GG_KCODE_PROFILE_V2,
    )
    const represented = (severity: 'error' | 'warning'): number =>
      report.diagnostics
        .filter((diagnostic) => diagnostic.severity === severity)
        .reduce((count, diagnostic) => count + (diagnostic.occurrences ?? 1), 0)

    expect(report.diagnostics.length).toBeLessThanOrEqual(520)
    expect(represented('error')).toBe(report.errorCount)
    expect(represented('warning')).toBe(report.warningCount)
    expect(report.diagnostics.slice(0, 2)).toEqual([
      expect.objectContaining({
        rule: 'machine-trace.drop-empty',
        passIndex: null,
        occurrences: 2,
      }),
      expect.objectContaining({
        rule: 'machine-trace.transfer-source-empty',
        passIndex: null,
        occurrences: 1,
      }),
    ])
    expect(report.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({
        rule: 'machine-trace.transfer-source-empty',
        severity: 'error',
        occurrences: 1,
      }),
      expect.objectContaining({
        rule: 'machine-trace.drop-empty',
        severity: 'warning',
        occurrences: 2,
      }),
    ]))
    expect(report.diagnostics.slice(0, 2).map((diagnostic) =>
      diagnostic.message)).toEqual([
      'MachineTrace diagnostics for machine-trace.drop-empty were truncated after 512 total detailed findings; omitted 2 additional warning findings.',
      'MachineTrace diagnostics for machine-trace.transfer-source-empty were truncated after 512 total detailed findings; omitted 1 additional error finding.',
    ])
  })

  it('property-checks stop containment with a fixed seed', () => {
    const trace = compileTrace()
    const first = trace.passes.find((pass) =>
      pass.carrier !== '0' && pass.selections.front.length > 0)!
    const operated = first.selections.front[0]!

    const fixedRight = operated.traceCoordinate - 0.5
    const fixedReport = validateKCodeMachineTrace(withPasses(trace, [{
      ...first,
      carriageStops: { left: fixedRight - 1, right: fixedRight },
      carrierStops: { left: fixedRight - 1, right: fixedRight },
    }]), KNITERATE_7GG_KCODE_PROFILE_V2)
    for (const expectedRule of [
      'machine-trace.selection-outside-carriage',
      'machine-trace.selection-outside-carrier',
    ]) {
      recordKCodeTargetedRuntimeWitness({
        rail: 'machine-trace-validator',
        sourcePath: WITNESS_SOURCE,
        caseId: `stop-containment:${expectedRule}`,
        expectedRule,
        diagnostics: fixedReport.diagnostics,
      })
    }

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
    const reportDigest = createHash('sha256')

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
        KNITERATE_7GG_KCODE_PROFILE_V2,
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
      reportDigest.update(JSON.stringify(report))
    }
    expect(reportDigest.digest('hex')).toBe(
      'db7e1e91036fd1c17d4eeca0b6cbec0876aa6821147b37b79defe0fabe4b9d8a',
    )
  })
})
