#!/usr/bin/env -S node --import tsx
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { ColorworkChartV1 } from '@kniterate-studio/chart-contract';
import { projectColorworkChartV1 } from '../src/colorwork/from-colorwork-chart.js';
import { compileChartToKnitout } from '../src/knitout/compile/from-chart.js';
import { writeKnitoutProgram } from '../src/knitout/emitter.js';
import type { CarrierId, YarnBinding } from '../src/knitout/types.js';

const output = resolve('out/rectangle-corpus');
const palette = [
  { id: 'natural', name: 'Natural', hex: '#F1EDE3' },
  { id: 'red', name: 'Red', hex: '#B4423A' },
  { id: 'gold', name: 'Gold', hex: '#C99A35' },
  { id: 'navy', name: 'Navy', hex: '#29445F' },
];
const cases = [
  { id: 'stockinette', colors: 1, backBedStyle: undefined },
  { id: 'fairisle', colors: 2, backBedStyle: 'floats' as const },
  { id: 'ladder', colors: 3, backBedStyle: 'ladder' as const },
  { id: 'lined-fallback', colors: 3, backBedStyle: 'lined' as const },
  { id: 'birdseye', colors: 4, backBedStyle: 'birdseye' as const },
  { id: 'complement', colors: 2, backBedStyle: 'birdseye' as const, dbjBackingStrategy: 'complement' as const },
];

rmSync(output, { recursive: true, force: true });
mkdirSync(output, { recursive: true });
for (const item of cases) {
  const chart: ColorworkChartV1 = {
    kind: 'knitlab-colorwork-chart', version: 1, title: item.id, width: 12, height: 8,
    rowNumbering: 'bottom-up', palette: palette.slice(0, item.colors),
    cells: Array.from({ length: 8 }, (_, row) => Array.from({ length: 12 }, (_, column) => (row + Math.floor(column / 2)) % item.colors)),
  };
  const projected = projectColorworkChartV1(chart);
  const carriers: CarrierId[] = ['2', '3', '4', '5'];
  const bindings: YarnBinding[] = chart.palette.map((color, index) => ({ keyId: color.id, name: color.name, carrier: carriers[index]! }));
  const result = compileChartToKnitout({
    chart: projected.chart, keyPalette: projected.palette, yarnBindings: bindings,
    needleOffset: 80, wastePasses: 4, wasteCarrierOverride: '6', drawCarrierOverride: '1',
    bindOff: 'machine-bindoff',
    ...(item.backBedStyle ? { backBedStyle: item.backBedStyle } : {}),
    ...('dbjBackingStrategy' in item ? { dbjBackingStrategy: item.dbjBackingStrategy } : {}),
  });
  if (!result.ok || !result.program) throw new Error(`${item.id}: ${result.messages.filter((message) => message.severity === 'error').map((message) => message.message).join('; ')}`);
  const directory = resolve(output, item.id);
  mkdirSync(directory, { recursive: true });
  writeFileSync(resolve(directory, `${item.id}.k`), writeKnitoutProgram(result.program));
  writeFileSync(resolve(directory, 'manifest.json'), `${JSON.stringify({ source: { family: 'rectangle', strategy: item.id }, machine: { route: 'colorwork-rectangle', profile: 'kniterate-7gg-worsted-v1' } }, null, 2)}\n`);
}
process.stdout.write(`rectangle corpus: ${cases.length} machine-only fixtures emitted to ${output}\n`);
