import { describe, expect, it } from 'vitest'

import { KNITERATE_7GG_KCODE_PROFILE_V2 } from '../../src/knitout/kcode/machine-profile.js'
import { projectKCodeMachineTrace, type MachineTracePassV1 } from '../../src/knitout/kcode/machine-trace.js'
import { deriveMachineTraceProgrammedMotionV1 } from '../../src/knitout/kcode/programmed-motion.js'
import { parseKCodeDocument } from '../../src/knitout/kcode/parser.js'
import { knitoutToKCodeWithTrace } from '../../src/knitout/kniterate/to-kcode.js'

const seedKnitout = [
  ';!knitout-2',
  ';;Machine: kniterate',
  ';;Carriers: 1 2 3 4 5 6',
  'x-speed-number 300',
  'in 2',
  'knit + f40 2',
  'out 2',
  '',
].join('\n')

function seedPass(): MachineTracePassV1 {
  const converted = knitoutToKCodeWithTrace(seedKnitout, 'motion.k')
  if (!converted.ok) throw new Error(converted.error)
  const parsed = parseKCodeDocument(converted.kcode, {
    profile: KNITERATE_7GG_KCODE_PROFILE_V2,
    dialect: 'knitout-vendor',
    strict: true,
  })
  if (!parsed.ok) throw new Error(parsed.diagnostics.map((item) => item.message).join('\n'))
  return projectKCodeMachineTrace(parsed.document, KNITERATE_7GG_KCODE_PROFILE_V2).passes[0]!
}

function pass(
  base: MachineTracePassV1,
  index: number,
  left: number,
  right: number,
  speed: number,
): MachineTracePassV1 {
  return {
    ...base,
    index,
    carriageStops: { left, right },
    speed,
    speedRaw: String(speed),
  }
}

describe('trace-derived programmed motion', () => {
  it('keeps exact stop-coordinate travel beside a per-pass assumption model', () => {
    const base = seedPass()
    const model = deriveMachineTraceProgrammedMotionV1({
      passes: [pass(base, 0, 0, 10, 100), pass(base, 1, -2, 3, 50)],
    }, { assumedPitchMmPerCoordinateUnit: 3.63 })

    expect(model.coordinateMetric).toEqual({
      programmedTravelUnits: 15,
      unit: 'encoded-stop-coordinate-unit',
      provenance: 'exact-machine-trace',
    })
    expect(model.assumptionModel).toMatchObject({
      status: 'available',
      assumedPitchMmPerCoordinateUnit: 3.63,
      assumedTravelMm: 54.45,
      idealizedSeconds: 0.726,
      unavailableReason: null,
      assumptions: {
        distance: 'one-stop-coordinate-unit-equals-one-needle-pitch',
        speed: 'encoded-footer-speed-is-constant-mm-per-second',
        claimBoundary: 'assumption-derived-not-physical-duration-or-lower-bound',
      },
    })
  })

  it('fails the time term closed for a nonpositive speed on a contributing pass', () => {
    const base = seedPass()
    const model = deriveMachineTraceProgrammedMotionV1({
      passes: [
        pass(base, 0, 0, 10, 100),
        pass(base, 1, 0, 5, 0),
        pass(base, 2, 4, 4, -10),
      ],
    }, { assumedPitchMmPerCoordinateUnit: 3.63 })

    expect(model.coordinateMetric.programmedTravelUnits).toBe(15)
    expect(model.assumptionModel).toMatchObject({
      status: 'unavailable',
      assumedTravelMm: 54.45,
      idealizedSeconds: null,
      unavailableReason: {
        code: 'nonpositive-speed',
        firstPassIndex: 1,
        offendingPassCount: 1,
      },
    })
  })

  it('rejects invalid assumptions and refuses non-finite derived time', () => {
    const base = seedPass()
    expect(() => deriveMachineTraceProgrammedMotionV1({ passes: [base] }, {
      assumedPitchMmPerCoordinateUnit: 0,
    })).toThrow(/finite positive/)

    const model = deriveMachineTraceProgrammedMotionV1({
      passes: [pass(base, 4, 0, 10, Number.NaN)],
    }, { assumedPitchMmPerCoordinateUnit: 3.63 })
    expect(model.assumptionModel).toMatchObject({
      status: 'unavailable',
      idealizedSeconds: null,
      unavailableReason: { code: 'nonfinite-speed', firstPassIndex: 4 },
    })
  })
})
