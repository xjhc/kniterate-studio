/**
 * Eight-line crown for a flat 2×2 rib beanie of any width, in the same
 * topology as Customist's crown (reference/2x2-rib-beanie.kc):
 *
 *   each step   every rear stitch moves to the front; at each active
 *               decrease line the 2-stitch column just outside the line is
 *               stacked onto the column just inside it (the merged column
 *               knits on the front bed), and everything further out slides
 *               inward by 2 needles per line crossed; the rib is then
 *               re-formed and one crown row is knitted
 *   groups      steps alternate all 8 lines and every other line (4), in
 *               groups of four steps followed by plain rows
 *   top         when the next step would leave fewer than `minCrownStitches`,
 *               each rear stitch is stacked onto a neighbouring front
 *               needle and the top is knitted in jersey, then knitted off
 *
 * Lines are placed evenly and symmetrically on column edges. The transfer
 * choreography is this planner's own: shifts go through the empty rear bed in
 * hops of at most 4 needles, so racking stays within ±4 and every landing is
 * either empty or an intended merge. The output uses the replayed crown's
 * step format, so one emitter plays either.
 */

import type { CustomistRibCrownStep } from './customist-rib-beanie-crown.js'

/** 2×2 rib layout: which bed holds the stitch at each offset from the piece's left needle. */
export function ribBed(offset: number): 'f' | 'b' {
  const residue = offset % 4
  return residue === 1 || residue === 2 ? 'f' : 'b'
}

export const EIGHT_LINE_CROWN_V1 = Object.freeze({
  lines: 8,
  stepsPerGroup: 4,
  /** Crown rows at each stitch count after a group (the step's own row included). */
  rowsAfterGroup: 5,
  minCrownStitches: 40,
  topRows: 19,
  maxHop: 4,
  xferSpeed: 150,
  xferRollerRack0: 100,
  crownSpeed: 300,
  crownRoller: 450,
  crownStitchFront: 9,
  crownStitchRear: 7,
  topFirstSpeed: 100,
  topSpeed: 250,
  topRoller: 300,
  topStitch: 5,
})

interface Needle {
  /** Offset from the piece's original left needle. */
  offset: number
  role: 'f' | 'b'
  loops: number
}

export interface EightLineCrownPlan {
  steps: CustomistRibCrownStep[]
  /** Stitch count after each crown step, starting with the rib width. */
  counts: number[]
  maxLoopsPerNeedle: number
}

/**
 * Plans the crown for a rib of `width` needles laid out by `ribBed`, starting
 * with the carriage about to move in `firstDirection`.
 */
