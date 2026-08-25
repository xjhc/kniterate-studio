import { parseKnitoutProgram } from '@kniterate-studio/machine-lib/browser';
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

describe('compileKCodeArtifact', () => {
  it('proves emitted KCode and joins scheduled passes to authored rows by source line', async () => {
    const parsed = parseKnitoutProgram(SOURCE);
    const programOpSourceRows = parsed.opLines.map((line) => line >= 8 && line <= 10 ? [0] : null);
    const artifact = await compileKCodeArtifact({
      kind: 'convert-kcode',
      requestId: 1,
      inputHash: 'test-input',
      knitoutText: SOURCE,
      programOpSourceRows,
      rowProvenance: [{ rowId: 'row-0', chartRow: 0, machineRow: 0 }],
    });

    expect(artifact.ok).toBe(true);
    expect(artifact.parserDiagnostics).toEqual([]);
    expect(artifact.validation).toMatchObject({ ok: true, errorCount: 0 });
    expect(artifact.differential).toMatchObject({ ok: true, mismatches: [] });
    expect(artifact.scene?.passes).toHaveLength(artifact.passCount);
    expect(artifact.passLines).toHaveLength(artifact.passCount);
    expect(artifact.rowPasses[0]?.passIndices.length).toBeGreaterThan(0);
    expect(artifact.passProvenance.filter((pass) => pass.rowIds.includes('row-0'))).not.toHaveLength(0);
    expect(artifact.passProvenance.every((pass) => pass.sourceLines.every((line) => Number.isInteger(line) && line > 0))).toBe(true);
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
