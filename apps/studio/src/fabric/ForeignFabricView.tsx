import { AlertTriangle, LoaderCircle, Network } from 'lucide-react';
import type { MachineDocument } from '../engine';
import { useForeignFabricPreview, type ForeignFabricPreviewState } from './useForeignFabricPreview';

const CARRIER_COLORS: Readonly<Record<string, string>> = {
  '1': '#d95d48', '2': '#33866a', '3': '#d49b32', '4': '#4e75b8', '5': '#9b60a8', '6': '#67584c',
};

export function FabricPreviewPanel({ state }: { state: ForeignFabricPreviewState }) {
  if (state.status === 'blocked') return <section className="fabric-state fabric-blocked">
    <AlertTriangle size={22} />
    <div><strong>Topology preview withheld</strong><p>{state.reason}</p><small>A Blocked file cannot acquire a visual surface that looks more trustworthy than its verdict.</small></div>
  </section>;
  if (state.status === 'projecting') return <section className="fabric-state fabric-projecting">
    <LoaderCircle size={22} aria-hidden="true" /><div><strong>Projecting loop topology off-thread</strong><p>Building bounded loop identities, yarn edges, transfers, and schematic mesh.</p></div>
  </section>;
  if (state.status === 'failed') return <section className="fabric-state fabric-blocked">
    <AlertTriangle size={22} /><div><strong>Topology preview unavailable</strong><p>{state.error}</p><small>{state.passIndex === null ? state.code : `${state.code} · pass ${state.passIndex + 1}`}</small></div>
  </section>;

  const { mesh, summary } = state;
  return <section className="fabric-preview" aria-label="Schematic loop topology preview">
    <div className="fabric-evidence">
      <div><Network size={19} /><span><b>Surface-proven topology</b><small>Schematic software projection · not physical fabric</small></span></div>
      <dl>
        <div><dt>Loops</dt><dd>{summary.loopCount.toLocaleString()}</dd></div>
        <div><dt>Live</dt><dd>{summary.liveLoopCount.toLocaleString()}</dd></div>
        <div><dt>Consumed</dt><dd>{summary.consumedLoopCount.toLocaleString()}</dd></div>
        <div><dt>Dropped</dt><dd>{summary.droppedLoopCount.toLocaleString()}</dd></div>
        <div><dt>Transfers</dt><dd>{summary.transferMovementCount.toLocaleString()}</dd></div>
      </dl>
      <p>Coordinates are normalized MachineTrace values, not physical needle labels. Carrier entry/exit is unknown because KCode does not encode lifecycle. Geometry shows proven software connectivity only; it does not predict yarn tension, stitch shape, drape, or machine-produced appearance.</p>
    </div>
    <div className="fabric-canvas" tabIndex={0} aria-label="Scrollable topology mesh">
      {mesh.nodes.length === 0 ? <p>No loop-forming actions are present.</p> : <svg width={mesh.width} height={mesh.height} viewBox={`0 0 ${mesh.width} ${mesh.height}`} role="img" aria-label={`${mesh.nodes.length} projected loops and ${mesh.edges.length} topology edges`}>
        <g className="fabric-movements">{mesh.movements.map((movement, index) => <line key={`${movement.loopId}-${movement.passIndex}-${index}`} x1={movement.x1} y1={movement.y} x2={movement.x2} y2={movement.y} />)}</g>
        <g className="fabric-edges">{mesh.edges.map((edge, index) => <line className={`edge-${edge.kind}`} key={`${edge.fromLoopId}-${edge.toLoopId}-${index}`} x1={edge.x1} y1={edge.y1} x2={edge.x2} y2={edge.y2} style={edge.carrier === null ? undefined : { stroke: CARRIER_COLORS[edge.carrier] }} />)}</g>
        <g className="fabric-nodes">{mesh.nodes.map((node) => <circle className={`bed-${node.bed} status-${node.status} creation-${node.creation}`} key={node.loopId} cx={node.x} cy={node.y} r={node.creation === 'tuck' ? 3.4 : 3} style={{ fill: CARRIER_COLORS[node.carrier] }}><title>{`Loop ${node.loopId + 1}: ${node.creation}, carrier ${node.carrier}, ${node.bed} K${node.traceCoordinate}, pass ${node.passIndex + 1}, ${node.status}`}</title></circle>)}</g>
      </svg>}
    </div>
  </section>;
}

export function ForeignFabricView({ document }: { document: MachineDocument }) {
  const trace = document.kcode?.trace ?? null;
  const eligible = document.verdict.state === 'surface'
    && trace !== null
    && document.kcode?.validation?.ok === true;
  const reason = document.verdict.state === 'blocked'
    ? document.verdict.annotation
    : trace === null
      ? 'No strict KCode trace is available for topology projection.'
      : 'The strict trace did not pass its validation boundary.';
  const state = useForeignFabricPreview(trace, eligible, reason);
  return <FabricPreviewPanel state={state} />;
}
