#!/usr/bin/env -S node --import tsx
/**
 * Deterministic software proof for the emitted-KCode compiler boundary.
 *
 * Physical knit outcomes remain a later acceptance gate, not an oracle for
 * parsing, lowering, movement projection, or state validation. The generated
 * registry manifest is still checked and fingerprinted because Studio imports
 * it at runtime and must never silently ship stale evidence metadata.
 */

import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { dirname, relative, resolve } from 'node:path'

import { KNITERATE_7GG_KCODE_PROFILE_V2 } from '../src/knitout/kcode/machine-profile.js'
import { projectKCodeMachineTrace } from '../src/knitout/kcode/machine-trace.js'
import { emitKCodeDocumentBytes, parseKCodeBytes } from '../src/knitout/kcode/bytes.js'
import { validateKCodeMachineTrace } from '../src/knitout/kcode/machine-validator.js'
import { collectKCodeRuleCoverage } from './kcode-rule-coverage.js'

interface GateResult {
  readonly id: string
  readonly command: string
  readonly status: 'pass' | 'fail'
  readonly exitCode: number
}

const PROOF_TESTS = [
  'test/public-api.test.ts',
  'test/physical-registry-manifest.test.ts',
  'test/browser-kcode-converter.test.ts',
  'test/knitout/browser-converter-source.test.ts',
  'test/knitout/kcode-machine-profile.test.ts',
  'test/knitout/kcode-mutation-policy.test.ts',
  'test/knitout/strict-kcode-document.test.ts',
  'test/knitout/kcode-byte-roundtrip.test.ts',
  'test/knitout/kcode-document-adversarial.test.ts',
  'test/knitout/kcode-document-property.test.ts',
  'test/knitout/kcode-machine-trace.test.ts',
  'test/knitout/kcode-machine-validator.test.ts',
  'test/knitout/kcode-command-legality.test.ts',
  'test/knitout/kcode-machine-scene.test.ts',
  'test/knitout/kcode-coordinate-bridge.test.ts',
  'test/knitout/kcode-pass-metrics.test.ts',
  'test/knitout/kcode-programmed-motion.test.ts',
  'test/knitout/kcode-independent-oracle.test.ts',
  'test/knitout/kcode-scheduled-differential.test.ts',
  'test/knitout/kcode-scheduled-trace-diff.test.ts',
  'test/knitout/kc-diff.test.ts',
  'test/knitout/loop-stack-software-policy.test.ts',
  'test/knitout/predicted-vs-vendor.test.ts',
  'test/knitout/fairisle-parity.test.ts',
  'test/knitout/kniterate-topology-oracle.test.ts',
] as const

const STUDIO_PROOF_TESTS = [
  'src/engine.test.ts',
  'src/blanket/compileProject.test.ts',
  'src/kcode/compileKCodeArtifact.test.ts',
  'src/kcode/MachineMovementView.test.tsx',
  'src/chart/AuthoredMachinePanel.test.ts',
  'src/chart/ChartWorkspace.test.ts',
  'src/chart/GeneratedSourceDock.test.tsx',
  'src/foreignRunSheetFindings.test.tsx',
  'src/sourceWindow.test.tsx',
] as const

const CONTRACT_SOURCES = [
  'src/knitout/kcode/machine-profile.ts',
  'src/knitout/kcode/types.ts',
  'src/knitout/kcode/parser.ts',
  'src/knitout/kcode/emitter.ts',
  'src/knitout/kcode/bytes.ts',
  'src/knitout/kcode/machine-trace.ts',
  'src/knitout/kcode/pass-metrics.ts',
  'src/knitout/kcode/programmed-motion.ts',
  'src/knitout/kcode/machine-validator.ts',
  'src/knitout/kcode/export-eligibility.ts',
  'src/knitout/kcode/machine-scene.ts',
  'src/knitout/kcode/scheduled-trace-diff.ts',
  'src/knitout/kc-diff.ts',
  'src/knitout/kniterate/vendor-pass-contract.ts',
  'src/knitout/kniterate/browser-to-kcode.ts',
  'src/knitout/kniterate/to-kcode.ts',
  'src/index.ts',
  'src/browser.ts',
  'src/knitout/vendor/knitout-to-kcode.cjs',
  'src/knitout/vendor/knitout-to-kcode.browser.js',
  'src/knitout/vendor/knitout-to-kcode.browser.d.ts',
  'scripts/generate-browser-converter.ts',
  '../../apps/studio/src/engine.ts',
  '../../apps/studio/src/App.tsx',
  '../../apps/studio/src/styles.css',
  '../../apps/studio/src/kcode/kcodeProtocol.ts',
  '../../apps/studio/src/kcode/compileKCodeArtifact.ts',
  '../../apps/studio/src/kcode/convert.worker.ts',
  '../../apps/studio/src/kcode/MachineMovementView.tsx',
  '../../apps/studio/src/kcode/MachineMovementView.css',
  '../../apps/studio/src/kcode/sha256.ts',
  '../../apps/studio/src/kcode/useKCodeArtifact.ts',
  '../../apps/studio/src/blanket/compileProject.ts',
  '../../apps/studio/src/chart/AuthoredMachinePanel.tsx',
  '../../apps/studio/src/chart/ChartWorkspace.tsx',
  'registry/knit-proven.json',
] as const

