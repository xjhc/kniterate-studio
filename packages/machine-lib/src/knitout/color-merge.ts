import type { KnitlabChartState } from '../colorwork/knitlab1-contract.js';

export interface ColorMerge {
  fromKeyId: string;
  toKeyId: string;
}

function rawMergeMap(merges: readonly ColorMerge[] | undefined): Map<string, string> {
  const map = new Map<string, string>();
  for (const merge of merges ?? []) {
    const from = merge.fromKeyId.trim();
    const to = merge.toKeyId.trim();
    if (!from || !to || from === to) continue;
    map.set(from, to);
  }
  return map;
}

function targetFromMap(keyId: string, map: ReadonlyMap<string, string>): string {
  let current = keyId;
  const seen = new Set<string>();
  while (map.has(current)) {
    if (seen.has(current)) return keyId;
    seen.add(current);
    const next = map.get(current);
    if (!next || next === current) return current;
    current = next;
  }
  return current;
}

export function colorMergeTargetForKeyId(
  keyId: string,
  merges: readonly ColorMerge[] | undefined,
): string {
  return targetFromMap(keyId, rawMergeMap(merges));
}

export function normalizeColorMerges(
  merges: readonly ColorMerge[] | undefined,
): ColorMerge[] {
  const map = rawMergeMap(merges);
  const normalized: ColorMerge[] = [];
  for (const fromKeyId of map.keys()) {
    const toKeyId = targetFromMap(fromKeyId, map);
    if (toKeyId !== fromKeyId) normalized.push({ fromKeyId, toKeyId });
  }
  return normalized;
}

export function mergeColorKeyIds(
  merges: readonly ColorMerge[] | undefined,
  fromKeyId: string,
  toKeyId: string,
): ColorMerge[] {
  const targetKeyId = colorMergeTargetForKeyId(toKeyId, merges);
  if (!fromKeyId || !targetKeyId || fromKeyId === targetKeyId) {
    return removeColorMerge(merges, fromKeyId);
  }
  return normalizeColorMerges([
    ...(merges ?? []).filter(merge => merge.fromKeyId !== fromKeyId),
    { fromKeyId, toKeyId: targetKeyId },
  ]);
}

export function removeColorMerge(
  merges: readonly ColorMerge[] | undefined,
  fromKeyId: string,
): ColorMerge[] {
  return normalizeColorMerges((merges ?? []).filter(merge => merge.fromKeyId !== fromKeyId));
}

export function applyColorMergesToChart(
  chart: KnitlabChartState,
  merges: readonly ColorMerge[] | undefined,
): KnitlabChartState {
  const normalized = normalizeColorMerges(merges);
  if (normalized.length === 0) return chart;
  const rewriteKeyId = (keyId: string): string => colorMergeTargetForKeyId(keyId, normalized);
  return {
    ...chart,
    layers: chart.layers.map(layer => ({
      ...layer,
      keyPlacements: layer.keyPlacements.map(placement => ({
        ...placement,
        keyId: rewriteKeyId(placement.keyId),
      })),
      grid: rewriteLayerGrid(layer.grid, rewriteKeyId),
    })),
  };
}

function rewriteLayerGrid(
  grid: Record<string, unknown>,
  rewriteKeyId: (keyId: string) => string,
): Record<string, unknown> {
  const nextGrid: Record<string, unknown> = {};
  for (const [rowKey, rowValue] of Object.entries(grid ?? {})) {
    if (!rowValue || typeof rowValue !== 'object' || Array.isArray(rowValue)) {
      nextGrid[rowKey] = rowValue;
      continue;
    }
    const nextRow: Record<string, unknown> = {};
    for (const [colKey, cellValue] of Object.entries(rowValue as Record<string, unknown>)) {
      if (!cellValue || typeof cellValue !== 'object' || Array.isArray(cellValue)) {
        nextRow[colKey] = cellValue;
        continue;
      }
      const cell = cellValue as Record<string, unknown>;
      nextRow[colKey] = typeof cell.keyId === 'string'
        ? { ...cell, keyId: rewriteKeyId(cell.keyId) }
        : cellValue;
    }
    nextGrid[rowKey] = nextRow;
  }
  return nextGrid;
}
