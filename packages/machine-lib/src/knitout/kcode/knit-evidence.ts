/**
 * Which passes of a machine file have been on the machine before.
 *
 * A pass is described by what it does relative to the fabric's edges: the
 * yarn's role, the direction, cams, racking and settings, where the carrier
 * comes from and stops, and each action with where it lands (an edge needle,
 * inside, or beyond the edge), how many loops that needle held and whether
 * they had waited long. The artwork between the edges, the width and the
 * position on the bed are left out, so one knitted file vouches for the same
 * passes in another design.
 *
 * `buildKnitEvidenceV1` joins those descriptions to what happened on the
 * machine (the knit log, `registry/knit-log.json`): which knits ran a pass
 * with no fault reported on it, and which reported one. `checkTraceAgainstKnitsV1`
 * reads a new file against that and names the passes that are new on the
 * machine, that have faulted, or that have only knitted at other widths.
 *
 * An inspection tool, not a verdict authority. A pass that has knitted can
 * still fail (the evidence is an operator's report, not a measurement), and
 * Knit-proven stays an exact-file match in the physical registry.
 *
 * Pass numbers are 1-based, as on the machine's display and in run records.
 */

import type { MachineTraceV1 } from './machine-trace.js'
import { DEFAULT_TRACE_YARN_ROLES_V1, TRACE_START_HOLD_LIMIT_V1, traceRackAtV1, type TraceYarnRolesV1 } from './trace-audit.js'

type Trace = Pick<MachineTraceV1, 'passes' | 'rackCommands'>
type Bed = 'f' | 'b'

const bedOf = (bed: string): Bed => (bed === 'front' ? 'f' : 'b')

/** Needles from an edge that are named exactly when the loop there is unusual (missing, stacked or moved). */
const EDGE_NEEDLES = 3
/** Kniterate's editor counts a yarn carried up to 7 needles as a float; a carrier that stops farther from the fabric is a long carry. */
const NEAR_NEEDLES = 7
/** Kniterate's "Needles not catching the yarn": knitting "every 6 needles or more" may fail to catch. */
const LONG_GAP_NEEDLES = 6

export interface PassDescriptionV1 {
  /** The identity: two passes with the same text do the same thing at the fabric's edges. */
  readonly text: string
  /** The same content by name, for saying how two descriptions differ. */
  readonly facets: Readonly<Record<string, string>>
  /** Span of the loops before the pass, or of the selected needles on an empty bed; 0 when neither exists. */
  readonly width: number
  /** The needles those loops span (trace coordinates), or null on an empty bed. */
  readonly span: readonly [number, number] | null
}

const FACET_ORDER = ['yarn', 'direction', 'cams', 'rack', 'speed', 'roller', 'loops on', 'carrier from', 'carrier to', 'gaps']

/**
 * How a set of needles fills the stretch `from..to`: every needle, every other needle, or neither.
 * `skip` are needles the same action handles another way (an unusual loop named on its own), so a
 * full row beside one stacked needle still reads as a full row.
 */
function regularity(needles: readonly number[], from: number, to: number, skip: ReadonlySet<number>): 'all' | 'alternate' | 'some' {
  const worked = new Set(needles)
  const stretch: number[] = []
  for (let n = from; n <= to; n++) if (!skip.has(n)) stretch.push(n)
  if (stretch.every((n) => worked.has(n))) return 'all'
  const parity = Math.abs(needles[0]!) % 2
  const everyOther = needles.every((n) => Math.abs(n) % 2 === parity) && stretch.every((n) => Math.abs(n) % 2 !== parity || worked.has(n))
  return everyOther ? 'alternate' : 'some'
}

