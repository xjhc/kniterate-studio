import type {
  KCodeCarrierToken,
  KCodeDialect,
  KCodeMachineProfileV1,
} from './machine-profile.js'
import type {
  KCodeDocumentV1,
  KCodePassBlock,
  KCodeSourceSpan,
} from './types.js'

export type MachineTraceBedV1 = 'front' | 'rear'

export interface MachineTraceStopRangeV1 {
  /** Half-needle stop coordinate encoded by the KCode marker insertion index. */
  readonly left: number
  /** Half-needle stop coordinate encoded by the KCode marker insertion index. */
  readonly right: number
}

export interface MachineTraceStitchSelectorV1 {
  /** Exact STIF/STIR token at this selected KCode column. */
  readonly token: string
  /** Index in the profile's encoding alphabet; not a physical tension claim. */
  readonly encodedValue: number
  readonly sourceSpan: KCodeSourceSpan
}

export interface MachineTraceSelectionV1 {
  readonly bed: MachineTraceBedV1
  /** Index after removing carriage/carrier markers, including raster padding. */
  readonly payloadIndex: number
  /** Selected column in the KCode raster domain. This is not a physical needle label. */
  readonly kcodeColumn: number
  /** Dialect-normalized coordinate for comparing passes in this trace. */
  readonly traceCoordinate: number
  readonly stitchSelector: MachineTraceStitchSelectorV1
  readonly sourceSpan: KCodeSourceSpan
}

export type MachineTraceActionV1 =
  | {
      readonly kind: 'knit' | 'tuck' | 'drop'
      readonly at: MachineTraceSelectionV1
    }
  | {
      readonly kind: 'xfer'
      readonly source: MachineTraceSelectionV1
      readonly target: MachineTraceSelectionV1
    }
  | {
      readonly kind: 'split'
      readonly source: MachineTraceSelectionV1
      readonly target: MachineTraceSelectionV1
      readonly carrier: Exclude<KCodeCarrierToken, '0'>
    }
  | {
      readonly kind: 'move'
      readonly carrier: KCodeCarrierToken
    }
  | {
      readonly kind: 'unknown'
      readonly operation: string
      readonly reason: 'unsupported-operation' | 'empty-transfer' | 'unpaired-transfer-selection'
      readonly selections: readonly MachineTraceSelectionV1[]
    }

export interface MachineTracePassSourceV1 {
  readonly span: KCodeSourceSpan
  readonly fullSpan: KCodeSourceSpan
  readonly FRNT: KCodeSourceSpan
  readonly STIF: KCodeSourceSpan
  readonly REAR: KCodeSourceSpan
  readonly STIR: KCodeSourceSpan
  readonly footer: KCodeSourceSpan
}

/** One ordered RACK record in the executable KCode stream. */
export interface MachineTraceRackCommandV1 {
  /** Dense command index in source order. */
  readonly index: number
  /**
   * Number of complete passes preceding this command. Zero places the command
   * before pass 0; `passes.length` places it after the final pass. Multiple
   * commands at one boundary remain distinct and ordered by `index`.
   */
  readonly beforePassIndex: number
  readonly valueRaw: string
  readonly value: number
  readonly source: {
    readonly span: KCodeSourceSpan
    readonly fullSpan: KCodeSourceSpan
  }
}

export interface MachineTracePassV1 {
  readonly index: number
  /** Exact serialized payloads; FRNT/REAR still include all stop markers. */
  readonly raw: {
    readonly FRNT: string
    readonly STIF: string
    readonly REAR: string
    readonly STIR: string
    readonly footer: string
  }
  readonly source: MachineTracePassSourceV1
  readonly rack: number
  readonly direction: '>>' | '<<'
  readonly operation: string
  readonly carrier: KCodeCarrierToken
  readonly speedRaw: string
  readonly speed: number
  readonly rollerRaw: string
  readonly roller: number
  readonly carriageStops: MachineTraceStopRangeV1
  readonly carrierStops: MachineTraceStopRangeV1 | null
  readonly selections: {
    readonly front: readonly MachineTraceSelectionV1[]
    readonly rear: readonly MachineTraceSelectionV1[]
  }
  readonly actions: readonly MachineTraceActionV1[]
}

export interface MachineTraceV1 {
  readonly schemaVersion: 1
  readonly sourceDocumentSchemaVersion: 1
  readonly profileId: string
  readonly profileVersion: number
  readonly dialect: KCodeDialect
  /** Every RACK command, including redundant and transient commands. */
  readonly rackCommands: readonly MachineTraceRackCommandV1[]
  readonly passes: readonly MachineTracePassV1[]
}

