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

  it('reports every scheduled machine field and both pass-count boundaries exactly', () => {
    const { compiled, trace } = compileTrace()
    const actual = trace.passes[0]!
    const first = compiled.scheduledPasses[0]!
    const forged = {
      ...first,
      index: first.index + 1,
      FRNT: `${first.FRNT}.`,
      STIF: `${first.STIF}0`,
      REAR: `${first.REAR}.`,
      STIR: `${first.STIR}0`,
      RACK: first.RACK + 0.5,
      direction: first.direction === '>>' ? '<<' as const : '>>' as const,
      type: first.type === 'Kn-Kn' ? 'Tu-Tu' : 'Kn-Kn',
      carrier: first.carrier === '1' ? '2' : '1',
      speed: first.speed + 1,
      roller: first.roller + 1,
      carriageLeft: first.carriageLeft - 1,
      carriageRight: first.carriageRight + 1,
      carrierLeft: (first.carrierLeft ?? 0) - 1,
      carrierRight: (first.carrierRight ?? 0) + 1,
    }
    const singleTrace = { ...trace, passes: [actual] }
    const comparison = compareScheduledPassesToMachineTrace([forged], singleTrace)

    expect(comparison).toMatchObject({
      schemaVersion: 1,
      ok: false,
      scheduledPassCount: 1,
      tracePassCount: 1,
    })
    expect(comparison.mismatches.map(({ passIndex, field }) => ({ passIndex, field }))).toEqual([
      { passIndex: 0, field: 'index' },
      { passIndex: 0, field: 'FRNT' },
      { passIndex: 0, field: 'STIF' },
      { passIndex: 0, field: 'REAR' },
      { passIndex: 0, field: 'STIR' },
      { passIndex: 0, field: 'footer' },
      { passIndex: 0, field: 'rack' },
      { passIndex: 0, field: 'direction' },
      { passIndex: 0, field: 'operation' },
      { passIndex: 0, field: 'carrier' },
      { passIndex: 0, field: 'speed' },
      { passIndex: 0, field: 'roller' },
      { passIndex: 0, field: 'carriage left stop' },
      { passIndex: 0, field: 'carriage right stop' },
      { passIndex: 0, field: 'carrier left stop' },
      { passIndex: 0, field: 'carrier right stop' },
    ])
    expect(comparison.mismatches.every((mismatch) =>
      mismatch.message.startsWith(`Pass ${mismatch.passIndex! + 1} ${mismatch.field}: scheduled `)
      && mismatch.message.endsWith('.'))).toBe(true)

    expect(compareScheduledPassesToMachineTrace([], singleTrace)).toEqual({
      schemaVersion: 1,
      ok: false,
      scheduledPassCount: 0,
      tracePassCount: 1,
      mismatches: [{
        passIndex: null,
        field: 'pass count',
        expected: 0,
        actual: 1,
        message: 'pass count: scheduled 0, parsed 1.',
      }],
    })
    expect(compareScheduledPassesToMachineTrace([forged], {
      ...singleTrace,
      passes: [],
    })).toEqual({
      schemaVersion: 1,
      ok: false,
      scheduledPassCount: 1,
      tracePassCount: 0,
      mismatches: [{
        passIndex: null,
        field: 'pass count',
        expected: 1,
        actual: 0,
        message: 'pass count: scheduled 1, parsed 0.',
      }],
    })
  })
})
