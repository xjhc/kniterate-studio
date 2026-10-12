import { describe, expect, it } from 'vitest'

import { KNITERATE_7GG_KCODE_PROFILE_V2 } from '../../src/knitout/kcode/machine-profile.js'
import { projectKCodeMachineTrace } from '../../src/knitout/kcode/machine-trace.js'
import {
  isLoopFormingMachineTracePassV1,
  summarizeMachineTracePassMetricsV1,
} from '../../src/knitout/kcode/pass-metrics.js'
import { parseKCodeDocument } from '../../src/knitout/kcode/parser.js'
import { knitoutToKCodeWithTrace } from '../../src/knitout/kniterate/to-kcode.js'

const semanticActions = [
  ';!knitout-2',
  ';;Machine: kniterate',
  ';;Carriers: 1 2 3 4 5 6',
  'x-stitch-number 6',
  'x-speed-number 300',
  'x-roller-advance 450',
  'in 2',
  'tuck + f40 2',
  'knit - f40 2',
  'split + f40 b40 2',
  'drop f40',
  'out 2',
  '',
].join('\n')

function semanticTrace() {
  const converted = knitoutToKCodeWithTrace(semanticActions, 'pass-metrics.k')
  if (!converted.ok) throw new Error(converted.error)
  const parsed = parseKCodeDocument(converted.kcode, {
    profile: KNITERATE_7GG_KCODE_PROFILE_V2,
    dialect: 'knitout-vendor',
    strict: true,
  })
  expect(parsed.ok).toBe(true)
  return projectKCodeMachineTrace(parsed.document, KNITERATE_7GG_KCODE_PROFILE_V2)
}

describe('strict KCode pass metrics', () => {
  it('counts knit, tuck, and split passes while excluding drop and repositioning passes', () => {
    const trace = semanticTrace()
    const passWith = (kind: 'knit' | 'tuck' | 'split' | 'drop' | 'move') =>
      trace.passes.find((pass) => pass.actions.some((action) => action.kind === kind))!

    expect(isLoopFormingMachineTracePassV1(passWith('knit'))).toBe(true)
    expect(isLoopFormingMachineTracePassV1(passWith('tuck'))).toBe(true)
    expect(isLoopFormingMachineTracePassV1(passWith('split'))).toBe(true)
    expect(isLoopFormingMachineTracePassV1(passWith('drop'))).toBe(false)
    expect(isLoopFormingMachineTracePassV1(passWith('move'))).toBe(false)

    expect(summarizeMachineTracePassMetricsV1(trace)).toEqual({
      schemaVersion: 1,
      programmedPassCount: trace.passes.length,
      loopFormingPassCount: 3,
    })
  })
})
