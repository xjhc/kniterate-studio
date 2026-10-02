import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { Cloud, CloudOff, Download, LoaderCircle, Plus, Ruler, Settings2, Upload } from 'lucide-react';
import { clear, copy, cut, paste, type PixelClipboard, type Rect } from '@knitlab/colorwork-core';
import { AUTHORED_CAPACITY_LIMITS_V1, appendProjectEdit, appendProjectOperation, materializeColorworkProject, redoProjectEdit, serializeColorworkProjectV1, undoProjectEdit, type ColorworkProjectV1, type ProjectEdit, type ProjectPlacement } from '@kniterate-studio/project-contract';
import { ChartToolbar, type ChartTool } from './ChartToolbar';
import { ColorworkCanvas, MIN_CHART_ZOOM, type CanvasPlacement } from './ColorworkCanvas';
import { beanieFitEdits, type BeanieFitChange } from '../beanie';
import { schematicSvg, type ReadinessStory } from '../handoff';
import type { ProjectPlan } from '../plan';
import { movedPlacement, placedCells, placementBoxes } from '../placements';
import { GarmentFitSection } from '../garment/GarmentFitSection';
import { ImageIntakeDialog, MotifSection } from '../garment/MotifPanel';
import { MeasureDialog } from '../garment/MeasureDialog';
import { ReadinessCard } from '../garment/ReadinessCard';
import { svgDataUrl } from '../garment/ChangesPanel';
import { PaletteRail } from './PaletteRail';
import { makeRowId, pixelMutationToProjectEdit } from './projectCanvasAdapter';
import { openStudioProjectFile } from './projectFile';
import { BlanketSetupRail } from '../blanket/BlanketSetupRail';
import type { BlanketCompileState } from '../blanket/useBlanketCompiler';
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

export function rowPassEvidenceLabel(
  displayRow: number,
  predictedPassCount: number,
  emittedPassCount: number | null,
): string {
  return emittedPassCount === null
    ? `Row ${displayRow} / ${predictedPassCount} predicted passes`
    : `Row ${displayRow} / ${emittedPassCount} emitted KCode passes`;
}

function compilerWarningLabel(count: number): string {
  return `${count} compiler warning${count === 1 ? '' : 's'}`;
}

