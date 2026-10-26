import { createHash } from 'node:crypto'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import { collectContractFingerprint, collectToolchainFingerprint } from '../scripts/kcode-proof.js'
import { kcodeReceiptProblems } from '../scripts/kcode-receipt-check.js'

const root = resolve(import.meta.dirname, '..')
const sha256 = (bytes: Uint8Array | string) => createHash('sha256').update(bytes).digest('hex')
const TARGET = 'src/knitout/kcode/machine-safety.ts'

/** Receipts that describe this checkout exactly, with one part changed by `edit`. */
function receipts(edit: { proof?: Record<string, unknown>; mutation?: Record<string, unknown> } = {}) {
  const directory = mkdtempSync(join(tmpdir(), 'kcode-receipt-'))
  const mutation = JSON.stringify({
    ok: true,
    targets: [{ path: TARGET, sha256: sha256(readFileSync(resolve(root, TARGET))) }],
    configSha256: sha256(readFileSync(resolve(root, 'stryker.config.mjs'))),
    testConfigSha256: sha256(readFileSync(resolve(root, 'vitest.stryker.config.ts'))),
    ...edit.mutation,
  })
  const proof = {
    verdict: 'software-proven',
    gates: [{ id: 'kcode-source-mutation-proof', status: 'pass' }],
    auditFailures: [],
    contract: { sha256: collectContractFingerprint(root).sha256 },
    toolchain: { sha256: collectToolchainFingerprint().sha256 },
    mutationEvidence: { receiptSha256: sha256(mutation) },
    ...edit.proof,
  }
  writeFileSync(join(directory, 'mutation.json'), mutation)
  writeFileSync(join(directory, 'proof.json'), JSON.stringify(proof))
  return kcodeReceiptProblems({ root, proofManifest: join(directory, 'proof.json'), mutationManifest: join(directory, 'mutation.json') })
}

describe('KCode receipt check', () => {
  it('accepts receipts that name the current checkout and refuses each stale binding', () => {
    expect(receipts()).toEqual([])
    expect(receipts({ proof: { verdict: 'blocked' } })).toEqual(['the receipt\'s verdict is blocked'])
    expect(receipts({ proof: { gates: [{ id: 'studio-typecheck', status: 'fail' }] } })).toEqual(['gate studio-typecheck did not pass'])
    expect(receipts({ proof: { auditFailures: [{ stage: 'proof-input-drift' }] } })).toEqual(['the receipt records audit failures'])
    expect(receipts({ proof: { contract: { sha256: 'stale' } } })).toEqual(['sources, tests or proof harness changed since the receipt was written'])
    expect(receipts({ proof: { toolchain: { sha256: 'stale' } } })).toEqual(['the Node or pnpm toolchain differs from the receipt'])
    expect(receipts({ proof: { mutationEvidence: { receiptSha256: 'stale' } } })).toEqual(['the proof receipt cites a different mutation receipt'])
  }, 30_000)

  it('refuses a mutation receipt for other targets or settings', () => {
    const cited = (mutation: Record<string, unknown>) => receipts({ mutation }).filter((problem) => problem !== 'the proof receipt cites a different mutation receipt')
    expect(cited({ ok: false })).toEqual(['the mutation receipt is not successful'])
    expect(cited({ targets: [{ path: TARGET, sha256: 'stale' }] })).toEqual([`mutation target ${TARGET} changed`])
    expect(cited({ configSha256: 'stale' })).toEqual(['stryker.config.mjs changed'])
    expect(cited({ testConfigSha256: 'stale' })).toEqual(['vitest.stryker.config.ts changed'])
    expect(kcodeReceiptProblems({ root, proofManifest: 'missing.json' })).toEqual(['missing.json is missing'])
  }, 30_000)
})
