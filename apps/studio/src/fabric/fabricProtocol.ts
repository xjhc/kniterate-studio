import type {
  MachineTopologyMeshV1,
  MachineTopologyProjectionErrorCodeV1,
  MachineTopologyV1,
  MachineTraceV1,
} from '@kniterate-studio/machine-lib/browser';

export interface ForeignFabricPreviewRequest {
  readonly kind: 'project-foreign-topology';
  readonly requestId: number;
  readonly trace: MachineTraceV1;
}

export type ForeignFabricPreviewResponse = {
  readonly kind: 'foreign-topology-complete';
  readonly requestId: number;
  readonly mesh: MachineTopologyMeshV1;
  readonly summary: MachineTopologyV1['summary'];
} | {
  readonly kind: 'foreign-topology-failed';
  readonly requestId: number;
  readonly code: MachineTopologyProjectionErrorCodeV1 | 'internal-error';
  readonly error: string;
  readonly passIndex: number | null;
  readonly actionIndex: number | null;
};
