import { readFileSync, readdirSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import {
  MACHINE_EXECUTION_LIMITS_V1,
  createMachineExecutionIndexV1,
  inspectMachineExecutionV1,
  type MachineExecutionEventV1,
} from '../../src/knitout/kcode/machine-execution.js'
import { KNITERATE_7GG_KCODE_PROFILE_V2 as profile } from '../../src/knitout/kcode/machine-profile.js'
import { projectKCodeMachineTrace, type MachineTraceV1 } from '../../src/knitout/kcode/machine-trace.js'
import { validateKCodeMachineTrace } from '../../src/knitout/kcode/machine-validator.js'
import { parseKCodeBytes } from '../../src/knitout/kcode/bytes.js'
import { parseKCodeDocument } from '../../src/knitout/kcode/parser.js'
import { knitoutToKCodeWithTrace } from '../../src/knitout/kniterate/to-kcode.js'

function compileTrace(instructions: readonly string[]): MachineTraceV1 {
  const compiled = knitoutToKCodeWithTrace([
    ';!knitout-2', ';;Machine: kniterate', ';;Carriers: 1 2 3 4 5 6',
    'x-stitch-number 6', 'x-speed-number 100', 'x-roller-advance 0',
    ...instructions, ...instructions.filter((instruction) => instruction.startsWith('in ')).map((instruction) => instruction.replace('in ', 'out ')), '',
  ].join('\n'), 'execution.k')
  if (!compiled.ok) throw new Error(compiled.error)
  const parsed = parseKCodeDocument(compiled.kcode, { profile, dialect: 'knitout-vendor', strict: true })
  expect(parsed.ok).toBe(true)
  return projectKCodeMachineTrace(parsed.document, profile)
}

function indexFor(trace: MachineTraceV1) {
  const validation = validateKCodeMachineTrace(trace, profile)
  expect(validation.diagnostics.filter((diagnostic) => diagnostic.severity === 'error')).toEqual([])
  return { index: createMachineExecutionIndexV1(trace, validation), validation }
}

function isAction(event: MachineExecutionEventV1): event is Extract<MachineExecutionEventV1, { kind: 'action' }> {
  return event.kind === 'action'
}

describe('KCode execution cursor', () => {
  it('steps before and after knit, tuck, transfer, split and drop over both full beds', () => {
    const trace = compileTrace([
      'in 2', 'knit + f40 2', 'knit + f41 2',
      'tuck - f40 2', 'xfer f40 b40', 'split + b40 f40 2',
      'drop b40', 'rack 1', 'xfer f40 b39', 'rack 0',
    ])
    const { index, validation } = indexFor(trace)
    const actions = index.events.filter(isAction).filter((event) => event.action.kind !== 'move')
    expect(actions.map((event) => event.action.kind)).toEqual(['knit', 'knit', 'tuck', 'xfer', 'split', 'drop', 'xfer'])
    const first = actions[0]!
    const firstSelection = 'at' in first.action ? first.action.at : null
    expect(firstSelection).not.toBeNull()
    const column = firstSelection!.traceCoordinate
    const firstKey = `front:${column}` as const
    expect(inspectMachineExecutionV1(index, first.index - 1).loopState?.stacks[firstKey]).toBeUndefined()
    expect(inspectMachineExecutionV1(index, first.index).loopState?.stacks[firstKey]).toBe(1)
    const tuck = actions[2]!
    expect(inspectMachineExecutionV1(index, tuck.index - 1).loopState?.stacks[firstKey]).toBe(1)
    expect(inspectMachineExecutionV1(index, tuck.index).loopState?.stacks[firstKey]).toBe(2)
    const transferred = inspectMachineExecutionV1(index, actions[3]!.index).loopState!
    expect(transferred.stacks[firstKey]).toBeUndefined()
    expect(transferred.stacks[`rear:${column}`]).toBe(2)
    expect(transferred.stacks[`front:${column + 1}`]).toBe(1)
    const split = inspectMachineExecutionV1(index, actions[4]!.index).loopState!
    expect(split.stacks[`rear:${column}`]).toBe(1)
    expect(split.stacks[firstKey]).toBe(2)
    const dropped = inspectMachineExecutionV1(index, actions[5]!.index).loopState!
    expect(dropped.stacks[`rear:${column}`]).toBeUndefined()
    expect(dropped.stacks[firstKey]).toBe(2)
    expect(inspectMachineExecutionV1(index, index.events.length - 1).loopState).toEqual(validation.finalState)
    expect(index.assurance).toMatchObject({
      loopState: 'modeled-empty-bed', carrierLifecycle: 'not-encoded-in-kcode',
      controllerAcceptance: 'not-established-by-software-validation', withinPassMotion: 'not-reconstructed',
    })
  })

  it('tracks all six last observed carrier stops only at pass boundaries, with exact source anchors', () => {
    const trace = compileTrace(['in 2', 'knit + f40 2', 'knit + f41 2', 'knit - f41 2', 'in 3', 'knit + f40 3'])
    const { index } = indexFor(trace)
    const initial = inspectMachineExecutionV1(index, -1)
    expect(initial.event).toBeNull()
    expect(initial.carriage).toEqual({ coordinate: null, observedAtEventIndex: null })
    expect(initial.carriers).toEqual(['1', '2', '3', '4', '5', '6'].map((carrier) => ({
      carrier, coordinate: null, observedAtEventIndex: null,
    })))
    for (const passIndices of index.passes) {
      const pass = trace.passes[passIndices.passIndex]!
      const begin = inspectMachineExecutionV1(index, passIndices.beginEventIndex)
      const end = inspectMachineExecutionV1(index, passIndices.endEventIndex)
      expect(begin.activePassIndex).toBe(pass.index)
      expect(end.activePassIndex).toBeNull()
      expect(begin.event?.sourceSpan).toEqual(pass.source.span)
      expect(end.event?.sourceSpan).toEqual(pass.source.footer)
      expect(begin.carriage.coordinate).toBe(pass.direction === '>>' ? pass.carriageStops.left : pass.carriageStops.right)
      expect(end.carriage.coordinate).toBe(pass.direction === '>>' ? pass.carriageStops.right : pass.carriageStops.left)
      for (const eventIndex of passIndices.actionEventIndices) {
        const atAction = inspectMachineExecutionV1(index, eventIndex)
        expect(atAction.carriage).toEqual(begin.carriage)
        expect(atAction.carriers).toEqual(begin.carriers)
        const event = atAction.event!
        expect(event.kind).toBe('action')
        if (event.kind !== 'action') throw new Error('Expected action')
        expect(event.action).toEqual(pass.actions[event.actionIndex])
        expect(event.id).toBe(`pass:${pass.index}:action:${event.actionIndex}`)
        if ('at' in event.action) expect(event.sourceSpan).toEqual(event.action.at.sourceSpan)
      }
      if (pass.carrier !== '0') {
        expect(end.carriers[Number(pass.carrier) - 1]).toEqual({
          carrier: pass.carrier,
          coordinate: pass.direction === '>>' ? pass.carrierStops!.right : pass.carrierStops!.left,
          observedAtEventIndex: passIndices.endEventIndex,
        })
      }
    }
    const final = inspectMachineExecutionV1(index, index.events.length - 1)
    expect(final.carriers[1]!.coordinate).not.toBeNull()
    expect(final.carriers[2]!.coordinate).not.toBeNull()
    expect(final.carriers.filter((carrier) => ['1', '4', '5', '6'].includes(carrier.carrier)).every((carrier) => carrier.coordinate === null)).toBe(true)
  })

  it('preserves redundant/transient/final rack events and replays backward across checkpoints after cloning', () => {
    const trace = compileTrace(['in 2', ...Array.from({ length: 180 }, (_, row) => `knit ${row % 2 === 0 ? '+' : '-'} f40 2`)])
    const source = trace.rackCommands[0]!.source
    const commands = [
      ...trace.rackCommands,
      ...[1, 0, 0, 0.5].map((value, index) => ({
        index: trace.rackCommands.length + index,
        beforePassIndex: trace.passes.length,
        value, valueRaw: String(value), source,
      })),
    ]
    const { index, validation } = indexFor({ ...trace, rackCommands: commands })
    expect(index.events.slice(-4).map((event) => event.kind === 'rack' ? [event.fromRack, event.toRack] : null)).toEqual([[0, 1], [1, 0], [0, 0], [0, 0.5]])
    expect(index.checkpoints.length).toBe(1 + Math.floor(index.events.length / MACHINE_EXECUTION_LIMITS_V1.checkpointEveryEvents))
    expect(index.checkpoints.length).toBeGreaterThan(2)
    for (const pass of index.passes) {
      const before = inspectMachineExecutionV1(index, pass.beginEventIndex).loopState!
      const after = inspectMachineExecutionV1(index, pass.endEventIndex).loopState!
      expect(before).toMatchObject(validation.passStates[pass.passIndex]!.before)
      expect(after).toMatchObject(validation.passStates[pass.passIndex]!.after)
    }
    const cloned = structuredClone(index)
    for (const eventIndex of [-1, 0, 255, 256, 511, index.events.length - 1, 1, 256, -1]) {
      expect(inspectMachineExecutionV1(cloned, eventIndex)).toEqual(inspectMachineExecutionV1(index, eventIndex))
    }
    const final = inspectMachineExecutionV1(index, index.events.length - 1)
    expect(final.rack).toBe(0.5)
    expect(final.event?.passIndex).toBeNull()
    expect(final.event?.sourceSpan).toEqual(source.span)
    const snapshot = inspectMachineExecutionV1(index, 256)
    ;(snapshot.carriers as Array<{ coordinate: number | null }>)[0]!.coordinate = 123
    expect(inspectMachineExecutionV1(index, 256).carriers[0]!.coordinate).toBeNull()
  })

  it('withholds loop state for blocked or unknown input without inventing machine certification', () => {
    const trace = compileTrace(['in 2', 'knit + f40 2'])
    const validation = validateKCodeMachineTrace(trace, profile)
    const index = createMachineExecutionIndexV1(trace, { ...validation, ok: false, profileConformance: 'blocked', modeledState: 'blocked' })
    expect(index.assurance.loopState).toBe('withheld-blocked')
    expect(index.coordinates).toEqual([])
    expect(inspectMachineExecutionV1(index, -1).loopState).toBeNull()
    expect(inspectMachineExecutionV1(index, index.events.length - 1).loopState).toBeNull()
    const unknown: MachineTraceV1 = { ...trace, passes: trace.passes.map((pass, index) => index !== 0 ? pass : {
      ...pass, actions: [{ kind: 'unknown', operation: 'Future-Op', reason: 'unsupported-operation', selections: [] }],
    }) }
    expect(createMachineExecutionIndexV1(unknown, validation).assurance.loopState).toBe('withheld-blocked')
  })

  it('indexes every accepted reference file and agrees with validator state at all pass boundaries', () => {
    const referenceRoot = new URL('../../reference/', import.meta.url)
    const fixtures = readdirSync(referenceRoot).filter((name) => name.endsWith('.kc') && name !== 'fox-baby-beanie.kc').sort()
    expect(fixtures).toHaveLength(12)
    for (const name of fixtures) {
      const parsed = parseKCodeBytes(readFileSync(new URL(name, referenceRoot)), { profile, dialect: 'knitout-vendor', strict: true })
      expect(parsed.ok, name).toBe(true)
      const trace = projectKCodeMachineTrace(parsed.document, profile)
      const { index, validation } = indexFor(trace)
      expect(index.assurance.loopState, name).toBe('modeled-empty-bed')
      expect(inspectMachineExecutionV1(index, index.events.length - 1).loopState, name).toEqual(validation.finalState)
      for (const pass of index.passes) {
        const before = inspectMachineExecutionV1(index, pass.beginEventIndex).loopState!
        const after = inspectMachineExecutionV1(index, pass.endEventIndex).loopState!
        expect(before, `${name} pass ${pass.passIndex} before`).toMatchObject(validation.passStates[pass.passIndex]!.before)
        expect(after, `${name} pass ${pass.passIndex} after`).toMatchObject(validation.passStates[pass.passIndex]!.after)
      }
    }
  }, 30_000)

  it('refuses invalid cursors, mismatched validation, and resource expansion before allocating events', () => {
    const trace = compileTrace(['in 2', 'knit + f40 2'])
    const { index, validation } = indexFor(trace)
    for (const cursor of [-2, 0.5, NaN, Infinity, index.events.length]) {
      expect(() => inspectMachineExecutionV1(index, cursor)).toThrow(RangeError)
    }
    expect(() => createMachineExecutionIndexV1(trace, { ...validation, passStates: [] })).toThrow(/pass count/)
    expect(() => createMachineExecutionIndexV1(trace, { ...validation, finalState: { ...validation.finalState, totalLoops: 987 } })).toThrow(/final state/)
    const pass = trace.passes[0]!
    expect(() => createMachineExecutionIndexV1({
      ...trace, passes: [{ ...pass, actions: Array.from({ length: MACHINE_EXECUTION_LIMITS_V1.events }, () => pass.actions[0]!) }],
    }, validation)).toThrow(/event limit/)
    expect(() => createMachineExecutionIndexV1({
      ...trace, rackCommands: [{ ...trace.rackCommands[0]!, beforePassIndex: -1 }],
    }, validation)).toThrow(/rack commands/)
    const selection = pass.selections.front[0] ?? trace.passes.find((p) => p.selections.front.length > 0)!.selections.front[0]!
    const lotsOfCoordinates: MachineTraceV1 = {
      ...trace, passes: [{ ...pass, actions: Array.from({ length: MACHINE_EXECUTION_LIMITS_V1.coordinates + 1 }, (_, traceCoordinate) => ({
        kind: 'knit' as const, at: { ...selection, traceCoordinate },
      })) }],
    }
    expect(() => createMachineExecutionIndexV1(lotsOfCoordinates, { ...validation, passStates: [validation.passStates[0]!] })).toThrow(/coordinate limit/)
  })
})
