import type { Point, Rect } from '@knitlab/colorwork-core';

export type RowGutterAction = { kind: 'insert' | 'delete'; row: number } | null;

export function rowGutterActionAt(
  visibleX: number,
  visibleY: number,
  scrollTop: number,
  cellSize: number,
  rowCount: number,
): RowGutterAction {
  if (visibleX < 18 || visibleX >= 42) return null;
  const row = Math.floor((visibleY + scrollTop) / cellSize);
  if (row < 0 || row >= rowCount) return null;
  return { kind: visibleX < 30 ? 'insert' : 'delete', row };
}

export function selectionMoveDestination(selection: Rect, dragStart: Point, dragEnd: Point): Point {
  return {
    column: selection.left + dragEnd.column - dragStart.column,
    row: selection.top + dragEnd.row - dragStart.row,
  };
}
