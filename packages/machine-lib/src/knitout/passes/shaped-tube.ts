/**
 * Shaped-tube emitter — the op template behind the leaf/tube symbol keys.
 *
 * Reproduces the per-round choreography reverse-engineered from
 * `reference/sophie.kc` (a knitted leaf): a full-bed "ping-pong" tube.
 * The body lives on one bed; each round knits it wide on that bed, then
 * transfers the whole body to the other bed and knits it there, closing
 * a flat tube via the carriage-turn wrap. Width is driven by a per-round
 * schedule; shaping is fully fashioned via racked transfers at the open
 * (left) edge — a step up moves the edge stitch outward so the vacated
 * needle knits a fresh loop, a step down stacks it onto its neighbour
 * (a secured k2tog). No tucks or drops, matching sophie's technique.
 *
 *   round (body on bed X, span [L..R], R = fixed anchor / spine edge):
 *     1. knit bed X, cols L..R          (>>)
 *     2. xfer all X -> Y                (vendor splits even/odd)
 *     3. knit bed Y, cols L..R          (<<)
 *     4. xfer all Y -> X
 *
 * The schedule is the leaf outline (3 → 51 → 1 for sophie); the emitter
 * is shape-agnostic — any unimodal-or-not schedule works.
 */

import {
  f, b, knit, tuck, xfer, rack, comment,
  xStitchNumber, xSpeedNumber, xRollerAdvance, carrierIn, carrierOut,
  type KnitoutOp, type CarrierId, type BedNeedle,
} from '../types.js';

export interface ShapedTubeSpec {
  carrier: CarrierId;
  /** Fixed right edge (the spine side). The tube opens leftward. */
  anchorCol: number;
  /** Width (stitch count across the tube) per round. */
  schedule: number[];
  knitSpeed?: number;
  knitRoller?: number;
  xferSpeed?: number;
  stitchNumber?: number;
}

const D = { knitSpeed: 300, knitRoller: 450, xferSpeed: 60, stitchNumber: 6 } as const;
const other = (bed: 'f' | 'b'): 'f' | 'b' => (bed === 'f' ? 'b' : 'f');
const N = (bed: 'f' | 'b', n: number): BedNeedle => (bed === 'f' ? f(n) : b(n));
const range = (a: number, c: number): number[] => { const o: number[] = []; for (let i = a; i <= c; i++) o.push(i); return o; };

/** Emit the body op stream for a shaped tube (no carrier in/out). */
export function emitShapedTube(spec: ShapedTubeSpec): KnitoutOp[] {
  const ops: KnitoutOp[] = [];
  const knitSpeed = spec.knitSpeed ?? D.knitSpeed;
  const knitRoller = spec.knitRoller ?? D.knitRoller;
  const xferSpeed = spec.xferSpeed ?? D.xferSpeed;
  const anchor = spec.anchorCol;
  const sched = spec.schedule;
  if (sched.length === 0) return ops;

  ops.push(xStitchNumber(spec.stitchNumber ?? D.stitchNumber));

  let bodyBed: 'f' | 'b' = 'f';
  let left = anchor - sched[0]! + 1;

  // Cast on the first width (tuck both beds so the tube has a closed base).
  ops.push(comment('-- tube cast-on --'));
  for (let n = anchor; n >= left; n--) ops.push(tuck('-', f(n), spec.carrier));
  for (let n = left; n <= anchor; n++) ops.push(tuck('+', b(n), spec.carrier));

  const knitBed = (bed: 'f' | 'b', dir: '+' | '-') => {
    ops.push(xSpeedNumber(knitSpeed), xRollerAdvance(knitRoller));
    const cols = dir === '+' ? range(left, anchor) : range(left, anchor).reverse();
    for (const n of cols) ops.push(knit(dir, N(bed, n), spec.carrier));
  };
  const xferAll = (from: 'f' | 'b') => {
    ops.push(xSpeedNumber(xferSpeed), xRollerAdvance(0), rack(0));
    for (let n = left; n <= anchor; n++) ops.push(xfer(N(from, n), N(other(from), n)));
  };

  // Fashioned edge step: park the current edge stitch (at `left`, on
  // `bodyBed`) on the opposite bed, rack, and bring it back shifted by
  // `delta` columns. delta = +1 stacks it onto its inward neighbour (a
  // secured decrease / k2tog); delta = -1 moves it outward, vacating its
  // old needle so the next knit pass forms a fresh loop there (a fashioned
  // increase). This is sophie's racked-transfer technique — no tuck/drop.
  // Rack sign follows the i-cord convention (back->front lands at +rack).
  const fashionEdge = (delta: 1 | -1) => {
    const r = bodyBed === 'f' ? delta : -delta;
    ops.push(xSpeedNumber(xferSpeed), xRollerAdvance(0), rack(0));
    ops.push(xfer(N(bodyBed, left), N(other(bodyBed), left)));
    ops.push(rack(r));
    ops.push(xfer(N(other(bodyBed), left), N(bodyBed, left + delta)));
    ops.push(rack(0));
  };

  // Round 0: knit the cast-on width (sophie knits it too — 409 rounds,
  // not 408).
  ops.push(comment(`-- round 0 w=${sched[0]} --`));
  knitBed(bodyBed, '+');
  xferAll(bodyBed);
  bodyBed = other(bodyBed);
  knitBed(bodyBed, '-');
  xferAll(bodyBed);
  bodyBed = other(bodyBed);

  for (let r = 1; r < sched.length; r++) {
    const w = sched[r]!, prev = sched[r - 1]!;
    if (w > prev) { // fashioned increase at the open (left) edge
      const add = w - prev;
      ops.push(comment(`-- fashioned inc ${add} --`));
      for (let k = 0; k < add; k++) { fashionEdge(-1); left -= 1; }
    } else if (w < prev) { // fashioned decrease (secured k2tog), no drop
      const rem = prev - w;
      ops.push(comment(`-- fashioned dec ${rem} --`));
      for (let k = 0; k < rem; k++) { fashionEdge(1); left += 1; }
    }
    ops.push(comment(`-- round ${r} w=${w} --`));
    knitBed(bodyBed, '+');
    xferAll(bodyBed);
    bodyBed = other(bodyBed);
    knitBed(bodyBed, '-');
    xferAll(bodyBed);
    bodyBed = other(bodyBed);
  }

  return ops;
}

/** Wrap the body with carrier in/out for a standalone program. */
export function emitShapedTubeProgram(spec: ShapedTubeSpec): KnitoutOp[] {
  return [carrierIn(spec.carrier), ...emitShapedTube(spec), carrierOut(spec.carrier)];
}
