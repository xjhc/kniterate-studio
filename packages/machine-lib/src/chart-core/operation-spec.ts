/**
 * `OperationSpec` — declarative per-cell description of a knit-tile.
 *
 * Phase 2 (Task #38, 2026-05-23) introduces the spec as the canonical
 * description of what a multi-cell tile means. Today projection derives
 * each tile's per-cell role + semanticOp from
 * `KnitlabKeyDefinition.cells[r][c].op` + `deriveStructuralSourceMask`
 * — that derivation is the *current truth*, and any spec we ship must
 * round-trip with it before it can replace it (see
 * `test/chart-core/spec-coverage.test.ts`).
 *
 * Why declarative? The legacy derivation has three knobs (key footprint
 * op, per-cell `cells[r][c].op` override, derived source mask) and
 * subtle interactions between them. A spec collapses those into a
 * single `cells[dy][dx]: { role, semanticOp }` matrix so consumers
 * (projection, walker, validator, palette editor) read one shape
 * instead of recomputing the same answer.
 *
 * Scope today (post-#41c, 2026-05-24):
 *  - Types + helpers: `singleCellOp`, `cableCells`, `decreaseTile`,
 *    `symmetricCable` (knit-over-knit + travellers), `cablePurlBg`
 *    (LPC/RPC family), `decorativeTile` (#41c, multi-cell visual
 *    texture tiles).
 *  - A registry of **57 specs** covering the **canonical cell
 *    semantics** of every palette key in both `DEFAULT_KEY_PALETTE`
 *    and `INITIAL_KEY_PALETTE` — 18 cables + 8 atomic decreases + 28
 *    single-cell ops + 3 decorative tiles. Layout owned in
 *    `spec-registry.ts`. Naming note: "canonical cell semantics"
 *    rather than "structural" — the registry carries ownership-
 *    changing keys AND ordinary single-cell ops, so "structural"
 *    would overload the term.
 *  - `projectChart` consults the registry first, falls back to the
 *    legacy derivation for any keyId without a spec — currently
 *    only user-authored custom keys hit the fallback.
 *  - `cable-registry.ts` (Task #40) consumes every cable spec to
 *    drive validator + walker cable dispatch through one
 *    `chooseDispatch(shape)` truth table.
 *
 * Out of scope (hard-stopped, deferred):
 *  - Walker migration (Phase 1c).
 *  - Actually retiring the host palette mirror (#41 follow-up). #41c
 *    reached full registry coverage; both palettes remain hand-
 *    maintained pending a single-source-of-truth design decision.
 */

import {
  decreaseSpanForOp,
  type KnitlabKnitOp,
} from '../colorwork/knitlab1-contract.js';

/** Per-cell declarative role + semantic op for one tile cell.
 *
 *  Matches the projection's `ProjectedCell.role` / `.semanticOp`
 *  exactly — when the spec is wired in, projection just copies these
 *  values into the `ProjectedCell` for that grid coordinate. */
export interface OperationSpecCell {
  /** Cell role at this tile coordinate.
   *  - `'result'` — the cell that carries the visible op (decrease
   *    symbol, plain knit, cable cell).
   *  - `'source'` — atomic-tile source no-stitch (an ssk's ns-side, a
   *    k2tog's ns-side, etc.). The projection treats this as
   *    `'no-stitch'` for semantics but keeps the parent keyId for
   *    identity.
   *  - `'empty'` — explicit no-stitch (the `KEY_ID_EMPTY` placement). */
  readonly role: 'result' | 'source' | 'empty';
  /** Semantic op the projection should report at this cell. */
  readonly semanticOp: KnitlabKnitOp;
}

export type OperationSpecStatus = 'stable' | 'experimental' | 'deprecated';

/** Optional cable-cross metadata. Present iff this spec describes a
 *  cable tile. Mirrors the host's `KeyDefinition.cableSpan` (knitlab1
 *  contract) so wrapping a spec into a host key is straight-through. */
export interface OperationSpecCableSpan {
  /** Total stitches involved (matches `cells[0].length` for symmetric
   *  cables; may differ for asymmetric cables when present). */
  readonly width: number;
  /** Which strand crosses on top. */
  readonly direction: 'front' | 'back';
  /** Row index within the tile footprint where the cross happens
   *  (default 0 = top row). */
  readonly crossRow?: number;
  /** Worked-side stitch count (Batch D Phase 0 §0.2). Defaults to
   *  `floor(width / 2)` for symmetric cables. */
  readonly workedWidth?: number;
  /** Purl-side stitch count. Defaults to `floor(width / 2)`. */
  readonly purlWidth?: number;
}

