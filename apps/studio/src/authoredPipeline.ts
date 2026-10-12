import { matchKnitProvenArtifact } from '@kniterate-studio/machine-lib/browser';
import { materializeColorworkProject, type ColorworkProjectV1 } from '@kniterate-studio/project-contract';
import { compileColorworkProject, type BlanketCompileArtifact } from './blanket/compileProject';
import { compileKCodeArtifact } from './kcode/compileKCodeArtifact';
import { authoredKnitoutNeedleRange, type KCodeArtifact } from './kcode/kcodeProtocol';
import { resolveAuthoredVerdict, type AuthoredVerdict } from './engine';

export interface AuthoredPipelineResult {
  compiled: BlanketCompileArtifact | null;
  compileError: string | null;
  kcode: KCodeArtifact | null;
  outputError: string | null;
  verdict: AuthoredVerdict;
  /** Same gate as the Studio Export button. */
  exportReady: boolean;
}

/**
 * Headless authored project → verdict. Composes the same seams the Studio
 * workers and `App` use (compile, strict KCode conversion, registry match,
 * `resolveAuthoredVerdict`) in one awaited sequence; it adds no policy.
 */
export async function runAuthoredPipeline(project: ColorworkProjectV1): Promise<AuthoredPipelineResult> {
  let compiled: BlanketCompileArtifact | null = null;
  let compileError: string | null = null;
  try {
    compiled = compileColorworkProject(project);
  } catch (error) {
    compileError = error instanceof Error ? error.message : String(error);
  }

  let kcode: KCodeArtifact | null = null;
  let outputError: string | null = null;
  if (compiled?.ok && compiled.inputHash !== null && compiled.knitoutText !== null && compiled.capacity.status === 'supported') {
    try {
      kcode = await compileKCodeArtifact({
        kind: 'convert-kcode',
        requestId: 1,
        inputHash: compiled.inputHash,
        capacity: compiled.capacity,
        knitoutText: compiled.knitoutText,
        compilerNeedleRange: authoredKnitoutNeedleRange(materializeColorworkProject(project).state),
        programOpSourceRows: compiled.programOpSourceRows,
        rowProvenance: compiled.rowProvenance,
      });
    } catch (error) {
      outputError = error instanceof Error ? error.message : String(error);
    }
  }

  const outputReady = kcode?.ok === true;
  const knitProvenMatch = matchKnitProvenArtifact(
    outputReady ? compiled?.inputHash : null,
    outputReady ? kcode?.kcHash : null,
  );
  const verdict = resolveAuthoredVerdict({
    compileStatus: compileError === null ? 'ready' : 'failed',
    compileOk: compiled?.ok ?? null,
    compileError,
    outputStatus: kcode !== null ? 'ready' : outputError !== null ? 'failed' : 'idle',
    outputOk: kcode?.ok ?? null,
    outputCurrent: kcode !== null,
    outputError,
    knitProvenEntryId: knitProvenMatch?.id ?? null,
  }) ?? {
    // A compiled-ok project whose conversion never ran cannot export; report it as blocked.
    state: 'blocked',
    label: 'Blocked',
    annotation: 'No validated K-code was produced for this project.',
    evidenceId: null,
  };
  return {
    compiled,
    compileError,
    kcode,
    outputError,
    verdict,
    exportReady: outputReady && verdict.state !== 'blocked',
  };
}
