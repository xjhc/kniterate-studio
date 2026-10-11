import { useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent } from 'react';
import {
  brushOffsets,
  ellipse,
  erase,
  floodFill,
  line,
  mirror as mirrored,
  mirrorPoints,
  move,
  pen,
  rectangle,
  rectInChart,
  selectionFromPoints,
  stamp,
  translateRect,
  type MirrorAxes,
  type PixelCell,
  type PixelMutation,
  type Point,
  type Rect,
} from '@knitlab/colorwork-core';
import type { ColorworkChartV1 } from '@kniterate-studio/chart-contract';
import type { ChartTool } from './ChartToolbar';
import { placementAt, type PlacementBox } from '../placements';

/** A motif placement as the canvas shows it: its box, and for a conflict the stitches it would knit (drawn as a ghost). */
export interface CanvasPlacement {
  box: PlacementBox;
  ghost: readonly { row: number; column: number; hex: string }[];
}
import { CHART_GUTTER as GUTTER, rowGutterActionAt, selectionMoveDestination } from './canvasCoordinates';

const BASE_CELL = 16;
/** 1px cells: the smallest scale at which every supported chart can still be fitted and seen. */
export const MIN_CHART_ZOOM = 1 / 16;
/** Row controls and per-row labels need this much height to be legible and safely clickable. */
const ROW_CONTROL_MIN_CELL = 12;
const RULER_HEIGHT = 18;
const NEEDLE_LABEL_STEPS = [1, 2, 5, 10, 20, 50, 100];
const MAX_ZOOM = 3;
/** Room to the right of a garment piece for its section labels. */
const PIECE_LABEL_ROOM = 96;

/**
 * Zoom that fits the whole chart in the viewport. `chart.height` is in
 * stitch widths (rows times the row aspect). `floor` keeps small charts from
 * being shrunk on load; `reserve` is room kept free on the right.
 */
export function fitChartZoom(viewport: { width: number; height: number }, chart: { width: number; height: number }, floor = MIN_CHART_ZOOM, reserve = 0): number {
  const fit = Math.min((viewport.width - GUTTER - 8 - reserve) / (chart.width * BASE_CELL), (viewport.height - 8) / (chart.height * BASE_CELL));
  return Math.max(floor, Math.min(MAX_ZOOM, Math.floor(fit * 100) / 100));
}

/** Purl columns of the beanie's 2×2 rib: the stitches on the rear bed (offsets 0 and 3 of every 4). */
function ribPurl(column: number): boolean {
  const residue = column % 4;
  return residue === 0 || residue === 3;
}

/** A light or dark tint that shows on `hex`. */
function contrastTint(hex: string, alpha: number): string {
  const value = Number.parseInt(hex.replace('#', '').slice(0, 6), 16);
  const luminance = (0.299 * ((value >> 16) & 255) + 0.587 * ((value >> 8) & 255) + 0.114 * (value & 255)) / 255;
  return luminance < 0.5 ? `rgba(255, 255, 255, ${alpha})` : `rgba(0, 0, 0, ${alpha})`;
}

const NO_MIRROR: MirrorAxes = { leftRight: false, topBottom: false };

function rectContains(rect: Rect, point: Point): boolean {
  return point.column >= rect.left && point.column <= rect.right && point.row >= rect.top && point.row <= rect.bottom;
}

