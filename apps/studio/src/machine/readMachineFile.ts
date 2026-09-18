import {
  MAX_MACHINE_SOURCE_BYTES_V1,
  openMachineDocument,
  rejectOversizedMachineDocument,
  rejectUnreadableMachineDocument,
  type MachineDocument,
} from '../engine';
import type { MachineImportRequest, MachineImportResponse } from './importProtocol';

/** Browser imports can be cancelled by terminating their isolated compiler. */
export async function readMachineFile(file: File, signal?: AbortSignal): Promise<MachineDocument> {
  signal?.throwIfAborted();
  if (file.size > MAX_MACHINE_SOURCE_BYTES_V1) {
    return rejectOversizedMachineDocument(file.name, file.size);
  }
  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    signal?.throwIfAborted();
    // The same pure intake remains usable in Node and server-rendered tests.
    if (typeof Worker === 'undefined') {
      return openMachineDocument(file.name, bytes,
        file.name.toLowerCase().endsWith('.kc') ? { dialect: 'knitout-vendor' } : {});
    }
    return await new Promise<MachineDocument>((resolve, reject) => {
      const worker = new Worker(new URL('./import.worker.ts', import.meta.url), { type: 'module' });
      const cleanup = () => {
        signal?.removeEventListener('abort', abort);
        worker.terminate();
      };
      const abort = () => { cleanup(); reject(signal?.reason ?? new DOMException('Import cancelled', 'AbortError')); };
      signal?.addEventListener('abort', abort, { once: true });
      worker.onmessage = (event: MessageEvent<MachineImportResponse>) => {
        cleanup();
        if ('document' in event.data) resolve(event.data.document);
        else reject(new Error(event.data.error));
      };
      worker.onerror = (event) => { cleanup(); reject(new Error(event.message || 'Machine import failed.')); };
      try {
        const request: MachineImportRequest = { filename: file.name, bytes };
        worker.postMessage(request, [bytes.buffer]);
      } catch (error) { cleanup(); reject(error); }
    });
  } catch (error) {
    signal?.throwIfAborted();
    return rejectUnreadableMachineDocument(file.name, error instanceof Error ? error.message : String(error));
  }
}
