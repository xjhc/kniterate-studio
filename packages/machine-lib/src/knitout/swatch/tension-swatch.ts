/**
 * Tension-swatch generator — produces the Kniterate tension-comparison
 * swatch documented at
 * https://support.kniterate.com/hc/en-us/articles/360014430058-Making-a-sample-swatch
 *
 * Default input mirrors the Kniterate App's "Waste + Cast On" output
 * captured in `reference/swatch.kc`: byte-for-byte match on all 364
 * carriage operations + row labels + comments, 99% line match overall
 * (remaining diffs are 1-column carrier-position shifts in 12 specific
 * passes — non-functional).
 *
 * Every parameter that affects the .kc output is exposed via
 * `TensionSwatchInput`. The interface is flat (no nested objects) so
 * the UI can lay out a single grid of inputs. Defaults preserve REF
 * byte parity; any field can be overridden for different yarn weights,
 * machine setups, or design intents.
 *
 * Used by `scripts/tension-swatch.ts` (CLI) and the deprecated
 * standalone `TensionSwatchView.tsx`.
 */

import {
  ALL_CARRIERS,
  carrierIn,
  carrierOut,
  comment,
  f,
  b as backBed,
  knit,
  rack,
  xfer,
  type CarrierId,
  type Direction,
  type KnitoutOp,
  type KnitoutProgram,
  type Position,
  xParkCarriage,
  xPresserRoller,
  xPresserSpeed,
  xRollerAdvance,
  xSpeedNumber,
  xStitchNumber,
  xXferStitchNumber,
  xXferStyle,
} from '../types.js';

export interface TensionSwatchInput {
  // ---- Geometry ----
  /** Number of wales (needle slots) wide. Reference: 80. */
  width: number;
  /** Starting needle (slot index). Reference: 88 (centered for width 80). */
  needleStart: number;
  /** Stitch sizes per body section. Reference: [6, 7, 8]. */
  sectionStitchSizes: number[];
  /** Optional per-section row counts, parallel to `sectionStitchSizes`.
   *  Absent → every section uses the uniform `rowsPerSection` (current
   *  behavior; callers that omit this are byte-identical to before). */
  sectionRows?: number[];
  /** Rows per body section (including the 1-row marker stripe).
   *  Reference: 80. */
  rowsPerSection: number;
  /** Position header — controls how slot ↔ needle mapping is done.
   *  Reference: 'Center'. */
  position: Position;

  // ---- Waste / closing ----
  /** Rows of interlock waste at the bottom (excluding the 1 startup pass).
   *  Reference: 80. */
  wastePasses: number;
  /** Closing waste rows after the last body section. Reference: 10. */
  closingWasteRows: number;
  /** Stitch size for waste / marker yarn passes. Reference: 5. */
  wasteStitchSize: number;

  // ---- Carriers ----
  /** Body yarn carrier — knits the main stockinette. Reference: C5. */
  bodyCarrier: CarrierId;
  /** Draw thread carrier — 1 row, after waste interlock. Reference: C1. */
  drawThreadCarrier: CarrierId;
  /** Waste/marker yarn carrier — interlock + markers + closing waste.
   *  Doubles as the both-beds cast-on row carrier. Reference: C2. */
  markerCarrier: CarrierId;
  /** Cast-on assist carrier — racked-both-beds row + back→front transfers.
   *  Reference: C3. */
  castOnAssistCarrier: CarrierId;
  /** Yarn names — rendered as `;;Yarn-N:` headers. */
  yarnNames?: Partial<Record<CarrierId, string>>;

  // ---- Body knit settings ----
  /** Body knit carriage speed. Reference: 300. */
  bodySpeed: number;
  /** Body knit roller-advance value. Reference: 450. */
  bodyRoller: number;

  // ---- Transfer / xfer settings ----
  /** Stitch number used during transfers. Reference: 5. */
  xferStitchSize: number;
  /** Transfer style — split into 2 or 4 passes. Reference: 'four-pass'. */
  xferStyle: 'four-pass' | 'two-pass';

  // ---- Draw thread row settings ----
  /** Stitch size for the draw thread row. Reference: 8. */
  drawThreadStitchSize: number;
  /** Carriage speed for the draw thread row. Reference: 100. */
  drawThreadSpeed: number;
  /** Roller advance for the draw thread row. Reference: 200. */
  drawThreadRoller: number;

