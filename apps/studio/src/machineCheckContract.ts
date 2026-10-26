import {
  formatPassRoleCounts,
  type MachineDiagnostic,
  type MachineDocument,
  type MachineFormat,
} from './engine';

export const MACHINE_CHECK_RECEIPT_KIND_V1 = 'kniterate-machine-check';
export const MACHINE_CHECK_RECEIPT_SCHEMA_VERSION_V1 = 1;
export const MAX_MACHINE_CHECK_DIAGNOSTIC_DETAILS_V1 = 512;
const MAX_MACHINE_CHECK_TEXT_CODE_UNITS_V1 = 2_048;

export interface MachineCheckInputEvidenceV1 {
  readonly filename: string;
  readonly format: MachineFormat;
  readonly byteCount: number | null;
  readonly sha256: string | null;
  readonly profile: 'kniterate-7gg-kcode@2';
  readonly dialect: 'knitout-vendor';
}

export interface MachineCheckDiagnosticV1 {
  readonly id: string;
  readonly rule: string;
  readonly severity: MachineDiagnostic['severity'];
  readonly classification: MachineDiagnostic['classification'];
  readonly occurrences: number;
  readonly line: number | null;
  readonly passIndex: number | null;
  readonly actionIndex: number | null;
  readonly title: string;
  readonly explanation: string;
  readonly message: string;
}

export interface MachineCheckReceiptV1 {
  readonly kind: typeof MACHINE_CHECK_RECEIPT_KIND_V1;
  readonly schemaVersion: typeof MACHINE_CHECK_RECEIPT_SCHEMA_VERSION_V1;
  readonly input: MachineCheckInputEvidenceV1;
  readonly verdict: MachineDocument['verdict'];
  readonly stats: MachineDocument['stats'];
  readonly evidence: {
    readonly exactInputBytes:
      | 'preserved-kcode-bytes'
      | 'decoded-knitout-text'
      | 'input-not-read';
    readonly sourceCarrierLifecycle:
      | 'checked-before-lowering'
      | 'not-encoded-by-kcode';
    readonly backendScheduleDifferential:
      | 'passed'
      | 'failed'
      | 'not-produced'
      | 'not-available-for-direct-kcode';
    readonly physicalAcceptance: 'not-established';
  };
  readonly diagnostics: readonly MachineCheckDiagnosticV1[];
  readonly diagnosticDetailsOmitted: number;
  readonly disclosure: readonly string[];
}

export interface CreateMachineCheckReceiptOptions {
  readonly byteCount: number | null;
  readonly sha256: string | null;
}

function boundedText(value: string): string {
  if (value.length <= MAX_MACHINE_CHECK_TEXT_CODE_UNITS_V1) return value;
  return `${value.slice(0, MAX_MACHINE_CHECK_TEXT_CODE_UNITS_V1)}…`;
}

function diagnosticPriority(diagnostic: MachineDiagnostic): number {
  switch (diagnostic.severity) {
    case 'error': return 0;
    case 'warning': return 1;
    case 'info': return 2;
  }
}

function receiptDiagnostic(diagnostic: MachineDiagnostic): MachineCheckDiagnosticV1 {
  return {
    id: diagnostic.id,
    rule: diagnostic.rule,
    severity: diagnostic.severity,
    classification: diagnostic.classification,
    occurrences: diagnostic.occurrences,
    line: diagnostic.line,
    passIndex: diagnostic.passIndex,
    actionIndex: diagnostic.actionIndex,
    title: boundedText(diagnostic.title),
    explanation: boundedText(diagnostic.explanation),
    message: boundedText(diagnostic.rawMessage),
  };
}

function scheduleStatus(
  document: MachineDocument,
): MachineCheckReceiptV1['evidence']['backendScheduleDifferential'] {
  if (document.format === 'kc') return 'not-available-for-direct-kcode';
  const differential = document.kcode?.differential;
  if (differential === null || differential === undefined) return 'not-produced';
  return differential.ok ? 'passed' : 'failed';
}

export function createMachineCheckReceipt(
  document: MachineDocument,
  options: CreateMachineCheckReceiptOptions,
): MachineCheckReceiptV1 {
  const prioritized = document.diagnostics
    .map((diagnostic, index) => ({ diagnostic, index }))
    .sort((left, right) =>
      diagnosticPriority(left.diagnostic) - diagnosticPriority(right.diagnostic)
      || left.index - right.index);
  const details = prioritized.slice(0, MAX_MACHINE_CHECK_DIAGNOSTIC_DETAILS_V1);

  return {
    kind: MACHINE_CHECK_RECEIPT_KIND_V1,
    schemaVersion: MACHINE_CHECK_RECEIPT_SCHEMA_VERSION_V1,
    input: {
      filename: document.filename,
      format: document.format,
      byteCount: options.byteCount,
      sha256: options.sha256,
      profile: 'kniterate-7gg-kcode@2',
      dialect: 'knitout-vendor',
    },
    verdict: document.verdict,
    stats: document.stats,
    evidence: {
      exactInputBytes: options.sha256 === null
        ? 'input-not-read'
        : document.format === 'kc'
          ? 'preserved-kcode-bytes'
          : 'decoded-knitout-text',
      sourceCarrierLifecycle: document.sourceDisclosure.carrierLifecycle,
      backendScheduleDifferential: scheduleStatus(document),
      physicalAcceptance: 'not-established',
    },
    diagnostics: details.map(({ diagnostic }) => receiptDiagnostic(diagnostic)),
    diagnosticDetailsOmitted: Math.max(0, prioritized.length - details.length),
    disclosure: [
      document.sourceDisclosure.summary,
      'Programmed travel is exact only in encoded stop-coordinate units. Millimetres and the constant-speed time term assume one coordinate unit equals one 3.63 mm needle pitch and encoded speed is constant mm/s; they are not physical duration or lower-bound claims.',
      'Surface-proven remains software evidence; controller acceptance and physical knitting are separate gates.',
      'Every check assumes the job starts with an empty needle bed and every yarn feeder parked at home on the left; the file cannot show either, so check both at the machine.',
    ],
  };
}

