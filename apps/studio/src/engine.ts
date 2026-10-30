import {
  KNITERATE_7GG_KCODE_PROFILE_V2,
  compareScheduledPassesToMachineTrace,
  classifyMachineTracePassRoleV1,
  deriveMachineTraceAdvisoriesV1,
  deriveMachineTraceProgrammedMotionV1,
  diffKCodeMachineTrace,
  inspectKnitoutPasses,
  parseKCodeBytes,
  parseKCodeDocument,
  parseKnitoutProgram,
  projectKCodeMachineTrace,
  projectMachineScene,
  renderKCodeMachineTraceWindowFromTraces,
  resolveValidatorMessage,
  summarizeMachineTracePassMetricsV1,
  summarizeMachineTracePassRolesV1,
  validateKCodeMachineSafetyV1,
  validateKCodeMachineTrace,
  validateKnitoutProgram,
  type KCodeDialect,
  type KCodeDocumentV1,
  type KCodeMachineTraceDiff,
  type KCodeSourceSpan,
  type MachineSafetyReportV1,
  type MachineSceneV1,
  type MachineTraceAdvisoryReportV1,
  type MachineTracePassRoleV1,
  type MachineTraceProgrammedMotionV1,
  type MachineTracePassV1,
  type MachineTraceV1,
  type MachineValidationReportV1,
  type ResolvedValidatorMessage,
  type ScheduledTraceComparisonV1,
  type ValidationMessage,
} from '@kniterate-studio/machine-lib/browser';
import { browserKnitoutToKCode } from '@kniterate-studio/machine-lib/browser-converter';

export type MachineFormat = 'kc' | 'k';
export type VerdictState = 'blocked' | 'surface' | 'knit';
export type MachineSource = string | Uint8Array;
export const MAX_MACHINE_SOURCE_BYTES_V1 = 64 * 1024 * 1024;

/** Fixed V1 target. Keep this alias local so every Studio KCode seam shares it. */
const KNITERATE_MACHINE_PROFILE_V1 = KNITERATE_7GG_KCODE_PROFILE_V2;

export interface AuthoredVerdict {
  state: VerdictState;
  label: 'Blocked' | 'Surface-proven' | 'Knit-proven';
  annotation: string;
  evidenceId: string | null;
}

/**
 * The verdict in plain words, for the screen. `label` keeps the ladder's own
 * names (Blocked, Surface-proven, Knit-proven) for files, the CLI and the docs.
 */
export const VERDICT_WORDS: Record<VerdictState, { name: string; meaning: string }> = {
  blocked: { name: "Can't knit yet", meaning: 'The machine file did not pass its checks.' },
  surface: { name: 'File checks passed', meaning: 'The machine file passed its software checks. Physical knitting has not been verified.' },
  knit: { name: 'Proven on the machine', meaning: 'This exact file was knitted and recorded.' },
};

export interface AuthoredVerdictInput {
  compileStatus: 'queued' | 'compiling' | 'ready' | 'failed';
  compileOk: boolean | null;
  compileError: string | null;
  outputStatus: 'idle' | 'converting' | 'ready' | 'failed';
  outputOk: boolean | null;
  outputCurrent: boolean;
  outputError: string | null;
  knitProvenEntryId: string | null;
}

export function resolveAuthoredVerdict(input: AuthoredVerdictInput): AuthoredVerdict | null {
  if (input.compileStatus === 'failed' || (input.compileStatus === 'ready' && input.compileOk === false)) {
    return {
      state: 'blocked',
      label: 'Blocked',
      annotation: input.compileError ?? 'The authored project has blocking compiler findings.',
      evidenceId: null,
    };
  }
  if (input.compileStatus !== 'ready' || input.compileOk !== true) return null;
  if (input.outputStatus === 'failed' || (input.outputStatus === 'ready' && input.outputOk === false)) {
    return {
      state: 'blocked',
      label: 'Blocked',
      annotation: input.outputError ?? 'Generated K-code did not pass output validation.',
      evidenceId: null,
    };
  }
  if (input.outputStatus !== 'ready' || input.outputOk !== true || !input.outputCurrent) return null;
  if (input.knitProvenEntryId) {
    return {
      state: 'knit',
      label: 'Knit-proven',
      annotation: `This exact compiled artifact has a current clean physical registry match: ${input.knitProvenEntryId}.`,
      evidenceId: input.knitProvenEntryId,
    };
  }
  return {
    state: 'surface',
    label: 'Surface-proven',
    annotation: 'The emitted KCode conforms to the versioned V1 operation, direction, carrier, rack, selection, transfer, stop, and continuity contract and passed exact scheduled-backend differential and empty-bed state replay. Controller acceptance and physical yarn, tension, and fabric behavior remain separate gates.',
    evidenceId: null,
  };
}

export interface MachinePass {
  index: number;
  direction: '>>' | '<<' | null;
  type: string;
  carriers: readonly string[];
  beds: string;
  needleSpan: string;
  rack: number | null;
  speed: number | null;
  roller: number | null;
  lineStart: number;
  lineEnd: number;
  section: string;
  ghost: boolean;
  /** Foreign machine files only: what the strict-trace pass does. */
  role?: MachineTracePassRoleV1;
  /**
   * Foreign machine files only. Knitout imports join each emitted pass to the
   * pinned backend's scheduled source lines; direct KCode records no origin.
   */
  origin?: MachinePassOrigin;
}

