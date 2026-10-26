import { describe, expect, it } from 'vitest'
import * as browserApi from '../../src/browser.js'

import { isKCodeCommandLegalityExportEligible } from '../../src/knitout/kcode/export-eligibility.js'
import {
  KNITERATE_7GG_KCODE_PROFILE_V2,
  KNITERATE_KCODE_OPERATION_CONTRACTS_V1,
} from '../../src/knitout/kcode/machine-profile.js'
import { validateKCodeMachineSafetyV1 } from '../../src/knitout/kcode/machine-safety.js'
import { projectKCodeMachineTrace } from '../../src/knitout/kcode/machine-trace.js'
import { validateKCodeMachineTrace } from '../../src/knitout/kcode/machine-validator.js'
import { parseKCodeDocument } from '../../src/knitout/kcode/parser.js'
import {
  LEGALITY_CARRIERS,
  LEGALITY_CORE_CASE_COUNT,
  LEGALITY_DIRECTIONS,
  LEGALITY_OPERATIONS,
  LEGALITY_RACKS,
  type LegalityBed,
  type LegalityCarrier,
  type LegalityDirection,
  type LegalityOperation,
} from './kcode-legality-spec.js'

const PADDING = 15
const NEEDLE_COLUMNS = 253
const BASE_WIDTH = PADDING + NEEDLE_COLUMNS + PADDING
const CARRIAGE_STOPS = { left: -5.5, right: 257.5 } as const
const CARRIER_STOPS = { left: 29.5, right: 219.5 } as const
const SOURCE_COORDINATE = 100

const LEGALITY_RAILS = [
  {
    id: 'node-module',
    parse: parseKCodeDocument,
    project: projectKCodeMachineTrace,
    validate: validateKCodeMachineTrace,
    safety: validateKCodeMachineSafetyV1,
  },
  {
    id: 'browser-entrypoint',
    parse: browserApi.parseKCodeDocument,
    project: browserApi.projectKCodeMachineTrace,
    validate: browserApi.validateKCodeMachineTrace,
    safety: browserApi.validateKCodeMachineSafetyV1,
  },
] as const

interface RawPass {
  readonly rack: number
  readonly direction: LegalityDirection
  readonly operation: LegalityOperation
  readonly carrier: LegalityCarrier
  readonly front: readonly number[]
  readonly rear: readonly number[]
  readonly frontSelectors?: Readonly<Record<number, string>>
  readonly rearSelectors?: Readonly<Record<number, string>>
  readonly carriageStops?: { readonly left: number; readonly right: number }
  readonly carrierStops?: { readonly left: number; readonly right: number }
}

function markerFreeBed(selected: readonly number[]): string {
  const needles = Array.from({ length: NEEDLE_COLUMNS }, () => '_')
  for (const coordinate of selected) needles[coordinate] = '-'
  return '.'.repeat(PADDING) + needles.join('') + '.'.repeat(PADDING)
}

function markerBaseIndex(stop: number): number {
  return stop + PADDING + 0.5
}

function stitchField(selectors: Readonly<Record<number, string>> = {}): string {
  const result = Array.from({ length: BASE_WIDTH }, () => '6')
  for (const [coordinate, token] of Object.entries(selectors)) {
    result[PADDING + Number(coordinate)] = token
  }
  return result.join('')
}

function decorateBed(base: string, pass: RawPass): string {
  const carriageStops = pass.carriageStops ?? CARRIAGE_STOPS
  const carrierStops = pass.carrierStops ?? CARRIER_STOPS
  const carrier = pass.carrier
  const markers: readonly (readonly [number, string])[] = carrier === '0'
    ? [
        [markerBaseIndex(carriageStops.left), '/'],
        [markerBaseIndex(carriageStops.right), '\\'],
      ]
    : [
        [markerBaseIndex(carriageStops.left), '/'],
        [markerBaseIndex(carrierStops.left), carrier],
        [markerBaseIndex(carrierStops.right), carrier],
        [markerBaseIndex(carriageStops.right), '\\'],
      ]
  let result = ''
  let markerIndex = 0
  for (let baseIndex = 0; baseIndex <= base.length; baseIndex++) {
    while (markers[markerIndex]?.[0] === baseIndex) {
      result += markers[markerIndex]![1]
      markerIndex++
    }
    if (baseIndex < base.length) result += base[baseIndex]
  }
  return result
}

