import {
  ALL_CARRIERS,
  type BedNeedle,
  type CarrierId,
  type KnitoutOp,
  type KnitoutProgram,
  type Position,
} from './types.js';

export interface KnitoutParseIssue {
  readonly line: number;
  readonly message: string;
  readonly rule?: string;
  /** Number of omitted findings represented by a bounded summary issue. */
  readonly occurrences?: number;
}

export interface ParsedKnitoutDocument {
  readonly program: KnitoutProgram;
  /** Source line for every op in `program.ops` (1-indexed). */
  readonly opLines: readonly number[];
  readonly issues: readonly KnitoutParseIssue[];
}

const CARRIERS = new Set<string>(ALL_CARRIERS);
const POSITIONS = new Set<Position>(['Left', 'Center', 'Right', 'Keep']);
export type KnitoutResourceProfileV1 = 'foreign-v1' | 'authored-v1';

export interface ParseKnitoutProgramOptions {
  readonly resourceProfile?: KnitoutResourceProfileV1;
}

export interface KnitoutCapacityIssueV1 {
  readonly profile: KnitoutResourceProfileV1;
  readonly metric:
    | 'knitout-records'
    | 'lowered-passes'
    | 'selected-cells'
    | 'kcode-records';
  readonly limit: number;
  readonly message: string;
}

/** Named, fixed resource envelopes. Callers choose a product context, never
 * arbitrary numeric limits. KCode projection keeps an independent 200k-cell
 * ceiling; its record ceiling matches the named KCode parser profile. */
export const KNITOUT_RESOURCE_LIMITS_V1 = Object.freeze({
  'foreign-v1': Object.freeze({
    sourceCodeUnits: 64 * 1024 * 1024,
    records: 250_000,
    recordCodeUnits: 16_384,
    loweredPasses: 4_096,
    loweredSelections: 200_000,
    kcodeRecords: 50_000,
  }),
  'authored-v1': Object.freeze({
    sourceCodeUnits: 64 * 1024 * 1024,
    records: 600_000,
    recordCodeUnits: 16_384,
    loweredPasses: 8_192,
    loweredSelections: 200_000,
    kcodeRecords: 100_000,
  }),
} as const) satisfies Record<KnitoutResourceProfileV1, {
  readonly sourceCodeUnits: number;
  readonly records: number;
  readonly recordCodeUnits: number;
  readonly loweredPasses: number;
  readonly loweredSelections: number;
  readonly kcodeRecords: number;
}>;

const MAX_KNITOUT_PARSE_ISSUE_DETAILS = 512;

type AddIssue = (issue: KnitoutParseIssue) => void;

function carrier(value: string, line: number, addIssue: AddIssue): CarrierId | null {
  if (CARRIERS.has(value)) return value as CarrierId;
  addIssue({ line, rule: 'carrier-id-legal', message: `Carrier "${value}" is not legal on Kniterate (expected 1-6).` });
  return null;
}

function carriers(values: string[], line: number, addIssue: AddIssue): CarrierId[] {
  return values.map((value) => carrier(value, line, addIssue)).filter((value): value is CarrierId => value !== null);
}

function needle(value: string): BedNeedle | null {
  const match = value.match(/^([fb])(-?\d+)$/);
  return match ? { bed: match[1] as 'f' | 'b', needle: Number(match[2]) } : null;
}