/** One description per pass, replaying the loops so each action knows what its needle held. */
export function describeTracePassesV1(trace: Trace, roles: TraceYarnRolesV1 = DEFAULT_TRACE_YARN_ROLES_V1): PassDescriptionV1[] {
  // Loop counts and the pass the oldest loop on a needle was made in; `auditTraceV1` keeps each loop's
  // full history, which this does not need.
  const loops = new Map<string, number>()
  const born = new Map<string, number>()
  const held = (bed: Bed, n: number) => loops.get(`${bed}${n}`) ?? 0
  const yarnRole = new Map<string, string>([['0', 'none'], [roles.waste, 'waste']])
  if (roles.draw !== null) yarnRole.set(roles.draw, 'draw')
  let bodyYarns = 0

  return trace.passes.map((pass, index) => {
    // Body yarns are numbered in the order they first appear, so a design on other carriers reads the same.
    if (!yarnRole.has(pass.carrier)) yarnRole.set(pass.carrier, `yarn ${++bodyYarns}`)

    let lo = Infinity
    let hi = -Infinity
    const bedsHeld = new Set<Bed>()
    for (const [key, count] of loops) {
      if (count === 0) continue
      const n = Number(key.slice(1))
      lo = Math.min(lo, n)
      hi = Math.max(hi, n)
      bedsHeld.add(key[0] as Bed)
    }
    const span: readonly [number, number] | null = lo <= hi ? [lo, hi] : null
    // On an empty bed the pass's own needles are the frame of reference.
    const touched = pass.actions.flatMap((action) => (
      action.kind === 'knit' || action.kind === 'tuck' || action.kind === 'drop' ? [action.at.traceCoordinate]
        : action.kind === 'xfer' || action.kind === 'split' ? [action.source.traceCoordinate, action.target.traceCoordinate] : []))
    const frame: readonly [number, number] | null = span ?? (touched.length > 0 ? [Math.min(...touched), Math.max(...touched)] : null)
    const left = frame?.[0] ?? 0
    const right = frame?.[1] ?? -1

    const beyond = (distance: number) => (distance <= EDGE_NEEDLES ? String(distance) : distance <= NEAR_NEEDLES ? '4-7' : '8+')
    // An ordinary loop is named only at the outermost needle; an unusual one is named exactly near an edge.
    const place = (n: number, exactNearEdge: boolean): string => {
      if (n < left) return `L-${beyond(left - n)}`
      if (n > right) return `R+${beyond(n - right)}`
      const fromLeft = n - left
      const fromRight = right - n
      if (fromLeft === 0 && fromRight === 0) return 'only'
      if (fromLeft === 0) return 'L0'
      if (fromRight === 0) return 'R0'
      if (!exactNearEdge || (fromLeft >= EDGE_NEEDLES && fromRight >= EDGE_NEEDLES)) return 'in'
      if (fromLeft === fromRight) return `L${fromLeft}R${fromRight}`
      return fromLeft < fromRight ? `L${fromLeft}` : `R${fromRight}`
    }
    // Kniterate's own files stack at most three loops; more than that is all one case.
    const stack = (count: number) => (count >= 3 ? 3 : count)
    // A loop that has waited longer than Studio lets a start loop wait: the rollers have pulled on it all that time.
    const waited = (bed: Bed, n: number) => held(bed, n) > 0 && index - (born.get(`${bed}${n}`) ?? index) > TRACE_START_HOLD_LIMIT_V1

    // Needles away from the edges are summarised: `inside` holds them by what they held, to say whether
    // the pass works every needle there, every other one, or some (which is the artwork).
    interface Mark { where: string; suffix: string; size?: number }
    interface Group { sizes: Set<number>; tokens: Map<string, Mark>; needles: number[]; inside: Map<string, { needles: number[]; exact: boolean; suffix: string; size?: number }> }
    const groups = new Map<string, Group>()
    const group = (name: string): Group => {
      let found = groups.get(name)
      if (!found) { found = { sizes: new Set(), tokens: new Map(), needles: [], inside: new Map() }; groups.set(name, found) }
      return found
    }
    const mark = (target: Group, where: string, suffix: string, size?: number) => {
      target.tokens.set(`${where}${suffix}:${size ?? ''}`, { where, suffix, size })
    }
    const inside = (target: Group, suffix: string, n: number, exact: boolean, size?: number) => {
      const key = `${suffix}:${size ?? ''}`
      const found = target.inside.get(key) ?? { needles: [], exact, suffix, size }
      found.needles.push(n)
      target.inside.set(key, found)
    }
    const worked: number[] = []
    for (const action of pass.actions) {
      if (action.kind === 'knit' || action.kind === 'tuck' || action.kind === 'drop') {
        const bed = bedOf(action.at.bed)
        const n = action.at.traceCoordinate
        const count = stack(held(bed, n))
        const target = group(`${action.kind} ${bed}`)
        const unusual = count !== 1 || waited(bed, n)
        const suffix = `${count === 1 ? '' : `/${count}`}${waited(bed, n) ? '/held' : ''}`
        target.needles.push(n)
        const size = action.kind === 'drop' ? undefined : action.at.stitchSelector.encodedValue
        if (size !== undefined) { target.sizes.add(size); worked.push(n) }
        const where = place(n, unusual)
        if (where === 'in') inside(target, suffix, n, unusual, size)
        else mark(target, where, suffix, size)
      } else if (action.kind === 'xfer' || action.kind === 'split') {
        const from = bedOf(action.source.bed)
        const to = bedOf(action.target.bed)
        const source = action.source.traceCoordinate
        const destination = action.target.traceCoordinate
        const target = group(`${action.kind} ${from}>${to}`)
        target.needles.push(source)
        const size = action.kind === 'split' ? action.source.stitchSelector.encodedValue : undefined
        if (size !== undefined) { target.sizes.add(size); worked.push(source) }
        const counts = `${stack(held(from, source))}>${stack(held(to, destination))}${waited(from, source) ? '/held' : ''}`
        const [fromPlace, toPlace] = [place(source, true), place(destination, true)]
        if (fromPlace === 'in' && toPlace === 'in') inside(target, `/${counts}`, source, true, size)
        else mark(target, `${fromPlace}>${toPlace}`, `/${counts}`, size)
      } else group(action.kind)
    }

    const facets: Record<string, string> = {
      yarn: yarnRole.get(pass.carrier)!,
      direction: pass.direction,
      cams: String(pass.operation ?? ''),
      rack: String(traceRackAtV1(trace, index)),
      speed: String(pass.speed),
      roller: String(pass.roller),
      'loops on': bedsHeld.size === 0 ? 'neither bed' : bedsHeld.size === 2 ? 'both beds' : bedsHeld.has('f') ? 'front' : 'rear',
    }
    if (pass.carrierStops && frame) {
      const stop = (x: number) => (x < left ? `left, ${left - x <= NEAR_NEEDLES ? 'near' : 'far'}` : x > right ? `right, ${x - right <= NEAR_NEEDLES ? 'near' : 'far'}` : 'inside')
      const [from, to] = pass.direction === '>>' ? [pass.carrierStops.left, pass.carrierStops.right] : [pass.carrierStops.right, pass.carrierStops.left]
      facets['carrier from'] = stop(from)
      facets['carrier to'] = stop(to)
    }
    // The longest run of needles the yarn passes without a stitch: between its stitches, and across the
    // fabric before its first and after its last, as far as the carrier travels.
    const columns = [...new Set(worked)].sort((a, b) => a - b)
    let gap = columns.reduce((longest, n, i) => (i === 0 ? 0 : Math.max(longest, n - columns[i - 1]! - 1)), 0)
    if (pass.carrierStops && span) {
      const from = Math.max(left, Math.ceil(Math.min(pass.carrierStops.left, pass.carrierStops.right)))
      const to = Math.min(right, Math.floor(Math.max(pass.carrierStops.left, pass.carrierStops.right)))
      if (from <= to) gap = columns.length === 0 ? to - from + 1 : Math.max(gap, columns[0]! - from, to - columns[columns.length - 1]!)
    }
    if (gap > 0) facets.gaps = gap < LONG_GAP_NEEDLES ? `up to ${LONG_GAP_NEEDLES - 1}` : `${LONG_GAP_NEEDLES} or more`
    for (const [name, found] of [...groups].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) {
      const sizes = [...found.sizes].sort((a, b) => a - b)
      // A uniform selector can be factored out; mixed selectors must stay attached to their locations.
      const suffixAt = (suffix: string, size?: number) => `${suffix}${sizes.length > 1 && size !== undefined ? `/stitch${size}` : ''}`
      const tokens = [...found.tokens.values()].map(({ where, suffix, size }) => `${where}${suffixAt(suffix, size)}`)
      // Needles named exactly near an edge are not part of the stretch the rest is measured against.
      for (const { suffix, needles, exact, size } of found.inside.values()) {
        const mine = new Set(needles)
        const skip = new Set(found.needles.filter((n) => !mine.has(n)))
        tokens.push(`in${suffixAt(suffix, size)}:${regularity(needles, left + (exact ? EDGE_NEEDLES : 1), right - (exact ? EDGE_NEEDLES : 1), skip)}`)
      }
      facets[name] = [sizes.length > 0 ? `stitch ${sizes.join(',')}` : '', tokens.sort().join(' ')].filter(Boolean).join(' at ') || 'yes'
    }
    const names = [...FACET_ORDER.filter((name) => name in facets), ...Object.keys(facets).filter((name) => !FACET_ORDER.includes(name)).sort()]
    const text = names.map((name) => `${name}: ${facets[name]}`).join(' | ')

    for (const action of pass.actions) {
      if (action.kind === 'knit' || action.kind === 'tuck' || action.kind === 'drop') {
        const key = `${bedOf(action.at.bed)}${action.at.traceCoordinate}`
        if (action.kind === 'knit') { loops.set(key, 1); born.set(key, index) }
        else if (action.kind === 'tuck') { loops.set(key, (loops.get(key) ?? 0) + 1); if (!born.has(key)) born.set(key, index) }
        else { loops.delete(key); born.delete(key) }
      } else if (action.kind === 'xfer' || action.kind === 'split') {
        const source = `${bedOf(action.source.bed)}${action.source.traceCoordinate}`
        const destination = `${bedOf(action.target.bed)}${action.target.traceCoordinate}`
        if ((loops.get(source) ?? 0) > 0) born.set(destination, Math.min(born.get(destination) ?? index, born.get(source) ?? index))
        loops.set(destination, (loops.get(destination) ?? 0) + (loops.get(source) ?? 0))
        if (action.kind === 'split') { loops.set(source, 1); born.set(source, index) }
        else { loops.delete(source); born.delete(source) }
      }
    }
    return { text, facets, width: frame ? frame[1] - frame[0] + 1 : 0, span }
  })
}