function renderDocument(passes: readonly RawPass[]): string {
  const lines = ['HOME', 'RACK:0', '// independent command-legality matrix']
  let rack = 0
  for (const pass of passes) {
    if (!Object.is(pass.rack, rack)) {
      lines.push(`RACK:${pass.rack}`)
      rack = pass.rack
    }
    lines.push(
      `FRNT:${decorateBed(markerFreeBed(pass.front), pass)}`,
      `STIF:${stitchField(pass.frontSelectors)}`,
      `REAR:${decorateBed(markerFreeBed(pass.rear), pass)}`,
      `STIR:${stitchField(pass.rearSelectors)}`,
      `${pass.direction} ${pass.operation} ${pass.carrier} 300 100`,
    )
  }
  return `${lines.join('\n')}\n`
}

function transferSelections(
  operation: LegalityOperation,
  rack: number,
): { front: number[]; rear: number[]; sourceBed: LegalityBed } {
  const contract = LEGALITY_OPERATIONS[operation]
  if (contract.family !== 'transfer') throw new Error(`${operation} is not a transfer`)
  const target = SOURCE_COORDINATE + rack * contract.rackMultiplier
  const front = contract.source === 'front' ? [SOURCE_COORDINATE] : []
  const rear = contract.source === 'rear' ? [SOURCE_COORDINATE] : []
  if (Number.isInteger(target)) {
    if (contract.target === 'front') front.push(target)
    else rear.push(target)
  }
  return { front, rear, sourceBed: contract.source }
}

function coreDocument(
  operation: LegalityOperation,
  direction: LegalityDirection,
  carrier: LegalityCarrier,
  rack: number,
): string {
  const contract = LEGALITY_OPERATIONS[operation]
  if (contract.family === 'regular') {
    return renderDocument([{
      rack,
      direction,
      operation,
      carrier,
      front: [SOURCE_COORDINATE],
      rear: [SOURCE_COORDINATE + 1],
    }])
  }

  const selections = transferSelections(operation, rack)
  const setupCarrier: LegalityCarrier = carrier === '0' ? '1' : carrier
  const setupDirection: LegalityDirection = direction === '>>' ? '<<' : '>>'
  return renderDocument([
    {
      rack: 0,
      direction: setupDirection,
      operation: 'Kn-Kn',
      carrier: setupCarrier,
      front: selections.sourceBed === 'front' ? [SOURCE_COORDINATE] : [],
      rear: selections.sourceBed === 'rear' ? [SOURCE_COORDINATE] : [],
    },
    {
      rack,
      direction,
      operation,
      carrier,
      front: selections.front,
      rear: selections.rear,
    },
  ])
}

