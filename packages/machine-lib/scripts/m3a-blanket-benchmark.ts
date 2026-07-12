import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import type { ColorworkChartV1 } from '@kniterate-studio/chart-contract';
import { projectColorworkChartV1 } from '../src/colorwork/from-colorwork-chart.js';
import { compileChartToKnitout } from '../src/knitout/compile/from-chart.js';
import type { CarrierId, YarnBinding } from '../src/knitout/types.js';

const WIDTH = 200;
const HEIGHT = 300;
const RUNS = 5;

function blanketChart(): ColorworkChartV1 {
  const palette = [
    { id: 'natural', name: 'Natural', hex: '#F1EDE3' },
    { id: 'red', name: 'Red', hex: '#B4423A' },
    { id: 'gold', name: 'Gold', hex: '#C99A35' },
    { id: 'navy', name: 'Navy', hex: '#29445F' },
  ];
  return {
    kind: 'knitlab-colorwork-chart', version: 1, title: 'M3A 200x300 blanket', width: WIDTH, height: HEIGHT,
    rowNumbering: 'bottom-up', palette,
    cells: Array.from({ length: HEIGHT }, (_, row) => Array.from({ length: WIDTH }, (_, column) => {
      const motifBand = Math.floor(column / 8) + Math.floor(row / 6);
      return (motifBand + (column % 5 === 0 ? 1 : 0)) % 4;
    })),
  };
}

function percentile(values: number[], fraction: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))]!;
}

const chart = blanketChart();
const carriers: CarrierId[] = ['2', '3', '4', '5'];
const bindings: YarnBinding[] = chart.palette.map((entry, index) => ({ keyId: entry.id, name: entry.name, carrier: carriers[index]! }));
const samples: Array<{ projectionMs: number; compileMs: number; totalMs: number; heapDeltaMb: number; ops: number; plannedPasses: number; predictedPasses: number }> = [];

for (let run = 0; run < RUNS; run += 1) {
  global.gc?.();
  const heapBefore = process.memoryUsage().heapUsed;
  const start = performance.now();
  const projected = projectColorworkChartV1(chart);
  const projectedAt = performance.now();
  const result = compileChartToKnitout({
    chart: projected.chart,
    keyPalette: projected.palette,
    yarnBindings: bindings,
    needleOffset: 27,
    wastePasses: 20,
    bindOff: 'machine-bindoff',
    backBedStyle: 'birdseye',
    birdseyeMode: 'minimal',
  });
  const done = performance.now();
  const errors = result.messages.filter((message) => message.severity === 'error');
  if (!result.ok || !result.program || !result.plan || errors.length) throw new Error(`benchmark compile failed: ${errors.map((error) => error.message).join('; ')}`);
  samples.push({
    projectionMs: projectedAt - start,
    compileMs: done - projectedAt,
    totalMs: done - start,
    heapDeltaMb: (process.memoryUsage().heapUsed - heapBefore) / 1024 / 1024,
    ops: result.program.ops.length,
    plannedPasses: result.plan.passes.length,
    predictedPasses: result.plan.predictedPasses?.length ?? 0,
  });
}

const steady = samples.slice(1);
const totals = steady.map((sample) => sample.totalMs);
const report = {
  kind: 'm3a-blanket-compile-benchmark',
  schemaVersion: 1,
  runtime: { node: process.version, platform: process.platform, arch: process.arch },
  fixture: { width: WIDTH, height: HEIGHT, cells: WIDTH * HEIGHT, colors: 4, strategy: 'birdseye-minimal', bindOff: 'machine-bindoff', runs: RUNS, warmupRunsExcluded: 1 },
  decisionThresholdMs: 1000,
  summary: {
    medianTotalMs: percentile(totals, 0.5),
    p95TotalMs: percentile(totals, 0.95),
    medianProjectionMs: percentile(steady.map((sample) => sample.projectionMs), 0.5),
    medianCompileMs: percentile(steady.map((sample) => sample.compileMs), 0.5),
    maxHeapDeltaMb: Math.max(...steady.map((sample) => sample.heapDeltaMb)),
    targetMet: percentile(totals, 0.95) < 1000,
  },
  samples,
};

const outDir = resolve('../../docs/benchmarks');
mkdirSync(outDir, { recursive: true });
const output = resolve(outDir, 'm3a-blanket-benchmark.json');
writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
process.stdout.write(`${JSON.stringify(report.summary, null, 2)}\nReport: ${output}\n`);
