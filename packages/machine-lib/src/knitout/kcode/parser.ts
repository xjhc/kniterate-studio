import type { KCodeCarrierToken, KCodeMachineProfileV1 } from './machine-profile.js'
import type {
  KCodeBlankRecord,
  KCodeCommentRecord,
  KCodeDiagnostic,
  KCodeDiagnosticRule,
  KCodeDiagnosticSeverity,
  KCodeDocumentV1,
  KCodeFooterRecord,
  KCodeFooterToken,
  KCodeHomeRecord,
  KCodeLineEnding,
  KCodePassBlock,
  KCodePassFieldRecord,
  KCodeRackRecord,
  KCodeRecord,
  KCodeSourcePosition,
  KCodeSourceSpan,
  KCodeUnknownRecord,
  ParseKCodeDocumentOptions,
  ParseKCodeDocumentResult,
} from './types.js'

const FIELD_ORDER = ['FRNT', 'STIF', 'REAR', 'STIR'] as const
const DECIMAL_NUMBER = /^[+-]?(?:\d+(?:\.\d+)?|\.\d+)$/
const FOOTER_OPERATION = /^[A-Za-z][A-Za-z0-9]*(?:-[A-Za-z][A-Za-z0-9]*)+$/
const SUPPORTED_OPERATIONS = new Set([
  'Kn-Kn',
  'Tu-Tu',
  'Kn-Tu',
  'Tu-Kn',
  'Tr-Rl',
  'Tr-Rr',
  'Rl-Tr',
  'Rr-Tr',
])

interface ScannedLine {
  readonly recordIndex: number
  readonly line: number
  readonly raw: string
  readonly lineEnding: KCodeLineEnding
  readonly span: KCodeSourceSpan
  readonly fullSpan: KCodeSourceSpan
}

interface PendingPass {
  readonly rackAtStart: number
  readonly fields: KCodePassFieldRecord[]
}

type AddDiagnostic = (
  rule: KCodeDiagnosticRule,
  message: string,
  span: KCodeSourceSpan,
  severity?: KCodeDiagnosticSeverity,
) => void

function position(offset: number, line: number, column: number): KCodeSourcePosition {
  return { offset, line, column }
}

function scanSourceLines(source: string): ScannedLine[] {
  const lines: ScannedLine[] = []
  let offset = 0
  let line = 1

  while (offset < source.length) {
    const contentStart = offset
    while (offset < source.length && source[offset] !== '\r' && source[offset] !== '\n') offset++
    const contentEnd = offset

    let lineEnding: KCodeLineEnding = ''
    if (source[offset] === '\r' && source[offset + 1] === '\n') {
      lineEnding = '\r\n'
      offset += 2
    } else if (source[offset] === '\r') {
      lineEnding = '\r'
      offset++
    } else if (source[offset] === '\n') {
      lineEnding = '\n'
      offset++
    }

    const raw = source.slice(contentStart, contentEnd)
    const span: KCodeSourceSpan = {
      start: position(contentStart, line, 1),
      end: position(contentEnd, line, raw.length + 1),
    }
    const fullSpan: KCodeSourceSpan = lineEnding === ''
      ? span
      : {
          start: span.start,
          end: position(offset, line + 1, 1),
        }

    lines.push({
      recordIndex: lines.length,
      line,
      raw,
      lineEnding,
      span,
      fullSpan,
    })
    line++
  }

  return lines
}

function spanWithin(line: ScannedLine, startIndex: number, endIndex: number): KCodeSourceSpan {
  return {
    start: position(line.span.start.offset + startIndex, line.line, startIndex + 1),
    end: position(line.span.start.offset + endIndex, line.line, endIndex + 1),
  }
}

function tokeniseFooter(line: ScannedLine): KCodeFooterToken[] {
  const tokens: KCodeFooterToken[] = []
  for (const match of line.raw.matchAll(/\S+/g)) {
    const start = match.index
    const raw = match[0]
    tokens.push({ raw, span: spanWithin(line, start, start + raw.length) })
  }
  return tokens
}

