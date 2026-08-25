#!/usr/bin/env -S node --import tsx
/**
 * Deterministic software proof for the emitted-KCode compiler boundary.
 *
 * This rail deliberately excludes the physical knit registry. A real-machine
 * run is a later acceptance gate, not an oracle for parsing, lowering,
 * movement projection, or state validation.
 */

import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { dirname, relative, resolve } from 'node:path'

import { KNITERATE_7GG_KCODE_PROFILE_V1 } from '../src/knitout/kcode/machine-profile.js'
import { projectKCodeMachineTrace } from '../src/knitout/kcode/machine-trace.js'
import { emitKCodeDocumentBytes, parseKCodeBytes } from '../src/knitout/kcode/bytes.js'
import { validateKCodeMachineTrace } from '../src/knitout/kcode/machine-validator.js'

interface GateResult {
  readonly id: string
  readonly command: string
  readonly status: 'pass' | 'fail'
  readonly exitCode: number
}

const PROOF_TESTS = [
  'test/public-api.test.ts',
  'test/browser-kcode-converter.test.ts',
  'test/knitout/browser-converter-source.test.ts',
  'test/knitout/kcode-machine-profile.test.ts',
  'test/knitout/strict-kcode-document.test.ts',
  'test/knitout/kcode-byte-roundtrip.test.ts',
  'test/knitout/kcode-document-adversarial.test.ts',
  'test/knitout/kcode-document-property.test.ts',
  'test/knitout/kcode-machine-trace.test.ts',
  'test/knitout/kcode-machine-validator.test.ts',
  'test/knitout/kcode-machine-scene.test.ts',
  'test/knitout/kcode-independent-oracle.test.ts',
  'test/knitout/kcode-scheduled-differential.test.ts',
  'test/knitout/kcode-scheduled-trace-diff.test.ts',
  'test/knitout/kc-diff.test.ts',
] as const

const STUDIO_PROOF_TESTS = [
  'src/engine.test.ts',
  'src/blanket/compileProject.test.ts',
  'src/kcode/compileKCodeArtifact.test.ts',
  'src/kcode/MachineMovementView.test.tsx',
  'src/chart/AuthoredMachinePanel.test.ts',
] as const

const CONTRACT_SOURCES = [
  'src/knitout/kcode/machine-profile.ts',
  'src/knitout/kcode/types.ts',
  'src/knitout/kcode/parser.ts',
  'src/knitout/kcode/emitter.ts',
  'src/knitout/kcode/bytes.ts',
  'src/knitout/kcode/machine-trace.ts',
  'src/knitout/kcode/machine-validator.ts',
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
] as const

