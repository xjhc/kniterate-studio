/**
 * Composable chart-authoring primitives.
 *
 * One vocabulary for emitting a valid knitlab1 `ApplicationState` instead
 * of a bespoke generator script per shape. A tension swatch, an i-cord
 * path, and a shaped-tube outline are all the same builder with different
 * paint calls:
 *
 *   tension swatch:  new ChartBuilder({ width, rows })
 *                      .fill(KEY_ID_KNITERATE_KNIT)
 *                      .stitchBand(0, 6).stitchBand(80, 7).stitchBand(160, 8)
 *
 *   i-cord:          new ChartBuilder({ width, rows })
 *                      .paintPath(points, KEY_ID_ICORD)
 *
 *   shaped tube:     new ChartBuilder({ width, rows })
 *                      .outline(widthSchedule, KEY_ID_TUBE_KNIT)
 *
 * The emitted state is plain-JSON and legacy-shaped (a single layer with
 * no `kind`), so the host load path migrates it through
 * `migrateSheetToTwoChannels` exactly as a real imported `.knitlab` does.
 * v1 is single-structure-channel — colorwork two-channel charts are not a
 * goal here (paint those in the editor).
 */

import {
  DEFAULT_KEY_PALETTE,
  type KnitlabApplicationState,
  type KnitlabChartAnnotation,
  type KnitlabChartState,
  type KnitlabKeyDefinition,
  type KnitlabKeyInstance,
  type KnitlabOrientation,
  type KnitlabPaletteMode,
} from './knitlab1-contract.js';

export interface Point {
  x: number;
  y: number;
}

export interface ChartBuilderOptions {
  width: number;
  rows: number;
  id?: string;
  name?: string;
  orientation?: KnitlabOrientation;
  /** Defaults to `DEFAULT_KEY_PALETTE`. */
  keyPalette?: KnitlabKeyDefinition[];
  paletteMode?: KnitlabPaletteMode;
}

export interface OutlineOptions {
  /** Fixed rightmost (spine) column every row shares. Default `width - 1`. */
  spineCol?: number;
}

export interface StitchBandOptions {
  id?: string;
  label?: string;
}

export class ChartBuilder {
  private readonly width: number;
  private readonly rows: number;
  private readonly id: string;
  private readonly name: string;
  private readonly orientation: KnitlabOrientation;
  private readonly keyPalette: KnitlabKeyDefinition[];
  private readonly paletteMode: KnitlabPaletteMode | undefined;

  private readonly placements: KnitlabKeyInstance[] = [];
  private readonly annotations: KnitlabChartAnnotation[] = [];
  private bandCount = 0;

  constructor(opts: ChartBuilderOptions) {
    if (!Number.isInteger(opts.width) || opts.width <= 0) {
      throw new Error(`ChartBuilder: width must be a positive integer (got ${opts.width})`);
    }
    if (!Number.isInteger(opts.rows) || opts.rows <= 0) {
      throw new Error(`ChartBuilder: rows must be a positive integer (got ${opts.rows})`);
    }
    this.width = opts.width;
    this.rows = opts.rows;
    this.id = opts.id ?? 'chart';
    this.name = opts.name ?? 'Chart';
    this.orientation = opts.orientation ?? 'bottom-up';
    this.keyPalette = opts.keyPalette ?? DEFAULT_KEY_PALETTE;
    this.paletteMode = opts.paletteMode;
  }

  /** Paint a single cell. Out-of-bounds coordinates throw. */
  cell(x: number, y: number, keyId: string): this {
    this.requireInBounds(x, y);
    this.placements.push({ anchor: { x, y }, keyId });
    return this;
  }

  /** Fill the whole chart with one key (row-major: y outer, x inner). */
  fill(keyId: string): this {
    for (let y = 0; y < this.rows; y++) {
      for (let x = 0; x < this.width; x++) {
        this.placements.push({ anchor: { x, y }, keyId });
      }
    }
    return this;
  }