function parseNumber(raw: string | undefined): number | null {
  if (raw === undefined || !DECIMAL_NUMBER.test(raw)) return null
  const value = Number(raw)
  return Number.isFinite(value) ? value : null
}

function firstInvalidCharacter(value: string, allowed: ReadonlySet<string>): number {
  for (let index = 0; index < value.length; index++) {
    if (!allowed.has(value[index]!)) return index
  }
  return -1
}

function classifyRecord(
  line: ScannedLine,
  profile: KCodeMachineProfileV1,
  strict: boolean,
  addDiagnostic: AddDiagnostic,
): KCodeRecord {
  if (line.raw === 'HOME') {
    return { ...line, kind: 'home' } satisfies KCodeHomeRecord
  }

  if (line.raw.startsWith('RACK:')) {
    const valueRaw = line.raw.slice(5)
    const valueSpan = spanWithin(line, 5, line.raw.length)
    const value = parseNumber(valueRaw)
    if (value === null) {
      addDiagnostic(
        'kcode.invalid-rack',
        `RACK requires one finite decimal number; received ${JSON.stringify(valueRaw)}.`,
        valueSpan,
      )
    } else if (!profile.rack.values.some((supported) => supported === value)) {
      addDiagnostic(
        'kcode.invalid-rack',
        `RACK value ${value} is outside profile ${profile.profileId}@${profile.profileVersion}; expected one of ${profile.rack.values.join(', ')}.`,
        valueSpan,
      )
    }
    return { ...line, kind: 'rack', valueRaw, value, valueSpan } satisfies KCodeRackRecord
  }

  const field = FIELD_ORDER.find((name) => line.raw.startsWith(`${name}:`))
  if (field !== undefined) {
    const value = line.raw.slice(5)
    const valueSpan = spanWithin(line, 5, line.raw.length)
    const allowed = field === 'FRNT' || field === 'REAR'
      ? new Set(['.', '_', '-', '/', '\\', ...profile.machine.carriers])
      : new Set(profile.stitchSelectors.encoding.alphabet)
    const invalidIndex = firstInvalidCharacter(value, allowed)
    if (value.length === 0 || invalidIndex !== -1) {
      const index = invalidIndex === -1 ? 0 : invalidIndex
      const invalidSpan = value.length === 0
        ? valueSpan
        : spanWithin(line, 5 + index, 6 + index)
      addDiagnostic(
        'kcode.field-charset',
        value.length === 0
          ? `${field} payload must not be empty.`
          : `${field} contains unsupported character ${JSON.stringify(value[index])}.`,
        invalidSpan,
      )
    }
    return { ...line, kind: 'pass-field', field, value, valueSpan } satisfies KCodePassFieldRecord
  }

  if (line.raw.startsWith('>>') || line.raw.startsWith('<<')) {
    const tokens = tokeniseFooter(line)
    if (tokens.length !== 5) {
      addDiagnostic(
        'kcode.footer-arity',
        `Pass footer requires exactly 5 tokens (direction, operation, carrier, speed, roller); received ${tokens.length}.`,
        line.span,
      )
    }
    if (tokens.map((token) => token.raw).join(' ') !== line.raw) {
      addDiagnostic(
        'kcode.footer-whitespace',
        'Pass footer tokens must be separated by exactly one ASCII space with no leading or trailing whitespace.',
        line.span,
      )
    }

    const directionRaw = tokens[0]?.raw
    const direction = directionRaw === '>>' || directionRaw === '<<' ? directionRaw : null
    if (directionRaw !== undefined && direction === null) {
      addDiagnostic(
        'kcode.footer-direction',
        `Pass direction must be ">>" or "<<"; received ${JSON.stringify(directionRaw)}.`,
        tokens[0]!.span,
      )
    }

    const operationRaw = tokens[1]?.raw
    const operation = operationRaw !== undefined
      && FOOTER_OPERATION.test(operationRaw)
      && SUPPORTED_OPERATIONS.has(operationRaw)
      ? operationRaw
      : null
    if (operationRaw !== undefined && operation === null) {
      addDiagnostic(
        'kcode.footer-operation',
        `Pass operation is not in the supported KCode operation set: ${JSON.stringify(operationRaw)}.`,
        tokens[1]!.span,
      )
    }

    const carrierRaw = tokens[2]?.raw
    const supportedCarriers = new Set<KCodeCarrierToken>(['0', ...profile.machine.carriers])
    const carrier = carrierRaw !== undefined && supportedCarriers.has(carrierRaw as KCodeCarrierToken)
      ? carrierRaw as KCodeCarrierToken
      : null
    if (carrierRaw !== undefined && carrier === null) {
      addDiagnostic(
        'kcode.footer-carrier',
        `Pass carrier must be 0 or one of ${profile.machine.carriers.join(', ')}; received ${JSON.stringify(carrierRaw)}.`,
        tokens[2]!.span,
      )
    }

    const speedRaw = tokens[3]?.raw ?? null
    const speed = parseNumber(tokens[3]?.raw)
    if (tokens[3] !== undefined && speed === null) {
      addDiagnostic(
        'kcode.footer-number',
        `Pass speed must be a finite decimal number; received ${JSON.stringify(tokens[3].raw)}.`,
        tokens[3].span,
      )
    }

    const rollerRaw = tokens[4]?.raw ?? null
    const roller = parseNumber(tokens[4]?.raw)
    if (tokens[4] !== undefined && roller === null) {
      addDiagnostic(
        'kcode.footer-number',
        `Pass roller must be a finite decimal number; received ${JSON.stringify(tokens[4].raw)}.`,
        tokens[4].span,
      )
    }

    return {
      ...line,
      kind: 'footer',
      tokens,
      direction,
      operation,
      carrier,
      speedRaw,
      speed,
      rollerRaw,
      roller,
    } satisfies KCodeFooterRecord
  }

  if (line.raw.startsWith('//')) {
    return { ...line, kind: 'comment', text: line.raw.slice(2) } satisfies KCodeCommentRecord
  }

  if (line.raw === '') {
    return { ...line, kind: 'blank' } satisfies KCodeBlankRecord
  }

  addDiagnostic(
    'kcode.unknown-record',
    `Unknown KCode record ${JSON.stringify(line.raw)}.`,
    line.span,
    strict ? 'error' : 'warning',
  )
  return { ...line, kind: 'unknown' } satisfies KCodeUnknownRecord
}

