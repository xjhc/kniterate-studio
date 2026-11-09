/**
 * Customist Studio "Waste & Cast-on" frame for the fairisle recipe,
 * reproducing `reference/fairisle.kc` passes 0-111 stitch for stitch.
 *
 * Sections (Customist Studio v2.5 manual, "Waste & Cast-on"):
 *   Start       both-bed row, then front-even / rear-odd single-bed rows
 *   Interlock   waste interlock: rightward rows knit the full width with
 *               the front bed at the left edge; leftward rows knit the
 *               interior (needle 0 only ever front, the last only rear)
 *   Insertions  each body yarn, then the draw yarn, knits one full-width
 *               interlock row (alternating needle parity), followed by a
 *               waste tubular front row and rear row
 *   Tubular     further waste tubular front/rear rows after the draw insert
 *   Drop        every rear loop is dropped
 *   Draw final  the draw yarn knits a full front row (removed later to
 *               separate waste from the piece)
 *   Cast on     zig-zag: the first body yarn knits every needle on both
 *               beds at rack 0.5, then a tubular front row (rack 0.5) and
 *               rear row (rack 0)
 *   Transfers   every rear loop moves to the front (even, then odd)
 *
 * The first body row follows at the handoff stitch and ramp speed (see
 * the compiler's first-row override); it is design row 0, not frame.
 *
 * Machine settings per section are the recipe's (waste, intro,
 * choreography, ramp) values, which already match the reference footers.
 */

import { b as backBed, comment, f, type CarrierId, type Direction, type KnitoutOp } from '../types.js'
import { CarriageSimulator } from '../sim/carriage-simulator.js'
import type { CarrierSimState, PredictedPass } from '../sim/types.js'
import type { WasteMachineConfig } from './waste-section.js'
import type { FairisleCarrierIntro } from './carrier-intro.js'
import { emitCustomistWasteAndIntro } from './customist-waste-intro.js'

const FRAME_CHOREOGRAPHY = Object.freeze({
  autoMovePresserSpeed: 600,
  autoMovePresserRoller: 0,
  dropPresserSpeed: 100,
  dropPresserRoller: 400,
  drawFinalStitch: 8,
  xferSpeed: 120,
  /** Customist transfer rows: stitch 0 (manual: stitch 0, roller 0, speed 120). */
  xferStitch: 0,
})

export interface CustomistFairisleFrameInput {
  needleStart: number
  needleEnd: number
  wasteCarrier: CarrierId
  /** Body yarns in Customist order: the first casts on and hands off. */
  bodyCarriers: readonly CarrierId[]
  /** Draw yarn inserted after the body yarns (Customist C1). */
  drawCarrier: CarrierId
  wastePasses: number
  waste: WasteMachineConfig
  intro: FairisleCarrierIntro
  /** Body transfer stitch to restore after the frame's transfers. */
  restoreXferStitch?: number
  /** Needles of Studio's yarn catch before each yarn's first row (`STUDIO_YARN_CATCH_NEEDLES_V1`); 0 or absent for the reference's start. */
  catchNeedles?: number
  initialNextDirection?: Direction
}

export interface CustomistFairisleFrameResult {
  ops: KnitoutOp[]
  predictedPasses: readonly PredictedPass[]
  finalNextDirection: Direction
  finalCarrierStates: ReadonlyMap<CarrierId, CarrierSimState>
}

export function emitCustomistFairisleFrame(input: CustomistFairisleFrameInput): CustomistFairisleFrameResult {
  const { needleStart: lo, needleEnd: hi, intro } = input
  const primary = input.bodyCarriers[0]
  if (primary === undefined) throw new Error('customist fairisle frame requires at least one body carrier')
  const sim = new CarriageSimulator({
    carriers: ['1', '2', '3', '4', '5', '6'],
    initialNextDirection: input.initialNextDirection,
  })
  const ops: KnitoutOp[] = [comment('--- CUSTOMIST WASTE & CAST-ON (fairisle) ---')]
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
  emitCustomistWasteAndIntro(sim, ops, input)

  // Drop every rear loop, then the draw-final front row.
  sim.setPresserSpeed(FRAME_CHOREOGRAPHY.dropPresserSpeed)
  sim.setPresserRoller(FRAME_CHOREOGRAPHY.dropPresserRoller)
  sim.setSpeed(intro.introSpeed)
  sim.setRoller(intro.introRoller)
  for (let n = lo; n <= hi; n++) sim.drop(backBed(n))
  sim.setStitch(FRAME_CHOREOGRAPHY.drawFinalStitch)
  bedRow(input.drawCarrier, '-', 'f')
  drain()

  // Zig-zag cast-on at half rack, tubular front + rear, then transfers.
  sim.setPresserSpeed(FRAME_CHOREOGRAPHY.autoMovePresserSpeed)
  sim.setPresserRoller(FRAME_CHOREOGRAPHY.autoMovePresserRoller)
  const [rampCastOn = 3, rampTubular = 5] = intro.rampStitches
  sim.setRacking(0.5)
  sim.setSpeed(intro.rampSpeed)
  sim.setRoller(intro.rampRoller)
  sim.setStitch(rampCastOn)
  for (let n = hi; n >= lo; n--) {
    sim.knit(primary, '-', backBed(n))
    sim.knit(primary, '-', f(n))
  }
  sim.setRoller(intro.introRoller)
  sim.setStitch(rampTubular)
  bedRow(primary, '+', 'f')
  sim.setRacking(0)
  bedRow(primary, '-', 'b')
  drain()
  // Even offsets, then odd (Customist's Rr-Tr / Rl-Tr pair). A rack(0)
  // relief between batches keeps adjacent sources out of one pass.
  sim.setSpeed(FRAME_CHOREOGRAPHY.xferSpeed)
  sim.setXferStitch(FRAME_CHOREOGRAPHY.xferStitch)
  sim.xferBatch(needles('+', even).map((n) => ({ from: backBed(n), to: f(n) })))
  sim.seedRacking(0)
  sim.setRacking(0)
  sim.xferBatch(needles('+', (n) => !even(n)).map((n) => ({ from: backBed(n), to: f(n) })))
  if (input.restoreXferStitch !== undefined) sim.setXferStitch(input.restoreXferStitch)
  drain()

  ops.push(comment('--- END CUSTOMIST WASTE & CAST-ON ---'))

  return {
    ops,
    predictedPasses: sim.predictedPasses(),
    finalNextDirection: sim.finalNextDirection(),
    finalCarrierStates: sim.snapshot(),
  }
}
