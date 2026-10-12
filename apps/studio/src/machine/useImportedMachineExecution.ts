import { saveInspectionCheckpoint, readInspectionCheckpoint, verifyCheckpointReplay } from './inspectionCheckpoint';
import { useEffect, useRef, useState } from 'react';
import { machineSession } from './readMachineFile';
import type { InspectionCursor, MachineDocumentView, MachineInspection } from './inspection';
import type { MachineExecutionController } from '../kcode/useMachineExecution';

export function useImportedMachineExecution(
  document: MachineDocumentView | null, selectedPass: number,
  onSelect: (pass: number, line: number | null) => void,
): MachineExecutionController & { inspection: MachineInspection | null } {
  const [result, setResult] = useState<{ document: MachineDocumentView; inspection: MachineInspection; pending: boolean; error: string | null } | null>(null);
  const [breakpointState, setBreakpoints] = useState<{ document: MachineDocumentView; events: Set<number> } | null>(null);
  const owner = useRef(document);
  owner.current = document;
  const sequence = useRef(0);
  const initial = document === null ? null : machineSession(document).initial;
  const current = result?.document === document ? result?.inspection ?? initial : initial;
  const inspection = current?.selectedPass === selectedPass ? current : null;
  const index = document?.kcode?.inspection?.navigation ?? null;
  const pending = result?.document === document && result?.pending === true;
  const request = (cursor: InspectionCursor, publish: boolean) => {
    if (!document || !current) return;
    const id = ++sequence.current;
    setResult({ document, inspection: current, pending: true, error: null });
    void machineSession(document).inspect(cursor).then((next) => {
      if (owner.current !== document || sequence.current !== id) return;
      setResult({ document, inspection: next, pending: false, error: null });
      if (publish) onSelect(next.selectedPass, next.sourceLine);
    }, (error) => {
      if (owner.current !== document || sequence.current !== id) return;
      setResult({ document, inspection: current, pending: false, error: error instanceof Error ? error.message : String(error) });
    });
  };
  useEffect(() => {
    if (document && current?.selectedPass !== selectedPass) request({ passIndex: selectedPass }, false);
  }, [document, selectedPass]);
  const breakpoints = breakpointState?.document === document ? breakpointState?.events ?? new Set<number>() : new Set<number>();
  return {
    index, inspection, selectedPass,
    checkpoint: document && index && initial?.scene && document.kcode?.document ? {
      async save() {
        if (!inspection?.snapshot) throw new Error('Wait for execution inspection to finish.');
        return saveInspectionCheckpoint({ source: document.kcode!.document!.rawText, profileId: initial.scene!.profileId, profileVersion: initial.scene!.profileVersion, eventCount: index.eventCount }, inspection.snapshot, breakpoints);
      },
      async restore(text) {
        const id = ++sequence.current;
        const checkpoint = await readInspectionCheckpoint(text, { source: document.kcode!.document!.rawText, profileId: initial.scene!.profileId, profileVersion: initial.scene!.profileVersion, eventCount: index.eventCount });
        const next = await machineSession(document).inspect({ eventIndex: checkpoint.eventIndex });
        verifyCheckpointReplay(checkpoint, next.snapshot);
        if (owner.current !== document || sequence.current !== id) throw new Error('Inspection changed while restoring the checkpoint.');
        setBreakpoints({ document, events: new Set(checkpoint.breakpoints) });
        setResult({ document, inspection: next, pending: false, error: null });
        onSelect(next.selectedPass, next.sourceLine);
      },
    } : undefined,
    snapshot: inspection?.snapshot ?? null,
    eventIndex: inspection?.snapshot?.eventIndex ?? -1,
    pending: pending || (document !== null && inspection === null),
    error: (result?.document === document ? result?.error : null) ?? document?.kcode?.inspection?.error ?? null,
    breakpoints,
    toggleBreakpoint(event) {
      if (!document || !index || event < 0 || event >= index.eventCount) return;
      const events = new Set(breakpoints);
      if (events.has(event)) events.delete(event); else events.add(event);
      setBreakpoints({ document, events });
    },
    selectEvent(eventIndex) {
      if (index) request({ eventIndex: Math.max(-1, Math.min(index.eventCount - 1, eventIndex)) }, true);
    },
    selectAction(passIndex, actionIndex) { request({ passIndex, actionIndex }, true); },
  };
}