function validateBedMarkers(
  field: KCodePassFieldRecord,
  carrier: KCodeCarrierToken,
  profile: KCodeMachineProfileV1,
  addDiagnostic: AddDiagnostic,
): readonly [string, number][] | null {
  const markers: [string, number][] = []
  for (let index = 0; index < field.value.length; index++) {
    const value = field.value[index]!
    if (value === '/' || value === '\\' || profile.machine.carriers.includes(value as Exclude<KCodeCarrierToken, '0'>)) {
      markers.push([value, index])
    }
  }

  const expectedMarkers = carrier === '0'
    ? ['/', '\\']
    : ['/', carrier, carrier, '\\']
  const markerOrderValid = markers.length === expectedMarkers.length
    && markers.every(([value], index) => value === expectedMarkers[index])

  if (!markerOrderValid) {
    addDiagnostic(
      'kcode.bed-markers',
      carrier === '0'
        ? `${field.field} requires one ordered /...\\ carriage-marker pair and no carrier markers.`
        : `${field.field} requires one ordered /...\\ carriage-marker pair and exactly two ${carrier} carrier markers.`,
      field.valueSpan,
    )
    return null
  }

  return markers
}

function validatePassBlock(
  pass: KCodePassBlock,
  profile: KCodeMachineProfileV1,
  addDiagnostic: AddDiagnostic,
): void {
  const { frnt, stif, rear, stir, footer } = pass
  if (stif.value.length !== stir.value.length) {
    addDiagnostic(
      'kcode.field-width',
      `STIF and STIR widths must match; received ${stif.value.length} and ${stir.value.length}.`,
      stir.valueSpan,
    )
  }
  if (frnt.value.length !== rear.value.length) {
    addDiagnostic(
      'kcode.field-width',
      `FRNT and REAR widths must match; received ${frnt.value.length} and ${rear.value.length}.`,
      rear.valueSpan,
    )
  }

  const baseWidth = stif.value.length
  const standardWidth = profile.raster.standardBasePayloadColumns
  const legacy = profile.raster.legacyEmptyMove
  const isLegacyEmptyMove =
    baseWidth === legacy.basePayloadColumns
    && footer.carrier === legacy.carrier
    && footer.operation === legacy.passType
    && !frnt.value.includes('-')
    && !rear.value.includes('-')

  if (baseWidth !== standardWidth && !isLegacyEmptyMove) {
    addDiagnostic(
      'kcode.field-width',
      `Stitch raster width must be ${standardWidth}; ${legacy.basePayloadColumns} is reserved for empty carrier-0 ${legacy.passType} moves. Received ${baseWidth}.`,
      stif.valueSpan,
    )
  }

  if (footer.carrier === null) return

  const markerCount = footer.carrier === '0' ? 2 : 4
  const expectedBedWidth = baseWidth + markerCount
  for (const bed of [frnt, rear]) {
    if (bed.value.length !== expectedBedWidth) {
      addDiagnostic(
        'kcode.field-width',
        `${bed.field} width must equal stitch width ${baseWidth} plus ${markerCount} carriage/carrier markers; expected ${expectedBedWidth}, received ${bed.value.length}.`,
        bed.valueSpan,
      )
    }
  }

  const frontMarkers = validateBedMarkers(frnt, footer.carrier, profile, addDiagnostic)
  const rearMarkers = validateBedMarkers(rear, footer.carrier, profile, addDiagnostic)
  if (frontMarkers !== null && rearMarkers !== null) {
    const frontSignature = frontMarkers.map(([value, index]) => `${value}:${index}`).join('|')
    const rearSignature = rearMarkers.map(([value, index]) => `${value}:${index}`).join('|')
    if (frontSignature !== rearSignature) {
      addDiagnostic(
        'kcode.bed-markers',
        'FRNT and REAR carriage/carrier markers must occupy identical columns.',
        rear.valueSpan,
      )
    }
  }

  for (const bed of [frnt, rear]) {
    const markerFree = [...bed.value]
      .filter((value) => value !== '/' && value !== '\\' && !profile.machine.carriers.includes(value as Exclude<KCodeCarrierToken, '0'>))
      .join('')
    if (markerFree.length !== baseWidth) continue

    const left = markerFree.slice(0, profile.raster.leftPaddingColumns)
    const right = markerFree.slice(-profile.raster.rightPaddingColumns)
    if (!/^\.*$/.test(left) || !/^\.*$/.test(right)) {
      addDiagnostic(
        'kcode.bed-padding',
        `${bed.field} must retain ${profile.raster.leftPaddingColumns} left and ${profile.raster.rightPaddingColumns} right padding dots after marker removal.`,
        bed.valueSpan,
      )
    }
  }
}

