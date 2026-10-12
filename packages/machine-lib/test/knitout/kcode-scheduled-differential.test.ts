import { describe, expect, it } from 'vitest'

import {
  KNITERATE_7GG_KCODE_PROFILE_V2,
} from '../../src/knitout/kcode/machine-profile.js'
import { projectKCodeMachineTrace } from '../../src/knitout/kcode/machine-trace.js'
import { parseKCodeDocument } from '../../src/knitout/kcode/parser.js'
import { knitoutToKCodeWithTrace } from '../../src/knitout/kniterate/to-kcode.js'

const DIFFERENTIAL_SEED = 0x54524143 // ASCII "TRAC"
const CASES = 96
const STITCH_TOKENS = '0123456789ABCDEF'
const HALF_RACKS = [-2, -1.5, -1, -0.5, 0, 0.5, 1, 1.5, 2] as const
const XFER_RACKS = [-2, -1, 0, 1, 2] as const

function xorshift32(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state ^= state << 13
    state ^= state >>> 17
    state ^= state << 5
    return state >>> 0
  }
}

interface Probe {
  readonly source: string
  readonly carrier: string
  readonly needle: number
  readonly halfRack: number
  readonly xferRack: number
}

function buildProbe(caseIndex: number, random: () => number): Probe {
  const carrier = String(1 + random() % 6)
  const needle = -40 + random() % 151
  const companion = needle + 3 + random() % 6
  const halfRack = HALF_RACKS[random() % HALF_RACKS.length]!
  const xferRack = XFER_RACKS[random() % XFER_RACKS.length]!
  const xferTarget = needle - xferRack
  const speed = 60 + random() % 641
  const roller = random() % 601
  const stitch = STITCH_TOKENS[random() % STITCH_TOKENS.length]!
  const xferStitch = STITCH_TOKENS[random() % STITCH_TOKENS.length]!
  const carrierSpacing = [1, 1.5, 2, 2.5, 3][random() % 5]!
  const carrierDistance = [2, 2.5, 3, 4.5, 6][random() % 5]!
  const style = random() % 2 === 0 ? 'two-pass' : 'four-pass'
  const includePark = caseIndex % 3 === 0
  const includeMiss = caseIndex % 4 === 0

  const lines = [
    ';!knitout-2',
    ';;Machine: kniterate',
    ';;Carriers: 1 2 3 4 5 6',
    ';;Position: Center',
    `x-xfer-style ${style}`,
    `x-carrier-spacing ${carrierSpacing}`,
    `x-carrier-stopping-distance ${carrierDistance}`,
    `x-stitch-number ${stitch}`,
    `x-xfer-stitch-number ${xferStitch}`,
    `x-speed-number ${speed}`,
    `x-roller-advance ${roller}`,
    `in ${carrier}`,
    `tuck + f${needle} ${carrier}`,
    `knit - f${needle} ${carrier}`,
    // Repeated direction forces the backend's exact automatic move path.
    `x-presser-speed ${120 + random() % 281}`,
    `x-presser-roller ${random() % 201}`,
    `knit - f${companion} ${carrier}`,
    `rack ${halfRack}`,
    `knit + b${companion} ${carrier}`,
    `knit - b${companion} ${carrier}`,
    'rack 0',
    ...(includeMiss ? [`miss + f${needle} ${carrier}`] : []),
    ...(includePark ? ['x-park-carriage'] : []),
    `rack ${xferRack}`,
    `xfer f${needle} b${xferTarget}`,
    `xfer b${xferTarget} f${needle}`,
    'rack 0',
    `split + f${needle} b${needle} ${carrier}`,
    `drop b${needle}`,
    `knit - f${needle} ${carrier}`,
    `out ${carrier}`,
    '',
  ]

  return { source: lines.join('\n'), carrier, needle, halfRack, xferRack }
}

