#!/usr/bin/env -S node --import tsx
/** Runtime ledger tying every named KCode blocking rule to an executed witness. */

import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

import { collectKCodeCommandRefusalReport } from './kcode-command-refusal-corpus.js'

const RUNTIME_WITNESS_PATHS = [
  'test/knitout/kcode-document-adversarial.test.ts',
  'test/knitout/strict-kcode-document.test.ts',
  'test/knitout/kcode-machine-validator.test.ts',
] as const

interface RuntimeWitnessRecord {
  readonly rail: 'raw-kcode-parser' | 'machine-trace-validator'
  readonly rule: string
  readonly sourcePath: string
}

function declaredRules(path: string, prefix: 'kcode.' | 'machine-trace.'): string[] {
  const matches = readFileSync(path, 'utf8').matchAll(
    new RegExp(`'(${prefix.replace('.', '\\.') }[a-z0-9-]+)'`, 'g'),
  )
  return [...new Set([...matches].map((match) => match[1]!))].sort()
}

function sha256(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex')
}

function collectRuntimeWitnesses(root: string): {
  readonly ok: boolean
  readonly records: readonly RuntimeWitnessRecord[]
  readonly command: string
  readonly exitCode: number
} {
  const temporaryDirectory = mkdtempSync(join(tmpdir(), 'kniterate-kcode-rule-coverage-'))
  const outputPath = join(temporaryDirectory, 'runtime-witnesses.jsonl')
  const args = [
    'exec',
    'vitest',
    'run',
    ...RUNTIME_WITNESS_PATHS,
    '--maxWorkers=1',
  ]
  try {
    const result = spawnSync('pnpm', args, {
      cwd: root,
      encoding: 'utf8',
      env: { ...process.env, KCODE_RULE_WITNESS_OUTPUT: outputPath },
      maxBuffer: 32 * 1024 * 1024,
      shell: false,
    })
    const records = existsSync(outputPath)
      ? readFileSync(outputPath, 'utf8').trim().split('\n').filter(Boolean)
        .map((line) => JSON.parse(line) as RuntimeWitnessRecord)
      : []
    if (result.status !== 0) {
      process.stderr.write(result.stdout)
      process.stderr.write(result.stderr)
    }
    return {
      ok: result.status === 0,
      records,
      command: `pnpm ${args.join(' ')}`,
      exitCode: result.status ?? 1,
    }
  } finally {
    rmSync(temporaryDirectory, { recursive: true, force: true })
  }
}

export function collectKCodeRuleCoverage(root = process.cwd()) {
  const parserRules = declaredRules(resolve(root, 'src/knitout/kcode/types.ts'), 'kcode.')
  const validatorRules = declaredRules(resolve(root, 'src/knitout/kcode/machine-validator.ts'), 'machine-trace.')
  const runtime = collectRuntimeWitnesses(root)
  const refusalReport = collectKCodeCommandRefusalReport()
  const byRule = new Map<string, RuntimeWitnessRecord[]>()
  for (const record of runtime.records) {
    const records = byRule.get(record.rule) ?? []
    if (!records.some((candidate) =>
      candidate.rail === record.rail && candidate.sourcePath === record.sourcePath)) {
      records.push(record)
      byRule.set(record.rule, records)
    }
  }
  const rules = [...parserRules, ...validatorRules]
  const witnesses = rules.map((rule) => ({
    rule,
    observations: (byRule.get(rule) ?? []).map((record) => ({
      rail: record.rail,
      path: record.sourcePath,
      sha256: sha256(resolve(root, record.sourcePath)),
    })),
  }))
  const missing = witnesses
    .filter((entry) => entry.observations.length === 0)
    .map((entry) => entry.rule)
  const ok = runtime.ok
    && missing.length === 0
    && refusalReport.ok
    && refusalReport.noInvalidReachedExport
  return {
    kind: 'kniterate-kcode-rule-coverage-ledger',
    schemaVersion: 2,
    ok,
    parserRuleCount: parserRules.length,
    validatorRuleCount: validatorRules.length,
    runtimeWitnessedRuleCount: witnesses.length - missing.length,
    runtimeGate: {
      command: runtime.command,
      exitCode: runtime.exitCode,
      status: runtime.ok ? 'pass' : 'fail',
    },
    rawCommandRefusalCoverage: refusalReport,
    note: 'Witnesses are diagnostics observed at runtime while the named tests pass. Raw invalid commands separately prove parser or validator refusal and export ineligibility; forged MachineTrace witnesses cover defensive post-parse invariants.',
    missing,
    witnesses,
  } as const
}

function main(): void {
  const result = collectKCodeRuleCoverage()
  if (process.argv.includes('--json')) process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
  else process.stdout.write(`KCode runtime rule witnesses: ${result.runtimeWitnessedRuleCount}/${result.witnesses.length}${result.ok ? '' : `; missing ${result.missing.join(', ')}`}\n`)
  if (!result.ok) process.exit(2)
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : null
if (invokedPath === import.meta.url) main()
