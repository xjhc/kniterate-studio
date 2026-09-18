import { createMachineExecutionIndexV1 } from '@kniterate-studio/machine-lib/browser';
import { openMachineDocument } from '../engine';
import type { MachineImportRequest, MachineImportResponse } from './importProtocol';

self.onmessage = (event: MessageEvent<MachineImportRequest>) => {
  const { filename, bytes } = event.data;
  let response: MachineImportResponse;
  try {
    const document = openMachineDocument(filename, bytes,
      filename.toLowerCase().endsWith('.kc') ? { dialect: 'knitout-vendor' } : {});
    if (document.kcode?.trace && document.kcode.validation) {
      try {
        document.kcode.executionIndex = createMachineExecutionIndexV1(document.kcode.trace, document.kcode.validation);
      } catch (error) {
        document.kcode.executionIndex = null;
        document.kcode.executionError = error instanceof Error ? error.message : String(error);
      }
    }
    // One clone preserves shared action/span references in the trace and index.
    response = { document };
  } catch (error) {
    response = { error: error instanceof Error ? error.message : String(error) };
  }
  self.postMessage(response);
};
