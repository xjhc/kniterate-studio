/**
 * B2a (2026-05-20): chart-to-FabricIR cable-cross extraction.
 *
 * Scans a resolved chart for placements of keys marked as cables
 * (`KnitlabKeyDefinition.cableSpan`) and emits one `cable-cross` row
 * event per placement, keyed to the row inside the placement's
 * footprint where the cross actually happens (`cableSpan.crossRow`,
 * default 0).
 *
 * The chart layer is the only producer of cable events today —
 * cables don't come from the garment compiler. A future Phase B
 * iteration may surface cables in the compiler when the user picks
 * a cabled fixture; until then, every cable lives in a user-painted
 * chart key.
 *
 * Phase 0 §0.3 (Batch D, 2026-05-22): the analyzer routes through
 * `resolveChart` for bounds + last-paint-wins so out-of-bounds
 * placements drop silently (matching resolveChart's contract) and
 * cable cells overpainted by a later/smaller key do not emit phantom
 * cable events. The cell match is anchored to the actual cross row,
 * not the placement's first row, so a cable whose first row is
 * overpainted but whose cross row is intact still fires.
 *
 * Why not stuff this inside `resolveChart`? `resolveChart` produces
 * `cells: string[][]` (keyId-only per B0.2); cable events are
 * row-scoped, position-aware, and bypass the per-cell semantic op
 * pathway. Keeping the analyzer separate keeps `resolveChart`
 * footprint-bounded.
 */

import type { KnitlabChartState, KnitlabKeyDefinition } from './knitlab1-contract.js';
import { resolveChart } from '../knitout/passes/resolve-chart.js';

export interface ChartCableEvent {
  /** Chart row where the cable cross happens. */
  row: number;
  /** Chart column where the cable's leftmost stitch sits. */
  startCol: number;
  /** Total stitches crossed (matches `cableSpan.width`). */
  width: number;
  /**
   * Worked-side stitch count (Phase 0 §0.2). For legacy symmetric C2/4/6/8
   * cables, defaults to `floor(width / 2)`. Asymmetric cables-over-purl
   * (LPC/RPC) carry the authored split.
   */
  workedWidth: number;
  /**
   * Purl-side stitch count (Phase 0 §0.2). For legacy symmetric C2/4/6/8
   * cables, defaults to `floor(width / 2)`.
   */
  purlWidth: number;
  /** Which strand crosses on top. */
  direction: 'front' | 'back';
  /**
   * Batch D Phase 1 (2026-05-22): set when any cell in the cable's
   * footprint resolves to a purl op (per the tile's `cells[r][c].op`).
   * Drives walker dispatch — `false` cables go through `emitCableCross`
   * (all-front-bed knit-over-knit dance); `true` cables go through
   * `emitAsymmetricCableCross` (mixed-bed dance accounting for the
   * purl loops on the back bed).
   */
  hasPurlBackground: boolean;
  /** The key id that produced this event — useful for debug + render. */
  keyId: string;
}

export function cableEventsFromChart(
  chart: KnitlabChartState,
  keyPalette: readonly KnitlabKeyDefinition[],
): ChartCableEvent[] {
  const out: ChartCableEvent[] = [];
  const paletteById = new Map<string, KnitlabKeyDefinition>();
  for (const key of keyPalette) {
    if (key && typeof key.id === 'string') paletteById.set(key.id, key);
  }

  let resolved: ReturnType<typeof resolveChart>;
  try {
    resolved = resolveChart(chart, keyPalette as KnitlabKeyDefinition[]);
  } catch {
    return out;
  }
  const { rows, cols, cells } = resolved;

  const seen = new Set<string>();

  for (const layer of chart.layers ?? []) {
    if (!layer || layer.isVisible === false) continue;
    for (const placement of layer.keyPlacements ?? []) {
      const key = paletteById.get(placement.keyId);
      if (!key?.cableSpan) continue;
      const ax = Number(placement.anchor?.x);
      const ay = Number(placement.anchor?.y);
      if (!Number.isInteger(ax) || !Number.isInteger(ay)) continue;
      const width = Math.max(1, Math.floor(key.cableSpan.width));
      const defaultHalf = Math.floor(width / 2);
      const workedWidth = key.cableSpan.workedWidth != null
        ? Math.max(0, Math.floor(key.cableSpan.workedWidth))
        : defaultHalf;
      const purlWidth = key.cableSpan.purlWidth != null
        ? Math.max(0, Math.floor(key.cableSpan.purlWidth))
        : defaultHalf;
      const crossRow = Math.max(0, Math.floor(key.cableSpan.crossRow ?? 0));
      const row = ay + crossRow;
      if (row < 0 || row >= rows) continue;
      if (ax < 0 || ax + width > cols) continue;
      const rowCells = cells[row]!;
      let overpainted = false;
      for (let dx = 0; dx < width; dx++) {
        if (rowCells[ax + dx] !== placement.keyId) {
          overpainted = true;
          break;
        }
      }
      if (overpainted) continue;
      // Batch D Phase 1: detect purl background by inspecting the cable
      // tile's own `cells[r][c].op` overrides. We read from the key def
      // (not `resolved.cellOps`) so the dispatch reflects the cable
      // tile's authored layout regardless of overpainting outside the
      // cross row.
      let hasPurlBackground = false;
      const tileCells = key.cells;
      if (tileCells) {
        outer: for (let dy = 0; dy < tileCells.length; dy++) {
          const tileRow = tileCells[dy];
          if (!tileRow) continue;
          for (let dx = 0; dx < tileRow.length; dx++) {
            if (tileRow[dx]?.op === 'purl') {
              hasPurlBackground = true;
              break outer;
            }
          }
        }
      }
      const sig = `${row}:${ax}:${placement.keyId}`;
      if (seen.has(sig)) continue;
      seen.add(sig);
      out.push({
        row,
        startCol: ax,
        width,
        workedWidth,
        purlWidth,
        direction: key.cableSpan.direction,
        hasPurlBackground,
        keyId: key.id,
      });
    }
  }
  return out;
}
