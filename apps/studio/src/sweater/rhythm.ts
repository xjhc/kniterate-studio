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

export interface SidedStep extends RhythmStep {
  /** 'both' when the two edges do the same on the same rows. */
  side: 'both' | 'left' | 'right';
}

/**
 * A pair of edges' shaping in row order. A run both edges share reads once;
 * where they differ (a bind-off waits a row for the yarn on the right, and
 * the shaping after it catches up differently), each edge's own steps.
 */
export function pairedRhythm(events: readonly ShapingEvent[], left: ShapingEvent['edge'], right: ShapingEvent['edge']): SidedStep[] {
  const key = (step: RhythmStep) => `${step.from}|${step.to}|${step.text}`;
  const lefts = edgeRhythm(events, [left]);
  const rights = edgeRhythm(events, [right]);
  const leftKeys = new Set(lefts.map(key));
  const rightKeys = new Set(rights.map(key));
  const order = { both: 0, left: 1, right: 2 } as const;
  return [
    ...lefts.map((step) => ({ ...step, side: rightKeys.has(key(step)) ? 'both' as const : 'left' as const })),
    ...rights.filter((step) => !leftKeys.has(key(step))).map((step) => ({ ...step, side: 'right' as const })),
  ].sort((a, b) => a.from - b.from || order[a.side] - order[b.side]);
}

/** A step's text naming its edge when only one edge does it: "Row 140, right: bind off 8". */
export function sidedText(step: SidedStep): string {
  return step.side === 'both' ? step.text : step.text.replace(': ', `, ${step.side}: `);
}

/** The outer edges' and the neck edges' shaping of a piece; the edges' runs stop at the neck, as the shoulders knit apart. */
export function pieceRhythm(raster: PanelPlan): { edge: SidedStep[]; neck: SidedStep[] } {
  const centre = edgeRhythm(raster.events, ['centre']).map((step) => ({ ...step, side: 'both' as const }));
  const split = raster.events.find((event) => event.kind === 'neck-split');
  const parts = split === undefined ? [raster.events] : [raster.events.filter((event) => event.row < split.row), raster.events.filter((event) => event.row >= split.row)];
  return {
    edge: parts.flatMap((part) => pairedRhythm(part, 'left', 'right')),
    neck: [...centre, ...pairedRhythm(raster.events, 'neck-left', 'neck-right')].sort((a, b) => a.from - b.from),
  };
}
