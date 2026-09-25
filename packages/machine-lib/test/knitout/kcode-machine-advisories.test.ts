import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

import {
  DEFAULT_MAX_FLOAT_DISTANCE_V1,
  deriveMachineTraceAdvisoriesV1,
} from '../../src/knitout/kcode/machine-advisories.js'
import { KNITERATE_7GG_KCODE_PROFILE_V2 } from '../../src/knitout/kcode/machine-profile.js'
import { projectKCodeMachineTrace } from '../../src/knitout/kcode/machine-trace.js'
import {
  MACHINE_TRACE_PASS_ROLES_V1,
  classifyMachineTracePassRoleV1,
  summarizeMachineTracePassRolesV1,
} from '../../src/knitout/kcode/pass-metrics.js'
import { parseKCodeDocument } from '../../src/knitout/kcode/parser.js'
import { knitoutToKCodeWithTrace } from '../../src/knitout/kniterate/to-kcode.js'

const profile = KNITERATE_7GG_KCODE_PROFILE_V2

function traceFor(body: readonly string[], position?: 'Keep') {
  const source = [
    ';!knitout-2',
    ';;Machine: kniterate',
    ';;Carriers: 1 2 3 4 5 6',
    ...(position === undefined ? [] : [`;;Position: ${position}`]),
    'x-stitch-number 6',
    'x-speed-number 300',
    'x-roller-advance 450',
    ...body,
    '',
  ].join('\n')
  const converted = knitoutToKCodeWithTrace(source, 'advisories.k')
  if (!converted.ok) throw new Error(converted.error)
  const parsed = parseKCodeDocument(converted.kcode, { profile, dialect: 'knitout-vendor', strict: true })
  expect(parsed.ok).toBe(true)
  return projectKCodeMachineTrace(parsed.document, profile)
}

const referenceTraces = new Map<string, ReturnType<typeof projectKCodeMachineTrace>>()

function traceForReference(name: string) {
  const cached = referenceTraces.get(name)
  if (cached !== undefined) return cached
  const bytes = readFileSync(resolve(__dirname, '../../reference', name), 'latin1')
  const parsed = parseKCodeDocument(bytes, { profile, dialect: 'knitout-vendor', strict: true })
  expect(parsed.ok).toBe(true)
  const trace = projectKCodeMachineTrace(parsed.document, profile)
  referenceTraces.set(name, trace)
  return trace
}

describe('strict KCode pass roles', () => {
  it('names loop-forming, transfer, drop, carrier-only, and carriage-only passes', () => {
    const trace = traceFor([
      'in 2',
      'knit + f40 2',
      'miss - f30 2',
      'knit - f60 2',
      'xfer f60 b60',
      'drop b60',
      'out 2',
    ])
    const roles = trace.passes.map(classifyMachineTracePassRoleV1)
    expect(roles).toContain('loop-forming')
    expect(roles).toContain('transfer')
    expect(roles).toContain('drop')
    expect(roles).toContain('carrier-move')
    for (const [index, pass] of trace.passes.entries()) {
      if (roles[index] === 'carrier-move') {
        expect(pass.carrier).not.toBe('0')
        expect(pass.actions.every((action) => action.kind === 'move')).toBe(true)
      }
    }
    expect(classifyMachineTracePassRoleV1({ carrier: '0', actions: [{ kind: 'move', carrier: '0' }] }))
      .toBe('carriage-move')
    expect(classifyMachineTracePassRoleV1({
      carrier: '0',
      actions: [{ kind: 'unknown', operation: 'Xx-Xx', reason: 'unsupported-operation', selections: [] }],
    })).toBe('unclassified')
  })

  it('classifies every pass in the reference corpus without an unclassified pass', () => {
    const names = readdirSync(resolve(__dirname, '../../reference')).filter((name) => name.endsWith('.kc'))
    expect(names).toHaveLength(13)
    for (const name of names) {
      const trace = traceForReference(name)
      const roles = summarizeMachineTracePassRolesV1(trace)
      expect(Object.keys(roles)).toEqual(MACHINE_TRACE_PASS_ROLES_V1)
      expect(Object.values(roles).reduce((sum, count) => sum + count, 0)).toBe(trace.passes.length)
      expect(roles.unclassified, name).toBe(0)
    }
    expect(summarizeMachineTracePassRolesV1(traceForReference('swatch.kc'))).toEqual({
      'loop-forming': 345,
      transfer: 2,
      drop: 2,
      'carrier-move': 7,
      'carriage-move': 8,
      unclassified: 0,
    })
  }, 30_000)
})

