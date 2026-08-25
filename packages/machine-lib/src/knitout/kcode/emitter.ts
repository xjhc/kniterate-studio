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
  return document.records.map((record) => record.raw + record.lineEnding).join('')
}
