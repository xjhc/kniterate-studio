import {
  kcodeOperationContractV1,
  type KCodeMachineProfileV1,
} from './machine-profile.js'
import {
  regularActionTraversalCoordinate,
  type MachineTraceActionV1,
  type MachineTraceBedV1,
  type MachineTracePassV1,
  type MachineTraceRackCommandV1,
  type MachineTraceSelectionV1,
  type MachineTraceV1,
} from './machine-trace.js'
import type { KCodeSourceSpan } from './types.js'

export type MachineValidationSeverityV1 = 'error' | 'warning'

export type MachineValidationClassV1 =
  | 'structural'
  | 'semantic'
  | 'kinematic'
  | 'operational-advisory'

export type MachineValidationRuleV1 =
  | 'machine-trace.profile-mismatch'
  | 'machine-trace.dialect-profile'
  | 'machine-trace.passes-required'
  | 'machine-trace.rack-command-index'
  | 'machine-trace.rack-command-position'
  | 'machine-trace.rack-command-value'
  | 'machine-trace.rack-command-initial'
  | 'machine-trace.rack-state'
  | 'machine-trace.pass-index'
  | 'machine-trace.rack-profile'
  | 'machine-trace.setting-number'
  | 'machine-trace.setting-documented-range'
  | 'machine-trace.stop-coordinate'
  | 'machine-trace.carriage-stop-order'
  | 'machine-trace.carrier-stops-required'
  | 'machine-trace.carrier-stops-forbidden'
  | 'machine-trace.carrier-stop-order'
  | 'machine-trace.carrier-stops-outside-carriage'
  | 'machine-trace.carriage-discontinuity'
  | 'machine-trace.carrier-discontinuity'
  | 'machine-trace.selection-bed'
  | 'machine-trace.selection-coordinate'
  | 'machine-trace.selection-column-range'
  | 'machine-trace.selection-payload-coordinate'
  | 'machine-trace.selection-trace-coordinate'
  | 'machine-trace.selection-stitch-selector'
  | 'machine-trace.selection-stitch-documented-range'
  | 'machine-trace.selection-outside-carriage'
  | 'machine-trace.selection-outside-carrier'
  | 'machine-trace.duplicate-selection'
  | 'machine-trace.action-selection-missing'
  | 'machine-trace.action-selection-coverage'
  | 'machine-trace.action-direction-order'
  | 'machine-trace.action-operation'
  | 'machine-trace.action-carrier'
  | 'machine-trace.unknown-action'
  | 'machine-trace.operation-direction'
  | 'machine-trace.transfer-operation-direction'
  | 'machine-trace.transfer-bed-pair'
  | 'machine-trace.transfer-rack-pair'
  | 'machine-trace.transfer-source-empty'
  | 'machine-trace.drop-empty'
  | 'machine-trace.loop-stack-policy'

export interface MachineValidationDiagnosticV1 {
  readonly severity: MachineValidationSeverityV1
  readonly class: MachineValidationClassV1
  readonly rule: MachineValidationRuleV1
  readonly message: string
  /** Null only for a trace/profile contract failure before any pass exists. */
  readonly passIndex: number | null
  readonly actionIndex?: number
  /** Null only for a trace/profile contract failure before any source pass exists. */
  readonly sourceSpan: KCodeSourceSpan | null
  readonly line: number | null
  readonly column: number | null
  readonly endLine: number | null
  readonly endColumn: number | null
  /** Number of omitted findings represented by a bounded summary diagnostic. */
  readonly occurrences?: number
}

export type MachineLoopStackKeyV1 = `${MachineTraceBedV1}:${number}`

export interface MachineLoopStackCellV1 {
  readonly bed: MachineTraceBedV1
  readonly traceCoordinate: number
  readonly count: number
}

export interface MachineLoopStateMetricsV1 {
  readonly occupiedNeedles: number
  readonly totalLoops: number
  readonly maxStack: number
}

/**
 * JSON-safe, deterministic loop state. `stacks` is keyed by
 * `<bed>:<traceCoordinate>` for direct renderer lookup; `front` and `rear`
 * retain numeric ordering for drawing and diffs.
 */
export interface MachineLoopStateSnapshotV1 {
  readonly stacks: Readonly<Partial<Record<MachineLoopStackKeyV1, number>>>
  readonly front: readonly MachineLoopStackCellV1[]
  readonly rear: readonly MachineLoopStackCellV1[]
  readonly occupiedNeedles: MachineLoopStateMetricsV1['occupiedNeedles']
  readonly totalLoops: MachineLoopStateMetricsV1['totalLoops']
  readonly maxStack: MachineLoopStateMetricsV1['maxStack']
}

export interface MachineLoopStackDeltaV1 {
  readonly bed: MachineTraceBedV1
  readonly traceCoordinate: number
  readonly beforeCount: number
  readonly afterCount: number
}

/**
 * Memory-bounded per-pass evidence. `stackDeltas` includes every coordinate
 * touched by a pass action (including unchanged empty/no-op coordinates), while
 * `before` and `after` are exact whole-machine aggregate metrics. Full-bed
 * occupancy is retained only once in `MachineValidationReportV1.finalState`.
 */
export interface MachinePassStateSnapshotV1 {
  readonly passIndex: number
  readonly before: MachineLoopStateMetricsV1
  readonly after: MachineLoopStateMetricsV1
  readonly stackDeltas: readonly MachineLoopStackDeltaV1[]
}

export interface MachineOperationalAssuranceV1 {
  readonly status: 'not-established-by-software-validation'
  /** KCode has no carrier in/out records, so lifecycle is intentionally absent. */
  readonly carrierLifecycle: 'not-encoded-in-kcode'
  readonly initialLoopState: 'empty-bed-job-assumption'
  readonly limitations: readonly {
    readonly code:
      | 'physical-needle-numbering-unverified'
      | 'speed-operational-bounds-unverified'
      | 'roller-operational-bounds-unverified'
      | 'loop-stack-operational-limit-unverified'
      | 'transfer-physical-direction-conflict-unresolved'
    readonly message: string
  }[]
}

