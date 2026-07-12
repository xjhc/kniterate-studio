import { describe, expect, it } from 'vitest';
import { rowGutterActionAt, selectionMoveDestination } from './canvasCoordinates';

describe('canvas interaction coordinates', () => {
  it('keeps fixed gutter hit testing independent of horizontal scroll', () => {
    expect(rowGutterActionAt(50, 8, 160, 16, 300)).toEqual({ kind: 'insert', row: 10 });
    expect(rowGutterActionAt(62, 8, 160, 16, 300)).toEqual({ kind: 'delete', row: 10 });
  });

  it('moves a selection by pointer delta rather than treating the endpoint as its origin', () => {
    expect(selectionMoveDestination(
      { left: 10, top: 20, right: 12, bottom: 22 },
      { column: 11, row: 21 },
      { column: 14, row: 25 },
    )).toEqual({ column: 13, row: 24 });
  });
});
