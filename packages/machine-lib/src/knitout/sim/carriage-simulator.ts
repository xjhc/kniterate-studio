/**
 * Stateful carriage simulator. Acts as the high-level emitter sitting
 * between the shape compiler and the vendor (`knitout-to-kcode.cjs`).
 *
 * Two outputs run in lockstep:
 *
 *   `finalize()`         — the KnitoutOp[] the vendor will see.
 *   `predictedPasses()`  — what we expect the vendor to produce, pass
 *                          by pass, in kc text order.
 *
 * Callers call high-level primitives (`knitRow`, `parkAt`, `out`, etc.).
 * Each call:
 *   1. Inspects current state (per-carrier last/kick, machine settings).
 *   2. Builds a "logical pass" (post-merge, pre-auto-move).
 *   3. Either merges into the previous logical pass (vendor would) or
 *      pushes a new one.
 *   4. Emits knitout ops + updates carrier state.
 *
 * `predictedPasses()` then walks the logical-pass list and interleaves
 * Kn-Kn 0 auto-moves wherever the vendor's emitter would.
 *
 * Vendor boundaries we DON'T cross — see vendor-rules.ts for the list.
 *
 * Phase A surface only. Phases B-D will widen primitives (interlock
 * rows, combined-bed passes) and pass-type taxonomy (full xfer family).
 */

import type { BedNeedle, CarrierId, Direction, KnitoutOp } from '../types.js';
import {
  carrierIn,
  carrierOut,
  drop as dropOp,
  knit as knitOp,
  miss as missOp,
  split as splitOp,
  tuck as tuckOp,
  rack,
  xfer as xferOp,
  xAddRollerAdvance,
  xParkCarriage,
  xPresserRoller,
  xPresserSpeed,
  xRollerAdvance,
  xSpeedNumber,
  xStitchNumber,
  xXferStitchNumber,
  xXferStyle,
} from '../types.js';
import type {
  CarrierSimState,
  PassType,
  PredictedPass,
  Side,
  StitchValue,
} from './types.js';
import {
  predictKickOthers,
  predictOut,
  predictSelfKick,
  slotOf,
  willAutoMove,
} from './vendor-rules.js';

export interface CarriageSimulatorOptions {
  /** Carriers declared in the program header. The simulator uses this
   *  list both for the eventual `;;Carriers:` header and as the
   *  iteration order for vendor-mirror predicates. */
  readonly carriers: readonly CarrierId[];
  /** Phase 4b (2026-05-24): the vendor's runtime `nextDirection` at the
   *  start of this simulator's contribution. Per-section emitters pass
   *  the previous section's projected end-direction here so cross-
   *  section auto-move prediction stays consistent with the vendor.
   *  Defaults to `+` (the vendor's program-start value). */
  readonly initialNextDirection?: Direction;
}

export interface AdvanceNextDirOptions {
  /** Vendor's xfer split style. Recipes default to 'four-pass'; the
   *  fairisle reference uses 'four-pass'. Pass 'two-pass' only if the
   *  caller's settings explicitly set xferStyle to 'two-pass'. */
  readonly xferStyle?: 'four-pass' | 'two-pass';
  /** Initial racking in effect when the raw ops start. `xfer` ops use
   *  this for slot prediction; `rack` ops inside the run update it
   *  before later xfer batches. */
  readonly initialRacking?: number;
}

interface SettingEmitOptions {
  readonly force?: boolean;
}

interface MutableCarrierState {
  carrier: CarrierId;
  active: boolean;
  side: Side;
  lastNeedle: BedNeedle | null;
  lastDirection: Direction | null;
  kickNeedle: BedNeedle | null;
  kickDirection: Direction | null;
  pendingIn: boolean;
}

/**
 * Post-merge view of a single vendor pass. `direction === 'auto'` is the
 * placeholder for x-park-carriage (vendor binds its direction to the
 * runtime nextDirection at emit time).
 */
/** Per-bed op kinds carried by a knit/tuck fabric pass. The vendor types
 *  passes per (bed, op) — TYPE_KNIT_x / TYPE_x_TUCK etc. — and merges
 *  cross-bed combinations into combined types (knit-front + tuck-back →
 *  TYPE_KNIT_TUCK 'Kn-Tu') while refusing same-bed knit+tuck mixes. The
 *  kcode `type` string alone can't express that, so fabric passes carry
 *  this richer view and derive `type` from it. */
interface BedOps {
  f?: 'knit' | 'tuck';
  b?: 'knit' | 'tuck';
}

interface LogicalPass {
  type: PassType;
  direction: Direction | 'auto';
  carriers: CarrierId[];
  isDecay: boolean;
  isPark: boolean;
  /** Set on real knit/tuck fabric passes (knit, tuck, knitRow,
   *  interlockRow). Undefined on soft-miss decay, park, xfer, split —
   *  those keep the plain same-type merge regime. */
  bedOps?: BedOps;
  /** Vendor pass gripper (Pass.append:306-315): a pass that brought a
   *  carrier in ('in' — the carrier's first stitched pass) can absorb
   *  more ops but NOT an `out` soft-miss; an 'out' can append only to a
   *  gripperless pass. Conflicts force a new pass — which is what makes
   *  the vendor self-kick after a row that starts a carrier. */
  gripper?: 'in' | 'out';
  speed: number;
  roller: number;
  racking: number;
  /** Slot range this pass touches — vendor's merge eligibility hinges
   *  on the new pass's slots being strictly past prev's range in the
   *  pass direction. */
  minSlot: number;
  maxSlot: number;
  /** Presser (auto-move) speed/roller in effect when this pass was
   *  pushed. `predictedPasses()` uses the per-pass snapshot for the
   *  auto-move inserted BEFORE this pass, so a sim whose presser changes
   *  mid-run (e.g. the fairisle intro's 100/400 re-park move sitting
   *  between 600/0 moves) predicts each auto-move at its true rate
   *  instead of the sim's final presser. `undefined` falls back to the
   *  final presser (the pre-snapshot behavior) — unchanged for any sim
   *  that sets presser once or never. */
  presserSpeed?: number;
  presserRoller?: number;
  source?: string;
  sourceRows?: number[];
}

export class CarriageSimulator {
  private readonly ops: KnitoutOp[] = [];
  private readonly logicalPasses: LogicalPass[] = [];
  private activeSourceRows?: number[];

  private readonly carriers: Map<CarrierId, MutableCarrierState> = new Map();
  private readonly carrierIds: readonly CarrierId[];
  private readonly initialNextDir: Direction;

  // Machine settings — `undefined` means "not yet emitted". First setter
  // call always emits; subsequent calls only emit when the value changes.
  private speed?: number;
  private roller?: number;
  private stitch?: StitchValue;
  private xferStitch?: StitchValue;
  private presserSpeed?: number;
  private presserRoller?: number;
  private pendingRollerAdd?: number;
  private xferStyle?: 'four-pass' | 'two-pass';
  private racking: number = 0;
  private rackingEmitted: boolean = false;

