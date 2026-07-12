import { describe, expect, it } from 'vitest';
import type { ColorworkChartV1 } from '@kniterate-studio/chart-contract';
import { projectColorworkChartV1 } from '../src/colorwork/from-colorwork-chart';
import { projectBackFaceFromArtifact } from '../src/knitout/back-face-projection';
import { compileToRunArtifact } from '../src/knitout/run-artifact';
import type { YarnBinding } from '../src/knitout/types';

const palette = [
  { id: 'natural', name: 'Natural', hex: '#F4F0E6' },
  { id: 'red', name: 'Red', hex: '#C2413A' },
];
const bindings: YarnBinding[] = [
  { keyId: 'natural', name: 'Natural', carrier: '2' },
  { keyId: 'red', name: 'Red', carrier: '3' },
];

function compile(chart: ColorworkChartV1, backBedStyle: 'birdseye' | 'floats') {
  const projected = projectColorworkChartV1(chart);
  return compileToRunArtifact({ chart: projected.chart, keyPalette: projected.palette, yarnBindings: bindings, needleOffset: 40, wastePasses: 4, bindOff: 'drop', developerMode: true, backBedStyle });
}

describe('engine-owned back-face projection', () => {
  it('reads complete birdseye coverage from emitted back-bed operations', () => {
    const chart: ColorworkChartV1 = { kind: 'knitlab-colorwork-chart', version: 1, width: 2, height: 2, rowNumbering: 'bottom-up', palette, cells: [[0, 1], [1, 0]] };
    const projection = projectBackFaceFromArtifact(compile(chart, 'birdseye'), chart, bindings, 40);
    expect(projection.cells.flat().every((cell) => cell.kind === 'back-knit' && cell.paletteIndexes.length === 1)).toBe(true);
  });

  it('marks fairisle float spans between stitches without inventing back-bed knits', () => {
    const chart: ColorworkChartV1 = { kind: 'knitlab-colorwork-chart', version: 1, width: 3, height: 1, rowNumbering: 'bottom-up', palette, cells: [[0, 1, 0]] };
    const projection = projectBackFaceFromArtifact(compile(chart, 'floats'), chart, bindings, 40);
    expect(projection.cells[0]![1]).toEqual({ kind: 'float', paletteIndexes: [0] });
    expect(projection.cells.flat().some((cell) => cell.kind === 'back-knit')).toBe(false);
  });
});
