import {
  MachineTopologyProjectionErrorV1,
  projectMachineTopologyMeshV1,
  projectMachineTopologyV1,
} from '@kniterate-studio/machine-lib/browser';
import type {
  ForeignFabricPreviewRequest,
  ForeignFabricPreviewResponse,
} from './fabricProtocol';

const STUDIO_TOPOLOGY_LIMITS_V1 = Object.freeze({
  maxLoops: 6_000,
  maxConnections: 18_000,
  maxMovements: 18_000,
});

export function compileForeignFabricPreview(
  request: ForeignFabricPreviewRequest,
): ForeignFabricPreviewResponse {
  try {
    const topology = projectMachineTopologyV1(request.trace, STUDIO_TOPOLOGY_LIMITS_V1);
    const mesh = projectMachineTopologyMeshV1(topology, {
      maxNodes: STUDIO_TOPOLOGY_LIMITS_V1.maxLoops,
      maxEdges: STUDIO_TOPOLOGY_LIMITS_V1.maxConnections,
      maxMovements: STUDIO_TOPOLOGY_LIMITS_V1.maxMovements,
    });
    return {
      kind: 'foreign-topology-complete',
      requestId: request.requestId,
      mesh,
      summary: topology.summary,
    };
  } catch (error) {
    if (error instanceof MachineTopologyProjectionErrorV1) {
      return {
        kind: 'foreign-topology-failed',
        requestId: request.requestId,
        code: error.code,
        error: error.message,
        passIndex: error.passIndex,
        actionIndex: error.actionIndex,
      };
    }
    return {
      kind: 'foreign-topology-failed',
      requestId: request.requestId,
      code: 'internal-error',
      error: error instanceof Error ? error.message : String(error),
      passIndex: null,
      actionIndex: null,
    };
  }
}
