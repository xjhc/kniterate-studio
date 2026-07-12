/**
 * Generate a loadable shaped-tube (leaf) chart from a width schedule,
 * and read a width schedule back out of a captured `.kc`.
 *
 * The chart is a right-anchored outline: each round is one chart row,
 * painted with `KEY_ID_TUBE_KNIT` cells from the spine column leftward
 * for that round's width. Round 0 (cast-on) sits at the bottom.
 */

import {
  KEY_ID_TUBE_KNIT,
  type KnitlabChartState,
  type KnitlabKeyInstance,
} from '../../colorwork/knitlab1-contract.js';

/** Per-round tube width (the wide bed) read from a captured .kc. */
export function tubeScheduleFromKc(kcText: string, carrier = '3'): number[] {
  const cnt = (s: string) => { let n = 0; for (const c of s) if (c === '-') n++; return n; };
  let frnt = '', rear = '';
  const passW: number[] = [];
  for (const line of kcText.split('\n')) {
    if (line.startsWith('FRNT:')) frnt = line.slice(5);
    else if (line.startsWith('REAR:')) rear = line.slice(5);
    else {
      const m = line.match(/^(>>|<<)\s+Kn-Kn\s+(\S+)\s/);
      if (m && m[2] === carrier) { const w = Math.max(cnt(frnt), cnt(rear)); if (w > 0) passW.push(w); frnt = ''; rear = ''; }
      else if (/^(>>|<<)/.test(line)) { frnt = ''; rear = ''; }
    }
  }
  // Two tubular passes (front + back) per round.
  const rounds: number[] = [];
  for (let i = 0; i < passW.length; i += 2) rounds.push(Math.max(passW[i] ?? 0, passW[i + 1] ?? passW[i] ?? 0));
  return rounds;
}

/** Build a right-anchored leaf-outline chart from a width schedule. */
export function buildLeafChart(schedule: number[], opts: { name?: string } = {}): KnitlabChartState {
  const maxW = Math.max(1, ...schedule);
  const margin = 1;
  const cols = maxW + margin * 2;
  const rows = schedule.length;
  const anchorX = margin + maxW - 1; // rightmost (spine) column

  const placements: KnitlabKeyInstance[] = [];
  for (let r = 0; r < rows; r++) {
    const w = schedule[r]!;
    const y = r; // projection row r == round r (orientation handles bottom-up)
    for (let dx = 0; dx < w; dx++) {
      placements.push({ anchor: { x: anchorX - dx, y }, keyId: KEY_ID_TUBE_KNIT });
    }
  }

  return {
    id: 'leaf',
    rows,
    cols,
    orientation: 'bottom-up',
    name: opts.name ?? 'Leaf (shaped tube)',
    displaySettings: { rowCountVisibility: 'right', colCountVisibility: 'bottom' },
    layers: [{ id: 'base', name: 'Base', isVisible: true, grid: {}, keyPlacements: placements }],
    activeLayerId: 'base',
  };
}
