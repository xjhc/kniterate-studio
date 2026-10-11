import { useEffect, useMemo, useRef, useState } from 'react';
import { Maximize2, ZoomIn, ZoomOut } from 'lucide-react';
import type { PanelPlan, ShapingEvent } from './rasterize';
import { inkFor, STITCH_NAMES } from './TextureSwatch';

/**
 * One piece, stitch by stitch, at knitted proportions: each cell is a
 * stitch (wide) by a row (short). Knit, purl, tuck and slip are drawn as on
 * the swatches; every shaping event is marked in the margin.
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

export function PieceView({ raster, hex, label }: { raster: PanelPlan; hex: string; label: string }) {
  const host = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [available, setAvailable] = useState(640);
  const [zoom, setZoom] = useState(1);
  const [hover, setHover] = useState<{ row: number; needle: number | null; x: number; y: number } | null>(null);
  useEffect(() => {
    // The space the piece may fill: its container, less the ruler and the shaping labels.
    const element = host.current?.parentElement;
    if (!element) return;
    const observer = new ResizeObserver(() => setAvailable(Math.max(240, element.clientWidth - 36 - 34 - 120 - 16)));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const lo = Math.min(...raster.rows.map((row) => row.segments[0]!.lo));
  const hi = Math.max(...raster.rows.map((row) => row.segments.at(-1)!.hi));
  const columns = hi - lo + 1;
  // Pixels per cm: at zoom 1 the widest row fills the space; zooming in shows the stitches.
  const fit = Math.max(2, Math.min(18, available / (columns * raster.stitchCm)));
  const scale = fit * zoom;
  const cellW = raster.stitchCm * scale;
  const heights = raster.rows.map((row) => (row.zone === 'rib' ? raster.rowCm.rib : raster.rowCm.body) * scale);
  const tops = useMemo(() => {
    const total = heights.reduce((sum, height) => sum + height, 0);
    let y = total;
    return heights.map((height) => (y -= height));
  }, [heights.join(',')]);
  const total = heights.reduce((sum, height) => sum + height, 0);
  const width = Math.ceil(columns * cellW);
  const height = Math.ceil(total);

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
  // Bind-offs and the neck split, labelled in the margin; labels closer than a line merge.
  const labels: { top: number; text: string }[] = [];
  for (const event of raster.events) {
    if (event.kind !== 'bind-off' && event.kind !== 'neck-split') continue;
    const text = event.kind === 'neck-split' ? `neck ${event.stitches}` : `${event.edge === 'right' || event.edge === 'neck-right' ? '→' : '←'}${event.stitches}`;
    const top = tops[event.row]! - 7;
    const last = labels.at(-1);
    if (last && Math.abs(last.top - top) < 15) last.text += ` ${text}`;
    else labels.push({ top, text });
  }
  return <>
  <div className="piece-zoom" role="group" aria-label="Zoom">
    <button type="button" className="icon-button" onClick={() => setZoom((value) => Math.max(1, value / 1.6))} disabled={zoom <= 1} aria-label="Zoom out" title="Zoom out"><ZoomOut size={15} /></button>
    <button type="button" className="icon-button" onClick={() => setZoom(1)} disabled={zoom === 1} aria-label="Fit the piece" title="Fit"><Maximize2 size={15} /></button>
    <button type="button" className="icon-button" onClick={() => setZoom((value) => Math.min(8, value * 1.6))} disabled={zoom >= 8} aria-label="Zoom in" title="Zoom in to see the stitches"><ZoomIn size={15} /></button>
    <span>{cellW >= 6 ? 'Stitches shown' : 'Zoom in to see the stitches'}</span>
  </div>
  <div className="piece-view" ref={host}>
    <div className="piece-ruler" style={{ height }} aria-hidden="true">
      {raster.rows.map((_, index) => (index + 1) % 20 === 0 || index === 0 ? <span key={index} style={{ top: tops[index]! - 6 }}>{index + 1}</span> : null)}
    </div>
    <div className="piece-canvas-wrap" style={{ width, height }}>
      <canvas ref={canvas} style={{ width, height }} role="img" aria-label={`${label}: ${raster.rows.length} rows, ${raster.realized.castOnStitches} stitches cast on`}
        onMouseMove={(event) => setHover(locate(event.clientX, event.clientY, event.currentTarget.getBoundingClientRect()))}
        onMouseLeave={() => setHover(null)} />
      {hover && <div className="piece-hover-row" style={{ top: tops[hover.row], height: heights[hover.row] }} />}
      {hover && <div className="piece-tooltip" style={{ left: Math.min(hover.x + 14, width - 220), top: Math.max(0, hover.y - 44) }}>
        <b>{describeRow(raster, hover.row)}</b>
        {hover.needle !== null && <span>Stitch {hover.needle - raster.rows[hover.row]!.segments[0]!.lo + 1}: {STITCH_NAMES[raster.stitchAt(hover.row, hover.needle)]}</span>}
      </div>}
    </div>
    <ol className="piece-events" style={{ height }} aria-label="Shaping">
      {labels.map((item, index) => <li key={index} style={{ top: item.top }} title="Stitches bound off: ← at the left edge, → at the right">{item.text}</li>)}
    </ol>
  </div>
  </>;
}
