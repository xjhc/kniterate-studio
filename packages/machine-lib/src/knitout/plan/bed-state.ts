/**
 * Bed-state simulator. Walks a KniteratePlan's pass sequence and produces
 * per-pass `BedState`: per-needle loop occupancy on each bed, racking
 * offset, carrier parked side.
 *
 * This is B1.0's structural-truth oracle. The op-level validator
 * (validators/knitout-program.ts) checks syntax; the bed simulator
 * answers questions that need to track loops over time:
 *   - "is this xfer source actually occupied at this moment?"
 *   - "did the last knit at f.50 land on a live loop or did it knock off
 *     a previous color?"
 *   - "does carrier C2's parked side match the direction of the next pass?"
 *
 * Used by `validateBedState` (next door) for hard validation, and by the
 * wizard / notes generator for "shipped passes per row" and "live loops
 * at bind-off" statistics.
 */

import type { CarrierId, KnitoutOp } from '../types.js';
import type { CarrierSide } from '../sim/types.js';
import type {
  BedOccupancy,
  BedState,
  KniteratePlan,
  PlannedPass,
} from './types.js';

/** Per-pass simulator output. One entry per pass in `plan.passes` plus an
 *  initial empty state (`afterPassIndex === -1`). */
export interface BedStateTrace {
  /** Initial state before any pass. */
  initial: BedState;
  /** State after each pass; states[i].afterPassIndex === i. */
  states: BedState[];
  /** Hard-invariant violations the simulator detected. */
  errors: BedStateError[];
}

export interface BedStateError {
  passIndex: number;
  opIndex: number;
  rule: BedStateRule;
  message: string;
  /** Defaults to 'error' if absent — most simulator rules are machine
   *  invariants (xfer-from-empty, too-many-loops). Rules added for soft
   *  fabric-quality concerns (long-float) set this to 'warning'. */
  severity?: 'error' | 'warning';
}

export type BedStateRule =
  | 'xfer-from-empty'
  | 'too-many-loops'
  | 'invalid-rack'
  | 'xfer-rack-misalignment'
  | 'xfer-same-bed'
  | 'carrier-not-active'
  | 'knit-without-carrier'
  | 'in-carrier-already-active'
  | 'out-carrier-not-active'
  | 'adjacent-xfer-same-pass'
  | 'long-float';

/** Maximum loops a single needle can hold before the machine jams. The
 *  kniterate cheatsheet's "≤ 2 tucks on same needle" is a stricter
 *  knit-tuck rule; physical loop stacking tolerates up to 2-3 stacked
 *  loops from xfer combos. We warn at 3 (decorative double decreases
 *  like sk2p/k3tog/sssk stack briefly to 3 between xfer dances and the
 *  next knit pass) and hard-error at 4+. Yarn thickness affects whether
 *  3 stacks actually clear the carriage — preview-grade, swatch first. */
const MAX_LOOPS_PER_NEEDLE_WARN = 2;
const MAX_LOOPS_PER_NEEDLE_HARD = 3;

/** Default front-bed float policy: warn when a run exceeds 5 stitches.
 *  Cameron's cheatsheet recommends ≤ 6-7 at 7gg; the plan §6.2 defaults
 *  to 5 as the conservative threshold. Recipes override via
 *  `recipe.validation.floats`. */
const DEFAULT_FLOAT_POLICY: FloatPolicy = { mode: 'warn-above', threshold: 5 };

/** Per-recipe float ceiling policy. Matches `RecipeValidationPolicy.floats`
 *  in `src/knitout/recipes/types.ts`. Kept as a local type so the
 *  simulator doesn't import the recipe module (which would create a
 *  layering cycle). */
export interface FloatPolicy {
  readonly mode: 'warn-above' | 'reject-above';
  readonly threshold: number;
}

export interface SimulateBedStatesOptions {
  /** Optional override of the default front-bed float policy. */
  floatPolicy?: FloatPolicy;
}

