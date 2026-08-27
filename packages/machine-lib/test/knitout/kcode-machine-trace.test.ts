import { createHash } from 'node:crypto'

import { describe, expect, it } from 'vitest'

import {
  KNITERATE_7GG_KCODE_PROFILE_V2,
  type KCodeMachineProfileV1,
  type KCodeOperationContractV1,
  type KCodeOperationV1,
} from '../../src/knitout/kcode/machine-profile.js'
import {
  projectKCodeRackCommands,
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
    profile: KNITERATE_7GG_KCODE_PROFILE_V2,
    dialect,
    strict: true,
  })
  expect(parsed.diagnostics).toEqual([])
  expect(parsed.ok).toBe(true)
  return {
    compiled,
    trace: projectKCodeMachineTrace(
      parsed.document,
      KNITERATE_7GG_KCODE_PROFILE_V2,
    ),
  }
}

describe('MachineTraceV1 KCode projection', () => {
  const withOperationContract = (
    operation: KCodeOperationV1,
    changes: Partial<KCodeOperationContractV1>,
  ): KCodeMachineProfileV1 => ({
    ...KNITERATE_7GG_KCODE_PROFILE_V2,
    operations: {
      ...KNITERATE_7GG_KCODE_PROFILE_V2.operations,
      [operation]: {
        ...KNITERATE_7GG_KCODE_PROFILE_V2.operations[operation],
        ...changes,
      } as KCodeOperationContractV1,
    },
  })

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
      '1145e04551b1f4c0513cb35e31bd6799fc1884bdd0397e38b1fb961a7dfdcf96',
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
      profile: KNITERATE_7GG_KCODE_PROFILE_V2,
      dialect: 'knitout-vendor',
      strict: true,
    })
    expect(parsed.ok).toBe(true)

    const projected = projectKCodeMachineTrace(
      parsed.document,
      KNITERATE_7GG_KCODE_PROFILE_V2,
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

    const firstFooter = parsed.document.passes[0]!.footer
    const betweenSource = source.slice(0, firstFooter.fullSpan.end.offset)
      + 'RACK:4\nRACK:0\n'
      + source.slice(firstFooter.fullSpan.end.offset)
    const between = parseKCodeDocument(betweenSource, {
      profile: KNITERATE_7GG_KCODE_PROFILE_V2,
      dialect: 'knitout-vendor',
      strict: true,
    })
    expect(between.ok).toBe(true)
    const betweenTrace = projectKCodeMachineTrace(
      between.document,
      KNITERATE_7GG_KCODE_PROFILE_V2,
    )
    expect(betweenTrace.rackCommands.filter((command) => command.beforePassIndex === 1))
      .toHaveLength(2)

    const after = parseKCodeDocument(`${source}RACK:4\n`, {
      profile: KNITERATE_7GG_KCODE_PROFILE_V2,
      dialect: 'knitout-vendor',
      strict: true,
    })
    expect(after.ok).toBe(true)
    const afterTrace = projectKCodeMachineTrace(
      after.document,
      KNITERATE_7GG_KCODE_PROFILE_V2,
    )
    expect(afterTrace.rackCommands.at(-1)!.beforePassIndex).toBe(
      after.document.passes.length,
    )
  })

  it('projects rack boundaries with one pass-array scan at the intake envelope', () => {
    const compiled = knitoutToKCodeWithTrace(knitoutWithMoveAndTransfer, 'command.k')
    if (!compiled.ok) throw new Error(compiled.error)
    const rackPrefix = Array.from({ length: 4_096 }, (_, index) =>
      `RACK:${index % 2 === 0 ? 4 : 0}`).join('\n')
    const source = compiled.kcode.replace('RACK:0\n', `RACK:0\n${rackPrefix}\n`)
    const parsed = parseKCodeDocument(source, {
      profile: KNITERATE_7GG_KCODE_PROFILE_V2,
      dialect: 'knitout-vendor',
      strict: true,
    })
    expect(parsed.ok).toBe(true)

    let numericPassReads = 0
    const passes = new Proxy(parsed.document.passes, {
      get(target, property, receiver) {
        if (typeof property === 'string' && /^\d+$/.test(property)) numericPassReads++
        return Reflect.get(target, property, receiver)
      },
    })
    const commands = projectKCodeRackCommands({ ...parsed.document, passes })
    expect(commands).toHaveLength(parsed.document.racks.length)
    expect(numericPassReads).toBe(parsed.document.passes.length)
  })

  it('refuses to project the lossless tree returned for parser-rejected input', () => {
    const compiled = knitoutToKCodeWithTrace(knitoutWithMoveAndTransfer, 'command.k')
    if (!compiled.ok) throw new Error(compiled.error)
    const parsed = parseKCodeDocument(
      compiled.kcode.replace(/^HOME(?:\r?\n|\r)/, ''),
      {
        profile: KNITERATE_7GG_KCODE_PROFILE_V2,
        dialect: 'knitout-vendor',
        strict: true,
      },
    )
    expect(parsed.ok).toBe(false)
    expect(parsed.document.metadata.parseStatus).toBe('rejected')
    expect(() => projectKCodeMachineTrace(
      parsed.document,
      KNITERATE_7GG_KCODE_PROFILE_V2,
    )).toThrow(/rejected by the strict parser/)
  })

  it('fails closed before materializing an oversized selection and action graph', () => {
    const compiled = knitoutToKCodeWithTrace(knitoutWithMoveAndTransfer, 'command.k')
    if (!compiled.ok) throw new Error(compiled.error)
    const parsed = parseKCodeDocument(compiled.kcode, {
      profile: KNITERATE_7GG_KCODE_PROFILE_V2,
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
      KNITERATE_7GG_KCODE_PROFILE_V2,
    )).toThrow(/software resource limit of 200,000; split the artifact before exact trace projection/)

    // Exactly the declared budget proceeds to structural projection. This
    // forged field then fails on its intentionally absent stop markers.
    expect(() => projectKCodeMachineTrace(
      withSelectedCells(200_000),
      KNITERATE_7GG_KCODE_PROFILE_V2,
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

  it('makes every carrier and empty-selection contract field affect projection', () => {
    const compiled = knitoutToKCodeWithTrace(knitoutWithSemanticActions, 'command.k')
    if (!compiled.ok) throw new Error(compiled.error)
    const parsed = parseKCodeDocument(compiled.kcode, {
      profile: KNITERATE_7GG_KCODE_PROFILE_V2,
      dialect: 'knitout-vendor',
      strict: true,
    })
    expect(parsed.ok).toBe(true)

    const emptyMoveOperation = parsed.document.passes.find((pass) => {
      const selected = pass.frnt.value.includes('-') || pass.rear.value.includes('-')
      return !selected && pass.footer.operation !== null
    })?.footer.operation
    expect(emptyMoveOperation).toBeDefined()
    const emptyChanged = projectKCodeMachineTrace(
      parsed.document,
      withOperationContract(emptyMoveOperation!, { emptySelectionAction: 'invalid' }),
    )
    expect(emptyChanged.passes.find((pass) => pass.operation === emptyMoveOperation &&
      pass.selections.front.length + pass.selections.rear.length === 0)?.actions)
      .toContainEqual(expect.objectContaining({ kind: 'unknown', reason: 'empty-transfer' }))

    const dropOperation = parsed.document.passes.find((pass) =>
      pass.footer.carrier === '0' && (pass.frnt.value.includes('-') || pass.rear.value.includes('-')),
    )?.footer.operation
    expect(dropOperation).toBeDefined()
    const carrierZeroChanged = projectKCodeMachineTrace(
      parsed.document,
      withOperationContract(dropOperation!, { carrierZeroAction: 'xfer' }),
    )
    expect(carrierZeroChanged.passes.find((pass) => pass.operation === dropOperation && pass.carrier === '0')?.actions)
      .toContainEqual(expect.objectContaining({
        kind: 'unknown',
        reason: 'operation-contract-carrier-action',
      }))

    const regularOperation = parsed.document.passes.find((pass) =>
      pass.footer.carrier !== '0' && pass.footer.operation !== null &&
      KNITERATE_7GG_KCODE_PROFILE_V2.operations[pass.footer.operation].family === 'regular' &&
      (pass.frnt.value.includes('-') || pass.rear.value.includes('-')),
    )?.footer.operation
    expect(regularOperation).toBeDefined()
    const carrierChanged = projectKCodeMachineTrace(
      parsed.document,
      withOperationContract(regularOperation!, { carrierAction: 'split' }),
    )
    expect(carrierChanged.passes.find((pass) => pass.operation === regularOperation && pass.carrier !== '0')?.actions)
      .toContainEqual(expect.objectContaining({
        kind: 'unknown',
        reason: 'operation-contract-carrier-action',
      }))

    const splitOperation = parsed.document.passes.find((pass) =>
      pass.footer.carrier !== null
      && pass.footer.carrier !== '0'
      && pass.footer.operation !== null
      && KNITERATE_7GG_KCODE_PROFILE_V2.operations[pass.footer.operation].family === 'transfer',
    )?.footer.operation
    expect(splitOperation).toBeDefined()
    const splitCarrierChanged = projectKCodeMachineTrace(
      parsed.document,
      withOperationContract(splitOperation!, { carrierAction: 'bed-operation' }),
    )
    const splitUnknown = splitCarrierChanged.passes
      .find((pass) => pass.operation === splitOperation)?.actions
      .find((action) => action.kind === 'unknown')
    expect(splitUnknown).toMatchObject({
      kind: 'unknown',
      reason: 'operation-contract-carrier-action',
    })
    expect(splitUnknown?.selections).toHaveLength(2)

    const xferCompiled = knitoutToKCodeWithTrace(knitoutWithMoveAndTransfer, 'command.k')
    if (!xferCompiled.ok) throw new Error(xferCompiled.error)
    const xferParsed = parseKCodeDocument(xferCompiled.kcode, {
      profile: KNITERATE_7GG_KCODE_PROFILE_V2,
      dialect: 'knitout-vendor',
      strict: true,
    })
    expect(xferParsed.ok).toBe(true)
    const xferOperation = xferParsed.document.passes.find((pass) =>
      pass.footer.carrier === '0'
      && pass.footer.operation !== null
      && KNITERATE_7GG_KCODE_PROFILE_V2.operations[pass.footer.operation].family === 'transfer',
    )?.footer.operation
    expect(xferOperation).toBeDefined()
    const xferCarrierChanged = projectKCodeMachineTrace(
      xferParsed.document,
      withOperationContract(xferOperation!, { carrierZeroAction: 'drop' }),
    )
    const xferUnknown = xferCarrierChanged.passes
      .find((pass) => pass.operation === xferOperation)?.actions
      .find((action) => action.kind === 'unknown')
    expect(xferUnknown).toMatchObject({
      kind: 'unknown',
      reason: 'operation-contract-carrier-action',
    })
    expect(xferUnknown?.selections).toHaveLength(2)
  })

  it('rejects a profile that does not match the document contract', () => {
    const compiled = knitoutToKCodeWithTrace(knitoutWithMoveAndTransfer, 'command.k')
    if (!compiled.ok) throw new Error(compiled.error)
    const parsed = parseKCodeDocument(compiled.kcode, {
      profile: KNITERATE_7GG_KCODE_PROFILE_V2,
      dialect: 'knitout-vendor',
      strict: true,
    })

    expect(() => projectKCodeMachineTrace(parsed.document, {
      ...KNITERATE_7GG_KCODE_PROFILE_V2,
      profileId: 'different-profile',
    })).toThrow(/document targets .* projection received/)
    expect(() => projectKCodeMachineTrace(parsed.document, {
      ...KNITERATE_7GG_KCODE_PROFILE_V2,
      profileVersion: 1,
    })).toThrow(/document targets .* projection received/)
  })

  it('fails closed at every defensive document and profile boundary', () => {
    const compiled = knitoutToKCodeWithTrace(knitoutWithMoveAndTransfer, 'command.k')
    if (!compiled.ok) throw new Error(compiled.error)
    const parsed = parseKCodeDocument(compiled.kcode, {
      profile: KNITERATE_7GG_KCODE_PROFILE_V2,
      dialect: 'knitout-vendor',
      strict: true,
    })
    if (!parsed.ok) throw new Error('Expected strict fixture to parse')
    const document = parsed.document
    const first = document.passes[0]!
    const selectedTracePass = projectKCodeMachineTrace(
      document,
      KNITERATE_7GG_KCODE_PROFILE_V2,
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
      expect(() => projectKCodeMachineTrace(candidate as typeof document, profile as typeof KNITERATE_7GG_KCODE_PROFILE_V2))
        .toThrow(message)
    }

    assertFailure({ ...document, metadata: { ...document.metadata, strict: false } }, KNITERATE_7GG_KCODE_PROFILE_V2, /must record strict parsing/)
    assertFailure({ ...document, unknownRecords: [document.records[0]!] }, KNITERATE_7GG_KCODE_PROFILE_V2, /contains unknown records/)
    assertFailure({ ...document, home: null }, KNITERATE_7GG_KCODE_PROFILE_V2, /does not contain HOME/)
    assertFailure({ ...document, initialRack: null }, KNITERATE_7GG_KCODE_PROFILE_V2, /initial RACK:0/)
    assertFailure({ ...document, passes: [] }, KNITERATE_7GG_KCODE_PROFILE_V2, /complete passes/)
    assertFailure(document, { ...KNITERATE_7GG_KCODE_PROFILE_V2, supportedDialects: [] }, /does not support dialect/)
    assertFailure(document, {
      ...KNITERATE_7GG_KCODE_PROFILE_V2,
      dialects: {},
    }, /does not define dialect/)
    assertFailure(withFirst({
      frnt: { ...first.frnt, value: first.frnt.value.replace('/', '_') },
    }), KNITERATE_7GG_KCODE_PROFILE_V2, /FRNT markers must be .*; received 2 \.\.\. 2 \.\.\. \\/)
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
    }, KNITERATE_7GG_KCODE_PROFILE_V2, /FRNT markers must be/)
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
    }), KNITERATE_7GG_KCODE_PROFILE_V2, /encode different stop coordinates/)
    assertFailure(withFirst({
      stif: { ...first.stif, value: first.stif.value.slice(1) },
    }), KNITERATE_7GG_KCODE_PROFILE_V2, /does not match stitch width/)
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
    }, KNITERATE_7GG_KCODE_PROFILE_V2, /unsupported stitch selector/)
    const unsupportedTrace = projectKCodeMachineTrace(document, {
      ...KNITERATE_7GG_KCODE_PROFILE_V2,
      operations: {
        ...KNITERATE_7GG_KCODE_PROFILE_V2.operations,
        [first.footer.operation!]: undefined,
      },
    } as typeof KNITERATE_7GG_KCODE_PROFILE_V2)
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
      }), KNITERATE_7GG_KCODE_PROFILE_V2, /fully parsed footer/)
    }
    assertFailure({
      ...document,
      racks: document.racks.map((rack, index) => index === 0
        ? { ...rack, value: null }
        : rack),
    }, KNITERATE_7GG_KCODE_PROFILE_V2, /does not have a parsed finite value/)
    assertFailure({
      ...document,
      racks: document.racks.map((rack, index) => index === 0
        ? { ...rack, recordIndex: document.records.length + 1 }
        : rack),
    }, KNITERATE_7GG_KCODE_PROFILE_V2, /absent from the document record sequence/)
    assertFailure({
      ...document,
      racks: document.racks.map((rack, index) => index === 0
        ? { ...rack, recordIndex: document.home!.recordIndex }
        : rack),
    }, KNITERATE_7GG_KCODE_PROFILE_V2, /absent from the document record sequence/)
  })
})
