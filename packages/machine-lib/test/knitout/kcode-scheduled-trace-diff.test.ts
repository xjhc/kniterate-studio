import { describe, expect, it } from 'vitest'

import { KNITERATE_7GG_KCODE_PROFILE_V1 } from '../../src/knitout/kcode/machine-profile.js'
import { projectKCodeMachineTrace } from '../../src/knitout/kcode/machine-trace.js'
import { parseKCodeDocument } from '../../src/knitout/kcode/parser.js'
import { compareScheduledPassesToMachineTrace } from '../../src/knitout/kcode/scheduled-trace-diff.js'
import { knitoutToKCodeWithTrace } from '../../src/knitout/kniterate/to-kcode.js'

const SOURCE = [
  ';!knitout-2',
  ';;Machine: kniterate',
  ';;Carriers: 1 2 3 4 5 6',
  'x-stitch-number 6',
  'x-speed-number 300',
  'x-roller-advance 450',
  'in 2',
  'tuck + f40 2',
  'knit - f40 2',
  'xfer f40 b40',
  'out 2',
  '',
].join('\n')

function compileTrace() {
  const compiled = knitoutToKCodeWithTrace(SOURCE, 'scheduled-trace-diff.k')
  if (!compiled.ok) throw new Error(compiled.error)
  const parsed = parseKCodeDocument(compiled.kcode, {
    profile: KNITERATE_7GG_KCODE_PROFILE_V1,
    dialect: 'knitout-vendor',
    strict: true,
  })
  if (!parsed.ok) throw new Error(parsed.diagnostics.map((item) => item.message).join('\n'))
  return {
    compiled,
    trace: projectKCodeMachineTrace(parsed.document, KNITERATE_7GG_KCODE_PROFILE_V1),
  }
}

describe('scheduled backend to MachineTrace differential', () => {
  it('matches every serialized and scheduled field', () => {
    const { compiled, trace } = compileTrace()
    expect(compareScheduledPassesToMachineTrace(compiled.scheduledPasses, trace)).toMatchObject({
      ok: true,
      scheduledPassCount: trace.passes.length,
      tracePassCount: trace.passes.length,
      mismatches: [],
    })
  })

  it('reports a structured mismatch without consulting source provenance', () => {
    const { compiled, trace } = compileTrace()
    const first = compiled.scheduledPasses[0]!
    expect(compareScheduledPassesToMachineTrace([
      { ...first, sourceLines: [999] },
      ...compiled.scheduledPasses.slice(1),
    ], trace).ok).toBe(true)
    const forged = [
      { ...first, speed: first.speed + 1, sourceLines: [999] },
      ...compiled.scheduledPasses.slice(1),
    ]
    const comparison = compareScheduledPassesToMachineTrace(forged, trace)
    expect(comparison.ok).toBe(false)
    expect(comparison.mismatches.map((item) => item.field)).toEqual(['footer', 'speed'])
    expect(comparison.mismatches[1]).toMatchObject({ passIndex: 0, field: 'speed' })
  })
})