/** Walk the plan and produce a BedStateTrace. Pure; no mutation of plan. */
export function simulateBedStates(
  plan: KniteratePlan,
  options: SimulateBedStatesOptions = {},
): BedStateTrace {
  const errors: BedStateError[] = [];
  const states: BedState[] = [];
  const floatPolicy = options.floatPolicy ?? DEFAULT_FLOAT_POLICY;

  // Internal mutable working state. Cloned into immutable BedState snapshots
  // at each pass boundary.
  const front = new Map<number, CarrierLoop[]>();
  const back = new Map<number, CarrierLoop[]>();
  let racking = 0;
  const carrierSides = new Map<CarrierId, CarrierSide>();

  const initial: BedState = snapshot(-1, front, back, racking, carrierSides);

  for (let pi = 0; pi < plan.passes.length; pi++) {
    const pass = plan.passes[pi]!;
    // Adjacent-xfer tracker (plan §10.1 B1.0 additions, Cameron cheatsheet
    // "adjacent transfers take place over multiple rows to avoid breakage").
    // We keep one set per source bed of needle indices that have been
    // xfer'd since the last rack op. A rack changes the bed geometry and
    // acts as a "relief" between transfers — this is what the bind-off
    // pattern (xfer, rack, xfer, rack, knit) exploits. The flag fires when
    // a single uninterrupted run of xfers touches adjacent same-bed
    // needles, which is the rib-setup-in-one-pass anti-pattern.
    let xferSourcesF = new Set<number>();
    let xferSourcesB = new Set<number>();
    // Float tracker: per-carrier run length of consecutive front-bed
    // miss ops. Only the front bed produces user-visible floats; back-bed
    // miss ops are walker alternation, not strung floats, so we don't
    // track them. (P2 #11 — see plan §6.2.)
    //
    // A front-bed miss is *anchored* when any carrier knits or tucks the
    // back bed at the same needle column within this pass — the back-bed
    // loop physically traps the front strand. Pre-scan the pass once to
    // build the anchor set, then reset the per-carrier run whenever a
    // miss lands on an anchored column. Walker-agnostic: birdseye 'full'
    // anchors every column, birdseye 'minimal' anchors columns with
    // active colors, ladder anchors only at pillars.
    const backBedAnchorCols = new Set<number>();
    for (const op of pass.ops) {
      if ((op.kind === 'knit' || op.kind === 'tuck') && op.needle.bed === 'b') {
        backBedAnchorCols.add(op.needle.needle);
      }
    }
    const frontFloatRun = new Map<CarrierId, { length: number; startOpIdx: number }>();
    let frontFloatAlreadyFlagged = new Set<CarrierId>();
    for (let oi = 0; oi < pass.ops.length; oi++) {
      const op = pass.ops[oi]!;
      // ---- Front-bed float-run tracking ----
      if (op.kind === 'miss' && op.needle.bed === 'f') {
        const anchored = backBedAnchorCols.has(op.needle.needle);
        if (anchored) {
          // Back-bed catch traps the strand — resets the run.
          for (const c of op.carriers) {
            frontFloatRun.delete(c);
            frontFloatAlreadyFlagged.delete(c);
          }
        } else for (const c of op.carriers) {
          const run = frontFloatRun.get(c) ?? { length: 0, startOpIdx: oi };
          run.length += 1;
          if (run.length === 1) run.startOpIdx = oi;
          frontFloatRun.set(c, run);
          if (run.length > floatPolicy.threshold && !frontFloatAlreadyFlagged.has(c)) {
            const severity: 'warning' | 'error' =
              floatPolicy.mode === 'reject-above' ? 'error' : 'warning';
            const reason = severity === 'error'
              ? `exceeds recipe ceiling (${floatPolicy.threshold}) — rejected.`
              : `fabric face may show a long visible strand. Consider birdseye back, smaller color blocks, or catch-tucks.`;
            errors.push({
              passIndex: pi,
              opIndex: run.startOpIdx,
              rule: 'long-float',
              severity,
              message: `Front-bed float for carrier C${c} runs ${run.length}+ consecutive unanchored miss ops (> ${floatPolicy.threshold}) — ${reason}`,
            });
            frontFloatAlreadyFlagged.add(c);
          }
        }
      } else if ((op.kind === 'knit' || op.kind === 'tuck') && op.needle.bed === 'f') {
        for (const c of op.carriers) {
          frontFloatRun.delete(c);
          frontFloatAlreadyFlagged.delete(c);
        }
      }
      if (op.kind === 'xfer' || op.kind === 'split') {
        const sources = op.from.bed === 'f' ? xferSourcesF : xferSourcesB;
        if (sources.has(op.from.needle - 1) || sources.has(op.from.needle + 1)) {
          errors.push({
            passIndex: pi,
            opIndex: oi,
            rule: 'adjacent-xfer-same-pass',
            message: `${op.kind} ${op.from.bed}${op.from.needle} is adjacent to a prior xfer/split source on the same bed within this pass with no intervening rack — spread adjacent transfers across multiple passes (Kniterate cheatsheet)`,
          });
        }
        sources.add(op.from.needle);
      } else if (op.kind === 'rack') {
        // Rack acts as relief — the bed geometry changes, so prior xfer
        // sources are no longer spatially adjacent to the next xfer.
        xferSourcesF = new Set();
        xferSourcesB = new Set();
      }
      const err = applyOp(op, { front, back, carrierSides, getRacking: () => racking, setRacking: (r) => { racking = r; } });
      if (err) errors.push({ passIndex: pi, opIndex: oi, severity: err.severity ?? 'error', rule: err.rule, message: err.message });
    }
    states.push(snapshot(pi, front, back, racking, carrierSides));
  }

  return { initial, states, errors };
}

