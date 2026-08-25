import { describe, expect, it } from 'vitest'

import {
  KNITERATE_7GG_KCODE_PROFILE_V1,
} from '../../src/knitout/kcode/machine-profile.js'
import {
  projectKCodeMachineTrace,
  type MachineTraceActionV1,
  type MachineTracePassV1,
} from '../../src/knitout/kcode/machine-trace.js'
import {
  validateKCodeMachineTrace,
} from '../../src/knitout/kcode/machine-validator.js'
import { parseKCodeDocument } from '../../src/knitout/kcode/parser.js'

/**
 * This file is intentionally a small, test-only second implementation of the
 * KCode wire contract. It does not import or call the production projector or
 * validator when deriving expected passes, actions, or loop state.
 */

type Bed = 'front' | 'rear'
type Direction = '>>' | '<<'
type Carrier = '0' | '2'

interface PassSpec {
  readonly rack: number
  readonly direction: Direction
  readonly operation: string
  readonly carrier: Carrier
  readonly speed: number
  readonly roller: number
  readonly stitch: string
  readonly front: readonly number[]
  readonly rear: readonly number[]
}

interface ReferenceSelection {
  readonly bed: Bed
  readonly payloadIndex: number
  readonly kcodeColumn: number
  readonly traceCoordinate: number
  readonly stitchSelector: {
    readonly token: string
    readonly encodedValue: number
  }
}

type ReferenceAction =
  | { readonly kind: 'knit' | 'tuck' | 'drop'; readonly at: ReferenceSelection }
  | {
      readonly kind: 'xfer'
      readonly source: ReferenceSelection
      readonly target: ReferenceSelection
    }
  | {
      readonly kind: 'split'
      readonly source: ReferenceSelection
      readonly target: ReferenceSelection
      readonly carrier: '2'
    }
  | { readonly kind: 'move'; readonly carrier: Carrier }
  | {
      readonly kind: 'unknown'
      readonly operation: string
      readonly reason: 'empty-transfer' | 'unpaired-transfer-selection'
      readonly selections: readonly ReferenceSelection[]
    }

interface ReferencePass {
  readonly index: number
  readonly raw: {
    readonly FRNT: string
    readonly STIF: string
    readonly REAR: string
    readonly STIR: string
    readonly footer: string
  }
  readonly rack: number
  readonly direction: Direction
  readonly operation: string
  readonly carrier: Carrier
  readonly speedRaw: string
  readonly speed: number
  readonly rollerRaw: string
  readonly roller: number
  readonly carriageStops: { readonly left: number; readonly right: number }
  readonly carrierStops: { readonly left: number; readonly right: number } | null
  readonly selections: {
    readonly front: readonly ReferenceSelection[]
    readonly rear: readonly ReferenceSelection[]
  }
  readonly actions: readonly ReferenceAction[]
}

interface ReferenceSnapshot {
  readonly stacks: Readonly<Record<string, number>>
  readonly front: readonly { readonly bed: 'front'; readonly traceCoordinate: number; readonly count: number }[]
  readonly rear: readonly { readonly bed: 'rear'; readonly traceCoordinate: number; readonly count: number }[]
  readonly occupiedNeedles: number
  readonly totalLoops: number
  readonly maxStack: number
}

interface ReferenceMetrics {
  readonly occupiedNeedles: number
  readonly totalLoops: number
  readonly maxStack: number
}

interface ReferenceStackDelta {
  readonly bed: Bed
  readonly traceCoordinate: number
  readonly beforeCount: number
  readonly afterCount: number
}

interface ReferenceReplay {
  readonly passStates: readonly {
    readonly passIndex: number
    readonly before: ReferenceMetrics
    readonly after: ReferenceMetrics
    readonly stackDeltas: readonly ReferenceStackDelta[]
  }[]
  readonly finalState: ReferenceSnapshot
  readonly errors: readonly {
    readonly passIndex: number
    readonly actionIndex: number
    readonly code: 'drop-empty' | 'transfer-source-empty' | 'unknown-action'
  }[]
  readonly stackPolicy: readonly {
    readonly passIndex: number
    readonly actionIndex: number
    readonly severity: 'warning' | 'error'
  }[]
}

const PADDING = 15
const NEEDLE_COLUMNS = 253
const BASE_WIDTH = PADDING + NEEDLE_COLUMNS + PADDING
const STITCH_ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ'
const CARRIAGE_MARKERS = { left: -5.5, right: 257.5 } as const
const CARRIER_MARKERS = { left: 29.5, right: 219.5 } as const

