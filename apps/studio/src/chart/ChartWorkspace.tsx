import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { Cloud, CloudOff, Download, LoaderCircle, Plus, Settings2, Upload } from 'lucide-react';
import { clear, copy, cut, paste, type PixelClipboard, type Rect } from '@knitlab/colorwork-core';
import { appendProjectEdit, materializeColorworkProject, redoProjectEdit, undoProjectEdit, type ColorworkProjectV1, type ProjectEdit } from '@kniterate-studio/project-contract';
import { ChartToolbar, type ChartTool } from './ChartToolbar';
import { ColorworkCanvas } from './ColorworkCanvas';
import { PaletteRail } from './PaletteRail';
import { makeRowId, pixelMutationToProjectEdit } from './projectCanvasAdapter';
import { openStudioProjectJson } from './projectFile';
import { BlanketSetupRail } from '../blanket/BlanketSetupRail';
import type { BlanketCompileState } from '../blanket/useBlanketCompiler';
import type { AuthoredVerdict } from '../engine';
import type { KCodeArtifact } from '../kcode/kcodeProtocol';
import { AuthoredMachinePanel, programRegionForPass, type ProgramRegion } from './AuthoredMachinePanel';
import { GeneratedSourceDock, type SourceFormat } from './GeneratedSourceDock';

type MobilePanel = 'chart' | 'strategy' | 'machine';

function entry(edit: ProjectEdit) { return { id: `edit_${crypto.randomUUID().replace(/-/g, '')}`, source: 'human' as const, edit }; }
function searchChoice<T extends string>(key: string, choices: readonly T[], fallback: T): T {
  const value = new URLSearchParams(window.location.search).get(key);
  return choices.includes(value as T) ? value as T : fallback;
}
function updateSearch(values: Record<string, string>) {
  const url = new URL(window.location.href);
  for (const [key, value] of Object.entries(values)) url.searchParams.set(key, value);
  window.history.replaceState(null, '', url);
}

