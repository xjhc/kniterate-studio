import { useEffect, useState } from 'react';
import type { MachineExecutionController, ExecutionSnapshot } from './useMachineExecution';
import './ExecutionControls.css';

function eventLabel(snapshot: ExecutionSnapshot | null): string {
  const event = snapshot?.event;
  if (!event) return 'Before the first event';
  if (event.kind === 'rack') return `${event.passIndex === null ? 'After final pass · ' : ''}Rack ${event.fromRack} → ${event.toRack}`;
  if (event.kind === 'action') return `Pass ${(event.passIndex ?? 0) + 1} · action ${(event.actionIndex ?? 0) + 1} · ${event.action.kind}`;
  return `Pass ${(event.passIndex ?? 0) + 1} · ${event.kind === 'pass-begin' ? 'before actions' : 'after actions'}`;
}

export function ExecutionControls({ execution, findings }: {
  execution: MachineExecutionController;
  findings: readonly { passIndex: number | null; actionIndex?: number | null }[];
}) {
  const { index, eventIndex, snapshot, selectEvent, breakpoints, toggleBreakpoint } = execution;
  const [playing, setPlaying] = useState(false);
  const [rate, setRate] = useState(4);
  useEffect(() => { setPlaying(false); }, [index]);
  useEffect(() => {
    if (!playing || !index) return;
    if (eventIndex >= index.events.length - 1) { setPlaying(false); return; }
    const timeout = window.setTimeout(() => {
      const next = eventIndex + 1;
      selectEvent(next);
      if (breakpoints.has(next)) setPlaying(false);
    }, 1000 / rate);
    return () => window.clearTimeout(timeout);
  }, [playing, index, eventIndex, breakpoints, rate, selectEvent]);
  if (!index) return <div className="execution-loading" role="status">{execution.error ?? (execution.pending ? 'Preparing execution inspection…' : 'Execution inspection unavailable.')}</div>;
  const jump = (next: number) => { setPlaying(false); selectEvent(next); };
  const nextFinding = findings.flatMap((finding) => {
    const pass = index.passes.find((pass) => pass.passIndex === finding.passIndex);
    return pass ? [finding.actionIndex == null ? pass.beginEventIndex : pass.actionEventIndices[finding.actionIndex] ?? pass.beginEventIndex] : [];
  }).filter((position) => position > eventIndex).sort((a, b) => a - b)[0];
  return <section className="execution-controls" aria-label="Execution controls">
    <div className="execution-buttons">
      <button type="button" aria-label="Previous event" disabled={eventIndex < 0} onClick={() => jump(eventIndex - 1)}>← Event</button>
      <button type="button" aria-label={playing ? 'Pause playback' : 'Play programmed sequence'} disabled={eventIndex >= index.events.length - 1} onClick={() => setPlaying(!playing)}>{playing ? 'Pause' : 'Play'}</button>
      <button type="button" aria-label="Next event" disabled={eventIndex >= index.events.length - 1} onClick={() => jump(eventIndex + 1)}>Event →</button>
      <label>Playback <select aria-label="Playback rate" value={rate} onChange={(event) => setRate(Number(event.target.value))}><option value={1}>1 event/s</option><option value={4}>4 events/s</option><option value={12}>12 events/s</option></select></label>
      <label>Pass <input aria-label="Jump to pass" type="number" min={1} max={index.passes.length} value={execution.selectedPass + 1} onChange={(event) => { const pass = index.passes[Number(event.target.value) - 1]; if (pass) jump(pass.beginEventIndex); }} /></label>
      <button type="button" disabled={nextFinding === undefined} onClick={() => { if (nextFinding !== undefined) jump(nextFinding); }}>Next finding</button>
      <button type="button" disabled={eventIndex < 0} aria-pressed={breakpoints.has(eventIndex)} onClick={() => toggleBreakpoint(eventIndex)}>{breakpoints.has(eventIndex) ? 'Remove breakpoint' : 'Set breakpoint'}</button>
    </div>
    <label className="execution-scrubber"><span>Event {eventIndex + 1} / {index.events.length.toLocaleString()}</span><input aria-label="Execution event" type="range" min={-1} max={index.events.length - 1} value={eventIndex} onChange={(event) => jump(Number(event.target.value))} /></label>
    <div className="execution-current"><strong>{eventLabel(snapshot)}</strong><span>{snapshot?.event ? `KCode line ${snapshot.event.sourceSpan.start.line}` : 'Empty-bed initial state'}</span><small>Playback follows programmed order; its rate is not machine time.</small></div>
    {breakpoints.size > 0 && <div className="execution-breakpoints" aria-label="Breakpoints">{[...breakpoints].sort((a, b) => a - b).map((position) => <button type="button" key={position} onClick={() => jump(position)}>Event {position + 1}</button>)}</div>}
  </section>;
}

export function ExecutionState({ snapshot }: { snapshot: ExecutionSnapshot }) {
  return <section className="execution-state" aria-label="Machine state at cursor">
    <div className="execution-state-head"><strong>State at cursor</strong><span>Rack {snapshot.rack}</span><span>Carriage stop {snapshot.carriage.coordinate ?? 'unknown'}</span></div>
    <div className="execution-carriers" aria-label="Last known carrier stops">{snapshot.carriers.map((carrier) => <span key={carrier.carrier}><b>C{carrier.carrier}</b>{carrier.coordinate === null ? 'Unknown' : `K${carrier.coordinate}`}</span>)}</div>
    <p>Stops are last encoded observations. Carrier attachment and motion between stops remain unknown.</p>
    {snapshot.loopState ? <>
      <div className="execution-bed-summary">{snapshot.loopState.totalLoops} modeled loops · {snapshot.loopState.occupiedNeedles} occupied needles</div>
      {(['front', 'rear'] as const).map((bed) => <div className={`execution-bed ${bed}`} key={bed}><strong>{bed === 'front' ? 'Front bed' : 'Rear bed'}</strong><div>{snapshot.loopState![bed].length === 0 ? <span>Empty</span> : snapshot.loopState![bed].map((cell) => <span key={cell.traceCoordinate} title={`${bed} trace coordinate ${cell.traceCoordinate}, ${cell.count} loops`}><b>{cell.traceCoordinate}</b><i>{cell.count}</i></span>)}</div></div>)}
    </> : <p role="status">Loop state withheld because replay is blocked.</p>}
  </section>;
}
