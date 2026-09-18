import type {
  MachineTopologyLoopInspectionV1,
  MachineTopologyProjectionErrorCodeV1,
  MachineTopologyWindowV1,
  MachineTraceV1,
} from '@kniterate-studio/machine-lib/browser';

interface TopologyWindowRequest {
  readonly requestId: number;
  readonly selectedPass?: number;
  readonly radius?: number;
  readonly loopId?: number | null;
}
export type ForeignFabricPreviewRequest = TopologyWindowRequest & ({
  readonly kind: 'project-foreign-topology';
  readonly trace: MachineTraceV1;
} | { readonly kind: 'window-foreign-topology' });

export type ForeignFabricPreviewResponse = ({
  readonly kind: 'foreign-topology-complete';
  readonly requestId: number;
  readonly inspection: MachineTopologyLoopInspectionV1 | null;
} & MachineTopologyWindowV1) | {
  readonly kind: 'foreign-topology-failed';
  readonly requestId: number;
  readonly code: MachineTopologyProjectionErrorCodeV1 | 'internal-error';
  readonly error: string;
  readonly passIndex: number | null;
  readonly actionIndex: number | null;
};
