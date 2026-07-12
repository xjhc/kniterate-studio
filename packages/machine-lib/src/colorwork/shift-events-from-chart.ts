/**
 * Structural-soundness goal (2026-05-23): chart-to-walker lateral-shift
 * extraction for the per-stitch shift-1 primitive.
 *
 * Scans the chart row by row. Each contiguous run of cells whose
 * semantic op is `shift-1-l` (or `shift-1-r`) collapses to a single
 * `ChartShiftEvent` — the walker fires one rack-and-xfer dance for the
 * whole run rather than N independent ones. Composition rule: painting
 * three adjacent shift-1-L cells composes into one count=3 left shift.
 *
 * Adjacent shift-1 markers compose into a fully-fashioned shift of the
 * whole run: a run of length N slides an N-stitch block by ONE column
 * (the source-side edge stitch becomes a k2tog with the rest of the
 * block riding along on the rack-and-xfer dance). Exactly one column is
 * vacated regardless of run length. The single source column for
 * shift-1-L sits immediately to the right of the destination run; for
 * shift-1-R, immediately to the left.
 *
 * Phase 2 Step 2 (2026-05-23): migrated from `semanticOpForCell` to
 * the chart-core `projectChart` projection. The walker still uses op
 * equality for run coalescing (shift-1 is 1×1 so each cell is its own
 * placement); ownerId-based coalescing isn't needed here.
 */

import {
  type KnitlabChartState,
  type KnitlabKeyDefinition,
} from './knitlab1-contract.js';
import { projectChart } from '../chart-core/projection.js';

export interface ChartShiftEvent {
  /** Chart row where the shift fires. */
  row: number;
  /** Chart column where the destination block starts (leftmost shift-1 cell). */
  destStartCol: number;
  /** Number of shift-1 cells in the run (== number of stitches that ride
   *  on the rack-and-xfer dance). The block slides by ONE column total,
   *  not `count` columns; the source-side edge stitch becomes a k2tog. */
  count: number;
  /** 'left' = worked moves LEFT (shift-1-L run); 'right' = worked moves RIGHT. */
  direction: 'left' | 'right';
  /** The single vacated source column — one col past the run on the source side. */
  sourceStartCol: number;
  /** The shift-1 keyId for this run (for debug + render). */
  keyId: string;
}

export function shiftEventsFromChart(
  chart: KnitlabChartState,
  keyPalette: readonly KnitlabKeyDefinition[],
): ChartShiftEvent[] {
  const out: ChartShiftEvent[] = [];

  let projection: ReturnType<typeof projectChart>;
  try {
    projection = projectChart(chart, keyPalette);
  } catch {
    return out;
  }
  const { rows, cols } = projection;

  for (let r = 0; r < rows; r++) {
    let c = 0;
    while (c < cols) {
      const op = projection.cellAt(r, c).semanticOp;
      if (op !== 'shift-1-l' && op !== 'shift-1-r') {
        c++;
        continue;
      }
      const direction: 'left' | 'right' = op === 'shift-1-l' ? 'left' : 'right';
      // Greedy run: walk forward while the op stays the same shift-1 variant.
      let runEnd = c;
      while (runEnd + 1 < cols && projection.cellAt(r, runEnd + 1).semanticOp === op) {
        runEnd++;
      }
      const count = runEnd - c + 1;
      const keyId = projection.cellAt(r, c).keyId;
      // Fully-fashioned shift composition: N adjacent shift-1 cells slide
      // an N-stitch block by ONE column toward the destination side. The
      // single vacated column sits immediately past the run on the
      // source side.
      const sourceStartCol = direction === 'left' ? runEnd + 1 : c - 1;
      out.push({
        row: r,
        destStartCol: c,
        count,
        direction,
        sourceStartCol,
        keyId,
      });
      c = runEnd + 1;
    }
  }

  return out;
}
