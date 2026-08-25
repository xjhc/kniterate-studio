import type {
  KCodeDiagnostic,
  MachineSceneV1,
  MachineTraceV1,
  MachineValidationReportV1,
  ScheduledTraceComparisonV1,
  ValidationMessage,
} from '@kniterate-studio/machine-lib/browser';

export interface KCodeConversionRequest {
  kind: 'convert-kcode';
  requestId: number;
  inputHash: string;
  knitoutText: string;
  programOpSourceRows: readonly (readonly number[] | null)[];
  rowProvenance: readonly {
    rowId: string;
    chartRow: number;
    machineRow: number;
  }[];
}

export interface KCodePassProvenance {
  passIndex: number;
  sourceLines: readonly number[];
  sourceRows: readonly number[];
  rowIds: readonly string[];
  isAutoMove: boolean;
  comment: string | null;
}

export interface KCodeArtifact {
  inputHash: string;
  kcHash: string;
  kcText: string;
  passCount: number;
  messages: readonly ValidationMessage[];
  parserDiagnostics: readonly KCodeDiagnostic[];
  trace: MachineTraceV1 | null;
  scene: MachineSceneV1 | null;
  validation: MachineValidationReportV1 | null;
  differential: ScheduledTraceComparisonV1 | null;
  passProvenance: readonly KCodePassProvenance[];
  passLines: readonly { passIndex: number; lineStart: number; lineEnd: number }[];
  rowLines: readonly { rowId: string; lineStart: number; lineEnd: number }[];
  rowPasses: readonly { rowId: string; passIndices: readonly number[] }[];
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
