import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, relative, resolve, sep } from 'node:path'
import ts from 'typescript'
import { afterEach, describe, expect, it } from 'vitest'
import { collectContractFingerprint } from '../scripts/kcode-proof.js'
import { COMPILER_FINGERPRINT_INPUTS, computeCompilerFingerprint } from '../scripts/registry-support.js'

const machineRoot = resolve(__dirname, '..')
const repositoryRoot = resolve(machineRoot, '../..')
const temporaryRoots: string[] = []
const authoredEntries = [
  'apps/studio/src/blanket/compileProject.ts',
  'apps/studio/src/authoredPipeline.ts',
  'apps/studio/src/sweater/sweaterPipeline.ts',
]

/** Independently audit local runtime imports so a new planner cannot escape identity. */
function missingRuntimeInputs(root: string): string[] {
  const visited = new Set<string>()
  const visit = (path: string): void => {
    if (visited.has(path)) return
    visited.add(path)
    const source = ts.createSourceFile(path, readFileSync(path, 'utf8'), ts.ScriptTarget.Latest, true)
    source.forEachChild((node) => {
      if (!ts.isImportDeclaration(node) && !ts.isExportDeclaration(node)) return
      if (!node.moduleSpecifier || !ts.isStringLiteral(node.moduleSpecifier)) return
      if (ts.isExportDeclaration(node) && node.isTypeOnly) return
      if (ts.isImportDeclaration(node)) {
        if (node.importClause?.isTypeOnly) return
        const bindings = node.importClause?.namedBindings
        if (!node.importClause?.name && bindings && ts.isNamedImports(bindings)
          && bindings.elements.length > 0 && bindings.elements.every((item) => item.isTypeOnly)) return
      }
      const specifier = node.moduleSpecifier.text
      if (!specifier.startsWith('.')) return
      const base = resolve(dirname(path), specifier.replace(/\.js$/, ''))
      const dependency = [base + '.ts', base + '.tsx', base + '/index.ts'].find(existsSync)
      if (!dependency) throw new Error(`Missing runtime dependency: ${path} imports ${specifier}`)
      visit(dependency)
    })
  }
  for (const entry of authoredEntries) visit(resolve(root, entry))
  return [...visited].map((path) => relative(root, path).split(sep).join('/')).filter((path) =>
    !COMPILER_FINGERPRINT_INPUTS.some((input) => path === input || path.startsWith(input + '/')),
  ).sort()
}

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) rmSync(root, { recursive: true, force: true })
})

/** Preserve the real dependency inventory in a tiny clone, without real artifacts. */
function sourceClone() {
  const root = mkdtempSync(resolve(tmpdir(), 'kniterate-proof-inputs-'))
  temporaryRoots.push(root)
  const machine = resolve(root, 'packages/machine-lib')
  const inventory = collectContractFingerprint(machineRoot).files
  for (const { path } of inventory) {
    const target = resolve(machine, path)
    mkdirSync(dirname(target), { recursive: true })
    writeFileSync(target, `source fixture: ${path}\n`)
  }
  return { root, machine }
}

describe('software and physical proof dependency closure', () => {
  it('covers the runtime dependencies of rectangle, beanie, sweater and panel compilation', () => {
    expect(missingRuntimeInputs(repositoryRoot)).toEqual([])
  })

  it('detects an omitted implementation module when a pipeline starts importing it', () => {
    const clone = sourceClone()
    const helper = 'apps/studio/src/sweater/new-output-helper.ts'
    writeFileSync(resolve(clone.root, helper), 'export const settings = { stitch: 6 }\n')
    writeFileSync(resolve(clone.root, authoredEntries[2]!), "import { settings } from './new-output-helper'\nexport { settings }\n")
    expect(missingRuntimeInputs(clone.root)).toEqual([helper])
  })

  it('binds root commands and chart fixtures, including files added after the first capture', () => {
    const clone = sourceClone()
    const baseline = collectContractFingerprint(clone.machine)
    const changedInputs = [
      'scripts/studio.ts',
      'scripts/parity.ts',
      'fixtures/colorwork-chart-v1/customist-fairisle-reference.json',
    ]
    for (const input of changedInputs) {
      expect(baseline.files.some(({ path }) => path === `../../${input}`)).toBe(true)
      const path = resolve(clone.root, input)
      const original = readFileSync(path)
      writeFileSync(path, Buffer.concat([original, Buffer.from('changed bytes\n')]))
      expect(collectContractFingerprint(clone.machine).sha256, input).not.toBe(baseline.sha256)
      writeFileSync(path, original)
    }
    for (const input of ['scripts/nested/new-command.ts', 'fixtures/colorwork-chart-v1/new-chart.json']) {
      const path = resolve(clone.root, input)
      mkdirSync(dirname(path), { recursive: true })
      writeFileSync(path, 'new source\n')
      expect(collectContractFingerprint(clone.machine).sha256, input).not.toBe(baseline.sha256)
      rmSync(path)
      expect(collectContractFingerprint(clone.machine).sha256).toBe(baseline.sha256)
    }
  })

  it('invalidates physical compiler identity when either trial fixture changes or disappears', () => {
    const clone = sourceClone()
    const baseline = computeCompilerFingerprint(clone.root)
    for (const input of [
      'fixtures/colorwork-chart-v1/customist-fairisle-reference.json',
      'packages/machine-lib/reference/fairisle.kc',
    ]) {
      const path = resolve(clone.root, input)
      const original = readFileSync(path)
      writeFileSync(path, Buffer.concat([original, Buffer.from('changed trial bytes\n')]))
      expect(computeCompilerFingerprint(clone.root), input).not.toBe(baseline)
      rmSync(path)
      expect(() => computeCompilerFingerprint(clone.root)).toThrow('compiler fingerprint input is missing')
      writeFileSync(path, original)
      expect(computeCompilerFingerprint(clone.root)).toBe(baseline)
    }
  })

  it('invalidates physical identity for changed or missing authored output and eligibility modules', () => {
    const clone = sourceClone()
    const baseline = computeCompilerFingerprint(clone.root)
    for (const input of [
      'apps/studio/src/sweater/sweaterPipeline.ts',
      'apps/studio/src/sweater/draft.ts',
      'apps/studio/src/sweater/rasterize.ts',
      'apps/studio/src/sweater/textures.ts',
      'apps/studio/src/sweater/panel.ts',
      'apps/studio/src/machineSetup.ts',
      'apps/studio/src/engine.ts',
      'apps/studio/src/kcode/compileKCodeArtifact.ts',
    ]) {
      const path = resolve(clone.root, input)
      const original = readFileSync(path)
      writeFileSync(path, Buffer.concat([original, Buffer.from('changed production behavior\n')]))
      expect(computeCompilerFingerprint(clone.root), input).not.toBe(baseline)
      rmSync(path)
      expect(() => computeCompilerFingerprint(clone.root), input).toThrow('compiler fingerprint input is missing')
      writeFileSync(path, original)
    }
    expect(computeCompilerFingerprint(clone.root)).toBe(baseline)
    const ui = resolve(clone.root, 'apps/studio/src/sweater/SweaterWorkspace.tsx')
    writeFileSync(ui, 'presentation-only change\n')
    expect(computeCompilerFingerprint(clone.root)).toBe(baseline)
  })

  it('uses portable source identity across clone locations', () => {
    const first = sourceClone()
    const second = sourceClone()
    expect(collectContractFingerprint(first.machine)).toEqual(collectContractFingerprint(second.machine))
    expect(computeCompilerFingerprint(first.root)).toBe(computeCompilerFingerprint(second.root))
  })
})
