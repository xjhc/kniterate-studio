import {
  MAX_MACHINE_SOURCE_BYTES_V1, openMachineDocument,
  rejectOversizedMachineDocument, rejectUnreadableMachineDocument,
} from '../engine';
import { createMachineInspector, type MachineDocumentView, type MachineInspection, type InspectionCursor, type TopologyCursor } from './inspection';
import type { MachineDiff } from '../engine';
import type { ForeignFabricPreviewResponse } from '../fabric/fabricProtocol';
import type { MachineImportRequest, MachineImportResponse } from './importProtocol';

export interface MachineSession {
  initial: MachineInspection;
  inspect(cursor: InspectionCursor): Promise<MachineInspection>;
  topology(cursor: TopologyCursor): Promise<ForeignFabricPreviewResponse>;
  compare(other: MachineDocumentView): Promise<MachineDiff>;
  dispose(): void;
}
const sessions = new WeakMap<MachineDocumentView, MachineSession>();
export function machineSession(document: MachineDocumentView): MachineSession {
  const session = sessions.get(document);
  if (!session) throw new Error('This machine document is closed.');
  return session;
}
export function disposeMachineDocument(document: MachineDocumentView | null): void {
  if (!document) return;
  sessions.get(document)?.dispose();
  sessions.delete(document);
}
function localDocument(document: ReturnType<typeof openMachineDocument>): MachineDocumentView {
  const inspector = createMachineInspector(document);
  sessions.set(inspector.document, {
    initial: inspector.initial,
    inspect: async (cursor) => inspector.inspect(cursor),
    topology: async (cursor) => inspector.topology(cursor),
    compare: async (other) => inspector.compare(other.filename, other.source),
    dispose() {},
  });
  return inspector.document;
}
type RequestBody<T = MachineImportRequest> = T extends { requestId: number } ? Omit<T, 'requestId'> : never;

/** The Worker owns the complete model until its document is closed or replaced. */
export async function readMachineFile(file: File, signal?: AbortSignal): Promise<MachineDocumentView> {
  signal?.throwIfAborted();
  if (file.size > MAX_MACHINE_SOURCE_BYTES_V1) return localDocument(rejectOversizedMachineDocument(file.name, file.size));
  let dispose: (() => void) | undefined;
  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    signal?.throwIfAborted();
    if (typeof Worker === 'undefined') return localDocument(openMachineDocument(file.name, bytes,
      file.name.toLowerCase().endsWith('.kc') ? { dialect: 'knitout-vendor' } : {}));
    const worker = new Worker(new URL('./import.worker.ts', import.meta.url), { type: 'module' });
    let nextId = 0;
    let closed = false;
    const pending = new Map<number, { resolve: (value: MachineImportResponse) => void; reject: (error: Error) => void }>();
    const close = (reason = new Error('Machine document closed.')) => {
      if (closed) return;
      closed = true;
      worker.onmessage = null;
      worker.onerror = null;
      worker.terminate();
      for (const task of pending.values()) task.reject(reason);
      pending.clear();
    };
    dispose = close;
    worker.onmessage = (event: MessageEvent<MachineImportResponse>) => {
      const response = event.data;
      const task = pending.get(response.requestId);
      if (!task) return;
      pending.delete(response.requestId);
      if (response.kind === 'failed') task.reject(new Error(response.error));
      else task.resolve(response);
    };
    worker.onerror = (event) => close(new Error(event.message || 'Machine inspection worker failed.'));
    const request = (body: RequestBody, transfer: Transferable[] = []): Promise<MachineImportResponse> => {
      if (closed) return Promise.reject(new Error('Machine document closed.'));
      const requestId = ++nextId;
      return new Promise((resolve, reject) => {
        pending.set(requestId, { resolve, reject });
        try { worker.postMessage({ ...body, requestId } satisfies MachineImportRequest, transfer); }
        catch (error) { pending.delete(requestId); reject(error); }
      });
    };
    const abort = () => close(new DOMException('Machine import cancelled', 'AbortError'));
    signal?.addEventListener('abort', abort, { once: true });
    let response: MachineImportResponse;
    try { response = await request({ kind: 'open', filename: file.name, bytes }, [bytes.buffer]); }
    finally { signal?.removeEventListener('abort', abort); }
    signal?.throwIfAborted();
    if (response.kind !== 'opened') throw new Error('Unexpected machine import response.');
    const session: MachineSession = {
      initial: response.initial,
      async inspect(cursor) {
        const result = await request({ kind: 'inspect', cursor });
        if (result.kind !== 'inspected') throw new Error('Unexpected inspection response.');
        return result.inspection;
      },
      async topology(cursor) {
        const result = await request({ kind: 'topology', cursor });
        if (result.kind !== 'topology') throw new Error('Unexpected topology response.');
        return result.response;
      },
      async compare(other) {
        const result = await request({ kind: 'compare', filename: other.filename, source: other.source });
        if (result.kind !== 'compared') throw new Error('Unexpected comparison response.');
        return result.result;
      },
      dispose: close,
    };
    sessions.set(response.document, session);
    return response.document;
  } catch (error) {
    dispose?.();
    signal?.throwIfAborted();
    return localDocument(rejectUnreadableMachineDocument(file.name, error instanceof Error ? error.message : String(error)));
  }
}
