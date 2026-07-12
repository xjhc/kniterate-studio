/**
 * Chart-level fabric continuity validation.
 *
 * This runs on semantic chart cells before any machine lowering. It checks the
 * core shaped-chart invariant under ordinary result-row chart semantics:
 * a row's active stitch count is the count after that row's semantic deltas
 * have fired, so `activeWidth - stitchDelta` must match the previous row's
 * active width.
 */

import {
  isKnitOp,
  primitiveForOp,
  type KnitlabChartAnnotation,
  type KnitOp,
} from '../colorwork/knitlab1-contract.js';
import type { ResolvedChartProjection } from '../chart-core/types.js';
import {
  CANONICAL_FASHIONING_DISTANCE,
  detectCanonicalFashioningWedge,
} from '../chart-core/fashioning.js';
import type { ValidationMessage } from './knitout-program.js';

/**
 * Batch D Phase 2 (2026-05-22): a lateral-shift event marks a row as
 * carrying a rack-and-xfer move that transfers loops from the source
 * columns onto the destination columns. The walker fires this BEFORE
 * the row's knit pass; from the chart's PoV, the row has matching
 * deactivation + activation that should NOT raise the standard
 * `chart-continuity-deactivated-without-decrease` /
 * `chart-continuity-activated-without-increase` errors. The chart-level
 * compile-safety gate (`validateShiftSourceColumns` in compile-chart.ts)
 * still validates that source columns are no-stitch on the same row and
 * active on the previous row.
 */
export interface ContinuityShiftEvent {
  row: number;
  destStartCol: number;
  sourceStartCol: number;
  count: number;
}

export interface ChartContinuityInput {
  /** Phase 2 Step 6 (2026-05-23, Phase 1A consumer migration): the
   *  validator now reads cell semantics from the chart-core projection.
   *  Owner-aware per-cell ops (atomic ssk source NS, etc.) come straight
   *  off `cellAt(r, c).semanticOp`; the previous `resolved` + `keyPalette`
   *  + `cellOps` peek combination is gone. Callers must build a
   *  projection in the same row-space the validator iterates (e.g. the
   *  shape-mode row-reversed view inside compile-chart). */
  projection: ResolvedChartProjection;
  annotations?: readonly KnitlabChartAnnotation[];
  shiftEvents?: readonly ContinuityShiftEvent[];
}

interface RowContinuitySummary {
  rowIndex: number;
  activeWidth: number;
  activeCols: number[];
  stitchDelta: number;
  deltaCells: Array<{ col: number; op: KnitOp; delta: number }>;
  bindOffSpans: Array<{ start: number; end: number; side: 'left' | 'right' | 'top' | 'bottom'; delta: number }>;
  hasUnknownOps: boolean;
  /**
   * Batch D Phase 3 (2026-05-22): columns where THIS row painted drop-st.
   * Drop-st cells are nominally active for the row's own checks, but they
   * mark a column termination — the next row's no-stitch in the same
   * column is exempt from `chart-continuity-deactivated-without-decrease`
   * and is discounted from the next-row width-mismatch check.
   */
  dropCols: number[];
}

