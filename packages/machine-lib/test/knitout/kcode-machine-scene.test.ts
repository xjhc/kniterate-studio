import { describe, expect, it } from 'vitest'

import {
  projectMachineScene,
  type MachineSceneActionGlyphV1,
  type MachineScenePassV1,
  type MachineSceneSelectionV1,
} from '../../src/knitout/kcode/machine-scene.js'
import type {
  MachineTraceActionV1,
  MachineTraceBedV1,
  MachineTracePassV1,
  MachineTraceSelectionV1,
  MachineTraceV1,
} from '../../src/knitout/kcode/machine-trace.js'

const span = {
  start: { offset: 0, line: 1, column: 1 },
  end: { offset: 1, line: 1, column: 2 },
} as const

function selection(
  bed: MachineTraceBedV1,
  kcodeColumn: number,
  token: string,
  encodedValue: number,
): MachineTraceSelectionV1 {
  return {
    bed,
    payloadIndex: kcodeColumn + 15,
    kcodeColumn,
    traceCoordinate: kcodeColumn,
    stitchSelector: { token, encodedValue, sourceSpan: span },
    sourceSpan: span,
  }
}

interface PassInput {
  readonly index: number
  readonly direction: '>>' | '<<'
  readonly operation: string
  readonly carrier: MachineTracePassV1['carrier']
  readonly rack?: number
  readonly carriageStops: MachineTracePassV1['carriageStops']
  readonly carrierStops?: MachineTracePassV1['carrierStops']
  readonly front?: readonly MachineTraceSelectionV1[]
  readonly rear?: readonly MachineTraceSelectionV1[]
  readonly actions: readonly MachineTraceActionV1[]
}

function pass(input: PassInput): MachineTracePassV1 {
  return {
    index: input.index,
    raw: {
      FRNT: '',
      STIF: '',
      REAR: '',
      STIR: '',
      footer: '',
    },
    source: {
      span,
      fullSpan: span,
      FRNT: span,
      STIF: span,
      REAR: span,
      STIR: span,
      footer: span,
    },
    rack: input.rack ?? 0,
    direction: input.direction,
    operation: input.operation,
    carrier: input.carrier,
    speedRaw: '0300',
    speed: 300,
    rollerRaw: '0450',
    roller: 450,
    carriageStops: input.carriageStops,
    carrierStops: input.carrierStops ?? null,
    selections: {
      front: input.front ?? [],
      rear: input.rear ?? [],
    },
    actions: input.actions,
  }
}

const knit = selection('front', 2, '6', 6)
const tuck = selection('rear', 3, '7', 7)
const drop = selection('front', 4, '5', 5)
const xferSource = selection('front', 5, '4', 4)
const xferTarget = selection('rear', 4, '4', 4)
const splitSource = selection('rear', 6, '8', 8)
const splitTarget = selection('front', 5, '8', 8)

const trace: MachineTraceV1 = {
  schemaVersion: 1,
  sourceDocumentSchemaVersion: 1,
  profileId: 'kniterate-7gg-kcode',
  profileVersion: 1,
  dialect: 'knitout-vendor',
  rackCommands: [
    { index: 0, beforePassIndex: 0, valueRaw: '0', value: 0, source: { span, fullSpan: span } },
    { index: 1, beforePassIndex: 4, valueRaw: '4', value: 4, source: { span, fullSpan: span } },
    { index: 2, beforePassIndex: 4, valueRaw: '0', value: 0, source: { span, fullSpan: span } },
    { index: 3, beforePassIndex: 4, valueRaw: '1', value: 1, source: { span, fullSpan: span } },
    { index: 4, beforePassIndex: 5, valueRaw: '-1', value: -1, source: { span, fullSpan: span } },
  ],
  passes: [
    pass({
      index: 0,
      direction: '>>',
      operation: 'Kn-Kn',
      carrier: '0',
      carriageStops: { left: -2.5, right: 12.5 },
      actions: [{ kind: 'move', carrier: '0' }],
    }),
    pass({
      index: 1,
      direction: '<<',
      operation: 'Kn-Kn',
      carrier: '2',
      carriageStops: { left: -1.5, right: 11.5 },
      carrierStops: { left: -0.5, right: 10.5 },
      front: [knit],
      actions: [{ kind: 'knit', at: knit }],
    }),
    pass({
      index: 2,
      direction: '>>',
      operation: 'Kn-Tu',
      carrier: '3',
      carriageStops: { left: -0.5, right: 9.5 },
      carrierStops: { left: 0.5, right: 8.5 },
      rear: [tuck],
      actions: [{ kind: 'tuck', at: tuck }],
    }),
    pass({
      index: 3,
      direction: '<<',
      operation: 'Kn-Kn',
      carrier: '0',
      carriageStops: { left: -1.5, right: 8.5 },
      front: [drop],
      actions: [{ kind: 'drop', at: drop }],
    }),
    pass({
      index: 4,
      direction: '>>',
      operation: 'Tr-Rr',
      carrier: '0',
      rack: 1,
      carriageStops: { left: -2.5, right: 8.5 },
      front: [xferSource],
      rear: [xferTarget],
      actions: [{ kind: 'xfer', source: xferSource, target: xferTarget }],
    }),
    pass({
      index: 5,
      direction: '<<',
      operation: 'Rl-Tr',
      carrier: '2',
      rack: -1,
      carriageStops: { left: -0.5, right: 9.5 },
      carrierStops: { left: 0.5, right: 8.5 },
      front: [splitTarget],
      rear: [splitSource],
      actions: [{
        kind: 'split',
        source: splitSource,
        target: splitTarget,
        carrier: '2',
      }],
    }),
  ],
}

