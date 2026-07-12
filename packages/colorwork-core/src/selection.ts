import { clipRect, normalizeRect, pointsInRect, rectInChart } from './geometry';
import type { PixelChart, PixelClipboard, PixelMutation, Point, Rect } from './types';

export function copy(chart: PixelChart, rect: Rect): PixelClipboard | null {
  const clipped = clipRect(chart, rect);
  if (!clipped) return null;
  return { width: clipped.right - clipped.left + 1, height: clipped.bottom - clipped.top + 1, cells: chart.cells.slice(clipped.top, clipped.bottom + 1).map((row) => row.slice(clipped.left, clipped.right + 1)) };
}

export function clear(chart: PixelChart, rect: Rect, paletteIndex = 0): PixelMutation {
  return { kind: 'paint', cells: pointsInRect(chart, rect).map((point) => ({ ...point, paletteIndex })) };
}

export function cut(chart: PixelChart, rect: Rect, paletteIndex = 0): { clipboard: PixelClipboard | null; mutation: PixelMutation } {
  return { clipboard: copy(chart, rect), mutation: clear(chart, rect, paletteIndex) };
}

export function paste(chart: PixelChart, clipboard: PixelClipboard, origin: Point): PixelMutation {
  const cells = clipboard.cells.flatMap((row, rowOffset) => row.map((paletteIndex, columnOffset) => ({ column: origin.column + columnOffset, row: origin.row + rowOffset, paletteIndex }))).filter((cell) => cell.row >= 0 && cell.row < chart.height && cell.column >= 0 && cell.column < chart.width);
  return { kind: 'paint', cells };
}

export function move(chart: PixelChart, rect: Rect, destination: Point, backgroundPaletteIndex = 0): PixelMutation {
  const clipboard = copy(chart, rect);
  if (!clipboard) return { kind: 'paint', cells: [] };
  const destinationRect = {
    left: destination.column,
    top: destination.row,
    right: destination.column + clipboard.width - 1,
    bottom: destination.row + clipboard.height - 1,
  };
  if (!rectInChart(chart, destinationRect)) return { kind: 'paint', cells: [] };
  if (destination.column === rect.left && destination.row === rect.top) return { kind: 'paint', cells: [] };
  const cleared = clear(chart, rect, backgroundPaletteIndex).cells;
  return { kind: 'paint', cells: [...cleared, ...paste(chart, clipboard, destination).cells] };
}

export function selectionFromPoints(start: Point, end: Point): Rect { return normalizeRect(start, end); }
