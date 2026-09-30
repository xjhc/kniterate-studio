import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseKCodeDocument, projectKCodeMachineTrace, KNITERATE_7GG_KCODE_PROFILE_V2 } from '@kniterate-studio/machine-lib/browser';
import { compareParityPrograms, REFERENCES, scoreReference } from '../../../scripts/parity';

const reference = readFileSync(resolve(__dirname, '../../../packages/machine-lib/reference/fairisle.kc'), 'utf8');

describe('Customist parity verdict', () => {
  it('requires a strict whole-program match and the authored export gate', () => {
    expect(compareParityPrograms(reference, reference, true)).toMatchObject({ status: 'reproduced', machine: { identical: true, deltaCount: 0 } });
    expect(compareParityPrograms(reference, reference, false).status).toBe('blocked');
    expect(compareParityPrograms(reference, 'not KCode', true)).toMatchObject({ status: 'blocked', machine: { status: 'blocked' } });
  });

  it('refuses reproduction when only a transfer target selector changes', () => {
    const parsed = parseKCodeDocument(reference, { profile: KNITERATE_7GG_KCODE_PROFILE_V2, dialect: 'knitout-vendor', strict: true });
    if (!parsed.ok) throw new Error('invalid fixture');
    const trace = projectKCodeMachineTrace(parsed.document, KNITERATE_7GG_KCODE_PROFILE_V2);
    const action = trace.passes.flatMap((pass) => pass.actions).find((action) => action.kind === 'xfer');
    if (action?.kind !== 'xfer') throw new Error('fixture has no transfer');
    const span = action.target.stitchSelector.sourceSpan;
    const candidate = reference.slice(0, span.start.offset) + '1' + reference.slice(span.end.offset);
    const result = compareParityPrograms(reference, candidate, true);
    expect(result.status).toBe('partial');
    expect(result.machine.status).toBe('compared');
    expect(result.machine.identical).toBe(false);
    expect(result.candidateSha256).not.toBe(result.referenceSha256);
  });

  it('scores the actual 64x50 trial with C4/C3 and discloses its six differing passes', { timeout: 30_000 }, async () => {
    const result = await scoreReference(REFERENCES.find((item) => item.id === 'fairisle')!);
    expect(result).toMatchObject({
      status: 'partial', verdict: 'Surface-proven',
      input: { kind: 'checked-in-chart', width: 64, height: 50, droppedPartialRows: 0 },
      stitches: { actualPasses: 286, expectedPasses: 286, identicalPasses: 280, offset: 0, differingPassIndices: [116, 149, 173, 197, 221, 245] },
      machine: { identical: false },
      faces: { carrierMap: { '3': '3', '4': '4' }, referenceBoundary: 'after-last-draw' },
    });
  });

  it('keeps an unavailable recipe distinct from a compiled partial match', async () => {
    expect(await scoreReference(REFERENCES.find((item) => item.id === 'fox-baby-beanie')!)).toMatchObject({ status: 'unsupported' });
  });

  it('reproduces the 2x2 rib beanie exactly through its construction generator', { timeout: 60_000 }, async () => {
    expect(await scoreReference(REFERENCES.find((item) => item.id === '2x2-rib-beanie')!)).toMatchObject({
      status: 'reproduced', verdict: 'Surface-proven',
      machine: { identical: true, deltaCount: 0 },
      stitches: { expectedPasses: 530, actualPasses: 530, identicalPasses: 530 },
    });
  });
});
