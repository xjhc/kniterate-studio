#!/usr/bin/env -S node --import tsx

import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

interface MutationLocation {
  start: { line: number; column: number };
  end: { line: number; column: number };
}

interface MutationFile {
  mutants: Array<{
    id: string;
    status: string;
    statusReason?: string;
    mutatorName: string;
    replacement: string;
    location: MutationLocation;
  }>;
}

interface MutationReport {
  schemaVersion: string;
  files: Record<string, MutationFile>;
}

const TARGETS = [
  'src/knitout/kcode/parser.ts',
  'src/knitout/kcode/machine-trace.ts',
  'src/knitout/kcode/machine-validator.ts',
  'src/knitout/kcode/scheduled-trace-diff.ts',
] as const;
const STATUS_ORDER = [
  'Killed',
  'Survived',
  'Timeout',
  'NoCoverage',
  'CompileError',
  'RuntimeError',
  'Ignored',
  'Pending',
] as const;

function sha256(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function suppressionFingerprint(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function main(): void {
  const checkOnly = process.argv.includes('--check');
  const rawPath = resolve('out/kcode-proof/stryker-report.json');
  const receiptPath = resolve('out/kcode-proof/mutation-manifest.json');
  const temporaryReceipt = `${receiptPath}.${process.pid}.tmp`;
  rmSync(rawPath, { force: true });
  if (!checkOnly) rmSync(receiptPath, { force: true });
  rmSync(temporaryReceipt, { force: true });

  const result = spawnSync(
    'pnpm',
    ['exec', 'stryker', 'run', 'stryker.config.mjs'],
    { stdio: 'inherit', shell: false },
  );
  if (result.status !== 0 || !existsSync(rawPath)) process.exit(2);

  const report = JSON.parse(readFileSync(rawPath, 'utf8')) as MutationReport;
  const counts = Object.fromEntries(STATUS_ORDER.map((status) => [status, 0])) as Record<string, number>;
  const diagnosticProseExclusions: Array<Record<string, unknown>> = [];
  const equivalentMutantSuppressions: Array<Record<string, unknown>> = [];
  const unreviewedIgnoredMutants: Array<Record<string, unknown>> = [];
  for (const [path, file] of Object.entries(report.files)) {
    for (const mutant of file.mutants) counts[mutant.status] = (counts[mutant.status] ?? 0) + 1;
    for (const mutant of file.mutants.filter((candidate) => candidate.status === 'Ignored')) {
      const normalized = {
        path,
        line: mutant.location.start.line,
        column: mutant.location.start.column,
        mutator: mutant.mutatorName,
        replacement: mutant.replacement,
        reason: mutant.statusReason ?? '',
      };
      if (mutant.statusReason?.startsWith('Diagnostic prose only;')) {
        diagnosticProseExclusions.push(normalized);
      } else if (mutant.statusReason?.startsWith('Equivalent mutant:')) {
        equivalentMutantSuppressions.push(normalized);
      } else {
        unreviewedIgnoredMutants.push(normalized);
      }
    }
  }
  const byLocation = (a: Record<string, unknown>, b: Record<string, unknown>): number =>
    JSON.stringify(a).localeCompare(JSON.stringify(b));
  diagnosticProseExclusions.sort(byLocation);
  equivalentMutantSuppressions.sort(byLocation);
  unreviewedIgnoredMutants.sort(byLocation);
  const decided = counts.Killed + counts.Survived + counts.Timeout + counts.NoCoverage;
  const mutationScore = decided === 0 ? 0 : counts.Killed / decided * 100;
  const ok = counts.Survived === 0
    && counts.Timeout === 0
    && counts.NoCoverage === 0
    && counts.CompileError === 0
    && counts.RuntimeError === 0
    && counts.Pending === 0
    && unreviewedIgnoredMutants.length === 0
    && diagnosticProseExclusions.length + equivalentMutantSuppressions.length === counts.Ignored
    && mutationScore === 100;
  const manifest = {
    kind: 'kniterate-kcode-source-mutation-proof',
    schemaVersion: 1,
    ok,
    tool: { name: 'StrykerJS', version: '10.0.0', testRunner: 'vitest' },
    targets: TARGETS.map((path) => ({ path, sha256: sha256(path) })),
    configSha256: sha256(resolve('stryker.config.mjs')),
    testConfigSha256: sha256(resolve('vitest.stryker.config.ts')),
    globallyExcludedMutations: [],
    diagnosticProseExclusions,
    diagnosticProseExclusionsSha256: suppressionFingerprint(diagnosticProseExclusions),
    equivalentMutantSuppressions,
    equivalentMutantSuppressionsSha256: suppressionFingerprint(equivalentMutantSuppressions),
    unreviewedIgnoredMutants,
    counts,
    mutationScore,
  };
  const expected = `${JSON.stringify(manifest, null, 2)}\n`;
  if (checkOnly) {
    const current = existsSync(receiptPath) ? readFileSync(receiptPath, 'utf8') : null;
    if (!ok || current !== expected) {
      process.stderr.write(`KCode mutation proof ${ok ? 'receipt is stale' : 'has non-killed generated mutants'}.\n`);
      process.exit(2);
    }
    process.stdout.write(`KCode mutation proof: ${counts.Killed}/${decided} killed; receipt current.\n`);
    return;
  }
  writeFileSync(temporaryReceipt, expected);
  renameSync(temporaryReceipt, receiptPath);
  if (!ok) process.exit(2);
  process.stdout.write(`KCode mutation proof: ${counts.Killed}/${decided} killed.\n`);
}

main();
