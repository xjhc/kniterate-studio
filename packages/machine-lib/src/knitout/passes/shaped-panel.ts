/**
 * A shaped flat panel (a sweater front, back, sleeve or band), knitted
 * bottom-up in one yarn with any knit/purl/tuck/slip texture.
 *
 * The piece starts with Customist's flat start (customist-flat-start.ts):
 * waste, draw thread and a 1×1 cast-on over the first row's needles. Every
 * row after that is described by its live needle segments and the stitch at
 * each needle; the change from one row to the next is the shaping, built
 * with the choreography decoded from Customist's sweater panels
 * (`reference/front.kc`, `reference/sleeves.kc`):
 *
 *   Decrease 1–2   the edge stitches shift inward through the rear bed at
 *                  rack ∓d, so the innermost moved stitch lands on its
 *                  neighbour (never more than two loops on a needle)
 *   Increase 1     the edge stitch shifts outward one needle; the needle it
 *                  left knits a new loop in the row
 *   Bind off ≥ 3   a chain bind-off from the edge the yarn is at, one stitch
 *                  at a time: transfer onto the next stitch, knit the pair
 *   Neck split     one segment becomes two: the yarn (on the right) knits the
 *                  right part, binds off the centre leftward into the left
 *                  part and finishes the row. From then on the second yarn,
 *                  brought in during the waste section, knits the right part.
 *
 * Texture: `k` knits on the front bed, `p` on the rear bed (a purl seen from
 * the front), `t`/`u` tuck on the front/rear bed and `s` slips (no loop is
 * formed; the stitch stays on its bed). Before each row, rack-0 transfers put
 * every stitch on the bed its next stitch needs. One carriage pass knits each
 * segment, so a row cannot both knit and tuck on the same bed.
 *
 * The top is a chain bind-off of every segment with its own yarn, or rows of
 * waste yarn that are then released.
 */

import { b as backBed, comment, f, type BedNeedle, type CarrierId, type Direction, type KnitoutOp, type KnitoutProgram } from '../types.js'
import { CarriageSimulator } from '../sim/carriage-simulator.js'
import type { PredictedPass } from '../sim/types.js'
import { FAIRISLE_BODY_DEFAULTS, KNITERATE_MAX_RACK as MAX_RACK } from '../kniterate/constants.js'
import { CHAIN_BINDOFF_DEFAULTS } from './bind-off.js'
import { CUSTOMIST_RIB_BEANIE_SETTINGS_V1, emitCustomistFlatStart, flatPieceKit } from './customist-flat-start.js'

export type PanelStitchV1 = 'k' | 'p' | 't' | 'u' | 's'

export interface PanelSegmentV1 {
  /** Leftmost and rightmost live knitout needles of the segment. */
  readonly lo: number
  readonly hi: number
}

export interface PanelRowV1 {
  /** Live needles after this row's shaping, left to right: one segment, or two after the neck split. */
  readonly segments: readonly PanelSegmentV1[]
  /** The stitch at each live needle. */
  readonly stitch: (needle: number) => PanelStitchV1
  /** Machine settings: Customist's rib settings, or the jersey body settings. */
  readonly settings: 'rib' | 'body'
  /** Design row recorded on the row's passes (provenance only). */
  readonly sourceRow?: number
}

/** Rows of waste yarn a shaped piece finishes on, when its top is waste. */
export const SHAPED_PANEL_TOP_WASTE_ROWS = 8

export interface ShapedPanelInputV1 {
  /** Rows in knitting order. The first row's single segment is the cast-on; its width must be even. */
  readonly rows: readonly PanelRowV1[]
  readonly mainCarrier: CarrierId
  /** The second yarn of the same colour that knits the right part after a neck split. */
  readonly secondCarrier?: CarrierId
  readonly wasteCarrier: CarrierId
  /** The draw thread; null for none (the waste is then unravelled or cut away). */
  readonly drawCarrier: CarrierId | null
  /** Waste interlock passes at the start (default the reference's 81). */
  readonly startWastePasses?: number
  /** How the top is finished. `waste` knits `wasteRows` rows of waste yarn (default `SHAPED_PANEL_TOP_WASTE_ROWS`) over every live stitch, then releases them. */
  readonly top: 'bind-off' | 'waste'
  readonly wasteRows?: number
  /** Edge stitches moved by a decrease or increase (default 1: the edge stitch). 2 or 3 sets the fashioning line further in. */
  readonly fashion?: number
}

