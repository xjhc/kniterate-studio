#!/usr/bin/env node

import { spawnSync } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { dirname, relative, resolve } from 'node:path'

const forwardedArguments = process.argv.slice(2)
const checkOnly = forwardedArguments.includes('--check')
const outputFlag = forwardedArguments.findIndex(
  (argument) => argument === '--out' || argument === '-o',
)
const outputPath = resolve(
  process.cwd(),
  outputFlag === -1
    ? 'out/kniterate-conformance-report.json'
    : forwardedArguments[outputFlag + 1] ?? 'out/kniterate-conformance-report.json',
)
const fallbackPath = `${outputPath}.${process.pid}.guard.tmp`

mkdirSync(dirname(outputPath), { recursive: true })
// Run before tsx parses the TypeScript harness. Writer failures therefore
// cannot leave an older successful report live; check mode stays read-only.
if (!checkOnly) rmSync(outputPath, { force: true })
rmSync(fallbackPath, { force: true })

const result = spawnSync(
  process.execPath,
  ['--import', 'tsx', 'scripts/kniterate-conform.ts', ...forwardedArguments],
  { cwd: process.cwd(), stdio: 'inherit', shell: false },
)
const exitCode = typeof result.status === 'number' ? result.status : 1

if (!checkOnly && exitCode !== 0 && !existsSync(outputPath)) {
  const report = {
    kind: 'kniterate-studio-m1-conformance-report',
    schemaVersion: '1',
    verdict: 'Blocked',
    honestyCap: 'Software conformance only. Physical acceptance is a separate release:physical-check gate and never serves as a software oracle.',
    physicalAcceptance: {
      included: false,
      command: 'pnpm release:physical-check',
    },
    gates: [],
    harnessFailure: result.error?.message
      ?? `Conformance harness exited with code ${exitCode} before producing a report.`,
  }
  writeFileSync(fallbackPath, `${JSON.stringify(report, null, 2)}\n`)
  renameSync(fallbackPath, outputPath)
  process.stderr.write(`Blocked report: ${relative(process.cwd(), outputPath)}\n`)
}

process.exitCode = exitCode
