/**
 * KCode comparison surfaces.
 *
 * `diffKCodeMachineTrace` is the authoritative comparison: callers must name
 * both the machine profile and dialect, both inputs must pass the strict
 * lossless parser, and every machine-significant MachineTraceV1 field is
 * compared.
 *
 * `diffKc` is retained for historical callers. It compares only the five
 * tokens in each pass footer. Its `identical` result must not be interpreted
 * as raster, stop, stitch-selector, action, or full-program equivalence.
 */

import { parseKCodeDocument } from './kcode/parser.js'
import {
  projectKCodeMachineTrace,
  type MachineTraceActionV1,
  type MachineTracePassV1,
  type MachineTraceSelectionV1,
  type MachineTraceV1,
} from './kcode/machine-trace.js'
import type {
  KCodeDialect,
  KCodeMachineProfileV1,
} from './kcode/machine-profile.js'
import type { KCodeDiagnostic } from './kcode/types.js'
import { parseKcPasses, type ParsedKcPass } from './sim/kc-parse.js'

export type KcPassField = 'direction' | 'type' | 'carrier' | 'speed' | 'roller' | 'length'

export interface KcPassDelta {
  index: number
  /** Which footer field first diverged (or `length` when one side ran out). */
  field: KcPassField
  generated: string | null
  reference: string | null
}

/**
 * Historical footer-token comparison result.
 *
 * `identical` means footer-token-identical only. It is intentionally not an
 * emitted KCode or machine-trace equivalence claim.
 */
export interface KcDiff {
  readonly comparison: 'legacy-footer-only'
  /** Same pass count and same direction/type/carrier/speed/roller footers. */
  identical: boolean
  generatedPassCount: number
  referencePassCount: number
  firstDelta: KcPassDelta | null
  /** Total diverging pass indices (capped list in `deltas`). */
  deltaCount: number
  deltas: KcPassDelta[]
  /** Raw text parity, only set when `opts.bytes` is requested. */
  byteIdentical?: boolean
  firstLineDelta?: { index: number; generated: string | null; reference: string | null } | null
}

export interface KcDiffOptions {
  /** Cap on `deltas` length (firstDelta is always reported). Default 50. */
  maxDeltas?: number
  /** Also compute exact source-text and first-line parity. Default false. */
  bytes?: boolean
}

export function formatPass(p: ParsedKcPass): string {
  return `${p.direction} ${p.type} ${p.carrier} ${p.speed} ${p.roller}`
}

/** First footer field on which two legacy parsed passes diverge. */
function divergentField(g: ParsedKcPass, r: ParsedKcPass): KcPassField | null {
  if (g.direction !== r.direction) return 'direction'
  if (g.type !== r.type) return 'type'
  if (g.carrier !== r.carrier) return 'carrier'
  if (g.speed !== r.speed) return 'speed'
  if (g.roller !== r.roller) return 'roller'
  return null
}

/**
 * Legacy, footer-only KCode comparison.
 *
 * This remains source-compatible with existing parity reports, but it does
 * not inspect FRNT/STIF/REAR/STIR rasters or machine stops. New validation and
 * emitted-output equivalence callers must use `diffKCodeMachineTrace`.
 */
export function diffKc(generated: string, reference: string, opts: KcDiffOptions = {}): KcDiff {
  const maxDeltas = normalizeMaxDeltas(opts.maxDeltas)
  const gen = parseKcPasses(generated)
  const ref = parseKcPasses(reference)

  const deltas: KcPassDelta[] = []
  let deltaCount = 0
  let firstDelta: KcPassDelta | null = null
  const len = Math.max(gen.length, ref.length)
  for (let i = 0; i < len; i++) {
    const g = gen[i]
    const r = ref[i]
    let delta: KcPassDelta | null = null
    if (!g || !r) {
      delta = {
        index: i,
        field: 'length',
        generated: g ? formatPass(g) : null,
        reference: r ? formatPass(r) : null,
      }
    } else {
      const field = divergentField(g, r)
      if (field !== null) {
        delta = { index: i, field, generated: formatPass(g), reference: formatPass(r) }
      }
    }
    if (delta !== null) {
      deltaCount++
      firstDelta ??= delta
      if (deltas.length < maxDeltas) deltas.push(delta)
    }
  }

  const diff: KcDiff = {
    comparison: 'legacy-footer-only',
    identical: deltaCount === 0,
    generatedPassCount: gen.length,
    referencePassCount: ref.length,
    firstDelta,
    deltaCount,
    deltas,
  }

  if (opts.bytes) {
    diff.byteIdentical = generated === reference
    diff.firstLineDelta = firstLineDelta(generated, reference)
  }

  return diff
}

