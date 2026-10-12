import { browserAuthoredKnitoutToKCode } from '@kniterate-studio/machine-lib/browser-converter';
import {
  KNITERATE_7GG_KCODE_PROFILE_V2,
  compareScheduledPassesToMachineTrace,
  createAuthoredKCodeCoordinateBridgeV1,
  isKCodeCommandLegalityExportEligible,
  parseKCodeDocument,
  parseKnitoutProgram,
  projectKCodeMachineTrace,
  projectMachineScene,
  validateKCodeMachineTrace,
  type AuthoredKCodeCoordinateBridgeV1,
  type MachineTraceV1,
  type ParsedKnitoutDocument,
  type ScheduledTraceComparisonV1,
  type ValidationMessage,
} from '@kniterate-studio/machine-lib/browser';
import {
  observeAuthoredCapacityV1,
  refuseAuthoredCapacityFromLowerBoundV1,
  type AuthoredCapacityBlockedV1,
  type AuthoredCapacitySupportedV1,
} from '@kniterate-studio/project-contract';
import type { KCodeArtifact, KCodeConversionRequest, KCodePassProvenance } from './kcodeProtocol';
import { sha256Text } from './sha256';

export class AuthoredKCodeCapacityError extends Error {
  readonly capacity: AuthoredCapacityBlockedV1;

  constructor(capacity: AuthoredCapacityBlockedV1) {
    super(capacity.message);
    this.name = 'AuthoredKCodeCapacityError';
    this.capacity = capacity;
  }
}

function kcodeRecordCount(source: string): number {
  let records = 0;
  for (let index = 0; index < source.length; index++) {
    if (source.charCodeAt(index) === 0x0a) records++;
  }
  return source.length > 0 && source.charCodeAt(source.length - 1) !== 0x0a ? records + 1 : records;
}

function selectedRasterCellCount(passes: readonly { readonly FRNT: string; readonly REAR: string }[]): number {
  let selected = 0;
  for (const pass of passes) {
    for (const raster of [pass.FRNT, pass.REAR]) {
      for (let index = 0; index < raster.length; index++) {
        if (raster.charCodeAt(index) === 45) selected++;
      }
    }
  }
  return selected;
}

function blockedCapacityFromConverterIssue(
  capacity: AuthoredCapacitySupportedV1,
  issue: NonNullable<ReturnType<typeof browserAuthoredKnitoutToKCode>['capacityIssue']>,
): AuthoredCapacityBlockedV1 {
  return refuseAuthoredCapacityFromLowerBoundV1(capacity, issue.metric, issue.limit + 1);
}

function sortedUnique(values: readonly number[]): number[] {
  return [...new Set(values)].sort((a, b) => a - b);
}

interface ScheduledProvenancePass {
  readonly index: number;
  readonly sourceLines: readonly number[];
  readonly isAutoMove: boolean;
  readonly comment?: string;
}

interface RowProvenance {
  readonly rowId: string;
  readonly machineRow: number;
}

export interface ScheduledProvenanceProjection {
  readonly ok: boolean;
  readonly messages: readonly ValidationMessage[];
  readonly passProvenance: readonly KCodePassProvenance[];
  readonly rowPasses: readonly { rowId: string; passIndices: readonly number[] }[];
}

/**
 * Join backend-only scheduled-pass provenance to Studio rows without trusting
 * source-line references that the parsed Knitout document cannot account for.
 * These fields are not encoded in KCode and therefore are not part of the
 * scheduled-pass/KCode differential proof.
 */
