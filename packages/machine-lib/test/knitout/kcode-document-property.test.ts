import * as fc from 'fast-check'
import { describe, expect, it } from 'vitest'

import { emitKCodeDocument } from '../../src/knitout/kcode/emitter.js'
import {
  KNITERATE_7GG_KCODE_PROFILE_V1,
  type KCodeCarrierToken,
} from '../../src/knitout/kcode/machine-profile.js'
import { parseKCodeDocument } from '../../src/knitout/kcode/parser.js'

const STRICT_VENDOR_OPTIONS = {
  profile: KNITERATE_7GG_KCODE_PROFILE_V1,
  dialect: 'knitout-vendor' as const,
  strict: true,
}

const VALID_DOCUMENT_SEED = 1_262_702_404 // ASCII "KCOD"
const GRAMMAR_MUTATION_SEED = 1_297_437_761 // ASCII "MUTA"
const BASE_WIDTH = KNITERATE_7GG_KCODE_PROFILE_V1.raster.standardBasePayloadColumns
const LEFT_PADDING = KNITERATE_7GG_KCODE_PROFILE_V1.raster.leftPaddingColumns
const RIGHT_PADDING = KNITERATE_7GG_KCODE_PROFILE_V1.raster.rightPaddingColumns
const NEEDLE_COLUMNS = KNITERATE_7GG_KCODE_PROFILE_V1.raster.standardNeedleColumns

interface GeneratedPass {
  readonly rack: number
  readonly direction: '>>' | '<<'
  readonly operation: string
  readonly carrier: KCodeCarrierToken
  readonly speed: number
  readonly roller: number
  readonly stitch: string
  readonly front: readonly number[]
  readonly rear: readonly number[]
}

function markerFreeBed(selected: readonly number[]): string {
  const needles = Array.from({ length: NEEDLE_COLUMNS }, () => '_')
  for (const needle of selected) needles[needle] = '-'
  return '.'.repeat(LEFT_PADDING) + needles.join('') + '.'.repeat(RIGHT_PADDING)
}

