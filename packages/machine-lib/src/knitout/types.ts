/**
 * Knitout IR for the Kniterate compiler.
 *
 * This is the canonical machine-independent representation we emit to .k
 * files. Designed against the Knitout v0.6 spec
 * (https://textiles-lab.github.io/knitout/knitout.html) with the subset
 * the Kniterate accepts — no `inhook`/`outhook`/`releasehook`, no slider
 * needles (`fs`/`bs`), racking limited to integer or ±0.5 increments.
 *
 * Designed as a flat list of `KnitoutOp` discriminated union members so a
 * writer can pure-emit text and a validator can iterate without parsing.
 *
 * See docs/knitlab1-kniterate-export-plan.md §9 for the design context.
 */

export type Bed = 'f' | 'b';

export interface BedNeedle {
  bed: Bed;
  needle: number;
}

export type Direction = '+' | '-';

/** Kniterate has exactly 6 carriers, numbered 1..6. No other values are
 *  legal — Cameron's cheatsheet rule. */
export type CarrierId = '1' | '2' | '3' | '4' | '5' | '6';

export const ALL_CARRIERS: readonly CarrierId[] = ['1', '2', '3', '4', '5', '6'];

type KnitoutOpData =
  | { kind: 'in'; carriers: CarrierId[] }
  | { kind: 'out'; carriers: CarrierId[] }
  | { kind: 'knit'; direction: Direction; needle: BedNeedle; carriers: CarrierId[] }
  | { kind: 'tuck'; direction: Direction; needle: BedNeedle; carriers: CarrierId[] }
  | { kind: 'miss'; direction: Direction; needle: BedNeedle; carriers: CarrierId[] }
  | { kind: 'xfer'; from: BedNeedle; to: BedNeedle }
  // Split: pull a new loop through `from` while transferring the prior
  // loop at `from` to `to`. Direction is the carriage direction (where
  // the new loop is formed). Vendor backend recognizes split at
  // src/knitout/vendor/knitout-to-kcode.cjs:843,1026. The bed-cross rule
  // is the same as xfer — `from.bed` must differ from `to.bed`.
  | { kind: 'split'; direction: Direction; from: BedNeedle; to: BedNeedle; carriers: CarrierId[] }
  | { kind: 'rack'; offset: number }
  | { kind: 'drop'; needle: BedNeedle }
  | { kind: 'pause'; message?: string }
  | { kind: 'comment'; text: string }
  // Kniterate extension OPS (NOT comment headers — the knitout-backend-kniterate
  // compiler parses `x-stitch-number 5` as an op; `;;X-stitch-number: 5` is
  // silently ignored). These can appear anywhere in the op stream to change
  // settings mid-program; typically emitted at the top.
  | { kind: 'x-stitch-number'; value: number }
  | { kind: 'x-xfer-stitch-number'; value: number }
  | { kind: 'x-speed-number'; value: number }
  | { kind: 'x-roller-advance'; value: number }
  | { kind: 'x-add-roller-advance'; value: number }
  | { kind: 'x-xfer-style'; value: 'four-pass' | 'two-pass' }
  // PATCH (knitlab2): presser-speed/presser-roller control the
  // speed/roller of auto-inserted carriage moves between direction-
  // mismatched passes — see the corresponding patch in
  // src/knitout/vendor/knitout-to-kcode.cjs. Used by the tension-swatch
  // generator to replicate the Kniterate App's varied auto-move speeds.
  | { kind: 'x-presser-speed'; value: number }
  | { kind: 'x-presser-roller'; value: number }
  // PATCH (knitlab2): emits an explicit empty carriage-move pass
  // (Kn-Kn with no carrier) at the current presser speed/roller. Used
  // to match the Kniterate App's "park sequence" before bind-off.
  | { kind: 'x-park-carriage' }
  // PATCH (knitlab2): carrier-stopping-distance overrides the vendor's
  // default 2.5 carrier-distance (set via op, NOT the header — the
  // vendor only honors the op form).
  | { kind: 'x-carrier-spacing'; value: number }
  | { kind: 'x-carrier-stopping-distance'; value: number };

/** Engine-owned source provenance. It is ignored by the knitout writer but
 * travels with the op through planning, validation, and diagnostics. */
export type KnitoutOp = KnitoutOpData & {
  readonly sourceRows?: readonly number[];
};

