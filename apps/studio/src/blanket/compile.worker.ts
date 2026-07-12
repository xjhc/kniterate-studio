/// <reference lib="webworker" />
import { compileColorworkProject } from './compileProject';
import type { BlanketCompileRequest, BlanketCompileResponse } from './workerProtocol';

const scope: DedicatedWorkerGlobalScope = self as unknown as DedicatedWorkerGlobalScope;

scope.onmessage = (event: MessageEvent<BlanketCompileRequest>) => {
  const request = event.data;
  if (request.kind !== 'compile-blanket') return;
  let response: BlanketCompileResponse;
  try {
    response = { kind: 'compile-complete', requestId: request.requestId, artifact: compileColorworkProject(request.project) };
  } catch (error) {
    response = { kind: 'compile-failed', requestId: request.requestId, error: error instanceof Error ? error.message : String(error) };
  }
  scope.postMessage(response);
};
