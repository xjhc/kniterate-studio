/**
 * Customist 2×2 rib beanie, a flat piece seamed afterwards, in the
 * construction of `reference/2x2-rib-beanie.kc`; `reference: true`
 * reproduces that file exactly.
 *
 * Sections, as decoded from the reference trace (offsets are from the
 * piece's left needle `lo`; W = hi − lo + 1 is even):
 *   Waste       an 81-pass waste interlock on the waste yarn
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
 *   Top         rows of waste yarn hold the top's stitches, then are
 *               released (the reference drops the live loops instead)
 */

import { b as backBed, comment, f, type CarrierId, type Direction, type KnitoutOp, type KnitoutProgram } from '../types.js'
import { CarriageSimulator } from '../sim/carriage-simulator.js'
import { FAIRISLE_BODY_DEFAULTS } from '../kniterate/constants.js'
import { CUSTOMIST_STUDIO_BIRDSEYE_7GG_OVERRIDES, STUDIO_BIRDSEYE_BODY_ROLLER_V1 } from '../recipes/customist-studio-birdseye-7gg.js'
import type { PredictedPass } from '../sim/types.js'
import { CUSTOMIST_RIB_CROWN_194_V1, CUSTOMIST_RIB_CROWN_WIDTH, type CustomistRibCrownStep } from './customist-rib-beanie-crown.js'
import { STUDIO_CROWN_JERSEY_STITCH_V1, planEightLineCrown, ribBed } from './rib-crown-plan.js'
import { CUSTOMIST_RIB_BEANIE_SETTINGS_V1, STUDIO_FLAT_START_SETTINGS_V1, emitCustomistFlatStart, flatPieceKit, flatStartSettingsV1, type FlatSectionSettingsV1, type SectionSettingsV1 } from './customist-flat-start.js'
import { SHAPED_PANEL_TOP_WASTE_ROWS } from './shaped-panel.js'
import { STUDIO_FIRST_ROW_AFTER_TRANSFERS_ROLLER_V1 } from './first-row-speed.js'
import { doubleJacquardEdgeTransfers, validateDoubleJacquardEdgeCrown, type DoubleJacquardEdgeCrown } from './dbj-edge-decrease.js'

export { CUSTOMIST_RIB_BEANIE_SETTINGS_V1 }