  /** Fill an axis-aligned rectangle (`w × h` from bottom-left `x,y`). */
  rect(x: number, y: number, w: number, h: number, keyId: string): this {
    for (let dy = 0; dy < h; dy++) {
      for (let dx = 0; dx < w; dx++) {
        this.cell(x + dx, y + dy, keyId);
      }
    }
    return this;
  }

  /**
   * Paint a key at each waypoint — the authoring form for an i-cord path
   * (the points should form a single 8-connected chain; `icordPathFromChart`
   * validates topology and traces from the lowest endpoint).
   */
  paintPath(points: readonly Point[], keyId: string): this {
    for (const p of points) this.cell(p.x, p.y, keyId);
    return this;
  }

  /**
   * Paint a shaped-tube outline from a per-round width schedule. Row `i`
   * (chart row `i`, which the tube tracer reads as round `i`, cast-on at
   * row 0) gets `schedule[i]` contiguous cells ending at the spine column.
   */
  outline(schedule: readonly number[], keyId: string, opts: OutlineOptions = {}): this {
    const spineCol = opts.spineCol ?? this.width - 1;
    schedule.forEach((w, row) => {
      if (!Number.isInteger(w) || w <= 0) {
        throw new Error(`ChartBuilder.outline: width at row ${row} must be a positive integer (got ${w})`);
      }
      for (let dx = 0; dx < w; dx++) {
        this.cell(spineCol - dx, row, keyId);
      }
    });
    return this;
  }

  /** Attach an arbitrary typed annotation. */
  annotate(annotation: KnitlabChartAnnotation): this {
    this.annotations.push(annotation);
    return this;
  }

  /**
   * A sticky `stitch-number` row annotation at `row` — the machine knits at
   * this tension until a later band changes it. The tension-swatch primitive.
   */
  stitchBand(row: number, stitchNumber: number, opts: StitchBandOptions = {}): this {
    if (!Number.isInteger(row) || row < 0 || row >= this.rows) {
      throw new Error(`ChartBuilder.stitchBand: row ${row} out of bounds for ${this.rows} row chart`);
    }
    if (!Number.isInteger(stitchNumber) || stitchNumber < 0 || stitchNumber > 35) {
      throw new Error(`ChartBuilder.stitchBand: stitchNumber must be an integer 0-35 (got ${stitchNumber})`);
    }
    const i = this.bandCount++;
    this.annotations.push({
      id: opts.id ?? `tension-band-${i}`,
      kind: 'stitch-number',
      anchor: { scope: 'row', row },
      stitchNumber,
      source: 'generated',
      label: opts.label ?? `tension ${stitchNumber}`,
    });
    return this;
  }

  /** The single `KnitlabChartState` sheet. */
  buildSheet(): KnitlabChartState {
    return {
      id: this.id,
      rows: this.rows,
      cols: this.width,
      orientation: this.orientation,
      name: this.name,
      displaySettings: { rowCountVisibility: 'right', colCountVisibility: 'bottom' },
      layers: [
        // Legacy-shaped (no `kind`) so the app load path migrates it to
        // structure + Natural-default color channels, matching a real imported file.
        { id: 'structure', name: 'Structure', isVisible: true, grid: {}, keyPlacements: this.placements },
      ],
      activeLayerId: 'structure',
      annotations: this.annotations,
    };
  }

  /** The full `ApplicationState` wrapping the single sheet. */
  build(): KnitlabApplicationState {
    const sheet = this.buildSheet();
    const state: KnitlabApplicationState = {
      sheets: [sheet],
      groups: [],
      activeSheetId: this.id,
      keyPalette: this.keyPalette,
    };
    if (this.paletteMode !== undefined) state.paletteMode = this.paletteMode;
    return state;
  }

  private requireInBounds(x: number, y: number): void {
    if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= this.width || y >= this.rows) {
      throw new Error(`ChartBuilder: cell (${x}, ${y}) out of bounds for ${this.width}×${this.rows} chart`);
    }
  }
}
