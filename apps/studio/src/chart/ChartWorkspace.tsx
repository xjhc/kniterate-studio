import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Ruler, Wrench } from 'lucide-react';
import { clear, copy, cut, paste, type PixelClipboard, type Rect } from '@knitlab/colorwork-core';
import { beanieObjectOf, AUTHORED_CAPACITY_LIMITS_V1, appendProjectEdit, appendProjectOperation, materializeColorworkProject, type ColorworkProjectV1, type ProjectEdit, type ProjectPlacement } from '@kniterate-studio/project-contract';
import { ChartToolbar, type ChartTool } from './ChartToolbar';
import { ColorworkCanvas, MIN_CHART_ZOOM, type CanvasPlacement } from './ColorworkCanvas';
import { beanieFitEdits, type BeanieFitChange } from '../beanie';
import type { ReadinessStory } from '../handoff';
import type { ProjectPlan } from '../plan';
import { movedPlacement, placedCells, placementBoxes, type PlacementConversion } from '../placements';
import { GarmentFitSection } from '../garment/GarmentFitSection';
import { ImageIntakeDialog, MotifSection } from '../garment/MotifPanel';
import { MeasureDialog } from '../garment/MeasureDialog';
import { readKnitFile, type KnitFileCarriers } from '../sweater/knitFile';
import { KnitFileView } from '../sweater/KnitFileView';
import { RunSchematic } from '../workspace/RunSchematic';
import { StatusPanel, type StatusNote, type StatusTone } from '../workspace/StatusPanel';
import { ViewSwitch, type WorkspaceView } from '../workspace/ViewSwitch';
import type { AuthoredVerdict } from '../engine';import { PaletteRail } from './PaletteRail';
import { makeRowId, pixelMutationToProjectEdit } from './projectCanvasAdapter';
import { BlanketSetupRail } from '../blanket/BlanketSetupRail';
import type { BlanketCompileState } from '../blanket/useBlanketCompiler';
import type { KCodeArtifact } from '../kcode/kcodeProtocol';

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

/** What the right-hand panel needs from the app: the verdict, and the actions that download and print. */
export interface ChartStatus {
  verdict: AuthoredVerdict | null;
  exportReady: boolean;
  packaging: boolean;
  onPackage: () => void;
  onPrint: () => void;
  onDownloadKc: () => void;
}

const KIND_NAMES = { beanie: 'Beanie', panel: 'Scarf or blanket' } as const;

/**
 * A charted project (a colorwork scarf, blanket or beanie) in the shared
 * workspace: what you are making on the left; the chart, its schematic or its
 * machine file in the middle; status, files and export on the right.
 */
