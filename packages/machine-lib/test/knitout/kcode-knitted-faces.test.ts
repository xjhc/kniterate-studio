import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import {
  compareKnittedFaceRowsV1,
  projectKnittedFacesV1,
  recoverColorworkFromFrontFaceV1,
} from '../../src/knitout/kcode/knitted-faces.js'
import { KNITERATE_7GG_KCODE_PROFILE_V2 } from '../../src/knitout/kcode/machine-profile.js'
import { projectKCodeMachineTrace } from '../../src/knitout/kcode/machine-trace.js'
import type { MachineTraceActionV1, MachineTraceBedV1, MachineTraceV1 } from '../../src/knitout/kcode/machine-trace.js'
import { parseKCodeDocument } from '../../src/knitout/kcode/parser.js'
import { knitoutToKCodeWithTrace } from '../../src/knitout/kniterate/to-kcode.js'
import { compileToRunArtifact } from '../../src/knitout/run-artifact.js'
import { projectColorworkChartV1 } from '../../src/colorwork/from-colorwork-chart.js'
import { diffTraceStitchesV1 } from '../../src/knitout/kcode/trace-stitch-diff.js'
import { parseKnitoutProgram } from '../../src/knitout/parser.js'

function traceOf(kcode: string) {
  const parsed = parseKCodeDocument(kcode, { profile: KNITERATE_7GG_KCODE_PROFILE_V2, dialect: 'knitout-vendor', strict: true })
  if (!parsed.ok) throw new Error('fixture is not strict KCode')
  return projectKCodeMachineTrace(parsed.document, KNITERATE_7GG_KCODE_PROFILE_V2)
}

// A 6x6 diagonal on a 2-color fairisle body compiled with Studio's frame:
// C6 waste, C1 draw, and an alternate-needle cast-on before the body.
function diagonalKCode() {
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
  const source = parseKnitoutProgram(artifact.knitoutText)
  const bodyLines = new Set(source.opLines.filter((_, index) => artifact.programOpSourceRows[index] !== null))
  const bodyPasses = converted.scheduledPasses.filter((pass) => pass.sourceLines.some((line) => bodyLines.has(line)))
  if (bodyPasses.length === 0) throw new Error('fixture has no body provenance')
  return {
    kcode: converted.kcode,
    bodyStartPassIndex: bodyPasses[0]!.index,
    bodyEndPassIndexExclusive: bodyPasses[bodyPasses.length - 1]!.index + 1,
  }
}

const reference = traceOf(readFileSync('reference/jacquard.kc', 'utf8'))
const knitPass = reference.passes.find((pass) => pass.actions.some((action) => action.kind === 'knit'))!
const knitAction = knitPass.actions.find((action) => action.kind === 'knit')!
if (knitAction.kind !== 'knit') throw new Error('fixture lacks a knit')
const knitSelection = knitAction.at

function knittingTrace(rows: readonly { carrier: '1' | '2' | '3' | '6', coordinates: readonly number[], bed?: MachineTraceBedV1 }[]): Pick<MachineTraceV1, 'passes'> {
  return { passes: rows.map((row, index) => ({
    ...knitPass,
    index,
    carrier: row.carrier,
    actions: row.coordinates.map((coordinate): MachineTraceActionV1 => ({
      kind: 'knit', at: { ...knitSelection, bed: row.bed ?? 'front', traceCoordinate: coordinate },
    })),
  })) }
}