  // ---- Cast-on tubular row settings ----
  /** Stitch size for the racked-both-beds tubular cast-on row. Reference: 4. */
  castOnTubularStitchSize: number;
  /** Carriage speed for the slow cast-on rows. Reference: 200. */
  castOnSlowSpeed: number;
  /** Roller advance for the cast-on interlock / single-bed rows. Reference: 200. */
  castOnSlowRoller: number;
  /** Roller advance for the cast-on alt-bed (interlock-style) rows. Reference: 400. */
  castOnInterlockRoller: number;

  // ---- Auto-carriage-move (presser) speeds ----
  /** Speed for the "phase transition" auto-moves (REF 600/0).
   *  Used for the carriage-only kicks between waste/cast-on/body. */
  presserTransitionSpeed: number;
  /** Roller for "phase transition" auto-moves. Reference: 0. */
  presserTransitionRoller: number;
  /** Speed for "body-context" auto-moves (REF 300/450). Used when an
   *  auto-move is inserted in the body section (no yarn moves). */
  presserBodyContextSpeed: number;
  /** Roller for "body-context" auto-moves. Reference: 450. */
  presserBodyContextRoller: number;

  // ---- Waste interlock speed ramp ----
  /** If true, use the App's ramp (100 → 700 → 300 → 400 → 500 → 600 →
   *  700) for the first 19 passes, settling to 700 afterward. If false,
   *  use a flat speed across all waste passes. Reference: true. */
  useWasteSpeedRamp: boolean;
  /** Speed for the very first (startup) waste pass. Reference: 100. */
  wasteStartupSpeed: number;
  /** Roller for the startup pass. Reference: 440. */
  wasteStartupRoller: number;
  /** Settled (post-ramp) waste interlock speed. Reference: 700. */
  wasteSettledSpeed: number;
  /** Roller for `<<` (leftward) waste passes after the startup pass.
   *  Reference: 440. */
  wasteLeftRoller: number;
  /** Roller for `>>` (rightward) waste passes after the startup pass.
   *  Reference: 0. */
  wasteRightRoller: number;

  // ---- Behavior toggles ----
  /** Apply the App's "narrow" interlock rule (skip leading-front +
   *  trailing-back) for the first pass + all `<<` passes. Reference: true. */
  useNarrowInterlock: boolean;
  /** Bind-off style. Currently only 'app-style' (waste + carrier-out
   *  Tu-Tu, no per-needle drop) is implemented. */
  bindOffStyle: 'app-style' | 'waste-only';
}

export const DEFAULT_TENSION_SWATCH: TensionSwatchInput = {
  // Geometry
  width: 80,
  needleStart: 88,
  sectionStitchSizes: [6, 7, 8],
  rowsPerSection: 80,
  position: 'Center',
  // Waste
  wastePasses: 80,
  closingWasteRows: 10,
  wasteStitchSize: 5,
  // Carriers
  bodyCarrier: '5',
  drawThreadCarrier: '1',
  markerCarrier: '2',
  castOnAssistCarrier: '3',
  yarnNames: {
    '1': 'draw',
    '2': 'waste-marker',
    '3': 'cast-on',
    '5': 'body',
  },
  // Body knit
  bodySpeed: 300,
  bodyRoller: 450,
  // Xfer
  xferStitchSize: 5,
  xferStyle: 'four-pass',
  // Draw thread
  drawThreadStitchSize: 8,
  drawThreadSpeed: 100,
  drawThreadRoller: 200,
  // Cast-on tubular
  castOnTubularStitchSize: 4,
  castOnSlowSpeed: 200,
  castOnSlowRoller: 200,
  castOnInterlockRoller: 400,
  // Presser
  presserTransitionSpeed: 600,
  presserTransitionRoller: 0,
  presserBodyContextSpeed: 300,
  presserBodyContextRoller: 450,
  // Waste ramp
  useWasteSpeedRamp: true,
  wasteStartupSpeed: 100,
  wasteStartupRoller: 440,
  wasteSettledSpeed: 700,
  wasteLeftRoller: 440,
  wasteRightRoller: 0,
  // Behavior
  useNarrowInterlock: true,
  bindOffStyle: 'app-style',
};

