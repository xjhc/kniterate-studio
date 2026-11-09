/**
 * Customist's start for a flat piece, decoded from `reference/2x2-rib-beanie.kc`
 * and shared by every flat construction that begins with it (the rib beanie
 * and the shaped garment panels).
 *
 * Sections (offsets are from the piece's left needle `lo`; W = hi − lo + 1 is even):
 *   Waste       an 81-pass waste interlock on the waste yarn
 *   Insert      each yarn (the body yarn first) knits one 1×1 row, then a
 *               short waste tube
 *   Draw        the draw yarn knits one 1×1 row, then a waste tube
 *   Collapse    the tube is transferred into 1×1 (front even, rear odd)
 *   Draw final  a short waste 1×1 section, then the draw yarn's front row
 *   Cast on     the body yarn knits 1×1 on both beds, then one tubular
 *               front row and one rear row
 *
 * The piece ends the start with one loop per needle: front on even offsets,
 * rear on odd offsets, and the body yarn parked on the left.
 */

import { b as backBed, f, type CarrierId, type Direction, type KnitoutOp } from '../types.js'
import type { CarriageSimulator } from '../sim/carriage-simulator.js'
import { STUDIO_YARN_CATCH_NEEDLES_V1 } from './carrier-intro.js'

/** A section's machine settings where a piece sets its own; anything left out is the reference's. */
export interface SectionSettingsV1 {
  readonly speed?: number
  readonly roller?: number
  readonly stitch?: number
}

/**
 * Machine settings and waste tube lengths of the reference frame, per
 * section: `reference/2x2-rib-beanie.kc` exactly. Studio knits with
 * `STUDIO_FLAT_START_SETTINGS_V1`; this is kept to reproduce the reference.
 */
export const CUSTOMIST_RIB_BEANIE_SETTINGS_V1 = Object.freeze({
  wastePasses: 81,
  wasteStitch: 5,
  /** Speed of waste pass p (p = 0 is the start pass). */
  wasteSpeed: (p: number): number => (p === 0 ? 100 : p <= 4 ? 700 : p <= 6 ? 300 : p <= 10 ? 400 : p <= 14 ? 500 : p <= 18 ? 600 : 700),
  /** Roller of waste pass p: leftward passes pull from p = 5 on. */
  wasteRoller: (p: number): number => (p === 0 ? 440 : p % 2 === 1 && p >= 5 ? 440 : 0),
  /** Waste passes before the steady speed: a piece's own waste speed caps them and sets every pass after. */
  wasteRampPasses: 19,
  insertSpeed: 200,
  insertRoller: 400,
  /** Waste tube rows after the body yarn's insert row, and after the draw yarn's (or the last insert's). */
  bodyTubeRows: 7,
  drawTubeRows: 6,
  /** Needles of the yarn catch before each yarn's first row; the reference has none. */
  catchNeedles: 0,
  tubeSpeed: 200,
  tubeRoller: 200,
  xferSpeed: 120,
  xferRoller: 0,
  xferStitch: 0,
  drawFinalStitch: 8,
  castOnSpeed: 300,
  castOnRoller: 450,
  castOnStitch: 4,
  tubularSpeed: 200,
  tubularRoller: 450,
  tubularStitch: 6,
  ribSpeed: 300,
  ribRoller: 500,
  ribStitchFront: 8,
  ribStitchRear: 7,
  autoMovePresserSpeed: 600,
  autoMovePresserRoller: 0,
})

/** The flat start's settings: the reference's shape, any numbers. */
export type FlatStartSettingsV1 = { readonly [K in keyof typeof CUSTOMIST_RIB_BEANIE_SETTINGS_V1]: (typeof CUSTOMIST_RIB_BEANIE_SETTINGS_V1)[K] extends number ? number : (typeof CUSTOMIST_RIB_BEANIE_SETTINGS_V1)[K] }

/**
 * Studio's flat start: the reference's with the waste speeds and yarn
 * introduction of `reference/fairisle.kc`, which knitted cleanly where the
 * reference's start failed (the mini bird toque, issue #9 run 3, registry
 * entry 2026-11-07-run3-mini-bird-toque). The waste knits six slow passes
 * with the roller pulling, then holds a steady 300, pulling on leftward
 * passes; each yarn comes in at speed 100 and is followed by two waste tube
 * rows, and seven follow the draw yarn. Each yarn is first caught out and
 * back at the piece's left end (`STUDIO_YARN_CATCH_NEEDLES_V1`), as the waste
 * and draw yarns missed their first pass without it (issue #9 run 2). The
 * cast-on and everything after it are the reference's.
 */