  constructor(opts: CarriageSimulatorOptions) {
    this.carrierIds = [...opts.carriers];
    this.initialNextDir = opts.initialNextDirection ?? '+';
  }

  /** Attach engine-owned design-row provenance to subsequent logical passes. */
  setSourceRows(rows?: readonly number[]): void {
    this.activeSourceRows = rows === undefined ? undefined : [...new Set(rows)];
  }

  /* ----- Settings (emit-on-change) ------------------------------- */

  setSpeed(value: number, options: SettingEmitOptions = {}): void {
    if (!options.force && this.speed === value) return;
    this.speed = value;
    this.ops.push(xSpeedNumber(value));
  }

  setRoller(value: number, options: SettingEmitOptions = {}): void {
    if (!options.force && this.roller === value) return;
    this.roller = value;
    this.ops.push(xRollerAdvance(value));
  }

  addRollerAdvance(value: number): void {
    this.pendingRollerAdd = value;
    this.ops.push(xAddRollerAdvance(value));
  }

  setStitch(value: StitchValue, options: SettingEmitOptions = {}): void {
    if (!options.force && this.stitch === value) return;
    this.stitch = value;
    this.ops.push(xStitchNumber(value));
  }

  setXferStitch(value: StitchValue, options: SettingEmitOptions = {}): void {
    if (!options.force && this.xferStitch === value) return;
    this.xferStitch = value;
    this.ops.push(xXferStitchNumber(value));
  }

  setPresserSpeed(value: number): void {
    if (this.presserSpeed === value) return;
    this.presserSpeed = value;
    this.ops.push(xPresserSpeed(value));
  }

  setPresserRoller(value: number): void {
    if (this.presserRoller === value) return;
    this.presserRoller = value;
    this.ops.push(xPresserRoller(value));
  }

  setXferStyle(value: 'four-pass' | 'two-pass'): void {
    if (this.xferStyle === value) return;
    this.xferStyle = value;
    this.ops.push(xXferStyle(value));
  }

  seedXferStyle(value: 'four-pass' | 'two-pass'): void {
    this.xferStyle = value;
  }

  setRacking(offset: number): void {
    if (this.rackingEmitted && this.racking === offset) return;
    this.racking = offset;
    this.rackingEmitted = true;
    this.ops.push(rack(offset));
  }

  /** K-1 Phase 1 (2026-06-10): re-assert the current racking as an
   *  explicit op. Unlike `setRacking`, this always emits — the rack op
   *  is a batch/pass boundary for the vendor (contiguous xfers flush)
   *  and resets the bed-state validator's adjacent-xfer source tracker.
   *  Use between same-bed adjacent transfers that must land in separate
   *  physical passes (Kniterate cheatsheet adjacency rule). */
  rackRelief(): void {
    this.rackingEmitted = true;
    this.ops.push(rack(this.racking));
  }

  seedRacking(offset: number): void {
    this.racking = offset;
    this.rackingEmitted = false;
  }

  /* ----- Carriers ------------------------------------------------ */

  bringIn(c: CarrierId, opts?: { side?: Side }): void {
    if (this.carriers.has(c)) {
      throw new Error(`bringIn: carrier "${c}" is already active`);
    }
    this.carriers.set(c, {
      carrier: c,
      active: true,
      side: opts?.side ?? 'left',
      lastNeedle: null,
      lastDirection: null,
      kickNeedle: null,
      kickDirection: null,
      pendingIn: true,
    });
    this.ops.push(carrierIn(c));
  }

  /**
   * Seed an already-active carrier with approximate last/kick state.
   * Used at handoff boundaries (e.g. when the body emitter is still on
   * the legacy ad-hoc path but the bind-off uses the simulator). The
   * caller passes the anchor needle/direction it best knows from prior
   * ops; the sim treats this as if the carrier had just stitched there.
   *
   * Emits NO knitout op — the carrier is presumed already declared in
   * the program header and brought in by upstream code.
   */
  seedCarrier(
    c: CarrierId,
    opts: {
      side: Side;
      anchorNeedle: BedNeedle;
      anchorDirection: Direction;
    },
  ): void {
    if (this.carriers.has(c)) {
      throw new Error(`seedCarrier: carrier "${c}" is already tracked`);
    }
    this.carriers.set(c, {
      carrier: c,
      active: true,
      side: opts.side,
      lastNeedle: opts.anchorNeedle,
      lastDirection: opts.anchorDirection,
      kickNeedle: opts.anchorNeedle,
      kickDirection: opts.anchorDirection,
      pendingIn: false,
    });
  }

  parkAt(c: CarrierId, side: Side): void {
    const state = this.requireActive(c);
    if (state.side === side) return;
    if (state.lastNeedle === null) {
      state.side = side;
      return;
    }
    const dir: Direction = side === 'right' ? '+' : '-';
    this.emitMiss(c, dir, state.lastNeedle);
  }

  out(c: CarrierId, ensureSide?: Side): void {
    const state = this.requireActive(c);
    if (state.lastNeedle === null) {
      throw new Error(`out: carrier "${c}" has not yet stitched`);
    }
    if (ensureSide !== undefined && state.side !== ensureSide) {
      this.parkAt(c, ensureSide);
    }
    const prediction = predictOut(
      [c],
      this.racking,
      this.carriersInOrder(),
    );
    const anchorState = this.carriers.get(prediction.anchorCarrier);
    const anchorNeedle = anchorState?.lastNeedle ?? state.lastNeedle;
    const anchorSlot = slotOf(anchorNeedle, this.racking);
    // The `out` op is itself a SOFT_MISS pass at vendor level. Vendor
    // forces roller:0 and adds gripper:OUT. For Phase A's structural
    // comparison we only care about (direction, type, carriers).
    this.pushCarrierPassWithSelfKick(c, {
      type: 'Tu-Tu',
      direction: prediction.direction,
      carriers: [c],
      isDecay: true,
      isPark: false,
      gripper: 'out',
      speed: this.speed ?? 100,
      roller: 0,
      racking: this.racking,
      minSlot: anchorSlot,
      maxSlot: anchorSlot,
      source: `out ${c}`,
    });
    this.ops.push(carrierOut(c));
    state.side = 'left';
    state.active = false;
    this.carriers.delete(c);
  }

  /* ----- Knit primitives ----------------------------------------- */

