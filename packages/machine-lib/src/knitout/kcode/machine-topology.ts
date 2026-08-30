import type { KCodeCarrierToken } from './machine-profile.js'
import type {
  MachineTraceActionV1,
  MachineTraceBedV1,
  MachineTracePassV1,
  MachineTraceV1,
} from './machine-trace.js'

export interface MachineTopologyLimitsV1 {
  readonly maxLoops: number
  readonly maxConnections: number
  readonly maxMovements: number
}

export const DEFAULT_MACHINE_TOPOLOGY_LIMITS_V1: MachineTopologyLimitsV1 = Object.freeze({
  maxLoops: 20_000,
  maxConnections: 60_000,
  maxMovements: 60_000,
})

export type MachineTopologyProjectionErrorCodeV1 =
  | 'invalid-resource-limits'
  | 'resource-limit'
  | 'unknown-action'
  | 'invalid-loop-forming-carrier'
  | 'empty-transfer-source'

export class MachineTopologyProjectionErrorV1 extends Error {
  readonly code: MachineTopologyProjectionErrorCodeV1
  readonly passIndex: number | null
  readonly actionIndex: number | null

  constructor(
    code: MachineTopologyProjectionErrorCodeV1,
    message: string,
    passIndex: number | null = null,
    actionIndex: number | null = null,
  ) {
    super(message)
    this.name = 'MachineTopologyProjectionErrorV1'
    this.code = code
    this.passIndex = passIndex
    this.actionIndex = actionIndex
  }
}

export interface MachineTopologyLocationV1 {
  readonly bed: MachineTraceBedV1
  /** Normalized MachineTrace coordinate; never a physical needle label. */
  readonly traceCoordinate: number
}

export interface MachineTopologyActionAnchorV1 {
  readonly passIndex: number
  readonly actionIndex: number
  readonly rack: number
}

export interface MachineTopologyLoopV1 {
  readonly id: number
  readonly creation: 'knit' | 'tuck' | 'split'
  readonly carrier: Exclude<KCodeCarrierToken, '0'>
  readonly createdAt: MachineTopologyActionAnchorV1 & {
    readonly location: MachineTopologyLocationV1
  }
  /** Loops replaced by a knit or used as the source ancestry of a split. */
  readonly parentLoopIds: readonly number[]
  /** Loops held on the same needle when a tuck adds this loop. */
  readonly heldWithLoopIds: readonly number[]
  /** Prior observed loop on this carrier; no synthetic in/out fact is implied. */
  readonly previousCarrierLoopId: number | null
  readonly terminal: null | (MachineTopologyActionAnchorV1 & {
    readonly kind: 'consumed' | 'dropped'
  })
  readonly finalLocation: MachineTopologyLocationV1 | null
}

export interface MachineTopologyConnectionV1 {
  readonly kind: 'formed-through' | 'held-with' | 'yarn-continuity'
  readonly fromLoopId: number
  readonly toLoopId: number
  readonly carrier: Exclude<KCodeCarrierToken, '0'> | null
}

export interface MachineTopologyMovementV1 extends MachineTopologyActionAnchorV1 {
  readonly kind: 'transfer'
  readonly loopId: number
  readonly from: MachineTopologyLocationV1
  readonly to: MachineTopologyLocationV1
}

export interface MachineTopologyCarrierChainV1 {
  readonly carrier: Exclude<KCodeCarrierToken, '0'>
  readonly loopIds: readonly number[]
  readonly lifecycle: {
    readonly entry: 'unknown-before-first-observed-loop'
    readonly exit: 'unknown-after-last-observed-loop'
    readonly provenance: 'not-encoded-in-kcode'
  }
}

export interface MachineTopologyStackV1 extends MachineTopologyLocationV1 {
  readonly loopIds: readonly number[]
}