// ---- Internal helpers ----------------------------------------------------

interface CarrierLoop {
  carrier: CarrierId | null;
}

interface WorkingState {
  front: Map<number, CarrierLoop[]>;
  back: Map<number, CarrierLoop[]>;
  carrierSides: Map<CarrierId, CarrierSide>;
  getRacking: () => number;
  setRacking: (r: number) => void;
}

type OpError = { rule: BedStateRule; message: string; severity?: 'error' | 'warning' };

function applyOp(op: KnitoutOp, s: WorkingState): OpError | null {
  switch (op.kind) {
    case 'in':
      for (const c of op.carriers) {
        if (s.carrierSides.has(c)) {
          return { rule: 'in-carrier-already-active', message: `carrier C${c} brought in while already active` };
        }
        s.carrierSides.set(c, 'left');
      }
      return null;

    case 'out':
      for (const c of op.carriers) {
        if (!s.carrierSides.has(c)) {
          return { rule: 'out-carrier-not-active', message: `carrier C${c} taken out while not active` };
        }
        s.carrierSides.delete(c);
      }
      return null;

    case 'knit': {
      const bedMap = op.needle.bed === 'f' ? s.front : s.back;
      // Knit replaces existing loops at that needle with one new loop
      // owned by the (first) carrier. This is the v-bed physics:
      // successive knit ops on the same needle knock off the prior loop.
      const carrier = op.carriers[0] ?? null;
      if (carrier === null) {
        return { rule: 'knit-without-carrier', message: `knit at ${op.needle.bed}${op.needle.needle} has no carrier` };
      }
      if (!s.carrierSides.has(carrier)) {
        return { rule: 'carrier-not-active', message: `knit references inactive carrier C${carrier}` };
      }
      bedMap.set(op.needle.needle, [{ carrier }]);
      s.carrierSides.set(carrier, op.direction === '+' ? 'right' : 'left');
      return null;
    }

    case 'tuck': {
      // Tuck adds a loop without knocking off the existing one.
      const bedMap = op.needle.bed === 'f' ? s.front : s.back;
      const carrier = op.carriers[0] ?? null;
      if (carrier === null) {
        return { rule: 'knit-without-carrier', message: `tuck at ${op.needle.bed}${op.needle.needle} has no carrier` };
      }
      if (!s.carrierSides.has(carrier)) {
        return { rule: 'carrier-not-active', message: `tuck references inactive carrier C${carrier}` };
      }
      const existing = bedMap.get(op.needle.needle) ?? [];
      const next = [...existing, { carrier }];
      if (next.length > MAX_LOOPS_PER_NEEDLE_HARD) {
        return {
          rule: 'too-many-loops',
          message: `tuck at ${op.needle.bed}${op.needle.needle} would stack ${next.length} loops (> ${MAX_LOOPS_PER_NEEDLE_HARD})`,
        };
      }
      if (next.length > MAX_LOOPS_PER_NEEDLE_WARN) {
        bedMap.set(op.needle.needle, next);
        return {
          severity: 'warning',
          rule: 'too-many-loops',
          message: `tuck at ${op.needle.bed}${op.needle.needle} stacks ${next.length} loops (> ${MAX_LOOPS_PER_NEEDLE_WARN}) — preview-grade, swatch first`,
        };
      }
      bedMap.set(op.needle.needle, next);
      s.carrierSides.set(carrier, op.direction === '+' ? 'right' : 'left');
      return null;
    }

    case 'miss': {
      // Miss just moves the carrier — no loop change.
      const carrier = op.carriers[0] ?? null;
      if (carrier === null) return null;
      if (!s.carrierSides.has(carrier)) {
        return { rule: 'carrier-not-active', message: `miss references inactive carrier C${carrier}` };
      }
      s.carrierSides.set(carrier, op.direction === '+' ? 'right' : 'left');
      return null;
    }

    case 'split': {
      // split = knit a new loop at `from` + transfer the prior loop at
      // `from` to `to`, all in one carriage motion. Semantically equivalent
      // to `xfer from→to` then `knit + from carrier`.
      if (op.from.bed === op.to.bed) {
        return {
          rule: 'xfer-same-bed',
          message: `split must cross beds; got ${op.from.bed}${op.from.needle} → ${op.to.bed}${op.to.needle} (same bed)`,
        };
      }
      const rack = s.getRacking();
      const expectedTo =
        op.from.bed === 'f'
          ? op.from.needle - rack
          : op.from.needle + rack;
      if (op.to.needle !== expectedTo) {
        return {
          rule: 'xfer-rack-misalignment',
          message: `split ${op.from.bed}${op.from.needle} → ${op.to.bed}${op.to.needle} at rack ${rack}: destination should be ${op.to.bed}${expectedTo}`,
        };
      }
      const carrier = op.carriers[0] ?? null;
      if (carrier === null) {
        return { rule: 'knit-without-carrier', message: `split at ${op.from.bed}${op.from.needle} has no carrier` };
      }
      if (!s.carrierSides.has(carrier)) {
        return { rule: 'carrier-not-active', message: `split references inactive carrier C${carrier}` };
      }
      // Step 1: transfer the existing loop (if any) from `from` to `to`.
      const fromMap = op.from.bed === 'f' ? s.front : s.back;
      const toMap = op.to.bed === 'f' ? s.front : s.back;
      const sourceLoops = fromMap.get(op.from.needle);
      if (sourceLoops && sourceLoops.length > 0) {
        const existing = toMap.get(op.to.needle) ?? [];
        const merged = [...existing, ...sourceLoops];
        if (merged.length > MAX_LOOPS_PER_NEEDLE_HARD) {
          return {
            rule: 'too-many-loops',
            message: `split to ${op.to.bed}${op.to.needle} would stack ${merged.length} loops (> ${MAX_LOOPS_PER_NEEDLE_HARD})`,
          };
        }
        toMap.set(op.to.needle, merged);
        if (merged.length > MAX_LOOPS_PER_NEEDLE_WARN) {
          // Carrier side will be set below before we return — keep that
          // flow alive, but emit a soft warning instead of returning early.
          const warning: OpError = {
            severity: 'warning',
            rule: 'too-many-loops',
            message: `split to ${op.to.bed}${op.to.needle} stacks ${merged.length} loops (> ${MAX_LOOPS_PER_NEEDLE_WARN}) — preview-grade, swatch first`,
          };
          fromMap.set(op.from.needle, [{ carrier }]);
          s.carrierSides.set(carrier, op.direction === '+' ? 'right' : 'left');
          return warning;
        }
      }
      // Step 2: the carrier knits a new loop at `from`. Like a regular
      // knit, this replaces (knocks off) any prior loop — but the prior
      // loop was just moved to `to`, so `from` is empty before we land.
      fromMap.set(op.from.needle, [{ carrier }]);
      s.carrierSides.set(carrier, op.direction === '+' ? 'right' : 'left');
      return null;
    }

    case 'xfer': {
      // Bed crossing required — xfer is always front↔back.
      if (op.from.bed === op.to.bed) {
        return {
          rule: 'xfer-same-bed',
          message: `xfer must cross beds; got ${op.from.bed}${op.from.needle} → ${op.to.bed}${op.to.needle} (same bed)`,
        };
      }
      // Rack-alignment check. With rack R, back-bed needle b(n)
      // physically aligns with front-bed needle f(n + R). So:
      //   xfer f(n) → b(m) requires m === n - R
      //   xfer b(n) → f(m) requires m === n + R
      const rack = s.getRacking();
      const expectedTo =
        op.from.bed === 'f'
          ? op.from.needle - rack
          : op.from.needle + rack;
      if (op.to.needle !== expectedTo) {
        return {
          rule: 'xfer-rack-misalignment',
          message: `xfer ${op.from.bed}${op.from.needle} → ${op.to.bed}${op.to.needle} at rack ${rack}: destination should be ${op.to.bed}${expectedTo}`,
        };
      }
      const fromMap = op.from.bed === 'f' ? s.front : s.back;
      const toMap = op.to.bed === 'f' ? s.front : s.back;
      const loops = fromMap.get(op.from.needle);
      if (!loops || loops.length === 0) {
        return {
          rule: 'xfer-from-empty',
          message: `xfer from ${op.from.bed}${op.from.needle} → ${op.to.bed}${op.to.needle}: source needle is empty`,
        };
      }
      const existing = toMap.get(op.to.needle) ?? [];
      const merged = [...existing, ...loops];
      if (merged.length > MAX_LOOPS_PER_NEEDLE_HARD) {
        return {
          rule: 'too-many-loops',
          message: `xfer to ${op.to.bed}${op.to.needle} would stack ${merged.length} loops (> ${MAX_LOOPS_PER_NEEDLE_HARD})`,
        };
      }
      fromMap.delete(op.from.needle);
      toMap.set(op.to.needle, merged);
      if (merged.length > MAX_LOOPS_PER_NEEDLE_WARN) {
        return {
          severity: 'warning',
          rule: 'too-many-loops',
          message: `xfer to ${op.to.bed}${op.to.needle} stacks ${merged.length} loops (> ${MAX_LOOPS_PER_NEEDLE_WARN}) — preview-grade, swatch first`,
        };
      }
      return null;
    }

    case 'rack': {
      // Racking accepts integer or ±0.5.
      const doubled = op.offset * 2;
      if (!Number.isFinite(op.offset) || !Number.isInteger(doubled)) {
        return { rule: 'invalid-rack', message: `rack offset ${op.offset} is not integer or 0.5-multiple` };
      }
      s.setRacking(op.offset);
      return null;
    }

    case 'drop': {
      const bedMap = op.needle.bed === 'f' ? s.front : s.back;
      bedMap.delete(op.needle.needle);
      return null;
    }

    case 'pause':
    case 'comment':
    case 'x-stitch-number':
    case 'x-xfer-stitch-number':
    case 'x-speed-number':
    case 'x-roller-advance':
    case 'x-add-roller-advance':
    case 'x-xfer-style':
    case 'x-presser-speed':
    case 'x-presser-roller':
    case 'x-park-carriage':
    case 'x-carrier-spacing':
    case 'x-carrier-stopping-distance':
      return null;
  }
}

