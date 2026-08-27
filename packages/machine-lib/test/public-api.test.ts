import { describe, expect, it } from 'vitest';
import * as browserApi from '../src/browser';
import * as nodeApi from '../src/index';

describe('machine-lib public boundaries', () => {
  it('keeps the browser surface explicit and free of Node-only adapters', () => {
    expect(Object.keys(browserApi).sort()).toEqual([
      'KCODE_RESOURCE_LIMITS_V1', 'KNITERATE_7GG_KCODE_PROFILE_V1', 'KNITERATE_7GG_KCODE_PROFILE_V2', 'KNITERATE_KCODE_OPERATION_CONTRACTS_V1', 'KNITOUT_RESOURCE_LIMITS_V1', 'basePayloadIndexToKCodeColumn',
      'checkKnitoutSourceResourceLimits', 'compareScheduledPassesToMachineTrace', 'compileToRunArtifact', 'diffKCodeMachineTrace', 'diffKc',
      'emitKCodeDocument', 'emitKCodeDocumentBytes', 'findKnitProvenKCodeMatch', 'findKnitProvenMatch',
      'inspectKcDocument', 'inspectKnitoutPasses', 'isKCodeCommandLegalityExportEligible', 'kcToKnitout',
      'kcodeColumnToBasePayloadIndex', 'kcodeColumnToTraceCoordinate', 'kcodeOperationContractV1', 'knitProvenRegistryEntries', 'matchKnitProvenArtifact',
      'matchKnitProvenKCode', 'parseKCodeBytes', 'parseKCodeDocument', 'parseKnitoutProgram',
      'projectBackFaceFromArtifact', 'projectColorworkChartV1', 'projectKCodeMachineTrace',
      'projectMachineScene', 'renderKCodeMachineTraceWindow', 'renderKCodeMachineTraceWindowFromTraces', 'renderKcPassWindow',
      'resolveValidatorMessage', 'validateKCodeMachineTrace', 'validateKnitoutProgram',
    ]);
    expect('nodeKCodeConverter' in browserApi).toBe(false);
    expect('knitoutToKCode' in browserApi).toBe(false);
  });

  it('exposes the compiler and Node converter only from the full package entry', () => {
    expect(nodeApi).toMatchObject({
      authoredKnitoutToKCodeWithTrace: expect.any(Function),
      compileChartToKnitout: expect.any(Function),
      compileToRunArtifact: expect.any(Function),
      knitoutToKCode: expect.any(Function),
      nodeKCodeConverter: expect.any(Function),
      writeKnitoutProgram: expect.any(Function),
    });
  });
});