function number(value: string | undefined): number | null {
  if (value === undefined || value.trim() === '') return null;
  if (/^[A-Z]$/.test(value)) return value.charCodeAt(0) - 'A'.charCodeAt(0) + 10;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/** Cheap allocation-bounded preflight shared by every lowering entrypoint. */
export function checkKnitoutSourceResourceLimits(
  text: string,
  profile: KnitoutResourceProfileV1 = 'foreign-v1',
): KnitoutParseIssue | null {
  const limits = KNITOUT_RESOURCE_LIMITS_V1[profile];
  if (text.length > limits.sourceCodeUnits) {
    return {
      line: 1,
      rule: 'knitout-resource-limit',
      message: `Knitout source exceeds the ${limits.sourceCodeUnits}-code-unit intake limit; received ${text.length}.`,
    };
  }
  let records = 1;
  let lineStart = 0;
  for (let offset = 0; offset < text.length; offset++) {
    if (text.charCodeAt(offset) !== 0x0a) continue;
    const contentEnd = offset > lineStart && text.charCodeAt(offset - 1) === 0x0d
      ? offset - 1
      : offset;
    if (contentEnd - lineStart > limits.recordCodeUnits) {
      return {
        line: records,
        rule: 'knitout-resource-limit',
        message: `Knitout record ${records} exceeds the ${limits.recordCodeUnits}-code-unit line limit.`,
      };
    }
    records++;
    if (records > limits.records) {
      return {
        line: records,
        rule: 'knitout-resource-limit',
        message: `Knitout source exceeds the ${limits.records}-record intake limit.`,
      };
    }
    lineStart = offset + 1;
  }
  if (text.length - lineStart > limits.recordCodeUnits) {
    return {
      line: records,
      rule: 'knitout-resource-limit',
      message: `Knitout record ${records} exceeds the ${limits.recordCodeUnits}-code-unit line limit.`,
    };
  }
  return null;
}

/** Convert only the named capacity refusals exposed to product UI into a typed
 * result. Syntax errors and line/source byte ceilings remain ordinary errors. */
export function classifyKnitoutCapacityIssue(
  message: string,
  profile: KnitoutResourceProfileV1,
): KnitoutCapacityIssueV1 | undefined {
  const limits = KNITOUT_RESOURCE_LIMITS_V1[profile];
  if (message.includes(`exceeds the ${limits.records}-record intake limit`)) {
    return { profile, metric: 'knitout-records', limit: limits.records, message };
  }
  if (
    message.includes(`(${limits.loweredPasses} scheduled source passes)`)
    || message.includes(`(${limits.loweredPasses} emitted passes)`)
  ) {
    return { profile, metric: 'lowered-passes', limit: limits.loweredPasses, message };
  }
  if (message.includes(`(${limits.loweredSelections} selected raster cells)`)) {
    return {
      profile,
      metric: 'selected-cells',
      limit: limits.loweredSelections,
      message,
    };
  }
  if (message.includes(`(${limits.kcodeRecords} emitted KCode records)`)) {
    return { profile, metric: 'kcode-records', limit: limits.kcodeRecords, message };
  }
  return undefined;
}

function* knitoutLines(text: string): Generator<readonly [number, string]> {
  let start = 0;
  let line = 1;
  for (let offset = 0; offset < text.length; offset++) {
    if (text.charCodeAt(offset) !== 0x0a) continue;
    const contentEnd = offset > start && text.charCodeAt(offset - 1) === 0x0d
      ? offset - 1
      : offset;
    yield [line, text.slice(start, contentEnd)];
    start = offset + 1;
    line++;
  }
  yield [line, text.slice(start)];
}

/** Parse the Studio-supported Knitout v2 subset with exact op-to-line provenance. */
export function parseKnitoutProgram(
  text: string,
  options: ParseKnitoutProgramOptions = {},
): ParsedKnitoutDocument {
  const resourceIssue = checkKnitoutSourceResourceLimits(
    text,
    options.resourceProfile ?? 'foreign-v1',
  );
  if (resourceIssue !== null) {
    return {
      program: { version: 2, carriers: [], machine: 'kniterate', yarns: {}, kniterate: {}, ops: [] },
      opLines: [],
      issues: [resourceIssue],
    };
  }

  const issues: KnitoutParseIssue[] = [];
  let omittedIssueCount = 0;
  let firstOmittedLine: number | null = null;
  let lastOmittedLine: number | null = null;
  const addIssue: AddIssue = (issue) => {
    if (issues.length < MAX_KNITOUT_PARSE_ISSUE_DETAILS) {
      issues.push(issue);
      return;
    }
    omittedIssueCount++;
    firstOmittedLine ??= issue.line;
    lastOmittedLine = issue.line;
  };
  const ops: KnitoutOp[] = [];
  const opLines: number[] = [];
  const yarns: Partial<Record<CarrierId, string>> = {};
  let declaredCarriers: CarrierId[] = [];
  let machine: 'kniterate' = 'kniterate';
  let gauge: number | undefined;
  let position: Position | undefined;
  let version = 2;

  const emit = (op: KnitoutOp, line: number) => {
    ops.push(op);
    opLines.push(line);
  };

  for (const [line, raw] of knitoutLines(text)) {
    const trimmed = raw.trim();
    if (!trimmed) continue;
    if (trimmed.startsWith(';!knitout-')) {
      const parsed = Number(trimmed.slice(';!knitout-'.length));
      if (parsed !== 2) addIssue({ line, message: `Knitout version ${parsed} is unsupported; Studio expects version 2.` });
      else version = parsed;
      continue;
    }
    if (trimmed.startsWith(';;')) {
      const header = trimmed.slice(2);
      if (header.startsWith('Carriers:')) declaredCarriers = carriers(header.slice(9).trim().split(/\s+/), line, addIssue);
      else if (header.startsWith('Machine:') && header.slice(8).trim().toLowerCase() !== 'kniterate') {
        addIssue({ line, message: `Machine "${header.slice(8).trim()}" is not Kniterate.` });
      } else if (header.startsWith('Gauge:')) gauge = number(header.slice(6).trim()) ?? undefined;
      else if (header.startsWith('Position:')) {
        const value = header.slice(9).trim() as Position;
        if (POSITIONS.has(value)) position = value;
        else addIssue({ line, message: `Position "${value}" is not recognized.` });
      } else {
        const yarn = header.match(/^Yarn-([1-6]):\s*(.*)$/);
        if (yarn) yarns[yarn[1] as CarrierId] = yarn[2] ?? '';
      }
      continue;
    }
    if (trimmed.startsWith(';')) {
      emit({ kind: 'comment', text: trimmed.slice(1).trim() }, line);
      continue;
    }

    const [code] = trimmed.split(/\s+;/, 1);
    const parts = code!.trim().split(/\s+/);
    const command = parts.shift()!;
    const fail = (message: string) => addIssue({ line, message });
    const parsedNumber = number(parts[0]);

    if (command === 'in' || command === 'out') {
      emit({ kind: command, carriers: carriers(parts, line, addIssue) }, line);
    } else if (command === 'knit' || command === 'tuck' || command === 'miss') {
      const n = needle(parts[1] ?? '');
      if (!['+', '-'].includes(parts[0] ?? '') || !n) fail(`Malformed ${command} operation.`);
      else emit({ kind: command, direction: parts[0] as '+' | '-', needle: n, carriers: carriers(parts.slice(2), line, addIssue) }, line);
    } else if (command === 'xfer') {
      const from = needle(parts[0] ?? '');
      const to = needle(parts[1] ?? '');
      if (!from || !to) fail('Malformed xfer operation.');
      else emit({ kind: 'xfer', from, to }, line);
    } else if (command === 'split') {
      const from = needle(parts[1] ?? '');
      const to = needle(parts[2] ?? '');
      if (!['+', '-'].includes(parts[0] ?? '') || !from || !to) fail('Malformed split operation.');
      else emit({ kind: 'split', direction: parts[0] as '+' | '-', from, to, carriers: carriers(parts.slice(3), line, addIssue) }, line);
    } else if (command === 'rack' && parsedNumber !== null) emit({ kind: 'rack', offset: parsedNumber }, line);
    else if (command === 'drop') {
      const n = needle(parts[0] ?? '');
      if (!n) fail('Malformed drop operation.'); else emit({ kind: 'drop', needle: n }, line);
    } else if (command === 'pause') emit({ kind: 'pause', ...(trimmed.includes(';') ? { message: trimmed.split(';').slice(1).join(';').trim() } : {}) }, line);
    else if (command === 'x-park-carriage') emit({ kind: command }, line);
    else if (command === 'x-xfer-style' && (parts[0] === 'four-pass' || parts[0] === 'two-pass')) emit({ kind: command, value: parts[0] }, line);
    else if (['x-stitch-number', 'x-xfer-stitch-number', 'x-speed-number', 'x-roller-advance', 'x-add-roller-advance', 'x-presser-speed', 'x-presser-roller', 'x-carrier-spacing', 'x-carrier-stopping-distance'].includes(command) && parsedNumber !== null) {
      emit({ kind: command, value: parsedNumber } as KnitoutOp, line);
    } else fail(`Unsupported or malformed Knitout command "${command}".`);
  }

  if (declaredCarriers.length === 0) addIssue({ line: 1, message: 'Missing required ;;Carriers header.' });
  if (omittedIssueCount > 0 && firstOmittedLine !== null && lastOmittedLine !== null) {
    issues.push({
      line: firstOmittedLine,
      rule: 'knitout-diagnostic-summary',
      message: `Knitout parse diagnostics were truncated after ${MAX_KNITOUT_PARSE_ISSUE_DETAILS} detailed findings; omitted ${omittedIssueCount} additional finding${omittedIssueCount === 1 ? '' : 's'} through line ${lastOmittedLine}.`,
      occurrences: omittedIssueCount,
    });
  }
  return {
    program: { version: version as 2, carriers: declaredCarriers, machine, ...(gauge !== undefined ? { gauge } : {}), ...(position ? { position } : {}), yarns, kniterate: {}, ops },
    opLines,
    issues,
  };
}