export interface MachineTopologyV1 {
  readonly schemaVersion: 1
  readonly sourceTraceSchemaVersion: 1
  readonly profileId: string
  readonly profileVersion: number
  readonly dialect: MachineTraceV1['dialect']
  readonly assumptions: {
    readonly initialLoopState: 'empty-bed-job-assumption'
    readonly carrierLifecycle: 'not-encoded-in-kcode'
    readonly coordinateDomain: 'dialect-normalized-machine-trace'
    readonly physicalFabricAppearance: 'not-established-by-software-projection'
  }
  readonly rackCommands: readonly {
    readonly index: number
    readonly beforePassIndex: number
    readonly value: number
  }[]
  readonly loops: readonly MachineTopologyLoopV1[]
  readonly connections: readonly MachineTopologyConnectionV1[]
  readonly movements: readonly MachineTopologyMovementV1[]
  readonly carrierChains: readonly MachineTopologyCarrierChainV1[]
  readonly finalStacks: {
    readonly front: readonly MachineTopologyStackV1[]
    readonly rear: readonly MachineTopologyStackV1[]
  }
  readonly summary: {
    readonly loopCount: number
    readonly connectionCount: number
    readonly transferMovementCount: number
    readonly liveLoopCount: number
    readonly consumedLoopCount: number
    readonly droppedLoopCount: number
    readonly carrierCount: number
  }
}

interface MutableTopologyLoop {
  readonly id: number
  readonly creation: MachineTopologyLoopV1['creation']
  readonly carrier: MachineTopologyLoopV1['carrier']
  readonly createdAt: MachineTopologyLoopV1['createdAt']
  readonly parentLoopIds: readonly number[]
  readonly heldWithLoopIds: readonly number[]
  readonly previousCarrierLoopId: number | null
  terminal: MachineTopologyLoopV1['terminal']
  finalLocation: MachineTopologyLoopV1['finalLocation']
}

const normalizedCoordinate = (value: number): number => Object.is(value, -0) ? 0 : value

function location(
  bed: MachineTraceBedV1,
  traceCoordinate: number,
): MachineTopologyLocationV1 {
  return { bed, traceCoordinate: normalizedCoordinate(traceCoordinate) }
}

function locationKey(value: MachineTopologyLocationV1): string {
  return `${value.bed}:${value.traceCoordinate}`
}

function validatedLimits(
  limits: MachineTopologyLimitsV1 | undefined,
): MachineTopologyLimitsV1 {
  const selected = limits ?? DEFAULT_MACHINE_TOPOLOGY_LIMITS_V1
  for (const [name, value] of Object.entries(selected)) {
    if (!Number.isSafeInteger(value) || value <= 0) {
      throw new MachineTopologyProjectionErrorV1(
        'invalid-resource-limits',
        `Machine topology ${name} must be a positive safe integer.`,
      )
    }
  }
  return selected
}

function actionLocation(action: Extract<MachineTraceActionV1, { kind: 'knit' | 'tuck' | 'drop' }>): MachineTopologyLocationV1 {
  return location(action.at.bed, action.at.traceCoordinate)
}

function transferLocation(
  selection: Extract<MachineTraceActionV1, { kind: 'xfer' | 'split' }>['source'],
): MachineTopologyLocationV1 {
  return location(selection.bed, selection.traceCoordinate)
}