export const STUDIO_FLAT_START_SETTINGS_V1: FlatStartSettingsV1 = Object.freeze({
  ...CUSTOMIST_RIB_BEANIE_SETTINGS_V1,
  wasteSpeed: (p: number): number => (p < 6 ? 100 : 300),
  wasteRoller: (p: number): number => (p < 6 || p % 2 === 1 ? 440 : 0),
  wasteRampPasses: 6,
  insertSpeed: 100,
  bodyTubeRows: 2,
  drawTubeRows: 7,
  catchNeedles: STUDIO_YARN_CATCH_NEEDLES_V1,
})

/** A piece's own settings for the sections of the flat start and its rib, over the reference's. */
export interface FlatSectionSettingsV1 {
  readonly waste?: SectionSettingsV1
  /** The cast-on row's settings; `tubularRoller` sets the two tubular rows after it. */
  readonly castOn?: SectionSettingsV1 & { readonly tubularRoller?: number }
  readonly rib?: SectionSettingsV1
  readonly transfers?: SectionSettingsV1
  /** A beanie crown's knitted rows; other pieces have none. */
  readonly crown?: SectionSettingsV1
}

/**
 * The start's settings (Studio's, or the reference's) with a piece's own
 * sections over them; with none, the base itself, so the program is
 * unchanged. The waste keeps its schedule: the first passes still start slow
 * (never above the speed), and the roller still pulls on the same passes. A
 * rib keeps the reference's one-step difference between its front and rear
 * stitch sizes.
 */
export function flatStartSettingsV1(own: FlatSectionSettingsV1 = {}, base: FlatStartSettingsV1 = STUDIO_FLAT_START_SETTINGS_V1): FlatStartSettingsV1 {
  if (!own.waste && !own.castOn && !own.rib && !own.transfers) return base
  const { waste = {}, castOn = {}, rib = {}, transfers = {} } = own
  const ribStep = base.ribStitchFront - base.ribStitchRear
  return Object.freeze({
    ...base,
    wasteStitch: waste.stitch ?? base.wasteStitch,
    // A slower waste or cast-on speed also caps that section's other knitting:
    // the yarns' insert rows and every waste tube row (the top waste too, which
    // already knits at the waste's stitch size), and the cast-on's tubular
    // rows. Otherwise a section set to 100 still knits rows at 200 (PR #14).
    // Carrier moves keep their speed: they knit nothing.
    insertSpeed: waste.speed === undefined ? base.insertSpeed : Math.min(base.insertSpeed, waste.speed),
    tubeSpeed: waste.speed === undefined ? base.tubeSpeed : Math.min(base.tubeSpeed, waste.speed),
    tubularSpeed: castOn.speed === undefined ? base.tubularSpeed : Math.min(base.tubularSpeed, castOn.speed),
    wasteSpeed: waste.speed === undefined ? base.wasteSpeed : (p: number) => (p < base.wasteRampPasses ? Math.min(base.wasteSpeed(p), waste.speed!) : waste.speed!),
    wasteRoller: waste.roller === undefined ? base.wasteRoller : (p: number) => (base.wasteRoller(p) === 0 ? 0 : waste.roller!),
    castOnSpeed: castOn.speed ?? base.castOnSpeed,
    castOnRoller: castOn.roller ?? base.castOnRoller,
    castOnStitch: castOn.stitch ?? base.castOnStitch,
    tubularRoller: castOn.tubularRoller ?? base.tubularRoller,
    ribSpeed: rib.speed ?? base.ribSpeed,
    ribRoller: rib.roller ?? base.ribRoller,
    ribStitchFront: rib.stitch ?? base.ribStitchFront,
    ribStitchRear: rib.stitch === undefined ? base.ribStitchRear : Math.max(0, rib.stitch - ribStep),
    xferSpeed: transfers.speed ?? base.xferSpeed,
    xferRoller: transfers.roller ?? base.xferRoller,
    xferStitch: transfers.stitch ?? base.xferStitch,
  })
}

/**
 * Carrier parking, in needles beyond the piece's edge, matched to the
 * reference's encoded carrier stops. They only place yarns clear of the
 * next pass; no stitch depends on them.
 */
const WASTE_START_EXTEND = 1
const WASTE_PARK_BEYOND_EDGE = 2
const DRAW_PARK_BEYOND_EDGE = 3
const BODY_PARK_BEYOND_EDGE = 0

