import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

import {
  emitKCodeDocumentBytes,
  parseKCodeBytes,
} from '../../src/knitout/kcode/bytes.js'
import { KNITERATE_7GG_KCODE_PROFILE_V1 } from '../../src/knitout/kcode/machine-profile.js'

const options = {
  profile: KNITERATE_7GG_KCODE_PROFILE_V1,
  dialect: 'knitout-vendor' as const,
  strict: true,
}

describe('KCode byte intake', () => {
  it('roundtrips an accepted fixture byte-for-byte', () => {
    const bytes = readFileSync(resolve(__dirname, '../../reference/swatch.kc'))
    const parsed = parseKCodeBytes(bytes, options)

    expect(parsed.ok).toBe(true)
    expect(parsed.diagnostics).toEqual([])
    expect(emitKCodeDocumentBytes(parsed.document)).toEqual(new Uint8Array(bytes))
  })

  it.each([
    ['NUL', 0x00],
    ['invalid UTF-8 byte', 0xff],
  ])('rejects and preserves an embedded %s', (_name, byte) => {
    const clean = readFileSync(resolve(__dirname, '../../reference/swatch.kc'))
    const insertion = clean.indexOf(Buffer.from('// command.kc')) + 3
    const bytes = new Uint8Array(clean.length + 1)
    bytes.set(clean.subarray(0, insertion))
    bytes[insertion] = byte
    bytes.set(clean.subarray(insertion), insertion + 1)

    const parsed = parseKCodeBytes(bytes, options)

    expect(parsed.ok).toBe(false)
    expect(parsed.diagnostics).toContainEqual(expect.objectContaining({
      rule: 'kcode.source-byte',
      severity: 'error',
    }))
    expect(emitKCodeDocumentBytes(parsed.document)).toEqual(bytes)
  })
})
