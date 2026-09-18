import { describe, expect, it } from 'vitest';
import * as browserApi from '../src/browser';
import * as nodeApi from '../src/index';

describe('machine-lib public boundaries', () => {
  it('keeps the browser surface explicit and free of Node-only adapters', () => {
    expect(Object.keys(browserApi).sort()).toEqual([
      'DEFAULT_MACHINE_TOPOLOGY_LIMITS_V1', 'DEFAULT_MACHINE_TOPOLOGY_MESH_LIMITS_V1', 'KCODE_RESOURCE_LIMITS_V1', 'KNITERATE_7GG_KCODE_PROFILE_V1', 'KNITERATE_7GG_KCODE_PROFILE_V2', 'KNITERATE_KCODE_OPERATION_CONTRACTS_V1', 'KNITOUT_RESOURCE_LIMITS_V1', 'MACHINE_EXECUTION_LIMITS_V1', 'MACHINE_TOPOLOGY_INSPECTION_LIMITS_V1', 'MACHINE_TOPOLOGY_WINDOW_LIMITS_V1', 'MachineTopologyProjectionErrorV1', 'PROGRAMMED_MOTION_CLAIM_BOUNDARY_V1', 'PROGRAMMED_MOTION_DISTANCE_ASSUMPTION_V1', 'PROGRAMMED_MOTION_SPEED_ASSUMPTION_V1', 'basePayloadIndexToKCodeColumn',
      'checkKnitoutSourceResourceLimits', 'compareScheduledPassesToMachineTrace', 'compileToRunArtifact',
      'createAuthoredKCodeCoordinateBridgeV1', 'createMachineExecutionIndexV1', 'deriveEndpointPhysicalNeedleMappingV1', 'deriveMachineTraceProgrammedMotionV1', 'diffKCodeMachineTrace', 'diffKc',
      'emitKCodeDocument', 'emitKCodeDocumentBytes', 'findKnitProvenKCodeMatch', 'findKnitProvenMatch',
      'indexMachineTopologyWindowV1', 'inspectKcDocument', 'inspectKnitoutPasses', 'inspectMachineExecutionV1', 'inspectMachineTopologyLoopV1', 'isKCodeCommandLegalityExportEligible', 'isLoopFormingMachineTracePassV1', 'kcToKnitout',
      'kcodeColumnToBasePayloadIndex', 'kcodeColumnToTraceCoordinate', 'kcodeOperationContractV1', 'knitProvenRegistryEntries', 'matchKnitProvenArtifact',
      'matchKnitProvenKCode', 'parseKCodeBytes', 'parseKCodeDocument', 'parseKnitoutProgram',
      'physicalNeedleForTraceCoordinateV1', 'projectBackFaceFromArtifact', 'projectColorworkChartV1', 'projectKCodeMachineTrace',
      'projectMachineScene', 'projectMachineTopologyMeshV1', 'projectMachineTopologyV1', 'projectMachineTopologyWindowV1', 'renderKCodeMachineTraceWindow', 'renderKCodeMachineTraceWindowFromTraces', 'renderKcPassWindow',
      'resolveValidatorMessage', 'summarizeMachineTracePassMetricsV1', 'validateKCodeMachineTrace', 'validateKnitoutProgram',
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