/** A declarative spec for a single palette key. The `cells` matrix is
 *  the source of truth; consumers should NOT recompute role/op from
 *  per-cell op overrides or source masks when a spec exists. */
export interface OperationSpec {
  /** Spec id — corresponds 1:1 with a `KnitlabKeyDefinition.id`. */
  readonly id: string;
  /** Lifecycle status of this spec. Most specs are `stable`. Use
   *  `experimental` for specs that haven't shipped yet; `deprecated`
   *  for specs kept around for backward-compat reads. */
  readonly status: OperationSpecStatus;
  /** ISO date (YYYY-MM-DD) the spec was first registered. Used by the
   *  coverage gate to surface spec churn. */
  readonly since: string;
  /** Tile footprint width (matches `KnitlabKeyDefinition.width`). */
  readonly width: number;
  /** Tile footprint height (matches `KnitlabKeyDefinition.height`). */
  readonly height: number;
  /** Per-cell declarative data: `cells[dy][dx]` is the role + op for
   *  that cell of the tile. */
  readonly cells: ReadonlyArray<ReadonlyArray<OperationSpecCell>>;
  /** Optional cable-cross metadata. */
  readonly cableSpan?: OperationSpecCableSpan;
}

/** A 1×1 tile that emits one op at one cell. Picks `role` based on
 *  whether the op is `'no-stitch'` (`'empty'`) or anything else
 *  (`'result'`). */
export function singleCellOp(
  id: string,
  op: KnitlabKnitOp,
  since: string,
  status: OperationSpecStatus = 'stable',
): OperationSpec {
  const role: OperationSpecCell['role'] = op === 'no-stitch' ? 'empty' : 'result';
  return {
    id,
    status,
    since,
    width: 1,
    height: 1,
    cells: [[{ role, semanticOp: op }]],
  };
}

/** A uniform-op cable tile of N width and (optional) M height. Every
 *  cell gets the same `semanticOp` (default `'knit'`); pass the
 *  cable's footprint op for tiles whose host palette key declares a
 *  non-knit op (e.g. LT → `'lt'`, RT → `'rt'`). The tall variants
 *  (`key_cable_2_front_tall`) pass `height > 1`. */
export function cableCells(
  width: number,
  height = 1,
  op: KnitlabKnitOp = 'knit',
): OperationSpecCell[][] {
  return Array.from({ length: height }, () => {
    const row: OperationSpecCell[] = [];
    for (let dx = 0; dx < width; dx++) {
      row.push({ role: 'result', semanticOp: op });
    }
    return row;
  });
}

/** Symmetric knit-over-knit cable (`cable-2/4/6/8 front/back`, LT, RT,
 *  tall variants). Every cell carries the same semanticOp; the
 *  `cableSpan` carries the shape. LT/RT explicitly set `op` so the
 *  projection reports their distinct op (matching the host palette's
 *  `op: 'lt' | 'rt'`). Pass `height` to render multi-row cable visuals. */
export function symmetricCable(
  id: string,
  width: number,
  direction: 'front' | 'back',
  since: string,
  options: { height?: number; op?: KnitlabKnitOp; status?: OperationSpecStatus } = {},
): OperationSpec {
  const height = options.height ?? 1;
  const op = options.op ?? 'knit';
  return {
    id,
    status: options.status ?? 'stable',
    since,
    width,
    height,
    cells: cableCells(width, height, op),
    cableSpan: { width, direction, crossRow: 0 },
  };
}

/** Cable-with-purl-background tile (LPC/RPC family). `pattern` is a
 *  string of `k` / `p` characters indicating which cell is knit vs
 *  purl after the cross. Example: `cablePurlBg('key_lpc_1_2', 'kpp',
 *  1, 2, 'front', ...)` for "1 knit over 2 purls, cross left". */
