import {
  MachineTopologyProjectionErrorV1,
  type MachineTopologyConnectionV1,
  type MachineTopologyLocationV1,
  type MachineTopologyV1,
} from './machine-topology.js'

export interface MachineTopologyMeshLimitsV1 {
  readonly maxNodes: number
  readonly maxEdges: number
  readonly maxMovements: number
}

export const DEFAULT_MACHINE_TOPOLOGY_MESH_LIMITS_V1: MachineTopologyMeshLimitsV1 = Object.freeze({
  maxNodes: 6_000,
  maxEdges: 18_000,
  maxMovements: 18_000,
})

export interface MachineTopologyMeshNodeV1 {
  readonly loopId: number
  readonly x: number
  readonly y: number
  readonly bed: MachineTopologyLocationV1['bed']
  readonly traceCoordinate: number
  readonly passIndex: number
  readonly actionIndex: number
  readonly carrier: string
  readonly creation: 'knit' | 'tuck' | 'split'
  readonly status: 'live' | 'consumed' | 'dropped'
}

export interface MachineTopologyMeshEdgeV1 {
  readonly kind: MachineTopologyConnectionV1['kind']
  readonly fromLoopId: number
  readonly toLoopId: number
  readonly carrier: string | null
  readonly x1: number
  readonly y1: number
  readonly x2: number
  readonly y2: number
}

export interface MachineTopologyMeshMovementV1 {
  readonly loopId: number
  readonly passIndex: number
  readonly fromBed: MachineTopologyLocationV1['bed']
  readonly toBed: MachineTopologyLocationV1['bed']
  readonly x1: number
  readonly x2: number
  readonly y: number
}

export interface MachineTopologyMeshV1 {
  readonly schemaVersion: 1
  readonly sourceTopologySchemaVersion: 1
  readonly renderingClaim: 'schematic-topology-not-physical-fabric'
  readonly coordinateDomain: 'dialect-normalized-machine-trace'
  readonly width: number
  readonly height: number
  readonly traceCoordinateRange: { readonly min: number; readonly max: number } | null
  readonly passRange: { readonly min: number; readonly max: number } | null
  readonly nodes: readonly MachineTopologyMeshNodeV1[]
  readonly edges: readonly MachineTopologyMeshEdgeV1[]
  readonly movements: readonly MachineTopologyMeshMovementV1[]
  readonly summary: MachineTopologyV1['summary']
}

const X_STEP = 18
const Y_STEP = 15
const BED_OFFSET = 5
const MARGIN = 20

function validatedLimits(
  limits: MachineTopologyMeshLimitsV1 | undefined,
): MachineTopologyMeshLimitsV1 {
  const selected = limits ?? DEFAULT_MACHINE_TOPOLOGY_MESH_LIMITS_V1
  for (const [name, value] of Object.entries(selected)) {
    if (!Number.isSafeInteger(value) || value <= 0) {
      throw new MachineTopologyProjectionErrorV1(
        'invalid-resource-limits',
        `Machine topology mesh ${name} must be a positive safe integer.`,
      )
    }
  }
  return selected
}

