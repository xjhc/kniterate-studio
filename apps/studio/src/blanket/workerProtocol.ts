import type { ColorworkProjectV1 } from '@kniterate-studio/project-contract';
import type { BlanketCompileArtifact } from './compileProject';

export interface BlanketCompileRequest {
  kind: 'compile-blanket';
  requestId: number;
  project: ColorworkProjectV1;
}

export type BlanketCompileResponse = {
  kind: 'compile-complete';
  requestId: number;
  artifact: BlanketCompileArtifact;
} | {
  kind: 'compile-failed';
  requestId: number;
  error: string;
};

export function isCurrentCompileResponse(activeRequestId: number, response: BlanketCompileResponse): boolean {
  return response.requestId === activeRequestId;
}
