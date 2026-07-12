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
}

export interface ParsedKnitoutDocument {
  readonly program: KnitoutProgram;
  /** Source line for every op in `program.ops` (1-indexed). */
  readonly opLines: readonly number[];
  readonly issues: readonly KnitoutParseIssue[];
}

const CARRIERS = new Set<string>(ALL_CARRIERS);
const POSITIONS = new Set<Position>(['Left', 'Center', 'Right', 'Keep']);

function carrier(value: string, line: number, issues: KnitoutParseIssue[]): CarrierId | null {
  if (CARRIERS.has(value)) return value as CarrierId;
  issues.push({ line, rule: 'carrier-id-legal', message: `Carrier "${value}" is not legal on Kniterate (expected 1-6).` });
  return null;
}

function carriers(values: string[], line: number, issues: KnitoutParseIssue[]): CarrierId[] {
  return values.map((value) => carrier(value, line, issues)).filter((value): value is CarrierId => value !== null);
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

/** Parse the Studio-supported Knitout v2 subset with exact op-to-line provenance. */
export function parseKnitoutProgram(text: string): ParsedKnitoutDocument {
  const issues: KnitoutParseIssue[] = [];
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

  for (const [index, raw] of text.split(/\r?\n/).entries()) {
    const line = index + 1;
    const trimmed = raw.trim();
    if (!trimmed) continue;
    if (trimmed.startsWith(';!knitout-')) {
      const parsed = Number(trimmed.slice(';!knitout-'.length));
      if (parsed !== 2) issues.push({ line, message: `Knitout version ${parsed} is unsupported; Studio expects version 2.` });
      else version = parsed;
      continue;
    }
    if (trimmed.startsWith(';;')) {
      const header = trimmed.slice(2);
      if (header.startsWith('Carriers:')) declaredCarriers = carriers(header.slice(9).trim().split(/\s+/), line, issues);
      else if (header.startsWith('Machine:') && header.slice(8).trim().toLowerCase() !== 'kniterate') {
        issues.push({ line, message: `Machine "${header.slice(8).trim()}" is not Kniterate.` });
      } else if (header.startsWith('Gauge:')) gauge = number(header.slice(6).trim()) ?? undefined;
      else if (header.startsWith('Position:')) {
        const value = header.slice(9).trim() as Position;
        if (POSITIONS.has(value)) position = value;
        else issues.push({ line, message: `Position "${value}" is not recognized.` });
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
    const fail = (message: string) => issues.push({ line, message });
    const parsedNumber = number(parts[0]);

    if (command === 'in' || command === 'out') {
      emit({ kind: command, carriers: carriers(parts, line, issues) }, line);
    } else if (command === 'knit' || command === 'tuck' || command === 'miss') {
      const n = needle(parts[1] ?? '');
      if (!['+', '-'].includes(parts[0] ?? '') || !n) fail(`Malformed ${command} operation.`);
      else emit({ kind: command, direction: parts[0] as '+' | '-', needle: n, carriers: carriers(parts.slice(2), line, issues) }, line);
    } else if (command === 'xfer') {
      const from = needle(parts[0] ?? '');
      const to = needle(parts[1] ?? '');
      if (!from || !to) fail('Malformed xfer operation.');
      else emit({ kind: 'xfer', from, to }, line);
    } else if (command === 'split') {
      const from = needle(parts[1] ?? '');
      const to = needle(parts[2] ?? '');
      if (!['+', '-'].includes(parts[0] ?? '') || !from || !to) fail('Malformed split operation.');
      else emit({ kind: 'split', direction: parts[0] as '+' | '-', from, to, carriers: carriers(parts.slice(3), line, issues) }, line);
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

  if (declaredCarriers.length === 0) issues.push({ line: 1, message: 'Missing required ;;Carriers header.' });
  return {
    program: { version: version as 2, carriers: declaredCarriers, machine, ...(gauge !== undefined ? { gauge } : {}), ...(position ? { position } : {}), yarns, kniterate: {}, ops },
    opLines,
    issues,
  };
}
