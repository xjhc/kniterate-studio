/**
 * Campaign 4 — Slice C4-1: complement-image (inverse) double-jacquard
 * walker. A 2-color chart authored with `dbjStrategy: 'complement'`
 * compiles to the `complement-jacquard` technique: two passes per row,
 * each carrier knitting its color on the FRONT bed and the complement on
 * the BACK bed in a single pass (the construction the captured reference
 * sweater uses — decoded in docs/kniterate-improvement-tracker.md
 * §Campaign 4 ground truth).
 *
 * Core contract (orientation-independent, matches the reference body
 * decode `tmp/clawd/c4-body-lining.ts`): for every fabric row the two
 * carrier passes satisfy
 *   backKnit(A) == frontKnit(B)  and  backKnit(B) == frontKnit(A)
 * with the front partition disjoint + complete over the full width.
 *
 * Plus: vendor-clean through the real converter, loop-stack oracle max
 * stack 2 (no transfer-from-empty, no front-bed holes), and the lined
 * finish homes every column's back-bed loop (complement covers the whole
 * width every row).
 */
import { describe, expect, it } from 'vitest';
import { compileChartToKnitout } from '../../src/knitout/compile/from-chart.js';
import { writeKnitoutProgram } from '../../src/knitout/emitter.js';
import { knitoutToKCode } from '../../src/knitout/kniterate/to-kcode.js';
import { parseKc, simulateLoopStack } from '../../src/knitout/sophie/loop-stack-sim.js';
import {
  DEFAULT_KEY_PALETTE,
  KEY_ID_COLOR_GRAPHITE,
  KEY_ID_KNIT_DEFAULT,
  type KnitlabChartState,
  type KnitlabKeyInstance,
} from '../../src/colorwork/knitlab1-contract.js';
import type { CompileChartInput } from '../../src/knitout/compile/from-chart.js';
import type { KnitoutOp } from '../../src/knitout/types.js';
import type { YarnBinding } from '../../src/knitout/types.js';

const BINDINGS: YarnBinding[] = [
  { keyId: KEY_ID_KNIT_DEFAULT, carrier: '2', name: 'cream', role: 'background' },
  { keyId: KEY_ID_COLOR_GRAPHITE, carrier: '3', name: 'graphite', role: 'pattern' },
];

const NEEDLE_OFFSET = 30;
const COLS = 12;
const ROWS = 8;

/** Plain 2-color checkerboard rectangle, no shaping. */
function rectChart(): KnitlabChartState {
  const placements: KnitlabKeyInstance[] = [];
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      const keyId = (x + y) % 2 === 0 ? KEY_ID_KNIT_DEFAULT : KEY_ID_COLOR_GRAPHITE;
      placements.push({ anchor: { x, y }, keyId });
    }
  }
  const chart: KnitlabChartState = {
    id: 'complement-rect',
    rows: ROWS,
    cols: COLS,
    orientation: 'bottom-up',
    name: 'Complement rect',
    displaySettings: { rowCountVisibility: 'right', colCountVisibility: 'bottom' },
    layers: [{ id: 'base', name: 'Base', isVisible: true, grid: {}, keyPlacements: placements }],
    activeLayerId: 'base',
  };
  chart.annotations = [{
    id: 'dbj-complement',
    kind: 'dbj-backing',
    anchor: { scope: 'sheet' },
    dbjStrategy: 'complement',
  }];
  return chart;
}

function compile(overrides: Partial<CompileChartInput> = {}) {
  const result = compileChartToKnitout({
    chart: rectChart(),
    keyPalette: DEFAULT_KEY_PALETTE,
    yarnBindings: BINDINGS,
    backBedStyle: 'birdseye',
    needleOffset: NEEDLE_OFFSET,
    bindOff: 'waste-and-drop',
    ...overrides,
  });
  if (!result.ok || !result.program) {
    const errs = result.messages
      .filter(m => m.severity === 'error')
      .map(m => `[${m.rule}] ${m.message}`)
      .join('\n');
    throw new Error('compile failed:\n' + errs);
  }
  return result;
}

interface CarrierPass {
  carrier: string;
  front: Set<number>;
  back: Set<number>;
}

