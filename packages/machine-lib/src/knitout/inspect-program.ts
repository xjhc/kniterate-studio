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
  let active: {
    key: string;
    first: KnitoutOp;
    opStart: number;
    lineStart: number;
    beds: Set<'f' | 'b'>;
    needleMin: number | null;
    needleMax: number | null;
  } | null = null;

  const accumulateNeedles = (op: KnitoutOp): void => {
    if (active === null) return;
    for (const needle of needlesFor(op)) {
      active.beds.add(needle.bed);
      active.needleMin = active.needleMin === null
        ? needle.needle
        : Math.min(active.needleMin, needle.needle);
      active.needleMax = active.needleMax === null
        ? needle.needle
        : Math.max(active.needleMax, needle.needle);
    }
  };

  const flush = (opEnd: number, lineEnd: number) => {
    if (!active) return;
    const first = active.first;
    const beds = [...active.beds].sort() as ('f' | 'b')[];
    const carriers = 'carriers' in first ? first.carriers : [];
    const direction = 'direction' in first ? first.direction : null;
    passes.push({
      index: passes.length,
      direction,
      type: first.kind,
      carriers,
      beds,
      needleMin: active.needleMin,
      needleMax: active.needleMax,
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
      active = {
        key,
        first: op,
        opStart: opIndex,
        lineStart: line,
        beds: new Set(),
        needleMin: null,
        needleMax: null,
      };
    }
    accumulateNeedles(op);
  }
  flush(document.program.ops.length, document.opLines.at(-1) ?? 1);
  return passes;
}
