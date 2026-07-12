/**
 * Recover the exact colorwork design from a Customist Studio `.kc`
 * reference (fairisle / jacquard / dbj). The front-bed cell at
 * (row, needle) is the pattern carrier that knits FRONT there; rows are
 * segmented by flushing whenever a pattern carrier repeats. Body passes
 * are isolated by their roller value (Customist uses roller 450 for the
 * body; intro=400, waste=200/440, no-carrier moves=0).
 *
 * Used by the reference-kc parity harness to author a chart that
 * re-compiles (through the wizard recipe path) toward byte-identical
 * output — see `test/knitout/fairisle-parity.test.ts`. Pure over the
 * `.kc` text.
 */

export interface DecodedDesign {
  /** Pattern carriers, ascending (e.g. ['3','4'] for fairisle). */
  patternCarriers: string[];
  /** Design width in needles. */
  width: number;
  /** First / last knit needle index (absolute column in the FRNT line). */
  lo: number;
  hi: number;
  /** rows[r].get(col) = carrier knitting front at absolute needle `col`. */
  rows: Map<number, string>[];
}

function frontKnitCols(s: string): number[] {
  const out: number[] = [];
  for (let i = 0; i < s.length; i++) if (s[i] === '-') out.push(i);
  return out;
}

interface RawPass {
  carrier: string;
  front: number[];
  roller: number;
}

function parsePasses(kc: string): RawPass[] {
  const passes: RawPass[] = [];
  let frnt = '';
  for (const line of kc.split('\n')) {
    if (line.startsWith('FRNT:')) { frnt = line.slice(5); continue; }
    if (line.startsWith('REAR:')) continue;
    const m = line.match(/^(>>|<<)\s+(\S+)\s+(\S+)\s+(\d+)\s+(\d+)/);
    if (m) {
      if (m[2] === 'Kn-Kn') {
        passes.push({ carrier: m[3]!, front: frontKnitCols(frnt), roller: Number(m[5]) });
      }
      frnt = '';
    }
  }
  return passes;
}

export function decodeCustomistDesign(
  kc: string,
  opts: { bodyRoller?: number; skipLeadingRows?: number } = {},
): DecodedDesign {
  const bodyRoller = opts.bodyRoller ?? 450;
  const passes = parsePasses(kc);

  const counts = new Map<string, number>();
  for (const p of passes) counts.set(p.carrier, (counts.get(p.carrier) ?? 0) + 1);
  // Pattern carriers: not the no-carrier sentinel (0) or waste (6),
  // and present enough to be a design color (filters the C1 cameo).
  const patternCarriers = [...counts.entries()]
    .filter(([c, n]) => c !== '0' && c !== '6' && n > 8)
    .map(([c]) => c)
    .sort();
  const patternSet = new Set(patternCarriers);

  const designPasses = passes.filter(p => patternSet.has(p.carrier) && p.roller === bodyRoller);

  const rows: Map<number, string>[] = [];
  let cur = new Map<number, string>();
  let seen = new Set<string>();
  for (const p of designPasses) {
    if (seen.has(p.carrier)) { rows.push(cur); cur = new Map(); seen = new Set(); }
    for (const c of p.front) cur.set(c, p.carrier);
    seen.add(p.carrier);
  }
  if (cur.size) rows.push(cur);
  const bodyRows = opts.skipLeadingRows
    ? rows.slice(opts.skipLeadingRows)
    : rows;

  let lo = Infinity, hi = -Infinity;
  for (const row of bodyRows) for (const k of row.keys()) { lo = Math.min(lo, k); hi = Math.max(hi, k); }

  return { patternCarriers, width: hi - lo + 1, lo, hi, rows: bodyRows };
}