const PROOF_HARNESS_SOURCES = [
  'scripts/kcode-proof.ts',
  'package.json',
  'tsconfig.json',
  '../../package.json',
  '../../pnpm-lock.yaml',
  '../../pnpm-workspace.yaml',
  '../../tsconfig.base.json',
  '../../apps/studio/package.json',
  '../../apps/studio/index.html',
  '../../apps/studio/tsconfig.json',
  '../../apps/studio/vite.config.ts',
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

const FINGERPRINT_SOURCES = [
  ...new Set<string>([
    ...CONTRACT_SOURCES,
    ...PROOF_HARNESS_SOURCES,
    ...listFilesRecursively('src'),
    ...listFilesRecursively('scripts'),
    ...listFilesRecursively('../../apps/studio/src'),
  ]),
].sort()

function sha256(bytes: Uint8Array | string): string {
  return createHash('sha256').update(bytes).digest('hex')
}

function runGate(id: string, args: readonly string[]): GateResult {
  process.stdout.write(`\n== KCode proof: ${id} ==\n`)
  const result = spawnSync('pnpm', [...args], { cwd: process.cwd(), stdio: 'inherit', shell: false })
  const exitCode = typeof result.status === 'number' ? result.status : 1
  return {
    id,
    command: `pnpm ${args.join(' ')}`,
    status: exitCode === 0 ? 'pass' : 'fail',
    exitCode,
  }
}

function collectReferenceCorpus() {
  // The repository documents these as captured Kniterate App references.
  // Keeping the provenance explicit avoids silently guessing at import time.
  const corpusDialect = 'app' as const
  const referenceRoot = resolve(process.cwd(), 'reference')
  const fixtures = readdirSync(referenceRoot)
    .filter((name) => name.endsWith('.kc'))
    .sort()
    .map((name) => {
      const path = resolve(referenceRoot, name)
      const bytes = readFileSync(path)
      const parsed = parseKCodeBytes(bytes, {
        profile: KNITERATE_7GG_KCODE_PROFILE_V1,
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
        KNITERATE_7GG_KCODE_PROFILE_V1,
      )
      const emitted = emitKCodeDocumentBytes(parsed.document)
      if (!Buffer.from(emitted).equals(bytes)) {
        throw new Error(`${name} did not round-trip to its exact original bytes`)
      }
      const validation = validateKCodeMachineTrace(
        trace,
        KNITERATE_7GG_KCODE_PROFILE_V1,
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
  const files = FINGERPRINT_SOURCES.map((path) => {
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

function main(): void {
  const outputFlag = process.argv.findIndex((argument) => argument === '--out' || argument === '-o')
  const outputPath = resolve(
    process.cwd(),
    outputFlag === -1
      ? 'out/kcode-proof/proof-manifest.json'
      : process.argv[outputFlag + 1] ?? 'out/kcode-proof/proof-manifest.json',
  )
  const temporaryOutputPath = `${outputPath}.${process.pid}.tmp`
  mkdirSync(dirname(outputPath), { recursive: true })
  // A failed audit must never leave a prior software-proven receipt behind.
  rmSync(outputPath, { force: true })
  rmSync(temporaryOutputPath, { force: true })

  const gates = [
    runGate('deterministic-kcode-proof-tests', [
      'exec', 'vitest', 'run', ...PROOF_TESTS,
    ]),
    runGate('machine-lib-typecheck', ['typecheck']),
    runGate('studio-kcode-integration-tests', [
      '--dir', '../../apps/studio', 'exec', 'vitest', 'run', ...STUDIO_PROOF_TESTS,
    ]),
    runGate('studio-typecheck', ['--dir', '../../apps/studio', 'typecheck']),
    runGate('studio-production-build', [
      '--dir', '../../apps/studio', 'exec', 'vite', 'build',
    ]),
  ]
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
  const corpus = capture('reference-corpus', collectReferenceCorpus)
  const contract = capture('proof-input-fingerprint', collectContractFingerprint)
  const toolchain = capture('toolchain-fingerprint', collectToolchainFingerprint)
  const blocked = gates.some((gate) => gate.status === 'fail') || auditFailures.length > 0
  const manifest = {
    kind: 'kniterate-studio-kcode-software-proof',
    schemaVersion: 1,
    verdict: blocked ? 'blocked' : 'software-proven',
    profile: {
      id: KNITERATE_7GG_KCODE_PROFILE_V1.profileId,
      version: KNITERATE_7GG_KCODE_PROFILE_V1.profileVersion,
      gauge: KNITERATE_7GG_KCODE_PROFILE_V1.machine.gauge,
      needlesPerBed: KNITERATE_7GG_KCODE_PROFILE_V1.machine.needlesPerBed,
      emittedDialect: KNITERATE_7GG_KCODE_PROFILE_V1.dialect,
    },
    claims: [
      'strict-lossless-kcode-byte-roundtrip',
      'deterministic-pinned-backend-lowering',
      'kcode-encoded-scheduled-pass-to-machine-trace-differential',
      'kcode-native-loop-and-kinematic-validation',
      'full-machine-trace-diff',
      'deterministic-pass-bed-carrier-scene',
    ],
    deterministicSeeds: {
      validDocumentProperty: 1262702404,
      grammarMutationProperty: 1297437761,
      traceDiffProperty: 1262699590,
      validatorContainmentProperty: 1447119945,
      scheduledBackendDifferential: 1414676803,
      independentReferenceOracle: 1330790723,
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
      compared: 'every KCode-encoded scheduled field',
      backendOnlyProvenance: ['sourceLines', 'isAutoMove', 'comment'],
      note: 'sourceLines and claimed design rows fail closed against parsed Knitout; isAutoMove and comment are preserved backend annotations. None can be reconstructed from KCode bytes.',
    },
    mutationEvidence: {
      inputGrammarAndDiffMutations: true,
      implementationSourceMutationScoring: false,
      opportunity: 'Add a deterministic source-mutation score gate for the parser, projector, validator, and trace diff.',
    },
    physicalAcceptance: {
      included: false,
      command: 'pnpm release:physical-check',
      note: 'A machine run is a separate final acceptance gate and is not used as a software oracle.',
    },
  }

  writeFileSync(temporaryOutputPath, `${JSON.stringify(manifest, null, 2)}\n`)
  renameSync(temporaryOutputPath, outputPath)
  process.stdout.write(`\n${manifest.verdict}\nManifest: ${relative(process.cwd(), outputPath)}\n`)
  if (blocked) process.exit(2)
}

main()