export function validateChartContinuity(input: ChartContinuityInput): ValidationMessage[] {
  const messages: ValidationMessage[] = [];
  const summaries: RowContinuitySummary[] = [];
  const splitActiveRows: number[] = [];

  // Per-row shift exemption maps. For each row with shift events, build
  // a Set of source columns (exempted from the deactivated-without-
  // decrease check) and dest columns (exempted from the activated-
  // without-increase check). The walker's rack+xfer dance handles the
  // move; the standard per-column checks would otherwise mis-flag the
  // chart even though the row balance is preserved.
  //
  // Per-stitch shift-1 semantics: each event vacates exactly ONE source
  // column regardless of run length; the destination block still spans
  // `count` columns (the stitches that ride on the rack-and-xfer dance).
  const shiftSourceExempt = new Map<number, Set<number>>();
  const shiftDestExempt = new Map<number, Set<number>>();
  for (const event of input.shiftEvents ?? []) {
    let src = shiftSourceExempt.get(event.row);
    if (!src) { src = new Set<number>(); shiftSourceExempt.set(event.row, src); }
    let dst = shiftDestExempt.get(event.row);
    if (!dst) { dst = new Set<number>(); shiftDestExempt.set(event.row, dst); }
    src.add(event.sourceStartCol);
    for (let i = 0; i < event.count; i++) {
      dst.add(event.destStartCol + i);
    }
  }

  for (let rowIndex = 0; rowIndex < input.projection.rows; rowIndex++) {
    const summary: RowContinuitySummary = {
      rowIndex,
      activeWidth: 0,
      activeCols: [],
      stitchDelta: 0,
      deltaCells: [],
      bindOffSpans: bindOffSpansForRow(rowIndex, input.annotations ?? []),
      hasUnknownOps: false,
      dropCols: [],
    };
    for (const span of summary.bindOffSpans) {
      summary.stitchDelta += span.delta;
    }

    for (let col = 0; col < input.projection.cols; col++) {
      const projected = input.projection.cellAt(rowIndex, col);
      // Detect malformed keys (defined op not in KNIT_OPS) by reading
      // the raw keyDef — projection's semanticOp silently falls back to
      // 'knit' for unknown ops via `opForKey`, so we still need the
      // direct read for the unknown-op diagnostic.
      const rawOp = (projected.keyDef as { op?: unknown } | null | undefined)?.op;
      if (rawOp !== undefined && !isKnitOp(rawOp)) {
        summary.hasUnknownOps = true;
        messages.push({
          severity: 'error',
          rule: 'chart-continuity-unknown-op',
          message: `Row ${rowIndex + 1}, col ${col + 1} uses key "${projected.keyId}" with unknown semantic op "${String(rawOp)}".`,
        });
        continue;
      }

      // Owner-aware: atomic-tile source cells resolve to 'no-stitch' via
      // the projection (their per-cell `role === 'source'`).
      const op = projected.semanticOp;
      if (op === 'no-stitch') continue;

      summary.activeWidth += 1;
      summary.activeCols.push(col);
      const stitchDelta = primitiveForOp(op).stitchDelta ?? 0;
      summary.stitchDelta += stitchDelta;
      if (stitchDelta !== 0) {
        summary.deltaCells.push({ col, op, delta: stitchDelta });
      }
      // Batch D Phase 3 (2026-05-22): record drop-st columns so the next
      // row's checks discount them (the column terminates here).
      if (op === 'drop-st') {
        summary.dropCols.push(col);
      }
    }

    summaries.push(summary);
  }

  for (const summary of summaries) {
    if (summary.hasUnknownOps) continue;
    if (!isContiguous(summary.activeCols)) {
      const segments = activeSegments(summary.activeCols);
      // 2026-05-21: interior decorative decreases (sk2p, the carried-up
      // single-col residue of a centered double dec) leave a width-1
      // active segment between two no-stitch wedges. Don't count those
      // as "shoulder" segments — they're just a stitch column the
      // garment is going to keep around even though the wedge widens.
      const isResidueOfDec = (seg: { start: number; end: number }): boolean =>
        seg.end - seg.start === 1;
      const shoulderSegments = segments.length === 3
        ? segments.filter((seg, i) => !(i === 1 && isResidueOfDec(seg)))
        : segments;
      if (summary.rowIndex === 0) {
        messages.push({
          severity: 'error',
          rule: 'chart-continuity-initial-split-row',
          message: `Row ${summary.rowIndex + 1} has ${segments.length} active segments. Shaped Track A export needs a contiguous cast-on row before a split neckline can open.`,
        });
      } else if (shoulderSegments.length > 2) {
        messages.push({
          severity: 'error',
          rule: 'chart-continuity-too-many-active-segments',
          message: `Row ${summary.rowIndex + 1} has ${segments.length} active segments. Shaped Track A export currently supports at most two shoulder segments (single-cell decorative-dec residues exempted).`,
        });
      } else {
        splitActiveRows.push(summary.rowIndex);
      }
    }
    if (summary.rowIndex === 0 && summary.stitchDelta !== 0) {
      messages.push({
        severity: 'error',
        rule: 'chart-continuity-initial-shape',
        message: `Row ${summary.rowIndex + 1} has semantic delta ${formatSigned(summary.stitchDelta)} but no previous chart row to supply the source stitches. Start with a full-width cast-on row before shaping.`,
      });
    }
  }
  if (splitActiveRows.length > 0) {
    messages.push({
      severity: 'warning',
      rule: 'chart-continuity-split-active-row',
      message: `${formatRows(splitActiveRows)} ${splitActiveRows.length === 1 ? 'has' : 'have'} two active shoulder segments. Generated-chart lowering knits each shoulder as a separate carrier segment (one shoulder, then the other, with the yarn cut between); inspect the neck finish before machine use.`,
    });
  }

  // Batch D Phase 3 (2026-05-22): rows that carry a `short-row-turn`
  // annotation legitimately end short of full width — the partial-row
  // wrap-and-turn is structurally valid. Suppress
  // `chart-continuity-row-width-mismatch` for those rows so the authoring
  // path doesn't fire a false-positive block.
  const shortRowTurnRows = new Set<number>();
  for (const annotation of input.annotations ?? []) {
    if (annotation.kind !== 'short-row-turn') continue;
    if (annotation.anchor.scope !== 'cell') continue;
    shortRowTurnRows.add(annotation.anchor.row);
  }

  // Per-stitch shift-1 semantics: each shift event vacates exactly ONE
  // source column (the destination-side edge stitch becomes a k2tog on
  // the next knit pass, absorbing one stitch). The row-width check below
  // treats `current.activeWidth` as the source count after the shift, so
  // it sees a deficit of 1 per shift event. Pre-compute the per-row
  // shift event count to add back so the check stays accurate.
  const shiftCountByRow = new Map<number, number>();
  for (const event of input.shiftEvents ?? []) {
    shiftCountByRow.set(event.row, (shiftCountByRow.get(event.row) ?? 0) + 1);
  }

  for (let rowIndex = 1; rowIndex < summaries.length; rowIndex++) {
    const previous = summaries[rowIndex - 1]!;
    const current = summaries[rowIndex]!;
    if (previous.hasUnknownOps || current.hasUnknownOps) continue;

    const expectedCurrentStart = current.activeWidth - current.stitchDelta;

    if (expectedCurrentStart < 0) {
      messages.push({
        severity: 'error',
        rule: 'chart-continuity-negative-width',
        message: `Row ${current.rowIndex + 1} has ${current.activeWidth} active stitches and semantic delta ${formatSigned(current.stitchDelta)}, which implies a negative source-row width.`,
      });
      continue;
    }

    // Batch D Phase 3 (2026-05-22): discount drop-st cells in the previous
    // row from the row-width-mismatch check. The dropped columns are
    // expected to be no-stitch in `current`, so the activeWidth difference
    // they cause is structural, not an authoring bug.
    const dropAdjustedPrevious = previous.activeWidth - previous.dropCols.length;
    // EC2 shift-aware adjustment: each shift event vacates `count`
    // source cells (active in previous, no-stitch in current). Adjust
    // the comparison so the validator sees the shift as net-zero
    // rearrangement rather than a -count mismatch.
    const shiftAdjustment = shiftCountByRow.get(current.rowIndex) ?? 0;
    // Phase 1c follow-up (2026-05-24): canonical fashioned decreases
    // (k2tog/ssk tile + extra wedge cell beyond the tile source slot)
    // also vacate previous-row cells that DON'T correspond to a
    // stitch-count decrease — the walker shifts them inward by one
    // needle, like a one-step lateral shift. The decrease's own
    // `stitchDelta = -1` already accounts for the tile source slot at
    // offset ±1; each extra wedge cell beyond it is a `depth - 1` shift
    // and must be added back here, mirroring `shiftAdjustment`.
    const fashioningAdjustment = countFashioningShiftCells(current, input.projection);
    const adjustedPrevious = dropAdjustedPrevious - shiftAdjustment - fashioningAdjustment;
    if (
      adjustedPrevious !== expectedCurrentStart &&
      !shortRowTurnRows.has(current.rowIndex)
    ) {
      messages.push({
        severity: 'error',
        rule: 'chart-continuity-row-width-mismatch',
        message: [
          `Row ${current.rowIndex + 1} has ${current.activeWidth} active stitches and semantic delta ${formatSigned(current.stitchDelta)},`,
          `so the previous row should have ${expectedCurrentStart} active stitches; found ${adjustedPrevious}.`,
          deltaCellSummary(current),
        ].filter(Boolean).join(' '),
      });
    }

    messages.push(...validateResultRowPlacement(previous, current, {
      shiftSourceExempt: shiftSourceExempt.get(current.rowIndex),
      shiftDestExempt: shiftDestExempt.get(current.rowIndex),
      // Phase 3: cols where the PREVIOUS row painted drop-st — the next
      // row's no-stitch in those cols is the expected termination.
      dropPrevExempt: new Set(previous.dropCols),
    }));
  }

  // Batch D Phase 3 (2026-05-22): drop-st orphan check. A drop-st cell
  // terminates the column it's painted on; subsequent rows in the same
  // column MUST be no-stitch (the stitch has been released, so any
  // following knit cell would fail bed-state-knit-from-empty). Classified
  // as blocked, not draftable — drop-st with continuing stitches is
  // genuinely incoherent, not a mid-edit state.
  for (let r = 0; r < input.projection.rows - 1; r++) {
    for (let c = 0; c < input.projection.cols; c++) {
      if (input.projection.cellAt(r, c).semanticOp !== 'drop-st') continue;
      // Look forward for any still-active cells in this column. The
      // projection's owner-aware `semanticOp` ensures that an
      // atomic-tile source cell in a future row resolves to 'no-stitch'
      // (not the parent key's footprint op), so we don't mistake a
      // source no-stitch for a continuing active stitch.
      const orphanRows: number[] = [];
      for (let nextRow = r + 1; nextRow < input.projection.rows; nextRow++) {
        const nextOp = input.projection.cellAt(nextRow, c).semanticOp;
        if (nextOp === 'no-stitch') continue;
        orphanRows.push(nextRow);
      }
      if (orphanRows.length > 0) {
        messages.push({
          severity: 'error',
          rule: 'chart-continuity-drop-orphan',
          message: `Drop-st at row ${r + 1}, col ${c + 1} releases the column, but row${orphanRows.length === 1 ? '' : 's'} ${orphanRows.map(n => n + 1).join(', ')} still ${orphanRows.length === 1 ? 'has' : 'have'} an active cell in that column. Paint no-stitch above the drop-st so the column terminates cleanly.`,
        });
      }
    }
  }

  return messages;
}

