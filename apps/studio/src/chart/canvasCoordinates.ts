import type { Point, Rect } from '@knitlab/colorwork-core';

export type RowGutterAction = { kind: 'insert' | 'delete'; row: number } | null;
export const CHART_GUTTER = 70;

export function rowGutterActionAt(
  visibleX: number,
  visibleY: number,
  scrollTop: number,
  cellSize: number,
  rowCount: number,
): RowGutterAction {
  if (visibleX < 46 || visibleX >= CHART_GUTTER) return null;
  const row = Math.floor((visibleY + scrollTop) / cellSize);
  if (row < 0 || row >= rowCount) return null;
  return { kind: visibleX < 58 ? 'insert' : 'delete', row };
}

export function selectionMoveDestination(selection: Rect, dragStart: Point, dragEnd: Point): Point {
  return {
    column: selection.left + dragEnd.column - dragStart.column,
    row: selection.top + dragEnd.row - dragStart.row,
  };
}
