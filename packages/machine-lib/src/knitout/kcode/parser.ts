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
  KCodeResourceProfileV1,
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
const SOURCE_BYTE_DETAIL_CODE_UNIT_LIMIT = 64
const DIAGNOSTIC_RAW_PREVIEW_CODE_UNITS = 120
export const MAX_KCODE_SOURCE_CODE_UNITS = 64 * 1024 * 1024
const MAX_KCODE_RECORD_CODE_UNITS = 2 * 1024 * 1024
const MAX_KCODE_DIAGNOSTIC_DETAILS = 512

/** Fixed parser allocation envelopes. KCode has no trustworthy in-band origin,
 * so both contexts share the 100k-record / 8192-pass self-reopen envelope. */
export const KCODE_RESOURCE_LIMITS_V1 = Object.freeze({
  'foreign-v1': Object.freeze({ records: 100_000, passRecords: 8_192 }),
  'authored-v1': Object.freeze({ records: 100_000, passRecords: 8_192 }),
} as const) satisfies Record<KCodeResourceProfileV1, {
  readonly records: number
  readonly passRecords: number
}>

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

function sourceResourceLimit(
  source: string,
  resourceProfile: KCodeResourceProfileV1,
): { readonly message: string; readonly span: KCodeSourceSpan } | null {
  const limits = KCODE_RESOURCE_LIMITS_V1[resourceProfile]
  const origin = position(0, 1, 1)
  if (source.length > MAX_KCODE_SOURCE_CODE_UNITS) {
    return {
      message: `KCode source exceeds the ${MAX_KCODE_SOURCE_CODE_UNITS}-code-unit strict-intake limit; received ${source.length}. The exact raw source is retained, but records were not materialized.`,
      span: { start: origin, end: origin },
    }
  }

  let offset = 0
  let line = 1
  let recordCount = 0
  let passRecordCount = 0
  while (offset < source.length) {
    const contentStart = offset
    recordCount++
    if (recordCount > limits.records) {
      const point = position(contentStart, line, 1)
      return {
        message: `KCode source exceeds the ${limits.records}-record strict-intake limit. The exact raw source is retained, but records were not materialized.`,
        span: { start: point, end: point },
      }
    }
    const first = source.charCodeAt(contentStart)
    if (
      (first === 0x3e && source.charCodeAt(contentStart + 1) === 0x3e)
      || (first === 0x3c && source.charCodeAt(contentStart + 1) === 0x3c)
    ) {
      passRecordCount++
      if (passRecordCount > limits.passRecords) {
        const point = position(contentStart, line, 1)
        return {
          message: `KCode source exceeds the ${limits.passRecords}-pass-record strict-intake limit. The exact raw source is retained, but records were not materialized.`,
          span: { start: point, end: point },
        }
      }
    }
    while (offset < source.length && source[offset] !== '\r' && source[offset] !== '\n') offset++
    if (offset - contentStart > MAX_KCODE_RECORD_CODE_UNITS) {
      const point = position(contentStart, line, 1)
      return {
        message: `KCode record ${line} exceeds the ${MAX_KCODE_RECORD_CODE_UNITS}-code-unit line limit. The exact raw source is retained, but records were not materialized.`,
        span: { start: point, end: point },
      }
    }
    if (source[offset] === '\r' && source[offset + 1] === '\n') offset += 2
    else if (source[offset] === '\r' || source[offset] === '\n') offset++
    line++
  }
  return null
}

