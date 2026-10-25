import type {
  KCodeCarrierToken,
  KCodeEvidence,
  KCodeMachineProfileV1,
} from './machine-profile.js'
import {
  regularActionTraversalCoordinate,
  type MachineTraceActionV1,
  type MachineTracePassV1,
  type MachineTraceStopRangeV1,
  type MachineTraceV1,
} from './machine-trace.js'
import type { KCodeSourceSpan } from './types.js'

/**
 * Machine-safety envelope over an exact strict-KCode trace.
 *
 * `validateKCodeMachineTrace` proves serialized-command conformance. This
 * layer refuses a conformant program that drives the fixed V1 machine into a
 * documented hazard (facing needles or a feeder meeting the needles, a
 * transfer with a carrier) or outside the envelope that Kniterate's own
 * documentation and programs establish: stopping distance, carrier home
 * positions, speed, takedown, stitch size and transfer settings. Every rule
 * blocks export. A value inside the envelope is not a claim that it suits
 * every yarn; that remains the physical trial's job.
 *
 * The envelope assumes the documented job boundary: every carrier starts the
 * job parked at its home stop on the left and the job leaves it there.
 */
export type MachineSafetyRuleV1 =
  | 'machine-safety.facing-needles'
  | 'machine-safety.unsafe-bed-range'
  | 'machine-safety.feeder-clearance'
  | 'machine-safety.stop-overrun'
  | 'machine-safety.transfer-with-carrier'
  | 'machine-safety.carrierless-tuck'
  | 'machine-safety.carrier-start'
  | 'machine-safety.carrier-behind-home'
  | 'machine-safety.carrier-not-home'
  | 'machine-safety.speed-range'
  | 'machine-safety.roller-range'
  | 'machine-safety.takedown-gap'
  | 'machine-safety.central-short-rows'
  | 'machine-safety.tuck-stack'
  | 'machine-safety.stitch-too-small'
  | 'machine-safety.transfer-settings'
  | 'machine-safety.adjacent-transfers'

export const MACHINE_SAFETY_RULES_V1: readonly MachineSafetyRuleV1[] = [
  'machine-safety.facing-needles',
  'machine-safety.unsafe-bed-range',
  'machine-safety.feeder-clearance',
  'machine-safety.stop-overrun',
  'machine-safety.transfer-with-carrier',
  'machine-safety.carrierless-tuck',
  'machine-safety.carrier-start',
  'machine-safety.carrier-behind-home',
  'machine-safety.carrier-not-home',
  'machine-safety.speed-range',
  'machine-safety.roller-range',
  'machine-safety.takedown-gap',
  'machine-safety.central-short-rows',
  'machine-safety.tuck-stack',
  'machine-safety.stitch-too-small',
  'machine-safety.transfer-settings',
  'machine-safety.adjacent-transfers',
]

type MachineCarrierV1 = Exclude<KCodeCarrierToken, '0'>

