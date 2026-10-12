import type { ColorworkChartV1 } from '@kniterate-studio/chart-contract';
import type { ProjectGauge } from '@kniterate-studio/project-contract';

/**
 * Image → colorwork chart. Cell pooling and deterministic k-means follow
 * KnitLab's image intake; the addition is stitch aspect. Knitted stitches are
 * not square, so the row count comes from the gauge rather than from one pixel
 * per stitch, which would squash the motif vertically.
 */

export const IMAGE_CHART_CONVERTER = { id: 'image-chart', version: '1' } as const;

export type ImageChartSize =
  | { widthStitches: number }
  | { heightRows: number }
  | { widthCm: number }
  | { heightCm: number };

export interface ImageChartOptions {
  size: ImageChartSize;
  colors: number;
  /** Needed for cm sizes and for stitch-aspect correction. Without it, cells are treated as square. */
  gauge: Pick<ProjectGauge, 'stitchesPer10cm' | 'rowsPer10cm'> | null;
  pooling: 'mode' | 'mean';
  title?: string;
}

export interface ImageChartResult {
  chart: ColorworkChartV1;
  receipt: {
    converter: typeof IMAGE_CHART_CONVERTER;
    source: { width: number; height: number };
    stitches: number;
    rows: number;
    aspect: 'gauge-corrected' | 'square-cells';
    how: string;
    predictedCm: { width: number; height: number } | null;
    pooling: ImageChartOptions['pooling'];
    colors: number;
  };
}

type Rgb = [number, number, number];

const MODE_BUCKET_LEVELS = 8;

function quantizeChannel(value: number): number {
  const step = 256 / MODE_BUCKET_LEVELS;
  return Math.min(255, Math.floor(value / step) * step + step / 2);
}

const sqDist = (a: Rgb, b: Rgb): number => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;

/** Deterministic k-means: first point plus furthest-point seeding, then Lloyd iterations. */
function kmeans(points: Rgb[], k: number, maxIter = 20): { centroids: Rgb[]; assignments: number[] } {
  const centroids: Rgb[] = [[...points[0]!]];
  while (centroids.length < k) {
    let best = -1;
    let bestDist = 0;
    points.forEach((point, index) => {
      const nearest = Math.min(...centroids.map((centroid) => sqDist(point, centroid)));
      if (nearest > bestDist) { bestDist = nearest; best = index; }
    });
    if (best < 0) break; // fewer distinct colors than requested
    centroids.push([...points[best]!]);
  }
  const assignments = new Array<number>(points.length).fill(0);
  for (let iteration = 0; iteration < maxIter; iteration += 1) {
    let changed = false;
    points.forEach((point, index) => {
      let nearest = 0;
      centroids.forEach((centroid, candidate) => { if (sqDist(point, centroid) < sqDist(point, centroids[nearest]!)) nearest = candidate; });
      if (assignments[index] !== nearest) { assignments[index] = nearest; changed = true; }
    });
    const sums = centroids.map(() => [0, 0, 0, 0]);
    points.forEach((point, index) => {
      const sum = sums[assignments[index]!]!;
      sum[0] += point[0]; sum[1] += point[1]; sum[2] += point[2]; sum[3] += 1;
    });
    sums.forEach((sum, index) => { if (sum[3]! > 0) centroids[index] = [sum[0]! / sum[3]!, sum[1]! / sum[3]!, sum[2]! / sum[3]!]; });
    if (!changed && iteration > 0) break;
  }
  return { centroids, assignments };
}

const hex = ([r, g, b]: Rgb): string => `#${[r, g, b].map((value) => Math.round(value).toString(16).padStart(2, '0')).join('').toUpperCase()}`;

function cellCounts(width: number, height: number, options: ImageChartOptions): { stitches: number; rows: number; how: string } {
  // Rows per stitch of the same physical length: rowsPer10cm / stitchesPer10cm.
  const rowsPerStitch = options.gauge === null ? 1 : options.gauge.rowsPer10cm / options.gauge.stitchesPer10cm;
  const aspect = height / width;
  const size = options.size;
  const stPerCm = options.gauge === null ? null : options.gauge.stitchesPer10cm / 10;
  const rowsPerCm = options.gauge === null ? null : options.gauge.rowsPer10cm / 10;
  if ('widthStitches' in size) {
    return { stitches: size.widthStitches, rows: Math.max(1, Math.round(size.widthStitches * aspect * rowsPerStitch)), how: `${size.widthStitches} st × image aspect ${aspect.toFixed(3)} × ${rowsPerStitch.toFixed(3)} rows/st` };
  }
  if ('heightRows' in size) {
    return { stitches: Math.max(1, Math.round(size.heightRows / aspect / rowsPerStitch)), rows: size.heightRows, how: `${size.heightRows} rows ÷ image aspect ${aspect.toFixed(3)} ÷ ${rowsPerStitch.toFixed(3)} rows/st` };
  }
  if (stPerCm === null || rowsPerCm === null) throw new Error('a size in cm needs a gauge');
  if ('widthCm' in size) {
    return { stitches: Math.max(1, Math.round(size.widthCm * stPerCm)), rows: Math.max(1, Math.round(size.widthCm * aspect * rowsPerCm)), how: `${size.widthCm} cm wide × ${stPerCm * 10} st/10 cm; ${(size.widthCm * aspect).toFixed(2)} cm tall × ${rowsPerCm * 10} rows/10 cm` };
  }
  return { stitches: Math.max(1, Math.round((size.heightCm / aspect) * stPerCm)), rows: Math.max(1, Math.round(size.heightCm * rowsPerCm)), how: `${size.heightCm} cm tall × ${rowsPerCm * 10} rows/10 cm; ${(size.heightCm / aspect).toFixed(2)} cm wide × ${stPerCm * 10} st/10 cm` };
}

