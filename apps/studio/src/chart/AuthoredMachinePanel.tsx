import { AlertTriangle, CheckCircle2, CircleAlert } from 'lucide-react';
import { useMemo, type CSSProperties } from 'react';
import type { BlanketCompileArtifact } from '../blanket/compileProject';

export type ProgramRegion = 'waste' | 'draw' | 'body' | 'finish';

const CARRIER_COLORS: Record<string, string> = {
  '1': '#d95d48', '2': '#33866a', '3': '#d49b32', '4': '#4e75b8', '5': '#9b60a8', '6': '#b65378',
};

export function programRegionsForArtifact(artifact: BlanketCompileArtifact): readonly ProgramRegion[] {
  const bodyIndices = artifact.passes.flatMap((item, passIndex) => (item.sourceRows?.length ?? 0) > 0 ? [passIndex] : []);
  const firstBody = bodyIndices[0] ?? artifact.passes.length;
  const lastBody = bodyIndices.at(-1) ?? -1;
  return artifact.passes.map((pass, index) => {
    if (bodyIndices.length === 0) return pass.carriers.includes('1') ? 'draw' : 'waste';
    if (index >= firstBody && index <= lastBody) return 'body';
    if (index > lastBody) return 'finish';
    if (pass.carriers.includes('1')) return 'draw';
    return 'waste';
  });
}

export function programRegionForPass(artifact: BlanketCompileArtifact, index: number): ProgramRegion {
  return programRegionsForArtifact(artifact)[index] ?? 'body';
}

function labelForRegion(region: ProgramRegion): string {
  return region === 'waste' ? 'Waste yarn' : region === 'draw' ? 'Draw thread' : region === 'body' ? 'Blanket body' : 'Finish';
}

export function AuthoredMachinePanel({ artifact, focusedRowId, selectedPass, region, onRegion, onPass, mobileActive }: {
  artifact: BlanketCompileArtifact | null;
  focusedRowId: string | null;
  selectedPass: number | null;
  region: ProgramRegion;
  onRegion: (region: ProgramRegion) => void;
  onPass: (index: number) => void;
  mobileActive: boolean;
}) {
  const passRegions = useMemo(() => artifact ? programRegionsForArtifact(artifact) : [], [artifact]);
  const row = artifact?.rowProvenance.find((item) => item.rowId === focusedRowId) ?? null;
  const regionPasses = artifact ? artifact.passes.flatMap((pass, index) => passRegions[index] === region ? [{ pass, index }] : []) : [];
  const visiblePasses = region === 'body' && row
    ? row.passIndices.flatMap((index) => artifact?.passes[index] ? [{ pass: artifact.passes[index]!, index }] : [])
    : regionPasses;
  const visibleIndices = new Set(visiblePasses.map((item) => item.index));
  const diagnostic = artifact?.diagnostics.find((item) => item.passIndices.some((index) => visibleIndices.has(index)))
    ?? artifact?.diagnostics.find((item) => item.passIndices.length === 0)
    ?? null;
  const regions: ProgramRegion[] = ['waste', 'draw', 'body', 'finish'];

  return <aside className={`target-column authored-machine${mobileActive ? ' mobile-active' : ''}`} aria-label="Machine truth">
    <header className="target-column-head">
      <div className="target-column-title"><span className="eyebrow">Machine truth</span><strong>Passes</strong></div>
      <span className="target-meta">{artifact ? region === 'body' && row ? `design row ${row.displayRow} x${visiblePasses.length}` : `${labelForRegion(region)} / ${visiblePasses.length}` : 'compiling'}</span>
    </header>
    <div className="authored-pass-area">
      <div className="program-map" aria-label="Machine program regions">
        {regions.map((item) => {
          const count = passRegions.filter((passRegion) => passRegion === item).length;
          const carrier = item === 'waste' ? 'C6' : item === 'draw' ? 'C1' : item === 'body' ? `${artifact?.stats.designRows ?? 0} rows` : 'bind-off';
          return <button type="button" className={`program-region ${item}${region === item ? ' active' : ''}`} key={item} onClick={() => onRegion(item)} aria-pressed={region === item}>
            <b>{labelForRegion(item)}</b><small>{count.toLocaleString()} passes / {carrier}</small>
          </button>;
        })}
      </div>
      <div className="authored-pass-head" aria-hidden="true"><span>Pass</span><span>Dir</span><span>Carrier</span><span>Action</span><span>Speed</span><span>Design</span></div>
      <div className="authored-pass-list">
        {visiblePasses.length === 0 ? <p className="empty-passes">{artifact ? region === 'draw' ? 'Draw thread is not enabled.' : 'No passes generated for this region.' : 'Waiting for compiler output.'}</p> : visiblePasses.map(({ pass, index }) => {
          const design = pass.sourceRows?.length ? pass.sourceRows.map((machineRow) => {
            const provenance = artifact?.rowProvenance.find((item) => item.chartRow === (artifact.stats.designRows - machineRow - 1));
            return provenance ? `R${provenance.displayRow}` : `R${machineRow + 1}`;
          }).join(', ') : labelForRegion(passRegions[index] ?? region);
          return <button type="button" className={`authored-pass-row${selectedPass === index ? ' active' : ''}`} key={index} onClick={() => onPass(index)} aria-pressed={selectedPass === index}>
            <span className="pass-number">{index + 1}</span><span className="pass-direction">{pass.direction}</span>
            <span>{pass.carriers.length ? pass.carriers.map((carrier) => <i className="carrier-chip" style={{ '--carrier': CARRIER_COLORS[carrier] } as CSSProperties} key={carrier}>C{carrier}</i>) : <em>-</em>}</span>
            <code>{pass.type}</code><span>{pass.speed}</span><span className="row-ref">{design}</span>
          </button>;
        })}
      </div>
    </div>
    <div className="authored-diagnostic" role="status" aria-live="polite">
      {!artifact ? <div className="diagnostic-line"><span className="spin-dot" /><span><b>Compiling machine plan</b><small>The pass view updates from the current project revision.</small></span></div>
        : diagnostic ? <div className={`diagnostic-line ${diagnostic.severity === 'error' ? 'blocked' : 'warning'}`}>{diagnostic.severity === 'error' ? <CircleAlert size={15} /> : <AlertTriangle size={15} />}<span><b>{diagnostic.rule}</b><small>{diagnostic.message}</small></span></div>
          : <div className="diagnostic-line clean"><CheckCircle2 size={15} /><span><b>No findings for this selection</b><small>{region === 'body' && row ? `Design row ${row.displayRow} is joined to ${visiblePasses.length} physical passes.` : `${labelForRegion(region)} passes are present in the compiled program.`}</small></span></div>}
    </div>
  </aside>;
}