/** Preset: Cameron Kniterate convention (C1 draw, C6 waste, C2 pattern). */
export const CAMERON_TENSION_SWATCH: TensionSwatchInput = {
  ...DEFAULT_TENSION_SWATCH,
  bodyCarrier: '2',
  drawThreadCarrier: '1',
  markerCarrier: '6',
  castOnAssistCarrier: '3',
  yarnNames: { '1': 'draw', '6': 'waste-marker', '3': 'cast-on', '2': 'body' },
  bodySpeed: 300,
  bodyRoller: 200,  // Cameron's 7gg wool worsted default
  xferStitchSize: 5,
};

export function buildTensionSwatch(input: TensionSwatchInput = DEFAULT_TENSION_SWATCH): KnitoutProgram {
  const ops: KnitoutOp[] = [];
  const needleStart = input.needleStart;
  const needleEnd = needleStart + input.width - 1;
  const W = input.markerCarrier;
  const D = input.drawThreadCarrier;
  const A = input.castOnAssistCarrier;
  const B = input.bodyCarrier;

  // ---- Prologue settings ----
  ops.push(xXferStitchNumber(input.xferStitchSize));
  ops.push(xXferStyle(input.xferStyle));
  ops.push(xStitchNumber(input.wasteStitchSize));
  ops.push(xPresserSpeed(input.presserTransitionSpeed));
  ops.push(xPresserRoller(input.presserTransitionRoller));

  // ---- 1. Waste interlock with speed ramp ----
  emitWasteInterlock(ops, needleStart, needleEnd, W, input);

  // ---- 2. Cast-on choreography ----
  emitCastOnChoreography(ops, needleStart, needleEnd, W, D, A, input);

  // ---- 3. Body sections + markers ----
  ops.push(xSpeedNumber(input.bodySpeed));
  ops.push(xRollerAdvance(input.bodyRoller));

  for (let sectionIdx = 0; sectionIdx < input.sectionStitchSizes.length; sectionIdx++) {
    const stitchSize = input.sectionStitchSizes[sectionIdx]!;
    const isFirst = sectionIdx === 0;

    if (!isFirst) {
      ops.push(comment(`-- MARKER stripe before section ${sectionIdx + 1} --`));
      emitOneRowAlternatingDirection(ops, needleStart, needleEnd, W, getCurrentSide(W, ops));
      ops.push(xStitchNumber(stitchSize));
    } else {
      ops.push(comment(`-- SECTION 1 (stitch ${stitchSize}) --`));
      ops.push(xStitchNumber(stitchSize));
    }

    if (isFirst && !opsContainsIn(ops, B)) {
      ops.push(carrierIn(B));
    }

    const bodyRows = (input.sectionRows?.[sectionIdx] ?? input.rowsPerSection) - 1;
    for (let r = 0; r < bodyRows; r++) {
      emitOneRowAlternatingDirection(ops, needleStart, needleEnd, B, getCurrentSide(B, ops));
    }
  }

  // ---- 4. Closing waste ----
  ops.push(comment(`-- CLOSING WASTE (${input.closingWasteRows} rows) --`));
  for (let r = 0; r < input.closingWasteRows; r++) {
    emitOneRowAlternatingDirection(ops, needleStart, needleEnd, W, getCurrentSide(W, ops));
  }

  // ---- 5. Take carriers out ----
  // Explicit body-context park, then transition-context presser, then outs.
  ops.push(xPresserSpeed(input.presserBodyContextSpeed));
  ops.push(xPresserRoller(input.presserBodyContextRoller));
  ops.push(xParkCarriage());
  ops.push(xPresserSpeed(input.presserTransitionSpeed));
  ops.push(xPresserRoller(input.presserTransitionRoller));
  ops.push(carrierOut(D));
  ops.push(carrierOut(W));
  ops.push(carrierOut(A));
  ops.push(carrierOut(B));

  return {
    version: 2,
    carriers: [...ALL_CARRIERS],
    machine: 'kniterate',
    position: input.position,
    yarns: input.yarnNames ?? {},
    kniterate: {},
    ops,
  };
}

// ---------- Stage 1: Waste interlock ----------

