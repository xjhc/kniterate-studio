/**
 * Read a machine trace the way a knitter checks a file: what each pass does,
 * which section of the run it belongs to, what happens to every loop, and how
 * a stretch of passes compares with another file's (usually one of
 * Kniterate's own, `reference/*.kc`).
 *
 * These are inspection tools, not a verdict authority: the audit's checks are
 * the physical failure modes found on issue #9 (a start loop held for ~90
 * passes, a waste row knitting a two-layer top's doubled loops), each with the
 * figure Kniterate's own files show. `pnpm studio -- audit` and the start and
 * engine tests use them.
 *
 * Pass numbers are 1-based, as on the machine's display and in run records.
 * Needles are trace coordinates (the KCode raster, dialect-normalised); a
 * comparison counts needles from each range's leftmost needle, so two files
 * placed differently on the bed still line up.
 */

import type { MachineTracePassV1, MachineTraceV1 } from './machine-trace.js'
import { classifyMachineTracePassRoleV1, type MachineTracePassRoleV1 } from './pass-metrics.js'

/** A named run of passes, 1-based and inclusive. */
export interface TraceSectionV1 {
  readonly name: string
  readonly from: number
  readonly to: number
}

/** The carriers the audit treats as waste yarn and draw thread; every other knitting carrier is a body yarn. */
export interface TraceYarnRolesV1 {
  readonly waste: string
  readonly draw: string | null
}

export const DEFAULT_TRACE_YARN_ROLES_V1: TraceYarnRolesV1 = Object.freeze({ waste: '6', draw: '1' })

type Pass = MachineTracePassV1
type Trace = Pick<MachineTraceV1, 'passes' | 'rackCommands'>
type Bed = 'f' | 'b'

const bedOf = (bed: string): Bed => (bed === 'front' ? 'f' : 'b')
const knits = (pass: Pass) => pass.actions.some((action) => action.kind === 'knit' || action.kind === 'tuck' || action.kind === 'split')

/** The racking in force for pass `index` (0-based). */
export function traceRackAtV1(trace: Trace, index: number): number {
  let rack = 0
  for (const command of trace.rackCommands) if (command.beforePassIndex <= index) rack = command.value
  return rack
}

/** The section a 1-based pass falls in, or null. */
export function traceSectionOfV1(sections: readonly TraceSectionV1[], pass: number): string | null {
  return sections.find((section) => pass >= section.from && pass <= section.to)?.name ?? null
}

export interface TracePassRowV1 {
  readonly pass: number
  readonly section: string | null
  readonly direction: '>>' | '<<'
  readonly carrier: string
  readonly role: MachineTracePassRoleV1
  readonly rack: number
  readonly speed: number
  readonly roller: number
  /** Encoded stitch sizes the pass selects on each bed. */
  readonly stitch: { readonly front: readonly number[]; readonly rear: readonly number[] }
  /** Action counts, e.g. `knit front`, `drop rear`, `xfer front>rear`. */
  readonly actions: Readonly<Record<string, number>>
  /** Lowest and highest needle the pass works on each bed (transfers count their source). */
  readonly needles: { readonly front: readonly [number, number] | null; readonly rear: readonly [number, number] | null }
  /** One readable line. */
  readonly text: string
}