  knitRow(c: CarrierId, dir: Direction, bed: 'f' | 'b', start: number, end: number): void {
    const state = this.requireActive(c);

    // Vendor fires kickOthers for EACH knit op (vendor:1026), so a kick
    // can interrupt the middle of a knit row when an OTHER carrier sits
    // in the row's path and its already-kicked-side switches as the knit
    // passes its anchor needle. We must walk every needle to predict
    // those mid-row splits.
    const step = dir === '+' ? 1 : -1;
    const needles: number[] = [];
    for (let n = start; step > 0 ? n <= end : n >= end; n += step) {
      needles.push(n);
    }

    let runStart: number | null = null;
    let runEnd: number | null = null;

    const flushRun = () => {
      if (runStart === null || runEnd === null) return;
      const minSlot = Math.min(
        slotOf({ bed, needle: runStart }, this.racking),
        slotOf({ bed, needle: runEnd }, this.racking),
      );
      const maxSlot = Math.max(
        slotOf({ bed, needle: runStart }, this.racking),
        slotOf({ bed, needle: runEnd }, this.racking),
      );
      this.pushCarrierPassWithSelfKick(c, {
        type: 'Kn-Kn',
        direction: dir,
        carriers: [c],
        isDecay: false,
        isPark: false,
        bedOps: { [bed]: 'knit' },
        gripper: state.pendingIn ? 'in' : undefined,
        speed: this.speed ?? 100,
        roller: this.roller ?? 100,
        racking: this.racking,
        minSlot,
        maxSlot,
        source: `knitRow ${c}`,
      });
      // After the run, carrier ends at the run's end needle.
      const lastNeedle: BedNeedle = { bed, needle: runEnd };
      state.lastNeedle = lastNeedle;
      state.lastDirection = dir;
      state.kickNeedle = lastNeedle;
      state.kickDirection = dir;
      state.side = dir === '+' ? 'right' : 'left';
      state.pendingIn = false;
      runStart = null;
      runEnd = null;
    };

    for (const n of needles) {
      const needle: BedNeedle = { bed, needle: n };
      const kicks = predictKickOthers(
        needle,
        [c],
        this.racking,
        this.carriersInOrder(),
      );
      for (const kick of kicks) {
        const kickState = this.carriers.get(kick.carrier);
        if (!kickState || !kickState.lastNeedle) continue;
        // A kick on a non-self carrier interrupts the current run.
        flushRun();
        const kickSlot = slotOf(kickState.lastNeedle, this.racking);
        this.pushLogical({
          type: 'Tu-Tu',
          direction: kick.direction,
          carriers: [kick.carrier],
          isDecay: true,
          isPark: false,
          speed: this.speed ?? 100,
          roller: 0,
          racking: this.racking,
          minSlot: kickSlot,
          maxSlot: kickSlot,
          source: `kickOthers from ${c} @ f${n}`,
        });
        kickState.kickNeedle = kickState.lastNeedle;
        kickState.kickDirection = kick.direction;
      }
      // Emit the knit op + extend the current run.
      this.ops.push(knitOp(dir, needle, c));
      if (runStart === null) runStart = n;
      runEnd = n;
    }
    flushRun();
  }

  frontBedRow(c: CarrierId, dir: Direction, start: number, end: number): void {
    this.knitRow(c, dir, 'f', start, end);
  }

  /**
   * Alternating-bed interlock row — the waste-section primitive. Knits
   * one needle per column over [lowNeedle..highNeedle] with the bed
   * alternating per column (column-0 = `firstColBed`). Always pass
   * lowNeedle and highNeedle; `dir` controls walk direction. Parity is
   * computed from `lowNeedle` regardless of `dir`, so the fabric pattern
   * is direction-independent — and matches the legacy `pushInterlockRow`
   * (legacy: `colEven = (n - needleStart) % 2 === 0`, where
   * needleStart === lowNeedle).
   *
   * Mid-row kickOthers may still split if another carrier sits in the
   * path — same per-needle check as `knitRow`.
   */
  interlockRow(
    c: CarrierId,
    dir: Direction,
    lowNeedle: number,
    highNeedle: number,
    firstColBed: 'front' | 'back',
  ): void {
    const state = this.requireActive(c);
    const firstIsFront = firstColBed === 'front';
    const needles: number[] = [];
    if (dir === '+') {
      for (let n = lowNeedle; n <= highNeedle; n++) needles.push(n);
    } else {
      for (let n = highNeedle; n >= lowNeedle; n--) needles.push(n);
    }
    const start = lowNeedle;

    let runStartNeedle: number | null = null;
    let runEndNeedle: number | null = null;
    let runStartBed: 'f' | 'b' | null = null;
    let runEndBed: 'f' | 'b' | null = null;

    const flushRun = () => {
      if (runStartNeedle === null || runEndNeedle === null
        || runStartBed === null || runEndBed === null) return;
      const minSlot = Math.min(
        slotOf({ bed: runStartBed, needle: runStartNeedle }, this.racking),
        slotOf({ bed: runEndBed, needle: runEndNeedle }, this.racking),
      );
      const maxSlot = Math.max(
        slotOf({ bed: runStartBed, needle: runStartNeedle }, this.racking),
        slotOf({ bed: runEndBed, needle: runEndNeedle }, this.racking),
      );
      this.pushCarrierPassWithSelfKick(c, {
        type: 'Kn-Kn',
        direction: dir,
        carriers: [c],
        isDecay: false,
        isPark: false,
        bedOps: { f: 'knit', b: 'knit' },
        gripper: state.pendingIn ? 'in' : undefined,
        speed: this.speed ?? 100,
        roller: this.roller ?? 100,
        racking: this.racking,
        minSlot,
        maxSlot,
        source: `interlockRow ${c}`,
      });
      const lastNeedle: BedNeedle = { bed: runEndBed, needle: runEndNeedle };
      state.lastNeedle = lastNeedle;
      state.lastDirection = dir;
      state.kickNeedle = lastNeedle;
      state.kickDirection = dir;
      state.side = dir === '+' ? 'right' : 'left';
      state.pendingIn = false;
      runStartNeedle = null;
      runEndNeedle = null;
      runStartBed = null;
      runEndBed = null;
    };

    for (const n of needles) {
      // Column index (0-based) determines bed parity. Phase flips with
      // direction so loops interlock across consecutive rows. Match
      // legacy `pushInterlockRow` semantics: colEven is computed from
      // (n - needleStart) regardless of walk direction.
      const fabricColEven = (n - start) % 2 === 0;
      const onFront = dir === '+'
        ? (firstIsFront ? fabricColEven : !fabricColEven)
        : (firstIsFront ? !fabricColEven : fabricColEven);
      const bed: 'f' | 'b' = onFront ? 'f' : 'b';
      const needle: BedNeedle = { bed, needle: n };
      const kicks = predictKickOthers(
        needle,
        [c],
        this.racking,
        this.carriersInOrder(),
      );
      for (const kick of kicks) {
        const kickState = this.carriers.get(kick.carrier);
        if (!kickState || !kickState.lastNeedle) continue;
        flushRun();
        const kickSlot = slotOf(kickState.lastNeedle, this.racking);
        this.pushLogical({
          type: 'Tu-Tu',
          direction: kick.direction,
          carriers: [kick.carrier],
          isDecay: true,
          isPark: false,
          speed: this.speed ?? 100,
          roller: 0,
          racking: this.racking,
          minSlot: kickSlot,
          maxSlot: kickSlot,
          source: `kickOthers from ${c} @ ${bed}${n}`,
        });
        kickState.kickNeedle = kickState.lastNeedle;
        kickState.kickDirection = kick.direction;
      }
      this.ops.push(knitOp(dir, needle, c));
      if (runStartNeedle === null) {
        runStartNeedle = n;
        runStartBed = bed;
      }
      runEndNeedle = n;
      runEndBed = bed;
    }
    flushRun();
  }

