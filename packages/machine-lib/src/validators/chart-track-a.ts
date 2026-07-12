/**
 * Track A (rectangular swatch compiler) chart-level validation.
 *
 * Runs BEFORE compilation against the resolved chart + binding spec.
 * Track A intentionally rejects features that belong in Track B:
 *
 *  - No-stitch cells (shape boundary — Track B has the right machinery)
 *  - Semantic ops that do not have a Kniterate lowering yet
 *  - 6 pattern colors without explicit experimental opt-in (drops draw)
 *
 * See docs/knitlab1-kniterate-export-plan.md §6.1 + §10.
 */

import {
  isKnitOp,
  isOpValidForSurface,
  opForKey,
  primitiveForOp,
  type KnitlabKeyDefinition,
  type KnitlabOrientation,
  type KnitOp,
} from '../colorwork/knitlab1-contract.js';
import {
  KNITERATE_NEEDLE_COUNT,
  MAX_PATTERN_COLORS_ADVANCED,
  MAX_PATTERN_COLORS_DEFAULT,
  MAX_PATTERN_COLORS_EXPERIMENTAL,
} from '../knitout/kniterate/constants.js';
import type { ResolvedChart } from '../knitout/passes/resolve-chart.js';
import type { ResolvedChartProjection } from '../chart-core/types.js';
import {
  chooseDispatch,
  shapeFromCableSpan,
  unsupportedCableReason,
  type CableShape,
} from '../chart-core/cable-registry.js';
import type { ValidationMessage } from './knitout-program.js';
import { validateTileConservation } from './tile-conservation.js';
import { detectShapedColorMode } from '../colorwork/shaped-color-mode.js';

const TRACK_A_SHAPE_OPS: ReadonlySet<KnitOp> = new Set([
  'k2tog', 'ssk', 'sk2p', 'k3tog', 'sssk', 'p2tog', 'ssp', 'sp2p', 'p3tog', 'sssp',
  'kfb', 'pfb', 'm1l', 'm1r', 'm1lp', 'm1rp',
]);
const TRACK_A_LOWERED_SHAPE_OPS: ReadonlySet<KnitOp> = new Set([
  'k2tog', 'ssk', 'sk2p', 'k3tog', 'sssk', 'p2tog', 'ssp', 'sp2p', 'p3tog', 'sssp',
  'kfb', 'pfb', 'm1l', 'm1r', 'm1lp', 'm1rp',
]);

export interface TrackAChartInput {
  /** Resolved chart in cells-only form. Used for **dimensions**
   *  (`.rows` / `.cols`), **warnings** plumbing, and **identity** reads
   *  (`usedKeyIds` enumeration, bound-key check, stitch-override
   *  membership). Per-cell **semantic** reads must go through `projection`
   *  below — `resolved.cells[r][c]` returns the parent keyId for an atomic
   *  decrease tile's source cell, which silently misses the no-stitch
   *  semantic. See `test/chart-core/forbidden-patterns.test.ts`. */
  resolved: ResolvedChart;
  /** Phase 1A Task #45 (2026-05-23): canonical per-cell semantic view of
   *  the same chart. The no-stitch counting loop reads through this so
   *  atomic-tile source cells (`ssk`'s ns-side, `k2tog`'s ns-side, etc.)
   *  count correctly as no-stitch instead of inheriting the parent op. */
  projection: ResolvedChartProjection;
  keyPalette: KnitlabKeyDefinition[];
  /** True when no-stitch/decrease cells are being handled by the Phase 3
   *  shaped-chart path instead of the older rectangular Track A path. */
  shapeMode?: boolean;
  /** keyId → carrier mapping for pattern colors. Does NOT include the
   *  reserved draw/waste carriers; those come from the machine spec. */
  patternColorKeyIds: string[];
  /** Optional set of keyIds bound to stitch-type overrides (purl, tuck,
   *  slip, pause, drop). These are valid in cells without a separate
   *  yarn binding because the override uses the dominant carrier. */
  stitchOverrideKeyIds?: string[];
  experimental6ColorMode: boolean;
  needleOffset: number;
  /** Chart orientation as authored in knitlab1. Track A walkers all
   *  iterate row 0 → rows-1 with row 0 = cast-on edge, i.e. they
   *  implicitly treat the chart as bottom-up. We warn (G16) when the
   *  chart is authored top-down / left-right / in-the-round so the user
   *  knows the compiler is reading their chart upside down or sideways. */
  orientation?: KnitlabOrientation;
  /** B4 (2026-05-20): chart-level sheet annotations including
   *  `dbj-backing` strategy and `short-row-turn` annotations. When
   *  provided, the validator checks for strategies the dual-bed walker
   *  can't yet lower and surfaces preview-grade turn-method warnings.
   *  Slice 1.5 (2026-05-21): also reads `trim-region` annotations to
   *  exempt purl cells in hem/cuff trim bands from the shape-overrides
   *  gate. Row indices in `trimRegion` MUST be in resolved-row coords
   *  (the caller in compile-chart maps from chart-display when the
   *  shape-mode reversal flips rows). */
  annotations?: ReadonlyArray<{
    kind: string;
    dbjStrategy?: string;
    turnMethod?: string;
    trimRegion?: { startRow: number; endRow: number };
  }>;
  /**
   * Batch D Phase 2 (2026-05-22): lateral-shift events. The no-stitch
   * cells under a shift's source columns are intentional vacancies —
   * the rack+xfer dance moved their loops elsewhere. The
   * `track-a-no-no-stitch` gate exempts those cells so a shift-only
   * (non-shape) chart compiles.
   */
  shiftEvents?: ReadonlyArray<{
    row: number;
    destStartCol: number;
    sourceStartCol: number;
    count: number;
  }>;
}