export interface MachineValidationReportV1 {
  /** True only when no blocking diagnostic of any validation class exists. */
  readonly ok: boolean
  /** Conformance to the serialized logical profile, not physical controller behavior. */
  readonly profileConformance: 'conformant' | 'blocked'
  /** State result under the report's explicit empty-bed initial-state assumption. */
  readonly modeledState: 'conformant' | 'review' | 'blocked'
  readonly operationalPolicy: 'clear' | 'review' | 'blocked'
  readonly controllerAcceptance: 'not-established-by-software-validation'
  readonly diagnostics: readonly MachineValidationDiagnosticV1[]
  readonly errorCount: number
  readonly warningCount: number
  readonly passStates: readonly MachinePassStateSnapshotV1[]
  readonly finalState: MachineLoopStateSnapshotV1
  readonly operationalAssurance: MachineOperationalAssuranceV1
}

interface MutableLoopCell {
  readonly bed: MachineTraceBedV1
  readonly traceCoordinate: number
  count: number
}

type MutableLoopState = Map<MachineLoopStackKeyV1, MutableLoopCell>

const OPERATIONAL_ASSURANCE: MachineOperationalAssuranceV1 = {
  status: 'not-established-by-software-validation',
  carrierLifecycle: 'not-encoded-in-kcode',
  initialLoopState: 'empty-bed-job-assumption',
  limitations: [
    {
      code: 'physical-needle-numbering-unverified',
      message: 'Trace coordinates are exact KCode coordinates, not proven physical needle labels.',
    },
    {
      code: 'speed-operational-bounds-unverified',
      message: 'The profile does not establish operationally safe speed bounds.',
    },
    {
      code: 'roller-operational-bounds-unverified',
      message: 'The profile does not establish operationally safe signed roller bounds.',
    },
    {
      code: 'loop-stack-operational-limit-unverified',
      message: 'Stack depth is measured and checked against a conservative software policy; the policy is not a measured physical-safe or physical-failure limit.',
    },
    {
      code: 'transfer-physical-direction-conflict-unresolved',
      message: 'Transfer tokens conform to the official serialized KCode contract; conflicting machine-manual wording leaves controller-observed physical direction unestablished.',
    },
  ],
}

const MAX_MACHINE_VALIDATION_DIAGNOSTIC_DETAILS = 512

// Stryker disable next-line UnaryOperator: Equivalent mutant: unary plus cannot distinguish 0 from the normalized -0 key.
const numberKey = (value: number): number => Object.is(value, -0) ? 0 : value

function stackKey(
  bed: MachineTraceBedV1,
  traceCoordinate: number,
): MachineLoopStackKeyV1 {
  return `${bed}:${numberKey(traceCoordinate)}`
}

function getStack(
  state: MutableLoopState,
  bed: MachineTraceBedV1,
  traceCoordinate: number,
): number {
  return state.get(stackKey(bed, traceCoordinate))?.count ?? 0
}

function setStack(
  state: MutableLoopState,
  bed: MachineTraceBedV1,
  traceCoordinate: number,
  count: number,
): void {
  const key = stackKey(bed, traceCoordinate)
  if (count <= 0) {
    state.delete(key)
    return
  }
  state.set(key, {
    bed,
    traceCoordinate: numberKey(traceCoordinate),
    count,
  })
}

function stateMetrics(
  state: ReadonlyMap<MachineLoopStackKeyV1, MachineLoopStackCellV1>,
): MachineLoopStateMetricsV1 {
  let totalLoops = 0
  let maxStack = 0
  for (const cell of state.values()) {
    // `setStack` deletes nonpositive cells, so every retained cell is occupied.
    totalLoops += cell.count
    maxStack = Math.max(maxStack, cell.count)
  }
  return {
    occupiedNeedles: state.size,
    totalLoops,
    maxStack,
  }
}

export function snapshotMachineLoopStateV1(
  state: ReadonlyMap<MachineLoopStackKeyV1, MachineLoopStackCellV1>,
): MachineLoopStateSnapshotV1 {
  const ordered = [...state.values()]
    .sort((a, b) =>
      (a.bed === b.bed ? 0 : a.bed === 'front' ? -1 : 1)
      || a.traceCoordinate - b.traceCoordinate)
    .map((cell): MachineLoopStackCellV1 => ({
      bed: cell.bed,
      traceCoordinate: cell.traceCoordinate,
      count: cell.count,
    }))
  const stacks: Partial<Record<MachineLoopStackKeyV1, number>> = {}
  for (const cell of ordered) {
    stacks[stackKey(cell.bed, cell.traceCoordinate)] = cell.count
  }
  return {
    stacks,
    front: ordered.filter((cell) => cell.bed === 'front'),
    rear: ordered.filter((cell) => cell.bed === 'rear'),
    ...stateMetrics(state),
  }
}

/**
 * Pure loop-state effect shared by validation and execution inspection. The
 * caller establishes action legality first. Empty transfers have no effect;
 * their diagnostic remains the validator's responsibility.
 */
export function machineLoopActionDeltasV1(
  action: MachineTraceActionV1,
  readCount: (bed: MachineTraceBedV1, traceCoordinate: number) => number,
): readonly MachineLoopStackDeltaV1[] {
  const delta = (selection: MachineTraceSelectionV1, afterCount: number): MachineLoopStackDeltaV1 => ({
    bed: selection.bed,
    traceCoordinate: selection.traceCoordinate,
    beforeCount: readCount(selection.bed, selection.traceCoordinate),
    afterCount,
  })
  switch (action.kind) {
    case 'knit':
      return [delta(action.at, 1)]
    case 'tuck':
      return [delta(action.at, readCount(action.at.bed, action.at.traceCoordinate) + 1)]
    case 'drop':
      return [delta(action.at, 0)]
    case 'xfer':
    case 'split': {
      const sourceCount = readCount(action.source.bed, action.source.traceCoordinate)
      if (sourceCount === 0) return []
      return [
        delta(action.target, readCount(action.target.bed, action.target.traceCoordinate) + sourceCount),
        delta(action.source, action.kind === 'split' ? 1 : 0),
      ]
    }
    case 'move':
    case 'unknown':
      return []
  }
}

function knownLower(range: {
  readonly lower: { readonly value: number | null; readonly inclusive: boolean | null }
}): number | null {
  return range.lower.value
}

function knownUpper(range: {
  readonly upper: { readonly value: number | null; readonly inclusive: boolean | null }
}): number | null {
  return range.upper.value
}