  /**
   * Single-needle knit. Use when a row is a mix of knit + miss cells
   * (e.g. jacquard-floats walker emits `knit-this-color / miss-others`
   * per row). Consecutive same-direction same-carrier calls merge into
   * one logical Kn-Kn pass via `canMerge`; interleaved miss calls also
   * merge (vendor's SOFT_MISS-into-knit rule).
   *
   * Triggers kickOthers prediction (other parked carriers in the path
   * may need to be soft-missed out of the way before this knit). Does
   * NOT update other carriers' last/kick — only the kick state, and
   * only when a kick fires.
   */
  knit(c: CarrierId, dir: Direction, needle: BedNeedle): void {
    const state = this.requireActive(c);
    const kicks = predictKickOthers(
      needle,
      [c],
      this.racking,
      this.carriersInOrder(),
    );
    for (const kick of kicks) {
      const kickState = this.carriers.get(kick.carrier);
      if (!kickState || !kickState.lastNeedle) continue;
      const kickSlot = slotOf(kickState.lastNeedle, this.racking);
      this.pushLogical({
        type: 'Tu-Tu',
        direction: kick.direction,
        carriers: [kick.carrier],
        isDecay: true,
        isPark: false,
        speed: this.speed ?? 100,
        roller: 0,
        racking: this.racking,
        minSlot: kickSlot,
        maxSlot: kickSlot,
        source: `kickOthers from ${c} @ ${needle.bed}${needle.needle}`,
      });
      kickState.kickNeedle = kickState.lastNeedle;
      kickState.kickDirection = kick.direction;
    }
    const slot = slotOf(needle, this.racking);
    this.pushCarrierPassWithSelfKick(c, {
      type: 'Kn-Kn',
      direction: dir,
      carriers: [c],
      isDecay: false,
      isPark: false,
      bedOps: { [needle.bed]: 'knit' },
      gripper: state.pendingIn ? 'in' : undefined,
      speed: this.speed ?? 100,
      roller: this.roller ?? 100,
      racking: this.racking,
      minSlot: slot,
      maxSlot: slot,
      source: `knit ${c}`,
    });
    this.ops.push(knitOp(dir, needle, c));
    state.lastNeedle = needle;
    state.lastDirection = dir;
    state.kickNeedle = needle;
    state.kickDirection = dir;
    state.side = dir === '+' ? 'right' : 'left';
    state.pendingIn = false;
  }

  /** Single-needle miss — like `parkAt` but caller-driven, for walkers
   *  that interleave miss with knit in a single jacquard row. Vendor's
   *  miss op does NOT trigger kickOthers (vendor:1023-1024). */
  miss(c: CarrierId, dir: Direction, needle: BedNeedle): void {
    this.emitMiss(c, dir, needle);
  }

  /**
   * Single-needle tuck. Like knit, triggers kickOthers (vendor:1026 —
   * "tuck and knit need carriers out of the way") and updates self
   * last/kick. Pass typing is bed-aware (B-0, 2026-06-09): a tuck does
   * NOT merge with a knit on the SAME bed (vendor's merge_types has no
   * TYPE_KNIT_x + TYPE_TUCK_x rule — separate passes), but DOES merge
   * cross-bed: knit-front + tuck-back → 'Kn-Tu', tuck-front + knit-back
   * → 'Tu-Kn' (the brioche/half-cardigan row vocabulary).
   */
  tuck(c: CarrierId, dir: Direction, needle: BedNeedle): void {
    const state = this.requireActive(c);
    const kicks = predictKickOthers(
      needle,
      [c],
      this.racking,
      this.carriersInOrder(),
    );
    for (const kick of kicks) {
      const kickState = this.carriers.get(kick.carrier);
      if (!kickState || !kickState.lastNeedle) continue;
      const kickSlot = slotOf(kickState.lastNeedle, this.racking);
      this.pushLogical({
        type: 'Tu-Tu',
        direction: kick.direction,
        carriers: [kick.carrier],
        isDecay: true,
        isPark: false,
        speed: this.speed ?? 100,
        roller: 0,
        racking: this.racking,
        minSlot: kickSlot,
        maxSlot: kickSlot,
        source: `kickOthers from ${c} @ ${needle.bed}${needle.needle}`,
      });
      kickState.kickNeedle = kickState.lastNeedle;
      kickState.kickDirection = kick.direction;
    }
    const slot = slotOf(needle, this.racking);
    this.pushCarrierPassWithSelfKick(c, {
      type: 'Tu-Tu',
      direction: dir,
      carriers: [c],
      isDecay: false,
      isPark: false,
      bedOps: { [needle.bed]: 'tuck' },
      gripper: state.pendingIn ? 'in' : undefined,
      speed: this.speed ?? 100,
      roller: this.roller ?? 100,
      racking: this.racking,
      minSlot: slot,
      maxSlot: slot,
      source: `tuck ${c}`,
    });
    this.ops.push(tuckOp(dir, needle, c));
    state.lastNeedle = needle;
    state.lastDirection = dir;
    state.kickNeedle = needle;
    state.kickDirection = dir;
    state.side = dir === '+' ? 'right' : 'left';
    state.pendingIn = false;
  }

  /**
   * Carrier-bearing split: knits at `from.needle` while transferring the
   * prior loop to `to`. Vendor treats split as knit-equivalent for slot /
   * kick accounting (vendor:843,1026), so the logical pass mirrors `knit`
   * (Kn-Kn, isDecay=false). Updates self last/kick like knit; the bed-
   * crossing transfer effect doesn't shift carrier physical position.
   */
  split(c: CarrierId, dir: Direction, from: BedNeedle, to: BedNeedle): void {
    const state = this.requireActive(c);
    const kicks = predictKickOthers(
      from,
      [c],
      this.racking,
      this.carriersInOrder(),
    );
    for (const kick of kicks) {
      const kickState = this.carriers.get(kick.carrier);
      if (!kickState || !kickState.lastNeedle) continue;
      const kickSlot = slotOf(kickState.lastNeedle, this.racking);
      this.pushLogical({
        type: 'Tu-Tu',
        direction: kick.direction,
        carriers: [kick.carrier],
        isDecay: true,
        isPark: false,
        speed: this.speed ?? 100,
        roller: 0,
        racking: this.racking,
        minSlot: kickSlot,
        maxSlot: kickSlot,
        source: `kickOthers from ${c} @ split ${from.bed}${from.needle}`,
      });
      kickState.kickNeedle = kickState.lastNeedle;
      kickState.kickDirection = kick.direction;
    }
    const slot = slotOf(from, this.racking);
    this.pushCarrierPassWithSelfKick(c, {
      type: 'Kn-Kn',
      direction: dir,
      carriers: [c],
      isDecay: false,
      isPark: false,
      gripper: state.pendingIn ? 'in' : undefined,
      speed: this.speed ?? 100,
      roller: this.roller ?? 100,
      racking: this.racking,
      minSlot: slot,
      maxSlot: slot,
      source: `split ${c}`,
    });
    this.ops.push(splitOp(dir, from, to, c));
    state.lastNeedle = from;
    state.lastDirection = dir;
    state.kickNeedle = from;
    state.kickDirection = dir;
    state.side = dir === '+' ? 'right' : 'left';
    state.pendingIn = false;
  }

