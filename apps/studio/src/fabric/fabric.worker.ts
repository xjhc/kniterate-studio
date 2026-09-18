/// <reference lib="webworker" />
import { createForeignFabricCompiler } from './compileForeignFabricPreview';
import type { ForeignFabricPreviewRequest, ForeignFabricPreviewResponse } from './fabricProtocol';

const scope: DedicatedWorkerGlobalScope = self as unknown as DedicatedWorkerGlobalScope;
const compile = createForeignFabricCompiler();
scope.onmessage = (event: MessageEvent<ForeignFabricPreviewRequest>) => {
  scope.postMessage(compile(event.data) satisfies ForeignFabricPreviewResponse);
};
