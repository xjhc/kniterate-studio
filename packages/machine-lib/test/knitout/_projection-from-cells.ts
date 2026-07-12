/**
 * Test helper: build a `ResolvedChartProjection` from a 2D cells matrix.
 *
 * Used by `stockinette-{,shaped-,with-overrides}` walker unit tests which
 * previously hand-rolled a `ResolvedChart` literal. Phase 1c (2026-05-24)
 * moved walkers off `ResolvedChart.cells`/`cellOps` reads onto the
 * `ResolvedChartProjection.cellAt` API — these tests now need a real
 * projection instead.
 *
 * Row-space contract (2026-05-24): callers populate `cells[0]` with the
 * cast-on row (the first row knit) and `cells[N-1]` with the last row.
 * That matches what the shape walker needs, so the helper returns a
 * `<'knit-order'>`-tagged projection via `tagAsKnitOrder`. The bottom-up
 * row reversal that `compileChartToKnitout` applies is the production
 * counterpart; tests skip that step by supplying knit-order directly.
 *
 * Synthesizes a `KnitlabChartState` with one layer + one placement per
 * non-default-knit cell, then runs `projectChart`. KEY_ID_KNIT_DEFAULT
 * cells become background; KEY_ID_EMPTY cells become eraser placements
 * (matching how the real chart resolves them).
 */
import {
  KEY_ID_KNIT_DEFAULT,
  type KnitlabChartState,
  type KnitlabKeyDefinition,
  type KnitlabKeyInstance,
} from '../../src/colorwork/knitlab1-contract.js';
import { projectChart, tagAsKnitOrder } from '../../src/chart-core/projection.js';
import type { ResolvedChartProjection } from '../../src/chart-core/types.js';

export function projectionFromCells(
  cells: readonly (readonly string[])[],
  keyPalette: readonly KnitlabKeyDefinition[],
): ResolvedChartProjection<'knit-order'> {
  const rows = cells.length;
  const cols = cells[0]?.length ?? 0;
  const placements: KnitlabKeyInstance[] = [];
  for (let r = 0; r < rows; r++) {
    const row = cells[r];
    if (!row) continue;
    for (let c = 0; c < cols; c++) {
      const keyId = row[c];
      if (!keyId || keyId === KEY_ID_KNIT_DEFAULT) continue;
      placements.push({ keyId, anchor: { x: c, y: r } });
    }
  }
  const chart: KnitlabChartState = {
    id: 'projection-from-cells',
    name: 'projection-from-cells',
    rows,
    cols,
    orientation: 'bottom-up',
    displaySettings: {
      rowCountVisibility: 'none',
      colCountVisibility: 'none',
    },
    activeLayerId: 'layer-0',
    layers: [{
      id: 'layer-0',
      name: 'layer-0',
      isVisible: true,
      grid: {},
      keyPlacements: placements,
    }],
    annotations: [],
  };
  return tagAsKnitOrder(projectChart(chart, [...keyPalette]));
}