function diagnosticAnchor(diagnostic: MachineCheckDiagnosticV1): string {
  const anchors: string[] = [];
  if (diagnostic.line !== null) anchors.push(`line ${diagnostic.line}`);
  if (diagnostic.passIndex !== null) anchors.push(`pass ${diagnostic.passIndex + 1}`);
  if (diagnostic.actionIndex !== null) anchors.push(`action ${diagnostic.actionIndex + 1}`);
  return anchors.length === 0 ? '' : ` (${anchors.join(', ')})`;
}

function countedLabel(count: number, singular: string, plural: string): string {
  return `${count.toLocaleString('en-US')} ${count === 1 ? singular : plural}`;
}

function formatMotion(receipt: MachineCheckReceiptV1): string {
  const motion = receipt.stats.programmedMotion;
  if (motion === null) return 'Motion: unavailable (no strict KCode trace)';
  const exact = motion.coordinateMetric.programmedTravelUnits.toLocaleString('en-US');
  const assumed = motion.assumptionModel.assumedTravelMm.toLocaleString('en-US', {
    maximumFractionDigits: 2,
  });
  if (motion.assumptionModel.status === 'available') {
    const seconds = motion.assumptionModel.idealizedSeconds!.toLocaleString('en-US', {
      maximumFractionDigits: 2,
    });
    return `Motion: ${exact} programmed stop-coordinate units · ${assumed} mm assumption-derived travel · ${seconds} s idealized constant-speed term`;
  }
  const reason = motion.assumptionModel.unavailableReason!;
  return `Motion: ${exact} programmed stop-coordinate units · ${assumed} mm assumption-derived travel · idealized term unavailable (${reason.code}, ${reason.offendingPassCount.toLocaleString('en-US')} contributing pass${reason.offendingPassCount === 1 ? '' : 'es'}, first pass ${reason.firstPassIndex + 1})`;
}

export function formatMachineCheckReceipt(receipt: MachineCheckReceiptV1): string {
  const lines = [
    `${receipt.verdict.label} · ${receipt.input.filename}`,
    `${receipt.input.byteCount === null ? 'Unread input' : `${receipt.input.byteCount.toLocaleString('en-US')} bytes`}`
      + `${receipt.input.sha256 === null ? '' : ` · sha256 ${receipt.input.sha256}`}`,
    `${receipt.stats.passMetricProvenance === 'strict-kcode-trace'
      ? `${countedLabel(receipt.stats.passCount, 'programmed pass', 'programmed passes')} · ${countedLabel(receipt.stats.loopFormingPassCount!, 'loop-forming pass', 'loop-forming passes')}`
      : 'Pass metrics unavailable (no strict KCode trace)'}`
      + ' · authored design rows unavailable (foreign file)'
      + ` · ${receipt.stats.errorCount.toLocaleString('en-US')} errors`
      + ` · ${receipt.stats.warningCount.toLocaleString('en-US')} warnings`
      + ` · ${receipt.stats.infoCount.toLocaleString('en-US')} information`,
    receipt.stats.passRoles === null
      ? 'Pass roles: unavailable (no strict KCode trace)'
      : `Pass roles: ${formatPassRoleCounts(receipt.stats.passRoles)}`,
    formatMotion(receipt),
    receipt.verdict.annotation,
    ...receipt.disclosure.map((item) => `Evidence boundary: ${item}`),
  ];

  if (receipt.diagnostics.length === 0) {
    lines.push('Diagnostics: none');
  } else {
    lines.push('Diagnostics:');
    for (const diagnostic of receipt.diagnostics) {
      lines.push(
        `  [${diagnostic.severity.toUpperCase()}] ${diagnostic.rule}`
        + `${diagnosticAnchor(diagnostic)}`
        + `${diagnostic.occurrences === 1 ? '' : ` ×${diagnostic.occurrences}`}`
        + `: ${diagnostic.message}`,
      );
    }
    if (receipt.diagnosticDetailsOmitted > 0) {
      lines.push(
        `  … ${receipt.diagnosticDetailsOmitted.toLocaleString('en-US')} additional diagnostic details omitted`,
      );
    }
  }

  return `${lines.join('\n')}\n`;
}
