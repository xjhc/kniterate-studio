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
import { FAIRISLE_BODY_DEFAULTS } from '../kniterate/constants.js'
import { CUSTOMIST_STUDIO_BIRDSEYE_7GG_OVERRIDES } from '../recipes/customist-studio-birdseye-7gg.js'
import type { PredictedPass } from '../sim/types.js'
import { CUSTOMIST_RIB_CROWN_194_V1, CUSTOMIST_RIB_CROWN_WIDTH, type CustomistRibCrownStep } from './customist-rib-beanie-crown.js'
import { planEightLineCrown, ribBed } from './rib-crown-plan.js'
import { CUSTOMIST_RIB_BEANIE_SETTINGS_V1, emitCustomistFlatStart, flatPieceKit } from './customist-flat-start.js'

export { CUSTOMIST_RIB_BEANIE_SETTINGS_V1 }

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
  /**
   * A colorwork body above the rib cuff: rows in knitting order (bottom
   * first), one carrier per needle offset. The rib then transfers to the
   * front bed and each row knits one pass per color; the eight-line crown is
   * planned for jersey. The body carrier is the ground; other carriers are
   * brought in after it in the waste section.
   *
   * `fairisle` (default): each color knits its front stitches and floats
   * behind the rest. `birdseye`: in the structure of `reference/dbj.kc`, at
   * half rack each color's pass also knits its share of the rear bed (rear
   * offset o in row r belongs to color (o + r) mod N, ground first), so every
   * color is tied to the backing every N needles and no float is longer than
   * N. The back layer starts as dbj.kc's does (the ground knits both beds,
   * then one front and one rear row) and ends as it does (every rear loop
   * onto the front needle across, then one ground row joins the layers).
   */
  jerseyBody?: { readonly rows: readonly (readonly CarrierId[])[]; readonly backing?: 'fairisle' | 'birdseye' }
}

/** Birdseye body settings: Customist's DBJ body (customist-studio-birdseye-7gg.ts, from reference/dbj.kc). */
const BIRDSEYE_BODY = {
  speed: CUSTOMIST_STUDIO_BIRDSEYE_7GG_OVERRIDES.body!.speedNumber!,
  roller: CUSTOMIST_STUDIO_BIRDSEYE_7GG_OVERRIDES.body!.rollerAdvance!,
  stitch: CUSTOMIST_STUDIO_BIRDSEYE_7GG_OVERRIDES.body!.stitchNumber!,
}