export interface MachineSafetyEnvelopeV1 {
  readonly schemaVersion: 1
  readonly id: 'kniterate-7gg-machine-safety'
  readonly version: 1
  /** Two-sided needle action at a whole-number rack: the facing needles collide. */
  readonly facingNeedles: { readonly evidence: KCodeEvidence }
  /** Needle action whose facing position at the current rack is off the bed. */
  readonly bedRange: { readonly evidence: KCodeEvidence }
  /**
   * Stop coordinates: the carriage and the carrier turn at least this far past
   * the outermost operated needle, and an idle carrier rests at least this far
   * from every needle another pass operates.
   */
  readonly stoppingDistance: { readonly value: number; readonly evidence: KCodeEvidence }
  /** A transfer with a carrier (a split stitch) until its encoding is verified. */
  readonly transferWithCarrier: { readonly evidence: KCodeEvidence }
  /** Carrierless passes that select needles are plain drops (Kn-Kn). */
  readonly carrierlessTuck: { readonly evidence: KCodeEvidence }
  /** Each carrier's home stop: its first pass starts there moving right, it never goes left of it, and the job leaves it there. */
  readonly carrierHomeStops: {
    readonly value: Readonly<Record<MachineCarrierV1, number>>
    readonly evidence: KCodeEvidence
  }
  readonly speed: { readonly min: number; readonly max: number; readonly evidence: KCodeEvidence }
  readonly roller: { readonly min: number; readonly max: number; readonly evidence: KCodeEvidence }
  /** Longest run of loop-forming passes the rollers may leave without takedown. */
  readonly takedown: { readonly maxPassesWithoutRoller: number; readonly evidence: KCodeEvidence }
  /**
   * Most loops a needle may form while older loops are held on both sides of
   * it on the same bed: central short rows. KCode encodes passes, not rows, so
   * this counts the loops formed in a needle's column, or in the column of a
   * loop transferred onto it if that one is taller.
   */
  readonly centralShortRows: { readonly maxKnits: number; readonly evidence: KCodeEvidence }
  /** Most loops a tuck may leave on a needle. */
  readonly tuckStack: { readonly maxLoops: number; readonly evidence: KCodeEvidence }
  /** Smallest stitch selector for a knit or tuck. */
  readonly loopFormingStitch: { readonly min: number; readonly evidence: KCodeEvidence }
  readonly transfer: { readonly maxSpeed: number; readonly maxRoller: number; readonly evidence: KCodeEvidence }
  /** Neighbouring needles on one bed transfer in separate passes. */
  readonly adjacentTransfers: { readonly evidence: KCodeEvidence }
}

const RACKING_ARTICLE = 'https://support.kniterate.com/hc/en-us/articles/360016699857'
const CHECKS_ARTICLE = 'https://support.kniterate.com/hc/en-us/articles/11698092127005'
const FEEDER_ARTICLE = 'https://support.kniterate.com/hc/en-us/articles/360010645337'
const TRANSFERS_ARTICLE = 'https://support.kniterate.com/hc/en-us/articles/360012868118'
const SPLIT_ARTICLE = 'https://support.kniterate.com/hc/en-us/articles/360012868178'
const LIMITATIONS_ARTICLE = 'https://support.kniterate.com/hc/en-us/articles/360010783278'
const TRANSFERS_BLOG = 'https://www.kniterate.com/2023/07/19/all-you-ever-wanted-to-know-about-transfers/'
const KNITOUT_CHEATSHEET = 'https://soup.agnescameron.info/2026/04/09/cheatsheet.html'
const MACHINE_MANUAL = 'https://support.kniterate.com/hc/article_attachments/360009727217'
const CUSTOMIST_MANUAL = 'https://editor.kniterate.design/documentation'
const PINNED_BACKEND = 'packages/machine-lib/src/knitout/vendor/knitout-to-kcode.cjs'
const REFERENCE_CORPUS = 'packages/machine-lib/reference/*.kc'

const evidence = (
  confidence: KCodeEvidence['confidence'],
  provenance: readonly string[],
  note: string,
): KCodeEvidence => ({ confidence, provenance, note })

