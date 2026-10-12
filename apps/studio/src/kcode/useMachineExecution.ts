import { useEffect, useMemo, useState } from 'react';
import { executionNavigation } from '../machine/inspection';
import {
  createMachineExecutionIndexV1,
  inspectMachineExecutionV1,
  type MachineTraceV1,
  type MachineValidationReportV1,
} from '@kniterate-studio/machine-lib/browser';

export type ExecutionIndex = ReturnType<typeof createMachineExecutionIndexV1>;
export type ExecutionSnapshot = ReturnType<typeof inspectMachineExecutionV1>;

export function useMachineExecution(
  trace: MachineTraceV1 | null,
  validation: MachineValidationReportV1 | null,
  selectedPass: number,
  onSelect: (pass: number, line: number | null) => void,
) {
  const [result, setResult] = useState<{ trace: MachineTraceV1; index: ExecutionIndex | null; error: string | null } | null>(null);
  const [breakpointState, setBreakpointState] = useState<{ index: ExecutionIndex; events: ReadonlySet<number> } | null>(null);
  const [cursor, setCursor] = useState<{ index: ExecutionIndex; eventIndex: number; pass: number } | null>(null);
  useEffect(() => {
    setResult(null);
    setCursor(null);
    setBreakpointState(null);
    if (!trace || !validation) return;
    const worker = new Worker(new URL('./execution.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (event: MessageEvent<{ index: ExecutionIndex } | { error: string }>) => {
      setResult('index' in event.data
        ? { trace, index: event.data.index, error: null }
        : { trace, index: null, error: event.data.error });
      worker.terminate();
    };
    worker.onerror = (event) => { setResult({ trace, index: null, error: event.message || 'Execution inspection failed.' }); worker.terminate(); };
    worker.postMessage({ trace, validation });
    return () => { worker.onmessage = null; worker.onerror = null; worker.terminate(); };
  }, [trace, validation]);
  const index = result?.trace === trace ? result.index : null;
  const navigation = useMemo(() => index === null ? null : executionNavigation(index), [index]);
  const breakpoints = useMemo(() => breakpointState?.index === index ? breakpointState?.events ?? new Set<number>() : new Set<number>(), [breakpointState, index]);
  const toggleBreakpoint = (event: number) => {
    if (!index || event < 0) return;
    const events = new Set(breakpoints);
    if (events.has(event)) events.delete(event); else events.add(event);
    setBreakpointState({ index, events });
  };
  const eventIndex = index === null ? -1 : cursor?.index === index && cursor.pass === selectedPass
    ? cursor.eventIndex
    : index.passes.find((pass) => pass.passIndex === selectedPass)?.beginEventIndex ?? -1;
  const snapshot = useMemo(() => index === null ? null : inspectMachineExecutionV1(index, eventIndex), [index, eventIndex]);
  const selectEvent = (requested: number) => {
    if (!index) return;
    const next = Math.max(-1, Math.min(index.events.length - 1, requested));
    const state = inspectMachineExecutionV1(index, next);
    const pass = Math.max(0, Math.min(index.passes.length - 1, next < 0 ? 0 : state.event?.passIndex ?? index.passes.length - 1));
    setCursor({ index, eventIndex: next, pass });
    onSelect(pass, state.event?.sourceSpan.start.line ?? null);
  };
  const selectAction = (passIndex: number, actionIndex?: number) => {
    const pass = index?.passes.find((item) => item.passIndex === passIndex);
    if (!pass) { onSelect(passIndex, null); return; }
    selectEvent(actionIndex === undefined ? pass.beginEventIndex : pass.actionEventIndices[actionIndex] ?? pass.beginEventIndex);
  };
  return {
    index: navigation, eventIndex, snapshot, selectEvent, selectAction, selectedPass, breakpoints, toggleBreakpoint,
    error: result?.trace === trace ? result.error : null,
    pending: trace !== null && validation !== null && result?.trace !== trace,
  };
}

export type MachineExecutionController = ReturnType<typeof useMachineExecution> & {
  checkpoint?: { save(): Promise<string>; restore(text: string): Promise<void> };
};
