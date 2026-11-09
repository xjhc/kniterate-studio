/** Shared waste and carrier-introduction prefix. Extracted unchanged from
 * the Run 2 fairisle frame; ends after seven C6 passes following C1 intro,
 * with a live loop on every needle of both beds. No cast-on/drop/transfer.
 */
import { b as backBed, f, type CarrierId, type Direction, type KnitoutOp } from '../types.js'
import type { CarriageSimulator } from '../sim/carriage-simulator.js'
import type { WasteMachineConfig } from './waste-section.js'
import type { FairisleCarrierIntro } from './carrier-intro.js'

export interface CustomistWasteIntroInput {
  needleStart: number
  needleEnd: number
  wasteCarrier: CarrierId
  bodyCarriers: readonly CarrierId[]
  drawCarrier: CarrierId
  wastePasses: number
  waste: WasteMachineConfig
  intro: FairisleCarrierIntro
  catchNeedles?: number
  /** Keep the rear-left loop made by the catch return from being held until the first colour. */
  refreshLeftCatchLoop?: boolean
}

export function emitCustomistWasteAndIntro(sim: CarriageSimulator, ops: KnitoutOp[], input: CustomistWasteIntroInput): void {
  const { needleStart: lo, needleEnd: hi, wasteCarrier: waste, waste: mc, intro } = input
  const drain = () => { for (const op of sim.drainOps()) ops.push(op) }
  const needles = (dir: Direction, keep: (n: number) => boolean): number[] => {
    const out: number[] = []
    if (dir === '+') { for (let n = lo; n <= hi; n++) if (keep(n)) out.push(n) }
    else { for (let n = hi; n >= lo; n--) if (keep(n)) out.push(n) }
    return out
  }
  const even = (n: number) => (n - lo) % 2 === 0
  const bedRow = (c: CarrierId, dir: Direction, bed: 'f' | 'b', keep: (n: number) => boolean = () => true) => {
    for (const n of needles(dir, keep)) sim.knit(c, dir, bed === 'f' ? f(n) : backBed(n))
  }
  /** Full-width interlock; `frontEven` puts the front bed on even offsets. */
  const interlock = (c: CarrierId, dir: Direction, frontEven: boolean) => {
    for (const n of needles(dir, () => true)) sim.knit(c, dir, even(n) === frontEven ? f(n) : backBed(n))
  }
  /** Leftward interior interlock: front on odd offsets, rear on even, edges skipped. */
  const interiorInterlock = (c: CarrierId) => {
    for (const n of needles('-', (m) => (m > lo || (input.refreshLeftCatchLoop === true && m === lo)) && m < hi)) sim.knit(c, '-', even(n) ? backBed(n) : f(n))
  }
  /** Studio's yarn catch: out and back over the piece's leftmost needles, both beds alternating, at the intro settings. */
  const catchNeedles = Math.min(input.catchNeedles ?? 0, hi - lo + 1)
  const catchYarn = (c: CarrierId) => {
    if (catchNeedles <= 0) return
    sim.setSpeed(intro.introSpeed)
    sim.setRoller(intro.introRoller)
    sim.setStitch(intro.introStitch)
    const zone = (n: number) => n - lo < catchNeedles
    for (const n of needles('+', zone)) sim.knit(c, '+', even(n) ? f(n) : backBed(n))
    for (const n of needles('-', zone)) sim.knit(c, '-', even(n) ? backBed(n) : f(n))
  }

  // Start + interlock waste.
  sim.bringIn(waste, { side: 'left' })
  catchYarn(waste)
  sim.setStitch(mc.stitchNumber)
  const castOnPasses = Math.max(1, mc.castOnPasses)
  const castOnMoves = Math.max(0, mc.castOnTuckPasses)
  for (let p = 0; p < input.wastePasses; p++) {
    const dir: Direction = p % 2 === 0 ? '+' : '-'
    if (p < castOnPasses) {
      sim.setSpeed(mc.castOnSpeed)
      sim.setRoller(mc.castOnRoller)
      if (p === 0) interlock(waste, '+', true)
      else if (p === castOnPasses - 1) interiorInterlock(waste)
      else if (dir === '-') bedRow(waste, '-', 'f', even)
      else bedRow(waste, '+', 'b', (n) => !even(n))
    } else if (p < castOnPasses + castOnMoves) {
      // Customist's post-start Tu-Tu pair is the converter's own
      // carrier-in release; these slots only set its speed/roller.
      sim.setSpeed(mc.castOnTuckSpeed)
      sim.setRoller(mc.castOnTuckRoller)
    } else {
      sim.setSpeed(mc.wasteSpeed)
      sim.setRoller(dir === '-' ? mc.rampRollerLeft : mc.rampRollerRight)
      if (dir === '+') interlock(waste, '+', true)
      else interiorInterlock(waste)
    }
  }
  drain()

  // Insertions: body yarns, then the draw yarn, each followed by waste tubular rows.
  sim.setPresserSpeed(600)
  sim.setPresserRoller(0)
  const tubularFiller = (count: number) => {
    sim.setSpeed(200)
    sim.setRoller(200)
    sim.setStitch(mc.stitchNumber)
    for (let k = 0; k < count; k++) {
      if (k % 2 === 0) bedRow(waste, '-', 'f')
      else bedRow(waste, '+', 'b')
    }
  }
  const insertions = [...input.bodyCarriers, input.drawCarrier]
  insertions.forEach((carrier, index) => {
    sim.bringIn(carrier, { side: 'left' })
    catchYarn(carrier)
    sim.setSpeed(intro.introSpeed)
    sim.setRoller(intro.introRoller)
    sim.setStitch(intro.introStitch)
    interlock(carrier, '+', index % 2 === 0)
    tubularFiller(carrier === input.drawCarrier ? 7 : 2)
  })
  drain()

}