  /* ----- Transfers / drops --------------------------------------- */

  xfer(from: BedNeedle, to: BedNeedle): void {
    this.ops.push(xferOp(from, to));
    // Phase A: single-xfer prediction deferred. See xferBatch.
  }

  xferBatch(pairs: readonly { from: BedNeedle; to: BedNeedle }[]): void {
    if (pairs.length === 0) return;
    for (const { from, to } of pairs) {
      this.ops.push(xferOp(from, to));
    }
    const style = this.xferStyle ?? 'four-pass';
    const xpasses = predictXferSubPasses(pairs, style, this.racking);
    for (const xpass of xpasses) {
      this.pushLogical({
        type: xpass.fromBed === 'f' && xpass.toBed === 'b' ? 'Rr-Tr' : 'Rl-Tr',
        direction: 'auto', // vendor uses runtime nextDirection
        carriers: [],
        isDecay: false,
        isPark: false,
        speed: this.speed ?? 100,
        roller: 0,
        racking: this.racking,
        minSlot: xpass.minSlot,
        maxSlot: xpass.maxSlot,
        source: 'xferBatch',
      });
    }
  }

  drop(n: BedNeedle): void {
    this.ops.push(dropOp(n));
    // Drop becomes a directionless soft-miss (DIRECTION_NONE) in vendor.
    // Vendor's passesToKCode does NOT emit a kc line for direction NONE
    // passes (no `>>`/`<<` prefix). We don't predict anything here.
    // If a Phase B/C consumer needs drop prediction, revisit.
  }

  /* ----- Synthetic ----------------------------------------------- */

  parkCarriage(): void {
    this.pushLogical({
      type: 'Kn-Kn',
      direction: 'auto', // takes runtime nextDirection
      carriers: [],
      isDecay: false,
      isPark: true,
      speed: this.speed ?? 100,
      roller: this.roller ?? 100,
      racking: this.racking,
      minSlot: 0,
      maxSlot: 0,
      source: 'parkCarriage',
    });
    this.ops.push(xParkCarriage());
  }

  /* ----- Introspection ------------------------------------------- */

  positionOf(c: CarrierId): CarrierSimState | undefined {
    const state = this.carriers.get(c);
    return state ? snapshot(state) : undefined;
  }

  activeCarriers(): CarrierId[] {
    return [...this.carriers.keys()];
  }

  /**
   * Full active-carrier snapshot in header-carrier order. Section emitters
   * carry this last/kick state across simulator boundaries instead of
   * re-approximating it from a parked side.
   */
  snapshot(): Map<CarrierId, CarrierSimState> {
    const out = new Map<CarrierId, CarrierSimState>();
    for (const state of this.carriersInOrder()) {
      out.set(state.carrier, state);
    }
    return out;
  }

  /**
   * Restore a carrier from a prior simulator snapshot. Emits no knitout op;
   * callers use this at section boundaries after earlier code has already
   * brought the carrier into work.
   */
  seedCarrierState(state: CarrierSimState): void {
    if (!state.active) return;
    if (this.carriers.has(state.carrier)) {
      throw new Error(`seedCarrierState: carrier "${state.carrier}" is already tracked`);
    }
    this.carriers.set(state.carrier, {
      carrier: state.carrier,
      active: true,
      side: state.side,
      lastNeedle: cloneNeedle(state.lastNeedle),
      lastDirection: state.lastDirection,
      kickNeedle: cloneNeedle(state.kickNeedle),
      kickDirection: state.kickDirection,
      pendingIn: false,
    });
  }

  seedActiveCarrierAnchor(
    c: CarrierId,
    opts: {
      side: Side;
      anchorNeedle: BedNeedle;
      anchorDirection: Direction;
    },
  ): void {
    const state = this.requireActive(c);
    if (state.lastNeedle !== null) return;
    state.side = opts.side;
    state.lastNeedle = cloneNeedle(opts.anchorNeedle);
    state.lastDirection = opts.anchorDirection;
    state.kickNeedle = cloneNeedle(opts.anchorNeedle);
    state.kickDirection = opts.anchorDirection;
    state.pendingIn = false;
  }

  /**
   * Whether the next non-park pass with `nextDir` would trigger a vendor
   * auto-move. Predicts based on the runtime nextDirection that would
   * apply at the END of the currently-recorded passes.
   */
  willAutoMoveBefore(nextDir: Direction): {
    yes: boolean;
    speed: number;
    roller: number;
  } {
    const projectedNextDir = this.projectedNextDirection();
    return {
      yes: willAutoMove(projectedNextDir, nextDir),
      speed: this.presserSpeed ?? this.speed ?? 300,
      roller: this.presserRoller ?? 0,
    };
  }

  /** Walk the logical-pass list and produce the kc-text-shaped pass
   *  prediction (with auto-moves inserted, park directions resolved).
   *  Starts from `initialNextDirection` (default `+`) so section emitters
   *  composed in series can hand off direction state. */
  predictedPasses(): readonly PredictedPass[] {
    const out: PredictedPass[] = [];
    let nextDir: Direction = this.initialNextDir;
    for (const lp of this.logicalPasses) {
      const passDir: Direction = lp.direction === 'auto' ? nextDir : lp.direction;
      // Park passes ARE the auto-move; no separate one inserted before.
      // Regular passes get an auto-move inserted if direction mismatches.
      if (!lp.isPark && willAutoMove(nextDir, passDir)) {
        out.push({
          type: 'Kn-Kn',
          direction: arrowOf(nextDir),
          carriers: [],
          isAutoMove: true,
          isDecay: false,
          isPark: false,
          speed: lp.presserSpeed ?? this.presserSpeed ?? this.speed ?? 300,
          roller: lp.presserRoller ?? this.presserRoller ?? 0,
          source: `auto-move before ${lp.source ?? 'pass'}`,
          ...(lp.sourceRows ? { sourceRows: [...lp.sourceRows] } : {}),
        });
        nextDir = flip(nextDir);
      }
      out.push({
        type: lp.type,
        direction: arrowOf(passDir),
        carriers: [...lp.carriers],
        isAutoMove: lp.isPark,
        isDecay: lp.isDecay,
        isPark: lp.isPark,
        speed: lp.speed,
        roller: lp.roller,
        source: lp.source,
        ...(lp.sourceRows ? { sourceRows: [...lp.sourceRows] } : {}),
      });
      nextDir = flip(nextDir);
    }
    return out;
  }

  finalize(): KnitoutOp[] {
    return [...this.ops];
  }