export type MachinePassOrigin =
  | 'knitout-directed'
  | 'backend-inserted'
  | 'not-recorded-in-kcode';

export type MachineDiagnosticClass =
  | 'syntax'
  | 'structural'
  | 'semantic'
  | 'kinematic'
  | 'operational-advisory'
  | 'machine-safety'
  | 'knitout';

export interface MachineDiagnostic extends ResolvedValidatorMessage {
  id: string;
  passIndex: number | null;
  actionIndex: number | null;
  line: number | null;
  sourceSpan: KCodeSourceSpan | null;
  classification: MachineDiagnosticClass;
  /** One for details; greater than one for an omitted-findings summary. */
  occurrences: number;
}

export interface MachineKCodeEvidence {
  /** Explicit parser contract; Studio imports use the canonical V1 label. */
  dialect: KCodeDialect | null;
  /** Exact strict-parser document, retained even when parsing is blocked. */
  document: KCodeDocumentV1 | null;
  /** Exact bytes supplied by the caller, when intake was byte-based. */
  sourceBytes: Uint8Array | null;
  trace: MachineTraceV1 | null;
  validation: MachineValidationReportV1 | null;
  scene: MachineSceneV1 | null;
  /** Present only when a pinned lowering schedule can be checked against the trace. */
  differential: ScheduledTraceComparisonV1 | null;
}

export interface MachineDocument {
  filename: string;
  format: MachineFormat;
  /** Exact KCode one-byte/one-code-unit source, or decoded Knitout text. */
  source: string;
  kcode: MachineKCodeEvidence | null;
  passes: readonly MachinePass[];
  diagnostics: readonly MachineDiagnostic[];
  verdict: {
    state: VerdictState;
    label: 'Blocked' | 'Surface-proven (imported)' | 'Knit-proven';
    annotation: string;
  };
  sourceDisclosure: {
    carrierLifecycle: 'checked-before-lowering' | 'not-encoded-by-kcode';
    summary: string;
  };
  stats: {
    /** Total executable passes when a strict KCode trace is available; zero otherwise. */
    passCount: number;
    /** Strict-trace passes containing knit, tuck, or split; unavailable without a trace. */
    loopFormingPassCount: number | null;
    /** Foreign machine files do not carry Studio's authored row identity. */
    authoredRowCount: null;
    passMetricProvenance: 'strict-kcode-trace' | 'unavailable';
    authoredRowProvenance: 'unavailable-for-foreign-machine-file';
    /** Exact coordinate metric plus explicitly assumption-derived distance/time. */
    programmedMotion: MachineTraceProgrammedMotionV1 | null;
    /** Strict-trace pass counts by role; unavailable without a trace. */
    passRoles: Readonly<Record<MachineTracePassRoleV1, number>> | null;
    carriers: readonly string[];
    needleSpan: string;
    rackRange: string;
    infoCount: number;
    warningCount: number;
    errorCount: number;
  };
}

export interface MachineDiff {
  summary: KCodeMachineTraceDiff;
  windows: readonly { index: number; text: string }[];
}

export interface OpenMachineDocumentOptions {
  /** Required at runtime for `.kc`; ignored for Knitout `.k`. */
  readonly dialect?: KCodeDialect;
}

export interface OpenKCodeDocumentOptions extends OpenMachineDocumentOptions {
  readonly dialect: KCodeDialect;
}

export const MACHINE_PASS_ROLE_LABELS: Readonly<Record<MachineTracePassRoleV1, string>> = {
  'loop-forming': 'Loop-forming',
  transfer: 'Transfer',
  drop: 'Drop',
  'carrier-move': 'Carrier move',
  'carriage-move': 'Carriage move',
  unclassified: 'Unclassified',
};

export const MACHINE_PASS_ORIGIN_LABELS: Readonly<Record<MachinePassOrigin, string>> = {
  'knitout-directed': 'requested by its Knitout line',
  'backend-inserted': 'inserted by the pinned backend',
  'not-recorded-in-kcode': 'origin not recorded in KCode',
};

/** Pass label; a backend-inserted carrier move is the official editor's kickback. */
export function machinePassRoleLabel(pass: Pick<MachinePass, 'role' | 'origin'>): string | null {
  if (pass.role === undefined) return null;
  if (pass.role === 'carrier-move' && pass.origin === 'backend-inserted') return 'Kickback';
  return MACHINE_PASS_ROLE_LABELS[pass.role];
}

export function formatPassRoleCounts(roles: Readonly<Record<MachineTracePassRoleV1, number>>): string {
  return (Object.keys(MACHINE_PASS_ROLE_LABELS) as MachineTracePassRoleV1[])
    .filter((role) => roles[role] > 0 || role === 'loop-forming')
    .map((role) => `${roles[role].toLocaleString('en-US')} ${MACHINE_PASS_ROLE_LABELS[role].toLowerCase().replace(' ', '-')}`)
    .join(' · ');
}

function formatNeedles(min: number | null, max: number | null): string {
  if (min === null || max === null) return 'No needles';
  return min === max ? `N${min}` : `N${min}-${max}`;
}

function formatTraceCoordinates(min: number | null, max: number | null): string {
  if (min === null || max === null) return 'No selections';
  return min === max ? `K-code ${min}` : `K-code ${min}-${max}`;
}

interface NumberExtent {
  readonly min: number;
  readonly max: number;
}

