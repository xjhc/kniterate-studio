import type { KCodeMachineProfileV1 } from './machine-profile.js'
import type {
  MachineTraceSelectionV1,
  MachineTraceV1,
} from './machine-trace.js'
import type { KCodeSourceSpan } from './types.js'

/**
 * Knitter-facing advisories over an exact strict-KCode trace.
 *
 * These mirror the float-distance and bed-range checks in the official
 * Kniterate editor, recomputed from encoded KCode alone. They are advisories,
 * not validator rules: neither establishes a physical failure, and KCode does
 * not encode carrier in/out, so a carrier resting between uses is
 * indistinguishable from a float.
 */
export type MachineTraceAdvisoryRuleV1 =
  | 'machine-advisory.float-distance'
  | 'machine-advisory.facing-needle-outside-domain'

export const MACHINE_TRACE_ADVISORY_RULES_V1: readonly MachineTraceAdvisoryRuleV1[] = [
  'machine-advisory.float-distance',
  'machine-advisory.facing-needle-outside-domain',
]

/** Official editor default for its float-distance warning. */
export const DEFAULT_MAX_FLOAT_DISTANCE_V1 = 7

const MAX_ADVISORY_DETAILS_PER_RULE_V1 = 256

export interface MachineTraceAdvisoryV1 {
  readonly rule: MachineTraceAdvisoryRuleV1
  readonly passIndex: number
  /** Float distance only: the pass that formed the carrier's previous loop, where the float starts. */
  readonly fromPassIndex?: number
  /** Float distance only: the floating carrier and the distance in needles. */
  readonly carrier?: string
  readonly distance?: number
  readonly actionIndex: number
  readonly sourceSpan: KCodeSourceSpan
  readonly message: string
}

export interface MachineTraceAdvisoryReportV1 {
  readonly schemaVersion: 1
  readonly maxFloatDistance: number
  /** Every finding, including those without a retained detail. */
  readonly counts: Readonly<Record<MachineTraceAdvisoryRuleV1, number>>
  /** At most 256 details per rule, in trace order. */
  readonly advisories: readonly MachineTraceAdvisoryV1[]
}

export interface DeriveMachineTraceAdvisoriesOptionsV1 {
  readonly maxFloatDistance?: number
}

interface LastLoop {
  readonly passIndex: number
  readonly at: Pick<MachineTraceSelectionV1, 'bed' | 'traceCoordinate'>
}

/** Position in the front-bed frame: rear column `r` faces front `r + rack`. */
function frontFramePosition(selection: LastLoop['at'], rack: number): number {
  return selection.traceCoordinate + (selection.bed === 'rear' ? rack : 0)
}

function formatDistance(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1)
}

export function deriveMachineTraceAdvisoriesV1(
  trace: Pick<MachineTraceV1, 'passes'>,
  profile: Pick<KCodeMachineProfileV1, 'raster'>,
  options: DeriveMachineTraceAdvisoriesOptionsV1 = {},
): MachineTraceAdvisoryReportV1 {
  const maxFloatDistance = options.maxFloatDistance ?? DEFAULT_MAX_FLOAT_DISTANCE_V1
  if (!Number.isFinite(maxFloatDistance) || maxFloatDistance < 0) {
    throw new RangeError('Maximum float distance must be a finite non-negative number.')
  }
  const { min, max } = profile.raster.kcodeColumnRange
  const counts: Record<MachineTraceAdvisoryRuleV1, number> = {
    'machine-advisory.float-distance': 0,
    'machine-advisory.facing-needle-outside-domain': 0,
  }
  const advisories: MachineTraceAdvisoryV1[] = []
  const record = (advisory: MachineTraceAdvisoryV1): void => {
    counts[advisory.rule] += 1
    if (counts[advisory.rule] <= MAX_ADVISORY_DETAILS_PER_RULE_V1) advisories.push(advisory)
  }
  const lastLoopByCarrier = new Map<string, LastLoop>()

  for (const pass of trace.passes) {
    for (const [actionIndex, action] of pass.actions.entries()) {
      // A held rear loop moves with the bed, not with the rack value at which
      // it was formed. Keep its bed coordinate and follow exact loop moves.
      if (action.kind === 'xfer' || action.kind === 'split') {
        for (const [carrier, previous] of lastLoopByCarrier) {
          if (previous.at.bed === action.source.bed && previous.at.traceCoordinate === action.source.traceCoordinate) {
            lastLoopByCarrier.set(carrier, { ...previous, at: action.target })
          }
        }
      } else if (action.kind === 'drop') {
        for (const [carrier, previous] of lastLoopByCarrier) {
          if (previous.at.bed === action.at.bed && previous.at.traceCoordinate === action.at.traceCoordinate) {
            lastLoopByCarrier.delete(carrier)
          }
        }
      } else if (action.kind === 'unknown') {
        // Unknown loop effects cannot support a later distance claim.
        lastLoopByCarrier.clear()
      }
      if (action.kind === 'knit' || action.kind === 'tuck' || action.kind === 'drop') {
        const { at } = action
        const facing = at.bed === 'front'
          ? at.kcodeColumn - pass.rack
          : at.kcodeColumn + pass.rack
        if (facing < min || facing > max) {
          record({
            rule: 'machine-advisory.facing-needle-outside-domain',
            passIndex: pass.index,
            actionIndex,
            sourceSpan: at.sourceSpan,
            message: `Pass ${pass.index + 1} ${action.kind}s ${at.bed} KCode column ${at.kcodeColumn} at rack ${pass.rack}; the facing ${at.bed === 'front' ? 'rear' : 'front'} position ${formatDistance(facing)} is outside KCode columns ${min}..${max}.`,
          })
        }
      }

      const formed = action.kind === 'knit' || action.kind === 'tuck'
        ? action.at
        : action.kind === 'split' ? action.source : null
      if (formed === null) continue
      const position = frontFramePosition(formed, pass.rack)
      const previous = lastLoopByCarrier.get(pass.carrier)
      lastLoopByCarrier.set(pass.carrier, { passIndex: pass.index, at: formed })
      if (previous === undefined) continue
      const distance = Math.abs(position - frontFramePosition(previous.at, pass.rack))
      if (distance <= maxFloatDistance) continue
      const gap = pass.index - previous.passIndex
      record({
        rule: 'machine-advisory.float-distance',
        passIndex: pass.index,
        fromPassIndex: previous.passIndex,
        carrier: pass.carrier,
        distance,
        actionIndex,
        sourceSpan: formed.sourceSpan,
        message: gap === 0
          ? `Carrier ${pass.carrier} floats ${formatDistance(distance)} needles between consecutive stitches in pass ${pass.index + 1} (maximum ${maxFloatDistance}).`
          : `Carrier ${pass.carrier} floats ${formatDistance(distance)} needles from its last stitch in pass ${previous.passIndex + 1} to pass ${pass.index + 1}, ${gap} pass${gap === 1 ? '' : 'es'} later (maximum ${maxFloatDistance}). KCode does not encode carrier in/out, so a long gap may be a parked or cut yarn rather than a float.`,
      })
    }
  }

  return { schemaVersion: 1, maxFloatDistance, counts, advisories }
}
