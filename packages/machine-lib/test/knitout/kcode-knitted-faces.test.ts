import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import {
  compareKnittedFaceRowsV1,
  projectKnittedFacesV1,
  recoverColorworkFromFrontFaceV1,
} from '../../src/knitout/kcode/knitted-faces.js'
import { KNITERATE_7GG_KCODE_PROFILE_V2 } from '../../src/knitout/kcode/machine-profile.js'
import { projectKCodeMachineTrace } from '../../src/knitout/kcode/machine-trace.js'
import { parseKCodeDocument } from '../../src/knitout/kcode/parser.js'
import { knitoutToKCodeWithTrace } from '../../src/knitout/kniterate/to-kcode.js'
import { compileToRunArtifact } from '../../src/knitout/run-artifact.js'
import { projectColorworkChartV1 } from '../../src/colorwork/from-colorwork-chart.js'

function traceOf(kcode: string) {
  const parsed = parseKCodeDocument(kcode, { profile: KNITERATE_7GG_KCODE_PROFILE_V2, dialect: 'knitout-vendor', strict: true })
  if (!parsed.ok) throw new Error('fixture is not strict KCode')
  return projectKCodeMachineTrace(parsed.document, KNITERATE_7GG_KCODE_PROFILE_V2)
}

// A 6x6 diagonal on a 2-color fairisle body compiled with Studio's frame:
// C6 waste, C1 draw, and an alternate-needle cast-on before the body.
function diagonalKCode(): string {
  const projected = projectColorworkChartV1({
    kind: 'knitlab-colorwork-chart', version: 1, title: 'diagonal', width: 6, height: 6, rowNumbering: 'bottom-up',
    palette: [{ id: 'ground', name: 'Ground', hex: '#ffffff' }, { id: 'motif', name: 'Motif', hex: '#000000' }],
    cells: Array.from({ length: 6 }, (_, row) => Array.from({ length: 6 }, (_, column) => (column === row ? 1 : 0))),
  })
  const artifact = compileToRunArtifact({
    chart: projected.chart,
    keyPalette: projected.palette,
    yarnBindings: [{ keyId: 'ground', carrier: '2', name: 'ground' }, { keyId: 'motif', carrier: '3', name: 'motif' }],
    needleOffset: 40,
    wastePasses: 20,
    wasteCarrierOverride: '6',
    drawCarrierOverride: '1',
    bindOff: 'machine-bindoff',
    backBedStyle: 'floats',
  })
  if (!artifact.knitoutText) throw new Error('fixture did not compile')
  const converted = knitoutToKCodeWithTrace(artifact.knitoutText, 'faces.k')
  if (!converted.ok) throw new Error(converted.error)
  return converted.kcode
}

describe('knitted face projection', () => {
  it('skips the alternate-needle cast-on and recovers the authored chart', () => {
    const faces = projectKnittedFacesV1(traceOf(diagonalKCode()), { drawCarrier: '1', wasteCarrier: '6' })
    const recovered = recoverColorworkFromFrontFaceV1(faces.front)
    expect(recovered).toMatchObject({ width: 6, height: 6, carriers: ['2', '3'] })
    expect(recovered!.cells).toEqual(Array.from({ length: 6 }, (_, row) => Array.from({ length: 6 }, (_, column) => (column === row ? 1 : 0))))
    expect(faces.rear.rows).toEqual([])
  })

  it('recovers the captured Customist jacquard and compares under a carrier bijection', () => {
    const faces = projectKnittedFacesV1(traceOf(readFileSync('reference/jacquard.kc', 'utf8')), { drawCarrier: '1', wasteCarrier: '6' })
    const recovered = recoverColorworkFromFrontFaceV1(faces.front)
    expect(recovered).toMatchObject({ width: 67, height: 73, carriers: ['2', '4'] })
    const relabeled = { ...faces.front, rows: faces.front.rows.map((row) => row.replaceAll('4', '3')) }
    expect(compareKnittedFaceRowsV1(faces.front, relabeled, new Map([['2', '2'], ['4', '3']]))).toMatchObject({
      matchingRows: faces.front.rows.length,
      offset: 0,
    })
  })
})
