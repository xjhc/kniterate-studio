/**
 * Phase 2 spec registry — the **canonical cell-semantics registry**
 * (post-Task #41a/#41b, 2026-05-24).
 *
 * Maps a `KnitlabKeyDefinition.id` → `OperationSpec`. Projection
 * consults `specForKeyId(id)` first; if the spec exists, its
 * declarative `cells` matrix drives the projection's per-cell
 * `ProjectedCell` directly. If no spec is registered, projection
 * falls back to the legacy derivation
 * (`KnitlabKeyDefinition.cells` + `deriveStructuralSourceMask`).
 *
 * **Naming.** The registry is named "canonical cell semantics" rather
 * than "structural" because it carries both true ownership-changing
 * keys (decreases consume sources, cables cross strands) AND ordinary
 * single-cell ops (knit, purl, color swatches, tuck) whose role is
 * unambiguously 'result'. Calling all of these "structural" overloads
 * the term; "canonical semantics" reflects what they share — they
 * define what each cell of the tile means.
 *
 * **Cable scope.** Every live `INITIAL_KEY_PALETTE` entry that has a
 * `cableSpan` is registered here — 18 cable specs covering symmetric
 * knit-over-knit (cable-N front/back + tall variants), travellers
 * (LT/RT), and asymmetric cables-over-purl (LPC/RPC at 1/1, 1/2, 2/1
 * ratios). The cable registry (`src/chart-core/cable-registry.ts`)
 * iterates this set to build per-key dispatch handlers; the
 * `chart-core/cable-registry.test.ts` coverage gate enforces that
 * every live cable key has a spec, and vice versa.
 *
 * **Atomic decrease tiles.** All 8 atomic decreases (k2tog, ssk,
 * sk2p, k3tog, sssk, p2tog, p3tog, ssp) are registered via
 * `decreaseTile`. Their `cells[]` matches the host palette layout
 * (symbol position derived from `decreaseSpanForOp(op).sourceOffsets`,
 * other cells are `'no-stitch'` sources).
 *
 * **Single-cell ops.** Every 1×1 palette key is registered via
 * `singleCellOp` — knit variants (default + kniterate + 4 color
 * swatches), purl, no-stitch, yarn-over, tuck (default + kniterate),
 * slip stitches, k-tbl/p-tbl, kfb/pfb, knit-below, bobble, kpk-in-1,
 * m1l/m1r, m1lp/m1rp, p1-below, drop-st, shift-1-l/shift-1-r. Shifts
 * deliberately report their `'shift-N-X'` op verbatim (matching legacy
 * projection's single-cell branch where `semanticOp = opForKey(keyDef)`)
 * — the walker still inspects `keyId` to fire shift dispatch, and the
 * per-cell host override `cells[0][0].op: 'knit'` is ignored by the
 * legacy projection for 1×1 keys, so parity holds without redesign.
 *
 * **Decorative multi-cell tiles.** All 3 (`key_tile_eyelet_2x2`,
 * `key_tile_tuck_rib_2x2`, `key_tile_waffle_2x2`) are registered via
 * `decorativeTile` (#41c). Per-cell `op` overrides match the host
 * palette's `cells[r][c].op` matrix. The footprint op stays `'knit'`
 * (host palette declares it that way) so no source-masking — the
 * eyelet's `k2tog` cell stays a visual texture rather than an
 * atomic decrease tile.
 *
 * **Registry size: 57 specs** (18 cables + 8 decreases + 28 single-
 * cell ops + 3 decorative tiles) = full coverage of every key in
 * both `DEFAULT_KEY_PALETTE` and `INITIAL_KEY_PALETTE`. The
 * `test/reference/knitlab-palette-contract.test.ts` "no orphan
 * palette keys" gate (#41b, simplified in #41c) now asserts every
 * palette key has a spec — no allowlist remains.
 *
 * **Out of scope (hard-stopped, deferred):**
 *  - Actually retiring the host palette mirror (#41 follow-up). #41b
 *    tightened drift gates and #41c reached full registry coverage;
 *    both palettes remain hand-maintained pending a SoT decision.
 *  - Walker migration beyond what the cable registry requires.
 */

