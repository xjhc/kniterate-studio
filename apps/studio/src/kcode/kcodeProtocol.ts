import type {
  AuthoredKCodeCoordinateBridgeV1,
  KCodeDiagnostic,
  MachineSceneV1,
  MachineTraceV1,
  MachineValidationReportV1,
  ScheduledTraceComparisonV1,
  ValidationMessage,
} from '@kniterate-studio/machine-lib/browser';
import type { AuthoredCapacityBlockedV1, AuthoredCapacitySupportedV1, ProjectState } from '@kniterate-studio/project-contract';

export interface KCodeConversionRequest {
  kind: 'convert-kcode';
  requestId: number;
  inputHash: string;
  capacity: AuthoredCapacitySupportedV1;
  knitoutText: string;
  /** Authored one-based Knitout front-bed needles spanned by the chart. */
  compilerNeedleRange: { start: number; end: number };
  programOpSourceRows: readonly (readonly number[] | null)[];
  rowProvenance: readonly {
    rowId: string;
    chartRow: number;
    machineRow: number;
  }[];
}

/** One-based Knitout front-bed needles the authored chart spans; chart column 0 is `needleOffset`. */
export function authoredKnitoutNeedleRange(state: Pick<ProjectState, 'chart' | 'machine'>): { start: number; end: number } {
  return { start: state.machine.needleOffset, end: state.machine.needleOffset + state.chart.width - 1 };
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
  capacity: AuthoredCapacitySupportedV1;
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
  /** Verified authored-needle to trace-coordinate bridge; null when it cannot be established. */
  coordinateBridge: AuthoredKCodeCoordinateBridgeV1 | null;
  /**
   * Knitout (compiler-project) needle extent selected by each emitted pass, via
   * `coordinateBridge`. These are not physical needle labels. Null for passes
   * without selections or when no bridge exists.
   */
  passKnitoutNeedles: readonly ({ start: number; end: number } | null)[];
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
  capacity: AuthoredCapacityBlockedV1 | null;
};