const PROOF_HARNESS_SOURCES = [
  'scripts/kcode-proof.ts',
  'scripts/kcode-command-refusal-corpus.ts',
  'scripts/kcode-mutation.ts',
  'scripts/kcode-rule-coverage.ts',
  'stryker.config.mjs',
  'vitest.stryker.config.ts',
  'package.json',
  'tsconfig.json',
  '../../package.json',
  '../../.node-version',
  '../../.github/workflows/ci.yml',
  '../../.github/workflows/pages.yml',
  '../../playwright.config.ts',
  '../../pnpm-lock.yaml',
  '../../pnpm-workspace.yaml',
  '../../tsconfig.base.json',
  '../../apps/studio/package.json',
  '../../apps/studio/index.html',
  '../../apps/studio/public/THIRD_PARTY_NOTICES.txt',
  '../../apps/studio/tsconfig.json',
  '../../apps/studio/vite.config.ts',
  '../../scripts/build-v1-knit-trial.ts',
  '../../scripts/check-machine-file.ts',
  '../../scripts/check-v1-physical-release.ts',
  '../../scripts/register-v1-knit-trial.ts',
  '../chart-contract/package.json',
  '../chart-contract/tsconfig.json',
  '../colorwork-core/package.json',
  '../colorwork-core/tsconfig.json',
  '../project-contract/package.json',
  '../project-contract/tsconfig.json',
  ...PROOF_TESTS,
  ...STUDIO_PROOF_TESTS.map((path) => `../../apps/studio/${path}`),
] as const

function listFilesRecursively(root: string): string[] {
  const absoluteRoot = resolve(process.cwd(), root)
  const visit = (directory: string): string[] => readdirSync(directory, { withFileTypes: true })
    .sort((a, b) => a.name.localeCompare(b.name))
    .flatMap((entry) => {
      const path = resolve(directory, entry.name)
      if (entry.isDirectory()) return visit(path)
      return entry.isFile() ? [relative(process.cwd(), path)] : []
    })
  return visit(absoluteRoot)
}

function collectFingerprintSources(): string[] {
  return [...new Set<string>([
    ...CONTRACT_SOURCES,
    ...PROOF_HARNESS_SOURCES,
    ...listFilesRecursively('src'),
    ...listFilesRecursively('scripts'),
    ...listFilesRecursively('test'),
    ...listFilesRecursively('../../apps/studio/src'),
    ...listFilesRecursively('../chart-contract/src'),
    ...listFilesRecursively('../colorwork-core/src'),
    ...listFilesRecursively('../project-contract/src'),
    ...listFilesRecursively('reference'),
    ...listFilesRecursively('registry/swatches'),
    ...listFilesRecursively('../../e2e'),
  ])].sort()
}

function sha256(bytes: Uint8Array | string): string {
  return createHash('sha256').update(bytes).digest('hex')
}

function runGate(
  id: string,
  args: readonly string[],
  recordedCommand?: string,
): GateResult {
  process.stdout.write(`\n== KCode proof: ${id} ==\n`)
  const result = spawnSync('pnpm', [...args], { cwd: process.cwd(), stdio: 'inherit', shell: false })
  const exitCode = typeof result.status === 'number' ? result.status : 1
  return {
    id,
    command: recordedCommand ?? `pnpm ${args.join(' ')}`,
    status: exitCode === 0 ? 'pass' : 'fail',
    exitCode,
  }
}

