import { spawnSync } from 'node:child_process'
import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  symlinkSync,
  truncateSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createColorworkProjectV1 } from '../../project-contract/src/index.js'
import { compileColorworkProject } from '../../../apps/studio/src/blanket/compileProject.js'
import {
  bindV1KnitTrialReleaseSource,
  compileCurrentV1KnitTrial,
  readCleanV1KnitTrialReleaseSource,
  writeV1KnitTrial,
  type V1KnitTrialCompileResult,
} from '../../../scripts/build-v1-knit-trial.js'
import { checkCurrentV1PhysicalRelease } from '../../../scripts/check-v1-physical-release.js'
import { knitoutToKCodeWithTrace } from '../src/knitout/kniterate/to-kcode.js'
import {
  compileRegistryRequestCurrent,
  computeCompilerFingerprint,
  sha256Bytes,
} from '../scripts/registry-support.js'

const temporaryRoots: string[] = []
const PHOTO_VIEWS = ['front', 'back', 'cast-on', 'left-edge', 'right-edge', 'bind-off'] as const
const SECTIONS = ['waste', 'castOn', 'drawThread', 'carrierBringIn', 'body', 'backing', 'leftEdge', 'rightEdge', 'bindOff'] as const

interface CheckerEntryResult {
  ok: boolean
  stale: boolean
  knitProven: boolean
  outcome: string | null
  messages: string[]
  currentnessMessages: string[]
  promotionMessages: string[]
}

interface CheckerReport {
  ok: boolean
  compilerFingerprint: string
  entryCount: number
  knitProvenCount: number
  staleCount: number
  nonPromotableCount: number
  registryMessages: string[]
  manifestMessages: string[]
  entries: CheckerEntryResult[]
  controllerObservedCoverage: {
    status: 'pending' | 'exact-artifact-observed'
    evidenceCount: number
    profile: { id: string; version: number; sha256: string; contractSha256: string }
    byMachine: Record<string, {
      key: string
      machineSerial: string
      controlSoftwareVersion: string
      exactArtifactCount: number
      kcodeSha256: string[]
      operations: string[]
      directions: string[]
      carriers: string[]
      racks: number[]
      combinations: Array<{
        operation: string
        direction: string
        carrier: string
        rack: number
      }>
    }>
  }
}

const chart = {
  kind: 'knitlab-colorwork-chart',
  version: 1,
  title: 'Registry currentness fixture',
  width: 4,
  height: 2,
  rowNumbering: 'bottom-up',
  palette: [
    { id: 'natural', name: 'Natural', hex: '#F4F0E8' },
    { id: 'red', name: 'Red', hex: '#B93A32' },
  ],
  cells: [[0, 1, 0, 1], [1, 0, 1, 0]],
} as const

function registryFixture(): { root: string; manifest: string } {
  const parent = mkdtempSync(join(tmpdir(), 'kniterate-registry-'))
  temporaryRoots.push(parent)
  const root = join(parent, 'swatches')
  const template = join(root, '_template')
  mkdirSync(template, { recursive: true })
  writeFileSync(join(root, '_schema.json'), '{}\n')
  for (const name of [
    'spec.json',
    'request.json',
    'machine.json',
    'yarn.json',
    'run.json',
    'out.k',
    'out.kc',
    'outcome.md',
  ]) writeFileSync(join(template, name), '')
  return { root, manifest: join(parent, 'knit-proven.json') }
}

function currentArtifacts() {
  const project = createColorworkProjectV1(chart, { id: 'registry-currentness-fixture', needleOffset: 40 })
  const compiled = compileColorworkProject(project)
  if (!compiled.ok || compiled.knitoutText === null || compiled.inputHash === null) throw new Error('registry fixture project did not compile')
  const converted = knitoutToKCodeWithTrace(compiled.knitoutText, 'command.k')
  if (!converted.ok) throw new Error(converted.error)
  return {
    project,
    sourceFingerprint: compiled.inputHash,
    knitoutText: compiled.knitoutText,
    kcodeText: converted.kcode,
  }
}

