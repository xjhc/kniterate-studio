/**
 * P2.1 (2026-05-23): the canonical "run" data type for a single
 * Kniterate export.
 *
 * The wizard, the parity test fixtures, and the future Run/Checks tab
 * all read from this artifact instead of assembling state imperatively.
 * The two-phase split keeps the pure compile separate from the
 * effectful `.kc` conversion (which is async-by-environment: browser
 * iframe round-trip or Node `spawnSync`).
 *
 * See docs/SYSTEM-DESIGN.md §A.5 (component architecture / RunArtifact).
 */

import { compileChartToKnitout, type CompileChartInput, type CompileChartResult } from './compile/from-chart.js'
import { writeKnitoutProgram } from './emitter.js'
import { validateKnitoutProgram, type ValidationMessage } from '../validators/knitout-program.js'
import { validateBedState } from '../validators/bed-state.js'
import { validateCarriagePolicy } from '../validators/carriage-policy.js'
import type { KniteratePlan } from './plan/types.js'
import type { KnitoutProgram } from './types.js'
import type { PredictedPass } from './sim/types.js'
import type { RecipeCarriagePolicy } from './recipes/types.js'

/**
 * Pure (synchronous) compile output. Everything in this object is
 * deterministic given the chart + recipe input. No I/O, no DOM, no
 * subprocess.
 */
export interface CompiledRunArtifact {
  /** Whether the compile produced a usable plan/program. False when any
   *  bed-state, program-validation, or chart-level message is `error`. */
  readonly ok: boolean
  /** The intermediate plan. Always present when compile succeeded. */
  readonly plan?: KniteratePlan
  /** The emitted knitout program. Always present when compile succeeded
   *  (even if `ok=false` due to a soft bed-state error — the program is
   *  still useful for diagnostics). */
  readonly program?: KnitoutProgram
  /** CarriageSimulator predicted-pass traces concatenated in walk order
   *  (waste → release bridges → carrier-intro → back-bed clear → body →
   *  bind-off). Phase 4b (2026-05-24) threads `nextDirection` between
   *  sim-backed emitters via `initialNextDirection`/`finalNextDirection`.
   *  Phase E continues retiring legacy/raw routes; once every path shares
   *  one simulator-owned state model this can graduate from trace
   *  observability to byte-perfect whole-program accuracy. */
  readonly predictedPasses: readonly PredictedPass[]
  /** Source design rows aligned one-to-one with `program.ops`. `null`
   *  identifies frame, setup, or finishing ops with no chart-row owner. */
  readonly programOpSourceRows: readonly (readonly number[] | null)[]
  /** Bed-state validator messages — a separate oracle (loop-state, not
   *  kc structural prediction). Kept distinct from `programMessages` so
   *  the Run tab can label them separately. */
  readonly bedStateMessages: readonly ValidationMessage[]
  /** Program-level validator messages (`validateKnitoutProgram`). */
  readonly programMessages: readonly ValidationMessage[]
  /** Chart-level + plan-builder messages (from `compileChartToKnitout`
   *  before the program/bed validators run). Includes the new P1.3 hard
   *  gates: `compile-bindoff-drop-developer-only`,
   *  `compile-shape-mode-cable-events`, `compile-shape-mode-shift-events`. */
  readonly chartMessages: readonly ValidationMessage[]
  /** Phase 5 (2026-05-24): carriage-policy validator messages
   *  (`carriage-policy-*` rules). Empty when the recipe has no
   *  `validation.carriage` policy. A `reject`-mode policy produces
   *  errors that count toward `ok`; `warn` mode produces warnings
   *  that don't gate compile. */
  readonly carriageMessages: readonly ValidationMessage[]
  /** Free-form notes (engine-emitted reasons, deferred-feature flags). */
  readonly notes: readonly string[]
  /** Stable hash of the input — wizard reuses this to skip re-compiling
   *  unchanged inputs and to key per-source kc conversions in
   *  `RunChecksSection`. Implemented as an 8-hex djb2 over a key-sorted
   *  stable JSON serialization (see `computeInputHash`); not
   *  cryptographic, just a content fingerprint. */
  readonly inputHash: string
  /** Convenience: serialized `.k` text. `null` when compile failed. */
  readonly knitoutText: string | null
}