/** Something the operator reported about one knit. */
export interface KnitRunEventV1 {
  /** A fault is mechanical (a dropped or missed stitch, a break, a stop). A note is about how the fabric looks. */
  readonly kind: 'fault' | 'note'
  /** The stretches of passes it happened in, each 1-based and inclusive; null when the report does not say where. */
  readonly passes: readonly (readonly [number, number])[] | null
  /** The passes are stretches the report points to, not passes read off the machine. */
  readonly approximate?: boolean
  readonly what: string
}

/** One file that has been on the machine. */
export interface KnitRunV1 {
  readonly id: string
  readonly trace: Trace
  readonly roles?: TraceYarnRolesV1
  /** Last confirmed pass when the run stopped early; 0 if none is confirmed. Later passes are not execution evidence. */
  readonly knittedThrough?: number | null
  /** Possible stop section, 1-based and inclusive. Its faults remain warnings, without execution credit. */
  readonly stopWithin?: readonly [number, number] | null
  /**
   * False when nobody said how the run went (a piece known only from a photo, say). Its passes have
   * still been on the machine, but they do not count towards clearing an earlier fault. Default true.
   */
  readonly clears?: boolean
  readonly events: readonly KnitRunEventV1[]
}

/** One of Kniterate's own files: practice to compare with, not a knit on this machine. */
export interface KnitReferenceV1 {
  readonly name: string
  readonly trace: Trace
  readonly roles?: TraceYarnRolesV1
}

