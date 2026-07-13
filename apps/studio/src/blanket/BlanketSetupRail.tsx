import { AlertTriangle, CheckCircle2, LoaderCircle } from 'lucide-react';
import type { ProjectState } from '@kniterate-studio/project-contract';
import type { BackFaceProjection } from '@kniterate-studio/machine-lib/browser';
import type { AuthoredVerdict } from '../engine';
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

export function BlanketSetupRail({ state, compile, outputStatus, outputError, authoredVerdict, mobileActive = false, onWidth, onHeight, onNeedleOffset, onStrategy, onBirdseyeMode, onFloatLimit, onAssignment, onFrame }: {
  state: ProjectState;
  compile: BlanketCompileState;
  outputStatus: 'idle' | 'converting' | 'ready' | 'failed';
  outputError: string | null;
  authoredVerdict: AuthoredVerdict | null;
  mobileActive?: boolean;
  onWidth: (width: number) => void;
  onHeight: (height: number) => void;
  onNeedleOffset: (offset: number) => void;
  onStrategy: (technique: ProjectState['strategy']['technique']) => void;
  onBirdseyeMode: (mode: 'minimal' | 'full') => void;
  onFloatLimit: (limit: number) => void;
  onAssignment: (paletteId: string, carrier: '2' | '3' | '4' | '5', yarnName: string) => void;
  onFrame: (frame: ProjectState['frame']) => void;
}) {
  const assignmentFor = (paletteId: string) => state.machine.yarnAssignments.find((item) => item.paletteId === paletteId);
  const verdict = authoredVerdict?.label ?? (compile.status === 'failed' || compile.artifact?.compileVerdict === 'blocked' ? 'Blocked'
    : compile.status !== 'ready' ? 'Compiling'
    : outputStatus === 'failed' ? 'Output failed'
    : 'Validating output');
  const verdictClass = verdict.toLowerCase().replace(/[^a-z]/g, '');
  const selectedPassCount = compile.comparisons.find((item) => item.technique === state.strategy.technique)?.passCount ?? compile.artifact?.stats.passCount ?? null;
  return <aside className={`target-column blanket-setup${mobileActive ? ' mobile-active' : ''}`} aria-label="Blanket setup">
    <header className="target-column-head">
      <div className="target-column-title"><span className="eyebrow">Compiler intent</span><strong>Strategy</strong></div>
      <span className={`strategy-status compile-verdict ${verdictClass}`} title={authoredVerdict?.annotation} aria-label={`${verdict}${authoredVerdict?.evidenceId ? ' / Exact physical match' : ''}`}>{verdict === 'Compiling' || verdict === 'Validating output' ? <LoaderCircle size={12} className="spin" /> : verdict === 'Blocked' || verdict === 'Output failed' ? <AlertTriangle size={12} /> : <CheckCircle2 size={12} />}{verdict}</span>
    </header>
    <div className="strategy-body">
    <section><h2>Backing</h2><div className="strategy-segments">{techniques.map(([id, label]) => {
      const comparison = compile.comparisons.find((item) => item.technique === id);
      const delta = comparison && selectedPassCount !== null ? comparison.passCount - selectedPassCount : null;
      return <button type="button" className={state.strategy.technique === id ? 'active' : ''} key={id} onClick={() => onStrategy(id)}><BackFaceMini projection={comparison?.backFace} palette={state.chart.palette} /><span><b>{label}</b><small>{comparison?.compileVerdict === 'blocked' ? 'Blocked' : delta === null ? 'Calculating' : `${delta >= 0 ? '+' : ''}${delta.toLocaleString()} passes · ${Math.ceil((comparison?.estimatedKnitTimeSeconds ?? 0) / 60)} min`}</small></span></button>;
    })}</div>{state.strategy.technique === 'fairisle' && <label className="strategy-field"><span>Float budget</span><input type="number" min="1" max="30" defaultValue={state.strategy.floatLimit} key={`float-${state.strategy.floatLimit}`} onBlur={(event) => onFloatLimit(Number(event.currentTarget.value))} /></label>}{state.strategy.technique === 'birdseye' && <label className="strategy-field"><span>Color coverage</span><select value={state.strategy.birdseyeMode ?? 'minimal'} onChange={(event) => onBirdseyeMode(event.currentTarget.value as 'minimal' | 'full')}><option value="minimal">Active colors</option><option value="full">All colors</option></select></label>}</section>
    <section><h2>Rectangle</h2>
      <label className="strategy-field"><span>Needles</span><input type="number" min="1" max="252" defaultValue={state.chart.width} key={`w${state.chart.width}`} onBlur={(event) => onWidth(Number(event.currentTarget.value))} /></label>
      <label className="strategy-field"><span>Rows</span><input type="number" min="1" defaultValue={state.chart.height} key={`h${state.chart.height}`} onBlur={(event) => onHeight(Number(event.currentTarget.value))} /></label>
      <label className="strategy-field"><span>First needle</span><input type="number" min="1" max={253 - state.chart.width} defaultValue={state.machine.needleOffset} key={`n${state.machine.needleOffset}`} onBlur={(event) => onNeedleOffset(Number(event.currentTarget.value))} /></label>
    </section>
    <section><h2>Pattern yarns</h2><div className="assignment-list">{state.chart.palette.map((color) => {
      const assignment = assignmentFor(color.id);
      if (!assignment) return <div className="assignment-row missing" key={color.id}><i style={{ background: color.hex }} /><span>{color.name}</span><b>Unassigned</b></div>;
      return <div className="assignment-row" key={color.id}><i style={{ background: color.hex }} /><input aria-label={`${color.name} yarn name`} defaultValue={assignment.yarnName} key={`${color.id}-${assignment.yarnName}`} onBlur={(event) => onAssignment(color.id, assignment.carrier, event.currentTarget.value.trim() || color.name)} /><select aria-label={`${color.name} carrier`} value={assignment.carrier} onChange={(event) => onAssignment(color.id, event.currentTarget.value as '2' | '3' | '4' | '5', assignment.yarnName)}>{(['2', '3', '4', '5'] as const).map((carrier) => <option key={carrier} value={carrier} disabled={state.machine.yarnAssignments.some((item) => item.paletteId !== color.id && item.carrier === carrier)}>C{carrier}</option>)}</select></div>;
    })}</div></section>
    <section><h2>Frame</h2><label className="strategy-field"><span>Waste rows / C6</span><input aria-label="Waste rows" type="number" min="1" max="200" defaultValue={state.frame.wasteRows} key={`f${state.frame.wasteRows}`} onBlur={(event) => onFrame({ ...state.frame, wasteRows: Number(event.currentTarget.value) })} /></label><label className="strategy-field check-label"><span>Draw thread / C1</span><input type="checkbox" checked={state.frame.drawThread} onChange={(event) => onFrame({ ...state.frame, drawThread: event.currentTarget.checked })} /></label><label className="strategy-field"><span>Finish</span><select value={state.frame.bindOff} onChange={(event) => onFrame({ ...state.frame, bindOff: event.currentTarget.value as ProjectState['frame']['bindOff'] })}><option value="machine-bindoff">Machine bind-off</option><option value="waste-and-drop">Waste and drop</option></select></label></section>
    {compile.artifact && <section className="compile-stats"><h2>Machine estimate</h2><dl><dt>Passes</dt><dd>{compile.artifact.stats.passCount.toLocaleString()}</dd><dt>Operations</dt><dd>{compile.artifact.stats.opCount.toLocaleString()}</dd><dt>Time</dt><dd>{compile.artifact.stats.estimatedKnitTimeSeconds === null ? '-' : `${Math.ceil(compile.artifact.stats.estimatedKnitTimeSeconds / 60)} min`}</dd></dl></section>}
    {(outputError || compile.error || compile.artifact?.messages.find((message) => message.severity === 'error')) && <p className="setup-error" role="alert">{outputError ?? compile.error ?? compile.artifact?.messages.find((message) => message.severity === 'error')?.message}</p>}
    </div>
  </aside>;
}
