#!/usr/bin/env -S node --import tsx
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

interface Gate {
  layer: number | '0';
  name: string;
  command: string;
  status: 'pending' | 'pass' | 'fail';
  exitCode: number | null;
}

const gates: Gate[] = [
  { layer: '0', name: 'reference kc reproducibility', command: 'test:reference-kc', status: 'pending', exitCode: null },
  { layer: 1, name: 'chart compiler matrix and topology unit rail', command: 'test:compiler', status: 'pending', exitCode: null },
  { layer: 3, name: 'kc revalidation and diff rails', command: 'test:revalidation', status: 'pending', exitCode: null },
  { layer: 6, name: 'known-bad refusal corpus', command: 'kniterate:refusals', status: 'pending', exitCode: null },
  { layer: 7, name: 'physical swatch registry integrity', command: 'kniterate:swatches', status: 'pending', exitCode: null },
];

function main(): void {
  const outArgIndex = process.argv.findIndex((arg) => arg === '--out' || arg === '-o');
  const outPath = outArgIndex >= 0
    ? process.argv[outArgIndex + 1] ?? 'out/kniterate-conformance-report.json'
    : 'out/kniterate-conformance-report.json';
  const results: Gate[] = [];

  for (const gate of gates) {
    process.stdout.write(`\n== Layer ${gate.layer}: ${gate.name} ==\n`);
    const result = spawnSync('pnpm', [gate.command], { stdio: 'inherit', shell: false });
    const exitCode = typeof result.status === 'number' ? result.status : 1;
    const completed: Gate = { ...gate, status: exitCode === 0 ? 'pass' : 'fail', exitCode };
    results.push(completed);
    if (completed.status === 'fail') break;
  }

  const blocked = results.some((gate) => gate.status === 'fail');
  const report = {
    kind: 'kniterate-studio-m1-conformance-report',
    schemaVersion: '1',
    generatedAt: new Date().toISOString(),
    verdict: blocked ? 'Blocked' : 'Verified - swatch recommended',
    honestyCap: 'Software extraction proof only; Knit-proven requires a matching physical registry entry.',
    gates: results,
  };
  const destination = resolve(outPath);
  mkdirSync(dirname(destination), { recursive: true });
  writeFileSync(destination, `${JSON.stringify(report, null, 2)}\n`);
  process.stdout.write(`\n${report.verdict}\nReport: ${outPath}\n`);
  if (blocked) process.exit(2);
}

main();