/** Pass helpers over one piece's needles `lo..hi`, used by the start and the constructions after it. */
export interface FlatPieceKit {
  readonly lo: number
  readonly hi: number
  readonly width: number
  /** Offsets kept by `keep`, in carriage order for `dir`. */
  offsets(dir: Direction, keep: (o: number) => boolean): number[]
  /** One pass knitting front offsets `front` and rear offsets `rear`, in carriage order. */
  row(c: CarrierId, dir: Direction, front: (o: number) => boolean, rear: (o: number) => boolean): void
  settings(speed: number, roller: number, stitch?: number): void
  /** Rack-0 transfers at the reference transfer settings, one batch per entry. */
  xfers(pairs: { from: 'f' | 'b'; offsets: number[] }[]): void
  drain(): void
}

export function flatPieceKit(sim: CarriageSimulator, ops: KnitoutOp[], lo: number, hi: number, s: FlatStartSettingsV1 = STUDIO_FLAT_START_SETTINGS_V1): FlatPieceKit {
  const width = hi - lo + 1
  const offsets = (dir: Direction, keep: (o: number) => boolean): number[] => {
    const out: number[] = []
    if (dir === '+') { for (let o = 0; o < width; o++) if (keep(o)) out.push(o) }
    else { for (let o = width - 1; o >= 0; o--) if (keep(o)) out.push(o) }
    return out
  }
  const settings = (speed: number, roller: number, stitch?: number) => {
    sim.setSpeed(speed)
    sim.setRoller(roller)
    if (stitch !== undefined) sim.setStitch(stitch)
  }
  return {
    lo,
    hi,
    width,
    offsets,
    row(c, dir, front, rear) {
      for (const o of offsets(dir, (x) => front(x) || rear(x))) {
        if (front(o)) sim.knit(c, dir, f(lo + o))
        if (rear(o)) sim.knit(c, dir, backBed(lo + o))
      }
    },
    settings,
    xfers(pairs) {
      settings(s.xferSpeed, s.xferRoller)
      sim.setXferStitch(s.xferStitch)
      for (const pair of pairs) {
        sim.xferBatch(pair.offsets.map((o) => pair.from === 'f'
          ? { from: f(lo + o), to: backBed(lo + o) }
          : { from: backBed(lo + o), to: f(lo + o) }))
      }
    },
    drain() { for (const op of sim.drainOps()) ops.push(op) },
  }
}

export interface CustomistFlatStartInput {
  bodyCarrier: CarrierId
  wasteCarrier: CarrierId
  /**
   * The draw thread, pulled out afterwards to free the piece from the waste
   * yarn; null for none. Without it the waste is joined to the cast-on and is
   * unravelled or cut away, and the waste sections around it are unchanged.
   */
  drawCarrier: CarrierId | null
  /** Further yarns brought in after the body yarn, in order (each is carried up from the waste section to its first stitch). */
  extraCarriers: readonly CarrierId[]
  /**
   * Waste interlock passes before the inserts (default 81, the reference's).
   * Fewer save yarn and time; too few and the fabric may not reach the
   * rollers before the piece starts. Speeds and rollers follow the same
   * per-pass schedule whatever the count.
   */
  wastePasses?: number
  /** The piece's settings for the start (`flatStartSettingsV1`; default Studio's). */
  settings?: FlatStartSettingsV1
}

