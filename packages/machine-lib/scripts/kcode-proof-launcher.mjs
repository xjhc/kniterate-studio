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
    ? 'out/kcode-proof/proof-manifest.json'
    : forwardedArguments[outputFlag + 1] ?? 'out/kcode-proof/proof-manifest.json',
)
const fallbackPath = `${outputPath}.${process.pid}.guard.tmp`

mkdirSync(dirname(outputPath), { recursive: true })
// In writer mode this plain-JavaScript guard runs before tsx parses or imports
// proof code, so a broken harness cannot leave an earlier success receipt live.
// Check mode is deliberately read-only and reports failure without mutation.
if (!checkOnly) rmSync(outputPath, { force: true })
rmSync(fallbackPath, { force: true })

const result = spawnSync(
  process.execPath,
  ['--import', 'tsx', 'scripts/kcode-proof.ts', ...forwardedArguments],
  { cwd: process.cwd(), stdio: 'inherit', shell: false },
)
const exitCode = typeof result.status === 'number' ? result.status : 1

if (!checkOnly && exitCode !== 0 && !existsSync(outputPath)) {
  const manifest = {
    kind: 'kniterate-studio-kcode-software-proof',
    schemaVersion: 1,
    verdict: 'blocked',
    auditFailures: [{
      stage: 'proof-harness-execution',
      message: result.error?.message ?? `Proof harness exited with code ${exitCode} before producing a receipt.`,
    }],
  }
  writeFileSync(fallbackPath, `${JSON.stringify(manifest, null, 2)}\n`)
  renameSync(fallbackPath, outputPath)
  process.stderr.write(
    `Blocked receipt: ${relative(process.cwd(), outputPath)}\n`,
  )
}

process.exitCode = exitCode
