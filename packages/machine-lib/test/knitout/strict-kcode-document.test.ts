import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

import { emitKCodeDocument } from '../../src/knitout/kcode/emitter.js'
import {
  KNITERATE_7GG_KCODE_PROFILE_V2,
  type KCodeDialect,
} from '../../src/knitout/kcode/machine-profile.js'
import { parseKCodeDocument as parseKCodeDocumentImpl } from '../../src/knitout/kcode/parser.js'
import {
  recordKCodeRuntimeRules,
  recordKCodeTargetedRuntimeWitness,
} from '../../scripts/kcode-rule-runtime-ledger.js'

const WITNESS_SOURCE = 'test/knitout/strict-kcode-document.test.ts'
const parseKCodeDocument = (
  ...args: Parameters<typeof parseKCodeDocumentImpl>
): ReturnType<typeof parseKCodeDocumentImpl> => {
  const result = parseKCodeDocumentImpl(...args)
  recordKCodeRuntimeRules(
    'raw-kcode-parser',
    WITNESS_SOURCE,
    result.diagnostics,
  )
  return result
}

const referenceDirectory = resolve(__dirname, '../../reference')
const swatch = readFileSync(resolve(referenceDirectory, 'swatch.kc'), 'utf8')
const strictVendorOptions = {
  profile: KNITERATE_7GG_KCODE_PROFILE_V2,
  dialect: 'knitout-vendor' as const,
  strict: true,
}

function firstPassDocument(source: string): string {
  const lines = source.split('\n')
  const footerIndex = lines.findIndex((line) => line.startsWith('>>') || line.startsWith('<<'))
  if (footerIndex === -1) throw new Error('Fixture does not contain a pass footer')
  return `${lines.slice(0, footerIndex + 1).join('\n')}\n`
}

function replaceFirstLine(
  source: string,
  predicate: (line: string) => boolean,
  replacement: (line: string) => string,
): string {
  const lines = source.split('\n')
  const index = lines.findIndex(predicate)
  if (index === -1) throw new Error('Target fixture line not found')
  lines[index] = replacement(lines[index]!)
  return lines.join('\n')
}