export const KNITERATE_7GG_MACHINE_SAFETY_ENVELOPE_V1: MachineSafetyEnvelopeV1 = {
  schemaVersion: 1,
  id: 'kniterate-7gg-machine-safety',
  version: 1,
  facingNeedles: {
    evidence: evidence('official-documented', [RACKING_ARTICLE, CHECKS_ARTICLE, CUSTOMIST_MANUAL],
      'Kniterate: "When two facing needles come out in a rack integer position (0.0, 1.0, -2.0, etc.) needles collide." Its editor does not compile two-sided needle actions without half racking. No reference program operates facing needles at a whole-number rack.'),
  },
  bedRange: {
    evidence: evidence('official-documented', [CHECKS_ARTICLE, CUSTOMIST_MANUAL, REFERENCE_CORPUS],
      'The official editor reports "Needle action in unsafe bed range" for racked work whose facing position is off the bed. No reference program does this.'),
  },
  stoppingDistance: {
    value: 2.5,
    evidence: evidence('official-documented', [FEEDER_ARTICLE, CUSTOMIST_MANUAL, PINNED_BACKEND, REFERENCE_CORPUS],
      'Kniterate: "Never place a feeder over the needle bed. This can cause a collision between the needles and the feeder." The carrier stopping distance (default 2.5) keeps feeders clear of the knitting. Every reference program turns the carriage and carrier at least 2.5 past the outermost operated needle and rests idle carriers at least 2.5 from every operated needle.'),
  },
  transferWithCarrier: {
    evidence: evidence('unverified', [SPLIT_ARTICLE, TRANSFERS_ARTICLE, PINNED_BACKEND, REFERENCE_CORPUS],
      'Kniterate documents split stitches, a transfer whose delivering needle receives yarn at once, and ordinary transfer rows with no carrier. No reference program contains a split, so how Kniterate\'s software encodes one in KCode is unverified; the pinned backend\'s transfer-with-carrier encoding is refused until a captured program establishes it.'),
  },
  carrierlessTuck: {
    evidence: evidence('reference-corpus-observed', [PINNED_BACKEND, REFERENCE_CORPUS],
      'Reference programs drop loops only with carrierless Kn-Kn. The pinned backend writes carrierless Tu-Tu for Knitout amiss, which keeps the loop, so modelling it as a drop could under-count a needle\'s loops.'),
  },
  carrierHomeStops: {
    value: { 1: -11.5, 2: -9.5, 3: -9.5, 4: -7.5, 5: -7.5, 6: -7.5 },
    evidence: evidence('official-documented', [CHECKS_ARTICLE, CUSTOMIST_MANUAL, PINNED_BACKEND, REFERENCE_CORPUS],
      'Kniterate: all feeders start at the left side (home); a carrier starting elsewhere depends on the operator placing it by hand. The pinned backend parks carriers at these stops. Every reference program starts each carrier there moving right, never takes it further left, and leaves it there.'),
  },
  speed: {
    min: 10,
    max: 800,
    evidence: evidence('official-documented', [CUSTOMIST_MANUAL],
      'The official editor accepts speed 10 to 800. Reference programs use 60 to 700.'),
  },
  roller: {
    min: 0,
    max: 999,
    evidence: evidence('official-documented', [CUSTOMIST_MANUAL, REFERENCE_CORPUS],
      'Negative roller values reverse the takedown to release tension; no reference program uses one. The upper bound is the profile\'s documented editor ceiling. Reference programs use 0 to 600.'),
  },
  takedown: {
    maxPassesWithoutRoller: 4,
    evidence: evidence('reference-corpus-observed', [CUSTOMIST_MANUAL, REFERENCE_CORPUS],
      'The waste section exists so the rollers can pull the fabric down; without pull-down the knitting fails. Any pass that advances the roller pulls, transfers included. No reference program knits more than 4 loop-forming passes without one.'),
  },
  centralShortRows: {
    maxKnits: 4,
    evidence: evidence('official-documented', [LIMITATIONS_ARTICLE, REFERENCE_CORPUS],
      'Kniterate: short-rowing is limited to "a maximum of 2-3 rows in the centre of the piece"; short rows at the edges are possible. KCode does not encode rows, so this counts the loops a needle forms while older loops are held on both sides of it on the same bed; holding one bed while the other knits (an Ottoman, say) is a different structure and is not counted. A tuck keeps the loop under it held, and a loop knitted through a stitch transferred from a taller column counts from that column. A count does not follow a loop from needle to needle: Kniterate\'s own neck bind-offs knit one chain loop again at every needle it moves to. Reference programs reach 4, where a double-bed backing knits a rear needle more than once per row.'),
  },
  tuckStack: {
    maxLoops: 2,
    evidence: evidence('official-documented', [CHECKS_ARTICLE, CUSTOMIST_MANUAL, KNITOUT_CHEATSHEET],
      'Kniterate\'s editor reports a loop with more than two parents as "dangerous", and knitout guidance for the Kniterate keeps stacked tucks to two. Studio refuses a tuck that leaves more than two loops; a three-loop stack made by a transfer stays a warning, as in the editor, because Kniterate\'s own reference crown makes one. No reference program tucks on a selected needle.'),
  },
  loopFormingStitch: {
    min: 2,
    evidence: evidence('official-documented', [MACHINE_MANUAL, REFERENCE_CORPUS],
      'Kniterate: a stitch size that is "too small could break the yarn or the needles"; full-needle rows use 2 to 4. Reference programs knit at 2 to 9.'),
  },
  transfer: {
    maxSpeed: 400,
    maxRoller: 450,
    evidence: evidence('reference-corpus-observed', [TRANSFERS_ARTICLE, CUSTOMIST_MANUAL, REFERENCE_CORPUS],
      'Kniterate recommends transfers at stitch 0, roller 0 and speed 100 to 120. Reference transfer passes stay within speed 400 and roller 450.'),
  },
  adjacentTransfers: {
    evidence: evidence('official-documented', [TRANSFERS_BLOG, PINNED_BACKEND, REFERENCE_CORPUS],
      'Kniterate: "When transferring multiple adjacent loops, the Kniterate machine does it in 2 passes, alternating even and odd wales for reliability." The pinned backend splits them the same way, and no reference program transfers neighbouring needles in one pass.'),
  },
}