describe('V1 command-legality contract', () => {
  it('matches the independent literal operation decision table', () => {
    expect(Object.keys(KNITERATE_KCODE_OPERATION_CONTRACTS_V1).sort()).toEqual(
      Object.keys(LEGALITY_OPERATIONS).sort(),
    )
    for (const operation of Object.keys(LEGALITY_OPERATIONS) as LegalityOperation[]) {
      const expected = LEGALITY_OPERATIONS[operation]
      const actual = KNITERATE_KCODE_OPERATION_CONTRACTS_V1[operation]
      expect(actual.family, operation).toBe(expected.family)
      expect(actual.allowedDirections, operation).toEqual(expected.directions)
      if (actual.family === 'regular' && expected.family === 'regular') {
        expect(actual).toMatchObject({
          frontAction: expected.front,
          rearAction: expected.rear,
          carrierZeroAction: 'drop',
          carrierAction: 'bed-operation',
          emptySelectionAction: 'move',
        })
      } else if (actual.family === 'transfer' && expected.family === 'transfer') {
        expect(actual).toMatchObject({
          sourceBed: expected.source,
          targetBed: expected.target,
          targetRackMultiplier: expected.rackMultiplier,
          carrierZeroAction: 'xfer',
          carrierAction: 'split',
          emptySelectionAction: 'invalid',
        })
      }
    }
  })

  it('checks all 1,904 operation, direction, carrier, and rack combinations', () => {
    let checked = 0
    for (const operation of Object.keys(LEGALITY_OPERATIONS) as LegalityOperation[]) {
      const expected = LEGALITY_OPERATIONS[operation]
      for (const direction of LEGALITY_DIRECTIONS) {
        for (const carrier of LEGALITY_CARRIERS) {
          for (const rack of LEGALITY_RACKS) {
            const source = coreDocument(operation, direction, carrier, rack)
            const expectedConformant = expected.directions.includes(direction as never)
              && (expected.family === 'regular' || Number.isInteger(rack))
            // Command legality is not machine safety. The regular cases put
            // front 100 and rear 101 in one pass: front n faces rear n - rack,
            // so at rack -1 they are facing needles, which collide.
            const expectedFacingNeedles = expected.family === 'regular'
              && Number.isInteger(rack)
              && SOURCE_COORDINATE - rack === SOURCE_COORDINATE + 1
            // A transfer operation with a yarn carrier is a split, which the
            // machine does not do.
            const expectedTransferWithCarrier = expected.family === 'transfer'
              && carrier !== '0'
              && Number.isInteger(rack)
            for (const rail of LEGALITY_RAILS) {
              const parsed = rail.parse(source, {
                profile: KNITERATE_7GG_KCODE_PROFILE_V2,
                dialect: 'knitout-vendor',
                strict: true,
              })
              const label = `${rail.id}/${operation}/${direction}/${carrier}/${rack}`
              expect(parsed.ok, `${label} parse`).toBe(true)
              const trace = rail.project(parsed.document, KNITERATE_7GG_KCODE_PROFILE_V2)
              const report = rail.validate(trace, KNITERATE_7GG_KCODE_PROFILE_V2)
              expect(report.profileConformance, label).toBe(
                expectedConformant ? 'conformant' : 'blocked',
              )
              expect(
                (rail.id === 'browser-entrypoint'
                  ? browserApi.isKCodeCommandLegalityExportEligible
                  : isKCodeCommandLegalityExportEligible)({
                  parseOk: parsed.ok,
                  validation: report,
                }),
                `${label} export eligibility`,
              ).toBe(expectedConformant)
              expect(report.controllerAcceptance).toBe(
                'not-established-by-software-validation',
              )
              const safety = rail.safety(trace, KNITERATE_7GG_KCODE_PROFILE_V2)
              expect(safety.counts['machine-safety.facing-needles'] > 0, `${label} facing needles`)
                .toBe(expectedFacingNeedles)
              expect(safety.counts['machine-safety.transfer-with-carrier'] > 0, `${label} transfer with carrier`)
                .toBe(expectedTransferWithCarrier)
            }
            checked++
          }
        }
      }
    }
    expect(checked).toBe(LEGALITY_CORE_CASE_COUNT)
  }, 30_000)

  it('partitions selection, selector, transfer, marker, stop, and continuity boundaries', () => {
    const report = (source: string) => {
      const results = LEGALITY_RAILS.map((rail) => {
        const parsed = rail.parse(source, {
          profile: KNITERATE_7GG_KCODE_PROFILE_V2,
          dialect: 'knitout-vendor',
          strict: true,
        })
        const trace = parsed.ok
          ? rail.project(parsed.document, KNITERATE_7GG_KCODE_PROFILE_V2)
          : null
        return {
          parsed,
          trace,
          validation: trace === null
            ? null
            : rail.validate(trace, KNITERATE_7GG_KCODE_PROFILE_V2)
        }
      })
      expect(results[1]!.parsed.diagnostics).toEqual(results[0]!.parsed.diagnostics)
      expect(results[1]!.trace).toEqual(results[0]!.trace)
      expect(results[1]!.validation).toEqual(results[0]!.validation)
      return results[0]!
    }
    const expectConformant = (pass: RawPass) => {
      const result = report(renderDocument([pass]))
      expect(result.parsed.ok).toBe(true)
      expect(result.validation?.profileConformance).toBe('conformant')
    }

    // Empty move; front-only, rear-only, both-bed; and the exact raster edges.
    expectConformant({ rack: 0, direction: '>>', operation: 'Kn-Kn', carrier: '0', front: [], rear: [] })
    expectConformant({ rack: 0, direction: '>>', operation: 'Kn-Kn', carrier: '2', front: [100], rear: [] })
    expectConformant({ rack: 0, direction: '>>', operation: 'Kn-Kn', carrier: '2', front: [], rear: [100] })
    expectConformant({ rack: 0, direction: '>>', operation: 'Kn-Kn', carrier: '2', front: [100], rear: [101] })
    expectConformant({
      rack: 0,
      direction: '>>',
      operation: 'Kn-Kn',
      carrier: '2',
      front: [0, 126, 252],
      rear: [],
      carriageStops: { left: -0.5, right: 252.5 },
      carrierStops: { left: -0.5, right: 252.5 },
      frontSelectors: { 0: '0', 126: 'F', 252: '0' },
    })

    // Exact paired transfer is legal; one missing target selection is not.
    const paired = renderDocument([
      { rack: 0, direction: '<<', operation: 'Kn-Kn', carrier: '2', front: [100], rear: [] },
      { rack: 0, direction: '>>', operation: 'Tr-Rr', carrier: '0', front: [100], rear: [100] },
    ])
    expect(report(paired).validation?.profileConformance).toBe('conformant')
    const unpaired = paired.replace(/(REAR:[^\n]*?)-/, '$1_')
    const sourceOnly = report(unpaired)
    expect(sourceOnly.validation?.diagnostics.map((item) => item.rule)).toContain(
      'machine-trace.unknown-action',
    )
    expect(sourceOnly.trace?.passes[1]!.actions).toEqual([{
      kind: 'unknown',
      operation: 'Tr-Rr',
      reason: 'unpaired-transfer-selection',
      selections: sourceOnly.trace.passes[1]!.selections.front,
    }])
    const removeTransferSelection = (source: string, field: 'FRNT' | 'REAR'): string => {
      const lines = source.split('\n')
      const footerIndex = lines.findIndex((line) => line.includes(' Tr-Rr '))
      const fieldIndex = footerIndex - (field === 'FRNT' ? 4 : 2)
      lines[fieldIndex] = lines[fieldIndex]!.replace('-', '_')
      return lines.join('\n')
    }
    const targetOnlySource = removeTransferSelection(paired, 'FRNT')
    const targetOnly = report(targetOnlySource)
    expect(targetOnly.trace?.passes[1]!.actions).toEqual([{
      kind: 'unknown',
      operation: 'Tr-Rr',
      reason: 'unpaired-transfer-selection',
      selections: targetOnly.trace.passes[1]!.selections.rear,
    }])
    const emptyTransfer = report(
      removeTransferSelection(targetOnlySource, 'REAR'),
    )
    expect(emptyTransfer.trace?.passes[1]!.actions).toEqual([{
      kind: 'unknown',
      operation: 'Tr-Rr',
      reason: 'empty-transfer',
      selections: [],
    }])
    const extraTarget = report(renderDocument([
      { rack: 0, direction: '<<', operation: 'Kn-Kn', carrier: '2', front: [100], rear: [] },
      { rack: 0, direction: '>>', operation: 'Tr-Rr', carrier: '0', front: [100], rear: [99, 100] },
    ]))
    expect(extraTarget.trace?.passes[1]!.actions.map((action) => ({
      kind: action.kind,
      selections: action.kind === 'unknown'
        ? action.selections.map((selection) => selection.traceCoordinate)
        : action.kind === 'xfer' || action.kind === 'split'
          ? [action.source.traceCoordinate, action.target.traceCoordinate]
          : [],
    }))).toEqual([
      { kind: 'xfer', selections: [100, 100] },
      { kind: 'unknown', selections: [99] },
    ])
    const reverseTransfers = report(renderDocument([
      { rack: 0, direction: '>>', operation: 'Kn-Kn', carrier: '2', front: [100, 101], rear: [] },
      { rack: 0, direction: '<<', operation: 'Tr-Rl', carrier: '0', front: [100, 101], rear: [100, 101] },
    ]))
    expect(reverseTransfers.trace?.passes[1]!.actions.map((action) =>
      action.kind === 'xfer' ? action.source.traceCoordinate : null)).toEqual([101, 100])

    // A malformed marker is refused by the parser before projection.
    const missingMarker = renderDocument([{
      rack: 0, direction: '>>', operation: 'Kn-Kn', carrier: '2', front: [100], rear: [],
    }]).replace(/(FRNT:[^/\n]*)\//, '$1_')
    expect(report(missingMarker).parsed.diagnostics.map((item) => item.rule)).toContain(
      'kcode.bed-markers',
    )

    // Stops must contain the operated column, and adjacent passes must meet.
    const outsideStops = report(renderDocument([{
      rack: 0,
      direction: '>>',
      operation: 'Kn-Kn',
      carrier: '2',
      front: [100],
      rear: [],
      carrierStops: { left: 110.5, right: 120.5 },
    }]))
    expect(outsideStops.validation?.diagnostics.map((item) => item.rule)).toContain(
      'machine-trace.selection-outside-carrier',
    )
    const discontinuous = report(renderDocument([
      { rack: 0, direction: '>>', operation: 'Kn-Kn', carrier: '2', front: [100], rear: [] },
      {
        rack: 0,
        direction: '<<',
        operation: 'Kn-Kn',
        carrier: '3',
        front: [100],
        rear: [],
        carriageStops: { left: -5.5, right: 256.5 },
      },
    ]))
    expect(discontinuous.validation?.diagnostics.map((item) => item.rule)).toContain(
      'machine-trace.carriage-discontinuity',
    )
  })
})
