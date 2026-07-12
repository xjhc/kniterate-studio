/**
 * Canonical fashioning wedge detection (2026-05-24, Phase 1c follow-up
 * follow-up): the chart-level rule shared by the stockinette-shaped walker
 * (`src/knitout/passes/stockinette-shaped.ts`) and the chart-continuity
 * validator (`src/validators/chart-continuity.ts`).
 *
 * Canonical 2-wide k2tog / ssk tiles structurally place their source slot
 * at offset ±1 from the svg (no-stitch by tile design). A FASHIONED
 * decrease is a canonical tile PLUS exactly ONE extra wedge cell at
 * distance ±2 from the svg — the wedge tells the walker to shift that
 * outer stitch inward by one needle and stack the merged source onto
 * the target instead of emitting the single-needle edge dec.
 *
 * **Scope: distance-2 only.** Deeper wedges (e.g. an EMPTY at distance
 * ±3 with the intermediate at ±2 still active) would NOT be physically
 * realizable by the current dance — the walker would need to xfer the
 * intermediate stitch through the back bed, which would corrupt a cell
 * the chart says should stay active. Until a multi-segment dance lands,
 * deeper EMPTYs are treated as authoring errors and fall through to the
 * standard `chart-continuity-row-width-mismatch` /
 * `chart-continuity-deactivated-without-decrease` diagnostics.
 *
 * Both the walker (which lowers the dance) and the validator (which has
 * to model the dance as a lateral shift, not an additional decrease)
 * need an identical notion of "is this row carrying a fashioning wedge?"
 * — hence the shared helper here.
 */
import type { ResolvedChartProjection } from './types.js';

/** The one canonical wedge distance: ±2 from the svg col. The cell at
 *  offset ±1 is the tile source slot (no-stitch by tile design); the
 *  cell at offset ±2 is the EXTRA wedge that triggers the fashioning
 *  dance. Distances beyond 2 are not supported by today's dance and are
 *  intentionally NOT recognized as fashioning. */
export const CANONICAL_FASHIONING_DISTANCE = 2;

/** Look up the per-cell semantic op via the canonical projection. Source
 *  cells of an atomic decrease tile resolve to 'no-stitch' here, so the
 *  walker / validator agree on what counts as a "no-stitch" cell. */
function opAt(projection: ResolvedChartProjection, row: number, col: number): string {
  if (row < 0 || row >= projection.rows) return 'no-stitch';
  if (col < 0 || col >= projection.cols) return 'no-stitch';
  return projection.cellAt(row, col).semanticOp;
}

/**
 * Probe for the canonical distance-2 fashioning wedge.
 *
 * Returns `CANONICAL_FASHIONING_DISTANCE` (i.e. 2) when the cell at
 * `col + direction * 2` transitioned active → no-stitch in this row.
 * Walker callers compute dance depth as `distance - 1` = 1 (a single
 * inward shift); validator callers know the wedge contributes exactly
 * 1 lateral-shift cell to the row's active-width deficit beyond what
 * the decrease's `stitchDelta` accounts for.
 *
 * Returns `null` if no wedge is present (cell didn't transition, or
 * was already no-stitch on the previous row — meaning the scan walks
 * off the panel selvedge).
 */
export function detectCanonicalFashioningWedge(input: {
  projection: ResolvedChartProjection;
  row: number;
  col: number;
  direction: 1 | -1;
}): number | null {
  const { projection, row, col, direction } = input;
  const probeCol = col + direction * CANONICAL_FASHIONING_DISTANCE;
  const prevOp = opAt(projection, row - 1, probeCol);
  const currOp = opAt(projection, row, probeCol);
  if (prevOp !== 'no-stitch' && currOp === 'no-stitch') {
    return CANONICAL_FASHIONING_DISTANCE;
  }
  return null;
}
