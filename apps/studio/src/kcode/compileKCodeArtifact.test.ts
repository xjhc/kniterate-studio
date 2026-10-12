import { parseKnitoutProgram } from '@kniterate-studio/machine-lib/browser';
import { assessAuthoredCapacityV1, createColorworkProjectV1 } from '@kniterate-studio/project-contract';
import { describe, expect, it } from 'vitest';
import {
  compileKCodeArtifact,
  projectScheduledPassProvenance,
} from './compileKCodeArtifact';

const SOURCE = [
  ';!knitout-2',
  ';;Machine: kniterate',
  ';;Carriers: 1 2 3 4 5 6',
  'x-stitch-number 6',
  'x-speed-number 300',
  'x-roller-advance 450',
  'in 2',
  'tuck + f40 2',
  'knit - f40 2',
  'xfer f40 b40',
  'out 2',
  '',
].join('\n');

function testCapacity() {
  const capacity = assessAuthoredCapacityV1(createColorworkProjectV1({
    kind: 'knitlab-colorwork-chart', version: 1, width: 1, height: 1,
    rowNumbering: 'bottom-up',
    palette: [{ id: 'ink', name: 'Ink', hex: '#112233' }],
    cells: [[0]],
  }, { id: 'kcode-capacity-test' }));
  if (capacity.status === 'blocked') throw new Error(capacity.message);
  return capacity;
}

describe('compileKCodeArtifact', () => {
  it('withholds Knitout needle labels when the authored range does not match the emitted trace', async () => {
    const parsed = parseKnitoutProgram(SOURCE);
    const artifact = await compileKCodeArtifact({
      kind: 'convert-kcode',
      requestId: 1,
      inputHash: 'test-input',
      capacity: testCapacity(),
      knitoutText: SOURCE,
      compilerNeedleRange: { start: 41, end: 44 },
      programOpSourceRows: parsed.opLines.map(() => null),
      rowProvenance: [],
    });

    expect(artifact.coordinateBridge).toBeNull();
    expect(artifact.passKnitoutNeedles).toHaveLength(artifact.passCount);
    expect(artifact.passKnitoutNeedles.every((range) => range === null)).toBe(true);
  });

  it('proves emitted KCode and joins scheduled passes to authored rows by source line', async () => {
    const parsed = parseKnitoutProgram(SOURCE);
    const programOpSourceRows = parsed.opLines.map((line) => line >= 8 && line <= 10 ? [0] : null);
    const artifact = await compileKCodeArtifact({
      kind: 'convert-kcode',
      requestId: 1,
      inputHash: 'test-input',
      capacity: testCapacity(),
      knitoutText: SOURCE,
      compilerNeedleRange: { start: 40, end: 40 },
      programOpSourceRows,
      rowProvenance: [{ rowId: 'row-0', chartRow: 0, machineRow: 0 }],
    });

    expect(artifact.ok).toBe(true);
    expect(artifact.coordinateBridge).toMatchObject({
      compilerProject: { start: 40, end: 40 },
      physicalNeedleLabels: { status: 'unverified' },
    });
    expect(artifact.passKnitoutNeedles).toHaveLength(artifact.passCount);
    expect(artifact.passKnitoutNeedles.filter((range) => range !== null)).not.toHaveLength(0);
    expect(artifact.passKnitoutNeedles.every((range) => range === null || (range.start === 40 && range.end === 40))).toBe(true);
    expect(artifact.parserDiagnostics).toEqual([]);
    expect(artifact.validation).toMatchObject({
      ok: true,
      profileConformance: 'conformant',
      controllerAcceptance: 'not-established-by-software-validation',
      errorCount: 0,
    });
    expect(artifact.differential).toMatchObject({ ok: true, mismatches: [] });
    expect(artifact.scene?.passes).toHaveLength(artifact.passCount);
    expect(artifact.passLines).toHaveLength(artifact.passCount);
    expect(artifact.rowPasses[0]?.passIndices.length).toBeGreaterThan(0);
    expect(artifact.passProvenance.filter((pass) => pass.rowIds.includes('row-0'))).not.toHaveLength(0);
    expect(artifact.passProvenance.every((pass) => pass.sourceLines.every((line) => Number.isInteger(line) && line > 0))).toBe(true);
    expect(artifact.capacity).toMatchObject({
      profile: 'authored-v1',
      status: 'supported',
      observed: {
        loweredPasses: artifact.passCount,
        selectedCells: expect.any(Number),
        kcodeRecords: expect.any(Number),
      },
    });
  });

  it('fails closed when backend-only scheduled provenance names an unknown source line', () => {
    const parsedKnitout = parseKnitoutProgram(SOURCE);
    const knitOpIndex = parsedKnitout.program.ops.findIndex((op) => op.kind === 'knit');
    const knitLine = parsedKnitout.opLines[knitOpIndex]!;
    const programOpSourceRows: (readonly number[] | null)[] = parsedKnitout.opLines.map(() => null);
    programOpSourceRows[knitOpIndex] = [0];

    const projection = projectScheduledPassProvenance({
      parsedKnitout,
      scheduledPasses: [{
        index: 0,
        sourceLines: [knitLine, 999_999],
        isAutoMove: false,
        comment: 'backend-only metadata',
      }],
      programOpSourceRows,
      rowProvenance: [{ rowId: 'row-0', machineRow: 0 }],
    });

    expect(projection.ok).toBe(false);
    expect(projection.messages).toContainEqual(expect.objectContaining({
      severity: 'error',
      rule: 'kcode.provenance-source-line',
      message: expect.stringContaining('is not a parsed operation line'),
    }));
    expect(projection.passProvenance[0]).toMatchObject({
      sourceLines: [knitLine, 999_999],
      sourceRows: [0],
      rowIds: ['row-0'],
    });
  });

  it('fails closed when an operation provenance entry names an unknown design row', () => {
    const parsedKnitout = parseKnitoutProgram(SOURCE);
    const knitOpIndex = parsedKnitout.program.ops.findIndex((op) => op.kind === 'knit');
    const knitLine = parsedKnitout.opLines[knitOpIndex]!;
    const programOpSourceRows: (readonly number[] | null)[] = parsedKnitout.opLines.map(() => null);
    programOpSourceRows[knitOpIndex] = [7];

    const projection = projectScheduledPassProvenance({
      parsedKnitout,
      scheduledPasses: [{ index: 0, sourceLines: [knitLine], isAutoMove: false }],
      programOpSourceRows,
      rowProvenance: [{ rowId: 'row-0', machineRow: 0 }],
    });

    expect(projection.ok).toBe(false);
    expect(projection.messages).toContainEqual(expect.objectContaining({
      severity: 'error',
      rule: 'kcode.provenance-source-row',
      message: expect.stringContaining('unknown machine row 7'),
    }));
    expect(projection.passProvenance[0]).toMatchObject({ sourceRows: [], rowIds: [] });
  });
});