function numberExtent(values: Iterable<number>): NumberExtent | null {
  let min: number | null = null;
  let max: number | null = null;
  for (const value of values) {
    min = min === null ? value : Math.min(min, value);
    max = max === null ? value : Math.max(max, value);
  }
  return min === null || max === null ? null : { min, max };
}

function appendAll<Value>(target: Value[], values: Iterable<Value>): void {
  for (const value of values) target.push(value);
}

function* traceCoordinates(pass: MachineTracePassV1): Generator<number> {
  for (const selection of pass.selections.front) yield selection.traceCoordinate;
  for (const selection of pass.selections.rear) yield selection.traceCoordinate;
}

function* documentTraceCoordinates(trace: MachineTraceV1): Generator<number> {
  for (const pass of trace.passes) yield* traceCoordinates(pass);
}

function* passRacks(passes: readonly MachinePass[]): Generator<number> {
  for (const pass of passes) {
    if (pass.rack !== null) yield pass.rack;
  }
}

function* legacyNeedleNumbers(passes: readonly MachinePass[]): Generator<number> {
  for (const pass of passes) {
    for (const match of pass.needleSpan.matchAll(/N(-?\d+)/g)) yield Number(match[1]);
  }
}

function resolveDiagnostic(
  message: ValidationMessage,
  metadata: {
    readonly id: string;
    readonly passIndex: number | null;
    readonly actionIndex?: number | null;
    readonly line: number | null;
    readonly sourceSpan?: KCodeSourceSpan | null;
    readonly classification: MachineDiagnosticClass;
    readonly occurrences?: number;
  },
): MachineDiagnostic {
  return {
    ...resolveValidatorMessage(message),
    id: metadata.id,
    passIndex: metadata.passIndex,
    actionIndex: metadata.actionIndex ?? null,
    line: metadata.line,
    sourceSpan: metadata.sourceSpan ?? null,
    classification: metadata.classification,
    occurrences: metadata.occurrences ?? 1,
  };
}

function diagnostics(
  messages: readonly ValidationMessage[],
  anchor: (message: ValidationMessage) => {
    passIndex: number | null;
    line: number | null;
  },
): MachineDiagnostic[] {
  return messages.map((message, index) => {
    const anchored = anchor(message);
    return resolveDiagnostic(message, {
      ...anchored,
      id: `${message.rule}-${message.opIndex ?? 'file'}-${index}`,
      classification: 'knitout',
      occurrences: message.occurrences,
    });
  });
}

function decodeKCodeBytes(bytes: Uint8Array): string {
  const chunks: string[] = [];
  for (let offset = 0; offset < bytes.length; offset += 8_192) {
    chunks.push(String.fromCharCode(...bytes.subarray(offset, offset + 8_192)));
  }
  return chunks.join('');
}

function decodeKnitoutBytes(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes);
}

function normalizeOptions(
  value: OpenMachineDocumentOptions | null | undefined,
): OpenMachineDocumentOptions {
  if (value === null || value === undefined) return {};
  return value;
}

/** Knitout ops which explicitly request a selection-free carrier pass. */
const DIRECTED_CARRIER_MOVE_OPS: ReadonlySet<string> = new Set(['miss', 'in', 'out']);

/**
 * The pinned backend stamps each scheduled pass with the Knitout line being
 * lowered. A carrier-only pass stamped with a knit/tuck/xfer line is therefore
 * a kickback the backend inserted to serve that line; carriage-only moves have
 * no Knitout spelling and are always backend-inserted.
 */
function knitoutPassOrigin(
  role: MachineTracePassRoleV1,
  sourceLines: readonly number[],
  opKindsByLine: ReadonlyMap<number, readonly string[]>,
): MachinePassOrigin {
  if (sourceLines.length === 0 || role === 'carriage-move') return 'backend-inserted';
  if (role !== 'carrier-move') return 'knitout-directed';
  return sourceLines.some((line) =>
    (opKindsByLine.get(line) ?? []).some((kind) => DIRECTED_CARRIER_MOVE_OPS.has(kind)))
    ? 'knitout-directed'
    : 'backend-inserted';
}

function tracePass(
  pass: MachineTracePassV1,
  presentation?: {
    /** Knitout source lines which caused this emitted pass; empty means backend-only. */
    readonly sourceLines: readonly number[];
    readonly section: string;
    readonly opKindsByLine: ReadonlyMap<number, readonly string[]>;
  },
): MachinePass {
  const role = classifyMachineTracePassRoleV1(pass);
  const coordinateSpan = numberExtent(traceCoordinates(pass));
  const sourceSpan = presentation === undefined
    ? { min: pass.source.span.start.line, max: pass.source.footer.end.line }
    : numberExtent(presentation.sourceLines);
  const hasFront = pass.selections.front.length > 0;
  const hasRear = pass.selections.rear.length > 0;
  return {
    index: pass.index,
    direction: pass.direction,
    type: pass.operation,
    carriers: pass.carrier === '0' ? [] : [pass.carrier],
    beds: hasFront || hasRear
      ? `${hasFront ? 'F' : ''}${hasFront && hasRear ? '+' : ''}${hasRear ? 'R' : ''}`
      : 'Move',
    needleSpan: formatTraceCoordinates(
      coordinateSpan?.min ?? null,
      coordinateSpan?.max ?? null,
    ),
    rack: pass.rack,
    speed: pass.speed,
    roller: pass.roller,
    // Zero is an explicit no-source sentinel. SourceDock never highlights it.
    lineStart: sourceSpan?.min ?? 0,
    lineEnd: sourceSpan?.max ?? 0,
    section: presentation?.section ?? 'K-code passes',
    ghost: pass.actions.length > 0 && pass.actions.every((action) => action.kind === 'move'),
    role,
    origin: presentation === undefined
      ? 'not-recorded-in-kcode'
      : knitoutPassOrigin(role, presentation.sourceLines, presentation.opKindsByLine),
  };
}

