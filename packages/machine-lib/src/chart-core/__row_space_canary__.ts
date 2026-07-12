// Type-level canary for the RowSpace phantom type
// (Phase 1c follow-up follow-up follow-up follow-up, 2026-05-24).
//
// This module never executes — its sole purpose is to be type-checked
// by `pnpm typecheck` (which scans every .ts under src/). The
// `@ts-expect-error` directives below FAIL the build if the brand is
// ever weakened to accept an authored projection where knit-order is
// required.
//
// Why this lives in src/ and not test/: the main typecheck excludes
// test/, so a canary in tests wouldn't actually guard the contract.
// Keep this module imported by nothing — `noUnusedLocals` doesn't fire
// because the file isn't imported, and tsc still type-checks every
// file under src/.
//
// If you find yourself wanting to silence one of these errors, the
// right answer is almost never "remove the @ts-expect-error" — it's
// "go fix the caller to use reverseProjectionRows or tagAsKnitOrder
// before reaching the shape walker".
import type { KnitlabChartState, KnitlabKeyDefinition } from '../colorwork/knitlab1-contract.js';
import {
  projectChart,
  reverseProjectionRows,
  tagAsKnitOrder,
} from './projection.js';
import type { ResolvedChartProjection } from './types.js';

declare const chart: KnitlabChartState;
declare const palette: readonly KnitlabKeyDefinition[];

/** A function that requires the knit-order brand, modelling the
 *  `ShapedStockinetteWalkInput.projection` constraint. */
declare function requiresKnitOrder(p: ResolvedChartProjection<'knit-order'>): void;

/** A function that requires the authored brand, modelling producers
 *  (`reverseProjectionRows` accepts authored input). */
declare function requiresAuthored(p: ResolvedChartProjection<'authored'>): void;

export function _shapeWalkerRejectsAuthored(): void {
  const authored = projectChart(chart, palette); // <'authored'>
  // @ts-expect-error — authored projection MUST NOT satisfy knit-order.
  requiresKnitOrder(authored);
}

export function _shapeWalkerAcceptsReversedAuthored(): void {
  const knitOrder = reverseProjectionRows(projectChart(chart, palette));
  // No expect-error: knit-order is what the walker requires.
  requiresKnitOrder(knitOrder);
}

export function _shapeWalkerAcceptsTagAsKnitOrder(): void {
  const tagged = tagAsKnitOrder(projectChart(chart, palette));
  // No expect-error: the explicit brand flip is accepted.
  requiresKnitOrder(tagged);
}

export function _reverseRejectsKnitOrderInput(): void {
  const knitOrder = reverseProjectionRows(projectChart(chart, palette));
  // @ts-expect-error — reverseProjectionRows takes authored, not knit-order.
  reverseProjectionRows(knitOrder);
}

export function _authoredConsumerRejectsKnitOrder(): void {
  const knitOrder = reverseProjectionRows(projectChart(chart, palette));
  // @ts-expect-error — symmetric guard for any consumer typed
  // explicitly to 'authored' rather than the loose union.
  requiresAuthored(knitOrder);
}