export function cablePurlBg(
  id: string,
  pattern: string,
  workedWidth: number,
  purlWidth: number,
  direction: 'front' | 'back',
  since: string,
  status: OperationSpecStatus = 'stable',
): OperationSpec {
  const width = pattern.length;
  if (workedWidth + purlWidth !== width) {
    throw new Error(`cablePurlBg ${id}: workedWidth(${workedWidth}) + purlWidth(${purlWidth}) !== width(${width})`);
  }
  const row: OperationSpecCell[] = [];
  for (const ch of pattern) {
    if (ch === 'k') row.push({ role: 'result', semanticOp: 'knit' });
    else if (ch === 'p') row.push({ role: 'result', semanticOp: 'purl' });
    else throw new Error(`cablePurlBg ${id}: invalid pattern char '${ch}' (expected 'k' or 'p')`);
  }
  return {
    id,
    status,
    since,
    width,
    height: 1,
    cells: [row],
    cableSpan: { width, direction, crossRow: 0, workedWidth, purlWidth },
  };
}

/** A decorative multi-cell tile with per-cell `op` overrides and no
 *  source/empty cells. Every cell carries `role: 'result'` with the
 *  passed-in `semanticOp`, mirroring the legacy multi-cell projection
 *  branch for a tile whose footprint op is non-decrease (`'knit'`).
 *
 *  Use this for visual texture tiles (eyelet 2×2, tuck-rib 2×2,
 *  waffle 2×2) — tiles where each cell carries its own primitive op
 *  and the tile as a whole does NOT own its neighbors as no-stitch
 *  sources. The host palette declares these as `op: 'knit'` with
 *  per-cell `cells[r][c].op` overrides; `decorativeTile` produces the
 *  same `ProjectedCell` matrix that the legacy derivation does for
 *  that shape.
 *
 *  NOTE: if a cell's op happens to be a decrease (`'k2tog'` in an
 *  eyelet's cross corner), the projection still reports
 *  `role: 'result'` for it — NOT `'source'`. The atomic-decrease
 *  source-masking only fires when the tile's FOOTPRINT op is the
 *  decrease (as in `decreaseTile`); a decorative tile that contains
 *  a decrease cell is a visual texture, not an atomic decrease tile.
 *  This matches what the host palette does today and the hard stop
 *  on this chunk (do not change tile semantics).
 *
 *  Throws if `cells` is empty or rows have inconsistent widths. */
export function decorativeTile(
  id: string,
  cells: ReadonlyArray<ReadonlyArray<KnitlabKnitOp>>,
  since: string,
  status: OperationSpecStatus = 'stable',
): OperationSpec {
  if (cells.length === 0) {
    throw new Error(`decorativeTile ${id}: cells must have at least one row`);
  }
  const height = cells.length;
  const width = cells[0]!.length;
  if (width === 0) {
    throw new Error(`decorativeTile ${id}: cells[0] must have at least one column`);
  }
  for (let r = 0; r < height; r++) {
    if (cells[r]!.length !== width) {
      throw new Error(`decorativeTile ${id}: row ${r} has width ${cells[r]!.length}, expected ${width}`);
    }
  }
  return {
    id,
    status,
    since,
    width,
    height,
    cells: cells.map(row =>
      row.map(op => ({ role: 'result' as const, semanticOp: op })),
    ),
  };
}

/** A standard atomic decrease tile derived from `decreaseSpanForOp`.
 *  The symbol cell sits at `-min(sourceOffsets)` within the tile;
 *  every other cell is a no-stitch source. Matches what
 *  `deriveStructuralSourceMask` + projection already produce for the
 *  legacy derivation path, so a spec built with this helper round-
 *  trips byte-for-byte with the legacy projection.
 *
 *  Throws when the op has no decrease span (caller bug — don't call
 *  this for non-decrease ops). */
export function decreaseTile(
  id: string,
  op: KnitlabKnitOp,
  since: string,
  status: OperationSpecStatus = 'stable',
): OperationSpec {
  const span = decreaseSpanForOp(op);
  if (!span) {
    throw new Error(`decreaseTile: op '${op}' has no decreaseSpan; use a different helper.`);
  }
  const width = span.sourceOffsets.length;
  const symbolPos = -Math.min(...span.sourceOffsets);
  if (symbolPos < 0 || symbolPos >= width) {
    throw new Error(`decreaseTile: op '${op}' has invalid sourceOffsets ${JSON.stringify(span.sourceOffsets)}; symbol position ${symbolPos} out of [0, ${width}).`);
  }
  const row: OperationSpecCell[] = [];
  for (let dx = 0; dx < width; dx++) {
    row.push(dx === symbolPos
      ? { role: 'result', semanticOp: op }
      : { role: 'source', semanticOp: 'no-stitch' });
  }
  return {
    id,
    status,
    since,
    width,
    height: 1,
    cells: [row],
  };
}