export function projectScheduledPassProvenance(input: {
  readonly parsedKnitout: ParsedKnitoutDocument;
  readonly scheduledPasses: readonly ScheduledProvenancePass[];
  readonly programOpSourceRows: readonly (readonly number[] | null)[];
  readonly rowProvenance: readonly RowProvenance[];
}): ScheduledProvenanceProjection {
  const messages: ValidationMessage[] = [];
  const addError = (rule: string, message: string): void => {
    messages.push({ severity: 'error', rule, message });
  };

  if (input.programOpSourceRows.length !== input.parsedKnitout.opLines.length) {
    addError(
      'kcode.provenance-op-alignment',
      `Studio supplied ${input.programOpSourceRows.length} operation-provenance entries for ${input.parsedKnitout.opLines.length} parsed Knitout operations.`,
    );
  }

  const opIndexForLine = new Map<number, number>();
  input.parsedKnitout.opLines.forEach((line, opIndex) => {
    if (!Number.isInteger(line) || line <= 0 || opIndexForLine.has(line)) {
      addError(
        'kcode.provenance-op-alignment',
        `Parsed Knitout operation ${opIndex} has invalid or duplicate source line ${String(line)}.`,
      );
      return;
    }
    opIndexForLine.set(line, opIndex);
  });

  const rowIdForMachineRow = new Map<number, string>();
  const machineRowForRowId = new Map<string, number>();
  for (const row of input.rowProvenance) {
    if (!Number.isInteger(row.machineRow)
      || row.machineRow < 0
      || row.rowId.length === 0
      || rowIdForMachineRow.has(row.machineRow)
      || machineRowForRowId.has(row.rowId)) {
      addError(
        'kcode.provenance-row-contract',
        `Studio row provenance contains an invalid or duplicate row mapping for row ID ${JSON.stringify(row.rowId)} and machine row ${String(row.machineRow)}.`,
      );
      continue;
    }
    rowIdForMachineRow.set(row.machineRow, row.rowId);
    machineRowForRowId.set(row.rowId, row.machineRow);
  }

  const passProvenance: KCodePassProvenance[] = input.scheduledPasses.map((pass, passIndex) => {
    if (pass.index !== passIndex) {
      addError(
        'kcode.provenance-pass-index',
        `Scheduled pass at position ${passIndex} reports backend index ${String(pass.index)}.`,
      );
    }

    const seenSourceLines = new Set<number>();
    const sourceRows: number[] = [];
    for (const line of pass.sourceLines) {
      if (!Number.isInteger(line) || line <= 0 || seenSourceLines.has(line)) {
        addError(
          'kcode.provenance-source-line',
          `Scheduled pass ${passIndex} contains invalid or duplicate Knitout source line ${String(line)}.`,
        );
        continue;
      }
      seenSourceLines.add(line);
      const opIndex = opIndexForLine.get(line);
      if (opIndex === undefined) {
        addError(
          'kcode.provenance-source-line',
          `Scheduled pass ${passIndex} refers to Knitout source line ${line}, which is not a parsed operation line.`,
        );
        continue;
      }
      const rows = input.programOpSourceRows[opIndex];
      if (rows === undefined) {
        addError(
          'kcode.provenance-op-alignment',
          `Scheduled pass ${passIndex} source line ${line} has no operation-provenance entry at index ${opIndex}.`,
        );
        continue;
      }
      for (const row of rows ?? []) {
        if (!Number.isInteger(row) || !rowIdForMachineRow.has(row)) {
          addError(
            'kcode.provenance-source-row',
            `Scheduled pass ${passIndex} source line ${line} refers to unknown machine row ${String(row)}.`,
          );
          continue;
        }
        sourceRows.push(row);
      }
    }

    const uniqueSourceRows = sortedUnique(sourceRows);
    return {
      passIndex,
      sourceLines: [...pass.sourceLines],
      sourceRows: uniqueSourceRows,
      rowIds: uniqueSourceRows.map((row) => rowIdForMachineRow.get(row)!),
      isAutoMove: pass.isAutoMove,
      comment: pass.comment ?? null,
    };
  });
  const rowPasses = input.rowProvenance.map((row) => ({
    rowId: row.rowId,
    passIndices: passProvenance.flatMap((pass) => pass.rowIds.includes(row.rowId) ? [pass.passIndex] : []),
  }));

  return {
    ok: messages.length === 0,
    messages,
    passProvenance,
    rowPasses,
  };
}

