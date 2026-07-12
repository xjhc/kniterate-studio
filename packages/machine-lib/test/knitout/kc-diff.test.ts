/**
 * Op-level kc diff. The parser keys on the `>> dir type carrier speed roller`
 * pass-footer lines, so these fixtures are just those footers (the
 * FRNT/STIF/REAR/STIR layout is irrelevant to a pass-level diff).
 */
import { describe, expect, it } from 'vitest';
import { diffKc } from '../../src/knitout/kc-diff.js';

const A = ['>> Kn-Kn 2 100 440', '<< Kn-Kn 2 700 0', '>> Kn-Kn 2 700 0'].join('\n');

describe('diffKc', () => {
  it('reports pass-identical for identical streams', () => {
    const d = diffKc(A, A);
    expect(d.identical).toBe(true);
    expect(d.generatedPassCount).toBe(3);
    expect(d.referencePassCount).toBe(3);
    expect(d.firstDelta).toBeNull();
    expect(d.deltaCount).toBe(0);
  });

  it('pins the first divergent field (speed) at the right index', () => {
    const B = ['>> Kn-Kn 2 100 440', '<< Kn-Kn 2 300 0', '>> Kn-Kn 2 700 0'].join('\n');
    const d = diffKc(A, B);
    expect(d.identical).toBe(false);
    expect(d.firstDelta).toEqual({
      index: 1,
      field: 'speed',
      generated: '<< Kn-Kn 2 700 0',
      reference: '<< Kn-Kn 2 300 0',
    });
    expect(d.deltaCount).toBe(1);
  });

  it('flags a carrier divergence over speed/roller', () => {
    const B = ['>> Kn-Kn 3 100 440', '<< Kn-Kn 2 700 0', '>> Kn-Kn 2 700 0'].join('\n');
    const d = diffKc(A, B);
    expect(d.firstDelta?.field).toBe('carrier');
    expect(d.firstDelta?.index).toBe(0);
  });

  it('records a length mismatch when one side runs out', () => {
    const shorter = ['>> Kn-Kn 2 100 440', '<< Kn-Kn 2 700 0'].join('\n');
    const d = diffKc(A, shorter);
    expect(d.generatedPassCount).toBe(3);
    expect(d.referencePassCount).toBe(2);
    expect(d.firstDelta).toEqual({
      index: 2,
      field: 'length',
      generated: '>> Kn-Kn 2 700 0',
      reference: null,
    });
  });

  it('computes byte parity when requested', () => {
    expect(diffKc(A, A, { bytes: true }).byteIdentical).toBe(true);
    const withTrailer = `${A}\nHOME`;
    const d = diffKc(A, withTrailer, { bytes: true });
    expect(d.byteIdentical).toBe(false);
    expect(d.firstLineDelta?.index).toBe(3);
  });
});