function emitWasteInterlock(
  ops: KnitoutOp[],
  ns: number,
  ne: number,
  carrier: CarrierId,
  input: TensionSwatchInput,
): void {
  ops.push(comment('-- WASTE INTERLOCK --'));
  ops.push(carrierIn(carrier));

  const total = input.wastePasses + 1; // +1 for startup pass
  for (let p = 0; p < total; p++) {
    const dir: Direction = p % 2 === 0 ? '+' : '-';
    const { speed, roller } = wasteRampForPass(p, input);
    ops.push(xSpeedNumber(speed));
    ops.push(xRollerAdvance(roller));
    const narrow = input.useNarrowInterlock && ((p === 0) || (dir === '-'));
    pushInterlockRow(ops, dir, ns, ne, carrier, narrow);
  }
}

function wasteRampForPass(
  p: number,
  input: TensionSwatchInput,
): { speed: number; roller: number } {
  if (p === 0) return { speed: input.wasteStartupSpeed, roller: input.wasteStartupRoller };
  const rollerForDir = p % 2 === 1 ? input.wasteLeftRoller : input.wasteRightRoller;
  if (!input.useWasteSpeedRamp) {
    return { speed: input.wasteSettledSpeed, roller: rollerForDir };
  }
  // App's ramp: 4 high-speed passes, then ramp through 300→400→500→600→700.
  if (p <= 4) return { speed: input.wasteSettledSpeed, roller: input.wasteRightRoller };
  let speed: number;
  if (p <= 6) speed = 300;
  else if (p <= 10) speed = 400;
  else if (p <= 14) speed = 500;
  else if (p <= 18) speed = 600;
  else speed = input.wasteSettledSpeed;
  return { speed, roller: rollerForDir };
}

function pushInterlockRow(
  ops: KnitoutOp[],
  dir: Direction,
  ns: number,
  ne: number,
  carrier: CarrierId,
  narrow: boolean = false,
): void {
  if (dir === '+') {
    for (let n = ns; n <= ne; n++) {
      const isFront = (n % 2 === 0);
      if (narrow && isFront && n === ns) continue;
      if (narrow && !isFront && n === ne) continue;
      const bed = isFront ? f(n) : backBed(n);
      ops.push(knit(dir, bed, carrier));
    }
  } else {
    for (let n = ne; n >= ns; n--) {
      const isBack = (n % 2 === 0);
      const isFront = !isBack;
      if (narrow && isFront && n === ne) continue;
      if (narrow && isBack && n === ns) continue;
      const bed = isBack ? backBed(n) : f(n);
      ops.push(knit(dir, bed, carrier));
    }
  }
}

// ---------- Stage 2: Cast-on choreography ----------