function writeObject(path: string, value: unknown): void {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`)
}

function readObject(path: string): Record<string, any> {
  return JSON.parse(readFileSync(path, 'utf8')) as Record<string, any>
}

function writeCurrentEntry(root: string, reemitStatus: 'matches' | 'not-run' = 'matches'): string {
  const artifacts = currentArtifacts()
  const dir = join(root, '2026-08-25-currentness-fixture')
  mkdirSync(dir, { recursive: true })
  const request = {
    $schema: '../_schema.json',
    kind: 'kniterate-studio-project',
    description: 'Fixed in-process currentness fixture',
    reemitCommand: 'definitely-not-a-command --must-never-run',
    inputFiles: ['project.kniterate-studio.json'],
  }
  writeObject(join(dir, 'project.kniterate-studio.json'), artifacts.project)
  writeObject(join(dir, 'request.json'), request)
  const current = compileRegistryRequestCurrent(dir, request)
  if (!current.ok || current.expectedMachine === null) throw new Error(current.messages.join('; '))
  const expected = current.expectedMachine
  const spec = {
    $schema: '../_schema.json',
    kind: 'colorwork-blanket',
    sourceFingerprint: artifacts.sourceFingerprint,
    compilerFingerprint: computeCompilerFingerprint(),
    knitoutSha256: sha256Bytes(artifacts.knitoutText),
    kcodeSha256: sha256Bytes(artifacts.kcodeText),
    emitterCommit: 'd'.repeat(40),
    compiledAt: '2026-08-25T00:00:00Z',
    compileResultOk: true,
    request: { path: 'request.json' },
    reemitCheck: { status: reemitStatus },
  }
  const yarns = expected.carriers.map((carrier, index) => ({
    carrier: carrier.carrier,
    role: carrier.role,
    name: `Fixture yarn ${index + 1}`,
    brand: 'Fixture Mill',
    line: 'Proof Worsted',
    lot: `LOT-${index + 1}`,
    fiber: '100% wool',
    weight: '2/12 Nm',
    ply: 2,
    color: `color-${index + 1}`,
    coneSource: `fixture-cone-${index + 1}`,
  }))
  const machine = {
    $schema: '../_schema.json',
    kind: 'kniterate-machine-run-v1',
    schemaVersion: 1,
    ranAt: '2026-08-25T01:00:00Z',
    machineSerial: 'fixture-machine-001',
    controlSoftwareVersion: 'fixture-control-1.0',
    profile: expected.profile,
    program: {
      compilerCoordinateStart: expected.compilerCoordinates.start,
      compilerCoordinateEnd: expected.compilerCoordinates.end,
      coordinateBridge: expected.coordinateBridge,
      ...expected.program,
    },
    carriers: Object.fromEntries(expected.carriers.map((carrier, index) => [carrier.carrier, {
      role: carrier.role,
      yarnEntry: `yarn.json#yarns[${index}]`,
    }])),
    deviationsFromCompile: [],
  }
  const measuredGauge = { status: 'measured', stitchesPer10cm: 20, rowsPer10cm: 28 }
  const yarn = {
    $schema: '../_schema.json',
    kind: 'kniterate-yarn-evidence-v1',
    schemaVersion: 1,
    yarns,
    tensionSwatch: {
      machineProfile: expected.profile,
      structure: 'stockinette tension swatch',
      settings: expected.program.initialSettings,
      measuredBy: 'Gauge Operator',
      measuredOn: '2026-08-24',
      measurements: {
        offMachine: measuredGauge,
        rested24h: measuredGauge,
        steamed: measuredGauge,
        wetFinished: measuredGauge,
      },
      notes: 'Stable fixture measurements.',
    },
  }
  const run = {
    $schema: '../_schema.json',
    kind: 'kniterate-run-observation-v1',
    schemaVersion: 1,
    operator: 'Run Operator',
    startedAt: '2026-08-25T01:00:00Z',
    endedAt: '2026-08-25T02:00:00Z',
    outcome: 'clean',
    artifact: {
      loadedKcodeSha256: current.kcodeSha256,
      displayedPassCount: expected.emittedPassCount,
      manualProgramEdits: false,
    },
    physicalPlacement: {
      verified: true,
      compilerCoordinateStart: expected.compilerCoordinates.start,
      compilerCoordinateEnd: expected.compilerCoordinates.end,
      physicalNeedleStart: 101,
      physicalNeedleEnd: 104,
      orientation: 'increasing',
      method: 'Vendor datum card procedure revision 1',
      verifiedBy: 'Placement Verifier',
      verifiedAt: '2026-08-25T00:55:00Z',
    },
    manualInterventions: [],
    observations: {
      sections: Object.fromEntries(SECTIONS.map((section) => [section, 'clean'])),
      stops: [],
      dimensionsCm: {
        offMachine: { status: 'measured', width: 12.4, height: 8.2, measuredAt: '2026-08-25T02:05:00Z' },
        rested24h: { status: 'measured', width: 12.1, height: 8, measuredAt: '2026-08-26T02:05:00Z' },
      },
      photos: PHOTO_VIEWS.map((view, index) => ({ view, path: `photo-${view}.jpg`, sha256: String(index + 1).repeat(64) })),
      notes: 'All required sections observed.',
    },
  }
  writeObject(join(dir, 'spec.json'), spec)
  writeObject(join(dir, 'machine.json'), machine)
  writeObject(join(dir, 'yarn.json'), yarn)
  writeObject(join(dir, 'run.json'), run)
  writeFileSync(join(dir, 'out.k'), artifacts.knitoutText)
  writeFileSync(join(dir, 'out.kc'), artifacts.kcodeText)
  writeFileSync(join(dir, 'outcome.md'), '# Outcome narrative\n\n## What worked\n\nThe programmed structure completed.\n\n## What failed or changed\n\nNothing failed or changed.\n\n## Follow-up\n\nRetain the recorded settings.\n')
  return dir
}

