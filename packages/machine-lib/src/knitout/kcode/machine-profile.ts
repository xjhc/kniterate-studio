/**
 * Versioned KCode target contract for Kniterate Studio's fixed V1 machine.
 *
 * This is deliberately separate from `recipes/MachineProfile`: recipes describe
 * yarn and construction choices, while this contract describes what a KCode
 * reader may structurally decode and which target-setting claims have evidence.
 * In particular, an editor range is not represented as a proven physical-safe
 * range.
 */

export type KCodeDialect = 'app' | 'knitout-vendor'

export type KCodeCarrierToken = '0' | '1' | '2' | '3' | '4' | '5' | '6'

export type KCodeEvidenceConfidence =
  | 'official-documented'
  | 'pinned-implementation'
  | 'repository-tested'
  | 'reference-corpus-observed'
  | 'unverified'

export interface KCodeEvidence {
  readonly confidence: KCodeEvidenceConfidence
  readonly provenance: readonly string[]
  readonly note?: string
}

export interface KCodeNumericBound {
  /** `null` means the contract does not have evidence for this bound. */
  readonly value: number | null
  readonly inclusive: boolean | null
  readonly evidence: KCodeEvidence
}

export interface KCodeNumericRange {
  readonly lower: KCodeNumericBound
  readonly upper: KCodeNumericBound
}

export interface KCodeDialectContract {
  readonly id: KCodeDialect
  /** Offset from a marker-free KCode column to the canonical trace frame. */
  readonly markerFreeTraceOffset: number
  readonly evidence: KCodeEvidence
}

export interface KCodeMachineProfileV1 {
  readonly schemaVersion: 1
  readonly profileId: string
  readonly profileVersion: 1
  readonly displayName: string
  /** Dialect emitted by the pinned Knitout backend. */
  readonly dialect: KCodeDialect
  readonly supportedDialects: readonly KCodeDialect[]
  readonly dialects: Readonly<Record<KCodeDialect, KCodeDialectContract>>

  readonly machine: {
    readonly gauge: number
    readonly needlesPerBed: number
    readonly addressableNeedleRange: { readonly min: number; readonly max: number }
    readonly carriers: readonly Exclude<KCodeCarrierToken, '0'>[]
    readonly evidence: {
      readonly gauge: KCodeEvidence
      readonly needlesPerBed: KCodeEvidence
      readonly addressableNeedleRange: KCodeEvidence
      readonly carriers: KCodeEvidence
    }
  }

  readonly raster: {
    readonly validationRole: 'structural'
    /** Padding in an undecorated FRNT/REAR/STIF/STIR payload. */
    readonly leftPaddingColumns: number
    readonly rightPaddingColumns: number
    /** Pinned backend's standard `0..252` KCode column domain. */
    readonly standardNeedleColumns: number
    readonly standardBasePayloadColumns: number
    readonly kcodeColumnRange: { readonly min: number; readonly max: number }
    /**
     * The pinned backend's carrierless `carriageMove` path predates the normal
     * raster builder and emits 252 rather than 253 needle-domain columns.
     * Strict readers may accept this shape only for the stated empty move.
     */
    readonly legacyEmptyMove: {
      readonly needleColumns: number
      readonly basePayloadColumns: number
      readonly carrier: '0'
      readonly passType: 'Kn-Kn'
      readonly requiresNoSelectedNeedles: true
    }
    readonly evidence: KCodeEvidence
  }

  readonly coordinates: {
    readonly payloadIndexToKCodeColumnOffset: number
    readonly physicalNeedleNumbering: {
      readonly status: 'unverified'
      readonly evidence: KCodeEvidence
    }
  }

  readonly rack: {
    readonly values: readonly number[]
    readonly documentedBounds: KCodeNumericRange
    readonly granularity: number
    readonly evidence: KCodeEvidence
  }

  readonly stitchSelectors: {
    /** Machine/editor selector levels, not the wider KCode token alphabet. */
    readonly documentedBounds: KCodeNumericRange
    readonly integerOnly: true
    /** The pinned backend can encode 0-9/A-Z even though 16-35 are not
     * documented machine selector levels. */
    readonly encoding: {
      readonly alphabet: string
      readonly encodableBounds: KCodeNumericRange
      readonly evidence: KCodeEvidence
    }
  }

  readonly processSettings: {
    readonly validationRole: 'advisory'
    readonly speed: {
      readonly unit: 'mm/s'
      readonly footerSyntax: 'decimal-number'
      readonly footerSyntaxEvidence: KCodeEvidence
      readonly editorDocumentedBounds: KCodeNumericRange
      /** Official pages currently conflict between 800 mm/s specification and
       * 0.4 m/s current maximum, so no operational bound is claimed here. */
      readonly operationalBounds: KCodeNumericRange
      readonly referenceCorpusObservedBounds: KCodeNumericRange
    }
    readonly roller: {
      readonly unit: 'machine-roller-command'
      readonly footerSyntax: 'decimal-number'
      readonly footerSyntaxEvidence: KCodeEvidence
      readonly editorDocumentedBounds: KCodeNumericRange
      /** The machine is documented as bidirectional, but no authoritative
       * signed KCode command bounds were found. */
      readonly operationalBounds: KCodeNumericRange
      readonly referenceCorpusObservedBounds: KCodeNumericRange
    }
  }
}

