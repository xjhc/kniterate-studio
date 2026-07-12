/**
 * Failure-message helpers for the reference-.kc parity harness.
 *
 * Goal: when a gate fails, the message should let a human reader
 * locate the divergence without re-running diff tools by hand. We
 * print:
 *   - the case + gate + section identifiers,
 *   - the first structural delta with ±N passes of context, or
 *   - the first byte/line delta with line context.
 */

import type { ParsedKcPass } from '../../../src/knitout/sim/kc-parse.js';
import type { PredictedPass } from '../../../src/knitout/sim/types.js';

const PASS_CONTEXT = 3;
const LINE_CONTEXT = 2;

/** Compact pass representation for diagnostics. */
function formatPass(pass: ParsedKcPass): string {
  return `${pass.direction} ${pass.type} ${pass.carrier} ${pass.speed} ${pass.roller}`;
}

/** Find the first index where two pass arrays diverge on any field —
 *  direction, type, carrier, speed, OR roller. All five are machine-
 *  behavior fields: a regression that changes carriage speed from
 *  700 to 300 (or stops emitting `x-roller-advance`) is exactly the
 *  kind of drift this gate exists to catch. If a looser gate is
 *  needed later (e.g. ignoring speed/roller during a deliberate
 *  retuning), add a separate `pass-shape` gate kind rather than
 *  loosening this one. */
export function firstStructuralPassDelta(
  generated: readonly ParsedKcPass[],
  reference: readonly ParsedKcPass[],
): number | null {
  const len = Math.max(generated.length, reference.length);
  for (let i = 0; i < len; i++) {
    const g = generated[i];
    const r = reference[i];
    if (!g || !r) return i;
    if (g.direction !== r.direction) return i;
    if (g.type !== r.type) return i;
    if (g.carrier !== r.carrier) return i;
    if (g.speed !== r.speed) return i;
    if (g.roller !== r.roller) return i;
  }
  return null;
}

/** Render a structural-delta failure message anchored on the first
 *  divergent pass index, with ±PASS_CONTEXT passes of context on each
 *  side. */
export function renderPassStructureDiff(
  generated: readonly ParsedKcPass[],
  reference: readonly ParsedKcPass[],
  firstDelta: number,
): string {
  const lo = Math.max(0, firstDelta - PASS_CONTEXT);
  const hi = Math.min(
    Math.max(generated.length, reference.length),
    firstDelta + PASS_CONTEXT + 1,
  );
  const lines: string[] = [];
  lines.push(
    `First structural delta at pass index ${firstDelta}`,
    `  (generated.length=${generated.length}, reference.length=${reference.length})`,
    '',
    '  idx  generated                       reference',
    '  ---  ------------------------------  ------------------------------',
  );
  for (let i = lo; i < hi; i++) {
    const g = generated[i] ? formatPass(generated[i]!) : '(missing)';
    const r = reference[i] ? formatPass(reference[i]!) : '(missing)';
    const marker = i === firstDelta ? '>>' : '  ';
    lines.push(`  ${marker} ${String(i).padStart(3)}  ${g.padEnd(30)}  ${r}`);
  }
  return lines.join('\n');
}

/** Find the first line index where two strings diverge. Returns null
 *  when identical. */
export function firstLineDelta(
  generated: string,
  reference: string,
): { index: number; generated: string | undefined; reference: string | undefined } | null {
  const a = generated.split('\n');
  const b = reference.split('\n');
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i++) {
    if (a[i] !== b[i]) {
      return { index: i, generated: a[i], reference: b[i] };
    }
  }
  return null;
}

/** Render a byte-level delta with line context. */
export function renderByteDiff(
  generated: string,
  reference: string,
  delta: { index: number; generated: string | undefined; reference: string | undefined },
  sectionLineStart: number,
): string {
  const a = generated.split('\n');
  const b = reference.split('\n');
  const lo = Math.max(0, delta.index - LINE_CONTEXT);
  const hi = Math.min(Math.max(a.length, b.length), delta.index + LINE_CONTEXT + 1);
  const lines: string[] = [];
  lines.push(
    `First byte delta at section-relative line ${delta.index}`,
    `  (~ absolute line ${sectionLineStart + delta.index})`,
    '',
  );
  for (let i = lo; i < hi; i++) {
    const marker = i === delta.index ? '>>' : '  ';
    const g = a[i] === undefined ? '(missing)' : a[i];
    const r = b[i] === undefined ? '(missing)' : b[i];
    if (g === r) {
      lines.push(`  ${marker} ${i}: ${truncate(g!)}`);
    } else {
      lines.push(`  ${marker} ${i}: GEN  ${truncate(g)}`);
      lines.push(`  ${marker} ${i}: REF  ${truncate(r)}`);
    }
  }
  return lines.join('\n');
}

