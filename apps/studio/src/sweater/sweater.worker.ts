/// <reference lib="webworker" />
import type { ColorworkProjectV1 } from '@kniterate-studio/project-contract';
import { runSweaterPipeline } from './sweaterPipeline';
import { summarizeSweaterRun, type SweaterRunResponse } from './sweaterRun';

const scope: DedicatedWorkerGlobalScope = self as unknown as DedicatedWorkerGlobalScope;
let latestRequestId = 0;

scope.onmessage = async (event: MessageEvent<{ requestId: number; project: ColorworkProjectV1 }>) => {
  const { requestId, project } = event.data;
  latestRequestId = requestId;
  try {
    const result = await runSweaterPipeline(project);
    if (requestId !== latestRequestId) return;
    scope.postMessage({ kind: 'sweater-complete', requestId, summary: summarizeSweaterRun(result) } satisfies SweaterRunResponse);
  } catch (error) {
    if (requestId !== latestRequestId) return;
    scope.postMessage({ kind: 'sweater-failed', requestId, error: error instanceof Error ? error.message : String(error) } satisfies SweaterRunResponse);
  }
};
