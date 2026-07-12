/**
 * Batch D Phase 4 (2026-05-22): row-rack schedule builder.
 *
 * Reads `kind: 'racking'` row annotations off a knitlab1 chart and
 * produces a normalized schedule keyed to resolved-row indices. The
 * walkers consume this to emit `rack(N)` ops at row boundaries where
 * the value differs from the current ambient rack.
 *
 * Adjacent same-value entries collapse: only boundary records survive.
 * Rows not covered by any annotation default to rack 0 (the carriage's
 * starting position).
 *
 * Phase 0 §0.5 architecture (per `docs/palette-batch-d-cables-and-
 * racking-plan.md`): this is the right seam — NOT `chartUsesShape
 * Annotations` (which would force a rectangular swatch with racking
 * into shape mode), and NOT writing into `BedState.racking` (which is
 * a validator snapshot, not an emit destination).
 */

import type { KnitlabChartAnnotation } from './knitlab1-contract.js';

export interface RowRackEntry {
  /** Resolved-row index where this rack value takes effect. */
  row: number;
  /** The rack value the walker should emit at the start of this row. */
  racking: number;
}

/**
 * Build a row-rack schedule from chart annotations. Returns an entry
 * for every annotated row (in row-ascending order). Rows NOT in the
 * schedule default to rack 0 at lookup time.
 *
 * Per the Phase 0 §0.5 architecture: the annotation explicitly marks
 * which rows hold a non-zero rack; the carriage returns to 0 on any
 * row the user didn't annotate. Authors who want a contiguous racked
 * band annotate every row in the band; the walker's ambient-rack
 * tracking collapses runs of same-value rows into a single rack op at
 * the boundary.
 *
 * If multiple annotations target the same row, the last one wins.
 *
 * Note: the caller is responsible for any row-index remap when the
 * chart is reversed for shape mode — pass annotations whose `anchor.row`
 * is already in resolved-row coordinates.
 */
export function rowRackScheduleFromAnnotations(
  annotations: readonly KnitlabChartAnnotation[],
): RowRackEntry[] {
  const perRow = new Map<number, number>();
  for (const annotation of annotations) {
    if (annotation.kind !== 'racking') continue;
    if (annotation.anchor.scope !== 'row') continue;
    const row = Math.floor(annotation.anchor.row);
    if (!Number.isInteger(row) || row < 0) continue;
    const racking = annotation.racking;
    if (typeof racking !== 'number' || !Number.isFinite(racking)) continue;
    perRow.set(row, Math.trunc(racking));
  }

  const sortedRows = [...perRow.keys()].sort((a, b) => a - b);
  return sortedRows.map(row => ({ row, racking: perRow.get(row)! }));
}

/**
 * Carriage-pause annotation (Milestone B, 2026-05-26): build a set of
 * row indices that carry a `kind: 'pause'` row annotation. The walkers
 * emit a knitout `pause` op before each such row's knit pass.
 */
export function rowPauseSetFromAnnotations(
  annotations: readonly KnitlabChartAnnotation[],
): ReadonlySet<number> {
  const paused = new Set<number>();
  for (const annotation of annotations) {
    if (annotation.kind !== 'pause') continue;
    if (annotation.anchor.scope !== 'row') continue;
    const row = Math.floor(annotation.anchor.row);
    if (Number.isInteger(row) && row >= 0) paused.add(row);
  }
  return paused;
}

/**
 * Helper for walkers: look up the racking value for a given row.
 * Returns the annotated value when the row is in the schedule, or 0
 * (the default ambient) when it isn't.
 */
export function rackingAtRow(
  schedule: readonly RowRackEntry[],
  row: number,
): number {
  for (const entry of schedule) {
    if (entry.row === row) return entry.racking;
    if (entry.row > row) return 0;
  }
  return 0;
}

export interface RowStitchEntry {
  /** Resolved-row index where this stitch number takes effect. */
  row: number;
  /** Machine stitch number the walker should emit at the start of this row. */
  stitchNumber: number;
}

/**
 * Build a row stitch-number schedule from `kind: 'stitch-number'` row
 * annotations — "these rows knit at tension X." Mirrors
 * `rowRackScheduleFromAnnotations`, with one semantic difference: stitch
 * number is STICKY. Unlike racking (which returns to 0 on unannotated
 * rows), the machine holds the last stitch number until a later row
 * changes it — see `stitchNumberAtRow` returning `undefined` (not a
 * default) for unannotated rows. Out-of-range / non-integer values are
 * dropped (the stitch-number-range validator guards the rest).
 *
 * If multiple annotations target the same row, the last one wins.
 */
export function rowStitchScheduleFromAnnotations(
  annotations: readonly KnitlabChartAnnotation[],
): RowStitchEntry[] {
  const perRow = new Map<number, number>();
  for (const annotation of annotations) {
    if (annotation.kind !== 'stitch-number') continue;
    if (annotation.anchor.scope !== 'row') continue;
    const row = Math.floor(annotation.anchor.row);
    if (!Number.isInteger(row) || row < 0) continue;
    const stitchNumber = annotation.stitchNumber;
    if (typeof stitchNumber !== 'number' || !Number.isInteger(stitchNumber)) continue;
    if (stitchNumber < 0 || stitchNumber > 35) continue;
    perRow.set(row, stitchNumber);
  }

  const sortedRows = [...perRow.keys()].sort((a, b) => a - b);
  return sortedRows.map(row => ({ row, stitchNumber: perRow.get(row)! }));
}

/**
 * Look up the stitch number annotated for a row. Returns `undefined`
 * when the row carries no `stitch-number` annotation — the walker keeps
 * the ambient (last-set) value, since stitch number is sticky.
 */
export function stitchNumberAtRow(
  schedule: readonly RowStitchEntry[],
  row: number,
): number | undefined {
  for (const entry of schedule) {
    if (entry.row === row) return entry.stitchNumber;
    if (entry.row > row) return undefined;
  }
  return undefined;
}