function baseBed(selected: readonly number[]): string {
  const needles = Array.from({ length: NEEDLE_COLUMNS }, () => '_')
  for (const coordinate of selected) {
    if (!Number.isInteger(coordinate) || coordinate < 0 || coordinate >= NEEDLE_COLUMNS) {
      throw new Error(`Reference generator needle ${coordinate} is outside 0..252`)
    }
    needles[coordinate] = '-'
  }
  return '.'.repeat(PADDING) + needles.join('') + '.'.repeat(PADDING)
}

function markerBaseIndex(stop: number): number {
  return stop + PADDING + 0.5
}

function decorateBed(base: string, carrier: Carrier): string {
  const markers: readonly (readonly [number, string])[] = carrier === '0'
    ? [
        [markerBaseIndex(CARRIAGE_MARKERS.left), '/'],
        [markerBaseIndex(CARRIAGE_MARKERS.right), '\\'],
      ]
    : [
        [markerBaseIndex(CARRIAGE_MARKERS.left), '/'],
        [markerBaseIndex(CARRIER_MARKERS.left), carrier],
        [markerBaseIndex(CARRIER_MARKERS.right), carrier],
        [markerBaseIndex(CARRIAGE_MARKERS.right), '\\'],
      ]

  let output = ''
  let markerIndex = 0
  for (let baseIndex = 0; baseIndex <= base.length; baseIndex++) {
    while (markers[markerIndex]?.[0] === baseIndex) {
      output += markers[markerIndex]![1]
      markerIndex++
    }
    if (baseIndex < base.length) output += base[baseIndex]
  }
  if (markerIndex !== markers.length) throw new Error('Reference marker fell outside the raster')
  return output
}

function renderDocument(specs: readonly PassSpec[]): string {
  const lines = ['HOME', 'RACK:0', '// independent reference oracle fixture']
  let rack = 0
  for (const spec of specs) {
    if (spec.rack !== rack) {
      lines.push(`RACK:${spec.rack}`)
      rack = spec.rack
    }
    const front = baseBed(spec.front)
    const rear = baseBed(spec.rear)
    lines.push(
      `FRNT:${decorateBed(front, spec.carrier)}`,
      `STIF:${spec.stitch.repeat(BASE_WIDTH)}`,
      `REAR:${decorateBed(rear, spec.carrier)}`,
      `STIR:${spec.stitch.repeat(BASE_WIDTH)}`,
      `${spec.direction} ${spec.operation} ${spec.carrier} ${spec.speed} ${spec.roller}`,
    )
  }
  return `${lines.join('\n')}\n`
}

interface DecodedBed {
  readonly base: string
  readonly markerCoordinates: readonly number[]
}

function decodeBed(value: string, carrier: Carrier): DecodedBed {
  const base: string[] = []
  const markerTokens: string[] = []
  const markerCoordinates: number[] = []
  for (const token of value) {
    if (token === '/' || token === '\\' || /[1-6]/.test(token)) {
      markerTokens.push(token)
      markerCoordinates.push(base.length - PADDING - 0.5)
    } else {
      base.push(token)
    }
  }
  const expected = carrier === '0' ? ['/', '\\'] : ['/', carrier, carrier, '\\']
  if (markerTokens.join('|') !== expected.join('|')) {
    throw new Error(`Reference decoder received markers ${markerTokens.join('')} for carrier ${carrier}`)
  }
  return { base: base.join(''), markerCoordinates }
}

function referenceSelections(
  bed: Bed,
  decoded: DecodedBed,
  stitch: string,
): ReferenceSelection[] {
  if (decoded.base.length !== stitch.length) throw new Error('Reference bed/stitch width mismatch')
  const output: ReferenceSelection[] = []
  for (let payloadIndex = 0; payloadIndex < decoded.base.length; payloadIndex++) {
    if (decoded.base[payloadIndex] !== '-') continue
    const token = stitch[payloadIndex]!
    const encodedValue = STITCH_ALPHABET.indexOf(token)
    if (encodedValue < 0) throw new Error(`Reference decoder cannot decode stitch ${token}`)
    const coordinate = payloadIndex - PADDING
    output.push({
      bed,
      payloadIndex,
      kcodeColumn: coordinate,
      traceCoordinate: coordinate,
      stitchSelector: { token, encodedValue },
    })
  }
  return output
}

function ordered(
  selections: readonly ReferenceSelection[],
  direction: Direction,
): ReferenceSelection[] {
  return [...selections].sort((left, right) => {
    const coordinateOrder = left.traceCoordinate - right.traceCoordinate
    const bedOrder = left.bed === right.bed ? 0 : left.bed === 'front' ? -1 : 1
    return direction === '>>'
      ? coordinateOrder || bedOrder
      : -coordinateOrder || bedOrder
  })
}