function outsideKnownRange(
  value: number,
  range: {
    readonly lower: { readonly value: number | null; readonly inclusive: boolean | null }
    readonly upper: { readonly value: number | null; readonly inclusive: boolean | null }
  },
): boolean {
  const lower = knownLower(range)
  const upper = knownUpper(range)
  if (lower !== null) {
    const belowLower = range.lower.inclusive === false ? value <= lower : value < lower
    if (belowLower) return true
  }
  if (upper !== null) {
    const aboveUpper = range.upper.inclusive === false ? value >= upper : value > upper
    if (aboveUpper) return true
  }
  return false
}

function isHalfIntegerStop(value: number): boolean {
  // Stryker disable next-line ArithmeticOperator: Equivalent mutant: adding or subtracting 0.5 differs by one and therefore has identical integer membership.
  return Number.isFinite(value) && Number.isInteger(value - 0.5)
}

function contains(
  range: { readonly left: number; readonly right: number },
  coordinate: number,
): boolean {
  // Stryker disable next-line EqualityOperator: Equivalent mutant: legal stop coordinates are half-integers while operated coordinates are integers, so equality at either boundary is impossible.
  return coordinate >= range.left && coordinate <= range.right
}

function selectionIdentity(selection: MachineTraceSelectionV1): string {
  return JSON.stringify([
    selection.bed,
    selection.payloadIndex,
    selection.kcodeColumn,
    selection.traceCoordinate,
    selection.sourceSpan.start.offset,
    selection.sourceSpan.end.offset,
  ])
}

function actionSelections(action: MachineTraceActionV1): readonly MachineTraceSelectionV1[] {
  if ('at' in action) return [action.at]
  if ('source' in action) return [action.source, action.target]
  if ('selections' in action) return action.selections
  return []
}

function touchedActionCoordinates(
  actions: readonly MachineTraceActionV1[],
): Array<Pick<MachineLoopStackCellV1, 'bed' | 'traceCoordinate'>> {
  const coordinates = new Map<MachineLoopStackKeyV1, Pick<
    MachineLoopStackCellV1,
    'bed' | 'traceCoordinate'
  >>()
  for (const action of actions) {
    for (const selection of actionSelections(action)) {
      const traceCoordinate = numberKey(selection.traceCoordinate)
      coordinates.set(stackKey(selection.bed, traceCoordinate), {
        bed: selection.bed,
        traceCoordinate,
      })
    }
  }
  return [...coordinates.values()].sort((a, b) =>
    (a.bed === b.bed ? 0 : a.bed === 'front' ? -1 : 1)
    || a.traceCoordinate - b.traceCoordinate)
}

function actionPrimarySelection(
  action: MachineTraceActionV1,
): MachineTraceSelectionV1 | null {
  return actionSelections(action)[0] ?? null
}

/**
 * KCode transfer passes encode carriage reach from the source-bed raster
 * column; their target-bed '-' is an aligned pairing mark, not an additional
 * independent stroke coordinate. Regular rear-bed passes use the pinned
 * backend's integer slot convention (`rear + floor(rack)`).
 */
function actionStopCoordinate(
  action: MachineTraceActionV1,
  pass: MachineTracePassV1,
): number | null {
  const primary = actionPrimarySelection(action)
  if (primary === null) return null
  if (action.kind === 'xfer' || action.kind === 'split') {
    return primary.traceCoordinate
  }
  return regularActionTraversalCoordinate(primary, pass.rack)
}

function actionSpan(
  action: MachineTraceActionV1,
  pass: MachineTracePassV1,
): KCodeSourceSpan {
  return actionSelections(action)[0]?.sourceSpan ?? pass.source.footer
}

function expectedTransferSourceBed(
  profile: KCodeMachineProfileV1,
  operation: string,
): MachineTraceBedV1 | null {
  const contract = kcodeOperationContractV1(profile, operation)
  if (contract === null) return null
  // Stryker disable next-line ConditionalExpression,StringLiteral: Equivalent mutant: non-transfer operations are compared only as a source-bed mismatch; null and the absent sourceBed property produce the same blocking result.
  if (contract.family === 'regular') return null
  return contract.sourceBed
}

function operationDirectionContract(
  profile: KCodeMachineProfileV1,
  operation: string,
): ReturnType<typeof kcodeOperationContractV1> {
  return kcodeOperationContractV1(profile, operation)
}

function expectedRegularKind(
  profile: KCodeMachineProfileV1,
  operation: string,
  bed: MachineTraceBedV1,
  carrier: MachineTracePassV1['carrier'],
): 'knit' | 'tuck' | 'drop' | null {
  const contract = kcodeOperationContractV1(profile, operation)
  if (contract === null) return null
  if (contract.family === 'transfer') return null
  if (carrier === '0') {
    return contract.carrierZeroAction === 'drop' ? 'drop' : null
  }
  return contract.carrierAction === 'bed-operation'
    ? bed === 'front' ? contract.frontAction : contract.rearAction
    : null
}

function expectedTransferTarget(
  profile: KCodeMachineProfileV1,
  operation: string,
  source: MachineTraceSelectionV1,
  rack: number,
): number | null {
  const contract = kcodeOperationContractV1(profile, operation)
  if (contract === null) return null
  if (contract.family === 'regular') return null
  // Stryker disable next-line ArithmeticOperator: Equivalent mutant: the V1 multiplier domain is exactly -1 or 1, for which multiply and divide are identical.
  return source.traceCoordinate + rack * contract.targetRackMultiplier
}

function sameCoordinate(a: number, b: number | null): boolean {
  return a === b
}

function isExactDecimalValue(raw: string, value: number): boolean {
  if (raw.length === 0) return false
  const unsigned = raw[0] === '+' || raw[0] === '-' ? raw.slice(1) : raw
  for (const token of unsigned) {
    if (token === '.') continue
    if (token < '0' || token > '9') return false
  }
  if (unsigned.endsWith('.')) return false
  const parsed = Number(raw)
  return Number.isFinite(parsed) && Object.is(parsed, value)
}

/**
 * Validate exact emitted KCode semantics without reconstructing Knitout.
 *
 * The simulator starts from an empty-bed job boundary. It intentionally does
 * not invent carrier `in`/`out` lifecycle: KCode does not encode those ops.
 * Transfers move the complete source stack, knits replace a stack with one
 * new loop, tucks add one loop, drops remove the complete stack, and splits
 * move the old stack while leaving one new loop at the source.
 */