function snapshot(
  afterPassIndex: number,
  front: Map<number, CarrierLoop[]>,
  back: Map<number, CarrierLoop[]>,
  racking: number,
  carrierSides: Map<CarrierId, CarrierSide>,
): BedState {
  return {
    afterPassIndex,
    front: occupancyToRecord(front),
    back: occupancyToRecord(back),
    racking,
    carrierSides: Object.fromEntries(carrierSides) as Partial<Record<CarrierId, CarrierSide>>,
  };
}

function occupancyToRecord(map: Map<number, CarrierLoop[]>): BedOccupancy {
  const out: BedOccupancy = {};
  for (const [needle, loops] of map.entries()) {
    out[needle] = loops.map(l => ({ carrier: l.carrier }));
  }
  return out;
}

/** Convenience for tests / wizard: count live loops on each bed at the
 *  final pass. */
export function countLiveLoops(state: BedState): { front: number; back: number } {
  let f = 0;
  let b = 0;
  for (const loops of Object.values(state.front)) f += loops.length;
  for (const loops of Object.values(state.back)) b += loops.length;
  return { front: f, back: b };
}

/** Walk a single pass and return whether any of its ops "step" the
 *  machine (knit/tuck/miss/xfer). Used by time estimates. */
export function passIsActive(pass: PlannedPass): boolean {
  for (const op of pass.ops) {
    if (
      op.kind === 'knit' ||
      op.kind === 'tuck' ||
      op.kind === 'miss' ||
      op.kind === 'xfer'
    ) {
      return true;
    }
  }
  return false;
}