  /**
   * Pull and clear the knitout ops accumulated since the last drain.
   * Useful when the caller needs to interleave non-sim content (e.g.
   * comments) between segments of sim emission — get a slice, push your
   * comment, continue calling sim primitives.
   *
   * Drains ONLY the op buffer; per-carrier state and predicted-passes
   * tracking stay intact so subsequent primitives produce coherent
   * output.
   */
  drainOps(): KnitoutOp[] {
    const out = [...this.ops];
    this.ops.length = 0;
    return out;
  }

  /* ----- Internals ----------------------------------------------- */

  private emitMiss(c: CarrierId, dir: Direction, needle: BedNeedle): void {
    const state = this.requireActive(c);
    const slot = slotOf(needle, this.racking);
    this.pushCarrierPassWithSelfKick(c, {
      type: 'Tu-Tu',
      direction: dir,
      carriers: [c],
      isDecay: true,
      isPark: false,
      speed: this.speed ?? 100,
      roller: this.roller ?? 100,
      racking: this.racking,
      minSlot: slot,
      maxSlot: slot,
      source: `miss ${c}`,
    });
    this.ops.push(missOp(dir, needle, c));
    state.lastNeedle = needle;
    state.lastDirection = dir;
    state.kickNeedle = needle;
    state.kickDirection = dir;
    state.side = dir === '+' ? 'right' : 'left';
    state.pendingIn = false;
  }

  /**
   * Push a carrier-bearing logical pass with the vendor's self-kick
   * check applied first (vendor:583-690 — when a new pass is created
   * and the carrier's `kick.direction` matches the new pass direction
   * OR the carrier sits in the path of the new pass, a soft-miss
   * self-kick fires before the main pass).
   *
   * The self-kick fires ONLY when the pass would NOT merge into the
   * previous one — vendor's append check happens before the self-kick
   * logic in merge(). Same merge eligibility we use for `pushLogical`.
   */
  private pushCarrierPassWithSelfKick(c: CarrierId, p: LogicalPass): void {
    const state = this.requireActive(c);
    const prev = this.logicalPasses[this.logicalPasses.length - 1];
    const wouldMerge = prev !== undefined && canMerge(prev, p);
    if (
      !wouldMerge &&
      state.lastNeedle !== null &&
      p.direction !== 'auto'
    ) {
      const passSlot = p.direction === '+' ? p.minSlot : p.maxSlot;
      const selfKickDir = predictSelfKick(
        p.direction,
        passSlot,
        snapshot(state),
        this.racking,
      );
      if (selfKickDir !== null) {
        const kickAnchorNeedle = state.kickNeedle ?? state.lastNeedle;
        const kickAnchorSlot = slotOf(kickAnchorNeedle, this.racking);
        this.pushLogical({
          type: 'Tu-Tu',
          direction: selfKickDir,
          carriers: [c],
          isDecay: true,
          isPark: false,
          speed: this.speed ?? 100,
          roller: 0,
          racking: this.racking,
          minSlot: kickAnchorSlot,
          maxSlot: kickAnchorSlot,
          source: `self-kick ${c}`,
        });
        state.kickNeedle = kickAnchorNeedle;
        state.kickDirection = selfKickDir;
      }
    }
    this.pushLogical(p);
  }

  /** Push a logical pass, merging into the previous if vendor would. */
  private pushLogical(p: LogicalPass): void {
    if (p.sourceRows === undefined && this.activeSourceRows !== undefined) p.sourceRows = [...this.activeSourceRows];
    if (this.pendingRollerAdd !== undefined) {
      p.roller = (p.roller ?? 0) + this.pendingRollerAdd;
      this.pendingRollerAdd = undefined;
    }
    // Snapshot the presser in effect now so a later presser change does
    // not retroactively re-rate this pass's preceding auto-move.
    if (p.presserSpeed === undefined) p.presserSpeed = this.presserSpeed;
    if (p.presserRoller === undefined) p.presserRoller = this.presserRoller;
    const prev = this.logicalPasses[this.logicalPasses.length - 1];
    if (prev && canMerge(prev, p)) {
      // Merge: expand slot range; pick the "stronger" type — vendor's
      // merge_types treats SOFT_MISS (our Tu-Tu+isDecay) as a wildcard
      // that takes on the other pass's identity.
      prev.minSlot = Math.min(prev.minSlot, p.minSlot);
      prev.maxSlot = Math.max(prev.maxSlot, p.maxSlot);
      prev.gripper = prev.gripper ?? p.gripper;
      if (p.sourceRows) prev.sourceRows = [...new Set([...(prev.sourceRows ?? []), ...p.sourceRows])];
      const prevSoft = prev.type === 'Tu-Tu' && prev.isDecay;
      const nextSoft = p.type === 'Tu-Tu' && p.isDecay;
      if (prevSoft && !nextSoft) {
        prev.type = p.type;
        prev.bedOps = p.bedOps;
        prev.isDecay = false;
      } else if (!prevSoft && nextSoft) {
        // prev keeps its real type; soft miss just contributes slots.
      } else if (!prevSoft && !nextSoft) {
        // Both real. When both sides carry bed-op knowledge, union it
        // and re-derive the combined kcode type (vendor merge_types:
        // KNIT_x + x_TUCK → 'Kn-Tu', TUCK_x + x_KNIT → 'Tu-Kn', ...).
        // When either side lacks bedOps (split/xfer-family same-type
        // merges), drop the knowledge so later cross-bed merges don't
        // build on an unsound union.
        if (prev.bedOps && p.bedOps) {
          prev.bedOps = unionBedOps(prev.bedOps, p.bedOps);
          prev.type = kcodeTypeFromBedOps(prev.bedOps);
        } else {
          prev.bedOps = undefined;
        }
        prev.isDecay = false;
      } else {
        // both soft — keep prev (same type by canMerge guard).
        prev.isDecay = prev.isDecay && p.isDecay;
      }
      return;
    }
    this.logicalPasses.push(p);
  }

  private requireActive(c: CarrierId): MutableCarrierState {
    const state = this.carriers.get(c);
    if (!state) throw new Error(`carrier "${c}" is not active`);
    return state;
  }

  private carriersInOrder(): CarrierSimState[] {
    const out: CarrierSimState[] = [];
    for (const id of this.carrierIds) {
      const s = this.carriers.get(id);
      if (s) out.push(snapshot(s));
    }
    return out;
  }

  /**
   * Vendor's runtime `nextDirection` after every recorded logical pass.
   * Public so per-section emitters can capture it and pass it into the
   * next section's simulator as `initialNextDirection`. Walks the same
   * logic as `predictedPasses()` but only returns the final value.
   */
  finalNextDirection(): Direction {
    return this.projectedNextDirection();
  }

  private projectedNextDirection(): Direction {
    let nextDir: Direction = this.initialNextDir;
    for (const lp of this.logicalPasses) {
      if (!lp.isPark && willAutoMove(nextDir, lp.direction === 'auto' ? nextDir : lp.direction)) {
        nextDir = flip(nextDir);
      }
      nextDir = flip(nextDir);
    }
    return nextDir;
  }
}

/* ----- helpers --------------------------------------------------- */