function validateResultRowPlacement(
  previous: RowContinuitySummary,
  current: RowContinuitySummary,
  exemptions?: {
    /** Batch D Phase 2 (2026-05-22): cols exempted from the
     *  deactivated-without-decrease check because they are the source side
     *  of a lateral-shift event on this row. */
    shiftSourceExempt?: ReadonlySet<number>;
    /** Cols exempted from the activated-without-increase check because they
     *  are the destination side of a lateral-shift event on this row. */
    shiftDestExempt?: ReadonlySet<number>;
    /** Batch D Phase 3 (2026-05-22): cols where the PREVIOUS row painted
     *  drop-st. The next-row deactivation (becoming no-stitch) is the
     *  expected termination of the dropped column. */
    dropPrevExempt?: ReadonlySet<number>;
  },
): ValidationMessage[] {
  const messages: ValidationMessage[] = [];
  const previousActive = new Set(previous.activeCols);
  const currentActive = new Set(current.activeCols);
  const deactivatedCols = previous.activeCols.filter(col => !currentActive.has(col));
  const activatedCols = current.activeCols.filter(col => !previousActive.has(col));
  const decreaseCells = current.deltaCells.filter(cell => cell.delta < 0);
  const increaseCols = new Set(current.deltaCells.filter(cell => cell.delta > 0).map(cell => cell.col));
  const shiftSourceExempt = exemptions?.shiftSourceExempt;
  const shiftDestExempt = exemptions?.shiftDestExempt;
  const dropPrevExempt = exemptions?.dropPrevExempt;

  // Balanced same-row inc + dec pairs (e.g. YO + k2tog). The decrease at col D
  // consumes a source-side column; that "freed" col is then re-filled by a
  // YO. Both cells stay active in `current`, so
  // the per-cell topology checks below would mis-flag a perfectly valid
  // balanced lace row. We greedily pair each dec with an adjacent inc and
  // exempt both from the dec-source / inc-already-active / inc-source
  // checks. The global stitchDelta check upstream still gates row width.
  const balancedDecCols = new Set<number>();
  const balancedIncCols = new Set<number>();
  for (const dec of decreaseCells) {
    const adjacentIncs = current.deltaCells
      .filter(c => c.delta > 0 && decreaseCanSourceFromOffset(dec, c.col - dec.col) && !balancedIncCols.has(c.col));
    if (adjacentIncs.length > 0) {
      balancedDecCols.add(dec.col);
      balancedIncCols.add(adjacentIncs[0]!.col);
    }
  }

  for (const col of deactivatedCols) {
    if (current.bindOffSpans.some(span => col >= span.start && col < span.end)) continue;
    // Phase 2: lateral-shift source columns are vacated by the shift, not a
    // decrease primitive — the rack+xfer moves their loops elsewhere.
    if (shiftSourceExempt?.has(col)) continue;
    // Phase 3: drop-st columns are TERMINATED by the previous row's drop —
    // the no-stitch in the current row is the expected continuation.
    if (dropPrevExempt?.has(col)) continue;
    const hasAdjacentDecrease = decreaseCells.some(cell =>
      decreaseCanConsumeDeactivatedCol(cell, col, previousActive, currentActive),
    );
    if (!hasAdjacentDecrease) {
      messages.push({
        severity: 'error',
        rule: 'chart-continuity-deactivated-without-decrease',
        message: `Row ${current.rowIndex + 1}, col ${col + 1} becomes no-stitch but has no adjacent result-row decrease primitive.`,
      });
    }
  }

  for (const col of activatedCols) {
    if (increaseCols.has(col)) continue;
    // Phase 2: lateral-shift destination columns are filled by the shift,
    // not an increase primitive — the rack+xfer brought source loops in.
    if (shiftDestExempt?.has(col)) continue;
    messages.push({
      severity: 'error',
      rule: 'chart-continuity-activated-without-increase',
      message: `Row ${current.rowIndex + 1}, col ${col + 1} becomes active but is not marked with an increase primitive.`,
    });
  }

  for (const cell of current.deltaCells) {
    if (cell.delta < 0) {
      if (balancedDecCols.has(cell.col)) continue;
      const needed = expectedDisappearingSourcesForDecrease(cell);
      const consumedCols = consumedDisappearingSourceCols(cell, previousActive, currentActive);
      if (consumedCols.length < needed) {
        const expected = expectedSourceColsForMessage(cell).map(col => col + 1).join(', ');
        messages.push({
          severity: 'error',
          rule: 'chart-continuity-decrease-without-source',
          message: `Row ${current.rowIndex + 1}, col ${cell.col + 1} is a result-row decrease (delta ${cell.delta}) but only found ${consumedCols.length} expected source stitch${consumedCols.length === 1 ? '' : 'es'} disappearing from the previous row (needs ${needed}; expected source col${expected.includes(',') ? 's' : ''} ${expected}).`,
        });
      }
    }
    if (cell.delta > 0 && previousActive.has(cell.col) && !balancedIncCols.has(cell.col)) {
      messages.push({
        severity: 'error',
        rule: 'chart-continuity-increase-cell-already-active',
        message: `Row ${current.rowIndex + 1}, col ${cell.col + 1} is an increase, but that column was already active on the previous row.`,
      });
    }
    if (cell.delta > 0 && !balancedIncCols.has(cell.col)) {
      const canIncreaseFromLeft = previousActive.has(cell.col - 1) && currentActive.has(cell.col - 1);
      const canIncreaseFromRight = previousActive.has(cell.col + 1) && currentActive.has(cell.col + 1);
      if (!canIncreaseFromLeft && !canIncreaseFromRight) {
        messages.push({
          severity: 'error',
          rule: 'chart-continuity-increase-without-source',
          message: `Row ${current.rowIndex + 1}, col ${cell.col + 1} is a result-row increase but has no adjacent source stitch persisting from the previous row.`,
        });
      }
    }
  }

  for (const span of current.bindOffSpans) {
    const sourceCols = range(span.start, span.end);
    const missingSource = sourceCols.filter(col => !previousActive.has(col));
    if (missingSource.length > 0) {
      messages.push({
        severity: 'error',
        rule: 'chart-continuity-bind-off-span-without-source',
        message: `Row ${current.rowIndex + 1} has a ${span.side}-edge bind-off span covering col ${span.start + 1}-${span.end}, but ${missingSource.length} source column${missingSource.length === 1 ? '' : 's'} were not active on the previous row.`,
      });
    }
  }

  return messages;
}

