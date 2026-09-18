import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createMachineExecutionIndexV1 } from '@kniterate-studio/machine-lib/browser';
import { openMachineDocument, type MachineDocument } from '../engine';
import type { MachineImportRequest, MachineImportResponse } from './importProtocol';

vi.mock('@kniterate-studio/machine-lib/browser', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@kniterate-studio/machine-lib/browser')>();
  return {
    ...actual,
    createMachineExecutionIndexV1: vi.fn(actual.createMachineExecutionIndexV1),
  };
});

const source = [
  ';!knitout-2',
  ';;Machine: kniterate',
  ';;Carriers: 1 2 3 4 5 6',
  'x-stitch-number 6',
  'x-speed-number 100',
  'x-roller-advance 0',
  'in 2',
  'tuck + f40 2',
  'tuck + f41 2',
  'knit - f41 2',
  'knit - f40 2',
  'out 2',
  '',
].join('\n');

describe('machine import worker execution preparation', () => {
  let received: MachineImportResponse[];
  let scope: {
    onmessage: ((event: MessageEvent<MachineImportRequest>) => void) | null;
    postMessage: ReturnType<typeof vi.fn<(response: MachineImportResponse) => void>>;
  };

  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    received = [];
    scope = {
      onmessage: null,
      postMessage: vi.fn((response: MachineImportResponse) => {
        received.push(structuredClone(response));
      }),
    };
    vi.stubGlobal('self', scope);
    await import('./import.worker');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function importDocument(): MachineDocument {
    if (scope.onmessage === null) throw new Error('Import worker did not register its message handler.');
    scope.onmessage(new MessageEvent('message', {
      data: { filename: 'prepared.k', bytes: new TextEncoder().encode(source) },
    }));
    expect(scope.postMessage).toHaveBeenCalledTimes(1);
    expect(received).toHaveLength(1);
    const response = received[0]!;
    if (!('document' in response)) throw new Error(response.error);
    return response.document;
  }

  it('sends the document and index in one clone retaining shared action and source-span identities', () => {
    const document = importDocument();
    const trace = document.kcode?.trace;
    const index = document.kcode?.executionIndex;
    expect(document.verdict.state).toBe('surface');
    expect(document.source).toBe(source);
    expect(trace).toBeTruthy();
    expect(index).toBeTruthy();
    expect(createMachineExecutionIndexV1).toHaveBeenCalledTimes(1);
    if (!trace || !index) throw new Error('Import worker did not attach exact execution evidence.');

    const originalResponse = scope.postMessage.mock.calls[0]![0];
    if (!('document' in originalResponse)) throw new Error(originalResponse.error);
    expect(document).not.toBe(originalResponse.document);
    expect(trace).not.toBe(originalResponse.document.kcode!.trace);

    const actions = index.events.filter((event) => event.kind === 'action');
    expect(actions.length).toBeGreaterThan(1);
    for (const event of actions) {
      const traceAction = trace.passes[event.passIndex]!.actions[event.actionIndex]!;
      expect(event.action).toBe(traceAction);
      if ('at' in traceAction) expect(event.sourceSpan).toBe(traceAction.at.sourceSpan);
    }
    for (const event of index.events) {
      if (event.kind === 'pass-begin') {
        expect(event.sourceSpan).toBe(trace.passes[event.passIndex]!.source.span);
      }
    }
  });

  it('preserves the checked document and verdict when execution preparation fails', () => {
    const expected = openMachineDocument('prepared.k', source);
    vi.mocked(createMachineExecutionIndexV1).mockImplementationOnce(() => {
      throw new Error('Execution index exceeds its resource limit');
    });

    const document = importDocument();
    expect(createMachineExecutionIndexV1).toHaveBeenCalledTimes(1);
    expect(document.verdict).toEqual(expected.verdict);
    expect(document.verdict.state).toBe('surface');
    expect(document.source).toBe(expected.source);
    expect(document.passes).toEqual(expected.passes);
    expect(document.diagnostics).toEqual(expected.diagnostics);
    expect(document.kcode?.trace).toEqual(expected.kcode?.trace);
    expect(document.kcode?.validation).toEqual(expected.kcode?.validation);
    expect(document.kcode?.executionIndex).toBeNull();
    expect(document.kcode?.executionError).toBe('Execution index exceeds its resource limit');
  });
});
