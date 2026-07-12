/// <reference lib="webworker" />
import { compileColorworkProject, projectWithPreviewStrategy, strategyComparisonFromArtifact, type BackingTechnique, type StrategyComparison } from './compileProject';
import type { BlanketCompileRequest, BlanketCompileResponse } from './workerProtocol';

const scope: DedicatedWorkerGlobalScope = self as unknown as DedicatedWorkerGlobalScope;
const techniques: readonly BackingTechnique[] = ['fairisle', 'ladder-back', 'lined', 'birdseye', 'complement'];
let latestRequestId = 0;

function compileComparisons(request: BlanketCompileRequest, selected: ReturnType<typeof compileColorworkProject>, index = 0, comparisons: StrategyComparison[] = []): void {
  if (request.requestId !== latestRequestId) return;
  if (index >= techniques.length) {
    scope.postMessage({ kind: 'strategy-comparisons-complete', requestId: request.requestId, comparisons } satisfies BlanketCompileResponse);
    return;
  }
  const technique = techniques[index]!;
  const artifact = technique === selected.technique ? selected : compileColorworkProject(projectWithPreviewStrategy(request.project, technique));
  comparisons.push(strategyComparisonFromArtifact(artifact));
  setTimeout(() => compileComparisons(request, selected, index + 1, comparisons), 0);
}

scope.onmessage = (event: MessageEvent<BlanketCompileRequest>) => {
  const request = event.data;
  if (request.kind !== 'compile-blanket') return;
  latestRequestId = request.requestId;
  let response: BlanketCompileResponse;
  try {
    const artifact = compileColorworkProject(request.project);
    response = { kind: 'compile-complete', requestId: request.requestId, artifact };
    scope.postMessage(response);
    setTimeout(() => compileComparisons(request, artifact), 0);
    return;
  } catch (error) {
    response = { kind: 'compile-failed', requestId: request.requestId, error: error instanceof Error ? error.message : String(error) };
  }
  scope.postMessage(response);
};