export interface KCodeMachineTraceDiffOptions extends KcDiffOptions {
  /** Required fixed target contract. There is deliberately no default. */
  readonly profile: KCodeMachineProfileV1
  /** Required source dialect. The strict comparator never guesses it. */
  readonly dialect: KCodeDialect
}

export interface KCodeMachineTraceInputReport {
  readonly ok: boolean
  /** Strict parser diagnostics, retained even when projection also fails. */
  readonly diagnostics: readonly KCodeDiagnostic[]
  /** Parsed pass blocks; this is not a successful-trace count when `ok=false`. */
  readonly parsedPassCount: number
  /** Projection failures block comparison rather than degrading to footer parsing. */
  readonly projectionError: string | null
}

/** One machine-significant leaf difference in a projected pass. */
export interface KCodeMachineTraceDelta {
  /** Pass-window anchor; program-level rack commands use their nearest boundary pass. */
  readonly index: number
  /** Stable path within the trace program/pass, or `length` for a missing pass. */
  readonly field: string
  /** Deterministic display form; null denotes a missing pass/value. */
  readonly generated: string | null
  readonly reference: string | null
}

interface KCodeMachineTraceDiffBase {
  readonly comparison: 'strict-machine-trace-v1'
  readonly generatedPassCount: number
  readonly referencePassCount: number
  readonly generatedInput: KCodeMachineTraceInputReport
  readonly referenceInput: KCodeMachineTraceInputReport
  readonly byteIdentical?: boolean
  readonly firstLineDelta?: {
    readonly index: number
    readonly generated: string | null
    readonly reference: string | null
  } | null
}

export interface KCodeMachineTraceDiffBlocked extends KCodeMachineTraceDiffBase {
  readonly status: 'blocked'
  /** Invalid input is never reported as equivalent. */
  readonly identical: false
  readonly firstDelta: null
  readonly deltaCount: 0
  readonly deltas: readonly []
}

export interface KCodeMachineTraceDiffCompared extends KCodeMachineTraceDiffBase {
  readonly status: 'compared'
  readonly identical: boolean
  readonly firstDelta: KCodeMachineTraceDelta | null
  /** Total differing leaf fields, before the `deltas` cap. */
  readonly deltaCount: number
  readonly deltas: readonly KCodeMachineTraceDelta[]
}

export type KCodeMachineTraceDiff =
  | KCodeMachineTraceDiffBlocked
  | KCodeMachineTraceDiffCompared