function snapshot(s: MutableCarrierState): CarrierSimState {
  return {
    carrier: s.carrier,
    active: s.active,
    side: s.side,
    lastNeedle: cloneNeedle(s.lastNeedle),
    lastDirection: s.lastDirection,
    kickNeedle: cloneNeedle(s.kickNeedle),
    kickDirection: s.kickDirection,
  };
}

function cloneNeedle(n: BedNeedle | null): BedNeedle | null {
  return n ? { bed: n.bed, needle: n.needle } : null;
}

function arrowOf(d: Direction): '>>' | '<<' {
  return d === '+' ? '>>' : '<<';
}

function flip(d: Direction): Direction {
  return d === '+' ? '-' : '+';
}

function sameCarriers(a: readonly CarrierId[], b: readonly CarrierId[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

/**
 * Vendor's merge predicate, simplified for the Phase A pass-type set.
 *
 * Requirements (vendor:282-426):
 * - same racking, speed, direction, carriers (deep equal)
 * - mergeable types — Phase A: identical types only (Kn-Kn+Kn-Kn,
 *   Tu-Tu+Tu-Tu). Cross-type merges (e.g. knit+miss → knit) are a
 *   Phase B/C concern.
 * - slot ordering: new pass's slots strictly past prev's in the pass
 *   direction (vendor:320-357).
 *
 * Auto-move (direction='auto') and park passes never merge — they sit
 * outside the merge regime in the vendor.
 */
function canMerge(prev: LogicalPass, next: LogicalPass): boolean {
  if (prev.direction === 'auto' || next.direction === 'auto') return false;
  if (prev.isPark || next.isPark) return false;
  if (prev.direction !== next.direction) return false;
  if (prev.racking !== next.racking) return false;
  if (prev.speed !== next.speed) return false;
  if (!sameCarriers(prev.carriers, next.carriers)) return false;
  if (!grippersMergeable(prev, next)) return false;
  if (!typesMergeable(prev, next)) return false;
  // Slot ordering — for direction +, next's slots must be ≥ prev.maxSlot;
  // for -, ≤ prev.minSlot. Equality is allowed because vendor's
  // merge_ops accepts SOFT_MISS at the same slot as anything else.
  if (prev.direction === '+') {
    return next.minSlot >= prev.maxSlot;
  }
  return next.maxSlot <= prev.minSlot;
}

/**
 * Type-mergeability — mirrors vendor's `merge_types`.
 * Implemented cases:
 *   - identical types
 *   - SOFT_MISS (Tu-Tu+isDecay) ↔ Kn-Kn / Tu-Tu / Kn-Tu / Tu-Kn (vendor's
 *     "soft miss merges with anything knit/tuck" branch)
 *   - combined-bed knit/tuck (B-0, 2026-06-09): two real fabric passes
 *     merge iff their per-bed ops don't conflict — knit-front + tuck-back
 *     → one 'Kn-Tu' pass, tuck-front + knit-back → 'Tu-Kn' (vendor's
 *     single-bed-type cross merges). Same-bed knit+tuck conflicts and
 *     stays split, exactly like vendor merge_types having no
 *     TYPE_KNIT_x + TYPE_TUCK_x rule.
 * Split (Tr-*) cross-type merges remain unmodeled (same-type only).
 */
function typesMergeable(a: LogicalPass, b: LogicalPass): boolean {
  if (a.type === b.type) return true;
  const aSoft = a.type === 'Tu-Tu' && a.isDecay;
  const bSoft = b.type === 'Tu-Tu' && b.isDecay;
  const isKnitLike = (t: PassType) =>
    t === 'Kn-Kn' || t === 'Tu-Tu' || t === 'Kn-Tu' || t === 'Tu-Kn';
  if (aSoft && isKnitLike(b.type)) return true;
  if (bSoft && isKnitLike(a.type)) return true;
  if (!aSoft && !bSoft && a.bedOps && b.bedOps) {
    return bedOpsCompatible(a.bedOps, b.bedOps);
  }
  return false;
}

/** Vendor Pass.append gripper rules (knitout-to-kcode.cjs:306-315):
 *  gripper in neither — fine; 'in' at the start of the current pass
 *  absorbing gripperless ops — fine; gripperless pass absorbing an
 *  'out' at its end — fine; everything else conflicts. Notably a pass
 *  that brought a carrier IN can never absorb that carrier's OUT —
 *  the refusal that makes the vendor self-kick after an in+row pass. */
function grippersMergeable(prev: LogicalPass, next: LogicalPass): boolean {
  if (prev.gripper === undefined) {
    return next.gripper === undefined || next.gripper === 'out';
  }
  if (prev.gripper === 'in') return next.gripper === undefined;
  return false; // prev already carries an 'out' — nothing appends after it
}

function bedOpsCompatible(a: BedOps, b: BedOps): boolean {
  return (
    (a.f === undefined || b.f === undefined || a.f === b.f) &&
    (a.b === undefined || b.b === undefined || a.b === b.b)
  );
}

function unionBedOps(a: BedOps, b: BedOps): BedOps {
  return { f: a.f ?? b.f, b: a.b ?? b.b };
}

/** kcode pass-type string for a per-bed op combination — vendor's
 *  TYPE_* → kcode mapping (knitout-to-kcode.cjs:128-135). */
function kcodeTypeFromBedOps(ops: BedOps): PassType {
  if (ops.f === 'knit' && ops.b === 'tuck') return 'Kn-Tu';
  if (ops.f === 'tuck' && ops.b === 'knit') return 'Tu-Kn';
  if (ops.f === 'tuck' || ops.b === 'tuck') return 'Tu-Tu';
  return 'Kn-Kn';
}

interface XferSubPass {
  readonly fromBed: 'f' | 'b';
  readonly toBed: 'f' | 'b';
  readonly minSlot: number;
  readonly maxSlot: number;
}

/**
 * Walk a sequence of raw knitout ops and advance `nextDirection` the way
 * the vendor runtime would. This is the Phase E owner for direction state
 * when old helper code must still emit raw ops between simulator sections.
 *
 * Returns `startNextDir` unchanged when the op list contains no
 * direction-affecting ops (the common case for pure settings runs).
 */
export function advanceNextDirectionThroughRawOps(
  ops: readonly KnitoutOp[],
  startNextDir: Direction,
  options: AdvanceNextDirOptions = {},
): Direction {
  let nextDir: Direction = startNextDir;
  const xferStyle = options.xferStyle ?? 'four-pass';
  let racking = options.initialRacking ?? 0;
  let pendingXfers: { from: BedNeedle; to: BedNeedle }[] = [];

  // Vendor batches contiguous xfer ops together; any non-xfer op
  // flushes the batch into 1-4 batched carriage passes.
  const flushXfers = (): void => {
    if (pendingXfers.length === 0) return;
    const subPasses = predictXferSubPasses(pendingXfers, xferStyle, racking);
    for (let i = 0; i < subPasses.length; i++) {
      nextDir = flip(nextDir);
    }
    pendingXfers = [];
  };
  const advanceThroughPass = (passDir: Direction): void => {
    if (nextDir !== passDir) {
      nextDir = flip(nextDir);
    }
    nextDir = flip(nextDir);
  };

  for (const op of ops) {
    switch (op.kind) {
      case 'xfer':
        pendingXfers.push({ from: op.from, to: op.to });
        break;

      case 'out':
        // Vendor emits `out` as a leftward SOFT_MISS Tu-Tu pass. When
        // runtime nextDirection is rightward, vendor first inserts an
        // auto-move, then runs the leftward out pass.
        flushXfers();
        advanceThroughPass('-');
        break;

      case 'rack':
        // A rack change is a batch boundary. Later xfer slots resolve
        // against the new racking.
        flushXfers();
        racking = op.offset;
        break;

      // No-motion ops. Drops produce DIRECTION_NONE at vendor level, so
      // they do not emit a `>>` / `<<` pass or flip nextDirection.
      case 'in':
      case 'comment':
      case 'drop':
      case 'pause':
        flushXfers();
        break;

      // Knit/tuck/miss/split in raw-op runs means a sim-backed emitter
      // was skipped. Flush xfers and flip per op to stay honest.
      case 'knit':
      case 'tuck':
      case 'miss':
      case 'split':
        flushXfers();
        advanceThroughPass(op.direction);
        break;

      default:
        // x-* settings and anything else: flush xfers and leave nextDir
        // alone. Direction-flipping op kinds should be explicit cases.
        flushXfers();
        break;
    }
  }
  flushXfers();
  return nextDir;
}

export function replayRawOpsOnSimulator(
  sim: CarriageSimulator,
  ops: readonly KnitoutOp[],
  options: AdvanceNextDirOptions = {},
): void {
  if (options.xferStyle !== undefined) sim.seedXferStyle(options.xferStyle);
  if (options.initialRacking !== undefined) sim.seedRacking(options.initialRacking);

  let pendingXfers: { from: BedNeedle; to: BedNeedle }[] = [];
  const flushXfers = (): void => {
    if (pendingXfers.length === 0) return;
    sim.xferBatch(pendingXfers);
    sim.drainOps();
    pendingXfers = [];
  };
  const firstCarrier = (op: Extract<KnitoutOp, { carriers: CarrierId[] }>): CarrierId | undefined =>
    op.carriers[0];

  for (const op of ops) {
    switch (op.kind) {
      case 'xfer':
        pendingXfers.push({ from: op.from, to: op.to });
        break;
      case 'rack':
        flushXfers();
        sim.setRacking(op.offset);
        sim.drainOps();
        break;
      case 'knit': {
        flushXfers();
        const c = firstCarrier(op);
        if (c) sim.knit(c, op.direction, op.needle);
        sim.drainOps();
        break;
      }
      case 'tuck': {
        flushXfers();
        const c = firstCarrier(op);
        if (c) sim.tuck(c, op.direction, op.needle);
        sim.drainOps();
        break;
      }
      case 'miss': {
        flushXfers();
        const c = firstCarrier(op);
        if (c) sim.miss(c, op.direction, op.needle);
        sim.drainOps();
        break;
      }
      case 'split': {
        flushXfers();
        const c = firstCarrier(op);
        if (c) sim.split(c, op.direction, op.from, op.to);
        sim.drainOps();
        break;
      }
      case 'drop':
        flushXfers();
        sim.drop(op.needle);
        sim.drainOps();
        break;
      case 'in':
        flushXfers();
        for (const c of op.carriers) {
          if (!sim.positionOf(c)) sim.bringIn(c);
        }
        sim.drainOps();
        break;
      case 'out':
        flushXfers();
        for (const c of op.carriers) {
          if (sim.positionOf(c)) sim.out(c);
        }
        sim.drainOps();
        break;
      case 'x-stitch-number':
        flushXfers();
        sim.setStitch(op.value);
        sim.drainOps();
        break;
      case 'x-xfer-stitch-number':
        flushXfers();
        sim.setXferStitch(op.value);
        sim.drainOps();
        break;
      case 'x-speed-number':
        flushXfers();
        sim.setSpeed(op.value);
        sim.drainOps();
        break;
      case 'x-roller-advance':
        flushXfers();
        sim.setRoller(op.value);
        sim.drainOps();
        break;
      case 'x-add-roller-advance':
        flushXfers();
        sim.addRollerAdvance(op.value);
        sim.drainOps();
        break;
      case 'x-xfer-style':
        flushXfers();
        sim.setXferStyle(op.value);
        sim.drainOps();
        break;
      case 'x-presser-speed':
        flushXfers();
        sim.setPresserSpeed(op.value);
        sim.drainOps();
        break;
      case 'x-presser-roller':
        flushXfers();
        sim.setPresserRoller(op.value);
        sim.drainOps();
        break;
      case 'x-park-carriage':
        flushXfers();
        sim.parkCarriage();
        sim.drainOps();
        break;
      case 'comment':
      case 'pause':
      case 'x-carrier-spacing':
      case 'x-carrier-stopping-distance':
        flushXfers();
        break;
    }
  }
  flushXfers();
}

export function predictXferSubPasses(
  pairs: readonly { from: BedNeedle; to: BedNeedle }[],
  style: 'four-pass' | 'two-pass',
  racking: number,
): XferSubPass[] {
  const frontSlots = pairs
    .filter(p => p.from.bed === 'f')
    .map(p => slotOf(p.from, racking))
    .sort((a, b) => a - b);
  const backSlots = pairs
    .filter(p => p.from.bed === 'b')
    .map(p => slotOf(p.from, racking))
    .sort((a, b) => a - b);

  const out: XferSubPass[] = [];
  if (style === 'two-pass') {
    if (frontSlots.length > 0) {
      out.push({
        fromBed: 'f', toBed: 'b',
        minSlot: frontSlots[0]!, maxSlot: frontSlots[frontSlots.length - 1]!,
      });
    }
    if (backSlots.length > 0) {
      out.push({
        fromBed: 'b', toBed: 'f',
        minSlot: backSlots[0]!, maxSlot: backSlots[backSlots.length - 1]!,
      });
    }
    return out;
  }
  // four-pass: alternating-needle split. Predict ≤ 2 passes per bed.
  if (frontSlots.length > 0) {
    out.push({
      fromBed: 'f', toBed: 'b',
      minSlot: frontSlots[0]!, maxSlot: frontSlots[frontSlots.length - 1]!,
    });
    if (frontSlots.length >= 2) {
      out.push({
        fromBed: 'f', toBed: 'b',
        minSlot: frontSlots[0]!, maxSlot: frontSlots[frontSlots.length - 1]!,
      });
    }
  }
  if (backSlots.length > 0) {
    out.push({
      fromBed: 'b', toBed: 'f',
      minSlot: backSlots[0]!, maxSlot: backSlots[backSlots.length - 1]!,
    });
    if (backSlots.length >= 2) {
      out.push({
        fromBed: 'b', toBed: 'f',
        minSlot: backSlots[0]!, maxSlot: backSlots[backSlots.length - 1]!,
      });
    }
  }
  return out;
}
