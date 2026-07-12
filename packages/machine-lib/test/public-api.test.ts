import { describe, expect, it } from 'vitest';
import * as browserApi from '../src/browser';
import * as nodeApi from '../src/index';

describe('machine-lib public boundaries', () => {
  it('keeps the browser surface explicit and free of Node-only adapters', () => {
    expect(Object.keys(browserApi).sort()).toEqual([
      'compileToRunArtifact', 'diffKc', 'findKnitProvenKCodeMatch', 'findKnitProvenMatch', 'inspectKcDocument',
      'inspectKnitoutPasses', 'kcToKnitout', 'knitProvenRegistryEntries',
      'matchKnitProvenArtifact', 'matchKnitProvenKCode', 'parseKnitoutProgram', 'projectBackFaceFromArtifact',
      'projectColorworkChartV1', 'renderKcPassWindow', 'resolveValidatorMessage',
      'validateKnitoutProgram',
    ]);
    expect('nodeKCodeConverter' in browserApi).toBe(false);
    expect('knitoutToKCode' in browserApi).toBe(false);
  });

  it('exposes the compiler and Node converter only from the full package entry', () => {
    expect(nodeApi).toMatchObject({
      compileChartToKnitout: expect.any(Function),
      compileToRunArtifact: expect.any(Function),
      knitoutToKCode: expect.any(Function),
      nodeKCodeConverter: expect.any(Function),
      writeKnitoutProgram: expect.any(Function),
    });
  });
});
