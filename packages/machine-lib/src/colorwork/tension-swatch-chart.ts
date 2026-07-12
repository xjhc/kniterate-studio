/**
 * Canonical tension-swatch CHART builder.
 *
 * The tension swatch is a normal knitlab1 chart: a plain stockinette
 * rectangle whose per-section tensions are sticky `stitch-number` row
 * annotations. Built on `ChartBuilder` so it shares one chart-authoring
 * vocabulary with the i-cord / shaped-tube generators.
 *
 * Two consumers:
 *   - the Kniterate wizard's Screen-3 swatch download, via
 *     `compileTensionSwatchChart` (recipe-driven PatternProgram →
 *     `compileExport`) in src/knitout/swatch/tension-swatch-chart.ts
 *   - `scripts/generate-tension-swatch-chart.ts` (CLI → importable .knitlab)
 *
 * NOTE: this is the *structural* / export-path swatch — a valid,
 * configurable physical swatch knit through the normal chart export path.
 * It is NOT byte-faithful to the Kniterate App's `reference/swatch.kc`.
 * Gate 0 (2026-05-30) measured the gap: config knobs reach ~5 of 364
 * passes; the App-faithful cast-on (racked tubular + C3 assist carrier +
 * 40 xfers) and plain-closing-waste finish are a separate port. The
 * App-faithful swatch stays the bespoke `buildTensionSwatch` emitter in
 * src/knitout/swatch/tension-swatch.ts (the parity oracle).
 */
import { ChartBuilder } from './chart-builder.js';
import {
  KEY_ID_KNITERATE_KNIT,
  type KnitlabApplicationState,
} from './knitlab1-contract.js';

export interface Band {
  stitch: number;
  rows: number;
}

export function buildTensionSwatchChart(width: number, bands: Band[]): KnitlabApplicationState {
  const totalRows = bands.reduce((sum, b) => sum + b.rows, 0);
  const builder = new ChartBuilder({
    width,
    rows: totalRows,
    id: 'tension-swatch',
    name: `Tension swatch ${bands.map(b => b.stitch).join('/')}`,
    orientation: 'bottom-up',
    paletteMode: 'kniterate',
  }).fill(KEY_ID_KNITERATE_KNIT);

  // One sticky stitch-number annotation at each band's first row; the
  // walker holds the value until the next band. Row 0 is the cast-on edge.
  let row = 0;
  for (const band of bands) {
    builder.stitchBand(row, band.stitch);
    row += band.rows;
  }

  return builder.build();
}
