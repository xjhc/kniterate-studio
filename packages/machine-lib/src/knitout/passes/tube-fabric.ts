/**
 * Tube fabric primitives — topology-driven knitout op emitters shared by the
 * standalone beanie emitter (`./beanie.ts`) and the canvas-driven tube machine
 * lowering (`src/surface/lower-machine.ts` → `src/shells/tube.ts`).
 *
 * These functions own ONE thing: turning a per-face colour body into knitout
 * ops at a given tube geometry. They are deliberately decoupled from
 * `BeanieSpec` / the beanie `Resolved` context — they take a small
 * `TubeFaceGeometry` (face width + the two slot maps) plus machine settings, so
 * the beanie path and the surface path call the SAME emitter and produce
 * byte-identical ops (the parity gate in `src/shells/beanie-recipe.ts` proves
 * it). "One emitter, two callers" — not a second compiler.
 */

import {
  f, b, knit, tuck, rack, comment, carrierIn, carrierOut,
  xStitchNumber, xSpeedNumber, xRollerAdvance,
  type KnitoutOp, type CarrierId, type BedNeedle,
} from '../types.js';

/** A tube's two flat-bed faces as bed-slot maps. `frontSlot(i)` / `backSlot(i)`
 *  is the needle slot of face column `i` (0-based, low→high); the home bed is
 *  front for `frontSlot`, back for `backSlot`. The caller (beanie `Resolved` or
 *  tube `TubeTopology`) supplies the maps so this module never depends on either. */
export interface TubeFaceGeometry {
  faceWidth: number;
  frontSlot(i: number): number;
  backSlot(i: number): number;
}

/** Machine tuning a tube body emit needs (the subset of the kniterate headers). */
export interface TubeFabricSettings {
  stitchNumber: number;
  speedNumber: number;
  rollerAdvance: number;
}

/**
 * Per-face tube jacquard body. `front`/`back` are `[round][col]` colour indices
 * into `colors` (col 0..faceWidth-1, bottom-up); both grids must be `faceWidth`
 * wide and the same height. Unlike a front `chart` + a `backFace` flag, the
 * independent `back` grid lets a pattern WRAP the tube (front and back differ);
 * a solid (all-0) back reproduces the front-only / hidden-catch behaviour.
 */
/**
 * Float-catch density for a tube jacquard face. A knit-in-the-round tube uses
 * BOTH beds for its two faces (front face = front bed, back face = back bed), so
 * there is no spare bed for a literal double-bed-jacquard backing layer — the
 * "clean inside" choice is instead how densely the non-owning colour is caught
 * inside each single-bed face:
 *  - `'stranded'` (default): the non-owning colour floats and is tucked only when
 *    a run reaches `floatLimit` (sparse catches; longer floats on the inside).
 *  - `'birdseye'`: the non-owning colour is tucked on a regular every-other-needle
 *    stipple (alternating by round), so no float exceeds one stitch — a denser,
 *    cleaner inside (the float-free promise of birdseye, applied per face).
 */
export type TubeBackingStrategy = 'stranded' | 'birdseye';

export interface BeanieTubeJacquardBody {
  colors: CarrierId[];
  front: number[][];
  back: number[][];
  /** Max consecutive floated stitches before a catch tuck (default 5). Used by
   *  the `'stranded'` backing; ignored by `'birdseye'`. */
  floatLimit?: number;
  /** Tuck float-catches on the back instead of the front. Requires a solid
   *  (colour 0) back — a patterned back can't hide a catch. */
  hideCatches?: boolean;
  /** How densely the non-owning colour is caught inside each face (default
   *  `'stranded'`). See `TubeBackingStrategy`. */
  backing?: TubeBackingStrategy;
}

const N = (bed: 'f' | 'b', n: number): BedNeedle => (bed === 'f' ? f(n) : b(n));

/** True iff every cell of the back grid is colour 0 (a solid background back). */
export function tubeBackIsSolidBackground(body: BeanieTubeJacquardBody): boolean {
  return body.back.every((row) => row.every((ci) => ci === 0));
}

/**
 * Knit one colour across one face, catching floats. Knits every column the
 * colour owns; between its first and last owned column, inserts a `tuck` to
 * secure the non-owning float (the tucked needle is owned by another colour,
 * which knits over it and binds the float in). With `hideCatchOnBack`, the catch
 * tucks on the back face instead (a solid back binds it in on the inside, leaving
 * the front clean).
 *
 * The catch DENSITY depends on `backing`:
 *  - `'stranded'`: catch only once a run of skipped stitches reaches `floatLimit`.
 *  - `'birdseye'`: catch on a regular every-other-needle stipple (alternating by
 *    round `ri`), so no float exceeds one stitch — a clean, dense inside.
 */
