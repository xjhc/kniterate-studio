import type { ProjectState } from '../../packages/project-contract/src/index.ts';
import type { AuthoredPipelineResult } from '../../apps/studio/src/authoredPipeline.ts';
import type { RgbaImage } from './png.ts';

/**
 * CLI views of a project. `chart` shows the design at its real knitted
 * proportions when a gauge is recorded. `back` is the reverse face projected
 * from the emitted program. The heat maps are per emitted pass, first pass at
 * the bottom, over the KCode columns the pass selects.
 */

export const RENDER_VIEWS = ['chart', 'back', 'speed', 'roller', 'stitch', 'direction'] as const;
export type RenderView = typeof RENDER_VIEWS[number];

export interface RenderResult {
  image: RgbaImage;
  legend: Record<string, unknown>;
}

type Rgb = [number, number, number];

const parseHex = (hex: string): Rgb => [1, 3, 5].map((at) => Number.parseInt(hex.slice(at, at + 2), 16)) as Rgb;
const BACKGROUND: Rgb = [226, 226, 226];

function blank(width: number, height: number, fill: Rgb = BACKGROUND): RgbaImage {
  const data = new Uint8Array(width * height * 4);
  for (let index = 0; index < width * height; index += 1) data.set([...fill, 255], index * 4);
  return { width, height, data };
}

function fillRect(image: RgbaImage, x: number, y: number, width: number, height: number, color: Rgb): void {
  for (let row = y; row < y + height; row += 1) {
    for (let column = x; column < x + width; column += 1) image.data.set([...color, 255], (row * image.width + column) * 4);
  }
}

/** Dark blue → teal → yellow ramp for heat maps. */
function ramp(t: number): Rgb {
  const stops: Rgb[] = [[40, 30, 110], [30, 140, 140], [250, 220, 60]];
  const scaled = Math.min(1, Math.max(0, t)) * (stops.length - 1);
  const index = Math.min(stops.length - 2, Math.floor(scaled));
  const local = scaled - index;
  return [0, 1, 2].map((channel) => Math.round(stops[index]![channel]! * (1 - local) + stops[index + 1]![channel]! * local)) as Rgb;
}

/** Cell size in pixels so a cell has the stitch's physical aspect and the image stays under ~1600 px. */
function cellSize(state: ProjectState, columns: number, rows: number): { width: number; height: number } {
  const aspect = state.gauge ? state.gauge.stitchesPer10cm / state.gauge.rowsPer10cm : 1; // cell height ÷ width
  const base = Math.max(2, Math.min(24, Math.floor(1600 / Math.max(columns, rows * aspect))));
  return { width: base, height: Math.max(1, Math.round(base * aspect)) };
}

function renderChart(state: ProjectState): RenderResult {
  const { chart } = state;
  const cell = cellSize(state, chart.width, chart.height);
  const image = blank(chart.width * cell.width, chart.height * cell.height);
  const colors = chart.palette.map((entry) => parseHex(entry.hex));
  chart.cells.forEach((row, rowIndex) => row.forEach((paletteIndex, column) => {
    fillRect(image, column * cell.width, rowIndex * cell.height, cell.width, cell.height, colors[paletteIndex] ?? BACKGROUND);
  }));
  return {
    image,
    legend: {
      orientation: 'visual: first knitted row at the bottom',
      proportions: state.gauge ? `gauge-true (${state.gauge.stitchesPer10cm} st, ${state.gauge.rowsPer10cm} rows per 10 cm)` : 'square cells (no gauge recorded)',
      palette: chart.palette,
    },
  };
}

