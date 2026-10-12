import { openMachineDocument } from '../engine';
import { createMachineInspector } from './inspection';
import type { MachineImportRequest, MachineImportResponse } from './importProtocol';

let inspector: ReturnType<typeof createMachineInspector> | null = null;
self.onmessage = (event: MessageEvent<MachineImportRequest>) => {
  const request = event.data;
  let response: MachineImportResponse;
  try {
    if (request.kind === 'open') {
      inspector = null;
      const document = openMachineDocument(request.filename, request.bytes,
        request.filename.toLowerCase().endsWith('.kc') ? { dialect: 'knitout-vendor' } : {});
      inspector = createMachineInspector(document);
      response = { kind: 'opened', requestId: request.requestId, document: inspector.document, initial: inspector.initial };
    } else {
      if (!inspector) throw new Error('No machine document is loaded.');
      switch (request.kind) {
        case 'inspect': response = { kind: 'inspected', requestId: request.requestId, inspection: inspector.inspect(request.cursor) }; break;
        case 'topology': response = { kind: 'topology', requestId: request.requestId, response: inspector.topology(request.cursor) }; break;
        case 'compare': response = { kind: 'compared', requestId: request.requestId, result: inspector.compare(request.filename, request.source) }; break;
      }
    }
  } catch (error) {
    response = { kind: 'failed', requestId: request.requestId, error: error instanceof Error ? error.message : String(error) };
  }
  self.postMessage(response);
};