function collectReferenceCorpus() {
  // KCode does not encode origin. The current profile's origin labels share one exact
  // marker-free mapping, so the proof uses Studio's canonical label without
  // claiming that the fixture bytes establish who produced them.
  const corpusDialect = 'knitout-vendor' as const
  const referenceRoot = resolve(process.cwd(), 'reference')
  const fixtures = readdirSync(referenceRoot)
    .filter((name) => name.endsWith('.kc'))
    .sort()
    .map((name) => {
      const path = resolve(referenceRoot, name)
      const bytes = readFileSync(path)
      const parsed = parseKCodeBytes(bytes, {
        profile: KNITERATE_7GG_KCODE_PROFILE_V2,
        dialect: corpusDialect,
        strict: true,
      })
      if (!parsed.ok) {
        const summary = parsed.diagnostics
          .slice(0, 8)
          .map((diagnostic) => `${diagnostic.rule}@${diagnostic.line}:${diagnostic.column}`)
          .join(', ')
        throw new Error(`${name} failed strict KCode parsing: ${summary}`)
      }
      const trace = projectKCodeMachineTrace(
        parsed.document,
        KNITERATE_7GG_KCODE_PROFILE_V2,
      )
      const emitted = emitKCodeDocumentBytes(parsed.document)
      if (!Buffer.from(emitted).equals(bytes)) {
        throw new Error(`${name} did not round-trip to its exact original bytes`)
      }
      const validation = validateKCodeMachineTrace(
        trace,
        KNITERATE_7GG_KCODE_PROFILE_V2,
      )
      if (!validation.ok) {
        const summary = validation.diagnostics
          .filter((diagnostic) => diagnostic.severity === 'error')
          .slice(0, 8)
          .map((diagnostic) => `${diagnostic.rule}@${diagnostic.line}:${diagnostic.column}`)
          .join(', ')
        throw new Error(`${name} failed MachineTrace validation: ${summary}`)
      }
      const unknownActionCount = trace.passes.reduce(
        (count, pass) => count + pass.actions.filter((action) => action.kind === 'unknown').length,
        0,
      )
      if (unknownActionCount !== 0) {
        throw new Error(`${name} projected ${unknownActionCount} unknown machine actions`)
      }
      return {
        name,
        sha256: sha256(bytes),
        bytes: bytes.byteLength,
        passes: trace.passes.length,
        actions: trace.passes.reduce((count, pass) => count + pass.actions.length, 0),
        validationErrors: validation.errorCount,
        validationWarnings: validation.warningCount,
      }
    })

  const totals = fixtures.reduce(
    (value, fixture) => ({
      bytes: value.bytes + fixture.bytes,
      passes: value.passes + fixture.passes,
      actions: value.actions + fixture.actions,
    }),
    { bytes: 0, passes: 0, actions: 0 },
  )
  return {
    dialect: corpusDialect,
    fixtureCount: fixtures.length,
    ...totals,
    manifestSha256: sha256(JSON.stringify(fixtures)),
    fixtures,
  }
}

function collectContractFingerprint() {
  // Re-enumerate on every pre/post capture so file additions and removals are
  // drift, not merely modifications to the inventory observed at process load.
  const files = collectFingerprintSources().map((path) => {
    const bytes = readFileSync(resolve(process.cwd(), path))
    return { path, sha256: sha256(bytes), bytes: bytes.byteLength }
  })
  return {
    sha256: sha256(JSON.stringify(files)),
    files,
  }
}

function collectToolchainFingerprint() {
  const rootPackage = JSON.parse(
    readFileSync(resolve(process.cwd(), '../../package.json'), 'utf8'),
  ) as { readonly packageManager?: string }
  const pnpm = spawnSync('pnpm', ['--version'], {
    cwd: process.cwd(),
    encoding: 'utf8',
    shell: false,
  })
  if (pnpm.status !== 0) {
    throw new Error(`Cannot fingerprint pnpm: ${pnpm.stderr || pnpm.error?.message || 'unknown error'}`)
  }
  const versions = {
    node: process.version,
    pnpm: pnpm.stdout.trim(),
    declaredPackageManager: rootPackage.packageManager ?? null,
    platform: process.platform,
    architecture: process.arch,
  }
  return {
    sha256: sha256(JSON.stringify(versions)),
    ...versions,
  }
}

