/**
 * Source-cell mask for an atomic decrease tile. Owned here so the
 * projection + resolver share one implementation instead of two
 * byte-identical copies (Phase 1A Task #37, 2026-05-23).
 *
 * Convention: with anchor = LEFTMOST tile cell, the symbol-within-tile
 * position is `max(0, -min(sourceOffsets))`. Every other cell in the
 * tile is a no-stitch source.
 *
 * Returns `null` when:
 *  - width <= 1 (a 1x1 key has no source mask)
 *  - the op has no decrease span (uniform tile or non-decrease op)
 *  - the span's sourceOffsets length does not match `width` (malformed
 *    palette entry — caller should fall back to per-cell `cells[r][c].op`)
 *  - the derived symbol position falls outside the tile (defensive)
 */

import {
  decreaseSpanForOp,
  type KnitlabKnitOp,
} from '../colorwork/knitlab1-contract.js';

export function deriveStructuralSourceMask(
  op: KnitlabKnitOp,
  width: number,
): boolean[][] | null {
  if (width <= 1) return null;
  const span = decreaseSpanForOp(op);
  if (!span) return null;
  const offsets = span.sourceOffsets;
  if (offsets.length !== width) return null;
  const symbolPos = -Math.min(...offsets);
  if (symbolPos < 0 || symbolPos >= width) return null;
  const row: boolean[] = [];
  for (let dx = 0; dx < width; dx++) row.push(dx !== symbolPos);
  return [row];
}