export function validateKCodeMachineTrace(
  trace: MachineTraceV1,
  profile: KCodeMachineProfileV1,
): MachineValidationReportV1 {
  const diagnostics: MachineValidationDiagnosticV1[] = []
  const diagnosticKeys = new Set<string>()
  let errorCount = 0
  let warningCount = 0
  const omittedDiagnosticGroups = new Map<string, {
    severity: MachineValidationSeverityV1
    class: MachineValidationClassV1
    rule: MachineValidationRuleV1
    count: number
  }>()
  const state: MutableLoopState = new Map()
  const passStates: MachinePassStateSnapshotV1[] = []

  const add = (
    severity: MachineValidationSeverityV1,
    diagnosticClass: MachineValidationClassV1,
    rule: MachineValidationRuleV1,
    message: string,
    passIndex: number | null,
    sourceSpan: KCodeSourceSpan | null,
    actionIndex?: number,
  ): void => {
    const key = JSON.stringify([
      severity,
      diagnosticClass,
      rule,
      message,
      passIndex,
      actionIndex,
      sourceSpan,
    ])
    if (diagnostics.length >= MAX_MACHINE_VALIDATION_DIAGNOSTIC_DETAILS) {
      if (severity === 'error') errorCount++
      else warningCount++
      const groupKey = `${severity}|${diagnosticClass}|${rule}`
      const group = omittedDiagnosticGroups.get(groupKey)
      if (group === undefined) {
        omittedDiagnosticGroups.set(groupKey, {
          severity,
          class: diagnosticClass,
          rule,
          count: 1,
        })
      } else {
        group.count++
      }
      return
    }
    if (diagnosticKeys.has(key)) return
    diagnosticKeys.add(key)
    if (severity === 'error') errorCount++
    else warningCount++
    diagnostics.push({
      severity,
      class: diagnosticClass,
      rule,
      message,
      passIndex,
      actionIndex,
      sourceSpan,
      line: sourceSpan?.start.line ?? null,
      column: sourceSpan?.start.column ?? null,
      endLine: sourceSpan?.end.line ?? null,
      endColumn: sourceSpan?.end.column ?? null,
    })
  }

  const checkLoopStackPolicy = (
    count: number,
    pass: MachineTracePassV1,
    sourceSpan: KCodeSourceSpan,
    actionIndex: number,
    location: string,
  ): void => {
    const policy = profile.loopStackSoftwarePolicy
    if (count > policy.errorAbove) {
      add(
        'error',
        'operational-advisory',
        'machine-trace.loop-stack-policy',
        `${location} reaches ${count} modeled loops, above the conservative software error threshold of ${policy.errorAbove}. This is a product gate, not a physical machine-failure claim.`,
        pass.index,
        sourceSpan,
        actionIndex,
      )
    } else if (count > policy.warningAbove) {
      add(
        'warning',
        'operational-advisory',
        'machine-trace.loop-stack-policy',
        `${location} reaches ${count} modeled loops, above the conservative software review threshold of ${policy.warningAbove}. This is not a physical safety-limit claim.`,
        pass.index,
        sourceSpan,
        actionIndex,
      )
    }
  }

  if (
    trace.profileId !== profile.profileId
    || trace.profileVersion !== profile.profileVersion
  ) {
    const first = trace.passes[0]
    add(
      'error',
      'structural',
      'machine-trace.profile-mismatch',
      `Trace targets ${trace.profileId}@${trace.profileVersion}, but validation received ${profile.profileId}@${profile.profileVersion}.`,
      first?.index ?? null,
      first?.source.span ?? null,
    )
  }

  const dialectContracts: Readonly<Record<string, {
    readonly markerFreeTraceOffset: number
  }>> = profile.dialects
  const dialectContract = dialectContracts[trace.dialect]
  if (
    dialectContract === undefined
    || !profile.supportedDialects.includes(trace.dialect)
  ) {
    const first = trace.passes[0]
    add(
      'error',
      'structural',
      'machine-trace.dialect-profile',
      `Trace dialect ${JSON.stringify(trace.dialect)} is not supported by profile ${profile.profileId}@${profile.profileVersion}.`,
      first?.index ?? null,
      first?.source.span ?? null,
    )
  }

  if (trace.passes.length === 0) {
    add(
      'error',
      'structural',
      'machine-trace.passes-required',
      'MachineTraceV1 must contain at least one complete pass.',
      null,
      trace.rackCommands[0]?.source.span ?? null,
    )
  }

  const rackCommandsByBoundary = new Map<number, MachineTraceRackCommandV1>()
  let priorRackBoundary = -1
  for (const [commandPosition, command] of trace.rackCommands.entries()) {
    const boundaryInRange = Number.isInteger(command.beforePassIndex)
      && command.beforePassIndex >= 0
      && command.beforePassIndex <= trace.passes.length
    const boundaryPassIndex = boundaryInRange
      && command.beforePassIndex < trace.passes.length
      ? command.beforePassIndex
      : null
    if (command.index !== commandPosition) {
      add(
        'error',
        'structural',
        'machine-trace.rack-command-index',
        `Rack command index ${command.index} does not match ordered command position ${commandPosition}.`,
        boundaryPassIndex,
        command.source.span,
      )
    }
    if (
      !boundaryInRange
      || command.beforePassIndex < priorRackBoundary
    ) {
      add(
        'error',
        'structural',
        'machine-trace.rack-command-position',
        `Rack command ${command.index} boundary ${command.beforePassIndex} must be an ordered integer in 0..${trace.passes.length}.`,
        boundaryPassIndex,
        command.source.span,
      )
    }
    priorRackBoundary = command.beforePassIndex

    const rawMatches = isExactDecimalValue(command.valueRaw, command.value)
    if (
      !Number.isFinite(command.value)
      || !profile.rack.values.includes(command.value)
      || !rawMatches
    ) {
      add(
        'error',
        'structural',
        'machine-trace.rack-command-value',
        `Rack command ${command.index} value ${JSON.stringify(command.valueRaw)} / ${String(command.value)} is not an exact supported profile rack value.`,
        boundaryPassIndex,
        command.source.span,
      )
    }
    // Only the final command at a pass boundary establishes that pass's rack.
    // Invalid boundaries remain diagnosable history but are never looked up.
    rackCommandsByBoundary.set(command.beforePassIndex, command)
  }

  const firstRackCommand = trace.rackCommands[0]
  if (
    firstRackCommand === undefined
    || firstRackCommand.beforePassIndex !== 0
    || firstRackCommand.value !== 0
  ) {
    add(
      'error',
      'structural',
      'machine-trace.rack-command-initial',
      'MachineTraceV1 must begin with an explicit RACK:0 command before pass 0.',
      trace.passes[0]?.index ?? null,
      firstRackCommand?.source.span ?? trace.passes[0]?.source.span ?? null,
    )
  }

  let previousCarriageEnd: number | null = null
  const carrierEnds = new Map<string, number>()
  let commandedRack = 0

  for (const [passPosition, pass] of trace.passes.entries()) {
    const touchedCoordinates = touchedActionCoordinates(pass.actions)
    const beforeCounts = new Map(touchedCoordinates.map((coordinate) => [
      stackKey(coordinate.bed, coordinate.traceCoordinate),
      getStack(state, coordinate.bed, coordinate.traceCoordinate),
    ]))
    const before = stateMetrics(state)
    const structurallyInvalidActions = new Set<number>()

    const boundaryCommand = rackCommandsByBoundary.get(passPosition)
    if (boundaryCommand !== undefined) {
      const command = boundaryCommand
      commandedRack = command.value
    }
    if (!sameCoordinate(pass.rack, commandedRack)) {
      add(
        'error',
        'structural',
        'machine-trace.rack-state',
        `Pass ${pass.index} records rack ${pass.rack}, but the ordered rack-command stream establishes ${commandedRack}.`,
        pass.index,
        pass.source.footer,
      )
    }

    if (pass.index !== passPosition) {
      add(
        'error',
        'structural',
        'machine-trace.pass-index',
        `Pass index ${pass.index} does not match ordered trace position ${passPosition}.`,
        pass.index,
        pass.source.span,
      )
    }

    if (!profile.rack.values.includes(pass.rack)) {
      add(
        'error',
        'structural',
        'machine-trace.rack-profile',
        `Rack ${pass.rack} is not in profile ${profile.profileId}@${profile.profileVersion}.`,
        pass.index,
        pass.source.footer,
      )
    }

    const directionContract = operationDirectionContract(profile, pass.operation)
    if (directionContract !== null && !directionContract.allowedDirections.includes(pass.direction)) {
      const isTransfer = directionContract.family === 'transfer'
      add(
        'error',
        'kinematic',
        isTransfer
          ? 'machine-trace.transfer-operation-direction'
          : 'machine-trace.operation-direction',
        // Stryker disable next-line StringLiteral: Diagnostic prose only; family-specific rules and allowed-direction membership remain mutation-tested.
        `${isTransfer ? 'Transfer operation' : 'Operation'} ${pass.operation} requires footer direction ${directionContract.allowedDirections.join(' or ')}, not ${pass.direction}.`,
        pass.index,
        pass.source.footer,
      )
    }

    for (const [name, value, range] of [
      ['speed', pass.speed, profile.processSettings.speed.editorDocumentedBounds],
      ['roller', pass.roller, profile.processSettings.roller.editorDocumentedBounds],
    ] as const) {
      if (!Number.isFinite(value)) {
        add(
          'error',
          'structural',
          'machine-trace.setting-number',
          `Pass ${name} must be a finite number; received ${String(value)}.`,
          pass.index,
          pass.source.footer,
        )
      } else if (outsideKnownRange(value, range)) {
        add(
          'warning',
          'operational-advisory',
          'machine-trace.setting-documented-range',
          `Pass ${name} ${value} is outside the profile's documented editor range; operational safety is not established.`,
          pass.index,
          pass.source.footer,
        )
      }
    }

    const carriage = pass.carriageStops
    for (const [name, value] of [
      ['carriage left', carriage.left],
      ['carriage right', carriage.right],
    ] as const) {
      if (!isHalfIntegerStop(value)) {
        add(
          'error',
          'structural',
          'machine-trace.stop-coordinate',
          `${name} stop ${value} is not a finite half-integer KCode stop.`,
          pass.index,
          pass.source.FRNT,
        )
      }
    }
    if (!(carriage.left < carriage.right)) {
      add(
        'error',
        'kinematic',
        'machine-trace.carriage-stop-order',
        `Carriage stops must satisfy left < right; received ${carriage.left}..${carriage.right}.`,
        pass.index,
        pass.source.FRNT,
      )
    }

    const currentCarriageStart = pass.direction === '>>'
      ? carriage.left
      : carriage.right
    const currentCarriageEnd = pass.direction === '>>'
      ? carriage.right
      : carriage.left
    if (
      previousCarriageEnd !== null
      && !sameCoordinate(previousCarriageEnd, currentCarriageStart)
    ) {
        add(
          'error',
          'kinematic',
          'machine-trace.carriage-discontinuity',
          // Stryker disable next-line StringLiteral: Diagnostic prose only; exact rule, severity, class, and source location remain mutation-tested.
          `Carriage ended the prior pass at ${previousCarriageEnd}, but pass ${pass.index} starts at ${currentCarriageStart}.`,
        pass.index,
        pass.source.FRNT,
      )
    }
    previousCarriageEnd = currentCarriageEnd

    const carrierStops = pass.carrierStops
    if (pass.carrier === '0') {
      if (carrierStops !== null) {
        add(
          'error',
          'structural',
          'machine-trace.carrier-stops-forbidden',
          'Carrierless pass 0 must not encode carrier stops.',
          pass.index,
          pass.source.FRNT,
        )
      }
    } else if (carrierStops === null) {
      add(
        'error',
        'structural',
        'machine-trace.carrier-stops-required',
        `Carrier ${pass.carrier} pass must encode two carrier stops.`,
        pass.index,
        pass.source.FRNT,
      )
    } else {
      for (const [name, value] of [
        ['carrier left', carrierStops.left],
        ['carrier right', carrierStops.right],
      ] as const) {
        if (!isHalfIntegerStop(value)) {
          add(
            'error',
            'structural',
            'machine-trace.stop-coordinate',
            `${name} stop ${value} is not a finite half-integer KCode stop.`,
            pass.index,
            pass.source.FRNT,
          )
        }
      }
      if (!(carrierStops.left < carrierStops.right)) {
        add(
          'error',
          'kinematic',
          'machine-trace.carrier-stop-order',
          `Carrier stops must satisfy left < right; received ${carrierStops.left}..${carrierStops.right}.`,
          pass.index,
          pass.source.FRNT,
        )
      }
      if (
        carrierStops.left < carriage.left
        || carrierStops.right > carriage.right
      ) {
        add(
          'error',
          'kinematic',
          'machine-trace.carrier-stops-outside-carriage',
          `Carrier stops ${carrierStops.left}..${carrierStops.right} must stay inside carriage stops ${carriage.left}..${carriage.right}.`,
          pass.index,
          pass.source.FRNT,
        )
      }

      const carrierStart = pass.direction === '>>'
        ? carrierStops.left
        : carrierStops.right
      const carrierEnd = pass.direction === '>>'
        ? carrierStops.right
        : carrierStops.left
      const knownCarrierEnd = carrierEnds.get(pass.carrier)
      if (
        knownCarrierEnd !== undefined
        && !sameCoordinate(knownCarrierEnd, carrierStart)
      ) {
        add(
          'error',
          'kinematic',
          'machine-trace.carrier-discontinuity',
          `Carrier ${pass.carrier} ended its prior programmed pass at ${knownCarrierEnd}, but this pass starts it at ${carrierStart}.`,
          pass.index,
          pass.source.FRNT,
        )
      }
      carrierEnds.set(pass.carrier, carrierEnd)
    }

    const passSelections = [
      ...pass.selections.front,
      ...pass.selections.rear,
    ]
    if (pass.actions.length === 0) {
      add(
        'error',
        'structural',
        'machine-trace.action-operation',
        `Pass ${pass.index} has no executable action.`,
        pass.index,
        pass.source.footer,
      )
    }
    if (
      pass.actions.some((action) => action.kind === 'move')
      && pass.actions.length !== 1
    ) {
      add(
        'error',
        'structural',
        'machine-trace.action-operation',
        `Move pass ${pass.index} must contain exactly one move action.`,
        pass.index,
        pass.source.footer,
      )
    }
    const selectionIdentities = new Map<string, MachineTraceSelectionV1>()
    const stateCoordinates = new Set<string>()
    for (const [bed, selections] of [
      ['front', pass.selections.front],
      ['rear', pass.selections.rear],
    ] as const) {
      for (const selection of selections) {
        if (selection.bed !== bed) {
          add(
            'error',
            'structural',
            'machine-trace.selection-bed',
            `${bed} selection collection contains a ${selection.bed} selection.`,
            pass.index,
            selection.sourceSpan,
          )
        }
        if (
          !Number.isInteger(selection.payloadIndex)
          || !Number.isInteger(selection.kcodeColumn)
          || !Number.isInteger(selection.traceCoordinate)
        ) {
          add(
            'error',
            'structural',
            'machine-trace.selection-coordinate',
            'Selection payload, KCode-column, and normalized trace coordinates must be finite integers.',
            pass.index,
            selection.sourceSpan,
          )
        }
        const expectedColumn = selection.payloadIndex
          + profile.coordinates.payloadIndexToKCodeColumnOffset
        if (selection.kcodeColumn !== expectedColumn) {
          add(
            'error',
            'structural',
            'machine-trace.selection-payload-coordinate',
            `Selection payload index ${selection.payloadIndex} maps to KCode column ${expectedColumn}, not ${selection.kcodeColumn}.`,
            pass.index,
            selection.sourceSpan,
          )
        }
        // Stryker disable ArithmeticOperator: Equivalent mutant: both V1 dialect offsets are exactly zero.
        const expectedTraceCoordinate = dialectContract === undefined
          ? null
          : selection.kcodeColumn + dialectContract.markerFreeTraceOffset
        // Stryker restore ArithmeticOperator
        if (
          expectedTraceCoordinate !== null
          && selection.traceCoordinate !== expectedTraceCoordinate
        ) {
          add(
            'error',
            'structural',
            'machine-trace.selection-trace-coordinate',
            `KCode column ${selection.kcodeColumn} maps to trace coordinate ${expectedTraceCoordinate} in dialect ${trace.dialect}, not ${selection.traceCoordinate}.`,
            pass.index,
            selection.sourceSpan,
          )
        }
        const { min, max } = profile.raster.kcodeColumnRange
        if (selection.kcodeColumn < min || selection.kcodeColumn > max) {
          add(
            'error',
            'structural',
            'machine-trace.selection-column-range',
            `Selected KCode column ${selection.kcodeColumn} is outside ${min}..${max}.`,
            pass.index,
            selection.sourceSpan,
          )
        }
        const expectedSelector = profile.stitchSelectors.encoding.alphabet[
          selection.stitchSelector.encodedValue
        ]
        if (
          !Number.isInteger(selection.stitchSelector.encodedValue)
          || expectedSelector !== selection.stitchSelector.token
        ) {
          add(
            'error',
            'structural',
            'machine-trace.selection-stitch-selector',
            `Stitch selector ${JSON.stringify(selection.stitchSelector.token)} does not match encoded value ${selection.stitchSelector.encodedValue}.`,
            pass.index,
            selection.stitchSelector.sourceSpan,
          )
        } else if (outsideKnownRange(
          selection.stitchSelector.encodedValue,
          profile.stitchSelectors.documentedBounds,
        )) {
          add(
            'warning',
              'operational-advisory',
              'machine-trace.selection-stitch-documented-range',
              // Stryker disable next-line StringLiteral: Diagnostic prose only; selector bounds, severity, class, and stable rule remain mutation-tested.
              `Stitch selector ${selection.stitchSelector.encodedValue} is accepted only by the legacy profile and is outside the documented KCode 1.0 selector range.`,
            pass.index,
            selection.stitchSelector.sourceSpan,
          )
        }
        const identity = selectionIdentity(selection)
        if (selectionIdentities.has(identity)) {
          add(
            'error',
            'structural',
            'machine-trace.duplicate-selection',
            `Selection ${selection.bed}:${selection.traceCoordinate} appears more than once in this pass.`,
            pass.index,
            selection.sourceSpan,
          )
        }
        selectionIdentities.set(identity, selection)
        const coordinateKey = stackKey(selection.bed, selection.traceCoordinate)
        if (stateCoordinates.has(coordinateKey)) {
          add(
            'error',
            'structural',
            'machine-trace.duplicate-selection',
            `Needle ${coordinateKey} is selected more than once in this pass.`,
            pass.index,
            selection.sourceSpan,
          )
        }
        stateCoordinates.add(coordinateKey)
      }
    }

    const selectionUse = new Map<string, number>()
    let priorActionCoordinate = pass.direction === '>>'
      ? Number.NEGATIVE_INFINITY
      : Number.POSITIVE_INFINITY
    for (const [actionIndex, action] of pass.actions.entries()) {
      const span = actionSpan(action, pass)
      for (const selection of actionSelections(action)) {
        const identity = selectionIdentity(selection)
        selectionUse.set(identity, (selectionUse.get(identity) ?? 0) + 1)
        if (!selectionIdentities.has(identity)) {
          add(
            'error',
            'structural',
            'machine-trace.action-selection-missing',
            `Action references ${selection.bed}:${selection.traceCoordinate}, which is not an exact selection in this pass.`,
            pass.index,
            selection.sourceSpan,
            actionIndex,
          )
          structurallyInvalidActions.add(actionIndex)
        }
      }

      const primarySelection = actionPrimarySelection(action)
      const coordinate = actionStopCoordinate(action, pass)
      if (coordinate !== null) {
        const outOfOrder = pass.direction === '>>'
          ? coordinate < priorActionCoordinate
          : coordinate > priorActionCoordinate
        if (outOfOrder) {
          add(
            'error',
            'kinematic',
            'machine-trace.action-direction-order',
            // Stryker disable next-line StringLiteral: Diagnostic prose only; exact rule, severity, class, action index, and source location remain mutation-tested.
            `Action at ${coordinate} on the ${primarySelection!.bed} bed is out of ${pass.direction} traversal order after ${priorActionCoordinate}.`,
            pass.index,
            span,
            actionIndex,
          )
          structurallyInvalidActions.add(actionIndex)
        }
        priorActionCoordinate = coordinate
        // actionStopCoordinate returns a coordinate only when this selection exists.
        const operatedSelection = primarySelection!
        if (!contains(carriage, coordinate)) {
          add(
            'error',
            'kinematic',
            'machine-trace.selection-outside-carriage',
            `Operated selection ${operatedSelection.bed}:${operatedSelection.traceCoordinate} maps to stop coordinate ${coordinate}, outside carriage stops ${carriage.left}..${carriage.right}.`,
            pass.index,
            operatedSelection.sourceSpan,
            actionIndex,
          )
          structurallyInvalidActions.add(actionIndex)
        }
        if (carrierStops !== null && !contains(carrierStops, coordinate)) {
          add(
            'error',
            'kinematic',
            'machine-trace.selection-outside-carrier',
            `Operated selection ${operatedSelection.bed}:${operatedSelection.traceCoordinate} maps to stop coordinate ${coordinate}, outside carrier ${pass.carrier} stops ${carrierStops.left}..${carrierStops.right}.`,
            pass.index,
            operatedSelection.sourceSpan,
            actionIndex,
          )
          structurallyInvalidActions.add(actionIndex)
        }
      }

      switch (action.kind) {
        case 'unknown':
          add(
            'error',
            'semantic',
            'machine-trace.unknown-action',
            `Operation ${JSON.stringify(action.operation)} cannot be executed exactly: ${action.reason}.`,
            pass.index,
            span,
            actionIndex,
          )
          break

        case 'move': {
          if (action.carrier !== pass.carrier || passSelections.length !== 0) {
            add(
              'error',
              'structural',
              action.carrier !== pass.carrier
                ? 'machine-trace.action-carrier'
                : 'machine-trace.action-operation',
              action.carrier !== pass.carrier
                ? `Move carrier ${action.carrier} does not match footer carrier ${pass.carrier}.`
                // Stryker disable next-line StringLiteral: Diagnostic prose only; the alternate stable rule identifier remains mutation-tested.
                : 'Move action requires an empty knit/tuck pass with no selected needles.',
              pass.index,
              span,
              actionIndex,
            )
          }
          const moveContract = kcodeOperationContractV1(profile, pass.operation)
          if (moveContract === null || moveContract.emptySelectionAction !== 'move') {
            add(
              'error',
              'structural',
              'machine-trace.action-operation',
              `Move action is inconsistent with operation ${JSON.stringify(pass.operation)} and its empty-selection contract.`,
              pass.index,
              span,
              actionIndex,
            )
          }
          break
        }

        case 'knit':
        case 'tuck':
        case 'drop': {
          const expected = expectedRegularKind(
            profile,
            pass.operation,
            action.at.bed,
            pass.carrier,
          )
          if (expected !== action.kind) {
            add(
              'error',
              'structural',
              'machine-trace.action-operation',
              // Stryker disable next-line StringLiteral: Diagnostic prose only; expected-kind control flow and the stable rule remain mutation-tested.
              `Operation ${pass.operation} with carrier ${pass.carrier} requires ${expected ?? 'a transfer action'} on the ${action.at.bed} bed, not ${action.kind}.`,
              pass.index,
              span,
              actionIndex,
            )
            structurallyInvalidActions.add(actionIndex)
          }
          break
        }

        case 'xfer':
        case 'split': {
          const actionContract = kcodeOperationContractV1(profile, pass.operation)
          const expectedActionKind = actionContract === null
            ? null
            : pass.carrier === '0'
              ? actionContract.carrierZeroAction
              : actionContract.carrierAction
          const normalizedExpectedActionKind = expectedActionKind === 'xfer'
            ? 'xfer'
            : expectedActionKind === 'split'
              ? 'split'
              : null
          if (action.kind !== normalizedExpectedActionKind) {
            add(
              'error',
              'structural',
              'machine-trace.action-carrier',
              `Operation ${pass.operation} with carrier ${pass.carrier} requires ${normalizedExpectedActionKind ?? 'a non-transfer action'}, not ${action.kind}.`,
              pass.index,
              span,
              actionIndex,
            )
            structurallyInvalidActions.add(actionIndex)
          }
          const expectedSourceBed = expectedTransferSourceBed(profile, pass.operation)
          if (action.source.bed !== expectedSourceBed) {
            add(
              'error',
              'structural',
              'machine-trace.action-operation',
              `Operation ${pass.operation} does not select ${action.source.bed} as its transfer source bed.`,
              pass.index,
              span,
              actionIndex,
            )
            structurallyInvalidActions.add(actionIndex)
          }
          if (action.source.bed === action.target.bed) {
            add(
              'error',
              'semantic',
              'machine-trace.transfer-bed-pair',
              `${action.kind} source and target must be on opposite beds.`,
              pass.index,
              span,
              actionIndex,
            )
            structurallyInvalidActions.add(actionIndex)
          }
          const expectedTarget = expectedTransferTarget(
            profile,
            pass.operation,
            action.source,
            pass.rack,
          )
          if (!sameCoordinate(action.target.traceCoordinate, expectedTarget)) {
            add(
              'error',
              'semantic',
              'machine-trace.transfer-rack-pair',
              `${action.kind} ${action.source.bed}:${action.source.traceCoordinate} at rack ${pass.rack} requires target coordinate ${expectedTarget}, not ${action.target.traceCoordinate}.`,
              pass.index,
              span,
              actionIndex,
            )
            structurallyInvalidActions.add(actionIndex)
          }
          if (action.kind === 'split' && action.carrier !== pass.carrier) {
            add(
              'error',
              'structural',
              'machine-trace.action-carrier',
              `Split carrier ${action.carrier} must match footer carrier ${pass.carrier}.`,
              pass.index,
              span,
              actionIndex,
            )
            structurallyInvalidActions.add(actionIndex)
          }
          break
        }
      }
    }

    for (const selection of passSelections) {
      const identity = selectionIdentity(selection)
      const uses = selectionUse.get(identity) ?? 0
      if (uses !== 1) {
        add(
          'error',
          'structural',
          'machine-trace.action-selection-coverage',
          `Selection ${selection.bed}:${selection.traceCoordinate} is consumed by ${uses} actions; exactly one is required.`,
          pass.index,
          selection.sourceSpan,
        )
      }
    }

    for (const [actionIndex, action] of pass.actions.entries()) {
      if (structurallyInvalidActions.has(actionIndex)) continue
      const span = actionSpan(action, pass)
      const deltas = machineLoopActionDeltasV1(
        action,
        (bed, coordinate) => getStack(state, bed, coordinate),
      )
      switch (action.kind) {
        case 'tuck': {
          checkLoopStackPolicy(
            deltas[0]!.afterCount,
            pass,
            span,
            actionIndex,
            `Tuck stack ${action.at.bed}:${action.at.traceCoordinate}`,
          )
          break
        }

        case 'drop': {
          if (deltas[0]!.beforeCount === 0) {
            add(
              'warning',
              'semantic',
              'machine-trace.drop-empty',
              `Drop targets empty ${action.at.bed}:${action.at.traceCoordinate} under empty-bed replay, so no modeled loop state changes. Operational machine consequence is unverified.`,
              pass.index,
              span,
              actionIndex,
            )
          }
          break
        }

        case 'xfer':
        case 'split': {
          if (deltas.length === 0) {
            add(
              'error',
              'semantic',
              'machine-trace.transfer-source-empty',
              `${action.kind} source ${action.source.bed}:${action.source.traceCoordinate} is empty.`,
              pass.index,
              span,
              actionIndex,
            )
            break
          }
          checkLoopStackPolicy(
            deltas[0]!.afterCount,
            pass,
            span,
            actionIndex,
            `${action.kind} target ${action.target.bed}:${action.target.traceCoordinate}`,
          )
          break
        }
      }
      for (const delta of deltas) {
        setStack(state, delta.bed, delta.traceCoordinate, delta.afterCount)
      }
    }

    passStates.push({
      passIndex: pass.index,
      before,
      after: stateMetrics(state),
      stackDeltas: touchedCoordinates.map((coordinate) => ({
        bed: coordinate.bed,
        traceCoordinate: coordinate.traceCoordinate,
        beforeCount: beforeCounts.get(
          stackKey(coordinate.bed, coordinate.traceCoordinate),
        ) ?? 0,
        afterCount: getStack(
          state,
          coordinate.bed,
          coordinate.traceCoordinate,
        ),
      })),
    })
  }

  for (const group of omittedDiagnosticGroups.values()) {
    diagnostics.push({
      severity: group.severity,
      class: group.class,
      rule: group.rule,
      // Stryker disable next-line StringLiteral: Diagnostic prose only; exact rule, severity, class, occurrence count, and totals remain mutation-tested.
      message: `MachineTrace diagnostics for ${group.rule} were truncated after ${MAX_MACHINE_VALIDATION_DIAGNOSTIC_DETAILS} total detailed findings; omitted ${group.count} additional ${group.severity} finding${group.count === 1 ? '' : 's'}.`,
      passIndex: null,
      sourceSpan: null,
      line: null,
      column: null,
      endLine: null,
      endColumn: null,
      occurrences: group.count,
    })
  }

  diagnostics.sort((a, b) =>
    (a.passIndex ?? -1) - (b.passIndex ?? -1)
    || (a.sourceSpan?.start.offset ?? -1) - (b.sourceSpan?.start.offset ?? -1)
    || (a.actionIndex ?? -1) - (b.actionIndex ?? -1)
    || a.rule.localeCompare(b.rule)
    || a.message.localeCompare(b.message))

  const profileConformance = diagnostics.some((diagnostic) =>
    diagnostic.severity === 'error'
    && diagnostic.class !== 'operational-advisory')
    ? 'blocked'
    : 'conformant'
  const stateDiagnostics = diagnostics.filter((diagnostic) =>
    diagnostic.rule === 'machine-trace.drop-empty'
    || diagnostic.rule === 'machine-trace.loop-stack-policy')
  const modeledState = profileConformance === 'blocked'
    || stateDiagnostics.some((diagnostic) => diagnostic.severity === 'error')
    ? 'blocked'
    : stateDiagnostics.length > 0
      ? 'review'
      : 'conformant'
  const operationalDiagnostics = diagnostics.filter((diagnostic) =>
    diagnostic.class === 'operational-advisory')
  const operationalPolicy = operationalDiagnostics.some((diagnostic) => diagnostic.severity === 'error')
    ? 'blocked'
    : operationalDiagnostics.length > 0
      ? 'review'
      : 'clear'

  return {
    ok: errorCount === 0,
    profileConformance,
    modeledState,
    operationalPolicy,
    controllerAcceptance: 'not-established-by-software-validation',
    diagnostics,
    errorCount,
    warningCount,
    passStates,
    finalState: snapshotMachineLoopStateV1(state),
    operationalAssurance: OPERATIONAL_ASSURANCE,
  }
}