export interface KnitEventRefV1 extends KnitRunEventV1 {
  readonly knit: string
  /** False for a candidate pass in an uncertain stop section. The warning does not prove that pass ran. */
  readonly executionConfirmed: boolean
}

/** A fault stops counting against a pass once this many later knits have run it with none reported. */
export const KNITS_TO_CLEAR_A_FAULT_V1 = 2

export interface PassEvidenceV1 {
  readonly description: PassDescriptionV1
  /** Knits whose confirmed prefix contains this description, irrespective of reported faults. */
  readonly executed: readonly string[]
  /** Knits that ran this pass with no fault reported on it, oldest first. */
  readonly knitted: readonly string[]
  /** Knits that have run it with no fault reported since the last fault, counting only knits whose run was reported on; null when it has never faulted. */
  readonly knittedSinceFault: number | null
  /** Faults reported on this pass, or on a stretch that contains it. */
  readonly faults: readonly KnitEventRefV1[]
  /** Knits that ran this pass but whose reported faults could not be ruled out for it. */
  readonly unclear: readonly string[]
  readonly unclearFaults: readonly KnitEventRefV1[]
  /** Notes on how the fabric looked at this pass. */
  readonly notes: readonly KnitEventRefV1[]
  /** Narrowest and widest fabric it knitted on with no fault reported; null when it never has. */
  readonly width: readonly [number, number] | null
  /** Exact observed widths with no fault reported. The envelope above does not fill gaps in this set. */
  readonly widths: readonly number[]
  /** Kniterate's own files that contain the same pass. */
  readonly kniterate: readonly string[]
}

