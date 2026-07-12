/**
 * Chart-core (Phase 2 Step 1, 2026-05-23): canonical per-cell projection
 * of a chart, consumed by every renderer / validator / compiler instead
 * of each one re-deriving role + owner + semantic op from raw keys.
 *
 * Why this layer exists: today, eight files independently reconstruct
 * "what does this cell mean" from `KnitlabKeyDefinition.cells[dy][dx]`
 * + `KnitlabKeyDefinition.op` + the structural-source-mask rule. They've
 * drifted in subtle ways (decreaseTopologyOverlay was double-counting
 * 2-wide tiles until 2026-05-23). One `ResolvedChartProjection` collapses
 * those eight reimplementations into one source of truth.
 *
 * Step 1 ships the layer + tests; no consumer migration yet. The
 * migration order (Step 2+) is: shift-events → continuity validator →
 * compile-chart → decreaseTopologyOverlay → InstructionsGenerator →
 * stockinette-shaped (after the in-flight rewrite stabilizes).
 */

import type { KnitlabKeyDefinition } from '../colorwork/knitlab1-contract.js';
import type { KnitOp } from '../primitives/knit-op.js';

export type CellRole =
  /** Unowned cell that falls through to the chart's default knit fill. */
  | 'background'
  /** Explicit KEY_ID_EMPTY placement (eraser; structural no-stitch). */
  | 'empty'
  /** Owner cell that carries the operation's primary semantic — the
   *  k2tog symbol cell, the cable column cells, the shift-1 destination
   *  marker, a single-cell knit/purl/yo/etc. */
  | 'result'
  /** Sibling cell of an owner whose canonical role is no-stitch source
   *  — the `·` cell of an atomic 2-wide decrease tile. */
  | 'source';

export interface ProjectedCell {
  /**
   * Stable opaque id of the placement that painted this cell, or null
   * for background cells. Two cells of the same atomic tile share the
   * same ownerId; consumers can use ownerId equality to coalesce
   * adjacent cells into one event (e.g. "one cable cross per owner"
   * rather than "one per cell").
   *
   * **Step 1 limitation:** shift-1 destination cells and their
   * auto-propagated source no-stitch block are separate placements
   * (the mutation service stages them as run-level ops), so they have
   * DIFFERENT ownerIds. Until Step 2.x adds explicit cross-placement
   * linkage, `ownerId` equality only identifies same-tile siblings
   * within a single placement (atomic decrease tiles, multi-cell cables).
   */
  readonly ownerId: string | null;
  /** Winning placement's keyId. `KEY_ID_KNIT_DEFAULT` for background. */
  readonly keyId: string;
  /**
   * The KeyDefinition that painted this cell, or null for background.
   * Carrying the reference means consumers (instructions prose,
   * overlays, palette-aware UI) don't need their own `paletteById.get`
   * lookup — they read `cellAt(r,c).keyDef?.abbreviation` etc.
   */
  readonly keyDef: KnitlabKeyDefinition | null;
  /** Per-cell role within the owning placement (or 'background'/'empty'). */
  readonly role: CellRole;
  /** Per-cell semantic op. Source cells of a decrease tile resolve to
   *  'no-stitch' even when the parent key's footprint op is e.g. 'ssk'. */
  readonly semanticOp: KnitOp;
  /**
   * Two-channel model (2026-05-27): colorwork override for this cell.
   * When a color-channel layer paints over the cell, this carries the
   * resolved background color string (verbatim from
   * `KnitlabKeyDefinition.backgroundColor` — may be a hex like '#8D8377'
   * or a host-side sentinel; the renderer resolves sentinels).
   *
   * Structural fields (keyId / role / semanticOp) are NOT touched by a
   * color-channel paint, so a `k2tog` survives a color overlay. When
   * absent, the cell has no colorwork override and renderers fall back
   * to `keyDef.backgroundColor`.
   */
  readonly colorant?: string;
}

export type ProjectionWarningCode =
  | 'hidden-layer-skipped'
  | 'unknown-key-dropped'
  | 'placement-out-of-bounds';

export interface ProjectionWarning {
  code: ProjectionWarningCode;
  /** Human-readable reason for diagnostic surfaces (validator, UI banner). */
  reason: string;
  /** Aggregate count across the chart (mirrors `ResolvedChart.warnings`
   *  so migrations can swap fields one-for-one). */
  placementCount: number;
}

/**
 * Phase 1c follow-up follow-up follow-up follow-up (2026-05-24): row-space
 * type tag. A projection's rows can be indexed in two different conventions:
 *
 *  - `'authored'` — `cellAt(0)` is the chart-display row 0 (typically the
 *    TOP of the canvas in knitlab1). For a bottom-up chart, this is the
 *    row that gets knit LAST.
 *  - `'knit-order'` — `cellAt(0)` is the cast-on row (first row knit);
 *    rows advance in knitting order. Shape walkers REQUIRE this order
 *    because they iterate rows as the carriage knits them.
 *
 * `projectChart` always produces an `'authored'` projection; pass it
 * through `reverseProjectionRows` (or `tagAsKnitOrder` for top-down
 * charts where authored == knit-order semantically) before a shape
 * walker can consume it.
 */
export type RowSpace = 'authored' | 'knit-order';

declare const RowSpaceBrand: unique symbol;

export interface ResolvedChartProjection<S extends RowSpace = RowSpace> {
  /** Phantom brand — never assigned at runtime. The brand prevents an
   *  authored projection from being passed where the type system requires
   *  knit-order (and vice-versa). Construct branded projections via
   *  `projectChart`, `reverseProjectionRows`, or `tagAsKnitOrder` in
   *  `chart-core/projection.ts`. */
  readonly [RowSpaceBrand]: S;
  readonly rows: number;
  readonly cols: number;
  /**
   * Diagnostics surface — one entry per warning code, with an aggregate
   * `placementCount`. Mirrors `ResolvedChart.warnings` so a validator
   * migrating from the resolver doesn't lose its warning stream.
   */
  readonly warnings: readonly ProjectionWarning[];
  /** O(1) lookup. Out-of-bounds coordinates return the background cell. */
  cellAt(row: number, col: number): ProjectedCell;
  /** Row-major iteration of every in-bounds cell. */
  cells(): IterableIterator<{ row: number; col: number; cell: ProjectedCell }>;
}
