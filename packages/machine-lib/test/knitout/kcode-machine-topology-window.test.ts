import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { KNITERATE_7GG_KCODE_PROFILE_V2 } from '../../src/knitout/kcode/machine-profile.js'
import { parseKCodeDocument } from '../../src/knitout/kcode/parser.js'
import { projectKCodeMachineTrace } from '../../src/knitout/kcode/machine-trace.js'
import { projectMachineTopologyV1 } from '../../src/knitout/kcode/machine-topology.js'
import { MACHINE_TOPOLOGY_INSPECTION_LIMITS_V1, indexMachineTopologyWindowV1, inspectMachineTopologyLoopV1, projectMachineTopologyWindowV1 } from '../../src/knitout/kcode/machine-topology-window.js'

const references = ['2x2-rib-beanie', 'back', 'color-swatch-bindoff', 'dbj', 'fairisle', 'front', 'jacquard', 'sleeves', 'sophie', 'sophie2', 'sophie_stripe', 'swatch']
function referenceIndex(name: string) {
  const source = readFileSync(new URL(`../../reference/${name}.kc`, import.meta.url), 'utf8')
  const parsed = parseKCodeDocument(source, { profile: KNITERATE_7GG_KCODE_PROFILE_V2, dialect: 'knitout-vendor', strict: true })
  if (!parsed.ok) throw new Error('Rejected reference')
  const trace = projectKCodeMachineTrace(parsed.document, KNITERATE_7GG_KCODE_PROFILE_V2)
  const topology = projectMachineTopologyV1(trace, MACHINE_TOPOLOGY_INSPECTION_LIMITS_V1)
  return indexMachineTopologyWindowV1(topology, trace.passes.length)
}

describe('bounded indexed topology windows', () => {
  for (const name of references) it(`renders ${name} at reference scale with stable loop identities`, () => {
    const index = referenceIndex(name)
    expect(index.topology.loops.length).toBeGreaterThan(6_000)
    for (const pass of [0, Math.floor(index.passCount / 2), index.passCount - 1]) {
      const window = projectMachineTopologyWindowV1(index, pass, 32)
      expect(window.mesh.nodes.length).toBeLessThanOrEqual(6_000)
      expect(window.mesh.edges.length).toBeLessThanOrEqual(18_000)
      expect(window.mesh.movements.length).toBeLessThanOrEqual(18_000)
      expect(window.passStart).toBeLessThanOrEqual(pass)
      expect(window.passEnd).toBeGreaterThanOrEqual(pass)
      expect(window.summary.loopCount).toBe(index.topology.loops.length)
      const visible = new Set(window.mesh.nodes.map(node => node.loopId))
      for (const edge of window.mesh.edges) {
        expect(visible.has(edge.fromLoopId) && visible.has(edge.toLoopId)).toBe(true)
      }
      for (const node of window.mesh.nodes) {
        const original = index.topology.loops[node.loopId]!
        expect([node.passIndex, node.actionIndex]).toEqual([original.createdAt.passIndex, original.createdAt.actionIndex])
      }
    }
    const loop = index.topology.loops[Math.floor(index.topology.loops.length / 2)]!
    const detail = inspectMachineTopologyLoopV1(index, loop.id)!
    expect(detail.loop).toBe(loop)
    expect(detail.parents.map(item => item.id)).toEqual(loop.parentLoopIds)
    expect(detail.previousCarrierLoop?.id ?? null).toBe(loop.previousCarrierLoopId)
  })

  it('accounts for incoming lineage outside a pass window and rejects invalid budgets', () => {
    const index = referenceIndex('fairisle')
    const pass = Math.floor(index.passCount / 2)
    const window = projectMachineTopologyWindowV1(index, pass, 0)
    expect(window.incomingBoundaryConnections).toBeGreaterThan(0)
    expect(window.passStart).toBe(pass)
    expect(window.passEnd).toBe(pass)
    expect(() => projectMachineTopologyWindowV1(index, pass, 33)).toThrow('radius')
    expect(() => indexMachineTopologyWindowV1({ ...index.topology, loops: Array(200_001).fill(index.topology.loops[0]) }, index.passCount)).toThrow('resource contract')
  })

  it('shows transfers in a window with no newly created loops', () => {
    const index = referenceIndex('2x2-rib-beanie')
    const movement = index.topology.movements.find(item => !index.loopsByPass.has(item.passIndex))
    expect(movement).toBeDefined()
    const window = projectMachineTopologyWindowV1(index, movement!.passIndex, 0)
    expect(window.mesh.nodes).toHaveLength(0)
    expect(window.mesh.movements.length).toBeGreaterThan(0)
    expect(window.mesh.width).toBeGreaterThan(0)
  })
})
