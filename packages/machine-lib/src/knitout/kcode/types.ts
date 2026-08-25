import type {
  KCodeCarrierToken,
  KCodeDialect,
  KCodeMachineProfileV1,
} from './machine-profile.js'

export type KCodeLineEnding = '' | '\n' | '\r\n' | '\r'

export interface KCodeSourcePosition {
  /** UTF-16 source offset. Offsets are exact for JavaScript string round trips. */
  readonly offset: number
  /** One-based physical line. */
  readonly line: number
  /** One-based UTF-16 column. */
  readonly column: number
}

export interface KCodeSourceSpan {
  readonly start: KCodeSourcePosition
  /** Exclusive end. */
  readonly end: KCodeSourcePosition
}

interface KCodeRecordBase {
  readonly recordIndex: number
  readonly line: number
  /** Line contents without its terminator. */
  readonly raw: string
  readonly lineEnding: KCodeLineEnding
  /** Exact line-content span, excluding the terminator. */
  readonly span: KCodeSourceSpan
  /** Exact record span, including the terminator. */
  readonly fullSpan: KCodeSourceSpan
}

export interface KCodeHomeRecord extends KCodeRecordBase {
  readonly kind: 'home'
}

export interface KCodeRackRecord extends KCodeRecordBase {
  readonly kind: 'rack'
  readonly valueRaw: string
  readonly value: number | null
  readonly valueSpan: KCodeSourceSpan
}

export interface KCodeCommentRecord extends KCodeRecordBase {
  readonly kind: 'comment'
  /** Comment text after the leading `//`, preserved without normalization. */
  readonly text: string
}

export interface KCodeBlankRecord extends KCodeRecordBase {
  readonly kind: 'blank'
}

export type KCodePassFieldName = 'FRNT' | 'STIF' | 'REAR' | 'STIR'

export interface KCodePassFieldRecord extends KCodeRecordBase {
  readonly kind: 'pass-field'
  readonly field: KCodePassFieldName
  readonly value: string
  readonly valueSpan: KCodeSourceSpan
}

export interface KCodeFooterToken {
  readonly raw: string
  readonly span: KCodeSourceSpan
}

export interface KCodeFooterRecord extends KCodeRecordBase {
  readonly kind: 'footer'
  readonly tokens: readonly KCodeFooterToken[]
  readonly direction: '>>' | '<<' | null
  readonly operation: string | null
  readonly carrier: KCodeCarrierToken | null
  readonly speedRaw: string | null
  readonly speed: number | null
  readonly rollerRaw: string | null
  readonly roller: number | null
}

export interface KCodeUnknownRecord extends KCodeRecordBase {
  readonly kind: 'unknown'
}

export type KCodeRecord =
  | KCodeHomeRecord
  | KCodeRackRecord
  | KCodeCommentRecord
  | KCodeBlankRecord
  | KCodePassFieldRecord
  | KCodeFooterRecord
  | KCodeUnknownRecord

export interface KCodePassBlock {
  readonly index: number
  /** Effective rack at the start of the pass. KCode starts at rack zero. */
  readonly rack: number
  readonly frnt: KCodePassFieldRecord
  readonly stif: KCodePassFieldRecord
  readonly rear: KCodePassFieldRecord
  readonly stir: KCodePassFieldRecord
  readonly footer: KCodeFooterRecord
  /** From `FRNT` content start through the footer content end. */
  readonly span: KCodeSourceSpan
  /** From `FRNT` content start through the footer terminator. */
  readonly fullSpan: KCodeSourceSpan
}

export interface KCodeDocumentMetadataV1 {
  readonly schemaVersion: 1
  readonly profileId: string
  readonly profileVersion: number
  /** Always supplied by the caller. The parser never infers this value. */
  readonly dialect: KCodeDialect
  readonly strict: boolean
  /**
   * Parser acceptance is part of the document contract, not an out-of-band
   * convention. Rejected documents remain lossless for diagnostics but may not
   * be projected into executable machine state.
   */
  readonly parseStatus: 'accepted' | 'rejected'
}

export interface KCodeDocumentV1 {
  readonly metadata: KCodeDocumentMetadataV1
  /** Original source retained as an audit/reference surface. */
  readonly rawText: string
  /** Every source code unit is represented by exactly one ordered record. */
  readonly records: readonly KCodeRecord[]
  readonly home: KCodeHomeRecord | null
  readonly initialRack: KCodeRackRecord | null
  readonly racks: readonly KCodeRackRecord[]
  readonly passes: readonly KCodePassBlock[]
  readonly unknownRecords: readonly KCodeUnknownRecord[]
}

export type KCodeDiagnosticSeverity = 'error' | 'warning'

export type KCodeDiagnosticRule =
  | 'kcode.unsupported-dialect'
  | 'kcode.missing-home'
  | 'kcode.duplicate-home'
  | 'kcode.home-order'
  | 'kcode.missing-initial-rack'
  | 'kcode.initial-rack'
  | 'kcode.rack-order'
  | 'kcode.invalid-rack'
  | 'kcode.source-byte'
  | 'kcode.unknown-record'
  | 'kcode.pass-interrupted'
  | 'kcode.orphan-field'
  | 'kcode.field-order'
  | 'kcode.incomplete-pass'
  | 'kcode.orphan-footer'
  | 'kcode.footer-arity'
  | 'kcode.footer-whitespace'
  | 'kcode.footer-direction'
  | 'kcode.footer-operation'
  | 'kcode.footer-carrier'
  | 'kcode.footer-number'
  | 'kcode.field-charset'
  | 'kcode.field-width'
  | 'kcode.bed-markers'
  | 'kcode.bed-padding'
  | 'kcode.no-passes'

export interface KCodeDiagnostic {
  readonly severity: KCodeDiagnosticSeverity
  readonly rule: KCodeDiagnosticRule
  readonly message: string
  readonly span: KCodeSourceSpan
  readonly line: number
  readonly column: number
  readonly endLine: number
  readonly endColumn: number
}

export interface ParseKCodeDocumentOptions {
  readonly profile: KCodeMachineProfileV1
  /** Required explicitly; profile defaults are intentionally not consulted. */
  readonly dialect: KCodeDialect
  /** Strict mode rejects unknown records; inspection mode preserves and warns. */
  readonly strict: boolean
}

export interface ParseKCodeDocumentResult {
  readonly document: KCodeDocumentV1
  readonly diagnostics: readonly KCodeDiagnostic[]
  readonly ok: boolean
}
