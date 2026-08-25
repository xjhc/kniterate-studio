import { describe, expect, it } from 'vitest'

import { emitKCodeDocument } from '../../src/knitout/kcode/emitter.js'
import { KNITERATE_7GG_KCODE_PROFILE_V1 } from '../../src/knitout/kcode/machine-profile.js'
import { parseKCodeDocument } from '../../src/knitout/kcode/parser.js'
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
}

describe('strict KCode adversarial rail', () => {
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
      rules: ['kcode.source-byte', 'kcode.missing-home'] as const,
      mutate: (source: string) => `\ufeff${source}`,
    },
  ])('rejects $name and still preserves the complete source', ({ rules, mutate }) => {
    expectRejected(mutate(validDocument()), rules)
  })
})