export function planEightLineCrown(width: number, firstDirection: '+' | '-'): EightLineCrownPlan {
  const c = EIGHT_LINE_CROWN_V1
  if (width < 32 || width % 2 !== 0) throw new Error(`eight-line crown needs an even width of at least 32; got ${width}`)
  let needles: Needle[] = Array.from({ length: width }, (_, offset) => ({ offset, role: ribBed(offset), loops: 1 }))
  const steps: CustomistRibCrownStep[] = []
  const counts = [width]
  let direction = firstDirection
  let maxLoops = 1

  const knitRow = (speed: number, roller: number, frontStitch: number, rearStitch: number, frontOnly = false) => {
    const front = needles.filter((n) => frontOnly || n.role === 'f').map((n) => n.offset)
    const rear = frontOnly ? [] : needles.filter((n) => n.role === 'b').map((n) => n.offset)
    steps.push(['k', direction, speed, roller, frontStitch, frontOnly ? 0 : rearStitch, front, rear])
    direction = direction === '+' ? '-' : '+'
    for (const n of needles) n.loops = 1
  }
  const xfer = (rack: number, from: 'f' | 'b', sources: number[], roller: number) => {
    if (sources.length > 0) steps.push(['x', rack, from, c.xferSpeed, roller, 0, [...sources].sort((a, b) => a - b)])
  }

  /**
   * Rib columns are pairs starting at odd indexes (index 0 is the single edge
   * stitch), and every shift is even, so pairs stay aligned: a line sits on
   * the odd index nearest its ideal position.
   */
  const pairEdge = (ideal: number, n: number) => Math.min(n - 3, Math.max(3, 2 * Math.round((ideal - 1) / 2) + 1))

  const step = (activeLines: number[]) => {
    const n = needles.length
    // Line k of `lines` sits at fraction (2k+1)/(2·lines) of the width; lines left of centre shift the outside right.
    const boundaries = activeLines.map((k) => ({ k, index: pairEdge(((2 * k + 1) * n) / (2 * c.lines), n) }))
    const left = boundaries.filter((b) => b.k < c.lines / 2).map((b) => b.index)
    const right = boundaries.filter((b) => b.k >= c.lines / 2).map((b) => b.index)
    // Shift per needle index: +2 for every left line at or right of it (outside), -2 for every right line left of it.
    const shift = needles.map((_, i) => 2 * left.filter((b) => i < b).length - 2 * right.filter((b) => i >= b).length)

    // 1. Everything onto the front bed.
    xfer(0, 'b', needles.filter((x) => x.role === 'b').map((x) => x.offset), c.xferRollerRack0)
    // 2. Slide each side inward in hops of at most `maxHop` through the empty rear bed.
    const position = needles.map((x) => x.offset)
    for (const sign of [1, -1] as const) {
      for (;;) {
        const moving = needles.map((_, i) => i).filter((i) => Math.sign(shift[i]!) === sign && position[i] !== needles[i]!.offset + shift[i]!)
        if (moving.length === 0) break
        const hops = new Map<number, number[]>()
        for (const i of moving) {
          const remaining = needles[i]!.offset + shift[i]! - position[i]!
          const hop = sign * Math.min(Math.abs(remaining), c.maxHop)
          hops.set(hop, [...(hops.get(hop) ?? []), i])
        }
        const landed: number[] = []
        for (const [hop, list] of [...hops.entries()].sort((a, b) => Math.abs(a[0]) - Math.abs(b[0]))) {
          // Knitout racking r places front n across from back n - r: a hop of +h needs rack -h.
          xfer(-hop, 'f', list.map((i) => position[i]!), 0)
          for (const i of list) { position[i] = position[i]! + hop; landed.push(position[i]!) }
        }
        xfer(0, 'b', [...new Set(landed)], 0)
      }
    }
    // 3. Merge stitches that landed on the same needle; merged columns knit on the front.
    const merged = new Map<number, Needle>()
    needles.forEach((x, i) => {
      const at = merged.get(position[i]!)
      if (at) { at.loops += x.loops; at.role = 'f' } else merged.set(position[i]!, { offset: position[i]!, role: x.role, loops: x.loops })
    })
    needles = [...merged.values()].sort((a, b) => a.offset - b.offset)
    maxLoops = Math.max(maxLoops, ...needles.map((x) => x.loops))
    // 4. Re-form the rib and knit one crown row.
    xfer(0, 'f', needles.filter((x) => x.role === 'b').map((x) => x.offset), c.xferRollerRack0)
    knitRow(c.crownSpeed, c.crownRoller, c.crownStitchFront, c.crownStitchRear)
    counts.push(needles.length)
  }

  const all = Array.from({ length: c.lines }, (_, k) => k)
  const alternate = all.filter((k) => k % 2 === 1)
  crown: for (;;) {
    for (let s = 0; s < c.stepsPerGroup; s++) {
      const lines = s % 2 === 0 ? all : alternate
      if (needles.length - 2 * lines.length < c.minCrownStitches) break crown
      step(lines)
    }
    for (let r = 1; r < c.rowsAfterGroup; r++) knitRow(c.crownSpeed, c.crownRoller, c.crownStitchFront, c.crownStitchRear)
  }

  // Top: stack every rear stitch onto the nearest front needle, then jersey.
  const front = needles.filter((x) => x.role === 'f').map((x) => x.offset)
  if (front.length === 0) throw new Error('crown left no front stitches')
  const byRack = new Map<number, number[]>()
  for (const x of needles.filter((y) => y.role === 'b')) {
    const target = front.reduce((best, f) => Math.abs(f - x.offset) < Math.abs(best - x.offset) ? f : best)
    // Rear n moves to front n + r at rack r.
    const rack = target - x.offset
    if (Math.abs(rack) > c.maxHop) throw new Error(`rear stitch at ${x.offset} is ${rack} needles from a front needle`)
    byRack.set(rack, [...(byRack.get(rack) ?? []), x.offset])
    const at = needles.find((y) => y.offset === target)!
    at.loops += x.loops
  }
  for (const [rack, sources] of [...byRack.entries()].sort((a, b) => a[0] - b[0])) xfer(rack, 'b', sources, 0)
  needles = needles.filter((x) => x.role === 'f')
  maxLoops = Math.max(maxLoops, ...needles.map((x) => x.loops))
  counts.push(needles.length)
  for (let r = 0; r < c.topRows; r++) knitRow(r === 0 ? c.topFirstSpeed : c.topSpeed, c.topRoller, c.topStitch, 0, true)
  return { steps, counts, maxLoopsPerNeedle: maxLoops }
}
