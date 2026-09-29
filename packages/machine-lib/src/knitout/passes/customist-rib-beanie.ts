/**
 * Customist 2×2 rib beanie, a flat piece seamed afterwards, reproducing the
 * construction of `reference/2x2-rib-beanie.kc`.
 *
 * Sections, as decoded from the reference trace (offsets are from the
 * piece's left needle `lo`; W = hi − lo + 1 is even):
 *   Waste       an 81-pass waste interlock on the waste yarn with a speed ramp
 *   Insert      the body yarn knits one 1×1 row, then a waste tube
 *   Draw        the draw yarn knits one 1×1 row, then a waste tube
 *   Collapse    the tube is transferred into 1×1 (front even, rear odd)
 *   Draw final  a short waste 1×1 section, then the draw yarn's front row
 *   Cast on     the body yarn knits 1×1 on both beds, then one tubular
 *               front row and one rear row
 *   Rib set-up  front offsets ≡ 0 (mod 4) go to the rear and rear offsets
 *               ≡ 1 go to the front: 2×2 rib with front {1,2}, rear {0,3}
 *   Body        2×2 rib rows
 *   Crown       Customist's decreases and top jersey, replayed for the
 *               reference width (customist-rib-beanie-crown.ts)
 *   Knit off    the top's live loops are dropped; the carriers go out
 */

import { b as backBed, comment, f, type CarrierId, type Direction, type KnitoutOp, type KnitoutProgram } from '../types.js'
import { CarriageSimulator } from '../sim/carriage-simulator.js'
import type { PredictedPass } from '../sim/types.js'
import { CUSTOMIST_RIB_CROWN_194_V1, CUSTOMIST_RIB_CROWN_WIDTH, type CustomistRibCrownStep } from './customist-rib-beanie-crown.js'
import { planEightLineCrown, ribBed } from './rib-crown-plan.js'

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

export interface CustomistRibBeanieInput {
  /** Leftmost and rightmost knitout needles of the piece; the width must be even. */
  needleStart: number
  needleEnd: number
  bodyCarrier: CarrierId
  wasteCarrier: CarrierId
  drawCarrier: CarrierId
  /** 2×2 rib rows after the set-up. */
  ribRows: number
  /**
   * `customist-194`: Customist's crown and top jersey, replayed exactly
   * (reference width only). `eight-line`: the same crown topology planned for
   * any width (rib-crown-plan.ts). `none`: stop after the rib.
   */
  crown: 'customist-194' | 'eight-line' | 'none'
}

export interface CustomistRibBeanieResult {
  ops: KnitoutOp[]
  predictedPasses: readonly PredictedPass[]
  finalNextDirection: Direction
}

export { ribBed }

