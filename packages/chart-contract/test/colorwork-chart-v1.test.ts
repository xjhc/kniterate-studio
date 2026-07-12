import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  InvalidColorworkChartError,
  parseColorworkChartV1,
  parseColorworkChartV1Json,
} from '../src/index';

const fixturePath = fileURLToPath(new URL('../../../fixtures/colorwork-chart-v1/four-color-checker.json', import.meta.url));

describe('ColorworkChartV1 intake', () => {
  it('preserves dimensions, row convention, palette order, and cells', () => {
    const chart = parseColorworkChartV1Json(readFileSync(fixturePath, 'utf8'));
    expect(chart).toMatchObject({ width: 4, height: 3, rowNumbering: 'bottom-up' });
    expect(chart.palette.map((entry) => entry.id)).toEqual(['natural', 'red', 'gold', 'navy']);
    expect(chart.cells).toEqual([
      [3, 2, 1, 0],
      [0, 1, 2, 3],
      [1, 1, 3, 3],
    ]);
  });

  it('rejects missing palette references before machine interpretation', () => {
    expect(() => parseColorworkChartV1({
      kind: 'knitlab-colorwork-chart',
      version: 1,
      width: 1,
      height: 1,
      rowNumbering: 'top-down',
      palette: [{ id: 'natural', name: 'Natural', hex: '#FFFFFF' }],
      cells: [[4]],
    })).toThrow(InvalidColorworkChartError);
  });
});