/** One row per pass: what it does, at which settings, on which needles. */
export function traceRowsV1(trace: Trace, sections: readonly TraceSectionV1[] = []): TracePassRowV1[] {
  return trace.passes.map((pass, index) => {
    const actions: Record<string, number> = {}
    const stitch = { front: new Set<number>(), rear: new Set<number>() }
    const span: Record<Bed, [number, number] | null> = { f: null, b: null }
    const widen = (bed: Bed, n: number) => { const s = span[bed]; span[bed] = s ? [Math.min(s[0], n), Math.max(s[1], n)] : [n, n] }
    for (const action of pass.actions) {
      let key: string
      if (action.kind === 'knit' || action.kind === 'tuck' || action.kind === 'drop') {
        key = `${action.kind} ${action.at.bed}`
        widen(bedOf(action.at.bed), action.at.traceCoordinate)
        if (action.kind !== 'drop') (action.at.bed === 'front' ? stitch.front : stitch.rear).add(action.at.stitchSelector.encodedValue)
      } else if (action.kind === 'xfer' || action.kind === 'split') {
        key = `${action.kind} ${action.source.bed}>${action.target.bed}`
        widen(bedOf(action.source.bed), action.source.traceCoordinate)
      } else key = action.kind
      actions[key] = (actions[key] ?? 0) + 1
    }
    const rack = traceRackAtV1(trace, index)
    const section = traceSectionOfV1(sections, index + 1)
    const sizes = [...[...stitch.front].sort((a, b) => a - b).map((s) => `f${s}`), ...[...stitch.rear].sort((a, b) => a - b).map((s) => `r${s}`)]
    const spanText = (bed: Bed) => (span[bed] ? `${span[bed]![0]}..${span[bed]![1]}` : '')
    const work = Object.entries(actions).map(([key, count]) => {
      if (key === 'move') return 'move'
      // The first bed named is where the pass works: a transfer's source bed.
      const bed: Bed = key.split(' ')[1]!.startsWith('front') ? 'f' : 'b'
      return `${key} ${count} (${spanText(bed)})`
    })
    const text = `${index + 1} ${pass.direction} c${pass.carrier} rack ${rack} speed ${pass.speed} roller ${pass.roller}${sizes.length ? ` stitch ${sizes.join(',')}` : ''} | ${work.join(', ') || 'nothing'}${section ? ` [${section}]` : ''}`
    return {
      pass: index + 1,
      section,
      direction: pass.direction,
      carrier: pass.carrier,
      role: classifyMachineTracePassRoleV1(pass),
      rack,
      speed: pass.speed,
      roller: pass.roller,
      stitch: { front: [...stitch.front].sort((a, b) => a - b), rear: [...stitch.rear].sort((a, b) => a - b) },
      actions,
      needles: { front: span.f, rear: span.b },
      text,
    }
  })
}

/**
 * Sections for a file without a project or atlas entry, named as Studio's run
 * records and the reference atlas name them:
 *   waste         waste yarn and yarn introductions
 *   draw          the rear drop and the draw thread's last row
 *   cast-on       the first three rows of body yarn after the draw thread (zig-zag, front, rear) and the transfers straight after
 *   body          everything knitted up to the last row of body yarn
 *   bind-off      a chain bind-off ending the body (one- or two-needle knits between transfers)
 *   top           waste rows and the release after the body
 *   carriers-out  the closing carrier moves
 * Every one of Kniterate's reference files starts this way; a file that does
 * not gets `body` from its first body-yarn row.
 */
