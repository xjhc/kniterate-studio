import type { ReactNode } from 'react';
import type { ProjectState } from '@kniterate-studio/project-contract';
import type { BackFaceProjection } from '@kniterate-studio/machine-lib/browser';
import type { BlanketCompileState } from './useBlanketCompiler';
import { Section } from '../workspace/panel';

// Only backings with a Customist-matched reference program are authored.
const techniques = [
  ['fairisle', 'Fairisle'],
  ['birdseye', 'Birdseye'],
] as const;

function BackFaceMini({ projection, palette }: { projection: BackFaceProjection | null | undefined; palette: ProjectState['chart']['palette'] }) {
  if (!projection) return <span className="back-mini pending" />;
  const rowStep = Math.max(1, Math.ceil(projection.height / 4));
  const columnStep = Math.max(1, Math.ceil(projection.width / 8));
  const sampled = projection.cells.filter((_row, index) => index % rowStep === 0).slice(0, 4).flatMap((row) => row.filter((_cell, index) => index % columnStep === 0).slice(0, 8));
  return <span className="back-mini" style={{ gridTemplateColumns: `repeat(${Math.min(8, Math.ceil(projection.width / columnStep))}, 1fr)` }}>{sampled.map((cell, index) => <i className={cell.kind} style={{ background: cell.paletteIndexes.length ? palette[cell.paletteIndexes[0]!]?.hex : 'transparent' }} key={index} />)}</span>;
}

const BACKING_HELP: Record<string, string> = {
  fairisle: 'Light. Unused colours float behind the work.',
  birdseye: 'Thicker and warmer. No long floats, so thin lines and logos work.',
};

export function BlanketSetupRail({ state, compile, outputError, size, onStrategy, onFloatLimit, onAssignment }: {
  state: ProjectState;
  compile: BlanketCompileState;
  outputError: string | null;
  onStrategy: (technique: ProjectState['strategy']['technique']) => void;
  onFloatLimit: (limit: number) => void;
  onAssignment: (paletteId: string, carrier: '2' | '3' | '4' | '5', yarnName: string) => void;
  /** What you are making: its size and swatch, and a garment's fit and motifs. */
  size: ReactNode;
}) {
  const assignmentFor = (paletteId: string) => state.machine.yarnAssignments.find((item) => item.paletteId === paletteId);
  const error = outputError ?? compile.error ?? compile.artifact?.messages.find((message) => message.severity === 'error')?.message ?? null;
  return <aside className="sweater-design chart-design" aria-label="Design">
    {size}
    <Section id="yarns" title="Colours" aside={<em className="section-aside">{state.chart.palette.length}</em>}><div className="assignment-list">{state.chart.palette.map((color) => {
      const assignment = assignmentFor(color.id);
      if (!assignment) return <div className="assignment-row missing" key={color.id}><i style={{ background: color.hex }} /><span>{color.name}</span><b>No carrier</b></div>;
      return <div className="assignment-row" key={color.id}><i style={{ background: color.hex }} /><input aria-label={`${color.name} yarn name`} defaultValue={assignment.yarnName} key={`${color.id}-${assignment.yarnName}`} onBlur={(event) => onAssignment(color.id, assignment.carrier, event.currentTarget.value.trim() || color.name)} /><select aria-label={`${color.name} carrier`} value={assignment.carrier} onChange={(event) => onAssignment(color.id, event.currentTarget.value as '2' | '3' | '4' | '5', assignment.yarnName)}>{(['2', '3', '4', '5'] as const).map((carrier) => <option key={carrier} value={carrier} disabled={state.machine.yarnAssignments.some((item) => item.paletteId !== color.id && item.carrier === carrier)}>C{carrier}</option>)}</select></div>;
    })}</div></Section>
    <Section id="backing" title="Backing" aside={<em className="section-aside">{techniques.find(([id]) => id === state.strategy.technique)?.[1] ?? state.strategy.technique}</em>}><div className="strategy-segments">{techniques.map(([id, label]) => {
      const comparison = compile.comparisons.find((item) => item.technique === id);
      const selected = state.strategy.technique === id;
      const minutes = selected ? compile.artifact?.stats.estimatedKnitTimeSeconds ?? comparison?.estimatedKnitTimeSeconds : comparison?.estimatedKnitTimeSeconds;
      const blocked = selected ? compile.status === 'failed' || compile.artifact?.compileVerdict === 'blocked' : comparison?.compileVerdict === 'blocked';
      return <button type="button" className={selected ? 'active' : ''} key={id} onClick={() => onStrategy(id)}><BackFaceMini projection={comparison?.backFace} palette={state.chart.palette} /><span><b>{label}</b><small>{blocked ? 'Cannot knit' : minutes == null ? '…' : `${Math.ceil(minutes / 60)} min`}</small></span></button>;
    })}</div><p className="garment-help">{BACKING_HELP[state.strategy.technique]}</p>{state.strategy.technique === 'fairisle' && <label className="strategy-field"><span>Longest float</span><input type="number" min="1" max="30" defaultValue={state.strategy.floatLimit} key={`float-${state.strategy.floatLimit}`} onBlur={(event) => onFloatLimit(Number(event.currentTarget.value))} /></label>}</Section>
    {error && <p className="setup-error" role="alert">{error}</p>}
  </aside>;
}
