import { useEffect, useRef, useState } from 'react';
import type { MachineTraceV1 } from '@kniterate-studio/machine-lib/browser';
import type { ForeignFabricPreviewRequest, ForeignFabricPreviewResponse } from './fabricProtocol';

export type ForeignFabricPreviewState = {
  readonly status: 'blocked'; readonly reason: string;
} | { readonly status: 'projecting' } | ({
  readonly status: 'ready';
} & Omit<Extract<ForeignFabricPreviewResponse, { kind: 'foreign-topology-complete' }>, 'kind' | 'requestId'>) | {
  readonly status: 'failed'; readonly code: string; readonly error: string;
  readonly passIndex: number | null;
};

export function useForeignFabricPreview(
  trace: MachineTraceV1 | null,
  eligible: boolean,
  blockedReason: string,
  selectedPass = 0,
  radius = 8,
  loopId: number | null = null,
): ForeignFabricPreviewState {
  const requestId = useRef(0);
  const workerRef = useRef<Worker | null>(null);
  const [state, setState] = useState<ForeignFabricPreviewState>({ status: 'projecting' });
  // Separate loaded identity from the response: changing documents must never
  // expose a previous document's ready geometry before the effect runs.
  const [loadedTrace, setLoadedTrace] = useState<MachineTraceV1 | null>(null);
  const cursor = useRef({ selectedPass, radius, loopId });
  cursor.current = { selectedPass, radius, loopId };

  useEffect(() => {
    requestId.current += 1;
    setLoadedTrace(trace);
    if (!eligible || trace === null) {
      setState({ status: 'blocked', reason: blockedReason });
      return;
    }
    setState({ status: 'projecting' });
    const worker = new Worker(new URL('./fabric.worker.ts', import.meta.url), { type: 'module' });
    workerRef.current = worker;
    worker.onmessage = (event: MessageEvent<ForeignFabricPreviewResponse>) => {
      const response = event.data;
      if (response.requestId !== requestId.current) return;
      if (response.kind === 'foreign-topology-complete') setState({ status: 'ready', ...response });
      else setState({ status: 'failed', code: response.code, error: response.error, passIndex: response.passIndex });
    };
    worker.onerror = (event) => {
      if (workerRef.current !== worker) return;
      setState({ status: 'failed', code: 'worker-error', error: event.message || 'Topology preview Worker failed.', passIndex: null });
    };
    const request: ForeignFabricPreviewRequest = {
      kind: 'project-foreign-topology', requestId: requestId.current, trace, ...cursor.current,
    };
    worker.postMessage(request);
    return () => { workerRef.current = null; worker.terminate(); };
  }, [blockedReason, eligible, trace]);

  useEffect(() => {
    const worker = workerRef.current;
    if (worker === null) return;
    requestId.current += 1;
    worker.postMessage({ kind: 'window-foreign-topology', requestId: requestId.current, selectedPass, radius, loopId } satisfies ForeignFabricPreviewRequest);
  }, [selectedPass, radius, loopId]);

  if (!eligible || trace === null) return { status: 'blocked', reason: blockedReason };
  if (trace !== loadedTrace) return { status: 'projecting' };
  return state;
}
