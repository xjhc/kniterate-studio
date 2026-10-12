import { useEffect, useMemo, useState } from 'react';
import {
  InvalidColorworkProjectError,
  appendProjectOperation,
  materializeColorworkProject,
  type ColorworkProjectV1,
  type ProjectEdit,
} from '@kniterate-studio/project-contract';
import { FilesOverview } from '../workspace/FilesOverview';
import { ViewSwitch, type WorkspaceView } from '../workspace/ViewSwitch';
import type { PieceId } from './draft';
import { AssembledView, GarmentView, type PieceRun } from './GarmentView';
import { RunSchematic } from '../workspace/RunSchematic';
import { KnitFileView } from './KnitFileView';
import { PieceView, type PieceMode } from './PieceView';
import type { RhythmStep } from './rhythm';
import { ShapingList } from './ShapingList';
import { sweaterEdit, type SweaterPlan } from './sweater';
import { SweaterDesignPanel } from './SweaterDesignPanel';
import type { SweaterRunState } from './sweaterRun';
import { SweaterStatusPanel } from './SweaterStatusPanel';
import type { SwatchFile } from '../useSwatchFile';
import { machineFileName } from '../workspace/fileNames';
import './sweater.css';

/** The sweater workspace: what you are making on the left, the views in the middle, status and files on the right. */
export function SweaterWorkspace({ project, onProject, plan, run, view, onView, onPackage, onPrint, onDownloadPiece, packaging, downloaded, swatchFile }: {
  project: ColorworkProjectV1;
  onProject: (project: ColorworkProjectV1) => void;
  plan: SweaterPlan;
  run: SweaterRunState;
  view: WorkspaceView;
  onView: (view: WorkspaceView) => void;
  onPackage: () => void;
  onPrint: () => void;
  onDownloadPiece: (piece: PieceId) => void;
  packaging: boolean;
  /** Whether this design's files were downloaded since its last change. */
  downloaded: boolean;
  swatchFile: SwatchFile;
}) {
  const { state } = useMemo(() => materializeColorworkProject(project), [project]);
  const [piece, setPiece] = useState<'garment' | PieceId>('garment');
  const [pieceMode, setPieceMode] = useState<PieceMode>('stitches');
  const [error, setError] = useState<string | null>(null);
  const [highlight, setHighlight] = useState<RhythmStep | null>(null);
  const yarn = state.chart.palette[0]!;

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
  // A piece that disappears (a boat neck has no neckband) falls back to the whole garment.
  useEffect(() => { if (piece !== 'garment' && !plan.pieces.some((item) => item.id === piece)) setPiece('garment'); }, [plan, piece]);

  const statuses = Object.fromEntries(plan.pieces.map((item) => {
    const result = run.current ? run.summary?.pieces.find((entry) => entry.id === item.id) : undefined;
    return [item.id, result === undefined ? 'checking' : result.verdict.state === 'blocked' ? 'blocked' : 'ok'];
  })) as Partial<Record<PieceId, 'ok' | 'blocked' | 'checking'>>;
  const selected = piece === 'garment' ? null : plan.pieces.find((item) => item.id === piece) ?? null;
  const fileOf = (id: PieceId) => (run.current ? run.summary?.pieces.find((item) => item.id === id) : undefined);
  const waiting = (id: PieceId, name: string) => {
    const result = fileOf(id);
    return !run.current || run.status === 'checking' ? `Writing ${id}.kc for this design…` : result?.error ?? `${name} has no machine file: it did not pass the machine checks.`;
  };
  const openFile = (id: PieceId) => { setPiece(id); onView('file'); };
  // What each piece's file knits before the piece (waste yarn, draw thread, cast-on), to draw under it.
  const runs: Partial<Record<PieceId, PieceRun>> = {};
  for (const item of plan.pieces) {
    const file = fileOf(item.id)?.file;
    if (!file || !item.raster) continue;
    const first = file.courses.findIndex((course) => course.row !== null);
    if (first <= 0) continue;
    const rowCm = item.raster.rowCm.body;
    runs[item.id] = {
      belowCm: first * rowCm,
      drawsCm: file.courses.slice(0, first).flatMap((course, index) => (file.sections[course.section]!.kind === 'draw' ? [(first - index - 0.5) * rowCm] : [])),
      // As wide as the waste yarn itself: the needles it knits before the piece starts.
      widthCm: (Math.max(...file.courses.slice(0, first).map((course) => course.stitches.length - 1 - [...course.stitches].reverse().join('').search(/[^.]/))) - Math.min(...file.courses.slice(0, first).map((course) => course.stitches.search(/[^.]/))) + 1) * item.raster.stitchCm,
      finish: file.sections.find((section) => section.kind === 'top')?.label ?? 'Bind-off',
    };
  }

  const body = (() => {
    if (selected === null) {
      if (view === 'design') return <div className="garment-wrap"><AssembledView plan={plan} hex={yarn.hex} onOpen={setPiece} /><p className="stage-caption">As worn. Click a piece to open it.</p></div>;
      if (view === 'schematic') return <div className="garment-wrap"><GarmentView plan={plan} hex={yarn.hex} statuses={statuses} onOpen={setPiece} runs={runs} /><p className="stage-caption">Each piece flat, as knitted, with its sizes, on the waste yarn (grey) and draw thread (red) it starts from. Click a piece to open it.</p></div>;
      return <FilesOverview files={plan.pieces.map((item) => {
        const result = fileOf(item.id);
        return { id: item.id, name: item.name, fileName: machineFileName(item.name), copies: item.copies, file: result?.file ?? null, waiting: result?.file ? null : waiting(item.id, item.name) };
      })} onOpen={(id) => openFile(id as PieceId)} />;
    }
    if (!selected.raster) return <p className="stage-error">{selected.error}</p>;
    if (view === 'file') {
      // Only the file for this exact design: while it is rewritten after a change, say so rather than show the old one.
      const result = fileOf(selected.id);
      if (result?.file && result.kcText) return <div className="piece-wrap"><KnitFileView key={selected.id} file={result.file} kcText={result.kcText} fileName={machineFileName(selected.name)} copies={selected.copies} hex={yarn.hex} carriers={plan.carriers} stitchCm={selected.raster.stitchCm} rowCm={selected.raster.rowCm} onDownload={() => onDownloadPiece(selected.id)} /></div>;
      return <p className="knitfile-waiting" role="status">{waiting(selected.id, selected.name)}</p>;
    }
    if (view === 'schematic') {
      const result = fileOf(selected.id);
      if (!result?.file) return <p className="knitfile-waiting" role="status">{waiting(selected.id, selected.name)}</p>;
      return <div className="schematic-stage"><RunSchematic file={result.file} hex={yarn.hex} stitchCm={selected.raster.stitchCm} rowCm={selected.raster.rowCm} label={selected.name} /></div>;
    }
    return <div className="piece-wrap">
      <div className="piece-summary"><h2>{selected.name}{selected.copies > 1 ? ` — knit ${selected.copies}` : ''}</h2><p>{selected.raster.realized.castOnStitches} stitches cast on · {selected.raster.rows.length} rows · {selected.raster.realized.widthCm} cm wide · {selected.raster.realized.heightCm} cm tall</p></div>
      <PieceView raster={selected.raster} hex={yarn.hex} label={selected.name} mode={pieceMode} onMode={setPieceMode} highlight={highlight} editor={selected.id === 'neckband' ? undefined : (() => {
        const kind = selected.id === 'sleeve' ? 'sleeve' as const : 'body' as const;
        const object = plan.object;
        return {
          kind,
          edge: plan.draft.edges[kind],
          custom: plan.custom[kind],
          outline: selected.draft.outline,
          onChange: (edge, label) => { operate(label[0]!.toUpperCase() + label.slice(1), [sweaterEdit({ ...object, shapes: { ...object.shapes, [kind]: edge } })]); },
          onReset: () => {
            const { [kind]: _dropped, ...others } = object.shapes ?? {};
            operate(`${kind === 'body' ? 'Body' : 'Sleeve'} shape from the measurements`, [sweaterEdit({ ...object, shapes: Object.keys(others).length > 0 ? others : undefined })]);
          },
        };
      })()} />
    </div>;
  })();

  return <main className="sweater-workspace">
    <SweaterDesignPanel state={state} plan={plan} operate={operate} />
    <section className="sweater-stage" aria-label="Sweater">
      <header className="stage-head">
        <nav className="stage-tabs" aria-label="Pieces">
          <button type="button" className={piece === 'garment' ? 'active' : ''} onClick={() => setPiece('garment')}>Whole sweater</button>
          {plan.pieces.map((item) => <button key={item.id} type="button" className={`${piece === item.id ? 'active' : ''} tab-${statuses[item.id]}`} onClick={() => setPiece(item.id)}>{item.name}{item.copies > 1 ? ` ×${item.copies}` : ''}</button>)}
        </nav>
        <ViewSwitch view={view} onView={onView} />
      </header>
      {error && <p className="stage-error" role="alert">{error}<button type="button" className="link-button" onClick={() => setError(null)}>Dismiss</button></p>}
      <div className="stage-body">{body}</div>
    </section>
    <SweaterStatusPanel plan={plan} run={run} ribUsed downloaded={downloaded} swatchFile={swatchFile} onOpenFile={openFile} onDownloadPiece={onDownloadPiece} onPackage={onPackage} onPrint={onPrint} packaging={packaging}
      fileDetail={selected?.raster ? { id: selected.id, content: <ShapingList raster={selected.raster} onHover={setHighlight} /> } : undefined} />
  </main>;
}
