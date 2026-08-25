import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { compileCurrentV1KnitTrial } from './build-v1-knit-trial.js';

interface KnitProvenRegistryV1 {
  kind: 'kniterate-knit-proven-registry';
  schemaVersion: 1;
  compilerFingerprint: string;
  entries: {
    id: string;
    sourceFingerprint: string;
    knitoutSha256: string;
    kcodeSha256: string;
    compilerFingerprint: string;
  }[];
}

const SHA256 = /^[a-f0-9]{64}$/;

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

export interface V1PhysicalReleaseCheckResult {
  readonly ok: boolean;
  readonly matchingEntryId: string | null;
  readonly compilerFingerprint: string;
  readonly sourceFingerprint: string;
  readonly knitoutSha256: string;
  readonly kcodeSha256: string;
}

function parseRegistry(path: string): KnitProvenRegistryV1 {
  const value = asRecord(JSON.parse(readFileSync(path, 'utf8')));
  if (
    value === null
    || value.kind !== 'kniterate-knit-proven-registry'
    || value.schemaVersion !== 1
    || typeof value.compilerFingerprint !== 'string'
    || !SHA256.test(value.compilerFingerprint)
    || !Array.isArray(value.entries)
  ) {
    throw new Error(`physical registry manifest is malformed: ${path}`);
  }
  const ids = new Set<string>();
  const entries = value.entries.map((entryValue, index) => {
    const entry = asRecord(entryValue);
    if (
      entry === null
      || typeof entry.id !== 'string'
      || entry.id.trim() === ''
      || typeof entry.sourceFingerprint !== 'string'
      || typeof entry.knitoutSha256 !== 'string'
      || typeof entry.kcodeSha256 !== 'string'
      || typeof entry.compilerFingerprint !== 'string'
      || entry.sourceFingerprint.trim() === ''
      || !SHA256.test(entry.knitoutSha256)
      || !SHA256.test(entry.kcodeSha256)
      || !SHA256.test(entry.compilerFingerprint)
      || ids.has(entry.id)
    ) throw new Error(`physical registry manifest entry ${index} is malformed: ${path}`);
    ids.add(entry.id);
    return entry as unknown as KnitProvenRegistryV1['entries'][number];
  });
  return {
    kind: 'kniterate-knit-proven-registry',
    schemaVersion: 1,
    compilerFingerprint: value.compilerFingerprint,
    entries,
  };
}

/**
 * Compile the fixed V1 trial now and compare its current identities with the
 * generated registry. This never reads an old trial manifest and never runs a
 * command recorded by a swatch entry.
 */
export function checkCurrentV1PhysicalRelease(
  registryPath = resolve('packages/machine-lib/registry/knit-proven.json'),
): V1PhysicalReleaseCheckResult {
  const trial = compileCurrentV1KnitTrial();
  const registry = parseRegistry(registryPath);
  const identity = trial.manifest.identity;
  const match = registry.entries.find((entry) =>
    registry.compilerFingerprint === trial.manifest.compilerFingerprint
    && entry.compilerFingerprint === registry.compilerFingerprint
    && entry.sourceFingerprint === identity.compileHash
    && entry.knitoutSha256 === identity.knitoutSha256
    && entry.kcodeSha256 === identity.kcodeSha256,
  );
  return {
    ok: match !== undefined,
    matchingEntryId: match?.id ?? null,
    compilerFingerprint: trial.manifest.compilerFingerprint,
    sourceFingerprint: identity.compileHash,
    knitoutSha256: identity.knitoutSha256,
    kcodeSha256: identity.kcodeSha256,
  };
}

function main(): void {
  const result = checkCurrentV1PhysicalRelease();
  if (!result.ok) {
    process.stderr.write(
      'v1 physical release gate: BLOCKED\n'
      + 'No current clean physical registry entry exactly matches a fresh in-process compile and KCode re-emission of the fixed V1 trial.\n',
    );
    process.exit(2);
  }
  process.stdout.write(`v1 physical release gate: PASS (${result.matchingEntryId})\n`);
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : null;
if (invokedPath === import.meta.url) main();
