import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { createMachineExecutionIndexV1 } from '@kniterate-studio/machine-lib/browser';
import { openMachineDocument } from '../engine';
import type { MachineImportRequest, MachineImportResponse } from './importProtocol';

vi.mock('@kniterate-studio/machine-lib/browser', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@kniterate-studio/machine-lib/browser')>();
  return { ...actual, createMachineExecutionIndexV1: vi.fn(actual.createMachineExecutionIndexV1) };
});
const source = [';!knitout-2', ';;Machine: kniterate', ';;Carriers: 1 2 3 4 5 6',
  'x-stitch-number 6', 'x-speed-number 100', 'x-roller-advance 0',
  'in 2', 'tuck + f40 2', 'tuck + f41 2', 'knit - f41 2', 'knit - f40 2', 'out 2', ''].join('\n');

describe('retained machine inspection worker', () => {
  let received: MachineImportResponse[];
  let scope: { onmessage: ((event: MessageEvent<MachineImportRequest>) => void) | null; postMessage: (response: MachineImportResponse) => void };
  beforeEach(async () => {
    vi.resetModules(); vi.clearAllMocks(); received = [];
    scope = { onmessage: null, postMessage(response) { received.push(structuredClone(response)); } };
    vi.stubGlobal('self', scope);
    await import('./import.worker');
  });
  afterEach(() => { vi.unstubAllGlobals(); });
  function send(request: MachineImportRequest): MachineImportResponse {
    scope.onmessage!(new MessageEvent('message', { data: request }));
    const response = received.at(-1)!;
    expect(response.requestId).toBe(request.requestId);
    return response;
  }
  function open(filename = 'prepared.k', bytes = new TextEncoder().encode(source)) {
    const response = send({ kind: 'open', requestId: 1, filename, bytes });
    if (response.kind !== 'opened') throw new Error('Worker did not open the input.');
    return response;
  }
  it('sends source/verdict summaries and one inspected pass while retaining full evidence', () => {
    const response = open();
    const { document, initial } = response;
    expect(document.verdict.state).toBe('surface');
    expect(document.source).toBe(source);
    for (const key of ['trace', 'validation', 'scene', 'sourceBytes', 'executionIndex']) expect(document.kcode).not.toHaveProperty(key);
    expect(document.kcode?.document).not.toHaveProperty('records');
    expect(initial.scene?.passes).toHaveLength(1);
    expect(initial.validation?.passStates).toHaveLength(1);
    expect(createMachineExecutionIndexV1).toHaveBeenCalledTimes(1);
    const navigation = document.kcode!.inspection!.navigation!;
    const action = send({ kind: 'inspect', requestId: 2, cursor: { eventIndex: navigation.passes[0]!.actionEventIndices[0]! } });
    if (action.kind !== 'inspected') throw new Error('Missing action response.');
    expect(action.inspection.snapshot?.event?.kind).toBe('action');
    expect(action.inspection.snapshot?.loopState?.totalLoops).toBe(1);
    const event = action.inspection.snapshot!.event!;
    expect(document.kcode!.document!.rawText.split('\n')[event.sourceSpan.start.line - 1]).toMatch(/^FRNT:/);
    const end = send({ kind: 'inspect', requestId: 3, cursor: { eventIndex: navigation.eventCount - 1 } });
    if (end.kind !== 'inspected') throw new Error('Missing final state.');
    expect(end.inspection.snapshot?.loopState).toEqual(openMachineDocument('prepared.k', source).kcode?.validation?.finalState);
    const topology = send({ kind: 'topology', requestId: 4, cursor: { requestId: 4, selectedPass: 0, radius: 4 } });
    expect(topology).toMatchObject({ kind: 'topology', response: { kind: 'foreign-topology-complete' } });
    expect(createMachineExecutionIndexV1).toHaveBeenCalledTimes(1);
    expect(send({ kind: 'inspect', requestId: 5, cursor: { eventIndex: navigation.eventCount } })).toMatchObject({ kind: 'failed' });
  });
  it('keeps exact trace comparison in the retained worker', () => {
    const kcode = open().document.kcode!.document!.rawText;
    open('prepared.kc', new TextEncoder().encode(kcode));
    expect(send({ kind: 'compare', requestId: 2, filename: 'same.kc', source: kcode })).toMatchObject({ kind: 'compared', result: { summary: { identical: true, byteIdentical: true } } });
    expect(send({ kind: 'compare', requestId: 3, filename: 'comment.kc', source: kcode + '\n// audit note\n' })).toMatchObject({ kind: 'compared', result: { summary: { identical: true, byteIdentical: false } } });
  });
  it('preserves verdict and static inspection if execution preparation fails', () => {
    vi.mocked(createMachineExecutionIndexV1).mockImplementationOnce(() => { throw new Error('Execution resource limit'); });
    const { document, initial } = open();
    expect(document.verdict).toEqual(openMachineDocument('prepared.k', source).verdict);
    expect(document.kcode?.inspection).toMatchObject({ navigation: null, error: 'Execution resource limit', hasScene: true });
    expect(initial.snapshot).toBeNull();
    expect(initial.scene?.passes).toHaveLength(1);
  });
  it('keeps the large corpus response compact without dropping program navigation', () => {
    const bytes = new Uint8Array(readFileSync('../../packages/machine-lib/reference/front.kc'));
    const response = open('front.kc', bytes);
    expect(response.document.passes).toHaveLength(2544);
    expect(response.document.kcode?.inspection?.passNavigation).toHaveLength(2544);
    expect(response.document.kcode?.inspection?.navigation?.eventCount).toBe(163991);
    expect(response.initial.scene?.passes).toHaveLength(1);
    // The previous complete-model response was about174MB. This includes both source views.
    expect(Buffer.byteLength(JSON.stringify(response))).toBeLessThan(16 * 1024 * 1024);
  }, 20_000);
});
