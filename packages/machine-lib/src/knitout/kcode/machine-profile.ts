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

export type KCodeOperationV1 =
  | 'Kn-Kn'
  | 'Tu-Tu'
  | 'Kn-Tu'
  | 'Tu-Kn'
  | 'Tr-Rl'
  | 'Tr-Rr'
  | 'Rl-Tr'
  | 'Rr-Tr'

export type KCodePassDirectionV1 = '>>' | '<<'
export type KCodeRegularBedActionV1 = 'knit' | 'tuck'
export type KCodeTraceBedV1 = 'front' | 'rear'

interface KCodeOperationContractBaseV1 {
  readonly operation: KCodeOperationV1
  readonly allowedDirections: readonly KCodePassDirectionV1[]
  readonly carrierZeroAction: 'drop' | 'xfer'
  readonly carrierAction: 'bed-operation' | 'split'
  readonly emptySelectionAction: 'move' | 'invalid'
  readonly evidence: KCodeEvidence
}

export interface KCodeRegularOperationContractV1 extends KCodeOperationContractBaseV1 {
  readonly family: 'regular'
  readonly frontAction: KCodeRegularBedActionV1
  readonly rearAction: KCodeRegularBedActionV1
  readonly carrierZeroAction: 'drop'
  readonly carrierAction: 'bed-operation'
  readonly emptySelectionAction: 'move'
}

export interface KCodeTransferOperationContractV1 extends KCodeOperationContractBaseV1 {
  readonly family: 'transfer'
  readonly sourceBed: KCodeTraceBedV1
  readonly targetBed: KCodeTraceBedV1
  /** target trace coordinate = source trace coordinate + rack * multiplier */
  readonly targetRackMultiplier: -1 | 1
  readonly carrierZeroAction: 'xfer'
  readonly carrierAction: 'split'
  readonly emptySelectionAction: 'invalid'
}

export type KCodeOperationContractV1 =
  | KCodeRegularOperationContractV1
  | KCodeTransferOperationContractV1

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

/**
 * Authority boundary for V1 command interpretation. The official KCode
 * specification governs the serialized logical language. It does not resolve
 * how a controller revision maps transfer tokens to observed physical motion.
 */
