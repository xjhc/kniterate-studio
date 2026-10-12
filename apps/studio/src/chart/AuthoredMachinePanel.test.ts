import { describe, expect, it } from 'vitest';
import type { KCodeArtifact } from '../kcode/kcodeProtocol';
import { programRegionsForKCode } from './AuthoredMachinePanel';

function artifact(passes: Array<{ carrier: string; sourceRows?: number[] }>): KCodeArtifact {
  return {
    scene: { passes: passes.map((pass, passIndex) => ({ passIndex, carrier: pass.carrier })) },
    passProvenance: passes.map((pass, passIndex) => ({ passIndex, sourceRows: pass.sourceRows ?? [] })),
  } as unknown as KCodeArtifact;
}

describe('authored machine program regions', () => {
  it('uses compiler provenance and reserved frame carriers to split the full program', () => {
    const compiled = artifact([
      { carrier: '6' },
      { carrier: '1' },
      { carrier: '2', sourceRows: [0] },
      { carrier: '0', sourceRows: undefined },
      { carrier: '3', sourceRows: [1] },
      { carrier: '0' },
    ]);
    const regions = programRegionsForKCode(compiled);
    expect(regions).toEqual(['waste', 'draw', 'body', 'body', 'body', 'finish']);
    expect(programRegionsForKCode(compiled)).toBe(regions);
  });

  it('keeps a frame-only program inspectable', () => {
    const compiled = artifact([{ carrier: '6' }, { carrier: '1' }]);
    expect(programRegionsForKCode(compiled)).toEqual(['waste', 'draw']);
  });
});
