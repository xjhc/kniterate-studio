import { Clipboard, ClipboardPaste, Eraser, Maximize, MousePointer2, PaintBucket, Pencil, Redo2, Scan, Slash, SquareDashedMousePointer, Scissors, SquareIcon, Trash2, Undo2, ZoomIn, ZoomOut } from 'lucide-react';

export type ChartTool = 'pen' | 'select' | 'move' | 'line' | 'rectangle' | 'erase' | 'fill';

const tools: Array<{ id: ChartTool; label: string; key: string; hint?: string; icon: typeof Pencil }> = [
  { id: 'pen', label: 'Pen', key: 'P', icon: Pencil }, { id: 'select', label: 'Select', key: 'S', hint: 'Ctrl/Cmd+C copy, +X cut, +V paste, Delete clear', icon: SquareDashedMousePointer }, { id: 'move', label: 'Move selection', key: 'M', icon: MousePointer2 }, { id: 'line', label: 'Line', key: 'L', icon: Slash }, { id: 'rectangle', label: 'Rectangle', key: 'R', icon: SquareIcon }, { id: 'erase', label: 'Eraser', key: 'E', icon: Eraser }, { id: 'fill', label: 'Flood fill', key: 'F', icon: PaintBucket },
];

export function ChartToolbar({ active, onTool, onUndo, onRedo, onCopy, onCut, onPaste, onDelete, onZoomIn, onZoomOut, onZoomSelection, canUndo, canRedo, hasSelection, canPaste }: {
  active: ChartTool; onTool: (tool: ChartTool) => void; onUndo: () => void; onRedo: () => void; onCopy: () => void; onCut: () => void; onPaste: () => void; onDelete: () => void; onZoomIn: () => void; onZoomOut: () => void; onZoomSelection: () => void; canUndo: boolean; canRedo: boolean; hasSelection: boolean; canPaste: boolean;
}) {
  return <div className="chart-toolbar" aria-label="Chart tools">
    <div className="tool-group">{tools.map(({ id, label, key, hint, icon: Icon }) => <button className={active === id ? 'active' : ''} type="button" key={id} onClick={() => onTool(id)} title={`${label} (${key})${hint ? `. ${hint}` : ''}`} aria-label={label}><Icon size={16} /></button>)}</div>
    <div className="tool-group"><button type="button" onClick={onUndo} disabled={!canUndo} title="Undo" aria-label="Undo"><Undo2 size={16} /></button><button type="button" onClick={onRedo} disabled={!canRedo} title="Redo" aria-label="Redo"><Redo2 size={16} /></button></div>
    {(hasSelection || canPaste) && <div className="tool-group" aria-label="Selection actions">
      {hasSelection && <><button type="button" onClick={onCopy} title="Copy selection" aria-label="Copy selection"><Clipboard size={16} /></button><button type="button" onClick={onCut} title="Cut selection" aria-label="Cut selection"><Scissors size={16} /></button></>}
      {canPaste && <button type="button" onClick={onPaste} title="Paste" aria-label="Paste"><ClipboardPaste size={16} /></button>}
      {hasSelection && <button type="button" onClick={onDelete} title="Clear selection" aria-label="Delete selection"><Trash2 size={16} /></button>}
    </div>}
    <div className="tool-group"><button type="button" onClick={onZoomOut} title="Zoom out" aria-label="Zoom out"><ZoomOut size={16} /></button><button type="button" onClick={onZoomIn} title="Zoom in" aria-label="Zoom in"><ZoomIn size={16} /></button>{hasSelection
      ? <button type="button" onClick={onZoomSelection} title="Zoom to selection" aria-label="Zoom to selection"><Scan size={16} /></button>
      : <button type="button" onClick={onZoomSelection} title="Fit chart" aria-label="Fit chart"><Maximize size={16} /></button>}</div>
  </div>;
}
