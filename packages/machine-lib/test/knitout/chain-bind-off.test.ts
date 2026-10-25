import { describe, expect, it } from 'vitest'

import { DEFAULT_KEY_PALETTE, KEY_ID_KNIT_DEFAULT, type KnitlabChartState } from '../../src/colorwork/knitlab1-contract.js'
import { compileChartToKnitout } from '../../src/knitout/compile/from-chart.js'
import { writeKnitoutProgram } from '../../src/knitout/emitter.js'
import { KNITERATE_7GG_KCODE_PROFILE_V2 } from '../../src/knitout/kcode/machine-profile.js'
import { validateKCodeMachineSafetyV1 } from '../../src/knitout/kcode/machine-safety.js'
import { projectKCodeMachineTrace } from '../../src/knitout/kcode/machine-trace.js'
import { validateKCodeMachineTrace } from '../../src/knitout/kcode/machine-validator.js'
import { parseKCodeDocument } from '../../src/knitout/kcode/parser.js'
import { knitoutToKCodeWithTrace } from '../../src/knitout/kniterate/to-kcode.js'

const profile = KNITERATE_7GG_KCODE_PROFILE_V2

function chart(rows: number): KnitlabChartState {
  return {
    id: 'chain-bind-off',
    rows,
    cols: 6,
    orientation: 'bottom-up',
    name: 'Chain bind-off',
    displaySettings: { rowCountVisibility: 'right', colCountVisibility: 'bottom' },
    layers: [{ id: 'base', name: 'Base', isVisible: true, grid: {}, keyPlacements: [] }],
    activeLayerId: 'base',
  }
}

/** A plain swatch with a chain bind-off; an odd row count ends its yarn on the left. */
function bindOff(rows: number) {
  const compiled = compileChartToKnitout({
    chart: chart(rows),
    keyPalette: DEFAULT_KEY_PALETTE,
    yarnBindings: [{ keyId: KEY_ID_KNIT_DEFAULT, carrier: '3', name: 'merino' }],
    needleOffset: 100,
    wastePasses: 8,
    bindOff: 'machine-bindoff',
  })
  if (!compiled.ok || !compiled.program) throw new Error('the swatch did not compile')
  const converted = knitoutToKCodeWithTrace(writeKnitoutProgram(compiled.program), 'chain-bind-off.k')
  if (!converted.ok) throw new Error(converted.error)
  const parsed = parseKCodeDocument(converted.kcode, { profile, dialect: 'knitout-vendor', strict: true })
  expect(parsed.ok).toBe(true)
  const trace = projectKCodeMachineTrace(parsed.document, profile)
  const footers = converted.kcode.split('\n').filter((line) => line.startsWith('>>') || line.startsWith('<<'))
  const first = footers.findIndex((line) => / Tr-R/.test(line))
  return {
    validation: validateKCodeMachineTrace(trace, profile),
    safety: validateKCodeMachineSafetyV1(trace, profile),
    // The last knit before the chain and its first transfer.
    start: footers.slice(first - 1, first + 1),
  }
}

describe('chain bind-off', () => {
  it('starts on the side its yarn ended and walks away from it, never dragging the yarn across', () => {
    const left = bindOff(5)
    expect(left.validation.ok).toBe(true)
    expect(left.safety.diagnostics).toEqual([])
    expect(left.start).toEqual(['<< Kn-Kn 3 300 200', '>> Tr-Rr 0 120 0'])
    const right = bindOff(4)
    expect(right.validation.ok).toBe(true)
    expect(right.safety.diagnostics).toEqual([])
    expect(right.start).toEqual(['>> Kn-Kn 3 300 200', '<< Tr-Rl 0 120 0'])
  })
})
