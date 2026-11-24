import { useLayoutEffect, useMemo, useRef, useState, type PointerEvent } from 'react';
import { pen, type PixelCell, type Point } from '@knitlab/colorwork-core';
import { Redo2, Undo2 } from 'lucide-react';
import type { TrianglePalette, TrianglePlan } from './triangle';

const locations = {
  border: { name: 'Border curls', x: .56, y: .09 },
  field: { name: 'Small paisleys', x: .5, y: .32 },
  slope: { name: 'Sloping border', x: .72, y: .51 },
  centre: { name: 'Centre point', x: .5, y: .89 },
  tie: { name: 'Tie end', x: .093, y: .055 },
};
type Location = keyof typeof locations;

export function ScarfPixelEditor({ plan, cells, image, reverse, palette, onReverse, onPaint, undo, redo }: {
  plan: TrianglePlan; cells: number[][]; image: string; reverse: boolean; palette: TrianglePalette;
  onReverse: (reverse: boolean) => void; onPaint: (stroke: PixelCell[]) => void;
  undo?: () => void; redo?: () => void;
}) {
  const viewport = useRef<HTMLDivElement>(null);
  const stroke = useRef<Point[] | null>(null);
  const [preview, setPreview] = useState<PixelCell[]>([]);
  const [location, setLocation] = useState<Location>(() => {
    const detail = new URLSearchParams(window.location.search).get('detail');
    return detail && Object.hasOwn(locations, detail) ? detail as Location : 'border';
  });
  const [zoom, setZoom] = useState(8);
  const [ink, setInk] = useState(1);
  const [grid, setGrid] = useState(true);
  const [cursor, setCursor] = useState<Point | null>(null);
  const cellHeight = zoom * (plan.depthCm / plan.columns) / (plan.lengthCm / plan.rows);
  const target = useRef({ x: locations[location].x, y: locations[location].y });
  const chart = useMemo(() => ({ cells, height: plan.rows, width: plan.columns }), [cells, plan]);
  const allowed = ({row, column}: Point) => column >= 2 && column < (plan.widths[row] ?? 0) - 2;
  const visibleX = (row: number) => reverse ? plan.rows - 1 - row : row;

  function centreView() {
    const view = viewport.current;
    if (!view) return;
    view.scrollLeft = target.current.x * plan.rows * zoom - view.clientWidth / 2;
    view.scrollTop = target.current.y * plan.columns * cellHeight - view.clientHeight / 2;
  }
  useLayoutEffect(centreView, [location, zoom, cellHeight, plan]);
  function jump(next: Location) {
    target.current = locations[next];
    setLocation(next);
    centreView();
  }
  function flipFace(next: boolean) {
    const view = viewport.current;
    if (view) view.scrollLeft = plan.rows * zoom - view.clientWidth - view.scrollLeft;
    onReverse(next);
  }
  function changeZoom(next: number) {
    const view = viewport.current;
    if (view) target.current = {
      x: (view.scrollLeft + view.clientWidth / 2) / (plan.rows * zoom),
      y: (view.scrollTop + view.clientHeight / 2) / (plan.columns * cellHeight),
    };
    setZoom(next);
  }
  function pointAt(event: PointerEvent<HTMLDivElement>): Point {
    const box = event.currentTarget.getBoundingClientRect();
    const x = Math.floor((event.clientX - box.left) / zoom);
    return { row: visibleX(x), column: Math.floor((event.clientY - box.top) / cellHeight) };
  }
  function sample(event: PointerEvent<HTMLDivElement>) {
    const point = pointAt(event);
    setCursor(point);
    if (!stroke.current) return [];
    const last = stroke.current.at(-1);
    if (point.row !== last?.row || point.column !== last.column) stroke.current.push(point);
    return pen(chart, stroke.current, reverse ? 1 - ink : ink).cells.filter(allowed);
  }
  function stop() { stroke.current = null; setPreview([]); }

  return <section className="scarf-editor" aria-label="Scarf pixel editor">
    <div className="scarf-editor-tools">
      <label>Detail <select value={location} onChange={e => jump(e.target.value as Location)}>
        {Object.entries(locations).map(([key, value]) => <option key={key} value={key}>{value.name}</option>)}
      </select></label>
      <label>Zoom <select value={zoom} onChange={e => changeZoom(Number(e.target.value))}>
        {[3, 5, 8, 12, 18, 24].map(n => <option key={n} value={n}>{n}×</option>)}
      </select></label>
      <label><input type="checkbox" checked={grid} onChange={e => setGrid(e.target.checked)} /> Grid</label>
      <label>Face <select value={Number(reverse)} onChange={e => flipFace(Boolean(Number(e.target.value)))}>
        {palette.map((c,i) => <option key={c.id} value={i}>{c.name}</option>)}
      </select></label>
    </div>
    <div className="scarf-editor-tools">
      <span>Paint</span>{palette.map((color,i) => <button type="button" key={color.id} className="secondary-button" aria-pressed={ink === i} onClick={() => setInk(i)}>
        <i style={{background: color.hex}} />{color.name}
      </button>)}
      <button type="button" aria-label="Undo stroke" className="secondary-button" disabled={!undo} onClick={undo}><Undo2 size={16}/></button>
      <button type="button" aria-label="Redo stroke" className="secondary-button" disabled={!redo} onClick={redo}><Redo2 size={16}/></button>
    </div>
    <div className="scarf-pixel-scroll" ref={viewport}>
      <div className="scarf-pixel-surface" role="application" aria-label="Paint scarf stitches" style={{
        width: plan.rows * zoom, height: plan.columns * cellHeight, backgroundImage: `url(${image})`,
      }}
        onPointerDown={e => {
          if (!e.isPrimary || e.button !== 0) return;
          e.currentTarget.setPointerCapture(e.pointerId); stroke.current = []; setPreview(sample(e));
        }}
        onPointerMove={e => { if (e.isPrimary) { const marks = sample(e); if (stroke.current) setPreview(marks); } }}
        onPointerUp={e => { if (e.isPrimary && stroke.current) { onPaint(sample(e)); stop(); } }}
        onPointerCancel={stop} onLostPointerCapture={stop}>
        {preview.map(({row,column}) => <i key={row + '-' + column} style={{left: visibleX(row)*zoom, top: column*cellHeight, width: zoom, height: cellHeight, background: palette[ink]!.hex}}/>)}
        {grid && <div className="scarf-pixel-grid" style={{backgroundSize: `${zoom}px ${cellHeight}px`}}/>}
      </div>
    </div>
    <p>Drag to paint. Scroll to move around the scarf. <strong>Save project</strong> keeps your edits.</p>
    {cursor && <output>Course {cursor.row + 1} · Needle {cursor.column + 1}{allowed(cursor) ? '' : ' · Outside editable fabric'}</output>}
  </section>;
}