function endOfDocumentSpan(records: readonly KCodeRecord[]): KCodeSourceSpan {
  if (records.length === 0) {
    const point = position(0, 1, 1)
    return { start: point, end: point }
  }
  const point = records[records.length - 1]!.fullSpan.end
  return { start: point, end: point }
}

/**
 * Parse KCode without normalizing or inferring its dialect.
 *
 * A document is accepted only when `ok` is true. Invalid input still returns a
 * lossless record tree so diagnostics and source views never discard bytes.
 */
export function parseKCodeDocument(
  source: string,
  options: ParseKCodeDocumentOptions,
): ParseKCodeDocumentResult {
  const diagnostics: KCodeDiagnostic[] = []
  const addDiagnostic: AddDiagnostic = (rule, message, span, severity = 'error') => {
    diagnostics.push({
      severity,
      rule,
      message,
      span,
      line: span.start.line,
      column: span.start.column,
      endLine: span.end.line,
      endColumn: span.end.column,
    })
  }

  const scannedLines = scanSourceLines(source)
  const documentEnd = scannedLines.length === 0
    ? endOfDocumentSpan([])
    : scannedLines[scannedLines.length - 1]!.fullSpan

  if (!options.profile.supportedDialects.includes(options.dialect)) {
    addDiagnostic(
      'kcode.unsupported-dialect',
      `Profile ${options.profile.profileId}@${options.profile.profileVersion} does not support dialect ${JSON.stringify(options.dialect)}.`,
      { start: documentEnd.end, end: documentEnd.end },
    )
  }

  const records = scannedLines.map((line) =>
    classifyRecord(line, options.profile, options.strict, addDiagnostic))

  for (const line of scannedLines) {
    for (let index = 0; index < line.raw.length; index++) {
      const code = line.raw.charCodeAt(index)
      if (code === 0x09 || (code >= 0x20 && code <= 0x7e)) continue
      addDiagnostic(
        'kcode.source-byte',
        `KCode source must use printable 7-bit ASCII (plus tab and line endings); found code unit 0x${code.toString(16).padStart(2, '0')}.`,
        spanWithin(line, index, index + 1),
      )
    }
  }

  const racks: KCodeRackRecord[] = []
  const passes: KCodePassBlock[] = []
  const unknownRecords: KCodeUnknownRecord[] = []
  let home: KCodeHomeRecord | null = null
  let initialRack: KCodeRackRecord | null = null
  let currentRack = 0
  let pending: PendingPass | null = null
  let sawProgramContent = false
  let reportedPassBeforeHome = false
  let reportedMissingInitialRack = false
  let sawPassRecord = false

  const interruptPending = (record: KCodeRecord): void => {
    if (pending === null) return
    addDiagnostic(
      'kcode.pass-interrupted',
      `Pass block must be contiguous in FRNT, STIF, REAR, STIR, footer order; ${record.kind} interrupted it.`,
      record.span,
    )
  }

  const incompletePending = (at: KCodeSourceSpan): void => {
    if (pending === null) return
    const seen = pending.fields.map((field) => field.field).join(', ') || 'no fields'
    addDiagnostic(
      'kcode.incomplete-pass',
      `Pass block is incomplete; expected FRNT, STIF, REAR, STIR, footer and saw ${seen}.`,
      at,
    )
  }

  for (const record of records) {
    switch (record.kind) {
      case 'home': {
        interruptPending(record)
        if (home !== null) {
          addDiagnostic('kcode.duplicate-home', 'KCode document may contain only one HOME record.', record.span)
        } else {
          home = record
        }
        if (sawProgramContent) {
          addDiagnostic('kcode.home-order', 'HOME must precede rack state and all pass blocks.', record.span)
        }
        break
      }

      case 'rack': {
        const interruptsPass = pending !== null
        interruptPending(record)
        racks.push(record)
        sawProgramContent = true
        if (home === null) {
          addDiagnostic(
            'kcode.rack-order',
            'The initial RACK:0 record must appear after HOME.',
            record.span,
          )
        } else if (initialRack === null) {
          if (sawPassRecord) {
            addDiagnostic(
              'kcode.rack-order',
              'The initial RACK:0 record must appear before every pass field and footer.',
              record.span,
            )
          } else {
            initialRack = record
            if (record.value !== 0) {
              addDiagnostic(
                'kcode.initial-rack',
                `The first rack record after HOME must be RACK:0; received ${JSON.stringify(record.valueRaw)}.`,
                record.valueSpan,
              )
            }
          }
        } else if (interruptsPass) {
          addDiagnostic(
            'kcode.rack-order',
            'RACK records may appear only between complete pass blocks.',
            record.span,
          )
        }
        if (record.value !== null) currentRack = record.value
        break
      }

      case 'pass-field': {
        sawProgramContent = true
        sawPassRecord = true
        if (home === null && !reportedPassBeforeHome) {
          addDiagnostic('kcode.home-order', 'Pass blocks may not appear before HOME.', record.span)
          reportedPassBeforeHome = true
        }
        if (initialRack === null && !reportedMissingInitialRack) {
          addDiagnostic(
            'kcode.missing-initial-rack',
            'Pass blocks require an initial RACK:0 record after HOME.',
            record.span,
          )
          reportedMissingInitialRack = true
        }

        if (record.field === 'FRNT' && pending !== null) {
          incompletePending(record.span)
          pending = null
        }

        if (pending === null) {
          if (record.field !== 'FRNT') {
            addDiagnostic(
              'kcode.orphan-field',
              `${record.field} appeared without a preceding FRNT.`,
              record.span,
            )
            break
          }
          pending = { rackAtStart: currentRack, fields: [] }
        }

        const expected = FIELD_ORDER[pending.fields.length]
        if (record.field !== expected) {
          addDiagnostic(
            'kcode.field-order',
            expected === undefined
              ? `Unexpected extra ${record.field}; pass already has all four raster fields.`
              : `Expected ${expected} but received ${record.field}.`,
            record.span,
          )
        }
        pending.fields.push(record)
        break
      }

      case 'footer': {
        sawProgramContent = true
        sawPassRecord = true
        if (pending === null) {
          addDiagnostic('kcode.orphan-footer', 'Pass footer appeared without a preceding FRNT block.', record.span)
          break
        }

        const fields = pending.fields
        const exactOrder = fields.length === FIELD_ORDER.length
          && FIELD_ORDER.every((field, index) => fields[index]?.field === field)
        if (!exactOrder) {
          incompletePending(record.span)
          pending = null
          break
        }

        const pass: KCodePassBlock = {
          index: passes.length,
          rack: pending.rackAtStart,
          frnt: fields[0]!,
          stif: fields[1]!,
          rear: fields[2]!,
          stir: fields[3]!,
          footer: record,
          span: { start: fields[0]!.span.start, end: record.span.end },
          fullSpan: { start: fields[0]!.span.start, end: record.fullSpan.end },
        }
        passes.push(pass)
        validatePassBlock(pass, options.profile, addDiagnostic)
        pending = null
        break
      }

      case 'unknown':
        interruptPending(record)
        unknownRecords.push(record)
        sawProgramContent = true
        break

      case 'comment':
      case 'blank':
        interruptPending(record)
        break
    }
  }

  if (pending !== null) incompletePending(endOfDocumentSpan(records))
  if (home === null) {
    addDiagnostic('kcode.missing-home', 'KCode document must contain a HOME record.', endOfDocumentSpan(records))
  }
  if (initialRack === null && !reportedMissingInitialRack) {
    addDiagnostic(
      'kcode.missing-initial-rack',
      'KCode document must contain an initial RACK:0 record after HOME and before all pass blocks.',
      endOfDocumentSpan(records),
    )
  }
  if (passes.length === 0) {
    addDiagnostic('kcode.no-passes', 'KCode document must contain at least one complete pass block.', endOfDocumentSpan(records))
  }

  diagnostics.sort((a, b) =>
    a.span.start.offset - b.span.start.offset
    || a.span.end.offset - b.span.end.offset
    || a.rule.localeCompare(b.rule))

  const accepted = !diagnostics.some((diagnostic) => diagnostic.severity === 'error')
  const document: KCodeDocumentV1 = {
    metadata: {
      schemaVersion: 1,
      profileId: options.profile.profileId,
      profileVersion: options.profile.profileVersion,
      dialect: options.dialect,
      strict: options.strict,
      parseStatus: accepted ? 'accepted' : 'rejected',
    },
    rawText: source,
    records,
    home,
    initialRack,
    racks,
    passes,
    unknownRecords,
  }

  return {
    document,
    diagnostics,
    ok: accepted,
  }
}
