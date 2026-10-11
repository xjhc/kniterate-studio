import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { FilePlus2, FolderOpen, Redo2, Save, Undo2 } from 'lucide-react';
import {
  InvalidColorworkProjectError,
  appendProjectOperation,
  materializeColorworkProject,
  redoProjectEdit,
  serializeColorworkProjectV1,
  undoProjectEdit,
  type ColorworkProjectV1,
  type ProjectEdit,
} from '@kniterate-studio/project-contract';
import { openStudioProjectFile } from '../chart/projectFile';
import { GarmentSheet } from '../garment/GarmentSheet';
import { sha256Hex } from '../garment/MotifPanel';
import { zipStore } from '../zip';
import type { PieceId } from './draft';
import { AssembledView, GarmentView } from './GarmentView';
import { PieceView } from './PieceView';
import { planSweater } from './sweater';
import { SweaterDesignPanel } from './SweaterDesignPanel';
import { sweaterInstructions, sweaterPackageFiles } from './sweaterHandoff';
import type { SweaterRunState } from './sweaterRun';
import { SweaterStatusPanel } from './SweaterStatusPanel';
import { sweaterSchematicSvg } from './schematic';
import './sweater.css';

function download(name: string, blob: Blob) {
  const link = window.document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = name;
  link.click();
  URL.revokeObjectURL(link.href);
}

