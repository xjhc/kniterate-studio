#!/usr/bin/env -S node --import tsx
/** Deterministic ledger tying every named KCode blocking rule to an executed witness. */

import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { relative, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const EXECUTED_WITNESS_PATHS = [
  'test/knitout/kcode-document-adversarial.test.ts',
  'test/knitout/strict-kcode-document.test.ts',
  'test/knitout/kcode-command-legality.test.ts',
  'test/knitout/kcode-machine-trace.test.ts',
  'test/knitout/kcode-machine-validator.test.ts',
  'scripts/kcode-command-refusal-corpus.ts',
] as const

function declaredRules(path: string, prefix: 'kcode.' | 'machine-trace.'): string[] {
  const matches = readFileSync(path, 'utf8').matchAll(new RegExp(`'(${prefix.replace('.', '\\.') }[a-z0-9-]+)'`, 'g'))
  return [...new Set([...matches].map((match) => match[1]!))].sort()
}

export function collectKCodeRuleCoverage(root = process.cwd()) {
  const parserRules = declaredRules(resolve(root, 'src/knitout/kcode/types.ts'), 'kcode.')
  const validatorRules = declaredRules(resolve(root, 'src/knitout/kcode/machine-validator.ts'), 'machine-trace.')
  const witnessPaths = EXECUTED_WITNESS_PATHS.map((path) => resolve(root, path))
  const witnessSources = witnessPaths.map((path) => ({
    path: relative(root, path),
    source: readFileSync(path, 'utf8'),
    sha256: createHash('sha256').update(readFileSync(path)).digest('hex'),
  }))
  const rules = [...parserRules, ...validatorRules]
  const witnesses = rules.map((rule) => ({
    rule,
    files: witnessSources
      .filter((candidate) => candidate.source.includes(`'${rule}'`))
      .map((candidate) => ({ path: candidate.path, sha256: candidate.sha256 })),
  }))
  const missing = witnesses.filter((entry) => entry.files.length === 0).map((entry) => entry.rule)
  return {
    kind: 'kniterate-kcode-rule-coverage-ledger',
    schemaVersion: 1,
    ok: missing.length === 0,
    parserRuleCount: parserRules.length,
    validatorRuleCount: validatorRules.length,
    witnessedRuleCount: witnesses.length - missing.length,
    executionGates: [
      'deterministic-kcode-proof-tests',
      'kcode-native-command-refusal-corpus',
    ],
    note: 'Only files executed by the named proof gates may satisfy this ledger. Each witness file asserts exact stable rule identifiers; a mention in non-gated source is ignored.',
    missing,
    witnesses,
  } as const
}

function main(): void {
  const result = collectKCodeRuleCoverage()
  if (process.argv.includes('--json')) process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
  else process.stdout.write(`KCode rule witnesses: ${result.witnessedRuleCount}/${result.witnesses.length}${result.ok ? '' : `; missing ${result.missing.join(', ')}`}\n`)
  if (!result.ok) process.exit(2)
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : null
if (invokedPath === import.meta.url) main()