export function projectMachineTopologyMeshV1(
  topology: MachineTopologyV1,
  requestedLimits?: MachineTopologyMeshLimitsV1,
): MachineTopologyMeshV1 {
  const limits = validatedLimits(requestedLimits)
  const overLimit = topology.loops.length > limits.maxNodes
    ? `${topology.loops.length.toLocaleString('en-US')} loops exceed the ${limits.maxNodes.toLocaleString('en-US')} mesh-node limit`
    : topology.connections.length > limits.maxEdges
      ? `${topology.connections.length.toLocaleString('en-US')} connections exceed the ${limits.maxEdges.toLocaleString('en-US')} mesh-edge limit`
      : topology.movements.length > limits.maxMovements
        ? `${topology.movements.length.toLocaleString('en-US')} movements exceed the ${limits.maxMovements.toLocaleString('en-US')} mesh-movement limit`
        : null
  if (overLimit !== null) {
    throw new MachineTopologyProjectionErrorV1(
      'resource-limit',
      `Schematic topology preview withheld: ${overLimit}.`,
    )
  }

  if (topology.loops.length === 0 && topology.movements.length === 0) {
    return {
      schemaVersion: 1,
      sourceTopologySchemaVersion: topology.schemaVersion,
      renderingClaim: 'schematic-topology-not-physical-fabric',
      coordinateDomain: 'dialect-normalized-machine-trace',
      width: MARGIN * 2,
      height: MARGIN * 2,
      traceCoordinateRange: null,
      passRange: null,
      nodes: [],
      edges: [],
      movements: [],
      summary: topology.summary,
    }
  }

  let minimumCoordinate = Infinity
  let maximumCoordinate = -Infinity
  let minimumPass = Infinity
  let maximumPass = -Infinity
  const includeLocation = (at: MachineTopologyLocationV1, passIndex: number): void => {
    minimumCoordinate = Math.min(minimumCoordinate, at.traceCoordinate)
    maximumCoordinate = Math.max(maximumCoordinate, at.traceCoordinate)
    minimumPass = Math.min(minimumPass, passIndex)
    maximumPass = Math.max(maximumPass, passIndex)
  }
  for (const loop of topology.loops) includeLocation(loop.createdAt.location, loop.createdAt.passIndex)
  for (const movement of topology.movements) {
    includeLocation(movement.from, movement.passIndex)
    includeLocation(movement.to, movement.passIndex)
  }
  const xFor = (at: MachineTopologyLocationV1): number =>
    MARGIN + (at.traceCoordinate - minimumCoordinate) * X_STEP + (at.bed === 'rear' ? BED_OFFSET : 0)
  const yFor = (passIndex: number): number => MARGIN + (passIndex - minimumPass) * Y_STEP

  const nodes: MachineTopologyMeshNodeV1[] = topology.loops.map((loop) => ({
    loopId: loop.id,
    x: xFor(loop.createdAt.location),
    y: yFor(loop.createdAt.passIndex),
    bed: loop.createdAt.location.bed,
    traceCoordinate: loop.createdAt.location.traceCoordinate,
    passIndex: loop.createdAt.passIndex,
    actionIndex: loop.createdAt.actionIndex,
    carrier: loop.carrier,
    creation: loop.creation,
    status: loop.terminal?.kind ?? 'live',
  }))
  const nodesById = new Map(nodes.map((node) => [node.loopId, node]))
  const edges: MachineTopologyMeshEdgeV1[] = topology.connections.map((connection) => {
    const from = nodesById.get(connection.fromLoopId)
    const to = nodesById.get(connection.toLoopId)
    if (from === undefined || to === undefined) {
      throw new MachineTopologyProjectionErrorV1(
        'resource-limit',
        `Topology connection ${connection.fromLoopId}->${connection.toLoopId} has no mesh node.`,
      )
    }
    return {
      ...connection,
      carrier: connection.carrier,
      x1: from.x,
      y1: from.y,
      x2: to.x,
      y2: to.y,
    }
  })
  const movements: MachineTopologyMeshMovementV1[] = topology.movements.map((movement) => ({
    loopId: movement.loopId,
    passIndex: movement.passIndex,
    fromBed: movement.from.bed,
    toBed: movement.to.bed,
    x1: xFor(movement.from),
    x2: xFor(movement.to),
    y: yFor(movement.passIndex),
  }))

  return {
    schemaVersion: 1,
    sourceTopologySchemaVersion: topology.schemaVersion,
    renderingClaim: 'schematic-topology-not-physical-fabric',
    coordinateDomain: 'dialect-normalized-machine-trace',
    width: Math.max(MARGIN * 2, MARGIN * 2 + (maximumCoordinate - minimumCoordinate) * X_STEP + BED_OFFSET),
    height: Math.max(MARGIN * 2, MARGIN * 2 + (maximumPass - minimumPass) * Y_STEP),
    traceCoordinateRange: { min: minimumCoordinate, max: maximumCoordinate },
    passRange: { min: minimumPass, max: maximumPass },
    nodes,
    edges,
    movements,
    summary: topology.summary,
  }
}
