import { useEffect, useRef, useState } from 'react';
import type { ColorworkProjectV1 } from '@kniterate-studio/project-contract';
import type { BlanketCompileArtifact } from './compileProject';
import { isCurrentCompileResponse, type BlanketCompileRequest, type BlanketCompileResponse } from './workerProtocol';

export interface BlanketCompileState {
  status: 'queued' | 'compiling' | 'ready' | 'failed';
  artifact: BlanketCompileArtifact | null;
  error: string | null;
}

export function useBlanketCompiler(project: ColorworkProjectV1, debounceMs = 180): BlanketCompileState {
  const workerRef = useRef<Worker | null>(null);
  const activeRequest = useRef(0);
  const [state, setState] = useState<BlanketCompileState>({ status: 'queued', artifact: null, error: null });

  useEffect(() => {
    const worker = new Worker(new URL('./compile.worker.ts', import.meta.url), { type: 'module' });
    workerRef.current = worker;
    worker.onmessage = (event: MessageEvent<BlanketCompileResponse>) => {
      const response = event.data;
      if (!isCurrentCompileResponse(activeRequest.current, response)) return;
      if (response.kind === 'compile-failed') setState((current) => ({ status: 'failed', artifact: current.artifact, error: response.error }));
      else setState({ status: 'ready', artifact: response.artifact, error: null });
    };
    worker.onerror = (event) => setState((current) => ({ status: 'failed', artifact: current.artifact, error: event.message || 'Blanket compiler Worker failed.' }));
    return () => { worker.terminate(); workerRef.current = null; };
  }, []);

  useEffect(() => {
    const requestId = activeRequest.current + 1;
    activeRequest.current = requestId;
    setState((current) => ({ status: 'queued', artifact: current.artifact, error: null }));
    const timeout = window.setTimeout(() => {
      const request: BlanketCompileRequest = { kind: 'compile-blanket', requestId, project };
      setState((current) => ({ status: 'compiling', artifact: current.artifact, error: null }));
      workerRef.current?.postMessage(request);
    }, debounceMs);
    return () => window.clearTimeout(timeout);
  }, [project, debounceMs]);

  return state;
}
