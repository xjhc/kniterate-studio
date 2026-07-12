import registry from '../registry/knit-proven.json';

export interface KnitProvenRegistryEntry {
  id: string;
  sourceFingerprint: string;
  knitoutSha256: string;
  kcodeSha256: string;
  compilerFingerprint: string;
}

export interface KnitProvenMatch extends KnitProvenRegistryEntry {}

interface KnitProvenRegistry {
  kind: 'kniterate-knit-proven-registry';
  schemaVersion: 1;
  compilerFingerprint: string;
  entries: KnitProvenRegistryEntry[];
}

const manifest = registry as KnitProvenRegistry;

export function findKnitProvenMatch(
  entries: readonly KnitProvenRegistryEntry[],
  compilerFingerprint: string,
  sourceFingerprint: string | null | undefined,
  kcodeSha256: string | null | undefined,
): KnitProvenMatch | null {
  if (!sourceFingerprint || !kcodeSha256) return null;
  return entries.find((entry) =>
    entry.compilerFingerprint === compilerFingerprint
    && entry.sourceFingerprint === sourceFingerprint
    && entry.kcodeSha256 === kcodeSha256,
  ) ?? null;
}

export function findKnitProvenKCodeMatch(
  entries: readonly KnitProvenRegistryEntry[],
  compilerFingerprint: string,
  kcodeSha256: string | null | undefined,
): KnitProvenMatch | null {
  if (!kcodeSha256) return null;
  return entries.find((entry) =>
    entry.compilerFingerprint === compilerFingerprint
    && entry.kcodeSha256 === kcodeSha256,
  ) ?? null;
}

export function matchKnitProvenArtifact(
  sourceFingerprint: string | null | undefined,
  kcodeSha256: string | null | undefined,
): KnitProvenMatch | null {
  return findKnitProvenMatch(
    manifest.entries,
    manifest.compilerFingerprint,
    sourceFingerprint,
    kcodeSha256,
  );
}

export function matchKnitProvenKCode(kcodeSha256: string | null | undefined): KnitProvenMatch | null {
  return findKnitProvenKCodeMatch(manifest.entries, manifest.compilerFingerprint, kcodeSha256);
}

export function knitProvenRegistryEntries(): readonly KnitProvenRegistryEntry[] {
  return manifest.entries;
}
