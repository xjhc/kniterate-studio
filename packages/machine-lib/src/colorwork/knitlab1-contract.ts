/**
 * knitlab1 host/library contract.
 *
 * Canonical primitive semantics are exported from `src/primitives/`.
 * Mirrored knitlab1 shapes and palette constants below track the subset of
 * `reference/knitlab/{types,constants}.ts` that the knitlab2 library needs.
 * knitlab1 lives outside this package's tsconfig rootDir, so build-time imports
 * from reference/ are avoided; test/reference/knitlab-palette-contract.test.ts
 * guards the mirrored built-in palette against drift.
 */

import type { KnitOp } from '../primitives/knit-op.js';
export {
  KNIT_PRIMITIVES,
  KNIT_OPS,
  isKnitOp,
  opForKey,
  primitiveForOp,
  decreaseSpanForOp,
  isOpOfferedForSurface,
  isOpValidForSurface,
} from '../primitives/knit-op.js';
export type { DecreaseSpan, KnitOp, KnitSurface, KnitPrimitiveDefinition } from '../primitives/knit-op.js';

// ---- Mirrored knitlab1 types (reference/knitlab/types.ts) -----------------

export interface KnitlabPoint {
  x: number;
  y: number;
}

export interface KnitlabKeyInstance {
  anchor: KnitlabPoint;
  keyId: string;
}

export interface KnitlabKeyCellContent {
  type: 'svg' | 'text';
  value: string;
  /**
   * B1 (2026-05-20): semantic fabric op for this specific cell inside a
   * multi-cell key. Optional; when absent, consumers fall back to the
   * footprint-level `KnitlabKeyDefinition.op` (which itself falls back
   * to 'knit'). Enables 2×2 texture tiles to carry distinct per-cell
   * ops — e.g. tuck-rib, brioche — without splitting them into 1×1 keys.
   *
   * Read via `ResolvedChartProjection.cellAt(r, c).semanticOp`
   * (`src/chart-core/projection.ts`), while `ResolvedChart.cells` stays
   * keyId-only for identity/color-binding consumers.
   */
  op?: KnitlabKnitOp;
}

export type KnitlabKnitOp = KnitOp;

export interface KnitlabCableSpan {
  width: number;
  /**
   * v2 (Batch D Phase 0 §0.2, 2026-05-22): worked-side stitch count for
   * asymmetric cables / cables-over-purl-background. Optional — when
   * omitted, consumers default to `floor(width / 2)` to match the
   * symmetric C2/4/6/8 legacy shape. When present, `workedWidth +
   * purlWidth === width` must hold.
   */
  workedWidth?: number;
  /**
   * v2 (Batch D Phase 0 §0.2, 2026-05-22): purl-background stitch count
   * paired with `workedWidth`. Optional with the same default as above.
   */
  purlWidth?: number;
  direction: 'front' | 'back';
  crossRow?: number;
}

export interface KnitlabKeyDefinition {
  id: string;
  name: string;
  abbreviation?: string | null;
  width: number;
  height: number;
  backgroundColor: string;
  symbolColor: string;
  cells?: (KnitlabKeyCellContent | null)[][];
  /**
   * Colorwork block (2026-06-08): per-cell background colors for a
   * multi-cell color key (`key_color_block_*`), indexed [row][col] over
   * the height × width footprint. Each entry is a `#hex`/rgb() string or
   * `null` (fall back to `backgroundColor`, i.e. leave as background).
   * `knitlab1-import` resolves a placed block's per-cell color from this
   * so a fair-isle/punchcard repeat lowers to real per-stitch colors.
   * See `reference/knitlab/types.ts` KeyDefinition.colorCells.
   */
  colorCells?: (string | null)[][];
  /** Semantic fabric op. Optional for backward-compat with custom keys;
   *  consumers default to 'knit'. */
  op?: KnitlabKnitOp;
  /**
   * B2a (2026-05-20): cable-cross marker. See `reference/knitlab/types.ts`
   * KeyDefinition.cableSpan for the full justification. Used by the
   * chart-to-FabricIR analyzer to emit `cable-cross` row events.
   */
  cableSpan?: KnitlabCableSpan;
  /**
   * Structural-soundness goal (2026-05-23): lateral-shift tile descriptor.
   * `count` is the shift distance (= number of stitches involved).
   * `direction` is which way the loops move. `destOffset` is the column
   * offset within the tile where the destination starts (cells before it
   * are source no-stitch placeholders the tile owns).
   *
   * `shiftEventsFromChart` reads this to compute `destStartCol =
   * anchor.x + destOffset`. See `reference/knitlab/types.ts`
   * KeyDefinition.shiftSpan for the full justification.
   */
  shiftSpan?: { count: number; direction: 'left' | 'right'; destOffset: number };
  /**
   * Slot classification for yarn-carrier allocation (2026-05-27).
   * Answers the wizard's question "does this key create its own physical
   * yarn-carrier row?":
   *  - 'own-yarn'  — a color/yarn slot. Decrement available carriers.
   *                  Knit-default + named colors. Custom user-painted
   *                  colors should also use this.
   *  - 'base-yarn' — rides the active yarn. Decreases, increases, purls,
   *                  cables, slips, tucks, YO, shift tiles, texture tiles.
   *                  Not a yarn slot.
   *  - 'none'      — neither yarn nor a stitch op. No-stitch placeholders
   *                  and machine annotations (rack, wrap-and-turn, pause).
   * When undefined, callers fall back to `op === 'knit'` (or undefined) →
   * 'own-yarn' so legacy custom keys keep auto-binding.
   */
  yarnSlotRole?: 'own-yarn' | 'base-yarn' | 'none';
}

/**
 * Two-channel model (2026-05-27): each sheet has exactly two layers,
 * one carrying structural ops (knit/purl/k2tog/cables/…) and one
 * carrying colorwork. Layers without `kind` default to 'structure'
 * for backward-compat with legacy single-layer charts; the host
 * load path migrates them to two channels on open.
 */
export type KnitlabLayerKind = 'structure' | 'color';

export interface KnitlabLayer {
  id: string;
  name: string;
  isVisible: boolean;
  /** Channel kind. Absent on legacy single-layer charts; treated as
   *  'structure' by the projection. */
  kind?: KnitlabLayerKind;
  grid: Record<string, unknown>;
  keyPlacements: KnitlabKeyInstance[];
}

export type KnitlabChartAnnotationSource = 'generated' | 'user';
export type KnitlabChartEdgeSide = 'left' | 'right' | 'top' | 'bottom';

interface KnitlabChartAnnotationBase {
  id: string;
  source?: KnitlabChartAnnotationSource;
  locked?: boolean;
  label?: string;
}

export interface KnitlabChartCellAnnotation extends KnitlabChartAnnotationBase {
  kind: 'short-row-turn' | 'cell-technique' | 'buttonhole';
  anchor: { scope: 'cell'; row: number; col: number };
  turnMethod?: 'wrap-and-turn' | 'german' | 'shadow' | 'unspecified';
  direction?: 'left' | 'right';
  technique?: string;
  stitches?: number;
}

export interface KnitlabChartRowAnnotation extends KnitlabChartAnnotationBase {
  kind: 'carrier-set' | 'pause' | 'racking' | 'short-row-resolve' | 'row-note' | 'stitch-number';
  anchor: { scope: 'row'; row: number };
  carriers?: string[];
  racking?: number;
  /** Machine stitch number (tension) this row knits at, for
   *  `kind: 'stitch-number'`. Sticky: the walker holds it until a later
   *  row changes it. Integer 0–35 (the machine's single-token domain). */
  stitchNumber?: number;
  text?: string;
}

export interface KnitlabChartEdgeAnnotation extends KnitlabChartAnnotationBase {
  kind: 'cast-on-span' | 'bind-off-span' | 'hold-span' | 'edge-pickup';
  anchor: {
    scope: 'edge';
    row: number;
    // left/right are panel edges. For bind-off spans, top/bottom mark an
    // interior horizontal opening such as a crew-neck center bind-off; they
    // are not a full panel-top/panel-bottom boundary annotation.
    side: KnitlabChartEdgeSide;
    start: number;
    end: number;
  };
  method?: string;
  locationKind?: string;
}