function parserFindings(
  parsed: ReturnType<typeof parseKCodeDocument>,
): MachineDiagnostic[] {
  return parsed.diagnostics.map((diagnostic, index) => resolveDiagnostic({
    severity: diagnostic.severity,
    rule: diagnostic.rule,
    message: diagnostic.message,
  }, {
    id: `${diagnostic.rule}-${diagnostic.span.start.offset}-${index}`,
    passIndex: null,
    line: diagnostic.line,
    sourceSpan: diagnostic.span,
    classification: 'syntax',
    occurrences: diagnostic.occurrences,
  }));
}

function validatorFindings(
  report: MachineValidationReportV1,
): MachineDiagnostic[] {
  return report.diagnostics.map((diagnostic, index) => resolveDiagnostic({
    // Brief depth-three stacks occur across five captured reference files.
    // That establishes observed corpus behavior, not external producer or
    // physical-machine provenance. Keep the shared validator's conservative
    // warning evidence intact, but present that one observation as non-blocking
    // information when Studio opens a foreign artifact. Depth four remains an
    // error.
    severity: diagnostic.rule === 'machine-trace.loop-stack-policy'
      && diagnostic.severity === 'warning'
      ? 'info'
      : diagnostic.severity,
    rule: diagnostic.rule,
    message: diagnostic.message,
  }, {
    id: `${diagnostic.rule}-${diagnostic.passIndex ?? 'trace'}-${diagnostic.actionIndex ?? 'pass'}-${diagnostic.sourceSpan?.start.offset ?? 'none'}-${index}`,
    passIndex: diagnostic.passIndex,
    actionIndex: diagnostic.actionIndex ?? null,
    line: diagnostic.line,
    sourceSpan: diagnostic.sourceSpan,
    classification: diagnostic.class,
    occurrences: diagnostic.occurrences,
  }));
}

/**
 * Machine-safety findings block every foreign file: each one is a documented
 * collision or a departure from the envelope Kniterate's own programs keep.
 */
function safetyFindings(
  report: MachineSafetyReportV1,
  emitted: boolean,
): MachineDiagnostic[] {
  return report.diagnostics.map((diagnostic, index) => resolveDiagnostic({
    severity: diagnostic.severity,
    rule: diagnostic.rule,
    message: diagnostic.message,
  }, {
    id: `${emitted ? 'emitted-' : ''}${diagnostic.rule}-${diagnostic.passIndex ?? 'trace'}-${diagnostic.actionIndex ?? 'pass'}-${index}`,
    passIndex: diagnostic.passIndex,
    actionIndex: diagnostic.actionIndex ?? null,
    // Emitted locations belong to generated KCode, not the imported Knitout source.
    line: emitted ? null : diagnostic.line,
    sourceSpan: emitted ? null : diagnostic.sourceSpan,
    classification: diagnostic.class,
    occurrences: diagnostic.occurrences,
  }));
}

/**
 * Float advisories mirror the official editor's knitter-facing check. They
 * carry no physical failure evidence, so foreign imports present them as
 * non-blocking information rather than verdict-gating warnings.
 */
function advisoryFindings(
  report: MachineTraceAdvisoryReportV1,
  emitted: boolean,
): MachineDiagnostic[] {
  const findings = report.advisories.map((advisory, index) => resolveDiagnostic({
    severity: 'info',
    rule: advisory.rule,
    message: advisory.message,
  }, {
    id: `${emitted ? 'emitted-' : ''}${advisory.rule}-${advisory.passIndex}-${advisory.actionIndex}-${index}`,
    passIndex: advisory.passIndex,
    actionIndex: advisory.actionIndex,
    // Emitted locations belong to generated KCode, not the imported Knitout source.
    line: emitted ? null : advisory.sourceSpan.start.line,
    sourceSpan: emitted ? null : advisory.sourceSpan,
    classification: 'operational-advisory',
  }));
  for (const [rule, count] of Object.entries(report.counts)) {
    const detailed = report.advisories.filter((advisory) => advisory.rule === rule).length;
    if (count <= detailed) continue;
    findings.push(resolveDiagnostic({
      severity: 'info',
      rule,
      message: `Advisories for ${rule} were truncated after ${detailed} detailed findings; omitted ${count - detailed} additional findings.`,
    }, {
      id: `${emitted ? 'emitted-' : ''}${rule}-summary`,
      passIndex: null,
      line: null,
      classification: 'operational-advisory',
      occurrences: count - detailed,
    }));
  }
  return findings;
}

function emittedParserFindings(
  parsed: ReturnType<typeof parseKCodeDocument>,
): MachineDiagnostic[] {
  return parserFindings(parsed).map((finding) => ({
    ...finding,
    id: `emitted-${finding.id}`,
    line: null,
    sourceSpan: null,
    rawMessage: `Emitted KCode line ${finding.line ?? '?'}: ${finding.rawMessage}`,
  }));
}

