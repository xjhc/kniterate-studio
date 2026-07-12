import { describe, expect, it } from 'vitest';
import { findKnitProvenKCodeMatch, findKnitProvenMatch, matchKnitProvenArtifact } from '../src/physical-registry';

const entry = {
  id: '2026-07-12-blanket',
  sourceFingerprint: 'source-1',
  knitoutSha256: 'knitout-1',
  kcodeSha256: 'kcode-1',
  compilerFingerprint: 'compiler-1',
};

describe('physical registry matching', () => {
  it('requires the exact compiler, source, and machine artifact', () => {
    expect(findKnitProvenMatch([entry], 'compiler-1', 'source-1', 'kcode-1')).toEqual(entry);
    expect(findKnitProvenMatch([entry], 'compiler-2', 'source-1', 'kcode-1')).toBeNull();
    expect(findKnitProvenMatch([entry], 'compiler-1', 'source-2', 'kcode-1')).toBeNull();
    expect(findKnitProvenMatch([entry], 'compiler-1', 'source-1', 'kcode-2')).toBeNull();
  });

  it('does not mint a match from the empty checked-in registry', () => {
    expect(matchKnitProvenArtifact('source-1', 'kcode-1')).toBeNull();
  });

  it('can recognize a previously exported machine file by its exact SHA-256', () => {
    expect(findKnitProvenKCodeMatch([entry], 'compiler-1', 'kcode-1')).toEqual(entry);
    expect(findKnitProvenKCodeMatch([entry], 'compiler-1', 'kcode-2')).toBeNull();
    expect(findKnitProvenKCodeMatch([entry], 'compiler-2', 'kcode-1')).toBeNull();
  });
});