function compactSelection(selection: MachineSceneSelectionV1) {
  return [
    selection.bed,
    selection.kcodeColumn,
    selection.traceCoordinate,
    selection.stitchSelector.token,
    selection.stitchSelector.encodedValue,
  ]
}

function compactGlyph(glyph: MachineSceneActionGlyphV1) {
  switch (glyph.geometry) {
    case 'point':
      return ['point', glyph.semantic, ...compactSelection(glyph.at)]
    case 'edge':
      return [
        'edge',
        glyph.semantic,
        compactSelection(glyph.source),
        compactSelection(glyph.target),
        glyph.semantic === 'split' ? glyph.carrier : null,
      ]
    case 'travel':
      return [
        'travel',
        glyph.semantic,
        glyph.carrier,
        [
          glyph.movement.carriage.fromStopCoordinate,
          glyph.movement.carriage.toStopCoordinate,
        ],
        glyph.movement.carrierGuide === null
          ? null
          : [
              glyph.movement.carrierGuide.carrier,
              glyph.movement.carrierGuide.fromStopCoordinate,
              glyph.movement.carrierGuide.toStopCoordinate,
            ],
      ]
    case 'unknown':
      return [
        'unknown',
        glyph.operation,
        glyph.reason,
        glyph.selections.map(compactSelection),
      ]
  }
}

function compactPass(scenePass: MachineScenePassV1) {
  return {
    pass: scenePass.passIndex,
    direction: scenePass.direction,
    rack: scenePass.rack,
    carriage: [
      scenePass.movement.carriage.fromStopCoordinate,
      scenePass.movement.carriage.toStopCoordinate,
    ],
    guide: scenePass.movement.carrierGuide === null
      ? null
      : [
          scenePass.movement.carrierGuide.carrier,
          scenePass.movement.carrierGuide.fromStopCoordinate,
          scenePass.movement.carrierGuide.toStopCoordinate,
        ],
    front: scenePass.beds.front.map(compactSelection),
    rear: scenePass.beds.rear.map(compactSelection),
    glyphs: scenePass.actionGlyphs.map(compactGlyph),
  }
}