describe('knitted face projection', () => {
  it('uses an explicit compiler-provenance window to exclude cast-on and finish', () => {
    const { kcode, ...bodyWindow } = diagonalKCode()
    const faces = projectKnittedFacesV1(traceOf(kcode), { drawCarrier: '1', wasteCarrier: '6', ...bodyWindow })
    const recovered = recoverColorworkFromFrontFaceV1(faces.front)
    expect(faces.boundary).toBe('explicit')
    expect(recovered).toMatchObject({ width: 6, height: 6, carriers: ['2', '3'] })
    expect(recovered!.cells).toEqual(Array.from({ length: 6 }, (_, row) => Array.from({ length: 6 }, (_, column) => (column === row ? 1 : 0))))
    expect(faces.rear.rows).toEqual([])
  })

  it('recovers the captured Customist jacquard and compares under a carrier bijection', () => {
    const faces = projectKnittedFacesV1(reference, { drawCarrier: '1', wasteCarrier: '6' })
    const recovered = recoverColorworkFromFrontFaceV1(faces.front, { trimEdgePartialRows: true })
    expect(recovered).toMatchObject({ width: 67, height: 73, carriers: ['2', '4'] })
    const relabeled = { ...faces.front, rows: faces.front.rows.map((row) => row.replaceAll('4', '3')) }
    expect(compareKnittedFaceRowsV1(faces.front, relabeled, new Map([['2', '2'], ['4', '3']]))).toMatchObject({
      matchingRows: faces.front.rows.length,
      identical: true,
      offset: 0,
    })
  })

  it('preserves alternating design passes and never guesses the first yarn is waste', () => {
    const trace = knittingTrace([
      { carrier: '2', coordinates: [0, 2, 4] }, { carrier: '3', coordinates: [1, 3, 5] },
      { carrier: '3', coordinates: [0, 2, 4] }, { carrier: '2', coordinates: [1, 3, 5] },
    ])
    const faces = projectKnittedFacesV1(trace, { drawCarrier: null })
    expect(faces).toMatchObject({ wasteCarrier: null, bodyStartPassIndex: 0, boundary: 'first-knit' })
    expect(faces.front.rows).toEqual(['232323', '323232'])
    expect(recoverColorworkFromFrontFaceV1(faces.front)).toMatchObject({ width: 6, height: 2, droppedPartialRows: 0 })
    expect(faces.limitations.join(' ')).toContain('inferred window')
  })

  it('retains rear-only knitting after a known draw pass and includes possible cast-on', () => {
    const trace = knittingTrace([
      { carrier: '6', coordinates: [0, 1, 2] },
      { carrier: '1', coordinates: [0, 1, 2] },
      { carrier: '2', coordinates: [0, 2], bed: 'rear' },
      { carrier: '2', coordinates: [0, 1, 2], bed: 'rear' },
    ])
    const faces = projectKnittedFacesV1(trace, { drawCarrier: '1', wasteCarrier: '6' })
    expect(faces).toMatchObject({ boundary: 'after-last-draw', bodyStartPassIndex: 2 })
    expect(faces.front.rows).toEqual([])
    expect(faces.rear.rows).toEqual(['222', '2 2'])
  })

  it('preserves coordinate holes rather than compressing distinct needle selections', () => {
    const sparse = projectKnittedFacesV1(knittingTrace([{ carrier: '2', coordinates: [1, 2, 4] }]), { drawCarrier: null })
    const dense = projectKnittedFacesV1(knittingTrace([{ carrier: '2', coordinates: [1, 2, 3] }]), { drawCarrier: null })
    expect(sparse.front).toMatchObject({ firstCoordinate: 1, rows: ['22 2'] })
    expect(dense.front.rows).toEqual(['222'])
    expect(compareKnittedFaceRowsV1(sparse.front, dense.front, new Map())).toMatchObject({ matchingRows: 0, identical: false })
    expect(recoverColorworkFromFrontFaceV1(sparse.front, { trimEdgePartialRows: true })).toBeNull()
  })

  it('keeps held-needle gaps visible and requires explicit consent to trim edge rows', () => {
    const faces = projectKnittedFacesV1(knittingTrace([
      { carrier: '2', coordinates: [1, 2, 3] },
      { carrier: '3', coordinates: [1, 3] },
    ]), { drawCarrier: null })
    expect(faces.front.rows).toEqual(['222', '3 3'])
    expect(faces.limitations.join(' ')).toContain('held stitches')
    expect(recoverColorworkFromFrontFaceV1(faces.front)).toBeNull()
    expect(recoverColorworkFromFrontFaceV1(faces.front, { trimEdgePartialRows: true })).toMatchObject({ height: 1, droppedPartialRows: 1 })
    const interiorGap = { ...faces.front, rows: ['222', '3 3', '222'] }
    expect(recoverColorworkFromFrontFaceV1(interiorGap, { trimEdgePartialRows: true })).toBeNull()
    const bothEdges = { ...faces.front, rows: ['2 2', '333', '2 2'] }
    expect(recoverColorworkFromFrontFaceV1(bothEdges, { trimEdgePartialRows: true })).toMatchObject({ height: 1, droppedPartialRows: 2 })
  })

  it('does not report equality when actual rows are added or removed', () => {
    const face = { bed: 'front' as const, firstCoordinate: 1, rows: ['222', '333'] }
    expect(compareKnittedFaceRowsV1(face, { ...face, rows: ['222', '333', '222'] }, new Map())).toMatchObject({ matchingRows: 2, identical: false })
    expect(compareKnittedFaceRowsV1(face, { ...face, rows: ['222'] }, new Map())).toMatchObject({ matchingRows: 1, identical: false })
    expect(compareKnittedFaceRowsV1(face, { ...face, rows: ['111', '222', '333'] }, new Map())).toMatchObject({ matchingRows: 2, offset: 1, identical: false })
  })

  it('refuses invalid explicit windows instead of silently changing them', () => {
    const trace = knittingTrace([{ carrier: '2', coordinates: [1, 2] }])
    for (const bodyStartPassIndex of [-1, 2, 0.5, Number.NaN]) {
      expect(() => projectKnittedFacesV1(trace, { drawCarrier: null, bodyStartPassIndex })).toThrow(RangeError)
    }
    expect(() => projectKnittedFacesV1(trace, { drawCarrier: null, bodyStartPassIndex: 1, bodyEndPassIndexExclusive: 0 })).toThrow(RangeError)
    expect(projectKnittedFacesV1(trace, { drawCarrier: null, bodyStartPassIndex: 1 })).toMatchObject({ boundary: 'explicit', front: { rows: [] } })
  })
})

