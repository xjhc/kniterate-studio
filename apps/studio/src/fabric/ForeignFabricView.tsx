import { useEffect, useState } from 'react';
import { AlertTriangle, LoaderCircle, Network } from 'lucide-react';
import type { MachineTopologyLoopV1, MachineTraceV1 } from '@kniterate-studio/machine-lib/browser';
import type { MachineDocumentView } from '../machine/inspection';
import { machineSession } from '../machine/readMachineFile';
import { useForeignFabricPreview, type ForeignFabricPreviewState } from './useForeignFabricPreview';
import './ForeignFabricView.css';

const CARRIER_COLORS: Readonly<Record<string, string>> = {
  '1': '#d95d48', '2': '#33866a', '3': '#d49b32', '4': '#4e75b8', '5': '#9b60a8', '6': '#67584c',
};
type SelectPass = (passIndex: number, actionIndex?: number) => void;

export function FabricPreviewPanel({ state, selectedPass = 0, onSelect, onLoop, radius = 8, onRadius }: {
  state: ForeignFabricPreviewState;
  selectedPass?: number;
  onSelect?: SelectPass;
  onLoop?: (loopId: number) => void;
  radius?: number;
  onRadius?: (radius: number) => void;
}) {
  const [zoom, setZoom] = useState(1);
  if (state.status === 'blocked') return <section className="fabric-state fabric-blocked">
    <AlertTriangle size={22} />
    <div><strong>Topology preview withheld</strong><p>{state.reason}</p><small>A Blocked file cannot acquire a visual surface that looks more trustworthy than its verdict.</small></div>
  </section>;
  if (state.status === 'projecting') return <section className="fabric-state fabric-projecting">
    <LoaderCircle size={22} aria-hidden="true" /><div><strong>Projecting loop topology off-thread</strong><p>Indexing software loop identities for bounded pass windows.</p></div>
  </section>;
  if (state.status === 'failed') return <section className="fabric-state fabric-blocked">
    <AlertTriangle size={22} /><div><strong>Topology preview unavailable</strong><p>{state.error}</p><small>{state.passIndex === null ? state.code : `${state.code} · pass ${state.passIndex + 1}`}</small></div>
  </section>;

  const { mesh, summary, inspection } = state;
  const loopLink = (loop: MachineTopologyLoopV1) => <button type="button" key={loop.id} onClick={() => { onLoop?.(loop.id); onSelect?.(loop.createdAt.passIndex, loop.createdAt.actionIndex); }}>Loop {loop.id + 1} · P{loop.createdAt.passIndex + 1}</button>;
  return <section className="fabric-preview fabric-window-preview" aria-label="Schematic loop topology preview">
    <div className="fabric-evidence">
      <div><Network size={19} /><span><b>Surface-proven topology</b><small>Schematic software projection · not physical fabric</small></span></div>
      <dl aria-label="Whole program topology totals">
        <div><dt>Total loops</dt><dd>{summary.loopCount.toLocaleString()}</dd></div>
        <div><dt>Final live</dt><dd>{summary.liveLoopCount.toLocaleString()}</dd></div>
        <div><dt>Consumed</dt><dd>{summary.consumedLoopCount.toLocaleString()}</dd></div>
        <div><dt>Dropped</dt><dd>{summary.droppedLoopCount.toLocaleString()}</dd></div>
        <div><dt>Transfers</dt><dd>{summary.transferMovementCount.toLocaleString()}</dd></div>
        <div><dt>Visible loops</dt><dd>{mesh.nodes.length.toLocaleString()}</dd></div>
      </dl>
      <p>Coordinates are normalized MachineTrace values, not physical needle labels. Carrier entry/exit is unknown because KCode does not encode lifecycle. This history graph does not predict yarn tension, stitch shape, drape, or machine-produced appearance. Loop status describes the end of the whole program.</p>
      <section className="fabric-lineage" aria-label="Selected loop lineage">
        <h3>Loop lineage</h3>
        {inspection === null ? <p>Select a loop to inspect its creation, parents, and yarn connection.</p> : <>
          <strong>Loop {inspection.loop.id + 1} · {inspection.loop.creation} · C{inspection.loop.carrier}</strong>
          <p>{inspection.loop.createdAt.location.bed} trace {inspection.loop.createdAt.location.traceCoordinate} · rack {inspection.loop.createdAt.rack}</p>
          <button type="button" onClick={() => onSelect?.(inspection.loop.createdAt.passIndex, inspection.loop.createdAt.actionIndex)}>Creation: P{inspection.loop.createdAt.passIndex + 1}, action {inspection.loop.createdAt.actionIndex + 1}</button>
          {inspection.loop.terminal && <button type="button" onClick={() => onSelect?.(inspection.loop.terminal!.passIndex, inspection.loop.terminal!.actionIndex)}>{inspection.loop.terminal.kind}: P{inspection.loop.terminal.passIndex + 1}, action {inspection.loop.terminal.actionIndex + 1}</button>}
          <h4>Formed through</h4>{inspection.parents.length ? inspection.parents.map(loopLink) : <p>No parent loops in the observed trace.</p>}
          {inspection.heldWith.length > 0 && <><h4>Held together</h4>{inspection.heldWith.map(loopLink)}</>}
          <h4>Previous loop on C{inspection.loop.carrier}</h4>{inspection.previousCarrierLoop ? loopLink(inspection.previousCarrierLoop) : <p>First observed loop; carrier entry is unknown.</p>}
        </>}
      </section>
    </div>
    <div className="fabric-window-main">
      <div className="fabric-window-controls" aria-label="Topology window controls">
        <button type="button" onClick={() => onSelect?.(Math.max(0, state.passStart - 1))} disabled={!onSelect || state.passStart === 0}>Previous window</button>
        <label>Pass <input aria-label="Topology selected pass" type="number" min={1} max={Math.max(1, state.passCount)} value={selectedPass + 1} disabled={!onSelect} onChange={(event) => { const pass = Number(event.target.value); if (Number.isInteger(pass) && pass >= 1 && pass <= state.passCount) onSelect?.(pass - 1); }} /></label>
        <button type="button" onClick={() => onSelect?.(Math.min(state.passCount - 1, state.passEnd + 1))} disabled={!onSelect || state.passEnd >= state.passCount - 1}>Next window</button>
        <label>Context <select aria-label="Topology pass context" value={radius} onChange={(event) => onRadius?.(Number(event.target.value))} disabled={!onRadius}><option value={4}>±4 passes</option><option value={8}>±8 passes</option><option value={16}>±16 passes</option><option value={32}>±32 passes</option></select></label>
        <label>Zoom <select aria-label="Topology zoom" value={zoom} onChange={(event) => setZoom(Number(event.target.value))}><option value={0.5}>50%</option><option value={1}>100%</option><option value={2}>200%</option></select></label>
      </div>
      <p className="fabric-window-note" role="status">Passes {state.passCount === 0 ? 0 : state.passStart + 1}–{state.passCount === 0 ? 0 : state.passEnd + 1} of {state.passCount.toLocaleString()} · {mesh.nodes.length.toLocaleString()} visible loops · {mesh.edges.length.toLocaleString()} visible edges. {state.incomingBoundaryConnections.toLocaleString()} incoming connections start outside this window; lineage links retain their identities. Window size adapts to the 6,000-loop rendering limit.</p>
      <div className="fabric-canvas" tabIndex={0} aria-label="Scrollable topology mesh">
        {mesh.nodes.length === 0 && mesh.movements.length === 0 ? <p>No loop creation or transfer occurs in this pass window. Use the window controls to inspect another part of the program.</p> : <svg width={mesh.width * zoom} height={mesh.height * zoom} viewBox={`0 0 ${mesh.width} ${mesh.height}`} aria-label={`${mesh.nodes.length} projected loops and ${mesh.edges.length} topology edges`}>
          <g className="fabric-movements">{mesh.movements.map((movement, index) => <line key={`${movement.loopId}-${movement.passIndex}-${index}`} x1={movement.x1} y1={movement.y} x2={movement.x2} y2={movement.y}><title>{`Transfer loop ${movement.loopId + 1}, pass ${movement.passIndex + 1}, ${movement.fromBed} to ${movement.toBed}`}</title></line>)}</g>
          <g className="fabric-edges">{mesh.edges.map((edge, index) => <line className={`edge-${edge.kind}`} key={`${edge.fromLoopId}-${edge.toLoopId}-${index}`} x1={edge.x1} y1={edge.y1} x2={edge.x2} y2={edge.y2} style={edge.carrier === null ? undefined : { stroke: CARRIER_COLORS[edge.carrier] }} />)}</g>
          <g className="fabric-nodes">{mesh.nodes.map((node) => {
            const label = `Loop ${node.loopId + 1}: ${node.creation}, carrier ${node.carrier}, ${node.bed} trace ${node.traceCoordinate}, pass ${node.passIndex + 1}, final status ${node.status}`;
            return <circle role="button" tabIndex={0} aria-label={label} aria-pressed={inspection?.loop.id === node.loopId} className={`bed-${node.bed} status-${node.status} creation-${node.creation}${node.passIndex === selectedPass ? ' selected-pass' : ''}`} key={node.loopId} cx={node.x} cy={node.y} r={node.creation === 'tuck' ? 3.4 : 3} style={{ fill: CARRIER_COLORS[node.carrier] }} onClick={() => { onLoop?.(node.loopId); onSelect?.(node.passIndex, node.actionIndex); }} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onLoop?.(node.loopId); onSelect?.(node.passIndex, node.actionIndex); } }}><title>{label}</title></circle>;
          })}</g>
        </svg>}
      </div>
    </div>
  </section>;
}