interface ParsedTraceInput {
  readonly report: KCodeMachineTraceInputReport
  readonly trace: MachineTraceV1 | null
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function parseTraceInput(
  source: string,
  options: Pick<KCodeMachineTraceDiffOptions, 'profile' | 'dialect'>,
): ParsedTraceInput {
  const parsed = parseKCodeDocument(source, {
    profile: options.profile,
    dialect: options.dialect,
    strict: true,
  })
  if (!parsed.ok) {
    return {
      report: {
        ok: false,
        diagnostics: parsed.diagnostics,
        parsedPassCount: parsed.document.passes.length,
        projectionError: null,
      },
      trace: null,
    }
  }

  try {
    const trace = projectKCodeMachineTrace(parsed.document, options.profile)
    return {
      report: {
        ok: true,
        diagnostics: parsed.diagnostics,
        parsedPassCount: trace.passes.length,
        projectionError: null,
      },
      trace,
    }
  } catch (error) {
    return {
      report: {
        ok: false,
        diagnostics: parsed.diagnostics,
        parsedPassCount: parsed.document.passes.length,
        projectionError: errorMessage(error),
      },
      trace: null,
    }
  }
}

type SignificantScalar = string | number | boolean | null
type SignificantValue =
  | SignificantScalar
  | readonly SignificantValue[]
  | { readonly [key: string]: SignificantValue }

function selectionValue(selection: MachineTraceSelectionV1): SignificantValue {
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

function actionValue(action: MachineTraceActionV1): SignificantValue {
  switch (action.kind) {
    case 'knit':
    case 'tuck':
    case 'drop':
      return { kind: action.kind, at: selectionValue(action.at) }
    case 'xfer':
      return {
        kind: action.kind,
        source: selectionValue(action.source),
        target: selectionValue(action.target),
      }
    case 'split':
      return {
        kind: action.kind,
        source: selectionValue(action.source),
        target: selectionValue(action.target),
        carrier: action.carrier,
      }
    case 'move':
      return { kind: action.kind, carrier: action.carrier }
    case 'unknown':
      return {
        kind: action.kind,
        operation: action.operation,
        reason: action.reason,
        selections: action.selections.map(selectionValue),
      }
  }
}

function rackCommandValue(command: MachineTraceV1['rackCommands'][number]): SignificantValue {
  return {
    beforePassIndex: command.beforePassIndex,
    valueRaw: command.valueRaw,
    value: command.value,
  }
}

function rackDeltaPassIndex(
  generated: MachineTraceV1['rackCommands'][number] | undefined,
  reference: MachineTraceV1['rackCommands'][number] | undefined,
  passCount: number,
): number {
  if (passCount === 0) return 0
  const boundary = Math.min(
    generated?.beforePassIndex ?? Number.POSITIVE_INFINITY,
    reference?.beforePassIndex ?? Number.POSITIVE_INFINITY,
  )
  return Math.min(Number.isFinite(boundary) ? boundary : 0, passCount - 1)
}

function compareRackCommands(
  generated: MachineTraceV1,
  reference: MachineTraceV1,
  collector: DeltaCollector,
): void {
  const generatedCommands = generated.rackCommands
  const referenceCommands = reference.rackCommands
  const passCount = Math.max(generated.passes.length, reference.passes.length)
  const overlap = Math.min(generatedCommands.length, referenceCommands.length)
  if (generatedCommands.length !== referenceCommands.length) {
    addTraceDelta(
      collector,
      rackDeltaPassIndex(generatedCommands[overlap], referenceCommands[overlap], passCount),
      'rackCommands.length',
      generatedCommands.length,
      referenceCommands.length,
    )
  }
  for (let commandIndex = 0; commandIndex < overlap; commandIndex++) {
    const generatedCommand = generatedCommands[commandIndex]!
    const referenceCommand = referenceCommands[commandIndex]!
    compareSignificantValue(
      rackCommandValue(generatedCommand),
      rackCommandValue(referenceCommand),
      `rackCommands[${commandIndex}]`,
      rackDeltaPassIndex(generatedCommand, referenceCommand, passCount),
      collector,
    )
  }
  for (let commandIndex = overlap; commandIndex < Math.max(generatedCommands.length, referenceCommands.length); commandIndex++) {
    const generatedCommand = generatedCommands[commandIndex]
    const referenceCommand = referenceCommands[commandIndex]
    addTraceDelta(
      collector,
      rackDeltaPassIndex(generatedCommand, referenceCommand, passCount),
      `rackCommands[${commandIndex}]`,
      generatedCommand === undefined ? undefined : rackCommandValue(generatedCommand),
      referenceCommand === undefined ? undefined : rackCommandValue(referenceCommand),
    )
  }
}

/**
 * Strip source spans but retain every field that changes programmed machine
 * behavior or exact pass serialization. Key order defines useful delta order:
 * scalar controls, stops, selections, actions, then exact raw rasters/footer.
 */
function significantPassValue(pass: MachineTracePassV1): SignificantValue {
  return {
    rack: pass.rack,
    direction: pass.direction,
    operation: pass.operation,
    carrier: pass.carrier,
    speedRaw: pass.speedRaw,
    speed: pass.speed,
    rollerRaw: pass.rollerRaw,
    roller: pass.roller,
    carriageStops: {
      left: pass.carriageStops.left,
      right: pass.carriageStops.right,
    },
    carrierStops: pass.carrierStops === null
      ? null
      : { left: pass.carrierStops.left, right: pass.carrierStops.right },
    selections: {
      front: pass.selections.front.map(selectionValue),
      rear: pass.selections.rear.map(selectionValue),
    },
    actions: pass.actions.map(actionValue),
    raw: {
      FRNT: pass.raw.FRNT,
      STIF: pass.raw.STIF,
      REAR: pass.raw.REAR,
      STIR: pass.raw.STIR,
      footer: pass.raw.footer,
    },
  }
}

function missingPassDisplay(pass: MachineTracePassV1 | undefined): SignificantValue | undefined {
  if (pass === undefined) return undefined
  return `${pass.direction} ${pass.operation} ${pass.carrier} ${pass.speedRaw} ${pass.rollerRaw}`
}

function isRecord(value: SignificantValue): value is { readonly [key: string]: SignificantValue } {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function displayValue(value: SignificantValue | undefined): string | null {
  if (value === undefined) return null
  if (typeof value === 'number' && Object.is(value, -0)) return '-0'
  return JSON.stringify(value)
}

interface DeltaCollector {
  readonly maxDeltas: number
  deltaCount: number
  firstDelta: KCodeMachineTraceDelta | null
  readonly deltas: KCodeMachineTraceDelta[]
}

function addTraceDelta(
  collector: DeltaCollector,
  index: number,
  field: string,
  generated: SignificantValue | undefined,
  reference: SignificantValue | undefined,
): void {
  const delta: KCodeMachineTraceDelta = {
    index,
    field,
    generated: displayValue(generated),
    reference: displayValue(reference),
  }
  collector.deltaCount++
  collector.firstDelta ??= delta
  if (collector.deltas.length < collector.maxDeltas) collector.deltas.push(delta)
}

function compareSignificantValue(
  generated: SignificantValue,
  reference: SignificantValue,
  path: string,
  index: number,
  collector: DeltaCollector,
): void {
  if (Object.is(generated, reference)) return

  if (Array.isArray(generated) && Array.isArray(reference)) {
    if (generated.length !== reference.length) {
      addTraceDelta(collector, index, `${path}.length`, generated.length, reference.length)
    }
    const overlap = Math.min(generated.length, reference.length)
    for (let item = 0; item < overlap; item++) {
      compareSignificantValue(
        generated[item]!,
        reference[item]!,
        `${path}[${item}]`,
        index,
        collector,
      )
    }
    for (let item = overlap; item < Math.max(generated.length, reference.length); item++) {
      addTraceDelta(
        collector,
        index,
        `${path}[${item}]`,
        generated[item],
        reference[item],
      )
    }
    return
  }

  if (isRecord(generated) && isRecord(reference)) {
    const keys = [...new Set([...Object.keys(generated), ...Object.keys(reference)])]
    for (const key of keys) {
      const generatedChild = generated[key]
      const referenceChild = reference[key]
      const childPath = path === '' ? key : `${path}.${key}`
      if (generatedChild === undefined || referenceChild === undefined) {
        addTraceDelta(collector, index, childPath, generatedChild, referenceChild)
      } else {
        compareSignificantValue(
          generatedChild,
          referenceChild,
          childPath,
          index,
          collector,
        )
      }
    }
    return
  }

  addTraceDelta(collector, index, path, generated, reference)
}

function normalizeMaxDeltas(value: number | undefined): number {
  if (value === undefined) return 50
  if (!Number.isFinite(value)) return 50
  return Math.max(0, Math.floor(value))
}

/**
 * Strictly compare two emitted KCode programs through MachineTraceV1.
 *
 * This API never guesses a dialect and never falls back to footer parsing. If
 * either source fails strict parsing or trace projection, `status` is
 * `blocked`, `identical` is false, and diagnostics identify the rejected side.
 */
export function diffKCodeMachineTrace(
  generated: string,
  reference: string,
  options: KCodeMachineTraceDiffOptions,
): KCodeMachineTraceDiff {
  const generatedInput = parseTraceInput(generated, options)
  const referenceInput = parseTraceInput(reference, options)
  const byteFields = options.bytes
    ? {
        byteIdentical: generated === reference,
        firstLineDelta: firstLineDelta(generated, reference),
      }
    : {}

  if (generatedInput.trace === null || referenceInput.trace === null) {
    return {
      comparison: 'strict-machine-trace-v1',
      status: 'blocked',
      identical: false,
      generatedPassCount: generatedInput.report.parsedPassCount,
      referencePassCount: referenceInput.report.parsedPassCount,
      generatedInput: generatedInput.report,
      referenceInput: referenceInput.report,
      firstDelta: null,
      deltaCount: 0,
      deltas: [],
      ...byteFields,
    }
  }

  const collector: DeltaCollector = {
    maxDeltas: normalizeMaxDeltas(options.maxDeltas),
    deltaCount: 0,
    firstDelta: null,
    deltas: [],
  }
  const generatedPasses = generatedInput.trace.passes
  const referencePasses = referenceInput.trace.passes
  compareRackCommands(generatedInput.trace, referenceInput.trace, collector)
  const overlap = Math.min(generatedPasses.length, referencePasses.length)
  for (let index = 0; index < overlap; index++) {
    compareSignificantValue(
      significantPassValue(generatedPasses[index]!),
      significantPassValue(referencePasses[index]!),
      '',
      index,
      collector,
    )
  }
  for (let index = overlap; index < Math.max(generatedPasses.length, referencePasses.length); index++) {
    addTraceDelta(
      collector,
      index,
      'length',
      missingPassDisplay(generatedPasses[index]),
      missingPassDisplay(referencePasses[index]),
    )
  }

  return {
    comparison: 'strict-machine-trace-v1',
    status: 'compared',
    identical: collector.deltaCount === 0,
    generatedPassCount: generatedPasses.length,
    referencePassCount: referencePasses.length,
    generatedInput: generatedInput.report,
    referenceInput: referenceInput.report,
    firstDelta: collector.firstDelta,
    deltaCount: collector.deltaCount,
    deltas: collector.deltas,
    ...byteFields,
  }
}

function firstLineDelta(
  generated: string,
  reference: string,
): { index: number; generated: string | null; reference: string | null } | null {
  const a = generated.split('\n')
  const b = reference.split('\n')
  const len = Math.max(a.length, b.length)
  for (let i = 0; i < len; i++) {
    if (a[i] !== b[i]) {
      return { index: i, generated: a[i] ?? null, reference: b[i] ?? null }
    }
  }
  return null
}

/**
 * Render a legacy footer-only `±context` window. It is intentionally labelled
 * so the output cannot be mistaken for raster or movement equivalence.
 */
export function renderKcPassWindow(
  generated: string,
  reference: string,
  index: number,
  context = 3,
): string {
  const gen = parseKcPasses(generated)
  const ref = parseKcPasses(reference)
  const lo = Math.max(0, index - context)
  const hi = Math.min(Math.max(gen.length, ref.length), index + context + 1)
  const lines = [
    'LEGACY FOOTER-ONLY COMPARISON',
    '  idx  generated                       reference',
    '  ---  ------------------------------  ------------------------------',
  ]
  for (let i = lo; i < hi; i++) {
    const g = gen[i] ? formatPass(gen[i]!) : '(missing)'
    const r = ref[i] ? formatPass(ref[i]!) : '(missing)'
    const marker = i === index ? '>>' : '  '
    lines.push(`  ${marker} ${String(i).padStart(4)}  ${g.padEnd(30)}  ${r}`)
  }
  return lines.join('\n')
}

function tracePassSummary(pass: MachineTracePassV1 | undefined): string {
  if (pass === undefined) return '(missing)'
  const carrierStops = pass.carrierStops === null
    ? '-'
    : `${pass.carrierStops.left}..${pass.carrierStops.right}`
  const selections = [
    ...pass.selections.front.map((selection) =>
      `f${selection.traceCoordinate}:${selection.stitchSelector.token}`),
    ...pass.selections.rear.map((selection) =>
      `r${selection.traceCoordinate}:${selection.stitchSelector.token}`),
  ].join(',') || '-'
  return [
    `${pass.direction} ${pass.operation} c${pass.carrier}`,
    `rack=${pass.rack}`,
    `speed=${pass.speedRaw}`,
    `roller=${pass.rollerRaw}`,
    `carriage=${pass.carriageStops.left}..${pass.carriageStops.right}`,
    `carrier=${carrierStops}`,
    `select=${selections}`,
    `actions=${pass.actions.map((action) => action.kind).join(',') || '-'}`,
  ].join(' ')
}

function traceRackSequence(trace: MachineTraceV1, lo: number, hi: number, selected: number): string {
  const lastPassIndex = Math.max(0, trace.passes.length - 1)
  const commands = trace.rackCommands.filter((command) =>
    (command.beforePassIndex >= lo && command.beforePassIndex < hi)
    || (selected === lastPassIndex && command.beforePassIndex === trace.passes.length))
  return commands.map((command) =>
    `#${command.index}@before-pass-${command.beforePassIndex + 1} raw=${JSON.stringify(command.valueRaw)} numeric=${command.value}`,
  ).join(' | ') || '-'
}

export interface RenderKCodeMachineTraceWindowOptions {
  readonly profile: KCodeMachineProfileV1
  readonly dialect: KCodeDialect
  readonly context?: number
}

export interface RenderKCodeMachineTraceWindowFromTracesOptions {
  readonly context?: number
  /**
   * Already-computed, capped strict deltas. Supplying these adds exact field
   * paths and values without reparsing either source document.
   */
  readonly deltas?: readonly KCodeMachineTraceDelta[]
}

function renderTraceWindow(
  generated: MachineTraceV1,
  reference: MachineTraceV1,
  index: number,
  options: RenderKCodeMachineTraceWindowFromTracesOptions,
): string {
  const context = Math.max(0, Math.floor(options.context ?? 3))
  const lo = Math.max(0, index - context)
  const hi = Math.min(
    Math.max(generated.passes.length, reference.passes.length),
    index + context + 1,
  )
  const lines = [
    'STRICT MACHINE-TRACE V1 COMPARISON',
    `rack commands generated: ${traceRackSequence(generated, lo, hi, index)}`,
    `rack commands reference: ${traceRackSequence(reference, lo, hi, index)}`,
  ]
  for (let passIndex = lo; passIndex < hi; passIndex++) {
    const marker = passIndex === index ? '>>' : '  '
    lines.push(`${marker} ${String(passIndex).padStart(4)} generated: ${tracePassSummary(generated.passes[passIndex])}`)
    lines.push(`        reference: ${tracePassSummary(reference.passes[passIndex])}`)
  }

  const exactDeltas = [...(options.deltas?.filter((delta) => delta.index === index) ?? [])]
  const generatedPass = generated.passes[index]
  const referencePass = reference.passes[index]
  if (generatedPass !== undefined && referencePass !== undefined) {
    for (const field of ['FRNT', 'STIF', 'REAR', 'STIR', 'footer'] as const) {
      if (generatedPass.raw[field] === referencePass.raw[field]) continue
      const path = `raw.${field}`
      if (exactDeltas.some((delta) => delta.field === path)) continue
      exactDeltas.push({
        index,
        field: path,
        generated: displayValue(generatedPass.raw[field]),
        reference: displayValue(referencePass.raw[field]),
      })
    }
  }
  if (exactDeltas.length > 0) {
    lines.push(`        exact field deltas (${exactDeltas.length})`)
    for (const delta of exactDeltas) {
      lines.push(`        ${delta.field}`)
      lines.push(`          generated: ${delta.generated ?? '(missing)'}`)
      lines.push(`          reference: ${delta.reference ?? '(missing)'}`)
    }
  }
  return lines.join('\n')
}

/**
 * Render a strict diff window from traces already projected by the caller.
 * This is the reusable path for interactive UIs: selecting multiple changed
 * passes never causes another full-file parse or projection.
 */
export function renderKCodeMachineTraceWindowFromTraces(
  generated: MachineTraceV1,
  reference: MachineTraceV1,
  index: number,
  options: RenderKCodeMachineTraceWindowFromTracesOptions = {},
): string {
  return renderTraceWindow(generated, reference, index, options)
}

/** Render an authoritative trace window with rack, stops, selections, and actions. */
export function renderKCodeMachineTraceWindow(
  generated: string,
  reference: string,
  index: number,
  options: RenderKCodeMachineTraceWindowOptions,
): string {
  const gen = parseTraceInput(generated, options)
  const ref = parseTraceInput(reference, options)
  if (gen.trace === null || ref.trace === null) {
    const summarizeBlock = (label: string, input: ParsedTraceInput): string => {
      if (input.report.ok) return `${label}: valid`
      const diagnostics = input.report.diagnostics.map((item) => item.rule).join(', ')
      return `${label}: BLOCKED (${diagnostics || input.report.projectionError || 'projection failed'})`
    }
    return [
      'STRICT MACHINE-TRACE COMPARISON BLOCKED',
      summarizeBlock('generated', gen),
      summarizeBlock('reference', ref),
    ].join('\n')
  }

  return renderTraceWindow(gen.trace, ref.trace, index, options)
}