/**
 * Two-phase RunArtifact. Adds the effectful `kcConversion` to the pure
 * compile output. kc conversion is async-by-environment (browser
 * iframe round-trip with a 30s timeout, OR Node `spawnSync` over the
 * vendored converter); the wrapper isolates that effect.
 */
export interface RunArtifact extends CompiledRunArtifact {
  readonly kcConversion: {
    readonly ok: boolean
    readonly text?: string
    readonly error?: string
  }
}

export function validationMessagesForRunArtifact(
  artifact: CompiledRunArtifact,
): readonly ValidationMessage[] {
  return [
    ...artifact.chartMessages,
    ...artifact.programMessages,
    ...artifact.bedStateMessages,
    ...artifact.carriageMessages,
  ]
}

export function firstBlockingMessageForRunArtifact(
  artifact: CompiledRunArtifact,
): string | undefined {
  return validationMessagesForRunArtifact(artifact)
    .find(message => message.severity === 'error')
    ?.message
}

export function compileResultWithRunArtifactMessages(
  result: CompileChartResult,
  artifact: CompiledRunArtifact,
): CompileChartResult {
  return {
    ...result,
    ok: artifact.ok,
    messages: [...validationMessagesForRunArtifact(artifact)],
  }
}

export type ValidationMessageBucket = 'chart' | 'program' | 'bed-state'

export function classifyValidationMessage(
  messageOrRule: ValidationMessage | string,
): ValidationMessageBucket {
  const rule = typeof messageOrRule === 'string'
    ? messageOrRule
    : messageOrRule.rule
  if (rule.startsWith('bed-state-')) return 'bed-state'
  if (rule.startsWith('program-')
    || rule.startsWith('knitout-')
    || rule.startsWith('emit-')) return 'program'
  return 'chart'
}

/** Build the pure artifact from a CompileChartInput. */
export function compileToRunArtifact(
  input: CompileChartInput,
  options: { carriagePolicy?: RecipeCarriagePolicy } = {},
): CompiledRunArtifact {
  const result = compileChartToKnitout(input)
  return runArtifactFromCompileResult(result, computeInputHash(input), options)
}

/** Build the pure artifact from an existing CompileChartResult. Useful
 *  when callers (e.g. `compileExport`) have already run compile through
 *  a wrapper that adds bookkeeping. */
export function runArtifactFromCompileResult(
  result: CompileChartResult,
  inputHash: string,
  options: { carriagePolicy?: RecipeCarriagePolicy } = {},
): CompiledRunArtifact {
  // The existing CompileChartResult already merged program + bed-state
  // messages into a single list; re-split them by rule prefix so the
  // artifact can label each surface separately.
  const programMessages: ValidationMessage[] = []
  const bedStateMessages: ValidationMessage[] = []
  const chartMessages: ValidationMessage[] = []
  for (const m of result.messages) {
    const bucket = classifyValidationMessage(m)
    if (bucket === 'bed-state') bedStateMessages.push(m)
    else if (bucket === 'program') programMessages.push(m)
    else chartMessages.push(m)
  }

  return buildCompiledRunArtifact({
    ok: result.ok,
    plan: result.plan,
    program: result.program,
    inputHash,
    chartMessages,
    programMessages,
    bedStateMessages,
    carriagePolicy: options.carriagePolicy,
  })
}