function decreaseCanSourceFromOffset(cell: { op: KnitOp; delta: number }, offset: number): boolean {
  if (offset === 0) return false;
  const span = primitiveForOp(cell.op).decreaseSpan;
  if (span) return span.sourceOffsets.includes(offset);
  return Math.abs(offset) <= Math.abs(cell.delta);
}

function decreaseCanConsumeDeactivatedCol(
  cell: { col: number; op: KnitOp; delta: number },
  col: number,
  previousActive: ReadonlySet<number>,
  currentActive: ReadonlySet<number>,
): boolean {
  if (!previousActive.has(col) || currentActive.has(col)) return false;
  const span = primitiveForOp(cell.op).decreaseSpan;
  if (!span) {
    const reach = Math.abs(cell.delta);
    return Math.abs(cell.col - col) >= 1 && Math.abs(cell.col - col) <= reach;
  }
  if (span.sourceOffsets.some(offset => offset !== 0 && cell.col + offset === col)) return true;
  return fashionedSourceColForDecrease(cell, previousActive, currentActive) === col;
}

function expectedDisappearingSourcesForDecrease(cell: { op: KnitOp; delta: number }): number {
  const span = primitiveForOp(cell.op).decreaseSpan;
  return span ? span.consumes - span.produces : Math.abs(cell.delta);
}

