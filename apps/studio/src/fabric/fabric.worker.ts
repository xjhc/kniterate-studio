/// <reference lib="webworker" />
import { compileForeignFabricPreview } from './compileForeignFabricPreview';
import type {
  ForeignFabricPreviewRequest,
  ForeignFabricPreviewResponse,
} from './fabricProtocol';

const scope: DedicatedWorkerGlobalScope = self as unknown as DedicatedWorkerGlobalScope;

scope.onmessage = (event: MessageEvent<ForeignFabricPreviewRequest>) => {
  if (event.data.kind !== 'project-foreign-topology') return;
  scope.postMessage(compileForeignFabricPreview(event.data) satisfies ForeignFabricPreviewResponse);
};
