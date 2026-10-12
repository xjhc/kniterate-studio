import type { KCodeCarrierToken } from './machine-profile.js'
import { projectMachineSceneMovementV1, type MachineSceneMovementV1 } from './machine-scene.js'
import type { MachineTraceActionV1, MachineTraceBedV1, MachineTraceV1 } from './machine-trace.js'
import {
  machineLoopActionDeltasV1,
  snapshotMachineLoopStateV1,
  type MachineLoopStackCellV1,
  type MachineLoopStackKeyV1,
  type MachineLoopStateSnapshotV1,
  type MachineValidationReportV1,
} from './machine-validator.js'
import type { KCodeSourceSpan } from './types.js'

/** Software allocation/replay bounds, unrelated to physical machine limits. */
export const MACHINE_EXECUTION_LIMITS_V1 = {
  events: 400_000,
  coordinates: 1_024,
  checkpointEveryEvents: 256,
} as const

export interface MachineExecutionObservationV1 {
  /** Last encoded stop, never an interpolated within-pass position. */
  readonly coordinate: number | null
  readonly observedAtEventIndex: number | null
}

export interface MachineExecutionCarrierV1 extends MachineExecutionObservationV1 {
  readonly carrier: Exclude<KCodeCarrierToken, '0'>
}

export interface MachineExecutionAssuranceV1 {
  readonly loopState: 'modeled-empty-bed' | 'withheld-blocked'
  readonly profileConformance: MachineValidationReportV1['profileConformance']
  readonly modeledState: MachineValidationReportV1['modeledState']
  readonly operationalPolicy: MachineValidationReportV1['operationalPolicy']
  readonly controllerAcceptance: 'not-established-by-software-validation'
  readonly carrierLifecycle: 'not-encoded-in-kcode'
  readonly withinPassMotion: 'not-reconstructed'
}

interface MachineExecutionEventAnchorV1 {
  readonly index: number
  readonly id: string
  readonly passIndex: number | null
  readonly actionIndex: number | null
  readonly sourceSpan: KCodeSourceSpan
  readonly sourceSpans: readonly KCodeSourceSpan[]
}

export interface MachineExecutionLoopDeltaV1 {
  readonly coordinateIndex: number
  readonly beforeCount: number
  readonly afterCount: number
}

export type MachineExecutionEventV1 = MachineExecutionEventAnchorV1 & (
  | {
      readonly kind: 'rack'
      readonly rackCommandIndex: number
      readonly fromRack: number
      readonly toRack: number
    }
  | {
      readonly kind: 'pass-begin' | 'pass-end'
      readonly passIndex: number
      readonly movement: MachineSceneMovementV1
    }
  | {
      readonly kind: 'action'
      readonly passIndex: number
      readonly actionIndex: number
      readonly actionId: string
      readonly action: MachineTraceActionV1
      readonly loopDeltas: readonly MachineExecutionLoopDeltaV1[]
    }
)

export interface MachineExecutionPassV1 {
  readonly passIndex: number
  readonly beginEventIndex: number
  readonly actionEventIndices: readonly number[]
  readonly endEventIndex: number
}

export interface MachineExecutionCheckpointV1 {
  /** State after this event; -1 denotes the initial empty-bed assumption. */
  readonly eventIndex: number
  readonly counts: readonly number[]
  readonly rack: number
  readonly activePassIndex: number | null
  readonly carriage: MachineExecutionObservationV1
  readonly carriers: readonly MachineExecutionCarrierV1[]
}

/** Structured-clone safe: compact event deltas plus periodic full checkpoints. */
export interface MachineExecutionIndexV1 {
  readonly schemaVersion: 1
  readonly sourceTraceSchemaVersion: 1
  readonly profileId: string
  readonly profileVersion: number
  readonly dialect: MachineTraceV1['dialect']
  readonly coordinates: readonly Pick<MachineLoopStackCellV1, 'bed' | 'traceCoordinate'>[]
  readonly events: readonly MachineExecutionEventV1[]
  readonly passes: readonly MachineExecutionPassV1[]
  readonly checkpoints: readonly MachineExecutionCheckpointV1[]
  readonly assurance: MachineExecutionAssuranceV1
}