export interface MachineTopologyViewProps {
  trace: MachineTraceV1 | null;
  eligible: boolean;
  blockedReason: string;
  selectedPass: number | null;
  onSelect: SelectPass;
}

export function MachineTopologyView({ trace, eligible, blockedReason, selectedPass, onSelect }: MachineTopologyViewProps) {
  const [radius, setRadius] = useState(8);
  const [selection, setSelection] = useState<{ trace: MachineTraceV1 | null; loopId: number } | null>(null);
  const loopId = selection?.trace === trace ? selection.loopId : null;
  const state = useForeignFabricPreview(trace, eligible, blockedReason, selectedPass ?? 0, radius, loopId);
  const selectLoop = (id: number) => {
    setSelection({ trace, loopId: id });
  };
  return <FabricPreviewPanel state={state} selectedPass={selectedPass ?? 0} onSelect={onSelect} onLoop={selectLoop} radius={radius} onRadius={setRadius} />;
}

export function ForeignFabricView({ document, selectedPass, onSelect }: { document: MachineDocumentView; selectedPass?: number; onSelect?: SelectPass }) {
  const [localPass, setLocalPass] = useState(0);
  const [radius, setRadius] = useState(8);
  const [selection, setSelection] = useState<{ document: MachineDocumentView; loopId: number } | null>(null);
  const loopId = selection?.document === document ? selection.loopId : null;
  const pass = selectedPass ?? localPass;
  const eligible = document.kcode?.inspection?.topologyEligible === true;
  const [response, setResponse] = useState<{ document: MachineDocumentView; pass: number; radius: number; loopId: number | null; state: ForeignFabricPreviewState } | null>(null);
  useEffect(() => {
    if (!eligible) return;
    let active = true;
    void machineSession(document).topology({ requestId: 0, selectedPass: pass, radius, loopId }).then((result) => {
      if (!active) return;
      const state: ForeignFabricPreviewState = result.kind === 'foreign-topology-complete'
        ? { status: 'ready', ...result }
        : { status: 'failed', code: result.code, error: result.error, passIndex: result.passIndex };
      setResponse({ document, pass, radius, loopId, state });
    }, (error) => {
      if (active) setResponse({ document, pass, radius, loopId, state: { status: 'failed', code: 'worker-error', error: error instanceof Error ? error.message : String(error), passIndex: null } });
    });
    return () => { active = false; };
  }, [document, eligible, pass, radius, loopId]);
  const state: ForeignFabricPreviewState = !eligible
    ? { status: 'blocked', reason: document.verdict.annotation }
    : response?.document === document && response.pass === pass && response.radius === radius && response.loopId === loopId
      ? response.state : { status: 'projecting' };
  return <FabricPreviewPanel state={state} selectedPass={pass} onSelect={onSelect ?? setLocalPass} radius={radius} onRadius={setRadius} onLoop={(id) => setSelection({ document, loopId: id })} />;
}
