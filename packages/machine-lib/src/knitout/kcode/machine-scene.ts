import type { KCodeCarrierToken } from './machine-profile.js'
import type {
  MachineTraceActionV1,
  MachineTraceBedV1,
  MachineTracePassV1,
  MachineTraceRackCommandV1,
  MachineTraceSelectionV1,
  MachineTraceV1,
} from './machine-trace.js'
import type { KCodeSourceSpan } from './types.js'

/** A selected raster column, expressed only in verified KCode/trace coordinates. */
export interface MachineSceneSelectionV1 {
  readonly bed: MachineTraceBedV1
  readonly payloadIndex: number
  /** Integer column in the marker-free KCode raster. */
  readonly kcodeColumn: number
  /** Dialect-normalized coordinate supplied by MachineTraceV1. */
  readonly traceCoordinate: number
  readonly stitchSelector: {
    readonly token: string
    /** Encoding-alphabet index; this is not a physical tension claim. */
    readonly encodedValue: number
  }
}

/** Directed travel between the exact half-step stops encoded by the pass. */
export interface MachineSceneTravelV1 {
  readonly fromStopCoordinate: number
  readonly toStopCoordinate: number
}

export interface MachineSceneMovementV1 {
  readonly carriage: MachineSceneTravelV1
  readonly carrierGuide: (MachineSceneTravelV1 & {
    readonly carrier: KCodeCarrierToken
  }) | null
}

/** Renderer-ready ordered rack command and its commanded transition. */
export interface MachineSceneRackCommandV1 {
  readonly index: number
  readonly beforePassIndex: number
  readonly fromRack: number
  readonly toRack: number
  readonly valueRaw: string
  readonly sourceSpan: KCodeSourceSpan
}

export type MachineSceneActionGlyphV1 =
  | {
      readonly geometry: 'point'
      readonly semantic: 'knit' | 'tuck' | 'drop'
      readonly at: MachineSceneSelectionV1
    }
  | {
      readonly geometry: 'edge'
      readonly semantic: 'xfer'
      readonly source: MachineSceneSelectionV1
      readonly target: MachineSceneSelectionV1
    }
  | {
      readonly geometry: 'edge'
      readonly semantic: 'split'
      readonly source: MachineSceneSelectionV1
      readonly target: MachineSceneSelectionV1
      readonly carrier: Exclude<KCodeCarrierToken, '0'>
    }
  | {
      readonly geometry: 'travel'
      readonly semantic: 'move'
      readonly carrier: KCodeCarrierToken
      readonly movement: MachineSceneMovementV1
    }
  | {
      readonly geometry: 'unknown'
      readonly semantic: 'unknown'
      readonly operation: string
      readonly reason:
        | 'unsupported-operation'
        | 'empty-transfer'
        | 'unpaired-transfer-selection'
        | 'operation-contract-carrier-action'
      readonly selections: readonly MachineSceneSelectionV1[]
    }

export interface MachineScenePassV1 {
  readonly passIndex: number
  readonly direction: '>>' | '<<'
  readonly operation: string
  readonly carrier: KCodeCarrierToken
  readonly rack: number
  readonly speed: {
    readonly raw: string
    readonly value: number
  }
  readonly roller: {
    readonly raw: string
    readonly value: number
  }
  readonly movement: MachineSceneMovementV1
  readonly beds: {
    readonly front: readonly MachineSceneSelectionV1[]
    readonly rear: readonly MachineSceneSelectionV1[]
  }
  readonly actionGlyphs: readonly MachineSceneActionGlyphV1[]
}

export interface MachineSceneDisplayDomainV1 {
  /**
   * Exact extent of programmed stop coordinates and selected KCode columns.
   * Half-step stop coordinates and integer raster columns share this axis.
   */
  readonly kcodeCoordinate: {
    readonly min: number
    readonly max: number
  }
  /** Exact extent of action/selection coordinates after dialect normalization. */
  readonly traceCoordinate: {
    readonly min: number
    readonly max: number
  } | null
}

export interface MachineSceneV1 {
  readonly schemaVersion: 1
  readonly sourceTraceSchemaVersion: 1
  readonly profileId: string
  readonly profileVersion: number
  readonly dialect: MachineTraceV1['dialect']
  /** Every programmed rack command, including transient and redundant moves. */
  readonly rackCommands: readonly MachineSceneRackCommandV1[]
  /** Null only when the source trace has no passes and therefore no program extent. */
  readonly displayDomain: MachineSceneDisplayDomainV1 | null
  readonly passes: readonly MachineScenePassV1[]
}

function projectRackCommands(
  commands: readonly MachineTraceRackCommandV1[],
): MachineSceneRackCommandV1[] {
  let currentRack = 0
  return commands.map((command) => {
    const projected = {
      index: command.index,
      beforePassIndex: command.beforePassIndex,
      fromRack: currentRack,
      toRack: command.value,
      valueRaw: command.valueRaw,
      sourceSpan: command.source.span,
    }
    currentRack = command.value
    return projected
  })
}

function projectSelection(
  selection: MachineTraceSelectionV1,
): MachineSceneSelectionV1 {
  return {
    bed: selection.bed,
    payloadIndex: selection.payloadIndex,
    kcodeColumn: selection.kcodeColumn,
    traceCoordinate: selection.traceCoordinate,
    stitchSelector: {
      token: selection.stitchSelector.token,
      encodedValue: selection.stitchSelector.encodedValue,
    },
  }
}

