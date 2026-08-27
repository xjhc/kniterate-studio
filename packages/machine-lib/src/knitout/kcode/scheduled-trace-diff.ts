import type { VendorScheduledPass } from '../kniterate/vendor-pass-contract.js'
import type { MachineTracePassV1, MachineTraceV1 } from './machine-trace.js'

export interface ScheduledTraceMismatchV1 {
  readonly passIndex: number | null
  readonly field: string
  readonly expected: unknown
  readonly actual: unknown
  readonly message: string
}

export interface ScheduledTraceComparisonV1 {
  readonly schemaVersion: 1
  readonly ok: boolean
  readonly scheduledPassCount: number
  readonly tracePassCount: number
  readonly mismatches: readonly ScheduledTraceMismatchV1[]
}

function footer(pass: VendorScheduledPass): string {
  return `${pass.direction} ${pass.type} ${pass.carrier} ${pass.speed} ${pass.roller}`
}

/**
 * Compare every machine-executable field in the pinned backend's post-lowering
 * schedule with the independently parsed KCode MachineTrace. `sourceLines` and
 * `isAutoMove` are compiler side channels. `comment` is serialized as inert
 * KCode annotation, but MachineTrace intentionally does not treat prose as a
 * movement or machine-state field.
 */
export function compareScheduledPassesToMachineTrace(
  scheduledPasses: readonly VendorScheduledPass[],
  trace: MachineTraceV1,
): ScheduledTraceComparisonV1 {
  const mismatches: ScheduledTraceMismatchV1[] = []
  const add = (
    passIndex: number | null,
    field: string,
    expected: unknown,
    actual: unknown,
  ): void => {
    if (Object.is(expected, actual)) return
    mismatches.push({
      passIndex,
      field,
      expected,
      actual,
      message: passIndex === null
        ? `${field}: scheduled ${String(expected)}, parsed ${String(actual)}.`
        : `Pass ${passIndex + 1} ${field}: scheduled ${String(expected)}, parsed ${String(actual)}.`,
    })
  }

  add(null, 'pass count', scheduledPasses.length, trace.passes.length)
  const shared = Math.min(scheduledPasses.length, trace.passes.length)
  for (const [index, expected] of scheduledPasses.slice(0, shared).entries()) {
    const actual = trace.passes[index]!
    comparePass(index, expected, actual, add)
  }

  return {
    schemaVersion: 1,
    ok: mismatches.length === 0,
    scheduledPassCount: scheduledPasses.length,
    tracePassCount: trace.passes.length,
    mismatches,
  }
}

function comparePass(
  passIndex: number,
  expected: VendorScheduledPass,
  actual: MachineTracePassV1,
  add: (
    passIndex: number,
    field: string,
    expected: unknown,
    actual: unknown,
  ) => void,
): void {
  add(passIndex, 'index', expected.index, actual.index)
  add(passIndex, 'FRNT', expected.FRNT, actual.raw.FRNT)
  add(passIndex, 'STIF', expected.STIF, actual.raw.STIF)
  add(passIndex, 'REAR', expected.REAR, actual.raw.REAR)
  add(passIndex, 'STIR', expected.STIR, actual.raw.STIR)
  add(passIndex, 'footer', footer(expected), actual.raw.footer)
  add(passIndex, 'rack', expected.RACK, actual.rack)
  add(passIndex, 'direction', expected.direction, actual.direction)
  add(passIndex, 'operation', expected.type, actual.operation)
  add(passIndex, 'carrier', expected.carrier, actual.carrier)
  add(passIndex, 'speed', expected.speed, actual.speed)
  add(passIndex, 'roller', expected.roller, actual.roller)
  add(passIndex, 'carriage left stop', expected.carriageLeft, actual.carriageStops.left)
  add(passIndex, 'carriage right stop', expected.carriageRight, actual.carriageStops.right)
  add(passIndex, 'carrier left stop', expected.carrierLeft ?? null, actual.carrierStops?.left ?? null)
  add(passIndex, 'carrier right stop', expected.carrierRight ?? null, actual.carrierStops?.right ?? null)
}