/** Customist's waste, inserts, draw thread and 1×1 cast-on, ending with the body yarn parked on the left. */
export function emitCustomistFlatStart(sim: CarriageSimulator, kit: FlatPieceKit, input: CustomistFlatStartInput): void {
  const { lo, hi, width, offsets, row, settings, xfers, drain } = kit
  const { bodyCarrier: body, wasteCarrier: waste, drawCarrier: draw } = input
  const s = input.settings ?? STUDIO_FLAT_START_SETTINGS_V1
  const even = (o: number) => o % 2 === 0
  const none = () => false
  const all = () => true
  /**
   * Waste tube rows alternating front and rear, the first on the front bed.
   * It starts from the side the waste yarn is on, so the yarn never crosses
   * the bed without knitting.
   */
  /**
   * The yarn catch: out and back over the piece's leftmost needles, both beds
   * alternating, at the insert settings; a yarn that misses on the way out is
   * caught on the return, and it ends where its first row starts.
   */
  const catchYarn = (carrier: CarrierId) => {
    const zone = Math.min(s.catchNeedles, width)
    if (zone <= 0) return
    settings(s.insertSpeed, s.insertRoller, s.wasteStitch)
    row(carrier, '+', (o) => o < zone && even(o), (o) => o < zone && !even(o))
    row(carrier, '-', (o) => o < zone && !even(o), (o) => o < zone && even(o))
  }
  const tube = (count: number) => {
    const firstDir: Direction = sim.positionOf(waste)?.side === 'left' ? '+' : '-'
    settings(s.tubeSpeed, s.tubeRoller, s.wasteStitch)
    for (let k = 0; k < count; k++) {
      const front = k % 2 === 0
      const dir: Direction = front === (firstDir === '+') ? '+' : '-'
      row(waste, dir, front ? all : none, front ? none : all)
    }
  }

  // Waste interlock. Rightward passes knit the full 1×1 (front even, rear
  // odd); leftward passes knit the interior with the parities swapped. The
  // start pass skips the outermost needles. With the yarn catch, leftward
  // passes also knit each edge needle the catch's return leaves a waste loop
  // on: the rear-left needle always, and the front-right one when the catch
  // spans the whole piece (20 needles or fewer). These rows would never knit
  // them, so the loop was held until the first colour knitted it, about 90
  // passes later (issue #9, handoff 2).
  const catchZone = Math.min(s.catchNeedles, width)
  const rearLeft = catchZone > 0 ? 0 : 1
  const frontRight = catchZone >= width ? width : width - 1
  sim.bringIn(waste, { side: 'left' })
  catchYarn(waste)
  for (let p = 0; p < (input.wastePasses ?? s.wastePasses); p++) {
    settings(s.wasteSpeed(p), s.wasteRoller(p), s.wasteStitch)
    if (p === 0) {
      row(waste, '+', (o) => even(o) && o > 0, (o) => !even(o) && o < width - 1)
      sim.miss(waste, '+', f(hi - 1 + WASTE_START_EXTEND))
    }
    else if (p % 2 === 1) row(waste, '-', (o) => !even(o) && o < frontRight, (o) => even(o) && o >= rearLeft)
    else row(waste, '+', even, (o) => !even(o))
  }
  drain()

  sim.setPresserSpeed(s.autoMovePresserSpeed)
  sim.setPresserRoller(s.autoMovePresserRoller)
  // Body yarn insert (front odd, rear even), then a waste tube.
  sim.bringIn(body, { side: 'left' })
  catchYarn(body)
  settings(s.insertSpeed, s.insertRoller, s.wasteStitch)
  row(body, '+', (o) => !even(o), even)
  tube(s.bodyTubeRows)
  // Each further yarn: one 1×1 insert row (alternating parity), then two waste tube rows.
  input.extraCarriers.forEach((carrier, index) => {
    sim.bringIn(carrier, { side: 'left' })
    catchYarn(carrier)
    settings(s.insertSpeed, s.insertRoller, s.wasteStitch)
    row(carrier, '+', (o) => even(o) === (index % 2 === 0), (o) => even(o) !== (index % 2 === 0))
    tube(2)
  })
  // Draw yarn insert (front even, rear odd), then a waste tube.
  if (draw !== null) {
    sim.bringIn(draw, { side: 'left' })
    catchYarn(draw)
    settings(s.insertSpeed, s.insertRoller, s.wasteStitch)
    row(draw, '+', even, (o) => !even(o))
  }
  tube(s.drawTubeRows)
  drain()

  // Collapse the tube into 1×1: front odd → rear, rear even → front.
  xfers([
    { from: 'f', offsets: offsets('+', (o) => !even(o)) },
    { from: 'b', offsets: offsets('+', even) },
  ])
  // Waste 1×1 section, then the draw yarn's final front row.
  settings(s.tubeSpeed, s.tubeRoller, s.wasteStitch)
  row(waste, '+', even, none)
  row(waste, '-', none, (o) => !even(o))
  row(waste, '+', even, none)
  // Carry the waste yarn clear of the right edge so the body yarn's
  // leftward cast-on does not have to kick it aside (the reference parks it
  // past the body yarn).
  sim.miss(waste, '+', f(hi + WASTE_PARK_BEYOND_EDGE))
  // Drop every rear waste loop, then the draw yarn's final front row.
  settings(s.castOnSpeed, s.castOnRoller)
  for (const o of offsets('+', (x) => !even(x))) sim.drop(backBed(lo + o))
  if (draw !== null) {
    settings(s.tubeSpeed, s.tubeRoller, s.drawFinalStitch)
    row(draw, '-', even, none)
    sim.miss(draw, '-', f(lo - DRAW_PARK_BEYOND_EDGE))
  }
  drain()

  // Cast on 1×1 on both beds, then one tubular front and one rear row.
  settings(s.castOnSpeed, s.castOnRoller, s.castOnStitch)
  row(body, '-', even, (o) => !even(o))
  settings(s.tubularSpeed, s.tubularRoller, s.tubularStitch)
  row(body, '+', even, none)
  row(body, '-', none, (o) => !even(o))
  // Carry the body yarn clear of the left edge so the transfers after the start need no kick.
  sim.miss(body, '-', f(lo - BODY_PARK_BEYOND_EDGE))
  drain()
}
