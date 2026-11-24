import { KNITERATE_7GG_KCODE_PROFILE_V2 } from '../../packages/machine-lib/src/browser.js';

type BodyCarrier = '3' | '4';
type Side = 'left' | 'right';
type RowKind = 'plain' | 'growth' | 'completion' | 'decrease';

export class ReversibleShapeConstraintError extends Error {}

interface SplitRow {
  row: number;
  designRow: number | null;
  width: number;
  kind: RowKind;
  splitCarrier: BodyCarrier | null;
  leftCarrierAfter: BodyCarrier;
  carriageAfter: Side;
}

/**
 * The course schedule of the 514-pass paisley, used to check that file's replay. It is that
 * file's spacing, not a limit: the full-size scarf of 2026-11-23 changed a column every two courses.
 * Earliest schedule preserving every authored row and every one-column right-edge change.
 * The 514-pass paisley starts with three plain rows, starts events three rows apart, and
 * uses the row after each growth to restore the old rear loop. Only holds can be inserted.
 * Each lower bound depends only on earlier rows, so taking the earliest available row at
 * every step attains the minimum length under this recipe.
 */
export function scheduleSupportedSplit(widths: readonly number[]) {
  const capacity = KNITERATE_7GG_KCODE_PROFILE_V2.machine.needlesPerBed;
  if (!widths.length || widths.some((w) => !Number.isInteger(w) || w < 2 || w > capacity)) {
    throw new ReversibleShapeConstraintError(`Each row needs 2 to ${capacity} active columns.`);
  }
  const rows: SplitRow[] = [];
  let leftCarrier: BodyCarrier = '3';
  let carriage: Side = 'left';
  let pendingSplit: BodyCarrier | null = null;
  let nextChange = 4;
  let width = widths[0]!;
  let firstDelay: { designRow: number; earliestRow: number } | null = null;
  let increases = 0, decreases = 0;

  function append(designRow: number | null, change = 0) {
    let kind: RowKind = 'plain';
    let splitCarrier: BodyCarrier | null = null;
    if (change === 1) {
      kind = 'growth';
      splitCarrier = pendingSplit = leftCarrier;
      carriage = 'left';
      increases++;
    } else if (pendingSplit !== null) {
      kind = 'completion';
      splitCarrier = pendingSplit;
      pendingSplit = null;
      carriage = 'right';
    } else if (change === -1) {
      kind = 'decrease';
      decreases++;
    }
    width += change;
    // Both body yarns cross the fabric on each row. The two-row increase restores their sides.
    leftCarrier = leftCarrier === '3' ? '4' : '3';
    rows.push({ row: rows.length + 1, designRow, width, kind, splitCarrier, leftCarrierAfter: leftCarrier, carriageAfter: carriage });
  }
  for (const [index, requested] of widths.entries()) {
    const change = requested - width;
    if (Math.abs(change) > 1) throw new ReversibleShapeConstraintError(`Design row ${index + 1} changes from ${width} to ${requested} columns. This recipe changes one column at a time.`);
    if (change !== 0) {
      if (rows.length + 1 < nextChange) firstDelay ??= { designRow: index + 1, earliestRow: nextChange };
      while (rows.length + 1 < nextChange) append(null);
      nextChange = rows.length + 4;
    }
    append(index + 1, change);
  }
  const endsWithGrowth = rows.at(-1)?.kind === 'growth';
  if (endsWithGrowth) append(null);
  return { rows, increases, decreases, firstDelay, endsWithGrowth, minimumRows: rows.length, extraRows: rows.length - widths.length };
}
