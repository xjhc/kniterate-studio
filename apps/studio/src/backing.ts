import { beanieObjectOf, type ProjectState } from '@kniterate-studio/project-contract';

/** The backings a colourwork body is knitted with: each has a Customist-matched reference program. */
export const BACKINGS = ['fairisle', 'birdseye'] as const;
export type Backing = (typeof BACKINGS)[number];

export interface BackingWords {
  name: string;
  /** The fabric it makes, for a gauge label: "birdseye fabric". */
  fabric: string;
  help: string;
}

const COLOURWORK: Record<Backing, BackingWords> = {
  fairisle: { name: 'Fairisle', fabric: 'fairisle fabric', help: 'Light. Unused colours float behind the work.' },
  birdseye: { name: 'Birdseye', fabric: 'birdseye fabric', help: 'Thicker and warmer. No long floats, so thin lines and logos work.' },
};
/** One yarn has nothing to float or catch: a beanie body is then one layer of stockinette, or two (birdseye knits the back layer in the same yarn). */
const ONE_YARN: Record<Backing, BackingWords> = {
  fairisle: { name: 'Single layer', fabric: 'single-layer fabric', help: 'Light. One layer of stockinette.' },
  birdseye: { name: 'Double layer', fabric: 'double-layer fabric', help: 'Thick and warm. The yarn knits a second layer behind.' },
};

/**
 * How many colours the colourwork knits: a beanie's body above its cuff, or
 * the whole chart. Null when there is no colourwork (a beanie in rib all over).
 */
export function colourworkColours(state: ProjectState): number | null {
  const beanie = beanieObjectOf(state);
  if (beanie && beanie.construction !== 'rib-cuff-jersey-body') return null;
  const rows = beanie ? state.chart.cells.slice(0, Math.max(0, state.chart.height - (beanie.cuffRows ?? 0))) : state.chart.cells;
  return new Set(rows.flat()).size;
}

/**
 * The backing in plain words for a body in `colours` colours. With one
 * colour a beanie's choice is one layer or two; a chart has no choice (it
 * knits plain whichever backing is set), so it is null.
 */
export function backingWords(technique: Backing, colours: number, beanie: boolean): BackingWords | null {
  if (colours >= 2) return COLOURWORK[technique];
  return beanie ? ONE_YARN[technique] : null;
}

/** The project's backing in plain words, or null when it has no choice of backing. */
export function projectBackingWords(state: ProjectState): BackingWords | null {
  const colours = colourworkColours(state);
  const technique = state.strategy.technique;
  if (colours === null || (technique !== 'fairisle' && technique !== 'birdseye')) return null;
  return backingWords(technique, colours, state.object?.kind === 'beanie');
}