function emittedValidatorFindings(
  report: MachineValidationReportV1,
): MachineDiagnostic[] {
  return validatorFindings(report).map((finding) => ({
    ...finding,
    id: `emitted-${finding.id}`,
    // These locations belong to generated KCode, not the imported Knitout source.
    line: null,
    sourceSpan: null,
  }));
}

function differentialFindings(
  report: ScheduledTraceComparisonV1,
): MachineDiagnostic[] {
  return report.mismatches.map((mismatch, index) => resolveDiagnostic({
    severity: 'error',
    rule: 'kcode.backend-schedule-differential',
    message: mismatch.message,
  }, {
    id: `kcode.backend-schedule-differential-${mismatch.passIndex ?? 'file'}-${mismatch.field}-${index}`,
    passIndex: mismatch.passIndex,
    line: null,
    classification: 'structural',
  }));
}

function loweringFinding(
  rule: string,
  message: string,
  severity: 'error' | 'warning' = 'error',
  identity?: string,
  occurrences = 1,
): MachineDiagnostic {
  return resolveDiagnostic({ severity, rule, message }, {
    id: `${rule}-${severity}${identity === undefined ? '' : `-${identity}`}`,
    passIndex: null,
    line: null,
    classification: 'structural',
    occurrences,
  });
}

function dialectRequiredFinding(): MachineDiagnostic {
  return resolveDiagnostic({
    severity: 'error',
    rule: 'kcode.dialect-required',
    message: 'Supply an explicit KCode dialect contract (`app` or `knitout-vendor`) before strict library intake.',
  }, {
    id: 'kcode.dialect-required',
    passIndex: null,
    line: 1,
    classification: 'syntax',
  });
}

function projectionFinding(error: unknown): MachineDiagnostic {
  const message = error instanceof Error ? error.message : String(error);
  return resolveDiagnostic({
    severity: 'error',
    rule: 'kcode.trace-projection',
    message,
  }, {
    id: 'kcode.trace-projection',
    passIndex: null,
    line: null,
    classification: 'structural',
  });
}

function finishDocument(input: {
  readonly filename: string;
  readonly format: MachineFormat;
  readonly source: string;
  readonly kcode: MachineKCodeEvidence | null;
  readonly passes: readonly MachinePass[];
  readonly findings: readonly MachineDiagnostic[];
  readonly coordinateSpan?: { readonly min: number; readonly max: number } | null;
}): MachineDocument {
  let findings = [...input.findings];
  if (
    input.passes.length === 0
    && !findings.some((finding) => finding.severity === 'error')
  ) {
    findings = [resolveDiagnostic({
      severity: 'error',
      rule: 'machine-passes-required',
      message: 'No authoritative machine passes were found in this file.',
    }, {
      id: 'machine-passes-required',
      passIndex: null,
      line: 1,
      classification: input.format === 'kc' ? 'syntax' : 'knitout',
    }), ...findings];
  }

  const errors = findings.filter((item) => item.severity === 'error');
  const warnings = findings.filter((item) => item.severity === 'warning');
  const infos = findings.filter((item) => item.severity === 'info');
  const errorCount = errors.reduce((count, item) => count + item.occurrences, 0);
  const warningCount = warnings.reduce((count, item) => count + item.occurrences, 0);
  const infoCount = infos.reduce((count, item) => count + item.occurrences, 0);
  const carriers = new Set<string>();
  for (const pass of input.passes) {
    for (const carrier of pass.carriers) carriers.add(carrier);
  }
  const carrierSet = [...carriers].sort();
  const rackExtent = numberExtent(passRacks(input.passes));
  const legacyNeedleExtent = numberExtent(legacyNeedleNumbers(input.passes));
  const passMetrics = input.kcode?.trace === null || input.kcode?.trace === undefined
    ? null
    : summarizeMachineTracePassMetricsV1(input.kcode.trace);
  const passRoles = input.kcode?.trace === null || input.kcode?.trace === undefined
    ? null
    : summarizeMachineTracePassRolesV1(input.kcode.trace);
  const programmedMotion = input.kcode?.trace === null || input.kcode?.trace === undefined
    ? null
    : deriveMachineTraceProgrammedMotionV1(input.kcode.trace, {
        assumedPitchMmPerCoordinateUnit: KNITERATE_MACHINE_PROFILE_V1.machine.needlePitchMm,
      });

  // Conservative foreign-file policy: imported warnings have no authored
  // review/waiver context, so both errors and warnings block V1 promotion.
  // The one evidence-backed informational exception is applied above, before
  // this verdict chokepoint.
  const blocked = errors.length > 0 || warnings.length > 0 || input.passes.length === 0;
  const informationCount = (predicate: (finding: MachineDiagnostic) => boolean) =>
    infos.filter(predicate).reduce((count, item) => count + item.occurrences, 0);
  const loopStackInfoCount = informationCount((item) => item.rule === 'machine-trace.loop-stack-policy');
  const advisoryInfoCount = informationCount((item) => item.rule.startsWith('machine-advisory.'));
  const informationParts = [
    ...(loopStackInfoCount > 0 ? [`${loopStackInfoCount.toLocaleString()} non-blocking loop-stack observation${loopStackInfoCount === 1 ? '' : 's'}`] : []),
    ...(advisoryInfoCount > 0 ? [`${advisoryInfoCount.toLocaleString()} non-blocking float advisor${advisoryInfoCount === 1 ? 'y' : 'ies'}`] : []),
  ];
  const informationSummary = informationParts.length > 0
    ? ` ${informationParts.join(' and ')} remain visible as informational evidence.`
    : '';
  const coordinateSpan = input.coordinateSpan;
  const spanLabel = coordinateSpan
    ? formatTraceCoordinates(coordinateSpan.min, coordinateSpan.max)
    : legacyNeedleExtent
      ? formatNeedles(legacyNeedleExtent.min, legacyNeedleExtent.max)
      : input.format === 'kc' ? 'No selections' : 'No needles';

  return {
    filename: input.filename,
    format: input.format,
    source: input.source,
    kcode: input.kcode,
    passes: input.passes,
    diagnostics: findings,
    verdict: {
      state: blocked ? 'blocked' : 'surface',
      label: blocked ? 'Blocked' : 'Surface-proven (imported)',
      annotation: blocked
        ? warnings.length > 0 && errors.length === 0
          ? 'Imported warnings remain unresolved, so this foreign file is blocked under the conservative V1 policy.'
          : 'Machine-facing findings must be resolved before this file should be knit.'
        : input.format === 'kc'
          ? `Strict KCode parsing, conformance to the V1 operation, direction, carrier, rack, selection, transfer, stop, and continuity contract, and the machine-safety envelope passed.${informationSummary} Controller acceptance, settings for this yarn, and physical knitting remain unproven.`
          : `Pinned backend lowering, strict emitted KCode parsing, V1 command-contract conformance, the machine-safety envelope, scheduled-pass differential checks, and empty-bed state replay passed.${informationSummary} Controller acceptance and physical yarn, tension, and fabric behavior remain separate gates.`,
    },
    sourceDisclosure: input.format === 'k'
      ? {
          carrierLifecycle: 'checked-before-lowering',
          summary: 'Knitout source carrier lifecycle is checked before pinned lowering; emitted KCode remains the downstream machine contract.',
        }
      : {
          carrierLifecycle: 'not-encoded-by-kcode',
          summary: 'KCode bytes do not encode Knitout carrier in/out lifecycle or prove who produced them; checks begin at encoded KCode semantics.',
        },
    stats: {
      passCount: passMetrics?.programmedPassCount ?? 0,
      loopFormingPassCount: passMetrics?.loopFormingPassCount ?? null,
      authoredRowCount: null,
      passMetricProvenance: passMetrics === null ? 'unavailable' : 'strict-kcode-trace',
      authoredRowProvenance: 'unavailable-for-foreign-machine-file',
      programmedMotion,
      passRoles,
      carriers: carrierSet,
      needleSpan: spanLabel,
      rackRange: rackExtent ? `${rackExtent.min} to ${rackExtent.max}` : '0',
      infoCount,
      warningCount,
      errorCount,
    },
  };
}