function runChecker(root: string, options: { check?: boolean; json?: boolean } = {}) {
  return spawnSync(
    process.execPath,
    [
      '--import',
      'tsx',
      'scripts/kniterate-swatch-registry-check.ts',
      root,
      ...(options.check ? ['--check'] : []),
      ...(options.json ? ['--json'] : []),
    ],
    { cwd: resolve(import.meta.dirname, '..'), encoding: 'utf8', shell: false },
  )
}

function jsonReport(root: string, expectedStatus = 0): CheckerReport {
  const result = runChecker(root, { json: true })
  expect(result.status, result.stderr || result.stdout).toBe(expectedStatus)
  return JSON.parse(result.stdout) as CheckerReport
}

function temporaryFile(name: string): string {
  const root = mkdtempSync(join(tmpdir(), 'kniterate-release-registry-'))
  temporaryRoots.push(root)
  return join(root, name)
}

function registryForTrial(trial: V1KnitTrialCompileResult, mutation: Partial<{ sourceFingerprint: string; knitoutSha256: string; kcodeSha256: string }> = {}) {
  return {
    kind: 'kniterate-knit-proven-registry',
    schemaVersion: 1,
    compilerFingerprint: trial.manifest.compilerFingerprint,
    entries: [{
      id: 'synthetic-exact-physical-match',
      compilerFingerprint: trial.manifest.compilerFingerprint,
      sourceFingerprint: mutation.sourceFingerprint ?? trial.manifest.identity.compileHash,
      knitoutSha256: mutation.knitoutSha256 ?? trial.manifest.identity.knitoutSha256,
      kcodeSha256: mutation.kcodeSha256 ?? trial.manifest.identity.kcodeSha256,
    }],
  }
}

let cachedTrial: V1KnitTrialCompileResult | null = null
function currentTrial(): V1KnitTrialCompileResult {
  cachedTrial ??= compileCurrentV1KnitTrial()
  return cachedTrial
}

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) rmSync(root, { recursive: true, force: true })
})