/** The sweater workspace: design on the left, the garment in the middle, its status and files on the right. */
export function SweaterWorkspace({ project, onProject, onOpenProject, onNewProject, run }: {
  project: ColorworkProjectV1;
  onProject: (project: ColorworkProjectV1) => void;
  /** A project file opened from disk (it may continue this one). */
  onOpenProject: (project: ColorworkProjectV1) => void;
  onNewProject: () => void;
  run: SweaterRunState;
}) {
  const projectInput = useRef<HTMLInputElement>(null);
  const { state } = useMemo(() => materializeColorworkProject(project), [project]);
  const plan = useMemo(() => planSweater(state), [state]);
  const [view, setView] = useState<'garment' | PieceId>('garment');
  const [garmentView, setGarmentView] = useState<'worn' | 'flat'>('worn');
  const [error, setError] = useState<string | null>(null);
  const [packaging, setPackaging] = useState(false);
  const [showPattern, setShowPattern] = useState(false);
  const yarn = state.chart.palette[0]!;
  const canUndo = project.history.cursor > 0;
  const canRedo = project.history.cursor < project.history.entries.length;

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
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || (event.target as HTMLElement | null)?.closest('input, textarea, select')) return;
      if (event.key.toLowerCase() === 'z' && !event.shiftKey && canUndo) { event.preventDefault(); onProject(undoProjectEdit(project)); }
      if ((event.key.toLowerCase() === 'y' || (event.key.toLowerCase() === 'z' && event.shiftKey)) && canRedo) { event.preventDefault(); onProject(redoProjectEdit(project)); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [project, canUndo, canRedo, onProject]);
  // A piece that disappears (a boat neck has no neckband) falls back to the whole garment.
  useEffect(() => { if (view !== 'garment' && !plan.pieces.some((piece) => piece.id === view)) setView('garment'); }, [plan, view]);

  const statuses = Object.fromEntries(plan.pieces.map((piece) => {
    const result = run.current ? run.summary?.pieces.find((item) => item.id === piece.id) : undefined;
    return [piece.id, result === undefined ? 'checking' : result.verdict.state === 'blocked' ? 'blocked' : 'ok'];
  })) as Partial<Record<PieceId, 'ok' | 'blocked' | 'checking'>>;
  const selected = view === 'garment' ? null : plan.pieces.find((piece) => piece.id === view) ?? null;
  const undoLabel = canUndo ? project.history.entries.slice(0, project.history.cursor).reverse().find((entry) => entry.label)?.label : undefined;

  const downloadPackage = async () => {
    if (!run.summary?.exportReady || !run.current) return;
    setPackaging(true);
    try {
      const files = await sweaterPackageFiles({ project, serializedProject: serializeColorworkProjectV1(project), plan, summary: run.summary, sha256: sha256Hex });
      download(`${project.id}-sweater.zip`, new Blob([zipStore(files)], { type: 'application/zip' }));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally { setPackaging(false); }
  };
  const saveProject = () => download(`${project.id}.kniterate-studio.json`, new Blob([serializeColorworkProjectV1(project)], { type: 'application/json' }));
  const openProject = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try { onOpenProject((await openStudioProjectFile(file)).project); setError(null); } catch (caught) { setError(caught instanceof Error ? caught.message : String(caught)); }
  };
  const downloadPiece = (id: PieceId) => {
    const piece = run.summary?.pieces.find((item) => item.id === id);
    if (piece?.kcText) download(`${project.id}-${id}.kc`, new Blob([piece.kcText], { type: 'text/plain' }));
  };

  return <main className="sweater-workspace">
    <SweaterDesignPanel state={state} plan={plan} operate={operate} />
    <section className="sweater-stage" aria-label="Sweater">
      <header className="stage-head">
        <nav className="stage-tabs" aria-label="Pieces">
          <button type="button" className={view === 'garment' ? 'active' : ''} onClick={() => setView('garment')}>Whole sweater</button>
          {plan.pieces.map((piece) => <button key={piece.id} type="button" className={`${view === piece.id ? 'active' : ''} tab-${statuses[piece.id]}`} onClick={() => setView(piece.id)}>{piece.name}{piece.copies > 1 ? ` ×${piece.copies}` : ''}</button>)}
        </nav>
        <div className="stage-tools">
          <button type="button" className="icon-button" onClick={onNewProject} title="New project" aria-label="New project"><FilePlus2 size={16} /></button>
          <button type="button" className="icon-button" onClick={() => projectInput.current?.click()} title="Open a project file" aria-label="Open project file"><FolderOpen size={16} /></button>
          <button type="button" className="icon-button" onClick={saveProject} title="Save the project file" aria-label="Save project file"><Save size={16} /></button>
          <input ref={projectInput} className="file-input" type="file" accept=".json,application/json" onChange={(event) => void openProject(event)} />
          <span className="tool-divider" aria-hidden="true" />
          <button type="button" className="icon-button" disabled={!canUndo} onClick={() => onProject(undoProjectEdit(project))} title={undoLabel ? `Undo: ${undoLabel}` : 'Undo'} aria-label="Undo"><Undo2 size={16} /></button>
          <button type="button" className="icon-button" disabled={!canRedo} onClick={() => onProject(redoProjectEdit(project))} title="Redo" aria-label="Redo"><Redo2 size={16} /></button>
        </div>
      </header>
      {error && <p className="stage-error" role="alert">{error}<button type="button" className="link-button" onClick={() => setError(null)}>Dismiss</button></p>}
      <div className="stage-body">
        {selected === null
          ? <div className="garment-wrap">
              <div className="garment-view-toggle" role="tablist" aria-label="Garment view">
                <button type="button" role="tab" aria-selected={garmentView === 'worn'} className={garmentView === 'worn' ? 'active' : ''} onClick={() => setGarmentView('worn')}>As worn</button>
                <button type="button" role="tab" aria-selected={garmentView === 'flat'} className={garmentView === 'flat' ? 'active' : ''} onClick={() => setGarmentView('flat')}>Flat pieces</button>
              </div>
              {garmentView === 'worn' ? <AssembledView plan={plan} hex={yarn.hex} onOpen={setView} /> : <GarmentView plan={plan} hex={yarn.hex} statuses={statuses} onOpen={setView} />}
              <p className="stage-caption">{garmentView === 'worn' ? 'The front as worn, at true proportions, with the sleeves folded at the shoulders. Click a piece to see its stitches.' : 'Each piece as the machine knits it at your gauge, over its drafted shape (dashed), with the knitted sizes. Click a piece to see its stitches.'}</p>
            </div>
          : selected.raster
            ? <div className="piece-wrap">
                <div className="piece-summary"><h2>{selected.name}{selected.copies > 1 ? ` — knit ${selected.copies}` : ''}</h2><p>{selected.raster.realized.castOnStitches} stitches cast on · {selected.raster.rows.length} rows · {selected.raster.realized.widthCm} cm wide · {selected.raster.realized.heightCm} cm tall</p></div>
                <PieceView raster={selected.raster} hex={yarn.hex} label={selected.name} />
              </div>
            : <p className="stage-error">{selected.error}</p>}
      </div>
    </section>
    <SweaterStatusPanel plan={plan} run={run} onOpenPiece={setView} onDownloadPiece={downloadPiece} onPackage={() => void downloadPackage()} onPrint={() => setShowPattern(true)} packaging={packaging} />
    {showPattern && <GarmentSheet markdown={sweaterInstructions(project, plan, run.current ? run.summary : null)} schematic={sweaterSchematicSvg(plan, yarn.hex)} onClose={() => setShowPattern(false)} />}
  </main>;
}
