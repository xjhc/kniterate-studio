import type { ColorworkChartV1 } from '@kniterate-studio/chart-contract';

export function chartFacts(chart: ColorworkChartV1): string[] {
  return [
    `${chart.width} x ${chart.height}`,
    `${chart.palette.length} colors`,
    chart.rowNumbering === 'bottom-up' ? 'Row 1 bottom' : 'Row 1 top',
  ];
}

export function chartCellColors(chart: ColorworkChartV1): string[] {
  return chart.cells.flatMap((row) => row.map((paletteIndex) => chart.palette[paletteIndex]!.hex));
}