describe('trace stitch diff', () => {
  it('finds identical passes under a needle offset and reports differing ones', () => {
    const shifted = { passes: reference.passes.map((pass) => ({ ...pass, actions: pass.actions.map((action) => (action.kind === 'knit' || action.kind === 'tuck' || action.kind === 'drop')
      ? { ...action, at: { ...action.at, traceCoordinate: action.at.traceCoordinate + 2 } }
      : action.kind === 'xfer' || action.kind === 'split'
        ? { ...action, source: { ...action.source, traceCoordinate: action.source.traceCoordinate + 2 }, target: { ...action.target, traceCoordinate: action.target.traceCoordinate + 2 } }
        : action) })) }
    expect(diffTraceStitchesV1(reference, shifted)).toMatchObject({ identicalPasses: reference.passes.length, offset: -2, differingPassIndices: [] })
    expect(diffTraceStitchesV1(shifted, reference)).toMatchObject({ identicalPasses: reference.passes.length, offset: 2, differingPassIndices: [] })
    const firstKnit = reference.passes.findIndex((pass) => pass.actions.some((action) => action.kind === 'knit'))
    const damaged = { passes: reference.passes.map((pass, index) => index === firstKnit ? { ...pass, actions: pass.actions.slice(1) } : pass) }
    expect(diffTraceStitchesV1(reference, damaged)).toMatchObject({ identicalPasses: reference.passes.length - 1, differingPassIndices: [firstKnit] })
  })

  it('reports the complete coordinate shift when the best alignment differs from the leftmost needles', () => {
    const expected = knittingTrace([{ carrier: '2', coordinates: [100, 101] }, { carrier: '2', coordinates: [100, 101] }])
    const actual = knittingTrace([{ carrier: '2', coordinates: [99] }, { carrier: '2', coordinates: [102, 103] }])
    expect(diffTraceStitchesV1(expected, actual)).toMatchObject({ identicalPasses: 1, offset: -2, differingPassIndices: [0] })
    expect(diffTraceStitchesV1({ passes: [] }, { passes: [] })).toMatchObject({ identicalPasses: 0, offset: 0 })
  })

  it('detects a changed transfer target selector in valid strict KCode', () => {
    const raw = readFileSync('reference/fairisle.kc', 'utf8')
    const expected = traceOf(raw)
    const pass = expected.passes.find((pass) => pass.actions.some((action) => action.kind === 'xfer'))!
    const transfer = pass.actions.find((action) => action.kind === 'xfer')!
    if (transfer.kind !== 'xfer') throw new Error('fixture lacks a transfer')
    const span = transfer.target.stitchSelector.sourceSpan
    expect(raw.slice(span.start.offset, span.end.offset)).toBe('0')
    const actual = traceOf(`${raw.slice(0, span.start.offset)}1${raw.slice(span.end.offset)}`)
    expect(diffTraceStitchesV1(expected, actual)).toMatchObject({ identicalPasses: expected.passes.length - 1, differingPassIndices: [pass.index], offset: 0 })
  })

  it('includes both stitch selectors for split actions', () => {
    const split = { kind: 'split' as const, carrier: '2' as const, source: knitSelection, target: { ...knitSelection, bed: 'rear' as const } }
    const expected = { passes: [{ ...knitPass, actions: [split] }] }
    const actual = { passes: [{ ...knitPass, actions: [{ ...split, target: { ...split.target, stitchSelector: { ...split.target.stitchSelector, encodedValue: split.target.stitchSelector.encodedValue + 1 } } }] }] }
    expect(diffTraceStitchesV1(expected, actual)).toMatchObject({ identicalPasses: 0, differingPassIndices: [0] })
  })
})