const OFFICIAL_OPTIONS =
  'https://support.kniterate.com/hc/en-us/articles/11675168630045-THE-OPTIONS-COLUMN'
const OFFICIAL_CUSTOMIST_MANUAL = 'https://www.customist.com/documentation'
const OFFICIAL_MACHINE =
  'https://www.kniterate.com/product/kniterate-the-digital-knitting-machine/'
const PINNED_BACKEND =
  'packages/machine-lib/src/knitout/vendor/knitout-to-kcode.cjs'
const REPO_CONSTANTS =
  'packages/machine-lib/src/knitout/kniterate/constants.ts'
const DIALECT_ORACLE =
  'packages/machine-lib/src/knitout/sophie/loop-stack-sim.ts'
const REFERENCE_CORPUS = 'packages/machine-lib/reference/*.kc'

const evidence = (
  confidence: KCodeEvidenceConfidence,
  provenance: readonly string[],
  note?: string,
): KCodeEvidence => ({
  confidence,
  provenance,
  ...(note === undefined ? {} : { note }),
})

const bound = (
  value: number | null,
  confidence: KCodeEvidenceConfidence,
  provenance: readonly string[],
  note?: string,
): KCodeNumericBound => ({
  value,
  inclusive: value === null ? null : true,
  evidence: evidence(confidence, provenance, note),
})

const unknownBound = (note: string, provenance: readonly string[] = []): KCodeNumericBound =>
  bound(null, 'unverified', provenance, note)

const officialBound = (value: number, note?: string): KCodeNumericBound =>
  bound(value, 'official-documented', [OFFICIAL_CUSTOMIST_MANUAL, OFFICIAL_OPTIONS, OFFICIAL_MACHINE], note)

const repositoryObservedRange = (min: number, max: number): KCodeNumericRange => ({
  lower: bound(min, 'reference-corpus-observed', [REFERENCE_CORPUS]),
  upper: bound(max, 'reference-corpus-observed', [REFERENCE_CORPUS]),
})

const RACK_VALUES = [
  -4, -3.5, -3, -2.5, -2, -1.5, -1, -0.5, 0,
  0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4,
] as const

/** Fixed V1 target. Bump `profileVersion` when any accepted structural shape,
 * dialect rule, or evidence-backed target range changes. */