function messagesForArtifact(input: {
  vendorWarnings: readonly string[];
  vendorWarningCount: number;
  knitoutIssues: ReturnType<typeof parseKnitoutProgram>['issues'];
  parserDiagnostics: KCodeArtifact['parserDiagnostics'];
  validation: KCodeArtifact['validation'];
  differential: KCodeArtifact['differential'];
}): ValidationMessage[] {
  return [
    ...input.vendorWarnings.map((message): ValidationMessage => ({ severity: 'info', rule: 'vendor-converter-note', message })),
    ...(input.vendorWarningCount > input.vendorWarnings.length ? [{
      severity: 'info' as const,
      rule: 'vendor-converter-note-summary',
      message: `Vendor notes were truncated after ${input.vendorWarnings.length} details; omitted ${input.vendorWarningCount - input.vendorWarnings.length} additional notes.`,
      occurrences: input.vendorWarningCount - input.vendorWarnings.length,
    }] : []),
    ...input.knitoutIssues.map((issue): ValidationMessage => ({ severity: 'error', rule: issue.rule ?? 'generated-knitout-parse', message: `Knitout line ${issue.line}: ${issue.message}`, occurrences: issue.occurrences })),
    ...input.parserDiagnostics.map((item): ValidationMessage => ({ severity: item.severity, rule: item.rule, message: `KCode ${item.line}:${item.column}: ${item.message}`, occurrences: item.occurrences })),
    ...(input.validation?.diagnostics ?? []).map((item): ValidationMessage => ({ severity: item.severity, rule: item.rule, message: item.line === null ? item.message : `KCode ${item.line}:${item.column}: ${item.message}`, occurrences: item.occurrences })),
    ...(input.differential?.mismatches ?? []).map((item): ValidationMessage => ({ severity: 'error', rule: 'kcode.backend-schedule-differential', message: item.message })),
  ];
}

function authoredCoordinateBridge(input: {
  kcHash: string;
  compilerNeedleRange: KCodeConversionRequest['compilerNeedleRange'];
  lowering: Parameters<typeof createAuthoredKCodeCoordinateBridgeV1>[0]['lowering'] | undefined;
  trace: MachineTraceV1 | null;
  differential: ScheduledTraceComparisonV1 | null;
}): AuthoredKCodeCoordinateBridgeV1 | null {
  if (!input.lowering || !input.trace || input.differential?.ok !== true) return null;
  try {
    return createAuthoredKCodeCoordinateBridgeV1({
      artifactKcodeSha256: input.kcHash,
      compilerCoordinateStart: input.compilerNeedleRange.start,
      compilerCoordinateEnd: input.compilerNeedleRange.end,
      lowering: input.lowering,
      trace: input.trace,
      scheduledTraceComparison: input.differential,
      profile: KNITERATE_7GG_KCODE_PROFILE_V2,
    });
  } catch {
    // The bridge refuses whenever the trace extent does not equal the mapped
    // authored range; needle labels are then withheld rather than guessed.
    return null;
  }
}

function passKnitoutNeedles(trace: MachineTraceV1 | null, bridge: AuthoredKCodeCoordinateBridgeV1 | null): KCodeArtifact['passKnitoutNeedles'] {
  if (!trace) return [];
  return trace.passes.map((pass) => {
    const coordinates = [...pass.selections.front, ...pass.selections.rear].map((selection) => selection.traceCoordinate);
    if (!bridge || coordinates.length === 0) return null;
    const offset = bridge.offsets.compilerProjectToTraceCoordinate;
    return { start: Math.min(...coordinates) - offset, end: Math.max(...coordinates) - offset };
  });
}