export function ChartWorkspace({ project, onProject, generation, plan, story, storyPending, candidateSha256, isDarkMode, compile, kcode, outputError, view, onView, status, stepThrough }: {
  project: ColorworkProjectV1;
  onProject: (project: ColorworkProjectV1) => void;
  /** Counts opened files: a result started in an earlier document session must not reach this one. */
  generation: number;
  plan: ProjectPlan;
  story: ReadinessStory | null;
  storyPending: boolean;
  /** KCode SHA-256 of the current exportable program, if any. */
  candidateSha256: string | null;
  isDarkMode: boolean;
  compile: BlanketCompileState;
  /** The machine file for this exact design, or null while it is written. */
  kcode: KCodeArtifact | null;
  outputError: string | null;
  view: WorkspaceView;
  onView: (view: WorkspaceView) => void;
  status: ChartStatus;
  /** The machine stepped through pass by pass, with every check and the source: inside the Machine file view. */
  stepThrough: ReactNode;
}) {
  const [tool, setTool] = useState<ChartTool>('pen');
  const [paletteIndex, setPaletteIndex] = useState(1);
  const [selection, setSelection] = useState<Rect | null>(null);
  const [clipboard, setClipboard] = useState<PixelClipboard | null>(null);
  const [zoom, setZoom] = useState(1);
  const [fitRequest, setFitRequest] = useState(0);
  const [issue, setIssue] = useState<string | null>(null);
  const [focusedRowId, setFocusedRowId] = useState<string | null>(null);
  const [fileMode, setFileMode] = useState<'read' | 'step'>('read');
  const projectRef = useRef(project);
  projectRef.current = project;
  // Opening a file starts another document session, even when it has the same project id.
  const generationRef = useRef(generation);
  generationRef.current = generation;
  const renderedGeneration = generation;
  const latestMotifState = () => projectRef.current.id === project.id && generationRef.current === renderedGeneration ? materializeColorworkProject(projectRef.current).state : null;
  const [selectedPlacement, setSelectedPlacement] = useState<string | null>(null);
  const [intake, setIntake] = useState<{ replacing: ProjectPlacement | null; refresh?: { conversion: Partial<PlacementConversion>; label: string } } | null>(null);
  const [showMeasure, setShowMeasure] = useState(false);
  const appliedUrlTechnique = useRef(false);
  const materialized = useMemo(() => materializeColorworkProject(project), [project]);
  const { chart, rowIds } = materialized.state;
  const isGarment = materialized.state.object?.kind === 'beanie';
  // A garment opens fitted to the view, so the whole piece (and its motifs) can be seen.
  useEffect(() => { if (isGarment) setFitRequest((request) => request + 1); }, [project.id, isGarment]);
  const activePaletteIndex = Math.min(paletteIndex, chart.palette.length - 1);
  // A newly opened file starts clean: no selection, clipboard or chosen motif from the last one.
  useEffect(() => { setSelectedPlacement(null); setSelection(null); setClipboard(null); setPaletteIndex(Math.min(1, chart.palette.length - 1)); }, [generation]);
  const paletteCarriers = useMemo(() => new Map(materialized.state.machine.yarnAssignments.map((item) => [item.paletteId, item.carrier])), [materialized.state.machine.yarnAssignments]);
  const focusedRow = focusedRowId === null ? null : rowIds.indexOf(focusedRowId);
  const noPassCounts = useMemo(() => new Map<number, number>(), []);
  const commit = (edit: ProjectEdit | null): boolean => {
    if (!edit) return false;
    try { onProject(appendProjectEdit(projectRef.current, entry(edit))); setIssue(null); return true; }
    catch (error) { setIssue(error instanceof Error ? error.message : String(error)); return false; }
  };
  /** Several edits as one undoable operation. */
  const operate = (label: string, edits: readonly ProjectEdit[]): boolean => {
    if (edits.length === 0) return false;
    // Always against the latest project: an asynchronous result must never replay an older one over later edits.
    try { onProject(appendProjectOperation(projectRef.current, { group: `op_${crypto.randomUUID().replace(/-/g, '')}`, source: 'human', label, edits })); setIssue(null); return true; }
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
  // A beanie's bottom rows are rib in its main yarn (all of them without a cuff), and the machine shapes the crown above the chart.
  const ribRows = isGarment && plan.sections ? (plan.sections.cuff?.rows ?? (plan.sections.body.fabric === 'rib' ? chart.height : 0)) : 0;
  const piece = useMemo(() => (isGarment && plan.sections ? {
    ribRows,
    crown: plan.sections.crown?.needles ?? [],
    hex: chart.palette[0]?.hex ?? '#D9CBB0',
    labels: { top: 'Gathered top', crown: 'Crown', body: 'Body', rib: plan.sections.cuff ? (plan.sections.cuff.folds ? 'Cuff, folds up' : 'Cuff') : 'Rib' },
  } : null), [isGarment, plan.sections, ribRows, chart.palette]);
  const commitMutation = (mutation: Parameters<typeof pixelMutationToProjectEdit>[2]) => {
    // The rib knits one yarn: keep colour out of it (the main yarn, palette 0, is allowed, so a stray colour can be erased).
    if (ribRows > 0 && mutation.kind === 'paint') {
      const ribStart = chart.height - ribRows;
      const kept = mutation.cells.filter((cell) => cell.row < ribStart || cell.paletteIndex === 0);
      if (kept.length < mutation.cells.length) {
        if (kept.length === 0) { setIssue(ribRows === chart.height ? 'This beanie is all rib in one yarn. Add a cuff to paint a colour body.' : 'The cuff is rib in one yarn. Paint the body above it.'); return false; }
        mutation = { ...mutation, cells: kept };
      }
    }
    // A motif's stitches belong to its placement: painting them would be drawn over, so refuse and point at the motif.
    const owner = mutation.kind === 'paint' ? mutation.cells.map((cell) => lockedCells.get(`${cell.row}:${cell.column}`)).find((id) => id !== undefined) : undefined;
    if (owner !== undefined) {
      setSelectedPlacement(owner);
      setIssue(`Those stitches belong to the motif "${owner}". Change it under Motifs, or use Convert to stitches.`);
      return false;
    }
    return commit(pixelMutationToProjectEdit(project, rowIds, mutation));
  };
  const fit = (change: BeanieFitChange, label: string) => {
    try { operate(label, beanieFitEdits(project, change)); } catch (error) { setIssue(error instanceof Error ? error.message : String(error)); }
  };
  const goTo = (target: string) => {
    if (target === 'program') { onView('file'); return; }
    if (target.startsWith('placement:')) { setSelectedPlacement(target.slice(10)); onView('design'); }
    else if (target.startsWith('rows/')) { setFocusedRowId(target.slice(5)); onView('design'); }
    requestAnimationFrame(() => {
      const element = document.getElementById(target);
      element?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      (element?.matches('input, select, fieldset, section') ? element : element?.querySelector<HTMLElement>('input, select, button'))?.focus();
    });
  };

  // The machine file, read back: what the machine knits, for the schematic and the Machine file view.
  const carriers = useMemo<KnitFileCarriers | null>(() => {
    const frame = compile.artifact?.frame;
    const assignments = materialized.state.machine.yarnAssignments;
    if (!frame || assignments.length === 0) return null;
    const yarns = Object.fromEntries(assignments.map((item) => [item.carrier, { name: item.yarnName, hex: chart.palette.find((color) => color.id === item.paletteId)?.hex ?? '#888888' }]));
    return { main: assignments[0]!.carrier, second: null, waste: frame.wasteCarrier ?? '6', draw: frame.frameCarriers[0] ?? '1', yarns };
  }, [compile.artifact, materialized.state.machine.yarnAssignments, chart.palette]);
  // Read only when a view shows it: a large chart's file is a lot of work for the main thread.
  const knitFile = useMemo(() => (view !== 'design' && kcode && carriers ? readKnitFile(kcode, { zoneOfRow: (row) => (row < ribRows ? 'rib' : 'body'), carriers, kind: isGarment ? 'beanie' : 'panel' }) : null), [view === 'design', kcode, carriers, ribRows, isGarment]);
  const gauge = materialized.state.gauge;
  const ribGauge = materialized.state.object?.ribGauge;
  const stitchCm = gauge ? 10 / gauge.stitchesPer10cm : null;
  const rowCm = gauge ? { body: 10 / gauge.rowsPer10cm, rib: ribGauge ? 10 / ribGauge.rowsPer10cm : 10 / gauge.rowsPer10cm } : null;
  const kindName = KIND_NAMES[isGarment ? 'beanie' : 'panel'];
  const fileName = `${project.id}.kc`;

  useEffect(() => { if (paletteIndex >= chart.palette.length) setPaletteIndex(Math.max(0, chart.palette.length - 1)); }, [paletteIndex, chart.palette.length]);
  useEffect(() => {
    if (appliedUrlTechnique.current) return;
    appliedUrlTechnique.current = true;
    const technique = searchChoice('technique', ['fairisle', 'ladder-back', 'lined', 'birdseye', 'complement'] as const, materialized.state.strategy.technique);
    if (technique !== materialized.state.strategy.technique) commit({ kind: 'set-strategy', strategy: { ...materialized.state.strategy, technique } });
  }, [materialized.state.strategy]);
  useEffect(() => updateSearch({ technique: materialized.state.strategy.technique }), [materialized.state.strategy.technique]);
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.defaultPrevented || view !== 'design') return;
      const target = event.target as HTMLElement | null; if (target?.closest('input, textarea, select')) return;
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'c' && selection) { event.preventDefault(); setClipboard(copy(chart, selection)); return; }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'x' && selection) { event.preventDefault(); const result = cut(chart, selection); setClipboard(result.clipboard); commitMutation(result.mutation); return; }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'v' && clipboard) { event.preventDefault(); commitMutation(paste(chart, clipboard, selection ? { column: selection.left, row: selection.top } : { column: 0, row: 0 })); return; }
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.key === 'Delete' && selection) { event.preventDefault(); commitMutation(clear(chart, selection)); return; }
      const map: Record<string, ChartTool> = { p: 'pen', s: 'select', m: 'move', l: 'line', r: 'rectangle', e: 'erase', f: 'fill' };
      if (map[event.key.toLowerCase()]) setTool(map[event.key.toLowerCase()]!);
    };
    window.addEventListener('keydown', handler); return () => window.removeEventListener('keydown', handler);
  }, [project, chart, selection, clipboard, view]);

  // The status panel: whether it can be knitted, what to fix, the file.
  const tone: StatusTone = story === null ? (storyPending ? 'checking' : 'blocked') : story.status === 'ready' ? 'ready' : story.status === 'blocked' ? 'blocked' : 'warn';
  const notes: StatusNote[] = (story?.items ?? []).map((item) => ({
    severity: item.severity === 'error' ? 'error' : item.severity === 'warning' ? 'warning' : 'info',
    text: `${item.part}: ${item.action}`,
    actions: item.target || item.fixes.length > 0 ? <>
      {item.target && <button type="button" className="secondary-button" onClick={() => goTo(item.target!)}>Show</button>}
      {item.fixes.map((fix) => <button type="button" className="primary-button" key={fix.label} onClick={() => operate(fix.label, fix.edits)}><Wrench size={13} /> {fix.label}</button>)}
    </> : undefined,
  }));
  const fileState = status.exportReady && kcode ? 'ok' as const : tone === 'blocked' && !storyPending ? 'blocked' as const : 'checking' as const;

  const center: ReactNode = (() => {
    if (view === 'schematic') {
      if (!knitFile) return <p className="knitfile-waiting" role="status">{fileState === 'blocked' ? 'No schematic: this design cannot be knitted yet.' : 'Writing the machine file…'}</p>;
      return <div className="schematic-stage"><RunSchematic file={knitFile} hex={chart.palette[0]?.hex ?? '#D9CBB0'} stitchCm={stitchCm} rowCm={rowCm} label={kindName} />{!gauge && <p className="design-hint">Not to scale: there is no gauge.</p>}</div>;
    }
    if (view === 'file') {
      if (!knitFile || !kcode || !carriers) return <p className="knitfile-waiting" role="status">{fileState === 'blocked' ? story?.detail ?? 'This design cannot be knitted yet.' : 'Writing the machine file for this design…'}</p>;
      return <div className="piece-wrap">
        <div className="garment-view-toggle compact file-mode" role="tablist" aria-label="Machine file view">
          <button type="button" role="tab" aria-selected={fileMode === 'read'} className={fileMode === 'read' ? 'active' : ''} onClick={() => setFileMode('read')}>Read the file</button>
          <button type="button" role="tab" aria-selected={fileMode === 'step'} className={fileMode === 'step' ? 'active' : ''} onClick={() => setFileMode('step')}>Step through</button>
        </div>
        {fileMode === 'step' && stepThrough ? <div className="step-through">{stepThrough}</div> : <KnitFileView key={project.id} file={knitFile} kcText={kcode.kcText} fileName={fileName} copies={1} hex={chart.palette[0]?.hex ?? '#D9CBB0'} carriers={carriers} stitchCm={stitchCm ?? 0.4} rowCm={rowCm ?? { rib: 0.3, body: 0.3 }} onDownload={status.onDownloadKc} />}
      </div>;
    }
    return <div className="chart-design-stage">
      <ChartToolbar active={tool} onTool={setTool} onCopy={() => selection && setClipboard(copy(chart, selection))} onCut={() => { if (!selection) return; const result = cut(chart, selection); setClipboard(result.clipboard); commitMutation(result.mutation); }} onPaste={() => clipboard && commitMutation(paste(chart, clipboard, selection ? { column: selection.left, row: selection.top } : { column: 0, row: 0 }))} onDelete={() => selection && commitMutation(clear(chart, selection))} onZoomIn={() => setZoom(Math.min(3, zoom * 1.2))} onZoomOut={() => setZoom(Math.max(MIN_CHART_ZOOM, zoom / 1.2))} onZoomSelection={() => selection ? setZoom(Math.min(2.5, Math.max(.6, 400 / Math.max(selection.right - selection.left + 1, selection.bottom - selection.top + 1) / 16))) : setFitRequest((request) => request + 1)} hasSelection={selection !== null} canPaste={clipboard !== null} />
      <div className="target-chart-stage">
        <PaletteRail chart={chart} carriers={paletteCarriers} active={activePaletteIndex} onSelect={setPaletteIndex} />
        <div className="canvas-stack">
          <ColorworkCanvas chart={chart} tool={tool} paletteIndex={activePaletteIndex} selection={selection} onSelection={setSelection} onCommit={commitMutation} zoom={zoom} onZoomChange={setZoom} fitRequest={fitRequest} fitScope={project.id} onInsertRow={(row) => commit({ kind: 'insert-row', rowId: makeRowId(), afterRowId: row === null ? null : rowIds[row]!, cells: Array(chart.width).fill(0) })} onDeleteRow={(row) => commit({ kind: 'delete-row', rowId: rowIds[row]! })} isDarkMode={isDarkMode} passCounts={noPassCounts} focusedRow={focusedRow !== null && focusedRow >= 0 ? focusedRow : null} onFocusRow={(row) => setFocusedRowId(rowIds[row]!)} firstNeedle={materialized.state.machine.needleOffset} highlightedNeedles={null} rowAspect={gauge ? gauge.stitchesPer10cm / gauge.rowsPer10cm : 1} piece={piece} placements={canvasPlacements} selectedPlacement={selectedPlacement} onPlacementPick={setSelectedPlacement} onPlacementMove={(id, columns, rows) => { const placement = materialized.state.placements?.find((item) => item.id === id); if (placement) operate(`Move ${id}`, [{ kind: 'set-placement', placement: movedPlacement(materialized.state, placement, columns, rows) }]); }} />
        </div>
      </div>
    </div>;
  })();

  return <main className="sweater-workspace chart-project">
    <BlanketSetupRail state={materialized.state} compile={compile} outputError={outputError}
      garment={isGarment ? <>
        <GarmentFitSection key={`fit-${project.id}`} state={materialized.state} plan={plan} onFit={fit} />
        <MotifSection key={`motifs-${project.id}-${renderedGeneration}`} latestState={latestMotifState} state={materialized.state} placements={resolvedPlacements} selected={selectedPlacement} staleIds={stalePlacements} onSelect={setSelectedPlacement} onOperation={operate} onAddImage={() => setIntake({ replacing: null })} onReplaceImage={(placement, refresh) => setIntake({ replacing: placement, refresh })} />
        <section className="garment-section" id="swatch"><h2><Ruler size={12} /> Your swatch</h2>
          {(materialized.state.trials ?? []).length === 0 ? <p className="garment-help">No measurements yet.</p> : <ul className="trial-list">{materialized.state.trials!.map((trial) => <li key={trial.id}>{trial.recordedAt.slice(0, 10)} · {trial.outcome}{trial.bodyGauge ? ` · ${trial.bodyGauge.stitchesPer10cm} st / ${trial.bodyGauge.rowsPer10cm} rows` : ''}{trial.synthetic ? ' (test data)' : ''}</li>)}</ul>}
          <button type="button" className="secondary-button motif-add" onClick={() => setShowMeasure(true)}>Enter measurements</button>
        </section>
      </> : null} onWidth={(width) => Number.isInteger(width) && width > 0 && width <= AUTHORED_CAPACITY_LIMITS_V1.chartWidth && width !== chart.width && commit({ kind: 'set-width', width, fillPaletteIndex: activePaletteIndex })} onHeight={(height) => { if (!Number.isInteger(height) || height < 1 || height > AUTHORED_CAPACITY_LIMITS_V1.chartHeight || height === chart.height) return; const count = Math.max(0, height - chart.height); commit({ kind: 'set-height', height, fillPaletteIndex: activePaletteIndex, newRowIds: Array.from({ length: count }, () => makeRowId()) }); }} onNeedleOffset={(needleOffset) => Number.isInteger(needleOffset) && needleOffset !== materialized.state.machine.needleOffset && commit({ kind: 'set-needle-offset', needleOffset })} onStrategy={(technique) => { if (technique === materialized.state.strategy.technique) return; if (isGarment && (technique === 'fairisle' || technique === 'birdseye')) fit({ backing: technique }, `Backing: ${technique}`); else commit({ kind: 'set-strategy', strategy: { ...materialized.state.strategy, technique } }); }} onFloatLimit={(floatLimit) => Number.isInteger(floatLimit) && floatLimit >= 1 && floatLimit <= 30 && floatLimit !== materialized.state.strategy.floatLimit && commit({ kind: 'set-strategy', strategy: { ...materialized.state.strategy, floatLimit } })} onAssignment={(paletteId, carrier, yarnName) => { const current = materialized.state.machine.yarnAssignments.find((item) => item.paletteId === paletteId); if (current?.carrier !== carrier || current.yarnName !== yarnName) commit({ kind: 'set-yarn-assignment', assignment: { paletteId, carrier, yarnName } }); }} />
    <section className="sweater-stage" aria-label={kindName}>
      <header className="stage-head">
        <span className="stage-title">{kindName}</span>
        <ViewSwitch view={view} onView={onView} />
      </header>
      {issue && <p className="stage-error" role="alert">{issue}<button type="button" className="link-button" onClick={() => setIssue(null)}>Dismiss</button></p>}
      <div className={`stage-body${view === 'design' ? ' chart-stage-body' : ''}`}>{center}</div>
    </section>
    <StatusPanel
      tone={tone}
      title={story?.headline ?? (storyPending ? 'Checking…' : 'Cannot knit yet')}
      detail={story?.status === 'ready' ? '' : story?.detail ?? ''}
      notes={notes}
      files={[{ id: 'file', name: kindName, fileName, facts: `${chart.width} st · ${chart.height} rows${kcode ? ` · ${kcode.passCount.toLocaleString()} passes` : ''}`, state: fileState, error: fileState === 'blocked' ? story?.detail ?? null : null }]}
      onOpenFile={() => onView('file')}
      onDownloadFile={status.onDownloadKc}
      onPackage={status.onPackage}
      onPrint={status.onPrint}
      packaging={status.packaging}
      canPackage={status.exportReady}
      canPrint={status.exportReady}
      atTheMachine={story?.operatorChecks ?? []}
      footer={story?.notices.map((notice) => <p className="design-hint" role="note" key={notice}>{notice}</p>)}
    />
    {intake && <ImageIntakeDialog state={materialized.state} replacing={intake.replacing} refresh={intake.refresh} onClose={() => setIntake(null)} onPlace={(placement, label) => { if (operate(label, [{ kind: 'set-placement', placement }])) { setSelectedPlacement(placement.id); setIntake(null); onView('design'); setFitRequest((request) => request + 1); } }} />}
    {showMeasure && <MeasureDialog project={project} hasCuff={beanieObjectOf(materialized.state)?.construction === 'rib-cuff-jersey-body'} candidateSha256={candidateSha256} onClose={() => setShowMeasure(false)} onRecord={(label, edits) => { if (operate(label, edits)) setShowMeasure(false); }} />}
  </main>;
}
