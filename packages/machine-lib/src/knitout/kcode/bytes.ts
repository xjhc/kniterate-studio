import { emitKCodeDocument } from './emitter.js'
import {
  MAX_KCODE_SOURCE_CODE_UNITS,
  parseKCodeDocument,
} from './parser.js'
import type {
  KCodeDocumentV1,
  ParseKCodeDocumentOptions,
  ParseKCodeDocumentResult,
} from './types.js'

const BYTE_CHUNK = 8_192

/**
 * Decode bytes one-to-one into source code units before parsing.
 *
 * KCode accepted by the strict parser is printable 7-bit ASCII, but a failed
 * import must still retain the exact offending bytes. Latin-1-style decoding
 * keeps byte offsets identical to parser offsets and avoids UTF-8 replacement
 * characters destroying evidence before diagnostics run.
 */
export function parseKCodeBytes(
  bytes: Uint8Array,
  options: ParseKCodeDocumentOptions,
): ParseKCodeDocumentResult {
  if (bytes.byteLength > MAX_KCODE_SOURCE_CODE_UNITS) {
    const empty = parseKCodeDocument('', options)
    const origin = { offset: 0, line: 1, column: 1 }
    return {
      ok: false,
      diagnostics: [{
        severity: 'error',
        rule: 'kcode.resource-limit',
        message: `KCode byte input exceeds the ${MAX_KCODE_SOURCE_CODE_UNITS}-byte decode limit; received ${bytes.byteLength}. Oversized bytes remain caller-owned and were not copied into the parsed document.`,
        span: { start: origin, end: origin },
        line: 1,
        column: 1,
        endLine: 1,
        endColumn: 1,
      }],
      document: {
        ...empty.document,
        metadata: {
          ...empty.document.metadata,
          sourceRetention: 'caller-owned-oversized-bytes',
          recordMaterialization: 'resource-limited',
        },
      },
    }
  }
  let source = ''
  for (let offset = 0; offset < bytes.length; offset += BYTE_CHUNK) {
    source += String.fromCharCode(...bytes.subarray(offset, offset + BYTE_CHUNK))
  }
  return parseKCodeDocument(source, options)
}

/** Re-emit the exact original byte stream represented by a parsed document. */
export function emitKCodeDocumentBytes(document: KCodeDocumentV1): Uint8Array {
  const source = emitKCodeDocument(document)
  const bytes = new Uint8Array(source.length)
  for (let index = 0; index < source.length; index++) {
    const code = source.charCodeAt(index)
    if (code > 0xff) {
      throw new RangeError(
        `KCode record contains non-byte code unit U+${code.toString(16).padStart(4, '0')} at offset ${index}.`,
      )
    }
    bytes[index] = code
  }
  return bytes
}
