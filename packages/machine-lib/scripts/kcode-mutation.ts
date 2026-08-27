#!/usr/bin/env -S node --import tsx

import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import * as ts from 'typescript';

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

interface DiagnosticProseDirective {
  readonly path: string;
  readonly startLine: number;
  readonly endLine: number;
  readonly reason: string;
}

export function diagnosticProseDirectives(path: string): DiagnosticProseDirective[] {
  const source = readFileSync(path, 'utf8');
  if (/Stryker disable StringLiteral: Diagnostic prose only;/.test(source)) {
    throw new Error(`${path} contains a range-scoped diagnostic-prose exclusion`);
  }
  const sourceFile = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true);
  const directives: DiagnosticProseDirective[] = [];
  const lines = source.split(/\r\n|\r|\n/);
  for (const [lineIndex, line] of lines.entries()) {
    const match = line.match(/\/\/ Stryker disable next-line StringLiteral: (Diagnostic prose only;.*)$/);
    if (match === null) continue;
    const nextLineStart = sourceFile.getPositionOfLineAndCharacter(lineIndex + 1, 0);
    const candidates: ts.Node[] = [];
    const visit = (node: ts.Node): void => {
      const start = node.getStart(sourceFile);
      if (start >= nextLineStart) candidates.push(node);
      ts.forEachChild(node, visit);
    };
    visit(sourceFile);
    const candidate = candidates.sort((a, b) =>
      a.getStart(sourceFile) - b.getStart(sourceFile) || b.end - a.end)[0];
    if (candidate === undefined) throw new Error(`${path}:${lineIndex + 1} has no next AST node`);
    const startLine = sourceFile.getLineAndCharacterOfPosition(candidate.getStart(sourceFile)).line + 1;
    const endLine = sourceFile.getLineAndCharacterOfPosition(Math.max(candidate.end - 1, 0)).line + 1;
    directives.push({ path, startLine, endLine, reason: match[1]! });
  }
  return directives;
}

export async function effectiveGloballyExcludedMutations(configPath: string): Promise<string[]> {
  const configUrl = pathToFileURL(configPath).href;
  const inspection = spawnSync(process.execPath, [
    '--input-type=module',
    '--eval',
    `import config from ${JSON.stringify(configUrl)}; process.stdout.write(JSON.stringify(config.mutator?.excludedMutations ?? []));`,
  ], { encoding: 'utf8', shell: false });
  if (inspection.status !== 0) {
    throw new Error(`Cannot inspect effective Stryker configuration: ${inspection.stderr}`);
  }
  const value: unknown = JSON.parse(inspection.stdout);
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== 'string')) {
    throw new Error('Stryker mutator.excludedMutations must be a string array');
  }
  return [...value];
}

async function main(): Promise<void> {
  const checkOnly = process.argv.includes('--check');
  const rawPath = resolve('out/kcode-proof/stryker-report.json');
  const receiptPath = resolve('out/kcode-proof/mutation-manifest.json');
  const configPath = resolve('stryker.config.mjs');
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
  const globallyExcludedMutations = await effectiveGloballyExcludedMutations(configPath);
  const diagnosticDirectives = TARGETS.flatMap((path) => diagnosticProseDirectives(path));
  const counts = Object.fromEntries(STATUS_ORDER.map((status) => [status, 0])) as Record<string, number>;
  const diagnosticProseExclusions: Array<Record<string, unknown>> = [];
  const equivalentMutantSuppressions: Array<Record<string, unknown>> = [];
  const unreviewedIgnoredMutants: Array<Record<string, unknown>> = [];
  const misScopedDiagnosticProseExclusions: Array<Record<string, unknown>> = [];
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
      if (
        mutant.mutatorName === 'StringLiteral'
        && mutant.statusReason?.startsWith('Diagnostic prose only;')
      ) {
        diagnosticProseExclusions.push(normalized);
        const matchingDirective = diagnosticDirectives.find((directive) =>
          directive.path === path
          && directive.reason === mutant.statusReason
          && mutant.location.start.line >= directive.startLine
          && mutant.location.start.line <= directive.endLine);
        if (matchingDirective === undefined) misScopedDiagnosticProseExclusions.push(normalized);
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
  misScopedDiagnosticProseExclusions.sort(byLocation);
  const decided = counts.Killed + counts.Survived + counts.Timeout + counts.NoCoverage;
  const mutationScore = decided === 0 ? 0 : counts.Killed / decided * 100;
  const ok = counts.Survived === 0
    && counts.Timeout === 0
    && counts.NoCoverage === 0
    && counts.CompileError === 0
    && counts.RuntimeError === 0
    && counts.Pending === 0
    && globallyExcludedMutations.length === 0
    && unreviewedIgnoredMutants.length === 0
    && misScopedDiagnosticProseExclusions.length === 0
    && diagnosticProseExclusions.length + equivalentMutantSuppressions.length === counts.Ignored
    && mutationScore === 100;
  const manifest = {
    kind: 'kniterate-kcode-source-mutation-proof',
    schemaVersion: 1,
    ok,
    tool: { name: 'StrykerJS', version: '10.0.0', testRunner: 'vitest' },
    targets: TARGETS.map((path) => ({ path, sha256: sha256(path) })),
    configSha256: sha256(configPath),
    testConfigSha256: sha256(resolve('vitest.stryker.config.ts')),
    globallyExcludedMutations,
    diagnosticProseDirectiveAudit: diagnosticDirectives,
    diagnosticProseExclusions,
    diagnosticProseExclusionsSha256: suppressionFingerprint(diagnosticProseExclusions),
    equivalentMutantSuppressions,
    equivalentMutantSuppressionsSha256: suppressionFingerprint(equivalentMutantSuppressions),
    unreviewedIgnoredMutants,
    misScopedDiagnosticProseExclusions,
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

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : null;
if (invokedPath === import.meta.url) void main();