export interface KnitlabChartSheetAnnotation extends KnitlabChartAnnotationBase {
  kind: 'gauge-zone' | 'sheet-default-bed' | 'dbj-backing' | 'trim-region';
  anchor: { scope: 'sheet' };
  gaugeZoneId?: string;
  bed?: 'front' | 'back' | 'auto';
  /**
   * B4 (2026-05-20): DBJ back-bed strategy. `'birdseye'`, `'twill'`,
   * and `'striped'` lower through the generic birdseye-backed walker.
   * `'full'` is the Customist-style full-back DBJ choreography used by
   * `reference/dbj.kc`. `'complement'` (Campaign 4, 2026-06-13) is the
   * two-color inverse-image lining the captured reference sweater uses
   * (`reference/front.kc` / `back.kc` / `sleeves.kc`): each carrier knits
   * its color on the front bed and the complement on the back bed in a
   * single pass (2 passes/row, rack 0).
   *
   * When this annotation is present on a multi-color chart, it OVERRIDES
   * the export panel's `backBedStyle` default — encoded chart intent
   * trumps user-toggled UI state because the chart was authored with
   * this specific backing in mind.
   */
  dbjStrategy?: 'birdseye' | 'twill' | 'striped' | 'full' | 'complement';
  /**
   * Slice 1.5 (2026-05-21): trim-region row band. Marks a contiguous
   * range of chart-display rows that carry hem / cuff / neck trim cells
   * (rib-1x1, rib-2x2). Used by:
   *   - chart-track-a validator: exempts purl cells in this band from
   *     `track-a-shape-overrides-unsupported`.
   *   - stockinette-shaped walker: routes those rows through the
   *     back-bed knit lowering so rib actually appears as purls on the
   *     front face.
   * Inclusive on both ends. Authored in chart-display coords (row 0 =
   * top of the chart, matching the knitlab1 canvas).
   */
  trimRegion?: { startRow: number; endRow: number };
}

export interface KnitlabChartPieceAnnotation extends KnitlabChartAnnotationBase {
  kind: 'piece-origin' | 'piece-terminus';
  anchor: { scope: 'piece'; pieceId: string };
  boundaryKind?: string;
}

export type KnitlabChartAnnotation =
  | KnitlabChartCellAnnotation
  | KnitlabChartRowAnnotation
  | KnitlabChartEdgeAnnotation
  | KnitlabChartSheetAnnotation
  | KnitlabChartPieceAnnotation;

export interface KnitlabChartPackageAnnotation extends KnitlabChartAnnotationBase {
  kind: 'join-order' | 'assembly-note' | 'carrier-allocation' | 'piece-transition';
  anchor: { scope: 'package'; packageId?: string };
  pieceIds?: string[];
  text?: string;
  carriers?: Record<string, string>;
  transitionKind?: 'split' | 'merge' | 'pick-up' | 'seam' | 'graft';
  sources?: string[];
  targets?: string[];
  stitchFlow?: Array<{ from?: string; to?: string; stitches: number }>;
}

export interface KnitlabChartDisplaySettings {
  rowCountVisibility: 'none' | 'left' | 'right' | 'both' | 'alternating-left' | 'alternating-right';
  colCountVisibility: 'none' | 'top' | 'bottom' | 'both';
}

export type KnitlabOrientation = 'bottom-up' | 'top-down' | 'left-right' | 'in-the-round';

export type KnitlabGarmentPanelId = 'front' | 'back' | 'left-sleeve' | 'right-sleeve';

export interface KnitlabSheetGroup {
  id: string;
  name: string;
  color?: string;
}

export interface KnitlabChartState {
  id: string;
  rows: number;
  cols: number;
  orientation: KnitlabOrientation;
  name: string;
  displaySettings: KnitlabChartDisplaySettings;
  layers: KnitlabLayer[];
  activeLayerId: string | null;
  groupId?: string | null;
  panelOrigin?: KnitlabGarmentPanelId;
  /** Opaque persistence slot for the Kniterate wizard's saved settings.
   *  Round-trips through the knitlab1 serializer (Phase 0a). The wizard
   *  owns the schema; the serializer treats it as `unknown`. See
   *  docs/knitlab1-kniterate-export-plan.md §8 + §13. */
  kniterateConfig?: unknown;
  /** Typed non-cell facts attached to this chart sheet. Package-level
   *  annotations live on KnitlabApplicationState.packageAnnotations. */
  annotations?: KnitlabChartAnnotation[];
}

export type KnitlabPaletteMode = 'colorwork' | 'hand-knit' | 'kniterate';

export interface KnitlabApplicationState {
  sheets: KnitlabChartState[];
  groups: KnitlabSheetGroup[];
  activeSheetId: string | null;
  keyPalette: KnitlabKeyDefinition[];
  /** Active palette mode (Colorwork / Hand knit / Kniterate). Absent on
   *  legacy payloads → consumer treats as 'colorwork'. */
  paletteMode?: KnitlabPaletteMode;
  packageAnnotations?: KnitlabChartPackageAnnotation[];
}

// ---- Mirrored palette IDs/defaults (reference/knitlab/constants.ts) --------