interface DecodedMarker {
  readonly token: '/' | '\\' | Exclude<KCodeCarrierToken, '0'>
  /** Insertion index in the undecorated payload. */
  readonly baseIndex: number
  readonly coordinate: number
}

interface DecodedBed {
  readonly basePayload: string
  readonly baseToDecoratedIndex: readonly number[]
  readonly markers: readonly DecodedMarker[]
}

/**
 * Bound the eagerly materialized selection/action graph. The largest pinned
 * reference artifact currently contains 150,282 selections; this leaves a
 * deliberate margin while refusing compact inputs that would otherwise expand
 * into multi-gigabyte trace, validation, and scene structures.
 */
const MAX_MACHINE_TRACE_SELECTIONS = 200_000

function fail(message: string): never {
  throw new Error(`Cannot project MachineTraceV1: ${message}`)
}

function enforceSelectionBudget(document: KCodeDocumentV1): void {
  let selectionCount = 0
  for (const pass of document.passes) {
    for (const bed of [pass.frnt.value, pass.rear.value]) {
      for (let index = 0; index < bed.length; index++) {
        if (bed.charCodeAt(index) !== 45) continue
        selectionCount++
        if (selectionCount > MAX_MACHINE_TRACE_SELECTIONS) {
          fail(
            `selected raster cells exceed the software resource limit of `
            + `${MAX_MACHINE_TRACE_SELECTIONS.toLocaleString('en-US')}; `
            + 'split the artifact before exact trace projection',
          )
        }
      }
    }
  }
}

function unitSpan(span: KCodeSourceSpan, index: number): KCodeSourceSpan {
  const startOffset = span.start.offset + index
  const startColumn = span.start.column + index
  return {
    start: {
      offset: startOffset,
      line: span.start.line,
      column: startColumn,
    },
    end: {
      offset: startOffset + 1,
      line: span.start.line,
      column: startColumn + 1,
    },
  }
}

function isCarrierMarker(
  token: string,
  profile: KCodeMachineProfileV1,
): token is Exclude<KCodeCarrierToken, '0'> {
  return profile.machine.carriers.includes(token as Exclude<KCodeCarrierToken, '0'>)
}

/**
 * Reverse the pinned backend's ordered marker insertion.
 *
 * Markers are inserted right-to-left. In the final string, the original base
 * insertion index is therefore exactly the number of non-marker characters
 * preceding a marker. The backend converts a half-needle stop `s` to an index
 * with `s + leftPadding + 0.5`; the inverse below is profile-derived.
 */
function decodeBedMarkers(
  value: string,
  carrier: KCodeCarrierToken,
  profile: KCodeMachineProfileV1,
  passIndex: number,
  field: 'FRNT' | 'REAR',
): DecodedBed {
  const base: string[] = []
  const baseToDecoratedIndex: number[] = []
  const markers: DecodedMarker[] = []

  for (let decoratedIndex = 0; decoratedIndex < value.length; decoratedIndex++) {
    const token = value[decoratedIndex]!
    if (token === '/' || token === '\\' || isCarrierMarker(token, profile)) {
      const baseIndex = base.length
      markers.push({
        token,
        baseIndex,
        coordinate:
          baseIndex
          + profile.coordinates.payloadIndexToKCodeColumnOffset
          - 0.5,
      })
    } else {
      base.push(token)
      baseToDecoratedIndex.push(decoratedIndex)
    }
  }

  const expected = carrier === '0'
    ? ['/', '\\']
    : ['/', carrier, carrier, '\\']
  const actual = markers.map((marker) => marker.token)
  if (actual.length !== expected.length || actual.some((token, index) => token !== expected[index])) {
    fail(
      `pass ${passIndex} ${field} markers must be ${expected.join(' ... ')}; `
      + `received ${actual.join(' ... ') || 'none'}`,
    )
  }

  return {
    basePayload: base.join(''),
    baseToDecoratedIndex,
    markers,
  }
}

function sameMarkers(a: DecodedBed, b: DecodedBed): boolean {
  return a.markers.length === b.markers.length
    && a.markers.every((marker, index) => {
      const other = b.markers[index]
      return other !== undefined
        && marker.token === other.token
        && marker.baseIndex === other.baseIndex
        && marker.coordinate === other.coordinate
    })
}