function consumedDisappearingSourceCols(
  cell: { col: number; op: KnitOp; delta: number },
  previousActive: ReadonlySet<number>,
  currentActive: ReadonlySet<number>,
): number[] {
  const span = primitiveForOp(cell.op).decreaseSpan;
  if (!span) {
    const found: number[] = [];
    const needed = Math.abs(cell.delta);
    for (let d = 1; d <= needed; d++) {
      for (const col of [cell.col - d, cell.col + d]) {
        if (previousActive.has(col) && !currentActive.has(col)) found.push(col);
      }
    }
    return found.slice(0, needed);
  }

  const found = span.sourceOffsets
    .filter(offset => offset !== 0)
    .map(offset => cell.col + offset)
    .filter(col => previousActive.has(col) && !currentActive.has(col));

  const fashionCol = fashionedSourceColForDecrease(cell, previousActive, currentActive);
  if (fashionCol != null && !found.includes(fashionCol)) found.push(fashionCol);
  return found;
}

function expectedSourceColsForMessage(cell: { col: number; op: KnitOp; delta: number }): number[] {
  const span = primitiveForOp(cell.op).decreaseSpan;
  if (!span) {
    const needed = Math.abs(cell.delta);
    const cols: number[] = [];
    for (let d = 1; d <= needed; d++) cols.push(cell.col - d, cell.col + d);
    return cols;
  }
  return span.sourceOffsets
    .filter(offset => offset !== 0)
    .map(offset => cell.col + offset);
}

