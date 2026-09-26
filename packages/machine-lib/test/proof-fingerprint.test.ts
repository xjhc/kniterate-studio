import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { collectContractFingerprint } from '../scripts/kcode-proof.js'
import { computeCompilerFingerprint } from '../scripts/registry-support.js'

const machineRoot = resolve(__dirname, '..')
const temporaryRoots: string[] = []

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

  it('uses portable source identity across clone locations', () => {
    const first = sourceClone()
    const second = sourceClone()
    expect(collectContractFingerprint(first.machine)).toEqual(collectContractFingerprint(second.machine))
    expect(computeCompilerFingerprint(first.root)).toBe(computeCompilerFingerprint(second.root))
  })
})