function collectMutationEvidence() {
  const path = resolve(process.cwd(), 'out/kcode-proof/mutation-manifest.json')
  const bytes = readFileSync(path)
  const receipt = JSON.parse(bytes.toString('utf8')) as {
    readonly ok?: unknown
    readonly counts?: unknown
    readonly mutationScore?: unknown
    readonly targets?: unknown
    readonly diagnosticProseExclusions?: unknown
    readonly diagnosticProseExclusionsSha256?: unknown
    readonly equivalentMutantSuppressions?: unknown
    readonly equivalentMutantSuppressionsSha256?: unknown
    readonly globallyExcludedMutations?: unknown
    readonly diagnosticProseDirectiveAudit?: unknown
    readonly misScopedDiagnosticProseExclusions?: unknown
  }
  if (receipt.ok !== true) throw new Error('source-mutation receipt is not successful')
  return {
    receiptSha256: sha256(bytes),
    counts: receipt.counts,
    mutationScore: receipt.mutationScore,
    targets: receipt.targets,
    diagnosticProseExclusions: receipt.diagnosticProseExclusions,
    diagnosticProseExclusionsSha256: receipt.diagnosticProseExclusionsSha256,
    equivalentMutantSuppressions: receipt.equivalentMutantSuppressions,
    equivalentMutantSuppressionsSha256: receipt.equivalentMutantSuppressionsSha256,
    globallyExcludedMutations: receipt.globallyExcludedMutations,
    diagnosticProseDirectiveAudit: receipt.diagnosticProseDirectiveAudit,
    misScopedDiagnosticProseExclusions: receipt.misScopedDiagnosticProseExclusions,
  }
}

