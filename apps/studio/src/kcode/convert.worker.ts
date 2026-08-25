/// <reference lib="webworker" />
import type { KCodeConversionRequest, KCodeConversionResponse } from './kcodeProtocol';
import { compileKCodeArtifact } from './compileKCodeArtifact';

const scope: DedicatedWorkerGlobalScope = self as unknown as DedicatedWorkerGlobalScope;

scope.onmessage = async (event: MessageEvent<KCodeConversionRequest>) => {
  const request = event.data;
  if (request.kind !== 'convert-kcode') return;
  try {
    const artifact = await compileKCodeArtifact(request);
    scope.postMessage({ kind: 'kcode-complete', requestId: request.requestId, artifact } satisfies KCodeConversionResponse);
  } catch (error) {
    scope.postMessage({ kind: 'kcode-failed', requestId: request.requestId, error: error instanceof Error ? error.message : String(error) } satisfies KCodeConversionResponse);
  }
};