import {
  cablePurlBg,
  decorativeTile,
  decreaseTile,
  singleCellOp,
  symmetricCable,
  type OperationSpec,
} from './operation-spec.js';

// ── Symmetric knit-over-knit cables (10 specs) ───────────────────────
// Default cableSpan workedWidth/purlWidth (= floor(width/2)) is
// correct for every cable here — `symmetricCable` omits the explicit
// fields, matching the host palette which also leaves them undefined
// for these keys.
const CABLE_2F_SPEC: OperationSpec = symmetricCable('key_cable_2_front', 2, 'front', '2026-05-24');
const CABLE_2B_SPEC: OperationSpec = symmetricCable('key_cable_2_back', 2, 'back', '2026-05-24');
const CABLE_2F_TALL_SPEC: OperationSpec = symmetricCable('key_cable_2_front_tall', 2, 'front', '2026-05-24', { height: 4 });
const CABLE_2B_TALL_SPEC: OperationSpec = symmetricCable('key_cable_2_back_tall', 2, 'back', '2026-05-24', { height: 4 });
const CABLE_4F_SPEC: OperationSpec = symmetricCable('key_cable_4_front', 4, 'front', '2026-05-24');
const CABLE_4B_SPEC: OperationSpec = symmetricCable('key_cable_4_back', 4, 'back', '2026-05-24');
const CABLE_6F_SPEC: OperationSpec = symmetricCable('key_cable_6_front', 6, 'front', '2026-05-24');
const CABLE_6B_SPEC: OperationSpec = symmetricCable('key_cable_6_back', 6, 'back', '2026-05-24');
const CABLE_8F_SPEC: OperationSpec = symmetricCable('key_cable_8_front', 8, 'front', '2026-05-24');
const CABLE_8B_SPEC: OperationSpec = symmetricCable('key_cable_8_back', 8, 'back', '2026-05-24');

// ── Travellers (2 specs) ─────────────────────────────────────────────
// Mechanically a 1×1 cable cross — same dispatch shape as cable-2 but
// the host palette declares a distinct op (`'lt'` / `'rt'`) so the
// projection's per-cell semanticOp reports it accurately. The cable
// registry's `shapeFromSpec` is op-agnostic and produces the same
// width=2/worked=1/purl=1 dispatch shape regardless.
const LT_SPEC: OperationSpec = symmetricCable('key_lt', 2, 'front', '2026-05-24', { op: 'lt' });
const RT_SPEC: OperationSpec = symmetricCable('key_rt', 2, 'back', '2026-05-24', { op: 'rt' });

// ── Cables-over-purl (LPC / RPC family — 6 specs) ────────────────────
// Cell layout captures POST-cross arrangement: walker fires the cable
// cross BEFORE the row's knit pass, so by the time the walker reaches
// each cell, the worked stitch already sits at its final position.
// LPC = knit ends up on the LEFT after crossing left over purls.
// RPC = knit ends up on the RIGHT after crossing right.
const LPC_1_1_SPEC: OperationSpec = cablePurlBg('key_lpc_1_1', 'kp', 1, 1, 'front', '2026-05-24');
const LPC_1_2_SPEC: OperationSpec = cablePurlBg('key_lpc_1_2', 'kpp', 1, 2, 'front', '2026-05-24');
const LPC_2_1_SPEC: OperationSpec = cablePurlBg('key_lpc_2_1', 'kkp', 2, 1, 'front', '2026-05-24');
const RPC_1_1_SPEC: OperationSpec = cablePurlBg('key_rpc_1_1', 'pk', 1, 1, 'back', '2026-05-24');
const RPC_1_2_SPEC: OperationSpec = cablePurlBg('key_rpc_1_2', 'ppk', 1, 2, 'back', '2026-05-24');
const RPC_2_1_SPEC: OperationSpec = cablePurlBg('key_rpc_2_1', 'pkk', 2, 1, 'back', '2026-05-24');