function stopsFromMarkers(
  bed: DecodedBed,
  carrier: KCodeCarrierToken,
): {
  readonly carriageStops: MachineTraceStopRangeV1
  readonly carrierStops: MachineTraceStopRangeV1 | null
} {
  if (carrier === '0') {
    return {
      carriageStops: {
        left: bed.markers[0]!.coordinate,
        right: bed.markers[1]!.coordinate,
      },
      carrierStops: null,
    }
  }

  return {
    carriageStops: {
      left: bed.markers[0]!.coordinate,
      right: bed.markers[3]!.coordinate,
    },
    carrierStops: {
      left: bed.markers[1]!.coordinate,
      right: bed.markers[2]!.coordinate,
    },
  }
}

function traceOffset(
  profile: KCodeMachineProfileV1,
  dialect: KCodeDialect,
): number {
  const contract = profile.dialects[dialect]
  if (contract === undefined) fail(`profile does not define dialect ${JSON.stringify(dialect)}`)
  return contract.markerFreeTraceOffset
}

function selectionsForBed(
  bed: MachineTraceBedV1,
  decoded: DecodedBed,
  fieldSpan: KCodeSourceSpan,
  stitch: string,
  stitchSpan: KCodeSourceSpan,
  dialect: KCodeDialect,
  profile: KCodeMachineProfileV1,
  passIndex: number,
): MachineTraceSelectionV1[] {
  if (decoded.basePayload.length !== stitch.length) {
    fail(
      `pass ${passIndex} ${bed} marker-free payload width ${decoded.basePayload.length} `
      + `does not match stitch width ${stitch.length}`,
    )
  }

  const offset = traceOffset(profile, dialect)
  const selections: MachineTraceSelectionV1[] = []
  for (let payloadIndex = 0; payloadIndex < decoded.basePayload.length; payloadIndex++) {
    if (decoded.basePayload[payloadIndex] !== '-') continue

    const token = stitch[payloadIndex]!
    const encodedValue = profile.stitchSelectors.encoding.alphabet.indexOf(token)
    if (encodedValue === -1) {
      fail(
        `pass ${passIndex} ${bed} selected payload index ${payloadIndex} `
        + `has unsupported stitch selector ${JSON.stringify(token)}`,
      )
    }

    const decoratedIndex = decoded.baseToDecoratedIndex[payloadIndex]
    if (decoratedIndex === undefined) {
      fail(`pass ${passIndex} ${bed} cannot map payload index ${payloadIndex} to source`)
    }
    const kcodeColumn =
      payloadIndex + profile.coordinates.payloadIndexToKCodeColumnOffset
    selections.push({
      bed,
      payloadIndex,
      kcodeColumn,
      traceCoordinate: kcodeColumn + offset,
      stitchSelector: {
        token,
        encodedValue,
        sourceSpan: unitSpan(stitchSpan, payloadIndex),
      },
      sourceSpan: unitSpan(fieldSpan, decoratedIndex),
    })
  }
  return selections
}

function orderedSelections(
  selections: readonly MachineTraceSelectionV1[],
  direction: '>>' | '<<',
  coordinate: (selection: MachineTraceSelectionV1) => number =
    (selection) => selection.traceCoordinate,
): MachineTraceSelectionV1[] {
  const directionFactor = direction === '>>' ? 1 : -1
  return [...selections].sort((a, b) =>
    directionFactor * (coordinate(a) - coordinate(b))
    || a.bed.localeCompare(b.bed))
}

/**
 * Exact pinned-backend carriage slot for a regular knit/tuck/drop selection.
 * Back-bed raster columns encode needle labels; integer racking moves their
 * carriage traversal slot by `floor(rack)`. Transfer passes retain their
 * source-raster traversal contract and intentionally do not use this helper.
 */
export function regularActionTraversalCoordinate(
  selection: Pick<MachineTraceSelectionV1, 'bed' | 'traceCoordinate'>,
  rack: number,
): number {
  return selection.traceCoordinate
    + (selection.bed === 'rear' ? Math.floor(rack) : 0)
}