export interface KnitEvidenceV1 {
  readonly passes: ReadonlyMap<string, PassEvidenceV1>
  /** Needles covered by any knit: the leftmost and rightmost loop in any of them. */
  readonly span: readonly [number, number] | null
  readonly knits: readonly string[]
}

interface MutableEvidence {
  description: PassDescriptionV1
  executed: string[]
  knitted: string[]
  knittedSinceFault: number | null
  faults: KnitEventRefV1[]
  unclear: string[]
  unclearFaults: KnitEventRefV1[]
  notes: KnitEventRefV1[]
  width: [number, number] | null
  widths: number[]
  kniterate: string[]
}

/**
 * Join the knits, given oldest first, to the passes they ran.
 *
 * A fault or note read off the machine counts against every pass in its range. One placed on a stretch
 * the report only points to is narrowed to where it most plausibly belongs:
 *   1. the passes of the stretch that had not knitted before that knit, if there are any;
 *   2. otherwise the passes the same knit runs nowhere else (unique passes rank ahead of repeated
 *      ones, without establishing that those repeated passes ran cleanly);
 *   3. otherwise every pass of the stretch.
 * Passes excluded by that ranking remain uncertain: the report is not evidence that they ran cleanly.
 */
export function buildKnitEvidenceV1(runs: readonly KnitRunV1[], references: readonly KnitReferenceV1[] = []): KnitEvidenceV1 {
  const passes = new Map<string, MutableEvidence>()
  const entry = (description: PassDescriptionV1): MutableEvidence => {
    let found = passes.get(description.text)
    if (!found) { found = { description, executed: [], knitted: [], knittedSinceFault: null, faults: [], unclear: [], unclearFaults: [], notes: [], width: null, widths: [], kniterate: [] }; passes.set(description.text, found) }
    return found
  }
  let span: [number, number] | null = null
  for (const run of runs) {
    const described = describeTracePassesV1(run.trace, run.roles)
    const through = Math.max(0, Math.min(run.knittedThrough ?? (run.stopWithin ? run.stopWithin[0] - 1 : described.length), described.length))
    const possibleThrough = Math.max(through, Math.min(run.stopWithin?.[1] ?? through, described.length))
    const unplacedFaults = new Set(run.events.filter((event) => event.kind === 'fault' && event.passes === null))
    const seen = new Map<string, { description: PassDescriptionV1; confirmed: boolean; faults: Map<KnitRunEventV1, boolean>; uncertain: Set<KnitRunEventV1>; notes: Set<KnitRunEventV1>; widths: number[] }>()
    for (let index = 0; index < possibleThrough; index++) {
      const description = described[index]!
      let here = seen.get(description.text)
      if (!here) { here = { description, confirmed: false, faults: new Map(), uncertain: new Set(), notes: new Set(), widths: [] }; seen.set(description.text, here) }
      if (index < through) {
        here.confirmed = true
        here.widths.push(description.width)
        if (description.span) span = span ? [Math.min(span[0], description.span[0]), Math.max(span[1], description.span[1])] : [description.span[0], description.span[1]]
      }
    }
    for (const event of run.events) {
      if (event.passes === null) continue
      const spans = event.passes
      const inside = new Set<string>()
      const confirmedInside = new Set<string>()
      const elsewhere = new Set<string>()
      for (let index = 0; index < possibleThrough; index++) {
        const text = described[index]!.text
        if (spans.some(([from, to]) => index + 1 >= from && index + 1 <= to)) {
          inside.add(text)
          if (index < through) confirmedInside.add(text)
        } else if (index < through) elsewhere.add(text)
      }
      // Only a fault beyond even the possible stop loses its location. An uncertain section still has suspects.
      if (inside.size === 0) { if (event.kind === 'fault') unplacedFaults.add(event); continue }
      let blamed = [...inside]
      if (event.approximate) {
        const novel = blamed.filter((text) => (passes.get(text)?.knitted.length ?? 0) === 0)
        const own = blamed.filter((text) => !elsewhere.has(text))
        if (novel.length > 0) blamed = novel
        else if (own.length > 0) blamed = own
        if (event.kind === 'fault') {
          const likely = new Set(blamed)
          for (const text of inside) if (!likely.has(text)) seen.get(text)!.uncertain.add(event)
        }
      }
      for (const text of blamed) {
        if (event.kind === 'fault') seen.get(text)!.faults.set(event, confirmedInside.has(text))
        else seen.get(text)!.notes.add(event)
      }
    }
    for (const here of seen.values()) {
      const found = entry(here.description)
      if (here.confirmed) found.executed.push(run.id)
      for (const event of here.notes) found.notes.push({ ...event, knit: run.id, executionConfirmed: here.confirmed })
      if (here.faults.size > 0) {
        for (const [event, executionConfirmed] of here.faults) found.faults.push({ ...event, knit: run.id, executionConfirmed })
        found.knittedSinceFault = 0
      } else if (unplacedFaults.size > 0 || here.uncertain.size > 0) {
        if (here.confirmed) found.unclear.push(run.id)
        for (const event of new Set([...unplacedFaults, ...here.uncertain])) found.unclearFaults.push({ ...event, knit: run.id, executionConfirmed: here.confirmed })
      } else if (here.confirmed) {
        found.knitted.push(run.id)
        if (found.knittedSinceFault !== null && run.clears !== false) found.knittedSinceFault++
        const widths: [number, number] = [Math.min(...here.widths), Math.max(...here.widths)]
        found.width = found.width ? [Math.min(found.width[0], widths[0]), Math.max(found.width[1], widths[1])] : widths
        found.widths = [...new Set([...found.widths, ...here.widths])].sort((a, b) => a - b)
      }
    }
  }
  for (const reference of references) {
    for (const description of describeTracePassesV1(reference.trace, reference.roles)) {
      const found = entry(description)
      if (!found.kniterate.includes(reference.name)) found.kniterate.push(reference.name)
    }
  }
  return { passes, span, knits: runs.map((run) => run.id) }
}

