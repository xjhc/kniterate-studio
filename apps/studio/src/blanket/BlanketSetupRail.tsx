import type { ReactNode } from 'react';
import { AUTHORED_CAPACITY_LIMITS_V1, type ProjectState } from '@kniterate-studio/project-contract';
import type { BackFaceProjection } from '@kniterate-studio/machine-lib/browser';
import type { BlanketCompileState } from './useBlanketCompiler';

// Only backings with a Customist-matched reference program are authored.
const techniques = [
  ['fairisle', 'Fairisle'],
  ['birdseye', 'Birdseye'],
] as const;

const BIND_OFF_LABELS: Record<string, string> = {
  'fairisle-park-bindoff': 'Closing waste + park-out',
  'knit-off': 'Knit off (top gathered by hand)',
  'machine-bindoff': 'Machine bind-off',
  'waste-and-drop': 'Waste and drop',
};

function BackFaceMini({ projection, palette }: { projection: BackFaceProjection | null | undefined; palette: ProjectState['chart']['palette'] }) {
  if (!projection) return <span className="back-mini pending" />;
  const rowStep = Math.max(1, Math.ceil(projection.height / 4));
  const columnStep = Math.max(1, Math.ceil(projection.width / 8));
  const sampled = projection.cells.filter((_row, index) => index % rowStep === 0).slice(0, 4).flatMap((row) => row.filter((_cell, index) => index % columnStep === 0).slice(0, 8));
  return <span className="back-mini" style={{ gridTemplateColumns: `repeat(${Math.min(8, Math.ceil(projection.width / columnStep))}, 1fr)` }}>{sampled.map((cell, index) => <i className={cell.kind} style={{ background: cell.paletteIndexes.length ? palette[cell.paletteIndexes[0]!]?.hex : 'transparent' }} key={index} />)}</span>;
}

const BACKING_HELP: Record<string, string> = {
  fairisle: 'Unused colors float behind the work. Light; floats over the limit, and colors idle for many rows, are not ready to knit.',
  birdseye: 'Every color knits its share of the back on every row: no long floats, so logos and thin lines work. Thicker and warmer; measure the gauge on birdseye fabric.',
};