// ── Atomic decrease tiles (8 specs) ──────────────────────────────────
// Each tile's per-cell layout is derived from `decreaseSpanForOp(op).
// sourceOffsets` — symbol at `-min(offsets)`, every other cell is
// `'no-stitch'` source. This matches the host palette layouts
// (DEFAULT_KEY_PALETTE / INITIAL_KEY_PALETTE) cell-for-cell; see the
// reference table in `reference/knitlab/constants.ts:618`.
const KEY_K2TOG_SPEC: OperationSpec = decreaseTile('key_k2tog', 'k2tog', '2026-05-24');
const KEY_SSK_SPEC: OperationSpec = decreaseTile('key_ssk', 'ssk', '2026-05-23');
const KEY_SK2P_SPEC: OperationSpec = decreaseTile('key_sk2p', 'sk2p', '2026-05-24');
const KEY_K3TOG_SPEC: OperationSpec = decreaseTile('key_k3tog', 'k3tog', '2026-05-24');
const KEY_SSSK_SPEC: OperationSpec = decreaseTile('key_sssk', 'sssk', '2026-05-24');
const KEY_P2TOG_SPEC: OperationSpec = decreaseTile('key_p2tog', 'p2tog', '2026-05-24');
const KEY_P3TOG_SPEC: OperationSpec = decreaseTile('key_p3tog', 'p3tog', '2026-05-24');
const KEY_SSP_SPEC: OperationSpec = decreaseTile('key_ssp', 'ssp', '2026-05-24');
const KEY_SP2P_SPEC: OperationSpec = decreaseTile('key_sp2p', 'sp2p', '2026-05-29');
const KEY_SSSP_SPEC: OperationSpec = decreaseTile('key_sssp', 'sssp', '2026-05-29');

// ── Single-cell ops (canonical cell semantics, 28 specs) ─────────────
// 1×1 keys with footprint op = semanticOp. The legacy single-cell
// projection branch reports `opForKey(keyDef)` directly and ignores
// any per-cell `cells[0][0].op` override — `singleCellOp(op)` mirrors
// that exactly. Shifts (1×1 with op='shift-1-l' / 'shift-1-r') round-
// trip identically: legacy reports the shift op, spec reports the
// shift op, and the walker still inspects `keyId` for its rack-and-
// xfer dispatch.

// Knit variants (color swatches + kniterate)
const KEY_KNIT_DEFAULT_SPEC: OperationSpec = singleCellOp('key_knit_default', 'knit', '2026-05-24');
const KEY_KNITERATE_KNIT_SPEC: OperationSpec = singleCellOp('key_kniterate_knit', 'knit', '2026-05-24');
const KEY_COLOR_SILVER_SPEC: OperationSpec = singleCellOp('key_color_silver', 'knit', '2026-05-24');
const KEY_COLOR_STONE_SPEC: OperationSpec = singleCellOp('key_color_stone', 'knit', '2026-05-24');
const KEY_COLOR_MOSS_SPEC: OperationSpec = singleCellOp('key_color_moss', 'knit', '2026-05-24');
const KEY_COLOR_GRAPHITE_SPEC: OperationSpec = singleCellOp('key_color_graphite', 'knit', '2026-05-24');
const KEY_COLOR_WHITE_SPEC: OperationSpec = singleCellOp('key_color_white', 'knit', '2026-05-27');
const KEY_COLOR_RED_SPEC: OperationSpec = singleCellOp('key_color_red', 'knit', '2026-05-29');
const KEY_COLOR_GOLD_SPEC: OperationSpec = singleCellOp('key_color_gold', 'knit', '2026-05-29');
const KEY_COLOR_TEAL_SPEC: OperationSpec = singleCellOp('key_color_teal', 'knit', '2026-05-29');
const KEY_COLOR_NAVY_SPEC: OperationSpec = singleCellOp('key_color_navy', 'knit', '2026-05-29');