export function ChartWorkspace({ project, onProject, onOpenProject, onNewProject, onProjectSettings, autosaveState, isDarkMode, compile, kcode, outputStatus, outputError, focusedRowId, onFocusedRowId, plan, story, storyPending, candidateSha256 }: {
  project: ColorworkProjectV1;
  onProject: (project: ColorworkProjectV1) => void;
  /** A project opened from a file; the app decides whether it continues this one (and shows its new changes). */
  onOpenProject: (project: ColorworkProjectV1) => void;
  plan: ProjectPlan;
  story: ReadinessStory | null;
  storyPending: boolean;
  /** KCode SHA-256 of the current exportable program, if any. */
  candidateSha256: string | null;
  onNewProject: () => void;
  onProjectSettings: () => void;
  autosaveState: 'saving' | 'saved' | 'failed';
  isDarkMode: boolean;
  compile: BlanketCompileState;
  kcode: KCodeArtifact | null;
  outputStatus: 'idle' | 'converting' | 'ready' | 'failed';
  outputError: string | null;
  focusedRowId: string | null;
  onFocusedRowId: (rowId: string) => void;
}) {
  const [tool, setTool] = useState<ChartTool>('pen');
  const [paletteIndex, setPaletteIndex] = useState(1);
  const [selection, setSelection] = useState<Rect | null>(null);
  const [clipboard, setClipboard] = useState<PixelClipboard | null>(null);
  const [zoom, setZoom] = useState(1);
  const [fitRequest, setFitRequest] = useState(0);
  const [issue, setIssue] = useState<string | null>(null);
  const [mobilePanel, setMobilePanel] = useState<MobilePanel>(() => searchChoice('panel', ['chart', 'strategy', 'machine'], 'chart'));
  const [programRegion, setProgramRegion] = useState<ProgramRegion>(() => searchChoice('region', ['waste', 'draw', 'body', 'finish'], 'body'));
  const [selectedPass, setSelectedPass] = useState<number | null>(null);
  const [sourceFormat, setSourceFormat] = useState<SourceFormat>(() => searchChoice('source', ['knitout', 'kcode'], 'knitout'));
  const [sourceCollapsed, setSourceCollapsed] = useState(() => searchChoice('dock', ['open', 'closed'], 'closed') === 'closed');
  const projectInput = useRef<HTMLInputElement>(null);
  const [selectedPlacement, setSelectedPlacement] = useState<string | null>(null);
  const [chartView, setChartView] = useState<'chart' | 'schematic'>('chart');
  const [intake, setIntake] = useState<{ replacing: ProjectPlacement | null } | null>(null);
  const [showMeasure, setShowMeasure] = useState(false);
  const appliedUrlTechnique = useRef(false);
  const materialized = useMemo(() => materializeColorworkProject(project), [project]);
  const { chart, rowIds } = materialized.state;
  // A garment opens fitted to the view, so the whole piece (and its motifs) can be seen.
  const isGarment = materialized.state.object?.kind === 'beanie';
  useEffect(() => { if (isGarment) setFitRequest((request) => request + 1); }, [project.id, isGarment]);
  const activePaletteIndex = Math.min(paletteIndex, chart.palette.length - 1);
  const compilerWarningCount = compile.artifact?.messages.filter((message) => message.severity === 'warning').length ?? 0;
  const paletteCarriers = useMemo(() => new Map(materialized.state.machine.yarnAssignments.map((item) => [item.paletteId, item.carrier])), [materialized.state.machine.yarnAssignments]);
  const focusedRow = focusedRowId === null ? null : rowIds.indexOf(focusedRowId);
  const focusedProvenance = compile.artifact?.rowProvenance.find((row) => row.rowId === focusedRowId) ?? null;
  const emittedPassesByRow = useMemo(() => new Map((kcode?.rowPasses ?? []).map((row) => [row.rowId, row.passIndices])), [kcode]);
  const focusedMachinePasses = focusedRowId === null ? [] : emittedPassesByRow.get(focusedRowId) ?? [];
  const passCounts = useMemo(() => new Map((compile.artifact?.rowProvenance ?? []).map((row) => [row.chartRow, emittedPassesByRow.get(row.rowId)?.length ?? 0])), [compile.artifact, emittedPassesByRow]);
  const commit = (edit: ProjectEdit | null): boolean => {
    if (!edit) return false;
    try { onProject(appendProjectEdit(project, entry(edit))); setIssue(null); return true; }
    catch (error) { setIssue(error instanceof Error ? error.message : String(error)); return false; }
  };
  /** Several edits as one undoable operation. */
  const operate = (label: string, edits: readonly ProjectEdit[]): boolean => {
    if (edits.length === 0) return false;
    try { onProject(appendProjectOperation(project, { group: `op_${crypto.randomUUID().replace(/-/g, '')}`, source: 'human', label, edits })); setIssue(null); return true; }
    catch (error) { setIssue(error instanceof Error ? error.message : String(error)); return false; }
  };
  const resolvedPlacements = materialized.placements;
  const boxes = useMemo(() => placementBoxes(materialized.state, resolvedPlacements), [materialized]);
  const lockedCells = useMemo(() => placedCells(materialized.state, resolvedPlacements), [materialized]);
  const canvasPlacements = useMemo<CanvasPlacement[]>(() => resolvedPlacements.map((item, index) => {
    const box = boxes[index]!;
    const ghost: CanvasPlacement['ghost'][number][] = [];
    if (item.status === 'conflict') item.placement.motif.cells.forEach((row, top) => row.forEach((color, offset) => {
      const id = item.placement.colors[String(color)];
      const hex = chart.palette.find((entry) => entry.id === id)?.hex;
      if (hex) ghost.push({ row: box.top + top, column: box.left + offset, hex });
    }));
    return { box, ghost };
  }), [resolvedPlacements, boxes, chart.palette]);
  const stalePlacements = useMemo(() => new Set(plan.findings.filter((finding) => finding.rule === 'placement-size-off').map((finding) => finding.path.replace('placements/', ''))), [plan]);
  const commitMutation = (mutation: Parameters<typeof pixelMutationToProjectEdit>[2]) => {
    // A motif's stitches belong to its placement: painting them would be drawn over, so refuse and point at the motif.
    const owner = mutation.kind === 'paint' ? mutation.cells.map((cell) => lockedCells.get(`${cell.row}:${cell.column}`)).find((id) => id !== undefined) : undefined;
    if (owner !== undefined) {
      setSelectedPlacement(owner);
      setIssue(`Those stitches belong to motif "${owner}". Edit it in the Motifs panel (size, position, colors), or use Convert to stitches to edit it stitch by stitch.`);
      return false;
    }
    return commit(pixelMutationToProjectEdit(project, rowIds, mutation));
  };
  const fit = (change: BeanieFitChange, label: string) => {
    try { operate(label, beanieFitEdits(project, change)); } catch (error) { setIssue(error instanceof Error ? error.message : String(error)); }
  };
  const goTo = (target: string) => {
    if (target.startsWith('placement:')) { setSelectedPlacement(target.slice(10)); setChartView('chart'); }
    else if (target.startsWith('rows/')) { onFocusedRowId(target.slice(5)); setChartView('chart'); }
    if (target !== 'program') setMobilePanel(target.startsWith('rows/') || target.startsWith('placement:') ? 'chart' : 'strategy');
    else setMobilePanel('machine');
    requestAnimationFrame(() => {
      const element = document.getElementById(target);
      element?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      (element?.matches('input, select, fieldset, section') ? element : element?.querySelector<HTMLElement>('input, select, button'))?.focus();
    });
  };
  const schematic = useMemo(() => (chartView === 'schematic' ? schematicSvg(project, plan) : null), [chartView, project, plan]);

  useEffect(() => { if (paletteIndex >= chart.palette.length) setPaletteIndex(Math.max(0, chart.palette.length - 1)); }, [paletteIndex, chart.palette.length]);
  useEffect(() => {
    if (!compile.artifact || focusedRowId !== null) return;
    const first = compile.artifact.rowProvenance.find((row) => (emittedPassesByRow.get(row.rowId)?.length ?? 0) > 0);
    if (first) onFocusedRowId(first.rowId);
  }, [compile.artifact, emittedPassesByRow, focusedRowId, onFocusedRowId]);
  useEffect(() => {
    if (!focusedMachinePasses.length) return;
    setProgramRegion('body');
    setSelectedPass(focusedMachinePasses[0]!);
  }, [focusedRowId, kcode]);
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

  const saveProject = () => { try { const blob = new Blob([serializeColorworkProjectV1(project)], { type: 'application/json' }); const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = `${project.id}.kniterate-studio.json`; link.click(); URL.revokeObjectURL(link.href); setIssue(null); } catch (error) { setIssue(error instanceof Error ? error.message : String(error)); } };
  const openProject = async (event: ChangeEvent<HTMLInputElement>) => { const file = event.target.files?.[0]; event.target.value = ''; if (!file) return; try { const opened = await openStudioProjectFile(file); onOpenProject(opened.project); setSelectedPlacement(null); setSelection(null); setClipboard(null); setPaletteIndex(Math.min(1, opened.project.base.chart.palette.length - 1)); setIssue(null); } catch (error) { setIssue(error instanceof Error ? error.message : String(error)); } };
  const selectProgramRegion = (region: ProgramRegion) => {
    setProgramRegion(region);
    if (!kcode) return;
    if (region === 'body' && focusedMachinePasses[0] !== undefined) setSelectedPass(focusedMachinePasses[0]);
    else setSelectedPass((kcode.scene?.passes ?? []).findIndex((_pass, index) => programRegionForPass(kcode, index) === region));
  };
  const selectPass = (index: number) => {
    setSelectedPass(index);
    if (!kcode) return;
    setProgramRegion(programRegionForPass(kcode, index));
    const rowId = kcode.passProvenance[index]?.rowIds[0];
    if (rowId) onFocusedRowId(rowId);
  };
  const setPanel = (panel: MobilePanel) => setMobilePanel(panel);

  return <main className={`chart-workspace target-workspace${sourceCollapsed ? ' source-collapsed' : ''}`}>
    <nav className="authored-mobile-tabs" aria-label="Workspace columns" role="tablist">
      {(['chart', 'strategy', 'machine'] as MobilePanel[]).map((panel) => <button type="button" role="tab" aria-selected={mobilePanel === panel} className={mobilePanel === panel ? 'active' : ''} key={panel} onClick={() => setPanel(panel)}>{panel}</button>)}
    </nav>
    <div className="authored-columns">
      <section className={`target-column authored-chart${mobilePanel === 'chart' ? ' mobile-active' : ''}`}>
        <header className="target-column-head">
          <div className="target-column-title"><span className="eyebrow">Design intent</span><strong>{chartView === 'chart' ? 'Chart' : 'Schematic'}</strong></div>
          {materialized.state.object?.kind === 'beanie' && <div className="chart-view-toggle" role="tablist" aria-label="Chart or schematic">{(['chart', 'schematic'] as const).map((view) => <button key={view} type="button" role="tab" aria-selected={chartView === view} className={chartView === view ? 'active' : ''} onClick={() => setChartView(view)}>{view === 'chart' ? 'Chart' : 'Schematic'}</button>)}</div>}
          <div className="chart-column-actions"><span className={`autosave-state ${autosaveState}`} title={autosaveState === 'failed' ? 'Local recovery failed' : autosaveState === 'saving' ? 'Saving locally' : 'Saved locally'}>{autosaveState === 'failed' ? <CloudOff size={12} /> : autosaveState === 'saving' ? <LoaderCircle className="spin" size={12} /> : <Cloud size={12} />}</span><button type="button" onClick={onNewProject} title="New project" aria-label="New project"><Plus size={14} /></button><button type="button" onClick={onProjectSettings} title="Project settings" aria-label="Project settings"><Settings2 size={14} /></button><button type="button" onClick={() => projectInput.current?.click()} title="Open project" aria-label="Open project"><Upload size={14} /></button><button type="button" onClick={saveProject} title="Save project" aria-label="Save project"><Download size={14} /></button></div>
        </header>
        <input ref={projectInput} className="file-input" type="file" accept=".json,application/json" onChange={(event) => void openProject(event)} />
        {issue && <div className="chart-issue" role="alert">{issue}<button type="button" onClick={() => setIssue(null)} aria-label="Dismiss chart issue">x</button></div>}
        <ChartToolbar active={tool} onTool={setTool} onUndo={() => onProject(undoProjectEdit(project))} onRedo={() => onProject(redoProjectEdit(project))} onCopy={() => selection && setClipboard(copy(chart, selection))} onCut={() => { if (!selection) return; const result = cut(chart, selection); setClipboard(result.clipboard); commitMutation(result.mutation); }} onPaste={() => clipboard && commitMutation(paste(chart, clipboard, selection ? { column: selection.left, row: selection.top } : { column: 0, row: 0 }))} onDelete={() => selection && commitMutation(clear(chart, selection))} onZoomIn={() => setZoom(Math.min(3, zoom * 1.2))} onZoomOut={() => setZoom(Math.max(MIN_CHART_ZOOM, zoom / 1.2))} onZoomSelection={() => selection ? setZoom(Math.min(2.5, Math.max(.6, 400 / Math.max(selection.right - selection.left + 1, selection.bottom - selection.top + 1) / 16))) : setFitRequest((request) => request + 1)} canUndo={project.history.cursor > 0} canRedo={project.history.cursor < project.history.entries.length} hasSelection={selection !== null} canPaste={clipboard !== null} />
        {chartView === 'schematic' ? <div className="schematic-stage">{schematic ? <img src={svgDataUrl(schematic)} alt="Dimensioned schematic: the flat piece as knitted and the finished front" data-testid="schematic" /> : <p>No schematic for this project.</p>}</div> : <div className="target-chart-stage">
          <PaletteRail chart={chart} carriers={paletteCarriers} active={activePaletteIndex} onSelect={setPaletteIndex} />
          <div className="canvas-stack">
            <ColorworkCanvas chart={chart} tool={tool} paletteIndex={activePaletteIndex} selection={selection} onSelection={setSelection} onCommit={commitMutation} zoom={zoom} onZoomChange={setZoom} fitRequest={fitRequest} fitScope={project.id} onInsertRow={(row) => commit({ kind: 'insert-row', rowId: makeRowId(), afterRowId: row === null ? null : rowIds[row]!, cells: Array(chart.width).fill(0) })} onDeleteRow={(row) => commit({ kind: 'delete-row', rowId: rowIds[row]! })} isDarkMode={isDarkMode} passCounts={passCounts} focusedRow={focusedRow !== null && focusedRow >= 0 ? focusedRow : null} onFocusRow={(row) => onFocusedRowId(rowIds[row]!)} firstNeedle={materialized.state.machine.needleOffset} highlightedNeedles={selectedPass === null ? null : kcode?.passKnitoutNeedles[selectedPass] ?? null} placements={canvasPlacements} selectedPlacement={selectedPlacement} onPlacementPick={setSelectedPlacement} onPlacementMove={(id, columns, rows) => { const placement = materialized.state.placements?.find((item) => item.id === id); if (placement) operate(`Move ${id}`, [{ kind: 'set-placement', placement: movedPlacement(materialized.state, placement, columns, rows) }]); }} />
            <div className="chart-caption"><span>{focusedProvenance ? rowPassEvidenceLabel(focusedProvenance.displayRow, focusedProvenance.passIndices.length, kcode === null ? null : focusedMachinePasses.length) : 'Select a design row to inspect its passes'}</span><span className={compilerWarningCount > 0 ? 'has-warnings' : undefined}>{compilerWarningLabel(compilerWarningCount)}</span></div>
          </div>
        </div>}
      </section>
      <BlanketSetupRail state={materialized.state} compile={compile} outputError={outputError} mobileActive={mobilePanel === 'strategy'}
        readiness={<ReadinessCard story={story} pending={storyPending} onTarget={goTo} onFix={(label, edits) => operate(label, edits)} />}
        garment={materialized.state.object?.kind === 'beanie' ? <>
          <GarmentFitSection state={materialized.state} plan={plan} onFit={fit} />
          <MotifSection state={materialized.state} placements={resolvedPlacements} selected={selectedPlacement} staleIds={stalePlacements} onSelect={setSelectedPlacement} onOperation={operate} onAddImage={() => setIntake({ replacing: null })} onReplaceImage={(placement) => setIntake({ replacing: placement })} />
          <section className="garment-section" id="trials"><h2><Ruler size={12} /> Trials</h2>
            {(materialized.state.trials ?? []).length === 0 ? <p className="garment-help">No measurements recorded yet.</p> : <ul className="trial-list">{materialized.state.trials!.map((trial) => <li key={trial.id}><b className={trial.synthetic ? 'synthetic' : ''}>{trial.synthetic ? 'SYNTHETIC · ' : ''}{trial.outcome}</b> · candidate <code>{trial.candidate.kcodeSha256.slice(0, 12)}</code>{trial.bodyGauge ? ` · body ${trial.bodyGauge.stitchesPer10cm}/${trial.bodyGauge.rowsPer10cm}` : ''} · {trial.recordedAt.slice(0, 10)}</li>)}</ul>}
            <button type="button" className="secondary-button motif-add" onClick={() => setShowMeasure(true)}>Record measurements</button>
          </section>
        </> : null} onWidth={(width) => Number.isInteger(width) && width > 0 && width <= AUTHORED_CAPACITY_LIMITS_V1.chartWidth && width !== chart.width && commit({ kind: 'set-width', width, fillPaletteIndex: activePaletteIndex })} onHeight={(height) => { if (!Number.isInteger(height) || height < 1 || height > AUTHORED_CAPACITY_LIMITS_V1.chartHeight || height === chart.height) return; const count = Math.max(0, height - chart.height); commit({ kind: 'set-height', height, fillPaletteIndex: activePaletteIndex, newRowIds: Array.from({ length: count }, () => makeRowId()) }); }} onNeedleOffset={(needleOffset) => Number.isInteger(needleOffset) && needleOffset !== materialized.state.machine.needleOffset && commit({ kind: 'set-needle-offset', needleOffset })} onStrategy={(technique) => { if (technique === materialized.state.strategy.technique) return; if (materialized.state.object?.kind === 'beanie' && (technique === 'fairisle' || technique === 'birdseye')) fit({ backing: technique }, `Backing: ${technique}`); else commit({ kind: 'set-strategy', strategy: { ...materialized.state.strategy, technique } }); }} onFloatLimit={(floatLimit) => Number.isInteger(floatLimit) && floatLimit >= 1 && floatLimit <= 30 && floatLimit !== materialized.state.strategy.floatLimit && commit({ kind: 'set-strategy', strategy: { ...materialized.state.strategy, floatLimit } })} onAssignment={(paletteId, carrier, yarnName) => { const current = materialized.state.machine.yarnAssignments.find((item) => item.paletteId === paletteId); if (current?.carrier !== carrier || current.yarnName !== yarnName) commit({ kind: 'set-yarn-assignment', assignment: { paletteId, carrier, yarnName } }); }} />
      <AuthoredMachinePanel artifact={compile.artifact} kcode={kcode} outputStatus={outputStatus} outputError={outputError} focusedRowId={focusedRowId} selectedPass={selectedPass} region={programRegion} onRegion={selectProgramRegion} onPass={selectPass} mobileActive={mobilePanel === 'machine'} />
    </div>
    {intake && <ImageIntakeDialog state={materialized.state} replacing={intake.replacing} onClose={() => setIntake(null)} onPlace={(placement, label) => { if (operate(label, [{ kind: 'set-placement', placement }])) { setSelectedPlacement(placement.id); setIntake(null); setChartView('chart'); setFitRequest((request) => request + 1); } }} />}
    {showMeasure && <MeasureDialog project={project} hasCuff={materialized.state.object?.construction === 'rib-cuff-jersey-body'} candidateSha256={candidateSha256} onClose={() => setShowMeasure(false)} onRecord={(label, edits) => { if (operate(label, edits)) setShowMeasure(false); }} />}
    <GeneratedSourceDock artifact={compile.artifact} kcode={kcode} selectedPass={selectedPass} format={sourceFormat} collapsed={sourceCollapsed} onFormat={setSourceFormat} onCollapsed={setSourceCollapsed} />
  </main>;
}
