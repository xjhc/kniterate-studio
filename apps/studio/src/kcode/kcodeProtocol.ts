import type { PredictedPass, ValidationMessage } from '@kniterate-studio/machine-lib/browser';

export interface KCodeConversionRequest {
  kind: 'convert-kcode';
  requestId: number;
  inputHash: string;
  knitoutText: string;
  predictedPasses: readonly PredictedPass[];
  rowProvenance: readonly { rowId: string; passIndices: readonly number[] }[];
}

export interface KCodeArtifact {
  inputHash: string;
  kcHash: string;
  kcText: string;
  passCount: number;
  messages: readonly ValidationMessage[];
  parityMismatches: readonly string[];
  passLines: readonly { passIndex: number; lineStart: number; lineEnd: number }[];
  rowLines: readonly { rowId: string; lineStart: number; lineEnd: number }[];
  ok: boolean;
}

export type KCodeConversionResponse = {
  kind: 'kcode-complete';
  requestId: number;
  artifact: KCodeArtifact;
} | {
  kind: 'kcode-failed';
  requestId: number;
  error: string;
};
