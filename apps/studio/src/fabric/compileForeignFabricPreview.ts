import {
  MACHINE_TOPOLOGY_INSPECTION_LIMITS_V1,
  MachineTopologyProjectionErrorV1,
  indexMachineTopologyWindowV1,
  inspectMachineTopologyLoopV1,
  projectMachineTopologyV1,
  projectMachineTopologyWindowV1,
  type MachineTopologyWindowIndexV1,
} from '@kniterate-studio/machine-lib/browser';
import type { ForeignFabricPreviewRequest, ForeignFabricPreviewResponse } from './fabricProtocol';

/** Each Worker owns one bounded graph. Navigation transfers only the visible
 * window; neither the source trace nor full topology is cloned on each step. */
export function createForeignFabricCompiler() {
  let index: MachineTopologyWindowIndexV1 | null = null;
  return (request: ForeignFabricPreviewRequest): ForeignFabricPreviewResponse => {
    try {
      if (request.kind === 'project-foreign-topology') {
        index = null;
        const topology = projectMachineTopologyV1(request.trace, MACHINE_TOPOLOGY_INSPECTION_LIMITS_V1);
        index = indexMachineTopologyWindowV1(topology, request.trace.passes.length);
      }
      if (index === null) throw new Error('No strict topology is loaded for this window.');
      const window = projectMachineTopologyWindowV1(index, request.selectedPass ?? 0, request.radius ?? 8);
      return {
        kind: 'foreign-topology-complete', requestId: request.requestId, ...window,
        inspection: request.loopId === null || request.loopId === undefined ? null : inspectMachineTopologyLoopV1(index, request.loopId),
      };
    } catch (error) {
      return {
        kind: 'foreign-topology-failed', requestId: request.requestId,
        code: error instanceof MachineTopologyProjectionErrorV1 ? error.code : 'internal-error',
        error: error instanceof Error ? error.message : String(error),
        passIndex: error instanceof MachineTopologyProjectionErrorV1 ? error.passIndex : null,
        actionIndex: error instanceof MachineTopologyProjectionErrorV1 ? error.actionIndex : null,
      };
    }
  };
}

export function compileForeignFabricPreview(request: ForeignFabricPreviewRequest): ForeignFabricPreviewResponse {
  return createForeignFabricCompiler()(request);
}
