import type { BedNeedle, CarrierId, KnitoutOp } from './types.js';
import type { ParsedKnitoutDocument } from './parser.js';

export interface KnitoutSourcePass {
  readonly index: number;
  readonly direction: '+' | '-' | null;
  readonly type: string;
  readonly carriers: readonly CarrierId[];
  readonly beds: readonly ('f' | 'b')[];
  readonly needleMin: number | null;
  readonly needleMax: number | null;
  readonly rack: number;
  readonly speed: number | null;
  readonly roller: number | null;
  readonly lineStart: number;
  readonly lineEnd: number;
  readonly opStart: number;
  readonly opEnd: number;
  readonly section: string;
}

function needlesFor(op: KnitoutOp): BedNeedle[] {
  switch (op.kind) {
    case 'knit': case 'tuck': case 'miss': case 'drop': return [op.needle];
    case 'xfer': case 'split': return [op.from, op.to];
    default: return [];
  }
}

function passKey(op: KnitoutOp): string | null {
  switch (op.kind) {
    case 'knit': case 'tuck': case 'miss': return `${op.kind}|${op.direction}|${op.carriers.join(',')}`;
    case 'split': return `${op.kind}|${op.direction}|${op.carriers.join(',')}`;
    case 'xfer': return `${op.kind}|${op.from.bed}-${op.to.bed}`;
    case 'drop': return 'drop';
    default: return null;
  }
}

/** Group source Knitout operations into authored carriage-pass rows without lowering them. */
export function inspectKnitoutPasses(document: ParsedKnitoutDocument): readonly KnitoutSourcePass[] {
  const passes: KnitoutSourcePass[] = [];
  let rack = 0;
  let speed: number | null = null;
  let roller: number | null = null;
  let section = 'Imported program';
  let active: { key: string; ops: KnitoutOp[]; opStart: number; lineStart: number } | null = null;

  const flush = (opEnd: number, lineEnd: number) => {
    if (!active) return;
    const first = active.ops[0]!;
    const needles = active.ops.flatMap(needlesFor);
    const beds = [...new Set(needles.map((item) => item.bed))].sort() as ('f' | 'b')[];
    const carriers = 'carriers' in first ? first.carriers : [];
    const direction = 'direction' in first ? first.direction : null;
    passes.push({
      index: passes.length,
      direction,
      type: first.kind,
      carriers,
      beds,
      needleMin: needles.length ? Math.min(...needles.map((item) => item.needle)) : null,
      needleMax: needles.length ? Math.max(...needles.map((item) => item.needle)) : null,
      rack,
      speed,
      roller,
      lineStart: active.lineStart,
      lineEnd,
      opStart: active.opStart,
      opEnd,
      section,
    });
    active = null;
  };

  for (const [opIndex, op] of document.program.ops.entries()) {
    const line = document.opLines[opIndex]!;
    if (op.kind === 'rack') { flush(opIndex, line - 1); rack = op.offset; continue; }
    if (op.kind === 'x-speed-number') { flush(opIndex, line - 1); speed = op.value; continue; }
    if (op.kind === 'x-roller-advance') { flush(opIndex, line - 1); roller = op.value; continue; }
    if (op.kind === 'comment') {
      flush(opIndex, line - 1);
      const hint = op.text.match(/\b(waste|draw|cast[- ]?on|body|pattern|bind[- ]?off|finish)\b/i)?.[1];
      if (hint) section = hint.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
      continue;
    }
    const key = passKey(op);
    if (!key) { flush(opIndex, line - 1); continue; }
    if (!active || active.key !== key) {
      flush(opIndex, line - 1);
      active = { key, ops: [op], opStart: opIndex, lineStart: line };
    } else active.ops.push(op);
  }
  flush(document.program.ops.length, document.opLines.at(-1) ?? 1);
  return passes;
}