function main(): void {
  const checkOnly = process.argv.includes('--check')
  const outputFlag = process.argv.findIndex((argument) => argument === '--out' || argument === '-o')
  const outputPath = resolve(
    process.cwd(),
    outputFlag === -1
      ? 'out/kcode-proof/proof-manifest.json'
      : process.argv[outputFlag + 1] ?? 'out/kcode-proof/proof-manifest.json',
  )
  const temporaryOutputPath = `${outputPath}.${process.pid}.tmp`
  mkdirSync(dirname(outputPath), { recursive: true })
  // Writer mode fails closed. Check mode preserves tracked evidence and proves
  // that its exact deterministic bytes already match the current candidate.
  if (!checkOnly) rmSync(outputPath, { force: true })
  rmSync(temporaryOutputPath, { force: true })

  const auditFailures: Array<{ stage: string; message: string }> = []
  const capture = <Value>(stage: string, collect: () => Value): Value | null => {
    try {
      return collect()
    } catch (error) {
      auditFailures.push({
        stage,
        message: error instanceof Error ? error.message : String(error),
      })
      return null
    }
  }

  // Bind every gate to one stable source/harness/corpus candidate. A source
  // edit during the run blocks the receipt instead of naming untested bytes.
  const contractBeforeGates = capture('proof-input-fingerprint-before-gates', collectContractFingerprint)
  const gates = [
    runGate('physical-registry-manifest-current', ['kniterate:swatches:check']),
    runGate('known-bad-refusal-corpus', ['kniterate:refusals']),
    runGate('kcode-native-command-refusal-corpus', ['kniterate:kcode-refusals']),
    runGate('named-rule-witness-ledger', ['kniterate:kcode-rule-coverage']),
    runGate('deterministic-kcode-proof-tests', [
      'exec', 'vitest', 'run', ...PROOF_TESTS,
    ]),
    runGate('machine-lib-typecheck', ['typecheck']),
    runGate('machine-check-typecheck', ['--dir', '../..', 'machine:check:typecheck']),
    runGate('kcode-source-mutation-proof', [
      checkOnly ? 'verify:kcode:mutation:check' : 'verify:kcode:mutation',
    ], 'pnpm verify:kcode:mutation (write) / pnpm verify:kcode:mutation:check (check)'),
    runGate('studio-kcode-integration-tests', [
      '--dir', '../../apps/studio', 'exec', 'vitest', 'run', ...STUDIO_PROOF_TESTS,
    ]),
    runGate('studio-typecheck', ['--dir', '../../apps/studio', 'typecheck']),
    runGate('studio-production-build', [
      '--dir', '../../apps/studio', 'exec', 'vite', 'build',
    ]),
    runGate('studio-third-party-notice-distribution', [
      'exec', 'node', 'scripts/check-third-party-notices.mjs',
    ]),
  ]
  const corpus = capture('reference-corpus', collectReferenceCorpus)
  const mutationEvidence = capture('source-mutation-proof', collectMutationEvidence)
  const ruleCoverage = capture('named-rule-witness-ledger', collectKCodeRuleCoverage)
  const contractAfterGates = capture('proof-input-fingerprint-after-gates', collectContractFingerprint)
  if (
    contractBeforeGates !== null
    && contractAfterGates !== null
    && contractBeforeGates.sha256 !== contractAfterGates.sha256
  ) {
    auditFailures.push({
      stage: 'proof-input-drift',
      message: `Proof inputs changed while gates ran (${contractBeforeGates.sha256} before, ${contractAfterGates.sha256} after).`,
    })
  }
  const contract = contractBeforeGates !== null
    && contractAfterGates !== null
    && contractBeforeGates.sha256 === contractAfterGates.sha256
    ? contractAfterGates
    : null
  const toolchain = capture('toolchain-fingerprint', collectToolchainFingerprint)
  const blocked = gates.some((gate) => gate.status === 'fail') || auditFailures.length > 0
  const manifest = {
    kind: 'kniterate-studio-kcode-software-proof',
    schemaVersion: 2,
    verdict: blocked ? 'blocked' : 'software-proven',
    profile: {
      id: KNITERATE_7GG_KCODE_PROFILE_V2.profileId,
      version: KNITERATE_7GG_KCODE_PROFILE_V2.profileVersion,
      gauge: KNITERATE_7GG_KCODE_PROFILE_V2.machine.gauge,
      needlesPerBed: KNITERATE_7GG_KCODE_PROFILE_V2.machine.needlesPerBed,
      emittedDialect: KNITERATE_7GG_KCODE_PROFILE_V2.dialect,
    },
    claims: [
      'strict-lossless-kcode-byte-roundtrip',
      'deterministic-pinned-backend-lowering',
      'machine-executable-scheduled-pass-to-machine-trace-differential',
      'kcode-native-loop-and-kinematic-validation',
      'profile-command-legality-v2',
      'independent-1904-case-command-legality-matrix',
      'kcode-native-invalid-command-refusal-corpus',
      'source-mutation-complete-for-command-proof-rail',
      'full-machine-trace-diff',
      'deterministic-pass-bed-carrier-scene',
      'exact-authored-compiler-kcode-trace-coordinate-bridge',
      'studio-equivalent-one-file-machine-check',
      'cross-section-predicted-vendor-agreement-prefix',
      'fairisle-footer-machine-equivalence',
      'kniterate-topology-policy-oracle',
      'known-bad-machine-safety-refusal-corpus',
      'third-party-license-notice-in-production-build',
    ],
    deterministicSeeds: {
      validDocumentProperty: 1262702404,
      grammarMutationProperty: 1297437761,
      traceDiffProperty: 1262699590,
      validatorContainmentProperty: 1447119945,
      scheduledBackendDifferential: 1414676803,
      independentReferenceOracle: 1330790723,
    },
    legalityCoverage: {
      coreMatrixCases: 1_904,
      operations: 8,
      directions: 2,
      carrierTokens: 7,
      rackValues: 17,
      kcodeNativeRefusalCases: 10,
      oracle: 'test/knitout/kcode-legality-spec.ts',
      contractSha256: sha256(JSON.stringify(KNITERATE_7GG_KCODE_PROFILE_V2.operations)),
      oracleSha256: sha256(readFileSync(resolve(process.cwd(), 'test/knitout/kcode-legality-spec.ts'))),
      ruleCoverage,
      profileSha256: sha256(JSON.stringify(KNITERATE_7GG_KCODE_PROFILE_V2)),
    },
    proofTests: [
      ...PROOF_TESTS,
      ...STUDIO_PROOF_TESTS.map((path) => `../../apps/studio/${path}`),
    ],
    gates,
    referenceCorpus: corpus,
    contract,
    toolchain,
    auditFailures,
    differentialScope: {
      compared: 'every machine-executable KCode scheduled field',
      backendOnlyProvenance: ['sourceLines', 'isAutoMove'],
      serializedAnnotationsExcluded: ['comment'],
      note: 'sourceLines and claimed design rows fail closed against parsed Knitout. isAutoMove is backend-only metadata; comment is serialized inert prose. Neither is treated as an independently verified machine movement or state field.',
    },
    mutationEvidence: {
      inputGrammarAndDiffMutations: true,
      implementationSourceMutationScoring: true,
      ...mutationEvidence,
    },
    physicalAcceptance: {
      included: false,
      command: 'pnpm release:physical-check',
      note: 'A machine run is a separate final acceptance gate and is not used as a software oracle.',
    },
  }

  const expectedManifest = `${JSON.stringify(manifest, null, 2)}\n`
  if (checkOnly) {
    const current = existsSync(outputPath) ? readFileSync(outputPath, 'utf8') : null
    const currentReceipt = current === expectedManifest
    process.stdout.write(
      `\n${blocked ? 'blocked' : currentReceipt ? 'software-proven · receipt current' : 'blocked · proof receipt stale'}\n`
      + `Manifest: ${relative(process.cwd(), outputPath)}\n`,
    )
    if (blocked || !currentReceipt) process.exit(2)
    return
  }

  writeFileSync(temporaryOutputPath, expectedManifest)
  renameSync(temporaryOutputPath, outputPath)
  process.stdout.write(`\n${manifest.verdict}\nManifest: ${relative(process.cwd(), outputPath)}\n`)
  if (blocked) process.exit(2)
}

main()