export interface KCodeCommandAuthorityV1 {
  readonly serializedCommandSemantics: 'official-kcode-specification-v1'
  readonly physicalTransferDirection: 'unresolved-authoritative-conflict'
  readonly validationClaim: 'serialized-command-conformance-only'
  readonly controllerAcceptance: 'not-established-by-software-validation'
  readonly evidence: {
    readonly serializedSpecification: KCodeEvidence
    readonly physicalMachineManual: KCodeEvidence
  }
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

/**
 * A deterministic software gate shared by authored-plan and emitted-KCode
 * replay. These thresholds are deliberately conservative product policy, not
 * measured machine capacity or a claim that a larger stack will physically
 * jam, break yarn, or fail to knit.
 */
export interface LoopStackSoftwarePolicyV1 {
  readonly validationRole: 'conservative-software-policy'
  readonly warningAbove: number
  readonly errorAbove: number
  readonly physicalSafetyClaim: 'not-established'
}

export const KNITERATE_LOOP_STACK_SOFTWARE_POLICY_V1: LoopStackSoftwarePolicyV1 = {
  validationRole: 'conservative-software-policy',
  warningAbove: 2,
  errorAbove: 3,
  physicalSafetyClaim: 'not-established',
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
  readonly operations: Readonly<Record<KCodeOperationV1, KCodeOperationContractV1>>
  readonly commandAuthority: KCodeCommandAuthorityV1

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

  readonly loopStackSoftwarePolicy: LoopStackSoftwarePolicyV1

  readonly stitchSelectors: {
    /** Official KCode 1.0 selector levels. */
    readonly documentedBounds: KCodeNumericRange
    readonly integerOnly: true
    /** Accepted serialized alphabet. This may not exceed the official range. */
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
const OFFICIAL_KCODE_SPECS =
  'https://drive.google.com/file/d/1KFiS1Crfaqba8t1vhqk2IqthqDSTyqKS/view'
const OFFICIAL_MACHINE_MANUAL =
  'https://support.kniterate.com/hc/en-us/article_attachments/360009817198'
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

const operationEvidence = evidence(
  'pinned-implementation',
  [OFFICIAL_KCODE_SPECS, OFFICIAL_MACHINE_MANUAL, PINNED_BACKEND, REFERENCE_CORPUS],
  'The official KCode 1.0 specification defines Kn/Tu/Tr/Rr/Rl bed modes and Rr/Rl receive direction. Carrier-0 and carrier-1..6 action behavior is pinned-backend and corpus evidence, not an official controller-acceptance claim. The machine manual describes physical transfer direction differently, so this contract proves serialized command conformance but does not translate a token into controller-observed physical motion.',
)

const regularOperation = (
  operation: KCodeOperationV1,
  frontAction: KCodeRegularBedActionV1,
  rearAction: KCodeRegularBedActionV1,
): KCodeRegularOperationContractV1 => ({
  operation,
  family: 'regular',
  allowedDirections: ['>>', '<<'],
  frontAction,
  rearAction,
  carrierZeroAction: 'drop',
  carrierAction: 'bed-operation',
  emptySelectionAction: 'move',
  evidence: operationEvidence,
})

const transferOperation = (
  operation: KCodeOperationV1,
  direction: KCodePassDirectionV1,
  sourceBed: KCodeTraceBedV1,
): KCodeTransferOperationContractV1 => ({
  operation,
  family: 'transfer',
  allowedDirections: [direction],
  sourceBed,
  targetBed: sourceBed === 'front' ? 'rear' : 'front',
  targetRackMultiplier: sourceBed === 'front' ? -1 : 1,
  carrierZeroAction: 'xfer',
  carrierAction: 'split',
  emptySelectionAction: 'invalid',
  evidence: operationEvidence,
})

export const KNITERATE_KCODE_OPERATION_CONTRACTS_V1 = Object.freeze({
  'Kn-Kn': regularOperation('Kn-Kn', 'knit', 'knit'),
  'Tu-Tu': regularOperation('Tu-Tu', 'tuck', 'tuck'),
  'Kn-Tu': regularOperation('Kn-Tu', 'knit', 'tuck'),
  'Tu-Kn': regularOperation('Tu-Kn', 'tuck', 'knit'),
  'Tr-Rl': transferOperation('Tr-Rl', '<<', 'front'),
  'Tr-Rr': transferOperation('Tr-Rr', '>>', 'front'),
  'Rl-Tr': transferOperation('Rl-Tr', '<<', 'rear'),
  'Rr-Tr': transferOperation('Rr-Tr', '>>', 'rear'),
} as const) satisfies Readonly<Record<KCodeOperationV1, KCodeOperationContractV1>>

export function kcodeOperationContractV1(
  profile: KCodeMachineProfileV1,
  operation: string,
): KCodeOperationContractV1 | null {
  if (!Object.prototype.hasOwnProperty.call(profile.operations, operation)) return null
  return profile.operations[operation as KCodeOperationV1]
}

/** Fixed V1 target. Bump `profileVersion` when any accepted structural shape,
 * dialect rule, or evidence-backed target range changes. */
export const KNITERATE_7GG_KCODE_PROFILE_V1: KCodeMachineProfileV1 = {
  schemaVersion: 1,
  profileId: 'kniterate-7gg-kcode',
  profileVersion: 1,
  displayName: 'Kniterate 7gg KCode (252 needles per bed)',
  dialect: 'knitout-vendor',
  supportedDialects: ['app', 'knitout-vendor'],
  operations: KNITERATE_KCODE_OPERATION_CONTRACTS_V1,
  commandAuthority: {
    serializedCommandSemantics: 'official-kcode-specification-v1',
    physicalTransferDirection: 'unresolved-authoritative-conflict',
    validationClaim: 'serialized-command-conformance-only',
    controllerAcceptance: 'not-established-by-software-validation',
    evidence: {
      serializedSpecification: evidence(
        'official-documented',
        [OFFICIAL_KCODE_SPECS],
        'The official KCode 1.0 specification is authoritative for the logical Tr/Rr/Rl token language accepted by profile V1.',
      ),
      physicalMachineManual: evidence(
        'unverified',
        [OFFICIAL_MACHINE_MANUAL],
        'The machine manual describes transfer traverse/bed direction differently. Software validation therefore makes no controller-observed physical-direction claim.',
      ),
    },
  },
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
  loopStackSoftwarePolicy: KNITERATE_LOOP_STACK_SOFTWARE_POLICY_V1,
  stitchSelectors: {
    documentedBounds: {
      lower: bound(0, 'official-documented', [OFFICIAL_KCODE_SPECS]),
      upper: bound(15, 'official-documented', [OFFICIAL_KCODE_SPECS]),
    },
    integerOnly: true,
    encoding: {
      alphabet: '0123456789ABCDEF',
      encodableBounds: {
        lower: bound(0, 'official-documented', [OFFICIAL_KCODE_SPECS]),
        upper: bound(15, 'official-documented', [OFFICIAL_KCODE_SPECS]),
      },
      evidence: evidence('official-documented', [OFFICIAL_KCODE_SPECS],
        'KCode 1.0 defines the sixteen stitch selector tokens 0-9 and A-F.'),
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
