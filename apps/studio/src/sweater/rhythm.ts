import type { PanelPlan, ShapingEvent } from './rasterize';

/**
 * Shaping as a machine knitter reads it: runs of the same change at a steady
 * interval ("decrease 1 every 4th row, 6 times"), with bind-offs on their
 * own. An interval that alternates between two neighbouring values, as an
 * evenly spread slope does, reads "every 6–7 rows".
 */

export interface RhythmStep {
  /** First and last row of the run, zero-based. */
  from: number;
  to: number;
  kind: ShapingEvent['kind'];
  text: string;
}

const ordinal = (n: number) => {
  if (n === 1) return 'row';
  const teen = n % 100 >= 11 && n % 100 <= 13;
  const suffix = teen ? 'th' : n % 10 === 1 ? 'st' : n % 10 === 2 ? 'nd' : n % 10 === 3 ? 'rd' : 'th';
  return `${n}${suffix} row`;
};
const VERB: Record<ShapingEvent['kind'], string> = { 'bind-off': 'bind off', decrease: 'decrease', increase: 'increase', 'neck-split': 'bind off the centre' };

export function edgeRhythm(events: readonly ShapingEvent[], edges: readonly ShapingEvent['edge'][]): RhythmStep[] {
  const list = events.filter((event) => edges.includes(event.edge)).sort((a, b) => a.row - b.row);
  const steps: RhythmStep[] = [];
  let i = 0;
  while (i < list.length) {
    const event = list[i]!;
    if (event.kind === 'bind-off' || event.kind === 'neck-split') {
      steps.push({ from: event.row, to: event.row, kind: event.kind, text: `Row ${event.row + 1}: ${VERB[event.kind]} ${event.stitches}` });
      i++;
      continue;
    }
    let j = i + 1;
    let low = Infinity;
    let high = -Infinity;
    while (j < list.length && list[j]!.kind === event.kind && list[j]!.stitches === event.stitches) {
      const gap = list[j]!.row - list[j - 1]!.row;
      const nextLow = Math.min(low, gap);
      const nextHigh = Math.max(high, gap);
      if (nextHigh - nextLow > 1) break;
      low = nextLow;
      high = nextHigh;
      j++;
    }
    const count = j - i;
    const last = list[j - 1]!;
    const amount = `${VERB[event.kind]} ${event.stitches}`;
    const text = count === 1
      ? `Row ${event.row + 1}: ${amount}`
      : `Rows ${event.row + 1}–${last.row + 1}: ${amount} every ${low === high ? ordinal(low) : `${low}–${high} rows`}, ${count} times`;
    steps.push({ from: event.row, to: last.row, kind: event.kind, text });
    i = j;
  }
  return steps;
}

/** The outer edge's and the neck edge's shaping of a piece (the right side mirrors the left). */
export function pieceRhythm(raster: PanelPlan): { edge: RhythmStep[]; neck: RhythmStep[] } {
  return {
    edge: edgeRhythm(raster.events, ['left']),
    neck: edgeRhythm(raster.events, ['centre', 'neck-left']),
  };
}