function referenceActions(
  operation: string,
  carrier: Carrier,
  rack: number,
  direction: Direction,
  front: readonly ReferenceSelection[],
  rear: readonly ReferenceSelection[],
): ReferenceAction[] {
  const regular = /^(Kn|Tu)-(Kn|Tu)$/.exec(operation)
  if (regular !== null) {
    const selections = ordered([...front, ...rear], direction)
    if (selections.length === 0) return [{ kind: 'move', carrier }]
    if (carrier === '0') return selections.map((at) => ({ kind: 'drop', at }))
    return selections.map((at) => ({
      kind: at.bed === 'front'
        ? regular[1] === 'Kn' ? 'knit' : 'tuck'
        : regular[2] === 'Kn' ? 'knit' : 'tuck',
      at,
    }))
  }

  const frontToRear = /^Tr-R[lr]$/.test(operation)
  const rearToFront = /^R[lr]-Tr$/.test(operation)
  if (!frontToRear && !rearToFront) throw new Error(`Unsupported reference operation ${operation}`)
  const sources = ordered(frontToRear ? front : rear, direction)
  const targets = [...(frontToRear ? rear : front)]
  if (sources.length === 0 && targets.length === 0) {
    return [{ kind: 'unknown', operation, reason: 'empty-transfer', selections: [] }]
  }

  const actions: ReferenceAction[] = []
  for (const source of sources) {
    const targetCoordinate = source.traceCoordinate + (frontToRear ? -rack : rack)
    const targetIndex = targets.findIndex(
      (target) => target.traceCoordinate === targetCoordinate,
    )
    if (targetIndex < 0) {
      actions.push({
        kind: 'unknown',
        operation,
        reason: 'unpaired-transfer-selection',
        selections: [source],
      })
      continue
    }
    const target = targets.splice(targetIndex, 1)[0]!
    actions.push(carrier === '0'
      ? { kind: 'xfer', source, target }
      : { kind: 'split', source, target, carrier })
  }
  for (const target of targets) {
    actions.push({
      kind: 'unknown',
      operation,
      reason: 'unpaired-transfer-selection',
      selections: [target],
    })
  }
  return actions
}

function decodeReferenceDocument(source: string): ReferencePass[] {
  const lines = source.split(/\r?\n/)
  let rack = 0
  const passes: ReferencePass[] = []
  for (let index = 0; index < lines.length;) {
    const line = lines[index]!
    if (line === '' || line === 'HOME' || line.startsWith('//')) {
      index++
      continue
    }
    if (line.startsWith('RACK:')) {
      rack = Number(line.slice(5))
      index++
      continue
    }
    if (!line.startsWith('FRNT:')) throw new Error(`Reference decoder expected FRNT, received ${line}`)

    const frnt = line.slice(5)
    const stifLine = lines[index + 1]!
    const rearLine = lines[index + 2]!
    const stirLine = lines[index + 3]!
    const footer = lines[index + 4]!
    if (!stifLine.startsWith('STIF:') || !rearLine.startsWith('REAR:') || !stirLine.startsWith('STIR:')) {
      throw new Error('Reference decoder received an incomplete pass')
    }
    const stif = stifLine.slice(5)
    const rear = rearLine.slice(5)
    const stir = stirLine.slice(5)
    const footerTokens = footer.split(' ')
    if (footerTokens.length !== 5) throw new Error(`Reference footer arity ${footerTokens.length}`)
    const direction = footerTokens[0] as Direction
    const operation = footerTokens[1]!
    const carrier = footerTokens[2] as Carrier
    const speedRaw = footerTokens[3]!
    const rollerRaw = footerTokens[4]!
    const frontDecoded = decodeBed(frnt, carrier)
    const rearDecoded = decodeBed(rear, carrier)
    if (frontDecoded.markerCoordinates.join('|') !== rearDecoded.markerCoordinates.join('|')) {
      throw new Error('Reference front/rear markers differ')
    }
    const front = referenceSelections('front', frontDecoded, stif)
    const rearSelections = referenceSelections('rear', rearDecoded, stir)
    const markerCoordinates = frontDecoded.markerCoordinates
    const carriageStops = carrier === '0'
      ? { left: markerCoordinates[0]!, right: markerCoordinates[1]! }
      : { left: markerCoordinates[0]!, right: markerCoordinates[3]! }
    const carrierStops = carrier === '0'
      ? null
      : { left: markerCoordinates[1]!, right: markerCoordinates[2]! }

    passes.push({
      index: passes.length,
      raw: { FRNT: frnt, STIF: stif, REAR: rear, STIR: stir, footer },
      rack,
      direction,
      operation,
      carrier,
      speedRaw,
      speed: Number(speedRaw),
      rollerRaw,
      roller: Number(rollerRaw),
      carriageStops,
      carrierStops,
      selections: { front, rear: rearSelections },
      actions: referenceActions(
        operation,
        carrier,
        rack,
        direction,
        front,
        rearSelections,
      ),
    })
    index += 5
  }
  return passes
}

