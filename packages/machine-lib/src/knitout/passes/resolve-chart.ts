/**
 * Resolve a knitlab1 ChartState into a deterministic per-cell grid for
 * the Kniterate compiler.
 *
 * The visual import path (`src/colorwork/knitlab1-import.ts`) iterates
 * all layers and placements in array order with last-write-wins and no
 * hidden-layer skip — fine for a color overlay, brittle for machine
 * export. The compiler needs explicit rules so two charts that look
 * identical compile to identical knitout regardless of layer plumbing.
 *
 * Composition rules (Phase 0b of the Kniterate plan):
 *
 *  1. **Hidden layers are skipped.** `layer.isVisible === false` excludes
 *     the layer entirely. The user explicitly hid it; treat as "not
 *     intended for export."
 *
 *  2. **Layer stacking is bottom-to-top.** `chart.layers[0]` paints first;
 *     subsequent layers paint over. The top-most visible cell wins per
 *     `(row, col)`. This matches how the knitlab1 canvas renders.
 *
 *  3. **Within a layer, large/contentful placements paint first.**
 *     `KeyDefinition` can be M×N (cables, motifs). Painting larger
 *     placements first lets a 1×1 detail override the corner of an MxN
 *     background — same rule as knitlab1's `buildGridFromKeyPlacements`
 *     in reference/knitlab/constants.ts. Within equal-size, anchor row
 *     then col, top-to-bottom and left-to-right.
 *
 *  4. **Out-of-bounds placements are dropped.** An anchor + footprint
 *     extending past `rows × cols` is silently truncated to the chart
 *     bounds.
 *
 *  5. **Unknown keyIds are dropped.** A placement referencing a keyId
 *     not in `keyPalette` is silently ignored. The validator surfaces
 *     this as a warning.
 *
 * The result is a `ResolvedChart` with a single `keyId | null` per cell.
 * Cells with `null` get the chart's default fill (KEY_ID_KNIT_DEFAULT)
 * — matching knitlab1's import behavior where an unplaced cell is knit.
 */

import {
  KEY_ID_KNIT_DEFAULT,
  type KnitlabChartState,
  type KnitlabKeyDefinition,
} from '../../colorwork/knitlab1-contract.js';
import { sortPlacementsForPaint } from '../../chart-core/paint-order.js';

export interface ResolvedChart {
  rows: number;
  cols: number;
  /** Per-cell resolved keyId. `cells[r][c]` is the keyId that paints
   *  that cell. Defaults to `KEY_ID_KNIT_DEFAULT` for unpainted cells. */
  cells: string[][];
  /** Placements that were dropped, for warning surfacing. */
  warnings: Array<{ reason: string; placementCount: number }>;
}

export function resolveChart(
  chart: KnitlabChartState,
  keyPalette: KnitlabKeyDefinition[],
): ResolvedChart {
  const { rows, cols } = chart;
  if (!Number.isInteger(rows) || rows <= 0) {
    throw new Error(`resolveChart: invalid rows=${rows}; must be a positive integer`);
  }
  if (!Number.isInteger(cols) || cols <= 0) {
    throw new Error(`resolveChart: invalid cols=${cols}; must be a positive integer`);
  }

  const paletteById = new Map<string, KnitlabKeyDefinition>();
  for (const key of keyPalette) {
    if (key && typeof key.id === 'string') paletteById.set(key.id, key);
  }

  const cells: string[][] = Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => KEY_ID_KNIT_DEFAULT),
  );
  let outOfBoundsDropped = 0;
  let unknownKeyDropped = 0;
  let hiddenLayersSkipped = 0;

  for (const layer of chart.layers ?? []) {
    if (!layer || layer.isVisible === false) {
      if (layer) hiddenLayersSkipped += 1;
      continue;
    }
    const sortedPlacements = sortPlacementsForPaint(layer, paletteById);
    for (const placement of sortedPlacements) {
      const keyDef = paletteById.get(placement.keyId);
      if (!keyDef) {
        unknownKeyDropped += 1;
        continue;
      }
      const width = Math.max(1, Math.floor(Number(keyDef.width) || 1));
      const height = Math.max(1, Math.floor(Number(keyDef.height) || 1));
      const ax = Number(placement.anchor?.x);
      const ay = Number(placement.anchor?.y);
      if (!Number.isInteger(ax) || !Number.isInteger(ay)) continue;
      let droppedFootprint = false;
      for (let dy = 0; dy < height; dy++) {
        for (let dx = 0; dx < width; dx++) {
          const r = ay + dy;
          const c = ax + dx;
          if (r < 0 || r >= rows || c < 0 || c >= cols) {
            droppedFootprint = true;
            continue;
          }
          cells[r]![c] = placement.keyId;
        }
      }
      if (droppedFootprint) outOfBoundsDropped += 1;
    }
  }

  const warnings: ResolvedChart['warnings'] = [];
  if (hiddenLayersSkipped > 0) {
    warnings.push({
      reason: 'Skipped hidden layers (isVisible === false). Set visibility to include in export.',
      placementCount: hiddenLayersSkipped,
    });
  }
  if (outOfBoundsDropped > 0) {
    warnings.push({
      reason: 'Placement footprint extends past chart bounds; truncated.',
      placementCount: outOfBoundsDropped,
    });
  }
  if (unknownKeyDropped > 0) {
    warnings.push({
      reason: 'Placement references a keyId not in keyPalette.',
      placementCount: unknownKeyDropped,
    });
  }

  return { rows, cols, cells, warnings };
}
