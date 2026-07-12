/**
 * Chart-core paint order (Phase 2 Step 1 review, 2026-05-23): single
 * source of truth for placement paint ordering.
 *
 * Used by:
 *  - `src/knitout/passes/resolve-chart.ts` (per-cell keyId grid)
 *  - `src/chart-core/projection.ts` (per-cell role/owner projection)
 *  - `reference/knitlab/constants.ts` (host's
 *    `buildGridFromKeyPlacements`, via the host predicate; Phase 1b
 *    host flip 2026-05-23)
 *
 * Sharing one implementation guarantees the projection's "winning
 * placement per cell" matches the resolver's grid — otherwise the
 * no-drift smoke in test/chart-core/projection.test.ts would break.
 *
 * Order:
 *  1. Contentful keys paint first (per the injected `isContentful`
 *     predicate; default = `key.cells` has any non-null entry).
 *  2. Then by area, larger first.
 *  3. Then anchor.y ascending, anchor.x ascending.
 *
 * Small detail placements paint last and "win".
 *
 * Phase 1b (2026-05-23): the host (`reference/knitlab/`) extends
 * "contentful" to include keys with only `lines` or `circles`
 * (decorative line-only / circle-only keys). Chart-core stays
 * presentation-agnostic — `lines` and `circles` are knitlab1 host
 * concepts, not engine concepts — and accepts the host's broader
 * predicate via the optional `isContentful` parameter. Engine callers
 * use the default cells-only check.
 */

import type { KnitlabKeyDefinition, KnitlabLayer } from '../colorwork/knitlab1-contract.js';

export function sortPlacementsForPaint(
  layer: KnitlabLayer,
  paletteById: ReadonlyMap<string, KnitlabKeyDefinition>,
  isContentful: (key: KnitlabKeyDefinition) => boolean = defaultIsContentful,
): KnitlabLayer['keyPlacements'] {
  const placements = layer.keyPlacements ?? [];
  return [...placements].sort((a, b) => {
    const keyA = paletteById.get(a.keyId);
    const keyB = paletteById.get(b.keyId);
    if (!keyA || !keyB) return 0;
    const contentfulA = isContentful(keyA);
    const contentfulB = isContentful(keyB);
    if (contentfulA !== contentfulB) {
      return contentfulA ? -1 : 1;
    }
    const areaA = (keyA.width ?? 1) * (keyA.height ?? 1);
    const areaB = (keyB.width ?? 1) * (keyB.height ?? 1);
    if (areaA !== areaB) return areaB - areaA;
    if (a.anchor.y !== b.anchor.y) return a.anchor.y - b.anchor.y;
    return a.anchor.x - b.anchor.x;
  });
}

/** Default predicate: a key is contentful when its `cells` grid has at
 *  least one non-null entry. Chart-core has no concept of `lines` or
 *  `circles` (those live in the host palette type), so they are not
 *  inspected here. Host callers inject a broader predicate. */
function defaultIsContentful(key: KnitlabKeyDefinition): boolean {
  const cells = key.cells;
  if (!Array.isArray(cells)) return false;
  return cells.flat().some((c: unknown) => c !== null && c !== undefined);
}
