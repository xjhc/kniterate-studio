import {
  KNITERATE_7GG_KCODE_PROFILE_V1,
  diffKCodeMachineTrace,
  inspectKnitoutPasses,
  parseKCodeBytes,
  parseKCodeDocument,
  parseKnitoutProgram,
  projectKCodeMachineTrace,
  projectMachineScene,
  renderKCodeMachineTraceWindowFromTraces,
  resolveValidatorMessage,
  validateKCodeMachineTrace,
  validateKnitoutProgram,
  type KCodeDialect,
  type KCodeDocumentV1,
  type KCodeMachineTraceDiff,
  type KCodeSourceSpan,
  type MachineSceneV1,
  type MachineTracePassV1,
  type MachineTraceV1,
  type MachineValidationReportV1,
  type ResolvedValidatorMessage,
  type ValidationMessage,
} from '@kniterate-studio/machine-lib/browser';

export type MachineFormat = 'kc' | 'k';
export type VerdictState = 'blocked' | 'surface' | 'knit';
export type MachineSource = string | Uint8Array;

/** Fixed V1 target. Keep this alias local so every Studio KCode seam shares it. */
const KNITERATE_MACHINE_PROFILE_V1 = KNITERATE_7GG_KCODE_PROFILE_V1;

export interface AuthoredVerdict {
  state: VerdictState;
  label: 'Blocked' | 'Surface-proven' | 'Knit-proven';
  annotation: string;
  evidenceId: string | null;
}

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
    annotation: 'The emitted KCode passed strict parsing, scheduled-backend differential checks, exact MachineTrace projection, and loop/kinematic replay. Physical yarn, tension, and fabric behavior remain a separate final swatch gate.',
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
}

export type MachineDiagnosticClass =
  | 'syntax'
  | 'structural'
  | 'semantic'
  | 'kinematic'
  | 'operational-advisory'
  | 'knitout';

export interface MachineDiagnostic extends ResolvedValidatorMessage {
  id: string;
  passIndex: number | null;
  actionIndex: number | null;
  line: number | null;
  sourceSpan: KCodeSourceSpan | null;
  classification: MachineDiagnosticClass;
}

export interface MachineKCodeEvidence {
  /** Always explicit caller input; Studio never infers a KCode dialect. */
  dialect: KCodeDialect | null;
  /** Exact strict-parser document, retained even when parsing is blocked. */
  document: KCodeDocumentV1 | null;
  /** Exact bytes supplied by the caller, when intake was byte-based. */
  sourceBytes: Uint8Array | null;
  trace: MachineTraceV1 | null;
  validation: MachineValidationReportV1 | null;
  scene: MachineSceneV1 | null;
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
  stats: {
    passCount: number;
    carriers: readonly string[];
    needleSpan: string;
    rackRange: string;
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

function formatNeedles(min: number | null, max: number | null): string {
  if (min === null || max === null) return 'No needles';
  return min === max ? `N${min}` : `N${min}-${max}`;
}

function formatTraceCoordinates(min: number | null, max: number | null): string {
  if (min === null || max === null) return 'No selections';
  return min === max ? `K-code ${min}` : `K-code ${min}-${max}`;
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

function tracePass(pass: MachineTracePassV1): MachinePass {
  const selections = [...pass.selections.front, ...pass.selections.rear];
  const coordinates = selections.map((selection) => selection.traceCoordinate);
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
      coordinates.length > 0 ? Math.min(...coordinates) : null,
      coordinates.length > 0 ? Math.max(...coordinates) : null,
    ),
    rack: pass.rack,
    speed: pass.speed,
    roller: pass.roller,
    lineStart: pass.source.span.start.line,
    lineEnd: pass.source.footer.end.line,
    section: 'K-code passes',
    ghost: pass.actions.length > 0 && pass.actions.every((action) => action.kind === 'move'),
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
  }));
}

function validatorFindings(
  report: MachineValidationReportV1,
): MachineDiagnostic[] {
  return report.diagnostics.map((diagnostic, index) => resolveDiagnostic({
    severity: diagnostic.severity,
    rule: diagnostic.rule,
    message: diagnostic.message,
  }, {
    id: `${diagnostic.rule}-${diagnostic.passIndex ?? 'trace'}-${diagnostic.actionIndex ?? 'pass'}-${diagnostic.sourceSpan?.start.offset ?? 'none'}-${index}`,
    passIndex: diagnostic.passIndex,
    actionIndex: diagnostic.actionIndex ?? null,
    line: diagnostic.line,
    sourceSpan: diagnostic.sourceSpan,
    classification: diagnostic.class,
  }));
}