export function traceAutoSectionsV1(trace: Trace, roles: TraceYarnRolesV1 = DEFAULT_TRACE_YARN_ROLES_V1): TraceSectionV1[] {
  const passes = trace.passes
  const body = (pass: Pass) => pass.carrier !== '0' && pass.carrier !== roles.waste && pass.carrier !== roles.draw && knits(pass)
  const carrierless = (pass: Pass) => pass.actions.every((action) => action.kind === 'drop' || action.kind === 'move')
  const onlyMoves = (pass: Pass) => pass.actions.every((action) => action.kind === 'move')
  let lastDraw = -1
  if (roles.draw !== null) passes.forEach((pass, index) => { if (pass.carrier === roles.draw && knits(pass)) lastDraw = index })
  let lastBody = -1
  passes.forEach((pass, index) => { if (body(pass)) lastBody = index })
  if (lastBody === -1) return [{ name: 'whole file', from: 1, to: passes.length }]
  const sections: TraceSectionV1[] = []
  const push = (name: string, from: number, to: number) => { if (to >= from) sections.push({ name, from: from + 1, to: to + 1 }) }
  let next = 0
  if (lastDraw !== -1 && lastDraw < lastBody) {
    let drawFrom = lastDraw
    while (drawFrom > 0 && carrierless(passes[drawFrom - 1]!)) drawFrom--
    push('waste', 0, drawFrom - 1)
    push('draw', drawFrom, lastDraw)
    next = lastDraw + 1
    // The cast-on: three rows of body yarn, then any transfers and moves straight after.
    let rows = 0
    let castOnEnd = next - 1
    for (let index = next; index <= lastBody && rows < 3; index++) {
      castOnEnd = index
      if (body(passes[index]!)) rows++
    }
    // Transfers straight after the cast-on rows belong to it (a carriage move between them too, but not one after the last).
    const transfer = (index: number) => passes[index]!.actions.some((action) => action.kind === 'xfer') && passes[index]!.actions.every((action) => action.kind === 'xfer' || action.kind === 'move')
    for (let index = castOnEnd + 1; index <= lastBody; index++) {
      if (transfer(index)) castOnEnd = index
      else if (!onlyMoves(passes[index]!)) break
    }
    if (rows === 3) { push('cast-on', next, castOnEnd); next = castOnEnd + 1 }
  } else {
    const firstBody = passes.findIndex(body)
    push('waste', 0, firstBody - 1)
    next = firstBody
  }
  // A chain bind-off: from the end of the body back, only transfers, moves and one- or two-needle knits.
  let bindOffStart = lastBody + 1
  let steps = 0
  for (let index = lastBody; index >= next; index--) {
    const pass = passes[index]!
    const knitted = pass.actions.filter((action) => action.kind === 'knit').length
    if (pass.actions.every((action) => action.kind === 'xfer' || action.kind === 'move') || (body(pass) && knitted <= 2)) {
      if (body(pass) && knitted <= 2) steps++
      bindOffStart = index
    } else break
  }
  // A two-bed top: the rear homed onto the front, then one joining row on the front. Both belong to the top.
  let bodyEnd = lastBody
  const frontOnlyBody = (pass: Pass) => body(pass) && pass.actions.every((action) => action.kind !== 'knit' || action.at.bed === 'front')
  if (steps < 3 && frontOnlyBody(passes[lastBody]!)) {
    let index = lastBody - 1
    while (index >= next && onlyMoves(passes[index]!)) index--
    let homed = -1
    while (index >= next && passes[index]!.actions.some((action) => action.kind === 'xfer') && passes[index]!.actions.every((action) => action.kind === 'xfer' || action.kind === 'move')) homed = index--
    if (homed !== -1) bodyEnd = homed - 1
  }
  if (steps >= 3) {
    push('body', next, bindOffStart - 1)
    push('bind-off', bindOffStart, lastBody)
  } else push('body', next, bodyEnd)
  if (bodyEnd < lastBody) push('top', bodyEnd + 1, lastBody)
  let outFrom = passes.length
  while (outFrom - 1 > lastBody && onlyMoves(passes[outFrom - 1]!)) outFrom--
  if (bodyEnd < lastBody && outFrom - 1 > lastBody) sections[sections.length - 1] = { name: 'top', from: bodyEnd + 2, to: outFrom }
  else push('top', lastBody + 1, outFrom - 1)
  push('carriers-out', outFrom, passes.length - 1)
  return sections
}

interface Loop { readonly pass: number; readonly carrier: string; readonly body: boolean }

export interface TraceHoldV1 {
  /** Passes the loop waited on its needle before a stitch was knitted through it. */
  readonly passes: number
  readonly needle: string
  readonly from: { readonly pass: number; readonly carrier: string }
  readonly to: { readonly pass: number; readonly carrier: string }
  readonly section: string | null
}

export interface TraceAuditCheckV1 {
  readonly id: 'start-hold' | 'waste-through-body-loops' | 'unsupported-body-drops' | 'loops-left' | 'max-stack' | 'inside-empty-front-knits'
  /** `issue` fails the audit; `note` is for a person to judge (e.g. fashioned increases leave eyelets by design). */
  readonly severity: 'issue' | 'note'
  readonly ok: boolean
  readonly value: number
  readonly limit: number | null
  readonly meaning: string
  /** What Kniterate's own files show, measured with this audit. */
  readonly kniterate: string
  readonly at?: readonly string[]
}