export interface MachineSafetyDiagnosticV1 {
  readonly severity: 'error'
  readonly class: 'machine-safety'
  readonly rule: MachineSafetyRuleV1
  readonly message: string
  /** Null only for a bounded summary of omitted findings. */
  readonly passIndex: number | null
  readonly actionIndex?: number
  readonly sourceSpan: KCodeSourceSpan | null
  readonly line: number | null
  readonly column: number | null
  readonly endLine: number | null
  readonly endColumn: number | null
  /** Number of omitted findings represented by a bounded summary diagnostic. */
  readonly occurrences?: number
}

export interface MachineSafetyReportV1 {
  readonly schemaVersion: 1
  readonly envelope: { readonly id: MachineSafetyEnvelopeV1['id']; readonly version: MachineSafetyEnvelopeV1['version'] }
  /** True only when no machine-safety finding exists. */
  readonly ok: boolean
  readonly errorCount: number
  /** Every finding per rule, including those without a retained detail. */
  readonly counts: Readonly<Record<MachineSafetyRuleV1, number>>
  readonly diagnostics: readonly MachineSafetyDiagnosticV1[]
}

const MAX_MACHINE_SAFETY_DIAGNOSTIC_DETAILS = 512

const CARRIERS: readonly MachineCarrierV1[] = ['1', '2', '3', '4', '5', '6']

interface HeldLoops {
  readonly bed: 'front' | 'rear'
  readonly coordinate: number
  readonly count: number
  /** Pass that formed the needle's oldest loop still held. */
  readonly formed: number
  /** Loop-forming passes of the needle columns these loops were made in, merged. */
  readonly column: readonly number[]
}

/**
 * The loop-forming passes of two columns whose loops stack on one needle.
 * Counted back from the latest, each place keeps the later of the two passes,
 * so the result has as many loops after any pass as the taller column had.
 */
function stackedFormation(a: readonly number[], b: readonly number[]): number[] {
  const length = Math.max(a.length, b.length)
  return Array.from({ length }, (_, index) => Math.max(
    a[a.length - length + index] ?? Number.NEGATIVE_INFINITY,
    b[b.length - length + index] ?? Number.NEGATIVE_INFINITY,
  ))
}

interface OperatedNeedle {
  readonly actionIndex: number
  /** Stop-frame coordinate, the frame the command validator checks carriage reach in. */
  readonly stop: number
  /**
   * Where the needle meets the feeders, in the front-bed frame. A transfer's
   * two needles face each other, so it sits at its front-bed needle: a rear
   * source at a rack is not where its raster column says.
   */
  readonly position: number
  readonly span: KCodeSourceSpan
}

function operatedNeedles(pass: MachineTracePassV1): OperatedNeedle[] {
  const needles: OperatedNeedle[] = []
  for (const [actionIndex, action] of pass.actions.entries()) {
    if (action.kind === 'knit' || action.kind === 'tuck' || action.kind === 'drop') {
      const stop = regularActionTraversalCoordinate(action.at, pass.rack)
      needles.push({ actionIndex, stop, position: stop, span: action.at.sourceSpan })
    } else if (action.kind === 'xfer' || action.kind === 'split') {
      const front = action.source.bed === 'front' ? action.source : action.target
      needles.push({ actionIndex, stop: action.source.traceCoordinate, position: front.traceCoordinate, span: front.sourceSpan })
    }
  }
  return needles
}