export async function compileKCodeArtifact(
  request: KCodeConversionRequest,
): Promise<KCodeArtifact> {
  const converted = browserAuthoredKnitoutToKCode(request.knitoutText, 'command.k');
  if (!converted.ok || !converted.kcode || !converted.scheduledPasses) {
    if (converted.capacityIssue !== undefined) {
      throw new AuthoredKCodeCapacityError(blockedCapacityFromConverterIssue(request.capacity, converted.capacityIssue));
    }
    throw new Error(converted.error ?? 'Vendored converter returned no KCode or scheduled-pass trace.');
  }

  const exactCapacity = observeAuthoredCapacityV1(request.capacity, {
    loweredPasses: converted.scheduledPasses.length,
    selectedCells: selectedRasterCellCount(converted.scheduledPasses),
    kcodeRecords: kcodeRecordCount(converted.kcode),
  });
  if (exactCapacity.status === 'blocked') throw new AuthoredKCodeCapacityError(exactCapacity);

  const parsedKnitout = parseKnitoutProgram(request.knitoutText, { resourceProfile: 'authored-v1' });
  const parsed = parseKCodeDocument(converted.kcode, {
    profile: KNITERATE_7GG_KCODE_PROFILE_V2,
    dialect: 'knitout-vendor',
    strict: true,
    resourceProfile: 'authored-v1',
  });
  const trace = parsed.ok
    ? projectKCodeMachineTrace(parsed.document, KNITERATE_7GG_KCODE_PROFILE_V2)
    : null;
  const validation = trace === null
    ? null
    : validateKCodeMachineTrace(trace, KNITERATE_7GG_KCODE_PROFILE_V2);
  const scene = trace === null ? null : projectMachineScene(trace);
  const differential = trace === null
    ? null
    : compareScheduledPassesToMachineTrace(converted.scheduledPasses, trace);

  const provenance = projectScheduledPassProvenance({
    parsedKnitout,
    scheduledPasses: converted.scheduledPasses,
    programOpSourceRows: request.programOpSourceRows,
    rowProvenance: request.rowProvenance,
  });
  const passProvenance = provenance.passProvenance;
  const passLines = trace?.passes.map((pass) => ({
    passIndex: pass.index,
    lineStart: pass.source.FRNT.start.line,
    lineEnd: pass.source.footer.end.line,
  })) ?? [];
  const rowPasses = provenance.rowPasses;
  const rowLines = rowPasses.flatMap((row) => {
    const spans = row.passIndices.flatMap((passIndex) => passLines[passIndex] ? [passLines[passIndex]!] : []);
    return spans.length === 0 ? [] : [{
      rowId: row.rowId,
      lineStart: Math.min(...spans.map((span) => span.lineStart)),
      lineEnd: Math.max(...spans.map((span) => span.lineEnd)),
    }];
  });
  const messages = [...messagesForArtifact({
    vendorWarnings: converted.warnings ?? [],
    vendorWarningCount: converted.warningCount ?? converted.warnings?.length ?? 0,
    knitoutIssues: parsedKnitout.issues,
    parserDiagnostics: parsed.diagnostics,
    validation,
    differential,
  }), ...provenance.messages];

  const kcHash = await sha256Text(converted.kcode);
  const coordinateBridge = authoredCoordinateBridge({
    kcHash,
    compilerNeedleRange: request.compilerNeedleRange,
    lowering: converted.coordinateMapping,
    trace,
    differential,
  });

  return {
    inputHash: request.inputHash,
    capacity: exactCapacity,
    kcHash,
    kcText: converted.kcode,
    passCount: trace?.passes.length ?? 0,
    messages,
    parserDiagnostics: parsed.diagnostics,
    trace,
    scene,
    validation,
    differential,
    passProvenance,
    passLines,
    rowLines,
    rowPasses,
    coordinateBridge,
    passKnitoutNeedles: passKnitoutNeedles(trace, coordinateBridge),
    ok: isKCodeCommandLegalityExportEligible({ parseOk: parsed.ok, validation })
      && parsedKnitout.issues.length === 0
      && differential?.ok === true
      && provenance.ok
      && messages.every((message) => message.severity !== 'error'),
  };
}
