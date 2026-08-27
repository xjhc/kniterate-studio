import { createHash } from 'node:crypto'

import { describe, expect, it } from 'vitest'

import { emitKCodeDocumentBytes, parseKCodeBytes } from '../../src/knitout/kcode/bytes.js'
import { emitKCodeDocument } from '../../src/knitout/kcode/emitter.js'
import { KNITERATE_7GG_KCODE_PROFILE_V1 } from '../../src/knitout/kcode/machine-profile.js'
import {
  KCODE_RESOURCE_LIMITS_V1,
  MAX_KCODE_SOURCE_CODE_UNITS,
  parseKCodeDocument,
} from '../../src/knitout/kcode/parser.js'
import type { KCodeDiagnosticRule } from '../../src/knitout/kcode/types.js'

const STRICT_VENDOR_OPTIONS = {
  profile: KNITERATE_7GG_KCODE_PROFILE_V1,
  dialect: 'knitout-vendor' as const,
  strict: true,
}

const BASE_WIDTH = KNITERATE_7GG_KCODE_PROFILE_V1.raster.standardBasePayloadColumns
const LEFT_PADDING = KNITERATE_7GG_KCODE_PROFILE_V1.raster.leftPaddingColumns
const NEEDLE_COLUMNS = KNITERATE_7GG_KCODE_PROFILE_V1.raster.standardNeedleColumns

function markerFreeBed(selected: readonly number[] = [100]): string {
  const needles = Array.from({ length: NEEDLE_COLUMNS }, () => '_')
  for (const needle of selected) needles[needle] = '-'
  return '.'.repeat(LEFT_PADDING)
    + needles.join('')
    + '.'.repeat(KNITERATE_7GG_KCODE_PROFILE_V1.raster.rightPaddingColumns)
}

function decorateBed(base: string, carrier: '0' | '2' = '2'): string {
  const markers: readonly [number, string][] = carrier === '0'
    ? [[10, '/'], [273, '\\']]
    : [[10, '/'], [45, carrier], [235, carrier], [273, '\\']]
  let out = ''
  let cursor = 0
  for (const [offset, marker] of markers) {
    out += base.slice(cursor, offset) + marker
    cursor = offset
  }
  return out + base.slice(cursor)
}

function validDocument(options: {
  readonly newline?: '\n' | '\r\n' | '\r'
  readonly finalNewline?: boolean
  readonly speed?: string
  readonly roller?: string
  readonly carrier?: '0' | '2'
} = {}): string {
  const newline = options.newline ?? '\n'
  const carrier = options.carrier ?? '2'
  const front = decorateBed(markerFreeBed([100]), carrier)
  const rear = decorateBed(markerFreeBed([]), carrier)
  const lines = [
    'HOME',
    'RACK:0',
    '// canonical small KCode document',
    `FRNT:${front}`,
    `STIF:${'6'.repeat(BASE_WIDTH)}`,
    `REAR:${rear}`,
    `STIR:${'5'.repeat(BASE_WIDTH)}`,
    `>> Kn-Kn ${carrier} ${options.speed ?? '300'} ${options.roller ?? '450'}`,
  ]
  return lines.join(newline) + (options.finalNewline === false ? '' : newline)
}

function legacyEmptyMoveDocument(): string {
  const lines = validDocument({ carrier: '0' }).split('\n')
  for (const [index, line] of lines.entries()) {
    if (line.startsWith('FRNT:') || line.startsWith('REAR:')) {
      lines[index] = line.replace('-', '_').replace('_', '')
    } else if (line.startsWith('STIF:') || line.startsWith('STIR:')) {
      lines[index] = line.slice(0, -1)
    }
  }
  return lines.join('\n')
}

function replaceLine(
  source: string,
  predicate: (line: string) => boolean,
  replacement: (line: string) => string,
): string {
  const lines = source.split('\n')
  const index = lines.findIndex(predicate)
  if (index === -1) throw new Error('Mutation target line not found')
  lines[index] = replacement(lines[index]!)
  return lines.join('\n')
}

function removeLine(source: string, predicate: (line: string) => boolean): string {
  const lines = source.split('\n')
  const index = lines.findIndex(predicate)
  if (index === -1) throw new Error('Mutation target line not found')
  lines.splice(index, 1)
  return lines.join('\n')
}

function insertAfter(
  source: string,
  predicate: (line: string) => boolean,
  line: string,
): string {
  const lines = source.split('\n')
  const index = lines.findIndex(predicate)
  if (index === -1) throw new Error('Mutation target line not found')
  lines.splice(index + 1, 0, line)
  return lines.join('\n')
}