export function validateChartForTrackA(input: TrackAChartInput): ValidationMessage[] {
  const messages: ValidationMessage[] = [];
  const { resolved, patternColorKeyIds, experimental6ColorMode, needleOffset } = input;
  const stitchOverrideKeyIds = new Set(input.stitchOverrideKeyIds ?? []);
  const keyById = new Map(input.keyPalette.map(key => [key.id, key]));
  // chart-core/identity-read-ok: enumerating which keyIds appear on the
  // chart for downstream palette/binding gates. Not a semantic read.
  const usedKeyIds = new Set(resolved.cells.flat());

  // B1 (2026-05-20): tile-level stitch-conservation. Surfaces per-cell op
  // tiles (B1's KeyCellContent.op) that don't preserve panel width across
  // their footprint, plus tiles with no-stitch cells (intentional shaping
  // should be authored as placements, not tiles). Limited to keys actually
  // used in this chart so unused palette tiles don't spam the user.
  const usedKeyPalette = input.keyPalette.filter(k => usedKeyIds.has(k.id));
  messages.push(...validateTileConservation(usedKeyPalette, { onlyChecksPerCellTiles: true }));

  // B2a (2026-05-20): cable representation lands but transfer choreography
  // (B2b) is gated on Slice 2's conversion-status path.
  // B2b: width-2 cables shipped 2026-05-20. Widths 4/6/8 share the
  // generalized `emitCableCross` (cable-cross.ts).
  // Batch D Phase 1 (2026-05-22): asymmetric cables-over-purl land via
  // `emitAsymmetricCableCross`. Supported shapes: symmetric knit-over-knit
  // (widths 2/4/6/8 with workedWidth===purlWidth or omitted) AND purl-bg
  // cables at total width 2 (1/1) or 3 (1/2 or 2/1). The cell tile drives
  // the purl-bg dispatch via `cells[r][c].op === 'purl'`.
  // Phase 3 (#40b, 2026-05-24): rejection reasons come from the
  // cable registry's `unsupportedCableReason(shape)`, so the
  // validator's error message includes the same shape signature the
  // walker would throw with. The per-key reason is rendered as
  // `<id>: <shape signature>`, which makes the diagnostic
  // self-explanatory for new cable shapes that haven't been
  // documented in the suffix text yet.
  const cableRejections = usedKeyPalette
    .filter(k => k.cableSpan != null)
    .map(k => [k, cableShapeRejectionReason(k)] as const)
    .filter((pair): pair is readonly [KnitlabKeyDefinition, string] => pair[1] !== null);
  if (cableRejections.length > 0) {
    const perKey = cableRejections
      .map(([k, reason]) => `${k.id} (${reason})`)
      .sort()
      .join(', ');
    messages.push({
      severity: 'error',
      rule: 'track-a-cable-unsupported',
      message: `Chart uses ${cableRejections.length} cable key${cableRejections.length === 1 ? '' : 's'} whose shape isn't lowered yet: ${perKey}. Supported: symmetric C2/4/6/8 over knit bg, LT/RT 1×1, LPC/RPC at 1/1, 1/2, 2/1 ratios. Wider asymmetric cables need follow-up walker work.`,
    });
  }

  // Batch D shape-dispatch (2026-05-27): cables and lateral shifts are
  // now dispatched by `emitShapedStockinetteWalk` (the corresponding
  // `cableEvents` / `shiftEvents` params were added). The legacy gates
  // `track-a-cable-shape-mode-unsupported` /
  // `track-a-shift-shape-mode-unsupported` are retired here; the bed-
  // state simulator catches any column-overlap collision between a
  // shape op and a cable/shift on the same row downstream.

  // Short-row turn annotations: wrap-and-turn (and the unspecified default)
  // lower through the shape walker today; 'shadow' falls through as no-wrap;
  // 'german' surfaces as a preview-grade warning since the dance is just a
  // placeholder no-wrap shape (the real german move requires per-stitch
  // pull-up which isn't lowered yet).
  const shortRowTurns = (input.annotations ?? []).filter(a => a.kind === 'short-row-turn');
  for (const annotation of shortRowTurns) {
    const turnMethod = (annotation as { turnMethod?: string }).turnMethod;
    if (turnMethod === 'german') {
      messages.push({
        severity: 'warning',
        rule: 'track-a-short-row-german-preview',
        message: `Short-row turn uses turnMethod="german"; the Kniterate dance currently emits a preview-grade no-wrap placeholder. Swatch before committing to a full piece, or switch the annotation to "wrap-and-turn".`,
      });
    }
  }

  // B4 (2026-05-20): DBJ chart-level backing strategy. The generic
  // strategies — 'birdseye', 'twill', 'striped' — lower via the unified
  // `pushDbjBackPass` formula in jacquard-birdseye.ts. 'full' is the
  // Customist-style full-back DBJ reference path. 'complement' (Campaign 4,
  // 2026-06-13) is the two-color inverse-image lining the reference sweater
  // uses (jacquard-complement.ts).
  const SUPPORTED_DBJ_STRATEGIES = new Set(['birdseye', 'twill', 'striped', 'full', 'complement']);
  const dbjBackings = (input.annotations ?? []).filter(a => a.kind === 'dbj-backing');
  for (const annotation of dbjBackings) {
    const strategy = annotation.dbjStrategy;
    if (strategy === undefined) continue;
    if (!SUPPORTED_DBJ_STRATEGIES.has(strategy)) {
      messages.push({
        severity: 'error',
        rule: 'track-a-dbj-strategy-unsupported',
        message: `Chart annotation requests DBJ backing strategy '${strategy}', which is unknown. Supported strategies: ${[...SUPPORTED_DBJ_STRATEGIES].sort().join(', ')}.`,
      });
    }
  }
  const noStitchKeyIds = new Set<string>();
  const shapeOpKeyIds = new Set<string>();
  const unknownOpKeyIds = new Set<string>();
  const unsupportedOpKeyIds = new Set<string>();
  const unsupportedShapeOpKeyIds = new Set<string>();

  // 1. No-stitch cells are rejected in Track A.
  // Exempt no-stitch cells under a shift event's source column — they're
  // vacated by the rack+xfer dance, not shape-mode wedges. Per-stitch
  // shift-1 vacates exactly one source column regardless of run length.
  const shiftSourceExempt = new Set<string>();
  for (const event of input.shiftEvents ?? []) {
    shiftSourceExempt.add(`${event.row}:${event.sourceStartCol}`);
  }
  // Phase 1A Task #45 (2026-05-23): semantic no-stitch detection routes
  // through the projection so atomic-tile source cells (an `ssk`'s ns-side,
  // a `k2tog`'s ns-side, etc.) count as no-stitch even though
  // `resolved.cells[r][c]` reports the parent keyId. Reading the parent's
  // op via `opForKey(keyById.get(cell))` returned 'ssk' for those cells
  // and silently underfired this gate on non-shape-mode charts with
  // atomic decreases.
  let noStitchCount = 0;
  for (let r = 0; r < input.projection.rows; r++) {
    for (let c = 0; c < input.projection.cols; c++) {
      const projected = input.projection.cellAt(r, c);
      if (projected.semanticOp !== 'no-stitch') continue;
      if (shiftSourceExempt.has(`${r}:${c}`)) continue;
      noStitchCount += 1;
      noStitchKeyIds.add(projected.keyId);
    }
  }
  if (noStitchCount > 0 && input.shapeMode !== true) {
    messages.push({
      severity: 'error',
      rule: 'track-a-no-no-stitch',
      message: `Chart contains ${noStitchCount} no-stitch cell${noStitchCount === 1 ? '' : 's'}. The rectangular Track A path is for stockinette panels only; use the shape-aware compiler (garment export, or set shapeMode on the compile input) to lower no-stitch wedges + decrease cells.`,
    });
  }

  // 1b. Op capability gate. Track A lowers to Kniterate, so every used
  //     semantic op must have a Kniterate reading. This catches cases like
  //     yarn-over before they can silently compile as plain knit.
  for (const keyId of usedKeyIds) {
    if (noStitchKeyIds.has(keyId)) continue; // already reported above
    const key = keyById.get(keyId);
    const rawOp = (key as { op?: unknown } | undefined)?.op;
    if (rawOp !== undefined && !isKnitOp(rawOp)) {
      unknownOpKeyIds.add(keyId);
      continue;
    }
    const op = opForKey(key);
    if (TRACK_A_SHAPE_OPS.has(op)) {
      shapeOpKeyIds.add(keyId);
      if (input.shapeMode === true && TRACK_A_LOWERED_SHAPE_OPS.has(op)) continue;
      unsupportedShapeOpKeyIds.add(keyId);
      continue;
    }
    if (!isOpValidForSurface(op, 'kniterate')) {
      unsupportedOpKeyIds.add(keyId);
    }
  }
  if (unknownOpKeyIds.size > 0) {
    messages.push({
      severity: 'error',
      rule: 'track-a-unknown-op',
      message: `Chart uses ${unknownOpKeyIds.size} key${unknownOpKeyIds.size === 1 ? '' : 's'} with unknown semantic ops: ${[...unknownOpKeyIds].sort().join(', ')}. Choose a supported primitive before exporting to Kniterate.`,
    });
  }
  if (unsupportedOpKeyIds.size > 0) {
    const details = [...unsupportedOpKeyIds].sort().map(keyId => {
      const op = opForKey(keyById.get(keyId));
      return `${keyId} (${primitiveForOp(op).label})`;
    }).join(', ');
    messages.push({
      severity: 'error',
      rule: 'track-a-unsupported-op',
      message: `Chart uses ${unsupportedOpKeyIds.size} key${unsupportedOpKeyIds.size === 1 ? '' : 's'} whose semantic op cannot yet lower to Kniterate: ${details}.`,
    });
  }
  if (unsupportedShapeOpKeyIds.size > 0) {
    const details = [...unsupportedShapeOpKeyIds].sort().map(keyId => {
      const op = opForKey(keyById.get(keyId));
      return `${keyId} (${primitiveForOp(op).label})`;
    }).join(', ');
    messages.push({
      severity: 'error',
      rule: 'track-a-shape-op-unsupported',
      message: `Chart uses ${unsupportedShapeOpKeyIds.size} shape primitive key${unsupportedShapeOpKeyIds.size === 1 ? '' : 's'} that Track A cannot lower to Kniterate yet: ${details}. Shape primitives need the Phase 3 chart-continuity analyzer and decrease lowering first.`,
    });
  }

  // 2. Pattern color count vs. mode
  const colorCount = patternColorKeyIds.length;
  // B5 (2026-05-20): classify the chart's color mode whenever there's
  // more than one bound pattern color. Used by the shape-mode preview-
  // grade warnings below. The jacquard-overrides gate further down
  // (B1.5, 2026-05-27; widened for E2E-3, 2026-06-10) scopes its
  // trim-region purl exemption per-row instead: any shape-mode trim row
  // that is color-uniform can lower its purls through the shaped
  // walker's single-carrier path, regardless of the chart-level mode.
  const colorAnalysis = colorCount > 1
    ? detectShapedColorMode({ resolved, patternColorKeyIds: new Set(patternColorKeyIds) })
    : null;
  if (input.shapeMode === true && colorAnalysis) {
    // Single-color was never gated here (colorCount > 1 is required to
    // reach this branch). Horizontal-stripes is allowed — the shaped
    // walker switches carriers between rows on a single bed, no
    // jacquard back bed needed. Within-row multicolor still raises a
    // preview-grade warning since it lowers through the unified B5
    // shape+jacquard walker.
    if (colorAnalysis.mode === 'within-row-multicolor') {
      // B5 full (post-2026-05-20): shape + within-row multicolor lowers
      // via the extended `emitShapedStockinetteWalk` with `colorBindings`,
      // emitting per-color front-bed passes over the active range with
      // optional birdseye back-bed. Surface a preview-grade warning so
      // users swatch first.
      messages.push({
        severity: 'warning',
        rule: 'track-a-shape-jacquard-preview',
        message: `Shaped chart with within-row multicolor (true jacquard): lowered via the unified shape+jacquard walker (preview-grade). Floats are visible on the back unless 'birdseye' back-bed is enabled; swatch before committing to a full piece.`,
      });
    } else if (colorAnalysis.mode === 'horizontal-stripes') {
      messages.push({
        severity: 'warning',
        rule: 'track-a-shape-stripes-preview',
        message: `Shaped chart with ${colorAnalysis.distinctColors.length} horizontal-stripe colors (${colorAnalysis.distinctColors.sort().join(', ')}). Lowered via the shaped walker with carrier-switching between rows; no back bed used. Preview-grade — swatch before committing to a full piece.`,
      });
    }
  }
  if (colorCount === 0) {
    messages.push({
      severity: 'error',
      rule: 'track-a-needs-color',
      message: 'No pattern colors bound. Bind at least one yarn to a key.',
    });
  } else if (colorCount > MAX_PATTERN_COLORS_EXPERIMENTAL) {
    messages.push({
      severity: 'error',
      rule: 'track-a-color-count-max',
      message: `${colorCount} pattern colors bound; Kniterate has only 6 carriers and the experimental cap is ${MAX_PATTERN_COLORS_EXPERIMENTAL}.`,
    });
  } else if (colorCount > MAX_PATTERN_COLORS_DEFAULT && !experimental6ColorMode) {
    // G18 (2026-05-18): Cameron's convention reserves C1 for draw thread
    // and C6 for waste yarn. Any chart needing more than 4 pattern colors
    // has to break one of those reservations. We refuse to silently choose
    // for the user: instead of overloading C6 with both waste yarn and a
    // 5th pattern color (the prior "advanced" mode), force an explicit
    // decision — either drop a pattern color, or opt into experimental
    // mode (which drops the draw thread). See
    // [[reference-cameron-kniterate-conventions]] memory.
    messages.push({
      severity: 'error',
      rule: 'track-a-experimental-opt-in',
      message: `${colorCount} pattern colors exceeds the safe default cap of ${MAX_PATTERN_COLORS_DEFAULT}. Either drop a color (Cameron reserves C1 for draw thread + C6 for waste yarn, leaving C2-C5 for pattern), or enable experimental ${MAX_PATTERN_COLORS_EXPERIMENTAL}-color mode (drops the draw thread to free C1; cast-on separation becomes harder).`,
    });
  } else if (colorCount >= MAX_PATTERN_COLORS_ADVANCED && experimental6ColorMode) {
    messages.push({
      severity: 'warning',
      rule: 'track-a-experimental-active',
      message: `Experimental ${MAX_PATTERN_COLORS_EXPERIMENTAL}-color mode active — draw thread disabled. Cast-on separation is harder; swatch before committing to a full piece.`,
    });
  }

  // 2b. Every keyId present in the chart must be bound — either as a
  //     pattern color or as a stitch override. An unbound key silently
  //     mis-compiles (jacquard walkers skip its cells; stockinette
  //     walker treats it as the dominant color), so this is an error,
  //     not a warning.
  //
  // B2b (2026-05-20): cable tiles (`cableSpan != null`) are also exempt —
  // they inherit the dominant carrier and lower via the cable transfer
  // dance. Without this exemption, every cable placement would force the
  // user to assign a duplicate yarn binding for the cable key.
  const cableKeyIdsAll = new Set(
    input.keyPalette.filter(k => k.cableSpan != null).map(k => k.id),
  );
  // Batch D shape-dispatch (2026-05-27): shift-1 destination keys
  // follow the same exemption rationale as cables — their cells lower
  // to plain knit on the row's knit pass, and the rack-and-xfer dance
  // fires through the shift-event channel. Without this, a shift-only
  // chart would force the user to bind shift-1-L/R to a carrier even
  // though their cells just inherit the dominant carrier.
  const shiftKeyIdsAll = new Set<string>();
  for (const key of input.keyPalette) {
    const op = opForKey(key);
    if (op === 'shift-1-l' || op === 'shift-1-r') shiftKeyIdsAll.add(key.id);
  }
  const bindingExemptKeyIds = new Set<string>([
    ...noStitchKeyIds,
    ...shapeOpKeyIds,
    ...unknownOpKeyIds,
    ...unsupportedOpKeyIds,
    ...unsupportedShapeOpKeyIds,
    ...cableKeyIdsAll,
    ...shiftKeyIdsAll,
  ]);
  const boundKeyIds = new Set<string>([...patternColorKeyIds, ...stitchOverrideKeyIds]);
  const unboundKeyIds = new Set<string>();
  // Per-cell binding-membership check. We're asking "is this cell's
  // keyId bound to a yarn/override?", not "what does this cell
  // semantically do?". For atomic-tile source cells the parent keyId
  // is already in `bindingExemptKeyIds` (via the shape-op branch
  // above), so the identity read does not produce spurious
  // unbound-key errors.
  // chart-core/identity-read-ok: keyId-membership iteration over the resolved grid.
  for (const row of resolved.cells) {
    for (const cell of row) {
      if (bindingExemptKeyIds.has(cell)) continue; // already flagged above
      if (!boundKeyIds.has(cell)) unboundKeyIds.add(cell);
    }
  }
  if (unboundKeyIds.size > 0) {
    messages.push({
      severity: 'error',
      rule: 'track-a-unbound-keys',
      message: `Chart uses ${unboundKeyIds.size} key${unboundKeyIds.size === 1 ? '' : 's'} with no yarn or stitch binding: ${[...unboundKeyIds].sort().join(', ')}. Bind each to a yarn carrier or a stitch override.`,
    });
  }

  // 2c. Purl/tuck style overrides currently lower only through the
  //     single-carrier stockinette-with-overrides walker. If those keys are
  //     actually present in a jacquard chart, the jacquard walkers would miss
  //     over them because they are not pattern-color bindings.
  //     Yarn-over is supported by both the rectangular and shape walkers
  //     (the lowering is just `knit` on the YO needle), so we exempt it
  //     from the shape-overrides gate.
  const usedStitchOverrideKeyIds = [...usedKeyIds]
    .filter(keyId => stitchOverrideKeyIds.has(keyId));
  const isYarnOverKey = (keyId: string) => opForKey(keyById.get(keyId)) === 'yarn-over';
  const usedShapeUnsupportedOverrides = usedStitchOverrideKeyIds.filter(k => !isYarnOverKey(k));
  if (input.shapeMode === true && usedShapeUnsupportedOverrides.length > 0) {
    // Slice 1.5 (2026-05-21): purl cells inside a `trim-region` row band
    // are allowed — the shape walker lowers them via back-bed knits, so
    // rib hems/cuffs work end-to-end on shaped panels.
    // Slice 3 (2026-05-21): tuck cells are allowed anywhere in shape mode
    // — tuck preserves stitch count (no stitchDelta) and lowers as
    // `tuck f(n) C` on the front bed, so it doesn't break shape topology.
    // Other overrides (slip, drop, pause) outside trim rows still fail.
    const trimRowSet = trimRowSetFromAnnotations(input.annotations ?? []);
    const purlKeyIds = new Set(
      usedShapeUnsupportedOverrides.filter(k => opForKey(keyById.get(k)) === 'purl'),
    );
    const tuckKeyIds = new Set(
      usedShapeUnsupportedOverrides.filter(k => {
        const op = opForKey(keyById.get(k));
        // B-1 brioche (2026-06-09): tuck-back conserves stitch count like
        // tuck — allowed anywhere in shape mode; bed-state validates the
        // physical bed routing.
        return op === 'tuck' || op === 'tuck-back';
      }),
    );
    const unsupportedOutsideTrim = new Set<string>();
    // chart-core/identity-read-ok: per-cell stitch-override membership
    // check ("is this cell painted with a known override-key?"). The
    // categorization (purl / tuck / yarn-over) comes from palette
    // metadata on the keyId, not from any per-cell semantic dispatch.
    // Override keys are uniform 1×1 tiles with no source masks, so the
    // resolved-cell identity is equivalent to the projection's keyId.
    for (let r = 0; r < resolved.rows; r++) {
      for (let c = 0; c < resolved.cols; c++) {
        // chart-core/identity-read-ok: see block comment above the
        // for-loop — keyId-membership lookup, not a semantic read.
        const cell = resolved.cells[r]?.[c];
        if (cell === undefined) continue;
        if (!stitchOverrideKeyIds.has(cell)) continue;
        if (isYarnOverKey(cell)) continue;
        if (tuckKeyIds.has(cell)) continue;
        if (purlKeyIds.has(cell) && trimRowSet.has(r)) continue;
        unsupportedOutsideTrim.add(cell);
      }
    }
    if (unsupportedOutsideTrim.size > 0) {
      const names = [...unsupportedOutsideTrim].sort().join(', ');
      messages.push({
        severity: 'error',
        rule: 'track-a-shape-overrides-unsupported',
        message: `Shaped chart export currently supports plain knit, decrease/no-stitch, yarn-over, tuck / tuck-back (anywhere), and purl (inside a trim-region band); found ${unsupportedOutsideTrim.size} unsupported texture override key${unsupportedOutsideTrim.size === 1 ? '' : 's'}: ${names}.`,
      });
    }
  }
  if (colorCount > 1 && usedStitchOverrideKeyIds.length > 0) {
    // B1.5 rib + colorwork composition (2026-05-27): purl cells inside
    // a `trim-region` row band are allowed in a multi-color SHAPE chart
    // when the trim row itself is color-uniform (≤ 1 pattern color).
    // Horizontal-stripes rows are uniform by classifier definition; the
    // shaped walker switches to the row's carrier for the back-bed knit
    // lowering. E2E-3 (2026-06-10): within-row multicolor (true
    // jacquard) shape charts get the same exemption — the shaped walker
    // routes uniform trim rows through its single-carrier path. A trim
    // row that mixes pattern colors still has no carrier for its purls,
    // and non-shape rectangular jacquard knits by per-cell
    // `colorBindings` with no trim handling at all. Keep the gate firing
    // for those cases.
    const allowTrimPurlExemption = input.shapeMode === true;
    const trimRowSet = allowTrimPurlExemption
      ? trimRowSetFromAnnotations(input.annotations ?? [])
      : new Set<number>();
    const patternColorKeyIdSet = new Set(patternColorKeyIds);
    const rowIsColorUniform = (r: number): boolean => {
      // chart-core/color-binding-read-ok: per-row distinct pattern-color
      // count by keyId membership — same identity read the shaped color
      // classifier uses.
      const colors = new Set<string>();
      for (const cell of resolved.cells[r] ?? []) {
        if (patternColorKeyIdSet.has(cell)) colors.add(cell);
      }
      return colors.size <= 1;
    };
    const isPurlKey = (keyId: string) => opForKey(keyById.get(keyId)) === 'purl';
    const unsupportedInJacquard = new Set<string>();
    for (let r = 0; r < resolved.rows; r++) {
      for (let c = 0; c < resolved.cols; c++) {
        // chart-core/identity-read-ok: per-cell membership in the
        // stitch-override key set. Same pattern as the shape-overrides
        // gate above — categorization comes from palette metadata, not
        // a semantic per-cell read.
        const cell = resolved.cells[r]?.[c];
        if (cell === undefined) continue;
        if (!stitchOverrideKeyIds.has(cell)) continue;
        if (isPurlKey(cell) && trimRowSet.has(r) && rowIsColorUniform(r)) continue;
        unsupportedInJacquard.add(cell);
      }
    }
    if (unsupportedInJacquard.size > 0) {
      const names = [...unsupportedInJacquard].sort().join(', ');
      messages.push({
        severity: 'error',
        rule: 'track-a-overrides-jacquard-unsupported',
        message: `Chart uses ${unsupportedInJacquard.size} stitch override key${unsupportedInJacquard.size === 1 ? '' : 's'} in a multi-color jacquard chart: ${names}. Track A's jacquard path supports purls only inside a trim-region band on a shaped chart whose trim rows are single-color; move other overrides to a single-color region.`,
      });
    }
  }

  // 3. Chart width vs. bed
  if (resolved.cols > KNITERATE_NEEDLE_COUNT) {
    messages.push({
      severity: 'error',
      rule: 'track-a-bed-width',
      message: `Chart is ${resolved.cols} stitches wide; Kniterate has ${KNITERATE_NEEDLE_COUNT} needles per bed.`,
    });
  }

  // 3b. Narrow-chart pre-flight (G23). Kniterate's takedown rollers need
  //     enough fabric width to engage; under ~30 stitches the cast-on edge
  //     can curl up and miss the rollers entirely. Cameron's notes
  //     (soup.agnescameron.info, 2025-09-20) call this out explicitly.
  if (resolved.cols < 30) {
    messages.push({
      severity: 'warning',
      rule: 'track-a-narrow-chart',
      message: `Chart is only ${resolved.cols} stitches wide; below ~30 the Kniterate's takedown rollers may not engage and the cast-on edge can curl. Widen the chart or swatch first.`,
    });
  }

  // 3c. Chart orientation vs. compile assumption (G16). All Track A
  //     walkers iterate row 0 → rows-1 with row 0 = cast-on edge, which
  //     matches bottom-up authoring. Charts authored top-down /
  //     left-right / in-the-round will compile, but the visual mapping
  //     is wrong — what the user sees as "top of the chart" will come
  //     off the machine at the cast-on end. We warn rather than reject
  //     because power users may have already accounted for the flip
  //     mentally; an error would be over-paternalistic.
  if (input.orientation !== undefined && input.orientation !== 'bottom-up') {
    messages.push({
      severity: 'warning',
      rule: 'track-a-orientation',
      message: `Chart orientation is "${input.orientation}", but the Kniterate compiler reads charts as bottom-up (row 0 = cast-on edge). The output will be readable, but flipped relative to what knitlab1 displays. Flip the chart in knitlab1 if you want the visual top to match the bind-off edge.`,
    });
  }

  // 4. Needle offset placement
  if (!Number.isInteger(needleOffset) || needleOffset < 1) {
    messages.push({
      severity: 'error',
      rule: 'track-a-needle-offset-positive',
      message: `needleOffset=${needleOffset} is invalid; must be a positive integer (needle 0 is not addressable).`,
    });
  } else if (needleOffset + resolved.cols - 1 > KNITERATE_NEEDLE_COUNT) {
    messages.push({
      severity: 'error',
      rule: 'track-a-bed-overflow',
      message: `Chart starting at needle ${needleOffset} with ${resolved.cols} stitches extends past needle ${KNITERATE_NEEDLE_COUNT}.`,
    });
  }

  return messages;
}