export interface ShapedPanelResultV1 {
  readonly ops: KnitoutOp[]
  readonly predictedPasses: readonly PredictedPass[]
  readonly program: KnitoutProgram
}

export class ShapedPanelError extends Error {
  constructor(readonly row: number | null, message: string) {
    super(row === null ? message : `row ${row + 1}: ${message}`)
    this.name = 'ShapedPanelError'
  }
}

const RIB = CUSTOMIST_RIB_BEANIE_SETTINGS_V1
const BODY = { speed: FAIRISLE_BODY_DEFAULTS.speedNumber, roller: FAIRISLE_BODY_DEFAULTS.rollerAdvance, stitch: FAIRISLE_BODY_DEFAULTS.stitchNumber }
const XFER = { speed: RIB.xferSpeed, roller: RIB.xferRoller, stitch: RIB.xferStitch }
const BIND = CHAIN_BINDOFF_DEFAULTS

type Bed = 'f' | 'b'

function bedFor(stitch: PanelStitchV1, current: Bed | null): Bed {
  if (stitch === 'k' || stitch === 't') return 'f'
  if (stitch === 'p' || stitch === 'u') return 'b'
  return current ?? 'f'
}

export function emitShapedPanelV1(input: ShapedPanelInputV1): ShapedPanelResultV1 {
  const rows = input.rows
  if (rows.length === 0) throw new ShapedPanelError(null, 'a panel needs at least one row')
  const first = rows[0]!.segments
  if (first.length !== 1) throw new ShapedPanelError(0, 'the cast-on row must be one segment')
  const castOn = first[0]!
  const width = castOn.hi - castOn.lo + 1
  if (width < 8 || width % 2 !== 0) throw new ShapedPanelError(0, `the cast-on must be an even number of needles, at least 8; it is ${width}`)
  const fashion = input.fashion ?? 1
  if (!Number.isInteger(fashion) || fashion < 1 || fashion > 3) throw new ShapedPanelError(null, 'fashion must be 1, 2 or 3 stitches')
  // Shaping moves up to max(fashion, 2) stitches by up to two needles.
  const SELVEDGE = fashion + 2
  const splits = rows.some((row) => row.segments.length === 2)
  const A = input.mainCarrier
  const B = input.secondCarrier
  if (splits && B === undefined) throw new ShapedPanelError(null, 'a neck split needs a second carrier for the right part')
  const used = [A, ...(B && splits ? [B] : []), input.wasteCarrier, ...(input.drawCarrier !== null ? [input.drawCarrier] : [])]
  if (new Set(used).size !== used.length) throw new ShapedPanelError(null, 'the main, second, waste and draw yarns need four different carriers')

  const sim = new CarriageSimulator({ carriers: ['1', '2', '3', '4', '5', '6'] })
  const ops: KnitoutOp[] = [comment('--- SHAPED PANEL: CUSTOMIST WASTE & CAST-ON ---')]
  const kit = flatPieceKit(sim, ops, castOn.lo, castOn.hi)
  emitCustomistFlatStart(sim, kit, {
    bodyCarrier: A,
    wasteCarrier: input.wasteCarrier,
    drawCarrier: input.drawCarrier,
    extraCarriers: splits ? [B!] : [],
    ...(input.startWastePasses !== undefined ? { wastePasses: input.startWastePasses } : {}),
  })
  const drain = kit.drain

  // Loops per needle and bed after the start: front on even offsets, rear on odd.
  const loops = { f: new Map<number, number>(), b: new Map<number, number>() }
  for (let n = castOn.lo; n <= castOn.hi; n++) loops[(n - castOn.lo) % 2 === 0 ? 'f' : 'b'].set(n, 1)
  const bedOf = (n: number): Bed | null => ((loops.f.get(n) ?? 0) > 0 ? 'f' : (loops.b.get(n) ?? 0) > 0 ? 'b' : null)
  const needle = (bed: Bed, n: number): BedNeedle => (bed === 'f' ? f(n) : backBed(n))
  let rowIndex: number | null = null
  const fail = (message: string): never => { throw new ShapedPanelError(rowIndex, message) }

  /** Moves loops by plan, all at one racking. Knitout racking r puts front n across from back n − r. */
  const moveBatch = (pairs: { from: Bed; fromNeedle: number; to: Bed; toNeedle: number }[], racking: number) => {
    if (pairs.length === 0) return
    if (Math.abs(racking) > MAX_RACK) fail(`racking ${racking} is beyond the machine's ±${MAX_RACK}`)
    sim.setSpeed(XFER.speed)
    sim.setRoller(XFER.roller)
    sim.setXferStitch(XFER.stitch)
    sim.setRacking(racking)
    for (const pair of pairs) {
      const across = pair.from === 'f' ? pair.fromNeedle - racking : pair.fromNeedle + racking
      if (pair.from === pair.to || across !== pair.toNeedle) fail(`transfer ${pair.from}${pair.fromNeedle}→${pair.to}${pair.toNeedle} is not across at racking ${racking}`)
    }
    // Every source is lifted before any target lands, as one batch.
    const moved = pairs.map((pair) => {
      const count = loops[pair.from].get(pair.fromNeedle) ?? 0
      if (count === 0) fail(`no loop on ${pair.from}${pair.fromNeedle} to transfer`)
      loops[pair.from].set(pair.fromNeedle, 0)
      return count
    })
    pairs.forEach((pair, index) => {
      const total = (loops[pair.to].get(pair.toNeedle) ?? 0) + moved[index]!
      if (total > 2) fail(`${pair.to}${pair.toNeedle} would hold ${total} loops`)
      loops[pair.to].set(pair.toNeedle, total)
    })
    sim.xferBatch(pairs.map((pair) => ({ from: needle(pair.from, pair.fromNeedle), to: needle(pair.to, pair.toNeedle) })))
    sim.setRacking(0)
  }
  /** Rack-0 transfers putting the loops of `needles` on the beds `want` returns. */
  const setBeds = (needles: Iterable<number>, want: (n: number) => Bed) => {
    const toRear: number[] = []
    const toFront: number[] = []
    for (const n of needles) {
      const bed = bedOf(n)
      if (bed === null) continue
      const target = want(n)
      if (bed === target) continue
      if ((loops[target].get(n) ?? 0) > 0) fail(`needle ${n} has loops on both beds`)
      ;(target === 'b' ? toRear : toFront).push(n)
    }
    moveBatch(toRear.map((n) => ({ from: 'f', fromNeedle: n, to: 'b', toNeedle: n })), 0)
    moveBatch(toFront.map((n) => ({ from: 'b', fromNeedle: n, to: 'f', toNeedle: n })), 0)
  }
  const range = (lo: number, hi: number): number[] => { const out: number[] = []; for (let n = lo; n <= hi; n++) out.push(n); return out }
  const sideOf = (carrier: CarrierId): 'left' | 'right' => (sim.positionOf(carrier)?.side === 'right' ? 'right' : 'left')

  /**
   * Shifts the `fashion` (at least |shift|) edge stitches of a segment by
   * `shift` needles inward (a decrease) or outward (an increase), through the
   * rear bed. `edge` is the segment's outermost needle on that side.
   */
  const shiftEdge = (side: 'left' | 'right', edge: number, shift: number) => {
    const block = Math.max(fashion, Math.abs(shift))
    const inward = side === 'left' ? 1 : -1
    const sources = range(0, block - 1).map((k) => edge + inward * k)
    const delta = inward * shift
    const touched = [...new Set([...sources, ...sources.map((n) => n + delta)])]
    for (const n of sources) if (bedOf(n) === null) fail(`the ${side} edge has no loop on needle ${n} to move`)
    setBeds(touched, () => 'f')
    for (const n of touched) if ((loops.b.get(n) ?? 0) > 0) fail(`rear needle ${n} is not free for the ${side} edge shaping`)
    // Front n → rear n + delta (racking −delta), then rear → front at rack 0.
    moveBatch(sources.map((n) => ({ from: 'f', fromNeedle: n, to: 'b', toNeedle: n + delta })), -delta)
    moveBatch(sources.map((n) => ({ from: 'b', fromNeedle: n + delta, to: 'f', toNeedle: n + delta })), 0)
  }

  /**
   * Chain bind-off of `count` stitches starting at `start` and moving in
   * `step` (+1 rightward, −1 leftward) with `carrier`; the last bound stitch
   * merges onto the needle after them, which is knitted. With `dropLast` the
   * final stitch has no neighbour and is dropped (the top of a segment).
   */
  const chainBindOff = (carrier: CarrierId, start: number, count: number, step: 1 | -1, dropLast: boolean) => {
    const needles = range(0, count - 1).map((k) => start + step * k)
    const into = start + step * count
    setBeds(dropLast ? needles : [...needles, into], () => 'f')
    // Each knit runs back toward the bound edge so the yarn stays clear of the next transfers.
    const dir: Direction = step === 1 ? '-' : '+'
    const merges = dropLast ? needles.slice(0, -1) : needles
    merges.forEach((n, index) => {
      if ((loops.b.get(n) ?? 0) > 0) fail(`rear needle ${n} is not free for the bind-off`)
      moveBatch([{ from: 'f', fromNeedle: n, to: 'b', toNeedle: n }], 0)
      moveBatch([{ from: 'b', fromNeedle: n, to: 'f', toNeedle: n + step }], step)
      sim.setSpeed(BIND.knitSpeed)
      sim.setStitch(BIND.knitStitch)
      sim.setRoller(BIND.knitRollerRamp[Math.min(index, BIND.knitRollerRamp.length - 1)] ?? 100)
      sim.knit(carrier, dir, f(n + step))
      loops.f.set(n + step, 1)
    })
    if (dropLast) {
      const last = needles.at(-1)!
      sim.drop(f(last))
      loops.f.set(last, 0)
    }
    drain()
  }

  /**
   * The stitch each needle of `segment` actually knits in `row`. The selvedge
   * knits plain: a tuck or slip there could stack a third loop onto shaping
   * transfers, and a slip at the edge leaves the yarn uncaught. So does any
   * needle that is empty or still holds a decrease, and any needle the next
   * row binds off or moves (`next`: the next row's segments, or null when
   * the top bind-off follows and takes every stitch). A plain stitch knits on
   * whichever bed already knits in the row, because one carriage pass cannot
   * both knit and tuck on the same bed.
   */
  const planSegment = (segment: PanelSegmentV1, row: PanelRowV1, next: readonly PanelSegmentV1[] | null): Map<number, PanelStitchV1> => {
    const keptNext = (n: number) => next !== null && next.some((part) => n - part.lo >= SELVEDGE && part.hi - n >= SELVEDGE)
    const plan = new Map<number, PanelStitchV1>()
    const cams: Record<Bed, 'knit' | 'tuck' | null> = { f: null, b: null }
    const plain: number[] = []
    for (const n of range(segment.lo, segment.hi)) {
      const stitch = row.stitch(n)
      const current = bedOf(n)
      const selvedge = n - segment.lo < SELVEDGE || segment.hi - n < SELVEDGE || !keptNext(n)
      if (stitch !== 'k' && stitch !== 'p' && (selvedge || current === null || (loops[current].get(n) ?? 0) > 1)) { plain.push(n); continue }
      plan.set(n, stitch)
      if (stitch === 's') continue
      const bed = bedFor(stitch, current)
      const cam = stitch === 't' || stitch === 'u' ? 'tuck' : 'knit'
      if (cams[bed] !== null && cams[bed] !== cam) fail(`this row both knits and tucks on the ${bed === 'f' ? 'front' : 'rear'} bed, which takes two carriage passes`)
      cams[bed] = cam
    }
    for (const n of plain) {
      const home = bedOf(n) ?? bedFor(row.stitch(n), null)
      const other: Bed = home === 'f' ? 'b' : 'f'
      const bed = cams[home] !== 'tuck' ? home : cams[other] !== 'tuck' ? other : fail(`needle ${n} must knit plain but both beds tuck in this row`)
      cams[bed] = 'knit'
      plan.set(n, bed === 'f' ? 'k' : 'p')
    }
    return plan
  }

  /** One pass knitting `segment` by `plan` with `carrier`, from the side it is on. */
  const knitSegment = (carrier: CarrierId, segment: PanelSegmentV1, row: PanelRowV1, plan: Map<number, PanelStitchV1>) => {
    const dir: Direction = sideOf(carrier) === 'left' ? '+' : '-'
    const needles = dir === '+' ? range(segment.lo, segment.hi) : range(segment.lo, segment.hi).reverse()
    if (row.settings === 'rib') { sim.setSpeed(RIB.ribSpeed); sim.setRoller(RIB.ribRoller) }
    else { sim.setSpeed(BODY.speed); sim.setRoller(BODY.roller) }
    for (const n of needles) {
      const stitch = plan.get(n)!
      if (stitch === 's') continue
      const current = bedOf(n)
      const bed = bedFor(stitch, current)
      if (current !== null && current !== bed) fail(`needle ${n} is on the ${current === 'f' ? 'front' : 'rear'} bed but its stitch needs the other`)
      const tuck = stitch === 't' || stitch === 'u'
      sim.setStitch(row.settings === 'rib' ? (bed === 'f' ? RIB.ribStitchFront : RIB.ribStitchRear) : BODY.stitch)
      if (tuck) sim.tuck(carrier, dir, needle(bed, n))
      else sim.knit(carrier, dir, needle(bed, n))
      // A knit leaves one new loop; a tuck adds one to those held.
      loops[bed].set(n, tuck ? (loops[bed].get(n) ?? 0) + 1 : 1)
      if ((loops[bed].get(n) ?? 0) > 2) fail(`needle ${n} would hold more than two loops after repeated tucks`)
    }
  }
  /** Transfers `segment` to its planned beds, then knits it. */
  const knitPlanned = (carrier: CarrierId, segment: PanelSegmentV1, row: PanelRowV1, next: readonly PanelSegmentV1[] | null) => {
    const plan = planSegment(segment, row, next)
    setBeds(range(segment.lo, segment.hi), (n) => bedFor(plan.get(n)!, bedOf(n)))
    knitSegment(carrier, segment, row, plan)
  }

  ops.push(comment('--- SHAPED PANEL: BODY ---'))
  let previous: readonly PanelSegmentV1[] = first
  for (const [r, row] of rows.entries()) {
    rowIndex = r
    sim.setSourceRows(row.sourceRow === undefined ? undefined : [row.sourceRow])
    const segments = row.segments
    for (const segment of segments) if (segment.hi - segment.lo + 1 < 2) fail('every segment needs at least two stitches')
    if (segments.some((segment, index) => index > 0 && segment.lo <= segments[index - 1]!.hi + 1)) fail('segments must be separated by at least one bound-off needle')
    const carrierOf = (index: number): CarrierId => (segments.length === 2 && index === 1 ? B! : A)
    // The waste top takes the stitches as they are; the bind-off top takes them all.
    const next = rows[r + 1]?.segments ?? (input.top === 'waste' ? segments : null)

    if (previous.length === 1 && segments.length === 2) {
      // Neck split: the main yarn must be on the right to knit the right part first.
      const [left, right] = segments as [PanelSegmentV1, PanelSegmentV1]
      const old = previous[0]!
      if (sideOf(A) !== 'right') fail('the neck split row must start on the right; the yarn is on the left')
      if (left.lo < old.lo - 1 || right.hi > old.hi + 1) fail('the neck split row cannot also widen the piece')
      shapeOuterEdge('left', old.lo, left.lo, A, false)
      shapeOuterEdge('right', old.hi, right.hi, A, true)
      knitPlanned(A, right, row, next)
      drain()
      ops.push(comment(`neck: bind off ${right.lo - left.hi - 1} stitches`))
      chainBindOff(A, right.lo - 1, right.lo - left.hi - 1, -1, false)
      knitPlanned(A, left, row, next)
      drain()
    } else {
      if (previous.length !== segments.length) fail(`a piece cannot go from ${previous.length} to ${segments.length} segments`)
      segments.forEach((segment, index) => {
        const old = previous[index]!
        const carrier = carrierOf(index)
        shapeOuterEdge('left', old.lo, segment.lo, carrier, sideOf(carrier) === 'left')
        shapeOuterEdge('right', old.hi, segment.hi, carrier, sideOf(carrier) === 'right')
      })
      const plans = segments.map((segment) => planSegment(segment, row, next))
      setBeds(segments.flatMap((segment) => range(segment.lo, segment.hi)), (n) => bedFor(plans.find((plan) => plan.has(n))!.get(n)!, bedOf(n)))
      segments.forEach((segment, index) => knitSegment(carrierOf(index), segment, row, plans[index]!))
      drain()
    }
    for (const [index, segment] of segments.entries()) {
      for (const n of range(segment.lo, segment.hi)) if (bedOf(n) === null) fail(`needle ${n} of segment ${index + 1} holds no loop after the row`)
    }
    previous = segments
  }
  rowIndex = null
  sim.setSourceRows(undefined)

  /**
   * Changes one outer edge from `from` to `to`: shifts for small changes, a
   * chain bind-off (only from the side the yarn is on) for three or more.
   */
  function shapeOuterEdge(side: 'left' | 'right', from: number, to: number, carrier: CarrierId, yarnHere: boolean) {
    const decrease = side === 'left' ? to - from : from - to
    if (decrease === 0) return
    if (decrease < 0) {
      if (decrease < -1) fail(`the ${side} edge widens by ${-decrease}; increase one stitch per row at most`)
      shiftEdge(side, from, -1)
      return
    }
    if (decrease <= 2) { shiftEdge(side, from, decrease); return }
    if (!yarnHere) fail(`binding off ${decrease} stitches at the ${side} edge needs the yarn there; it is on the ${side === 'left' ? 'right' : 'left'}`)
    ops.push(comment(`${side} edge: bind off ${decrease} stitches`))
    chainBindOff(carrier, from, decrease, side === 'left' ? 1 : -1, false)
  }

  ops.push(comment('--- SHAPED PANEL: TOP ---'))
  if (input.top === 'bind-off') {
    previous.forEach((segment, index) => {
      const carrier = previous.length === 2 && index === 1 ? B! : A
      const width = segment.hi - segment.lo + 1
      if (sideOf(carrier) === 'left') chainBindOff(carrier, segment.lo, width, 1, true)
      else chainBindOff(carrier, segment.hi, width, -1, true)
    })
  } else {
    const live = previous.flatMap((segment) => range(segment.lo, segment.hi))
    setBeds(live, () => 'f')
    sim.setSpeed(RIB.tubeSpeed)
    sim.setRoller(RIB.castOnRoller)
    sim.setStitch(RIB.wasteStitch)
    const lo = previous[0]!.lo
    const hi = previous.at(-1)!.hi
    for (let k = 0; k < (input.wasteRows ?? SHAPED_PANEL_TOP_WASTE_ROWS); k++) {
      const dir: Direction = sideOf(input.wasteCarrier) === 'left' ? '+' : '-'
      const order = dir === '+' ? range(lo, hi) : range(lo, hi).reverse()
      // The first row skips the gap between segments; later rows knit across it so the waste holds together.
      for (const n of order) if (k > 0 || bedOf(n) !== null) sim.knit(input.wasteCarrier, dir, f(n))
    }
    drain()
    for (const n of range(lo, hi)) sim.drop(f(n))
    drain()
  }
  // Carriers out: draw, body yarns, waste (the rib beanie's order).
  for (const carrier of [...(input.drawCarrier !== null ? [input.drawCarrier] : []), A, ...(splits ? [B!] : []), input.wasteCarrier]) sim.out(carrier)
  drain()

  const program: KnitoutProgram = {
    version: 2,
    carriers: ['1', '2', '3', '4', '5', '6'],
    machine: 'kniterate',
    gauge: 7,
    position: 'Keep',
    yarns: {
      [A]: 'main',
      ...(splits ? { [B!]: 'main (right shoulder)' } : {}),
      [input.wasteCarrier]: 'waste',
      ...(input.drawCarrier !== null ? { [input.drawCarrier]: 'draw thread' } : {}),
    },
    kniterate: { xferStyle: 'four-pass' },
    ops,
  }
  return { ops, predictedPasses: sim.predictedPasses(), program }
}
