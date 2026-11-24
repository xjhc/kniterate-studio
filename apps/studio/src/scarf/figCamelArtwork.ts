import { borderCross, borderRepeat, diagonalBorderCross, pointOrnament, seedDown, seedUp, slopeRepeat, tieRepeat as tieMotifs } from './wildRagMotifs';
import type { TrianglePlan } from './triangle';

// Repeat reconstruction from the two supplied Wild Rag photographs.
// Artwork coordinates are in the flat, point-down orientation of the scarf.
const span = 1200;
const depth = span * 23 / 63.75;
const point = span / 2;
const slope = depth / point;
const slopeNormal = Math.hypot(slope, 1);
const innerRule = 75;

export type PaisleyRowCount = 9 | 11;
const seedPitch = 31;
const seedEdgeClearance = 12;
// Native grid for the seed and crosses at the size-6 cashmere gauge.
const motifReferenceGrid = { rows: 971, columns: 255 };
const borderCentre = 38;
const slopeAngle = Math.atan2(depth, -point);
const straightCrossPositions = [168, 312, 456, 600, 744, 888, 1032];
const slopedCrossPositions = [154, 321, 493];

const n = (value: number) => Number(value.toFixed(2));
const mark = (x: number, y: number, body: string, transform = '') =>
  `<g transform="translate(${n(x)} ${n(y)}) ${transform}">${body}</g>`;

function edgeDistance(x: number, y: number): number {
  return Math.min(y, (slope * x - y) / slopeNormal, (slope * (span - x) - y) / slopeNormal);
}

const repeat = `<g transform="scale(-0.278 0.286) translate(-221.5 -106)">${borderRepeat}</g>`;
const slopingGroup = `<g transform="scale(.407 -.43) translate(-401 -102)">${slopeRepeat}</g>`;
const tieGroup = `<g transform="scale(.34 .36) translate(-322 -102)">${tieMotifs}</g>`;
const borderGrid = { rows: 846, columns: 214 };

function border(): string {
  const topRepeats = [240, 384, 528, 672, 816, 960].map((x) => mark(x, borderCentre, repeat)).join('');
  const slopeRepeats = [235, 407, 579].map(x => mark(x, borderCentre, slopingGroup)).join('');
  const right = mark(span, 0, slopeRepeats, `rotate(${n(slopeAngle * 180 / Math.PI)})`);
  const left = `<g transform="translate(${span} 0) scale(-1 1)">${right}</g>`;
  const tie = mark(122, 39, tieGroup, 'rotate(18)');
  return tie + `<g transform="translate(${span} 0) scale(-1 1)">${tie}</g>` + topRepeats + right + left;
}

// Rasterizing the sloping border curves can fill all four stitches at a bend.
// Shave a corner only when its neighbours form one continuous arc around it.
// This retains the colour connections, enclosed eyes and single-stitch tips.
function refineBorderOutlines(plan: TrianglePlan, cells: number[][]): void {
  for (let row = 1; row < plan.rows - 1; row++) {
    const before = cells[row - 1]!;
    const course = cells[row]!;
    const after = cells[row + 1]!;
    for (let col = 2; col < plan.widths[row]! - 2; col++) {
      if (!course[col]) continue;
      const ring = [before[col]!, before[col + 1]!, course[col + 1]!, after[col + 1]!,
        after[col]!, after[col - 1]!, course[col - 1]!, before[col - 1]!];
      const solidCorner = [0, 2, 4, 6].some(i => ring[i] && ring[i + 1] && ring[(i + 2) % 8]);
      if (!solidCorner) continue;
      const arcs = ring.filter((value, i) => value && !ring[(i + 7) % 8]).length;
      if (arcs === 1) course[col] = 0;
    }
  }
}

// Place the rule on the knitting grid. Rotating a rasterized square on a
// slope changes its stitch count depending on the subpixel position.
function paintDottedFrame(plan: TrianglePlan, cells: number[][]): void {
  // Snap the triangle's three sides to one lattice. At the top corners the
  // diagonal turns one step outside the horizontal run, leaving a clear gap.
  const apex = Math.floor((plan.rows - 2) / 2);
  const desiredLeft = innerRule * (1 + slopeNormal) / slope * (plan.rows - 1) / span;
  const steps = Math.round((apex - desiredLeft) / 4);
  const left = apex - 4 * steps;
  const right = apex + 4 * steps;
  const top = Math.round(innerRule * plan.columns / depth - 1);
  function square(row: number, col: number) {
    if (col < 2 || col + 1 >= Math.min(plan.widths[row]!, plan.widths[row + 1]!) - 2) return;
    cells[row]!.fill(1, col, col + 2);
    cells[row + 1]!.fill(1, col, col + 2);
  }
  for (let row = left + 4; row < right; row += 4) square(row, top);
  for (let step = 0; step <= steps; step++) {
    const col = top + 2 + 2 * step;
    square(left + 4 * step, col);
    if (step < steps) square(right - 4 * step, col);
  }
}

