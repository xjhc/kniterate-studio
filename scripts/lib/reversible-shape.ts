import { parseColorworkChartV1 } from '../../packages/chart-contract/src/index.js';
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

/** Read the companion mask and binary motif as a pair. All coordinates are chart-relative. */
export function checkReversibleShape(mask: unknown, artwork: unknown, detail = false) {
  const chart = parseColorworkChartV1(artwork);
  if (chart.palette.length !== 2) throw new ReversibleShapeConstraintError('The supported split uses two face yarns.');
  if (!mask || typeof mask !== 'object' || !('activeIntervalsExclusive' in mask) || !Array.isArray(mask.activeIntervalsExclusive)
    || !('width' in mask) || mask.width !== chart.width || !('height' in mask) || mask.height !== chart.height
    || mask.activeIntervalsExclusive.length !== chart.height || !('rowNumbering' in mask) || mask.rowNumbering !== 'bottom-up') {
    throw new Error('The bottom-up shape mask must have the same dimensions as the chart and one active interval per row.');
  }
  let anchor: number | undefined;
  const motifConflicts: { row: number; column: number; reason: 'outside mask' | 'edge join or transfer' }[] = [];
  const widths = mask.activeIntervalsExclusive.map((interval: unknown, index: number) => {
    if (!Array.isArray(interval) || interval.length !== 2 || !interval.every(Number.isInteger)) throw new Error(`Invalid interval on row ${index + 1}.`);
    const [left, end] = interval as [number, number];
    if (left < 0 || end <= left || end > chart.width) throw new Error(`Row ${index + 1} is outside the chart.`);
    anchor ??= left;
    if (left !== anchor) throw new ReversibleShapeConstraintError(`The left edge moves on row ${index + 1}. The supported split shapes only the right edge.`);
    const cells = chart.cells[chart.rowNumbering === 'bottom-up' ? index : chart.height - 1 - index]!;
    cells.forEach((color, column) => {
      if (color === 0) return;
      if (column < left || column >= end) motifConflicts.push({ row: index + 1, column, reason: 'outside mask' });
      else if (column === left || column >= end - 2) motifConflicts.push({ row: index + 1, column, reason: 'edge join or transfer' });
    });
    return end - left;
  });
  const plan = scheduleSupportedSplit(widths);
  const minWidth = widths.reduce((a, b) => Math.min(a, b));
  const maxWidth = widths.reduce((a, b) => Math.max(a, b));
  return {
    kind: 'kniterate-studio-reversible-shape', recipe: '514-pass alternating supported split, fixed left edge',
    fitsRowAndMotifConstraints: plan.extraRows === 0 && motifConflicts.length === 0,
    requestedRows: widths.length, minimumRowsAtThisCadence: plan.minimumRows, additionalRows: plan.extraRows,
    firstDelay: plan.firstDelay, needsCompletionAfterLastDesignRow: plan.endsWithGrowth, increases: plan.increases, decreases: plan.decreases,
    widthRange: [minWidth, maxWidth], observedBodyWidthRange: [8, 21], startsAtRecordedWidth: widths[0] === 8,
    extendsBeyondObservedWidths: minWidth < 8 || maxWidth > 21,
    motifConflictCount: motifConflicts.length, motifConflicts: detail ? motifConflicts : motifConflicts.slice(0, 8),
    ...(detail ? { rows: plan.rows } : {}),
    scope: 'Course schedule only. Extra rows have no assigned artwork. Machine placement, emitted carrier paths, joined-edge appearance and washed gauge require separate checks.',
  };
}
