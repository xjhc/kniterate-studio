import { useEffect, useRef, useState } from 'react';
import type { BlanketCompileArtifact } from '../blanket/compileProject';
import type { KCodeArtifact, KCodeConversionRequest, KCodeConversionResponse } from './kcodeProtocol';

export interface KCodeState {
  status: 'idle' | 'converting' | 'ready' | 'failed';
  artifact: KCodeArtifact | null;
  error: string | null;
}

export function useKCodeArtifact(compiled: BlanketCompileArtifact | null): KCodeState {
  const workerRef = useRef<Worker | null>(null);
  const activeRequest = useRef(0);
  const [state, setState] = useState<KCodeState>({ status: 'idle', artifact: null, error: null });
  useEffect(() => {
    const worker = new Worker(new URL('./convert.worker.ts', import.meta.url), { type: 'module' });
    workerRef.current = worker;
    worker.onmessage = (event: MessageEvent<KCodeConversionResponse>) => {
      const response = event.data;
      if (response.requestId !== activeRequest.current) return;
      if (response.kind === 'kcode-failed') setState((current) => ({ status: 'failed', artifact: current.artifact, error: response.error }));
      else setState({ status: 'ready', artifact: response.artifact, error: null });
    };
    worker.onerror = (event) => setState((current) => ({ status: 'failed', artifact: current.artifact, error: event.message || 'K-code conversion Worker failed.' }));
    return () => { worker.terminate(); workerRef.current = null; };
  }, []);
  useEffect(() => {
    const requestId = activeRequest.current + 1;
    activeRequest.current = requestId;
    if (!compiled?.ok || !compiled.inputHash || !compiled.knitoutText) { setState({ status: 'idle', artifact: null, error: null }); return; }
    setState((current) => ({ status: 'converting', artifact: current.artifact?.inputHash === compiled.inputHash ? current.artifact : null, error: null }));
    const request: KCodeConversionRequest = { kind: 'convert-kcode', requestId, inputHash: compiled.inputHash, knitoutText: compiled.knitoutText, predictedPasses: compiled.passes, rowProvenance: compiled.rowProvenance };
    workerRef.current?.postMessage(request);
  }, [compiled]);
  return state;
}
