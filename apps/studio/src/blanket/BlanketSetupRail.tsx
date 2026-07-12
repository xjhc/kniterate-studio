import { AlertTriangle, CheckCircle2, LoaderCircle } from 'lucide-react';
import type { ProjectState } from '@kniterate-studio/project-contract';
import type { BackFaceProjection } from '@kniterate-studio/machine-lib/browser';
import type { BlanketCompileState } from './useBlanketCompiler';

const techniques = [
  ['fairisle', 'Fairisle'],
  ['ladder-back', 'Ladder'],
  ['lined', 'Lined'],
  ['birdseye', 'Birdseye'],
  ['complement', 'Complement'],
] as const;

function BackFaceMini({ projection, palette }: { projection: BackFaceProjection | null | undefined; palette: ProjectState['chart']['palette'] }) {
  if (!projection) return <span className="back-mini pending" />;
  const rowStep = Math.max(1, Math.ceil(projection.height / 4));
  const columnStep = Math.max(1, Math.ceil(projection.width / 8));
  const sampled = projection.cells.filter((_row, index) => index % rowStep === 0).slice(0, 4).flatMap((row) => row.filter((_cell, index) => index % columnStep === 0).slice(0, 8));
  return <span className="back-mini" style={{ gridTemplateColumns: `repeat(${Math.min(8, Math.ceil(projection.width / columnStep))}, 1fr)` }}>{sampled.map((cell, index) => <i className={cell.kind} style={{ background: cell.paletteIndexes.length ? palette[cell.paletteIndexes[0]!]?.hex : 'transparent' }} key={index} />)}</span>;
}

export function BlanketSetupRail({ state, compile, onWidth, onHeight, onNeedleOffset, onStrategy, onAssignment, onFrame }: {
  state: ProjectState;
  compile: BlanketCompileState;
  onWidth: (width: number) => void;
  onHeight: (height: number) => void;
  onNeedleOffset: (offset: number) => void;
  onStrategy: (technique: ProjectState['strategy']['technique']) => void;
  onAssignment: (paletteId: string, carrier: '2' | '3' | '4' | '5', yarnName: string) => void;
  onFrame: (frame: ProjectState['frame']) => void;
}) {
  const assignmentFor = (paletteId: string) => state.machine.yarnAssignments.find((item) => item.paletteId === paletteId);
  const verdict = compile.status === 'failed' || compile.artifact?.verdict === 'blocked' ? 'Blocked'
    : compile.status === 'ready' ? 'Surface-proven' : 'Compiling';
  const selectedPassCount = compile.comparisons.find((item) => item.technique === state.strategy.technique)?.passCount ?? compile.artifact?.stats.passCount ?? null;
  return <aside className="blanket-setup" aria-label="Blanket setup">
    <div className={`compile-verdict ${verdict.toLowerCase().replace('-', '')}`}>
      {verdict === 'Compiling' ? <LoaderCircle size={15} className="spin" /> : verdict === 'Blocked' ? <AlertTriangle size={15} /> : <CheckCircle2 size={15} />}
      <strong>{verdict}</strong>
    </div>
    <section><h2>Rectangle</h2><div className="setup-pair">
      <label>Needles<input type="number" min="1" max="252" defaultValue={state.chart.width} key={`w${state.chart.width}`} onBlur={(event) => onWidth(Number(event.currentTarget.value))} /></label>
      <label>Rows<input type="number" min="1" defaultValue={state.chart.height} key={`h${state.chart.height}`} onBlur={(event) => onHeight(Number(event.currentTarget.value))} /></label>
    </div><label>First needle<input type="number" min="1" max={253 - state.chart.width} defaultValue={state.machine.needleOffset} key={`n${state.machine.needleOffset}`} onBlur={(event) => onNeedleOffset(Number(event.currentTarget.value))} /></label></section>
    <section><h2>Backing</h2><div className="strategy-segments">{techniques.map(([id, label]) => {
      const comparison = compile.comparisons.find((item) => item.technique === id);
      const delta = comparison && selectedPassCount !== null ? comparison.passCount - selectedPassCount : null;
      return <button type="button" className={state.strategy.technique === id ? 'active' : ''} key={id} onClick={() => onStrategy(id)}><BackFaceMini projection={comparison?.backFace} palette={state.chart.palette} /><span><b>{label}</b><small>{comparison?.verdict === 'blocked' ? 'Blocked' : delta === null ? 'Calculating' : `${delta >= 0 ? '+' : ''}${delta.toLocaleString()} passes · ${Math.ceil((comparison?.estimatedKnitTimeSeconds ?? 0) / 60)} min`}</small></span></button>;
    })}</div></section>
    <section><h2>Pattern yarns</h2><div className="assignment-list">{state.chart.palette.map((color) => {
      const assignment = assignmentFor(color.id);
      if (!assignment) return <div className="assignment-row missing" key={color.id}><i style={{ background: color.hex }} /><span>{color.name}</span><b>Unassigned</b></div>;
      return <div className="assignment-row" key={color.id}><i style={{ background: color.hex }} /><input aria-label={`${color.name} yarn name`} defaultValue={assignment.yarnName} key={`${color.id}-${assignment.yarnName}`} onBlur={(event) => onAssignment(color.id, assignment.carrier, event.currentTarget.value.trim() || color.name)} /><select aria-label={`${color.name} carrier`} value={assignment.carrier} onChange={(event) => onAssignment(color.id, event.currentTarget.value as '2' | '3' | '4' | '5', assignment.yarnName)}>{(['2', '3', '4', '5'] as const).map((carrier) => <option key={carrier} value={carrier} disabled={state.machine.yarnAssignments.some((item) => item.paletteId !== color.id && item.carrier === carrier)}>C{carrier}</option>)}</select></div>;
    })}</div></section>
    <section><h2>Frame</h2><label>Waste rows<input type="number" min="1" max="200" defaultValue={state.frame.wasteRows} key={`f${state.frame.wasteRows}`} onBlur={(event) => onFrame({ ...state.frame, wasteRows: Number(event.currentTarget.value) })} /></label><label className="check-label"><input type="checkbox" checked={state.frame.drawThread} onChange={(event) => onFrame({ ...state.frame, drawThread: event.currentTarget.checked })} /> Draw thread on C1</label><label>Finish<select value={state.frame.bindOff} onChange={(event) => onFrame({ ...state.frame, bindOff: event.currentTarget.value as ProjectState['frame']['bindOff'] })}><option value="machine-bindoff">Machine bind-off</option><option value="waste-and-drop">Waste and drop</option></select></label></section>
    {compile.artifact && <section className="compile-stats"><h2>Machine estimate</h2><dl><dt>Passes</dt><dd>{compile.artifact.stats.passCount.toLocaleString()}</dd><dt>Operations</dt><dd>{compile.artifact.stats.opCount.toLocaleString()}</dd><dt>Time</dt><dd>{compile.artifact.stats.estimatedKnitTimeSeconds === null ? '-' : `${Math.ceil(compile.artifact.stats.estimatedKnitTimeSeconds / 60)} min`}</dd></dl></section>}
    {(compile.error || compile.artifact?.messages.find((message) => message.severity === 'error')) && <p className="setup-error">{compile.error ?? compile.artifact?.messages.find((message) => message.severity === 'error')?.message}</p>}
  </aside>;
}