function expectRejected(source: string, rules: readonly KCodeDiagnosticRule[]): void {
  const result = parseKCodeDocument(source, STRICT_VENDOR_OPTIONS)
  expect(result.ok).toBe(false)
  expect(result.diagnostics.some((diagnostic) => diagnostic.severity === 'error')).toBe(true)
  expect(result.diagnostics.map((diagnostic) => diagnostic.rule)).toEqual(expect.arrayContaining(rules))
  expect(emitKCodeDocument(result.document)).toBe(source)
  expect(parseContract(result)).toMatchSnapshot()
}

function contractDigest(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex')
}

function parseContract(result: ReturnType<typeof parseKCodeDocument>): string {
  return contractDigest(result)
}

describe('strict KCode adversarial rail', () => {
  it('locks scanner, prefix, numeric, blank, and incomplete-pass boundaries', () => {
    const exact = (source: string) => parseContract(
      parseKCodeDocument(source, STRICT_VENDOR_OPTIONS),
    )
    expect(exact('')).toMatchSnapshot()
    expect(exact(insertAfter(validDocument(), (line) => line === 'RACK:0', ''))).toMatchSnapshot()
    expect(exact(insertAfter(
      validDocument(),
      (line) => line.startsWith('FRNT:'),
      validDocument().split('\n').find((line) => line.startsWith('FRNT:'))!,
    ))).toMatchSnapshot()
    expect(exact('HOME\nRACK:0\nFRNT:_')).toMatchSnapshot()
    expect(exact('HOME\nRACK:0\nFRNT:_\nHOME\n')).toMatchSnapshot()
    expect(exact('HOME\nRACK:0\nFRNT:_\nJUNK\n')).toMatchSnapshot()
    for (const footer of ['>>', '>> Kn-Kn', '>> Kn-Kn 2', '>> Kn-Kn 2 300']) {
      expect(exact(`HOME\nRACK:0\n${footer}\n`)).toMatchSnapshot()
    }
    expect(exact(validDocument().replace(/FRNT:[^\n]+/, 'FRNT:'))).toMatchSnapshot()
    expect(exact(validDocument().replace(' 300 ', ' .12 '))).toMatchSnapshot()
    expect(exact(validDocument().replace(' 300 ', ' .a '))).toMatchSnapshot()
    expect(exact(validDocument().replace(' 300 ', ' 12. '))).toMatchSnapshot()
    expect(exact(`${'X'.repeat(120)}\n`)).toMatchSnapshot()
    expect(exact(`${'X'.repeat(121)}\n`)).toMatchSnapshot()
    const laterBom = `${validDocument()}\ufeffHOME\n`
    const laterBomResult = parseKCodeDocument(laterBom, STRICT_VENDOR_OPTIONS)
    expect(laterBomResult.document.records.at(-1)?.kind).toBe('unknown')
    expect(laterBomResult.diagnostics.map((diagnostic) => diagnostic.rule)).toContain(
      'kcode.unknown-record',
    )
    const decimal = parseKCodeDocument(
      validDocument().replace(' 300 ', ' .12 '),
      STRICT_VENDOR_OPTIONS,
    )
    expect(decimal.document.passes[0]!.footer.speed).toBe(0.12)
    expect(decimal.diagnostics.map((diagnostic) => diagnostic.rule)).not.toContain(
      'kcode.footer-number',
    )
    const invalidDecimal = parseKCodeDocument(
      validDocument().replace(' 300 ', ' .a '),
      STRICT_VENDOR_OPTIONS,
    )
    expect(invalidDecimal.diagnostics.map((diagnostic) => diagnostic.rule)).toContain(
      'kcode.footer-number',
    )
    const signedDecimal = parseKCodeDocument(
      validDocument().replace(' 300 ', ' +.12 '),
      STRICT_VENDOR_OPTIONS,
    )
    expect(signedDecimal.document.passes[0]!.footer.speed).toBe(0.12)
    for (const rack of ['', '+', ' 1']) {
      expect(parseKCodeDocument(
        validDocument().replace('RACK:0', `RACK:${rack}`),
        STRICT_VENDOR_OPTIONS,
      ).diagnostics.map((diagnostic) => diagnostic.rule)).toContain('kcode.invalid-rack')
    }
    expect(parseKCodeDocument(
      validDocument().replace(' 300 ', ' 1. '),
      STRICT_VENDOR_OPTIONS,
    ).diagnostics.map((diagnostic) => diagnostic.rule)).toContain('kcode.footer-number')

    const nonEmptyMissing = parseKCodeDocument('X\n', STRICT_VENDOR_OPTIONS)
    expect(nonEmptyMissing.diagnostics.find((diagnostic) =>
      diagnostic.rule === 'kcode.missing-home')?.span.start.offset).toBe(2)
    expect(exact('>> Kn-Kn 0 300 0\nHOME\nRACK:0\n')).toMatchSnapshot()
    expect(exact('JUNK\nHOME\n')).toMatchSnapshot()

    const completeLines = validDocument().split('\n')
    const stirIndex = completeLines.findIndex((line) => line.startsWith('STIR:'))
    completeLines.splice(stirIndex + 1, 0, completeLines[stirIndex]!)
    const extraField = parseKCodeDocument(completeLines.join('\n'), STRICT_VENDOR_OPTIONS)
    expect(extraField.document.passes).toHaveLength(0)
    expect(extraField.diagnostics.map((diagnostic) => diagnostic.rule)).toEqual(
      expect.arrayContaining(['kcode.incomplete-pass', 'kcode.no-passes']),
    )

    const splitInvalidRuns = `${'\u0080'.repeat(64)}A\u0080\n`
    expect(exact(splitInvalidRuns)).toMatchSnapshot()
    const multipleInvalidRuns = `${'\u0080'.repeat(32)}A${'\u0080'.repeat(32)}B\u0080C\u0080\n`
    expect(exact(multipleInvalidRuns)).toMatchSnapshot()
  })

  it('locks exact parser resource-limit boundaries and both footer prefixes', () => {
    const overSource = 'X'.repeat(MAX_KCODE_SOURCE_CODE_UNITS + 1)
    const overResult = parseKCodeDocument(overSource, STRICT_VENDOR_OPTIONS)
    expect(overResult).toMatchObject({
      ok: false,
      document: {
        metadata: {
          parseStatus: 'rejected',
          recordMaterialization: 'resource-limited',
        },
        records: [],
        racks: [],
        passes: [],
        unknownRecords: [],
      },
      diagnostics: [{
        rule: 'kcode.resource-limit',
        severity: 'error',
        message: expect.stringContaining(
          `${MAX_KCODE_SOURCE_CODE_UNITS}-code-unit strict-intake limit`,
        ),
        span: {
          start: { offset: 0, line: 1, column: 1 },
          end: { offset: 0, line: 1, column: 1 },
        },
      }],
    })

    const exactSourceLimit = `//${'X'.repeat(MAX_KCODE_SOURCE_CODE_UNITS - 2)}`
    expect(parseKCodeDocument(exactSourceLimit, STRICT_VENDOR_OPTIONS)).toMatchObject({
      document: { metadata: { recordMaterialization: 'resource-limited' } },
      diagnostics: [{
        rule: 'kcode.resource-limit',
        message: expect.stringContaining('2097152-code-unit line limit'),
      }],
    })

    const exactRecordLimit = `//${'X'.repeat(2 * 1024 * 1024 - 2)}\n`
    expect(parseKCodeDocument(exactRecordLimit, STRICT_VENDOR_OPTIONS).document.metadata)
      .toMatchObject({ recordMaterialization: 'complete' })

    const atRightPrefixLimit = `${'>> Kn-Kn 0 300 0\n'.repeat(8_192)}>X\nX>\n`
    expect(parseKCodeDocument(atRightPrefixLimit, STRICT_VENDOR_OPTIONS).document.metadata)
      .toMatchObject({ recordMaterialization: 'complete' })
    const overLeftPrefixLimit = '<< Kn-Kn 0 300 0\n'.repeat(8_193)
    const leftResult = parseKCodeDocument(overLeftPrefixLimit, STRICT_VENDOR_OPTIONS)
    expect(leftResult).toMatchObject({
      document: { metadata: { recordMaterialization: 'resource-limited' } },
      diagnostics: [{
        rule: 'kcode.resource-limit',
        line: 8_193,
        span: { start: { offset: 8_192 * '<< Kn-Kn 0 300 0\n'.length } },
      }],
    })
    const atLeftPrefixLimit = `${'<< Kn-Kn 0 300 0\n'.repeat(8_192)}<X\nX<\n`
    expect(parseKCodeDocument(atLeftPrefixLimit, STRICT_VENDOR_OPTIONS).document.metadata)
      .toMatchObject({ recordMaterialization: 'complete' })
  })

  it('locks the reserved legacy empty-move conjunction and padding spans', () => {
    const legacy = legacyEmptyMoveDocument()
    expect(parseContract(parseKCodeDocument(legacy, STRICT_VENDOR_OPTIONS))).toMatchSnapshot()
    expect(parseContract(parseKCodeDocument(
      legacy.replace(' Kn-Kn 0 ', ' Tu-Tu 0 '),
      STRICT_VENDOR_OPTIONS,
    ))).toMatchSnapshot()
    const wrongLegacyCarrier = parseKCodeDocument(
      legacy.replace(' Kn-Kn 0 ', ' Kn-Kn 2 '),
      STRICT_VENDOR_OPTIONS,
    )
    expect(wrongLegacyCarrier.diagnostics.filter((diagnostic) =>
      diagnostic.rule === 'kcode.field-width')).toHaveLength(3)
    expect(parseContract(parseKCodeDocument(
      legacy.replace(/FRNT:([^\n]*?)_/, 'FRNT:$1-'),
      STRICT_VENDOR_OPTIONS,
    ))).toMatchSnapshot()
    expect(parseContract(parseKCodeDocument(
      replaceLine(validDocument(), (line) => line.startsWith('FRNT:'), (line) =>
        `${line.slice(0, -2)}_${line.slice(-1)}`),
      STRICT_VENDOR_OPTIONS,
    ))).toMatchSnapshot()

    const invalidLegacyNeedle = replaceLine(
      legacy,
      (line) => line.startsWith('FRNT:'),
      (line) => {
        const index = line.lastIndexOf('_')
        return `${line.slice(0, index)}.${line.slice(index + 1)}`
      },
    )
    expect(parseKCodeDocument(
      invalidLegacyNeedle,
      STRICT_VENDOR_OPTIONS,
    ).diagnostics.map((diagnostic) => diagnostic.rule)).toContain(
      'kcode.bed-needle-domain',
    )

    const unrecognizedWidth = legacy.split('\n').map((line) => {
      if (line.startsWith('FRNT:') || line.startsWith('REAR:')) {
        const underscore = line.indexOf('_')
        const shortened = `${line.slice(0, underscore)}${line.slice(underscore + 1)}`
        if (!line.startsWith('FRNT:')) return shortened
        const needle = shortened.indexOf('_')
        return `${shortened.slice(0, needle)}.${shortened.slice(needle + 1)}`
      }
      if (line.startsWith('STIF:') || line.startsWith('STIR:')) return line.slice(0, -1)
      return line
    }).join('\n')
    const unrecognizedReport = parseKCodeDocument(
      unrecognizedWidth,
      STRICT_VENDOR_OPTIONS,
    )
    expect(unrecognizedReport.diagnostics.map((diagnostic) => diagnostic.rule)).not.toContain(
      'kcode.bed-needle-domain',
    )
    expect(unrecognizedReport.diagnostics.filter((diagnostic) =>
      diagnostic.rule === 'kcode.field-width')).toHaveLength(1)

    const rearMarkerMissing = validDocument().replace(
      /(REAR:[^/\n]*)\//,
      '$1_',
    )
    expect(() => parseKCodeDocument(rearMarkerMissing, STRICT_VENDOR_OPTIONS)).not.toThrow()
    expect(parseKCodeDocument(
      rearMarkerMissing,
      STRICT_VENDOR_OPTIONS,
    ).diagnostics.map((diagnostic) => diagnostic.rule)).toContain('kcode.bed-markers')
  })

  it('keeps omitted-diagnostic summary spans at the true global extrema', () => {
    const passLines = validDocument().split('\n').slice(3, 8)
    const passes = Array.from({ length: 600 }, (_, index) => passLines.map((line) => {
      if (line.startsWith('>>')) return line.replace(' 300 ', ' .a ')
      if (index === 0 && line.startsWith('STIF:')) return line.slice(0, -1)
      return line
    }).join('\n'))
    const source = `HOME\nRACK:0\n${passes.join('\n')}\n`
    const result = parseKCodeDocument(source, STRICT_VENDOR_OPTIONS)
    const summary = result.diagnostics.find((diagnostic) =>
      diagnostic.rule === 'kcode.diagnostic-summary')!

    expect(summary.span.start.offset).toBeLessThan(1_000)
    expect(summary.span.end.offset).toBeGreaterThan(source.length - 1_000)
  })

  it.each([
    ['LF with a final newline', validDocument()],
    ['CRLF with a final newline', validDocument({ newline: '\r\n' })],
    ['a missing final newline', validDocument({ finalNewline: false })],
    ['a complete file with unverified extreme process settings', validDocument({ speed: '999999', roller: '-999999' })],
  ])('accepts and losslessly emits %s', (_name, source) => {
    const result = parseKCodeDocument(source, STRICT_VENDOR_OPTIONS)
    expect(result.diagnostics).toEqual([])
    expect(result.ok).toBe(true)
    expect(result.document.metadata.dialect).toBe('knitout-vendor')
    expect(result.document.passes).toHaveLength(1)
    expect(emitKCodeDocument(result.document)).toBe(source)
    expect(parseContract(result)).toMatchSnapshot()
  })

  it('rejects the historical footer-only false positive', () => {
    const source = 'HOME\nRACK:0\n>> Kn-Kn 2 999999 -999999\n'
    const result = parseKCodeDocument(source, STRICT_VENDOR_OPTIONS)

    expect(result.ok).toBe(false)
    expect(result.document.passes).toHaveLength(0)
    expect(result.diagnostics.map((diagnostic) => diagnostic.rule)).toEqual(expect.arrayContaining([
      'kcode.orphan-footer',
      'kcode.no-passes',
    ]))
    expect(emitKCodeDocument(result.document)).toBe(source)
    expect(parseContract(result)).toMatchSnapshot()
  })

  it('rejects the historical truncated-raster false positive', () => {
    const source = [
      'HOME',
      'RACK:0',
      'FRNT:-',
      'STIF:Z',
      'REAR:-',
      'STIR:Z',
      '>> Kn-Kn 2 9999 -999',
      '',
    ].join('\n')
    expectRejected(source, ['kcode.field-width', 'kcode.bed-markers'])
  })

  it.each([
    {
      name: 'missing HOME',
      rules: ['kcode.missing-home', 'kcode.rack-order'] as const,
      mutate: (source: string) => removeLine(source, (line) => line === 'HOME'),
    },
    {
      name: 'duplicate HOME',
      rules: ['kcode.duplicate-home'] as const,
      mutate: (source: string) => insertAfter(source, (line) => line === 'HOME', 'HOME'),
    },
    {
      name: 'HOME after RACK',
      rules: ['kcode.rack-order', 'kcode.home-order'] as const,
      mutate(source: string) {
        const withoutHome = removeLine(source, (line) => line === 'HOME')
        return insertAfter(withoutHome, (line) => line === 'RACK:0', 'HOME')
      },
    },
    {
      name: 'missing initial RACK',
      rules: ['kcode.missing-initial-rack'] as const,
      mutate: (source: string) => removeLine(source, (line) => line === 'RACK:0'),
    },
    {
      name: 'non-zero initial RACK',
      rules: ['kcode.initial-rack'] as const,
      mutate: (source: string) => source.replace('RACK:0', 'RACK:1'),
    },
    {
      name: 'non-numeric initial RACK',
      rules: ['kcode.invalid-rack'] as const,
      mutate: (source: string) => source.replace('RACK:0', 'RACK:not-a-number'),
    },
    {
      name: 'quarter-pitch RACK outside the profile',
      rules: ['kcode.invalid-rack'] as const,
      mutate: (source: string) => source.replace('RACK:0', 'RACK:0.25'),
    },
    {
      name: 'out-of-envelope RACK',
      rules: ['kcode.invalid-rack'] as const,
      mutate: (source: string) => source.replace('RACK:0', 'RACK:4.5'),
    },
    {
      name: 'RACK inside a pass block',
      rules: ['kcode.pass-interrupted', 'kcode.rack-order'] as const,
      mutate: (source: string) => insertAfter(source, (line) => line.startsWith('FRNT:'), 'RACK:0.5'),
    },
    {
      name: 'comment interrupting a pass block',
      rules: ['kcode.pass-interrupted'] as const,
      mutate: (source: string) => insertAfter(source, (line) => line.startsWith('FRNT:'), '// interruption'),
    },
    {
      name: 'blank record interrupting a pass block',
      rules: ['kcode.pass-interrupted'] as const,
      mutate: (source: string) => insertAfter(source, (line) => line.startsWith('FRNT:'), ''),
    },
    {
      name: 'reordered STIF and REAR fields',
      rules: ['kcode.field-order', 'kcode.incomplete-pass'] as const,
      mutate(source: string) {
        const lines = source.split('\n')
        const stif = lines.findIndex((line) => line.startsWith('STIF:'))
        const rear = lines.findIndex((line) => line.startsWith('REAR:'))
        ;[lines[stif], lines[rear]] = [lines[rear]!, lines[stif]!]
        return lines.join('\n')
      },
    },
    {
      name: 'duplicate STIF field',
      rules: ['kcode.field-order', 'kcode.incomplete-pass'] as const,
      mutate(source: string) {
        const stif = source.split('\n').find((line) => line.startsWith('STIF:'))!
        return insertAfter(source, (line) => line.startsWith('STIF:'), stif)
      },
    },
    {
      name: 'missing STIR field',
      rules: ['kcode.incomplete-pass'] as const,
      mutate: (source: string) => removeLine(source, (line) => line.startsWith('STIR:')),
    },
    {
      name: 'truncated STIF payload',
      rules: ['kcode.field-width'] as const,
      mutate: (source: string) => replaceLine(source, (line) => line.startsWith('STIF:'), (line) => line.slice(0, -1)),
    },
    {
      name: 'mismatched REAR width',
      rules: ['kcode.field-width'] as const,
      mutate: (source: string) => replaceLine(source, (line) => line.startsWith('REAR:'), (line) => line.slice(0, -1)),
    },
    {
      name: 'illegal bed character',
      rules: ['kcode.field-charset'] as const,
      mutate: (source: string) => replaceLine(source, (line) => line.startsWith('FRNT:'), (line) => line.replace('_', '@')),
    },
    {
      name: 'illegal stitch-selector character',
      rules: ['kcode.field-charset'] as const,
      mutate: (source: string) => replaceLine(source, (line) => line.startsWith('STIF:'), (line) => line.replace('6', '*')),
    },
    {
      name: 'missing carriage marker',
      rules: ['kcode.bed-markers'] as const,
      mutate: (source: string) => replaceLine(source, (line) => line.startsWith('FRNT:'), (line) => line.replace('/', '_')),
    },
    {
      name: 'reversed carriage markers',
      rules: ['kcode.bed-markers'] as const,
      mutate: (source: string) => replaceLine(source, (line) => line.startsWith('FRNT:') || line.startsWith('REAR:'), (line) => line.replace('/', '!').replace('\\', '/').replace('!', '\\')),
    },
    {
      name: 'footer carrier inconsistent with bed markers',
      rules: ['kcode.bed-markers'] as const,
      mutate: (source: string) => replaceLine(source, (line) => line.startsWith('>>'), (line) => line.replace(' Kn-Kn 2 ', ' Kn-Kn 3 ')),
    },
    {
      name: 'FRNT and REAR marker positions differ',
      rules: ['kcode.bed-markers'] as const,
      mutate: (source: string) => replaceLine(source, (line) => line.startsWith('REAR:'), (line) => line.replace('/.', './')),
    },
    {
      name: 'non-dot bed padding',
      rules: ['kcode.bed-padding'] as const,
      mutate: (source: string) => replaceLine(source, (line) => line.startsWith('FRNT:'), (line) => line.replace('.', '_')),
    },
    {
      name: 'selected needle changed to a dot inside the standard needle domain',
      rules: ['kcode.bed-needle-domain'] as const,
      mutate: (source: string) => replaceLine(source, (line) => line.startsWith('FRNT:'), (line) => line.replace('-', '.')),
    },
    {
      name: 'footer with too few tokens',
      rules: ['kcode.footer-arity'] as const,
      mutate: (source: string) => replaceLine(source, (line) => line.startsWith('>>'), (line) => line.replace(/ [^ ]+$/, '')),
    },
    {
      name: 'footer with too many tokens',
      rules: ['kcode.footer-arity'] as const,
      mutate: (source: string) => replaceLine(source, (line) => line.startsWith('>>'), (line) => `${line} extra`),
    },
    {
      name: 'footer with repeated whitespace',
      rules: ['kcode.footer-whitespace'] as const,
      mutate: (source: string) => replaceLine(source, (line) => line.startsWith('>>'), (line) => line.replace(' Kn-Kn', '  Kn-Kn')),
    },
    {
      name: 'invalid footer direction token',
      rules: ['kcode.footer-direction'] as const,
      mutate: (source: string) => replaceLine(source, (line) => line.startsWith('>>'), (line) => `>${line}`),
    },
    {
      name: 'unsupported footer operation',
      rules: ['kcode.footer-operation'] as const,
      mutate: (source: string) => replaceLine(source, (line) => line.startsWith('>>'), (line) => line.replace('Kn-Kn', 'No-No')),
    },
    {
      name: 'illegal footer carrier',
      rules: ['kcode.footer-carrier'] as const,
      mutate: (source: string) => replaceLine(source, (line) => line.startsWith('>>'), (line) => line.replace(' Kn-Kn 2 ', ' Kn-Kn 7 ')),
    },
    {
      name: 'non-decimal footer speed',
      rules: ['kcode.footer-number'] as const,
      mutate: (source: string) => replaceLine(source, (line) => line.startsWith('>>'), (line) => line.replace(' 300 ', ' 3e2 ')),
    },
    {
      name: 'non-finite footer roller',
      rules: ['kcode.footer-number'] as const,
      mutate: (source: string) => replaceLine(source, (line) => line.startsWith('>>'), (line) => line.replace(/ 450$/, ' Infinity')),
    },
    {
      name: 'unknown record before a valid pass',
      rules: ['kcode.unknown-record'] as const,
      mutate: (source: string) => insertAfter(source, (line) => line === 'RACK:0', 'JUNK:still-not-kcode'),
    },
    {
      name: 'NUL in a comment',
      rules: ['kcode.source-byte'] as const,
      mutate: (source: string) => source.replace('// canonical', '//\0canonical'),
    },
    {
      name: 'non-ASCII source character',
      rules: ['kcode.source-byte'] as const,
      mutate: (source: string) => source.replace('// canonical', '// café canonical'),
    },
    {
      name: 'UTF-8 BOM code point before HOME',
      rules: ['kcode.source-byte'] as const,
      mutate: (source: string) => `\ufeff${source}`,
    },
  ])('rejects $name and still preserves the complete source', ({ rules, mutate }) => {
    expectRejected(mutate(validDocument()), rules)
  })

  it('rejects a leading BOM without cascading into a false missing-HOME error', () => {
    const result = parseKCodeDocument(`\ufeff${validDocument()}`, STRICT_VENDOR_OPTIONS)

    expect(result.ok).toBe(false)
    expect(result.diagnostics.map((diagnostic) => diagnostic.rule)).toEqual([
      'kcode.source-byte',
    ])
    expect(emitKCodeDocument(result.document)).toBe(`\ufeff${validDocument()}`)
    expect(parseContract(result)).toMatchSnapshot()
  })

  it('groups and truncates diagnostics for one megabyte of invalid source without losing a code unit', () => {
    const bytes = new Uint8Array(1024 * 1024).fill(0xff)
    const source = '\u00ff'.repeat(bytes.length)
    const result = parseKCodeBytes(bytes, STRICT_VENDOR_OPTIONS)

    expect(result.ok).toBe(false)
    expect(result.diagnostics.filter((diagnostic) => diagnostic.rule === 'kcode.source-byte')).toHaveLength(1)
    expect(result.diagnostics).toContainEqual(expect.objectContaining({
      rule: 'kcode.source-byte-summary',
      severity: 'error',
      message: expect.stringContaining('1048512 additional invalid code units'),
      span: expect.objectContaining({
        start: expect.objectContaining({ offset: 64 }),
        end: expect.objectContaining({ offset: source.length }),
      }),
    }))
    expect(result.diagnostics.length).toBeLessThan(10)
    expect(Math.max(...result.diagnostics.map((diagnostic) => diagnostic.message.length))).toBeLessThan(512)
    expect(result.document.records).toHaveLength(1)
    expect(result.document.records[0]).toMatchObject({ raw: source, lineEnding: '' })
    expect(result.document.records.map((record) => record.raw + record.lineEnding).join('')).toBe(source)
    expect(emitKCodeDocument(result.document)).toBe(source)
    expect(Buffer.compare(Buffer.from(emitKCodeDocumentBytes(result.document)), Buffer.from(bytes))).toBe(0)
    expect(parseKCodeBytes(bytes, STRICT_VENDOR_OPTIONS).diagnostics).toEqual(result.diagnostics)
  })

  it('refuses oversized byte input before one-byte decoding or copying', () => {
    const bytes = new Uint8Array(MAX_KCODE_SOURCE_CODE_UNITS + 1)
    const result = parseKCodeBytes(bytes, STRICT_VENDOR_OPTIONS)

    expect(result.ok).toBe(false)
    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        rule: 'kcode.resource-limit',
        message: expect.stringContaining('were not copied into the parsed document'),
      }),
    ])
    expect(result.document.rawText).toBe('')
    expect(result.document.records).toEqual([])
    expect(result.document.metadata.recordMaterialization).toBe('resource-limited')
    expect(result.document.metadata.sourceRetention).toBe('caller-owned-oversized-bytes')
    expect(() => emitKCodeDocumentBytes(result.document)).toThrow(/caller-owned/)
  })

  it('fails closed before materializing an adversarial number of short records', () => {
    const source = '//\n'.repeat(100_001)
    const result = parseKCodeDocument(source, STRICT_VENDOR_OPTIONS)

    expect(result.ok).toBe(false)
    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        rule: 'kcode.resource-limit',
        severity: 'error',
        line: 100_001,
        message: expect.stringContaining('100000-record strict-intake limit'),
      }),
    ])
    expect(result.document.metadata.recordMaterialization).toBe('resource-limited')
    expect(result.document.metadata.resourceProfile).toBe('foreign-v1')
    expect(result.document.records).toEqual([])
    expect(emitKCodeDocument(result.document)).toBe(source)
  })

  it('uses a shared 100k record ceiling so authored exports reopen through default intake', () => {
    expect(Object.isFrozen(KCODE_RESOURCE_LIMITS_V1)).toBe(true)
    expect(Object.isFrozen(KCODE_RESOURCE_LIMITS_V1['foreign-v1'])).toBe(true)
    expect(Object.isFrozen(KCODE_RESOURCE_LIMITS_V1['authored-v1'])).toBe(true)
    expect(KCODE_RESOURCE_LIMITS_V1).toEqual({
      'foreign-v1': { records: 100_000, passRecords: 8_192 },
      'authored-v1': { records: 100_000, passRecords: 8_192 },
    })

    const reopenedAuthoredSize = parseKCodeDocument('//\n'.repeat(50_377), STRICT_VENDOR_OPTIONS)
    expect(reopenedAuthoredSize.document.metadata).toMatchObject({
      resourceProfile: 'foreign-v1',
      recordMaterialization: 'complete',
    })
    expect(reopenedAuthoredSize.document.records).toHaveLength(50_377)
    expect(reopenedAuthoredSize.diagnostics).not.toContainEqual(expect.objectContaining({
      rule: 'kcode.resource-limit',
    }))

    const overAuthored = parseKCodeDocument('//\n'.repeat(100_001), {
      ...STRICT_VENDOR_OPTIONS,
      resourceProfile: 'authored-v1',
    })
    expect(overAuthored).toMatchObject({
      ok: false,
      document: {
        metadata: {
          resourceProfile: 'authored-v1',
          recordMaterialization: 'resource-limited',
        },
        records: [],
      },
      diagnostics: [expect.objectContaining({
        rule: 'kcode.resource-limit',
        line: 100_001,
        message: expect.stringContaining('100000-record strict-intake limit'),
      })],
    })
  })

  it('refuses a pass-record graph over 8192 before materializing source records', () => {
    const source = '>> Kn-Kn 0 300 450\n'.repeat(8_193)
    for (const resourceProfile of ['foreign-v1', 'authored-v1'] as const) {
      const result = parseKCodeDocument(source, {
        ...STRICT_VENDOR_OPTIONS,
        resourceProfile,
      })
      expect(result).toMatchObject({
        ok: false,
        document: {
          metadata: { resourceProfile, recordMaterialization: 'resource-limited' },
          rawText: source,
          records: [],
          passes: [],
        },
        diagnostics: [expect.objectContaining({
          rule: 'kcode.resource-limit',
          line: 8_193,
          message: expect.stringContaining('8192-pass-record strict-intake limit'),
        })],
      })
    }
  })

  it('fails closed before materializing one oversized record', () => {
    const source = 'X'.repeat(2 * 1024 * 1024 + 1)
    const result = parseKCodeDocument(source, STRICT_VENDOR_OPTIONS)

    expect(result.ok).toBe(false)
    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        rule: 'kcode.resource-limit',
        message: expect.stringContaining('2097152-code-unit line limit'),
      }),
    ])
    expect(result.document.metadata.recordMaterialization).toBe('resource-limited')
    expect(emitKCodeDocument(result.document)).toBe(source)
  })

  it('caps independent diagnostics while preserving every materialized record', () => {
    const source = 'X\n'.repeat(2_000)
    const first = parseKCodeDocument(source, STRICT_VENDOR_OPTIONS)
    const second = parseKCodeDocument(source, STRICT_VENDOR_OPTIONS)

    expect(first.ok).toBe(false)
    expect(first.document.metadata.recordMaterialization).toBe('complete')
    expect(first.document.records).toHaveLength(2_000)
    expect(first.diagnostics).toHaveLength(513)
    expect(first.diagnostics.at(-1)).toMatchObject({
      rule: 'kcode.diagnostic-summary',
      severity: 'error',
      message: expect.stringContaining('omitted 1491 additional error findings'),
    })
    expect(first.diagnostics).toEqual(second.diagnostics)
    expect(emitKCodeDocument(first.document)).toBe(source)
    expect(contractDigest(first.diagnostics)).toMatchSnapshot()
  })

  it('summarizes omitted errors and warnings separately in non-strict intake', () => {
    const result = parseKCodeDocument(`\u0080\n${'X\n'.repeat(1_000)}`, {
      ...STRICT_VENDOR_OPTIONS,
      strict: false,
    })
    const summaries = result.diagnostics.filter((diagnostic) =>
      diagnostic.rule === 'kcode.diagnostic-summary')

    expect(result.ok).toBe(false)
    expect(result.diagnostics).toHaveLength(514)
    expect(summaries).toEqual(expect.arrayContaining([
      expect.objectContaining({ severity: 'error', occurrences: 4 }),
      expect.objectContaining({ severity: 'warning', occurrences: 489 }),
    ]))
    expect(contractDigest(result.diagnostics)).toMatchSnapshot()
  })
})
