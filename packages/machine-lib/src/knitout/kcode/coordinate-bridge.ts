import type { VendorKCodeCoordinateMappingV1 } from '../kniterate/vendor-pass-contract.js';
import type { KCodeMachineProfileV1 } from './machine-profile.js';
import type { MachineTraceV1 } from './machine-trace.js';
import type { ScheduledTraceComparisonV1 } from './scheduled-trace-diff.js';

const SHA256 = /^[a-f0-9]{64}$/;

export interface AuthoredKCodeCoordinateBridgeV1 {
  readonly kind: 'kniterate-authored-kcode-coordinate-bridge';
  readonly schemaVersion: 1;
  readonly provenance: 'authored-project-and-pinned-lowering';
  readonly artifactKcodeSha256: string;
  readonly profile: {
    readonly id: string;
    readonly version: number;
    readonly dialect: MachineTraceV1['dialect'];
  };
  readonly lowering: VendorKCodeCoordinateMappingV1;
  readonly compilerProject: {
    readonly basis: 'one-based-knitout-front-bed-needle';
    readonly start: number;
    readonly end: number;
  };
  readonly kcodeColumn: {
    readonly basis: 'marker-free-raster-column';
    readonly start: number;
    readonly end: number;
  };
  readonly traceCoordinate: {
    readonly basis: 'dialect-normalized-marker-free-coordinate';
    readonly start: number;
    readonly end: number;
  };
  readonly offsets: {
    readonly compilerProjectToKcodeColumn: number;
    readonly kcodeColumnToTraceCoordinate: number;
    readonly compilerProjectToTraceCoordinate: number;
  };
  readonly verification: {
    readonly scheduledTraceComparison: 'passed';
    readonly selectedTraceExtentMatchesMappedEndpoints: true;
  };
  readonly physicalNeedleLabels: {
    readonly status: 'unverified';
  };
}

export interface CreateAuthoredKCodeCoordinateBridgeInputV1 {
  readonly artifactKcodeSha256: string;
  readonly compilerCoordinateStart: number;
  readonly compilerCoordinateEnd: number;
  readonly lowering: VendorKCodeCoordinateMappingV1;
  readonly trace: MachineTraceV1;
  readonly scheduledTraceComparison: ScheduledTraceComparisonV1;
  readonly profile: KCodeMachineProfileV1;
}

export interface EndpointPhysicalNeedleMappingV1 {
  readonly kind: 'kniterate-endpoint-physical-needle-mapping';
  readonly schemaVersion: 1;
  readonly evidenceRole: 'calculation-from-separately-verified-endpoints';
  readonly orientation: 'increasing' | 'decreasing';
  readonly traceCoordinateStart: number;
  readonly traceCoordinateEnd: number;
  readonly physicalNeedleStart: number;
  readonly physicalNeedleEnd: number;
  readonly traceCoordinateToPhysicalNeedleScale: 1 | -1;
  readonly traceCoordinateToPhysicalNeedleOffset: number;
}

function integer(value: number, label: string): void {
  if (!Number.isSafeInteger(value)) throw new Error(`${label} must be a safe integer`);
}

function selectionExtents(trace: MachineTraceV1): {
  kcode: { min: number; max: number };
  trace: { min: number; max: number };
} | null {
  let kcodeMin = Number.POSITIVE_INFINITY;
  let kcodeMax = Number.NEGATIVE_INFINITY;
  let traceMin = Number.POSITIVE_INFINITY;
  let traceMax = Number.NEGATIVE_INFINITY;
  let count = 0;
  for (const pass of trace.passes) {
    for (const bed of [pass.selections.front, pass.selections.rear]) {
      for (const selection of bed) {
        kcodeMin = Math.min(kcodeMin, selection.kcodeColumn);
        kcodeMax = Math.max(kcodeMax, selection.kcodeColumn);
        traceMin = Math.min(traceMin, selection.traceCoordinate);
        traceMax = Math.max(traceMax, selection.traceCoordinate);
        count++;
      }
    }
  }
  return count === 0
    ? null
    : {
        kcode: { min: kcodeMin, max: kcodeMax },
        trace: { min: traceMin, max: traceMax },
      };
}

/**
 * Bind authored compiler/project coordinates to the exact placement selected
 * by the pinned backend and then to the strict trace frame. This function is
 * intentionally unavailable from direct KCode intake because a `.kc` file has
 * no authored compiler-coordinate provenance.
 */