function stackKey(bed: Bed, coordinate: number): string {
  return `${bed}:${coordinate}`
}

function referenceMetrics(state: ReadonlyMap<string, number>): ReferenceMetrics {
  const counts = [...state.values()].filter((count) => count > 0)
  return {
    occupiedNeedles: counts.length,
    totalLoops: counts.reduce((total, count) => total + count, 0),
    maxStack: counts.reduce((maximum, count) => Math.max(maximum, count), 0),
  }
}

function referenceActionSelections(action: ReferenceAction): readonly ReferenceSelection[] {
  switch (action.kind) {
    case 'knit':
    case 'tuck':
    case 'drop':
      return [action.at]
    case 'xfer':
    case 'split':
      return [action.source, action.target]
    case 'unknown':
      return action.selections
    case 'move':
      return []
  }
}

function referenceTouchedCoordinates(
  actions: readonly ReferenceAction[],
): Array<Pick<ReferenceSelection, 'bed' | 'traceCoordinate'>> {
  const coordinates = new Map<string, Pick<
    ReferenceSelection,
    'bed' | 'traceCoordinate'
  >>()
  for (const action of actions) {
    for (const selection of referenceActionSelections(action)) {
      coordinates.set(stackKey(selection.bed, selection.traceCoordinate), {
        bed: selection.bed,
        traceCoordinate: selection.traceCoordinate,
      })
    }
  }
  return [...coordinates.values()].sort((left, right) =>
    (left.bed === right.bed ? 0 : left.bed === 'front' ? -1 : 1)
    || left.traceCoordinate - right.traceCoordinate)
}

function referenceSnapshot(state: ReadonlyMap<string, number>): ReferenceSnapshot {
  const cells = [...state]
    .filter(([, count]) => count > 0)
    .map(([key, count]) => {
      const [bed, coordinate] = key.split(':')
      return { bed: bed as Bed, traceCoordinate: Number(coordinate), count }
    })
    .sort((left, right) =>
      (left.bed === right.bed ? 0 : left.bed === 'front' ? -1 : 1)
      || left.traceCoordinate - right.traceCoordinate)
  const stacks: Record<string, number> = {}
  for (const cell of cells) stacks[stackKey(cell.bed, cell.traceCoordinate)] = cell.count
  return {
    stacks,
    front: cells.filter((cell): cell is typeof cell & { bed: 'front' } => cell.bed === 'front'),
    rear: cells.filter((cell): cell is typeof cell & { bed: 'rear' } => cell.bed === 'rear'),
    ...referenceMetrics(state),
  }
}

