import { projectColorworkChartV1 } from './from-colorwork-chart.js';
import { DEFAULT_KEY_PALETTE, KEY_ID_EMPTY, KEY_ID_M1L, KEY_ID_M1R, KEY_ID_SSK, KEY_ID_K2TOG, type KnitlabKeyInstance } from './knitlab1-contract.js';

export interface DiamondShapeV1 { tipStitches: number; rowsPerStep: number }

/** Knit-order bounds. Flat tips are intentional: this trial does not claim a point closure. */
export function diamondRangesV1(width: number, height: number, shape: DiamondShapeV1): { lo: number; hi: number }[] {
  const steps = (width - shape.tipStitches) / 2;
  if (!Number.isInteger(shape.rowsPerStep) || !Number.isInteger(width) || !Number.isInteger(height) || !Number.isInteger(shape.tipStitches) || !Number.isInteger(steps) || steps < 1 || shape.tipStitches < 8 || shape.rowsPerStep < 2 || height !== 2 * steps * shape.rowsPerStep + 3) {
    throw new Error('Diamond needs equal-parity maximum/tip widths and height = (maximum − tip) × rows per step + 3; tip at least 8 and at least 2 rows per step.');
  }
  return Array.from({ length: height }, (_, row) => {
    const grown = Math.min(steps, Math.floor(Math.min(row, height - 1 - row) / shape.rowsPerStep));
    return { lo: steps - grown, hi: width - steps + grown - 1 };
  });
}

/** Reuse canonical shape tiles and the existing two-bed shaped walker. */
export function projectDiamondColorworkChartV1(value: unknown, shape: DiamondShapeV1) {
  const projected = projectColorworkChartV1(value);
  const { artifact, chart } = projected;
  const ranges = diamondRangesV1(artifact.width, artifact.height, shape);
  const placements: KnitlabKeyInstance[] = [];
  for (let r = 0; r < ranges.length; r++) {
    const { lo, hi } = ranges[r]!;
    const previous = ranges[Math.max(0, r - 1)]!;
    for (let c = 0; c < artifact.width; c++) {
      if (lo > previous.lo && (c === lo || c === hi + 1)) continue; // owned by the two-column decrease tiles
      let keyId = c < lo || c > hi ? KEY_ID_EMPTY : artifact.palette[artifact.cells[artifact.height - 1 - r]![c]!]!.id;
      if (lo < previous.lo && c === lo) keyId = KEY_ID_M1L;
      if (hi > previous.hi && c === hi) keyId = KEY_ID_M1R;
      if (lo > previous.lo && c === lo - 1) keyId = KEY_ID_SSK;
      if (hi < previous.hi && c === hi) keyId = KEY_ID_K2TOG;
      placements.push({ anchor: { x: c, y: artifact.height - 1 - r }, keyId });
    }
  }
  const ids = new Set([KEY_ID_EMPTY, KEY_ID_M1L, KEY_ID_M1R, KEY_ID_SSK, KEY_ID_K2TOG]);
  return { ...projected, palette: [...projected.palette, ...DEFAULT_KEY_PALETTE.filter(k => ids.has(k.id))],
    chart: { ...chart, orientation: 'bottom-up' as const, layers: [{ ...chart.layers[0]!, kind: undefined, keyPlacements: placements }] } };
}
