import { useEffect, useRef, useState } from 'react';
import type { AuthoredCapacityBlockedV1 } from '@kniterate-studio/project-contract';
import type { BlanketCompileArtifact } from '../blanket/compileProject';
import type { KCodeArtifact, KCodeConversionRequest, KCodeConversionResponse } from './kcodeProtocol';

export interface KCodeState {
  status: 'idle' | 'converting' | 'ready' | 'failed';
  artifact: KCodeArtifact | null;
  error: string | null;
  capacity: AuthoredCapacityBlockedV1 | null;
}

/**
 * `compilerNeedleRange` is the current project's authored needle span. It is
 * read when a compiled artifact arrives; if it no longer matches that
 * artifact's lowering, the coordinate bridge refuses and needle labels are
 * withheld until the next compile. A conversion still running when a newer
 * one is sent is for an older artifact: its Worker is replaced rather than
 * waited for.
 */
export function useKCodeArtifact(compiled: BlanketCompileArtifact | null, compilerNeedleRange: KCodeConversionRequest['compilerNeedleRange']): KCodeState {
  const workerRef = useRef<Worker | null>(null);
  const needleRange = useRef(compilerNeedleRange);
  needleRange.current = compilerNeedleRange;
  const activeRequest = useRef(0);
  const busy = useRef(false);
  const [state, setState] = useState<KCodeState>({ status: 'idle', artifact: null, error: null, capacity: null });
  const spawn = useRef(() => {
    const worker = new Worker(new URL('./convert.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (event: MessageEvent<KCodeConversionResponse>) => {
      busy.current = false;
      const response = event.data;
      if (response.requestId !== activeRequest.current) return;
      if (response.kind === 'kcode-failed') setState((current) => ({ status: 'failed', artifact: current.artifact, error: response.error, capacity: response.capacity }));
      else setState({ status: 'ready', artifact: response.artifact, error: null, capacity: null });
    };
    worker.onerror = (event) => {
      busy.current = false;
      setState((current) => ({ status: 'failed', artifact: current.artifact, error: event.message || 'K-code conversion Worker failed.', capacity: null }));
    };
    return worker;
  }).current;
  useEffect(() => {
    workerRef.current = spawn();
    return () => { workerRef.current?.terminate(); workerRef.current = null; busy.current = false; };
  }, [spawn]);
  useEffect(() => {
    const requestId = activeRequest.current + 1;
    activeRequest.current = requestId;
    if (!compiled?.ok || !compiled.inputHash || !compiled.knitoutText || compiled.capacity.status !== 'supported') { setState({ status: 'idle', artifact: null, error: null, capacity: null }); return; }
    setState((current) => ({ status: 'converting', artifact: current.artifact?.inputHash === compiled.inputHash ? current.artifact : null, error: null, capacity: null }));
    const request: KCodeConversionRequest = { kind: 'convert-kcode', requestId, inputHash: compiled.inputHash, capacity: compiled.capacity, knitoutText: compiled.knitoutText, compilerNeedleRange: needleRange.current, programOpSourceRows: compiled.programOpSourceRows, rowProvenance: compiled.rowProvenance };
    if (workerRef.current === null) return;
    if (busy.current) {
      workerRef.current.terminate();
      workerRef.current = spawn();
    }
    busy.current = true;
    workerRef.current.postMessage(request);
  }, [compiled, spawn]);
  return state;
}
