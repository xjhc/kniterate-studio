/**
 * Cable registry (Task #40, 2026-05-24) — single source of truth for:
 *
 *  - **canHandle**: is this cable shape lowerable on a Kniterate?
 *  - **dispatch**: which emitter (`emitCableCross` /
 *    `emitAsymmetricCableCross` / `emitTraveller`) does it lower
 *    through?
 *  - **diagnostic**: the reason an unsupported cable shape isn't
 *    lowered, shared by validator and walker so the user sees one
 *    consistent message.
 *
 * Before this module, the truth table was triplicated:
 *  - `isSupportedCableShape` in `src/validators/chart-track-a.ts`
 *  - `cableEventIsSupported` in `src/knitout/passes/stockinette.ts`
 *  - `dispatchCableEvent` in `src/knitout/passes/stockinette.ts`
 * All three encoded the same per-shape rules (width ∈ {2,4,6,8} for
 * symmetric knit-over-knit; width ∈ {2,3} for purl-bg; etc.) and
 * had to be kept in lock-step by hand. The triplication is gone:
 * those three functions now thin-wrap `chooseDispatch(shape)`.
 *
 * The registry also exposes per-key `CableHandler` records keyed by
 * `OperationSpec.id`. Each handler combines the spec's
 * `CableShape` with the chosen `CableDispatch`, so coverage gates
 * can iterate "every registered cable key" and "every supported
 * cable shape has exactly one handler" without re-doing the
 * derivation.
 */

import type { KnitoutOp } from '../knitout/types.js';
import {
  emitAsymmetricCableCross,
  emitCableCross,
  emitTraveller,
  type CableWidth,
} from '../knitout/passes/cable-cross.js';
import type { OperationSpec } from './operation-spec.js';
import { registeredSpecs } from './spec-registry.js';

export type CableDirection = 'front' | 'back';

/** Shape signature for a cable cross. Two cables with the same
 *  signature lower to the same emitter call. */
export interface CableShape {
  readonly width: number;
  readonly workedWidth: number;
  readonly purlWidth: number;
  readonly direction: CableDirection;
  readonly hasPurlBackground: boolean;
}

/** Per-shape emitter strategy. `chooseDispatch(shape)` returns one of
 *  these for every supported shape; unsupported shapes return `null`. */
export interface CableDispatch {
  readonly emitterName: 'cable-cross' | 'asymmetric-cable-cross' | 'traveller';
  readonly emit: (ctx: {
    needleStart: number;
    startCol: number;
    ambientRack: number;
  }) => KnitoutOp[];
}

/** Per-key handler: ties an `OperationSpec.id` to its `CableShape`
 *  and the dispatch the walker should use. Multiple keys can share
 *  a dispatch (e.g. `key_cable_2_front` and `key_cable_2_front_tall`
 *  collapse to the same width=2/front shape). */
export interface CableHandler {
  readonly keyId: string;
  readonly shape: CableShape;
  readonly dispatch: CableDispatch;
}

// ── Shape adapters ───────────────────────────────────────────────────

/** Build a `CableShape` from a `cableSpan`-shaped value (the minimal
 *  shape the host palette key and `CableScheduleEvent` share) plus an
 *  externally-determined `hasPurlBackground`. Used by validator,
 *  walker, and `shapeFromSpec`. */
export function shapeFromCableSpan(
  span: {
    width: number;
    direction: CableDirection;
    workedWidth?: number;
    purlWidth?: number;
  },
  hasPurlBackground: boolean,
): CableShape {
  const half = Math.floor(span.width / 2);
  return {
    width: span.width,
    workedWidth: span.workedWidth ?? half,
    purlWidth: span.purlWidth ?? half,
    direction: span.direction,
    hasPurlBackground,
  };
}

/** Build a `CableShape` from an `OperationSpec` (returns `null` if
 *  the spec has no `cableSpan`). Derives `hasPurlBackground` from the
 *  spec's cells matrix (any `'purl'` semanticOp → true). */
export function shapeFromSpec(spec: OperationSpec): CableShape | null {
  if (!spec.cableSpan) return null;
  const hasPurlBackground = spec.cells.some(row =>
    row.some(c => c.semanticOp === 'purl'),
  );
  return shapeFromCableSpan(spec.cableSpan, hasPurlBackground);
}

// ── The truth table ──────────────────────────────────────────────────