export interface TraceAuditV1 {
  readonly passCount: number
  readonly roles: TraceYarnRolesV1
  readonly startEnd: number | null
  readonly ok: boolean
  readonly checks: readonly TraceAuditCheckV1[]
  /** The longest waits anywhere, for a person to read (bind-offs and held shoulders wait long by design). */
  readonly longestHolds: readonly TraceHoldV1[]
  readonly emptyNeedleKnits: {
    readonly front: { readonly edge: number; readonly inside: number }
    readonly rear: { readonly edge: number; readonly inside: number }
  }
}

export interface TraceAuditOptionsV1 {
  readonly roles?: TraceYarnRolesV1
  readonly sections?: readonly TraceSectionV1[]
  /** Last 1-based pass of the start (waste yarn and draw thread). Default: the end of a section named start, waste or draw. */
  readonly startEnd?: number | null
}

/** Sections whose knitting is the piece itself, whatever the carrier. */
const BODY_SECTIONS: ReadonlySet<string> = new Set(['body', 'rib', 'cast-on', 'shoulders', 'bind-off'])

/** Studio's limit on how long a start loop may wait to be knitted again. */
export const TRACE_START_HOLD_LIMIT_V1 = 12
/** Kniterate's app warns about more than 2 parents and advises never more than 4 loops; its own files stack at most 3. */
export const TRACE_MAX_STACK_LIMIT_V1 = 3

/**
 * Replay every loop through the file: when it is made, moved, stacked,
 * knitted through, dropped or left on the needles.
 */
