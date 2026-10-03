import type { ColorworkChartV1 } from '@kniterate-studio/chart-contract';
import type { ProjectEdit, ProjectGauge, ProjectPlacement, ProjectState, ResolvedProjectPlacement } from '@kniterate-studio/project-contract';
import { IMAGE_CHART_CONVERTER, imageToChart } from './imageChart';

/**
 * Motif placements as intent, shared by the CLI and the browser. Decoding the
 * PNG and hashing its bytes differ per environment, so callers pass both in.
 */

export interface PlacementImage {
  pixels: { width: number; height: number; data: Uint8Array };
  bytesBase64: string;
  sha256: string;
}

export interface PlacementConversion {
  heightCm: number;
  colors: number;
  pooling: 'mean' | 'mode';
}

/** The first `motif-N` no current placement uses, so a new motif never replaces an existing one. */
export function nextPlacementId(state: ProjectState): string {
  const taken = new Set((state.placements ?? []).map((placement) => placement.id));
  for (let n = taken.size + 1; ; n += 1) if (!taken.has(`motif-${n}`)) return `motif-${n}`;
}

/**
 * Drops rows and columns that are all color 0 (the background, left
 * transparent), so the motif's box is exactly its visible stitches and
 * "rows above the cuff" measures to the lowest visible stitch.
 */
export function trimTransparentMargins(chart: ColorworkChartV1): ColorworkChartV1 {
  const rows = chart.cells.map((row, index) => (row.some((cell) => cell !== 0) ? index : -1)).filter((index) => index >= 0);
  if (rows.length === 0) return chart;
  const columns = Array.from({ length: chart.width }, (_, column) => column).filter((column) => chart.cells.some((row) => row[column] !== 0));
  const top = rows[0]!; const bottom = rows.at(-1)!; const left = columns[0]!; const right = columns.at(-1)!;
  const cells = chart.cells.slice(top, bottom + 1).map((row) => row.slice(left, right + 1));
  return { ...chart, width: right - left + 1, height: bottom - top + 1, cells };
}

function trimmedBox(chart: ColorworkChartV1): { left: number; right: number; top: number; bottom: number } | null {
  const rows = chart.cells.map((row, index) => (row.some((cell) => cell !== 0) ? index : -1)).filter((index) => index >= 0);
  if (rows.length === 0) return null;
  const columns = Array.from({ length: chart.width }, (_, column) => column).filter((column) => chart.cells.some((row) => row[column] !== 0));
  return { left: columns[0]!, right: columns.at(-1)!, top: rows[0]!, bottom: rows.at(-1)! };
}

/**
 * The converter orders colors by frequency, so a crop can swap them (in a
 * ring, the ink outnumbers the background once the margin is cut). Map each
 * color of `chart` to the nearest color of `reference`, keeping 0 the background.
 */
function inPaletteOf(reference: ColorworkChartV1, chart: ColorworkChartV1): ColorworkChartV1 {
  const rgb = (hex: string) => [1, 3, 5].map((offset) => parseInt(hex.slice(offset, offset + 2), 16));
  const nearest = chart.palette.map((entry) => {
    const [r, g, b] = rgb(entry.hex);
    let best = 0; let bestDistance = Infinity;
    reference.palette.forEach((candidate, index) => {
      const [cr, cg, cb] = rgb(candidate.hex);
      const distance = (r! - cr!) ** 2 + (g! - cg!) ** 2 + (b! - cb!) ** 2;
      if (distance < bestDistance) { bestDistance = distance; best = index; }
    });
    return best;
  });
  return { ...chart, palette: reference.palette, cells: chart.cells.map((row) => row.map((cell) => nearest[cell]!)) };
}

function cropPixels(pixels: PlacementImage['pixels'], box: { left: number; right: number; top: number; bottom: number }): PlacementImage['pixels'] {
  const left = Math.max(0, box.left); const top = Math.max(0, box.top);
  const width = Math.max(1, Math.min(pixels.width, box.right) - left);
  const height = Math.max(1, Math.min(pixels.height, box.bottom) - top);
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y += 1) data.set(pixels.data.subarray(((top + y) * pixels.width + left) * 4, ((top + y) * pixels.width + left + width) * 4), y * width * 4);
  return { width, height, data };
}

/** Converts an image at the body gauge; the source keeps the bytes and settings so it can be re-converted. */
export function convertPlacementImage(image: PlacementImage, conversion: PlacementConversion, gauge: Pick<ProjectGauge, 'stitchesPer10cm' | 'rowsPer10cm'>): { motif: ColorworkChartV1; source: NonNullable<ProjectPlacement['source']> } {
  const convert = (pixels: PlacementImage['pixels']) => imageToChart(pixels, { size: { heightCm: conversion.heightCm }, colors: conversion.colors, gauge, pooling: conversion.pooling }).chart;
  // The requested height is the visible motif's: crop the image to the artwork found by a first conversion, then convert the crop.
  const first = convert(image.pixels);
  const trimmed = trimTransparentMargins(first);
  const box = trimmedBox(first);
  const motif = box === null || (trimmed.width === first.width && trimmed.height === first.height)
    ? first
    : trimTransparentMargins(inPaletteOf(first, convert(cropPixels(image.pixels, {
        left: Math.floor((box.left / first.width) * image.pixels.width),
        right: Math.ceil(((box.right + 1) / first.width) * image.pixels.width),
        top: Math.floor((box.top / first.height) * image.pixels.height),
        bottom: Math.ceil(((box.bottom + 1) / first.height) * image.pixels.height),
      }))));
  return {
    motif,
    source: {
      mediaType: 'image/png',
      sha256: image.sha256,
      bytesBase64: image.bytesBase64,
      ...conversion,
      converter: { ...IMAGE_CHART_CONVERTER },
      gauge: { stitchesPer10cm: gauge.stitchesPer10cm, rowsPer10cm: gauge.rowsPer10cm },
    },
  };
}

