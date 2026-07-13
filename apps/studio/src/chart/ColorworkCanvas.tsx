import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent } from 'react';
import {
  erase,
  floodFill,
  line,
  move,
  pen,
  rectangle,
  rectInChart,
  selectionFromPoints,
  translateRect,
  type Point,
  type Rect,
} from '@knitlab/colorwork-core';
import type { ColorworkChartV1 } from '@kniterate-studio/chart-contract';
import type { ChartTool } from './ChartToolbar';
import { CHART_GUTTER as GUTTER, rowGutterActionAt, selectionMoveDestination } from './canvasCoordinates';

const BASE_CELL = 16;

function rectContains(rect: Rect, point: Point): boolean {
  return point.column >= rect.left && point.column <= rect.right && point.row >= rect.top && point.row <= rect.bottom;
}

export function ColorworkCanvas({ chart, tool, paletteIndex, selection, onSelection, onCommit, zoom, onZoomChange, onInsertRow, onDeleteRow, isDarkMode, passCounts, focusedRow, onFocusRow }: {
  chart: ColorworkChartV1;
  tool: ChartTool;
  paletteIndex: number;
  selection: Rect | null;
  onSelection: (selection: Rect | null) => void;
  onCommit: (mutation: ReturnType<typeof pen>) => boolean;
  zoom: number;
  onZoomChange: (zoom: number) => void;
  onInsertRow: (afterRow: number | null) => void;
  onDeleteRow: (row: number) => void;
  isDarkMode: boolean;
  passCounts: ReadonlyMap<number, number>;
  focusedRow: number | null;
  onFocusRow: (row: number) => void;
}) {
  const viewport = useRef<HTMLDivElement>(null);
  const paintLayer = useRef<HTMLCanvasElement>(null);
  const uiLayer = useRef<HTMLCanvasElement>(null);
  const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 });
  const [scroll, setScroll] = useState({ left: 0, top: 0 });
  const [gesture, setGesture] = useState<{ start: Point; points: Point[]; pan?: { x: number; y: number } } | null>(null);
  const [keyboardPoint, setKeyboardPoint] = useState<Point>({ column: 0, row: 0 });
  const [keyboardActive, setKeyboardActive] = useState(false);
  const cell = BASE_CELL * zoom;
  const pixelChart = { width: chart.width, height: chart.height, cells: chart.cells };

  useEffect(() => {
    const element = viewport.current;
    if (!element) return;
    const update = () => setViewportSize({ width: element.clientWidth, height: element.clientHeight });
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const pointAt = (event: PointerEvent<HTMLCanvasElement>): Point | null => {
    const element = viewport.current;
    if (!element) return null;
    const bounds = event.currentTarget.getBoundingClientRect();
    const column = Math.floor((event.clientX - bounds.left + element.scrollLeft - GUTTER) / cell);
    const row = Math.floor((event.clientY - bounds.top + element.scrollTop) / cell);
    return column >= 0 && column < chart.width && row >= 0 && row < chart.height ? { column, row } : null;
  };

  const configureCanvas = (canvas: HTMLCanvasElement, width: number, height: number): CanvasRenderingContext2D => {
    const ratio = devicePixelRatio || 1;
    const physicalWidth = Math.max(1, Math.round(width * ratio));
    const physicalHeight = Math.max(1, Math.round(height * ratio));
    if (canvas.width !== physicalWidth || canvas.height !== physicalHeight) {
      canvas.width = physicalWidth;
      canvas.height = physicalHeight;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
    }
    const context = canvas.getContext('2d')!;
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, width, height);
    return context;
  };

  const drawBase = () => {
    const paintCanvas = paintLayer.current;
    if (!paintCanvas || viewportSize.width === 0 || viewportSize.height === 0) return;
    const { width, height } = viewportSize;
    const context = configureCanvas(paintCanvas, width, height);
    context.fillStyle = isDarkMode ? '#202422' : '#eceee9';
    context.fillRect(0, 0, width, height);
    const left = Math.max(0, Math.floor((scroll.left - GUTTER) / cell));
    const right = Math.min(chart.width - 1, Math.ceil((scroll.left + width - GUTTER) / cell));
    const top = Math.max(0, Math.floor(scroll.top / cell));
    const bottom = Math.min(chart.height - 1, Math.ceil((scroll.top + height) / cell));

    context.fillStyle = isDarkMode ? '#292e2b' : '#f7f6f1';
    context.fillRect(0, 0, Math.min(GUTTER, width), height);
    for (let row = top; row <= bottom; row += 1) {
      for (let column = left; column <= right; column += 1) {
        context.fillStyle = chart.palette[chart.cells[row]![column]!]!.hex;
        context.fillRect(GUTTER + column * cell - scroll.left, row * cell - scroll.top, cell + .5, cell + .5);
      }
    }

    context.strokeStyle = isDarkMode ? 'rgba(225, 232, 227, .17)' : 'rgba(44, 48, 45, .15)';
    context.lineWidth = 1;
    for (let column = left; column <= right + 1; column += 1) {
      const x = GUTTER + column * cell - scroll.left;
      context.beginPath(); context.moveTo(x, 0); context.lineTo(x, height); context.stroke();
    }
    for (let row = top; row <= bottom + 1; row += 1) {
      const y = row * cell - scroll.top;
      context.beginPath(); context.moveTo(0, y); context.lineTo(width, y); context.stroke();
      const displayRow = chart.rowNumbering === 'bottom-up' ? chart.height - row : row + 1;
      context.fillStyle = isDarkMode ? '#b2bbb5' : '#667069';
      context.font = '10px system-ui';
      context.fillText(String(displayRow), 4, y + Math.min(cell - 3, 12));
      const passCount = passCounts.get(row);
      if (passCount !== undefined) {
        context.fillStyle = row === focusedRow ? '#d86645' : isDarkMode ? '#d1d8d3' : '#48504b';
        context.fillText(`×${passCount}`, 24, y + Math.min(cell - 3, 12));
      }
      if (cell >= 12) {
        context.fillStyle = isDarkMode ? '#89938d' : '#8b938e';
        context.fillText('+', 50, y + Math.min(cell - 3, 12));
        context.fillText('−', 61, y + Math.min(cell - 3, 12));
      }
    }
  };

  const drawOverlay = () => {
    const canvas = uiLayer.current;
    if (!canvas || viewportSize.width === 0 || viewportSize.height === 0) return;
    const overlay = configureCanvas(canvas, viewportSize.width, viewportSize.height);
    const end = gesture?.points.at(-1) ?? gesture?.start;
    let currentSelection = selection;
    if (gesture && end && tool === 'select') currentSelection = selectionFromPoints(gesture.start, end);
    if (gesture && end && tool === 'move' && selection) {
      const translated = translateRect(selection, end.column - gesture.start.column, end.row - gesture.start.row);
      if (rectInChart(pixelChart, translated)) currentSelection = translated;
    }
    if (currentSelection) {
      overlay.strokeStyle = '#d86645'; overlay.lineWidth = 2; overlay.setLineDash([4, 3]);
      overlay.strokeRect(GUTTER + currentSelection.left * cell - scroll.left + 1, currentSelection.top * cell - scroll.top + 1, (currentSelection.right - currentSelection.left + 1) * cell - 2, (currentSelection.bottom - currentSelection.top + 1) * cell - 2);
      overlay.setLineDash([]);
    }
    if (keyboardActive) {
      overlay.strokeStyle = '#d86645';
      overlay.lineWidth = 3;
      overlay.strokeRect(GUTTER + keyboardPoint.column * cell - scroll.left + 1.5, keyboardPoint.row * cell - scroll.top + 1.5, cell - 3, cell - 3);
    }
    if (!gesture || !end || gesture.pan || tool === 'select' || tool === 'move' || tool === 'fill') return;
    const mutation = tool === 'pen' ? pen(pixelChart, gesture.points, paletteIndex)
      : tool === 'erase' ? erase(pixelChart, gesture.points, 0)
      : tool === 'line' ? line(pixelChart, gesture.start, end, paletteIndex)
      : rectangle(pixelChart, gesture.start, end, paletteIndex);
    const previewPalette = tool === 'erase' ? 0 : paletteIndex;
    overlay.globalAlpha = .7;
    overlay.fillStyle = chart.palette[previewPalette]!.hex;
    for (const point of mutation.cells) overlay.fillRect(GUTTER + point.column * cell - scroll.left, point.row * cell - scroll.top, cell, cell);
    overlay.globalAlpha = 1;
  };

  useLayoutEffect(drawBase, [chart, scroll, zoom, viewportSize, isDarkMode, passCounts, focusedRow]);
  useLayoutEffect(drawOverlay, [chart, scroll, zoom, viewportSize, selection, gesture, tool, paletteIndex, keyboardPoint, keyboardActive]);

  useEffect(() => {
    const element = viewport.current;
    if (!element) return;
    const handler = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      const bounds = element.getBoundingClientRect();
      const chartX = (event.clientX - bounds.left + element.scrollLeft - GUTTER) / cell;
      const chartY = (event.clientY - bounds.top + element.scrollTop) / cell;
      const nextZoom = Math.max(.35, Math.min(3, zoom * (event.deltaY < 0 ? 1.12 : .89)));
      onZoomChange(nextZoom);
      requestAnimationFrame(() => {
        const nextCell = BASE_CELL * nextZoom;
        element.scrollLeft = GUTTER + chartX * nextCell - (event.clientX - bounds.left);
        element.scrollTop = chartY * nextCell - (event.clientY - bounds.top);
      });
    };
    element.addEventListener('wheel', handler, { passive: false });
    return () => element.removeEventListener('wheel', handler);
  }, [zoom, cell, onZoomChange]);

  const finish = () => {
    if (!gesture || gesture.pan) { setGesture(null); return; }
    const end = gesture.points.at(-1) ?? gesture.start;
    if (tool === 'pen') onCommit(pen(pixelChart, gesture.points, paletteIndex));
    else if (tool === 'erase') onCommit(erase(pixelChart, gesture.points, 0));
    else if (tool === 'line') onCommit(line(pixelChart, gesture.start, end, paletteIndex));
    else if (tool === 'rectangle') onCommit(rectangle(pixelChart, gesture.start, end, paletteIndex));
    else if (tool === 'select') onSelection(selectionFromPoints(gesture.start, end));
    else if (tool === 'move' && selection) {
      const destination = selectionMoveDestination(selection, gesture.start, end);
      const mutation = move(pixelChart, selection, destination);
      if (onCommit(mutation)) onSelection({
        left: destination.column,
        top: destination.row,
        right: destination.column + selection.right - selection.left,
        bottom: destination.row + selection.bottom - selection.top,
      });
    }
    setGesture(null);
  };

  return <div className="chart-canvas-shell" ref={viewport} onScroll={(event) => setScroll({ left: event.currentTarget.scrollLeft, top: event.currentTarget.scrollTop })}>
    <canvas
      ref={paintLayer}
      style={{ transform: `translate(${scroll.left}px, ${scroll.top}px)` }}
      className="chart-canvas"
      tabIndex={0}
      role="grid"
      aria-label={`Colorwork chart, ${chart.height} rows by ${chart.width} needles`}
      aria-rowcount={chart.height}
      aria-colcount={chart.width}
      onFocus={() => { setKeyboardActive(true); onFocusRow(keyboardPoint.row); }}
      onBlur={() => setKeyboardActive(false)}
      onKeyDown={(event) => {
        let next = keyboardPoint;
        if (event.key === 'ArrowLeft') next = { ...next, column: Math.max(0, next.column - 1) };
        else if (event.key === 'ArrowRight') next = { ...next, column: Math.min(chart.width - 1, next.column + 1) };
        else if (event.key === 'ArrowUp') next = { ...next, row: Math.max(0, next.row - 1) };
        else if (event.key === 'ArrowDown') next = { ...next, row: Math.min(chart.height - 1, next.row + 1) };
        else if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onCommit(pen(pixelChart, [keyboardPoint], paletteIndex));
          return;
        } else return;
        event.preventDefault();
        setKeyboardPoint(next);
        onFocusRow(next.row);
        const element = viewport.current;
        if (element) {
          const x = GUTTER + next.column * cell;
          const y = next.row * cell;
          if (x < element.scrollLeft + GUTTER) element.scrollLeft = Math.max(0, x - GUTTER);
          else if (x + cell > element.scrollLeft + element.clientWidth) element.scrollLeft = x + cell - element.clientWidth;
          if (y < element.scrollTop) element.scrollTop = y;
          else if (y + cell > element.scrollTop + element.clientHeight) element.scrollTop = y + cell - element.clientHeight;
        }
      }}
      onPointerDown={(event) => {
        const element = viewport.current;
        if (!element) return;
        const bounds = event.currentTarget.getBoundingClientRect();
        const visibleX = event.clientX - bounds.left;
        const gutterAction = rowGutterActionAt(visibleX, event.clientY - bounds.top, element.scrollTop, cell, chart.height);
        if (visibleX < GUTTER) {
          if (gutterAction?.kind === 'insert') onInsertRow(gutterAction.row);
          else if (gutterAction?.kind === 'delete') onDeleteRow(gutterAction.row);
          return;
        }
        const point = pointAt(event);
        if (!point) return;
        setKeyboardPoint(point);
        onFocusRow(point.row);
        if (tool === 'move' && (!selection || !rectContains(selection, point))) return;
        event.currentTarget.setPointerCapture(event.pointerId);
        if (event.button === 1 || event.altKey) setGesture({ start: point, points: [point], pan: { x: event.clientX, y: event.clientY } });
        else if (tool === 'fill') onCommit(floodFill(pixelChart, point, paletteIndex));
        else setGesture({ start: point, points: [point] });
      }}
      onPointerMove={(event) => {
        const hoverPoint = pointAt(event);
        if (!gesture) return;
        if (gesture.pan) {
          const element = viewport.current!;
          element.scrollLeft -= event.clientX - gesture.pan.x;
          element.scrollTop -= event.clientY - gesture.pan.y;
          setGesture({ ...gesture, pan: { x: event.clientX, y: event.clientY } });
          return;
        }
        const point = hoverPoint;
        if (point && !gesture.points.some((item) => item.row === point.row && item.column === point.column)) setGesture({ ...gesture, points: [...gesture.points, point] });
      }}
      onPointerUp={finish}
      onPointerCancel={() => setGesture(null)}
    />
    <canvas ref={uiLayer} style={{ transform: `translate(${scroll.left}px, ${scroll.top}px)` }} className="chart-canvas ui-layer" aria-hidden="true" />
    <div className="chart-canvas-spacer" style={{ width: GUTTER + chart.width * cell, height: chart.height * cell }} />
  </div>;
}