function replayReference(passes: readonly ReferencePass[]): ReferenceReplay {
  const state = new Map<string, number>()
  const errors: ReferenceReplay['errors'][number][] = []
  const stackPolicy: ReferenceReplay['stackPolicy'][number][] = []
  const passStates: ReferenceReplay['passStates'][number][] = []
  const checkStackPolicy = (
    count: number,
    passIndex: number,
    actionIndex: number,
  ): void => {
    if (count > 3) stackPolicy.push({ passIndex, actionIndex, severity: 'error' })
    else if (count > 2) stackPolicy.push({ passIndex, actionIndex, severity: 'warning' })
  }
  for (const pass of passes) {
    const touchedCoordinates = referenceTouchedCoordinates(pass.actions)
    const beforeCounts = new Map(touchedCoordinates.map((coordinate) => [
      stackKey(coordinate.bed, coordinate.traceCoordinate),
      state.get(stackKey(coordinate.bed, coordinate.traceCoordinate)) ?? 0,
    ]))
    const before = referenceMetrics(state)
    for (const [actionIndex, action] of pass.actions.entries()) {
      switch (action.kind) {
        case 'knit':
          state.set(stackKey(action.at.bed, action.at.traceCoordinate), 1)
          break
        case 'tuck': {
          const key = stackKey(action.at.bed, action.at.traceCoordinate)
          const count = (state.get(key) ?? 0) + 1
          state.set(key, count)
          checkStackPolicy(count, pass.index, actionIndex)
          break
        }
        case 'drop': {
          const key = stackKey(action.at.bed, action.at.traceCoordinate)
          if ((state.get(key) ?? 0) === 0) {
            errors.push({ passIndex: pass.index, actionIndex, code: 'drop-empty' })
          } else {
            state.delete(key)
          }
          break
        }
        case 'xfer':
        case 'split': {
          const sourceKey = stackKey(action.source.bed, action.source.traceCoordinate)
          const targetKey = stackKey(action.target.bed, action.target.traceCoordinate)
          const sourceCount = state.get(sourceKey) ?? 0
          if (sourceCount === 0) {
            errors.push({ passIndex: pass.index, actionIndex, code: 'transfer-source-empty' })
          } else {
            const targetCount = (state.get(targetKey) ?? 0) + sourceCount
            state.set(targetKey, targetCount)
            if (action.kind === 'split') state.set(sourceKey, 1)
            else state.delete(sourceKey)
            checkStackPolicy(targetCount, pass.index, actionIndex)
          }
          break
        }
        case 'unknown':
          errors.push({ passIndex: pass.index, actionIndex, code: 'unknown-action' })
          break
        case 'move':
          break
      }
    }
    passStates.push({
      passIndex: pass.index,
      before,
      after: referenceMetrics(state),
      stackDeltas: touchedCoordinates.map((coordinate) => ({
        bed: coordinate.bed,
        traceCoordinate: coordinate.traceCoordinate,
        beforeCount: beforeCounts.get(
          stackKey(coordinate.bed, coordinate.traceCoordinate),
        ) ?? 0,
        afterCount: state.get(
          stackKey(coordinate.bed, coordinate.traceCoordinate),
        ) ?? 0,
      })),
    })
  }
  return { passStates, finalState: referenceSnapshot(state), errors, stackPolicy }
}

function normalizeAction(action: MachineTraceActionV1): ReferenceAction {
  const selection = (value: MachineTracePassV1['selections']['front'][number]): ReferenceSelection => ({
    bed: value.bed,
    payloadIndex: value.payloadIndex,
    kcodeColumn: value.kcodeColumn,
    traceCoordinate: value.traceCoordinate,
    stitchSelector: {
      token: value.stitchSelector.token,
      encodedValue: value.stitchSelector.encodedValue,
    },
  })
  switch (action.kind) {
    case 'knit':
    case 'tuck':
    case 'drop':
      return { kind: action.kind, at: selection(action.at) }
    case 'xfer':
      return { kind: 'xfer', source: selection(action.source), target: selection(action.target) }
    case 'split':
      return {
        kind: 'split',
        source: selection(action.source),
        target: selection(action.target),
        carrier: action.carrier as '2',
      }
    case 'move':
      return { kind: 'move', carrier: action.carrier as Carrier }
    case 'unknown':
      return {
        kind: 'unknown',
        operation: action.operation,
        reason: action.reason as 'empty-transfer' | 'unpaired-transfer-selection',
        selections: action.selections.map(selection),
      }
  }
}

function normalizePass(pass: MachineTracePassV1): ReferencePass {
  const normalizeSelection = (
    selection: MachineTracePassV1['selections']['front'][number],
  ): ReferenceSelection => ({
    bed: selection.bed,
    payloadIndex: selection.payloadIndex,
    kcodeColumn: selection.kcodeColumn,
    traceCoordinate: selection.traceCoordinate,
    stitchSelector: {
      token: selection.stitchSelector.token,
      encodedValue: selection.stitchSelector.encodedValue,
    },
  })
  return {
    index: pass.index,
    raw: pass.raw,
    rack: pass.rack,
    direction: pass.direction,
    operation: pass.operation,
    carrier: pass.carrier as Carrier,
    speedRaw: pass.speedRaw,
    speed: pass.speed,
    rollerRaw: pass.rollerRaw,
    roller: pass.roller,
    carriageStops: pass.carriageStops,
    carrierStops: pass.carrierStops,
    selections: {
      front: pass.selections.front.map(normalizeSelection),
      rear: pass.selections.rear.map(normalizeSelection),
    },
    actions: pass.actions.map(normalizeAction),
  }
}

function xorshift32(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state ^= state << 13
    state ^= state >>> 17
    state ^= state << 5
    return state >>> 0
  }
}

