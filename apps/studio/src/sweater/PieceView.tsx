import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { Maximize2, RotateCcw, Trash2, ZoomIn, ZoomOut } from 'lucide-react';
import { sampleEdge, type EdgeKind, type Point, type ShapePoint } from './draft';
import type { PanelPlan, ShapingEvent } from './rasterize';
import { pieceRhythm, type RhythmStep } from './rhythm';
import { inkFor, STITCH_NAMES } from './TextureSwatch';

/**
 * One piece, stitch by stitch, at knitted proportions: each cell is a
 * stitch (wide) by a row (short), drawn as on the swatches, with the shaping
 * listed as a machine knitter reads it. In shape mode the piece's edge is a
 * handful of key points to drag, add, type in or delete; the rows follow.
 */

const EVENT_TEXT: Record<ShapingEvent['kind'], (event: ShapingEvent) => string> = {
  'bind-off': (event) => `bind off ${event.stitches}`,
  decrease: (event) => `decrease ${event.stitches}`,
  increase: () => 'increase 1',
  'neck-split': (event) => `neck: bind off the centre ${event.stitches}`,
};

const EDGE_TEXT: Record<ShapingEvent['edge'], string> = { left: 'left edge', right: 'right edge', 'neck-left': 'left neck edge', 'neck-right': 'right neck edge', centre: 'centre' };

export function describeRow(raster: PanelPlan, row: number): string {
  const segments = raster.rows[row]!.segments;
  const stitches = segments.reduce((sum, segment) => sum + segment.hi - segment.lo + 1, 0);
  const events = raster.events.filter((event) => event.row === row).map((event) => `${EVENT_TEXT[event.kind](event)}${event.kind === 'neck-split' ? '' : ` at the ${EDGE_TEXT[event.edge]}`}`);
  const zone = raster.rows[row]!.zone === 'rib' ? 'rib' : 'body';
  return `Row ${row + 1} · ${stitches} stitches${segments.length === 2 ? ` (${segments.map((segment) => segment.hi - segment.lo + 1).join(' + ')})` : ''} · ${zone}${events.length ? ` · ${events.join(', ')}` : ''}`;
}

function shade(hex: string, amount: number): string {
  const value = Number.parseInt(hex.slice(1), 16);
  const channel = (shift: number) => Math.max(0, Math.min(255, Math.round(((value >> shift) & 255) * (1 + amount))));
  return `rgb(${channel(16)}, ${channel(8)}, ${channel(0)})`;
}

/** The piece's editable edge, when it has one (the neckband has none). */
export interface EdgeEditor {
  kind: EdgeKind;
  edge: ShapePoint[];
  /** The knitter's own shape rather than the style's. */
  custom: boolean;
  /** The drafted outline of the whole piece, for reference. */
  outline: readonly Point[];
  onChange: (edge: ShapePoint[], label: string) => void;
  onReset: () => void;
}

const snap = (cm: number) => Math.round(cm * 2) / 2;
const round1 = (cm: number) => Math.round(cm * 10) / 10;

/** A key point's name: its role, or its place. */
export function pointName(kind: EdgeKind, edge: readonly ShapePoint[], index: number): string {
  if (edge[index]?.underarm) return kind === 'body' ? 'underarm' : 'underarm (cap start)';
  if (index === 0) return kind === 'body' ? 'hem' : 'cuff';
  if (index === edge.length - 1) return kind === 'body' ? 'shoulder point' : 'top of the sleeve';
  return `point ${index + 1}`;
}

function RhythmList({ title, steps, onHover }: { title: string; steps: readonly RhythmStep[]; onHover: (step: RhythmStep | null) => void }) {
  if (steps.length === 0) return null;
  return <section>
    <h4>{title}</h4>
    <ol>{steps.map((step, index) => <li key={index} className={`rhythm-${step.kind}`} onMouseEnter={() => onHover(step)} onMouseLeave={() => onHover(null)}>{step.text}</li>)}</ol>
  </section>;
}

export type PieceMode = 'stitches' | 'shape' | 'file';

