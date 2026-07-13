import {
  diffKc,
  inspectKcDocument,
  inspectKnitoutPasses,
  kcToKnitout,
  parseKnitoutProgram,
  renderKcPassWindow,
  resolveValidatorMessage,
  validateKnitoutProgram,
  type KcDiff,
  type ResolvedValidatorMessage,
  type ValidationMessage,
} from '@kniterate-studio/machine-lib/browser';

export type MachineFormat = 'kc' | 'k';
export type VerdictState = 'blocked' | 'surface' | 'knit';

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

export interface MachineDiagnostic extends ResolvedValidatorMessage {
  id: string;
  passIndex: number | null;
  line: number | null;
}

export interface MachineDocument {
  filename: string;
  format: MachineFormat;
  source: string;
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
  summary: KcDiff;
  windows: readonly { index: number; text: string }[];
}

function formatNeedles(min: number | null, max: number | null): string {
  if (min === null || max === null) return 'No needles';
  return min === max ? `N${min}` : `N${min}-${max}`;
}

function diagnostics(
  messages: readonly ValidationMessage[],
  anchor: (message: ValidationMessage) => { passIndex: number | null; line: number | null },
): MachineDiagnostic[] {
  return messages.map((message, index) => ({
    ...resolveValidatorMessage(message),
    ...anchor(message),
    id: `${message.rule}-${message.opIndex ?? 'file'}-${index}`,
  }));
}

export function openMachineDocument(filename: string, source: string, knitProvenEntryId: string | null = null): MachineDocument {
  const format: MachineFormat = filename.toLowerCase().endsWith('.kc') ? 'kc' : 'k';
  let passes: MachinePass[];
  let findings: MachineDiagnostic[];
  let reconstructionErrors: ValidationMessage[] = [];

  if (format === 'kc') {
    const inspected = inspectKcDocument(source);
    const reconstructed = kcToKnitout(source);
    passes = inspected.map((pass) => ({
      index: pass.idx,
      direction: pass.dir,
      type: pass.kind,
      carriers: pass.carrier === '0' ? [] : [pass.carrier],
      beds: `${pass.f.length ? 'F' : ''}${pass.f.length && pass.r.length ? '+' : ''}${pass.r.length ? 'R' : ''}` || 'Move',
      needleSpan: formatNeedles(
        [...pass.f, ...pass.r].length ? Math.min(...pass.f, ...pass.r) : null,
        [...pass.f, ...pass.r].length ? Math.max(...pass.f, ...pass.r) : null,
      ),
      rack: pass.rack,
      speed: pass.speed ?? null,
      roller: pass.roller ?? null,
      lineStart: pass.lineStart,
      lineEnd: pass.lineEnd,
      section: pass.section,
      ghost: pass.carrier === '0' && pass.f.length === 0 && pass.r.length === 0,
    }));
    reconstructionErrors = Object.entries(reconstructed.stats.unrecognizedTypes).map(([type, count]) => ({
      severity: 'error' as const,
      rule: 'kc-reconstruction-unsupported-pass',
      message: `${count} pass${count === 1 ? '' : 'es'} use unsupported k-code type "${type}"; Studio cannot prove the reconstructed program.`,
    }));
    const report = validateKnitoutProgram(reconstructed.program);
    findings = diagnostics([...reconstructionErrors, ...report.messages], (message) => {
      const passIndex = message.opIndex === undefined ? null : reconstructed.opPassIndices[message.opIndex] ?? null;
      return { passIndex, line: passIndex === null ? null : inspected[passIndex]?.lineEnd ?? null };
    });
  } else {
    const parsed = parseKnitoutProgram(source);
    const inspected = inspectKnitoutPasses(parsed);
    passes = inspected.map((pass) => ({
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
    reconstructionErrors = parsed.issues.map((issue) => ({ severity: 'error' as const, rule: issue.rule ?? 'knitout-parse', message: `Line ${issue.line}: ${issue.message}`, opIndex: undefined }));
    const report = validateKnitoutProgram(parsed.program);
    findings = diagnostics([...reconstructionErrors, ...report.messages], (message) => {
      const line = message.opIndex === undefined ? null : parsed.opLines[message.opIndex] ?? null;
      const pass = message.opIndex === undefined ? undefined : inspected.find((item) => message.opIndex! >= item.opStart && message.opIndex! < item.opEnd);
      return { passIndex: pass?.index ?? null, line };
    });
    for (const [index, issue] of parsed.issues.entries()) {
      findings[index] = { ...findings[index]!, line: issue.line };
    }
  }

  const errors = findings.filter((item) => item.severity === 'error');
  const warnings = findings.filter((item) => item.severity === 'warning');
  const carrierSet = [...new Set(passes.flatMap((pass) => pass.carriers))].sort();
  const needleNumbers = passes.flatMap((pass) => [...pass.needleSpan.matchAll(/\d+/g)].map((match) => Number(match[0])));
  const racks = passes.map((pass) => pass.rack).filter((rack): rack is number => rack !== null);
  // Imported files have no authored project context in which a warning could be
  // reviewed and accepted, so any unresolved error or warning blocks the
  // foreign-file verdict. (V1 has three rungs; there is no waiver/Experimental path.)
  const blocked = errors.length > 0 || warnings.length > 0 || passes.length === 0;
  if (passes.length === 0) findings = [{
    ...resolveValidatorMessage({ severity: 'error', rule: 'machine-passes-required', message: 'No machine passes were found in this file.' }),
    id: 'machine-passes-required', passIndex: null, line: 1,
  }, ...findings];

  return {
    filename, format, source, passes, diagnostics: findings,
    verdict: {
      state: blocked ? 'blocked' : knitProvenEntryId ? 'knit' : 'surface',
      label: blocked ? 'Blocked' : knitProvenEntryId ? 'Knit-proven' : 'Surface-proven (imported)',
      annotation: blocked
        ? 'Machine-facing findings must be resolved before this file should be knit.'
        : knitProvenEntryId
          ? `This exact k-code artifact has a current clean physical registry match: ${knitProvenEntryId}.`
        : 'Imported file reconstructed and validated without errors. Source intent and physical knitting remain unproven; knit a swatch first.',
    },
    stats: {
      passCount: passes.length,
      carriers: carrierSet,
      needleSpan: needleNumbers.length ? formatNeedles(Math.min(...needleNumbers), Math.max(...needleNumbers)) : 'No needles',
      rackRange: racks.length ? `${Math.min(...racks)} to ${Math.max(...racks)}` : '0',
      warningCount: warnings.length,
      errorCount: errors.length + (passes.length === 0 ? 1 : 0),
    },
  };
}

export function compareKcDocuments(left: MachineDocument, right: MachineDocument): MachineDiff {
  if (left.format !== 'kc' || right.format !== 'kc') throw new Error('Pass diff currently compares .kc files.');
  const summary = diffKc(left.source, right.source, { maxDeltas: 200 });
  return { summary, windows: summary.deltas.map((delta) => ({ index: delta.index, text: renderKcPassWindow(left.source, right.source, delta.index, 2) })) };
}
