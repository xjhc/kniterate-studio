/**
 * Reference-.kc parity manifest types. The harness in
 * `reference-kc-parity.test.ts` iterates over `REFERENCE_KC_CASES`
 * (declared in `manifest.ts`) and runs each case's gates against the
 * captured reference fixture.
 *
 * Design rules (from docs/kniterate-wizard-completion-plan.md Phase 0):
 *   - Section parity is the default exit gate.
 *   - Byte parity is reserved for small, fully controlled sections.
 *   - Any `max-pass-delta` tolerance must carry a named waiver.
 */

import type { KcSectionAnchor } from '../../../src/knitout/sim/kc-section.js';

/** A named section of a reference fixture. The harness extracts both
 *  the reference and the generated kc with this anchor before gating. */
export interface ReferenceKcSection {
  readonly id: string;
  readonly anchor: KcSectionAnchor;
}

/** A waiver permits a tolerated drift between generated and reference
 *  output. Waivers are required — `max-pass-delta` without one fails
 *  manifest validation. `expiresWhen` is a free-text trigger
 *  (e.g. "RunArtifact.predictedPasses is populated for Track B")
 *  rather than a date, so the waiver retires when the underlying
 *  blocker resolves, not on a clock. */
export interface ReferenceKcWaiver {
  readonly id: string;
  readonly reason: string;
  readonly expiresWhen: string;
}

export type ReferenceKcGate =
  | {
      readonly kind: 'section-byte-identical';
      readonly section: string;
    }
  | {
      readonly kind: 'pass-structure';
      readonly section: string;
    }
  | {
      readonly kind: 'section-fingerprint';
      readonly section: string;
    }
  | {
      readonly kind: 'max-pass-delta';
      readonly section: string;
      readonly max: number;
      readonly waiver: ReferenceKcWaiver;
    };

/** A case that builds knitout from the engine and gates the vendored
 *  .kc output against a captured reference. */
export interface EngineCompareCase {
  readonly kind: 'engine-compare';
  readonly id: string;
  readonly referencePath: string;
  /** Returns knitout text ready for `knitoutToKCode`. */
  readonly buildKnitout: () => string;
  readonly sections: readonly ReferenceKcSection[];
  readonly gates: readonly ReferenceKcGate[];
}

/** A case that loads + parses the reference but does NOT compile-
 *  compare. Used for fixtures the engine cannot yet regenerate; lets
 *  the manifest include them as parser smoke-tests against the largest
 *  real .kc files we have. */
export interface ParseOnlyCase {
  readonly kind: 'parse-only';
  readonly id: string;
  readonly referencePath: string;
  /** Minimum pass count the reference should yield. Guards against
   *  silent parser regressions (a refactor that drops all passes
   *  would otherwise pass with zero). */
  readonly minPasses: number;
}

export type ReferenceKcCase = EngineCompareCase | ParseOnlyCase;
