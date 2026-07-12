#!/usr/bin/env -S node --import tsx
/**
 * Layer 4 conformance gate: run the vendored knitout-live-visualizer topology
 * model headlessly over emitted knitout files.
 *
 * This is structural proof only. It exercises the same `parseKnitout` +
 * `CellMachine` loop/yarn model the browser visualizer uses; it does not prove
 * Kniterate feeder timing, takedown behavior, or physical yarn tension.
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { createRequire } from 'node:module';
import vm from 'node:vm';

const requireForVm = createRequire(import.meta.url);

interface ConsoleCapture {
  logs: string[];
  assertions: string[];
  console: Pick<Console, 'log' | 'assert'>;
}

interface LoadedVisualizer {
  CellMachine: new () => VisualizerMachine;
  parseKnitout: (code: string, machine: VisualizerMachine, useKnitoutAsSource?: boolean) => void;
  capture: ConsoleCapture;
}

interface VisualizerColumn {
  y: number;
  ports?: Record<string, unknown[]>;
}

interface VisualizerColumns {
  minIndex: number;
  maxIndex: number;
  getColumn(i: number, create?: boolean): false | VisualizerColumn[];
}

interface VisualizerMachine {
  beds: Record<string, VisualizerColumns>;
  topRow: number;
  stretchLoops(): void;
  [key: string]: unknown;
}

interface TopologyFileResult {
  file: string;
  ok: boolean;
  parseErrors: string[];
  parseWarnings: string[];
  assertions: string[];
  structuralErrors: string[];
  allowances: string[];
  stats: {
    topRow: number;
    cellCount: number;
    occupiedColumns: number;
    liveLoopColumns: number;
    liveYarnColumns: number;
  };
}

interface TopologyExpectations {
  allowLiveLoops: boolean;
  reason: string | null;
}

function readJsonObject(path: string): Record<string, unknown> | null {
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function nearestManifestFor(file: string): Record<string, unknown> | null {
  let dir = dirname(file);
  while (true) {
    const manifest = join(dir, 'manifest.json');
    if (existsSync(manifest)) return readJsonObject(manifest);
    const next = dirname(dir);
    if (next === dir) break;
    dir = next;
  }
  return null;
}

function propObject(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function expectationsForFile(file: string): TopologyExpectations {
  const manifest = nearestManifestFor(file);
  const source = propObject(manifest?.source);
  const machine = propObject(manifest?.machine);
  const family = source?.family;
  const route = machine?.route;
  if (family === 'tube' || (typeof route === 'string' && route.startsWith('tube-'))) {
    return {
      allowLiveLoops: true,
      reason: 'tube top-edge closure intentionally leaves live loops for off-machine finishing',
    };
  }
  return { allowLiveLoops: false, reason: null };
}

function structuralErrorsFromStats(stats: TopologyFileResult['stats'], expectations: TopologyExpectations): string[] {
  const errors: string[] = [];
  if (stats.liveLoopColumns > 0 && !expectations.allowLiveLoops) {
    errors.push(`unexpected live loop endings in ${stats.liveLoopColumns} column(s)`);
  }
  if (stats.liveYarnColumns > 0) {
    errors.push(`unexpected live yarn endings in ${stats.liveYarnColumns} column(s)`);
  }
  return errors;
}

function allowancesFromStats(stats: TopologyFileResult['stats'], expectations: TopologyExpectations): string[] {
  const allowances: string[] = [];
  if (stats.liveLoopColumns > 0 && expectations.allowLiveLoops) {
    allowances.push(`${stats.liveLoopColumns} live loop ending column(s) allowed: ${expectations.reason}`);
  }
  return allowances;
}

function makeCapture(): ConsoleCapture {
  const capture: ConsoleCapture = {
    logs: [],
    assertions: [],
    console: {
      log: (...args: unknown[]) => {
        capture.logs.push(args.map(String).join(' '));
      },
      assert: (condition?: boolean, ...args: unknown[]) => {
        if (condition) return;
        const message = args.length > 0 ? args.map(String).join(' ') : 'Assertion failed';
        capture.assertions.push(message);
        throw new Error(message);
      },
    },
  };
  return capture;
}

function loadCommonJsShim<T>(path: string, capture: ConsoleCapture): T {
  const module = { exports: {} as T };
  const context = {
    module,
    exports: module.exports,
    console: capture.console,
    require: requireForVm,
  };
  vm.runInNewContext(readFileSync(path, 'utf8'), context, { filename: path });
  return module.exports;
}

function loadVisualizer(): LoadedVisualizer {
  const capture = makeCapture();
  const root = resolve('reference/knitlab/public/visualizer/scripts');
  const { CellMachine } = loadCommonJsShim<{ CellMachine: LoadedVisualizer['CellMachine'] }>(
    join(root, 'CellMachine.js'),
    capture,
  );
  const { parseKnitout } = loadCommonJsShim<{ parseKnitout: LoadedVisualizer['parseKnitout'] }>(
    join(root, 'parseKnitout.js'),
    capture,
  );
  return { CellMachine, parseKnitout, capture };
}

function noopKniterateExtensions(machine: VisualizerMachine): void {
  for (const op of [
    'x-stitch-number',
    'x-xfer-stitch-number',
    'x-speed-number',
    'x-roller-advance',
    'x-add-roller-advance',
    'x-presser-speed',
    'x-presser-roller',
    'x-carrier-spacing',
    'x-carrier-stopping-distance',
    'x-xfer-style',
    'x-park-carriage',
  ]) {
    machine[op] = () => {};
  }
}

function collectFiles(input: string): string[] {
  const root = resolve(input);
  if (!existsSync(root)) return [];
  const stat = statSync(root);
  if (stat.isFile()) return root.endsWith('.k') ? [root] : [];
  const out: string[] = [];
  const walk = (dir: string): void => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      const s = statSync(p);
      if (s.isDirectory()) walk(p);
      else if (name.endsWith('.k') && !name.endsWith('.kc')) out.push(p);
    }
  };
  walk(root);
  return out.sort();
}

function topPorts(cell: VisualizerColumn): Record<string, unknown[]> {
  return cell.ports ?? {};
}

function countStats(machine: VisualizerMachine): TopologyFileResult['stats'] {
  let cellCount = 0;
  let occupiedColumns = 0;
  let liveLoopColumns = 0;
  let liveYarnColumns = 0;
  for (const bed of Object.values(machine.beds)) {
    if (!Number.isFinite(bed.minIndex) || !Number.isFinite(bed.maxIndex)) continue;
    for (let i = bed.minIndex; i <= bed.maxIndex; i++) {
      const col = bed.getColumn(i, false);
      if (!col || col.length === 0) continue;
      occupiedColumns++;
      cellCount += col.length;
      const ports = topPorts(col[col.length - 1]!);
      if ((ports['^']?.length ?? 0) > 0) liveLoopColumns++;
      if ((ports['^-']?.length ?? 0) > 0 || (ports['^+']?.length ?? 0) > 0) liveYarnColumns++;
    }
  }
  return {
    topRow: machine.topRow,
    cellCount,
    occupiedColumns,
    liveLoopColumns,
    liveYarnColumns,
  };
}

function runFile(file: string): TopologyFileResult {
  const loaded = loadVisualizer();
  const machine = new loaded.CellMachine();
  noopKniterateExtensions(machine);
  loaded.capture.logs.splice(0);
  loaded.capture.assertions.splice(0);

  try {
    loaded.parseKnitout(readFileSync(file, 'utf8'), machine, false);
    machine.stretchLoops();
  } catch (err) {
    if (loaded.capture.assertions.length === 0) {
      loaded.capture.assertions.push(err instanceof Error ? err.message : String(err));
    }
  }

  const parseErrors = loaded.capture.logs.filter(line => line.includes('Parse Error'));
  const parseWarnings = loaded.capture.logs.filter(line => line.includes('Parse Warning'));
  const assertions = [...loaded.capture.assertions];
  const stats = countStats(machine);
  const expectations = expectationsForFile(file);
  const structuralErrors = structuralErrorsFromStats(stats, expectations);
  const allowances = allowancesFromStats(stats, expectations);
  return {
    file: relative(process.cwd(), file),
    ok: parseErrors.length === 0 && assertions.length === 0 && structuralErrors.length === 0,
    parseErrors,
    parseWarnings,
    assertions,
    structuralErrors,
    allowances,
    stats,
  };
}

function main(): void {
  const argv = process.argv.slice(2);
  let input = 'out/surface-corpus';
  let json = false;
  let outPath: string | undefined;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === '--json') json = true;
    else if (arg === '-o' || arg === '--out') outPath = argv[++i];
    else if (arg === '-h' || arg === '--help') {
      process.stdout.write('usage: pnpm kniterate:topology [out/surface-corpus|file.k] [--json] [-o report.json]\n');
      process.exit(0);
    } else input = arg;
  }

  const files = collectFiles(input);
  const results = files.map(runFile);
  const ok = files.length > 0 && results.every(r => r.ok);
  const report = {
    kind: 'kniterate-topology-report',
    schemaVersion: '1',
    oracle: 'vendored-knitout-live-visualizer CellMachine',
    structuralNotHardwareProof: true,
    ok,
    fileCount: files.length,
    files: results,
  };

  if (outPath !== undefined) {
    const dest = resolve(outPath);
    mkdirSync(dirname(dest), { recursive: true });
    writeFileSync(dest, JSON.stringify(report, null, 2) + '\n');
  }

  if (json) {
    process.stdout.write(JSON.stringify(report, null, 2) + '\n');
  } else {
    process.stdout.write(`kniterate topology oracle: ${results.filter(r => r.ok).length}/${results.length} files passed${ok ? '' : ' · FAILED'}\n`);
    for (const r of results) {
      process.stdout.write(`  ${r.ok ? '✓' : '✗'} ${r.file} · cells=${r.stats.cellCount} topRow=${r.stats.topRow}\n`);
      for (const a of r.assertions.slice(0, 3)) process.stdout.write(`      assertion: ${a}\n`);
      for (const e of r.structuralErrors.slice(0, 3)) process.stdout.write(`      structural: ${e}\n`);
      for (const a of r.allowances.slice(0, 3)) process.stdout.write(`      allowed: ${a}\n`);
      for (const e of r.parseErrors.slice(0, 3)) process.stdout.write(`      parse: ${e}\n`);
    }
  }

  if (!ok) process.exit(2);
}

main();