/** `data` is row-major RGBA. Transparent pixels are composited over white. */
export function imageToChart(image: { width: number; height: number; data: Uint8Array }, options: ImageChartOptions): ImageChartResult {
  if (!Number.isInteger(options.colors) || options.colors < 1 || options.colors > 8) throw new Error('colors must be an integer from 1 to 8');
  const { stitches, rows, how } = cellCounts(image.width, image.height, options);
  if (stitches > 252) throw new Error(`the motif would be ${stitches} stitches wide; the bed has 252 needles`);
  const cellWidth = image.width / stitches;
  const cellHeight = image.height / rows;
  const cellColors: Rgb[] = [];
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < stitches; column += 1) {
      const x0 = Math.floor(column * cellWidth);
      const y0 = Math.floor(row * cellHeight);
      const x1 = Math.max(x0 + 1, Math.floor((column + 1) * cellWidth));
      const y1 = Math.max(y0 + 1, Math.floor((row + 1) * cellHeight));
      const buckets = new Map<string, number>();
      let best: Rgb = [255, 255, 255];
      let bestCount = 0;
      let sum: Rgb = [0, 0, 0];
      let count = 0;
      for (let y = y0; y < Math.min(y1, image.height); y += 1) {
        for (let x = x0; x < Math.min(x1, image.width); x += 1) {
          const at = (y * image.width + x) * 4;
          const alpha = image.data[at + 3]! / 255;
          const pixel: Rgb = [0, 1, 2].map((channel) => image.data[at + channel]! * alpha + 255 * (1 - alpha)) as Rgb;
          sum = [sum[0] + pixel[0], sum[1] + pixel[1], sum[2] + pixel[2]];
          count += 1;
          const bucket = pixel.map(quantizeChannel) as Rgb;
          const key = bucket.join(',');
          const next = (buckets.get(key) ?? 0) + 1;
          buckets.set(key, next);
          if (next > bestCount) { bestCount = next; best = bucket; }
        }
      }
      cellColors.push(options.pooling === 'mean' && count > 0 ? [sum[0] / count, sum[1] / count, sum[2] / count] : best);
    }
  }
  const { centroids, assignments } = kmeans(cellColors, options.colors);
  // Palette index 0 is the most frequent color, the usual ground.
  const frequency = centroids.map((_, index) => assignments.filter((assigned) => assigned === index).length);
  const order = centroids.map((_, index) => index).filter((index) => frequency[index]! > 0).sort((a, b) => frequency[b]! - frequency[a]! || a - b);
  const remap = new Map(order.map((original, index) => [original, index]));
  const palette = order.map((original, index) => ({ id: `c${index + 1}`, name: `Color ${index + 1}`, hex: hex(centroids[original]!) }));
  const cells = Array.from({ length: rows }, (_, row) => Array.from({ length: stitches }, (_, column) => remap.get(assignments[row * stitches + column]!)!));
  const chart: ColorworkChartV1 = {
    kind: 'knitlab-colorwork-chart',
    version: 1,
    ...(options.title ? { title: options.title } : {}),
    width: stitches,
    height: rows,
    rowNumbering: 'bottom-up',
    palette,
    cells,
  };
  return {
    chart,
    receipt: {
      converter: IMAGE_CHART_CONVERTER,
      source: { width: image.width, height: image.height },
      stitches,
      rows,
      aspect: options.gauge === null ? 'square-cells' : 'gauge-corrected',
      how,
      predictedCm: options.gauge === null ? null : {
        width: Math.round((stitches / options.gauge.stitchesPer10cm) * 100) / 10,
        height: Math.round((rows / options.gauge.rowsPer10cm) * 100) / 10,
      },
      pooling: options.pooling,
      colors: palette.length,
    },
  };
}