export function PieceView({ raster, hex, label, editor, machineFile, mode, onMode: setMode }: { raster: PanelPlan; hex: string; label: string; editor?: EdgeEditor; machineFile?: ReactNode; mode: PieceMode; onMode: (mode: PieceMode) => void }) {
  const host = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const overlay = useRef<SVGSVGElement>(null);
  const [room, setRoom] = useState({ width: 640, height: 640 });
  const [zoom, setZoom] = useState(1);
  const [hover, setHover] = useState<{ row: number; needle: number | null; x: number; y: number } | null>(null);
  const [highlight, setHighlight] = useState<RhythmStep | null>(null);
  const [drag, setDrag] = useState<{ index: number; edge: ShapePoint[]; moved: boolean } | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  useEffect(() => {
    // The space the piece may fill: its container's width less the ruler and the shaping list,
    // and the scrolling stage's height below the piece's header.
    const element = host.current?.parentElement;
    const stage = element?.parentElement;
    if (!element || !stage) return;
    const measure = () => {
      const below = host.current!.getBoundingClientRect().top - stage.getBoundingClientRect().top + stage.scrollTop;
      setRoom({ width: Math.max(240, element.clientWidth - 36 - 34 - 260 - 24), height: Math.max(320, stage.clientHeight - below - 24) });
    };
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    observer.observe(stage);
    return () => observer.disconnect();
  }, []);
  useEffect(() => { if ((!editor && mode === 'shape') || (!machineFile && mode === 'file')) setMode('stitches'); }, [editor, machineFile, mode, setMode]);
  useEffect(() => { if (selected !== null && editor && selected >= editor.edge.length) setSelected(null); }, [editor, selected]);
  const lo = Math.min(...raster.rows.map((row) => row.segments[0]!.lo));
  const hi = Math.max(...raster.rows.map((row) => row.segments.at(-1)!.hi));
  const columns = hi - lo + 1;
  // Pixels per cm: at zoom 1 the whole piece (and, when shaping, the room above it) fits; zooming in shows the stitches.
  const pieceCm = raster.rows.reduce((sum, row) => sum + (row.zone === 'rib' ? raster.rowCm.rib : raster.rowCm.body), 0) + (editor && mode === 'shape' ? 12 : 0);
  const fit = Math.max(2, Math.min(18, room.width / (columns * raster.stitchCm), room.height / pieceCm));
  const scale = fit * zoom;
  const cellW = raster.stitchCm * scale;
  const heights = raster.rows.map((row) => (row.zone === 'rib' ? raster.rowCm.rib : raster.rowCm.body) * scale);
  const tops = useMemo(() => {
    const total = heights.reduce((sum, height) => sum + height, 0);
    let y = total;
    return heights.map((height) => (y -= height));
  }, [heights.join(',')]);
  const total = heights.reduce((sum, height) => sum + height, 0);
  // Room above the knitted rows so a raised shoulder or cap can be dragged up.
  const headroom = editor && mode === 'shape' ? Math.round(12 * scale) : 0;
  const width = Math.ceil(columns * cellW);
  const height = Math.ceil(total);
  const rhythm = useMemo(() => pieceRhythm(raster), [raster]);
  // cm ↔ px on the canvas: x from the centre line, y up from the cast-on.
  const xOrigin = (raster.centre - lo) * cellW;
  const px = (point: Point) => ({ x: xOrigin + point.x * scale, y: headroom + height - point.y * scale });

  useEffect(() => {
    const element = canvas.current;
    if (!element) return;
    const ratio = window.devicePixelRatio || 1;
    element.width = Math.ceil(width * ratio);
    element.height = Math.ceil(height * ratio);
    const context = element.getContext('2d')!;
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, width, height);
    const ink = inkFor(hex);
    const purl = shade(hex, -0.22);
    const rib = shade(hex, -0.08);
    const detail = cellW >= 6;
    raster.rows.forEach((row, index) => {
      const y = tops[index]!;
      const h = heights[index]!;
      for (const segment of row.segments) {
        for (let needle = segment.lo; needle <= segment.hi; needle++) {
          const stitch = raster.stitchAt(index, needle);
          const x = (needle - lo) * cellW;
          context.fillStyle = stitch === 'p' || stitch === 'u' ? purl : row.zone === 'rib' ? rib : hex;
          context.fillRect(x, y, cellW + 0.4, h + 0.4);
          if (!detail) continue;
          context.strokeStyle = ink;
          context.lineWidth = Math.max(0.6, cellW * 0.08);
          context.beginPath();
          if (stitch === 'k') { context.moveTo(x + cellW * 0.2, y + h * 0.2); context.lineTo(x + cellW / 2, y + h * 0.8); context.lineTo(x + cellW * 0.8, y + h * 0.2); }
          else if (stitch === 'p') { context.moveTo(x + cellW * 0.22, y + h / 2); context.lineTo(x + cellW * 0.78, y + h / 2); }
          else if (stitch === 't' || stitch === 'u') context.arc(x + cellW / 2, y + h / 2, Math.min(cellW, h) * 0.25, 0, Math.PI * 2);
          else { context.moveTo(x + cellW / 2, y + h * 0.1); context.lineTo(x + cellW / 2, y + h * 0.9); }
          context.stroke();
        }
      }
    });
    // Shaping: a tick where each decrease or increase happens, a bar over each bound-off span.
    context.fillStyle = '#d4553d';
    for (const event of raster.events) {
      const row = raster.rows[event.row]!;
      const y = tops[event.row]!;
      const h = heights[event.row]!;
      const segment = event.edge === 'neck-right' || (event.edge === 'right' && row.segments.length === 2) ? row.segments[1]! : row.segments[0]!;
      const edgeX = (needle: number) => (needle - lo) * cellW;
      if (event.kind === 'neck-split') {
        context.fillRect(edgeX(row.segments[0]!.hi + 1), y + h - 1.5, (row.segments[1]!.lo - row.segments[0]!.hi - 1) * cellW, 1.5);
      } else if (event.kind === 'bind-off') {
        const old = event.edge === 'left' || event.edge === 'neck-right' ? segment.lo - event.stitches : segment.hi + 1;
        context.fillRect(edgeX(old), y + h - 1.5, event.stitches * cellW, 1.5);
      } else {
        const right = event.edge === 'right' || event.edge === 'neck-left';
        const x = right ? edgeX((event.edge === 'neck-left' ? row.segments[0]! : row.segments.at(-1)!).hi + 1) - 2 : edgeX(segment.lo);
        context.fillRect(x, y, 2, h);
      }
    }
  }, [raster, hex, width, height, cellW, lo, tops, heights]);

  const locate = (clientX: number, clientY: number, rect: DOMRect) => {
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    const row = tops.findIndex((top, index) => y >= top && y < top + heights[index]!);
    if (row < 0) return null;
    const needle = lo + Math.floor(x / cellW);
    const inside = raster.rows[row]!.segments.some((segment) => needle >= segment.lo && needle <= segment.hi);
    return { row, needle: inside ? needle : null, x, y };
  };

  // Shape editing: the live edge while dragging, else the piece's.
  const edge = drag?.edge ?? editor?.edge ?? [];
  const toCm = (event: ReactPointerEvent<SVGElement>) => {
    const rect = overlay.current!.getBoundingClientRect();
    return { x: (event.clientX - rect.left - xOrigin) / scale, y: (headroom + height - (event.clientY - rect.top)) / scale };
  };
  const constrained = (points: ShapePoint[], index: number, x: number, y: number): ShapePoint[] => {
    const prev = points[index - 1];
    const next = points[index + 1];
    const nextX = Math.max(1, Math.min(125, snap(x)));
    const nextY = index === 0 ? 0 : Math.max(prev?.y ?? 0, Math.min(next?.y ?? 250, snap(y)));
    return points.map((point, k) => (k === index ? { ...point, x: nextX, y: nextY } : point));
  };
  const commit = (next: ShapePoint[], what: string) => { if (editor) editor.onChange(next.map((point) => ({ ...point, x: round1(point.x), y: round1(point.y) })), what); };
  const describePoint = (points: readonly ShapePoint[], index: number) => `${pointName(editor!.kind, points, index)} at ${round1(points[index]!.x * 2)} cm wide, ${round1(points[index]!.y)} cm up`;
  const onKey = (event: KeyboardEvent) => {
    if (!editor || selected === null || mode !== 'shape' || (event.target as HTMLElement | null)?.closest('input, select, textarea')) return;
    if ((event.key === 'Delete' || event.key === 'Backspace') && removable(selected)) { event.preventDefault(); remove(selected); }
  };
  useEffect(() => { window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey); });
  const removable = (index: number) => editor !== undefined && index > 0 && index < editor.edge.length - 1 && !editor.edge[index]!.underarm;
  const remove = (index: number) => { if (!editor) return; const name = pointName(editor.kind, editor.edge, index); commit(editor.edge.filter((_, k) => k !== index), `Remove the ${name} from the ${editor.kind} shape`); setSelected(null); };
  const insert = (index: number) => {
    if (!editor) return;
    const a = editor.edge[index - 1]!;
    const b = editor.edge[index]!;
    // The new point splits the edge; both halves keep its curve.
    const point: ShapePoint = { x: snap((a.x + b.x) / 2), y: snap((a.y + b.y) / 2), ...(b.curve ? { curve: b.curve } : {}) };
    const next = [...editor.edge.slice(0, index), point, ...editor.edge.slice(index)];
    commit(next, `Add a point to the ${editor.kind} shape at ${round1(point.y)} cm up`);
    setSelected(index);
  };
  const point = editor && selected !== null ? editor.edge[selected] : undefined;
  const sampled = sampleEdge(edge);
  const toPath = (points: readonly Point[], mirrorX = false) => points.map((p, k) => { const q = px({ x: mirrorX ? -p.x : p.x, y: p.y }); return `${k === 0 ? 'M' : 'L'}${q.x.toFixed(1)} ${q.y.toFixed(1)}`; }).join('');
  const outlinePath = editor ? `${toPath(editor.outline)}Z` : '';

  return <>
  <div className="piece-toolbar">
    {mode !== 'file' && <div className="piece-zoom" role="group" aria-label="Zoom">
      <button type="button" className="icon-button" onClick={() => setZoom((value) => Math.max(1, value / 1.6))} disabled={zoom <= 1} aria-label="Zoom out" title="Zoom out"><ZoomOut size={15} /></button>
      <button type="button" className="icon-button" onClick={() => setZoom(1)} disabled={zoom === 1} aria-label="Fit the piece" title="Fit"><Maximize2 size={15} /></button>
      <button type="button" className="icon-button" onClick={() => setZoom((value) => Math.min(8, value * 1.6))} disabled={zoom >= 8} aria-label="Zoom in" title="Zoom in to see the stitches"><ZoomIn size={15} /></button>
    </div>}
    {(editor || machineFile) && <div className="piece-mode" role="tablist" aria-label="Piece view">
      <button type="button" role="tab" aria-selected={mode === 'stitches'} className={mode === 'stitches' ? 'active' : ''} onClick={() => setMode('stitches')}>Stitches</button>
      {editor && <button type="button" role="tab" aria-selected={mode === 'shape'} className={mode === 'shape' ? 'active' : ''} onClick={() => setMode('shape')}>Shape</button>}
      {machineFile && <button type="button" role="tab" aria-selected={mode === 'file'} className={mode === 'file' ? 'active' : ''} onClick={() => setMode('file')}>Machine file</button>}
    </div>}
    <span className="piece-hint">{mode === 'file' ? 'Exactly what this piece\'s .kc tells the machine to do, read back from the file.' : mode === 'shape' ? editor?.kind === 'body' ? 'Drag a point. Click + on an edge to add one. Front and back share this edge, so the side seams match.' : 'Drag a point. Click + on an edge to add one. The cuff is at the bottom.' : cellW >= 6 ? 'Hover a row to see what the machine does there.' : 'Zoom in to see the stitches; hover a row for its shaping.'}</span>
  </div>
  {editor && mode === 'shape' && <div className="shape-bar">
    <span className={`shape-source${editor.custom ? ' custom' : ''}`}>{editor.custom ? 'Your shape — the measurements no longer draw it' : 'Drawn from your measurements — dragging makes it your own'}</span>
    {editor.custom && <button type="button" className="secondary-button" onClick={editor.onReset}><RotateCcw size={14} />Back to measurements</button>}
    {point && selected !== null && <div className="shape-point" role="group" aria-label="Selected point">
      <b>{pointName(editor.kind, editor.edge, selected)[0]!.toUpperCase() + pointName(editor.kind, editor.edge, selected).slice(1)}</b>
      <label>Width<input type="number" step="0.5" min="2" max="250" key={`w-${selected}-${point.x}`} defaultValue={round1(point.x * 2)} aria-label="Point width (cm)" onBlur={(event) => { const value = Number(event.currentTarget.value) / 2; if (value >= 1 && value !== point.x) commit(constrained(editor.edge, selected, value, point.y), `Move the ${describePoint(constrained(editor.edge, selected, value, point.y), selected)}`); }} onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur(); }} /><i>cm</i></label>
      <label>Height<input type="number" step="0.5" min="0" max="250" key={`h-${selected}-${point.y}`} defaultValue={round1(point.y)} disabled={selected === 0} aria-label="Point height (cm)" onBlur={(event) => { const value = Number(event.currentTarget.value); if (Number.isFinite(value) && value !== point.y) commit(constrained(editor.edge, selected, point.x, value), `Move the ${describePoint(constrained(editor.edge, selected, point.x, value), selected)}`); }} onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur(); }} /><i>cm</i></label>
      {selected > 0 && <label>Edge to here<select value={point.curve ?? 'line'} aria-label="Edge shape" onChange={(event) => { const curve = event.currentTarget.value; commit(editor.edge.map((item, k) => (k !== selected ? item : curve === 'line' ? { x: item.x, y: item.y, ...(item.underarm ? { underarm: true as const } : {}) } : { ...item, curve: curve as 'concave' | 'convex' })), `Make the edge to the ${pointName(editor.kind, editor.edge, selected)} ${curve === 'line' ? 'straight' : curve === 'concave' ? 'curve in' : 'curve out'}`); }}><option value="line">Straight</option><option value="concave">Curve in</option><option value="convex">Curve out</option></select></label>}
      {removable(selected) && <button type="button" className="icon-button" onClick={() => remove(selected)} aria-label="Remove the point" title="Remove the point (Delete)"><Trash2 size={15} /></button>}
    </div>}
  </div>}
  {mode === 'file' && machineFile}
  <div className="piece-view" ref={host} hidden={mode === 'file'}>
    <div className="piece-ruler" style={{ height: height + headroom }} aria-hidden="true">
      {raster.rows.map((_, index) => (index + 1) % 20 === 0 || index === 0 ? <span key={index} style={{ top: headroom + tops[index]! - 6 }}>{index + 1}</span> : null)}
    </div>
    <div className="piece-canvas-wrap" style={{ width, height, paddingTop: headroom }}>
      <canvas ref={canvas} style={{ width, height }} role="img" aria-label={`${label}: ${raster.rows.length} rows, ${raster.realized.castOnStitches} stitches cast on`}
        onMouseMove={(event) => setHover(locate(event.clientX, event.clientY, event.currentTarget.getBoundingClientRect()))}
        onMouseLeave={() => setHover(null)} />
      {highlight && <div className="piece-highlight" style={{ top: headroom + tops[highlight.to]!, height: tops[highlight.from]! + heights[highlight.from]! - tops[highlight.to]! }} />}
      {mode === 'stitches' && hover && <div className="piece-hover-row" style={{ top: headroom + tops[hover.row]!, height: heights[hover.row] }} />}
      {mode === 'stitches' && hover && <div className="piece-tooltip" style={{ left: Math.min(hover.x + 14, width - 220), top: headroom + Math.max(0, hover.y - 44) }}>
        <b>{describeRow(raster, hover.row)}</b>
        {hover.needle !== null && <span>Stitch {hover.needle - raster.rows[hover.row]!.segments[0]!.lo + 1}: {STITCH_NAMES[raster.stitchAt(hover.row, hover.needle)]}</span>}
      </div>}
      {editor && mode === 'shape' && <svg ref={overlay} className="shape-overlay" width={width} height={height + headroom} role="group" aria-label={`${editor.kind === 'body' ? 'Body' : 'Sleeve'} shape points`}
        onPointerMove={(event) => { if (!drag) return; const cm = toCm(event); setDrag({ ...drag, edge: constrained(drag.edge, drag.index, cm.x, cm.y), moved: true }); }}
        onPointerUp={() => { if (!drag) return; if (drag.moved) commit(drag.edge, `Move the ${describePoint(drag.edge, drag.index)}`); setDrag(null); }}
        onPointerCancel={() => setDrag(null)}>
        <path className="shape-outline" d={outlinePath} />
        <path className="shape-edge" d={toPath(sampled)} />
        <path className="shape-edge mirror" d={toPath(sampled, true)} />
        {edge.slice(1).map((item, k) => {
          const a = px(edge[k]!);
          const b = px(item);
          return <g key={`add-${k}`} className="shape-add" role="button" tabIndex={0} aria-label={`Add a point between the ${pointName(editor.kind, edge, k)} and the ${pointName(editor.kind, edge, k + 1)}`}
            onClick={() => insert(k + 1)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); insert(k + 1); } }}>
            <circle cx={(a.x + b.x) / 2} cy={(a.y + b.y) / 2} r={7} /><path d={`M${(a.x + b.x) / 2 - 3.5} ${(a.y + b.y) / 2}h7M${(a.x + b.x) / 2} ${(a.y + b.y) / 2 - 3.5}v7`} />
          </g>;
        })}
        {edge.map((item, index) => {
          const q = px(item);
          const mirrorQ = px({ x: -item.x, y: item.y });
          const name = pointName(editor.kind, edge, index);
          return <g key={index}>
            <circle className="shape-handle mirror" cx={mirrorQ.x} cy={mirrorQ.y} r={5} />
            <circle className={`shape-handle${item.underarm ? ' role' : ''}${selected === index ? ' selected' : ''}`} cx={q.x} cy={q.y} r={drag?.index === index ? 9 : 7} role="button" tabIndex={0}
              aria-label={`${name[0]!.toUpperCase()}${name.slice(1)}: ${round1(item.x * 2)} cm wide, ${round1(item.y)} cm up. Drag to move.`}
              onPointerDown={(event) => { event.preventDefault(); (event.target as SVGElement).setPointerCapture(event.pointerId); setSelected(index); setDrag({ index, edge: editor.edge, moved: false }); }}
              onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setSelected(index); } }}>
              <title>{name}</title>
            </circle>
            {(drag?.index === index || selected === index) && <text className="shape-label" x={q.x + 12} y={q.y - 10}>{round1(item.x * 2)} cm wide · {round1(item.y)} cm up</text>}
          </g>;
        })}
      </svg>}
    </div>
    <aside className="piece-rhythm" aria-label="Shaping">
      <h3>Shaping <small>each side</small></h3>
      <RhythmList title="Edges" steps={rhythm.edge} onHover={setHighlight} />
      <RhythmList title="Neck" steps={rhythm.neck} onHover={setHighlight} />
      {rhythm.edge.length === 0 && rhythm.neck.length === 0 && <p className="design-hint">Straight: no shaping.</p>}
      <p className="design-hint">The right side mirrors the left; a bind-off there comes one row later, where its yarn starts the row.</p>
    </aside>
  </div>
  </>;
}
