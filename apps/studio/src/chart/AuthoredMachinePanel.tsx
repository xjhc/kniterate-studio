import { AlertTriangle, CheckCircle2, CircleAlert } from 'lucide-react';
import { useMemo, type CSSProperties } from 'react';
import type { BlanketCompileArtifact } from '../blanket/compileProject';
import type { KCodeArtifact } from '../kcode/kcodeProtocol';

export type ProgramRegion = 'waste' | 'draw' | 'body' | 'finish';

const CARRIER_COLORS: Record<string, string> = {
  '1': '#d95d48', '2': '#33866a', '3': '#d49b32', '4': '#4e75b8', '5': '#9b60a8', '6': '#b65378',
};

export function programRegionsForKCode(kcode: KCodeArtifact): readonly ProgramRegion[] {
  const passes = kcode.scene?.passes ?? [];
  const bodyIndices = kcode.passProvenance.flatMap((item) => item.sourceRows.length > 0 ? [item.passIndex] : []);
  const firstBody = bodyIndices[0] ?? passes.length;
  const lastBody = bodyIndices.at(-1) ?? -1;
  return passes.map((pass, index) => {
    if (bodyIndices.length === 0) return pass.carrier === '1' ? 'draw' : 'waste';
    if (index >= firstBody && index <= lastBody) return 'body';
    if (index > lastBody) return 'finish';
    if (pass.carrier === '1') return 'draw';
    return 'waste';
  });
}

export function programRegionForPass(kcode: KCodeArtifact, index: number): ProgramRegion {
  return programRegionsForKCode(kcode)[index] ?? 'body';
}

function labelForRegion(region: ProgramRegion): string {
  return region === 'waste' ? 'Waste yarn' : region === 'draw' ? 'Draw thread' : region === 'body' ? 'Blanket body' : 'Finish';
}

