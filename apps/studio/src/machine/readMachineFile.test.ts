import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  MAX_MACHINE_SOURCE_BYTES_V1,
  openMachineDocument,
} from '../engine';
import type { MachineImportRequest, MachineImportResponse } from './importProtocol';
import { readMachineFile, disposeMachineDocument, machineSession } from './readMachineFile';
import { createMachineInspector } from './inspection';

class ImportWorker {
  static instances: ImportWorker[] = [];
  onmessage: ((event: MessageEvent<MachineImportResponse>) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  received: MachineImportRequest | null = null;
  terminated = false;

  constructor(readonly url: URL, readonly options: WorkerOptions) {
    ImportWorker.instances.push(this);
  }

  postMessage(request: MachineImportRequest, transfer: Transferable[]): void {
    // Exercise actual transfer semantics: the sender's buffer is detached and
    // the worker receives the same bytes without text decoding or normalization.
    this.received = structuredClone(request, { transfer });
  }

  terminate(): void {
    this.terminated = true;
  }

  respond(response: MachineImportResponse): void {
    this.onmessage?.(new MessageEvent('message', { data: response }));
  }

  fail(message: string): void {
    this.onerror?.({ message } as ErrorEvent);
  }
}

function machineFile(values: readonly number[] = [72, 79, 77, 69, 13, 10], name = 'import.kc') {
  const buffer = Uint8Array.from(values).buffer;
  const file = new File([buffer], name);
  const read = vi.spyOn(file, 'arrayBuffer').mockResolvedValue(buffer);
  return { file, buffer, read };
}

function workerResult(worker: ImportWorker): Extract<MachineImportResponse, { kind: 'opened' }> {
  const request = worker.received;
  if (request?.kind !== 'open') throw new Error('Worker did not receive a machine import.');
  const inspector = createMachineInspector(openMachineDocument(request.filename, request.bytes,
    request.filename.toLowerCase().endsWith('.kc') ? { dialect: 'knitout-vendor' } : {}));
  return { kind: 'opened', requestId: request.requestId, document: inspector.document, initial: inspector.initial };
}

async function startedWorker(): Promise<ImportWorker> {
  // The file mock resolves immediately; one microtask completes arrayBuffer()
  // before the service creates its worker.
  await Promise.resolve();
  const worker = ImportWorker.instances.at(-1);
  if (worker === undefined) throw new Error('Machine import worker was not created.');
  return worker;
}

describe('cancellable machine-file import', () => {
  beforeEach(() => {
    ImportWorker.instances = [];
    vi.stubGlobal('Worker', ImportWorker);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('rejects an already cancelled import before reading the file or starting a worker', async () => {
    const { file, read } = machineFile();
    const controller = new AbortController();
    const reason = new DOMException('Superseded import', 'AbortError');
    controller.abort(reason);

    await expect(readMachineFile(file, controller.signal)).rejects.toBe(reason);
    expect(read).not.toHaveBeenCalled();
    expect(ImportWorker.instances).toHaveLength(0);
  });

  it('does not start a worker when cancellation occurs during the file read', async () => {
    const { file, buffer, read } = machineFile();
    let finishRead!: (bytes: ArrayBuffer) => void;
    read.mockImplementation(() => new Promise<ArrayBuffer>((resolve) => { finishRead = resolve; }));
    const controller = new AbortController();
    const importing = readMachineFile(file, controller.signal);
    controller.abort();
    finishRead(buffer);

    await expect(importing).rejects.toBe(controller.signal.reason);
    expect(ImportWorker.instances).toHaveLength(0);
    expect(buffer.byteLength).toBe(file.size);
  });

  it('terminates a cancelled worker and ignores its late completion while a new import succeeds', async () => {
    const controller = new AbortController();
    const onOldCompletion = vi.fn();
    const previous = readMachineFile(machineFile().file, controller.signal).then(onOldCompletion);
    const oldWorker = await startedWorker();
    const oldDocument = workerResult(oldWorker);
    controller.abort();

    await expect(previous).rejects.toBe(controller.signal.reason);
    expect(oldWorker.terminated).toBe(true);

    const current = readMachineFile(machineFile([72, 79, 77, 69], 'current.kc').file);
    const currentWorker = await startedWorker();
    const currentDocument = workerResult(currentWorker);
    oldWorker.respond(oldDocument);
    expect(onOldCompletion).not.toHaveBeenCalled();
    expect(currentWorker.terminated).toBe(false);
    currentWorker.respond(currentDocument);

    await expect(current).resolves.toBe(currentDocument.document);
    expect(currentWorker.terminated).toBe(false);
    disposeMachineDocument(currentDocument.document);
    expect(currentWorker.terminated).toBe(true);
  });

  it('transfers original bytes and retains the worker until the document is closed', async () => {
    const original = [72, 79, 77, 69, 13, 10, 0xff, 0xc3, 0x28, 0, 13];
    const { file, buffer } = machineFile(original, 'exact.KC');
    const post = vi.spyOn(ImportWorker.prototype, 'postMessage');
    const controller = new AbortController();
    const removeListener = vi.spyOn(controller.signal, 'removeEventListener');
    const importing = readMachineFile(file, controller.signal);
    const worker = await startedWorker();

    expect(worker.url.pathname).toContain('/import.worker.ts');
    expect(worker.options).toEqual({ type: 'module' });
    expect(post).toHaveBeenCalledExactlyOnceWith({ kind: 'open', requestId: 1, filename: 'exact.KC', bytes: expect.any(Uint8Array) }, [buffer]);
    const sent = post.mock.calls[0]![0];
    if (sent.kind !== 'open' || worker.received?.kind !== 'open') throw new Error('Missing open request.');
    expect(sent.bytes.buffer).toBe(buffer);
    expect(buffer.byteLength).toBe(0);
    expect(Array.from(worker.received.bytes)).toEqual(original);

    const document = workerResult(worker);
    worker.respond(document);
    await expect(importing).resolves.toBe(document.document);
    expect(worker.terminated).toBe(false);
    disposeMachineDocument(document.document);
    expect(worker.terminated).toBe(true);
    expect(removeListener).toHaveBeenCalledWith('abort', expect.any(Function));
    expect(Array.from(document.document.source, (character) => character.charCodeAt(0))).toEqual(original);
  });

  it.each(['response', 'event'] as const)('returns a blocked document when the worker fails by %s', async (failure) => {
    const importing = readMachineFile(machineFile().file);
    const worker = await startedWorker();
    if (failure === 'response') worker.respond({ kind: 'failed', requestId: 1, error: 'Compiler failed during import' });
    else worker.fail('Compiler failed during import');

    const document = await importing;
    expect(document.verdict.state).toBe('blocked');
    expect(document.diagnostics).toContainEqual(expect.objectContaining({
      severity: 'error',
      rawMessage: expect.stringContaining('Compiler failed during import'),
    }));
    expect(worker.terminated).toBe(true);
  });

  it('terminates the worker and returns blocked when transferring the request fails', async () => {
    vi.spyOn(ImportWorker.prototype, 'postMessage').mockImplementation(() => {
      throw new DOMException('Cannot transfer machine bytes', 'DataCloneError');
    });

    const document = await readMachineFile(machineFile().file);
    expect(document.verdict.state).toBe('blocked');
    expect(document.diagnostics).toContainEqual(expect.objectContaining({
      rawMessage: expect.stringContaining('Cannot transfer machine bytes'),
    }));
    expect(ImportWorker.instances[0]!.terminated).toBe(true);
  });

  it('returns a blocked document when the file cannot be read', async () => {
    const { file, read } = machineFile();
    read.mockRejectedValue(new Error('File unavailable'));

    const document = await readMachineFile(file);
    expect(document.verdict.state).toBe('blocked');
    expect(document.diagnostics).toContainEqual(expect.objectContaining({ rawMessage: expect.stringContaining('File unavailable') }));
    expect(ImportWorker.instances).toHaveLength(0);
  });

  it('refuses an oversized file without reading or allocating a worker', async () => {
    const { file, read } = machineFile();
    vi.spyOn(file, 'size', 'get').mockReturnValue(MAX_MACHINE_SOURCE_BYTES_V1 + 1);

    const document = await readMachineFile(file);
    expect(document.verdict.state).toBe('blocked');
    expect(read).not.toHaveBeenCalled();
    expect(ImportWorker.instances).toHaveLength(0);
  });

  it('preserves the same byte-oriented result when Worker is unavailable', async () => {
    vi.stubGlobal('Worker', undefined);
    const original = [72, 79, 77, 69, 13, 10, 0xff];
    const { file } = machineFile(original);
    const expected = openMachineDocument(file.name, Uint8Array.from(original), { dialect: 'knitout-vendor' });

    await expect(readMachineFile(file)).resolves.toEqual(createMachineInspector(expected).document);
    expect(ImportWorker.instances).toHaveLength(0);
  });
  it('correlates concurrent inspection requests and rejects pending requests when closed', async () => {
    const importing = readMachineFile(machineFile().file);
    const worker = await startedWorker();
    const opened = workerResult(worker);
    worker.respond(opened);
    const document = await importing;
    const session = machineSession(document);
    const first = session.inspect({ eventIndex: -1 });
    const second = session.inspect({ eventIndex: -1 });
    worker.respond({ kind: 'inspected', requestId: 3, inspection: { ...opened.initial, selectedPass: 2 } });
    worker.respond({ kind: 'inspected', requestId: 2, inspection: { ...opened.initial, selectedPass: 1 } });
    await expect(first).resolves.toMatchObject({ selectedPass: 1 });
    await expect(second).resolves.toMatchObject({ selectedPass: 2 });
    const pending = session.inspect({ eventIndex: -1 });
    disposeMachineDocument(document);
    await expect(pending).rejects.toThrow('closed');
    await expect(session.inspect({ eventIndex: -1 })).rejects.toThrow('closed');
    expect(worker.terminated).toBe(true);
  });

});