export function figCamelFieldRows(rowCount: PaisleyRowCount = 9): { y: number; xs: number[] }[] {
  const first = innerRule + 17;
  const last = depth - (innerRule + seedEdgeClearance + 2) * slopeNormal;
  return Array.from({ length: rowCount }, (_, row) => {
    const y = first + (last - first) * row / (rowCount - 1);
    const xs = [];
    for (let k = -Math.ceil(point / seedPitch); k <= Math.ceil(point / seedPitch); k++) {
      const x = point + (k + (row % 2 ? 0.5 : 0)) * seedPitch;
      if (edgeDistance(x, y) >= innerRule + seedEdgeClearance) xs.push(x);
    }
    return { y, xs };
  });
}

function paintMotif(
  plan: TrianglePlan,
  cells: number[][],
  x: number,
  y: number,
  motif: readonly string[],
  preserveSymmetry = false,
  referenceGrid = motifReferenceGrid,
) {
  const motifWidth = motif[0]!.length;
  const scaledWidth = motifWidth * plan.rows / referenceGrid.rows;
  const scaledHeight = motif.length * plan.columns / referenceGrid.columns;
  const roundedSize = (size: number) => preserveSymmetry ? 2 * Math.round((size - 1) / 2) + 1 : Math.round(size);
  const width = Math.max(1, roundedSize(scaledWidth));
  const height = Math.max(1, roundedSize(scaledHeight));
  const left = Math.round(x * (plan.rows - 1) / span - (width - 1) / 2);
  const top = Math.round(y * plan.columns / depth - height / 2);
  for (let dy = 0; dy < height; dy++) {
    const sourceY = Math.floor((dy + 0.5) * motif.length / height);
    const stroke = motif[sourceY]!;
    for (let dx = 0; dx < width; dx++) {
      const row = left + dx;
      const column = top + dy;
      const sourceX = Math.floor((dx + 0.5) * motifWidth / width);
      const course = cells[row];
      if (course && column >= 2 && column < plan.widths[row]! - 2) {
        if (stroke[sourceX] === '#') course[column] = 1;
        else if (preserveSymmetry) course[column] = 0;
      }
    }
  }
}

export function paintFigCamelDetails(plan: TrianglePlan, cells: number[][], rowCount: PaisleyRowCount = 9): void {
  refineBorderOutlines(plan, cells);
  paintDottedFrame(plan, cells);
  paintMotif(plan, cells, point, depth - 56, pointOrnament, false, { rows: 846, columns: 214 });
  for (const x of straightCrossPositions) paintMotif(plan, cells, x, borderCentre, borderCross, true, borderGrid);
  for (const x of [72, span - 72]) paintMotif(plan, cells, x, 25, borderCross, true, borderGrid);
  for (const [index, position] of slopedCrossPositions.entries()) {
    const x = span + position * Math.cos(slopeAngle) - borderCentre * Math.sin(slopeAngle);
    const y = position * Math.sin(slopeAngle) + borderCentre * Math.cos(slopeAngle);
    const motif = index === 0 ? borderCross : diagonalBorderCross;
    paintMotif(plan, cells, x, y, motif, true, borderGrid);
    paintMotif(plan, cells, span - x, y, motif, true, borderGrid);
  }
  for (const [band, { y, xs }] of figCamelFieldRows(rowCount).entries()) {
    for (const x of xs) paintMotif(plan, cells, x, y, band % 2 ? seedUp : seedDown, false, { rows: 847, columns: 222 });
  }
  if (rowCount === 9) applyCashmereSwatch(plan, cells);
}

// Knit the feet first so the letter reads upright with the cast-on below.
const compactA = ['##..##', '##..##', '######', '######', '##..##', '##..##', '.####.', '..##..'];

export function applyCashmereSwatch(plan: TrianglePlan, cells: number[][]): void {
  // Centre the monogram in the marked gap just before the first tie cross.
  const first = Math.round(39 * plan.rows / borderGrid.rows - compactA.length / 2);
  const firstColumn = Math.max(2, Math.round(11 * plan.columns / borderGrid.columns - compactA[0]!.length / 2));
  if (first >= 0 && first + compactA.length <= plan.rows / 2 &&
      firstColumn + compactA[0]!.length <= plan.widths[first]! - 2) {
    for (const [offset, line] of compactA.entries()) {
      for (let column = 0; column < line.length; column++) {
        cells[first + offset]![firstColumn + column] = Number(line[column] === '#');
      }
    }
  }
  // The joined transfers are unchanged. On the narrowed pair the outer front
  // needle knits Camel on the transfer course and Fig on its following course.
  for (let row = 1; row < plan.rows; row++) {
    const width = plan.widths[row]!;
    if (width < plan.widths[row - 1]!) {
      cells[row]![width - 1] = 1;
      if (plan.widths[row + 1] === width) cells[row + 1]![width - 1] = 0;
    }
  }
}

export function figCamelMask(): string {
  const triangle = `0,0 ${span},0 ${point},${n(depth)}`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${span}" height="${Math.ceil(depth)}" viewBox="0 0 ${span} ${depth}" preserveAspectRatio="none">
    <defs><clipPath id="cloth"><polygon points="${triangle}"/></clipPath></defs>
    <rect width="100%" height="100%" fill="black"/>
    <g clip-path="url(#cloth)">${border()}</g>
  </svg>`;
}
