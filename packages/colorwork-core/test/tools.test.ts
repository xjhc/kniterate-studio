import { describe, expect, it } from 'vitest';
import { brushOffsets, ellipse, floodFill, line, mirror, mirrorPoints, move, pen, rectangle, stamp } from '../src/index';

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

  it('draws an ellipse in its box: the outline, or filled', () => {
    const blank = { width: 9, height: 7, cells: Array.from({ length: 7 }, () => Array(9).fill(0)) };
    const filled = ellipse(blank, { column: 0, row: 0 }, { column: 8, row: 6 }, 1, true).cells;
    const outline = ellipse(blank, { column: 8, row: 6 }, { column: 0, row: 0 }, 1).cells;
    const keys = (cells: readonly { row: number; column: number }[]) => new Set(cells.map((cell) => `${cell.row}:${cell.column}`));
    // It touches every side of the box, misses the corners, and the outline is part of the filled shape.
    for (const point of ['0:4', '6:4', '3:0', '3:8']) expect(keys(filled).has(point)).toBe(true);
    for (const corner of ['0:0', '0:8', '6:0', '6:8']) expect(keys(filled).has(corner)).toBe(false);
    expect(outline.length).toBeLessThan(filled.length);
    expect(outline.every((cell) => keys(filled).has(`${cell.row}:${cell.column}`))).toBe(true);
    expect(keys(outline).has('3:4')).toBe(false);
    // A one-cell box is one cell.
    expect(ellipse(blank, { column: 2, row: 2 }, { column: 2, row: 2 }, 1).cells).toEqual([{ column: 2, row: 2, paletteIndex: 1 }]);
  });

  it('a brush is round on the fabric: centred, and taller in rows when rows are short', () => {
    expect(brushOffsets(1)).toEqual([{ column: 0, row: 0 }]);
    const five = brushOffsets(5);
    expect(five).toContainEqual({ column: 0, row: 0 });
    expect(Math.min(...five.map((point) => point.column))).toBe(-2);
    expect(Math.max(...five.map((point) => point.column))).toBe(2);
    expect(five).not.toContainEqual({ column: -2, row: -2 });
    // 26 stitches and 34 rows to 10 cm: a row is about three-quarters of a stitch tall.
    const scaled = brushOffsets(5, 26 / 34);
    expect(Math.max(...scaled.map((point) => point.row)) - Math.min(...scaled.map((point) => point.row)) + 1).toBe(7);
  });

  it('stamps the brush along a stroke, clipped to the chart', () => {
    const blank = { width: 6, height: 6, cells: Array.from({ length: 6 }, () => Array(6).fill(0)) };
    const dot = pen(blank, [{ column: 0, row: 0 }], 2);
    expect(stamp(blank, dot, brushOffsets(1))).toBe(dot);
    const stamped = stamp(blank, dot, brushOffsets(3)).cells;
    expect(stamped.every((cell) => cell.column >= 0 && cell.row >= 0 && cell.paletteIndex === 2)).toBe(true);
    expect(stamped).toHaveLength(4);
  });

  it('mirrors a mutation across the middle of a box', () => {
    const blank = { width: 6, height: 4, cells: Array.from({ length: 4 }, () => Array(6).fill(0)) };
    const dot = pen(blank, [{ column: 1, row: 0 }], 2);
    const cells = (mutation: ReturnType<typeof pen>) => mutation.cells.map((cell) => `${cell.row}:${cell.column}`).sort();
    expect(mirror(blank, dot, { leftRight: false, topBottom: false })).toBe(dot);
    expect(cells(mirror(blank, dot, { leftRight: true, topBottom: false }))).toEqual(['0:1', '0:4']);
    expect(cells(mirror(blank, dot, { leftRight: true, topBottom: true }))).toEqual(['0:1', '0:4', '3:1', '3:4']);
    // Inside a box (a beanie's body above its cuff), the reflection stays in the box; outside it nothing is mirrored.
    expect(cells(mirror(blank, dot, { leftRight: false, topBottom: true }, { left: 0, top: 0, right: 5, bottom: 1 }))).toEqual(['0:1', '1:1']);
    expect(mirrorPoints(blank, { column: 1, row: 3 }, { leftRight: true, topBottom: true }, { left: 0, top: 0, right: 5, bottom: 1 })).toEqual([{ column: 1, row: 3 }]);
    // The middle column of an odd width reflects onto itself.
    const odd = { width: 5, height: 1, cells: [Array(5).fill(0)] };
    expect(cells(mirror(odd, pen(odd, [{ column: 2, row: 0 }], 1), { leftRight: true, topBottom: false }))).toEqual(['0:2']);
  });
});