/** Ground rows a birdseye body adds to the chart's rows: two to start the back layer, one to join the layers. */
export const BIRDSEYE_BODY_EXTRA_FRONT_ROWS = 3

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
  const bodyRows = input.jerseyBody?.rows ?? []
  if (bodyRows.some((cells) => cells.length !== width)) throw new Error(`every jersey body row must have ${width} cells`)
  if (input.jerseyBody && input.crown === 'customist-194') throw new Error('the customist-194 crown is for an all-rib body; use the eight-line crown with a jersey body')
  const extraCarriers = [...new Set(bodyRows.flat())].filter((c) => c !== body).sort()
  if (extraCarriers.some((c) => c === waste || c === draw)) throw new Error('jersey body colors must not use the waste or draw carrier')
  const s = CUSTOMIST_RIB_BEANIE_SETTINGS_V1
  const sim = new CarriageSimulator({ carriers: ['1', '2', '3', '4', '5', '6'] })
  const ops: KnitoutOp[] = [comment('--- CUSTOMIST 2x2 RIB BEANIE: WASTE & CAST-ON ---')]
  const kit = flatPieceKit(sim, ops, lo, hi)
  const { offsets, settings, xfers, drain } = kit
  const all = () => true
  emitCustomistFlatStart(sim, kit, { bodyCarrier: body, wasteCarrier: waste, drawCarrier: draw, extraCarriers })

  // 1×1 → 2×2: front offsets ≡ 0 go to the rear, rear offsets ≡ 1 to the front.
  xfers([
    { from: 'f', offsets: offsets('+', (o) => o % 4 === 0) },
    { from: 'b', offsets: offsets('+', (o) => o % 4 === 1) },
  ])
  drain()

  ops.push(comment('--- 2x2 RIB BODY ---'))
  settings(s.ribSpeed, s.ribRoller)
  // Design-row provenance (machine row = knit row: the rib first, then the body); it changes no emitted op.
  for (let r = 0; r < input.ribRows; r++) {
    sim.setSourceRows([r])
    const dir = sim.finalNextDirection()
    for (const o of offsets(dir, all)) {
      const bed = ribBed(o)
      sim.setStitch(bed === 'f' ? s.ribStitchFront : s.ribStitchRear)
      sim.knit(body, dir, bed === 'f' ? f(lo + o) : backBed(lo + o))
    }
  }
  sim.setSourceRows(undefined)
  drain()

  if (input.jerseyBody) {
    // Rib → jersey: every rear stitch moves to the empty front needle across.
    xfers([{ from: 'b', offsets: offsets('+', (o) => ribBed(o) === 'b') }])
    drain()
    if (input.jerseyBody.backing === 'birdseye') {
      ops.push(comment('--- BIRDSEYE COLORWORK BODY ---'))
      settings(BIRDSEYE_BODY.speed, BIRDSEYE_BODY.roller, BIRDSEYE_BODY.stitch)
      const colors = [body, ...extraCarriers]
      const sideOf = (carrier: CarrierId): Direction => sim.positionOf(carrier)?.side === 'right' ? '-' : '+'
      /** One pass at half rack: front and rear in carriage order (rear n sits between front n and n + 1). */
      const halfRackPass = (carrier: CarrierId, front: (o: number) => boolean, rear: (o: number) => boolean) => {
        const dir = sideOf(carrier)
        for (const o of offsets(dir, (x) => front(x) || rear(x))) {
          const beds = dir === '+' ? ['f', 'b'] as const : ['b', 'f'] as const
          for (const bed of beds) {
            if (bed === 'f' && front(o)) sim.knit(carrier, dir, f(lo + o))
            if (bed === 'b' && rear(o)) sim.knit(carrier, dir, backBed(lo + o))
          }
        }
      }
      // Start the back layer (dbj.kc): the ground knits both beds, then one front and one rear row.
      sim.setRacking(0.5)
      halfRackPass(body, all, all)
      sim.setRacking(0)
      for (const bed of ['f', 'b'] as const) {
        const dir = sideOf(body)
        for (const o of offsets(dir, all)) sim.knit(body, dir, bed === 'f' ? f(lo + o) : backBed(lo + o))
      }
      sim.setRacking(0.5)
      bodyRows.forEach((cells, r) => {
        sim.setSourceRows([input.ribRows + r])
        colors.forEach((carrier, index) => halfRackPass(carrier, (o) => cells[o] === carrier, (o) => (o + r) % colors.length === index))
      })
      sim.setSourceRows(undefined)
      sim.setRacking(0)
      drain()
      // Join the layers (dbj.kc): every rear loop onto the front needle across, then one ground row.
      xfers([{ from: 'b', offsets: offsets('+', all) }])
      drain()
      settings(FAIRISLE_BODY_DEFAULTS.speedNumber, FAIRISLE_BODY_DEFAULTS.rollerAdvance, FAIRISLE_BODY_DEFAULTS.stitchNumber)
      const dir = sideOf(body)
      for (const o of offsets(dir, all)) sim.knit(body, dir, f(lo + o))
      drain()
    } else {
      ops.push(comment('--- JERSEY COLORWORK BODY ---'))
      settings(FAIRISLE_BODY_DEFAULTS.speedNumber, FAIRISLE_BODY_DEFAULTS.rollerAdvance, FAIRISLE_BODY_DEFAULTS.stitchNumber)
      for (const [r, cells] of bodyRows.entries()) {
        sim.setSourceRows([input.ribRows + r])
        // Ground first, then the other colors; each starts from the side its carrier is parked on.
        for (const carrier of [body, ...extraCarriers]) {
          if (!cells.includes(carrier)) continue
          const dir: Direction = sim.positionOf(carrier)?.side === 'right' ? '-' : '+'
          for (const o of offsets(dir, (x) => cells[x] === carrier)) sim.knit(carrier, dir, f(lo + o))
        }
      }
      sim.setSourceRows(undefined)
      drain()
    }
  }

  if (input.crown !== 'none') {
    let crown: readonly CustomistRibCrownStep[]
    if (input.crown === 'customist-194') {
      if (width !== CUSTOMIST_RIB_CROWN_WIDTH) throw new Error(`the customist-194 crown is defined for ${CUSTOMIST_RIB_CROWN_WIDTH} needles; this piece has ${width}`)
      crown = CUSTOMIST_RIB_CROWN_194_V1
    } else {
      crown = planEightLineCrown(width, sim.finalNextDirection(), input.jerseyBody ? 'jersey' : 'rib').steps
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
  for (const carrier of [draw, body, ...extraCarriers, waste]) sim.out(carrier)
  drain()

  return { ops, predictedPasses: sim.predictedPasses(), finalNextDirection: sim.finalNextDirection() }
}

/** The complete Knitout program for the beanie, with the simulator's predicted passes. */
export function buildCustomistRibBeanie(input: CustomistRibBeanieInput): { program: KnitoutProgram; predictedPasses: readonly PredictedPass[] } {
  const { ops, predictedPasses } = emitCustomistRibBeanie(input)
  return { program: beanieProgram(input, ops), predictedPasses }
}

/** The complete Knitout program for the beanie, ready for the Kniterate converter. */
export function buildCustomistRibBeanieProgram(input: CustomistRibBeanieInput): KnitoutProgram {
  return buildCustomistRibBeanie(input).program
}

function beanieProgram(input: CustomistRibBeanieInput, ops: KnitoutOp[]): KnitoutProgram {
  return {
    version: 2,
    carriers: ['1', '2', '3', '4', '5', '6'],
    machine: 'kniterate',
    gauge: 7,
    position: 'Keep',
    yarns: {
      ...Object.fromEntries([...new Set((input.jerseyBody?.rows ?? []).flat())].map((carrier) => [carrier, `colour ${carrier}`])),
      [input.bodyCarrier]: 'main', [input.wasteCarrier]: 'waste', [input.drawCarrier]: 'draw thread',
    },
    kniterate: { xferStyle: 'four-pass' },
    ops,
  }
}