describe('MachineTraceV1 scene projection', () => {
  it('has a deterministic golden across movement, stitch, drop, and edge glyphs', () => {
    const scene = projectMachineScene(trace)

    expect(scene.rackCommands.map((command) => ({
      index: command.index,
      beforePassIndex: command.beforePassIndex,
      transition: [command.fromRack, command.toRack],
      raw: command.valueRaw,
    }))).toEqual([
      { index: 0, beforePassIndex: 0, transition: [0, 0], raw: '0' },
      { index: 1, beforePassIndex: 4, transition: [0, 4], raw: '4' },
      { index: 2, beforePassIndex: 4, transition: [4, 0], raw: '0' },
      { index: 3, beforePassIndex: 4, transition: [0, 1], raw: '1' },
      { index: 4, beforePassIndex: 5, transition: [1, -1], raw: '-1' },
    ])

    expect(scene.passes.map(compactPass)).toEqual([
      {
        pass: 0,
        direction: '>>',
        rack: 0,
        carriage: [-2.5, 12.5],
        guide: null,
        front: [],
        rear: [],
        glyphs: [['travel', 'move', '0', [-2.5, 12.5], null]],
      },
      {
        pass: 1,
        direction: '<<',
        rack: 0,
        carriage: [11.5, -1.5],
        guide: ['2', 10.5, -0.5],
        front: [['front', 2, 2, '6', 6]],
        rear: [],
        glyphs: [['point', 'knit', 'front', 2, 2, '6', 6]],
      },
      {
        pass: 2,
        direction: '>>',
        rack: 0,
        carriage: [-0.5, 9.5],
        guide: ['3', 0.5, 8.5],
        front: [],
        rear: [['rear', 3, 3, '7', 7]],
        glyphs: [['point', 'tuck', 'rear', 3, 3, '7', 7]],
      },
      {
        pass: 3,
        direction: '<<',
        rack: 0,
        carriage: [8.5, -1.5],
        guide: null,
        front: [['front', 4, 4, '5', 5]],
        rear: [],
        glyphs: [['point', 'drop', 'front', 4, 4, '5', 5]],
      },
      {
        pass: 4,
        direction: '>>',
        rack: 1,
        carriage: [-2.5, 8.5],
        guide: null,
        front: [['front', 5, 5, '4', 4]],
        rear: [['rear', 4, 4, '4', 4]],
        glyphs: [[
          'edge',
          'xfer',
          ['front', 5, 5, '4', 4],
          ['rear', 4, 4, '4', 4],
          null,
        ]],
      },
      {
        pass: 5,
        direction: '<<',
        rack: -1,
        carriage: [9.5, -0.5],
        guide: ['2', 8.5, 0.5],
        front: [['front', 5, 5, '8', 8]],
        rear: [['rear', 6, 6, '8', 8]],
        glyphs: [[
          'edge',
          'split',
          ['rear', 6, 6, '8', 8],
          ['front', 5, 5, '8', 8],
          '2',
        ]],
      },
    ])

    expect(scene).toMatchObject({
      schemaVersion: 1,
      sourceTraceSchemaVersion: 1,
      profileId: 'kniterate-7gg-kcode',
      profileVersion: 1,
      dialect: 'knitout-vendor',
      displayDomain: {
        kcodeCoordinate: { min: -2.5, max: 12.5 },
        traceCoordinate: { min: 2, max: 6 },
      },
    })
  })

  it('includes action-only coordinates in the display domain', () => {
    const actionOnly = selection('rear', 99, 'A', 10)
    const actionOnlyTrace: MachineTraceV1 = {
      ...trace,
      passes: [pass({
        index: 0,
        direction: '>>',
        operation: 'Future-Op',
        carrier: '0',
        carriageStops: { left: -0.5, right: 0.5 },
        actions: [{
          kind: 'unknown',
          operation: 'Future-Op',
          reason: 'unsupported-operation',
          selections: [actionOnly],
        }],
      })],
    }

    expect(projectMachineScene(actionOnlyTrace).displayDomain).toEqual({
      kcodeCoordinate: { min: -0.5, max: 99 },
      traceCoordinate: { min: 99, max: 99 },
    })
  })

  it('streams display bounds for blanket-scale action counts without spreading coordinates', () => {
    const actionOnly = selection('front', 120, '6', 6)
    const action = { kind: 'knit' as const, at: actionOnly }
    const blanketTrace: MachineTraceV1 = {
      ...trace,
      passes: [pass({
        index: 0,
        direction: '>>',
        operation: 'Kn-Kn',
        carrier: '2',
        carriageStops: { left: -0.5, right: 252.5 },
        carrierStops: { left: 0.5, right: 251.5 },
        actions: Array.from({ length: 130_000 }, () => action),
      })],
    }

    const scene = projectMachineScene(blanketTrace)
    expect(scene.displayDomain).toEqual({
      kcodeCoordinate: { min: -0.5, max: 252.5 },
      traceCoordinate: { min: 120, max: 120 },
    })
    expect(scene.passes[0]?.actionGlyphs).toHaveLength(130_000)
  })

  it('is pure, handles an empty trace honestly, and exposes no physical labels', () => {
    const before = structuredClone(trace)
    const scene = projectMachineScene(trace)
    expect(trace).toEqual(before)
    expect(JSON.stringify(scene)).not.toMatch(/physical|needle/i)

    expect(projectMachineScene({ ...trace, passes: [] })).toMatchObject({
      displayDomain: null,
      passes: [],
    })
  })
})