describe('strict KCode advisories', () => {
  it('reports within-pass and between-pass floats beyond the maximum', () => {
    const trace = traceFor(['in 2', 'knit + f40 2', 'knit + f50 2', 'knit - f52 2', 'out 2'])
    const report = deriveMachineTraceAdvisoriesV1(trace, profile)
    expect(report.maxFloatDistance).toBe(DEFAULT_MAX_FLOAT_DISTANCE_V1)
    expect(report.counts['machine-advisory.float-distance']).toBe(1)
    const [float] = report.advisories
    expect(float!.rule).toBe('machine-advisory.float-distance')
    expect(float!.message).toBe('Carrier 2 floats 10 needles between consecutive stitches in pass 1 (maximum 7).')
    expect(trace.passes[float!.passIndex]!.actions[float!.actionIndex]!.kind).toBe('knit')

    const between = deriveMachineTraceAdvisoriesV1(
      traceFor(['in 2', 'knit + f40 2', 'knit + f41 2', 'knit - f30 2', 'out 2']),
      profile,
    )
    expect(between.counts['machine-advisory.float-distance']).toBe(1)
    expect(between.advisories[0]!.message).toMatch(
      /^Carrier 2 floats 11 needles from its last stitch in pass 1 to pass \d+, \d+ pass(es)? later \(maximum 7\)\. KCode does not encode carrier in\/out/,
    )
  })

  it('treats the float maximum as inclusive and configurable', () => {
    const trace = traceFor(['in 2', 'knit + f40 2', 'knit + f47 2', 'knit + f60 2', 'out 2'])
    expect(deriveMachineTraceAdvisoriesV1(trace, profile).counts['machine-advisory.float-distance']).toBe(1)
    expect(deriveMachineTraceAdvisoriesV1(trace, profile, { maxFloatDistance: 13 }).counts['machine-advisory.float-distance']).toBe(0)
    expect(() => deriveMachineTraceAdvisoriesV1(trace, profile, { maxFloatDistance: -1 })).toThrow(RangeError)
  })

  it('reports a stitch whose facing needle falls outside the KCode column domain at the current rack', () => {
    const trace = traceFor(['in 2', 'knit + f1 2', 'knit + f2 2', 'rack 2', 'knit - f2 2', 'knit - f1 2', 'out 2'], 'Keep')
    const report = deriveMachineTraceAdvisoriesV1(trace, profile)
    expect(report.counts['machine-advisory.facing-needle-outside-domain']).toBe(2)
    expect(report.advisories.map((advisory) => advisory.message)).toEqual([
      'Pass 2 knits front KCode column 1 at rack 2; the facing rear position -1 is outside KCode columns 0..252.',
      'Pass 2 knits front KCode column 0 at rack 2; the facing rear position -2 is outside KCode columns 0..252.',
    ])
  })

  it('keeps the reference corpus float findings exact and bed-edge findings absent', () => {
    const floats: Record<string, number> = {}
    for (const name of readdirSync(resolve(__dirname, '../../reference')).filter((item) => item.endsWith('.kc'))) {
      const report = deriveMachineTraceAdvisoriesV1(traceForReference(name), profile)
      expect(report.counts['machine-advisory.facing-needle-outside-domain'], name).toBe(0)
      if (report.counts['machine-advisory.float-distance'] > 0) {
        floats[name] = report.counts['machine-advisory.float-distance']
      }
    }
    expect(floats).toEqual({
      '2x2-rib-beanie.kc': 5,
      'back.kc': 2,
      'front.kc': 2,
      'sophie_stripe.kc': 1,
    })
  }, 30_000)
})