// Traveling i-cord path marker. The painted cell's op is inert ('knit')
// to the stockinette walker — the dedicated i-cord compile route
// (src/knitout/compile/icord-chart.ts) traces these cells into the cord
// choreography. The spec exists so the zero-orphan palette gate passes.
const KEY_ICORD_SPEC: OperationSpec = singleCellOp('key_icord', 'knit', '2026-05-30');
// Shaped-tube body cell — inert 'knit' to the stockinette walker; the
// tube compile route (src/knitout/compile/tube-chart.ts) reads the
// painted outline into a width schedule. Spec exists for the gate.
const KEY_TUBE_KNIT_SPEC: OperationSpec = singleCellOp('key_tube_knit', 'knit', '2026-05-30');
// Faithful Sophie leaf stamp — inert 'knit' to the stockinette walker; the
// dedicated route (src/knitout/compile/sophie-leaf-chart.ts) emits the exact
// captured Sophie choreography as direct `.kc`. Spec exists for the gate.
const KEY_SOPHIE_LEAF_SPEC: OperationSpec = singleCellOp('key_sophie_leaf', 'knit', '2026-05-31');

// Purl + no-stitch + yarn-over
const KEY_PURL_DEFAULT_SPEC: OperationSpec = singleCellOp('key_purl_default', 'purl', '2026-05-24');
const KEY_EMPTY_SPEC: OperationSpec = singleCellOp('key_empty_no_stitch', 'no-stitch', '2026-05-24');
const KEY_YARN_OVER_SPEC: OperationSpec = singleCellOp('key_yarn_over', 'yarn-over', '2026-05-24');

// Tuck variants
const KEY_TUCK_SPEC: OperationSpec = singleCellOp('key_tuck', 'tuck', '2026-05-24');
const KEY_KNITERATE_TUCK_SPEC: OperationSpec = singleCellOp('key_kniterate_tuck', 'tuck', '2026-05-24');
// B-1 brioche (2026-06-09): back-bed tuck.
const KEY_TUCK_BACK_SPEC: OperationSpec = singleCellOp('key_tuck_back', 'tuck-back', '2026-06-09');

// Slip stitches
const KEY_SL_WYIF_SPEC: OperationSpec = singleCellOp('key_sl_wyif', 'sl-wyif', '2026-05-24');
const KEY_SL_WYIB_SPEC: OperationSpec = singleCellOp('key_sl_wyib', 'sl-wyib', '2026-05-24');

// Through-back-loop + front-and-back
const KEY_K_TBL_SPEC: OperationSpec = singleCellOp('key_k_tbl', 'k-tbl', '2026-05-24');
const KEY_P_TBL_SPEC: OperationSpec = singleCellOp('key_p_tbl', 'p-tbl', '2026-05-24');
const KEY_KFB_SPEC: OperationSpec = singleCellOp('key_kfb', 'kfb', '2026-05-24');
const KEY_PFB_SPEC: OperationSpec = singleCellOp('key_pfb', 'pfb', '2026-05-24');

// Below + bobble + multi-stitch increases
const KEY_KNIT_BELOW_SPEC: OperationSpec = singleCellOp('key_knit_below', 'knit-below', '2026-05-24');
const KEY_MB_SPEC: OperationSpec = singleCellOp('key_mb', 'mb', '2026-05-24');
const KEY_KPK_IN_1_SPEC: OperationSpec = singleCellOp('key_kpk_in_1', 'kpk-in-1', '2026-05-24');

