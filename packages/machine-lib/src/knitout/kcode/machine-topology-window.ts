import { projectMachineTopologyMeshV1, type MachineTopologyMeshV1 } from './machine-topology-mesh.js'
import { MachineTopologyProjectionErrorV1, type MachineTopologyLoopV1, type MachineTopologyV1 } from './machine-topology.js'

/** Full software graph budget, aligned with the admitted 200,000-selection trace.
 * Connections and transferred stacks stay separately bounded. These are resource
 * ceilings, not a physical loop-stack allowance. */
export const MACHINE_TOPOLOGY_INSPECTION_LIMITS_V1 = Object.freeze({
  maxLoops: 200_000, maxConnections: 800_000, maxMovements: 600_000,
})
export const MACHINE_TOPOLOGY_WINDOW_LIMITS_V1 = Object.freeze({
  maxNodes: 6_000, maxEdges: 18_000, maxMovements: 18_000,
})

export interface MachineTopologyWindowIndexV1 {
  readonly topology: MachineTopologyV1
  readonly passCount: number
  readonly loopsByPass: ReadonlyMap<number, readonly MachineTopologyLoopV1[]>
  readonly connectionsByPass: ReadonlyMap<number, readonly MachineTopologyV1['connections'][number][]>
  readonly movementsByPass: ReadonlyMap<number, readonly MachineTopologyV1['movements'][number][]>
}

export interface MachineTopologyWindowV1 {
  readonly mesh: MachineTopologyMeshV1
  readonly passStart: number
  readonly passEnd: number
  readonly passCount: number
  readonly incomingBoundaryConnections: number
  readonly summary: MachineTopologyV1['summary']
}

function append<T>(map: Map<number, T[]>, key: number, value: T): void {
  const list = map.get(key)
  if (list === undefined) map.set(key, [value])
  else list.push(value)
}

/** Retained inside the Worker; never send the complete graph to the renderer. */
export function indexMachineTopologyWindowV1(topology: MachineTopologyV1, passCount: number): MachineTopologyWindowIndexV1 {
  if (!Number.isSafeInteger(passCount) || passCount < 0
    || topology.loops.length > MACHINE_TOPOLOGY_INSPECTION_LIMITS_V1.maxLoops
    || topology.connections.length > MACHINE_TOPOLOGY_INSPECTION_LIMITS_V1.maxConnections
    || topology.movements.length > MACHINE_TOPOLOGY_INSPECTION_LIMITS_V1.maxMovements) {
    throw new MachineTopologyProjectionErrorV1('resource-limit', 'Topology inspection exceeds its full-graph resource contract.')
  }
  const loopsByPass = new Map<number, MachineTopologyLoopV1[]>()
  const connectionsByPass = new Map<number, MachineTopologyV1['connections'][number][]>()
  const movementsByPass = new Map<number, MachineTopologyV1['movements'][number][]>()
  for (const loop of topology.loops) append(loopsByPass, loop.createdAt.passIndex, loop)
  for (const connection of topology.connections) {
    const target = topology.loops[connection.toLoopId]
    if (target === undefined || topology.loops[connection.fromLoopId] === undefined) {
      throw new MachineTopologyProjectionErrorV1('resource-limit', 'Topology connection has no indexed loop.')
    }
    append(connectionsByPass, target.createdAt.passIndex, connection)
  }
  for (const movement of topology.movements) append(movementsByPass, movement.passIndex, movement)
  return { topology, passCount, loopsByPass, connectionsByPass, movementsByPass }
}

/** A complete contiguous pass window. Edges arriving from earlier passes are
 * counted explicitly; stable loop IDs still resolve through the full index. */
export function projectMachineTopologyWindowV1(index: MachineTopologyWindowIndexV1, selectedPass: number, radius = 8): MachineTopologyWindowV1 {
  if (!Number.isSafeInteger(selectedPass) || !Number.isSafeInteger(radius) || radius < 0 || radius > 32) {
    throw new MachineTopologyProjectionErrorV1('invalid-resource-limits', 'Topology window needs an integer pass and a radius from 0 through 32.')
  }
  const center = Math.max(0, Math.min(index.passCount - 1, selectedPass))
  let passStart = Math.max(0, center - radius)
  let passEnd = Math.min(Math.max(0, index.passCount - 1), center + radius)
  while (true) {
    const loops: MachineTopologyLoopV1[] = []
    const movements: MachineTopologyV1['movements'][number][] = []
    for (let pass = passStart; pass <= passEnd; pass++) {
      loops.push(...(index.loopsByPass.get(pass) ?? []))
      movements.push(...(index.movementsByPass.get(pass) ?? []))
    }
    const visible = new Set(loops.map((loop) => loop.id))
    const connections: MachineTopologyV1['connections'][number][] = []
    let incomingBoundaryConnections = 0
    for (let pass = passStart; pass <= passEnd; pass++) {
      for (const connection of index.connectionsByPass.get(pass) ?? []) {
        if (visible.has(connection.fromLoopId)) connections.push(connection)
        else incomingBoundaryConnections++
      }
    }
    if (loops.length <= MACHINE_TOPOLOGY_WINDOW_LIMITS_V1.maxNodes
      && connections.length <= MACHINE_TOPOLOGY_WINDOW_LIMITS_V1.maxEdges
      && movements.length <= MACHINE_TOPOLOGY_WINDOW_LIMITS_V1.maxMovements) {
      const mesh = projectMachineTopologyMeshV1({ ...index.topology, loops, connections, movements }, MACHINE_TOPOLOGY_WINDOW_LIMITS_V1)
      return { mesh, passStart, passEnd, passCount: index.passCount, incomingBoundaryConnections, summary: index.topology.summary }
    }
    if (passStart === passEnd) throw new MachineTopologyProjectionErrorV1('resource-limit', 'One pass exceeds the bounded topology window.', center)
    if (center - passStart >= passEnd - center) passStart++
    else passEnd--
  }
}

export interface MachineTopologyLoopInspectionV1 {
  readonly loop: MachineTopologyLoopV1
  readonly parents: readonly MachineTopologyLoopV1[]
  readonly heldWith: readonly MachineTopologyLoopV1[]
  readonly previousCarrierLoop: MachineTopologyLoopV1 | null
}

export function inspectMachineTopologyLoopV1(index: MachineTopologyWindowIndexV1, loopId: number): MachineTopologyLoopInspectionV1 | null {
  const loop = index.topology.loops[loopId]
  if (loop === undefined) return null
  return {
    loop,
    parents: loop.parentLoopIds.map((id) => index.topology.loops[id]!),
    heldWith: loop.heldWithLoopIds.map((id) => index.topology.loops[id]!),
    previousCarrierLoop: loop.previousCarrierLoopId === null ? null : index.topology.loops[loop.previousCarrierLoopId]!,
  }
}