function decorateBed(base: string, carrier: KCodeCarrierToken): string {
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

function renderDocument(passes: readonly GeneratedPass[]): string {
  const lines = ['HOME', 'RACK:0', '// fast-check canonical KCode']
  let currentRack = 0
  for (const pass of passes) {
    if (pass.rack !== currentRack) {
      lines.push(`RACK:${pass.rack}`)
      currentRack = pass.rack
    }
    lines.push(
      `FRNT:${decorateBed(markerFreeBed(pass.front), pass.carrier)}`,
      `STIF:${pass.stitch.repeat(BASE_WIDTH)}`,
      `REAR:${decorateBed(markerFreeBed(pass.rear), pass.carrier)}`,
      `STIR:${pass.stitch.repeat(BASE_WIDTH)}`,
      `${pass.direction} ${pass.operation} ${pass.carrier} ${pass.speed} ${pass.roller}`,
    )
  }
  return `${lines.join('\n')}\n`
}

const needleSetArbitrary = fc.uniqueArray(
  fc.integer({ min: 0, max: NEEDLE_COLUMNS - 1 }),
  { minLength: 1, maxLength: 8 },
)

const carrierArbitrary = fc.constantFrom<KCodeCarrierToken>('0', '1', '2', '3', '4', '5', '6')

const passArbitrary: fc.Arbitrary<GeneratedPass> = carrierArbitrary.chain((carrier) => fc.record({
  rack: fc.constantFrom(...KNITERATE_7GG_KCODE_PROFILE_V1.rack.values),
  direction: fc.constantFrom('>>' as const, '<<' as const),
  operation: carrier === '0'
    ? fc.constantFrom('Kn-Kn', 'Tr-Rl', 'Tr-Rr', 'Rl-Tr', 'Rr-Tr')
    : fc.constantFrom('Kn-Kn', 'Tu-Tu', 'Kn-Tu', 'Tu-Kn', 'Tr-Rl', 'Tr-Rr', 'Rl-Tr', 'Rr-Tr'),
  carrier: fc.constant(carrier),
  speed: fc.integer({ min: 1, max: 800 }),
  roller: fc.integer({ min: -500, max: 999 }),
  stitch: fc.constantFrom(...'0123456789ABCDEF'.split('')),
  front: needleSetArbitrary,
  rear: needleSetArbitrary,
}))

const validDocumentArbitrary = fc.array(passArbitrary, { minLength: 1, maxLength: 3 }).map(renderDocument)

type CriticalMutation =
  | 'home'
  | 'rack'
  | 'field-label'
  | 'bed-character'
  | 'carriage-marker'
  | 'operation'
  | 'carrier'
  | 'speed'
  | 'footer-arity'

const criticalMutationArbitrary = fc.constantFrom<CriticalMutation>(
  'home',
  'rack',
  'field-label',
  'bed-character',
  'carriage-marker',
  'operation',
  'carrier',
  'speed',
  'footer-arity',
)

function replaceFirstLine(
  source: string,
  predicate: (line: string) => boolean,
  replacement: (line: string) => string,
): string {
  const lines = source.split('\n')
  const index = lines.findIndex(predicate)
  if (index === -1) throw new Error('Generated document did not contain the expected mutation target')
  lines[index] = replacement(lines[index]!)
  return lines.join('\n')
}

function mutateCriticalToken(source: string, mutation: CriticalMutation): string {
  switch (mutation) {
    case 'home':
      return source.replace(/^HOME$/m, 'HOMX')
    case 'rack':
      return source.replace(/^RACK:0$/m, 'RACK:not-a-number')
    case 'field-label':
      return replaceFirstLine(source, (line) => line.startsWith('STIF:'), (line) => `STIX:${line.slice(5)}`)
    case 'bed-character':
      return replaceFirstLine(source, (line) => line.startsWith('FRNT:'), (line) => line.replace('_', '@'))
    case 'carriage-marker':
      return replaceFirstLine(source, (line) => line.startsWith('FRNT:'), (line) => line.replace('/', '_'))
    case 'operation':
      return replaceFirstLine(source, (line) => line.startsWith('>>') || line.startsWith('<<'), (line) => line.replace(/^(>>|<<) \S+/, '$1 No-No'))
    case 'carrier':
      return replaceFirstLine(source, (line) => line.startsWith('>>') || line.startsWith('<<'), (line) => {
        const tokens = line.split(' ')
        tokens[2] = '7'
        return tokens.join(' ')
      })
    case 'speed':
      return replaceFirstLine(source, (line) => line.startsWith('>>') || line.startsWith('<<'), (line) => {
        const tokens = line.split(' ')
        tokens[3] = 'NaN'
        return tokens.join(' ')
      })
    case 'footer-arity':
      return replaceFirstLine(source, (line) => line.startsWith('>>') || line.startsWith('<<'), (line) => line.replace(/ \S+$/, ''))
  }
}

describe('strict KCode parser properties', () => {
  it('strictly parses and byte-roundtrips 2,000 canonical generated documents', () => {
    fc.assert(
      fc.property(validDocumentArbitrary, (source) => {
        const result = parseKCodeDocument(source, STRICT_VENDOR_OPTIONS)

        expect(result.diagnostics).toEqual([])
        expect(result.ok).toBe(true)
        expect(result.document.metadata).toMatchObject({
          profileId: KNITERATE_7GG_KCODE_PROFILE_V1.profileId,
          profileVersion: KNITERATE_7GG_KCODE_PROFILE_V1.profileVersion,
          dialect: 'knitout-vendor',
          strict: true,
        })
        expect(result.document.passes.length).toBeGreaterThan(0)
        expect(emitKCodeDocument(result.document)).toBe(source)
        expect(result.document.records.map((record) => record.raw + record.lineEnding).join('')).toBe(source)
      }),
      { seed: VALID_DOCUMENT_SEED, numRuns: 2_000 },
    )
  }, 20_000)

  it('rejects 5,000 grammar-critical single-token mutations and still emits every input byte', () => {
    fc.assert(
      fc.property(validDocumentArbitrary, criticalMutationArbitrary, (source, mutation) => {
        const mutated = mutateCriticalToken(source, mutation)
        const result = parseKCodeDocument(mutated, STRICT_VENDOR_OPTIONS)

        expect(mutated).not.toBe(source)
        expect(result.ok).toBe(false)
        expect(result.diagnostics.some((diagnostic) => diagnostic.severity === 'error')).toBe(true)
        expect(emitKCodeDocument(result.document)).toBe(mutated)
      }),
      { seed: GRAMMAR_MUTATION_SEED, numRuns: 5_000 },
    )
  }, 30_000)
})
