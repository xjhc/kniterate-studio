/**
 * B5 (2026-05-20): classify a resolved chart by its shape + color combo.
 *
 * The shaped Track A walker historically rejected ANY multi-color chart
 * because the walker is single-carrier. This classifier lets the
 * validator distinguish:
 *
 * - `single-color` — only one pattern color appears. Standard shaped
 *   stockinette path.
 * - `horizontal-stripes` — multi-color but every row uses ≤ 1 pattern
 *   color (colors only vary across rows). Lowerable on a single bed by
 *   switching carriers between rows — no jacquard back-bed needed,
 *   no float planning.
 * - `within-row-multicolor` — at least one row mixes two or more pattern
 *   colors. Needs the jacquard walker's back-bed handling AND the
 *   shaped walker's no-stitch wedge handling — the full B5 unification.
 *   Still blocked.
 *
 * Pattern colors are determined by the caller; no-stitch / shape / stitch
 * override cells are ignored when computing per-row color.
 */

import type { ResolvedChart } from '../knitout/passes/resolve-chart.js';

export type ShapedColorMode =
  | 'single-color'
  | 'horizontal-stripes'
  | 'within-row-multicolor';

export interface DetectShapedColorModeInput {
  resolved: ResolvedChart;
  /** Set of keyIds that count as pattern colors (have a yarn binding). */
  patternColorKeyIds: ReadonlySet<string>;
}

export interface ShapedColorModeResult {
  mode: ShapedColorMode;
  /** Per-row dominant color, indexed [r] → keyId or null when the row has
   *  no pattern color cells (e.g. all no-stitch or empty). Useful for
   *  picking which carrier to use on that row. */
  rowColors: Array<string | null>;
  /** Convenience: when `mode === 'horizontal-stripes'`, this is the
   *  ordered list of distinct row colors in first-appearance order. */
  distinctColors: string[];
}

export function detectShapedColorMode(input: DetectShapedColorModeInput): ShapedColorModeResult {
  const { resolved, patternColorKeyIds } = input;
  const rowColors: Array<string | null> = [];
  const distinct: string[] = [];
  const seen = new Set<string>();
  let withinRowMulticolor = false;

  for (let r = 0; r < resolved.rows; r++) {
    // chart-core/color-binding-read-ok: classify the row's color set by
    // membership in `patternColorKeyIds` (identity). No per-cell
    // semantic op interpretation.
    const row = resolved.cells[r] ?? [];
    const colorsInRow = new Set<string>();
    for (const cell of row) {
      if (patternColorKeyIds.has(cell)) colorsInRow.add(cell);
    }
    if (colorsInRow.size === 0) {
      rowColors.push(null);
    } else if (colorsInRow.size === 1) {
      const only = [...colorsInRow][0]!;
      rowColors.push(only);
      if (!seen.has(only)) {
        seen.add(only);
        distinct.push(only);
      }
    } else {
      // Within-row multicolor — store first for diagnostic display but
      // mark the mode so callers know float planning is needed.
      rowColors.push([...colorsInRow][0]!);
      withinRowMulticolor = true;
      for (const c of colorsInRow) {
        if (!seen.has(c)) {
          seen.add(c);
          distinct.push(c);
        }
      }
    }
  }

  if (withinRowMulticolor) return { mode: 'within-row-multicolor', rowColors, distinctColors: distinct };
  if (distinct.length <= 1) return { mode: 'single-color', rowColors, distinctColors: distinct };
  return { mode: 'horizontal-stripes', rowColors, distinctColors: distinct };
}