function pass(
  index: number,
  values: Pick<PassSpec, 'rack' | 'operation' | 'carrier' | 'front' | 'rear'>,
  random: () => number,
): PassSpec {
  return {
    ...values,
    direction: index % 2 === 0 ? '>>' : '<<',
    speed: 60 + random() % 641,
    roller: random() % 601,
    stitch: STITCH_ALPHABET[random() % 16]!,
  }
}

function generatedSpecs(seed: number, blocks = 6): PassSpec[] {
  const random = xorshift32(seed)
  const coordinate = 70 + random() % 100
  const specs: PassSpec[] = []
  const append = (
    values: Pick<PassSpec, 'rack' | 'operation' | 'carrier' | 'front' | 'rear'>,
  ): void => {
    specs.push(pass(specs.length, values, random))
  }

  for (let block = 0; block < blocks; block++) {
    // Transfers connect integer raster columns, so generated transfer probes
    // use the profile's integer rack subset. Half-rack passes are covered by
    // the scheduled-pass differential rail without inventing a half-column.
    const rack = random() % 5 - 2
    const rearCoordinate = coordinate - rack
    const variant = block === 0 ? 0 : random() % 4
    if (variant === 0) {
      append({ rack: 0, operation: 'Kn-Kn', carrier: '2', front: [coordinate], rear: [] })
      append({ rack: 0, operation: 'Tu-Tu', carrier: '2', front: [coordinate], rear: [] })
      append({ rack, operation: 'Tr-Rr', carrier: '0', front: [coordinate], rear: [rearCoordinate] })
      append({ rack, operation: 'Rl-Tr', carrier: '0', front: [coordinate], rear: [rearCoordinate] })
    } else if (variant === 1) {
      append({ rack, operation: 'Tr-Rr', carrier: '2', front: [coordinate], rear: [rearCoordinate] })
      append({ rack: 0, operation: 'Kn-Kn', carrier: '2', front: [], rear: [rearCoordinate] })
      append({ rack: 0, operation: 'Kn-Kn', carrier: '0', front: [coordinate], rear: [] })
      append({ rack, operation: 'Rl-Tr', carrier: '0', front: [coordinate], rear: [rearCoordinate] })
    } else if (variant === 2) {
      append({ rack: 0, operation: 'Tu-Tu', carrier: '2', front: [coordinate], rear: [] })
      append({ rack, operation: 'Tr-Rl', carrier: '2', front: [coordinate], rear: [rearCoordinate] })
      append({ rack: 0, operation: 'Kn-Kn', carrier: '0', front: [], rear: [rearCoordinate] })
      append({ rack: 0, operation: 'Kn-Kn', carrier: '0', front: [], rear: [] })
    } else {
      const otherRear = coordinate + 8
      append({ rack: 0, operation: 'Kn-Tu', carrier: '2', front: [coordinate], rear: [otherRear] })
      append({ rack: 0, operation: 'Tu-Kn', carrier: '2', front: [coordinate], rear: [otherRear] })
      append({ rack, operation: 'Rr-Tr', carrier: '0', front: [otherRear + rack], rear: [otherRear] })
      append({ rack: 0, operation: 'Kn-Kn', carrier: '0', front: [otherRear + rack], rear: [] })
    }
  }
  return specs
}

function parseProjectValidate(source: string) {
  const parsed = parseKCodeDocument(source, {
    profile: KNITERATE_7GG_KCODE_PROFILE_V1,
    dialect: 'knitout-vendor',
    strict: true,
  })
  expect(parsed.diagnostics).toEqual([])
  expect(parsed.ok).toBe(true)
  const trace = projectKCodeMachineTrace(parsed.document, KNITERATE_7GG_KCODE_PROFILE_V1)
  const report = validateKCodeMachineTrace(trace, KNITERATE_7GG_KCODE_PROFILE_V1)
  return { trace, report }
}

function replaceSelectionOnPass(
  source: string,
  passIndex: number,
  bed: 'FRNT' | 'REAR',
): string {
  const lines = source.split('\n')
  let seen = -1
  for (let index = 0; index < lines.length; index++) {
    if (!lines[index]!.startsWith('FRNT:')) continue
    seen++
    if (seen !== passIndex) continue
    const targetIndex = bed === 'FRNT' ? index : index + 2
    lines[targetIndex] = lines[targetIndex]!.replace('-', '_')
    return lines.join('\n')
  }
  throw new Error(`Pass ${passIndex} was not found`)
}