function directedTravel(
  stops: MachineTracePassV1['carriageStops'],
  direction: MachineTracePassV1['direction'],
): MachineSceneTravelV1 {
  return direction === '>>'
    ? {
        fromStopCoordinate: stops.left,
        toStopCoordinate: stops.right,
      }
    : {
        fromStopCoordinate: stops.right,
        toStopCoordinate: stops.left,
      }
}

function projectMovement(pass: MachineTracePassV1): MachineSceneMovementV1 {
  const carrierGuide = pass.carrierStops === null
    ? null
    : {
        carrier: pass.carrier,
        ...directedTravel(pass.carrierStops, pass.direction),
      }

  return {
    carriage: directedTravel(pass.carriageStops, pass.direction),
    carrierGuide,
  }
}

function projectAction(
  action: MachineTraceActionV1,
  movement: MachineSceneMovementV1,
): MachineSceneActionGlyphV1 {
  switch (action.kind) {
    case 'knit':
    case 'tuck':
    case 'drop':
      return {
        geometry: 'point',
        semantic: action.kind,
        at: projectSelection(action.at),
      }
    case 'xfer':
      return {
        geometry: 'edge',
        semantic: 'xfer',
        source: projectSelection(action.source),
        target: projectSelection(action.target),
      }
    case 'split':
      return {
        geometry: 'edge',
        semantic: 'split',
        source: projectSelection(action.source),
        target: projectSelection(action.target),
        carrier: action.carrier,
      }
    case 'move':
      return {
        geometry: 'travel',
        semantic: 'move',
        carrier: action.carrier,
        movement,
      }
    case 'unknown':
      return {
        geometry: 'unknown',
        semantic: 'unknown',
        operation: action.operation,
        reason: action.reason,
        selections: action.selections.map(projectSelection),
      }
  }
}

function projectPass(pass: MachineTracePassV1): MachineScenePassV1 {
  const movement = projectMovement(pass)
  return {
    passIndex: pass.index,
    direction: pass.direction,
    operation: pass.operation,
    carrier: pass.carrier,
    rack: pass.rack,
    speed: {
      raw: pass.speedRaw,
      value: pass.speed,
    },
    roller: {
      raw: pass.rollerRaw,
      value: pass.roller,
    },
    movement,
    beds: {
      front: pass.selections.front.map(projectSelection),
      rear: pass.selections.rear.map(projectSelection),
    },
    actionGlyphs: pass.actions.map((action) => projectAction(action, movement)),
  }
}

function pushActionCoordinates(
  action: MachineTraceActionV1,
  pushKCode: (coordinate: number) => void,
  pushTrace: (coordinate: number) => void,
): void {
  const pushSelection = (selection: MachineTraceSelectionV1): void => {
    pushKCode(selection.kcodeColumn)
    pushTrace(selection.traceCoordinate)
  }

  switch (action.kind) {
    case 'knit':
    case 'tuck':
    case 'drop':
      pushSelection(action.at)
      break
    case 'xfer':
    case 'split':
      pushSelection(action.source)
      pushSelection(action.target)
      break
    case 'unknown':
      action.selections.forEach(pushSelection)
      break
    case 'move':
      break
  }
}

function displayDomain(
  passes: readonly MachineTracePassV1[],
): MachineSceneDisplayDomainV1 | null {
  let kcodeMin = Infinity
  let kcodeMax = -Infinity
  let traceMin = Infinity
  let traceMax = -Infinity
  let kcodeCount = 0
  let traceCount = 0
  const pushKCode = (coordinate: number): void => {
    kcodeMin = Math.min(kcodeMin, coordinate)
    kcodeMax = Math.max(kcodeMax, coordinate)
    kcodeCount++
  }
  const pushTrace = (coordinate: number): void => {
    traceMin = Math.min(traceMin, coordinate)
    traceMax = Math.max(traceMax, coordinate)
    traceCount++
  }

  for (const pass of passes) {
    pushKCode(pass.carriageStops.left)
    pushKCode(pass.carriageStops.right)
    if (pass.carrierStops !== null) {
      pushKCode(pass.carrierStops.left)
      pushKCode(pass.carrierStops.right)
    }

    for (const selection of [
      ...pass.selections.front,
      ...pass.selections.rear,
    ]) {
      pushKCode(selection.kcodeColumn)
      pushTrace(selection.traceCoordinate)
    }
    for (const action of pass.actions) {
      pushActionCoordinates(action, pushKCode, pushTrace)
    }
  }

  if (kcodeCount === 0) return null
  return {
    kcodeCoordinate: {
      min: kcodeMin,
      max: kcodeMax,
    },
    traceCoordinate: traceCount === 0
      ? null
      : {
          min: traceMin,
          max: traceMax,
        },
  }
}

/**
 * Produce deterministic, renderer-ready program truth from MachineTraceV1.
 *
 * This projection has no pixels, layout, validator state, or inferred physical
 * numbering. A UI may select any returned pass and render its carriage, guide,
 * beds, and action glyphs in lockstep over the stable display domain.
 */
export function projectMachineScene(trace: MachineTraceV1): MachineSceneV1 {
  return {
    schemaVersion: 1,
    sourceTraceSchemaVersion: trace.schemaVersion,
    profileId: trace.profileId,
    profileVersion: trace.profileVersion,
    dialect: trace.dialect,
    rackCommands: projectRackCommands(trace.rackCommands),
    displayDomain: displayDomain(trace.passes),
    passes: trace.passes.map(projectPass),
  }
}
