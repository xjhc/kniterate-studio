import { pointInChart, pointsInRect, normalizeRect } from './geometry';
import type { PixelCell, PixelChart, PixelMutation, Point, Rect } from './types';

function paint(chart: PixelChart, points: Point[], paletteIndex: number): PixelMutation {
  const unique = new Map<string, PixelCell>();
  for (const point of points) if (pointInChart(chart, point)) unique.set(`${point.row}:${point.column}`, { ...point, paletteIndex });
  return { kind: 'paint', cells: [...unique.values()] };
}

function rasterLine(start: Point, end: Point): Point[] {
  const points: Point[] = [];
  let x = start.column; let y = start.row;
  const dx = Math.abs(end.column - x); const sx = x < end.column ? 1 : -1;
  const dy = -Math.abs(end.row - y); const sy = y < end.row ? 1 : -1;
  let error = dx + dy;
  while (true) {
    points.push({ column: x, row: y });
    if (x === end.column && y === end.row) break;
    const twice = 2 * error;
    if (twice >= dy) { error += dy; x += sx; }
    if (twice <= dx) { error += dx; y += sy; }
  }
  return points;
}

function continuousStroke(points: Point[]): Point[] {
  if (points.length < 2) return points;
  return points.slice(1).flatMap((point, index) => rasterLine(points[index]!, point));
}

export function pen(chart: PixelChart, points: Point[], paletteIndex: number): PixelMutation { return paint(chart, continuousStroke(points), paletteIndex); }
export function erase(chart: PixelChart, points: Point[], backgroundPaletteIndex = 0): PixelMutation { return paint(chart, continuousStroke(points), backgroundPaletteIndex); }

export function line(chart: PixelChart, start: Point, end: Point, paletteIndex: number): PixelMutation {
  return paint(chart, rasterLine(start, end), paletteIndex);
}

export function rectangle(chart: PixelChart, start: Point, end: Point, paletteIndex: number, filled = false): PixelMutation {
  const rect = normalizeRect(start, end);
  const points = pointsInRect(chart, rect).filter((point) => filled || point.row === rect.top || point.row === rect.bottom || point.column === rect.left || point.column === rect.right);
  return paint(chart, points, paletteIndex);
}

export function floodFill(chart: PixelChart, start: Point, paletteIndex: number): PixelMutation {
  if (!pointInChart(chart, start)) return { kind: 'paint', cells: [] };
  const target = chart.cells[start.row]![start.column]!;
  if (target === paletteIndex) return { kind: 'paint', cells: [] };
  const pending = [start]; const seen = new Set<string>(); const points: Point[] = [];
  while (pending.length) {
    const point = pending.pop()!; const key = `${point.row}:${point.column}`;
    if (seen.has(key) || !pointInChart(chart, point) || chart.cells[point.row]![point.column] !== target) continue;
    seen.add(key); points.push(point);
    pending.push({ column: point.column - 1, row: point.row }, { column: point.column + 1, row: point.row }, { column: point.column, row: point.row - 1 }, { column: point.column, row: point.row + 1 });
  }
  return paint(chart, points, paletteIndex);
}

/** The cells of an ellipse that fills a `width` × `height` box, as offsets from its top-left cell. */
export function ellipseOffsets(width: number, height: number): Point[] {
  const rx = width / 2; const ry = height / 2;
  const points: Point[] = [];
  for (let row = 0; row < height; row += 1) for (let column = 0; column < width; column += 1) {
    const x = (column + .5 - rx) / rx; const y = (row + .5 - ry) / ry;
    if (x * x + y * y <= 1) points.push({ column, row });
  }
  return points;
}

/** An ellipse inside the box from `start` to `end`: its outline, or the whole of it when `filled`. */
export function ellipse(chart: PixelChart, start: Point, end: Point, paletteIndex: number, filled = false): PixelMutation {
  const rect = normalizeRect(start, end);
  const inside = ellipseOffsets(rect.right - rect.left + 1, rect.bottom - rect.top + 1);
  const keys = new Set(inside.map((point) => `${point.row}:${point.column}`));
  const outline = filled ? inside : inside.filter((point) => [[0, -1], [0, 1], [-1, 0], [1, 0]].some(([dc, dr]) => !keys.has(`${point.row + dr!}:${point.column + dc!}`)));
  return paint(chart, outline.map((point) => ({ column: rect.left + point.column, row: rect.top + point.row })), paletteIndex);
}

/**
 * A round brush `size` stitches across, as offsets from the cell under the
 * pointer. `rowAspect` is a row's height over a stitch's width: rows are
 * shorter than stitches are wide, so a brush that is round on the fabric
 * spans more rows than stitches.
 */
export function brushOffsets(size: number, rowAspect = 1): Point[] {
  const width = Math.max(1, Math.round(size));
  const height = Math.max(1, Math.round(width / rowAspect));
  return ellipseOffsets(width, height).map((point) => ({ column: point.column - Math.floor((width - 1) / 2), row: point.row - Math.floor((height - 1) / 2) }));
}

/** Every painted cell painted with the brush `offsets` around it. */
export function stamp(chart: PixelChart, mutation: PixelMutation, offsets: readonly Point[]): PixelMutation {
  if (offsets.length === 1 && offsets[0]!.column === 0 && offsets[0]!.row === 0) return mutation;
  const unique = new Map<string, PixelCell>();
  for (const cell of mutation.cells) for (const offset of offsets) {
    const point = { column: cell.column + offset.column, row: cell.row + offset.row };
    if (pointInChart(chart, point)) unique.set(`${point.row}:${point.column}`, { ...point, paletteIndex: cell.paletteIndex });
  }
  return { kind: 'paint', cells: [...unique.values()] };
}

export interface MirrorAxes {
  /** Reflect across the middle column of `box`, so the left and right halves match. */
  leftRight: boolean;
  /** Reflect across the middle row of `box`, so the top and bottom halves match. */
  topBottom: boolean;
}

/** The point and its reflections inside `box` (the whole chart by default). */
export function mirrorPoints(chart: PixelChart, point: Point, axes: MirrorAxes, box: Rect = { left: 0, top: 0, right: chart.width - 1, bottom: chart.height - 1 }): Point[] {
  const inBox = point.column >= box.left && point.column <= box.right && point.row >= box.top && point.row <= box.bottom;
  if (!inBox) return [point];
  const columns = axes.leftRight ? [point.column, box.left + box.right - point.column] : [point.column];
  const rows = axes.topBottom ? [point.row, box.top + box.bottom - point.row] : [point.row];
  const unique = new Map<string, Point>();
  for (const row of rows) for (const column of columns) unique.set(`${row}:${column}`, { column, row });
  return [...unique.values()];
}

/** A paint mutation with its reflections inside `box`: what you draw on one side is drawn on the other. */
export function mirror(chart: PixelChart, mutation: PixelMutation, axes: MirrorAxes, box?: Rect): PixelMutation {
  if (!axes.leftRight && !axes.topBottom) return mutation;
  const unique = new Map<string, PixelCell>();
  for (const cell of mutation.cells) for (const point of mirrorPoints(chart, cell, axes, box)) {
    if (pointInChart(chart, point)) unique.set(`${point.row}:${point.column}`, { ...point, paletteIndex: cell.paletteIndex });
  }
  return { kind: 'paint', cells: [...unique.values()] };
}
