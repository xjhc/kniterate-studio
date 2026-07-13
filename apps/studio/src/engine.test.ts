import { describe, expect, it } from 'vitest';
import { openMachineDocument, resolveAuthoredVerdict, type AuthoredVerdictInput } from './engine';

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

  it('recognizes an exact physically registered imported artifact', () => {
    const document = openMachineDocument('sample.kc', KC, '2026-07-12-proof');
    expect(document.verdict).toMatchObject({
      state: 'knit',
      label: 'Knit-proven',
    });
    expect(document.verdict.annotation).toContain('2026-07-12-proof');
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

describe('authored verdict policy', () => {
  const ready: AuthoredVerdictInput = {
    compileStatus: 'ready',
    compileOk: true,
    compileError: null,
    outputStatus: 'ready',
    outputOk: true,
    outputCurrent: true,
    outputError: null,
    knitProvenEntryId: null,
  };

  it('withholds a verdict while compilation or output conversion is pending', () => {
    expect(resolveAuthoredVerdict({ ...ready, compileStatus: 'compiling', compileOk: null })).toBeNull();
    expect(resolveAuthoredVerdict({ ...ready, outputStatus: 'converting', outputOk: null })).toBeNull();
    expect(resolveAuthoredVerdict({ ...ready, outputCurrent: false })).toBeNull();
  });

  it('blocks compiler and K-code validation failures', () => {
    expect(resolveAuthoredVerdict({ ...ready, compileOk: false, compileError: 'Carrier conflict.' })).toMatchObject({
      state: 'blocked',
      label: 'Blocked',
      annotation: 'Carrier conflict.',
    });
    expect(resolveAuthoredVerdict({ ...ready, outputOk: false, outputError: 'Pass mismatch.' })).toMatchObject({
      state: 'blocked',
      label: 'Blocked',
      annotation: 'Pass mismatch.',
    });
  });

  it('mints Surface-proven only for current clean output', () => {
    expect(resolveAuthoredVerdict(ready)).toMatchObject({
      state: 'surface',
      label: 'Surface-proven',
      evidenceId: null,
    });
  });

  it('mints Knit-proven only for an exact physical registry match', () => {
    expect(resolveAuthoredVerdict({ ...ready, knitProvenEntryId: '2026-07-12-proof' })).toMatchObject({
      state: 'knit',
      label: 'Knit-proven',
      evidenceId: '2026-07-12-proof',
    });
  });
});