describe('generated physical registry manifest', { timeout: 30_000 }, () => {
  it('publishes strict structured machine, yarn, and run templates with the exact outcome enum', () => {
    const root = resolve(import.meta.dirname, '../registry/swatches')
    const machine = readObject(join(root, '_template/machine.json'))
    const yarn = readObject(join(root, '_template/yarn.json'))
    const run = readObject(join(root, '_template/run.json'))
    const schema = readObject(join(root, '_schema.json'))
    expect(machine).toMatchObject({ kind: 'kniterate-machine-run-v1', schemaVersion: 1 })
    expect(yarn).toMatchObject({ kind: 'kniterate-yarn-evidence-v1', schemaVersion: 1 })
    expect(run).toMatchObject({ kind: 'kniterate-run-observation-v1', schemaVersion: 1 })
    expect(schema.$defs.runObservation.properties.outcome.enum).toEqual(['clean', 'dropped', 'jammed', 'aborted', 'partial'])
    expect(schema.$defs.machine.additionalProperties).toBe(false)
    expect(schema.$defs.yarnEvidence.additionalProperties).toBe(false)
    expect(schema.$defs.runObservation.additionalProperties).toBe(false)
  })

  it('supports an empty registry, writes explicitly, checks without mutation, and rejects stale manifest bytes', () => {
    const fixture = registryFixture()
    writeFileSync(fixture.manifest, 'trusted-old-bytes\n')
    const oldInode = statSync(fixture.manifest).ino
    const written = runChecker(fixture.root)
    expect(written.status, written.stderr).toBe(0)
    const expected = readFileSync(fixture.manifest, 'utf8')
    expect(JSON.parse(expected)).toMatchObject({ entries: [] })
    expect(statSync(fixture.manifest).ino).not.toBe(oldInode)
    expect(readdirSync(join(fixture.root, '..')).filter((name) => name.includes('.knit-proven.json.') && name.endsWith('.tmp'))).toEqual([])

    const current = runChecker(fixture.root, { check: true })
    expect(current.status, current.stderr).toBe(0)
    expect(readFileSync(fixture.manifest, 'utf8')).toBe(expected)

    writeFileSync(fixture.manifest, '{}\n')
    const stale = runChecker(fixture.root, { check: true })
    expect(stale.status).toBe(2)
    expect(stale.stdout).toContain('registry/knit-proven.json is stale')
    expect(readFileSync(fixture.manifest, 'utf8')).toBe('{}\n')
  })

  it('preserves the trusted manifest when template or entry validation fails', () => {
    const fixture = registryFixture()
    writeFileSync(fixture.manifest, 'trusted-manifest-bytes\n')
    const before = statSync(fixture.manifest)
    rmSync(join(fixture.root, '_template', 'run.json'))
    mkdirSync(join(fixture.root, 'malformed-entry'))

    const failed = runChecker(fixture.root, { json: true })
    expect(failed.status, failed.stderr || failed.stdout).toBe(2)
    expect(readFileSync(fixture.manifest, 'utf8')).toBe('trusted-manifest-bytes\n')
    expect(statSync(fixture.manifest).ino).toBe(before.ino)
    expect(JSON.parse(failed.stdout).manifestMessages).toContainEqual(expect.stringContaining('was preserved'))
    expect(readdirSync(join(fixture.root, '..')).filter((name) => name.includes('.knit-proven.json.') && name.endsWith('.tmp'))).toEqual([])
  })

  it('rejects a symlinked registry root without following it or replacing the trusted manifest', () => {
    const fixture = registryFixture()
    const outsideParent = mkdtempSync(join(tmpdir(), 'kniterate-outside-registry-'))
    temporaryRoots.push(outsideParent)
    const outsideRoot = join(outsideParent, 'outside-swatches')
    renameSync(fixture.root, outsideRoot)
    symlinkSync(outsideRoot, fixture.root, 'dir')
    writeFileSync(fixture.manifest, 'trusted-root-manifest\n')

    const result = runChecker(fixture.root, { json: true })
    expect(result.status, result.stderr || result.stdout).toBe(2)
    const report = JSON.parse(result.stdout) as CheckerReport
    expect(report.registryMessages).toContainEqual(expect.stringContaining('root must not be a symbolic link'))
    expect(readFileSync(fixture.manifest, 'utf8')).toBe('trusted-root-manifest\n')
  })

  it('caps total scanned dirents and registry diagnostics', () => {
    const fixture = registryFixture()
    for (let index = 0; index < 1_025; index++) writeFileSync(join(fixture.root, `unexpected-${String(index).padStart(4, '0')}.txt`), '')

    const report = jsonReport(fixture.root, 2)
    expect(report.registryMessages.length).toBeLessThanOrEqual(512)
    expect(report.registryMessages).toContainEqual(expect.stringContaining('1024-dirent intake limit'))
    expect(report.entries).toEqual([])
  })

  it('promotes only a complete exact record while ignoring recorded command/status claims', () => {
    const fixture = registryFixture()
    writeCurrentEntry(fixture.root, 'not-run')
    const report = jsonReport(fixture.root)
    expect(report.knitProvenCount).toBe(1)
    expect(report.entries[0]).toMatchObject({ ok: true, stale: false, knitProven: true, outcome: 'clean' })
    expect(report.entries[0]!.promotionMessages).toEqual([])
    expect(report.controllerObservedCoverage).toMatchObject({
      status: 'exact-artifact-observed',
      evidenceCount: 1,
      profile: { id: 'kniterate-7gg-kcode', version: 2 },
      byMachine: {
        'fixture-machine-001::fixture-control-1.0': {
          key: 'fixture-machine-001::fixture-control-1.0',
          machineSerial: 'fixture-machine-001',
          controlSoftwareVersion: 'fixture-control-1.0',
          exactArtifactCount: 1,
        },
      },
    })
    const observed = report.controllerObservedCoverage.byMachine['fixture-machine-001::fixture-control-1.0']!
    expect(observed.kcodeSha256).toEqual([
      sha256Bytes(currentArtifacts().kcodeText),
    ])
    expect(observed.combinations.length).toBeGreaterThan(0)
  })

  it('keeps a well-formed failed trial valid history but excludes it from promotion', () => {
    const fixture = registryFixture()
    const dir = writeCurrentEntry(fixture.root)
    const path = join(dir, 'run.json')
    const run = readObject(path)
    run.outcome = 'jammed'
    run.observations.sections.body = 'issue'
    run.observations.stops = [{ section: 'body', passIndex: 12, description: 'Yarn jam stopped carriage.' }]
    run.observations.dimensionsCm.rested24h = { status: 'not-measured', reason: 'The jammed sample was not retained for resting.' }
    run.observations.photos = []
    writeObject(path, run)
    const yarnPath = join(dir, 'yarn.json')
    const yarn = readObject(yarnPath)
    yarn.tensionSwatch.measurements.wetFinished = { status: 'not-performed', reason: 'The failed sample was not wet-finished.' }
    writeObject(yarnPath, yarn)

    const report = jsonReport(fixture.root)
    expect(report.entries[0]).toMatchObject({ ok: true, stale: false, knitProven: false, outcome: 'jammed' })
    expect(report.entries[0]!.messages).toEqual([])
    expect(report.entries[0]!.promotionMessages).toContainEqual(expect.stringContaining('not clean'))
    expect(report.controllerObservedCoverage).toMatchObject({
      status: 'pending',
      evidenceCount: 0,
      byMachine: {},
    })
  })

  it('keeps an exact-hash legacy command as stale history when current legality tightens', () => {
    const fixture = registryFixture()
    const dir = writeCurrentEntry(fixture.root)
    const kcodePath = join(dir, 'out.kc')
    const currentKcode = readFileSync(kcodePath, 'utf8')
    const legacyKcode = currentKcode.replace(/^(STIF:[^\n]*?)6/m, '$1G')
    expect(legacyKcode).not.toBe(currentKcode)
    writeFileSync(kcodePath, legacyKcode)
    const legacyHash = sha256Bytes(legacyKcode)

    const specPath = join(dir, 'spec.json')
    const spec = readObject(specPath)
    spec.kcodeSha256 = legacyHash
    writeObject(specPath, spec)
    const runPath = join(dir, 'run.json')
    const run = readObject(runPath)
    run.artifact.loadedKcodeSha256 = legacyHash
    writeObject(runPath, run)
    const machinePath = join(dir, 'machine.json')
    const machine = readObject(machinePath)
    machine.program.coordinateBridge.artifactKcodeSha256 = legacyHash
    writeObject(machinePath, machine)

    const report = jsonReport(fixture.root)
    expect(report.entries[0]).toMatchObject({
      ok: true,
      stale: true,
      knitProven: false,
      messages: [],
    })
    expect(report.entries[0]!.currentnessMessages).toEqual(expect.arrayContaining([
      expect.stringContaining('historical under the current profile'),
      expect.stringContaining('stored out.kc is not byte-identical'),
    ]))
    expect(report.controllerObservedCoverage).toMatchObject({
      status: 'pending',
      evidenceCount: 0,
      byMachine: {},
    })
  })

  it('rejects incomplete evidence and non-enum outcome text structurally', () => {
    const fixture = registryFixture()
    const dir = writeCurrentEntry(fixture.root)
    const machinePath = join(dir, 'machine.json')
    const machine = readObject(machinePath)
    delete machine.controlSoftwareVersion
    writeObject(machinePath, machine)
    const yarnPath = join(dir, 'yarn.json')
    const yarn = readObject(yarnPath)
    delete yarn.yarns[0].lot
    writeObject(yarnPath, yarn)
    const runPath = join(dir, 'run.json')
    const run = readObject(runPath)
    run.outcome = 'clean-ish'
    writeObject(runPath, run)

    const report = jsonReport(fixture.root, 2)
    expect(report.entries[0]).toMatchObject({ ok: false, knitProven: false, outcome: null })
    expect(report.entries[0]!.messages).toEqual(expect.arrayContaining([
      expect.stringContaining('controlSoftwareVersion is required'),
      expect.stringContaining('.lot is required'),
      expect.stringContaining('outcome must be exactly one of'),
    ]))
  })

  it('binds explicit-zone timestamps to the run and measurement chronology', () => {
    const fixture = registryFixture()
    const dir = writeCurrentEntry(fixture.root)
    const machinePath = join(dir, 'machine.json')
    const machine = readObject(machinePath)
    machine.ranAt = '2026-08-25T00:59:59Z'
    writeObject(machinePath, machine)
    const runPath = join(dir, 'run.json')
    const run = readObject(runPath)
    run.physicalPlacement.verifiedAt = '2026-08-25T00:55:00'
    run.observations.dimensionsCm.offMachine.measuredAt = '2026-08-25T01:59:59Z'
    run.observations.dimensionsCm.rested24h.measuredAt = '2026-08-26T01:59:59Z'
    writeObject(runPath, run)

    const report = jsonReport(fixture.root, 2)
    expect(report.entries[0]!.messages).toEqual(expect.arrayContaining([
      expect.stringContaining('ranAt must fall within'),
      expect.stringContaining('verifiedAt must be an RFC3339'),
      expect.stringContaining('off-machine dimensions must be measured at or after'),
      expect.stringContaining('rested24h dimensions must be measured at least 24 hours'),
    ]))
  })

  it('requires exact placement span and bounds event pass indexes by emitted pass count', () => {
    const fixture = registryFixture()
    const dir = writeCurrentEntry(fixture.root)
    const runPath = join(dir, 'run.json')
    const run = readObject(runPath)
    const firstInvalidPass = run.artifact.displayedPassCount
    run.physicalPlacement.physicalNeedleEnd += 1
    run.manualInterventions = [{ section: 'body', passIndex: firstInvalidPass, kind: 'loop-repair', alteredProgramOrSettings: false, description: 'Out-of-range fixture event.' }]
    run.observations.stops = [{ section: 'body', passIndex: firstInvalidPass, description: 'Out-of-range fixture stop.' }]
    writeObject(runPath, run)

    const report = jsonReport(fixture.root, 2)
    expect(report.entries[0]!.messages).toEqual(expect.arrayContaining([
      expect.stringContaining('placement span must equal the mapped trace-coordinate span'),
      expect.stringContaining('manualInterventions[0].passIndex must be less than the current emitted pass count'),
      expect.stringContaining('observations.stops[0].passIndex must be less than the current emitted pass count'),
    ]))
  })

  it('accepts both endpoint orientations and rejects a mismatched orientation label', () => {
    const reversedFixture = registryFixture()
    const reversedDir = writeCurrentEntry(reversedFixture.root)
    const reversedPath = join(reversedDir, 'run.json')
    const reversed = readObject(reversedPath)
    reversed.physicalPlacement.physicalNeedleStart = 104
    reversed.physicalPlacement.physicalNeedleEnd = 101
    reversed.physicalPlacement.orientation = 'decreasing'
    writeObject(reversedPath, reversed)
    expect(jsonReport(reversedFixture.root).entries[0]).toMatchObject({
      ok: true,
      knitProven: true,
    })

    const mismatchFixture = registryFixture()
    const mismatchDir = writeCurrentEntry(mismatchFixture.root)
    const mismatchPath = join(mismatchDir, 'run.json')
    const mismatch = readObject(mismatchPath)
    mismatch.physicalPlacement.orientation = 'decreasing'
    writeObject(mismatchPath, mismatch)
    expect(jsonReport(mismatchFixture.root, 2).entries[0]!.messages).toContainEqual(
      expect.stringContaining('orientation must be increasing'),
    )
  })

  it('requires six distinct photo receipts and verifies referenced local bytes', () => {
    const fixture = registryFixture()
    const dir = writeCurrentEntry(fixture.root)
    const runPath = join(dir, 'run.json')
    const run = readObject(runPath)
    run.observations.photos[1].path = run.observations.photos[0].path
    run.observations.photos[1].sha256 = run.observations.photos[0].sha256
    writeFileSync(join(dir, run.observations.photos[0].path), 'different local photo bytes')
    writeObject(runPath, run)

    const report = jsonReport(fixture.root, 2)
    expect(report.entries[0]!.messages).toEqual(expect.arrayContaining([
      expect.stringContaining('path duplicates another photo receipt'),
      expect.stringContaining('sha256 duplicates another photo receipt'),
      expect.stringContaining('sha256 does not match the referenced local photo bytes'),
    ]))
  })

  it.each([
    {
      label: 'wide primitive array',
      mutate(dir: string) {
        const path = join(dir, 'request.json')
        const request = readObject(path)
        request.inputFiles = Array.from({ length: 100_001 }, () => 'x')
        writeObject(path, request)
      },
      message: 'node traversal limit',
    },
    {
      label: 'deep nested JSON',
      mutate(dir: string) {
        const path = join(dir, 'spec.json')
        const spec = readObject(path)
        let nested: Record<string, unknown> = {}
        spec.adversarial = nested
        for (let index = 0; index < 70; index++) {
          const next: Record<string, unknown> = {}
          nested.child = next
          nested = next
        }
        writeObject(path, spec)
      },
      message: 'nesting limit',
    },
  ])('blocks bounded traversal for a $label without crashing', ({ mutate, message }) => {
    const fixture = registryFixture()
    const dir = writeCurrentEntry(fixture.root)
    mutate(dir)
    const report = jsonReport(fixture.root, 2)
    expect(report.entries[0]!.messages).toContainEqual(expect.stringContaining(message))
    expect(report.entries[0]).toMatchObject({ ok: false, knitProven: false })
  })

  it('blocks oversized or symlinked evidence and never follows a photo symlink outside the entry', () => {
    const fixture = registryFixture()
    const dir = writeCurrentEntry(fixture.root)
    truncateSync(join(dir, 'out.kc'), 24 * 1024 * 1024 + 1)
    rmSync(join(dir, 'outcome.md'))
    symlinkSync('/etc/passwd', join(dir, 'outcome.md'))
    const runPath = join(dir, 'run.json')
    const run = readObject(runPath)
    const outsidePhoto = join(fixture.root, '..', 'outside-photo.jpg')
    writeFileSync(outsidePhoto, 'outside entry')
    symlinkSync(outsidePhoto, join(dir, run.observations.photos[0].path))

    const report = jsonReport(fixture.root, 2)
    expect(report.entries[0]!.messages).toEqual(expect.arrayContaining([
      expect.stringContaining('out.kc exceeds'),
      expect.stringContaining('outcome.md must not be a symbolic link'),
      expect.stringContaining('path must not traverse a symbolic link'),
    ]))
  })

  it('blocks registries above the bounded entry count without validating a partial prefix', () => {
    const fixture = registryFixture()
    for (let index = 0; index < 257; index++) mkdirSync(join(fixture.root, `entry-${String(index).padStart(3, '0')}`))
    const report = jsonReport(fixture.root, 2)
    expect(report.entryCount).toBe(257)
    expect(report.entries).toEqual([])
    expect(report.registryMessages).toContainEqual(expect.stringContaining('256-entry limit'))
  })

  it.each([
    {
      label: 'compiled-setting mismatch',
      mutate(dir: string) {
        const path = join(dir, 'machine.json')
        const machine = readObject(path)
        machine.program.initialSettings.speedNumber += 1
        writeObject(path, machine)
      },
      message: 'speedNumber differs from the current compile',
    },
    {
      label: 'recorded machine deviation',
      mutate(dir: string) {
        const path = join(dir, 'machine.json')
        const machine = readObject(path)
        const compiled = machine.program.initialSettings.speedNumber
        machine.program.initialSettings.speedNumber = compiled - 50
        machine.deviationsFromCompile = [{ field: 'program.initialSettings.speedNumber', compiled, actual: compiled - 50, reason: 'Operator reduced speed.' }]
        writeObject(path, machine)
      },
      message: 'deviations from the compiled program',
    },
    {
      label: 'manual intervention',
      mutate(dir: string) {
        const path = join(dir, 'run.json')
        const run = readObject(path)
        run.manualInterventions = [{ section: 'body', passIndex: 20, kind: 'loop-repair', alteredProgramOrSettings: false, description: 'Repaired one loop.' }]
        writeObject(path, run)
      },
      message: 'manual interventions',
    },
    {
      label: 'unverified physical placement',
      mutate(dir: string) {
        const path = join(dir, 'run.json')
        const run = readObject(path)
        run.physicalPlacement.verified = false
        run.physicalPlacement.physicalNeedleStart = null
        run.physicalPlacement.physicalNeedleEnd = null
        run.physicalPlacement.orientation = null
        run.physicalPlacement.method = null
        run.physicalPlacement.verifiedBy = null
        run.physicalPlacement.verifiedAt = null
        writeObject(path, run)
      },
      message: 'physical placement from compiler coordinates',
    },
  ])('keeps $label valid but non-promotable', ({ mutate, message }) => {
    const fixture = registryFixture()
    const dir = writeCurrentEntry(fixture.root)
    mutate(dir)
    const report = jsonReport(fixture.root)
    expect(report.entries[0]).toMatchObject({ ok: true, knitProven: false })
    expect(report.entries[0]!.promotionMessages).toContainEqual(expect.stringContaining(message))
  })

  it('keeps a stale-compiler entry structurally valid but excludes it from Knit-proven output', () => {
    const fixture = registryFixture()
    const dir = writeCurrentEntry(fixture.root)
    const specPath = join(dir, 'spec.json')
    const spec = readObject(specPath)
    spec.compilerFingerprint = '0'.repeat(64)
    writeObject(specPath, spec)
    const report = jsonReport(fixture.root)
    expect(report.entries[0]).toMatchObject({ ok: true, stale: true, knitProven: false })
    expect(report.entries[0]!.currentnessMessages).toContainEqual(expect.stringContaining('compiler fingerprint is stale'))
  })

  it("does not accept status='matches' when the stored artifact is not the current re-emission", () => {
    const fixture = registryFixture()
    const dir = writeCurrentEntry(fixture.root, 'matches')
    const outKcPath = join(dir, 'out.kc')
    writeFileSync(outKcPath, `${readFileSync(outKcPath, 'utf8')}\n// stale artifact\n`)
    const specPath = join(dir, 'spec.json')
    const spec = readObject(specPath)
    spec.kcodeSha256 = sha256Bytes(readFileSync(outKcPath))
    writeObject(specPath, spec)
    const report = jsonReport(fixture.root)
    expect(report.entries[0]).toMatchObject({ ok: true, stale: true, knitProven: false })
    expect(report.entries[0]!.currentnessMessages).toEqual(expect.arrayContaining([
      expect.stringContaining('stored out.kc is not byte-identical'),
      expect.stringContaining('current out.kc SHA-256 differs'),
    ]))
  })

  it('rejects a 50,000-row project at the fixed pre-compile budget seam', () => {
    const fixture = registryFixture()
    const dir = join(fixture.root, 'tall-project-budget-fixture')
    mkdirSync(dir)
    const project = createColorworkProjectV1(chart, { id: 'tall-project-budget-fixture', needleOffset: 40 }) as any
    project.base.chart.width = 1
    project.base.chart.height = 50_000
    project.base.chart.cells = Array.from({ length: 50_000 }, () => [0])
    project.base.rowIds = Array.from({ length: 50_000 }, (_, index) => `row_${index}`)
    const request = { kind: 'kniterate-studio-project', inputFiles: ['project.kniterate-studio.json'] }
    writeObject(join(dir, 'project.kniterate-studio.json'), project)

    const result = compileRegistryRequestCurrent(dir, request)
    expect(statSync(join(dir, 'project.kniterate-studio.json')).size).toBeLessThan(8 * 1024 * 1024)
    expect(result).toMatchObject({ supported: true, ok: false })
    expect(result.messages).toContainEqual(expect.stringContaining('project.base.chart.height 50000 exceeds the 300-row registry compile limit'))
  })
})