export function BlanketSetupRail({ state, compile, outputError, mobileActive = false, readiness, garment, onWidth, onHeight, onNeedleOffset, onStrategy, onFloatLimit, onAssignment }: {
  state: ProjectState;
  compile: BlanketCompileState;
  outputError: string | null;
  mobileActive?: boolean;
  onWidth: (width: number) => void;
  onHeight: (height: number) => void;
  onNeedleOffset: (offset: number) => void;
  onStrategy: (technique: ProjectState['strategy']['technique']) => void;
  onFloatLimit: (limit: number) => void;
  onAssignment: (paletteId: string, carrier: '2' | '3' | '4' | '5', yarnName: string) => void;
  /** The readiness story, shown first. */
  readiness?: ReactNode;
  /** Garment intent (fit, motifs, trials); replaces the rectangle's raw needle and row fields. */
  garment?: ReactNode;
}) {
  const assignmentFor = (paletteId: string) => state.machine.yarnAssignments.find((item) => item.paletteId === paletteId);
  const selectedPassCount = compile.comparisons.find((item) => item.technique === state.strategy.technique)?.passCount ?? compile.artifact?.stats.passCount ?? null;
  return <aside className={`target-column blanket-setup${mobileActive ? ' mobile-active' : ''}`} aria-label="Blanket setup">
    <header className="target-column-head">
      <div className="target-column-title"><span className="eyebrow">Compiler intent</span><strong>Strategy</strong></div>
    </header>
    <div className="strategy-body">
    {readiness}
    {garment}
    <section id="backing" tabIndex={-1}><h2>Backing</h2><div className="strategy-segments">{techniques.map(([id, label]) => {
      const comparison = compile.comparisons.find((item) => item.technique === id);
      const selected = state.strategy.technique === id;
      const delta = comparison && selectedPassCount !== null ? comparison.passCount - selectedPassCount : null;
      // The selected backing states the plan totals; alternatives state their difference from it.
      const passes = selected ? selectedPassCount?.toLocaleString() ?? null : delta === null ? null : `${delta >= 0 ? '+' : ''}${delta.toLocaleString()}`;
      const minutes = selected ? compile.artifact?.stats.estimatedKnitTimeSeconds ?? comparison?.estimatedKnitTimeSeconds : comparison?.estimatedKnitTimeSeconds;
      const blocked = selected ? compile.status === 'failed' || compile.artifact?.compileVerdict === 'blocked' : comparison?.compileVerdict === 'blocked';
      return <button type="button" className={selected ? 'active' : ''} key={id} onClick={() => onStrategy(id)}><BackFaceMini projection={comparison?.backFace} palette={state.chart.palette} /><span><b>{label}</b><small>{blocked ? 'Blocked' : passes === null ? 'Calculating' : `${passes} passes${minutes == null ? '' : ` · ${Math.ceil(minutes / 60)} min`}`}</small></span></button>;
    })}</div>{garment && <p className="garment-help">{BACKING_HELP[state.strategy.technique]}</p>}{state.strategy.technique === 'fairisle' && <label className="strategy-field"><span>Float budget</span><input type="number" min="1" max="30" defaultValue={state.strategy.floatLimit} key={`float-${state.strategy.floatLimit}`} onBlur={(event) => onFloatLimit(Number(event.currentTarget.value))} /></label>}</section>
    {!garment && <section><h2>Rectangle</h2>
      <label className="strategy-field"><span>Needles</span><input type="number" min="1" max={AUTHORED_CAPACITY_LIMITS_V1.chartWidth} defaultValue={state.chart.width} key={`w${state.chart.width}`} onBlur={(event) => onWidth(Number(event.currentTarget.value))} /></label>
      <label className="strategy-field"><span>Rows</span><input type="number" min="1" max={AUTHORED_CAPACITY_LIMITS_V1.chartHeight} defaultValue={state.chart.height} key={`h${state.chart.height}`} onBlur={(event) => onHeight(Number(event.currentTarget.value))} /></label>
      <label className="strategy-field"><span>First needle</span><input type="number" min="1" max={253 - state.chart.width} defaultValue={state.machine.needleOffset} key={`n${state.machine.needleOffset}`} onBlur={(event) => onNeedleOffset(Number(event.currentTarget.value))} /></label>
    </section>}
    <section id="yarns" tabIndex={-1}><h2>Pattern yarns</h2><div className="assignment-list">{state.chart.palette.map((color) => {
      const assignment = assignmentFor(color.id);
      if (!assignment) return <div className="assignment-row missing" key={color.id}><i style={{ background: color.hex }} /><span>{color.name}</span><b>Unassigned</b></div>;
      return <div className="assignment-row" key={color.id}><i style={{ background: color.hex }} /><input aria-label={`${color.name} yarn name`} defaultValue={assignment.yarnName} key={`${color.id}-${assignment.yarnName}`} onBlur={(event) => onAssignment(color.id, assignment.carrier, event.currentTarget.value.trim() || color.name)} /><select aria-label={`${color.name} carrier`} value={assignment.carrier} onChange={(event) => onAssignment(color.id, event.currentTarget.value as '2' | '3' | '4' | '5', assignment.yarnName)}>{(['2', '3', '4', '5'] as const).map((carrier) => <option key={carrier} value={carrier} disabled={state.machine.yarnAssignments.some((item) => item.paletteId !== color.id && item.carrier === carrier)}>C{carrier}</option>)}</select></div>;
    })}</div></section>
    <section className="frame-summary"><h2>Frame</h2>{compile.artifact?.frame ? <p title={compile.artifact.frame.preset}>
      Matched to Customist {compile.artifact.frame.reference.replace('reference/', '')}. {compile.artifact.frame.wastePasses ?? '-'} waste passes{compile.artifact.frame.wasteCarrier ? ` on C${compile.artifact.frame.wasteCarrier}` : ''}; frame yarn {compile.artifact.frame.frameCarriers.length ? compile.artifact.frame.frameCarriers.map((carrier) => `C${carrier}`).join(', ') : 'none'}; {compile.artifact.frame.bindOff ? (BIND_OFF_LABELS[compile.artifact.frame.bindOff] ?? compile.artifact.frame.bindOff).toLowerCase() : 'no finish'}.
    </p> : <p className="frame-pending">Set by the matched Customist program once the project compiles.</p>}</section>
    {(outputError || compile.error || compile.artifact?.messages.find((message) => message.severity === 'error')) && <p className="setup-error" role="alert">{outputError ?? compile.error ?? compile.artifact?.messages.find((message) => message.severity === 'error')?.message}</p>}
    </div>
  </aside>;
}