export type Position = 'Left' | 'Center' | 'Right' | 'Keep';

export interface KniterateExtensionHeaders {
  rollerAdvance?: number;
  stitchNumber?: number;
  xferStitchNumber?: number;
  speedNumber?: number;
  carrierSpacing?: number;
  carrierStoppingDistance?: number;
  xferStyle?: 'four-pass' | 'two-pass';
}

export interface KnitoutProgram {
  version: 2;
  carriers: CarrierId[];
  machine: 'kniterate';
  gauge?: number;
  position?: Position;
  yarns: Partial<Record<CarrierId, string>>;
  kniterate: KniterateExtensionHeaders;
  ops: KnitoutOp[];
}

/** Convenience constructors that keep call sites readable. */
export const f = (needle: number): BedNeedle => ({ bed: 'f', needle });
export const b = (needle: number): BedNeedle => ({ bed: 'b', needle });

export const knit = (direction: Direction, needle: BedNeedle, ...carriers: CarrierId[]): KnitoutOp =>
  ({ kind: 'knit', direction, needle, carriers });
export const tuck = (direction: Direction, needle: BedNeedle, ...carriers: CarrierId[]): KnitoutOp =>
  ({ kind: 'tuck', direction, needle, carriers });
export const miss = (direction: Direction, needle: BedNeedle, ...carriers: CarrierId[]): KnitoutOp =>
  ({ kind: 'miss', direction, needle, carriers });
export const xfer = (from: BedNeedle, to: BedNeedle): KnitoutOp =>
  ({ kind: 'xfer', from, to });
export const split = (
  direction: Direction,
  from: BedNeedle,
  to: BedNeedle,
  ...carriers: CarrierId[]
): KnitoutOp => ({ kind: 'split', direction, from, to, carriers });
export const rack = (offset: number): KnitoutOp => ({ kind: 'rack', offset });
export const drop = (needle: BedNeedle): KnitoutOp => ({ kind: 'drop', needle });
export const carrierIn = (...carriers: CarrierId[]): KnitoutOp => ({ kind: 'in', carriers });
export const carrierOut = (...carriers: CarrierId[]): KnitoutOp => ({ kind: 'out', carriers });
export const pause = (message?: string): KnitoutOp =>
  message === undefined ? { kind: 'pause' } : { kind: 'pause', message };
export const comment = (text: string): KnitoutOp => ({ kind: 'comment', text });

export const xStitchNumber = (value: number): KnitoutOp => ({ kind: 'x-stitch-number', value });
export const xXferStitchNumber = (value: number): KnitoutOp => ({ kind: 'x-xfer-stitch-number', value });
export const xSpeedNumber = (value: number): KnitoutOp => ({ kind: 'x-speed-number', value });
export const xRollerAdvance = (value: number): KnitoutOp => ({ kind: 'x-roller-advance', value });
export const xAddRollerAdvance = (value: number): KnitoutOp => ({ kind: 'x-add-roller-advance', value });
export const xXferStyle = (value: 'four-pass' | 'two-pass'): KnitoutOp => ({ kind: 'x-xfer-style', value });
export const xPresserSpeed = (value: number): KnitoutOp => ({ kind: 'x-presser-speed', value });
export const xPresserRoller = (value: number): KnitoutOp => ({ kind: 'x-presser-roller', value });
export const xParkCarriage = (): KnitoutOp => ({ kind: 'x-park-carriage' });
export const xCarrierSpacing = (value: number): KnitoutOp =>
  ({ kind: 'x-carrier-spacing', value });
export const xCarrierStoppingDistance = (value: number): KnitoutOp =>
  ({ kind: 'x-carrier-stopping-distance', value });

/** Opposite direction. */
export const opposite = (d: Direction): Direction => (d === '+' ? '-' : '+');

/** Per-cell stitch type — the user-facing semantic that maps from
 *  KeyDefinition.id to a knitout op pattern. */
export type StitchType =
  | { kind: 'knit' }
  | { kind: 'purl' }
  | { kind: 'tuck' }
  | { kind: 'tuck-back' }
  | { kind: 'slip' }
  | { kind: 'no-stitch' }
  | { kind: 'pause'; message?: string }
  | { kind: 'drop' }
  | { kind: 'yarn-over' };

export interface YarnBinding {
  keyId: string;
  carrier: CarrierId;
  name: string;
  role?: 'background' | 'pattern' | 'accent';
}