describe('fresh V1 physical release gate', { timeout: 30_000 }, () => {
  it('binds generated packages to one full clean Git commit and refuses dirty state', () => {
    const commit = 'a'.repeat(40)
    const source = readCleanV1KnitTrialReleaseSource((args) =>
      args[0] === 'rev-parse' ? `${commit}\n` : '')
    const bound = bindV1KnitTrialReleaseSource(currentTrial(), source, {
      path: 'packages/machine-lib/out/kcode-proof/proof-manifest.json',
      sha256: 'b'.repeat(64),
      verdict: 'software-proven',
      profileSha256: currentTrial().commandLegality.profile.sha256,
      contractSha256: currentTrial().commandLegality.contractSha256,
    })

    expect(bound.manifest.releaseSource).toEqual({ commit, worktree: 'clean' })
    expect(bound.commandLegality.proofReceipt).toMatchObject({
      sha256: 'b'.repeat(64),
      verdict: 'software-proven',
    })
    const destination = temporaryFile('trial-package')
    writeV1KnitTrial(bound, destination)
    const legality = readObject(join(destination, 'command-legality.json'))
    expect(legality).toMatchObject({
      controllerObserved: 'pending',
      proofReceipt: { sha256: 'b'.repeat(64), verdict: 'software-proven' },
      artifact: { kcodeSha256: bound.manifest.identity.kcodeSha256 },
    })
    expect(readFileSync(join(destination, 'CONTROLLER-REVIEW.md'), 'utf8')).toContain(
      'read by the machine from SD card',
    )
    const checklist = readFileSync(join(destination, 'OPERATOR-CHECKLIST.md'), 'utf8')
    expect(checklist).toContain('https://support.kniterate.com/hc/en-us/articles/18230075945885-Start-up-guide')
    expect(checklist).toContain('https://support.kniterate.com/hc/en-us/article_attachments/360009817198')
    expect(() => readCleanV1KnitTrialReleaseSource((args) =>
      args[0] === 'rev-parse' ? `${commit}\n` : '?? local-file\n'))
      .toThrow(/requires a clean working tree.*local-file/s)
  })

  it('compiles deterministically with self-consistent hashes and an explicit unverified placement gate', () => {
    const first = currentTrial()
    const second = compileCurrentV1KnitTrial()
    expect(second.knitoutText).toBe(first.knitoutText)
    expect(second.kcodeText).toBe(first.kcodeText)
    expect(second.manifest.identity).toEqual(first.manifest.identity)
    expect(first.manifest.identity.knitoutSha256).toBe(sha256Bytes(first.knitoutText))
    expect(first.manifest.identity.kcodeSha256).toBe(sha256Bytes(first.kcodeText))
    expect(first.manifest.machine.coordinateSystem).toContain('physical needle labels unverified')
    expect(first.manifest.machine.coordinateBridge).toMatchObject({
      artifactKcodeSha256: first.manifest.identity.kcodeSha256,
      compilerProject: { start: 95, end: 158 },
      kcodeColumn: { start: 94, end: 157 },
      traceCoordinate: { start: 94, end: 157 },
      offsets: {
        compilerProjectToKcodeColumn: -1,
        kcodeColumnToTraceCoordinate: 0,
      },
      physicalNeedleLabels: { status: 'unverified' },
    })
    expect(first.manifest.physicalPlacementGate.status).toBe('unverified')
    expect(first.manifest.physicalSettingsGate).toMatchObject({
      status: 'exact-candidate-recipe-recorded-operational-safety-unverified',
    })
    expect(first.operatorChecklist).toContain('controller-loaded initial recipe')
    expect(first.operatorChecklist).toContain('candidate commands, not a proven safe envelope')
    expect(first.operatorChecklist).toContain(`speed ${first.manifest.machine.program.initialSettings.speedNumber}`)
    expect(first.operatorChecklist).toContain(`roller ${first.manifest.machine.program.initialSettings.rollerAdvance}`)
    expect(second.commandLegality).toEqual(first.commandLegality)
    expect(first.commandLegality.artifact.kcodeSha256).toBe(sha256Bytes(first.kcodeText))
    expect(first.commandLegality.artifact.profileConformance).toBe('conformant')
    expect(first.commandLegality.artifact.scheduledTraceComparison).toEqual({
      schemaVersion: 1,
      ok: true,
      scheduledPassCount: first.manifest.output.emittedPasses,
      tracePassCount: first.manifest.output.emittedPasses,
      mismatches: [],
    })
    expect(first.commandLegality.coverage.combinations.length).toBeGreaterThan(0)
    expect(first.commandLegality.controllerObserved).toBe('pending')
    expect(first.controllerReview).toContain('controller-observed status is **pending**')
  })

  it('blocks an empty physical registry', () => {
    const trial = currentTrial()
    const path = temporaryFile('empty.json')
    writeObject(path, { kind: 'kniterate-knit-proven-registry', schemaVersion: 1, compilerFingerprint: trial.manifest.compilerFingerprint, entries: [] })
    expect(checkCurrentV1PhysicalRelease(path)).toMatchObject({ ok: false, matchingEntryId: null })
  })

  it('passes a synthetic exact current identity match', () => {
    const trial = currentTrial()
    const path = temporaryFile('exact.json')
    writeObject(path, registryForTrial(trial))
    expect(checkCurrentV1PhysicalRelease(path)).toMatchObject({ ok: true, matchingEntryId: 'synthetic-exact-physical-match' })
  })

  it('blocks a single-field identity mismatch', () => {
    const trial = currentTrial()
    const path = temporaryFile('mismatch.json')
    writeObject(path, registryForTrial(trial, { kcodeSha256: '0'.repeat(64) }))
    expect(checkCurrentV1PhysicalRelease(path)).toMatchObject({ ok: false, matchingEntryId: null })
  })
})
