import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { knitoutToKCodeWithTrace } from '../../src/knitout/kniterate/to-kcode';
import {
  createAuthoredKCodeCoordinateBridgeV1,
  deriveEndpointPhysicalNeedleMappingV1,
  physicalNeedleForTraceCoordinateV1,
} from '../../src/knitout/kcode/coordinate-bridge';
import { KNITERATE_7GG_KCODE_PROFILE_V2 } from '../../src/knitout/kcode/machine-profile';
import { projectKCodeMachineTrace } from '../../src/knitout/kcode/machine-trace';
import { parseKCodeDocument } from '../../src/knitout/kcode/parser';
import { compareScheduledPassesToMachineTrace } from '../../src/knitout/kcode/scheduled-trace-diff';

function authoredSource(
  start: number,
  end: number,
  position: 'Center' | 'Keep',
): string {
  return [
    ';!knitout-2',
    ';;Machine: kniterate',
    ';;Carriers: 1 2 3 4 5 6',
    `;;Position: ${position}`,
    'in 2',
    ...Array.from({ length: end - start + 1 }, (_, index) => `knit + f${start + index} 2`),
    ...Array.from({ length: end - start + 1 }, (_, index) => `knit - f${end - index} 2`),
    'out 2',
    '',
  ].join('\n');
}

function bridge(start: number, end: number, position: 'Center' | 'Keep') {
  const source = authoredSource(start, end, position);
  const converted = knitoutToKCodeWithTrace(source, 'command.k');
  if (!converted.ok) throw new Error(converted.error);
  const parsed = parseKCodeDocument(converted.kcode, {
    profile: KNITERATE_7GG_KCODE_PROFILE_V2,
    dialect: KNITERATE_7GG_KCODE_PROFILE_V2.dialect,
    strict: true,
  });
  if (!parsed.ok) throw new Error(parsed.diagnostics.map((item) => item.message).join('; '));
  const trace = projectKCodeMachineTrace(parsed.document, KNITERATE_7GG_KCODE_PROFILE_V2);
  return createAuthoredKCodeCoordinateBridgeV1({
    artifactKcodeSha256: createHash('sha256').update(converted.kcode).digest('hex'),
    compilerCoordinateStart: start,
    compilerCoordinateEnd: end,
    lowering: converted.coordinateMapping,
    trace,
    scheduledTraceComparison: compareScheduledPassesToMachineTrace(
      converted.scheduledPasses,
      trace,
    ),
    profile: KNITERATE_7GG_KCODE_PROFILE_V2,
  });
}

describe('authored compiler to KCode coordinate bridge', () => {
  it('retains the actual Center placement instead of assuming a fixed minus-one offset', () => {
    const result = bridge(1, 10, 'Center');

    expect(result).toMatchObject({
      provenance: 'authored-project-and-pinned-lowering',
      lowering: {
        position: 'Center',
        sourceSlotRange: { min: 1, max: 10 },
        frontSourceSlotToKCodeColumnOffset: 120,
      },
      compilerProject: { start: 1, end: 10 },
      kcodeColumn: { start: 121, end: 130 },
      traceCoordinate: { start: 121, end: 130 },
      offsets: {
        compilerProjectToKcodeColumn: 120,
        kcodeColumnToTraceCoordinate: 0,
        compilerProjectToTraceCoordinate: 120,
      },
      verification: {
        scheduledTraceComparison: 'passed',
        selectedTraceExtentMatchesMappedEndpoints: true,
      },
      physicalNeedleLabels: { status: 'unverified' },
    });
  });

  it('retains Keep placement and maps independently verified endpoint orientations', () => {
    const result = bridge(40, 43, 'Keep');
    expect(result.kcodeColumn).toMatchObject({ start: 39, end: 42 });
    expect(result.traceCoordinate).toMatchObject({ start: 39, end: 42 });

    const increasing = deriveEndpointPhysicalNeedleMappingV1(result, 101, 104);
    expect(increasing.orientation).toBe('increasing');
    expect(physicalNeedleForTraceCoordinateV1(increasing, 39)).toBe(101);
    expect(physicalNeedleForTraceCoordinateV1(increasing, 42)).toBe(104);

    const decreasing = deriveEndpointPhysicalNeedleMappingV1(result, 104, 101);
    expect(decreasing.orientation).toBe('decreasing');
    expect(physicalNeedleForTraceCoordinateV1(decreasing, 39)).toBe(104);
    expect(physicalNeedleForTraceCoordinateV1(decreasing, 42)).toBe(101);
    expect(() => physicalNeedleForTraceCoordinateV1(decreasing, 38)).toThrow(RangeError);
  });

  it('fails closed when the hash, differential, or selected endpoints cannot bind the authored range', () => {
    const result = bridge(40, 43, 'Keep');
    expect(() => deriveEndpointPhysicalNeedleMappingV1(result, 1, 5)).toThrow(
      /span must equal/,
    );

    const source = authoredSource(40, 43, 'Keep');
    const converted = knitoutToKCodeWithTrace(source, 'command.k');
    if (!converted.ok) throw new Error(converted.error);
    const parsed = parseKCodeDocument(converted.kcode, {
      profile: KNITERATE_7GG_KCODE_PROFILE_V2,
      dialect: KNITERATE_7GG_KCODE_PROFILE_V2.dialect,
      strict: true,
    });
    if (!parsed.ok) throw new Error('fixture parse failed');
    const trace = projectKCodeMachineTrace(parsed.document, KNITERATE_7GG_KCODE_PROFILE_V2);
    const comparison = compareScheduledPassesToMachineTrace(converted.scheduledPasses, trace);
    expect(() => createAuthoredKCodeCoordinateBridgeV1({
      artifactKcodeSha256: 'not-a-hash',
      compilerCoordinateStart: 40,
      compilerCoordinateEnd: 43,
      lowering: converted.coordinateMapping,
      trace,
      scheduledTraceComparison: comparison,
      profile: KNITERATE_7GG_KCODE_PROFILE_V2,
    })).toThrow(/SHA-256/);
    expect(() => createAuthoredKCodeCoordinateBridgeV1({
      artifactKcodeSha256: 'a'.repeat(64),
      compilerCoordinateStart: 40,
      compilerCoordinateEnd: 44,
      lowering: converted.coordinateMapping,
      trace,
      scheduledTraceComparison: comparison,
      profile: KNITERATE_7GG_KCODE_PROFILE_V2,
    })).toThrow(/must lie within the lowered source-slot endpoints/);
    // Inside the lowered range but narrower than the needles the trace selects: still refused.
    expect(() => createAuthoredKCodeCoordinateBridgeV1({
      artifactKcodeSha256: 'a'.repeat(64),
      compilerCoordinateStart: 41,
      compilerCoordinateEnd: 43,
      lowering: converted.coordinateMapping,
      trace,
      scheduledTraceComparison: comparison,
      profile: KNITERATE_7GG_KCODE_PROFILE_V2,
    })).toThrow(/selection endpoints do not match/);
  });
});