/**
 * Phase 2 cable registry (Task #40, 2026-05-24; reason wiring #40b):
 * the per-palette-key "is this cable lowerable?" check is a thin
 * wrapper around `chooseDispatch` from
 * `src/chart-core/cable-registry.ts`. The registry is the single
 * source of truth — `cableEventIsSupported` and `dispatchCableEvent`
 * in the walker thin-wrap the same function, so the validator and
 * walker can never drift on which cable shapes are supported AND
 * they emit the same diagnostic reason (via
 * `unsupportedCableReason(shape)`).
 *
 * Build a `CableShape` for the palette key — `hasPurlBackground`
 * is derived from any `cells[r][c].op === 'purl'`. Returns `null`
 * if the key has no `cableSpan` at all.
 */
function cableShapeForKey(key: KnitlabKeyDefinition): CableShape | null {
  const span = key.cableSpan;
  if (!span) return null;
  const hasPurlBackground = (key.cells ?? []).some(row =>
    (row ?? []).some(cell => cell?.op === 'purl'),
  );
  return shapeFromCableSpan(span, hasPurlBackground);
}

/** Returns the registry's rejection reason for a cable key, or `null`
 *  if the cable shape IS supported (or the key has no cableSpan). */
function cableShapeRejectionReason(key: KnitlabKeyDefinition): string | null {
  const shape = cableShapeForKey(key);
  if (!shape) return null;
  if (chooseDispatch(shape) !== null) return null;
  return unsupportedCableReason(shape);
}

function trimRowSetFromAnnotations(
  annotations: ReadonlyArray<{
    kind: string;
    trimRegion?: { startRow: number; endRow: number };
  }>,
): Set<number> {
  const rows = new Set<number>();
  for (const a of annotations) {
    if (a.kind !== 'trim-region') continue;
    const region = a.trimRegion;
    if (!region) continue;
    const start = Math.min(region.startRow, region.endRow);
    const end = Math.max(region.startRow, region.endRow);
    for (let r = start; r <= end; r++) rows.add(r);
  }
  return rows;
}

/** Filter the resolved chart's `warnings` (from placement composition)
 *  into the standard `ValidationMessage[]` form so they merge into the
 *  same report. */
export function resolveChartWarningsToMessages(resolved: ResolvedChart): ValidationMessage[] {
  return resolved.warnings.map(w => ({
    severity: 'warning' as const,
    rule: 'resolve-chart-' + w.reason.split(' ')[0]!.toLowerCase().replace(/[^a-z]/g, ''),
    message: `${w.reason} (${w.placementCount} occurrence${w.placementCount === 1 ? '' : 's'})`,
  }));
}