function renderBack(state: ProjectState, result: AuthoredPipelineResult): RenderResult {
  const back = result.compiled?.backFace;
  if (!back) throw new Error(result.compiled?.ok ? 'no back face: this construction does not derive one (beanies); use --view stitch for the pass-by-pass program' : 'no back face: the project did not compile');
  const cell = cellSize(state, back.width, back.height);
  const image = blank(back.width * cell.width, back.height * cell.height);
  const colors = state.chart.palette.map((entry) => parseHex(entry.hex));
  back.cells.forEach((row, rowIndex) => row.forEach((entry, column) => {
    if (entry.kind === 'none' || entry.paletteIndexes.length === 0) return;
    const base = colors[entry.paletteIndexes[0]!] ?? BACKGROUND;
    // Floats are drawn paler than back-bed stitches.
    const color: Rgb = entry.kind === 'float' ? base.map((value) => Math.round(value * 0.55 + 255 * 0.45)) as Rgb : base;
    fillRect(image, column * cell.width, rowIndex * cell.height, cell.width, cell.height, color);
  }));
  return { image, legend: { orientation: 'as BackFaceProjection rows and columns', kinds: { 'back-knit': 'full color', float: 'pale color', none: 'grey' } } };
}

function renderPasses(view: 'speed' | 'roller' | 'stitch' | 'direction', result: AuthoredPipelineResult): RenderResult {
  const trace = result.kcode?.trace;
  if (!trace) throw new Error('no machine trace: the project did not produce validated K-code');
  let minColumn = Infinity;
  let maxColumn = -Infinity;
  let low = Infinity;
  let high = -Infinity;
  for (const pass of trace.passes) {
    const selections = [...pass.selections.front, ...pass.selections.rear];
    for (const selection of selections) {
      minColumn = Math.min(minColumn, selection.kcodeColumn);
      maxColumn = Math.max(maxColumn, selection.kcodeColumn);
      if (view === 'stitch') { low = Math.min(low, selection.stitchSelector.encodedValue); high = Math.max(high, selection.stitchSelector.encodedValue); }
    }
    const perPass = view === 'speed' ? pass.speed : view === 'roller' ? pass.roller : null;
    if (perPass !== null && selections.length > 0) { low = Math.min(low, perPass); high = Math.max(high, perPass); }
  }
  if (!Number.isFinite(minColumn)) throw new Error('the trace selects no needles');
  if (!Number.isFinite(low)) { low = 0; high = 1; }
  const scale = (value: number): Rgb => ramp(high === low ? 0.5 : (value - low) / (high - low));
  const cellWidth = Math.max(1, Math.min(6, Math.floor(1600 / (maxColumn - minColumn + 1))));
  const rowHeight = Math.max(1, Math.min(4, Math.floor(2400 / trace.passes.length)));
  const image = blank((maxColumn - minColumn + 1) * cellWidth, trace.passes.length * rowHeight);
  trace.passes.forEach((pass, index) => {
    const y = (trace.passes.length - 1 - index) * rowHeight;
    for (const selection of [...pass.selections.front, ...pass.selections.rear]) {
      const color = view === 'speed' ? scale(pass.speed) : view === 'roller' ? scale(pass.roller)
        : view === 'stitch' ? scale(selection.stitchSelector.encodedValue)
        : pass.direction === '>>' ? [60, 110, 200] as Rgb : [220, 120, 40] as Rgb;
      fillRect(image, (selection.kcodeColumn - minColumn) * cellWidth, y, cellWidth, rowHeight, color);
    }
  });
  return {
    image,
    legend: view === 'direction'
      ? { rows: 'emitted passes, first at the bottom', colors: { '>>': 'blue', '<<': 'orange' }, passes: trace.passes.length }
      : { rows: 'emitted passes, first at the bottom', columns: `KCode columns ${minColumn}–${maxColumn}`, min: low, max: high, ramp: 'dark blue (min) → yellow (max)', note: view === 'stitch' ? 'encoded STIF/STIR value, not a physical tension' : undefined },
  };
}

export function renderView(view: RenderView, state: ProjectState, result: AuthoredPipelineResult | null): RenderResult {
  if (view === 'chart') return renderChart(state);
  if (result === null) throw new Error(`${view} view needs a compiled project`);
  if (view === 'back') return renderBack(state, result);
  return renderPasses(view, result);
}
