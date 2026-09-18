import type { MachineDiff } from '../engine';
import type { ForeignFabricPreviewResponse } from '../fabric/fabricProtocol';
import type { InspectionCursor, MachineDocumentView, MachineInspection, TopologyCursor } from './inspection';

export type MachineImportRequest = { requestId: number } & (
  | { kind: 'open'; filename: string; bytes: Uint8Array }
  | { kind: 'inspect'; cursor: InspectionCursor }
  | { kind: 'topology'; cursor: TopologyCursor }
  | { kind: 'compare'; filename: string; source: string }
);
export type MachineImportResponse = { requestId: number } & (
  | { kind: 'opened'; document: MachineDocumentView; initial: MachineInspection }
  | { kind: 'inspected'; inspection: MachineInspection }
  | { kind: 'topology'; response: ForeignFabricPreviewResponse }
  | { kind: 'compared'; result: MachineDiff }
  | { kind: 'failed'; error: string }
);