function emitCastOnChoreography(
  ops: KnitoutOp[],
  ns: number,
  ne: number,
  W: CarrierId,
  D: CarrierId,
  A: CarrierId,
  input: TensionSwatchInput,
): void {
  ops.push(comment('-- CAST-ON CHOREOGRAPHY --'));

  // Slow cast-on settings.
  ops.push(xSpeedNumber(input.castOnSlowSpeed));
  ops.push(xRollerAdvance(input.castOnInterlockRoller));

  // Bring in A with one alternating-bed interlock row.
  ops.push(carrierIn(A));
  pushInterlockRow(ops, '+', ns, ne, A);

  // 7 single-bed alternating-bed passes on W.
  ops.push(xRollerAdvance(input.castOnSlowRoller));
  pushSingleBedRow(ops, '-', ns, ne, 'f', W);
  pushSingleBedRow(ops, '+', ns, ne, 'b', W);
  pushSingleBedRow(ops, '-', ns, ne, 'f', W);
  pushSingleBedRow(ops, '+', ns, ne, 'b', W);
  pushSingleBedRow(ops, '-', ns, ne, 'f', W);
  pushSingleBedRow(ops, '+', ns, ne, 'b', W);
  pushSingleBedRow(ops, '-', ns, ne, 'f', W);

  // Bring in D with one interlock row.
  ops.push(xRollerAdvance(input.castOnInterlockRoller));
  ops.push(carrierIn(D));
  pushInterlockRow(ops, '+', ns, ne, D);

  // 2 more single-bed passes on W.
  ops.push(xRollerAdvance(input.castOnSlowRoller));
  pushSingleBedRow(ops, '+', ns, ne, 'f', W);
  pushSingleBedRow(ops, '-', ns, ne, 'b', W);

  // Explicit park at body settings → REF pass 94 (no comment).
  ops.push(xSpeedNumber(input.bodySpeed));
  ops.push(xRollerAdvance(input.bodyRoller));
  ops.push(xParkCarriage());

  // Draw thread row.
  ops.push(xSpeedNumber(input.drawThreadSpeed));
  ops.push(xRollerAdvance(input.drawThreadRoller));
  ops.push(xStitchNumber(input.drawThreadStitchSize));
  pushSingleBedRow(ops, '-', ns, ne, 'f', D);

  // Rack to 0.5 + presser back to transition for the rack-change auto-move.
  ops.push(xPresserSpeed(input.presserTransitionSpeed));
  ops.push(xPresserRoller(input.presserTransitionRoller));
  ops.push(rack(0.5));

  // Tubular cast-on row on A.
  ops.push(xSpeedNumber(input.castOnSlowSpeed));
  ops.push(xRollerAdvance(input.castOnInterlockRoller));
  ops.push(xStitchNumber(input.castOnTubularStitchSize));
  pushBothBedsRackedRow(ops, '-', ns, ne, A);

  // 2 single-bed passes on A at rack=0.
  ops.push(rack(0));
  ops.push(xStitchNumber(input.wasteStitchSize));
  pushSingleBedRow(ops, '+', ns, ne, 'f', A);
  pushSingleBedRow(ops, '-', ns, ne, 'b', A);

  // Transfer all back-bed loops (odd needles) to front.
  ops.push(xSpeedNumber(input.drawThreadSpeed));
  ops.push(xRollerAdvance(0));
  ops.push(xStitchNumber(3));  // App's xfer-stitch (pass-level override)
  for (let n = ns; n <= ne; n++) {
    if (n % 2 === 1) ops.push(xfer(backBed(n), f(n)));
  }
}

function pushSingleBedRow(
  ops: KnitoutOp[],
  dir: Direction,
  ns: number,
  ne: number,
  bed: 'f' | 'b',
  carrier: CarrierId,
): void {
  const make = bed === 'f' ? f : backBed;
  if (dir === '+') {
    for (let n = ns; n <= ne; n++) ops.push(knit(dir, make(n), carrier));
  } else {
    for (let n = ne; n >= ns; n--) ops.push(knit(dir, make(n), carrier));
  }
}

function pushBothBedsRackedRow(
  ops: KnitoutOp[],
  dir: Direction,
  ns: number,
  ne: number,
  carrier: CarrierId,
): void {
  // At rack 0.5, slot order requires b(n) BEFORE f(n) on the `-` direction
  // to keep the pass mergeable into a single Kn-Kn.
  if (dir === '+') {
    for (let n = ns; n <= ne; n++) {
      ops.push(knit(dir, f(n), carrier));
      ops.push(knit(dir, backBed(n), carrier));
    }
  } else {
    for (let n = ne; n >= ns; n--) {
      ops.push(knit(dir, backBed(n), carrier));
      ops.push(knit(dir, f(n), carrier));
    }
  }
}

// ---------- Body / closing helpers ----------

function getCurrentSide(carrier: CarrierId, ops: KnitoutOp[]): 'left' | 'right' {
  for (let i = ops.length - 1; i >= 0; i--) {
    const o = ops[i]!;
    if ((o.kind === 'knit' || o.kind === 'tuck') && o.carriers.includes(carrier)) {
      return o.direction === '+' ? 'right' : 'left';
    }
    if (o.kind === 'in' && o.carriers.includes(carrier)) {
      return 'left';
    }
  }
  return 'left';
}

function emitOneRowAlternatingDirection(
  ops: KnitoutOp[],
  ns: number,
  ne: number,
  carrier: CarrierId,
  parked: 'left' | 'right',
): void {
  const dir: Direction = parked === 'left' ? '+' : '-';
  pushSingleBedRow(ops, dir, ns, ne, 'f', carrier);
}

function opsContainsIn(ops: KnitoutOp[], carrier: CarrierId): boolean {
  return ops.some((o) => o.kind === 'in' && o.carriers.includes(carrier));
}