function fashionedSourceColForDecrease(
  cell: { col: number; op: KnitOp },
  previousActive: ReadonlySet<number>,
  currentActive: ReadonlySet<number>,
): number | null {
  const span = primitiveForOp(cell.op).decreaseSpan;
  if (!span || span.consumes !== 2) return null;
  const sourceOffsets = span.sourceOffsets.filter(offset => offset !== 0);
  if (sourceOffsets.length !== 1) return null;
  const direction = Math.sign(sourceOffsets[0]!);
  if (direction === 0) return null;

  // Canonical 2-wide ssk/k2tog tiles structurally place the source slot
  // at offset ±1 (no-stitch by tile design, not a missing intermediate);
  // the canonical fashioning wedge sits at offset ±2 specifically. See
  // CANONICAL_FASHIONING_DISTANCE in chart-core/fashioning.ts.
  const wedgeCol = cell.col + direction * CANONICAL_FASHIONING_DISTANCE;
  if (previousActive.has(wedgeCol) && !currentActive.has(wedgeCol)) {
    return wedgeCol;
  }
  return null;
}

/**
 * Phase 1c follow-up (2026-05-24): count the per-row cells consumed by
 * canonical fashioning wedges. A canonical 2-wide k2tog/ssk tile already
 * contributes `stitchDelta = -1` (matching the tile source slot at offset
 * ±1, which is structurally no-stitch by tile design). An EXTRA wedge
 * cell beyond that — detected by `detectCanonicalFashioningWedge` — is a
 * lateral shift cell: the walker moves the stitch inward by one needle
 * rather than removing it. From the row-width validator's PoV those
 * cells look like deactivations without a matching decrease, so we need
 * to add them back the same way `shiftCountByRow` does for explicit
 * lateral-shift events.
 *
 * Returns the per-row count of wedge cells contributed by all canonical
 * fashioned decreases on the given row.
 */