function rejectedUnreadSource(
  filename: string,
  rule: string,
  message: string,
): MachineDocument {
  const format: MachineFormat = filename.toLowerCase().endsWith('.kc') ? 'kc' : 'k';
  return finishDocument({
    filename,
    format,
    source: '',
    kcode: {
      dialect: 'knitout-vendor',
      document: null,
      sourceBytes: null,
      trace: null,
      validation: null,
      scene: null,
      differential: null,
    },
    passes: [],
    findings: [loweringFinding(rule, message)],
    coordinateSpan: null,
  });
}

export function rejectOversizedMachineDocument(
  filename: string,
  byteLength: number,
): MachineDocument {
  return rejectedUnreadSource(
    filename,
    'machine-source-resource-limit',
    `Machine source is ${byteLength.toLocaleString('en-US')} bytes, above the ${MAX_MACHINE_SOURCE_BYTES_V1.toLocaleString('en-US')}-byte V1 import limit. The file was not read or copied into Studio.`,
  );
}

export function rejectUnreadableMachineDocument(
  filename: string,
  reason: string,
): MachineDocument {
  return rejectedUnreadSource(
    filename,
    'machine-source-read',
    `Studio could not read this local file: ${reason}`,
  );
}

function openKCodeDocument(
  filename: string,
  input: MachineSource,
  options: OpenMachineDocumentOptions,
): MachineDocument {
  const sourceBytes = input instanceof Uint8Array ? input.slice() : null;
  if (options.dialect === undefined) {
    const source = typeof input === 'string' ? input : decodeKCodeBytes(input);
    return finishDocument({
      filename,
      format: 'kc',
      source,
      kcode: {
        dialect: null,
        document: null,
        sourceBytes,
        trace: null,
        validation: null,
        scene: null,
        differential: null,
      },
      passes: [],
      findings: [dialectRequiredFinding()],
      coordinateSpan: null,
    });
  }

  const parseOptions = {
    profile: KNITERATE_MACHINE_PROFILE_V1,
    dialect: options.dialect,
    strict: true,
  } as const;
  const parsed = input instanceof Uint8Array
    ? parseKCodeBytes(input, parseOptions)
    : parseKCodeDocument(input, parseOptions);
  const findings = parserFindings(parsed);
  let trace: MachineTraceV1 | null = null;
  let validation: MachineValidationReportV1 | null = null;
  let scene: MachineSceneV1 | null = null;

  if (parsed.ok) {
    try {
      trace = projectKCodeMachineTrace(parsed.document, KNITERATE_MACHINE_PROFILE_V1);
      validation = validateKCodeMachineTrace(trace, KNITERATE_MACHINE_PROFILE_V1);
      scene = projectMachineScene(trace);
      appendAll(findings, validatorFindings(validation));
      appendAll(findings, safetyFindings(validateKCodeMachineSafetyV1(trace, KNITERATE_MACHINE_PROFILE_V1), false));
      appendAll(findings, advisoryFindings(deriveMachineTraceAdvisoriesV1(trace, KNITERATE_MACHINE_PROFILE_V1), false));
    } catch (error) {
      findings.push(projectionFinding(error));
    }
  }

  const passes = trace?.passes.map((pass) => tracePass(pass)) ?? [];
  const coordinateSpan = trace === null ? null : numberExtent(documentTraceCoordinates(trace));
  return finishDocument({
    filename,
    format: 'kc',
    source: parsed.document.rawText,
    kcode: {
      dialect: options.dialect,
      document: parsed.document,
      sourceBytes,
      trace,
      validation,
      scene,
      differential: null,
    },
    passes,
    findings,
    coordinateSpan,
  });
}