export function createAuthoredKCodeCoordinateBridgeV1(
  input: CreateAuthoredKCodeCoordinateBridgeInputV1,
): AuthoredKCodeCoordinateBridgeV1 {
  integer(input.compilerCoordinateStart, 'compiler coordinate start');
  integer(input.compilerCoordinateEnd, 'compiler coordinate end');
  if (input.compilerCoordinateStart > input.compilerCoordinateEnd) {
    throw new Error('compiler coordinate start must not exceed end');
  }
  if (input.compilerCoordinateStart < 1) {
    throw new Error('authored compiler coordinates must use the one-based project domain');
  }
  if (!SHA256.test(input.artifactKcodeSha256)) {
    throw new Error('artifact KCode identity must be a lowercase SHA-256');
  }
  if (input.scheduledTraceComparison.ok !== true) {
    throw new Error('coordinate bridge requires a passing scheduled-to-trace differential');
  }
  if (
    input.trace.profileId !== input.profile.profileId
    || input.trace.profileVersion !== input.profile.profileVersion
    || input.trace.dialect !== input.profile.dialect
  ) {
    throw new Error('coordinate bridge trace does not match the selected profile and dialect');
  }
  const sourceRange = input.lowering.sourceSlotRange;
  if (
    input.lowering.schemaVersion !== 1
    || input.lowering.formula !== 'kcodeColumn=frontSourceSlot+offset'
    || !['Left', 'Center', 'Right', 'Keep'].includes(input.lowering.position)
  ) {
    throw new Error('lowering coordinate mapping metadata is unsupported');
  }
  if (!Number.isFinite(sourceRange.min) || !Number.isFinite(sourceRange.max)) {
    throw new Error('lowering source-slot range must be finite');
  }
  if (sourceRange.min > sourceRange.max) {
    throw new Error('lowering source-slot range is reversed');
  }
  integer(input.lowering.frontSourceSlotToKCodeColumnOffset, 'front source-slot offset');
  // The lowered range also counts carrier parking misses beyond the piece
  // (the beanie frame parks 1-3 needles out); they select no needle. The
  // selection-extent check below pins the authored range to exactly the
  // needles the trace selects.
  if (
    input.compilerCoordinateStart < sourceRange.min
    || input.compilerCoordinateEnd > sourceRange.max
  ) {
    throw new Error('compiler coordinate endpoints must lie within the lowered source-slot endpoints');
  }

  const compilerToKcode = input.lowering.frontSourceSlotToKCodeColumnOffset;
  const kcodeStart = input.compilerCoordinateStart + compilerToKcode;
  const kcodeEnd = input.compilerCoordinateEnd + compilerToKcode;
  const kcodeRange = input.profile.raster.kcodeColumnRange;
  if (kcodeStart < kcodeRange.min || kcodeEnd > kcodeRange.max) {
    throw new Error('mapped authored range is outside the profile KCode-column range');
  }
  const kcodeToTrace = input.profile.dialects[input.trace.dialect].markerFreeTraceOffset;
  const traceStart = kcodeStart + kcodeToTrace;
  const traceEnd = kcodeEnd + kcodeToTrace;
  const extents = selectionExtents(input.trace);
  if (
    extents === null
    || extents.kcode.min !== kcodeStart
    || extents.kcode.max !== kcodeEnd
    || extents.trace.min !== traceStart
    || extents.trace.max !== traceEnd
  ) {
    throw new Error(
      'strict trace selection endpoints do not match the mapped authored range',
    );
  }

  return {
    kind: 'kniterate-authored-kcode-coordinate-bridge',
    schemaVersion: 1,
    provenance: 'authored-project-and-pinned-lowering',
    artifactKcodeSha256: input.artifactKcodeSha256,
    profile: {
      id: input.trace.profileId,
      version: input.trace.profileVersion,
      dialect: input.trace.dialect,
    },
    lowering: input.lowering,
    compilerProject: {
      basis: 'one-based-knitout-front-bed-needle',
      start: input.compilerCoordinateStart,
      end: input.compilerCoordinateEnd,
    },
    kcodeColumn: {
      basis: 'marker-free-raster-column',
      start: kcodeStart,
      end: kcodeEnd,
    },
    traceCoordinate: {
      basis: 'dialect-normalized-marker-free-coordinate',
      start: traceStart,
      end: traceEnd,
    },
    offsets: {
      compilerProjectToKcodeColumn: compilerToKcode,
      kcodeColumnToTraceCoordinate: kcodeToTrace,
      compilerProjectToTraceCoordinate: compilerToKcode + kcodeToTrace,
    },
    verification: {
      scheduledTraceComparison: 'passed',
      selectedTraceExtentMatchesMappedEndpoints: true,
    },
    physicalNeedleLabels: { status: 'unverified' },
  };
}

/**
 * Calculate the affine map implied by two observed physical endpoint labels.
 * The caller remains responsible for establishing those observations, datum
 * method, independent verifier, time, and exact machine/controller identity.
 */
export function deriveEndpointPhysicalNeedleMappingV1(
  bridge: AuthoredKCodeCoordinateBridgeV1,
  physicalNeedleStart: number,
  physicalNeedleEnd: number,
): EndpointPhysicalNeedleMappingV1 {
  integer(physicalNeedleStart, 'physical needle start');
  integer(physicalNeedleEnd, 'physical needle end');
  const traceSpan = bridge.traceCoordinate.end - bridge.traceCoordinate.start;
  const physicalSpan = Math.abs(physicalNeedleEnd - physicalNeedleStart);
  if (physicalSpan !== traceSpan) {
    throw new Error('physical endpoint span must equal the trace-coordinate span');
  }
  const scale: 1 | -1 = physicalNeedleEnd >= physicalNeedleStart ? 1 : -1;
  return {
    kind: 'kniterate-endpoint-physical-needle-mapping',
    schemaVersion: 1,
    evidenceRole: 'calculation-from-separately-verified-endpoints',
    orientation: scale === 1 ? 'increasing' : 'decreasing',
    traceCoordinateStart: bridge.traceCoordinate.start,
    traceCoordinateEnd: bridge.traceCoordinate.end,
    physicalNeedleStart,
    physicalNeedleEnd,
    traceCoordinateToPhysicalNeedleScale: scale,
    traceCoordinateToPhysicalNeedleOffset:
      physicalNeedleStart - scale * bridge.traceCoordinate.start,
  };
}

export function physicalNeedleForTraceCoordinateV1(
  mapping: EndpointPhysicalNeedleMappingV1,
  traceCoordinate: number,
): number {
  if (
    !Number.isInteger(traceCoordinate)
    || traceCoordinate < mapping.traceCoordinateStart
    || traceCoordinate > mapping.traceCoordinateEnd
  ) {
    throw new RangeError('trace coordinate is outside the verified endpoint range');
  }
  return mapping.traceCoordinateToPhysicalNeedleScale * traceCoordinate
    + mapping.traceCoordinateToPhysicalNeedleOffset;
}