function dialectRequiredFinding(): MachineDiagnostic {
  return resolveDiagnostic({
    severity: 'error',
    rule: 'kcode.dialect-required',
    message: 'Choose the source KCode dialect (`app` or `knitout-vendor`) before strict import. Studio will not guess it from file contents.',
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
  const carrierSet = [...new Set(input.passes.flatMap((pass) => pass.carriers))].sort();
  const racks = input.passes.map((pass) => pass.rack).filter((rack): rack is number => rack !== null);
  const legacyNeedleNumbers = input.passes.flatMap((pass) =>
    [...pass.needleSpan.matchAll(/N(-?\d+)/g)].map((match) => Number(match[1])));

  // Conservative foreign-file policy: imported warnings have no authored
  // review/waiver context, so both errors and warnings block V1 promotion.
  const blocked = errors.length > 0 || warnings.length > 0 || input.passes.length === 0;
  const coordinateSpan = input.coordinateSpan;
  const spanLabel = coordinateSpan
    ? formatTraceCoordinates(coordinateSpan.min, coordinateSpan.max)
    : legacyNeedleNumbers.length > 0
      ? formatNeedles(Math.min(...legacyNeedleNumbers), Math.max(...legacyNeedleNumbers))
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
          ? 'Strict KCode parsing, exact MachineTrace projection, and software validation passed. Operational limits and physical knitting remain unproven; use a representative swatch as the final gate.'
          : 'Imported file reconstructed and validated without errors. Source intent and physical knitting remain unproven; knit a swatch first.',
    },
    stats: {
      passCount: input.passes.length,
      carriers: carrierSet,
      needleSpan: spanLabel,
      rackRange: racks.length > 0 ? `${Math.min(...racks)} to ${Math.max(...racks)}` : '0',
      warningCount: warnings.length,
      errorCount: errors.length,
    },
  };
}

function openKCodeDocument(
  filename: string,
  input: MachineSource,
  options: OpenMachineDocumentOptions,
): MachineDocument {
  const sourceBytes = input instanceof Uint8Array ? input.slice() : null;
  const source = typeof input === 'string' ? input : decodeKCodeBytes(input);
  if (options.dialect === undefined) {
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
      findings.push(...validatorFindings(validation));
    } catch (error) {
      findings.push(projectionFinding(error));
    }
  }

  const passes = trace?.passes.map(tracePass) ?? [];
  const traceCoordinates = trace?.passes.flatMap((pass) => [
    ...pass.selections.front.map((selection) => selection.traceCoordinate),
    ...pass.selections.rear.map((selection) => selection.traceCoordinate),
  ]) ?? [];
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
    },
    passes,
    findings,
    coordinateSpan: traceCoordinates.length > 0
      ? { min: Math.min(...traceCoordinates), max: Math.max(...traceCoordinates) }
      : null,
  });
}

function openKnitoutDocument(
  filename: string,
  input: MachineSource,
): MachineDocument {
  const source = typeof input === 'string' ? input : decodeKnitoutBytes(input);
  const parsed = parseKnitoutProgram(source);
  const inspected = inspectKnitoutPasses(parsed);
  const passes = inspected.map((pass): MachinePass => ({
    index: pass.index,
    direction: pass.direction === '+' ? '>>' : pass.direction === '-' ? '<<' : null,
    type: pass.type,
    carriers: pass.carriers,
    beds: pass.beds.map((bed) => bed.toUpperCase()).join('+') || 'Move',
    needleSpan: formatNeedles(pass.needleMin, pass.needleMax),
    rack: pass.rack,
    speed: pass.speed,
    roller: pass.roller,
    lineStart: pass.lineStart,
    lineEnd: pass.lineEnd,
    section: pass.section,
    ghost: false,
  }));
  const parseMessages: ValidationMessage[] = parsed.issues.map((issue) => ({
    severity: 'error',
    rule: issue.rule ?? 'knitout-parse',
    message: `Line ${issue.line}: ${issue.message}`,
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

  return finishDocument({
    filename,
    format: 'k',
    source,
    kcode: null,
    passes,
    findings,
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
    return blockedDiff(left, right, 'Both KCode inputs require an explicit source dialect; Studio will not guess.');
  }
  if (leftDialect !== rightDialect) {
    return blockedDiff(left, right, `KCode dialect mismatch: ${leftDialect} vs ${rightDialect}. Re-import both inputs under one explicit contract before comparing.`);
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
