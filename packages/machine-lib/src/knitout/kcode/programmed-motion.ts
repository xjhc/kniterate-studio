import type { MachineTraceV1 } from './machine-trace.js'

export const PROGRAMMED_MOTION_DISTANCE_ASSUMPTION_V1 =
  'one-stop-coordinate-unit-equals-one-needle-pitch' as const
export const PROGRAMMED_MOTION_SPEED_ASSUMPTION_V1 =
  'encoded-footer-speed-is-constant-mm-per-second' as const
export const PROGRAMMED_MOTION_CLAIM_BOUNDARY_V1 =
  'assumption-derived-not-physical-duration-or-lower-bound' as const

export interface MachineTraceProgrammedMotionV1 {
  readonly schemaVersion: 1
  readonly coordinateMetric: {
    readonly programmedTravelUnits: number
    readonly unit: 'encoded-stop-coordinate-unit'
    readonly provenance: 'exact-machine-trace'
  }
  readonly assumptionModel: {
    readonly status: 'available' | 'unavailable'
    readonly assumedPitchMmPerCoordinateUnit: number
    readonly assumedTravelMm: number
    readonly idealizedSeconds: number | null
    readonly unavailableReason: null | {
      readonly code: 'nonpositive-speed' | 'nonfinite-speed' | 'nonfinite-derived-seconds'
      readonly firstPassIndex: number
      readonly offendingPassCount: number
    }
    readonly assumptions: {
      readonly distance: typeof PROGRAMMED_MOTION_DISTANCE_ASSUMPTION_V1
      readonly speed: typeof PROGRAMMED_MOTION_SPEED_ASSUMPTION_V1
      readonly claimBoundary: typeof PROGRAMMED_MOTION_CLAIM_BOUNDARY_V1
    }
  }
}

export interface DeriveMachineTraceProgrammedMotionOptionsV1 {
  /** Explicit assumption only. Official needle pitch does not prove this scale. */
  readonly assumedPitchMmPerCoordinateUnit: number
}

function stableDerivedNumber(value: number): number {
  return Number(value.toPrecision(12))
}

export function deriveMachineTraceProgrammedMotionV1(
  trace: Pick<MachineTraceV1, 'passes'>,
  options: DeriveMachineTraceProgrammedMotionOptionsV1,
): MachineTraceProgrammedMotionV1 {
  const pitch = options.assumedPitchMmPerCoordinateUnit
  if (!Number.isFinite(pitch) || pitch <= 0) {
    throw new RangeError('Assumed motion pitch must be a finite positive number of millimetres per coordinate unit.')
  }

  let programmedTravelUnits = 0
  let idealizedSeconds = 0
  let firstOffendingPassIndex = -1
  let offendingPassCount = 0
  let unavailableCode: 'nonpositive-speed' | 'nonfinite-speed' | 'nonfinite-derived-seconds' | null = null

  for (const pass of trace.passes) {
    const travelUnits = Math.abs(pass.carriageStops.right - pass.carriageStops.left)
    if (!Number.isFinite(travelUnits)) {
      throw new RangeError(`Pass ${pass.index} has non-finite encoded carriage stops.`)
    }
    programmedTravelUnits += travelUnits
    if (travelUnits === 0) continue

    if (!Number.isFinite(pass.speed)) {
      if (firstOffendingPassIndex < 0) firstOffendingPassIndex = pass.index
      offendingPassCount += 1
      unavailableCode ??= 'nonfinite-speed'
      continue
    }
    if (pass.speed <= 0) {
      if (firstOffendingPassIndex < 0) firstOffendingPassIndex = pass.index
      offendingPassCount += 1
      unavailableCode ??= 'nonpositive-speed'
      continue
    }
    const passSeconds = travelUnits * pitch / pass.speed
    if (!Number.isFinite(passSeconds) || !Number.isFinite(idealizedSeconds + passSeconds)) {
      if (firstOffendingPassIndex < 0) firstOffendingPassIndex = pass.index
      offendingPassCount += 1
      unavailableCode ??= 'nonfinite-derived-seconds'
      continue
    }
    idealizedSeconds += passSeconds
  }

  const assumedTravelMm = programmedTravelUnits * pitch
  if (!Number.isFinite(programmedTravelUnits) || !Number.isFinite(assumedTravelMm)) {
    throw new RangeError('Programmed motion distance exceeds the finite model range.')
  }

  const unavailableReason = unavailableCode === null ? null : {
    code: unavailableCode,
    firstPassIndex: firstOffendingPassIndex,
    offendingPassCount,
  }
  return {
    schemaVersion: 1,
    coordinateMetric: {
      programmedTravelUnits,
      unit: 'encoded-stop-coordinate-unit',
      provenance: 'exact-machine-trace',
    },
    assumptionModel: {
      status: unavailableReason === null ? 'available' : 'unavailable',
      assumedPitchMmPerCoordinateUnit: pitch,
      assumedTravelMm: stableDerivedNumber(assumedTravelMm),
      idealizedSeconds: unavailableReason === null ? stableDerivedNumber(idealizedSeconds) : null,
      unavailableReason,
      assumptions: {
        distance: PROGRAMMED_MOTION_DISTANCE_ASSUMPTION_V1,
        speed: PROGRAMMED_MOTION_SPEED_ASSUMPTION_V1,
        claimBoundary: PROGRAMMED_MOTION_CLAIM_BOUNDARY_V1,
      },
    },
  }
}
