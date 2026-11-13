import type { ProjectEdit, ProjectState } from '@kniterate-studio/project-contract';
import { diamondRangesV1 } from '@kniterate-studio/machine-lib/browser';

/** Visible colour-swap selvedges. On a diamond, follow the active bounds;
 * a widening row also swaps the old edge so each empty rear needle gets
 * a different yarn, as in sleeves.kc. This is still a knit-on-empty increase. */
export function reversibleEdgeStatus(state: ProjectState): { closed: boolean; edit: ProjectEdit | null } {
  const { chart } = state;
  const colours = [...new Set(chart.cells.flat())].sort((a, b) => (state.machine.yarnAssignments.find(x => x.paletteId === chart.palette[a]?.id)?.carrier ?? String(a)).localeCompare(state.machine.yarnAssignments.find(x => x.paletteId === chart.palette[b]?.id)?.carrier ?? String(b)));
  if (chart.width < 3 || chart.height < 3 || colours.length !== 2) return { closed: false, edit: null };
  let bounds: { lo: number; hi: number }[];
  try {
    bounds = state.strategy.diamond ? diamondRangesV1(chart.width, chart.height, state.strategy.diamond).reverse() : chart.cells.map(() => ({ lo: 0, hi: chart.width - 1 }));
  } catch { return { closed: false, edit: null }; }
  const cells = chart.cells.flatMap((row, y) => {
    const current = bounds[y]!;
    const previous = bounds[y + 1]; // chart storage is top first
    const colour = (chart.height - 1 - y) % 2;
    const selected = new Map([[current.lo, colours[colour]!], [current.hi, colours[colour]!]]);
    if (state.strategy.diamond && previous) {
      if (current.lo < previous.lo) selected.set(previous.lo, colours[1 - colour]!);
      if (current.hi > previous.hi) selected.set(previous.hi, colours[1 - colour]!);
    }
    return [...selected].flatMap(([column, paletteIndex]) => row[column] === paletteIndex ? [] : [{ rowId: state.rowIds[y]!, column, paletteIndex }]);
  });
  const closed = state.strategy.diamond ? cells.length === 0 : [0, chart.width - 1].every(column => chart.cells.every((row, y) => y === 0 || row[column] !== chart.cells[y - 1]![column]));
  return { closed, edit: cells.length ? { kind: 'paint-cells', cells } : null };
}