/**
 * knitted      ran in a knit with no fault reported on it, at this width
 * between-widths  no exact match, but between the narrowest and widest observed widths; informational
 * other-width  narrower or wider than every recorded width of this pass; warrants attention
 * faulted      a fault was reported on it, and fewer than `KNITS_TO_CLEAR_A_FAULT_V1` knits have run it cleanly since
 * unclear      only ran in knits whose faults could not be ruled out for this pass
 * new          no confirmed execution on the machine
 */
export type KnittedStatusV1 = 'knitted' | 'between-widths' | 'other-width' | 'faulted' | 'unclear' | 'new'

export interface FacetDifferenceV1 {
  readonly facet: string
  /** In the pass that has been on the machine; null when it has no such facet. */
  readonly known: string | null
  /** In this file's pass. */
  readonly here: string | null
}

export interface KnittedCheckV1 {
  readonly passCount: number
  /** Fault warnings overlap `new` when a stop section is uncertain; all other counts follow statuses. */
  readonly counts: Readonly<Record<KnittedStatusV1, number>>
  /** One status per pass, in order. */
  readonly statuses: readonly KnittedStatusV1[]
  readonly descriptions: readonly PassDescriptionV1[]
  /** Passes without confirmed execution on the machine, one entry per distinct description. */
  readonly fresh: readonly {
    readonly passes: readonly number[]
    readonly description: PassDescriptionV1
    /** Kniterate's own files that contain this pass. */
    readonly kniterate: readonly string[]
    /** The most similar pass that has been on the machine, and how it differs. */
    readonly closest: { readonly knits: readonly string[]; readonly standing: 'knitted' | 'faulted' | 'unclear'; readonly differences: readonly FacetDifferenceV1[] } | null
  }[]
  readonly otherWidth: readonly { readonly passes: readonly number[]; readonly width: readonly [number, number]; readonly knittedAt: readonly number[]; readonly knits: readonly string[] }[]
  readonly betweenWidths: KnittedCheckV1['otherWidth']
  /** Includes warnings on unconfirmed passes; those passes also appear in `fresh`. */
  readonly faulted: readonly { readonly passes: readonly number[]; readonly faults: readonly KnitEventRefV1[]; readonly knitted: readonly string[]; readonly knittedSinceFault: number }[]
  /** Passes whose earlier faults no longer count against them: later knits ran them with none reported. */
  readonly cleared: readonly { readonly passes: readonly number[]; readonly faults: readonly KnitEventRefV1[]; readonly knittedSinceFault: number }[]
  readonly unclear: readonly { readonly passes: readonly number[]; readonly knits: readonly string[]; readonly faults: readonly KnitEventRefV1[] }[]
  /** Notes from earlier knits on passes this file contains. */
  readonly notes: readonly { readonly passes: readonly number[]; readonly notes: readonly KnitEventRefV1[] }[]
  /** Where this file's fabric sits on the bed, and the needles earlier knits covered. */
  readonly placement: { readonly here: readonly [number, number] | null; readonly knitted: readonly [number, number] | null }
}