export function AuthoredMachinePanel({ artifact, kcode, outputStatus, outputError, focusedRowId, selectedPass, region, onRegion, onPass, mobileActive }: {
  artifact: BlanketCompileArtifact | null;
  kcode: KCodeArtifact | null;
  outputStatus: 'idle' | 'converting' | 'ready' | 'failed';
  outputError: string | null;
  focusedRowId: string | null;
  selectedPass: number | null;
  region: ProgramRegion;
  onRegion: (region: ProgramRegion) => void;
  onPass: (index: number) => void;
  mobileActive: boolean;
}) {
  const passRegions = useMemo(() => kcode ? programRegionsForKCode(kcode) : [], [kcode]);
  const row = artifact?.rowProvenance.find((item) => item.rowId === focusedRowId) ?? null;
  const exactRow = kcode?.rowPasses.find((item) => item.rowId === focusedRowId) ?? null;
  const passes = kcode?.scene?.passes ?? [];
  const regionPasses = passes.flatMap((pass, index) => passRegions[index] === region ? [{ pass, index }] : []);
  const visiblePasses = region === 'body' && exactRow
    ? exactRow.passIndices.flatMap((index) => passes[index] ? [{ pass: passes[index]!, index }] : [])
    : regionPasses;
  const visibleIndices = new Set(visiblePasses.map((item) => item.index));
  const machineDiagnostic = kcode?.validation?.diagnostics.find((item) => item.passIndex !== null && visibleIndices.has(item.passIndex)) ?? null;
  const outputMessage = kcode?.messages.find((item) => item.severity === 'error')
    ?? kcode?.messages.find((item) => item.severity === 'warning')
    ?? kcode?.messages[0]
    ?? null;
  const outputDiagnostic = outputMessage === null ? null : {
    severity: outputMessage.severity,
    rule: outputMessage.rule,
    message: outputMessage.message,
  };
  const authoredSelectionDiagnostic = artifact?.diagnostics.find((item) => item.passIndices.some((index) => visibleIndices.has(index))) ?? null;
  const diagnostic = machineDiagnostic ? {
    severity: machineDiagnostic.severity,
    rule: machineDiagnostic.rule,
    message: machineDiagnostic.message,
  } : outputDiagnostic?.severity === 'error' ? outputDiagnostic
    : authoredSelectionDiagnostic
    ?? outputDiagnostic
    ?? artifact?.diagnostics.find((item) => item.passIndices.length === 0)
    ?? null;
  const outputFailed = outputStatus === 'failed';
  const outputMissingAfterCompletion = outputStatus === 'ready' && kcode === null;
  const outputBlocked = kcode !== null && (!kcode.ok || kcode.scene === null);
  const regions: ProgramRegion[] = ['waste', 'draw', 'body', 'finish'];

  return <aside className={`target-column authored-machine${mobileActive ? ' mobile-active' : ''}`} aria-label="Machine truth">
    <header className="target-column-head">
      <div className="target-column-title"><span className="eyebrow">Machine truth</span><strong>Passes</strong></div>
      <span className="target-meta">{kcode ? outputBlocked ? 'emitted KCode blocked' : region === 'body' && row ? `design row ${row.displayRow} x${visiblePasses.length}` : `${labelForRegion(region)} / ${visiblePasses.length}` : outputFailed || outputMissingAfterCompletion ? 'KCode generation failed' : 'validating emitted KCode'}</span>
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
        {visiblePasses.length === 0 ? <p className="empty-passes">{kcode ? kcode.scene === null ? 'Emitted KCode is blocked; no exact machine scene is available.' : region === 'draw' ? 'Draw thread is not enabled.' : 'No emitted passes for this region.' : outputFailed || outputMissingAfterCompletion ? 'KCode generation did not produce an exact machine scene.' : 'Waiting for strict KCode validation.'}</p> : visiblePasses.map(({ pass, index }) => {
          const provenance = kcode?.passProvenance[index];
          const design = provenance?.rowIds.length ? provenance.rowIds.map((rowId) => {
            const exact = artifact?.rowProvenance.find((item) => item.rowId === rowId);
            return exact ? `R${exact.displayRow}` : rowId;
          }).join(', ') : labelForRegion(passRegions[index] ?? region);
          return <button type="button" className={`authored-pass-row${selectedPass === index ? ' active' : ''}`} key={index} onClick={() => onPass(index)} aria-pressed={selectedPass === index}>
            <span className="pass-number">{index + 1}</span><span className="pass-direction">{pass.direction}</span>
            <span>{pass.carrier !== '0' ? <i className="carrier-chip" style={{ '--carrier': CARRIER_COLORS[pass.carrier] } as CSSProperties}>C{pass.carrier}</i> : <em>-</em>}</span>
            <code>{pass.operation}{provenance?.isAutoMove ? ' · auto' : ''}</code><span>{pass.speed.value}</span><span className="row-ref">{design}</span>
          </button>;
        })}
      </div>
    </div>
    <div className="authored-diagnostic" role={outputFailed || outputMissingAfterCompletion || outputBlocked ? 'alert' : 'status'} aria-live="polite">
      {outputFailed ? <div className="diagnostic-line blocked"><CircleAlert size={15} /><span><b>KCode generation failed</b><small>{outputError ?? 'The converter did not return an emitted KCode artifact.'}</small></span></div>
        : outputMissingAfterCompletion ? <div className="diagnostic-line blocked"><CircleAlert size={15} /><span><b>No KCode artifact returned</b><small>Generation completed without an inspectable exact-output artifact.</small></span></div>
          : !kcode ? <div className="diagnostic-line"><span className="spin-dot" /><span><b>Validating emitted KCode</b><small>The pass view is populated only from the strict emitted machine trace.</small></span></div>
            : diagnostic ? <div className={`diagnostic-line ${diagnostic.severity === 'error' ? 'blocked' : diagnostic.severity === 'warning' ? 'warning' : 'clean'}`}>{diagnostic.severity === 'error' ? <CircleAlert size={15} /> : diagnostic.severity === 'warning' ? <AlertTriangle size={15} /> : <CheckCircle2 size={15} />}<span><b>{diagnostic.rule}</b><small>{diagnostic.message}</small></span></div>
              : outputBlocked ? <div className="diagnostic-line blocked"><CircleAlert size={15} /><span><b>Exact output blocked</b><small>Strict parsing, replay validation, or scheduled-pass differential validation did not complete cleanly.</small></span></div>
                : <div className="diagnostic-line clean"><CheckCircle2 size={15} /><span><b>No findings for this selection</b><small>{region === 'body' && row ? `Design row ${row.displayRow} is joined to ${visiblePasses.length} emitted machine passes.` : `${labelForRegion(region)} passes are present in the strict machine trace.`}</small></span></div>}
    </div>
  </aside>;
}
