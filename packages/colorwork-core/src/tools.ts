import { pointInChart, pointsInRect, normalizeRect } from './geometry';
import type { PixelCell, PixelChart, PixelMutation, Point } from './types';

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
