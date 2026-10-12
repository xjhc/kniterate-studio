import type { KCodeDocumentV1 } from './types.js'

/**
 * Emit the exact parsed source representation.
 *
 * This intentionally serializes records rather than normalizing semantic
 * fields. It therefore preserves comments, unknown records, mixed line endings,
 * malformed records retained for diagnostics, and the presence/absence of a
 * final terminator.
 */
export function emitKCodeDocument(document: KCodeDocumentV1): string {
  if (document.metadata.sourceRetention !== 'exact') {
    throw new Error(
      'Cannot emit KCode document: oversized source bytes remain caller-owned and were not decoded into rawText.',
    )
  }
  if (document.metadata.recordMaterialization === 'resource-limited') {
    return document.rawText
  }
  return document.records.map((record) => record.raw + record.lineEnding).join('')
}