export function projectMachineTopologyV1(
  trace: MachineTraceV1,
  requestedLimits?: MachineTopologyLimitsV1,
): MachineTopologyV1 {
  const limits = validatedLimits(requestedLimits)
  const stacks = new Map<string, number[]>()
  const loops: MutableTopologyLoop[] = []
  const connections: MachineTopologyConnectionV1[] = []
  const movements: MachineTopologyMovementV1[] = []
  const carrierChains = new Map<Exclude<KCodeCarrierToken, '0'>, number[]>()

  const stackAt = (at: MachineTopologyLocationV1): readonly number[] =>
    stacks.get(locationKey(at)) ?? []
  const setStack = (at: MachineTopologyLocationV1, loopIds: readonly number[]): void => {
    const key = locationKey(at)
    if (loopIds.length === 0) stacks.delete(key)
    else stacks.set(key, [...loopIds])
  }
  const ensureCapacity = (
    current: number,
    maximum: number,
    noun: string,
    passIndex: number,
    actionIndex: number,
  ): void => {
    if (current >= maximum) {
      throw new MachineTopologyProjectionErrorV1(
        'resource-limit',
        `Machine topology exceeds the ${maximum.toLocaleString('en-US')} ${noun} limit.`,
        passIndex,
        actionIndex,
      )
    }
  }
  const addConnection = (
    connection: MachineTopologyConnectionV1,
    passIndex: number,
    actionIndex: number,
  ): void => {
    ensureCapacity(connections.length, limits.maxConnections, 'connection', passIndex, actionIndex)
    connections.push(connection)
  }
  const createLoop = (
    pass: MachineTracePassV1,
    actionIndex: number,
    creation: MachineTopologyLoopV1['creation'],
    at: MachineTopologyLocationV1,
    parentLoopIds: readonly number[],
    heldWithLoopIds: readonly number[],
  ): number => {
    if (pass.carrier === '0') {
      throw new MachineTopologyProjectionErrorV1(
        'invalid-loop-forming-carrier',
        `${creation} at pass ${pass.index} cannot create a yarn loop with carrier 0.`,
        pass.index,
        actionIndex,
      )
    }
    ensureCapacity(loops.length, limits.maxLoops, 'loop', pass.index, actionIndex)
    const carrier = pass.carrier
    const chain = carrierChains.get(carrier) ?? []
    const previousCarrierLoopId = chain.at(-1) ?? null
    const id = loops.length
    loops.push({
      id,
      creation,
      carrier,
      createdAt: { passIndex: pass.index, actionIndex, rack: pass.rack, location: at },
      parentLoopIds: [...parentLoopIds],
      heldWithLoopIds: [...heldWithLoopIds],
      previousCarrierLoopId,
      terminal: null,
      finalLocation: at,
    })
    for (const parentLoopId of parentLoopIds) addConnection({
      kind: 'formed-through', fromLoopId: parentLoopId, toLoopId: id, carrier: null,
    }, pass.index, actionIndex)
    for (const heldLoopId of heldWithLoopIds) addConnection({
      kind: 'held-with', fromLoopId: heldLoopId, toLoopId: id, carrier: null,
    }, pass.index, actionIndex)
    if (previousCarrierLoopId !== null) addConnection({
      kind: 'yarn-continuity', fromLoopId: previousCarrierLoopId, toLoopId: id, carrier,
    }, pass.index, actionIndex)
    chain.push(id)
    carrierChains.set(carrier, chain)
    return id
  }
  const terminate = (
    loopIds: readonly number[],
    kind: 'consumed' | 'dropped',
    anchor: MachineTopologyActionAnchorV1,
  ): void => {
    for (const loopId of loopIds) {
      const loop = loops[loopId]
      if (loop === undefined || loop.terminal !== null) continue
      loop.terminal = { ...anchor, kind }
      loop.finalLocation = null
    }
  }
  const transfer = (
    loopIds: readonly number[],
    from: MachineTopologyLocationV1,
    to: MachineTopologyLocationV1,
    anchor: MachineTopologyActionAnchorV1,
  ): void => {
    for (const loopId of loopIds) {
      ensureCapacity(movements.length, limits.maxMovements, 'movement', anchor.passIndex, anchor.actionIndex)
      const loop = loops[loopId]
      if (loop === undefined || loop.terminal !== null) continue
      movements.push({ ...anchor, kind: 'transfer', loopId, from, to })
      loop.finalLocation = to
    }
  }

  for (const pass of trace.passes) {
    for (const [actionIndex, action] of pass.actions.entries()) {
      const anchor = { passIndex: pass.index, actionIndex, rack: pass.rack }
      switch (action.kind) {
        case 'knit': {
          const at = actionLocation(action)
          const parents = stackAt(at)
          terminate(parents, 'consumed', anchor)
          setStack(at, [createLoop(pass, actionIndex, 'knit', at, parents, [])])
          break
        }
        case 'tuck': {
          const at = actionLocation(action)
          const held = stackAt(at)
          setStack(at, [...held, createLoop(pass, actionIndex, 'tuck', at, [], held)])
          break
        }
        case 'drop': {
          const at = actionLocation(action)
          const dropped = stackAt(at)
          terminate(dropped, 'dropped', anchor)
          setStack(at, [])
          break
        }
        case 'xfer':
        case 'split': {
          const from = transferLocation(action.source)
          const to = transferLocation(action.target)
          const moved = stackAt(from)
          if (moved.length === 0) {
            throw new MachineTopologyProjectionErrorV1(
              'empty-transfer-source',
              `${action.kind} at pass ${pass.index} has no modeled source loops at ${locationKey(from)}.`,
              pass.index,
              actionIndex,
            )
          }
          transfer(moved, from, to, anchor)
          setStack(to, [...stackAt(to), ...moved])
          setStack(from, [])
          if (action.kind === 'split') {
            setStack(from, [createLoop(pass, actionIndex, 'split', from, moved, [])])
          }
          break
        }
        case 'move':
          break
        case 'unknown':
          throw new MachineTopologyProjectionErrorV1(
            'unknown-action',
            `Cannot project unknown ${action.operation} action at pass ${pass.index}: ${action.reason}.`,
            pass.index,
            actionIndex,
          )
      }
    }
  }

  const finalStacks = [...stacks.values()].reduce<{
    front: MachineTopologyStackV1[]
    rear: MachineTopologyStackV1[]
  }>((result, loopIds) => {
    const loop = loops[loopIds[0]!]
    if (loop?.finalLocation === null || loop?.finalLocation === undefined) return result
    result[loop.finalLocation.bed].push({ ...loop.finalLocation, loopIds: [...loopIds] })
    return result
  }, { front: [], rear: [] })
  finalStacks.front.sort((left, right) => left.traceCoordinate - right.traceCoordinate)
  finalStacks.rear.sort((left, right) => left.traceCoordinate - right.traceCoordinate)

  const terminalCount = (kind: 'consumed' | 'dropped'): number =>
    loops.filter((loop) => loop.terminal?.kind === kind).length
  const carrierChainValues = [...carrierChains.entries()]
    .sort(([left], [right]) => Number(left) - Number(right))
    .map(([carrier, loopIds]): MachineTopologyCarrierChainV1 => ({
      carrier,
      loopIds: [...loopIds],
      lifecycle: {
        entry: 'unknown-before-first-observed-loop',
        exit: 'unknown-after-last-observed-loop',
        provenance: 'not-encoded-in-kcode',
      },
    }))
  const projectedLoops: MachineTopologyLoopV1[] = loops.map((loop) => ({
    ...loop,
    createdAt: { ...loop.createdAt, location: { ...loop.createdAt.location } },
    parentLoopIds: [...loop.parentLoopIds],
    heldWithLoopIds: [...loop.heldWithLoopIds],
    terminal: loop.terminal === null ? null : { ...loop.terminal },
    finalLocation: loop.finalLocation === null ? null : { ...loop.finalLocation },
  }))
  const consumedLoopCount = terminalCount('consumed')
  const droppedLoopCount = terminalCount('dropped')

  return {
    schemaVersion: 1,
    sourceTraceSchemaVersion: trace.schemaVersion,
    profileId: trace.profileId,
    profileVersion: trace.profileVersion,
    dialect: trace.dialect,
    assumptions: {
      initialLoopState: 'empty-bed-job-assumption',
      carrierLifecycle: 'not-encoded-in-kcode',
      coordinateDomain: 'dialect-normalized-machine-trace',
      physicalFabricAppearance: 'not-established-by-software-projection',
    },
    rackCommands: trace.rackCommands.map((command) => ({
      index: command.index,
      beforePassIndex: command.beforePassIndex,
      value: command.value,
    })),
    loops: projectedLoops,
    connections,
    movements,
    carrierChains: carrierChainValues,
    finalStacks,
    summary: {
      loopCount: loops.length,
      connectionCount: connections.length,
      transferMovementCount: movements.length,
      liveLoopCount: loops.length - consumedLoopCount - droppedLoopCount,
      consumedLoopCount,
      droppedLoopCount,
      carrierCount: carrierChainValues.length,
    },
  }
}