const MAX_LINE_LEN = 120;
function truncate(s: string | undefined): string {
  if (s === undefined) return '(missing)';
  if (s.length <= MAX_LINE_LEN) return s;
  return s.slice(0, MAX_LINE_LEN) + ` ... (+${s.length - MAX_LINE_LEN} chars)`;
}

/** Stable fingerprint of a section's pass structure: a string of
 *  `(direction, type, carrier)` tuples joined with `;`. Two sections
 *  with the same fingerprint have the same machine-behavior shape
 *  even if individual speed/roller values diverge. */
export function passStructureFingerprint(passes: readonly ParsedKcPass[]): string {
  return passes.map(p => `${p.direction}${p.type}${p.carrier}`).join(';');
}

// ---- Predicted-vs-parsed (Phase 4, 2026-05-24) ---------------------------
//
// The CarriageSimulator emits `PredictedPass` (multi-carrier list,
// isAutoMove/isPark flags). The vendor's .kc text encodes the same passes
// as `ParsedKcPass` (single carrier slot — `'0'` is the no-carrier slot
// for auto-move, xfer, drop, park). Phase 4 wants a structural delta
// between the two so a chart compile can be verified end-to-end without
// duplicating the projection logic in every test.

interface ComparableShape {
  readonly direction: '>>' | '<<';
  readonly type: string;
  readonly carrier: string;
}

function comparableFromPredicted(p: PredictedPass): ComparableShape {
  // Vendor encodes auto-move / park / xfer with carrier slot '0'. The
  // simulator marks them via `carriers === []`.
  const carrier = p.carriers.length === 0
    ? '0'
    : (p.carriers.length === 1 ? p.carriers[0]! : p.carriers[0]!);
  return { direction: p.direction, type: p.type, carrier };
}

function comparableFromParsed(p: ParsedKcPass): ComparableShape {
  return { direction: p.direction, type: p.type, carrier: p.carrier };
}

/**
 * Find the first index where simulator-predicted passes diverge from
 * vendor-parsed passes on direction / type / carrier. Speed/roller are
 * NOT compared here — simulator predictions for those fields drift in
 * known-cosmetic ways on legacy emitters; the structural fields are
 * the behavior signal. Returns null when the prefix is identical (and
 * lengths match).
 */
export function predictedVsParsedDelta(
  predicted: readonly PredictedPass[],
  parsed: readonly ParsedKcPass[],
): number | null {
  const len = Math.max(predicted.length, parsed.length);
  for (let i = 0; i < len; i++) {
    const p = predicted[i];
    const v = parsed[i];
    if (!p || !v) return i;
    const pa = comparableFromPredicted(p);
    const va = comparableFromParsed(v);
    if (pa.direction !== va.direction) return i;
    if (pa.type !== va.type) return i;
    if (pa.carrier !== va.carrier) return i;
  }
  return null;
}

/** Render the first predicted-vs-parsed delta with ±N passes of context.
 *  Mirrors `renderPassStructureDiff` for the predicted-vs-vendor case. */
export function renderPredictedVsParsedDiff(
  predicted: readonly PredictedPass[],
  parsed: readonly ParsedKcPass[],
  firstDelta: number,
): string {
  const lo = Math.max(0, firstDelta - PASS_CONTEXT);
  const hi = Math.min(
    Math.max(predicted.length, parsed.length),
    firstDelta + PASS_CONTEXT + 1,
  );
  const lines: string[] = [];
  lines.push(
    `First predicted-vs-parsed delta at pass index ${firstDelta}`,
    `  (predicted.length=${predicted.length}, parsed.length=${parsed.length})`,
    '',
    '  idx  predicted (sim)                 parsed (vendor)',
    '  ---  ------------------------------  ------------------------------',
  );
  for (let i = lo; i < hi; i++) {
    const p = predicted[i]
      ? formatComparable(comparableFromPredicted(predicted[i]!))
      : '(missing)';
    const v = parsed[i]
      ? formatComparable(comparableFromParsed(parsed[i]!))
      : '(missing)';
    const marker = i === firstDelta ? '>>' : '  ';
    lines.push(`  ${marker} ${String(i).padStart(3)}  ${p.padEnd(30)}  ${v}`);
  }
  return lines.join('\n');
}

function formatComparable(c: ComparableShape): string {
  return `${c.direction} ${c.type} ${c.carrier}`;
}
