import { useMemo, useState } from 'react';
import {
  InvalidColorworkProjectError,
  appendProjectOperation,
  materializeColorworkProject,
  type ColorworkProjectV1,
  type PanelObject,
  type ProjectEdit,
} from '@kniterate-studio/project-contract';
import { Chips, NumberInput, Section } from '../workspace/panel';
import { RunSchematic } from '../workspace/RunSchematic';
import { ViewSwitch, type WorkspaceView } from '../workspace/ViewSwitch';
import { StitchSection, YarnGaugeSection } from './DesignSections';
import type { PieceId } from './draft';
import { KnitFileView } from './KnitFileView';
import { panelEdit, type PanelPlan } from './panel';
import { PieceView, type PieceMode } from './PieceView';
import type { SweaterRunState } from './sweaterRun';
import { SweaterStatusPanel } from './SweaterStatusPanel';
import { RIBS } from './textures';
import './sweater.css';

/** A one-yarn scarf or blanket in the shared workspace: its size, stitch and ends on the left; the piece in the middle; status and file on the right. */
export function PanelWorkspace({ project, onProject, plan, run, view, onView, onPackage, onPrint, onDownloadPiece, packaging }: {
  project: ColorworkProjectV1;
  onProject: (project: ColorworkProjectV1) => void;
  plan: PanelPlan;
  run: SweaterRunState;
  view: WorkspaceView;
  onView: (view: WorkspaceView) => void;
  onPackage: () => void;
  onPrint: () => void;
  onDownloadPiece: (piece: PieceId) => void;
  packaging: boolean;
}) {
  const { state } = useMemo(() => materializeColorworkProject(project), [project]);
  const [mode, setMode] = useState<PieceMode>('stitches');
  const [error, setError] = useState<string | null>(null);
  const yarn = state.chart.palette[0]!;
  const object = plan.object;
  const piece = plan.pieces[0]!;
  const operate = (label: string, edits: ProjectEdit[]): boolean => {
    try {
      onProject(appendProjectOperation(project, { group: `op_${crypto.randomUUID().replace(/-/g, '')}`, source: 'human', label, edits }));
      setError(null);
      return true;
    } catch (caught) {
      setError(caught instanceof InvalidColorworkProjectError ? caught.issues.join(' ') : caught instanceof Error ? caught.message : String(caught));
      return false;
    }
  };
  const change = (label: string, next: PanelObject, extra: ProjectEdit[] = []) => operate(label, [panelEdit(next), ...extra]);
  const result = run.current ? run.summary?.pieces[0] : undefined;
  const waiting = !run.current || run.status === 'checking' ? 'Writing panel.kc for this design…' : result?.error ?? 'This design has no machine file yet: it did not pass the machine checks.';

  const body = (() => {
    if (!piece.raster) return <p className="stage-error">{piece.error}</p>;
    if (view === 'schematic') return result?.file ? <div className="schematic-stage"><RunSchematic file={result.file} hex={yarn.hex} stitchCm={piece.raster.stitchCm} rowCm={piece.raster.rowCm} label={piece.name} /></div> : <p className="knitfile-waiting" role="status">{waiting}</p>;
    if (view === 'file') return result?.file && result.kcText ? <div className="piece-wrap"><KnitFileView key={project.id} file={result.file} kcText={result.kcText} fileName="panel.kc" copies={1} hex={yarn.hex} carriers={plan.carriers} stitchCm={piece.raster.stitchCm} rowCm={piece.raster.rowCm} onDownload={() => onDownloadPiece('panel')} /></div> : <p className="knitfile-waiting" role="status">{waiting}</p>;
    return <div className="piece-wrap">
      <div className="piece-summary"><h2>{piece.name}</h2><p>{piece.raster.realized.castOnStitches} stitches · {piece.raster.rows.length} rows · {piece.raster.realized.widthCm} × {piece.raster.realized.heightCm} cm</p></div>
      <PieceView raster={piece.raster} hex={yarn.hex} label={piece.name} mode={mode} onMode={setMode} />
    </div>;
  })();

  return <main className="sweater-workspace">
    <aside className="sweater-design" aria-label="Design">
      <Section title="Size" aside={plan.knitted ? <em className="section-aside">{plan.knitted.widthCm} × {plan.knitted.lengthCm} cm</em> : undefined}>
        <div className="measure-table" role="group" aria-label="Size">
          <div className="measure-head"><span /><span>Wanted</span><span>Knitted</span></div>
          <label className="measure-row"><span>Width</span><NumberInput label="Width" value={object.widthCm} min={5} max={110} suffix="cm" onCommit={(widthCm) => change(`Width ${widthCm} cm`, { ...object, widthCm })} /><span className="knitted">{plan.knitted?.widthCm ?? '—'}</span></label>
          <label className="measure-row"><span>Length</span><NumberInput label="Length" value={object.lengthCm} min={5} max={400} suffix="cm" onCommit={(lengthCm) => change(`Length ${lengthCm} cm`, { ...object, lengthCm })} /><span className="knitted">{plan.knitted?.lengthCm ?? '—'}</span></label>
        </div>
      </Section>
      <StitchSection body={object.body} hex={yarn.hex} gaugeAssumed={plan.gauge.source === 'assumed'} onChange={(label, nextBody, edits) => change(label, { ...object, body: nextBody }, edits)} />
      <Section title="Ends">
        <div className="trim-row">
          <span>Rib</span>
          <Chips label="End rib" value={object.ends.rib} options={RIBS.map((rib) => ({ id: rib.rib, name: rib.name }))} onPick={(rib) => change(`Ends: ${RIBS.find((item) => item.rib === rib)?.name} rib`, { ...object, ends: { ...object.ends, rib } })} />
          <NumberInput label="End rib height" value={object.ends.cm} min={0} max={30} suffix="cm" onCommit={(cm) => change(cm === 0 ? 'No rib ends' : `Rib ends ${cm} cm`, { ...object, ends: { ...object.ends, cm } })} />
        </div>
        <div className="field-row"><span>Top</span><Chips label="Top edge" value={object.top ?? 'bind-off'} options={[{ id: 'bind-off', name: 'Bind off', note: 'The machine binds off the top.' }, { id: 'waste', name: 'Waste yarn', note: 'Live stitches on waste yarn, to bind off or graft by hand.' }]} onPick={(top) => change(top === 'waste' ? 'Finish on waste yarn' : 'Bind off the top', { ...object, top })} /></div>
        <p className="design-hint">0 cm: no rib ends.</p>
      </Section>
      <YarnGaugeSection yarn={yarn} carrier={plan.carriers.main} bodyName={object.body.name} gauge={plan.gauge} ribGauge={object.ends.cm > 0 ? plan.ribGauge : null} operate={operate} onRibGauge={(next, label) => change(label, { ...object, ribGauge: { ...next } })} />
    </aside>
    <section className="sweater-stage" aria-label={piece.name}>
      <header className="stage-head">
        <span className="stage-title">{piece.name}</span>
        <ViewSwitch view={view} onView={onView} />
      </header>
      {error && <p className="stage-error" role="alert">{error}<button type="button" className="link-button" onClick={() => setError(null)}>Dismiss</button></p>}
      <div className="stage-body">{body}</div>
    </section>
    <SweaterStatusPanel plan={plan} run={run} onOpenFile={() => onView('file')} onDownloadPiece={onDownloadPiece} onPackage={onPackage} onPrint={onPrint} packaging={packaging} />
  </main>;
}