export function knitColourFace(
  geo: TubeFaceGeometry,
  row: number[],
  ci: number,
  carrier: CarrierId,
  bed: 'f' | 'b',
  dir: '+' | '-',
  floatLimit: number,
  ops: KnitoutOp[],
  hideCatchOnBack = false,
  backing: TubeBackingStrategy = 'stranded',
  ri = 0,
): void {
  const W = geo.faceWidth;
  let first = -1;
  let last = -1;
  for (let i = 0; i < W; i++) if (row[i] === ci) { if (first < 0) first = i; last = i; }
  if (first < 0) return; // colour absent this row

  const slot = (i: number): number => (bed === 'f' ? geo.frontSlot(i) : geo.backSlot(i));
  const order: number[] = [];
  for (let i = 0; i < W; i++) order.push(i);
  if (dir === '-') order.reverse();

  const catchAt = (i: number): void => {
    if (hideCatchOnBack) ops.push(tuck(dir, b(geo.backSlot(i)), carrier));
    else ops.push(tuck(dir, N(bed, slot(i)), carrier));
  };

  let sinceAnchor = 0;
  for (const i of order) {
    if (row[i] === ci) {
      ops.push(knit(dir, N(bed, slot(i)), carrier));
      sinceAnchor = 0;
    } else if (i > first && i < last) {
      // Inside the float span — secure the float per the backing strategy.
      if (backing === 'birdseye') {
        // Regular every-other stipple (alternating by round) → no float > 1.
        if ((i + ri) % 2 === 0) catchAt(i);
      } else {
        sinceAnchor++;
        if (sinceAnchor >= floatLimit) { catchAt(i); sinceAnchor = 0; }
      }
    }
  }
}

/**
 * Per-face tube jacquard body → ops: knit an explicit `front` and `back` grid
 * each round (front low→high, back high→low, closing the tube), each colour its
 * own carriage pass with float catching. Carriers are brought in lazily on first
 * use and released at the end. Returns the full op stream (including the section
 * comment and carrier lifecycle) so callers splice it in verbatim.
 */
export function emitTubeJacquardBodyOps(
  geo: TubeFaceGeometry,
  body: BeanieTubeJacquardBody,
  settings: TubeFabricSettings,
): KnitoutOp[] {
  const ops: KnitoutOp[] = [];
  const H = body.front.length;
  const backing: TubeBackingStrategy = body.backing ?? 'stranded';
  // Keep the stranded comment byte-identical (the beanie + tube parity gates pin
  // it); only the birdseye backing annotates the section.
  ops.push(comment(
    backing === 'birdseye'
      ? `--- BODY tube jacquard (${H} rounds, ${body.colors.length} colours, per-face, birdseye) ---`
      : `--- BODY tube jacquard (${H} rounds, ${body.colors.length} colours, per-face) ---`,
  ));
  const floatLimit = body.floatLimit ?? 5;
  const hideCatch = !!body.hideCatches && tubeBackIsSolidBackground(body);
  const active = new Set<CarrierId>();
  const ensureIn = (c: CarrierId): void => { if (!active.has(c)) { ops.push(carrierIn(c)); active.add(c); } };
  const knitFace = (rowGrid: number[][], ri: number, bed: 'f' | 'b', dir: '+' | '-', hideOnBack: boolean): void => {
    const row = rowGrid[ri]!;
    const order: number[] = [];
    for (const ci of row) if (!order.includes(ci)) order.push(ci);
    for (const ci of order) {
      const carrier = body.colors[ci]!;
      ensureIn(carrier);
      ops.push(xStitchNumber(settings.stitchNumber));
      ops.push(xSpeedNumber(settings.speedNumber), xRollerAdvance(settings.rollerAdvance), rack(0));
      knitColourFace(geo, row, ci, carrier, bed, dir, floatLimit, ops, hideOnBack, backing, ri);
    }
  };
  for (let ri = 0; ri < H; ri++) {
    knitFace(body.front, ri, 'f', '+', hideCatch);
    knitFace(body.back, ri, 'b', '-', false);
  }
  for (const c of active) ops.push(carrierOut(c));
  return ops;
}