export function emitCustomistRibBeanie(input: CustomistRibBeanieInput): CustomistRibBeanieResult {
  const { needleStart: lo, needleEnd: hi, bodyCarrier: body, wasteCarrier: waste, drawCarrier: draw } = input
  const width = hi - lo + 1
  if (width < 8 || width % 2 !== 0) throw new Error(`rib beanie width must be even and at least 8; got ${width}`)
  const s = CUSTOMIST_RIB_BEANIE_SETTINGS_V1
  const sim = new CarriageSimulator({ carriers: ['1', '2', '3', '4', '5', '6'] })
  const ops: KnitoutOp[] = [comment('--- CUSTOMIST 2x2 RIB BEANIE: WASTE & CAST-ON ---')]
  const drain = () => { for (const op of sim.drainOps()) ops.push(op) }
  const offsets = (dir: Direction, keep: (o: number) => boolean): number[] => {
    const out: number[] = []
    if (dir === '+') { for (let o = 0; o < width; o++) if (keep(o)) out.push(o) }
    else { for (let o = width - 1; o >= 0; o--) if (keep(o)) out.push(o) }
    return out
  }
  const even = (o: number) => o % 2 === 0
  /** One pass knitting front offsets `front` and rear offsets `rear`, in carriage order. */
  const row = (c: CarrierId, dir: Direction, front: (o: number) => boolean, rear: (o: number) => boolean) => {
    for (const o of offsets(dir, (x) => front(x) || rear(x))) {
      if (front(o)) sim.knit(c, dir, f(lo + o))
      if (rear(o)) sim.knit(c, dir, backBed(lo + o))
    }
  }
  const none = () => false
  const all = () => true
  const settings = (speed: number, roller: number, stitch?: number) => {
    sim.setSpeed(speed)
    sim.setRoller(roller)
    if (stitch !== undefined) sim.setStitch(stitch)
  }
  const xfers = (pairs: { from: 'f' | 'b'; offsets: number[] }[]) => {
    settings(s.xferSpeed, s.xferRoller)
    sim.setXferStitch(s.xferStitch)
    for (const pair of pairs) {
      sim.xferBatch(pair.offsets.map((o) => pair.from === 'f'
        ? { from: f(lo + o), to: backBed(lo + o) }
        : { from: backBed(lo + o), to: f(lo + o) }))
    }
  }
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
  // Carry the body yarn clear of the left edge so the rib transfers need no kick.
  sim.miss(body, '-', f(lo - BODY_PARK_BEYOND_EDGE))
  drain()

  // 1×1 → 2×2: front offsets ≡ 0 go to the rear, rear offsets ≡ 1 to the front.
  xfers([
    { from: 'f', offsets: offsets('+', (o) => o % 4 === 0) },
    { from: 'b', offsets: offsets('+', (o) => o % 4 === 1) },
  ])
  drain()

  ops.push(comment('--- 2x2 RIB BODY ---'))
  settings(s.ribSpeed, s.ribRoller)
  for (let r = 0; r < input.ribRows; r++) {
    const dir = sim.finalNextDirection()
    for (const o of offsets(dir, all)) {
      const bed = ribBed(o)
      sim.setStitch(bed === 'f' ? s.ribStitchFront : s.ribStitchRear)
      sim.knit(body, dir, bed === 'f' ? f(lo + o) : backBed(lo + o))
    }
  }
  drain()

  if (input.crown !== 'none') {
    let crown: readonly CustomistRibCrownStep[]
    if (input.crown === 'customist-194') {
      if (width !== CUSTOMIST_RIB_CROWN_WIDTH) throw new Error(`the customist-194 crown is defined for ${CUSTOMIST_RIB_CROWN_WIDTH} needles; this piece has ${width}`)
      crown = CUSTOMIST_RIB_CROWN_194_V1
    } else {
      crown = planEightLineCrown(width, sim.finalNextDirection()).steps
    }
    ops.push(comment(`--- 2x2 RIB CROWN (${input.crown}) ---`))
    for (const step of crown) {
      if (step[0] === 'x') {
        const [, rack, from, speed, roller, xferStitch, sources] = step
        settings(speed, roller)
        sim.setXferStitch(xferStitch)
        sim.setRacking(rack)
        // Knitout racking r puts front needle n across from back needle n - r.
        const pairs = sources.map((o) => from === 'f'
          ? { from: f(lo + o), to: backBed(lo + o - rack) }
          : { from: backBed(lo + o), to: f(lo + o + rack) })
        if (roller === 0) sim.xferBatch(pairs)
        else {
          // Transfers default to no roller; x-add-roller-advance is one-shot, so it precedes each transfer.
          for (const pair of pairs) { sim.addRollerAdvance(roller); sim.xfer(pair.from, pair.to) }
        }
      } else {
        const [, dir, speed, roller, frontStitch, rearStitch, front, rear] = step
        sim.setRacking(0)
        settings(speed, roller)
        const frontSet = new Set(front)
        const rearSet = new Set(rear)
        for (const o of offsets(dir, (x) => frontSet.has(x) || rearSet.has(x))) {
          if (frontSet.has(o)) { sim.setStitch(frontStitch); sim.knit(body, dir, f(lo + o)) }
          if (rearSet.has(o)) { sim.setStitch(rearStitch); sim.knit(body, dir, backBed(lo + o)) }
        }
      }
    }
    sim.setRacking(0)
    // Knit off: drop the top's live loops (they are gathered by hand).
    sim.setRoller(0)
    sim.setStitch(0)
    const last = crown.at(-1)
    if (last?.[0] === 'k') for (const o of last[6]) sim.drop(f(lo + o))
    drain()
  }

  // Carriers out in the reference order: draw, body, waste.
  for (const carrier of [draw, body, waste]) sim.out(carrier)
  drain()

  return { ops, predictedPasses: sim.predictedPasses(), finalNextDirection: sim.finalNextDirection() }
}

/** The complete Knitout program for the beanie, ready for the Kniterate converter. */
export function buildCustomistRibBeanieProgram(input: CustomistRibBeanieInput): KnitoutProgram {
  const { ops } = emitCustomistRibBeanie(input)
  return {
    version: 2,
    carriers: ['1', '2', '3', '4', '5', '6'],
    machine: 'kniterate',
    gauge: 7,
    position: 'Keep',
    yarns: { [input.bodyCarrier]: 'main', [input.wasteCarrier]: 'waste', [input.drawCarrier]: 'draw thread' },
    kniterate: { xferStyle: 'four-pass' },
    ops,
  }
}
