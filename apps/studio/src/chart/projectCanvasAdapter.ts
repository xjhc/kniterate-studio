import type { PixelMutation } from '@knitlab/colorwork-core';
import type { ColorworkProjectV1, ProjectEdit } from '@kniterate-studio/project-contract';

export function pixelMutationToProjectEdit(project: ColorworkProjectV1, rowIds: readonly string[], mutation: PixelMutation): ProjectEdit | null {
  if (mutation.kind !== 'paint') return null;
  const cells = new Map<string, { rowId: string; column: number; paletteIndex: number }>();
  for (const cell of mutation.cells) {
    const rowId = rowIds[cell.row];
    if (!rowId) continue;
    cells.set(`${rowId}:${cell.column}`, { rowId, column: cell.column, paletteIndex: cell.paletteIndex });
  }
  return cells.size ? { kind: 'paint-cells', cells: [...cells.values()] } : null;
}

export function makeRowId(): string {
  return `row_${crypto.randomUUID().replace(/-/g, '').slice(0, 20)}`;
}