function knitTuckActions(
  operation: string,
  carrier: KCodeCarrierToken,
  rack: number,
  direction: '>>' | '<<',
  front: readonly MachineTraceSelectionV1[],
  rear: readonly MachineTraceSelectionV1[],
): MachineTraceActionV1[] | null {
  const match = /^(Kn|Tu)-(Kn|Tu)$/.exec(operation)
  if (match === null) return null

  const selections = orderedSelections(
    [...front, ...rear],
    direction,
    (selection) => regularActionTraversalCoordinate(selection, rack),
  )
  if (selections.length === 0) {
    return [{ kind: 'move', carrier }]
  }
  if (carrier === '0') {
    return selections.map((at) => ({ kind: 'drop', at }))
  }

  const frontKind = match[1] === 'Kn' ? 'knit' : 'tuck'
  const rearKind = match[2] === 'Kn' ? 'knit' : 'tuck'
  return selections.map((at) => ({
    kind: at.bed === 'front' ? frontKind : rearKind,
    at,
  }))
}

function transferActions(
  operation: string,
  carrier: KCodeCarrierToken,
  rack: number,
  direction: '>>' | '<<',
  front: readonly MachineTraceSelectionV1[],
  rear: readonly MachineTraceSelectionV1[],
): MachineTraceActionV1[] | null {
  const frontToRear = /^Tr-R[lr]$/.test(operation)
  const rearToFront = /^R[lr]-Tr$/.test(operation)
  if (!frontToRear && !rearToFront) return null

  const source = orderedSelections(frontToRear ? front : rear, direction)
  const remainingTargets = [...(frontToRear ? rear : front)]
  if (source.length === 0 && remainingTargets.length === 0) {
    return [{
      kind: 'unknown',
      operation,
      reason: 'empty-transfer',
      selections: [],
    }]
  }

  const actions: MachineTraceActionV1[] = []
  for (const selection of source) {
    const expectedTarget = selection.traceCoordinate + (frontToRear ? -rack : rack)
    const targetIndex = remainingTargets.findIndex(
      (candidate) => candidate.traceCoordinate === expectedTarget,
    )
    if (targetIndex === -1) {
      actions.push({
        kind: 'unknown',
        operation,
        reason: 'unpaired-transfer-selection',
        selections: [selection],
      })
      continue
    }

    const target = remainingTargets.splice(targetIndex, 1)[0]!
    actions.push(carrier === '0'
      ? { kind: 'xfer', source: selection, target }
      : { kind: 'split', source: selection, target, carrier })
  }

  for (const target of remainingTargets) {
    actions.push({
      kind: 'unknown',
      operation,
      reason: 'unpaired-transfer-selection',
      selections: [target],
    })
  }
  return actions
}

function actionsForPass(
  operation: string,
  carrier: KCodeCarrierToken,
  rack: number,
  direction: '>>' | '<<',
  front: readonly MachineTraceSelectionV1[],
  rear: readonly MachineTraceSelectionV1[],
): MachineTraceActionV1[] {
  const knitTuck = knitTuckActions(
    operation,
    carrier,
    rack,
    direction,
    front,
    rear,
  )
  if (knitTuck !== null) return knitTuck

  const transfer = transferActions(
    operation,
    carrier,
    rack,
    direction,
    front,
    rear,
  )
  if (transfer !== null) return transfer

  return [{
    kind: 'unknown',
    operation,
    reason: 'unsupported-operation',
    selections: orderedSelections([...front, ...rear], direction),
  }]
}

function requireFooter(pass: KCodePassBlock): {
  readonly direction: '>>' | '<<'
  readonly operation: string
  readonly carrier: KCodeCarrierToken
  readonly speedRaw: string
  readonly speed: number
  readonly rollerRaw: string
  readonly roller: number
} {
  const { footer } = pass
  if (
    footer.direction === null
    || footer.operation === null
    || footer.carrier === null
    || footer.speedRaw === null
    || footer.speed === null
    || footer.rollerRaw === null
    || footer.roller === null
  ) {
    fail(`pass ${pass.index} does not have a fully parsed footer`)
  }
  return {
    direction: footer.direction,
    operation: footer.operation,
    carrier: footer.carrier,
    speedRaw: footer.speedRaw,
    speed: footer.speed,
    rollerRaw: footer.rollerRaw,
    roller: footer.roller,
  }
}

