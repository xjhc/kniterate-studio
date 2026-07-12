/**
 * `projectChart` — build a `ResolvedChartProjection` from a chart +
 * palette. See `./types.ts` for the goal and migration order.
 *
 * Implementation notes:
 *  - Paint order is shared with `resolve-chart.ts` via
 *    `./paint-order.ts` so the projection's "winning placement per
 *    cell" matches the resolver's keyId grid.
 *  - Owner ids are `L<layerIdx>:P<placementIdx>` with the placement's
 *    anchor + keyId appended for debuggability. They're opaque to
 *    consumers; the only contract is stable equality within a build.
 *  - Source-cell detection for atomic decrease tiles uses
 *    `deriveStructuralSourceMask` from `./source-mask.ts` — derived
 *    from the primitive's `sourceOffsets`, not from `cells[dy][dx].op`,
 *    so a malformed custom key still resolves its source role. The
 *    same helper is imported by `src/knitout/passes/resolve-chart.ts`,
 *    so the projection and resolver cannot drift on this rule.
 *  - Diagnostics (`warnings`) mirror `ResolvedChart.warnings`: one
 *    entry per code (`hidden-layer-skipped`, `unknown-key-dropped`,
 *    `placement-out-of-bounds`) with an aggregate count.
 */

import {
  KEY_ID_EMPTY,
  KEY_ID_KNIT_DEFAULT,
  opForKey,
  type KnitlabChartState,
  type KnitlabKeyDefinition,
  type KnitlabKeyInstance,
  type KnitlabKnitOp,
  type KnitlabLayerKind,
} from '../colorwork/knitlab1-contract.js';
import { sortPlacementsForPaint } from './paint-order.js';
import { deriveStructuralSourceMask } from './source-mask.js';
import { specForKeyId } from './spec-registry.js';
import type {
  CellRole,
  ProjectedCell,
  ProjectionWarning,
  ResolvedChartProjection,
} from './types.js';

const BACKGROUND_CELL: ProjectedCell = Object.freeze({
  ownerId: null,
  keyId: KEY_ID_KNIT_DEFAULT,
  keyDef: null,
  role: 'background',
  semanticOp: 'knit',
}) as ProjectedCell;

export function projectChart(
  chart: KnitlabChartState,
  keyPalette: readonly KnitlabKeyDefinition[],
): ResolvedChartProjection<'authored'> {
  const { rows, cols } = chart;
  if (!Number.isInteger(rows) || rows <= 0) {
    throw new Error(`projectChart: invalid rows=${rows}; must be a positive integer`);
  }
  if (!Number.isInteger(cols) || cols <= 0) {
    throw new Error(`projectChart: invalid cols=${cols}; must be a positive integer`);
  }

  const paletteById = new Map<string, KnitlabKeyDefinition>();
  for (const key of keyPalette) {
    if (key && typeof key.id === 'string') paletteById.set(key.id, key);
  }

  const grid: ProjectedCell[][] = Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => BACKGROUND_CELL),
  );

  let hiddenLayersSkipped = 0;
  let unknownKeyDropped = 0;
  let outOfBoundsDropped = 0;

  const layers = chart.layers ?? [];
  for (let layerIdx = 0; layerIdx < layers.length; layerIdx++) {
    const layer = layers[layerIdx];
    if (!layer) continue;
    if (layer.isVisible === false) {
      hiddenLayersSkipped += 1;
      continue;
    }
    const layerKind: KnitlabLayerKind = layer.kind ?? 'structure';
    const placements = sortPlacementsForPaint(layer, paletteById);
    for (let placementIdx = 0; placementIdx < placements.length; placementIdx++) {
      const placement = placements[placementIdx]!;
      const keyDef = paletteById.get(placement.keyId);
      if (!keyDef) {
        unknownKeyDropped += 1;
        continue;
      }
      if (paintPlacement(grid, rows, cols, layerIdx, placementIdx, placement, keyDef, layerKind)) {
        outOfBoundsDropped += 1;
      }
    }
  }

  const warnings: ProjectionWarning[] = [];
  if (hiddenLayersSkipped > 0) {
    warnings.push({
      code: 'hidden-layer-skipped',
      reason: 'Skipped hidden layers (isVisible === false). Set visibility to include in export.',
      placementCount: hiddenLayersSkipped,
    });
  }
  if (outOfBoundsDropped > 0) {
    warnings.push({
      code: 'placement-out-of-bounds',
      reason: 'Placement footprint extends past chart bounds; truncated.',
      placementCount: outOfBoundsDropped,
    });
  }
  if (unknownKeyDropped > 0) {
    warnings.push({
      code: 'unknown-key-dropped',
      reason: 'Placement references a keyId not in keyPalette.',
      placementCount: unknownKeyDropped,
    });
  }

  return {
    rows,
    cols,
    warnings,
    cellAt(row: number, col: number): ProjectedCell {
      if (row < 0 || row >= rows || col < 0 || col >= cols) return BACKGROUND_CELL;
      return grid[row]![col]!;
    },
    *cells() {
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          yield { row: r, col: c, cell: grid[r]![c]! };
        }
      }
    },
  } as unknown as ResolvedChartProjection<'authored'>;
}

/** Returns true iff at least one cell of the placement's footprint
 *  was out of bounds and got dropped. */