/**
 * Maps a `CableShape` → `CableDispatch | null`. THE source of truth
 * for "is this cable lowerable, and if so, which emitter?".
 *
 * Rules (matched in order):
 *  - `hasPurlBackground` true: `emitAsymmetricCableCross` if widths
 *    sum correctly and total width ∈ {2, 3}; else null.
 *  - 1×1 symmetric (width=2, worked=1, purl=1): `emitTraveller`.
 *  - Symmetric knit-over-knit (worked === purl, width ∈ {2,4,6,8}):
 *    `emitCableCross`.
 *  - Anything else: null (validator emits
 *    `track-a-cable-unsupported`; walker throws if it ever sees one).
 */
export function chooseDispatch(shape: CableShape): CableDispatch | null {
  if (shape.hasPurlBackground) {
    if (shape.workedWidth < 1 || shape.purlWidth < 1) return null;
    if (shape.workedWidth + shape.purlWidth !== shape.width) return null;
    if (shape.width !== 2 && shape.width !== 3) return null;
    return {
      emitterName: 'asymmetric-cable-cross',
      emit: ({ needleStart, startCol, ambientRack }) =>
        emitAsymmetricCableCross({
          direction: shape.direction,
          workedWidth: shape.workedWidth,
          purlWidth: shape.purlWidth,
          leftNeedle: needleStart + startCol,
          ambientRack,
        }),
    };
  }
  if (shape.workedWidth === 1 && shape.purlWidth === 1 && shape.width === 2) {
    return {
      emitterName: 'traveller',
      emit: ({ needleStart, startCol, ambientRack }) =>
        emitTraveller({
          direction: shape.direction,
          leftNeedle: needleStart + startCol,
          ambientRack,
        }),
    };
  }
  if (
    shape.workedWidth === shape.purlWidth &&
    (shape.width === 2 || shape.width === 4 || shape.width === 6 || shape.width === 8)
  ) {
    return {
      emitterName: 'cable-cross',
      emit: ({ needleStart, startCol, ambientRack }) =>
        emitCableCross({
          direction: shape.direction,
          width: shape.width as CableWidth,
          leftNeedle: needleStart + startCol,
          ambientRack,
        }),
    };
  }
  return null;
}

/** Shared diagnostic string for an unsupported cable shape. Both the
 *  validator and the walker concatenate this into their own message
 *  formats so the user sees one consistent reason. */
export function unsupportedCableReason(shape: CableShape): string {
  return `unsupported cable shape ${shape.workedWidth}/${shape.purlWidth} width=${shape.width} hasPurlBackground=${shape.hasPurlBackground}`;
}

// ── Per-key handler registry ─────────────────────────────────────────

const HANDLER_BY_KEY_ID = new Map<string, CableHandler>();
const HANDLER_BY_SHAPE_SIG = new Map<string, CableHandler>();

function shapeSig(shape: CableShape): string {
  return `${shape.width}/${shape.workedWidth}/${shape.purlWidth}/${shape.direction}/${shape.hasPurlBackground ? 'p' : 'k'}`;
}

function buildRegistry(): void {
  HANDLER_BY_KEY_ID.clear();
  HANDLER_BY_SHAPE_SIG.clear();
  for (const spec of registeredSpecs()) {
    const shape = shapeFromSpec(spec);
    if (!shape) continue;
    const dispatch = chooseDispatch(shape);
    if (!dispatch) {
      // A registered spec whose shape is unsupported is a developer
      // bug — every spec we ship should be lowerable. Throwing at
      // module-load surfaces the misconfiguration loudly.
      throw new Error(
        `cable-registry: spec ${spec.id} declares a cable shape that chooseDispatch rejects (${unsupportedCableReason(shape)}).`,
      );
    }
    const handler: CableHandler = { keyId: spec.id, shape, dispatch };
    HANDLER_BY_KEY_ID.set(spec.id, handler);
    const sig = shapeSig(shape);
    if (!HANDLER_BY_SHAPE_SIG.has(sig)) {
      HANDLER_BY_SHAPE_SIG.set(sig, handler);
    }
  }
}

buildRegistry();

/** Returns the handler for a registered cable key id, or `undefined`
 *  if the key isn't a registered cable spec. */
export function cableHandlerForKeyId(id: string): CableHandler | undefined {
  return HANDLER_BY_KEY_ID.get(id);
}

/** Returns the first handler matching the given shape, or `undefined`
 *  if no registered cable has this exact shape. */
export function cableHandlerForShape(shape: CableShape): CableHandler | undefined {
  return HANDLER_BY_SHAPE_SIG.get(shapeSig(shape));
}

/** All registered cable handlers (one per keyId). */
export function registeredCableHandlers(): readonly CableHandler[] {
  return [...HANDLER_BY_KEY_ID.values()];
}

/** All registered cable key ids, sorted for stable test output. */
export function registeredCableKeyIds(): readonly string[] {
  return [...HANDLER_BY_KEY_ID.keys()].sort();
}