export const KEY_ID_EMPTY = 'key_empty_no_stitch';
export const KEY_ID_KNIT_DEFAULT = 'key_knit_default';
export const KEY_ID_KNITERATE_KNIT = 'key_kniterate_knit';
export const KEY_ID_PURL_DEFAULT = 'key_purl_default';
export const KEY_ID_COLOR_SILVER = 'key_color_silver';
export const KEY_ID_COLOR_STONE = 'key_color_stone';
export const KEY_ID_COLOR_MOSS = 'key_color_moss';
export const KEY_ID_COLOR_GRAPHITE = 'key_color_graphite';
// 2026-05-29: saturated starter colors so colorwork mode opens with hues,
// not just heathered neutrals. own-yarn (each claims a carrier on export).
export const KEY_ID_COLOR_RED = 'key_color_red';
export const KEY_ID_COLOR_GOLD = 'key_color_gold';
export const KEY_ID_COLOR_TEAL = 'key_color_teal';
export const KEY_ID_COLOR_NAVY = 'key_color_navy';
// Legacy built-in white swatch. Colorwork no longer uses this as a
// "no color" sentinel; the color channel's default/clear color is
// KEY_ID_KNIT_DEFAULT, presented to users as Natural.
export const KEY_ID_COLOR_WHITE = 'key_color_white';
export const KEY_ID_TUCK = 'key_tuck';
export const KEY_ID_KNITERATE_TUCK = 'key_kniterate_tuck';
// B-1 brioche (2026-06-09): back-bed tuck.
export const KEY_ID_TUCK_BACK = 'key_tuck_back';
export const KEY_ID_YARN_OVER = 'key_yarn_over';
export const KEY_ID_K2TOG = 'key_k2tog';
export const KEY_ID_SSK = 'key_ssk';
// 2026-05-21: decorative double decreases mirror.
export const KEY_ID_SK2P = 'key_sk2p';
export const KEY_ID_K3TOG = 'key_k3tog';
export const KEY_ID_SSSK = 'key_sssk';
// 2026-05-21 Batch A: Japanese-chart palette expansion mirror — purl
// decreases (shape-relevant) + slip-with-yarn-position (decorative, hand-knit
// only). Mirrors KEY_ID_P2TOG / P3TOG / SL_WYIF / SL_WYIB in knitlab1
// constants.ts. See [[project-palette-expansion-japanese-symbols]] memory.
export const KEY_ID_P2TOG = 'key_p2tog';
export const KEY_ID_P3TOG = 'key_p3tog';
// 2026-05-29: purl double-decrease mirrors completing the family — SP2P
// (centered, mirrors SK2P) and SSSP (left-leaning, mirrors SSSK). SSP (the
// 2-st left-leaning purl dec, mirror of SSK) already exists at KEY_ID_SSP.
export const KEY_ID_SP2P = 'key_sp2p';
export const KEY_ID_SSSP = 'key_sssp';
export const KEY_ID_SL_WYIF = 'key_sl_wyif';
export const KEY_ID_SL_WYIB = 'key_sl_wyib';
// 2026-05-21 Batch B mirror: twisted stitches (hand-knit only, 0Δ) +
// classic single increases (kniterate-eligible, +1).
export const KEY_ID_K_TBL = 'key_k_tbl';
export const KEY_ID_P_TBL = 'key_p_tbl';
export const KEY_ID_KFB = 'key_kfb';
export const KEY_ID_PFB = 'key_pfb';
// 2026-05-21 Batch C mirror: textural primitives. Hand-knit only; machine
// lowering for brioche / bobble / cluster choreography isn't modeled yet.
export const KEY_ID_KNIT_BELOW = 'key_knit_below';
export const KEY_ID_MB = 'key_mb';
export const KEY_ID_KPK_IN_1 = 'key_kpk_in_1';
export const KEY_ID_M1L = 'key_m1l';
export const KEY_ID_M1R = 'key_m1r';
// B2a (2026-05-20): one-row cable tiles. Visual = line primitives; semantic
// = cableSpan { width, direction, crossRow }. Mirrors keys in knitlab1's
// INITIAL_KEY_PALETTE (reference/knitlab/constants.ts).
export const KEY_ID_CABLE_2F = 'key_cable_2_front';
export const KEY_ID_CABLE_2B = 'key_cable_2_back';
// B3 (2026-05-20): wider cable + texture tile mirrors. See knitlab1 constants.ts.
export const KEY_ID_CABLE_2F_TALL = 'key_cable_2_front_tall';
export const KEY_ID_CABLE_2B_TALL = 'key_cable_2_back_tall';
export const KEY_ID_CABLE_4F = 'key_cable_4_front';
export const KEY_ID_CABLE_4B = 'key_cable_4_back';
export const KEY_ID_CABLE_6F = 'key_cable_6_front';
export const KEY_ID_CABLE_6B = 'key_cable_6_back';
export const KEY_ID_CABLE_8F = 'key_cable_8_front';
export const KEY_ID_CABLE_8B = 'key_cable_8_back';
export const KEY_ID_TILE_TUCK_RIB_2X2 = 'key_tile_tuck_rib_2x2';
export const KEY_ID_TILE_WAFFLE_2X2 = 'key_tile_waffle_2x2';
export const KEY_ID_TILE_EYELET_2X2 = 'key_tile_eyelet_2x2';
// Batch D Phase 1 (2026-05-22): traveller + cable-over-purl mirrors.
export const KEY_ID_LT = 'key_lt';
export const KEY_ID_RT = 'key_rt';
export const KEY_ID_LPC_1_1 = 'key_lpc_1_1';
export const KEY_ID_LPC_1_2 = 'key_lpc_1_2';
export const KEY_ID_LPC_2_1 = 'key_lpc_2_1';
export const KEY_ID_RPC_1_1 = 'key_rpc_1_1';
export const KEY_ID_RPC_1_2 = 'key_rpc_1_2';
export const KEY_ID_RPC_2_1 = 'key_rpc_2_1';
// Structural-soundness goal (2026-05-23): fully-fashioned lateral shift,
// per-stitch primitive. 1-cell destination marker; paint path auto-adds
// KEY_ID_EMPTY at the source column one knitting-prev row over. Adjacent
// shift-1 cells compose into wider rack-dances via shift-events-from-chart.
export const KEY_ID_SHIFT_1_L = 'key_shift_1_l';
export const KEY_ID_SHIFT_1_R = 'key_shift_1_r';
// Traveling i-cord. Painted cells form the cord's path; the dedicated
// i-cord compile route traces them and emits the knit-round + travel
// choreography (src/knitout/passes/icord.ts). Identified by keyId
// (op stays 'knit' so existing exhaustive KnitOp switches are untouched).
export const KEY_ID_ICORD = 'key_icord';
// Shaped tube (e.g. a knitted leaf — reference/sophie.kc). Painted cells
// form the tube outline; per-row width = the tube width that round, with
// the rightmost column the fixed spine edge. The tube compile route reads
// the outline into a width schedule and emits the full-bed ping-pong tube
// (src/knitout/passes/shaped-tube.ts). op stays 'knit' (keyId-identified).
export const KEY_ID_TUBE_KNIT = 'key_tube_knit';
// Faithful Sophie leaf stamp (2026-05-31). Unlike the generic shaped tube
// (`KEY_ID_TUBE_KNIT`), this exports the EXACT captured Sophie choreography
// (reference/sophie.kc) via a direct-`.kc` renderer that bypasses the vendor
// transfer scheduler (src/knitout/compile/sophie-leaf-chart.ts +
// src/knitout/sophie/). A fixed validated template, not a parameterized leaf:
// its painted footprint is a placeholder/trigger; the output is always Sophie.
// op stays 'knit' (keyId-identified, inert to the stockinette walker).
export const KEY_ID_SOPHIE_LEAF = 'key_sophie_leaf';
// Batch D Phase 3 (2026-05-22): purl-symmetry + drop mirrors.
export const KEY_ID_M1LP = 'key_m1lp';
export const KEY_ID_M1RP = 'key_m1rp';
export const KEY_ID_SSP = 'key_ssp';
export const KEY_ID_P1_BELOW = 'key_p1_below';
export const KEY_ID_DROP_ST = 'key_drop_st';
// Milestone B (2026-05-26): machine annotation keys. These palette entries set
// the annotation tool when clicked (via App.tsx routing) rather than placing a
// cell. Included here so DEFAULT_KEY_PALETTE is the structural SoT and the
// no-orphan spec gate passes.
export const KEY_ID_RACK_PLUS_1 = 'key_rack_plus_1';
export const KEY_ID_RACK_MINUS_1 = 'key_rack_minus_1';
export const KEY_ID_WT_LEFT = 'key_wt_left';
export const KEY_ID_WT_RIGHT = 'key_wt_right';
export const KEY_ID_PAUSE = 'key_pause';

const DEFAULT_STITCH_COLOR_LIGHT = '#1F2937';
const DEFAULT_STITCH_COLOR_DARK = '#E5E7EB';
// Structure/knitting keys carry NO opaque fill of their own — they defer to
// the theme's empty-cell background, so a colorwork color (which wins in the
// cell-fill pass) shows through and the cell never reads as a gray tile.
const THEME_DEFAULT_BACKGROUND_SENTINEL = 'theme_default_background';
// No-stitch is the one exception: it is NOT a live stitch, so it carries an
// opaque medium-gray fill that clearly reads as empty/no-knit against the
// near-white knit cell (a colorwork color must NOT show through a hole). The
// old `transparent_grid_bg` sentinel resolved to the grid-line gray (#D1D5DB),
// too faint to distinguish from knit — so a garment panel's silhouette
// vanished. A literal, darker gray keeps the knit-vs-no-knit mask legible.
const NO_STITCH_BACKGROUND = '#9CA3AF';
const ABBREVIATION_SKIP_SENTINEL = '__ABBR_SKIP__';