function paintPlacement(
  grid: ProjectedCell[][],
  rows: number,
  cols: number,
  layerIdx: number,
  placementIdx: number,
  placement: KnitlabKeyInstance,
  keyDef: KnitlabKeyDefinition,
  layerKind: KnitlabLayerKind,
): boolean {
  const width = Math.max(1, Math.floor(Number(keyDef.width) || 1));
  const height = Math.max(1, Math.floor(Number(keyDef.height) || 1));
  const ax = Number(placement.anchor?.x);
  const ay = Number(placement.anchor?.y);
  if (!Number.isInteger(ax) || !Number.isInteger(ay)) return false;

  // Color-channel placements contribute only the `colorant` field;
  // keyId / role / semanticOp belong to the structure channel and are
  // never touched by a color paint. This is what makes a `k2tog`
  // survive being overlaid by a color stripe.
  if (layerKind === 'color') {
    let dropped = false;
    for (let dy = 0; dy < height; dy++) {
      for (let dx = 0; dx < width; dx++) {
        const r = ay + dy;
        const c = ax + dx;
        if (r < 0 || r >= rows || c < 0 || c >= cols) {
          dropped = true;
          continue;
        }
        const prev = grid[r]![c]!;
        grid[r]![c] = { ...prev, colorant: keyDef.backgroundColor };
      }
    }
    return dropped;
  }

  const ownerId = `L${layerIdx}:P${placementIdx}:${ax},${ay}:${keyDef.id}`;
  let droppedFootprint = false;

  // Phase 2 (#38 + #39, 2026-05-23): consult the OperationSpec registry
  // first. If a spec is registered for this keyId, its declarative
  // `cells[dy][dx]` matrix carries role + semanticOp directly. Non-
  // ported keys fall through to the legacy derivation below.
  const spec = specForKeyId(keyDef.id);
  if (spec) {
    for (let dy = 0; dy < spec.height; dy++) {
      for (let dx = 0; dx < spec.width; dx++) {
        const r = ay + dy;
        const c = ax + dx;
        if (r < 0 || r >= rows || c < 0 || c >= cols) {
          droppedFootprint = true;
          continue;
        }
        const sc = spec.cells[dy]?.[dx];
        if (!sc) continue;
        const prevColorant = grid[r]![c]!.colorant;
        grid[r]![c] = {
          ownerId,
          keyId: keyDef.id,
          keyDef,
          role: sc.role,
          semanticOp: sc.semanticOp,
          colorant: prevColorant,
        };
      }
    }
    return droppedFootprint;
  }

  // Legacy derivation: key footprint op + per-cell `cells[r][c].op` +
  // derived source mask. Used for every keyId not yet ported to an
  // OperationSpec (most of the palette today).
  const keyFootprintOp = opForKey(keyDef);
  const isMultiCell = width > 1 || height > 1;
  const sourceMask = isMultiCell ? deriveStructuralSourceMask(keyFootprintOp, width) : null;
  const isEmpty = keyDef.id === KEY_ID_EMPTY;

  for (let dy = 0; dy < height; dy++) {
    for (let dx = 0; dx < width; dx++) {
      const r = ay + dy;
      const c = ax + dx;
      if (r < 0 || r >= rows || c < 0 || c >= cols) {
        droppedFootprint = true;
        continue;
      }

      const isMaskedSource = sourceMask?.[dy]?.[dx] === true;
      const role: CellRole = isEmpty
        ? 'empty'
        : isMaskedSource
          ? 'source'
          : 'result';
      const semanticOp: KnitlabKnitOp = isEmpty
        ? 'no-stitch'
        : isMaskedSource
          ? 'no-stitch'
          : (isMultiCell ? (keyDef.cells?.[dy]?.[dx]?.op ?? keyFootprintOp) : keyFootprintOp);

      const prevColorant = grid[r]![c]!.colorant;
      grid[r]![c] = { ownerId, keyId: keyDef.id, keyDef, role, semanticOp, colorant: prevColorant };
    }
  }
  return droppedFootprint;
}

/**
 * Wrap a projection in a row-reversed view. Use when the consumer
 * operates in a row-mirrored grid (e.g. shape-mode bottom-up compile
 * reverses chart rows to lower in knitting order). Cells, owner ids,
 * warnings, and per-cell semantics are unchanged — only the row index
 * mapping inverts: new cell (r, c) == old cell (rows - 1 - r, c).
 *
 * Row-space contract: takes a chart-authored projection, returns a
 * knit-order projection. Shape walkers consume the result.
 */
export function reverseProjectionRows(
  source: ResolvedChartProjection<'authored'>,
): ResolvedChartProjection<'knit-order'> {
  const { rows, cols, warnings } = source;
  const flip = (r: number): number => rows - 1 - r;
  return {
    rows,
    cols,
    warnings,
    cellAt(row: number, col: number): ProjectedCell {
      if (row < 0 || row >= rows || col < 0 || col >= cols) {
        return source.cellAt(-1, -1); // background sentinel
      }
      return source.cellAt(flip(row), col);
    },
    *cells() {
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          yield { row: r, col: c, cell: source.cellAt(flip(r), c) };
        }
      }
    },
  } as unknown as ResolvedChartProjection<'knit-order'>;
}

/**
 * Tag an already-knit-order projection without flipping rows. Used when
 * the caller knows the projection structurally represents knit-order
 * already (e.g. top-down charts where chart-display rows match knit
 * order, or synthetic test fixtures built knit-order-first). This is a
 * pure type-system operation — the runtime object is returned as-is.
 *
 * Do NOT use this to bypass the authored→knit-order reversal for
 * bottom-up shape charts; that's what `reverseProjectionRows` is for.
 */
export function tagAsKnitOrder(
  source: ResolvedChartProjection<'authored'>,
): ResolvedChartProjection<'knit-order'> {
  return source as unknown as ResolvedChartProjection<'knit-order'>;
}
