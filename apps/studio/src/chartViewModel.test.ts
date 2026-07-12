import { describe, expect, it } from 'vitest';
import type { ColorworkChartV1 } from '@kniterate-studio/chart-contract';
import { chartCellColors, chartFacts } from './chartViewModel';

const chart: ColorworkChartV1 = {
  kind: 'knitlab-colorwork-chart',
  version: 1,
  width: 2,
  height: 2,
  rowNumbering: 'bottom-up',
  palette: [
    { id: 'a', name: 'A', hex: '#FFFFFF' },
    { id: 'b', name: 'B', hex: '#000000' },
  ],
  cells: [[0, 1], [1, 0]],
};

describe('chart import view model', () => {
  it('preserves visual row order and palette identity', () => {
    expect(chartCellColors(chart)).toEqual(['#FFFFFF', '#000000', '#000000', '#FFFFFF']);
    expect(chartFacts(chart)).toEqual(['2 x 2', '2 colors', 'Row 1 bottom']);
  });
});