function openKnitoutDocument(
  filename: string,
  input: MachineSource,
): MachineDocument {
  const source = typeof input === 'string' ? input : decodeKnitoutBytes(input);
  const parsed = parseKnitoutProgram(source);
  const inspected = inspectKnitoutPasses(parsed);
  const parseMessages: ValidationMessage[] = parsed.issues.map((issue) => ({
    severity: 'error',
    rule: issue.rule ?? 'knitout-parse',
    message: `Line ${issue.line}: ${issue.message}`,
    occurrences: issue.occurrences,
  }));
  const report = validateKnitoutProgram(parsed.program);
  const findings = diagnostics([...parseMessages, ...report.messages], (message) => {
    const line = message.opIndex === undefined ? null : parsed.opLines[message.opIndex] ?? null;
    const pass = message.opIndex === undefined
      ? undefined
      : inspected.find((item) => message.opIndex! >= item.opStart && message.opIndex! < item.opEnd);
    return { passIndex: pass?.index ?? null, line };
  });
  for (const [index, issue] of parsed.issues.entries()) {
    findings[index] = { ...findings[index]!, line: issue.line };
  }

  let loweredDocument: KCodeDocumentV1 | null = null;
  let trace: MachineTraceV1 | null = null;
  let validation: MachineValidationReportV1 | null = null;
  let scene: MachineSceneV1 | null = null;
  let differential: ScheduledTraceComparisonV1 | null = null;
  let passes: MachinePass[] = [];
  let coordinateSpan: NumberExtent | null = null;
  const opKindsByLine = new Map<number, string[]>();
  for (const [index, op] of parsed.program.ops.entries()) {
    const line = parsed.opLines[index];
    if (line === undefined) continue;
    const kinds = opKindsByLine.get(line);
    if (kinds === undefined) opKindsByLine.set(line, [op.kind]);
    else kinds.push(op.kind);
  }

  if (!findings.some((finding) => finding.severity === 'error')) {
    const converted = browserKnitoutToKCode(source, filename);
    for (const [index, warning] of (converted.warnings ?? []).entries()) {
      findings.push(loweringFinding('knitout-backend-warning', warning, 'warning', String(index)));
    }
    const omittedBackendWarnings = Math.max(
      0,
      (converted.warningCount ?? converted.warnings?.length ?? 0) - (converted.warnings?.length ?? 0),
    );
    if (omittedBackendWarnings > 0) {
      findings.push(loweringFinding(
        'knitout-backend-warning-summary',
        `Pinned-backend warnings were truncated after ${converted.warnings?.length ?? 0} detailed findings; omitted ${omittedBackendWarnings} additional warnings.`,
        'warning',
        'summary',
        omittedBackendWarnings,
      ));
    }
    if (!converted.ok || converted.kcode === undefined || converted.scheduledPasses === undefined) {
      findings.push(loweringFinding(
        'knitout-backend-lowering',
        converted.error ?? 'Pinned backend returned no emitted KCode or scheduled-pass trace.',
      ));
    } else {
      const lowered = parseKCodeDocument(converted.kcode, {
        profile: KNITERATE_MACHINE_PROFILE_V1,
        dialect: 'knitout-vendor',
        strict: true,
      });
      loweredDocument = lowered.document;
      appendAll(findings, emittedParserFindings(lowered));
      if (lowered.ok) {
        try {
          trace = projectKCodeMachineTrace(lowered.document, KNITERATE_MACHINE_PROFILE_V1);
          validation = validateKCodeMachineTrace(trace, KNITERATE_MACHINE_PROFILE_V1);
          scene = projectMachineScene(trace);
          differential = compareScheduledPassesToMachineTrace(converted.scheduledPasses, trace);
          appendAll(findings, emittedValidatorFindings(validation));
          appendAll(findings, safetyFindings(validateKCodeMachineSafetyV1(trace, KNITERATE_MACHINE_PROFILE_V1), true));
          appendAll(findings, differentialFindings(differential));
          appendAll(findings, advisoryFindings(deriveMachineTraceAdvisoriesV1(trace, KNITERATE_MACHINE_PROFILE_V1), true));
          passes = trace.passes.map((pass, index) => tracePass(pass, {
            sourceLines: converted.scheduledPasses?.[index]?.sourceLines ?? [],
            section: 'Pinned backend / emitted KCode',
            opKindsByLine,
          }));
          coordinateSpan = numberExtent(documentTraceCoordinates(trace));
        } catch (error) {
          findings.push(projectionFinding(error));
        }
      }
    }
  }

  return finishDocument({
    filename,
    format: 'k',
    source,
    kcode: {
      dialect: 'knitout-vendor',
      document: loweredDocument,
      sourceBytes: null,
      trace,
      validation,
      scene,
      differential,
    },
    passes,
    findings,
    coordinateSpan,
  });
}

