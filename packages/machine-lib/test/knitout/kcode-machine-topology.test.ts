import { describe, expect, it } from 'vitest'

import { KNITERATE_7GG_KCODE_PROFILE_V2, type KCodeDialect } from '../../src/knitout/kcode/machine-profile.js'
import { projectKCodeMachineTrace, type MachineTraceV1 } from '../../src/knitout/kcode/machine-trace.js'
import { projectMachineTopologyMeshV1 } from '../../src/knitout/kcode/machine-topology-mesh.js'
import {
  MachineTopologyProjectionErrorV1,
  projectMachineTopologyV1,
} from '../../src/knitout/kcode/machine-topology.js'
import { parseKCodeDocument } from '../../src/knitout/kcode/parser.js'
import { knitoutToKCodeWithTrace } from '../../src/knitout/kniterate/to-kcode.js'

const mixedTopologyKnitout = [
  ';!knitout-2',
  ';;Machine: kniterate',
  ';;Carriers: 1 2 3 4 5 6',
  'x-stitch-number 6',
  'x-xfer-stitch-number 5',
  'x-speed-number 300',
  'x-roller-advance 450',
  'in 2',
  'tuck + f40 2',
  'knit - f40 2',
  'rack 1',
  'split + f40 b39 2',
  'rack 0',
  'drop f40',
  'knit - b39 2',
  'out 2',
  '',
].join('\n')

function emittedKCode(): string {
  const converted = knitoutToKCodeWithTrace(mixedTopologyKnitout, 'topology.k')
  if (!converted.ok) throw new Error(converted.error)
  return converted.kcode
}

function traceFor(dialect: KCodeDialect): MachineTraceV1 {
  const parsed = parseKCodeDocument(emittedKCode(), {
    profile: KNITERATE_7GG_KCODE_PROFILE_V2,
    dialect,
    strict: true,
  })
  if (!parsed.ok) throw new Error(parsed.diagnostics.map((item) => item.message).join('\n'))
  return projectKCodeMachineTrace(parsed.document, KNITERATE_7GG_KCODE_PROFILE_V2)
}

describe('MachineTrace topology and schematic mesh projection', () => {
  it('preserves loop identity across tuck, knit, rack, split, drop, transfer, and both beds', () => {
    const topology = projectMachineTopologyV1(traceFor('knitout-vendor'))

    expect(topology.assumptions).toEqual({
      initialLoopState: 'empty-bed-job-assumption',
      carrierLifecycle: 'not-encoded-in-kcode',
      coordinateDomain: 'dialect-normalized-machine-trace',
      physicalFabricAppearance: 'not-established-by-software-projection',
    })
    expect(topology.rackCommands.some((command) => command.value === 1)).toBe(true)
    expect(topology.loops.map((loop) => loop.creation)).toEqual([
      'tuck', 'knit', 'split', 'knit',
    ])
    expect(topology.loops[1]).toMatchObject({
      parentLoopIds: [0],
      terminal: { kind: 'consumed' },
    })
    expect(topology.loops[2]).toMatchObject({
      creation: 'split',
      parentLoopIds: [1],
      terminal: { kind: 'dropped' },
    })
    expect(topology.loops[3]).toMatchObject({
      creation: 'knit',
      parentLoopIds: [1],
      createdAt: { location: { bed: 'rear' } },
      terminal: null,
      finalLocation: { bed: 'rear' },
    })
    expect(topology.movements).toContainEqual(expect.objectContaining({
      loopId: 1,
      from: expect.objectContaining({ bed: 'front' }),
      to: expect.objectContaining({ bed: 'rear' }),
      rack: 1,
    }))
    expect(topology.carrierChains).toEqual([expect.objectContaining({
      carrier: '2',
      loopIds: [0, 1, 2, 3],
      lifecycle: {
        entry: 'unknown-before-first-observed-loop',
        exit: 'unknown-after-last-observed-loop',
        provenance: 'not-encoded-in-kcode',
      },
    })])
    expect(topology.connections.filter((edge) => edge.kind === 'yarn-continuity')).toHaveLength(3)
    expect(topology.finalStacks.front).toEqual([])
    expect(topology.finalStacks.rear).toEqual([expect.objectContaining({ loopIds: [3] })])
    expect(topology.summary).toMatchObject({
      loopCount: 4,
      liveLoopCount: 1,
      consumedLoopCount: 2,
      droppedLoopCount: 1,
      carrierCount: 1,
    })
  })

  it('uses normalized strict-trace coordinates identically for both V2 dialect labels', () => {
    const app = projectMachineTopologyV1(traceFor('app'))
    const vendor = projectMachineTopologyV1(traceFor('knitout-vendor'))

    expect(app.dialect).toBe('app')
    expect(vendor.dialect).toBe('knitout-vendor')
    expect({ ...app, dialect: 'same' }).toEqual({ ...vendor, dialect: 'same' })
  })

  it('projects a deterministic bounded schematic mesh without claiming physical fabric', () => {
    const topology = projectMachineTopologyV1(traceFor('knitout-vendor'))
    const mesh = projectMachineTopologyMeshV1(topology)

    expect(mesh).toMatchObject({
      schemaVersion: 1,
      sourceTopologySchemaVersion: 1,
      renderingClaim: 'schematic-topology-not-physical-fabric',
      coordinateDomain: 'dialect-normalized-machine-trace',
      summary: topology.summary,
    })
    expect(mesh.nodes).toHaveLength(4)
    expect(mesh.nodes.map((node) => node.bed)).toContain('front')
    expect(mesh.nodes.map((node) => node.bed)).toContain('rear')
    expect(mesh.edges.some((edge) => edge.kind === 'formed-through')).toBe(true)
    expect(mesh.edges.some((edge) => edge.kind === 'yarn-continuity')).toBe(true)
    expect(mesh.movements).toContainEqual(expect.objectContaining({
      loopId: 1,
      fromBed: 'front',
      toBed: 'rear',
    }))
    expect(mesh.width).toBeGreaterThan(0)
    expect(mesh.height).toBeGreaterThan(0)
  })

  it('fails closed on unknown actions and topology or mesh capacity limits', () => {
    const trace = traceFor('knitout-vendor')
    const actionPassIndex = trace.passes.findIndex((pass) => pass.actions.length > 0)
    const pass = trace.passes[actionPassIndex]!
    const unknownTrace: MachineTraceV1 = {
      ...trace,
      passes: trace.passes.map((candidate, index) => index === actionPassIndex ? {
        ...pass,
        actions: [{
          kind: 'unknown',
          operation: pass.operation,
          reason: 'unsupported-operation',
          selections: [],
        }],
      } : candidate),
    }

    expect(() => projectMachineTopologyV1(unknownTrace)).toThrowError(
      expect.objectContaining({ code: 'unknown-action', passIndex: pass.index }),
    )
    expect(() => projectMachineTopologyV1(trace, {
      maxLoops: 1,
      maxConnections: 10,
      maxMovements: 10,
    })).toThrowError(expect.objectContaining({ code: 'resource-limit' }))

    const topology = projectMachineTopologyV1(trace)
    expect(() => projectMachineTopologyMeshV1(topology, {
      maxNodes: 1,
      maxEdges: 10,
      maxMovements: 10,
    })).toThrowError(MachineTopologyProjectionErrorV1)
  })
})
