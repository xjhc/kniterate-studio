/**
 * Logo intake: beanie-motif chart (`{ W, colors, chart }`) → `KnitlabApplicationState`.
 *
 * The beanie generator + `pnpm beanie:chart logo.png` author a logo as a compact
 * `{ W, colors, chart }` blob (a `0|1` grid, `chart[0]` = cast-on/bottom row). That
 * is NOT the `KnitlabApplicationState` the chart editor saves and the surface
 * workspace ("Open saved chart") loads — so a real logo could not enter the Object
 * Export flow without a hand-written bridge (found in the 2026-06-21 Arc dogfood).
 * This converts it, so `pnpm beanie:chart logo.png -o logo.json` → Object Export.
 *
 * Browser-safe: imports only the knitlab1 contract constants + the (also browser-
 * safe) beanie-chart adapter — NO Node-only machine lowering — so the UI can run it
 * client-side at file-open time, keeping the `/api/surface/*` request contract
 * (`chart: KnitlabApplicationState`) unchanged.
 */

import {
  DEFAULT_KEY_PALETTE,
  type KnitlabApplicationState,
  type KnitlabChartState,
  type KnitlabKeyInstance,
} from './knitlab1-contract.js';
import {
  beanieMotifChartToColorGrid,
  parseBeanieMotifChart,
  type BeanieChartToGridOptions,
} from './beanie-chart-adapter.js';

export interface BeanieMotifImportOptions extends BeanieChartToGridOptions {
  /** Sheet id / name (default `sheet_logo` / `Logo`). */
  id?: string;
  name?: string;
}

/**
 * Duck-type a parsed JSON value as a beanie-motif chart (`{ W, colors, chart }`)
 * rather than a `KnitlabApplicationState` (`sheets`) / `KnitlabChartState`
 * (`layers`). Used by the loader to pick the conversion path.
 */
export function isBeanieMotifChart(value: unknown): boolean {
  if (typeof value !== 'object' || value === null) return false;
  const obj = value as Record<string, unknown>;
  if ('sheets' in obj || 'layers' in obj) return false;
  return typeof obj['W'] === 'number' && Array.isArray(obj['chart']);
}

/**
 * Convert a beanie-motif chart to a `KnitlabApplicationState` with one bottom-up
 * sheet: a structure layer + a colour layer carrying a key placement for EVERY
 * cell (ground for `0`, motif for `1`), so it resolves as a genuine 2-colour
 * surface. Orientation is preserved (`chart[0]` stays the cast-on row), matching
 * `beanieMotifChartToColorGrid`. Colours come from the palette (default ground
 * Graphite / motif Silver) so the Object Export legend + proof read with real
 * names, and `keyPalette` is the full `DEFAULT_KEY_PALETTE`.
 */
export function beanieMotifChartToApplicationState(
  raw: unknown,
  opts: BeanieMotifImportOptions = {},
): KnitlabApplicationState {
  const motif = parseBeanieMotifChart(raw);
  const grid = beanieMotifChartToColorGrid(motif, opts); // string[][] keyId, bottom-up
  const rows = grid.length;
  const cols = motif.W;

  const placements: KnitlabKeyInstance[] = [];
  for (let y = 0; y < rows; y++) {
    const row = grid[y]!;
    for (let x = 0; x < cols; x++) {
      placements.push({ anchor: { x, y }, keyId: row[x]! });
    }
  }

  const id = opts.id ?? 'sheet_logo';
  const sheet: KnitlabChartState = {
    id,
    rows,
    cols,
    orientation: 'bottom-up',
    name: opts.name ?? 'Logo',
    displaySettings: { rowCountVisibility: 'left', colCountVisibility: 'bottom' },
    layers: [
      { id: 'structure', name: 'Knitting', isVisible: true, kind: 'structure', grid: {}, keyPlacements: [] },
      { id: 'color', name: 'Colorwork', isVisible: true, kind: 'color', grid: {}, keyPlacements: placements },
    ],
    activeLayerId: 'color',
  };
  return { sheets: [sheet], groups: [], activeSheetId: id, keyPalette: DEFAULT_KEY_PALETTE };
}
