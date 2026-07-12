import type { PixelChart, Point, Rect } from './types';

export function pointInChart(chart: PixelChart, point: Point): boolean {
  return point.column >= 0 && point.column < chart.width && point.row >= 0 && point.row < chart.height;
}

export function normalizeRect(start: Point, end: Point): Rect {
  return { left: Math.min(start.column, end.column), right: Math.max(start.column, end.column), top: Math.min(start.row, end.row), bottom: Math.max(start.row, end.row) };
}

export function clipRect(chart: PixelChart, rect: Rect): Rect | null {
  const clipped = { left: Math.max(0, rect.left), right: Math.min(chart.width - 1, rect.right), top: Math.max(0, rect.top), bottom: Math.min(chart.height - 1, rect.bottom) };
  return clipped.left <= clipped.right && clipped.top <= clipped.bottom ? clipped : null;
}

export function pointsInRect(chart: PixelChart, rect: Rect): Point[] {
  const clipped = clipRect(chart, rect);
  if (!clipped) return [];
  const points: Point[] = [];
  for (let row = clipped.top; row <= clipped.bottom; row += 1) for (let column = clipped.left; column <= clipped.right; column += 1) points.push({ column, row });
  return points;
}

export function translateRect(rect: Rect, columnDelta: number, rowDelta: number): Rect {
  return {
    left: rect.left + columnDelta,
    right: rect.right + columnDelta,
    top: rect.top + rowDelta,
    bottom: rect.bottom + rowDelta,
  };
}

export function rectInChart(chart: PixelChart, rect: Rect): boolean {
  return rect.left >= 0 && rect.top >= 0 && rect.right < chart.width && rect.bottom < chart.height;
}
