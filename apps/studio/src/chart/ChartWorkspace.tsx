import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { Download, Upload } from 'lucide-react';
import { clear, copy, cut, paste, type PixelClipboard, type Rect } from '@knitlab/colorwork-core';
import { appendProjectEdit, materializeColorworkProject, redoProjectEdit, undoProjectEdit, type ColorworkProjectV1, type ProjectEdit } from '@kniterate-studio/project-contract';
import { ChartToolbar, type ChartTool } from './ChartToolbar';
import { ColorworkCanvas } from './ColorworkCanvas';
import { PaletteRail } from './PaletteRail';
import { makeRowId, pixelMutationToProjectEdit } from './projectCanvasAdapter';
import { openStudioProjectJson } from './projectFile';
import { BlanketSetupRail } from '../blanket/BlanketSetupRail';
import type { BlanketCompileState } from '../blanket/useBlanketCompiler';

function entry(edit: ProjectEdit) { return { id: `edit_${crypto.randomUUID().replace(/-/g, '')}`, source: 'human' as const, edit }; }

export function ChartWorkspace({ project, onProject, isDarkMode, compile }: { project: ColorworkProjectV1; onProject: (project: ColorworkProjectV1) => void; isDarkMode: boolean; compile: BlanketCompileState }) {
  const [tool, setTool] = useState<ChartTool>('pen'); const [paletteIndex, setPaletteIndex] = useState(1); const [selection, setSelection] = useState<Rect | null>(null); const [clipboard, setClipboard] = useState<PixelClipboard | null>(null); const [zoom, setZoom] = useState(1);
  const [issue, setIssue] = useState<string | null>(null);
  const projectInput = useRef<HTMLInputElement>(null);
  const materialized = useMemo(() => materializeColorworkProject(project), [project]); const { chart, rowIds } = materialized.state;
  const activePaletteIndex = Math.min(paletteIndex, chart.palette.length - 1);
  const commit = (edit: ProjectEdit | null): boolean => {
    if (!edit) return false;
    try { onProject(appendProjectEdit(project, entry(edit))); setIssue(null); return true; }
    catch (error) { setIssue(error instanceof Error ? error.message : String(error)); return false; }
  };
  const commitMutation = (mutation: Parameters<typeof pixelMutationToProjectEdit>[2]) => commit(pixelMutationToProjectEdit(project, rowIds, mutation));
  useEffect(() => { if (paletteIndex >= chart.palette.length) setPaletteIndex(Math.max(0, chart.palette.length - 1)); }, [paletteIndex, chart.palette.length]);
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
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
  return <main className="chart-workspace">
    <div className="chart-head"><div><span className="eyebrow">Colorwork project</span><h1>{project.title}</h1></div><div className="chart-facts"><span>{chart.width} x {chart.height}</span><span>{chart.palette.length} colors</span><span>Row 1 bottom</span><button className="chart-file-button" type="button" onClick={() => projectInput.current?.click()} title="Open project" aria-label="Open project"><Upload size={15} /></button><button className="chart-file-button" type="button" onClick={saveProject} title="Save project" aria-label="Save project"><Download size={15} /></button></div></div>
    <input ref={projectInput} className="file-input" type="file" accept=".json,application/json" onChange={(event) => void openProject(event)} />
    {issue && <div className="chart-issue" role="alert">{issue}<button type="button" onClick={() => setIssue(null)} aria-label="Dismiss chart issue">×</button></div>}
    <ChartToolbar active={tool} onTool={setTool} onUndo={() => onProject(undoProjectEdit(project))} onRedo={() => onProject(redoProjectEdit(project))} onCopy={() => selection && setClipboard(copy(chart, selection))} onCut={() => { if (!selection) return; const result = cut(chart, selection); setClipboard(result.clipboard); commitMutation(result.mutation); }} onPaste={() => clipboard && commitMutation(paste(chart, clipboard, selection ? { column: selection.left, row: selection.top } : { column: 0, row: 0 }))} onDelete={() => selection && commitMutation(clear(chart, selection))} onZoomIn={() => setZoom(Math.min(3, zoom * 1.2))} onZoomOut={() => setZoom(Math.max(.35, zoom / 1.2))} onZoomSelection={() => setZoom(selection ? Math.min(2.5, Math.max(.6, 400 / Math.max(selection.right - selection.left + 1, selection.bottom - selection.top + 1) / 16)) : 1)} canUndo={project.history.cursor > 0} canRedo={project.history.cursor < project.history.entries.length} />
    <div className="chart-body"><PaletteRail chart={chart} active={activePaletteIndex} onSelect={setPaletteIndex} /><ColorworkCanvas chart={chart} tool={tool} paletteIndex={activePaletteIndex} selection={selection} onSelection={setSelection} onCommit={commitMutation} zoom={zoom} onZoomChange={setZoom} onInsertRow={(row) => commit({ kind: 'insert-row', rowId: makeRowId(), afterRowId: row === null ? null : rowIds[row]!, cells: Array(chart.width).fill(0) })} onDeleteRow={(row) => commit({ kind: 'delete-row', rowId: rowIds[row]! })} isDarkMode={isDarkMode} /><BlanketSetupRail state={materialized.state} compile={compile} onWidth={(width) => Number.isInteger(width) && width > 0 && width <= 252 && width !== chart.width && commit({ kind: 'set-width', width, fillPaletteIndex: activePaletteIndex })} onHeight={(height) => { if (!Number.isInteger(height) || height < 1 || height === chart.height) return; const count = Math.max(0, height - chart.height); commit({ kind: 'set-height', height, fillPaletteIndex: activePaletteIndex, newRowIds: Array.from({ length: count }, () => makeRowId()) }); }} onNeedleOffset={(needleOffset) => Number.isInteger(needleOffset) && needleOffset !== materialized.state.machine.needleOffset && commit({ kind: 'set-needle-offset', needleOffset })} onStrategy={(technique) => technique !== materialized.state.strategy.technique && commit({ kind: 'set-strategy', strategy: { ...materialized.state.strategy, technique } })} onAssignment={(paletteId, carrier, yarnName) => { const current = materialized.state.machine.yarnAssignments.find((item) => item.paletteId === paletteId); if (current?.carrier !== carrier || current.yarnName !== yarnName) commit({ kind: 'set-yarn-assignment', assignment: { paletteId, carrier, yarnName } }); }} onFrame={(frame) => { if (JSON.stringify(frame) !== JSON.stringify(materialized.state.frame)) commit({ kind: 'set-frame', frame }); }} /></div>
  </main>;
}
