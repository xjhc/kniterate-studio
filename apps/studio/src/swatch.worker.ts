/// <reference lib="webworker" />
import { materializeColorworkProject, type ColorworkProjectV1 } from '@kniterate-studio/project-contract';
import { runAuthoredPipeline } from './authoredPipeline';
import { runSweaterPipeline } from './sweater/sweaterPipeline';
import type { SwatchResponse } from './swatch';

const scope: DedicatedWorkerGlobalScope = self as unknown as DedicatedWorkerGlobalScope;

/** Checks a swatch project through the same pipeline and verdict as any project: a scarf panel's, or a chart's. */
scope.onmessage = async (event: MessageEvent<{ requestId: number; project: ColorworkProjectV1 }>) => {
  const { requestId, project } = event.data;
  try {
    if (materializeColorworkProject(project).state.object?.kind === 'panel') {
      const result = await runSweaterPipeline(project);
      const piece = result.pieces[0];
      scope.postMessage({ kind: 'swatch-complete', requestId, exportReady: result.exportReady, verdictLabel: result.verdict.label, kcText: result.exportReady && piece?.kcode?.ok ? piece.kcode.kcText : null, problem: result.exportReady ? null : result.verdict.annotation } satisfies SwatchResponse);
    } else {
      const result = await runAuthoredPipeline(project);
      scope.postMessage({ kind: 'swatch-complete', requestId, exportReady: result.exportReady, verdictLabel: result.verdict.label, kcText: result.exportReady && result.kcode?.ok ? result.kcode.kcText : null, problem: result.exportReady ? null : result.compileError ?? result.outputError ?? result.verdict.annotation } satisfies SwatchResponse);
    }
  } catch (error) {
    scope.postMessage({ kind: 'swatch-failed', requestId, error: error instanceof Error ? error.message : String(error) } satisfies SwatchResponse);
  }
};
