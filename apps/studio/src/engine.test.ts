import { describe, expect, it } from 'vitest';
import { openMachineDocument } from './engine';

const KC = [
  'FRNT:________________-______________',
  'REAR:_______________________________',
  'RACK:0',
  '>> Kn-Kn 2 150 300',
].join('\n');

const K = [
  ';!knitout-2',
  ';;Carriers: 1 2 3 4 5 6',
  ';;Machine: kniterate',
  'in 2',
  'knit + f12 2',
  'out 2',
].join('\n');

describe('machine document engine', () => {
  it('opens k-code with pass and source provenance', () => {
    const document = openMachineDocument('sample.kc', KC);
    expect(document.passes).toHaveLength(1);
    expect(document.passes[0]).toMatchObject({ lineEnd: 4, direction: '>>', carriers: ['2'] });
    expect(document.verdict.label).toBe('Surface-proven (imported)');
  });

  it('opens knitout and groups authored operations', () => {
    const document = openMachineDocument('sample.k', K);
    expect(document.passes).toHaveLength(1);
    expect(document.passes[0]).toMatchObject({ lineStart: 5, direction: '>>', needleSpan: 'N12' });
    expect(document.stats.carriers).toEqual(['2']);
  });

  it('blocks malformed input', () => {
    const document = openMachineDocument('bad.k', ';!knitout-2\n;;Carriers: 1\nknit + nope 1');
    expect(document.verdict.label).toBe('Blocked');
    expect(document.diagnostics.find((item) => item.rule === 'knitout-parse')?.line).toBe(3);
  });

  it.each([
    ['illegal carrier', [';!knitout-2', ';;Carriers: 7', 'in 7', 'knit + f50 7'].join('\n'), 'carrier-id-legal'],
    ['quarter rack', [';!knitout-2', ';;Carriers: 1', 'rack 0.25', 'xfer f50 b50'].join('\n'), 'rack-legal-increment'],
    ['needle zero', [';!knitout-2', ';;Carriers: 1', 'in 1', 'knit + f0 1', 'out 1'].join('\n'), 'no-needle-zero'],
    ['same-bed transfer', [';!knitout-2', ';;Carriers: 1', 'xfer f50 f51'].join('\n'), 'xfer-cross-beds'],
    ['stitch overflow', [';!knitout-2', ';;Carriers: 1', 'x-stitch-number 36', 'knit + f50 1'].join('\n'), 'stitch-number-range'],
    ['rack magnitude warning', [';!knitout-2', ';;Carriers: 1', 'rack 22', 'xfer f50 b50'].join('\n'), 'rack-magnitude'],
  ])('blocks refusal case: %s', (_name, source, rule) => {
    const document = openMachineDocument('refusal.k', source);
    expect(document.verdict.label).toBe('Blocked');
    expect(document.diagnostics.some((item) => item.rule === rule)).toBe(true);
  });
});
