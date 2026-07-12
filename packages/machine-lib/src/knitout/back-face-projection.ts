import type { ColorworkChartV1 } from '@kniterate-studio/chart-contract';
import type { CompiledRunArtifact } from './run-artifact.js';
import type { CarrierId, YarnBinding } from './types.js';

export interface BackFaceCell {
  kind: 'back-knit' | 'float' | 'none';
  paletteIndexes: readonly number[];
}

export interface BackFaceProjection {
  width: number;
  height: number;
  cells: readonly (readonly BackFaceCell[])[];
}

/**
 * Derive the visible reverse side from the same emitted program that gates the
 * run. No UI-side backing formulas are allowed: back-bed stitches and fairisle
 * float spans are read from body operations between engine row markers.
 */
export function projectBackFaceFromArtifact(
  artifact: CompiledRunArtifact,
  chart: ColorworkChartV1,
  bindings: readonly YarnBinding[],
  needleOffset: number,
): BackFaceProjection {
  const empty = (): BackFaceCell => ({ kind: 'none', paletteIndexes: [] });
  const cells: BackFaceCell[][] = Array.from({ length: chart.height }, () => Array.from({ length: chart.width }, empty));
  if (!artifact.program) return { width: chart.width, height: chart.height, cells };

  const paletteIndexByCarrier = new Map<CarrierId, number>();
  for (const binding of bindings) {
    const paletteIndex = chart.palette.findIndex((entry) => entry.id === binding.keyId);
    if (paletteIndex >= 0) paletteIndexByCarrier.set(binding.carrier, paletteIndex);
  }
  const frontByRow = new Map<number, Map<CarrierId, number[]>>();
  let machineRow: number | null = null;
  for (const op of artifact.program.ops) {
    if (op.kind === 'comment') {
      const match = /^row (\d+)$/.exec(op.text);
      if (match) machineRow = Number(match[1]);
      else if (/^(--- BIND OFF|--- RELEASE|-- lined finish)/.test(op.text)) machineRow = null;
      continue;
    }
    if (machineRow === null || machineRow < 0 || machineRow >= chart.height) continue;
    if (op.kind !== 'knit' && op.kind !== 'tuck') continue;
    const column = op.needle.needle - needleOffset;
    if (column < 0 || column >= chart.width) continue;
    const chartRow = chart.height - machineRow - 1;
    for (const carrier of op.carriers) {
      const paletteIndex = paletteIndexByCarrier.get(carrier);
      if (paletteIndex === undefined) continue;
      if (op.needle.bed === 'b') {
        const current = cells[chartRow]![column]!;
        cells[chartRow]![column] = { kind: 'back-knit', paletteIndexes: [...new Set([...current.paletteIndexes, paletteIndex])] };
      } else if (op.needle.bed === 'f') {
        const byCarrier = frontByRow.get(machineRow) ?? new Map<CarrierId, number[]>();
        const positions = byCarrier.get(carrier) ?? [];
        positions.push(column);
        byCarrier.set(carrier, positions);
        frontByRow.set(machineRow, byCarrier);
      }
    }
  }

  if (artifact.plan?.technique === 'floats-jacquard') {
    for (const [row, byCarrier] of frontByRow) {
      const chartRow = chart.height - row - 1;
      for (const [carrier, positionsValue] of byCarrier) {
        const paletteIndex = paletteIndexByCarrier.get(carrier);
        if (paletteIndex === undefined) continue;
        const positions = [...new Set(positionsValue)].sort((a, b) => a - b);
        for (let index = 1; index < positions.length; index += 1) {
          for (let column = positions[index - 1]! + 1; column < positions[index]!; column += 1) {
            const current = cells[chartRow]![column]!;
            if (current.kind === 'back-knit') continue;
            cells[chartRow]![column] = { kind: 'float', paletteIndexes: [...new Set([...current.paletteIndexes, paletteIndex])] };
          }
        }
      }
    }
  }

  return { width: chart.width, height: chart.height, cells };
}
