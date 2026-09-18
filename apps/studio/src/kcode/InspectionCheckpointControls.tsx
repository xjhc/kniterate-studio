import { useEffect, useRef, useState } from 'react';
import { CHECKPOINT_MAX_BYTES } from '../machine/inspectionCheckpoint';
import type { MachineExecutionController } from './useMachineExecution';

export function InspectionCheckpointControls({ execution, pause }: { execution: MachineExecutionController; pause: () => void }) {
  const input = useRef<HTMLInputElement>(null);
  const owner = useRef(execution.index);
  owner.current = execution.index;
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  useEffect(() => { setBusy(false); setMessage(null); }, [execution.index]);
  if (!execution.checkpoint) return null;
  const run = async (operation: () => Promise<string>) => {
    const index = execution.index;
    pause(); setBusy(true); setMessage(null);
    try { const result = await operation(); if (owner.current === index) setMessage(result); }
    catch (error) { if (owner.current === index) setMessage(error instanceof Error ? error.message : String(error)); }
    finally { if (owner.current === index) setBusy(false); }
  };
  return <div className="inspection-checkpoint">
    <div className="execution-buttons">
      <button type="button" disabled={busy || execution.pending} onClick={() => void run(async () => {
        const text = await execution.checkpoint!.save();
        if (owner.current !== execution.index) return 'Inspection changed.';
        const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
        const link = document.createElement('a'); link.href = url; link.download = 'inspection.checkpoint.json'; link.click();
        window.setTimeout(() => URL.revokeObjectURL(url), 1000);
        return 'Inspection checkpoint saved.';
      })}>Save inspection</button>
      <button type="button" disabled={busy || execution.pending} onClick={() => { pause(); input.current?.click(); }}>Load inspection</button>
      <input ref={input} aria-label="Inspection checkpoint file" type="file" accept=".json,application/json" hidden onChange={(event) => {
        const file = event.currentTarget.files?.[0]; event.currentTarget.value = '';
        if (file) void run(async () => {
          if (file.size > CHECKPOINT_MAX_BYTES) throw new Error('Inspection checkpoint exceeds 64 KiB.');
          await execution.checkpoint!.restore(await file.text());
          return 'Inspection restored from the exact KCode.';
        });
      }} />
      <small>Restores cursor and breakpoints. Machine restart is not supported.</small>
    </div>
    {message && <p role="status">{message}</p>}
  </div>;
}
