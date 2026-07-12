/**
 * Recover a traveling-i-cord `IcordSpec` from a Customist `.kc` file.
 *
 * Closes the loop the other direction: where `emitICord` turns a spec
 * into knitout (→ vendor → .kc), this reads an existing .kc i-cord
 * design (e.g. `reference/sophie.kc`) back into a spec that `emitICord`
 * can replay. Used to reproduce captured i-cord references inside
 * knitlab and to import Customist i-cord artwork as editable specs.
 *
 * Method: walk the passes; on each non-empty knit pass for the cord
 * carrier, take the cord's leftmost operated column (its left edge).
 * Consecutive equal columns are a knit band; a column change is a
 * lateral travel of |Δ| columns. That sequence IS the spec.
 */

import type { IcordStep } from '../passes/icord.js';

export interface IcordFromKcOptions {
  /** Cord carrier to follow. Default '3' (sophie's). */
  carrier?: string;
  /** Cord circumference to assign to the recovered spec. Default 7. */
  width?: number;
  /** Base needle to normalise the cord's start column to. Default 100. */
  baseNeedle?: number;
}

export interface IcordFromKcResult {
  spec: { startCol: number; width: number; steps: IcordStep[] };
  stats: {
    /** Non-empty knit passes for the cord carrier. */
    knitPasses: number;
    /** Number of knit bands (in-place runs between travels). */
    bands: number;
    /** Number of lateral travels. */
    travels: number;
    /** Column span the cord covers (in .kc string-index space). */
    colSpan: number;
  };
}

interface KcPass { type: string; carrier: string; frnt: string; rear: string; }

function parsePasses(kcText: string): KcPass[] {
  const passes: KcPass[] = [];
  let frnt = '', rear = '';
  for (const line of kcText.split('\n')) {
    if (line.startsWith('FRNT:')) frnt = line.slice(5);
    else if (line.startsWith('REAR:')) rear = line.slice(5);
    else {
      const m = line.match(/^(>>|<<)\s+(\S+)\s+(\S+)\s+/);
      if (m) { passes.push({ type: m[2]!, carrier: m[3]!, frnt, rear }); frnt = ''; rear = ''; }
    }
  }
  return passes;
}

/** Leftmost operated (`-`) column in a bed string, or -1 if none. */
function leftmostOp(s: string): number {
  return s.indexOf('-');
}

export function icordSpecFromKc(kcText: string, opts: IcordFromKcOptions = {}): IcordFromKcResult {
  const carrier = opts.carrier ?? '3';
  const width = opts.width ?? 7;
  const base = opts.baseNeedle ?? 100;

  const passes = parsePasses(kcText);

  // Anchor-column (cord left edge) over non-empty knit passes.
  const anchors: number[] = [];
  for (const p of passes) {
    if (p.type !== 'Kn-Kn' || p.carrier !== carrier) continue;
    const cols = [leftmostOp(p.frnt), leftmostOp(p.rear)].filter(x => x >= 0);
    if (cols.length === 0) continue; // empty auto-move pass
    anchors.push(Math.min(...cols));
  }

  if (anchors.length === 0) {
    return { spec: { startCol: base, width, steps: [] }, stats: { knitPasses: 0, bands: 0, travels: 0, colSpan: 0 } };
  }

  const steps: IcordStep[] = [];
  let minCol = Infinity, maxCol = -Infinity, travels = 0;
  let bandLen = 0;
  for (let i = 0; i < anchors.length; i++) {
    const a = anchors[i]!;
    minCol = Math.min(minCol, a); maxCol = Math.max(maxCol, a);
    if (i === 0) { bandLen = 1; continue; }
    const prev = anchors[i - 1]!;
    if (a === prev) { bandLen++; continue; }
    steps.push({ kind: 'knit', rounds: bandLen });
    const d = a - prev;
    steps.push({ kind: 'travel', dir: d < 0 ? 'left' : 'right', cols: Math.abs(d) });
    travels++;
    bandLen = 1;
  }
  steps.push({ kind: 'knit', rounds: bandLen });

  const startCol = anchors[0]! - minCol + base;
  const bands = steps.filter(s => s.kind === 'knit').length;

  return {
    spec: { startCol, width, steps },
    stats: { knitPasses: anchors.length, bands, travels, colSpan: maxCol - minCol },
  };
}
