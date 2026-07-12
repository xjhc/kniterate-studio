/**
 * Punchcard chart builder — generates a 2-color (or N-color) fairisle
 * chart from a small repeating pattern tile ("punchcard"), tiled across
 * a target width and height.
 *
 * Punchcards were the original mechanical input for domestic knitting
 * machines (Brother / Silver Reed used 24-stitch repeats). We model them
 * as a 2D grid of colors that repeat horizontally and vertically across
 * the final chart.
 *
 * Used by:
 *  - the Kniterate fairisle wizard preset to materialize a chart from
 *    user-supplied punchcard dimensions + a fill pattern
 *  - test fixtures that need a fairisle chart but don't care about exact
 *    cell layout — just "2-color, this size, this repeat"
 *
 * Not a runtime authoring tool — knitlab1's chart editor is for that.
 * This is for programmatic chart construction.
 */

import {
  KEY_ID_EMPTY,
  type KnitlabChartState,
  type KnitlabKeyInstance,
  type KnitlabLayer,
} from './knitlab1-contract.js';

export interface PunchcardTile {
  /** Width of the repeating tile in stitches. */
  cols: number;
  /** Height of the repeating tile in rows. */
  rows: number;
  /** Color keyId for each cell. `cells[row][col]`. Use the chart's
   *  palette key ids — typically the binding `keyId`s. */
  cells: string[][];
}

export interface BuildPunchcardChartInput {
  id?: string;
  name?: string;
  /** Final chart width in stitches. The tile repeats horizontally; if
   *  `cols` isn't a multiple of `tile.cols`, the last partial repeat is
   *  truncated. */
  cols: number;
  /** Final chart height in rows. Same wrap rule as `cols`. */
  rows: number;
  /** Bottom-up (default — knit from cast-on row up) or top-down (knit
   *  from neck/top down). For pure colorwork swatches `bottom-up` is the
   *  natural choice. */
  orientation?: 'bottom-up' | 'top-down';
  tile: PunchcardTile;
}

/** Build a `KnitlabChartState` whose every cell is filled by tiling
 *  `tile` across `cols × rows`. The chart has one visible layer holding
 *  every keyPlacement.
 *
 *  Layout: tile[0][0] lands at chart cell (row 0, col 0). Subsequent
 *  repeats tile up (tile[1][0] at row 1 of the tile sits at chart
 *  row 1, etc.) until the chart is filled. */
export function buildPunchcardChart(input: BuildPunchcardChartInput): KnitlabChartState {
  validateTile(input.tile);
  const { cols, rows, tile } = input;
  const orientation = input.orientation ?? 'bottom-up';
  const id = input.id ?? `punchcard-${tile.cols}x${tile.rows}-${cols}x${rows}`;
  const name = input.name ?? `Punchcard ${tile.cols}×${tile.rows} (${cols}×${rows})`;

  const keyPlacements: KnitlabKeyInstance[] = [];
  for (let r = 0; r < rows; r++) {
    const tileRow = tile.cells[r % tile.rows]!;
    for (let c = 0; c < cols; c++) {
      const keyId = tileRow[c % tile.cols] ?? KEY_ID_EMPTY;
      if (keyId === KEY_ID_EMPTY) continue;
      keyPlacements.push({ keyId, anchor: { x: c, y: r } });
    }
  }

  const layer: KnitlabLayer = {
    id: 'punchcard-layer',
    name: 'Punchcard',
    isVisible: true,
    grid: {},
    keyPlacements,
  };

  return {
    id,
    name,
    rows,
    cols,
    orientation,
    displaySettings: { rowCountVisibility: 'none', colCountVisibility: 'none' },
    layers: [layer],
    activeLayerId: layer.id,
  };
}

/** Convenience: build a 2-color "dot" punchcard tile — color A
 *  background with single-cell dots of color B at regular intervals.
 *  Useful for quick fairisle test fixtures. */
export function dotPunchcardTile(
  tileCols: number,
  tileRows: number,
  backgroundKeyId: string,
  dotKeyId: string,
): PunchcardTile {
  const cells: string[][] = [];
  for (let r = 0; r < tileRows; r++) {
    const row: string[] = [];
    for (let c = 0; c < tileCols; c++) {
      // Dot at the center of the tile.
      const isDot = c === Math.floor(tileCols / 2) && r === Math.floor(tileRows / 2);
      row.push(isDot ? dotKeyId : backgroundKeyId);
    }
    cells.push(row);
  }
  return { cols: tileCols, rows: tileRows, cells };
}

/** Convenience: 2-color "checker" punchcard tile. */
export function checkerPunchcardTile(
  tileCols: number,
  tileRows: number,
  keyA: string,
  keyB: string,
): PunchcardTile {
  const cells: string[][] = [];
  for (let r = 0; r < tileRows; r++) {
    const row: string[] = [];
    for (let c = 0; c < tileCols; c++) {
      row.push(((r + c) % 2 === 0) ? keyA : keyB);
    }
    cells.push(row);
  }
  return { cols: tileCols, rows: tileRows, cells };
}

/** Convenience: 2-color "stripe" punchcard tile — `aRun` cells of color
 *  A, then `bRun` cells of color B, repeating horizontally. Vertically
 *  the rows alternate which color leads, producing a staggered fairisle
 *  pattern reminiscent of `reference/fairisle.kc`'s body. */
export function stripePunchcardTile(
  aRun: number,
  bRun: number,
  keyA: string,
  keyB: string,
): PunchcardTile {
  const tileCols = aRun + bRun;
  // 2 rows: row 0 leads with A, row 1 offset by aRun so the stripes interleave.
  const cells: string[][] = [];
  for (let r = 0; r < 2; r++) {
    const row: string[] = [];
    for (let c = 0; c < tileCols; c++) {
      const offset = (r % 2 === 0) ? 0 : aRun;
      const phase = (c + offset) % tileCols;
      row.push(phase < aRun ? keyA : keyB);
    }
    cells.push(row);
  }
  return { cols: tileCols, rows: 2, cells };
}

function validateTile(tile: PunchcardTile): void {
  if (tile.cols < 1 || tile.rows < 1) {
    throw new Error(`punchcard tile must be at least 1×1; got ${tile.cols}×${tile.rows}`);
  }
  if (tile.cells.length !== tile.rows) {
    throw new Error(`punchcard tile has rows=${tile.rows} but cells has ${tile.cells.length} rows`);
  }
  for (let r = 0; r < tile.rows; r++) {
    const row = tile.cells[r]!;
    if (row.length !== tile.cols) {
      throw new Error(`punchcard tile row ${r} has length ${row.length}, expected ${tile.cols}`);
    }
  }
}