function projectPass(
  pass: KCodePassBlock,
  dialect: KCodeDialect,
  profile: KCodeMachineProfileV1,
): MachineTracePassV1 {
  const footer = requireFooter(pass)
  const frontBed = decodeBedMarkers(
    pass.frnt.value,
    footer.carrier,
    profile,
    pass.index,
    'FRNT',
  )
  const rearBed = decodeBedMarkers(
    pass.rear.value,
    footer.carrier,
    profile,
    pass.index,
    'REAR',
  )
  if (!sameMarkers(frontBed, rearBed)) {
    fail(`pass ${pass.index} FRNT and REAR encode different stop coordinates`)
  }

  const { carriageStops, carrierStops } = stopsFromMarkers(
    frontBed,
    footer.carrier,
  )
  const front = selectionsForBed(
    'front',
    frontBed,
    pass.frnt.valueSpan,
    pass.stif.value,
    pass.stif.valueSpan,
    dialect,
    profile,
    pass.index,
  )
  const rear = selectionsForBed(
    'rear',
    rearBed,
    pass.rear.valueSpan,
    pass.stir.value,
    pass.stir.valueSpan,
    dialect,
    profile,
    pass.index,
  )

  return {
    index: pass.index,
    raw: {
      FRNT: pass.frnt.value,
      STIF: pass.stif.value,
      REAR: pass.rear.value,
      STIR: pass.stir.value,
      footer: pass.footer.raw,
    },
    source: {
      span: pass.span,
      fullSpan: pass.fullSpan,
      FRNT: pass.frnt.valueSpan,
      STIF: pass.stif.valueSpan,
      REAR: pass.rear.valueSpan,
      STIR: pass.stir.valueSpan,
      footer: pass.footer.span,
    },
    rack: pass.rack,
    direction: footer.direction,
    operation: footer.operation,
    carrier: footer.carrier,
    speedRaw: footer.speedRaw,
    speed: footer.speed,
    rollerRaw: footer.rollerRaw,
    roller: footer.roller,
    carriageStops,
    carrierStops,
    selections: { front, rear },
    actions: actionsForPass(
      footer.operation,
      footer.carrier,
      pass.rack,
      footer.direction,
      front,
      rear,
    ),
  }
}

function projectRackCommands(
  document: KCodeDocumentV1,
): MachineTraceRackCommandV1[] {
  let beforePassIndex = 0
  return document.racks.map((rack, index) => {
    while (
      beforePassIndex < document.passes.length
      && document.passes[beforePassIndex]!.footer.recordIndex < rack.recordIndex
    ) {
      beforePassIndex++
    }
    if (rack.value === null) {
      fail(`rack command ${index} does not have a parsed finite value`)
    }
    return {
      index,
      beforePassIndex,
      valueRaw: rack.valueRaw,
      value: rack.value,
      source: {
        span: rack.span,
        fullSpan: rack.fullSpan,
      },
    }
  })
}

/**
 * Project a strict, lossless KCode document into exact programmed-pass state.
 *
 * The trace deliberately exposes KCode and dialect-normalized coordinates,
 * never physical needle numbers. The profile's physical-numbering evidence is
 * currently unverified, while stop coordinates and payload columns are exact
 * consequences of the pinned KCode serialization contract.
 */
export function projectKCodeMachineTrace(
  document: KCodeDocumentV1,
  profile: KCodeMachineProfileV1,
): MachineTraceV1 {
  if (document.metadata.parseStatus !== 'accepted') {
    fail('document was rejected by the strict parser')
  }
  if (!document.metadata.strict) {
    fail('document metadata must record strict parsing')
  }
  if (document.unknownRecords.length !== 0) {
    fail('strict document contains unknown records')
  }
  if (document.home === null) {
    fail('strict document does not contain HOME')
  }
  if (document.initialRack?.value !== 0) {
    fail('strict document does not contain an initial RACK:0')
  }
  if (document.passes.length === 0) {
    fail('strict document does not contain any complete passes')
  }
  if (
    document.metadata.profileId !== profile.profileId
    || document.metadata.profileVersion !== profile.profileVersion
  ) {
    fail(
      `document targets ${document.metadata.profileId}@${document.metadata.profileVersion}, `
      + `but projection received ${profile.profileId}@${profile.profileVersion}`,
    )
  }
  if (!profile.supportedDialects.includes(document.metadata.dialect)) {
    fail(
      `profile ${profile.profileId}@${profile.profileVersion} does not support `
      + `dialect ${JSON.stringify(document.metadata.dialect)}`,
    )
  }

  enforceSelectionBudget(document)

  return {
    schemaVersion: 1,
    sourceDocumentSchemaVersion: document.metadata.schemaVersion,
    profileId: document.metadata.profileId,
    profileVersion: document.metadata.profileVersion,
    dialect: document.metadata.dialect,
    rackCommands: projectRackCommands(document),
    passes: document.passes.map((pass) =>
      projectPass(pass, document.metadata.dialect, profile)),
  }
}
