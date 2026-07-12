/**
 * Structured op-level diff of two `.kc` files.
 *
 * Byte-parity work (sophie, swatch.kc, customist, fairisle) recurs and used
 * to mean hand-comparing 4-MB kcode files or writing a one-off test. This
 * diffs at the carriage-pass level — the `>> Kn-Kn 2 700 0` footer lines the
 * vendor emits per pass — reporting where the two streams first diverge and
 * on which machine-behavior field (direction / type / carrier / speed /
 * roller), plus an optional raw line-level pass for true byte parity.
 *
 * Pure over the two texts (uses `parseKcPasses`); `scripts/kc-diff.ts` wraps
 * it as a CLI. The test harness in `test/knitout/reference-kc/` has parallel
 * gating logic — this is the agent-callable surface, not a replacement.
 */

import { parseKcPasses, type ParsedKcPass } from './sim/kc-parse.js';

export type KcPassField = 'direction' | 'type' | 'carrier' | 'speed' | 'roller' | 'length';

export interface KcPassDelta {
  index: number;
  /** Which field first diverged (or `length` when one side ran out). */
  field: KcPassField;
  generated: string | null;
  reference: string | null;
}

export interface KcDiff {
  /** Pass-level identical: same count and every field matches. */
  identical: boolean;
  generatedPassCount: number;
  referencePassCount: number;
  firstDelta: KcPassDelta | null;
  /** Total diverging pass indices (capped list in `deltas`). */
  deltaCount: number;
  deltas: KcPassDelta[];
  /** Raw byte/line parity — only set when `opts.bytes` is requested. */
  byteIdentical?: boolean;
  firstLineDelta?: { index: number; generated: string | null; reference: string | null } | null;
}

export interface KcDiffOptions {
  /** Cap on `deltas` length (firstDelta is always reported). Default 50. */
  maxDeltas?: number;
  /** Also compute raw line-level parity. Default false. */
  bytes?: boolean;
}

export function formatPass(p: ParsedKcPass): string {
  return `${p.direction} ${p.type} ${p.carrier} ${p.speed} ${p.roller}`;
}

/** First field on which two passes diverge, or null if equal. */
function divergentField(g: ParsedKcPass, r: ParsedKcPass): KcPassField | null {
  if (g.direction !== r.direction) return 'direction';
  if (g.type !== r.type) return 'type';
  if (g.carrier !== r.carrier) return 'carrier';
  if (g.speed !== r.speed) return 'speed';
  if (g.roller !== r.roller) return 'roller';
  return null;
}

export function diffKc(generated: string, reference: string, opts: KcDiffOptions = {}): KcDiff {
  const maxDeltas = opts.maxDeltas ?? 50;
  const gen = parseKcPasses(generated);
  const ref = parseKcPasses(reference);

  const deltas: KcPassDelta[] = [];
  const len = Math.max(gen.length, ref.length);
  for (let i = 0; i < len; i++) {
    const g = gen[i];
    const r = ref[i];
    if (!g || !r) {
      deltas.push({
        index: i,
        field: 'length',
        generated: g ? formatPass(g) : null,
        reference: r ? formatPass(r) : null,
      });
      continue;
    }
    const field = divergentField(g, r);
    if (field) {
      deltas.push({ index: i, field, generated: formatPass(g), reference: formatPass(r) });
    }
  }

  const diff: KcDiff = {
    identical: deltas.length === 0,
    generatedPassCount: gen.length,
    referencePassCount: ref.length,
    firstDelta: deltas[0] ?? null,
    deltaCount: deltas.length,
    deltas: deltas.slice(0, maxDeltas),
  };

  if (opts.bytes) {
    diff.byteIdentical = generated === reference;
    diff.firstLineDelta = firstLineDelta(generated, reference);
  }

  return diff;
}

function firstLineDelta(
  generated: string,
  reference: string,
): { index: number; generated: string | null; reference: string | null } | null {
  const a = generated.split('\n');
  const b = reference.split('\n');
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i++) {
    if (a[i] !== b[i]) {
      return { index: i, generated: a[i] ?? null, reference: b[i] ?? null };
    }
  }
  return null;
}

/**
 * Render a `±context` window of passes around `index`, aligning generated
 * and reference side by side with a `>>` marker on the divergent row.
 */
export function renderKcPassWindow(
  generated: string,
  reference: string,
  index: number,
  context = 3,
): string {
  const gen = parseKcPasses(generated);
  const ref = parseKcPasses(reference);
  const lo = Math.max(0, index - context);
  const hi = Math.min(Math.max(gen.length, ref.length), index + context + 1);
  const lines = [
    '  idx  generated                       reference',
    '  ---  ------------------------------  ------------------------------',
  ];
  for (let i = lo; i < hi; i++) {
    const g = gen[i] ? formatPass(gen[i]!) : '(missing)';
    const r = ref[i] ? formatPass(ref[i]!) : '(missing)';
    const marker = i === index ? '>>' : '  ';
    lines.push(`  ${marker} ${String(i).padStart(4)}  ${g.padEnd(30)}  ${r}`);
  }
  return lines.join('\n');
}
