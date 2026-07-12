import type {
  KnitlabChartAnnotation,
  KnitlabChartState,
} from '../colorwork/knitlab1-contract.js';

export interface RowTensionBlock {
  /** Zero-based chart row where this tension block starts. */
  startRow: number;
  /** Zero-based chart row where this tension block ends, inclusive. */
  endRow: number;
  /** Kniterate stitch number to apply to rows in this block. */
  stitchNumber: number;
}

const GENERATED_TENSION_PREFIX = 'export-row-tension-';

export function normalizeRowTensionBlocks(
  blocks: readonly RowTensionBlock[] | undefined,
  rowCount: number,
): RowTensionBlock[] {
  if (!Number.isInteger(rowCount) || rowCount <= 0) return [];
  const normalized: RowTensionBlock[] = [];
  for (const block of blocks ?? []) {
    const start = Math.trunc(block.startRow);
    const end = Math.trunc(block.endRow);
    const stitchNumber = Math.trunc(block.stitchNumber);
    if (!Number.isInteger(start) || !Number.isInteger(end)) continue;
    if (!Number.isInteger(stitchNumber) || stitchNumber < 1 || stitchNumber > 35) continue;
    const clampedStart = Math.max(0, Math.min(rowCount - 1, start));
    const clampedEnd = Math.max(0, Math.min(rowCount - 1, end));
    if (clampedEnd < clampedStart) continue;
    normalized.push({ startRow: clampedStart, endRow: clampedEnd, stitchNumber });
  }
  return normalized.sort((a, b) => a.startRow - b.startRow || a.endRow - b.endRow);
}

export function materializeRowTensions(
  blocks: readonly RowTensionBlock[] | undefined,
  rowCount: number,
  defaultStitchNumber: number,
): number[] {
  const fallback = normalizeStitchNumber(defaultStitchNumber);
  const values = Array.from({ length: Math.max(0, rowCount) }, () => fallback);
  for (const block of normalizeRowTensionBlocks(blocks, rowCount)) {
    for (let row = block.startRow; row <= block.endRow; row++) {
      values[row] = block.stitchNumber;
    }
  }
  return values;
}

export function effectiveRowTensionBlocks(
  blocks: readonly RowTensionBlock[] | undefined,
  rowCount: number,
  defaultStitchNumber: number,
): RowTensionBlock[] {
  const values = materializeRowTensions(blocks, rowCount, defaultStitchNumber);
  if (values.length === 0) return [];
  const out: RowTensionBlock[] = [];
  let startRow = 0;
  let stitchNumber = values[0]!;
  for (let row = 1; row < values.length; row++) {
    if (values[row] === stitchNumber) continue;
    out.push({ startRow, endRow: row - 1, stitchNumber });
    startRow = row;
    stitchNumber = values[row]!;
  }
  out.push({ startRow, endRow: values.length - 1, stitchNumber });
  return out;
}

export function applyRowTensionBlocksToChart(
  chart: KnitlabChartState,
  blocks: readonly RowTensionBlock[] | undefined,
  defaultStitchNumber: number,
): KnitlabChartState {
  const normalized = normalizeRowTensionBlocks(blocks, chart.rows);
  if (normalized.length === 0) return chart;

  const existingAnnotations = (chart.annotations ?? []).filter(
    annotation => !isGeneratedTensionAnnotation(annotation),
  );
  const generated = rowTensionBoundaryAnnotations(
    normalized,
    chart.rows,
    defaultStitchNumber,
  );
  if (generated.length === 0) return chart;
  return {
    ...chart,
    annotations: [...existingAnnotations, ...generated],
  };
}

export function rowTensionBoundaryAnnotations(
  blocks: readonly RowTensionBlock[] | undefined,
  rowCount: number,
  defaultStitchNumber: number,
): KnitlabChartAnnotation[] {
  const fallback = normalizeStitchNumber(defaultStitchNumber);
  const values = materializeRowTensions(blocks, rowCount, fallback);
  const annotations: KnitlabChartAnnotation[] = [];
  let current = fallback;
  for (let row = 0; row < values.length; row++) {
    const stitchNumber = values[row]!;
    if (stitchNumber === current) continue;
    annotations.push({
      id: `${GENERATED_TENSION_PREFIX}${row}`,
      kind: 'stitch-number',
      source: 'generated',
      locked: true,
      label: `Export tension ${stitchNumber}`,
      anchor: { scope: 'row', row },
      stitchNumber,
    });
    current = stitchNumber;
  }
  return annotations;
}

function normalizeStitchNumber(value: number): number {
  if (!Number.isFinite(value)) return 6;
  const rounded = Math.round(value);
  if (rounded < 1) return 1;
  if (rounded > 35) return 35;
  return rounded;
}

function isGeneratedTensionAnnotation(annotation: KnitlabChartAnnotation): boolean {
  return (
    annotation.kind === 'stitch-number'
    && annotation.source === 'generated'
    && annotation.id.startsWith(GENERATED_TENSION_PREFIX)
  );
}
