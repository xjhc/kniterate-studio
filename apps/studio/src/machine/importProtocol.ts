import type { MachineDocument } from '../engine';

export interface MachineImportRequest {
  filename: string;
  bytes: Uint8Array;
}

export type MachineImportResponse = { document: MachineDocument } | { error: string };
