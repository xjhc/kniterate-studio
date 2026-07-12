/**
 * B1 (2026-05-20): tile-level stitch-conservation check.
 *
 * A multi-cell key (texture tile) with per-cell ops should normally
 * preserve stitch count across the tile — its total `stitchDelta`
 * (sum across all cells) should be 0. A tile that adds or removes
 * stitches will subtly resize the panel everywhere it's painted, which
 * is almost always a mistake (cables, brioche, tuck-rib, waffle, lace
 * motifs are all conservative).
 *
 * The validator reports per-key warnings (not errors): a user who
 * really wants a non-conservative tile (e.g. a custom shaping motif)
 * can ignore the warning. Used by chart-level validation before
 * compilation; we deliberately do not block compile because the
 * tile's stitch-delta might be intentional. A future variant could
 * gate exporting if it becomes a problem in practice.
 *
 * Per-cell ops were added to `KnitlabKeyCellContent.op` in B1; the
 * footprint-level `KnitlabKeyDefinition.op` is the fallback for cells
 * without their own `op`. A tile without any per-cell ops trivially
 * preserves count (it's uniform footprint op).
 */

import {
  KNIT_PRIMITIVES,
  type KnitlabKeyDefinition,
  type KnitlabKnitOp,
} from '../colorwork/knitlab1-contract.js';
import type { ValidationMessage } from './knitout-program.js';

const STITCH_DELTA_BY_OP = new Map<KnitlabKnitOp, number | null>(
  KNIT_PRIMITIVES.map((p) => [p.op as KnitlabKnitOp, p.stitchDelta]),
);

export interface TileConservationOptions {
  /** Only check tiles where at least one per-cell op is set. Avoids
   *  spamming warnings for uniform multi-cell keys whose footprint op
   *  is e.g. 'knit' (k2tog would already be a 1x1 key). */
  onlyChecksPerCellTiles?: boolean;
}

export function validateTileConservation(
  keyPalette: readonly KnitlabKeyDefinition[],
  opts: TileConservationOptions = {},
): ValidationMessage[] {
  const messages: ValidationMessage[] = [];
  for (const key of keyPalette) {
    const width = Math.max(1, Math.floor(Number(key.width) || 1));
    const height = Math.max(1, Math.floor(Number(key.height) || 1));
    if (width === 1 && height === 1) continue; // 1x1 keys can't be a "tile"
    const cells = key.cells;
    if (!cells) continue;

    const fallbackOp = key.op ?? 'knit';

    // Intentional shaping tiles — the canonical multi-cell decreases /
    // increases (k2tog, ssk, sk2p, k3tog, sssk, kfb; added 2026-05-23) — carry
    // a non-conservative footprint op and own their source no-stitch cells by
    // design (e.g. K2tog is `[k2tog, no-stitch]`). They are not texture tiles,
    // so the conservation / no-stitch checks (meant for cables / brioche /
    // waffle) don't apply — without this they false-positive on every paired
    // edge decrease a shaped panel emits. A texture tile that *accidentally*
    // shrinks still has a conservative footprint op (e.g. 'knit') and is
    // caught below.
    const footprintDelta = STITCH_DELTA_BY_OP.get(fallbackOp);
    if (footprintDelta != null && footprintDelta !== 0) continue;

    let hasPerCellOverride = false;
    let totalDelta = 0;
    let unresolvedCells = 0;
    for (let r = 0; r < height; r++) {
      for (let c = 0; c < width; c++) {
        const content = cells[r]?.[c];
        const op = content?.op ?? fallbackOp;
        if (content?.op != null) hasPerCellOverride = true;
        const delta = STITCH_DELTA_BY_OP.get(op);
        if (delta == null) {
          // null stitchDelta = 'no-stitch' — counts as removing one
          // active stitch from the tile's footprint. Conservation
          // expects no-stitch cells to be balanced by an equivalent
          // m1 or none at all (i.e. the tile width really is fewer
          // active stitches across that row, which is what a shaped
          // tile would do — flag as unresolved instead of inferring).
          unresolvedCells += 1;
          continue;
        }
        totalDelta += delta;
      }
    }

    if (opts.onlyChecksPerCellTiles && !hasPerCellOverride) continue;

    if (unresolvedCells > 0) {
      messages.push({
        severity: 'warning',
        rule: 'tile-no-stitch-cell',
        message: `Key \`${key.id}\` (${width}×${height} tile) contains ${unresolvedCells} no-stitch cell${unresolvedCells === 1 ? '' : 's'}. Tiles with no-stitch cells change the panel width; intentional shaping tiles should be authored as separate placements, not a single multi-cell tile.`,
      });
    }

    if (totalDelta !== 0) {
      messages.push({
        severity: 'warning',
        rule: 'tile-stitch-not-conserved',
        message: `Key \`${key.id}\` (${width}×${height} tile) has total stitch delta ${totalDelta > 0 ? '+' : ''}${totalDelta} across its per-cell ops. Tiles normally preserve stitch count (e.g. brioche, waffle, cable); a non-zero delta means the panel will grow or shrink everywhere this tile is painted.`,
      });
    }
  }
  return messages;
}