describe('seeded scheduled-pass differential rail', () => {
  it('matches all 96 varied backend schedules through strict parse and MachineTrace', () => {
    const random = xorshift32(DIFFERENTIAL_SEED)
    let comparedPasses = 0
    let autoMoves = 0
    let transferPasses = 0
    let splitPasses = 0
    let carrierlessDrops = 0
    const observedHalfRacks = new Set<number>()
    const observedXferRacks = new Set<number>()
    const observedCarriers = new Set<string>()

    for (let caseIndex = 0; caseIndex < CASES; caseIndex++) {
      const probe = buildProbe(caseIndex, random)
      const compiled = knitoutToKCodeWithTrace(
        probe.source,
        `scheduled-differential-${caseIndex}.k`,
      )
      expect(compiled.ok, `compile case ${caseIndex}: ${compiled.ok ? '' : compiled.error}`).toBe(true)
      if (!compiled.ok) continue

      const parsed = parseKCodeDocument(compiled.kcode, {
        profile: KNITERATE_7GG_KCODE_PROFILE_V2,
        dialect: 'knitout-vendor',
        strict: true,
      })
      expect(parsed.diagnostics, `parse case ${caseIndex}`).toEqual([])
      expect(parsed.ok, `parse case ${caseIndex}`).toBe(true)
      const trace = projectKCodeMachineTrace(
        parsed.document,
        KNITERATE_7GG_KCODE_PROFILE_V2,
      )

      expect(trace.passes, `pass count case ${caseIndex}`).toHaveLength(
        compiled.scheduledPasses.length,
      )
      for (const [passIndex, scheduled] of compiled.scheduledPasses.entries()) {
        const actual = trace.passes[passIndex]!
        const context = [
          `case ${caseIndex}`,
          `pass ${passIndex}`,
          `carrier ${probe.carrier}`,
          `needle ${probe.needle}`,
          `half rack ${probe.halfRack}`,
          `xfer rack ${probe.xferRack}`,
        ].join(', ')

        expect(actual.raw, `${context}: exact serialized fields`).toEqual({
          FRNT: scheduled.FRNT,
          STIF: scheduled.STIF,
          REAR: scheduled.REAR,
          STIR: scheduled.STIR,
          footer: `${scheduled.direction} ${scheduled.type} ${scheduled.carrier} ${scheduled.speed} ${scheduled.roller}`,
        })
        expect(actual.index, `${context}: index`).toBe(scheduled.index)
        expect(actual.rack, `${context}: rack`).toBe(scheduled.RACK)
        expect(actual.direction, `${context}: direction`).toBe(scheduled.direction)
        expect(actual.operation, `${context}: operation`).toBe(scheduled.type)
        expect(actual.carrier, `${context}: carrier`).toBe(scheduled.carrier)
        expect(actual.speed, `${context}: speed`).toBe(Number(scheduled.speed))
        expect(actual.roller, `${context}: roller`).toBe(Number(scheduled.roller))
        expect(actual.carriageStops, `${context}: carriage stops`).toEqual({
          left: scheduled.carriageLeft,
          right: scheduled.carriageRight,
        })
        expect(actual.carrierStops, `${context}: carrier stops`).toEqual(
          scheduled.carrierLeft === undefined || scheduled.carrierRight === undefined
            ? null
            : { left: scheduled.carrierLeft, right: scheduled.carrierRight },
        )
        comparedPasses++
        if (scheduled.isAutoMove) autoMoves++
        if (/^(?:Tr-R[lr]|R[lr]-Tr)$/.test(scheduled.type)) {
          if (scheduled.carrier === '0') transferPasses++
          else splitPasses++
        }
        if (
          scheduled.carrier === '0'
          && scheduled.type === 'Kn-Kn'
          && (scheduled.FRNT.includes('-') || scheduled.REAR.includes('-'))
        ) {
          carrierlessDrops++
        }
      }

      observedHalfRacks.add(probe.halfRack)
      observedXferRacks.add(probe.xferRack)
      observedCarriers.add(probe.carrier)
    }

    expect(comparedPasses).toBeGreaterThan(1_000)
    expect(autoMoves).toBeGreaterThan(CASES)
    expect(transferPasses).toBeGreaterThanOrEqual(CASES * 2)
    expect(splitPasses).toBeGreaterThan(0)
    expect(carrierlessDrops).toBeGreaterThan(0)
    expect(observedHalfRacks).toEqual(new Set(HALF_RACKS))
    expect(observedXferRacks).toEqual(new Set(XFER_RACKS))
    expect(observedCarriers).toEqual(new Set(['1', '2', '3', '4', '5', '6']))
  }, 30_000)
})