describe('strict lossless KCode document parser', () => {
  it('accepts and byte-roundtrips every pinned reference fixture', { timeout: 60_000 }, () => {
    const fixtures = readdirSync(referenceDirectory).filter((name) => name.endsWith('.kc')).sort()
    expect(fixtures.length).toBe(13)

    for (const fixture of fixtures) {
      const source = readFileSync(resolve(referenceDirectory, fixture), 'utf8')
      const result = parseKCodeDocument(source, strictVendorOptions)
      expect(result.diagnostics, fixture).toEqual([])
      expect(result.ok, fixture).toBe(true)
      expect(result.document.metadata.parseStatus, fixture).toBe('accepted')
      expect(result.document.passes.length, fixture).toBeGreaterThan(0)
      expect(emitKCodeDocument(result.document), fixture).toBe(source)
    }
  })

  it('models HOME, RACK, all raster fields, footer values, and exact source spans', () => {
    const source = firstPassDocument(swatch)
    const result = parseKCodeDocument(source, strictVendorOptions)

    expect(result.ok).toBe(true)
    expect(result.document.home).toMatchObject({ kind: 'home', line: 1, raw: 'HOME' })
    expect(result.document.racks).toHaveLength(1)
    expect(result.document.racks[0]).toMatchObject({ valueRaw: '0', value: 0, line: 2 })
    expect(result.document.passes).toHaveLength(1)

    const pass = result.document.passes[0]!
    expect(pass.rack).toBe(0)
    expect(pass.footer).toMatchObject({
      direction: '>>',
      operation: 'Kn-Kn',
      carrier: '2',
      speedRaw: '100',
      speed: 100,
      rollerRaw: '440',
      roller: 440,
    })
    expect(source.slice(pass.frnt.valueSpan.start.offset, pass.frnt.valueSpan.end.offset)).toBe(pass.frnt.value)
    expect(source.slice(pass.span.start.offset, pass.span.end.offset)).toBe(
      [pass.frnt.raw, pass.stif.raw, pass.rear.raw, pass.stir.raw, pass.footer.raw].join('\n'),
    )
    expect(pass.frnt.value.length).toBe(287)
    expect(pass.stif.value.length).toBe(283)
  })

  it('preserves mixed line endings, comments, and final-terminator absence', () => {
    const base = firstPassDocument(swatch).trimEnd()
    const lines = base.split('\n')
    const source = lines.map((line, index) =>
      index === lines.length - 1 ? line : line + (index % 2 === 0 ? '\r\n' : '\n')).join('')

    const result = parseKCodeDocument(source, strictVendorOptions)
    expect(result.ok).toBe(true)
    expect(result.document.records.some((record) => record.lineEnding === '\r\n')).toBe(true)
    expect(result.document.records.some((record) => record.lineEnding === '\n')).toBe(true)
    expect(result.document.records.at(-1)?.lineEnding).toBe('')
    expect(result.document.records.filter((record) => record.kind === 'comment').length).toBeGreaterThan(0)
    expect(emitKCodeDocument(result.document)).toBe(source)
  })

  it('retains unknown records but rejects them in strict mode with an anchored diagnostic', () => {
    const source = firstPassDocument(swatch).replace('RACK:0\n', 'RACK:0\nMYSTERY:42\n')
    const strict = parseKCodeDocument(source, strictVendorOptions)

    expect(strict.ok).toBe(false)
    expect(strict.document.metadata.parseStatus).toBe('rejected')
    expect(strict.document.unknownRecords).toHaveLength(1)
    expect(strict.document.unknownRecords[0]).toMatchObject({ raw: 'MYSTERY:42', line: 3 })
    expect(strict.diagnostics).toContainEqual(expect.objectContaining({
      severity: 'error',
      rule: 'kcode.unknown-record',
      line: 3,
      column: 1,
    }))
    expect(emitKCodeDocument(strict.document)).toBe(source)

    const inspection = parseKCodeDocument(source, { ...strictVendorOptions, strict: false })
    expect(inspection.ok).toBe(true)
    expect(inspection.document.metadata.parseStatus).toBe('accepted')
    expect(inspection.diagnostics).toContainEqual(expect.objectContaining({
      severity: 'warning',
      rule: 'kcode.unknown-record',
    }))
  })

  it.each([
    {
      name: 'field order',
      rule: 'kcode.field-order',
      mutate(source: string) {
        const lines = source.split('\n')
        const stifIndex = lines.findIndex((line) => line.startsWith('STIF:'))
        const rearIndex = lines.findIndex((line) => line.startsWith('REAR:'))
        ;[lines[stifIndex], lines[rearIndex]] = [lines[rearIndex]!, lines[stifIndex]!]
        return lines.join('\n')
      },
    },
    {
      name: 'raster width',
      rule: 'kcode.field-width',
      mutate: (source: string) => replaceFirstLine(
        source,
        (line) => line.startsWith('STIF:'),
        (line) => line.slice(0, -1),
      ),
    },
    {
      name: 'raster character set',
      rule: 'kcode.field-charset',
      mutate: (source: string) => replaceFirstLine(
        source,
        (line) => line.startsWith('FRNT:'),
        (line) => line.replace('_', '@'),
      ),
    },
    {
      name: 'footer arity',
      rule: 'kcode.footer-arity',
      mutate: (source: string) => replaceFirstLine(
        source,
        (line) => line.startsWith('>>') || line.startsWith('<<'),
        (line) => line.replace(/ [^ ]+$/, ''),
      ),
    },
  ])('fails closed on malformed $name while preserving source bytes', ({ rule, mutate }) => {
    const source = mutate(firstPassDocument(swatch))
    const result = parseKCodeDocument(source, strictVendorOptions)

    expect(result.ok).toBe(false)
    expect(result.diagnostics.map((diagnostic) => diagnostic.rule)).toContain(rule)
    expect(emitKCodeDocument(result.document)).toBe(source)
  })

  it('does not mistake a footer-only file for a parsed pass', () => {
    const source = 'HOME\nRACK:0\n>> Kn-Kn 2 999999 -999999\n'
    const result = parseKCodeDocument(source, strictVendorOptions)

    expect(result.ok).toBe(false)
    expect(result.document.passes).toHaveLength(0)
    expect(result.diagnostics.map((diagnostic) => diagnostic.rule)).toEqual(expect.arrayContaining([
      'kcode.orphan-footer',
      'kcode.no-passes',
    ]))
    for (const expectedRule of ['kcode.orphan-footer', 'kcode.no-passes']) {
      recordKCodeTargetedRuntimeWitness({
        rail: 'raw-kcode-parser',
        sourcePath: WITNESS_SOURCE,
        caseId: `footer-only:${expectedRule}`,
        expectedRule,
        diagnostics: result.diagnostics,
      })
    }
  })

  it('requires an initial RACK:0 after HOME and before pass records', () => {
    const base = firstPassDocument(swatch)
    const missingSource = base.replace('RACK:0\n', '')
    const missing = parseKCodeDocument(missingSource, strictVendorOptions)
    expect(missing.ok).toBe(false)
    expect(missing.document.initialRack).toBeNull()
    expect(missing.diagnostics.map((diagnostic) => diagnostic.rule)).toContain('kcode.missing-initial-rack')

    const nonzero = parseKCodeDocument(base.replace('RACK:0', 'RACK:1'), strictVendorOptions)
    expect(nonzero.ok).toBe(false)
    expect(nonzero.document.initialRack?.value).toBe(1)
    expect(nonzero.diagnostics.map((diagnostic) => diagnostic.rule)).toContain('kcode.initial-rack')

    const misplacedSource = base.replace('RACK:0\n', '').replace('\nSTIF:', '\nRACK:0\nSTIF:')
    const misplaced = parseKCodeDocument(misplacedSource, strictVendorOptions)
    expect(misplaced.ok).toBe(false)
    expect(misplaced.diagnostics.map((diagnostic) => diagnostic.rule)).toEqual(expect.arrayContaining([
      'kcode.missing-initial-rack',
      'kcode.rack-order',
      'kcode.pass-interrupted',
    ]))
  })

  it.each([
    ['non-ASCII', '// café'],
    ['NUL', '// bad\0byte'],
  ])('rejects %s source bytes even when hidden inside a comment', (_name, badComment) => {
    const source = firstPassDocument(swatch).replace('RACK:0\n', `RACK:0\n${badComment}\n`)
    const result = parseKCodeDocument(source, strictVendorOptions)

    expect(result.ok).toBe(false)
    expect(result.diagnostics).toContainEqual(expect.objectContaining({
      rule: 'kcode.source-byte',
      severity: 'error',
    }))
    expect(emitKCodeDocument(result.document)).toBe(source)
  })

  it('requires carrier markers to stay ordered inside carriage bounds', () => {
    const source = replaceFirstLine(
      firstPassDocument(swatch),
      (line) => line.startsWith('FRNT:'),
      (line) => {
        const chars = [...line]
        const slash = chars.indexOf('/')
        const carrier = chars.indexOf('2')
        ;[chars[slash], chars[carrier]] = [chars[carrier]!, chars[slash]!]
        return chars.join('')
      },
    )
    const result = parseKCodeDocument(source, strictVendorOptions)

    expect(result.ok).toBe(false)
    expect(result.diagnostics.map((diagnostic) => diagnostic.rule)).toContain('kcode.bed-markers')
    expect(result.diagnostics.find((diagnostic) =>
      diagnostic.rule === 'kcode.bed-markers')?.message).toBe(
      'FRNT requires one ordered /...\\ carriage-marker pair and exactly two 2 carrier markers.',
    )

    const carrierless = firstPassDocument(swatch)
      .split('\n')
      .map((line) => {
        if (line.startsWith('FRNT:') || line.startsWith('REAR:')) {
          return line.replaceAll('2', '')
        }
        if (line.startsWith('>>') || line.startsWith('<<')) {
          return line.replace(' Kn-Kn 2 ', ' Kn-Kn 0 ')
        }
        return line
      })
      .join('\n')
    const invalidCarrierless = replaceFirstLine(
      carrierless,
      (line) => line.startsWith('FRNT:'),
      (line) => line.replace('/', '_'),
    )
    const carrierlessResult = parseKCodeDocument(
      invalidCarrierless,
      strictVendorOptions,
    )
    expect(carrierlessResult.diagnostics.find((diagnostic) =>
      diagnostic.rule === 'kcode.bed-markers')?.message).toBe(
      'FRNT requires one ordered /...\\ carriage-marker pair and no carrier markers.',
    )
  })

  it('rejects syntactically shaped but unsupported footer operations', () => {
    const source = replaceFirstLine(
      firstPassDocument(swatch),
      (line) => line.startsWith('>>') || line.startsWith('<<'),
      (line) => line.replace('Kn-Kn', 'Bogus-Op'),
    )
    const result = parseKCodeDocument(source, strictVendorOptions)

    expect(result.ok).toBe(false)
    expect(result.diagnostics.map((diagnostic) => diagnostic.rule)).toContain('kcode.footer-operation')
  })

  it('records the caller-selected dialect and rejects unsupported dialect metadata', () => {
    const source = firstPassDocument(swatch)
    const app = parseKCodeDocument(source, { ...strictVendorOptions, dialect: 'app' })
    expect(app.ok).toBe(true)
    expect(app.document.metadata).toMatchObject({
      profileId: 'kniterate-7gg-kcode',
      profileVersion: 2,
      dialect: 'app',
      strict: true,
      parseStatus: 'accepted',
      recordMaterialization: 'complete',
    })

    const unsupported = parseKCodeDocument(source, {
      ...strictVendorOptions,
      dialect: 'guessed' as KCodeDialect,
    })
    expect(unsupported.ok).toBe(false)
    expect(unsupported.document.metadata.parseStatus).toBe('rejected')
    expect(unsupported.diagnostics).toContainEqual(expect.objectContaining({
      rule: 'kcode.unsupported-dialect',
      severity: 'error',
    }))
    recordKCodeTargetedRuntimeWitness({
      rail: 'raw-kcode-parser',
      sourcePath: WITNESS_SOURCE,
      caseId: 'unsupported-dialect:guessed',
      expectedRule: 'kcode.unsupported-dialect',
      diagnostics: unsupported.diagnostics,
    })
  })
})