export interface CustomistRibBeanieInput {
  /** Leftmost and rightmost knitout needles of the piece; the width must be even. */
  needleStart: number
  needleEnd: number
  bodyCarrier: CarrierId
  wasteCarrier: CarrierId
  /** The draw thread; null for none (the waste is then unravelled or cut away). */
  drawCarrier: CarrierId | null
  /** Waste interlock passes at the start (default the reference's 81). */
  startWastePasses?: number
  /** The colourwork body's settings, over the backing's reference. */
  bodySettings?: SectionSettingsV1
  /**
   * Waste, cast-on, rib, transfer and crown settings, over the reference's;
   * the transfers are every transfer's, the crown's too, and the crown's are
   * every crown row's (its stitch size the front bed's, the rear keeping the
   * row's step below).
   */
  sections?: FlatSectionSettingsV1
  /**
   * Reproduce `reference/2x2-rib-beanie.kc`: its start and its knit-off,
   * which drops the top's live loops. Otherwise Studio's start
   * (`STUDIO_FLAT_START_SETTINGS_V1`) and a waste top.
   */
  reference?: boolean
  /** Rows of waste yarn on top (default `SHAPED_PANEL_TOP_WASTE_ROWS`); not with `reference`. */
  topWasteRows?: number
  /** 2×2 rib rows after the set-up. */
  ribRows: number
  /** Straight birdseye panel: no rib, no layer join or decreases; hold both layers on waste for hand gathering. */
  straightDoubleJacquard?: boolean
  /** Development-only two-colour inverse backing; straight panel with both-bed waste finish. */
  experimentalReversibleJacquard?: boolean
  /** Fixed Run 2 waste/intro prefix; keeps this beanie's subsequent two-bed cast-on. */
  experimentalStartup?: 'run2-waste-and-intro'
  /** Development-only taper above the straight DBJ body. Not exposed as a validated Studio garment recipe. */
  experimentalDoubleJacquardCrown?: DoubleJacquardEdgeCrown
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

/** Birdseye body settings: Customist's DBJ body (customist-studio-birdseye-7gg.ts, from reference/dbj.kc) at Studio's roller. */
const BIRDSEYE_BODY = {
  speed: CUSTOMIST_STUDIO_BIRDSEYE_7GG_OVERRIDES.body!.speedNumber!,
  roller: STUDIO_BIRDSEYE_BODY_ROLLER_V1,
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
  const straight = input.straightDoubleJacquard === true
  const reversible = input.experimentalReversibleJacquard === true
  const run2Startup = input.experimentalStartup === 'run2-waste-and-intro'
  if (run2Startup && (!reversible || input.startWastePasses !== undefined || draw === null)) throw new Error('Run 2 startup requires reversible mode, draw thread, and its fixed waste length')
  if (run2Startup && width <= 20) throw new Error('Run 2 startup currently requires width greater than its 20-needle catch zone')
  const edgeCrown = input.experimentalDoubleJacquardCrown
  if (reversible && (!straight || edgeCrown)) throw new Error('experimental reversible jacquard requires a straight panel without experimental decreases')
  if (edgeCrown && !straight) throw new Error('experimental DBJ edge crown requires the straight double-jacquard body')
  if (edgeCrown) validateDoubleJacquardEdgeCrown(lo, hi, edgeCrown)
  let topLo = lo
  let topHi = hi
  if (straight && (input.reference || input.ribRows !== 0 || input.crown !== 'none' || input.jerseyBody?.backing !== 'birdseye' || bodyRows.length === 0)) {
    throw new Error('straight double jacquard needs a birdseye body, zero rib rows, no machine crown and a waste top')
  }
  if (straight && input.topWasteRows !== undefined && (!Number.isInteger(input.topWasteRows) || input.topWasteRows < 2)) throw new Error('straight double jacquard needs at least two waste rows on each bed')
  if (bodyRows.some((cells) => cells.length !== width)) throw new Error(`every jersey body row must have ${width} cells`)
  if (input.jerseyBody && input.crown === 'customist-194') throw new Error('the customist-194 crown is for an all-rib body; use the eight-line crown with a jersey body')
  const extraCarriers = [...new Set(bodyRows.flat())].filter((c) => c !== body).sort()
  if (reversible && (extraCarriers.length !== 1 || !bodyRows.some(row => row.includes(body)))) throw new Error('experimental reversible jacquard requires exactly two body colours including the ground')
  if (extraCarriers.some((c) => c === waste || c === draw)) throw new Error('jersey body colors must not use the waste or draw carrier')
  const s = flatStartSettingsV1(input.sections, input.reference ? CUSTOMIST_RIB_BEANIE_SETTINGS_V1 : STUDIO_FLAT_START_SETTINGS_V1)
  const sim = new CarriageSimulator({ carriers: ['1', '2', '3', '4', '5', '6'] })
  const ops: KnitoutOp[] = [comment(straight ? '--- STRAIGHT DOUBLE JACQUARD: WASTE & CAST-ON ---' : '--- CUSTOMIST 2x2 RIB BEANIE: WASTE & CAST-ON ---')]
  const kit = flatPieceKit(sim, ops, lo, hi, s)
  const { offsets, settings, xfers, drain } = kit
  const all = () => true
  emitCustomistFlatStart(sim, kit, { bodyCarrier: body, wasteCarrier: waste, drawCarrier: draw, extraCarriers, settings: s, run2WasteAndIntro: run2Startup, ...(input.startWastePasses !== undefined ? { wastePasses: input.startWastePasses } : {}) })

  if (!straight) {
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
  }

  if (input.jerseyBody) {
    if (!straight) {
      // Rib → jersey: every rear stitch moves to the empty front needle across.
      xfers([{ from: 'b', offsets: offsets('+', (o) => ribBed(o) === 'b') }])
      drain()
    }
    if (input.jerseyBody.backing === 'birdseye') {
      ops.push(comment(reversible ? '--- EXPERIMENTAL REVERSIBLE JACQUARD BODY ---' : '--- BIRDSEYE COLORWORK BODY ---'))
      const own = input.bodySettings ?? {}
      settings(own.speed ?? BIRDSEYE_BODY.speed, own.roller ?? BIRDSEYE_BODY.roller, own.stitch ?? BIRDSEYE_BODY.stitch)
      const colors = [body, ...extraCarriers]
      const sideOf = (carrier: CarrierId): Direction => sim.positionOf(carrier)?.side === 'right' ? '-' : '+'
      /** Half-rack supports both beds per column; rack-zero complement selections must be disjoint. */
      const knitBedPass = (carrier: CarrierId, front: (o: number) => boolean, rear: (o: number) => boolean) => {
        const dir = sideOf(carrier)
        for (const o of offsets(dir, (x) => front(x) || rear(x))) {
          const beds = dir === '+' ? ['f', 'b'] as const : ['b', 'f'] as const
          for (const bed of beds) {
            if (bed === 'f' && front(o)) sim.knit(carrier, dir, f(lo + o))
            if (bed === 'b' && rear(o)) sim.knit(carrier, dir, backBed(lo + o))
          }
        }
      }
      // Fill both beds: the ground knits both, then one front and one rear row.
      // The straight panel starts with the alternating-bed cast-on loops;
      // the cuffed recipe starts with all loops transferred to the front.
      // Keep the first full-bed row gentle in either construction.
      const bodyRoller = own.roller ?? BIRDSEYE_BODY.roller
      sim.setRoller(STUDIO_FIRST_ROW_AFTER_TRANSFERS_ROLLER_V1)
      sim.setRacking(0.5)
      knitBedPass(body, all, all)
      sim.setRoller(bodyRoller)
      sim.setRacking(0)
      for (const bed of ['f', 'b'] as const) {
        const dir = sideOf(body)
        for (const o of offsets(dir, all)) sim.knit(body, dir, bed === 'f' ? f(lo + o) : backBed(lo + o))
      }
      sim.setRacking(reversible ? 0 : 0.5)
      bodyRows.forEach((cells, r) => {
        sim.setSourceRows([input.ribRows + r])
        // Experimental shaping only: ease the last design row before transfers.
        if (edgeCrown && r === bodyRows.length - 1) sim.setRoller(Math.floor(bodyRoller / 2))
        // Inverse backing: each carrier knits exactly one bed per column,
        // at rack zero. Across the pair, both beds knit every needle once.
        // Keep the layers on their own beds through the waste finish.
        colors.forEach((carrier, index) => knitBedPass(carrier, (o) => cells[o] === carrier,
          (o) => reversible ? cells[o] !== carrier : (o + r) % colors.length === index))
      })
      sim.setSourceRows(undefined)
      if (edgeCrown) {
        drain()
        ops.push(comment('--- EXPERIMENTAL DOUBLE JACQUARD EDGE CROWN ---'))
        for (let step = 0; step < edgeCrown.steps; step++) {
          settings(input.sections?.transfers?.speed ?? 100, 0)
          sim.setXferStitch(0)
          for (const transfer of doubleJacquardEdgeTransfers(topLo, topHi)) {
            sim.setRacking(transfer.rack)
            sim.xfer(transfer.from, transfer.to)
          }
          topLo++
          topHi--
          drain()
          ops.push(comment(`DBJ taper step ${step + 1}: ${topHi - topLo + 1} columns on EACH bed`))
          settings(own.speed ?? BIRDSEYE_BODY.speed, bodyRoller, own.stitch ?? BIRDSEYE_BODY.stitch)
          sim.setRacking(0.5)
          for (let row = 0; row < edgeCrown.rowsPerStep; row++) {
            const beforeNextDecrease = row === edgeCrown.rowsPerStep - 1 && step < edgeCrown.steps - 1
            sim.setRoller(row === 0 ? STUDIO_FIRST_ROW_AFTER_TRANSFERS_ROLLER_V1 : beforeNextDecrease ? Math.floor(bodyRoller / 2) : bodyRoller)
            const backingRow = bodyRows.length + step * edgeCrown.rowsPerStep + row
            const active = (o: number) => lo + o >= topLo && lo + o <= topHi
            // Solid ground face above the bird; alternate both colors on the
            // backing, keeping the original birdseye phase and stitch size.
            colors.forEach((carrier, index) => knitBedPass(carrier,
              (o) => active(o) && carrier === body,
              (o) => active(o) && (o + backingRow) % colors.length === index))
          }
          drain()
        }
      }
      sim.setRacking(0)
      drain()
      if (!straight) {
        // Join the layers (dbj.kc): every rear loop onto the front needle across, then one ground row.
        xfers([{ from: 'b', offsets: offsets('+', all) }])
        drain()
        settings(FAIRISLE_BODY_DEFAULTS.speedNumber, FAIRISLE_BODY_DEFAULTS.rollerAdvance, FAIRISLE_BODY_DEFAULTS.stitchNumber)
        const dir = sideOf(body)
        for (const o of offsets(dir, all)) sim.knit(body, dir, f(lo + o))
        drain()
      }
    } else {
      ops.push(comment('--- JERSEY COLORWORK BODY ---'))
      const own = input.bodySettings ?? {}
      settings(own.speed ?? FAIRISLE_BODY_DEFAULTS.speedNumber, own.roller ?? FAIRISLE_BODY_DEFAULTS.rollerAdvance, own.stitch ?? FAIRISLE_BODY_DEFAULTS.stitchNumber)
      const bodyRoller = own.roller ?? FAIRISLE_BODY_DEFAULTS.rollerAdvance
      for (const [r, cells] of bodyRows.entries()) {
        sim.setSourceRows([input.ribRows + r])
        // The first row after the rib's transfers pulls gently (Kniterate's guidance after many transfers).
        if (r === 0) sim.setRoller(STUDIO_FIRST_ROW_AFTER_TRANSFERS_ROLLER_V1)
        if (r === 1) sim.setRoller(bodyRoller)
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
    // Your transfer settings are every transfer's, the crown's too; without them the crown keeps its reference's.
    const transfers = input.sections?.transfers
    const own = input.sections?.crown
    for (const step of crown) {
      if (step[0] === 'x') {
        const [, rack, from, referenceSpeed, referenceRoller, referenceStitch, sources] = step
        const speed = transfers?.speed ?? referenceSpeed
        const roller = transfers?.roller ?? referenceRoller
        const xferStitch = transfers?.stitch ?? referenceStitch
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
        const [, dir, referenceSpeed, referenceRoller, referenceFront, referenceRear, front, rear] = step
        // Studio's crowns knit no jersey row below STUDIO_CROWN_JERSEY_STITCH_V1; the reference's top rows are at 5.
        const frontStitch = own?.stitch ?? (rear.length === 0 && !input.reference ? Math.max(referenceFront, STUDIO_CROWN_JERSEY_STITCH_V1) : referenceFront)
        const rearStitch = own?.stitch === undefined ? referenceRear : Math.max(0, own.stitch - (referenceFront - referenceRear))
        sim.setRacking(0)
        settings(own?.speed ?? referenceSpeed, own?.roller ?? referenceRoller)
        const frontSet = new Set(front)
        const rearSet = new Set(rear)
        for (const o of offsets(dir, (x) => frontSet.has(x) || rearSet.has(x))) {
          if (frontSet.has(o)) { sim.setStitch(frontStitch); sim.knit(body, dir, f(lo + o)) }
          if (rearSet.has(o)) { sim.setStitch(rearStitch); sim.knit(body, dir, backBed(lo + o)) }
        }
      }
    }
    sim.setRacking(0)
    const last = crown.at(-1)
    const top = last?.[0] === 'k' ? last[6] : []
    if (input.reference) {
      // Knit off: drop the top's live loops (they are gathered by hand).
      sim.setRoller(0)
      sim.setStitch(0)
      for (const o of top) sim.drop(f(lo + o))
    } else if (top.length > 0) {
      // Waste yarn over the top's stitches, then released: they are gathered by hand off the machine before the waste comes out.
      drain()
      ops.push(comment('--- WASTE ON TOP ---'))
      const first = Math.min(...top)
      const span = Array.from({ length: Math.max(...top) - first + 1 }, (_, k) => first + k)
      const live = new Set(top)
      settings(s.tubeSpeed, s.castOnRoller, s.wasteStitch)
      for (let k = 0; k < (input.topWasteRows ?? SHAPED_PANEL_TOP_WASTE_ROWS); k++) {
        const dir: Direction = sim.positionOf(waste)?.side === 'left' ? '+' : '-'
        // The first row knits only the top's stitches; later rows knit across any gap so the waste holds together.
        for (const o of dir === '+' ? span : [...span].reverse()) if (k > 0 || live.has(o)) sim.knit(waste, dir, f(lo + o))
      }
      drain()
      for (const o of span) sim.drop(f(lo + o))
    }
    drain()
  }

  if (straight) {
    // Preserve both sets of live loops. Separate front/rear passes at rack 0
    // make a waste tube; no layer join, tightening, or transfer is required.
    ops.push(comment('--- WASTE ON TOP: BOTH BEDS ---'))
    sim.setRacking(0)
    settings(s.tubeSpeed, s.castOnRoller, s.wasteStitch)
    for (let row = 0; row < (input.topWasteRows ?? SHAPED_PANEL_TOP_WASTE_ROWS); row++) {
      for (const bed of ['f', 'b'] as const) {
        const dir: Direction = sim.positionOf(waste)?.side === 'left' ? '+' : '-'
        for (const o of offsets(dir, (x) => lo + x >= topLo && lo + x <= topHi)) sim.knit(waste, dir, bed === 'f' ? f(lo + o) : backBed(lo + o))
      }
    }
    drain()
    for (const bed of ['f', 'b'] as const) {
      for (const o of offsets('+', (x) => lo + x >= topLo && lo + x <= topHi)) sim.drop(bed === 'f' ? f(lo + o) : backBed(lo + o))
    }
    drain()
  }

  // Carriers out in the reference order: draw, body, waste.
  for (const carrier of [...(draw !== null ? [draw] : []), body, ...extraCarriers, waste]) sim.out(carrier)
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
      [input.bodyCarrier]: 'main', [input.wasteCarrier]: 'waste', ...(input.drawCarrier !== null ? { [input.drawCarrier]: 'draw thread' } : {}),
    },
    kniterate: { xferStyle: 'four-pass' },
    ops,
  }
}