/** Default color map: motif color k paints project palette entry k; color 0 is transparent. */
export function defaultPlacementColors(state: ProjectState, motif: ColorworkChartV1): Record<string, string> {
  const colors: Record<string, string> = {};
  for (const color of new Set(motif.cells.flat())) if (color !== 0 && state.chart.palette[color]) colors[String(color)] = state.chart.palette[color]!.id;
  return colors;
}

/** The same placement re-converted from its stored image at `gauge` (or new settings); anchor, colors and id stay. */
export function refreshedPlacement(placement: ProjectPlacement, pixels: PlacementImage['pixels'], gauge: Pick<ProjectGauge, 'stitchesPer10cm' | 'rowsPer10cm'>, conversion: Partial<PlacementConversion> = {}): ProjectPlacement {
  const source = placement.source;
  if (source === undefined) throw new Error(`placement "${placement.id}" has no stored image to re-convert`);
  const converted = convertPlacementImage({ pixels, bytesBase64: source.bytesBase64, sha256: source.sha256 }, {
    heightCm: conversion.heightCm ?? source.heightCm,
    colors: conversion.colors ?? source.colors,
    pooling: conversion.pooling ?? source.pooling,
  }, gauge);
  return { ...placement, motif: converted.motif, source: converted.source };
}

/** A placement's box in chart coordinates (rows top first), drawn or not. */
export interface PlacementBox {
  id: string;
  left: number;
  right: number;
  top: number;
  bottom: number;
  status: ResolvedProjectPlacement['status'];
  problem?: ResolvedProjectPlacement['problem'];
}

function cuffRowsOf(state: ProjectState): number {
  return state.object?.construction === 'rib-cuff-jersey-body' ? state.object.cuffRows ?? 0 : 0;
}

/** Where each placement sits (or would sit, for a conflict), with the anchor rules materialization uses. */
export function placementBoxes(state: ProjectState, resolved: readonly ResolvedProjectPlacement[]): PlacementBox[] {
  const cuffRows = cuffRowsOf(state);
  return resolved.map(({ placement, status, problem }) => {
    const left = placement.x === 'center' ? Math.floor((state.chart.width - placement.motif.width) / 2) : placement.x;
    const bottom = state.chart.height - 1 - (cuffRows + placement.rowsAboveCuff);
    return { id: placement.id, left, right: left + placement.motif.width - 1, top: bottom - placement.motif.height + 1, bottom, status, ...(problem ? { problem } : {}) };
  });
}

/** The topmost placement whose box contains a chart cell. */
export function placementAt(boxes: readonly PlacementBox[], row: number, column: number): PlacementBox | null {
  for (let index = boxes.length - 1; index >= 0; index -= 1) {
    const box = boxes[index]!;
    if (row >= box.top && row <= box.bottom && column >= box.left && column <= box.right) return box;
  }
  return null;
}

/** Chart cells (`row:column`) a drawn placement paints: editing them in the chart would be painted over. */
export function placedCells(state: ProjectState, resolved: readonly ResolvedProjectPlacement[]): Map<string, string> {
  const cells = new Map<string, string>();
  const boxes = placementBoxes(state, resolved);
  resolved.forEach((item, index) => {
    if (item.status !== 'placed') return;
    const box = boxes[index]!;
    item.placement.motif.cells.forEach((row, top) => row.forEach((color, offset) => {
      if (item.placement.colors[String(color)] !== undefined) cells.set(`${box.top + top}:${box.left + offset}`, item.placement.id);
    }));
  });
  return cells;
}

/** The placement moved by whole stitches and rows (rows count down the chart); it keeps its other intent. */
export function movedPlacement(state: ProjectState, placement: ProjectPlacement, deltaColumns: number, deltaRows: number): ProjectPlacement {
  const box = placementBoxes(state, [{ placement, status: 'placed', at: null }])[0]!;
  const column = Math.max(0, Math.min(state.chart.width - placement.motif.width, box.left + deltaColumns));
  const centred = Math.floor((state.chart.width - placement.motif.width) / 2);
  return {
    ...placement,
    // Dropping it back on the centre keeps it centred through later resizes.
    x: deltaColumns === 0 && placement.x === 'center' ? 'center' : column === centred ? 'center' : column,
    rowsAboveCuff: Math.max(0, placement.rowsAboveCuff - deltaRows),
  };
}

/**
 * Turns a drawn placement into ordinary chart stitches: paints its cells into
 * the chart and removes the placement, as one operation. Afterwards it no
 * longer follows resizes or refreshes from its image.
 */
export function placementToStitchesEdits(state: ProjectState, resolved: ResolvedProjectPlacement): ProjectEdit[] {
  if (resolved.status !== 'placed') throw new Error(`Placement "${resolved.placement.id}" does not fit, so it has no stitches to keep.`);
  const box = placementBoxes(state, [resolved])[0]!;
  const paletteIndex = new Map(state.chart.palette.map((entry, index) => [entry.id, index]));
  const cells: { rowId: string; column: number; paletteIndex: number }[] = [];
  resolved.placement.motif.cells.forEach((row, top) => row.forEach((color, offset) => {
    const paletteId = resolved.placement.colors[String(color)];
    if (paletteId === undefined) return;
    cells.push({ rowId: state.rowIds[box.top + top]!, column: box.left + offset, paletteIndex: paletteIndex.get(paletteId)! });
  }));
  return [
    ...(cells.length ? [{ kind: 'paint-cells' as const, cells }] : []),
    { kind: 'remove-placement', placementId: resolved.placement.id },
  ];
}
