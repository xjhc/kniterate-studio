import { describe, expect, it } from 'vitest';
import { floodFill, line, move, pen, rectangle } from '../src/index';

const chart = { width: 4, height: 3, cells: [[0, 0, 1, 1], [0, 1, 1, 1], [0, 0, 0, 1]] };

describe('colorwork core raster tools', () => {
  it('clips a line and deduplicates its cells', () => expect(line(chart, { column: -2, row: 0 }, { column: 3, row: 0 }, 2).cells).toHaveLength(4));
  it('rasterizes rectangle borders and fills contiguous color only', () => {
    expect(rectangle(chart, { column: 0, row: 0 }, { column: 2, row: 2 }, 2).cells).toHaveLength(8);
    expect(floodFill(chart, { column: 0, row: 0 }, 3).cells).toHaveLength(6);
  });
  it('moves a selection as one neutral paint mutation', () => expect(move(chart, { left: 0, top: 0, right: 1, bottom: 0 }, { column: 2, row: 2 }).cells).toHaveLength(4));

  it('interpolates skipped pointer samples into a continuous pen stroke', () => {
    expect(pen(chart, [{ column: 0, row: 0 }, { column: 3, row: 0 }], 2).cells.map((cell) => cell.column)).toEqual([0, 1, 2, 3]);
  });

  it('refuses an out-of-bounds move without clearing the source', () => {
    expect(move(chart, { left: 2, top: 0, right: 3, bottom: 0 }, { column: 3, row: 0 }).cells).toEqual([]);
  });
});
