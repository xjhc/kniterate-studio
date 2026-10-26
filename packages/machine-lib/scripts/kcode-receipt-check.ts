#!/usr/bin/env -S node --import tsx
/**
 * Fast KCode receipt check: confirms the tracked software-proof receipt still
 * names exactly the current sources, harness, tests and toolchain, and that
 * the mutation receipt it cites is the tracked one for these targets. It
 * re-runs no gate. `pnpm verify:kcode` regenerates both receipts after a
 * bound input changes; `pnpm verify:kcode:check` re-runs every gate.
 */

import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

import { collectContractFingerprint, collectToolchainFingerprint } from './kcode-proof.js'

interface ReceiptPaths {
  readonly root?: string
  readonly proofManifest?: string
  readonly mutationManifest?: string
}

const sha256 = (bytes: Uint8Array | string): string => createHash('sha256').update(bytes).digest('hex')

/** Every way the tracked receipts fail to describe the current checkout; empty when they are current. */
export function kcodeReceiptProblems({
  root = process.cwd(),
  proofManifest = 'out/kcode-proof/proof-manifest.json',
  mutationManifest = 'out/kcode-proof/mutation-manifest.json',
}: ReceiptPaths = {}): string[] {
  const proofPath = resolve(root, proofManifest)
  const mutationPath = resolve(root, mutationManifest)
  if (!existsSync(proofPath)) return [`${proofManifest} is missing`]
  if (!existsSync(mutationPath)) return [`${mutationManifest} is missing`]
  const proof = JSON.parse(readFileSync(proofPath, 'utf8')) as {
    verdict?: unknown
    gates?: ReadonlyArray<{ id: string; status: string }>
    auditFailures?: readonly unknown[]
    contract?: { sha256?: unknown } | null
    toolchain?: { sha256?: unknown } | null
    mutationEvidence?: { receiptSha256?: unknown }
  }
  const mutationBytes = readFileSync(mutationPath)
  const mutation = JSON.parse(mutationBytes.toString('utf8')) as {
    ok?: unknown
    targets?: ReadonlyArray<{ path: string; sha256: string }>
    configSha256?: unknown
    testConfigSha256?: unknown
  }
  const problems: string[] = []
  if (proof.verdict !== 'software-proven') problems.push(`the receipt's verdict is ${String(proof.verdict)}`)
  for (const gate of proof.gates ?? []) if (gate.status !== 'pass') problems.push(`gate ${gate.id} did not pass`)
  if ((proof.auditFailures ?? []).length > 0) problems.push('the receipt records audit failures')
  if (proof.contract?.sha256 !== collectContractFingerprint(root).sha256) problems.push('sources, tests or proof harness changed since the receipt was written')
  if (proof.toolchain?.sha256 !== collectToolchainFingerprint().sha256) problems.push('the Node or pnpm toolchain differs from the receipt')
  if (mutation.ok !== true) problems.push('the mutation receipt is not successful')
  for (const target of mutation.targets ?? []) {
    if (sha256(readFileSync(resolve(root, target.path))) !== target.sha256) problems.push(`mutation target ${target.path} changed`)
  }
  if (mutation.configSha256 !== sha256(readFileSync(resolve(root, 'stryker.config.mjs')))) problems.push('stryker.config.mjs changed')
  if (mutation.testConfigSha256 !== sha256(readFileSync(resolve(root, 'vitest.stryker.config.ts')))) problems.push('vitest.stryker.config.ts changed')
  if (proof.mutationEvidence?.receiptSha256 !== sha256(mutationBytes)) problems.push('the proof receipt cites a different mutation receipt')
  return problems
}

function main(): void {
  const problems = kcodeReceiptProblems()
  if (problems.length === 0) {
    process.stdout.write('software-proven · receipt current (receipt check; `pnpm verify:kcode:check` re-runs every gate)\n')
    return
  }
  process.stdout.write(`blocked · proof receipt stale:\n${problems.map((problem) => `  - ${problem}`).join('\n')}\nRun \`pnpm verify:kcode\` and commit both receipts.\n`)
  process.exit(2)
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : null
if (invokedPath === import.meta.url) main()