export interface MachineExecutionInspectionV1 {
  readonly schemaVersion: 1
  readonly eventIndex: number
  readonly event: MachineExecutionEventV1 | null
  readonly activePassIndex: number | null
  readonly rack: number
  readonly loopState: MachineLoopStateSnapshotV1 | null
  readonly carriage: MachineExecutionObservationV1
  readonly carriers: readonly MachineExecutionCarrierV1[]
  readonly assurance: MachineExecutionAssuranceV1
}

interface MutableExecutionState {
  counts: number[]
  rack: number
  activePassIndex: number | null
  carriage: MachineExecutionObservationV1
  carriers: MachineExecutionCarrierV1[]
}

function fail(message: string): never {
  throw new Error(`Cannot project MachineExecutionIndexV1: ${message}`)
}

function key(bed: MachineTraceBedV1, coordinate: number): MachineLoopStackKeyV1 {
  return `${bed}:${coordinate}`
}

function initialState(coordinateCount: number): MutableExecutionState {
  return {
    counts: Array.from({ length: coordinateCount }, () => 0),
    rack: 0,
    activePassIndex: null,
    carriage: { coordinate: null, observedAtEventIndex: null },
    carriers: (['1', '2', '3', '4', '5', '6'] as const).map((carrier) => ({
      carrier,
      coordinate: null,
      observedAtEventIndex: null,
    })),
  }
}

function copyState(state: Omit<MachineExecutionCheckpointV1, 'eventIndex'>): MutableExecutionState {
  return {
    counts: [...state.counts],
    rack: state.rack,
    activePassIndex: state.activePassIndex,
    carriage: { ...state.carriage },
    carriers: state.carriers.map((carrier) => ({ ...carrier })),
  }
}

function applyEvent(state: MutableExecutionState, event: MachineExecutionEventV1): void {
  if (event.kind === 'rack') {
    state.rack = event.toRack
  } else if (event.kind === 'action') {
    for (const delta of event.loopDeltas) state.counts[delta.coordinateIndex] = delta.afterCount
  } else {
    const begin = event.kind === 'pass-begin'
    state.activePassIndex = begin ? event.passIndex : null
    const observation = (travel: { fromStopCoordinate: number; toStopCoordinate: number }): MachineExecutionObservationV1 => ({
      coordinate: begin ? travel.fromStopCoordinate : travel.toStopCoordinate,
      observedAtEventIndex: event.index,
    })
    state.carriage = observation(event.movement.carriage)
    const guide = event.movement.carrierGuide
    if (guide !== null && guide.carrier !== '0') {
      const carrier = guide.carrier
      state.carriers[Number(carrier) - 1] = { carrier, ...observation(guide) }
    }
  }
}

function loopSnapshot(
  coordinates: MachineExecutionIndexV1['coordinates'],
  counts: readonly number[],
): MachineLoopStateSnapshotV1 {
  const cells = new Map<MachineLoopStackKeyV1, MachineLoopStackCellV1>()
  for (const [index, coordinate] of coordinates.entries()) {
    const count = counts[index]!
    if (count > 0) cells.set(key(coordinate.bed, coordinate.traceCoordinate), { ...coordinate, count })
  }
  return snapshotMachineLoopStateV1(cells)
}

/**
 * Project encoded program order, not elapsed time. Before an action is the
 * preceding event; after it is the action event itself. Rack commands after the
 * last pass remain individual events. No HOME pose or carrier lifecycle is
 * invented. Blocked validation keeps encoded anchors but withholds loop replay.
 */