// Make-1 family
const KEY_M1L_SPEC: OperationSpec = singleCellOp('key_m1l', 'm1l', '2026-05-24');
const KEY_M1R_SPEC: OperationSpec = singleCellOp('key_m1r', 'm1r', '2026-05-24');
const KEY_M1LP_SPEC: OperationSpec = singleCellOp('key_m1lp', 'm1lp', '2026-05-24');
const KEY_M1RP_SPEC: OperationSpec = singleCellOp('key_m1rp', 'm1rp', '2026-05-24');

// Purl-below + drop
const KEY_P1_BELOW_SPEC: OperationSpec = singleCellOp('key_p1_below', 'p1-below', '2026-05-24');
const KEY_DROP_ST_SPEC: OperationSpec = singleCellOp('key_drop_st', 'drop-st', '2026-05-24');

// Shifts (1×1 destination markers — the walker still inspects keyId
// to fire shift dispatch; the spec reports the shift op verbatim to
// match the legacy single-cell projection branch). NO new metadata
// needed: the rack-lineage stays as a walker concern.
const KEY_SHIFT_1_L_SPEC: OperationSpec = singleCellOp('key_shift_1_l', 'shift-1-l', '2026-05-24');
const KEY_SHIFT_1_R_SPEC: OperationSpec = singleCellOp('key_shift_1_r', 'shift-1-r', '2026-05-24');

// Machine annotation keys (Milestone B, 2026-05-26). These palette entries
// activate annotation tools (RackPlus/Minus, WrapTurnLeft/Right) rather than
// placing cell ops — the knitout walker never processes these as stitch cells.
// Registered here so the no-orphan palette gate passes.
const KEY_RACK_PLUS_1_SPEC: OperationSpec = singleCellOp('key_rack_plus_1', 'rack-plus-1', '2026-05-26');
const KEY_RACK_MINUS_1_SPEC: OperationSpec = singleCellOp('key_rack_minus_1', 'rack-minus-1', '2026-05-26');
const KEY_WT_LEFT_SPEC: OperationSpec = singleCellOp('key_wt_left', 'wt-left', '2026-05-26');
const KEY_WT_RIGHT_SPEC: OperationSpec = singleCellOp('key_wt_right', 'wt-right', '2026-05-26');
const KEY_PAUSE_SPEC: OperationSpec = singleCellOp('key_pause', 'pause', '2026-05-26');

// ── Decorative multi-cell tiles (3 specs, #41c) ──────────────────────
// Visual texture tiles with per-cell `op` overrides. Host palette
// declares these with `op: 'knit'` (footprint op) plus per-cell op
// patterns. `decorativeTile` produces role='result' for every cell,
// matching what the legacy multi-cell projection branch does for a
// non-decrease footprint op (no sourceMask). The k2tog cell in the
// eyelet tile stays `role: 'result'` (visual texture), NOT
// `'source'` — see `decorativeTile` doc.
const KEY_TILE_TUCK_RIB_2X2_SPEC: OperationSpec = decorativeTile(
  'key_tile_tuck_rib_2x2',
  [
    ['knit', 'tuck'],
    ['tuck', 'knit'],
  ],
  '2026-05-24',
);
const KEY_TILE_WAFFLE_2X2_SPEC: OperationSpec = decorativeTile(
  'key_tile_waffle_2x2',
  [
    ['tuck', 'knit'],
    ['knit', 'tuck'],
  ],
  '2026-05-24',
);
const KEY_TILE_EYELET_2X2_SPEC: OperationSpec = decorativeTile(
  'key_tile_eyelet_2x2',
  [
    ['k2tog', 'yarn-over'],
    ['knit', 'knit'],
  ],
  '2026-05-24',
);