export function auditTraceV1(trace: Trace, options: TraceAuditOptionsV1 = {}): TraceAuditV1 {
  const roles = options.roles ?? DEFAULT_TRACE_YARN_ROLES_V1
  const sections = options.sections ?? traceAutoSectionsV1(trace, roles)
  const startEnd = options.startEnd !== undefined
    ? options.startEnd
    : (() => {
      const start = sections.filter((section) => ['start', 'waste', 'draw'].includes(section.name))
      return start.length > 0 ? Math.max(...start.map((section) => section.to)) : null
    })()
  // A yarn is body yarn by the section it knits in: Kniterate's reversible sweater knits its hem rib with
  // the waste carrier (C6), so a waste or draw carrier counts as body inside a body-type section.
  const bodySection = (pass: number) => BODY_SECTIONS.has(traceSectionOfV1(sections, pass) ?? '')
  const bodyYarn = (carrier: string, pass: number) => carrier !== '0' && ((carrier !== roles.waste && carrier !== roles.draw) || bodySection(pass))
  const needles = new Map<string, Loop[]>()
  const key = (bed: string, n: number) => `${bedOf(bed)}${n}`
  const holds: TraceHoldV1[] = []
  const longest: { start: TraceHoldV1 | null } = { start: null }
  const wasteThrough: string[] = []
  let wasteThroughCount = 0
  const unsupportedDrops: string[] = []
  let unsupportedDropCount = 0
  let maxStack = 0
  let maxStackAt = ''
  const empty = { front: { edge: 0, inside: 0 }, rear: { edge: 0, inside: 0 } }
  const insideFront: string[] = []
  const passes = trace.passes
  // A chain bind-off step knits one or two needles; the loop it leaves may be dropped as the chain's tail.
  const chainStep = (index: number) => {
    const pass = passes[index]
    return pass !== undefined && bodyYarn(pass.carrier, index + 1) && pass.actions.filter((action) => action.kind === 'knit').length <= 2 && pass.actions.some((action) => action.kind === 'knit')
  }
  passes.forEach((pass, index) => {
    const n1 = index + 1
    const body = bodyYarn(pass.carrier, n1)
    for (const action of pass.actions) {
      if (action.kind === 'knit' || action.kind === 'tuck' || action.kind === 'drop') {
        const k = key(action.at.bed, action.at.traceCoordinate)
        const loops = needles.get(k) ?? []
        if (action.kind === 'knit') {
          if (loops.length === 0 && body) {
            const bed = action.at.bed === 'front' ? empty.front : empty.rear
            const neighbours = [key(action.at.bed, action.at.traceCoordinate - 1), key(action.at.bed, action.at.traceCoordinate + 1)]
            if (neighbours.every((neighbour) => (needles.get(neighbour)?.length ?? 0) > 0)) {
              bed.inside++
              if (action.at.bed === 'front' && insideFront.length < 8) insideFront.push(`pass ${n1} ${k} c${pass.carrier}`)
            } else bed.edge++
          }
          if (!body && loops.length >= 2 && loops.some((loop) => loop.body)) {
            wasteThroughCount++
            if (wasteThrough.length < 5) wasteThrough.push(`pass ${n1} ${k}: c${pass.carrier} knits through ${loops.map((loop) => `c${loop.carrier}@${loop.pass}`).join(' + ')}`)
          }
          for (const loop of loops) {
            const waited = n1 - loop.pass
            const inStart = startEnd !== null && loop.pass <= startEnd && (longest.start === null || waited > longest.start.passes)
            if (!inStart && holds.length >= 5 && waited <= holds[holds.length - 1]!.passes) continue
            const hold: TraceHoldV1 = { passes: waited, needle: k, from: { pass: loop.pass, carrier: loop.carrier }, to: { pass: n1, carrier: pass.carrier }, section: traceSectionOfV1(sections, loop.pass) }
            if (inStart) longest.start = hold
            if (holds.length < 5 || waited > holds[holds.length - 1]!.passes) {
              holds.push(hold)
              holds.sort((x, y) => y.passes - x.passes)
              if (holds.length > 5) holds.pop()
            }
          }
          needles.set(k, [{ pass: n1, carrier: pass.carrier, body }])
        } else if (action.kind === 'tuck') {
          needles.set(k, [...loops, { pass: n1, carrier: pass.carrier, body }])
          if (loops.length + 1 > maxStack) { maxStack = loops.length + 1; maxStackAt = `pass ${n1} ${k}` }
        } else {
          const bodyLoops = loops.filter((loop) => loop.body)
          const tail = bodyLoops.length === 1 && loops.length === 1 && chainStep(bodyLoops[0]!.pass - 1)
          if (bodyLoops.length > 0 && !tail) {
            unsupportedDropCount++
            if (unsupportedDrops.length < 5) unsupportedDrops.push(`pass ${n1} ${k}: ${bodyLoops.map((loop) => `c${loop.carrier}@${loop.pass}`).join(' + ')}`)
          }
          needles.delete(k)
        }
      } else if (action.kind === 'xfer' || action.kind === 'split') {
        const source = key(action.source.bed, action.source.traceCoordinate)
        const target = key(action.target.bed, action.target.traceCoordinate)
        const landed = [...(needles.get(target) ?? []), ...(needles.get(source) ?? [])]
        needles.set(target, landed)
        if (landed.length > maxStack) { maxStack = landed.length; maxStackAt = `pass ${n1} ${target}` }
        if (action.kind === 'split') needles.set(source, [{ pass: n1, carrier: action.carrier, body: bodyYarn(action.carrier, n1) }])
        else needles.delete(source)
      }
    }
  })
  const loopsLeft = [...needles.values()].reduce((sum, loops) => sum + loops.length, 0)
  const longestHolds = holds
  const startHoldValue = longest.start
  const checks: TraceAuditCheckV1[] = [
    {
      id: 'start-hold', severity: 'issue', ok: startHoldValue === null || startHoldValue.passes <= TRACE_START_HOLD_LIMIT_V1,
      value: startHoldValue?.passes ?? 0, limit: TRACE_START_HOLD_LIMIT_V1,
      meaning: 'The longest a loop made in the start (waste yarn, yarn catches, draw thread) waits before a stitch is knitted through it. A long-held loop is pulled by the rollers the whole time; handoff 2 held one for 90 passes at the corner where the main yarn broke.',
      kniterate: 'fairisle, jacquard, dbj, the swatches, the baby beanie and the sophie samples wait at most 5 passes, 2x2-rib-beanie 7; the reversible sleeves.kc holds one rear edge loop 75.',
      ...(startHoldValue ? { at: [`${startHoldValue.needle} from pass ${startHoldValue.from.pass} (c${startHoldValue.from.carrier}) to ${startHoldValue.to.pass} (c${startHoldValue.to.carrier})`] } : {}),
    },
    {
      id: 'waste-through-body-loops', severity: 'issue', ok: wasteThroughCount === 0, value: wasteThroughCount, limit: 0,
      meaning: 'The waste yarn or draw thread knits through two or more loops that include body yarn: the body\'s loops are joined only by yarn that is removed, and come off the machine live (a two-layer top without its joining row).',
      kniterate: 'None of Kniterate\'s reference files does this.',
      ...(wasteThrough.length ? { at: wasteThrough } : {}),
    },
    {
      id: 'unsupported-body-drops', severity: 'issue', ok: unsupportedDropCount === 0, value: unsupportedDropCount, limit: 0,
      meaning: 'Body-yarn loops dropped from the needles without a waste row knitted through them first, so they can ladder. A chain bind-off\'s last loop is not counted.',
      kniterate: 'fairisle, jacquard, dbj, the swatches, the baby beanie and the sophie samples drop none; 2x2-rib-beanie.kc releases its 25 crown loops for gathering by hand, and the reversible front.kc and back.kc release each shoulder live (59 loops). Studio ends on waste yarn instead.',
      ...(unsupportedDrops.length ? { at: unsupportedDrops } : {}),
    },
    {
      id: 'loops-left', severity: 'issue', ok: loopsLeft <= 1, value: loopsLeft, limit: 1,
      meaning: 'Loops still on the needles when the file ends (one is a chain bind-off\'s last loop, finished by hand).',
      kniterate: 'Most of Kniterate\'s files leave none; color-swatch-bindoff.kc and sophie_stripe.kc leave a chain\'s last loop, sophie2.kc 12.',
    },
    {
      id: 'max-stack', severity: 'issue', ok: maxStack <= TRACE_MAX_STACK_LIMIT_V1, value: maxStack, limit: TRACE_MAX_STACK_LIMIT_V1,
      meaning: 'The most loops on one needle at once.',
      kniterate: 'Kniterate\'s files stack at most 3; its app warns about more than 2 parents and advises never more than 4.',
      ...(maxStackAt ? { at: [maxStackAt] } : {}),
    },
    {
      id: 'inside-empty-front-knits', severity: 'note', ok: empty.front.inside === 0, value: empty.front.inside, limit: null,
      meaning: 'A body yarn knits a front needle that holds no loop while both neighbours do: a small eyelet in the face. Fashioned increases do this on purpose; anywhere else it is a hole.',
      kniterate: 'The sophie samples do it 48 to 58 times at their fashioned increases; Kniterate\'s unshaped files never.',
      ...(insideFront.length ? { at: insideFront } : {}),
    },
  ]
  return {
    passCount: passes.length,
    roles,
    startEnd,
    ok: checks.every((check) => check.ok || check.severity === 'note'),
    checks,
    longestHolds,
    emptyNeedleKnits: empty,
  }
}