export function createMachineExecutionIndexV1(
  trace: MachineTraceV1,
  validation: MachineValidationReportV1,
): MachineExecutionIndexV1 {
  let eventCount = trace.rackCommands.length
  let unknownAction = false
  for (const [index, pass] of trace.passes.entries()) {
    if (pass.index !== index) fail('pass indices must be dense and ordered')
    eventCount += pass.actions.length + 2
    if (eventCount > MACHINE_EXECUTION_LIMITS_V1.events) fail('timeline exceeds the software event limit')
    if (pass.actions.some((action) => action.kind === 'unknown')) unknownAction = true
  }
  if (eventCount > MACHINE_EXECUTION_LIMITS_V1.events) fail('timeline exceeds the software event limit')
  let previousBoundary = 0
  for (const [index, command] of trace.rackCommands.entries()) {
    if (command.index !== index || !Number.isInteger(command.beforePassIndex)
      || command.beforePassIndex < previousBoundary || command.beforePassIndex > trace.passes.length
      || !Number.isFinite(command.value)) fail('rack commands must have finite values and ordered pass boundaries')
    previousBoundary = command.beforePassIndex
  }

  const loopsAvailable = validation.ok && validation.profileConformance === 'conformant'
    && validation.modeledState !== 'blocked' && !unknownAction
  const assurance: MachineExecutionAssuranceV1 = {
    loopState: loopsAvailable ? 'modeled-empty-bed' : 'withheld-blocked',
    profileConformance: validation.profileConformance,
    modeledState: validation.modeledState,
    operationalPolicy: validation.operationalPolicy,
    controllerAcceptance: 'not-established-by-software-validation',
    carrierLifecycle: 'not-encoded-in-kcode',
    withinPassMotion: 'not-reconstructed',
  }
  if (loopsAvailable && validation.passStates.length !== trace.passes.length) {
    fail('validation pass count does not match this trace')
  }

  const coordinates: Array<Pick<MachineLoopStackCellV1, 'bed' | 'traceCoordinate'>> = []
  const coordinateIndices = new Map<MachineLoopStackKeyV1, number>()
  if (loopsAvailable) {
    for (const pass of trace.passes) {
      for (const action of pass.actions) {
        const selections = 'at' in action ? [action.at]
          : 'source' in action ? [action.source, action.target] : []
        for (const selection of selections) {
          const coordinateKey = key(selection.bed, selection.traceCoordinate)
          if (coordinateIndices.has(coordinateKey)) continue
          if (coordinates.length >= MACHINE_EXECUTION_LIMITS_V1.coordinates) fail('loop coordinates exceed the software coordinate limit')
          if (!Number.isFinite(selection.traceCoordinate)) fail('loop coordinates must be finite')
          coordinateIndices.set(coordinateKey, coordinates.length)
          coordinates.push({ bed: selection.bed, traceCoordinate: selection.traceCoordinate })
        }
      }
    }
  }

  const state = initialState(coordinates.length)
  const events: MachineExecutionEventV1[] = []
  const passes: MachineExecutionPassV1[] = []
  const checkpoints: MachineExecutionCheckpointV1[] = [{ eventIndex: -1, ...copyState(state) }]
  const append = (event: MachineExecutionEventV1): void => {
    events.push(event)
    applyEvent(state, event)
    if (events.length % MACHINE_EXECUTION_LIMITS_V1.checkpointEveryEvents === 0) {
      checkpoints.push({ eventIndex: event.index, ...copyState(state) })
    }
  }
  let commandIndex = 0
  for (let passIndex = 0; passIndex <= trace.passes.length; passIndex++) {
    while (trace.rackCommands[commandIndex]?.beforePassIndex === passIndex) {
      const command = trace.rackCommands[commandIndex]!
      append({
        kind: 'rack', index: events.length, id: `rack:${command.index}`,
        passIndex: passIndex < trace.passes.length ? passIndex : null,
        actionIndex: null, sourceSpan: command.source.span, sourceSpans: [command.source.span],
        rackCommandIndex: command.index, fromRack: state.rack, toRack: command.value,
      })
      commandIndex++
    }
    const pass = trace.passes[passIndex]
    if (pass === undefined) break
    if (loopsAvailable && state.rack !== pass.rack) fail('pass rack does not match ordered rack commands')
    const movement = projectMachineSceneMovementV1(pass)
    const beginEventIndex = events.length
    append({
      kind: 'pass-begin', index: events.length, id: `pass:${passIndex}:begin`, passIndex,
      actionIndex: null, sourceSpan: pass.source.span, sourceSpans: [pass.source.span], movement,
    })
    const actionEventIndices: number[] = []
    const beforeCounts = [...state.counts]
    for (const [actionIndex, action] of pass.actions.entries()) {
      const actionId = `pass:${passIndex}:action:${actionIndex}`
      const sourceSpans = 'at' in action ? [action.at.sourceSpan]
        : 'source' in action ? [action.source.sourceSpan, action.target.sourceSpan]
          : [pass.source.footer]
      const loopDeltas = loopsAvailable ? machineLoopActionDeltasV1(
        action,
        (bed, coordinate) => state.counts[coordinateIndices.get(key(bed, coordinate))!]!,
      ).map((delta) => ({
        coordinateIndex: coordinateIndices.get(key(delta.bed, delta.traceCoordinate))!,
        beforeCount: delta.beforeCount,
        afterCount: delta.afterCount,
      })) : []
      actionEventIndices.push(events.length)
      append({
        kind: 'action', index: events.length, id: actionId, actionId, passIndex, actionIndex,
        action, sourceSpan: sourceSpans[0]!, sourceSpans, loopDeltas,
      })
    }
    if (loopsAvailable) {
      const passState = validation.passStates[passIndex]!
      if (passState.passIndex !== passIndex) fail('validation pass indices do not match this trace')
      for (const delta of passState.stackDeltas) {
        const coordinateIndex = coordinateIndices.get(key(delta.bed, delta.traceCoordinate))
        if (coordinateIndex === undefined || beforeCounts[coordinateIndex] !== delta.beforeCount
          || state.counts[coordinateIndex] !== delta.afterCount) fail('action replay disagrees with validation pass deltas')
      }
    }
    const endEventIndex = events.length
    append({
      kind: 'pass-end', index: events.length, id: `pass:${passIndex}:end`, passIndex,
      actionIndex: null, sourceSpan: pass.source.footer, sourceSpans: [pass.source.footer], movement,
    })
    passes.push({ passIndex, beginEventIndex, actionEventIndices, endEventIndex })
  }
  if (loopsAvailable && JSON.stringify(loopSnapshot(coordinates, state.counts)) !== JSON.stringify(validation.finalState)) {
    fail('action replay disagrees with the validation final state')
  }
  return {
    schemaVersion: 1, sourceTraceSchemaVersion: 1, profileId: trace.profileId,
    profileVersion: trace.profileVersion, dialect: trace.dialect,
    coordinates, events, passes, checkpoints, assurance,
  }
}

/** Deterministic backward/forward inspection, replaying at most 255 events. */
export function inspectMachineExecutionV1(
  index: MachineExecutionIndexV1,
  eventIndex: number,
): MachineExecutionInspectionV1 {
  if (!Number.isInteger(eventIndex) || eventIndex < -1 || eventIndex >= index.events.length) {
    throw new RangeError('Machine execution event index is outside -1..events.length-1')
  }
  const checkpointIndex = Math.floor((eventIndex + 1) / MACHINE_EXECUTION_LIMITS_V1.checkpointEveryEvents)
  const checkpoint = index.checkpoints[checkpointIndex]!
  const state = copyState(checkpoint)
  for (let cursor = checkpoint.eventIndex + 1; cursor <= eventIndex; cursor++) {
    applyEvent(state, index.events[cursor]!)
  }
  return {
    schemaVersion: 1, eventIndex, event: index.events[eventIndex] ?? null,
    activePassIndex: state.activePassIndex, rack: state.rack,
    loopState: index.assurance.loopState === 'modeled-empty-bed' ? loopSnapshot(index.coordinates, state.counts) : null,
    carriage: state.carriage, carriers: state.carriers, assurance: index.assurance,
  }
}