export function ChartWorkspace({ project, onProject, onNewProject, onProjectSettings, autosaveState, isDarkMode, compile, kcode, outputStatus, outputError, authoredVerdict, focusedRowId, onFocusedRowId }: {
  project: ColorworkProjectV1;
  onProject: (project: ColorworkProjectV1) => void;
  onNewProject: () => void;
  onProjectSettings: () => void;
  autosaveState: 'saving' | 'saved' | 'failed';
  isDarkMode: boolean;
  compile: BlanketCompileState;
  kcode: KCodeArtifact | null;
  outputStatus: 'idle' | 'converting' | 'ready' | 'failed';
  outputError: string | null;
  authoredVerdict: AuthoredVerdict | null;
  focusedRowId: string | null;
  onFocusedRowId: (rowId: string) => void;
}) {
  const [tool, setTool] = useState<ChartTool>('pen');
  const [paletteIndex, setPaletteIndex] = useState(1);
  const [selection, setSelection] = useState<Rect | null>(null);
  const [clipboard, setClipboard] = useState<PixelClipboard | null>(null);
  const [zoom, setZoom] = useState(1);
  const [issue, setIssue] = useState<string | null>(null);
  const [mobilePanel, setMobilePanel] = useState<MobilePanel>(() => searchChoice('panel', ['chart', 'strategy', 'machine'], 'chart'));
  const [programRegion, setProgramRegion] = useState<ProgramRegion>(() => searchChoice('region', ['waste', 'draw', 'body', 'finish'], 'body'));
  const [selectedPass, setSelectedPass] = useState<number | null>(null);
  const [sourceFormat, setSourceFormat] = useState<SourceFormat>(() => searchChoice('source', ['knitout', 'kcode'], 'knitout'));
  const [sourceCollapsed, setSourceCollapsed] = useState(() => searchChoice('dock', ['open', 'closed'], 'open') === 'closed');
  const projectInput = useRef<HTMLInputElement>(null);
  const appliedUrlTechnique = useRef(false);
  const materialized = useMemo(() => materializeColorworkProject(project), [project]);
  const { chart, rowIds } = materialized.state;
  const activePaletteIndex = Math.min(paletteIndex, chart.palette.length - 1);
  const focusedRow = focusedRowId === null ? null : rowIds.indexOf(focusedRowId);
  const focusedProvenance = compile.artifact?.rowProvenance.find((row) => row.rowId === focusedRowId) ?? null;
  const passCounts = useMemo(() => new Map((compile.artifact?.rowProvenance ?? []).map((row) => [row.chartRow, row.passIndices.length])), [compile.artifact]);
  const commit = (edit: ProjectEdit | null): boolean => {
    if (!edit) return false;
    try { onProject(appendProjectEdit(project, entry(edit))); setIssue(null); return true; }
    catch (error) { setIssue(error instanceof Error ? error.message : String(error)); return false; }
  };
  const commitMutation = (mutation: Parameters<typeof pixelMutationToProjectEdit>[2]) => commit(pixelMutationToProjectEdit(project, rowIds, mutation));

  useEffect(() => { if (paletteIndex >= chart.palette.length) setPaletteIndex(Math.max(0, chart.palette.length - 1)); }, [paletteIndex, chart.palette.length]);
  useEffect(() => {
    if (!compile.artifact || focusedRowId !== null) return;
    const first = compile.artifact.rowProvenance.find((row) => row.passIndices.length > 0);
    if (first) onFocusedRowId(first.rowId);
  }, [compile.artifact, focusedRowId, onFocusedRowId]);
  useEffect(() => {
    if (!focusedProvenance?.passIndices.length) return;
    setProgramRegion('body');
    setSelectedPass(focusedProvenance.passIndices[0]!);
  }, [focusedProvenance]);
  useEffect(() => {
    if (appliedUrlTechnique.current) return;
    appliedUrlTechnique.current = true;
    const technique = searchChoice('technique', ['fairisle', 'ladder-back', 'lined', 'birdseye', 'complement'] as const, materialized.state.strategy.technique);
    if (technique !== materialized.state.strategy.technique) commit({ kind: 'set-strategy', strategy: { ...materialized.state.strategy, technique } });
  }, [materialized.state.strategy]);
  useEffect(() => updateSearch({ panel: mobilePanel, region: programRegion, source: sourceFormat, dock: sourceCollapsed ? 'closed' : 'open', technique: materialized.state.strategy.technique }), [mobilePanel, programRegion, sourceFormat, sourceCollapsed, materialized.state.strategy.technique]);
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      const target = event.target as HTMLElement | null; if (target?.closest('input, textarea, select')) return;
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') { event.preventDefault(); onProject(event.shiftKey ? redoProjectEdit(project) : undoProjectEdit(project)); return; }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'c' && selection) { event.preventDefault(); setClipboard(copy(chart, selection)); return; }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'x' && selection) { event.preventDefault(); const result = cut(chart, selection); setClipboard(result.clipboard); commitMutation(result.mutation); return; }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'v' && clipboard) { event.preventDefault(); commitMutation(paste(chart, clipboard, selection ? { column: selection.left, row: selection.top } : { column: 0, row: 0 })); return; }
      if (event.key === 'Delete' && selection) { event.preventDefault(); commitMutation(clear(chart, selection)); return; }
      const map: Record<string, ChartTool> = { p: 'pen', s: 'select', m: 'move', l: 'line', r: 'rectangle', e: 'erase', f: 'fill' };
      if (map[event.key.toLowerCase()]) setTool(map[event.key.toLowerCase()]!);
    };
    window.addEventListener('keydown', handler); return () => window.removeEventListener('keydown', handler);
  }, [project, chart, selection, clipboard]);

  const saveProject = () => { const blob = new Blob([JSON.stringify(project, null, 2)], { type: 'application/json' }); const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = `${project.id}.kniterate-studio.json`; link.click(); URL.revokeObjectURL(link.href); };
  const openProject = async (event: ChangeEvent<HTMLInputElement>) => { const file = event.target.files?.[0]; event.target.value = ''; if (!file) return; try { const opened = openStudioProjectJson(await file.text()); onProject(opened.project); setSelection(null); setClipboard(null); setPaletteIndex(Math.min(1, opened.project.base.chart.palette.length - 1)); setIssue(null); } catch (error) { setIssue(error instanceof Error ? error.message : String(error)); } };
  const selectProgramRegion = (region: ProgramRegion) => {
    setProgramRegion(region);
    if (!compile.artifact) return;
    if (region === 'body' && focusedProvenance?.passIndices[0] !== undefined) setSelectedPass(focusedProvenance.passIndices[0]);
    else setSelectedPass(compile.artifact.passes.findIndex((_pass, index) => programRegionForPass(compile.artifact!, index) === region));
  };
  const selectPass = (index: number) => {
    setSelectedPass(index);
    if (!compile.artifact) return;
    setProgramRegion(programRegionForPass(compile.artifact, index));
    const row = compile.artifact.rowProvenance.find((item) => item.passIndices.includes(index));
    if (row) onFocusedRowId(row.rowId);
  };
  const setPanel = (panel: MobilePanel) => setMobilePanel(panel);

  return <main className={`chart-workspace target-workspace${sourceCollapsed ? ' source-collapsed' : ''}`}>
    <nav className="authored-mobile-tabs" aria-label="Workspace columns" role="tablist">
      {(['chart', 'strategy', 'machine'] as MobilePanel[]).map((panel) => <button type="button" role="tab" aria-selected={mobilePanel === panel} className={mobilePanel === panel ? 'active' : ''} key={panel} onClick={() => setPanel(panel)}>{panel}</button>)}
    </nav>
    <div className="authored-columns">
      <section className={`target-column authored-chart${mobilePanel === 'chart' ? ' mobile-active' : ''}`}>
        <header className="target-column-head">
          <div className="target-column-title"><span className="eyebrow">Design intent</span><strong>Chart</strong></div>
          <div className="chart-column-actions"><span className="target-meta">{chart.width} needles / {chart.height} rows</span><span className={`autosave-state ${autosaveState}`} title={autosaveState === 'failed' ? 'Local recovery failed' : autosaveState === 'saving' ? 'Saving locally' : 'Saved locally'}>{autosaveState === 'failed' ? <CloudOff size={12} /> : autosaveState === 'saving' ? <LoaderCircle className="spin" size={12} /> : <Cloud size={12} />}</span><button type="button" onClick={onNewProject} title="New project" aria-label="New project"><Plus size={14} /></button><button type="button" onClick={onProjectSettings} title="Project settings" aria-label="Project settings"><Settings2 size={14} /></button><button type="button" onClick={() => projectInput.current?.click()} title="Open project" aria-label="Open project"><Upload size={14} /></button><button type="button" onClick={saveProject} title="Save project" aria-label="Save project"><Download size={14} /></button></div>
        </header>
        <input ref={projectInput} className="file-input" type="file" accept=".json,application/json" onChange={(event) => void openProject(event)} />
        {issue && <div className="chart-issue" role="alert">{issue}<button type="button" onClick={() => setIssue(null)} aria-label="Dismiss chart issue">x</button></div>}
        <ChartToolbar active={tool} onTool={setTool} onUndo={() => onProject(undoProjectEdit(project))} onRedo={() => onProject(redoProjectEdit(project))} onCopy={() => selection && setClipboard(copy(chart, selection))} onCut={() => { if (!selection) return; const result = cut(chart, selection); setClipboard(result.clipboard); commitMutation(result.mutation); }} onPaste={() => clipboard && commitMutation(paste(chart, clipboard, selection ? { column: selection.left, row: selection.top } : { column: 0, row: 0 }))} onDelete={() => selection && commitMutation(clear(chart, selection))} onZoomIn={() => setZoom(Math.min(3, zoom * 1.2))} onZoomOut={() => setZoom(Math.max(.35, zoom / 1.2))} onZoomSelection={() => setZoom(selection ? Math.min(2.5, Math.max(.6, 400 / Math.max(selection.right - selection.left + 1, selection.bottom - selection.top + 1) / 16)) : 1)} canUndo={project.history.cursor > 0} canRedo={project.history.cursor < project.history.entries.length} />
        <div className="target-chart-stage">
          <PaletteRail chart={chart} active={activePaletteIndex} onSelect={setPaletteIndex} />
          <div className="canvas-stack">
            <ColorworkCanvas chart={chart} tool={tool} paletteIndex={activePaletteIndex} selection={selection} onSelection={setSelection} onCommit={commitMutation} zoom={zoom} onZoomChange={setZoom} onInsertRow={(row) => commit({ kind: 'insert-row', rowId: makeRowId(), afterRowId: row === null ? null : rowIds[row]!, cells: Array(chart.width).fill(0) })} onDeleteRow={(row) => commit({ kind: 'delete-row', rowId: rowIds[row]! })} isDarkMode={isDarkMode} passCounts={passCounts} focusedRow={focusedRow !== null && focusedRow >= 0 ? focusedRow : null} onFocusRow={(row) => onFocusedRowId(rowIds[row]!)} />
            <div className="chart-caption"><span>{focusedProvenance ? `Row ${focusedProvenance.displayRow} / ${focusedProvenance.passIndices.length} physical passes` : 'Select a design row to inspect its passes'}</span><span>{compile.artifact?.messages.filter((message) => message.severity === 'warning').length ?? 0} compiler warnings</span></div>
          </div>
        </div>
      </section>
      <BlanketSetupRail state={materialized.state} compile={compile} outputStatus={outputStatus} outputError={outputError} authoredVerdict={authoredVerdict} mobileActive={mobilePanel === 'strategy'} onWidth={(width) => Number.isInteger(width) && width > 0 && width <= 252 && width !== chart.width && commit({ kind: 'set-width', width, fillPaletteIndex: activePaletteIndex })} onHeight={(height) => { if (!Number.isInteger(height) || height < 1 || height === chart.height) return; const count = Math.max(0, height - chart.height); commit({ kind: 'set-height', height, fillPaletteIndex: activePaletteIndex, newRowIds: Array.from({ length: count }, () => makeRowId()) }); }} onNeedleOffset={(needleOffset) => Number.isInteger(needleOffset) && needleOffset !== materialized.state.machine.needleOffset && commit({ kind: 'set-needle-offset', needleOffset })} onStrategy={(technique) => technique !== materialized.state.strategy.technique && commit({ kind: 'set-strategy', strategy: { ...materialized.state.strategy, technique } })} onBirdseyeMode={(birdseyeMode) => birdseyeMode !== materialized.state.strategy.birdseyeMode && commit({ kind: 'set-strategy', strategy: { ...materialized.state.strategy, birdseyeMode } })} onFloatLimit={(floatLimit) => Number.isInteger(floatLimit) && floatLimit >= 1 && floatLimit <= 30 && floatLimit !== materialized.state.strategy.floatLimit && commit({ kind: 'set-strategy', strategy: { ...materialized.state.strategy, floatLimit } })} onAssignment={(paletteId, carrier, yarnName) => { const current = materialized.state.machine.yarnAssignments.find((item) => item.paletteId === paletteId); if (current?.carrier !== carrier || current.yarnName !== yarnName) commit({ kind: 'set-yarn-assignment', assignment: { paletteId, carrier, yarnName } }); }} onFrame={(frame) => { if (JSON.stringify(frame) !== JSON.stringify(materialized.state.frame)) commit({ kind: 'set-frame', frame }); }} />
      <AuthoredMachinePanel artifact={compile.artifact} focusedRowId={focusedRowId} selectedPass={selectedPass} region={programRegion} onRegion={selectProgramRegion} onPass={selectPass} mobileActive={mobilePanel === 'machine'} />
    </div>
    <GeneratedSourceDock artifact={compile.artifact} kcode={kcode} selectedPass={selectedPass} format={sourceFormat} collapsed={sourceCollapsed} onFormat={setSourceFormat} onCollapsed={setSourceCollapsed} />
  </main>;
}