function isRegularNeedleAction(
  action: MachineTraceActionV1,
): action is Extract<MachineTraceActionV1, { readonly at: unknown }> {
  return action.kind === 'knit' || action.kind === 'tuck' || action.kind === 'drop'
}

function formatStop(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1)
}

/**
 * Check one exact trace against the machine-safety envelope. Run it on every
 * trace the command validator accepts; it reports independently of that
 * validator and never relaxes it.
 */
export function validateKCodeMachineSafetyV1(
  trace: Pick<MachineTraceV1, 'passes'>,
  profile: Pick<KCodeMachineProfileV1, 'raster'>,
  envelope: MachineSafetyEnvelopeV1 = KNITERATE_7GG_MACHINE_SAFETY_ENVELOPE_V1,
): MachineSafetyReportV1 {
  const counts = Object.fromEntries(MACHINE_SAFETY_RULES_V1.map((rule) => [rule, 0])) as Record<MachineSafetyRuleV1, number>
  const diagnostics: MachineSafetyDiagnosticV1[] = []
  const omitted = new Map<MachineSafetyRuleV1, number>()
  const add = (
    rule: MachineSafetyRuleV1,
    message: string,
    pass: MachineTracePassV1,
    sourceSpan: KCodeSourceSpan,
    actionIndex?: number,
  ): void => {
    counts[rule] += 1
    if (diagnostics.length >= MAX_MACHINE_SAFETY_DIAGNOSTIC_DETAILS) {
      omitted.set(rule, (omitted.get(rule) ?? 0) + 1)
      return
    }
    diagnostics.push({
      severity: 'error',
      class: 'machine-safety',
      rule,
      message,
      passIndex: pass.index,
      ...(actionIndex === undefined ? {} : { actionIndex }),
      sourceSpan,
      line: sourceSpan.start.line,
      column: sourceSpan.start.column,
      endLine: sourceSpan.end.line,
      endColumn: sourceSpan.end.column,
    })
  }

  const distance = envelope.stoppingDistance.value
  const home = envelope.carrierHomeStops.value
  const { min: firstColumn, max: lastColumn } = profile.raster.kcodeColumnRange
  const rest = new Map<MachineCarrierV1, number>(CARRIERS.map((carrier) => [carrier, home[carrier]]))
  const lastPass = new Map<MachineCarrierV1, MachineTracePassV1>()
  let passesWithoutRoller = 0
  const held = new Map<string, HeldLoops>()
  // Each needle's latest loop-forming passes: more than maxKnits of them
  // cannot change whether it exceeds maxKnits.
  const recent = new Map<string, number[]>()
  const needleKey = (selection: { readonly bed: 'front' | 'rear'; readonly traceCoordinate: number }) => `${selection.bed}:${selection.traceCoordinate}`
  const recordLoop = (key: string, passIndex: number): readonly number[] => {
    const formed = recent.get(key)
    // Stryker disable next-line MethodExpression: Equivalent mutant: the slice only bounds memory; no more than maxKnits earlier loops can change whether a needle exceeds maxKnits.
    const column = formed === undefined ? [passIndex] : [...formed, passIndex].slice(-envelope.centralShortRows.maxKnits)
    recent.set(key, column)
    return column
  }

  for (const pass of trace.passes) {
    const needles = operatedNeedles(pass)

    if (!(pass.speed >= envelope.speed.min && pass.speed <= envelope.speed.max)) {
      add('machine-safety.speed-range',
        `Pass ${pass.index + 1} runs at speed ${pass.speedRaw}; the machine's range is ${envelope.speed.min} to ${envelope.speed.max}.`,
        pass, pass.source.footer)
    }
    if (!(pass.roller >= envelope.roller.min && pass.roller <= envelope.roller.max)) {
      add('machine-safety.roller-range',
        `Pass ${pass.index + 1} sets the roller to ${pass.rollerRaw}; it must stay between ${envelope.roller.min} and ${envelope.roller.max}, and a negative value pushes the fabric back up into the needles.`,
        pass, pass.source.footer)
    }

    // Any pass that advances the roller pulls the fabric down; only knitting
    // passes without it count toward the gap.
    const formsLoops = pass.actions.some((action) => action.kind === 'knit' || action.kind === 'tuck' || action.kind === 'split')
    if (pass.roller > 0) passesWithoutRoller = 0
    else if (formsLoops) {
      passesWithoutRoller += 1
      if (passesWithoutRoller === envelope.takedown.maxPassesWithoutRoller + 1) {
        add('machine-safety.takedown-gap',
          `Pass ${pass.index + 1} makes ${passesWithoutRoller} knitting passes since the roller last pulled the fabric down; without pull-down the loops cannot clear the needles (at most ${envelope.takedown.maxPassesWithoutRoller}).`,
          pass, pass.source.footer)
      }
    }

    if (pass.actions.some((action) => action.kind === 'xfer')
      && (pass.speed > envelope.transfer.maxSpeed || pass.roller > envelope.transfer.maxRoller)) {
      add('machine-safety.transfer-settings',
        `Transfer pass ${pass.index + 1} runs at speed ${pass.speedRaw} with roller ${pass.rollerRaw}; transfers stay at or below speed ${envelope.transfer.maxSpeed} and roller ${envelope.transfer.maxRoller}.`,
        pass, pass.source.footer)
    }

    const sources = pass.actions
      .filter((action): action is Extract<MachineTraceActionV1, { readonly source: unknown }> => action.kind === 'xfer' || action.kind === 'split')
      .map((action) => action.source)
    const neighbour = (['front', 'rear'] as const).flatMap((bed) => {
      const columns = sources.filter((source) => source.bed === bed).sort((a, b) => a.traceCoordinate - b.traceCoordinate)
      return columns.filter((source, index) => index > 0 && source.traceCoordinate - columns[index - 1]!.traceCoordinate === 1)
    })[0]
    if (neighbour !== undefined) {
      add('machine-safety.adjacent-transfers',
        `Pass ${pass.index + 1} transfers neighbouring ${neighbour.bed} needles ${neighbour.traceCoordinate - 1} and ${neighbour.traceCoordinate} together; the machine transfers neighbours in separate passes, alternating even and odd needles.`,
        pass, neighbour.sourceSpan)
    }

    if (pass.actions.some((action) => action.kind === 'split')) {
      add('machine-safety.transfer-with-carrier',
        `Pass ${pass.index + 1} transfers with carrier ${pass.carrier} (a split stitch). No Kniterate reference program shows how a split is encoded, so it is refused until that is verified.`,
        pass, pass.source.footer)
    }

    if (pass.carrier === '0' && pass.operation !== 'Kn-Kn' && pass.actions.some((action) => action.kind === 'drop')) {
      add('machine-safety.carrierless-tuck',
        `Pass ${pass.index + 1} selects needles with ${pass.operation} and no carrier; a carrierless pass that selects needles must be a Kn-Kn drop.`,
        pass, pass.source.footer)
    }

    const regular = pass.actions.flatMap((action, actionIndex) => isRegularNeedleAction(action) ? [{ action, actionIndex }] : [])
    // Rear needle n faces front n + rack. At a half rack that position is
    // between front needles, so only a whole-number rack can match.
    const front = new Set(regular.filter(({ action }) => action.at.bed === 'front').map(({ action }) => action.at.traceCoordinate))
    for (const { action, actionIndex } of regular) {
      if (action.at.bed !== 'rear') continue
      const facing = action.at.traceCoordinate + pass.rack
      if (!front.has(facing)) continue
      add('machine-safety.facing-needles',
        `Pass ${pass.index + 1} operates front ${facing} and the rear needle facing it, ${action.at.traceCoordinate}, at whole-number rack ${pass.rack}; facing needles collide. Rack to a half pitch or split the pass.`,
        pass, action.at.sourceSpan, actionIndex)
    }
    for (const { action, actionIndex } of regular) {
      const facing = action.at.bed === 'front'
        ? action.at.kcodeColumn - pass.rack
        : action.at.kcodeColumn + pass.rack
      if (facing >= firstColumn && facing <= lastColumn) continue
      add('machine-safety.unsafe-bed-range',
        `Pass ${pass.index + 1} ${action.kind}s ${action.at.bed} KCode column ${action.at.kcodeColumn} at rack ${pass.rack}; the facing position ${formatStop(facing)} is off the bed (${firstColumn} to ${lastColumn}).`,
        pass, action.at.sourceSpan, actionIndex)
    }

    for (const [actionIndex, action] of pass.actions.entries()) {
      if (action.kind !== 'knit' && action.kind !== 'tuck') continue
      const selector = action.at.stitchSelector
      if (selector.encodedValue >= envelope.loopFormingStitch.min) continue
      add('machine-safety.stitch-too-small',
        `Pass ${pass.index + 1} ${action.kind}s at stitch size ${selector.encodedValue}; a stitch below ${envelope.loopFormingStitch.min} can break the yarn or the needles.`,
        pass, selector.sourceSpan, actionIndex)
    }

    // Loops held on both sides of a needle, on its own bed, while it keeps
    // forming loops: a central short row. A pass that knits cannot transfer,
    // so a needle's held loop is released only by a knit or a drop in it; a
    // tuck leaves the loop under it held.
    const released = new Set(regular.filter(({ action }) => action.kind !== 'tuck').map(({ action }) => needleKey(action.at)))
    const waiting = [...held.entries()].filter(([key]) => !released.has(key)).map(([, loop]) => loop)
    for (const [actionIndex, action] of pass.actions.entries()) {
      if (action.kind !== 'knit' && action.kind !== 'tuck') continue
      // A side with nothing held stays at infinity, so no earlier loop counts.
      let left = Number.POSITIVE_INFINITY
      let right = Number.POSITIVE_INFINITY
      for (const loop of waiting) {
        if (loop.bed !== action.at.bed || loop.coordinate === action.at.traceCoordinate) continue
        // Stryker disable next-line EqualityOperator: Equivalent mutant: loops at the needle's own coordinate were skipped above.
        if (loop.coordinate < action.at.traceCoordinate) left = Math.min(left, loop.formed)
        else right = Math.min(right, loop.formed)
      }
      const since = Math.max(left, right)
      // The needle's own column, or a taller one a stitch it knits through came from.
      const key = needleKey(action.at)
      const earlier = Math.max(
        recent.get(key)?.filter((formed) => formed > since).length ?? 0,
        held.get(key)?.column.filter((formed) => formed > since).length ?? 0,
      )
      if (earlier + 1 <= envelope.centralShortRows.maxKnits) continue
      add('machine-safety.central-short-rows',
        `Pass ${pass.index + 1} forms more than ${envelope.centralShortRows.maxKnits} loops on ${action.at.bed} needle ${action.at.traceCoordinate} while older loops are held on both sides of it; the machine short-rows at most 2-3 rows in the centre of a piece.`,
        pass, action.at.sourceSpan, actionIndex)
      break
    }

    if (needles.length > 0) {
      const lowest = Math.min(...needles.map((needle) => needle.stop))
      const highest = Math.max(...needles.map((needle) => needle.stop))
      const stops: Array<readonly [string, MachineTraceStopRangeV1]> = [['carriage', pass.carriageStops]]
      if (pass.carrier !== '0' && pass.carrierStops !== null) stops.push([`carrier ${pass.carrier}`, pass.carrierStops])
      for (const [name, range] of stops) {
        if (lowest - range.left >= distance && range.right - highest >= distance) continue
        add('machine-safety.stop-overrun',
          `Pass ${pass.index + 1} turns the ${name} at ${formatStop(range.left)}..${formatStop(range.right)}, less than ${distance} past the operated needles ${formatStop(lowest)}..${formatStop(highest)}.`,
          pass, pass.source.FRNT)
      }
      for (const carrier of CARRIERS) {
        if (carrier === pass.carrier) continue
        const at = rest.get(carrier)!
        const nearest = needles.reduce((best, needle) =>
          Math.abs(needle.position - at) < Math.abs(best.position - at) ? needle : best)
        if (Math.abs(nearest.position - at) >= distance) continue
        add('machine-safety.feeder-clearance',
          `Pass ${pass.index + 1} operates needle ${formatStop(nearest.position)} while carrier ${carrier} rests at ${formatStop(at)}, closer than ${distance}; a feeder over the needles collides with them.`,
          pass, nearest.span, nearest.actionIndex)
      }
    }

    for (const [actionIndex, action] of pass.actions.entries()) {
      if (action.kind === 'knit' || action.kind === 'tuck') {
        const key = needleKey(action.at)
        const loop = held.get(key)
        const tucked = action.kind === 'tuck' && loop !== undefined
        const column = recordLoop(key, pass.index)
        held.set(key, {
          bed: action.at.bed,
          coordinate: action.at.traceCoordinate,
          count: tucked ? loop.count + 1 : 1,
          formed: tucked ? loop.formed : pass.index,
          column: tucked ? stackedFormation(loop.column, column) : column,
        })
        if (tucked && loop.count + 1 > envelope.tuckStack.maxLoops) {
          add('machine-safety.tuck-stack',
            `Pass ${pass.index + 1} tucks ${action.at.bed} needle ${action.at.traceCoordinate} onto ${loop.count} loops, leaving ${loop.count + 1}; a needle holds at most ${envelope.tuckStack.maxLoops} tucked loops.`,
            pass, action.at.sourceSpan, actionIndex)
        }
      } else if (action.kind === 'drop') {
        held.delete(needleKey(action.at))
      } else if (action.kind === 'xfer' || action.kind === 'split') {
        const from = needleKey(action.source)
        const loop = held.get(from)
        if (loop === undefined) continue
        const to = needleKey(action.target)
        const there = held.get(to)
        held.set(to, {
          bed: action.target.bed,
          coordinate: action.target.traceCoordinate,
          count: loop.count + (there?.count ?? 0),
          formed: Math.min(loop.formed, there?.formed ?? loop.formed),
          column: stackedFormation(there?.column ?? [], loop.column),
        })
        if (action.kind === 'split') {
          held.set(from, { ...loop, count: 1, formed: pass.index, column: recordLoop(from, pass.index) })
        } else {
          held.delete(from)
        }
      }
    }

    if (pass.carrier !== '0' && pass.carrierStops !== null) {
      const carrier = pass.carrier
      const { left, right } = pass.carrierStops
      if (!lastPass.has(carrier) && !(pass.direction === '>>' && left === home[carrier])) {
        add('machine-safety.carrier-start',
          `Carrier ${carrier} first moves ${pass.direction === '>>' ? 'right' : 'left'} from ${formatStop(pass.direction === '>>' ? left : right)} in pass ${pass.index + 1}; every carrier starts parked at its home stop ${formatStop(home[carrier])} and first moves right.`,
          pass, pass.source.FRNT)
      }
      if (left < home[carrier]) {
        add('machine-safety.carrier-behind-home',
          `Pass ${pass.index + 1} ${pass.direction === '<<' ? `takes carrier ${carrier} to` : `starts carrier ${carrier} from`} ${formatStop(left)}, left of its home stop ${formatStop(home[carrier])}.`,
          pass, pass.source.FRNT)
      }
      rest.set(carrier, pass.direction === '>>' ? right : left)
      lastPass.set(carrier, pass)
    }
  }

  for (const [carrier, pass] of lastPass) {
    if (rest.get(carrier) === home[carrier]) continue
    add('machine-safety.carrier-not-home',
      `The job leaves carrier ${carrier} at ${formatStop(rest.get(carrier)!)} after pass ${pass.index + 1}; it must end parked at its home stop ${formatStop(home[carrier])}, where the next job expects it.`,
      pass, pass.source.footer)
  }

  for (const [rule, count] of omitted) {
    diagnostics.push({
      severity: 'error',
      class: 'machine-safety',
      rule,
      // Stryker disable next-line StringLiteral: Diagnostic prose only; the rule, occurrence count and totals remain mutation-tested.
      message: `Machine-safety findings for ${rule} were truncated after ${MAX_MACHINE_SAFETY_DIAGNOSTIC_DETAILS} detailed findings; omitted ${count} more.`,
      passIndex: null,
      sourceSpan: null,
      line: null,
      column: null,
      endLine: null,
      endColumn: null,
      occurrences: count,
    })
  }

  const errorCount = MACHINE_SAFETY_RULES_V1.reduce((total, rule) => total + counts[rule], 0)
  return {
    schemaVersion: 1,
    envelope: { id: envelope.id, version: envelope.version },
    ok: errorCount === 0,
    errorCount,
    counts,
    diagnostics,
  }
}
