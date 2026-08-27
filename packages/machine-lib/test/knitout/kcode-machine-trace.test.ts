import { createHash } from 'node:crypto'

import { describe, expect, it } from 'vitest'

import {
  KNITERATE_7GG_KCODE_PROFILE_V1,
} from '../../src/knitout/kcode/machine-profile.js'
import {
  projectKCodeMachineTrace,
} from '../../src/knitout/kcode/machine-trace.js'
import { parseKCodeDocument } from '../../src/knitout/kcode/parser.js'
import { knitoutToKCodeWithTrace } from '../../src/knitout/kniterate/to-kcode.js'

const knitoutWithMoveAndTransfer = [
  ';!knitout-2',
  ';;Machine: kniterate',
  ';;Carriers: 1 2 3 4 5 6',
  'x-stitch-number 6',
  'x-xfer-stitch-number 5',
  'x-speed-number 300',
  'x-roller-advance 450',
  'in 2',
  'tuck + f40 2',
  'knit - f40 2',
  // Repeating the direction and then transferring forces backend choreography.
  'knit - f40 2',
  'xfer f40 b40',
  'out 2',
  '',
].join('\n')

const knitoutWithSemanticActions = [
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

const knitoutWithKnitThenTransfer = [
  ';!knitout-2',
  ';;Machine: kniterate',
  ';;Carriers: 1 2 3 4 5 6',
  'x-stitch-number 6',
  'x-xfer-stitch-number 5',
  'x-speed-number 300',
  'x-roller-advance 450',
  'in 2',
  'knit + f40 2',
  'xfer f40 b40',
  'out 2',
  '',
].join('\n')

function compileAndParse(
  dialect: 'app' | 'knitout-vendor',
  knitout = knitoutWithMoveAndTransfer,
) {
  const compiled = knitoutToKCodeWithTrace(
    knitout,
    'command.k',
  )
  if (!compiled.ok) throw new Error(compiled.error)

  const parsed = parseKCodeDocument(compiled.kcode, {
    profile: KNITERATE_7GG_KCODE_PROFILE_V1,
    dialect,
    strict: true,
  })
  expect(parsed.diagnostics).toEqual([])
  expect(parsed.ok).toBe(true)
  return {
    compiled,
    trace: projectKCodeMachineTrace(
      parsed.document,
      KNITERATE_7GG_KCODE_PROFILE_V1,
    ),
  }
}

describe('MachineTraceV1 KCode projection', () => {
  it('differentially matches every pinned-backend scheduled pass and stop', () => {
    const { compiled, trace } = compileAndParse('knitout-vendor')

    expect(compiled.scheduledPasses.some((pass) => pass.isAutoMove)).toBe(true)
    expect(compiled.scheduledPasses.some((pass) => /^Tr-|^R[lr]-Tr$/.test(pass.type))).toBe(true)
    expect(trace.passes).toHaveLength(compiled.scheduledPasses.length)
    expect(trace.rackCommands[0]).toMatchObject({
      index: 0,
      beforePassIndex: 0,
      valueRaw: '0',
      value: 0,
    })
    expect(createHash('sha256').update(JSON.stringify(trace)).digest('hex')).toBe(
      '6f89b5ccb3c40ffe4771323fd3fc864ef69b17914a0c1c8c6ddd642b3e9846c7',
    )

    for (const [index, expected] of compiled.scheduledPasses.entries()) {
      const actual = trace.passes[index]!
      expect(actual.raw, `pass ${index} raw fields`).toEqual({
        FRNT: expected.FRNT,
        STIF: expected.STIF,
        REAR: expected.REAR,
        STIR: expected.STIR,
        footer: `${expected.direction} ${expected.type} ${expected.carrier} ${expected.speed} ${expected.roller}`,
      })
      expect(actual, `pass ${index} scalar fields`).toMatchObject({
        index: expected.index,
        rack: expected.RACK,
        direction: expected.direction,
        operation: expected.type,
        carrier: expected.carrier,
        speed: expected.speed,
        roller: expected.roller,
        carriageStops: {
          left: expected.carriageLeft,
          right: expected.carriageRight,
        },
        carrierStops: expected.carrierLeft === undefined
          ? null
          : {
              left: expected.carrierLeft,
              right: expected.carrierRight,
            },
      })
    }

    const autoMoveIndex = compiled.scheduledPasses.findIndex((pass) => pass.isAutoMove)
    expect(trace.passes[autoMoveIndex]!.actions).toEqual([{
      kind: 'move',
      carrier: '0',
    }])

    const transferIndex = compiled.scheduledPasses.findIndex((pass) => pass.type.startsWith('Tr-'))
    const transfer = trace.passes[transferIndex]!
    expect(transfer.actions).toHaveLength(1)
    expect(transfer.actions[0]).toMatchObject({
      kind: 'xfer',
      source: { bed: 'front' },
      target: { bed: 'rear' },
    })
    const transferAction = transfer.actions[0]!
    if (transferAction.kind !== 'xfer') throw new Error('Expected xfer action')
    expect(transferAction.source.traceCoordinate).toBe(
      transferAction.target.traceCoordinate,
    )
    expect(transfer.selections.front[0]?.stitchSelector).toMatchObject({
      token: '5',
      encodedValue: 5,
    })
  })

  it('retains explicit dialect provenance without shifting marker-free columns', () => {
    const vendor = compileAndParse('knitout-vendor').trace
    const app = compileAndParse('app').trace

    const vendorCarrierPass = vendor.passes.find(
      (pass) => pass.carrier !== '0' && pass.selections.front.length > 0,
    )!
    const appCarrierPass = app.passes[vendorCarrierPass.index]!
    expect(appCarrierPass.selections.front[0]!.kcodeColumn).toBe(
      vendorCarrierPass.selections.front[0]!.kcodeColumn,
    )
    expect(appCarrierPass.selections.front[0]!.traceCoordinate).toBe(
      vendorCarrierPass.selections.front[0]!.traceCoordinate,
    )

    const vendorTransfer = vendor.passes.find((pass) => pass.operation.startsWith('Tr-'))!
    const appTransfer = app.passes[vendorTransfer.index]!
    expect(appTransfer.carrier).toBe('0')
    expect(appTransfer.selections.front[0]!.traceCoordinate).toBe(
      vendorTransfer.selections.front[0]!.traceCoordinate,
    )
  })

  it('keeps a backend knit and its following transfer source loop-continuous', () => {
    const { compiled, trace } = compileAndParse(
      'knitout-vendor',
      knitoutWithKnitThenTransfer,
    )
    const knitPass = trace.passes.find((pass) =>
      pass.actions.some((action) => action.kind === 'knit'))!
    const transferPass = trace.passes.find((pass) =>
      pass.actions.some((action) => action.kind === 'xfer'))!
    const knit = knitPass.actions.find((action) => action.kind === 'knit')!
    const transfer = transferPass.actions.find((action) => action.kind === 'xfer')!

    expect(knit.at.kcodeColumn).toBe(126)
    expect(transfer.source.kcodeColumn).toBe(126)
    expect(knit.at.traceCoordinate).toBe(126)
    expect(transfer.source.traceCoordinate).toBe(knit.at.traceCoordinate)

    const scheduledKnit = compiled.scheduledPasses.find((pass) =>
      pass.carrier === '2' && pass.FRNT.includes('-'))!
    const scheduledTransfer = compiled.scheduledPasses.find((pass) =>
      pass.carrier === '0' && pass.type.startsWith('Tr-'))!
    const removeStopMarkers = (value: string) => [...value]
      .filter((token) => !'/\\123456'.includes(token))
      .join('')
    expect(removeStopMarkers(scheduledKnit.FRNT).indexOf('-')).toBe(141)
    expect(removeStopMarkers(scheduledTransfer.FRNT).indexOf('-')).toBe(141)
    // The legacy decorated-index parser saw 128 vs 127 only because /22\\
    // contributes one more marker before the selection than /\\ does.
    expect(scheduledKnit.FRNT.indexOf('-') - 15).toBe(128)
    expect(scheduledTransfer.FRNT.indexOf('-') - 15).toBe(127)
  })

  it('anchors selections and stitch selectors to their exact source characters', () => {
    const { compiled, trace } = compileAndParse('knitout-vendor')
    const pass = trace.passes.find(
      (candidate) => candidate.selections.front.length > 0,
    )!
    const selection = pass.selections.front[0]!

    expect(compiled.kcode.slice(
      selection.sourceSpan.start.offset,
      selection.sourceSpan.end.offset,
    )).toBe('-')
    expect(compiled.kcode.slice(
      selection.stitchSelector.sourceSpan.start.offset,
      selection.stitchSelector.sourceSpan.end.offset,
    )).toBe(selection.stitchSelector.token)
    expect(pass.source.span.start.offset).toBeLessThan(selection.sourceSpan.start.offset)
    expect(pass.source.span.end.offset).toBeGreaterThan(selection.sourceSpan.end.offset)
  })

  it('preserves every ordered rack command at its exact pass boundary', () => {
    const compiled = knitoutToKCodeWithTrace(knitoutWithMoveAndTransfer, 'command.k')
    if (!compiled.ok) throw new Error(compiled.error)
    const source = compiled.kcode.replace(
      'RACK:0\n',
      'RACK:0\nRACK:4\nRACK:0\n',
    )
    const parsed = parseKCodeDocument(source, {
      profile: KNITERATE_7GG_KCODE_PROFILE_V1,
      dialect: 'knitout-vendor',
      strict: true,
    })
    expect(parsed.ok).toBe(true)

    const projected = projectKCodeMachineTrace(
      parsed.document,
      KNITERATE_7GG_KCODE_PROFILE_V1,
    )
    expect(projected.rackCommands.slice(0, 3).map((command) => ({
      index: command.index,
      beforePassIndex: command.beforePassIndex,
      valueRaw: command.valueRaw,
      value: command.value,
      source: source.slice(command.source.span.start.offset, command.source.span.end.offset),
    }))).toEqual([
      { index: 0, beforePassIndex: 0, valueRaw: '0', value: 0, source: 'RACK:0' },
      { index: 1, beforePassIndex: 0, valueRaw: '4', value: 4, source: 'RACK:4' },
      { index: 2, beforePassIndex: 0, valueRaw: '0', value: 0, source: 'RACK:0' },
    ])
    expect(projected.passes[0]?.rack).toBe(0)

    const firstFooterIndex = parsed.document.passes[0]!.footer.recordIndex
    const equalBoundary = projectKCodeMachineTrace({
      ...parsed.document,
      racks: parsed.document.racks.map((rack, index) => index === 0
        ? { ...rack, recordIndex: firstFooterIndex }
        : rack),
    }, KNITERATE_7GG_KCODE_PROFILE_V1)
    expect(equalBoundary.rackCommands[0]!.beforePassIndex).toBe(0)

    const trailingRack = parsed.document.racks[0]!
    const afterAllPasses = projectKCodeMachineTrace({
      ...parsed.document,
      racks: [{
        ...trailingRack,
        recordIndex: parsed.document.records.length + 1,
      }],
    }, KNITERATE_7GG_KCODE_PROFILE_V1)
    expect(afterAllPasses.rackCommands[0]!.beforePassIndex).toBe(
      parsed.document.passes.length,
    )
  })

  it('refuses to project the lossless tree returned for parser-rejected input', () => {
    const compiled = knitoutToKCodeWithTrace(knitoutWithMoveAndTransfer, 'command.k')
    if (!compiled.ok) throw new Error(compiled.error)
    const parsed = parseKCodeDocument(
      compiled.kcode.replace(/^HOME(?:\r?\n|\r)/, ''),
      {
        profile: KNITERATE_7GG_KCODE_PROFILE_V1,
        dialect: 'knitout-vendor',
        strict: true,
      },
    )
    expect(parsed.ok).toBe(false)
    expect(parsed.document.metadata.parseStatus).toBe('rejected')
    expect(() => projectKCodeMachineTrace(
      parsed.document,
      KNITERATE_7GG_KCODE_PROFILE_V1,
    )).toThrow(/rejected by the strict parser/)
  })

  it('fails closed before materializing an oversized selection and action graph', () => {
    const compiled = knitoutToKCodeWithTrace(knitoutWithMoveAndTransfer, 'command.k')
    if (!compiled.ok) throw new Error(compiled.error)
    const parsed = parseKCodeDocument(compiled.kcode, {
      profile: KNITERATE_7GG_KCODE_PROFILE_V1,
      dialect: 'knitout-vendor',
      strict: true,
    })
    expect(parsed.ok).toBe(true)
    const first = parsed.document.passes[0]!
    const withSelectedCells = (count: number) => ({
      ...parsed.document,
      passes: [{
        ...first,
        frnt: { ...first.frnt, value: '-'.repeat(count) },
      }],
    })

    expect(() => projectKCodeMachineTrace(
      withSelectedCells(200_001),
      KNITERATE_7GG_KCODE_PROFILE_V1,
    )).toThrow(/software resource limit of 200,000/)

    // Exactly the declared budget proceeds to structural projection. This
    // forged field then fails on its intentionally absent stop markers.
    expect(() => projectKCodeMachineTrace(
      withSelectedCells(200_000),
      KNITERATE_7GG_KCODE_PROFILE_V1,
    )).toThrow(/FRNT markers must be .*; received none/)
  })

  it('projects knit, tuck, split, drop, and move semantics without physical labels', () => {
    const { trace } = compileAndParse(
      'knitout-vendor',
      knitoutWithSemanticActions,
    )
    const kinds = trace.passes.flatMap((pass) => pass.actions.map((action) => action.kind))
    expect(kinds).toEqual(expect.arrayContaining([
      'knit',
      'tuck',
      'split',
      'drop',
      'move',
    ]))

    const split = trace.passes.flatMap((pass) => pass.actions).find(
      (action) => action.kind === 'split',
    )
    expect(split).toMatchObject({
      kind: 'split',
      carrier: '2',
      source: { bed: 'front' },
      target: { bed: 'rear' },
    })
    const selections = trace.passes.flatMap((pass) => [
      ...pass.selections.front,
      ...pass.selections.rear,
    ])
    for (const selection of selections) {
      expect(selection).not.toHaveProperty('physicalNeedle')
    }
  })

  it('rejects a profile that does not match the document contract', () => {
    const compiled = knitoutToKCodeWithTrace(knitoutWithMoveAndTransfer, 'command.k')
    if (!compiled.ok) throw new Error(compiled.error)
    const parsed = parseKCodeDocument(compiled.kcode, {
      profile: KNITERATE_7GG_KCODE_PROFILE_V1,
      dialect: 'knitout-vendor',
      strict: true,
    })

    expect(() => projectKCodeMachineTrace(parsed.document, {
      ...KNITERATE_7GG_KCODE_PROFILE_V1,
      profileId: 'different-profile',
    })).toThrow(/document targets .* projection received/)
    expect(() => projectKCodeMachineTrace(parsed.document, {
      ...KNITERATE_7GG_KCODE_PROFILE_V1,
      profileVersion: KNITERATE_7GG_KCODE_PROFILE_V1.profileVersion + 1,
    })).toThrow(/document targets .* projection received/)
  })

  it('fails closed at every defensive document and profile boundary', () => {
    const compiled = knitoutToKCodeWithTrace(knitoutWithMoveAndTransfer, 'command.k')
    if (!compiled.ok) throw new Error(compiled.error)
    const parsed = parseKCodeDocument(compiled.kcode, {
      profile: KNITERATE_7GG_KCODE_PROFILE_V1,
      dialect: 'knitout-vendor',
      strict: true,
    })
    if (!parsed.ok) throw new Error('Expected strict fixture to parse')
    const document = parsed.document
    const first = document.passes[0]!
    const selectedTracePass = projectKCodeMachineTrace(
      document,
      KNITERATE_7GG_KCODE_PROFILE_V1,
    ).passes.find((pass) => pass.selections.front.length > 0)!
    const selectedPayloadIndex = selectedTracePass.selections.front[0]!.payloadIndex
    const replaceAt = (value: string, index: number, token: string): string =>
      `${value.slice(0, index)}${token}${value.slice(index + 1)}`
    const withFirst = (change: Record<string, unknown>) => ({
      ...document,
      passes: [{ ...first, ...change }, ...document.passes.slice(1)],
    })
    const assertFailure = (
      candidate: unknown,
      profile: unknown,
      message: RegExp,
    ): void => {
      expect(() => projectKCodeMachineTrace(candidate as typeof document, profile as typeof KNITERATE_7GG_KCODE_PROFILE_V1))
        .toThrow(message)
    }

    assertFailure({ ...document, metadata: { ...document.metadata, strict: false } }, KNITERATE_7GG_KCODE_PROFILE_V1, /must record strict parsing/)
    assertFailure({ ...document, unknownRecords: [document.records[0]!] }, KNITERATE_7GG_KCODE_PROFILE_V1, /contains unknown records/)
    assertFailure({ ...document, home: null }, KNITERATE_7GG_KCODE_PROFILE_V1, /does not contain HOME/)
    assertFailure({ ...document, initialRack: null }, KNITERATE_7GG_KCODE_PROFILE_V1, /initial RACK:0/)
    assertFailure({ ...document, passes: [] }, KNITERATE_7GG_KCODE_PROFILE_V1, /complete passes/)
    assertFailure(document, { ...KNITERATE_7GG_KCODE_PROFILE_V1, supportedDialects: [] }, /does not support dialect/)
    assertFailure(document, {
      ...KNITERATE_7GG_KCODE_PROFILE_V1,
      dialects: {},
    }, /does not define dialect/)
    assertFailure(withFirst({
      frnt: { ...first.frnt, value: first.frnt.value.replace('/', '_') },
    }), KNITERATE_7GG_KCODE_PROFILE_V1, /FRNT markers must be .*; received 2 \.\.\. 2 \.\.\. \\/)
    const selectedPass = document.passes[selectedTracePass.index]!
    const selectedCarrier = selectedPass.footer.carrier!
    assertFailure({
      ...document,
      passes: document.passes.map((pass, index) => index === selectedTracePass.index
        ? {
            ...pass,
            frnt: {
              ...pass.frnt,
              value: pass.frnt.value.replace(selectedCarrier, '3'),
            },
          }
        : pass),
    }, KNITERATE_7GG_KCODE_PROFILE_V1, /FRNT markers must be/)
    const rearMarkerIndex = first.rear.value.indexOf('/')
    assertFailure(withFirst({
      rear: {
        ...first.rear,
        value: replaceAt(
          replaceAt(first.rear.value, rearMarkerIndex, first.rear.value[rearMarkerIndex + 1]!),
          rearMarkerIndex + 1,
          '/',
        ),
      },
    }), KNITERATE_7GG_KCODE_PROFILE_V1, /encode different stop coordinates/)
    assertFailure(withFirst({
      stif: { ...first.stif, value: first.stif.value.slice(1) },
    }), KNITERATE_7GG_KCODE_PROFILE_V1, /does not match stitch width/)
    const selectedPassIndex = selectedTracePass.index
    assertFailure({
      ...document,
      passes: document.passes.map((pass, index) => index === selectedPassIndex
        ? {
            ...pass,
            stif: {
              ...pass.stif,
              value: replaceAt(pass.stif.value, selectedPayloadIndex, '?'),
            },
          }
        : pass),
    }, KNITERATE_7GG_KCODE_PROFILE_V1, /unsupported stitch selector/)
    const unsupportedTrace = projectKCodeMachineTrace(document, {
      ...KNITERATE_7GG_KCODE_PROFILE_V1,
      operations: {
        ...KNITERATE_7GG_KCODE_PROFILE_V1.operations,
        [first.footer.operation!]: undefined,
      },
    } as typeof KNITERATE_7GG_KCODE_PROFILE_V1)
    expect(unsupportedTrace.passes[0]!.actions).toEqual([{
      kind: 'unknown',
      operation: first.footer.operation,
      reason: 'unsupported-operation',
      selections: [
        ...unsupportedTrace.passes[0]!.selections.front,
        ...unsupportedTrace.passes[0]!.selections.rear,
      ],
    }])

    for (const field of [
      'direction',
      'operation',
      'carrier',
      'speedRaw',
      'speed',
      'rollerRaw',
      'roller',
    ] as const) {
      assertFailure(withFirst({
        footer: { ...first.footer, [field]: null },
      }), KNITERATE_7GG_KCODE_PROFILE_V1, /fully parsed footer/)
    }
    assertFailure({
      ...document,
      racks: document.racks.map((rack, index) => index === 0
        ? { ...rack, value: null }
        : rack),
    }, KNITERATE_7GG_KCODE_PROFILE_V1, /does not have a parsed finite value/)
  })
})