describe('independent KCode decoder and loop-state oracle', () => {
  it('matches production trace and state for 24 deterministic generated programs', () => {
    for (let caseIndex = 0; caseIndex < 24; caseIndex++) {
      const source = renderDocument(generatedSpecs(0x4f524143 ^ caseIndex))
      const expectedPasses = decodeReferenceDocument(source)
      const expectedReplay = replayReference(expectedPasses)
      const { trace, report } = parseProjectValidate(source)
      const actualStackPolicy = report.diagnostics
        .filter((diagnostic) => diagnostic.rule === 'machine-trace.loop-stack-policy')
        .map((diagnostic) => ({
          passIndex: diagnostic.passIndex,
          actionIndex: diagnostic.actionIndex,
          severity: diagnostic.severity,
        }))

      expect(trace.passes.map(normalizePass), `trace case ${caseIndex}`).toEqual(expectedPasses)
      expect(expectedReplay.errors, `reference errors case ${caseIndex}`).toEqual([])
      expect(
        report.diagnostics.filter((diagnostic) => diagnostic.rule !== 'machine-trace.loop-stack-policy'),
        `non-policy diagnostics case ${caseIndex}`,
      ).toEqual([])
      expect(actualStackPolicy, `stack policy case ${caseIndex}`).toEqual(expectedReplay.stackPolicy)
      expect(report.ok, `production validation case ${caseIndex}`).toBe(
        !expectedReplay.stackPolicy.some((diagnostic) => diagnostic.severity === 'error'),
      )
      expect(report.passStates, `pass states case ${caseIndex}`).toEqual(expectedReplay.passStates)
      expect(report.finalState, `final state case ${caseIndex}`).toEqual(expectedReplay.finalState)
    }
  }, 20_000)

  it('detects empty-transfer and empty-drop mutations without losing strict syntax', () => {
    const knitThenXfer = renderDocument([
      {
        rack: 0,
        direction: '>>',
        operation: 'Kn-Kn',
        carrier: '2',
        speed: 300,
        roller: 100,
        stitch: '5',
        front: [100],
        rear: [],
      },
      {
        rack: 0,
        direction: '<<',
        operation: 'Tr-Rl',
        carrier: '0',
        speed: 300,
        roller: 0,
        stitch: '5',
        front: [100],
        rear: [100],
      },
    ])
    const sourceEmpty = replaceSelectionOnPass(knitThenXfer, 0, 'FRNT')
    const sourceEmptyReference = replayReference(decodeReferenceDocument(sourceEmpty))
    const sourceEmptyProduction = parseProjectValidate(sourceEmpty)
    expect(sourceEmptyReference.errors).toContainEqual({
      passIndex: 1,
      actionIndex: 0,
      code: 'transfer-source-empty',
    })
    expect(sourceEmptyProduction.report.diagnostics).toContainEqual(expect.objectContaining({
      passIndex: 1,
      actionIndex: 0,
      rule: 'machine-trace.transfer-source-empty',
    }))

    let noSelection = replaceSelectionOnPass(knitThenXfer, 1, 'FRNT')
    noSelection = replaceSelectionOnPass(noSelection, 1, 'REAR')
    const noSelectionExpected = decodeReferenceDocument(noSelection)
    const noSelectionReference = replayReference(noSelectionExpected)
    const noSelectionProduction = parseProjectValidate(noSelection)
    expect(noSelectionExpected[1]!.actions).toEqual([{
      kind: 'unknown',
      operation: 'Tr-Rl',
      reason: 'empty-transfer',
      selections: [],
    }])
    expect(noSelectionReference.errors).toContainEqual({
      passIndex: 1,
      actionIndex: 0,
      code: 'unknown-action',
    })
    expect(noSelectionProduction.report.diagnostics).toContainEqual(expect.objectContaining({
      passIndex: 1,
      actionIndex: 0,
      rule: 'machine-trace.unknown-action',
    }))

    const knitThenDrop = renderDocument([
      {
        rack: 0,
        direction: '>>',
        operation: 'Kn-Kn',
        carrier: '2',
        speed: 300,
        roller: 100,
        stitch: '5',
        front: [100],
        rear: [],
      },
      {
        rack: 0,
        direction: '<<',
        operation: 'Kn-Kn',
        carrier: '0',
        speed: 300,
        roller: 0,
        stitch: '5',
        front: [100],
        rear: [],
      },
    ])
    const emptyDrop = replaceSelectionOnPass(knitThenDrop, 0, 'FRNT')
    const emptyDropReference = replayReference(decodeReferenceDocument(emptyDrop))
    const emptyDropProduction = parseProjectValidate(emptyDrop)
    expect(emptyDropReference.errors).toContainEqual({
      passIndex: 1,
      actionIndex: 0,
      code: 'drop-empty',
    })
    expect(emptyDropProduction.report.diagnostics).toContainEqual(expect.objectContaining({
      passIndex: 1,
      actionIndex: 0,
      rule: 'machine-trace.drop-empty',
    }))
  })

  it('blocks a transfer opcode whose suffix contradicts the footer direction', () => {
    const valid = renderDocument([
      {
        rack: 0,
        direction: '>>',
        operation: 'Kn-Kn',
        carrier: '2',
        speed: 300,
        roller: 100,
        stitch: '5',
        front: [100],
        rear: [],
      },
      {
        rack: 0,
        direction: '<<',
        operation: 'Tr-Rl',
        carrier: '0',
        speed: 300,
        roller: 0,
        stitch: '5',
        front: [100],
        rear: [100],
      },
    ])
    const contradictory = valid.replace('<< Tr-Rl 0 300 0', '<< Tr-Rr 0 300 0')
    const { trace, report } = parseProjectValidate(contradictory)

    expect(trace.passes[1]).toMatchObject({
      direction: '<<',
      operation: 'Tr-Rr',
    })
    expect(report.ok).toBe(false)
    expect(report.diagnostics).toContainEqual(expect.objectContaining({
      severity: 'error',
      class: 'kinematic',
      rule: 'machine-trace.transfer-operation-direction',
      passIndex: 1,
      sourceSpan: trace.passes[1]!.source.footer,
    }))
  })

  it('exhaustively agrees on all 1,296 depth-four small action sequences', () => {
    type Token = 'K' | 'T' | 'D' | 'X' | 'S' | 'Y'
    const alphabet: readonly Token[] = ['K', 'T', 'D', 'X', 'S', 'Y']
    let sequences: Token[][] = [[]]
    for (let depth = 0; depth < 4; depth++) {
      sequences = sequences.flatMap((sequence) =>
        alphabet.map((token) => [...sequence, token]))
    }
    expect(sequences).toHaveLength(1_296)

    const specFor = (token: Token, index: number): PassSpec => {
      const shared = {
        rack: 0,
        direction: (index % 2 === 0 ? '>>' : '<<') as Direction,
        speed: 300,
        roller: 0,
        stitch: '5',
      }
      switch (token) {
        case 'K': return { ...shared, operation: 'Kn-Kn', carrier: '2', front: [100], rear: [] }
        case 'T': return { ...shared, operation: 'Tu-Tu', carrier: '2', front: [100], rear: [] }
        case 'D': return { ...shared, operation: 'Kn-Kn', carrier: '0', front: [100], rear: [] }
        case 'X': return {
          ...shared,
          operation: shared.direction === '>>' ? 'Tr-Rr' : 'Tr-Rl',
          carrier: '0',
          front: [100],
          rear: [100],
        }
        case 'S': return {
          ...shared,
          operation: shared.direction === '>>' ? 'Tr-Rr' : 'Tr-Rl',
          carrier: '2',
          front: [100],
          rear: [100],
        }
        case 'Y': return {
          ...shared,
          operation: shared.direction === '>>' ? 'Rr-Tr' : 'Rl-Tr',
          carrier: '0',
          front: [100],
          rear: [100],
        }
      }
    }

    for (const sequence of sequences) {
      const source = renderDocument(sequence.map(specFor))
      const expected = replayReference(decodeReferenceDocument(source))
      const { report } = parseProjectValidate(source)
      const semanticErrors = report.diagnostics
        .filter((diagnostic) => [
          'machine-trace.drop-empty',
          'machine-trace.transfer-source-empty',
          'machine-trace.unknown-action',
        ].includes(diagnostic.rule))
        .map((diagnostic) => ({
          passIndex: diagnostic.passIndex,
          actionIndex: diagnostic.actionIndex,
          code: diagnostic.rule.replace('machine-trace.', ''),
        }))
      const stackPolicy = report.diagnostics
        .filter((diagnostic) => diagnostic.rule === 'machine-trace.loop-stack-policy')
        .map((diagnostic) => ({
          passIndex: diagnostic.passIndex,
          actionIndex: diagnostic.actionIndex,
          severity: diagnostic.severity,
        }))

      expect(semanticErrors, sequence.join('')).toEqual(expected.errors)
      expect(stackPolicy, sequence.join('')).toEqual(expected.stackPolicy)
      expect(report.passStates.map((state) => ({
        passIndex: state.passIndex,
        before: state.before,
        after: state.after,
        stackDeltas: state.stackDeltas,
      })), sequence.join('')).toEqual(expected.passStates)
      expect(report.finalState, sequence.join('')).toEqual(expected.finalState)
    }
  }, 30_000)
})