export const KNITERATE_7GG_KCODE_PROFILE_V1: KCodeMachineProfileV1 = {
  schemaVersion: 1,
  profileId: 'kniterate-7gg-kcode',
  profileVersion: 1,
  displayName: 'Kniterate 7gg KCode (252 needles per bed)',
  dialect: 'knitout-vendor',
  supportedDialects: ['app', 'knitout-vendor'],
  dialects: {
    app: {
      id: 'app',
      markerFreeTraceOffset: 0,
      evidence: evidence('repository-tested', [DIALECT_ORACLE],
        'After ordered stop-marker removal, App-authored fixtures use their KCode raster column directly.'),
    },
    'knitout-vendor': {
      id: 'knitout-vendor',
      markerFreeTraceOffset: 0,
      evidence: evidence('pinned-implementation', [PINNED_BACKEND, DIALECT_ORACLE, REFERENCE_CORPUS],
        'The pinned backend writes carrier and carrierless selections into the same undecorated raster. The legacy oracle\'s carrier -1 compensates for counting decorated marker indices and must not be applied after complete marker removal.'),
    },
  },
  machine: {
    gauge: 7,
    needlesPerBed: 252,
    addressableNeedleRange: { min: 1, max: 252 },
    carriers: ['1', '2', '3', '4', '5', '6'],
    evidence: {
      gauge: evidence('official-documented', [OFFICIAL_MACHINE]),
      needlesPerBed: evidence('official-documented', [OFFICIAL_MACHINE]),
      addressableNeedleRange: evidence('repository-tested', [REPO_CONSTANTS],
        'The manufacturer documents the count; 1..252 is the compiler and validator numbering contract.'),
      carriers: evidence('official-documented', [OFFICIAL_CUSTOMIST_MANUAL, OFFICIAL_OPTIONS, OFFICIAL_MACHINE]),
    },
  },
  raster: {
    validationRole: 'structural',
    leftPaddingColumns: 15,
    rightPaddingColumns: 15,
    standardNeedleColumns: 253,
    standardBasePayloadColumns: 283,
    kcodeColumnRange: { min: 0, max: 252 },
    legacyEmptyMove: {
      needleColumns: 252,
      basePayloadColumns: 282,
      carrier: '0',
      passType: 'Kn-Kn',
      requiresNoSelectedNeedles: true,
    },
    evidence: evidence('pinned-implementation', [PINNED_BACKEND, REFERENCE_CORPUS],
      'The standard builders iterate KCode columns 0..252 with 15 columns of padding per side; carriageMove emits the narrow legacy shape.'),
  },
  coordinates: {
    payloadIndexToKCodeColumnOffset: -15,
    physicalNeedleNumbering: {
      status: 'unverified',
      evidence: evidence('unverified', [PINNED_BACKEND, DIALECT_ORACLE],
        'The 253-column KCode frame, 252 physical needles, and placement header must be resolved before presenting a KCode trace column as a physical needle label.'),
    },
  },
  rack: {
    values: RACK_VALUES,
    documentedBounds: {
      lower: officialBound(-4),
      upper: officialBound(4),
    },
    granularity: 0.5,
    evidence: evidence('repository-tested', [REPO_CONSTANTS, OFFICIAL_CUSTOMIST_MANUAL, OFFICIAL_OPTIONS, OFFICIAL_MACHINE],
      'Official sources document the ±4 envelope; the 0.5 step is the repository compiler contract.'),
  },
  stitchSelectors: {
    documentedBounds: {
      lower: officialBound(0),
      upper: officialBound(15),
    },
    integerOnly: true,
    encoding: {
      alphabet: '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ',
      encodableBounds: {
        lower: bound(0, 'pinned-implementation', [PINNED_BACKEND]),
        upper: bound(35, 'pinned-implementation', [PINNED_BACKEND]),
      },
      evidence: evidence('pinned-implementation', [PINNED_BACKEND],
        'Encoding capacity is not evidence that selectors 16..35 are supported machine settings.'),
    },
  },
  processSettings: {
    validationRole: 'advisory',
    speed: {
      unit: 'mm/s',
      footerSyntax: 'decimal-number',
      footerSyntaxEvidence: evidence('pinned-implementation', [PINNED_BACKEND]),
      editorDocumentedBounds: {
        lower: unknownBound('Official options documentation says only “up to 800 mm/sec”; it does not state a lower editor bound.', [OFFICIAL_CUSTOMIST_MANUAL, OFFICIAL_OPTIONS]),
        upper: officialBound(800),
      },
      operationalBounds: {
        lower: unknownBound('No authoritative minimum operational speed is encoded in this profile.', [OFFICIAL_MACHINE]),
        upper: unknownBound('Official product-page text conflicts: the specification lists 800 mm/s while its FAQ says the current maximum is 0.4 m/s.', [OFFICIAL_MACHINE]),
      },
      referenceCorpusObservedBounds: repositoryObservedRange(60, 700),
    },
    roller: {
      unit: 'machine-roller-command',
      footerSyntax: 'decimal-number',
      footerSyntaxEvidence: evidence('pinned-implementation', [PINNED_BACKEND]),
      editorDocumentedBounds: {
        lower: officialBound(-500),
        upper: officialBound(999),
      },
      operationalBounds: {
        lower: unknownBound('The machine is documented as bidirectional, but the signed KCode lower bound is not documented.', [OFFICIAL_MACHINE]),
        upper: unknownBound('The editor command ceiling is not treated as a proven physical-process ceiling.', [OFFICIAL_CUSTOMIST_MANUAL, OFFICIAL_OPTIONS, OFFICIAL_MACHINE]),
      },
      referenceCorpusObservedBounds: repositoryObservedRange(0, 600),
    },
  },
}

/** Convert an index in a marker-free standard payload into its KCode column. */
export function basePayloadIndexToKCodeColumn(index: number): number {
  const { leftPaddingColumns, standardBasePayloadColumns } = KNITERATE_7GG_KCODE_PROFILE_V1.raster
  if (!Number.isInteger(index) || index < 0 || index >= standardBasePayloadColumns) {
    throw new RangeError(`KCode payload index must be an integer in 0..${standardBasePayloadColumns - 1}`)
  }
  return index - leftPaddingColumns
}

/** Convert a standard KCode needle-domain column into a marker-free payload index. */
export function kcodeColumnToBasePayloadIndex(column: number): number {
  const { min, max } = KNITERATE_7GG_KCODE_PROFILE_V1.raster.kcodeColumnRange
  if (!Number.isInteger(column) || column < min || column > max) {
    throw new RangeError(`KCode column must be an integer in ${min}..${max}`)
  }
  return column - KNITERATE_7GG_KCODE_PROFILE_V1.coordinates.payloadIndexToKCodeColumnOffset
}

/** Normalize a marker-free KCode column into the dialect-independent trace frame. */
export function kcodeColumnToTraceCoordinate(
  column: number,
  dialect: KCodeDialect,
): number {
  const contract = KNITERATE_7GG_KCODE_PROFILE_V1.dialects[dialect]
  return column + contract.markerFreeTraceOffset
}
