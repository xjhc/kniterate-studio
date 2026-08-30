import { useEffect, useRef, useState } from 'react';
import type { MachineTopologyMeshV1, MachineTopologyV1, MachineTraceV1 } from '@kniterate-studio/machine-lib/browser';
import type {
  ForeignFabricPreviewRequest,
  ForeignFabricPreviewResponse,
} from './fabricProtocol';

export type ForeignFabricPreviewState = {
  readonly status: 'blocked';
  readonly reason: string;
} | {
  readonly status: 'projecting';
} | {
  readonly status: 'ready';
  readonly mesh: MachineTopologyMeshV1;
  readonly summary: MachineTopologyV1['summary'];
} | {
  readonly status: 'failed';
  readonly code: string;
  readonly error: string;
  readonly passIndex: number | null;
};

export function useForeignFabricPreview(
  trace: MachineTraceV1 | null,
  eligible: boolean,
  blockedReason: string,
): ForeignFabricPreviewState {
  const requestId = useRef(0);
  const [state, setState] = useState<ForeignFabricPreviewState>(() => eligible && trace !== null
    ? { status: 'projecting' }
    : { status: 'blocked', reason: blockedReason });

  useEffect(() => {
    requestId.current += 1;
    const currentRequest = requestId.current;
    if (!eligible || trace === null) {
      setState({ status: 'blocked', reason: blockedReason });
      return;
    }

    setState({ status: 'projecting' });
    const worker = new Worker(new URL('./fabric.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (event: MessageEvent<ForeignFabricPreviewResponse>) => {
      const response = event.data;
      if (response.requestId !== requestId.current) return;
      if (response.kind === 'foreign-topology-complete') {
        setState({ status: 'ready', mesh: response.mesh, summary: response.summary });
      } else {
        setState({
          status: 'failed',
          code: response.code,
          error: response.error,
          passIndex: response.passIndex,
        });
      }
    };
    worker.onerror = (event) => {
      if (currentRequest !== requestId.current) return;
      setState({
        status: 'failed',
        code: 'worker-error',
        error: event.message || 'Topology preview Worker failed.',
        passIndex: null,
      });
    };
    const request: ForeignFabricPreviewRequest = {
      kind: 'project-foreign-topology',
      requestId: currentRequest,
      trace,
    };
    worker.postMessage(request);
    return () => worker.terminate();
  }, [blockedReason, eligible, trace]);

  return state;
}