/** Where a pass stands on the evidence, before width is considered. */
function standing(found: PassEvidenceV1 | undefined): 'knitted' | 'faulted' | 'unclear' | 'new' {
  if (!found || found.executed.length === 0) return 'new'
  if (activeFault(found)) return 'faulted'
  return found.knitted.length === 0 ? 'unclear' : 'knitted'
}

function activeFault(found: PassEvidenceV1 | undefined): boolean {
  return found?.knittedSinceFault != null && found.knittedSinceFault < KNITS_TO_CLEAR_A_FAULT_V1
}

function differences(known: PassDescriptionV1, here: PassDescriptionV1): FacetDifferenceV1[] {
  const names = [...new Set([...Object.keys(known.facets), ...Object.keys(here.facets)])]
  return names.filter((name) => known.facets[name] !== here.facets[name]).map((facet) => ({ facet, known: known.facets[facet] ?? null, here: here.facets[facet] ?? null }))
}

export function checkTraceAgainstKnitsV1(trace: Trace, evidence: KnitEvidenceV1, roles: TraceYarnRolesV1 = DEFAULT_TRACE_YARN_ROLES_V1): KnittedCheckV1 {
  const descriptions = describeTracePassesV1(trace, roles)
  const statusOf = (description: PassDescriptionV1): KnittedStatusV1 => {
    const found = evidence.passes.get(description.text)
    const stands = standing(found)
    if (stands !== 'knitted') return stands
    if (found!.widths.includes(description.width)) return 'knitted'
    return description.width > found!.width![0] && description.width < found!.width![1] ? 'between-widths' : 'other-width'
  }
  const statuses = descriptions.map(statusOf)
  const counts: Record<KnittedStatusV1, number> = { knitted: 0, 'between-widths': 0, 'other-width': 0, faulted: 0, unclear: 0, new: 0 }
  for (const status of statuses) counts[status]++

  // One entry per distinct pass, in the order each first appears.
  const groupPasses = (matches: (description: PassDescriptionV1, index: number) => boolean) => {
    const found = new Map<string, { description: PassDescriptionV1; passes: number[] }>()
    descriptions.forEach((description, index) => {
      if (!matches(description, index)) return
      const group = found.get(description.text) ?? { description, passes: [] }
      group.passes.push(index + 1)
      found.set(description.text, group)
    })
    return [...found.values()]
  }
  const byText = (status: KnittedStatusV1) => groupPasses((_description, index) => statuses[index] === status)
  const onMachine = [...evidence.passes.values()].flatMap((found) => { const stands = standing(found); return stands === 'new' ? [] : [{ found, stands }] })
  const fresh = byText('new').map(({ description, passes }) => {
    let closest: KnittedCheckV1['fresh'][number]['closest'] = null
    let best = Infinity
    for (const { found: known, stands } of onMachine) {
      const differs = differences(known.description, description)
      // Prefer a pass that stands as knitted over one with a fault on record.
      const score = differs.length * 2 + (stands === 'knitted' ? 0 : 1)
      if (score >= best) continue
      best = score
      closest = { knits: known.executed, standing: stands, differences: differs }
    }
    return { passes, description, kniterate: evidence.passes.get(description.text)?.kniterate ?? [], closest }
  })
  const atOtherWidths = (status: 'other-width' | 'between-widths') => byText(status).map(({ description, passes }) => {
    const found = evidence.passes.get(description.text)!
    const widths = passes.map((pass) => descriptions[pass - 1]!.width)
    return { passes, width: [Math.min(...widths), Math.max(...widths)] as const, knittedAt: found.widths, knits: found.knitted }
  })
  const otherWidth = atOtherWidths('other-width')
  const betweenWidths = atOtherWidths('between-widths')
  const faulted = groupPasses((description) => activeFault(evidence.passes.get(description.text))).map(({ description, passes }) => {
    const found = evidence.passes.get(description.text)!
    return { passes, faults: found.faults, knitted: found.knitted, knittedSinceFault: found.knittedSinceFault ?? 0 }
  })
  counts.faulted = faulted.reduce((total, group) => total + group.passes.length, 0)
  const clearedByText = new Map<string, { passes: number[]; faults: readonly KnitEventRefV1[]; knittedSinceFault: number }>()
  descriptions.forEach((description, index) => {
    const found = evidence.passes.get(description.text)
    if (!found || found.faults.length === 0 || activeFault(found)) return
    const group = clearedByText.get(description.text) ?? { passes: [], faults: found.faults, knittedSinceFault: found.knittedSinceFault ?? 0 }
    group.passes.push(index + 1)
    clearedByText.set(description.text, group)
  })
  const unclear = byText('unclear').map(({ description, passes }) => {
    const found = evidence.passes.get(description.text)!
    return { passes, knits: found.unclear, faults: found.unclearFaults }
  })
  const noted = new Map<string, { passes: number[]; notes: readonly KnitEventRefV1[] }>()
  descriptions.forEach((description, index) => {
    const found = evidence.passes.get(description.text)
    if (!found || found.notes.length === 0) return
    const group = noted.get(description.text) ?? { passes: [], notes: found.notes }
    group.passes.push(index + 1)
    noted.set(description.text, group)
  })
  let here: [number, number] | null = null
  for (const description of descriptions) {
    if (description.span) here = here ? [Math.min(here[0], description.span[0]), Math.max(here[1], description.span[1])] : [description.span[0], description.span[1]]
  }
  return { passCount: descriptions.length, counts, statuses, descriptions, fresh, otherWidth, betweenWidths, faulted, cleared: [...clearedByText.values()], unclear, notes: [...noted.values()], placement: { here, knitted: evidence.span } }
}
