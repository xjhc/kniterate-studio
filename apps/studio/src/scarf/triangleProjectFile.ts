import { parseColorworkChartV1 } from '@kniterate-studio/chart-contract';
import { cashmereDecrease, figCamelTarget, proportionalFigCamelTarget, originalFigCamelTarget, plannedBodyPlacement, planTriangle, triangleDraftKind, triangleTarget, type TriangleDesignId, type TrianglePalette, type TrianglePlan, type TriangleTarget } from './triangle';

export interface TriangleProject {
  id: TriangleDesignId;
  c3Decrease: boolean;
  title: string;
  target: TriangleTarget;
  palette: TrianglePalette;
  stitchesPer10cm: number;
  rowsPer10cm: number;
  plan: TrianglePlan;
  cells: number[][];
}

const record = (value: unknown): Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {};

export function parseTriangleProject(value: unknown): TriangleProject {
  const draft = record(value);
  const invalid = (details: string): never => { throw new Error(`The triangle project could not be opened. ${details}`); };
  if (draft.kind !== triangleDraftKind || draft.version !== 1) invalid('Unsupported triangle file version.');
  const id = draft.designId ?? (draft.title === 'Fig / Camel paisley' ? 'fig-camel' : 'atelier-paisley');
  if (id !== 'fig-camel' && id !== 'atelier-paisley') return invalid('Unknown scarf design.');
  const dimensions = record(draft.targetCm);
  const sizes = id === 'fig-camel' ? [figCamelTarget, proportionalFigCamelTarget, originalFigCamelTarget] : [triangleTarget];
  const target = sizes.find(size => dimensions.longEdgeCm === size.longEdgeCm && dimensions.depthCm === size.depthCm);
  if (!target) return invalid('The scarf dimensions do not match the design.');
  const gauge = record(draft.gaugePer10cm);
  const stitchesPer10cm = gauge.stitches;
  const rowsPer10cm = gauge.rows;
  if (typeof stitchesPer10cm !== 'number' || stitchesPer10cm < 5 || stitchesPer10cm > 100 ||
      typeof rowsPer10cm !== 'number' || rowsPer10cm < 5 || rowsPer10cm > 120) return invalid('The file has an invalid gauge.');
  const ends = draft.tipColumns;
  if (ends !== 2 && ends !== 3) return invalid('The file has an invalid tip width.');
  const plan = planTriangle(stitchesPer10cm, rowsPer10cm, target, ends);
  const placement = plannedBodyPlacement(plan);
  if (draft.plannedBodyPlacement !== undefined) {
    const saved = record(draft.plannedBodyPlacement);
    if (placement ? Object.entries(placement).some(([key, value]) => saved[key] !== value) : draft.plannedBodyPlacement !== null) {
      return invalid('The planned needle positions do not match the triangle width.');
    }
  }
  const chart = parseColorworkChartV1(draft.chart);
  if (chart.width !== plan.columns || chart.height !== plan.rows || chart.rowNumbering !== 'bottom-up' || chart.palette.length !== 2) {
    invalid('The stitch chart does not match the triangle dimensions.');
  }
  const intervals = draft.activeIntervalsExclusive;
  if (!Array.isArray(intervals) || intervals.length !== plan.rows ||
      plan.widths.some((width, row) => !Array.isArray(intervals[row]) || intervals[row].length !== 2 || intervals[row][0] !== 0 || intervals[row][1] !== width)) {
    invalid('The active needles do not match the triangle outline.');
  }
  if (chart.cells.some((row, i) => row.slice(plan.widths[i]).some((colour) => colour !== 0))) invalid('The chart has colour outside the outline.');
  const title = typeof draft.title === 'string' && draft.title.trim() && draft.title.length <= 200 ? draft.title : 'Paisley triangle';
  return { id, c3Decrease: record(draft.decreaseReference).swatchSha256 === cashmereDecrease.swatchSha256, title, target, palette: [chart.palette[0]!, chart.palette[1]!], stitchesPer10cm, rowsPer10cm, plan, cells: chart.cells };
}
