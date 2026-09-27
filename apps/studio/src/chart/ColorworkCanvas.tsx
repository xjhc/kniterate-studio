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
/** 1px cells: the smallest scale at which every supported chart can still be fitted and seen. */
export const MIN_CHART_ZOOM = 1 / 16;
/** Row controls and per-row labels need this much height to be legible and safely clickable. */
const ROW_CONTROL_MIN_CELL = 12;
const RULER_HEIGHT = 18;
const NEEDLE_LABEL_STEPS = [1, 2, 5, 10, 20, 50, 100];
const MAX_ZOOM = 3;

/** Zoom that fits the whole chart in the viewport. `floor` keeps small charts from being shrunk on load. */
export function fitChartZoom(viewport: { width: number; height: number }, chart: { width: number; height: number }, floor = MIN_CHART_ZOOM): number {
  const fit = Math.min((viewport.width - GUTTER - 8) / (chart.width * BASE_CELL), (viewport.height - 8) / (chart.height * BASE_CELL));
  return Math.max(floor, Math.min(MAX_ZOOM, Math.floor(fit * 20) / 20));
}

function rectContains(rect: Rect, point: Point): boolean {
  return point.column >= rect.left && point.column <= rect.right && point.row >= rect.top && point.row <= rect.bottom;
}

