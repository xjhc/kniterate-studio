import type { MachineTraceActionV1, MachineTracePassV1, MachineTraceV1 } from './machine-trace.js'

/**
 * Pass-by-pass stitch comparison of two strict-KCode traces.
 *
 * Footer-level parity (direction, operation, carrier, speed, roller) says
 * nothing about which needles a pass selects. This compares, for each pass
 * index, the exact multiset of knit/tuck/drop/transfer/split actions after
 * aligning both programs by a single needle offset (the best within
 * `maxOffset` of their leftmost knit coordinates). Carrier moves compare as
 * `move`. Traces of different length compare over the shorter prefix and
 * report the length difference.
 */
export interface TraceStitchDiffV1 {
  readonly expectedPasses: number
  readonly actualPasses: number
  readonly comparedPasses: number
  readonly identicalPasses: number
  /** Coordinate shift applied to `actual` (actual + offset ≈ expected). */
  readonly offset: number
  readonly differingPassIndices: readonly number[]
}

function actionSignature(action: MachineTraceActionV1, origin: number): string {
  switch (action.kind) {
    case 'knit':
    case 'tuck':
    case 'drop':
      return `${action.kind}:${action.at.bed}:${action.at.traceCoordinate - origin}`
    case 'xfer':
    case 'split':
      return `${action.kind}:${action.source.bed}:${action.source.traceCoordinate - origin}>${action.target.bed}:${action.target.traceCoordinate - origin}`
    case 'move':
      return 'move'
    case 'unknown':
      return `unknown:${action.operation}`
  }
}

/** Order-insensitive stitch signature of one pass relative to `origin`. */
export function passStitchSignatureV1(pass: Pick<MachineTracePassV1, 'actions'>, origin: number): string {
  return pass.actions.map((action) => actionSignature(action, origin)).sort().join(' ')
}

function leftmostKnitCoordinate(trace: Pick<MachineTraceV1, 'passes'>): number {
  let min = Number.POSITIVE_INFINITY
  for (const pass of trace.passes) {
    for (const action of pass.actions) {
      if (action.kind === 'knit' && action.at.traceCoordinate < min) min = action.at.traceCoordinate
    }
  }
  return Number.isFinite(min) ? min : 0
}

export function diffTraceStitchesV1(
  expected: Pick<MachineTraceV1, 'passes'>,
  actual: Pick<MachineTraceV1, 'passes'>,
  maxOffset = 4,
): TraceStitchDiffV1 {
  const expectedOrigin = leftmostKnitCoordinate(expected)
  const actualOrigin = leftmostKnitCoordinate(actual)
  const compared = Math.min(expected.passes.length, actual.passes.length)
  const expectedSignatures = expected.passes.slice(0, compared).map((pass) => passStitchSignatureV1(pass, expectedOrigin))
  let best: { offset: number, differing: number[] } | null = null
  for (let offset = -maxOffset; offset <= maxOffset; offset += 1) {
    const differing: number[] = []
    for (let index = 0; index < compared; index += 1) {
      if (passStitchSignatureV1(actual.passes[index]!, actualOrigin + offset) !== expectedSignatures[index]) differing.push(index)
    }
    if (best === null || differing.length < best.differing.length) best = { offset, differing }
  }
  return {
    expectedPasses: expected.passes.length,
    actualPasses: actual.passes.length,
    comparedPasses: compared,
    identicalPasses: compared - best!.differing.length,
    offset: best!.offset,
    differingPassIndices: best!.differing,
  }
}