export interface TraceRangeV1 {
  readonly from: number
  readonly to: number
}

export interface TracePassDifferenceV1 {
  readonly a: number
  readonly b: number
  readonly fields: readonly string[]
  readonly detail: Readonly<Record<string, { readonly a: unknown; readonly b: unknown }>>
}

export interface TraceComparisonV1 {
  readonly a: TraceRangeV1
  readonly b: TraceRangeV1
  readonly compared: number
  readonly identical: number
  /** Passes one range has beyond the other's length. */
  readonly unmatched: { readonly a: number; readonly b: number }
  readonly differences: readonly TracePassDifferenceV1[]
}

/**
 * Compare two pass ranges pass by pass: carrier, direction, racking, speed,
 * roller, and every stitch (kind, bed, needle counted from the range's
 * leftmost needle, stitch size). `carrierMap` renames a's carriers to b's
 * (e.g. Studio's ground C2 is Kniterate's C4).
 */
export function compareTraceRangesV1(
  a: Trace,
  aRange: TraceRangeV1,
  b: Trace,
  bRange: TraceRangeV1,
  options: { readonly carrierMap?: Readonly<Record<string, string>>; readonly maxDifferences?: number } = {},
): TraceComparisonV1 {
  const slice = (trace: Trace, range: TraceRangeV1) => trace.passes.slice(range.from - 1, range.to)
  const base = (passes: readonly Pass[]) => {
    const coordinates = passes.flatMap((pass) => pass.actions.flatMap((action) => ('at' in action ? [action.at.traceCoordinate] : 'source' in action ? [action.source.traceCoordinate, action.target.traceCoordinate] : [])))
    return coordinates.length > 0 ? Math.min(...coordinates) : 0
  }
  const aPasses = slice(a, aRange)
  const bPasses = slice(b, bRange)
  const aBase = base(aPasses)
  const bBase = base(bPasses)
  const map = options.carrierMap ?? {}
  const signature = (trace: Trace, pass: Pass, index: number, origin: number, rename: boolean) => {
    const stitches = pass.actions.map((action) => {
      if ('at' in action) return `${action.kind} ${action.at.bed} ${action.at.traceCoordinate - origin} s${action.at.stitchSelector.encodedValue}`
      if ('source' in action) return `${action.kind} ${action.source.bed} ${action.source.traceCoordinate - origin}>${action.target.bed} ${action.target.traceCoordinate - origin}`
      return action.kind
    }).sort()
    return {
      carrier: rename ? map[pass.carrier] ?? pass.carrier : pass.carrier,
      direction: pass.direction,
      rack: traceRackAtV1(trace, index),
      speed: pass.speed,
      roller: pass.roller,
      stitches,
    }
  }
  const compared = Math.min(aPasses.length, bPasses.length)
  const differences: TracePassDifferenceV1[] = []
  let identical = 0
  for (let i = 0; i < compared; i++) {
    const x = signature(a, aPasses[i]!, aRange.from - 1 + i, aBase, true)
    const y = signature(b, bPasses[i]!, bRange.from - 1 + i, bBase, false)
    const fields: string[] = []
    const detail: Record<string, { a: unknown; b: unknown }> = {}
    for (const field of ['carrier', 'direction', 'rack', 'speed', 'roller'] as const) {
      if (x[field] !== y[field]) { fields.push(field); detail[field] = { a: x[field], b: y[field] } }
    }
    if (x.stitches.join('|') !== y.stitches.join('|')) {
      // The same kinds of stitch on the same beds at the same sizes, only more or fewer: a different width.
      const kinds = (list: readonly string[]) => [...new Set(list.map((stitch) => {
        const [kind, bed, place, size] = stitch.split(' ')
        return kind === 'xfer' || kind === 'split' ? `${kind} ${bed}>${place!.split('>')[1] ?? ''}` : `${kind} ${bed} ${size ?? ''}`
      }))].sort().join('|')
      fields.push(kinds(x.stitches) === kinds(y.stitches) ? 'width' : 'stitches')
      const onlyA = x.stitches.filter((s) => !y.stitches.includes(s))
      const onlyB = y.stitches.filter((s) => !x.stitches.includes(s))
      const count = (list: readonly string[]) => list.reduce<Record<string, number>>((acc, s) => { const k = s.split(' ').slice(0, 2).join(' '); acc[k] = (acc[k] ?? 0) + 1; return acc }, {})
      detail[fields.at(-1)!] = { a: { counts: count(x.stitches), only: onlyA.slice(0, 6), onlyCount: onlyA.length }, b: { counts: count(y.stitches), only: onlyB.slice(0, 6), onlyCount: onlyB.length } }
    }
    if (fields.length === 0) identical++
    else if (differences.length < (options.maxDifferences ?? 40)) differences.push({ a: aRange.from + i, b: bRange.from + i, fields, detail })
  }
  return {
    a: aRange,
    b: bRange,
    compared,
    identical,
    unmatched: { a: aPasses.length - compared, b: bPasses.length - compared },
    differences,
  }
}