export function ColorworkCanvas({ chart, tool, paletteIndex, selection, onSelection, onCommit, zoom, onZoomChange, fitRequest, fitScope, onInsertRow, onDeleteRow, isDarkMode, passCounts, focusedRow, onFocusRow, firstNeedle, highlightedNeedles }: {
  chart: ColorworkChartV1;
  tool: ChartTool;
  paletteIndex: number;
  selection: Rect | null;
  onSelection: (selection: Rect | null) => void;
  onCommit: (mutation: ReturnType<typeof pen>) => boolean;
  zoom: number;
  onZoomChange: (zoom: number) => void;
  /** Incrementing this fits the whole chart. */
  fitRequest: number;
  /** A new scope (an opened project) fits small charts up to fill the viewport on first layout. */
  fitScope: string;
  onInsertRow: (afterRow: number | null) => void;
  onDeleteRow: (row: number) => void;
  isDarkMode: boolean;
  passCounts: ReadonlyMap<number, number>;
  focusedRow: number | null;
  onFocusRow: (row: number) => void;
  /** Authored one-based Knitout needle of chart column 0. */
  firstNeedle: number;
  /** Knitout needles selected by the chosen emitted pass, from the KCode artifact. */
  highlightedNeedles: { start: number; end: number } | null;
}) {
  const viewport = useRef<HTMLDivElement>(null);
  const paintLayer = useRef<HTMLCanvasElement>(null);
  const rulerLayer = useRef<HTMLCanvasElement>(null);
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

  const appliedFit = useRef<{ scope: string; request: number } | null>(null);
  useEffect(() => {
    const element = viewport.current;
    const applied = appliedFit.current;
    if (!element || viewportSize.width === 0 || viewportSize.height === 0 || (applied?.scope === fitScope && applied.request === fitRequest)) return;
    const opened = applied?.scope !== fitScope;
    appliedFit.current = { scope: fitScope, request: fitRequest };
    onZoomChange(fitChartZoom(viewportSize, chart, opened ? 1 : MIN_CHART_ZOOM));
    element.scrollLeft = 0;
    element.scrollTop = 0;
  }, [fitRequest, fitScope, viewportSize, chart, onZoomChange]);

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

    if (focusedRow !== null && focusedRow >= top && focusedRow <= bottom) {
      const y = focusedRow * cell - scroll.top;
      context.fillStyle = isDarkMode ? 'rgba(239, 138, 110, .2)' : 'rgba(212, 85, 61, .12)';
      context.fillRect(0, y, GUTTER, cell);
    }

    context.strokeStyle = isDarkMode ? 'rgba(225, 232, 227, .17)' : 'rgba(44, 48, 45, .15)';
    context.lineWidth = 1;
    const gridBottom = (bottom + 1) * cell - scroll.top;
    const gridRight = GUTTER + (right + 1) * cell - scroll.left;
    const drawGrid = cell >= 4;
    const rowControls = cell >= ROW_CONTROL_MIN_CELL;
    // Below control height, label every Nth row so numbers never overlap.
    const rowLabelStep = rowControls ? 1 : Math.ceil(ROW_CONTROL_MIN_CELL / cell);
    for (let column = left; drawGrid && column <= right + 1; column += 1) {
      const x = GUTTER + column * cell - scroll.left;
      context.beginPath(); context.moveTo(x, 0); context.lineTo(x, gridBottom); context.stroke();
    }
    for (let row = top; row <= bottom + 1; row += 1) {
      const y = row * cell - scroll.top;
      if (drawGrid) { context.beginPath(); context.moveTo(0, y); context.lineTo(gridRight, y); context.stroke(); }
      if (row > bottom) continue;
      const labelY = y + Math.min(cell - 3, cell / 2 + 4);
      const displayRow = chart.rowNumbering === 'bottom-up' ? chart.height - row : row + 1;
      if (displayRow % rowLabelStep !== 0) continue;
      context.fillStyle = isDarkMode ? '#b2bbb5' : '#667069';
      context.font = '10px system-ui';
      context.fillText(String(displayRow), 4, rowControls ? labelY : y + cell / 2 + 4);
      const passCount = passCounts.get(row);
      if (rowControls && passCount !== undefined) {
        context.fillStyle = row === focusedRow ? '#d86645' : isDarkMode ? '#d1d8d3' : '#48504b';
        context.fillText(`×${passCount}`, 24, labelY);
      }
      if (rowControls) {
        context.fillStyle = isDarkMode ? '#89938d' : '#8b938e';
        context.fillText('+', 50, labelY);
        context.fillText('−', 61, labelY);
      }
    }
    if (focusedRow !== null && focusedRow >= top && focusedRow <= bottom) {
      context.strokeStyle = '#d86645';
      context.lineWidth = 2;
      context.strokeRect(1, focusedRow * cell - scroll.top + 1, gridRight - 2, Math.max(1, cell - 2));
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
  const drawRuler = () => {
    const canvas = rulerLayer.current;
    if (!canvas || viewportSize.width === 0) return;
    const width = viewportSize.width;
    const context = configureCanvas(canvas, width, RULER_HEIGHT);
    context.fillStyle = isDarkMode ? '#292e2b' : '#f7f6f1';
    context.fillRect(0, 0, width, RULER_HEIGHT);
    const left = Math.max(0, Math.floor((scroll.left - GUTTER) / cell));
    const right = Math.min(chart.width - 1, Math.ceil((scroll.left + width - GUTTER) / cell));
    if (highlightedNeedles) {
      const start = Math.max(0, highlightedNeedles.start - firstNeedle);
      const end = Math.min(chart.width - 1, highlightedNeedles.end - firstNeedle);
      if (start <= end) {
        context.fillStyle = isDarkMode ? 'rgba(239, 138, 110, .35)' : 'rgba(212, 85, 61, .22)';
        context.fillRect(GUTTER + start * cell - scroll.left, 0, (end - start + 1) * cell, RULER_HEIGHT);
      }
    }
    const step = NEEDLE_LABEL_STEPS.find((candidate) => candidate * cell >= 30) ?? NEEDLE_LABEL_STEPS.at(-1)!;
    context.font = '9px system-ui';
    context.textAlign = 'center';
    context.strokeStyle = isDarkMode ? 'rgba(225, 232, 227, .3)' : 'rgba(44, 48, 45, .3)';
    context.lineWidth = 1;
    for (let column = left; column <= right; column += 1) {
      const needle = firstNeedle + column;
      const x = GUTTER + column * cell - scroll.left;
      // The first needle is always labelled; a step label too close to it is skipped.
      const labelled = column === 0 || (needle % step === 0 && (step === 1 || column * cell >= 30));
      if (cell >= 6 || labelled) {
        context.beginPath(); context.moveTo(x + .5, RULER_HEIGHT - (labelled ? 6 : 3)); context.lineTo(x + .5, RULER_HEIGHT); context.stroke();
      }
      if (labelled && x >= GUTTER - 2) {
        context.fillStyle = isDarkMode ? '#b2bbb5' : '#667069';
        const leftAligned = column === 0 && step > 1;
        context.textAlign = leftAligned ? 'left' : 'center';
        context.fillText(String(needle), leftAligned ? x + 2 : x + cell / 2, 10);
      }
    }
    context.fillStyle = isDarkMode ? '#292e2b' : '#f7f6f1';
    context.fillRect(0, 0, GUTTER, RULER_HEIGHT);
    context.textAlign = 'left';
    context.fillStyle = isDarkMode ? '#89938d' : '#8b938e';
    context.fillText('Knitout N', 4, 11);
    context.strokeStyle = isDarkMode ? 'rgba(225, 232, 227, .17)' : 'rgba(44, 48, 45, .15)';
    context.beginPath(); context.moveTo(0, RULER_HEIGHT - .5); context.lineTo(width, RULER_HEIGHT - .5); context.stroke();
  };

  useLayoutEffect(drawRuler, [chart.width, scroll.left, zoom, viewportSize, isDarkMode, firstNeedle, highlightedNeedles]);
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
      const nextZoom = Math.max(MIN_CHART_ZOOM, Math.min(MAX_ZOOM, zoom * (event.deltaY < 0 ? 1.12 : .89)));
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

  return <div className="chart-canvas-frame">
    <canvas ref={rulerLayer} className="chart-needle-ruler" aria-hidden="true" title="Knitout needle numbers (authored compiler coordinates). Physical needle labels are unverified." />
    <div className="chart-canvas-shell" ref={viewport} onScroll={(event) => setScroll({ left: event.currentTarget.scrollLeft, top: event.currentTarget.scrollTop })}>
    <canvas
      ref={paintLayer}
      style={{ transform: `translate(${scroll.left}px, ${scroll.top}px)` }}
      className="chart-canvas"
      data-cell-size={cell}
      tabIndex={0}
      role="grid"
      aria-label={`Colorwork chart, ${chart.height} rows by ${chart.width} needles, Knitout needles ${firstNeedle} to ${firstNeedle + chart.width - 1}`}
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
          // The +/- glyphs are only drawn at control height; never act on invisible targets.
          if (cell < ROW_CONTROL_MIN_CELL) return;
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
    </div>
  </div>;
}