const REGISTRY: Map<string, OperationSpec> = new Map([
  // Cables — symmetric front/back
  [CABLE_2F_SPEC.id, CABLE_2F_SPEC],
  [CABLE_2B_SPEC.id, CABLE_2B_SPEC],
  [CABLE_2F_TALL_SPEC.id, CABLE_2F_TALL_SPEC],
  [CABLE_2B_TALL_SPEC.id, CABLE_2B_TALL_SPEC],
  [CABLE_4F_SPEC.id, CABLE_4F_SPEC],
  [CABLE_4B_SPEC.id, CABLE_4B_SPEC],
  [CABLE_6F_SPEC.id, CABLE_6F_SPEC],
  [CABLE_6B_SPEC.id, CABLE_6B_SPEC],
  [CABLE_8F_SPEC.id, CABLE_8F_SPEC],
  [CABLE_8B_SPEC.id, CABLE_8B_SPEC],
  // Travellers
  [LT_SPEC.id, LT_SPEC],
  [RT_SPEC.id, RT_SPEC],
  // Cables-over-purl
  [LPC_1_1_SPEC.id, LPC_1_1_SPEC],
  [LPC_1_2_SPEC.id, LPC_1_2_SPEC],
  [LPC_2_1_SPEC.id, LPC_2_1_SPEC],
  [RPC_1_1_SPEC.id, RPC_1_1_SPEC],
  [RPC_1_2_SPEC.id, RPC_1_2_SPEC],
  [RPC_2_1_SPEC.id, RPC_2_1_SPEC],
  // Atomic decrease tiles
  [KEY_K2TOG_SPEC.id, KEY_K2TOG_SPEC],
  [KEY_SSK_SPEC.id, KEY_SSK_SPEC],
  [KEY_SK2P_SPEC.id, KEY_SK2P_SPEC],
  [KEY_K3TOG_SPEC.id, KEY_K3TOG_SPEC],
  [KEY_SSSK_SPEC.id, KEY_SSSK_SPEC],
  [KEY_P2TOG_SPEC.id, KEY_P2TOG_SPEC],
  [KEY_P3TOG_SPEC.id, KEY_P3TOG_SPEC],
  [KEY_SSP_SPEC.id, KEY_SSP_SPEC],
  [KEY_SP2P_SPEC.id, KEY_SP2P_SPEC],
  [KEY_SSSP_SPEC.id, KEY_SSSP_SPEC],
  // Single-cell knit + color variants
  [KEY_KNIT_DEFAULT_SPEC.id, KEY_KNIT_DEFAULT_SPEC],
  [KEY_KNITERATE_KNIT_SPEC.id, KEY_KNITERATE_KNIT_SPEC],
  [KEY_COLOR_SILVER_SPEC.id, KEY_COLOR_SILVER_SPEC],
  [KEY_COLOR_STONE_SPEC.id, KEY_COLOR_STONE_SPEC],
  [KEY_COLOR_MOSS_SPEC.id, KEY_COLOR_MOSS_SPEC],
  [KEY_COLOR_GRAPHITE_SPEC.id, KEY_COLOR_GRAPHITE_SPEC],
  [KEY_COLOR_WHITE_SPEC.id, KEY_COLOR_WHITE_SPEC],
  [KEY_COLOR_RED_SPEC.id, KEY_COLOR_RED_SPEC],
  [KEY_COLOR_GOLD_SPEC.id, KEY_COLOR_GOLD_SPEC],
  [KEY_COLOR_TEAL_SPEC.id, KEY_COLOR_TEAL_SPEC],
  [KEY_COLOR_NAVY_SPEC.id, KEY_COLOR_NAVY_SPEC],
  // Traveling i-cord path marker
  [KEY_ICORD_SPEC.id, KEY_ICORD_SPEC],
  [KEY_TUBE_KNIT_SPEC.id, KEY_TUBE_KNIT_SPEC],
  [KEY_SOPHIE_LEAF_SPEC.id, KEY_SOPHIE_LEAF_SPEC],
  // Single-cell purl + no-stitch + yarn-over
  [KEY_PURL_DEFAULT_SPEC.id, KEY_PURL_DEFAULT_SPEC],
  [KEY_EMPTY_SPEC.id, KEY_EMPTY_SPEC],
  [KEY_YARN_OVER_SPEC.id, KEY_YARN_OVER_SPEC],
  // Single-cell tuck
  [KEY_TUCK_SPEC.id, KEY_TUCK_SPEC],
  [KEY_KNITERATE_TUCK_SPEC.id, KEY_KNITERATE_TUCK_SPEC],
  [KEY_TUCK_BACK_SPEC.id, KEY_TUCK_BACK_SPEC],
  // Single-cell slip + tbl + fb
  [KEY_SL_WYIF_SPEC.id, KEY_SL_WYIF_SPEC],
  [KEY_SL_WYIB_SPEC.id, KEY_SL_WYIB_SPEC],
  [KEY_K_TBL_SPEC.id, KEY_K_TBL_SPEC],
  [KEY_P_TBL_SPEC.id, KEY_P_TBL_SPEC],
  [KEY_KFB_SPEC.id, KEY_KFB_SPEC],
  [KEY_PFB_SPEC.id, KEY_PFB_SPEC],
  // Single-cell below + bobble + multi-stitch increases
  [KEY_KNIT_BELOW_SPEC.id, KEY_KNIT_BELOW_SPEC],
  [KEY_MB_SPEC.id, KEY_MB_SPEC],
  [KEY_KPK_IN_1_SPEC.id, KEY_KPK_IN_1_SPEC],
  // Single-cell make-1 family
  [KEY_M1L_SPEC.id, KEY_M1L_SPEC],
  [KEY_M1R_SPEC.id, KEY_M1R_SPEC],
  [KEY_M1LP_SPEC.id, KEY_M1LP_SPEC],
  [KEY_M1RP_SPEC.id, KEY_M1RP_SPEC],
  // Single-cell purl-below + drop
  [KEY_P1_BELOW_SPEC.id, KEY_P1_BELOW_SPEC],
  [KEY_DROP_ST_SPEC.id, KEY_DROP_ST_SPEC],
  // Single-cell shifts
  [KEY_SHIFT_1_L_SPEC.id, KEY_SHIFT_1_L_SPEC],
  [KEY_SHIFT_1_R_SPEC.id, KEY_SHIFT_1_R_SPEC],
  // Machine annotation keys
  [KEY_RACK_PLUS_1_SPEC.id, KEY_RACK_PLUS_1_SPEC],
  [KEY_RACK_MINUS_1_SPEC.id, KEY_RACK_MINUS_1_SPEC],
  [KEY_WT_LEFT_SPEC.id, KEY_WT_LEFT_SPEC],
  [KEY_WT_RIGHT_SPEC.id, KEY_WT_RIGHT_SPEC],
  [KEY_PAUSE_SPEC.id, KEY_PAUSE_SPEC],
  // Decorative multi-cell tiles
  [KEY_TILE_TUCK_RIB_2X2_SPEC.id, KEY_TILE_TUCK_RIB_2X2_SPEC],
  [KEY_TILE_WAFFLE_2X2_SPEC.id, KEY_TILE_WAFFLE_2X2_SPEC],
  [KEY_TILE_EYELET_2X2_SPEC.id, KEY_TILE_EYELET_2X2_SPEC],
]);

/** Returns the spec for a given key id, or `undefined` if the key is
 *  not yet ported. Callers fall back to the legacy derivation when
 *  the result is `undefined`. */
export function specForKeyId(id: string): OperationSpec | undefined {
  return REGISTRY.get(id);
}

/** All registered spec ids, for coverage-gate enforcement and
 *  introspection. Sorted for stable test output. */
export function registeredSpecIds(): readonly string[] {
  return [...REGISTRY.keys()].sort();
}

/** Iterate all registered specs. */
export function registeredSpecs(): readonly OperationSpec[] {
  return [...REGISTRY.values()];
}
