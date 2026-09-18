import { createMachineExecutionIndexV1, type MachineTraceV1, type MachineValidationReportV1 } from '@kniterate-studio/machine-lib/browser';

self.onmessage = (event: MessageEvent<{ trace: MachineTraceV1; validation: MachineValidationReportV1 }>) => {
  try {
    self.postMessage({ index: createMachineExecutionIndexV1(event.data.trace, event.data.validation) });
  } catch (error) {
    self.postMessage({ error: error instanceof Error ? error.message : String(error) });
  }
};
