import { describe, expect, it } from 'vitest';
import type { BlanketCompileArtifact } from '../blanket/compileProject';
import { programRegionsForArtifact } from './AuthoredMachinePanel';

function artifact(passes: Array<{ carriers: string[]; sourceRows?: number[] }>): BlanketCompileArtifact {
  return { passes } as unknown as BlanketCompileArtifact;
}

describe('authored machine program regions', () => {
  it('uses compiler provenance and reserved frame carriers to split the full program', () => {
    const compiled = artifact([
      { carriers: ['6'] },
      { carriers: ['1'] },
      { carriers: ['2'], sourceRows: [0] },
      { carriers: [], sourceRows: undefined },
      { carriers: ['3'], sourceRows: [1] },
      { carriers: [] },
    ]);
    expect(programRegionsForArtifact(compiled)).toEqual(['waste', 'draw', 'body', 'body', 'body', 'finish']);
  });

  it('keeps a frame-only program inspectable', () => {
    const compiled = artifact([{ carriers: ['6'] }, { carriers: ['1'] }]);
    expect(programRegionsForArtifact(compiled)).toEqual(['waste', 'draw']);
  });
});