function resourceLimitedResult(
  source: string,
  options: ParseKCodeDocumentOptions,
  limit: NonNullable<ReturnType<typeof sourceResourceLimit>>,
): ParseKCodeDocumentResult {
  const diagnostic: KCodeDiagnostic = {
    severity: 'error',
    rule: 'kcode.resource-limit',
    message: limit.message,
    span: limit.span,
    line: limit.span.start.line,
    column: limit.span.start.column,
    endLine: limit.span.end.line,
    endColumn: limit.span.end.column,
  }
  return {
    ok: false,
    diagnostics: [diagnostic],
    document: {
      metadata: {
        schemaVersion: 1,
        profileId: options.profile.profileId,
        profileVersion: options.profile.profileVersion,
        resourceProfile: options.resourceProfile ?? 'foreign-v1',
        dialect: options.dialect,
        strict: options.strict,
        parseStatus: 'rejected',
        sourceRetention: 'exact',
        recordMaterialization: 'resource-limited',
      },
      rawText: source,
      records: [],
      home: null,
      initialRack: null,
      racks: [],
      passes: [],
      unknownRecords: [],
    },
  }
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

function diagnosticRawPreview(raw: string): string {
  if (raw.length <= DIAGNOSTIC_RAW_PREVIEW_CODE_UNITS) return JSON.stringify(raw)
  return `${JSON.stringify(raw.slice(0, DIAGNOSTIC_RAW_PREVIEW_CODE_UNITS))}… (${raw.length} code units total)`
}

function isAcceptedSourceCodeUnit(code: number): boolean {
  return code === 0x09 || (code >= 0x20 && code <= 0x7e)
}

/**
 * Report invalid source code units without allocating one diagnostic per unit.
 * Contiguous invalid units share a diagnostic, and only the first fixed-size
 * code-unit budget receives detailed spans. The remainder is represented by
 * one deterministic summary while the scanned records retain the full source.
 */
function validateSourceCodeUnits(
  lines: readonly ScannedLine[],
  addDiagnostic: AddDiagnostic,
): void {
  let remainingDetailCodeUnits = SOURCE_BYTE_DETAIL_CODE_UNIT_LIMIT
  let detailedDiagnosticCount = 0
  let omittedCodeUnits = 0
  let omittedRangeCount = 0
  let firstOmittedStart: KCodeSourcePosition | null = null
  let lastOmittedEnd: KCodeSourcePosition | null = null

  const omit = (span: KCodeSourceSpan, count: number): void => {
    if (count === 0) return
    omittedCodeUnits += count
    omittedRangeCount++
    firstOmittedStart ??= span.start
    lastOmittedEnd = span.end
  }

  for (const line of lines) {
    let index = 0
    while (index < line.raw.length) {
      if (isAcceptedSourceCodeUnit(line.raw.charCodeAt(index))) {
        index++
        continue
      }

      const runStart = index
      while (
        index < line.raw.length
        && !isAcceptedSourceCodeUnit(line.raw.charCodeAt(index))
      ) index++
      const runEnd = index
      const detailedLength = Math.min(runEnd - runStart, remainingDetailCodeUnits)

      if (detailedLength > 0) {
        const detailEnd = runStart + detailedLength
        const firstCode = line.raw.charCodeAt(runStart)
        addDiagnostic(
          'kcode.source-byte',
          detailedLength === 1
            ? `KCode source must use printable 7-bit ASCII (plus tab and line endings); found code unit 0x${firstCode.toString(16).padStart(2, '0')}.`
            : `KCode source must use printable 7-bit ASCII (plus tab and line endings); found ${detailedLength} consecutive invalid code units beginning with 0x${firstCode.toString(16).padStart(2, '0')}.`,
          spanWithin(line, runStart, detailEnd),
        )
        detailedDiagnosticCount++
        remainingDetailCodeUnits -= detailedLength
        if (detailEnd < runEnd) {
          omit(spanWithin(line, detailEnd, runEnd), runEnd - detailEnd)
        }
      } else {
        omit(spanWithin(line, runStart, runEnd), runEnd - runStart)
      }
    }
  }

  if (firstOmittedStart !== null && lastOmittedEnd !== null) {
    addDiagnostic(
      'kcode.source-byte-summary',
      `Invalid-source diagnostics were truncated after ${SOURCE_BYTE_DETAIL_CODE_UNIT_LIMIT} code units in ${detailedDiagnosticCount} grouped report${detailedDiagnosticCount === 1 ? '' : 's'}; ${omittedCodeUnits} additional invalid code units across ${omittedRangeCount} range${omittedRangeCount === 1 ? '' : 's'} were omitted.`,
      { start: firstOmittedStart, end: lastOmittedEnd },
    )
  }
}

function classifyRecord(
  line: ScannedLine,
  profile: KCodeMachineProfileV1,
  strict: boolean,
  addDiagnostic: AddDiagnostic,
): KCodeRecord {
  // A leading Unicode or byte-preserved UTF-8 BOM is always rejected by the
  // source-code-unit rail, but recognizing the following HOME record prevents
  // one encoding defect from cascading into misleading unknown/missing-HOME
  // diagnostics. The original record remains byte-for-byte untouched.
  const firstRecordHome = line.recordIndex === 0
    && (line.raw === '\ufeffHOME' || line.raw === '\u00ef\u00bb\u00bfHOME')
  if (line.raw === 'HOME' || firstRecordHome) {
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
    `Unknown KCode record ${diagnosticRawPreview(line.raw)}.`,
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
      .map((value, sourceIndex) => ({ value, sourceIndex }))
      .filter(({ value }) => value !== '/' && value !== '\\' && !profile.machine.carriers.includes(value as Exclude<KCodeCarrierToken, '0'>))
    if (markerFree.length !== baseWidth) continue

    const left = markerFree.slice(0, profile.raster.leftPaddingColumns)
    const right = markerFree.slice(-profile.raster.rightPaddingColumns)
    const invalidPadding = [...left, ...right].find(({ value }) => value !== '.')
    if (invalidPadding !== undefined) {
      addDiagnostic(
        'kcode.bed-padding',
        `${bed.field} must retain ${profile.raster.leftPaddingColumns} left and ${profile.raster.rightPaddingColumns} right padding dots after marker removal.`,
        {
          start: position(
            bed.valueSpan.start.offset + invalidPadding.sourceIndex,
            bed.line,
            bed.valueSpan.start.column + invalidPadding.sourceIndex,
          ),
          end: position(
            bed.valueSpan.start.offset + invalidPadding.sourceIndex + 1,
            bed.line,
            bed.valueSpan.start.column + invalidPadding.sourceIndex + 1,
          ),
        },
      )
    }

    const recognizedNeedleColumns = baseWidth === standardWidth
      ? profile.raster.standardNeedleColumns
      : baseWidth === legacy.basePayloadColumns
        ? legacy.needleColumns
        : null
    if (recognizedNeedleColumns === null) continue

    const needleStart = profile.raster.leftPaddingColumns
    const needleDomain = markerFree.slice(needleStart, needleStart + recognizedNeedleColumns)
    const invalidNeedle = needleDomain.find(({ value }) => value !== '_' && value !== '-')
    if (invalidNeedle !== undefined) {
      addDiagnostic(
        'kcode.bed-needle-domain',
        `${bed.field} needle-domain columns must use only "_" (not selected) or "-" (selected); received ${JSON.stringify(invalidNeedle.value)}.`,
        {
          start: position(
            bed.valueSpan.start.offset + invalidNeedle.sourceIndex,
            bed.line,
            bed.valueSpan.start.column + invalidNeedle.sourceIndex,
          ),
          end: position(
            bed.valueSpan.start.offset + invalidNeedle.sourceIndex + 1,
            bed.line,
            bed.valueSpan.start.column + invalidNeedle.sourceIndex + 1,
          ),
        },
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
  const resourceProfile = options.resourceProfile ?? 'foreign-v1'
  const resourceLimit = sourceResourceLimit(source, resourceProfile)
  if (resourceLimit !== null) return resourceLimitedResult(source, options, resourceLimit)

  const diagnostics: KCodeDiagnostic[] = []
  let omittedDiagnosticCount = 0
  let omittedErrorCount = 0
  let omittedWarningCount = 0
  let omittedStart: KCodeSourcePosition | null = null
  let omittedEnd: KCodeSourcePosition | null = null
  const addDiagnostic: AddDiagnostic = (rule, message, span, severity = 'error') => {
    if (diagnostics.length >= MAX_KCODE_DIAGNOSTIC_DETAILS) {
      omittedDiagnosticCount++
      if (severity === 'error') omittedErrorCount++
      else omittedWarningCount++
      if (omittedStart === null || span.start.offset < omittedStart.offset) omittedStart = span.start
      if (omittedEnd === null || span.end.offset > omittedEnd.offset) omittedEnd = span.end
      return
    }
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
  validateSourceCodeUnits(scannedLines, addDiagnostic)

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

  // TypeScript does not model assignments made by the addDiagnostic closure,
  // so re-widen the captured positions before narrowing them here.
  const diagnosticSummaryStart = omittedStart as KCodeSourcePosition | null
  const diagnosticSummaryEnd = omittedEnd as KCodeSourcePosition | null
  if (omittedDiagnosticCount > 0 && diagnosticSummaryStart !== null && diagnosticSummaryEnd !== null) {
    for (const [severity, count] of [
      ['error', omittedErrorCount],
      ['warning', omittedWarningCount],
    ] as const satisfies readonly (readonly [KCodeDiagnosticSeverity, number])[]) {
      if (count === 0) continue
      diagnostics.push({
        severity,
        rule: 'kcode.diagnostic-summary',
        message: `KCode diagnostics were truncated after ${MAX_KCODE_DIAGNOSTIC_DETAILS} detailed findings; omitted ${count} additional ${severity} finding${count === 1 ? '' : 's'} (${omittedDiagnosticCount} findings omitted across all severities).`,
        span: { start: diagnosticSummaryStart, end: diagnosticSummaryEnd },
        line: diagnosticSummaryStart.line,
        column: diagnosticSummaryStart.column,
        endLine: diagnosticSummaryEnd.line,
        endColumn: diagnosticSummaryEnd.column,
        occurrences: count,
      })
    }
  }

  diagnostics.sort((a, b) =>
    a.span.start.offset - b.span.start.offset
    || a.span.end.offset - b.span.end.offset
    || (a.rule < b.rule ? -1 : a.rule > b.rule ? 1 : 0))

  const accepted = !diagnostics.some((diagnostic) => diagnostic.severity === 'error')
  const document: KCodeDocumentV1 = {
    metadata: {
      schemaVersion: 1,
      profileId: options.profile.profileId,
      profileVersion: options.profile.profileVersion,
      resourceProfile,
      dialect: options.dialect,
      strict: options.strict,
      parseStatus: accepted ? 'accepted' : 'rejected',
      sourceRetention: 'exact',
      recordMaterialization: 'complete',
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
