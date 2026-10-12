/**
 * Customist's start for a flat piece, decoded from `reference/2x2-rib-beanie.kc`
 * and shared by every flat construction that begins with it (the rib beanie
 * and the shaped garment panels).
 *
 * Sections (offsets are from the piece's left needle `lo`; W = hi − lo + 1 is even):
 *   Waste       an 81-pass waste interlock on the waste yarn with a speed ramp
 *   Insert      the body yarn knits one 1×1 row, then a waste tube; each
 *               further yarn knits one 1×1 row, then two waste tube rows
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

/** Machine settings of the reference frame, per section. */
export const CUSTOMIST_RIB_BEANIE_SETTINGS_V1 = Object.freeze({
  wastePasses: 81,
  wasteStitch: 5,
  /** Speed of waste pass p (p = 0 is the start pass). */
  wasteSpeed: (p: number): number => (p === 0 ? 100 : p <= 4 ? 700 : p <= 6 ? 300 : p <= 10 ? 400 : p <= 14 ? 500 : p <= 18 ? 600 : 700),
  /** Roller of waste pass p: leftward passes pull from p = 5 on. */
  wasteRoller: (p: number): number => (p === 0 ? 440 : p % 2 === 1 && p >= 5 ? 440 : 0),
  insertSpeed: 200,
  insertRoller: 400,
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

export function flatPieceKit(sim: CarriageSimulator, ops: KnitoutOp[], lo: number, hi: number): FlatPieceKit {
  const width = hi - lo + 1
  const s = CUSTOMIST_RIB_BEANIE_SETTINGS_V1
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
  drawCarrier: CarrierId
  /** Further yarns brought in after the body yarn, in order (each is carried up from the waste section to its first stitch). */
  extraCarriers: readonly CarrierId[]
}

/** Customist's waste, inserts, draw thread and 1×1 cast-on, ending with the body yarn parked on the left. */
export function emitCustomistFlatStart(sim: CarriageSimulator, kit: FlatPieceKit, input: CustomistFlatStartInput): void {
  const { lo, hi, width, offsets, row, settings, xfers, drain } = kit
  const { bodyCarrier: body, wasteCarrier: waste, drawCarrier: draw } = input
  const s = CUSTOMIST_RIB_BEANIE_SETTINGS_V1
  const even = (o: number) => o % 2 === 0
  const none = () => false
  const all = () => true
  /** Waste tube rows alternating front and rear, the first in `firstDir` on the front bed. */
  const tube = (count: number, firstDir: Direction) => {
    settings(s.tubeSpeed, s.tubeRoller, s.wasteStitch)
    for (let k = 0; k < count; k++) {
      const front = k % 2 === 0
      const dir: Direction = front === (firstDir === '+') ? '+' : '-'
      row(waste, dir, front ? all : none, front ? none : all)
    }
  }

  // Waste interlock. Rightward passes knit the full 1×1 (front even, rear
  // odd); leftward passes knit the interior with the parities swapped. The
  // start pass skips the outermost needles.
  sim.bringIn(waste, { side: 'left' })
  for (let p = 0; p < s.wastePasses; p++) {
    settings(s.wasteSpeed(p), s.wasteRoller(p), s.wasteStitch)
    if (p === 0) {
      row(waste, '+', (o) => even(o) && o > 0, (o) => !even(o) && o < width - 1)
      sim.miss(waste, '+', f(hi - 1 + WASTE_START_EXTEND))
    }
    else if (p % 2 === 1) row(waste, '-', (o) => !even(o) && o < width - 1, (o) => even(o) && o > 0)
    else row(waste, '+', even, (o) => !even(o))
  }
  drain()

  sim.setPresserSpeed(s.autoMovePresserSpeed)
  sim.setPresserRoller(s.autoMovePresserRoller)
  // Body yarn insert (front odd, rear even), then a seven-row waste tube.
  sim.bringIn(body, { side: 'left' })
  settings(s.insertSpeed, s.insertRoller, s.wasteStitch)
  row(body, '+', (o) => !even(o), even)
  tube(7, '-')
  // Each further yarn: one 1×1 insert row (alternating parity), then two waste tube rows.
  input.extraCarriers.forEach((carrier, index) => {
    sim.bringIn(carrier, { side: 'left' })
    settings(s.insertSpeed, s.insertRoller, s.wasteStitch)
    row(carrier, '+', (o) => even(o) === (index % 2 === 0), (o) => even(o) !== (index % 2 === 0))
    tube(2, '-')
  })
  // Draw yarn insert (front even, rear odd), then a six-row waste tube.
  sim.bringIn(draw, { side: 'left' })
  settings(s.insertSpeed, s.insertRoller, s.wasteStitch)
  row(draw, '+', even, (o) => !even(o))
  tube(6, '+')
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
  settings(s.tubeSpeed, s.tubeRoller, s.drawFinalStitch)
  row(draw, '-', even, none)
  sim.miss(draw, '-', f(lo - DRAW_PARK_BEYOND_EDGE))
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