function countFashioningShiftCells(
  current: RowContinuitySummary,
  projection: ResolvedChartProjection,
): number {
  let total = 0;
  for (const cell of current.deltaCells) {
    const span = primitiveForOp(cell.op).decreaseSpan;
    if (!span || span.consumes !== 2) continue;
    const sourceOffsets = span.sourceOffsets.filter(offset => offset !== 0);
    if (sourceOffsets.length !== 1) continue;
    const direction: 1 | -1 = sourceOffsets[0]! > 0 ? 1 : -1;
    const wedgeDistance = detectCanonicalFashioningWedge({
      projection,
      row: current.rowIndex,
      col: cell.col,
      direction,
    });
    if (wedgeDistance == null) continue;
    // Canonical fashioning is distance-2 only: the EXTRA wedge cell at
    // offset ±2 is one lateral-shift cell beyond what the decrease's
    // `stitchDelta` already accounts for (the tile source slot at ±1).
    // See CANONICAL_FASHIONING_DISTANCE in chart-core/fashioning.ts for
    // the rationale; deeper wedges are intentionally NOT supported and
    // fall through to the standard row-width-mismatch diagnostic.
    total += 1;
  }
  return total;
}

function bindOffSpansForRow(
  rowIndex: number,
  annotations: readonly KnitlabChartAnnotation[],
): Array<{ start: number; end: number; side: 'left' | 'right' | 'top' | 'bottom'; delta: number }> {
  const spans: Array<{ start: number; end: number; side: 'left' | 'right' | 'top' | 'bottom'; delta: number }> = [];
  for (const annotation of annotations) {
    if (annotation.kind !== 'bind-off-span') continue;
    if (annotation.anchor.scope !== 'edge' || annotation.anchor.row !== rowIndex) continue;
    if (
      annotation.anchor.side !== 'left' &&
      annotation.anchor.side !== 'right' &&
      annotation.anchor.side !== 'top' &&
      annotation.anchor.side !== 'bottom'
    ) continue;
    const start = Math.min(annotation.anchor.start, annotation.anchor.end);
    const end = Math.max(annotation.anchor.start, annotation.anchor.end);
    if (end <= start) continue;
    spans.push({
      start,
      end,
      side: annotation.anchor.side,
      delta: -(end - start),
    });
  }
  return spans;
}

