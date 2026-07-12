/**
 * Adapter: beanie motif chart → flat colour-key grid.
 *
 * The beanie generator authors a logo as a compact `{ W, colors, chart }`
 * blob (see `scripts/image-to-beanie-chart.ts`): `chart` is a rectangular
 * `0|1` grid where `0` is the background and `1` is the motif, and `chart[0]`
 * is the bottom (cast-on) row in knit order.
 *
 * The flat chart compiler (`compileChartToKnitout` via
 * `buildColorworkChartInput`) instead wants a full grid of colour key ids,
 * also bottom-up (`grid[0]` = cast-on row). This module bridges the two so the
 * same Arc-style logo can be knit as a flat double-bed jacquard panel rather
 * than a tubular fair-isle beanie. Orientation is preserved: no row reversal.
 */

import {
  KEY_ID_COLOR_GOLD,
  KEY_ID_COLOR_GRAPHITE,
  KEY_ID_COLOR_MOSS,
  KEY_ID_COLOR_NAVY,
  KEY_ID_COLOR_RED,
  KEY_ID_COLOR_SILVER,
  KEY_ID_COLOR_TEAL,
} from './knitlab1-contract.js';

/**
 * Default colour-key ramp for a multi-colour beanie motif, indexed by the chart's
 * colour index. **Index 0 is the GROUND** (a real colour, never a silent
 * knit-default) — so `colors[0]` becomes a bound, named ground yarn. The Object
 * Export ground-truth rule depends on this: an imported beanie motif must carry
 * its own ground, not have one invented downstream.
 */
export const BEANIE_MOTIF_COLOR_KEYS: readonly string[] = [
  KEY_ID_COLOR_GRAPHITE, // 0 = ground
  KEY_ID_COLOR_SILVER,
  KEY_ID_COLOR_NAVY,
  KEY_ID_COLOR_RED,
  KEY_ID_COLOR_GOLD,
  KEY_ID_COLOR_TEAL,
  KEY_ID_COLOR_MOSS,
];

/** Compact beanie motif chart: `chart[row][col]` is a colour INDEX
 *  (`0` = ground, `1..N` = pattern colours); `chart[0]` is the bottom/cast-on row. */
export interface BeanieMotifChart {
  /** Stitch width — every row must have exactly this many cells. */
  W: number;
  /** Carrier labels the beanie generator assigned (index → carrier; advisory). */
  colors: string[];
  /** Rectangular colour-index grid (`0` ground, `1..N` pattern), bottom-up. */
  chart: number[][];
}

export interface BeanieChartToGridOptions {
  /** Colour key id for `0` (ground) cells. Default Graphite. */
  backgroundKey?: string;
  /** Colour key id for `1` cells. Default Silver. */
  motifKey?: string;
  /** Colour-key ramp for indices `0..N` (default `BEANIE_MOTIF_COLOR_KEYS`).
   *  `backgroundKey` / `motifKey` still override indices 0 / 1. */
  colorKeys?: readonly string[];
}

/** Parse + hard-validate an unknown JSON value as a `BeanieMotifChart`.
 *  Throws loudly on anything ragged, empty, or non-binary so a malformed
 *  source never compiles to a silently-wrong panel. */
export function parseBeanieMotifChart(raw: unknown): BeanieMotifChart {
  if (typeof raw !== 'object' || raw === null) {
    throw new Error('beanie chart: expected a JSON object.');
  }
  const obj = raw as Record<string, unknown>;
  const W = obj.W;
  if (typeof W !== 'number' || !Number.isInteger(W) || W <= 0) {
    throw new Error(`beanie chart: "W" must be a positive integer (got ${JSON.stringify(W)}).`);
  }
  const chart = obj.chart;
  if (!Array.isArray(chart) || chart.length === 0) {
    throw new Error('beanie chart: "chart" must be a non-empty array of rows.');
  }
  chart.forEach((row, r) => {
    if (!Array.isArray(row) || row.length !== W) {
      throw new Error(
        `beanie chart: row ${r} has ${Array.isArray(row) ? row.length : 'non-array'} cells, expected W=${W}.`,
      );
    }
    row.forEach((cell, c) => {
      if (typeof cell !== 'number' || !Number.isInteger(cell) || cell < 0) {
        throw new Error(`beanie chart: cell (${r}, ${c}) is ${JSON.stringify(cell)}, expected a colour index ≥ 0.`);
      }
    });
  });
  const colors = Array.isArray(obj.colors) ? (obj.colors as string[]) : [];
  return { W, colors, chart: chart as number[][] };
}

/** Map a binary beanie chart to a colour-key grid for the flat chart
 *  compiler. Row order is preserved (`grid[0]` stays the cast-on row), so the
 *  machine knits the motif in the same orientation the beanie path would. */
export function beanieMotifChartToColorGrid(
  chart: BeanieMotifChart,
  opts: BeanieChartToGridOptions = {},
): string[][] {
  const ramp = opts.colorKeys ?? BEANIE_MOTIF_COLOR_KEYS;
  // Index 0 = ground, 1 = motif (overridable for the legacy 2-colour path);
  // 2..N walk the ramp. A real ground colour is always emitted for `0`.
  const keyForIndex = (i: number): string => {
    if (i === 0) return opts.backgroundKey ?? ramp[0] ?? KEY_ID_COLOR_GRAPHITE;
    if (i === 1) return opts.motifKey ?? ramp[1] ?? KEY_ID_COLOR_SILVER;
    const k = ramp[i];
    if (!k) {
      throw new Error(
        `beanie chart: colour index ${i} has no palette colour (ramp holds ${ramp.length}); ` +
        `a motif with this many colours needs an explicit \`colorKeys\` ramp.`,
      );
    }
    return k;
  };
  return chart.chart.map((row) => row.map((cell) => keyForIndex(cell)));
}
