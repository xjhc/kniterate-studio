import { Circle, Clipboard, ClipboardPaste, Eraser, FlipHorizontal2, FlipVertical2, Maximize, MousePointer2, PaintBucket, Pencil, Scan, Slash, SquareDashedMousePointer, Scissors, SquareIcon, Trash2, ZoomIn, ZoomOut } from 'lucide-react';
import type { MirrorAxes } from '@knitlab/colorwork-core';

export type ChartTool = 'pen' | 'select' | 'move' | 'line' | 'rectangle' | 'ellipse' | 'erase' | 'fill';

const tools: Array<{ id: ChartTool; label: string; key: string; hint?: string; icon: typeof Pencil }> = [
  { id: 'pen', label: 'Pen', key: 'P', icon: Pencil }, { id: 'select', label: 'Select', key: 'S', hint: 'Ctrl/Cmd+C copy, +X cut, +V paste, Delete clear', icon: SquareDashedMousePointer }, { id: 'move', label: 'Move selection', key: 'M', icon: MousePointer2 }, { id: 'line', label: 'Line', key: 'L', icon: Slash }, { id: 'rectangle', label: 'Rectangle', key: 'R', icon: SquareIcon }, { id: 'ellipse', label: 'Circle', key: 'C', hint: 'Drag out a circle or an oval', icon: Circle }, { id: 'erase', label: 'Eraser', key: 'E', icon: Eraser }, { id: 'fill', label: 'Flood fill', key: 'F', icon: PaintBucket },
];

/** Brush sizes, in stitches across. */
export const BRUSH_SIZES = [1, 2, 3, 5, 9] as const;
/** The tools that draw with the brush. */
export const BRUSH_TOOLS: readonly ChartTool[] = ['pen', 'erase', 'line', 'rectangle', 'ellipse'];

export function ChartToolbar({ active, onTool, brush, onBrush, mirror, onMirror, onCopy, onCut, onPaste, onDelete, onZoomIn, onZoomOut, onZoomSelection, hasSelection, canPaste }: {
  active: ChartTool; onTool: (tool: ChartTool) => void;
  /** Brush size in stitches across, for the drawing tools. */
  brush: number; onBrush: (size: number) => void;
  mirror: MirrorAxes; onMirror: (mirror: MirrorAxes) => void;
  onCopy: () => void; onCut: () => void; onPaste: () => void; onDelete: () => void; onZoomIn: () => void; onZoomOut: () => void; onZoomSelection: () => void; hasSelection: boolean; canPaste: boolean;
}) {
  return <div className="chart-toolbar" aria-label="Chart tools">
    <div className="tool-group">{tools.map(({ id, label, key, hint, icon: Icon }) => <button className={active === id ? 'active' : ''} type="button" key={id} onClick={() => onTool(id)} title={`${label} (${key})${hint ? `. ${hint}` : ''}`} aria-label={label}><Icon size={16} /></button>)}<span className="tool-name" aria-live="polite">{tools.find((tool) => tool.id === active)?.label}</span></div>
    {BRUSH_TOOLS.includes(active) && <div className="tool-group brush-sizes" role="group" aria-label="Brush size">{BRUSH_SIZES.map((size) => <button type="button" key={size} className={brush === size ? 'active' : ''} aria-pressed={brush === size} onClick={() => onBrush(size)} title={`${size} ${size === 1 ? 'stitch' : 'stitches'} across ([ and ] change it)`} aria-label={`Brush size ${size}`}><i className="brush-dot" style={{ width: 3 + size * 1.5, height: 3 + size * 1.5 }} /></button>)}</div>}
    <div className="tool-group" role="group" aria-label="Mirror">
      <button type="button" className={mirror.leftRight ? 'active' : ''} aria-pressed={mirror.leftRight} onClick={() => onMirror({ ...mirror, leftRight: !mirror.leftRight })} title="Mirror left and right: what you draw on one side is drawn on the other" aria-label="Mirror left and right"><FlipHorizontal2 size={16} /></button>
      <button type="button" className={mirror.topBottom ? 'active' : ''} aria-pressed={mirror.topBottom} onClick={() => onMirror({ ...mirror, topBottom: !mirror.topBottom })} title="Mirror top and bottom" aria-label="Mirror top and bottom"><FlipVertical2 size={16} /></button>
    </div>
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