function range(start: number, end: number): number[] {
  const out: number[] = [];
  for (let n = start; n < end; n++) out.push(n);
  return out;
}

function formatSigned(value: number): string {
  return value >= 0 ? `+${value}` : String(value);
}

function formatRows(rowIndices: readonly number[]): string {
  if (rowIndices.length === 0) return 'No rows';
  if (rowIndices.length === 1) return `Row ${rowIndices[0]! + 1}`;
  const sorted = [...rowIndices].sort((a, b) => a - b);
  const ranges: string[] = [];
  let start = sorted[0]!;
  let previous = sorted[0]!;
  for (let i = 1; i < sorted.length; i++) {
    const row = sorted[i]!;
    if (row !== previous + 1) {
      ranges.push(start === previous ? String(start + 1) : `${start + 1}-${previous + 1}`);
      start = row;
    }
    previous = row;
  }
  ranges.push(start === previous ? String(start + 1) : `${start + 1}-${previous + 1}`);
  return `Rows ${ranges.join(', ')}`;
}

function deltaCellSummary(row: RowContinuitySummary): string {
  if (row.deltaCells.length === 0 && row.bindOffSpans.length === 0) {
    return 'No shaping cells or bind-off annotations are present on the source row.';
  }
  const cells = row.deltaCells
    .map(cell => `col ${cell.col + 1} ${cell.op} (${formatSigned(cell.delta)})`)
    .join(', ');
  const spans = row.bindOffSpans
    .map(span => `${span.side} bind-off cols ${span.start + 1}-${span.end} (${formatSigned(span.delta)})`)
    .join(', ');
  return [
    cells ? `Shaping cells: ${cells}.` : '',
    spans ? `Bind-off annotations: ${spans}.` : '',
  ].filter(Boolean).join(' ');
}

function isContiguous(cols: readonly number[]): boolean {
  if (cols.length <= 1) return true;
  for (let i = 1; i < cols.length; i++) {
    if (cols[i] !== cols[i - 1]! + 1) return false;
  }
  return true;
}

function activeSegments(cols: readonly number[]): Array<{ start: number; end: number }> {
  const segments: Array<{ start: number; end: number }> = [];
  if (cols.length === 0) return segments;
  let start = cols[0]!;
  let previous = cols[0]!;
  for (let i = 1; i < cols.length; i++) {
    const col = cols[i]!;
    if (col !== previous + 1) {
      segments.push({ start, end: previous + 1 });
      start = col;
    }
    previous = col;
  }
  segments.push({ start, end: previous + 1 });
  return segments;
}