function buildCompiledRunArtifact(input: {
  ok: boolean
  plan?: KniteratePlan
  program?: KnitoutProgram
  inputHash: string
  chartMessages: readonly ValidationMessage[]
  programMessages: readonly ValidationMessage[]
  bedStateMessages: readonly ValidationMessage[]
  carriagePolicy?: RecipeCarriagePolicy
}): CompiledRunArtifact {
  const {
    ok,
    plan,
    program,
    inputHash,
    chartMessages,
    programMessages,
    bedStateMessages,
    carriagePolicy,
  } = input

  // Phase 4a-4c + Phase E slices: plan-side accumulator collects
  // predicted-pass traces from each simulator-backed section/bridge and
  // threads vendor nextDirection through them. See
  // KniteratePlan.predictedPasses for the remaining Phase E caveat.
  // Empty only when the plan came from a path that has not been wired
  // through simulator-backed sections, or when every section is on a
  // non-sim emitter.
  const predictedPasses: readonly PredictedPass[] = plan?.predictedPasses ?? []
  const programOpSourceRows = program?.ops.map(op => op.sourceRows ?? null) ?? []

  const notes: string[] = []
  if (predictedPasses.length === 0 && program) {
    notes.push(
      'predictedPasses empty for this compile path — either the plan came from a non-Track-A compile or every emitter pre-dates the simulator cutover.',
    )
  } else if (predictedPasses.length > 0) {
    notes.push(
      'predictedPasses threads direction between sim-backed emitters (Phase 4b) and accounts for raw ops between them (Phase 4c). The bind-off section\'s tail can still diverge from vendor — see KniteratePlan.predictedPasses for the full caveat.',
    )
  }

  // Phase 5 (2026-05-24): carriage-policy gate. Reject-mode failures
  // promote to errors and gate `ok`; warn-mode failures inform without
  // gating. Scoped to recipes whose predicted trace is trusted enough
  // for that policy; recipes with unresolved Phase-E trace drift should
  // omit `validation.carriage`.
  const carriageReport = validateCarriagePolicy(predictedPasses, carriagePolicy)
  const carriageMessages = carriageReport.messages
  const okWithCarriage = ok && carriageReport.errorCount === 0

  const knitoutText = okWithCarriage && program
    ? writeKnitoutProgram(program)
    : null

  return {
    ok: okWithCarriage,
    plan,
    program,
    predictedPasses,
    programOpSourceRows,
    bedStateMessages,
    programMessages,
    chartMessages,
    carriageMessages,
    notes,
    inputHash,
    knitoutText,
  }
}

/**
 * Async-but-contained kc conversion wrapper. The actual converter is
 * environment-specific — Node uses `spawnSync` over a vendored CommonJS
 * file (`src/knitout/kniterate/to-kcode.ts`), browser routes through a
 * 1×1 visualizer iframe with `requestKCode`. Both paths take a
 * `KnitoutProgram` (serialized as `.k` text) and yield `.kc` text.
 *
 * Callers pass the converter so this module stays environment-agnostic
 * (no `node:child_process` or DOM globals leak into the library).
 */
export type KCodeConverter = (knitoutText: string) => Promise<{
  ok: boolean
  kcode?: string
  error?: string
}>

export async function convertRunArtifactToKCode(
  compiled: CompiledRunArtifact,
  converter: KCodeConverter,
): Promise<RunArtifact> {
  if (!compiled.ok || compiled.knitoutText === null) {
    return {
      ...compiled,
      kcConversion: {
        ok: false,
        error: 'compile failed; no knitout to convert',
      },
    }
  }
  try {
    const result = await converter(compiled.knitoutText)
    return {
      ...compiled,
      kcConversion: result.ok
        ? { ok: true, text: result.kcode }
        : { ok: false, error: result.error ?? 'kc converter returned !ok with no error message' },
    }
  } catch (err) {
    return {
      ...compiled,
      kcConversion: {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      },
    }
  }
}

/**
 * Deterministic 8-hex input fingerprint (djb2 over a key-sorted JSON
 * stringify). Use to key per-source artifacts or skip recompute when
 * the input shape is unchanged.
 *
 * Not cryptographic — collisions are theoretically possible. The use
 * cases are equality keys, not integrity signatures.
 *
 * Accepts arbitrary input, not just `CompileChartInput`: callers also
 * hash the per-panel context (panelId + panelLabel) when the actual
 * compile result is the load-bearing identity. Maps are expanded by
 * insertion order after their keys are sorted.
 */
export function computeInputHash(input: unknown): string {
  return djb2(stableStringify(input))
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return '[' + value.map(stableStringify).join(',') + ']'
  if (value instanceof Map) {
    const entries = [...value.entries()].sort(([a], [b]) =>
      String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0)
    return '{' + entries.map(([k, v]) => JSON.stringify(String(k)) + ':' + stableStringify(v)).join(',') + '}'
  }
  const obj = value as Record<string, unknown>
  const keys = Object.keys(obj).sort()
  return '{' + keys.map(k => JSON.stringify(k) + ':' + stableStringify(obj[k])).join(',') + '}'
}

function djb2(s: string): string {
  let h = 5381
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h + s.charCodeAt(i)) | 0
  }
  // Unsigned, hex.
  return (h >>> 0).toString(16).padStart(8, '0')
}

// Re-export the validators so consumers can call them independently
// (e.g. to validate a plan synthesized outside the chart pipeline).
export { validateKnitoutProgram, validateBedState }