export const DEFAULT_KEY_PALETTE: KnitlabKeyDefinition[] = [
  {
    id: KEY_ID_KNIT_DEFAULT,
    name: 'Knit',
    abbreviation: 'K',
    width: 1,
    height: 1,
    backgroundColor: THEME_DEFAULT_BACKGROUND_SENTINEL,
    symbolColor: DEFAULT_STITCH_COLOR_LIGHT,
    cells: [[null]],
    op: 'knit',
    yarnSlotRole: 'own-yarn',
  },
  {
    id: KEY_ID_KNITERATE_KNIT,
    name: 'Knit',
    abbreviation: 'K',
    width: 1,
    height: 1,
    backgroundColor: THEME_DEFAULT_BACKGROUND_SENTINEL,
    symbolColor: DEFAULT_STITCH_COLOR_LIGHT,
    cells: [[{ type: 'text', value: '|' }]],
    op: 'knit',
    yarnSlotRole: 'own-yarn',
  },
  {
    id: KEY_ID_COLOR_SILVER,
    name: 'Silver',
    abbreviation: 'S',
    width: 1,
    height: 1,
    backgroundColor: '#C9CED3',
    symbolColor: DEFAULT_STITCH_COLOR_LIGHT,
    cells: [[null]],
    op: 'knit',
    yarnSlotRole: 'own-yarn',
  },
  {
    id: KEY_ID_COLOR_STONE,
    name: 'Stone',
    abbreviation: 'T',
    width: 1,
    height: 1,
    backgroundColor: '#8D8377',
    symbolColor: DEFAULT_STITCH_COLOR_LIGHT,
    cells: [[null]],
    op: 'knit',
    yarnSlotRole: 'own-yarn',
  },
  {
    id: KEY_ID_COLOR_MOSS,
    name: 'Moss',
    abbreviation: 'M',
    width: 1,
    height: 1,
    backgroundColor: '#68756A',
    symbolColor: DEFAULT_STITCH_COLOR_LIGHT,
    cells: [[null]],
    op: 'knit',
    yarnSlotRole: 'own-yarn',
  },
  {
    id: KEY_ID_COLOR_GRAPHITE,
    name: 'Graphite',
    abbreviation: 'G',
    width: 1,
    height: 1,
    backgroundColor: '#2F3437',
    symbolColor: DEFAULT_STITCH_COLOR_DARK,
    cells: [[null]],
    op: 'knit',
    yarnSlotRole: 'own-yarn',
  },
  {
    id: KEY_ID_COLOR_WHITE,
    name: 'White',
    abbreviation: 'W',
    width: 1,
    height: 1,
    backgroundColor: '#FFFFFF',
    symbolColor: DEFAULT_STITCH_COLOR_LIGHT,
    cells: [[null]],
    op: 'knit',
    yarnSlotRole: 'own-yarn',
  },
  {
    id: KEY_ID_COLOR_RED,
    name: 'Red',
    abbreviation: 'R',
    width: 1,
    height: 1,
    backgroundColor: '#C0392B',
    symbolColor: DEFAULT_STITCH_COLOR_DARK,
    cells: [[null]],
    op: 'knit',
    yarnSlotRole: 'own-yarn',
  },
  {
    id: KEY_ID_COLOR_GOLD,
    name: 'Gold',
    abbreviation: 'Gd',
    width: 1,
    height: 1,
    backgroundColor: '#E1A92A',
    symbolColor: DEFAULT_STITCH_COLOR_LIGHT,
    cells: [[null]],
    op: 'knit',
    yarnSlotRole: 'own-yarn',
  },
  {
    id: KEY_ID_COLOR_TEAL,
    name: 'Teal',
    abbreviation: 'Tl',
    width: 1,
    height: 1,
    backgroundColor: '#2E8B82',
    symbolColor: DEFAULT_STITCH_COLOR_DARK,
    cells: [[null]],
    op: 'knit',
    yarnSlotRole: 'own-yarn',
  },
  {
    id: KEY_ID_COLOR_NAVY,
    name: 'Navy',
    abbreviation: 'Nv',
    width: 1,
    height: 1,
    backgroundColor: '#2C3E66',
    symbolColor: DEFAULT_STITCH_COLOR_DARK,
    cells: [[null]],
    op: 'knit',
    yarnSlotRole: 'own-yarn',
  },
  {
    id: KEY_ID_PURL_DEFAULT,
    name: 'Purl',
    abbreviation: 'P',
    width: 1,
    height: 1,
    backgroundColor: THEME_DEFAULT_BACKGROUND_SENTINEL,
    symbolColor: DEFAULT_STITCH_COLOR_LIGHT,
    cells: [[{ type: 'svg', value: 'purl' }]],
    op: 'purl',
    yarnSlotRole: 'base-yarn',
  },
  {
    id: KEY_ID_EMPTY,
    name: 'No Stitch',
    abbreviation: ABBREVIATION_SKIP_SENTINEL,
    width: 1,
    height: 1,
    backgroundColor: NO_STITCH_BACKGROUND,
    symbolColor: DEFAULT_STITCH_COLOR_LIGHT,
    cells: [[null]],
    op: 'no-stitch',
    yarnSlotRole: 'none',
  },
  {
    id: KEY_ID_YARN_OVER,
    name: 'Yarn over',
    abbreviation: 'YO',
    width: 1,
    height: 1,
    backgroundColor: THEME_DEFAULT_BACKGROUND_SENTINEL,
    symbolColor: DEFAULT_STITCH_COLOR_LIGHT,
    cells: [[{ type: 'text', value: '○' }]],
    op: 'yarn-over',
    yarnSlotRole: 'base-yarn',
  },
  {
    id: KEY_ID_TUCK,
    name: 'Tuck',
    abbreviation: 'Tk',
    width: 1,
    height: 1,
    backgroundColor: THEME_DEFAULT_BACKGROUND_SENTINEL,
    symbolColor: DEFAULT_STITCH_COLOR_LIGHT,
    cells: [[{ type: 'text', value: '∩' }]],
    op: 'tuck',
    yarnSlotRole: 'base-yarn',
  },
  {
    id: KEY_ID_KNITERATE_TUCK,
    name: 'Tuck',
    abbreviation: 'Tk',
    width: 1,
    height: 1,
    backgroundColor: THEME_DEFAULT_BACKGROUND_SENTINEL,
    symbolColor: DEFAULT_STITCH_COLOR_LIGHT,
    cells: [[{ type: 'text', value: '∩' }]],
    op: 'tuck',
    yarnSlotRole: 'base-yarn',
  },
  // B-1 brioche (2026-06-09): back-bed twin of tuck — tucks the column's
  // held back-bed loop (machine brioche / half-cardigan rows). Doubled
  // arc glyph distinguishes it from the front tuck's single ∩.
  {
    id: KEY_ID_TUCK_BACK,
    name: 'Tuck (back bed)',
    abbreviation: 'TkB',
    width: 1,
    height: 1,
    backgroundColor: THEME_DEFAULT_BACKGROUND_SENTINEL,
    symbolColor: DEFAULT_STITCH_COLOR_LIGHT,
    cells: [[{ type: 'text', value: '⋒' }]],
    op: 'tuck-back',
    yarnSlotRole: 'base-yarn',
  },
  // Structural-soundness goal (2026-05-23): shaping decreases are atomic
  // multi-cell tiles that own their source no-stitch cells via per-cell
  // op overrides. See KeyDefinition.cells in reference/knitlab/constants.ts
  // for the per-key offset/symbol layout. The engine mirror omits
  // clickAnchorOffset (it's a UI-only field).
  {
    id: KEY_ID_K2TOG,
    name: 'K2tog',
    abbreviation: 'k2tog',
    width: 2,
    height: 1,
    backgroundColor: THEME_DEFAULT_BACKGROUND_SENTINEL,
    symbolColor: DEFAULT_STITCH_COLOR_LIGHT,
    cells: [[
      { type: 'svg', value: 'k2tog' },
      { type: 'text', value: '·', op: 'no-stitch' },
    ]],
    op: 'k2tog',
    yarnSlotRole: 'base-yarn',
  },
  {
    id: KEY_ID_SSK,
    name: 'SSK',
    abbreviation: 'ssk',
    width: 2,
    height: 1,
    backgroundColor: THEME_DEFAULT_BACKGROUND_SENTINEL,
    symbolColor: DEFAULT_STITCH_COLOR_LIGHT,
    cells: [[
      { type: 'text', value: '·', op: 'no-stitch' },
      { type: 'svg', value: 'ssk' },
    ]],
    op: 'ssk',
    yarnSlotRole: 'base-yarn',
  },
  {
    id: KEY_ID_SK2P,
    name: 'SK2P (sl1-k2tog-psso)',
    abbreviation: 'sk2p',
    width: 3,
    height: 1,
    backgroundColor: THEME_DEFAULT_BACKGROUND_SENTINEL,
    symbolColor: DEFAULT_STITCH_COLOR_LIGHT,
    cells: [[
      { type: 'text', value: '·', op: 'no-stitch' },
      { type: 'svg', value: 'sk2p' },
      { type: 'text', value: '·', op: 'no-stitch' },
    ]],
    op: 'sk2p',
    yarnSlotRole: 'base-yarn',
  },
  {
    id: KEY_ID_K3TOG,
    name: 'K3tog (right-leaning double dec)',
    abbreviation: 'k3tog',
    width: 3,
    height: 1,
    backgroundColor: THEME_DEFAULT_BACKGROUND_SENTINEL,
    symbolColor: DEFAULT_STITCH_COLOR_LIGHT,
    cells: [[
      { type: 'text', value: '·', op: 'no-stitch' },
      { type: 'text', value: '·', op: 'no-stitch' },
      { type: 'svg', value: 'k3tog' },
    ]],
    op: 'k3tog',
    yarnSlotRole: 'base-yarn',
  },
  {
    id: KEY_ID_SSSK,
    name: 'SSSK (left-leaning double dec)',
    abbreviation: 'sssk',
    width: 3,
    height: 1,
    backgroundColor: THEME_DEFAULT_BACKGROUND_SENTINEL,
    symbolColor: DEFAULT_STITCH_COLOR_LIGHT,
    cells: [[
      { type: 'svg', value: 'sssk' },
      { type: 'text', value: '·', op: 'no-stitch' },
      { type: 'text', value: '·', op: 'no-stitch' },
    ]],
    op: 'sssk',
    yarnSlotRole: 'base-yarn',
  },
  {
    id: KEY_ID_P2TOG,
    name: 'P2tog (purl 2 together)',
    abbreviation: 'p2tog',
    width: 2,
    height: 1,
    backgroundColor: THEME_DEFAULT_BACKGROUND_SENTINEL,
    symbolColor: DEFAULT_STITCH_COLOR_LIGHT,
    cells: [[
      { type: 'svg', value: 'p2tog' },
      { type: 'text', value: '·', op: 'no-stitch' },
    ]],
    op: 'p2tog',
    yarnSlotRole: 'base-yarn',
  },
  {
    id: KEY_ID_P3TOG,
    name: 'P3tog (purl 3 together)',
    abbreviation: 'p3tog',
    width: 3,
    height: 1,
    backgroundColor: THEME_DEFAULT_BACKGROUND_SENTINEL,
    symbolColor: DEFAULT_STITCH_COLOR_LIGHT,
    cells: [[
      { type: 'text', value: '·', op: 'no-stitch' },
      { type: 'text', value: '·', op: 'no-stitch' },
      { type: 'svg', value: 'p3tog' },
    ]],
    op: 'p3tog',
    yarnSlotRole: 'base-yarn',
  },
  {
    // 2026-05-29: centered purl double dec (mirror of SK2P). Glyph centered,
    // no-stitch dots flank it — same geometry as SK2P.
    id: KEY_ID_SP2P,
    name: 'SP2P (centered purl double dec)',
    abbreviation: 'sp2p',
    width: 3,
    height: 1,
    backgroundColor: THEME_DEFAULT_BACKGROUND_SENTINEL,
    symbolColor: DEFAULT_STITCH_COLOR_LIGHT,
    cells: [[
      { type: 'text', value: '·', op: 'no-stitch' },
      { type: 'svg', value: 'sp2p' },
      { type: 'text', value: '·', op: 'no-stitch' },
    ]],
    op: 'sp2p',
    yarnSlotRole: 'base-yarn',
  },
  {
    // 2026-05-29: left-leaning purl double dec (mirror of SSSK). Glyph at the
    // left, no-stitch dots trail right — same geometry as SSSK.
    id: KEY_ID_SSSP,
    name: 'SSSP (left-leaning purl double dec)',
    abbreviation: 'sssp',
    width: 3,
    height: 1,
    backgroundColor: THEME_DEFAULT_BACKGROUND_SENTINEL,
    symbolColor: DEFAULT_STITCH_COLOR_LIGHT,
    cells: [[
      { type: 'svg', value: 'sssp' },
      { type: 'text', value: '·', op: 'no-stitch' },
      { type: 'text', value: '·', op: 'no-stitch' },
    ]],
    op: 'sssp',
    yarnSlotRole: 'base-yarn',
  },
  {
    id: KEY_ID_SL_WYIF,
    name: 'Slip 1 wyif',
    abbreviation: 'sl wyif',
    width: 1,
    height: 1,
    backgroundColor: THEME_DEFAULT_BACKGROUND_SENTINEL,
    symbolColor: DEFAULT_STITCH_COLOR_LIGHT,
    cells: [[{ type: 'svg', value: 'sl-wyif' }]],
    op: 'sl-wyif',
    yarnSlotRole: 'base-yarn',
  },
  {
    id: KEY_ID_SL_WYIB,
    name: 'Slip 1 wyib',
    abbreviation: 'sl wyib',
    width: 1,
    height: 1,
    backgroundColor: THEME_DEFAULT_BACKGROUND_SENTINEL,
    symbolColor: DEFAULT_STITCH_COLOR_LIGHT,
    cells: [[{ type: 'svg', value: 'sl-wyib' }]],
    op: 'sl-wyib',
    yarnSlotRole: 'base-yarn',
  },
  {
    id: KEY_ID_K_TBL,
    name: 'K-tbl (knit through back loop)',
    abbreviation: 'k tbl',
    width: 1,
    height: 1,
    backgroundColor: THEME_DEFAULT_BACKGROUND_SENTINEL,
    symbolColor: DEFAULT_STITCH_COLOR_LIGHT,
    cells: [[{ type: 'svg', value: 'k-tbl' }]],
    op: 'k-tbl',
    yarnSlotRole: 'base-yarn',
  },
  {
    id: KEY_ID_P_TBL,
    name: 'P-tbl (purl through back loop)',
    abbreviation: 'p tbl',
    width: 1,
    height: 1,
    backgroundColor: THEME_DEFAULT_BACKGROUND_SENTINEL,
    symbolColor: DEFAULT_STITCH_COLOR_LIGHT,
    cells: [[{ type: 'svg', value: 'p-tbl' }]],
    op: 'p-tbl',
    yarnSlotRole: 'base-yarn',
  },
  {
    id: KEY_ID_KFB,
    name: 'Kfb (knit front and back)',
    abbreviation: 'kfb',
    width: 1,
    height: 1,
    backgroundColor: THEME_DEFAULT_BACKGROUND_SENTINEL,
    symbolColor: DEFAULT_STITCH_COLOR_LIGHT,
    cells: [[{ type: 'svg', value: 'kfb' }]],
    op: 'kfb',
    yarnSlotRole: 'base-yarn',
  },
  {
    id: KEY_ID_PFB,
    name: 'Pfb (purl front and back)',
    abbreviation: 'pfb',
    width: 1,
    height: 1,
    backgroundColor: THEME_DEFAULT_BACKGROUND_SENTINEL,
    symbolColor: DEFAULT_STITCH_COLOR_LIGHT,
    cells: [[{ type: 'svg', value: 'pfb' }]],
    op: 'pfb',
    yarnSlotRole: 'base-yarn',
  },
  {
    id: KEY_ID_KNIT_BELOW,
    name: 'Knit below (k1b)',
    abbreviation: 'k1b',
    width: 1,
    height: 1,
    backgroundColor: THEME_DEFAULT_BACKGROUND_SENTINEL,
    symbolColor: DEFAULT_STITCH_COLOR_LIGHT,
    cells: [[{ type: 'svg', value: 'knit-below' }]],
    op: 'knit-below',
    yarnSlotRole: 'base-yarn',
  },
  {
    id: KEY_ID_MB,
    name: 'Make bobble (MB)',
    abbreviation: 'MB',
    width: 1,
    height: 1,
    backgroundColor: THEME_DEFAULT_BACKGROUND_SENTINEL,
    symbolColor: DEFAULT_STITCH_COLOR_LIGHT,
    cells: [[{ type: 'svg', value: 'mb' }]],
    op: 'mb',
    yarnSlotRole: 'base-yarn',
  },
  {
    id: KEY_ID_KPK_IN_1,
    name: '(k1, p1, k1) in 1 st',
    abbreviation: 'kpk',
    width: 1,
    height: 1,
    backgroundColor: THEME_DEFAULT_BACKGROUND_SENTINEL,
    symbolColor: DEFAULT_STITCH_COLOR_LIGHT,
    cells: [[{ type: 'svg', value: 'kpk-in-1' }]],
    op: 'kpk-in-1',
    yarnSlotRole: 'base-yarn',
  },
  {
    id: KEY_ID_M1L,
    name: 'M1L',
    abbreviation: 'm1l',
    width: 1,
    height: 1,
    backgroundColor: THEME_DEFAULT_BACKGROUND_SENTINEL,
    symbolColor: DEFAULT_STITCH_COLOR_LIGHT,
    cells: [[{ type: 'svg', value: 'm1l' }]],
    op: 'm1l',
    yarnSlotRole: 'base-yarn',
  },
  {
    id: KEY_ID_M1R,
    name: 'M1R',
    abbreviation: 'm1r',
    width: 1,
    height: 1,
    backgroundColor: THEME_DEFAULT_BACKGROUND_SENTINEL,
    symbolColor: DEFAULT_STITCH_COLOR_LIGHT,
    cells: [[{ type: 'svg', value: 'm1r' }]],
    op: 'm1r',
    yarnSlotRole: 'base-yarn',
  },
  {
    id: KEY_ID_CABLE_2F,
    name: 'Cable 2-front (C2F)',
    abbreviation: 'C2F',
    width: 2,
    height: 1,
    backgroundColor: THEME_DEFAULT_BACKGROUND_SENTINEL,
    symbolColor: DEFAULT_STITCH_COLOR_LIGHT,
    cells: [[{ type: 'text', value: '' }, { type: 'text', value: '' }]],
    op: 'knit',
    yarnSlotRole: 'base-yarn',
    cableSpan: { width: 2, direction: 'front', crossRow: 0 },
  },
  {
    id: KEY_ID_CABLE_2B,
    name: 'Cable 2-back (C2B)',
    abbreviation: 'C2B',
    width: 2,
    height: 1,
    backgroundColor: THEME_DEFAULT_BACKGROUND_SENTINEL,
    symbolColor: DEFAULT_STITCH_COLOR_LIGHT,
    cells: [[{ type: 'text', value: '' }, { type: 'text', value: '' }]],
    op: 'knit',
    yarnSlotRole: 'base-yarn',
    cableSpan: { width: 2, direction: 'back', crossRow: 0 },
  },
  // B3 (2026-05-20): wider cable + texture tile mirrors. See knitlab1
  // constants.ts for full visual line definitions; the contract palette
  // omits `lines` (knitlab2-side consumers don't need them — they work
  // off `cableSpan` for cables and `cells[r][c].op` for textures).
  {
    id: KEY_ID_CABLE_2F_TALL,
    name: 'Cable 2-front tall (C2F, 4-row repeat)',
    abbreviation: 'C2F·4',
    width: 2,
    height: 4,
    backgroundColor: THEME_DEFAULT_BACKGROUND_SENTINEL,
    symbolColor: DEFAULT_STITCH_COLOR_LIGHT,
    op: 'knit',
    yarnSlotRole: 'base-yarn',
    cableSpan: { width: 2, direction: 'front', crossRow: 0 },
  },
  {
    id: KEY_ID_CABLE_2B_TALL,
    name: 'Cable 2-back tall (C2B, 4-row repeat)',
    abbreviation: 'C2B·4',
    width: 2,
    height: 4,
    backgroundColor: THEME_DEFAULT_BACKGROUND_SENTINEL,
    symbolColor: DEFAULT_STITCH_COLOR_LIGHT,
    op: 'knit',
    yarnSlotRole: 'base-yarn',
    cableSpan: { width: 2, direction: 'back', crossRow: 0 },
  },
  {
    id: KEY_ID_CABLE_4F,
    name: 'Cable 4-front (C4F)',
    abbreviation: 'C4F',
    width: 4,
    height: 1,
    backgroundColor: THEME_DEFAULT_BACKGROUND_SENTINEL,
    symbolColor: DEFAULT_STITCH_COLOR_LIGHT,
    op: 'knit',
    yarnSlotRole: 'base-yarn',
    cableSpan: { width: 4, direction: 'front', crossRow: 0 },
  },
  {
    id: KEY_ID_CABLE_4B,
    name: 'Cable 4-back (C4B)',
    abbreviation: 'C4B',
    width: 4,
    height: 1,
    backgroundColor: THEME_DEFAULT_BACKGROUND_SENTINEL,
    symbolColor: DEFAULT_STITCH_COLOR_LIGHT,
    op: 'knit',
    yarnSlotRole: 'base-yarn',
    cableSpan: { width: 4, direction: 'back', crossRow: 0 },
  },
  {
    id: KEY_ID_CABLE_6F,
    name: 'Cable 6-front (C6F)',
    abbreviation: 'C6F',
    width: 6,
    height: 1,
    backgroundColor: THEME_DEFAULT_BACKGROUND_SENTINEL,
    symbolColor: DEFAULT_STITCH_COLOR_LIGHT,
    op: 'knit',
    yarnSlotRole: 'base-yarn',
    cableSpan: { width: 6, direction: 'front', crossRow: 0 },
  },
  {
    id: KEY_ID_CABLE_6B,
    name: 'Cable 6-back (C6B)',
    abbreviation: 'C6B',
    width: 6,
    height: 1,
    backgroundColor: THEME_DEFAULT_BACKGROUND_SENTINEL,
    symbolColor: DEFAULT_STITCH_COLOR_LIGHT,
    op: 'knit',
    yarnSlotRole: 'base-yarn',
    cableSpan: { width: 6, direction: 'back', crossRow: 0 },
  },
  {
    id: KEY_ID_CABLE_8F,
    name: 'Cable 8-front (C8F)',
    abbreviation: 'C8F',
    width: 8,
    height: 1,
    backgroundColor: THEME_DEFAULT_BACKGROUND_SENTINEL,
    symbolColor: DEFAULT_STITCH_COLOR_LIGHT,
    op: 'knit',
    yarnSlotRole: 'base-yarn',
    cableSpan: { width: 8, direction: 'front', crossRow: 0 },
  },
  {
    id: KEY_ID_CABLE_8B,
    name: 'Cable 8-back (C8B)',
    abbreviation: 'C8B',
    width: 8,
    height: 1,
    backgroundColor: THEME_DEFAULT_BACKGROUND_SENTINEL,
    symbolColor: DEFAULT_STITCH_COLOR_LIGHT,
    op: 'knit',
    yarnSlotRole: 'base-yarn',
    cableSpan: { width: 8, direction: 'back', crossRow: 0 },
  },
  // Batch D Phase 1 (2026-05-22): traveller + cables-over-purl mirrors.
  // The reference-app key palette carries the SVG `lines` for visual
  // rendering; the engine-side mirror only needs the semantic shape
  // (op + cableSpan + per-cell op for purl-bg detection).
  {
    id: KEY_ID_LT,
    name: 'LT (1×1 left twist)',
    abbreviation: 'LT',
    width: 2,
    height: 1,
    backgroundColor: THEME_DEFAULT_BACKGROUND_SENTINEL,
    symbolColor: DEFAULT_STITCH_COLOR_LIGHT,
    op: 'lt',
    yarnSlotRole: 'base-yarn',
    cableSpan: { width: 2, workedWidth: 1, purlWidth: 1, direction: 'front', crossRow: 0 },
  },
  {
    id: KEY_ID_RT,
    name: 'RT (1×1 right twist)',
    abbreviation: 'RT',
    width: 2,
    height: 1,
    backgroundColor: THEME_DEFAULT_BACKGROUND_SENTINEL,
    symbolColor: DEFAULT_STITCH_COLOR_LIGHT,
    op: 'rt',
    yarnSlotRole: 'base-yarn',
    cableSpan: { width: 2, workedWidth: 1, purlWidth: 1, direction: 'back', crossRow: 0 },
  },
  // LPC/RPC cell layouts: POST-cross arrangement (worked stitch sits at
  // final post-cross position when the walker's knit pass reaches it).
  // Authors purl the right columns in the row BELOW the cable to
  // establish the pre-cross bed state. See the reference-app mirror
  // for the full rationale comment.
  {
    id: KEY_ID_LPC_1_1,
    name: 'LPC 1/1 (knit over purl, cross left)',
    abbreviation: 'LPC',
    width: 2,
    height: 1,
    backgroundColor: THEME_DEFAULT_BACKGROUND_SENTINEL,
    symbolColor: DEFAULT_STITCH_COLOR_LIGHT,
    cells: [[
      { type: 'text', value: '', op: 'knit' },
      { type: 'svg', value: 'purl', op: 'purl' },
    ]],
    op: 'lpc-1-1',
    yarnSlotRole: 'base-yarn',
    cableSpan: { width: 2, workedWidth: 1, purlWidth: 1, direction: 'front', crossRow: 0 },
  },
  {
    id: KEY_ID_LPC_1_2,
    name: 'LPC 1/2 (1 knit over 2 purls, cross left)',
    abbreviation: 'LPC',
    width: 3,
    height: 1,
    backgroundColor: THEME_DEFAULT_BACKGROUND_SENTINEL,
    symbolColor: DEFAULT_STITCH_COLOR_LIGHT,
    cells: [[
      { type: 'text', value: '', op: 'knit' },
      { type: 'svg', value: 'purl', op: 'purl' },
      { type: 'svg', value: 'purl', op: 'purl' },
    ]],
    op: 'lpc-1-2',
    yarnSlotRole: 'base-yarn',
    cableSpan: { width: 3, workedWidth: 1, purlWidth: 2, direction: 'front', crossRow: 0 },
  },
  {
    id: KEY_ID_LPC_2_1,
    name: 'LPC 2/1 (2 knits over 1 purl, cross left)',
    abbreviation: 'LPC',
    width: 3,
    height: 1,
    backgroundColor: THEME_DEFAULT_BACKGROUND_SENTINEL,
    symbolColor: DEFAULT_STITCH_COLOR_LIGHT,
    cells: [[
      { type: 'text', value: '', op: 'knit' },
      { type: 'text', value: '', op: 'knit' },
      { type: 'svg', value: 'purl', op: 'purl' },
    ]],
    op: 'lpc-2-1',
    yarnSlotRole: 'base-yarn',
    cableSpan: { width: 3, workedWidth: 2, purlWidth: 1, direction: 'front', crossRow: 0 },
  },
  {
    id: KEY_ID_RPC_1_1,
    name: 'RPC 1/1 (knit over purl, cross right)',
    abbreviation: 'RPC',
    width: 2,
    height: 1,
    backgroundColor: THEME_DEFAULT_BACKGROUND_SENTINEL,
    symbolColor: DEFAULT_STITCH_COLOR_LIGHT,
    cells: [[
      { type: 'svg', value: 'purl', op: 'purl' },
      { type: 'text', value: '', op: 'knit' },
    ]],
    op: 'rpc-1-1',
    yarnSlotRole: 'base-yarn',
    cableSpan: { width: 2, workedWidth: 1, purlWidth: 1, direction: 'back', crossRow: 0 },
  },
  {
    id: KEY_ID_RPC_1_2,
    name: 'RPC 1/2 (1 knit over 2 purls, cross right)',
    abbreviation: 'RPC',
    width: 3,
    height: 1,
    backgroundColor: THEME_DEFAULT_BACKGROUND_SENTINEL,
    symbolColor: DEFAULT_STITCH_COLOR_LIGHT,
    cells: [[
      { type: 'svg', value: 'purl', op: 'purl' },
      { type: 'svg', value: 'purl', op: 'purl' },
      { type: 'text', value: '', op: 'knit' },
    ]],
    op: 'rpc-1-2',
    yarnSlotRole: 'base-yarn',
    cableSpan: { width: 3, workedWidth: 1, purlWidth: 2, direction: 'back', crossRow: 0 },
  },
  {
    id: KEY_ID_RPC_2_1,
    name: 'RPC 2/1 (2 knits over 1 purl, cross right)',
    abbreviation: 'RPC',
    width: 3,
    height: 1,
    backgroundColor: THEME_DEFAULT_BACKGROUND_SENTINEL,
    symbolColor: DEFAULT_STITCH_COLOR_LIGHT,
    cells: [[
      { type: 'svg', value: 'purl', op: 'purl' },
      { type: 'text', value: '', op: 'knit' },
      { type: 'text', value: '', op: 'knit' },
    ]],
    op: 'rpc-2-1',
    yarnSlotRole: 'base-yarn',
    cableSpan: { width: 3, workedWidth: 2, purlWidth: 1, direction: 'back', crossRow: 0 },
  },
  // Fully-fashioned lateral shift, per-stitch primitive. Shifts are
  // 1-cell DESTINATION markers; the semantic op resolves to 'knit' (the
  // destination IS a knit stitch), the marker carries the rack-lineage
  // as metadata. The paint path in App.tsx auto-adds ONE KEY_ID_EMPTY
  // immediately past the source-side end of the run (right of an L run,
  // left of an R run), so each shift-1 click vacates exactly one source
  // column atomically. Runs of N adjacent shift-1-L (or -R) cells in a
  // row collapse into one rack-and-xfer dance via `shiftEventsFromChart`
  // that slides an N-stitch block by ONE column — the source-side dest
  // column ends up with a k2tog, the other N-1 stitches just ride along,
  // and exactly one column is vacated regardless of N. The walker
  // dispatch fires `emitLateralShift` BEFORE the row's knit pass.
  {
    id: KEY_ID_SHIFT_1_L,
    name: 'Shift 1 left (fully-fashioned)',
    abbreviation: 'sh1L',
    width: 1,
    height: 1,
    backgroundColor: THEME_DEFAULT_BACKGROUND_SENTINEL,
    symbolColor: DEFAULT_STITCH_COLOR_LIGHT,
    cells: [[{ type: 'text', value: '', op: 'knit' }]],
    op: 'shift-1-l',
    yarnSlotRole: 'base-yarn',
  },
  {
    id: KEY_ID_SHIFT_1_R,
    name: 'Shift 1 right (fully-fashioned)',
    abbreviation: 'sh1R',
    width: 1,
    height: 1,
    backgroundColor: THEME_DEFAULT_BACKGROUND_SENTINEL,
    symbolColor: DEFAULT_STITCH_COLOR_LIGHT,
    cells: [[{ type: 'text', value: '', op: 'knit' }]],
    op: 'shift-1-r',
    yarnSlotRole: 'base-yarn',
  },
  // Batch D Phase 3 (2026-05-22): purl-symmetry + drop mirrors. Engine-
  // side mirror omits the SVG `lines` (the reference-app palette carries
  // the visual glyph; consumers here only need the semantic op).
  {
    id: KEY_ID_M1LP,
    name: 'M1Lp (purl-face left-leaning make-1)',
    abbreviation: 'm1lp',
    width: 1,
    height: 1,
    backgroundColor: THEME_DEFAULT_BACKGROUND_SENTINEL,
    symbolColor: DEFAULT_STITCH_COLOR_LIGHT,
    cells: [[{ type: 'svg', value: 'm1lp' }]],
    op: 'm1lp',
    yarnSlotRole: 'base-yarn',
  },
  {
    id: KEY_ID_M1RP,
    name: 'M1Rp (purl-face right-leaning make-1)',
    abbreviation: 'm1rp',
    width: 1,
    height: 1,
    backgroundColor: THEME_DEFAULT_BACKGROUND_SENTINEL,
    symbolColor: DEFAULT_STITCH_COLOR_LIGHT,
    cells: [[{ type: 'svg', value: 'm1rp' }]],
    op: 'm1rp',
    yarnSlotRole: 'base-yarn',
  },
  {
    id: KEY_ID_SSP,
    name: 'SSP (left-leaning purl decrease)',
    abbreviation: 'ssp',
    width: 2,
    height: 1,
    backgroundColor: THEME_DEFAULT_BACKGROUND_SENTINEL,
    symbolColor: DEFAULT_STITCH_COLOR_LIGHT,
    cells: [[
      { type: 'text', value: '·', op: 'no-stitch' },
      { type: 'svg', value: 'ssp' },
    ]],
    op: 'ssp',
    yarnSlotRole: 'base-yarn',
  },
  {
    id: KEY_ID_P1_BELOW,
    name: 'P1-below (purl into stitch one row down)',
    abbreviation: 'p1b',
    width: 1,
    height: 1,
    backgroundColor: THEME_DEFAULT_BACKGROUND_SENTINEL,
    symbolColor: DEFAULT_STITCH_COLOR_LIGHT,
    cells: [[{ type: 'svg', value: 'p1-below' }]],
    op: 'p1-below',
    yarnSlotRole: 'base-yarn',
  },
  {
    id: KEY_ID_DROP_ST,
    name: 'Drop stitch',
    abbreviation: 'drop',
    width: 1,
    height: 1,
    backgroundColor: THEME_DEFAULT_BACKGROUND_SENTINEL,
    symbolColor: DEFAULT_STITCH_COLOR_LIGHT,
    cells: [[{ type: 'svg', value: 'drop-st' }]],
    op: 'drop-st',
    yarnSlotRole: 'base-yarn',
  },
  // Machine annotation keys (Milestone B, 2026-05-26). These are 1×1 palette
  // cells that, when clicked, set the annotation tool instead of Tool.Pen.
  // Ops are machine-specific slugs; the knitout walker never sees these as
  // cell placements — they drive row-gutter / stitch-level annotations.
  {
    id: KEY_ID_RACK_PLUS_1,
    name: 'Rack +1',
    abbreviation: 'R+1',
    width: 1,
    height: 1,
    backgroundColor: THEME_DEFAULT_BACKGROUND_SENTINEL,
    symbolColor: DEFAULT_STITCH_COLOR_LIGHT,
    cells: [[{ type: 'svg', value: 'rack-plus-1' }]],
    op: 'rack-plus-1',
    yarnSlotRole: 'none',
  },
  {
    id: KEY_ID_RACK_MINUS_1,
    name: 'Rack −1',
    abbreviation: 'R-1',
    width: 1,
    height: 1,
    backgroundColor: THEME_DEFAULT_BACKGROUND_SENTINEL,
    symbolColor: DEFAULT_STITCH_COLOR_LIGHT,
    cells: [[{ type: 'svg', value: 'rack-minus-1' }]],
    op: 'rack-minus-1',
    yarnSlotRole: 'none',
  },
  {
    id: KEY_ID_WT_LEFT,
    name: 'W&T left',
    abbreviation: 'WTL',
    width: 1,
    height: 1,
    backgroundColor: THEME_DEFAULT_BACKGROUND_SENTINEL,
    symbolColor: DEFAULT_STITCH_COLOR_LIGHT,
    cells: [[{ type: 'svg', value: 'wt-left' }]],
    op: 'wt-left',
    yarnSlotRole: 'none',
  },
  {
    id: KEY_ID_WT_RIGHT,
    name: 'W&T right',
    abbreviation: 'WTR',
    width: 1,
    height: 1,
    backgroundColor: THEME_DEFAULT_BACKGROUND_SENTINEL,
    symbolColor: DEFAULT_STITCH_COLOR_LIGHT,
    cells: [[{ type: 'svg', value: 'wt-right' }]],
    op: 'wt-right',
    yarnSlotRole: 'none',
  },
  {
    id: KEY_ID_PAUSE,
    name: 'Pause',
    abbreviation: '||',
    width: 1,
    height: 1,
    backgroundColor: THEME_DEFAULT_BACKGROUND_SENTINEL,
    symbolColor: DEFAULT_STITCH_COLOR_LIGHT,
    cells: [[{ type: 'svg', value: 'pause' }]],
    op: 'pause',
    yarnSlotRole: 'none',
  },
  {
    id: KEY_ID_TILE_TUCK_RIB_2X2,
    name: 'Tuck rib 2×2 (cardigan)',
    abbreviation: 'tk-rb',
    width: 2,
    height: 2,
    backgroundColor: THEME_DEFAULT_BACKGROUND_SENTINEL,
    symbolColor: DEFAULT_STITCH_COLOR_LIGHT,
    // Canonical glyphs (knit vertical bar, tuck ∩ arch) — not the letters
    // "K"/"Tk". svg cells also let withRefreshedBuiltInKeys() push the proper
    // symbols into already-restored sessions.
    cells: [
      [{ type: 'svg', value: 'knit', op: 'knit' }, { type: 'svg', value: 'tuck', op: 'tuck' }],
      [{ type: 'svg', value: 'tuck', op: 'tuck' }, { type: 'svg', value: 'knit', op: 'knit' }],
    ],
    op: 'knit',
    yarnSlotRole: 'base-yarn',
  },
  {
    id: KEY_ID_TILE_WAFFLE_2X2,
    name: 'Waffle 2×2',
    abbreviation: 'wfl',
    width: 2,
    height: 2,
    backgroundColor: THEME_DEFAULT_BACKGROUND_SENTINEL,
    symbolColor: DEFAULT_STITCH_COLOR_LIGHT,
    // Canonical glyphs (tuck ∩ arch, knit vertical bar) — not letters.
    cells: [
      [{ type: 'svg', value: 'tuck', op: 'tuck' }, { type: 'svg', value: 'knit', op: 'knit' }],
      [{ type: 'svg', value: 'knit', op: 'knit' }, { type: 'svg', value: 'tuck', op: 'tuck' }],
    ],
    op: 'knit',
    yarnSlotRole: 'base-yarn',
  },
  {
    id: KEY_ID_TILE_EYELET_2X2,
    name: 'Eyelet 2×2 (lace)',
    abbreviation: 'eyl',
    width: 2,
    height: 2,
    backgroundColor: THEME_DEFAULT_BACKGROUND_SENTINEL,
    symbolColor: DEFAULT_STITCH_COLOR_LIGHT,
    // Render every cell with its canonical SVG glyph (DEFAULT_STITCH_SYMBOLS)
    // so a placed eyelet reads as real stitches: the k2tog caret, the yo
    // circle, and the knit vertical bar — not ad-hoc "k2t" / "YO" / "K" text.
    // Texture tiles require a per-cell op on every cell, so knit carries an
    // explicit op (not a blank null). The text→svg type change also lets
    // withRefreshedBuiltInKeys() push the corrected glyphs into
    // already-restored sessions.
    cells: [
      [{ type: 'svg', value: 'k2tog', op: 'k2tog' }, { type: 'svg', value: 'yo', op: 'yarn-over' }],
      [{ type: 'svg', value: 'knit', op: 'knit' }, { type: 'svg', value: 'knit', op: 'knit' }],
    ],
    op: 'knit',
    yarnSlotRole: 'base-yarn',
  },
  // Traveling i-cord path marker. Each painted cell is one waypoint on
  // the cord's route; the i-cord compile route traces connected cells
  // into a knit-round + lateral-travel program. `op: 'knit'` keeps it
  // inert to the stockinette walker (the dedicated route handles it);
  // identified structurally by `id === KEY_ID_ICORD`.
  {
    id: KEY_ID_ICORD,
    name: 'I-cord (traveling)',
    abbreviation: 'icord',
    width: 1,
    height: 1,
    backgroundColor: THEME_DEFAULT_BACKGROUND_SENTINEL,
    symbolColor: DEFAULT_STITCH_COLOR_LIGHT,
    cells: [[{ type: 'text', value: '○', op: 'knit' }]],
    op: 'knit',
    yarnSlotRole: 'own-yarn',
  },
  // Shaped-tube body cell. Paint an outline (per-row width = tube width
  // that round; rightmost column = fixed spine edge); the tube compile
  // route reads the outline into a width schedule and emits the full-bed
  // ping-pong tube. `op: 'knit'` keeps it inert to the stockinette
  // walker; identified by `id === KEY_ID_TUBE_KNIT`.
  {
    id: KEY_ID_TUBE_KNIT,
    name: 'Shaped tube (leaf)',
    abbreviation: 'tube',
    width: 1,
    height: 1,
    backgroundColor: THEME_DEFAULT_BACKGROUND_SENTINEL,
    symbolColor: DEFAULT_STITCH_COLOR_LIGHT,
    cells: [[{ type: 'text', value: '◊', op: 'knit' }]],
    op: 'knit',
    yarnSlotRole: 'own-yarn',
  },
  // Faithful Sophie leaf stamp. Paint/insert this to export the EXACT captured
  // Sophie choreography via a direct-`.kc` renderer (it bypasses the vendor
  // transfer scheduler, which can't preserve sophie's sequential transport
  // walks). A fixed validated template — the painted footprint is a
  // placeholder/trigger; the export is always Sophie's leaf. For a custom leaf
  // use the generic `◊` shaped-tube key. Identified by `id === KEY_ID_SOPHIE_LEAF`.
  {
    id: KEY_ID_SOPHIE_LEAF,
    name: 'Sophie leaf (faithful)',
    abbreviation: 'sophie',
    width: 1,
    height: 1,
    backgroundColor: THEME_DEFAULT_BACKGROUND_SENTINEL,
    symbolColor: DEFAULT_STITCH_COLOR_LIGHT,
    cells: [[{ type: 'text', value: '❧', op: 'knit' }]],
    op: 'knit',
    yarnSlotRole: 'own-yarn',
  },
];