/** Walk the program ops, grouping body knits into per-row carrier passes.
 *  Stops at the lined-finish comment. Returns only full-width passes
 *  (front+back === COLS), filtering out any carrier-repositioning kicks. */
function bodyRows(ops: readonly KnitoutOp[]): CarrierPass[][] {
  const rows: CarrierPass[][] = [];
  let curRow: CarrierPass[] | null = null;
  let cur: CarrierPass | null = null;
  const flush = () => { if (cur) { curRow?.push(cur); cur = null; } };
  for (const op of ops) {
    if (op.kind === 'comment') {
      const text = op.text ?? '';
      if (text.includes('lined finish')) break;
      if (/^row \d+$/.test(text)) { flush(); curRow = []; rows.push(curRow); }
      continue;
    }
    if (op.kind === 'knit') {
      const c = op.carriers[0] ?? '0';
      if (!cur || cur.carrier !== c) { flush(); cur = { carrier: c, front: new Set(), back: new Set() }; }
      if (op.needle.bed === 'f') cur.front.add(op.needle.needle);
      else cur.back.add(op.needle.needle);
      continue;
    }
    flush();
  }
  flush();
  return rows.map(passes => passes.filter(p => p.front.size + p.back.size === COLS));
}

const setEq = (a: Set<number>, b: Set<number>) =>
  a.size === b.size && [...a].every(v => b.has(v));

describe('complement-image (inverse) double jacquard — C4-1', () => {
  it('routes a 2-color complement chart to the complement-jacquard technique', () => {
    const result = compile();
    expect(result.plan?.technique).toBe('complement-jacquard');
  });

  it('every fabric row is two passes with complement-image front/back partition', () => {
    const result = compile();
    const rows = bodyRows(result.program!.ops);
    expect(rows.length).toBe(ROWS);
    const full = new Set(Array.from({ length: COLS }, (_, i) => NEEDLE_OFFSET + i));
    for (const passes of rows) {
      expect(passes.length).toBe(2);
      const [a, b] = passes as [CarrierPass, CarrierPass];
      // Inverse-image: each carrier's back is the other's front.
      expect(setEq(a.back, b.front)).toBe(true);
      expect(setEq(b.back, a.front)).toBe(true);
      // Front partition disjoint + complete over the whole width.
      const union = new Set([...a.front, ...b.front]);
      expect(setEq(union, full)).toBe(true);
      const overlap = [...a.front].filter(v => b.front.has(v));
      expect(overlap).toEqual([]);
      // Each carrier knits every needle exactly once (front XOR back).
      expect(a.front.size + a.back.size).toBe(COLS);
      expect(b.front.size + b.back.size).toBe(COLS);
    }
  });

  it('is loop-clean through the real vendor (oracle: max stack 2, no holes)', () => {
    const result = compile();
    const kc = knitoutToKCode(writeKnitoutProgram(result.program!));
    expect(kc.ok).toBe(true);
    const sim = simulateLoopStack(
      parseKc(kc.kcode!, { dialect: 'knitout-vendor' }),
      { xferMovesWholeStack: true },
    );
    expect(sim.xferEmpty).toBe(0);
    expect(sim.knitHoles.filter(h => h.bed === 'f' && (h.carrier === '2' || h.carrier === '3'))).toEqual([]);
    expect(sim.maxStack).toBeLessThanOrEqual(2);
  });

  it('lined finish homes every column back-to-front (full back occupancy)', () => {
    const result = compile();
    const comments = result.program!.ops
      .filter((o): o is Extract<KnitoutOp, { kind: 'comment' }> => o.kind === 'comment')
      .map(o => o.text ?? '');
    expect(comments.some(t => t.includes('lined finish: home final-row lining'))).toBe(true);
    const homed = result.program!.ops
      .filter((o): o is Extract<KnitoutOp, { kind: 'xfer' }> => o.kind === 'xfer' && o.from.bed === 'b')
      .map(o => o.from.needle)
      .sort((a, b) => a - b);
    expect(homed).toEqual(Array.from({ length: COLS }, (_, i) => NEEDLE_OFFSET + i));
  });
});