export function ColorworkCanvas({ chart, tool, paletteIndex, brush = 1, mirror = NO_MIRROR, mirrorBox = null, selection, onSelection, onCommit, zoom, onZoomChange, fitRequest, fitScope, onInsertRow, onDeleteRow, isDarkMode, passCounts, focusedRow, onFocusRow, firstNeedle, highlightedNeedles, placements = [], selectedPlacement = null, onPlacementPick, onPlacementMove, rowAspect = 1, piece = null }: {
  chart: ColorworkChartV1;
  tool: ChartTool;
  paletteIndex: number;
  /** Brush size in stitches across: the pen, eraser, line and shapes draw with a round brush this wide. */
  brush?: number;
  /** Draw each change reflected too, across the middle of `mirrorBox` (the whole chart by default). */
  mirror?: MirrorAxes;
  mirrorBox?: Rect | null;
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
  /** Motif placements: selected by clicking with Select or Move, dragged with Move. */
  placements?: readonly CanvasPlacement[];
  selectedPlacement?: string | null;
  onPlacementPick?: (id: string | null) => void;
  onPlacementMove?: (id: string, deltaColumns: number, deltaRows: number) => void;
  /** Row height over stitch width (stitches per 10 cm ÷ rows per 10 cm), so the chart is drawn to scale. */
  rowAspect?: number;
  /**
   * A garment piece around the chart, drawn but never painted: its bottom
   * `ribRows` rows are rib, and the crown the machine shapes (the needles each
   * crown row knits, bottom row first) sits above the top row.
   */
  piece?: { ribRows: number; crown: readonly (readonly number[])[]; hex: string; labels: { top: string; crown: string; body: string; rib: string } } | null;
}) {
  const viewport = useRef<HTMLDivElement>(null);
  const paintLayer = useRef<HTMLCanvasElement>(null);
  const rulerLayer = useRef<HTMLCanvasElement>(null);
  const uiLayer = useRef<HTMLCanvasElement>(null);
  const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 });
  const [scroll, setScroll] = useState({ left: 0, top: 0 });
  const [gesture, setGesture] = useState<{ start: Point; points: Point[]; pan?: { x: number; y: number }; placement?: string } | null>(null);
  const [keyboardPoint, setKeyboardPoint] = useState<Point>({ column: 0, row: 0 });
  const [keyboardActive, setKeyboardActive] = useState(false);
  const cell = BASE_CELL * zoom;
  const rowH = cell * rowAspect;
  // The crown sits above chart row 0; the chart starts below it.
  const crownRows = piece?.crown.length ?? 0;
  const top0 = crownRows * rowH;
  // The crown's straight rows at the end (the same needles as its last row) are the top that is gathered by hand.
  const topRows = (() => {
    const last = piece?.crown.at(-1)?.join(' ');
    let rows = 0;
    while (rows < crownRows && piece!.crown[crownRows - 1 - rows]!.join(' ') === last) rows++;
    return rows === crownRows ? 0 : rows;
  })();
  const labelRoom = piece ? PIECE_LABEL_ROOM : 0;
  const pixelChart = { width: chart.width, height: chart.height, cells: chart.cells };
  const [hover, setHover] = useState<Point | null>(null);
  const brushCells = useMemo(() => brushOffsets(brush, rowAspect), [brush, rowAspect]);
  const box = mirrorBox ?? { left: 0, top: 0, right: chart.width - 1, bottom: chart.height - 1 };
  const mirroring = mirror.leftRight || mirror.topBottom;
  /** A drawn change with the brush and the mirror applied: the one thing the preview shows and the chart receives. */
  const drawn = (mutation: PixelMutation): PixelMutation => mirrored(pixelChart, stamp(pixelChart, mutation, brushCells), mirror, box);
  /** What the drawing tool in hand makes of a drag; null for the tools that do not draw. */
  const drawing = (points: Point[], start: Point, end: Point): PixelMutation | null => {
    if (tool === 'pen') return drawn(pen(pixelChart, points, paletteIndex));
    if (tool === 'erase') return drawn(erase(pixelChart, points, 0));
    if (tool === 'line') return drawn(line(pixelChart, start, end, paletteIndex));
    if (tool === 'rectangle') return drawn(rectangle(pixelChart, start, end, paletteIndex));
    if (tool === 'ellipse') return drawn(ellipse(pixelChart, start, end, paletteIndex));
    return null;
  };
  /** Flood fill from the point and from its reflections. */
  const filled = (point: Point): PixelMutation => {
    const cells = new Map<string, PixelCell>();
    for (const seed of mirrorPoints(pixelChart, point, mirror, box)) for (const cell of floodFill(pixelChart, seed, paletteIndex).cells) cells.set(`${cell.row}:${cell.column}`, cell);
    return { kind: 'paint', cells: [...cells.values()] };
  };

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
    // A garment piece always opens whole, so its shape can be seen.
    const opened = applied?.scope !== fitScope && piece === null;
    appliedFit.current = { scope: fitScope, request: fitRequest };
    onZoomChange(fitChartZoom(viewportSize, { width: chart.width, height: (chart.height + crownRows) * rowAspect }, opened ? 1 : MIN_CHART_ZOOM, labelRoom));
    element.scrollLeft = 0;
    element.scrollTop = 0;
  }, [fitRequest, fitScope, viewportSize, chart, onZoomChange, crownRows, rowAspect, labelRoom, piece === null]);

  const pointAt = (event: PointerEvent<HTMLCanvasElement>): Point | null => {
    const element = viewport.current;
    if (!element) return null;
    const bounds = event.currentTarget.getBoundingClientRect();
    const column = Math.floor((event.clientX - bounds.left + element.scrollLeft - GUTTER) / cell);
    const row = Math.floor((event.clientY - bounds.top + element.scrollTop - top0) / rowH);
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
    const top = Math.max(0, Math.floor((scroll.top - top0) / rowH));
    const bottom = Math.min(chart.height - 1, Math.ceil((scroll.top + height - top0) / rowH));
    const rowY = (row: number) => top0 + row * rowH - scroll.top;
    const ribStart = piece ? chart.height - piece.ribRows : chart.height;

    context.fillStyle = isDarkMode ? '#292e2b' : '#f7f6f1';
    context.fillRect(0, 0, Math.min(GUTTER, width), height);
    for (let row = top; row <= bottom; row += 1) {
      for (let column = left; column <= right; column += 1) {
        context.fillStyle = chart.palette[chart.cells[row]![column]!]!.hex;
        context.fillRect(GUTTER + column * cell - scroll.left, rowY(row), cell + .5, rowH + .5);
      }
    }
    const gridLine = isDarkMode ? 'rgba(225, 232, 227, .17)' : 'rgba(44, 48, 45, .15)';
    const drawGrid = cell >= 4 && rowH >= 3;
    if (piece) {
      // The rib: its purl columns are shaded, so the rows read as rib.
      const ribTop = Math.max(top, ribStart);
      if (ribTop <= bottom) {
        context.fillStyle = contrastTint(piece.hex, .18);
        for (let column = left; column <= right; column += 1) if (ribPurl(column)) context.fillRect(GUTTER + column * cell - scroll.left, rowY(ribTop), cell, (bottom - ribTop + 1) * rowH);
      }
      // The crown, as the machine shapes it: each row knits only its needles.
      context.strokeStyle = gridLine;
      context.lineWidth = 1;
      for (let index = 0; index < crownRows; index += 1) {
        const y = top0 - (index + 1) * rowH - scroll.top;
        if (y > height || y + rowH < 0) continue;
        context.fillStyle = piece.hex;
        const columns = piece.crown[index]!;
        columns.forEach((column, k) => {
          // One pass knits the whole row, so its yarn runs across any empty needles: a strand, not a hole.
          const next = columns[k + 1];
          if (next !== undefined && next > column + 1) context.fillRect(GUTTER + (column + 1) * cell - scroll.left, y + rowH * .4, (next - column - 1) * cell, Math.max(1, rowH * .2));
          if (column < left || column > right) return;
          const x = GUTTER + column * cell - scroll.left;
          context.fillRect(x, y, cell + .5, rowH + .5);
          if (drawGrid) context.strokeRect(x, y, cell, rowH);
        });
      }
    }

    if (focusedRow !== null && focusedRow >= top && focusedRow <= bottom) {
      context.fillStyle = isDarkMode ? 'rgba(239, 138, 110, .2)' : 'rgba(212, 85, 61, .12)';
      context.fillRect(0, rowY(focusedRow), GUTTER, rowH);
    }

    context.strokeStyle = gridLine;
    context.lineWidth = 1;
    const gridTop = Math.max(0, top0 - scroll.top);
    const gridBottom = rowY(bottom + 1);
    const gridRight = GUTTER + (right + 1) * cell - scroll.left;
    const rowControls = rowH >= ROW_CONTROL_MIN_CELL;
    // Below control height, label every Nth row so numbers never overlap.
    const rowLabelStep = rowControls ? 1 : Math.ceil(ROW_CONTROL_MIN_CELL / rowH);
    for (let column = left; drawGrid && column <= right + 1; column += 1) {
      const x = GUTTER + column * cell - scroll.left;
      context.beginPath(); context.moveTo(x, gridTop); context.lineTo(x, gridBottom); context.stroke();
    }
    for (let row = top; row <= bottom + 1; row += 1) {
      const y = rowY(row);
      if (drawGrid) { context.beginPath(); context.moveTo(0, y); context.lineTo(gridRight, y); context.stroke(); }
      if (row > bottom) continue;
      const labelY = y + Math.min(rowH - 3, rowH / 2 + 4);
      const displayRow = chart.rowNumbering === 'bottom-up' ? chart.height - row : row + 1;
      if (displayRow % rowLabelStep !== 0) continue;
      context.fillStyle = isDarkMode ? '#b2bbb5' : '#667069';
      context.font = '10px system-ui';
      context.fillText(String(displayRow), 4, rowControls ? labelY : y + rowH / 2 + 4);
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
      context.strokeRect(1, rowY(focusedRow) + 1, gridRight - 2, Math.max(1, rowH - 2));
    }
    if (piece) {
      // Where each section starts, and its name on the right, as in the schematic.
      const ink = isDarkMode ? '#d1d8d3' : '#48504b';
      const chartRight = GUTTER + chart.width * cell - scroll.left;
      context.strokeStyle = ink;
      context.lineWidth = 1.5;
      for (const boundary of [crownRows > 0 ? 0 : null, ribStart > 0 && ribStart < chart.height ? ribStart : null]) {
        if (boundary === null) continue;
        const y = rowY(boundary);
        if (y < 0 || y > height) continue;
        context.beginPath(); context.moveTo(GUTTER, y); context.lineTo(chartRight, y); context.stroke();
      }
      const bands = [
        { label: piece.labels.top, from: 0, to: topRows * rowH },
        { label: piece.labels.crown, from: topRows * rowH, to: top0 },
        { label: piece.labels.body, from: top0, to: top0 + ribStart * rowH },
        { label: piece.labels.rib, from: top0 + ribStart * rowH, to: top0 + chart.height * rowH },
      ];
      context.font = '11px system-ui';
      context.textAlign = 'left';
      context.lineWidth = 1;
      for (const band of bands) {
        const from = band.from - scroll.top; const to = band.to - scroll.top;
        if (to - from < 4 || to < 0 || from > height) continue;
        const x = chartRight + 8;
        context.beginPath(); context.moveTo(x, from + 2); context.lineTo(x, to - 2); context.stroke();
        context.fillStyle = ink;
        context.fillText(band.label, x + 6, Math.min(Math.max((from + to) / 2, Math.max(from, 0) + 12), Math.min(to, height) - 4) + 4);
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
      overlay.strokeRect(GUTTER + currentSelection.left * cell - scroll.left + 1, top0 + currentSelection.top * rowH - scroll.top + 1, (currentSelection.right - currentSelection.left + 1) * cell - 2, (currentSelection.bottom - currentSelection.top + 1) * rowH - 2);
      overlay.setLineDash([]);
    }
    for (const { box, ghost } of placements) {
      const dragging = gesture?.placement === box.id && end ? { columns: end.column - gesture.start.column, rows: end.row - gesture.start.row } : { columns: 0, rows: 0 };
      if (box.status === 'conflict') {
        overlay.globalAlpha = .45;
        for (const stitch of ghost) {
          if (stitch.row < 0 || stitch.row >= chart.height || stitch.column < 0 || stitch.column >= chart.width) continue;
          overlay.fillStyle = stitch.hex;
          overlay.fillRect(GUTTER + stitch.column * cell - scroll.left, top0 + stitch.row * rowH - scroll.top, cell, rowH);
        }
        overlay.globalAlpha = 1;
      }
      const selected = box.id === selectedPlacement;
      overlay.strokeStyle = box.status === 'conflict' ? '#dc2626' : '#2563eb';
      overlay.lineWidth = selected ? 2.5 : 1.5;
      overlay.setLineDash(selected ? [] : [5, 3]);
      overlay.strokeRect(GUTTER + (box.left + dragging.columns) * cell - scroll.left + 1, top0 + (box.top + dragging.rows) * rowH - scroll.top + 1, (box.right - box.left + 1) * cell - 2, (box.bottom - box.top + 1) * rowH - 2);
      overlay.setLineDash([]);
      if (selected || box.status === 'conflict') {
        overlay.font = '10px system-ui';
        overlay.fillStyle = box.status === 'conflict' ? '#dc2626' : '#2563eb';
        overlay.fillText(box.status === 'conflict' ? `${box.id} · ${box.problem === 'color' ? 'a colour has no yarn' : 'does not fit'}` : box.id, GUTTER + (box.left + dragging.columns) * cell - scroll.left + 2, Math.max(10, top0 + (box.top + dragging.rows) * rowH - scroll.top - 3));
      }
    }
    if (keyboardActive) {
      overlay.strokeStyle = '#d86645';
      overlay.lineWidth = 3;
      overlay.strokeRect(GUTTER + keyboardPoint.column * cell - scroll.left + 1.5, top0 + keyboardPoint.row * rowH - scroll.top + 1.5, cell - 3, rowH - 3);
    }
    if (mirroring) {
      // The mirror lines, through the middle of the area that is mirrored.
      const left = GUTTER + box.left * cell - scroll.left; const right = GUTTER + (box.right + 1) * cell - scroll.left;
      const top = top0 + box.top * rowH - scroll.top; const bottom = top0 + (box.bottom + 1) * rowH - scroll.top;
      overlay.strokeStyle = '#2563eb'; overlay.lineWidth = 1.5; overlay.setLineDash([6, 4]);
      if (mirror.leftRight) { const x = (left + right) / 2; overlay.beginPath(); overlay.moveTo(x, top); overlay.lineTo(x, bottom); overlay.stroke(); }
      if (mirror.topBottom) { const y = (top + bottom) / 2; overlay.beginPath(); overlay.moveTo(left, y); overlay.lineTo(right, y); overlay.stroke(); }
      overlay.setLineDash([]);
    }
    const previewPalette = tool === 'erase' ? 0 : paletteIndex;
    if (!gesture && hover && (tool === 'pen' || tool === 'erase')) {
      // Where the brush will paint, before you press.
      const footprint = drawn(pen(pixelChart, [hover], previewPalette));
      overlay.globalAlpha = .4;
      overlay.fillStyle = chart.palette[previewPalette]!.hex;
      for (const point of footprint.cells) overlay.fillRect(GUTTER + point.column * cell - scroll.left, top0 + point.row * rowH - scroll.top, cell, rowH);
      overlay.globalAlpha = 1;
    }
    if (!gesture || !end || gesture.pan || gesture.placement) return;
    const mutation = drawing(gesture.points, gesture.start, end);
    if (!mutation) return;
    overlay.globalAlpha = .7;
    overlay.fillStyle = chart.palette[previewPalette]!.hex;
    for (const point of mutation.cells) overlay.fillRect(GUTTER + point.column * cell - scroll.left, top0 + point.row * rowH - scroll.top, cell, rowH);
    overlay.globalAlpha = 1;
  };

  useLayoutEffect(drawBase, [chart, scroll, zoom, viewportSize, isDarkMode, passCounts, focusedRow, rowAspect, piece]);
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
    context.fillText('Needle', 4, 11);
    context.strokeStyle = isDarkMode ? 'rgba(225, 232, 227, .17)' : 'rgba(44, 48, 45, .15)';
    context.beginPath(); context.moveTo(0, RULER_HEIGHT - .5); context.lineTo(width, RULER_HEIGHT - .5); context.stroke();
  };

  useLayoutEffect(drawRuler, [chart.width, scroll.left, zoom, viewportSize, isDarkMode, firstNeedle, highlightedNeedles]);
  useLayoutEffect(drawOverlay, [chart, scroll, zoom, viewportSize, selection, gesture, tool, paletteIndex, keyboardPoint, keyboardActive, placements, selectedPlacement, rowAspect, top0, hover, brushCells, mirror, mirrorBox]);

  useEffect(() => {
    const element = viewport.current;
    if (!element) return;
    const handler = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      const bounds = element.getBoundingClientRect();
      const chartX = (event.clientX - bounds.left + element.scrollLeft - GUTTER) / cell;
      const chartY = (event.clientY - bounds.top + element.scrollTop) / rowH;
      const nextZoom = Math.max(MIN_CHART_ZOOM, Math.min(MAX_ZOOM, zoom * (event.deltaY < 0 ? 1.12 : .89)));
      onZoomChange(nextZoom);
      requestAnimationFrame(() => {
        const nextCell = BASE_CELL * nextZoom;
        element.scrollLeft = GUTTER + chartX * nextCell - (event.clientX - bounds.left);
        element.scrollTop = chartY * nextCell * rowAspect - (event.clientY - bounds.top);
      });
    };
    element.addEventListener('wheel', handler, { passive: false });
    return () => element.removeEventListener('wheel', handler);
  }, [zoom, cell, rowH, rowAspect, onZoomChange]);

  const finish = () => {
    if (!gesture || gesture.pan) { setGesture(null); return; }
    const end = gesture.points.at(-1) ?? gesture.start;
    if (gesture.placement) {
      const columns = end.column - gesture.start.column; const rows = end.row - gesture.start.row;
      if (columns !== 0 || rows !== 0) onPlacementMove?.(gesture.placement, columns, rows);
      setGesture(null);
      return;
    }
    const mutation = drawing(gesture.points, gesture.start, end);
    if (mutation) onCommit(mutation);
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
      data-row-size={rowH}
      tabIndex={0}
      role="grid"
      aria-label={`Colorwork chart, ${chart.height} rows by ${chart.width} needles, needles ${firstNeedle} to ${firstNeedle + chart.width - 1}`}
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
          onCommit(drawn(pen(pixelChart, [keyboardPoint], paletteIndex)));
          return;
        } else return;
        event.preventDefault();
        setKeyboardPoint(next);
        onFocusRow(next.row);
        const element = viewport.current;
        if (element) {
          const x = GUTTER + next.column * cell;
          const y = top0 + next.row * rowH;
          if (x < element.scrollLeft + GUTTER) element.scrollLeft = Math.max(0, x - GUTTER);
          else if (x + cell > element.scrollLeft + element.clientWidth) element.scrollLeft = x + cell - element.clientWidth;
          if (y < element.scrollTop) element.scrollTop = y;
          else if (y + rowH > element.scrollTop + element.clientHeight) element.scrollTop = y + rowH - element.clientHeight;
        }
      }}
      onPointerDown={(event) => {
        const element = viewport.current;
        if (!element) return;
        const bounds = event.currentTarget.getBoundingClientRect();
        const visibleX = event.clientX - bounds.left;
        const gutterAction = rowGutterActionAt(visibleX, event.clientY - bounds.top, element.scrollTop - top0, rowH, chart.height);
        if (visibleX < GUTTER) {
          // The +/- glyphs are only drawn at control height; never act on invisible targets.
          if (rowH < ROW_CONTROL_MIN_CELL) return;
          if (gutterAction?.kind === 'insert') onInsertRow(gutterAction.row);
          else if (gutterAction?.kind === 'delete') onDeleteRow(gutterAction.row);
          return;
        }
        const point = pointAt(event);
        if (!point) return;
        setKeyboardPoint(point);
        onFocusRow(point.row);
        // Clicking a motif selects the motif (its saved placement), not the stitches under it.
        const hit = tool === 'select' || tool === 'move' ? placementAt(placements.map((item) => item.box), point.row, point.column) : null;
        if (hit) {
          onPlacementPick?.(hit.id);
          onSelection(null);
          if (tool === 'move' && hit.status === 'placed') { event.currentTarget.setPointerCapture(event.pointerId); setGesture({ start: point, points: [point], placement: hit.id }); }
          return;
        }
        if (tool === 'select') onPlacementPick?.(null);
        if (tool === 'move' && (!selection || !rectContains(selection, point))) return;
        event.currentTarget.setPointerCapture(event.pointerId);
        if (event.button === 1 || event.altKey) setGesture({ start: point, points: [point], pan: { x: event.clientX, y: event.clientY } });
        else if (tool === 'fill') onCommit(filled(point));
        else setGesture({ start: point, points: [point] });
      }}
      onPointerMove={(event) => {
        const hoverPoint = pointAt(event);
        if (hoverPoint?.row !== hover?.row || hoverPoint?.column !== hover?.column) setHover(hoverPoint);
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
      onPointerLeave={() => setHover(null)}
    />
    <canvas ref={uiLayer} style={{ transform: `translate(${scroll.left}px, ${scroll.top}px)` }} className="chart-canvas ui-layer" aria-hidden="true" />
    <div className="chart-canvas-spacer" style={{ width: GUTTER + chart.width * cell + labelRoom, height: top0 + chart.height * rowH }} />
    </div>
  </div>;
}