export function openMachineDocument(
  filename: `${string}.kc`,
  source: MachineSource,
  options: OpenKCodeDocumentOptions,
): MachineDocument;
export function openMachineDocument(
  filename: `${string}.k`,
  source: MachineSource,
  options?: OpenMachineDocumentOptions | null,
): MachineDocument;
export function openMachineDocument(
  filename: string,
  source: MachineSource,
  options: OpenMachineDocumentOptions | null,
): MachineDocument;
export function openMachineDocument(
  filename: string,
  source: MachineSource,
  options?: OpenMachineDocumentOptions | null,
): MachineDocument {
  if (source instanceof Uint8Array && source.byteLength > MAX_MACHINE_SOURCE_BYTES_V1) {
    return rejectOversizedMachineDocument(filename, source.byteLength);
  }
  const normalized = normalizeOptions(options);
  return filename.toLowerCase().endsWith('.kc')
    ? openKCodeDocument(filename, source, normalized)
    : openKnitoutDocument(filename, source);
}

function blockedDiff(
  left: MachineDocument,
  right: MachineDocument,
  reason: string,
): MachineDiff {
  const leftReady = left.kcode?.trace !== null && left.kcode?.trace !== undefined;
  const rightReady = right.kcode?.trace !== null && right.kcode?.trace !== undefined;
  const summary: KCodeMachineTraceDiff = {
    comparison: 'strict-machine-trace-v1',
    status: 'blocked',
    identical: false,
    generatedPassCount: left.kcode?.document?.passes.length ?? left.passes.length,
    referencePassCount: right.kcode?.document?.passes.length ?? right.passes.length,
    generatedInput: {
      ok: leftReady,
      diagnostics: [],
      parsedPassCount: left.kcode?.document?.passes.length ?? 0,
      projectionError: leftReady ? null : reason,
    },
    referenceInput: {
      ok: rightReady,
      diagnostics: [],
      parsedPassCount: right.kcode?.document?.passes.length ?? 0,
      projectionError: rightReady ? null : reason,
    },
    firstDelta: null,
    deltaCount: 0,
    deltas: [],
  };
  return {
    summary,
    windows: [{ index: 0, text: `STRICT MACHINE-TRACE COMPARISON BLOCKED\n${reason}` }],
  };
}

export function compareKcDocuments(left: MachineDocument, right: MachineDocument): MachineDiff {
  if (left.format !== 'kc' || right.format !== 'kc') {
    throw new Error('MachineTrace diff requires two .kc files.');
  }
  const leftDialect = left.kcode?.dialect;
  const rightDialect = right.kcode?.dialect;
  if (leftDialect === null || leftDialect === undefined || rightDialect === null || rightDialect === undefined) {
    return blockedDiff(left, right, 'Both KCode inputs require an explicit parser contract.');
  }
  const leftDialectContract = KNITERATE_MACHINE_PROFILE_V1.dialects[leftDialect];
  const rightDialectContract = KNITERATE_MACHINE_PROFILE_V1.dialects[rightDialect];
  if (leftDialectContract.markerFreeTraceOffset !== rightDialectContract.markerFreeTraceOffset) {
    return blockedDiff(left, right, `KCode dialect movement contracts differ: ${leftDialect} vs ${rightDialect}.`);
  }
  const leftTrace = left.kcode?.trace;
  const rightTrace = right.kcode?.trace;
  if (leftTrace === null || leftTrace === undefined || rightTrace === null || rightTrace === undefined) {
    return blockedDiff(left, right, 'Both KCode inputs must pass strict parsing and MachineTrace projection before comparison.');
  }

  const summary = diffKCodeMachineTrace(left.source, right.source, {
    profile: KNITERATE_MACHINE_PROFILE_V1,
    dialect: leftDialect,
    maxDeltas: 200,
    bytes: true,
  });
  if (summary.status === 'blocked') {
    const rejected = [
      summary.generatedInput.ok ? null : `generated: ${summary.generatedInput.diagnostics.map((item) => item.rule).join(', ') || summary.generatedInput.projectionError || 'strict parse failed'}`,
      summary.referenceInput.ok ? null : `reference: ${summary.referenceInput.diagnostics.map((item) => item.rule).join(', ') || summary.referenceInput.projectionError || 'strict parse failed'}`,
    ].filter((item): item is string => item !== null);
    return {
      summary,
      windows: [{ index: 0, text: ['STRICT MACHINE-TRACE COMPARISON BLOCKED', ...rejected].join('\n') }],
    };
  }
  const changedPasses = [...new Set(summary.deltas.map((delta) => delta.index))];
  const windows = changedPasses.map((index) => ({
    index,
    text: renderKCodeMachineTraceWindowFromTraces(leftTrace, rightTrace, index, {
      context: 2,
      deltas: summary.deltas,
    }),
  }));
  return { summary, windows };
}
