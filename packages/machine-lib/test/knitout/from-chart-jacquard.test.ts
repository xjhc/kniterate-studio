import { describe, expect, it } from 'vitest';
import { compileChartToKnitout } from '../../src/knitout/compile/from-chart.js';
import { writeKnitoutProgram } from '../../src/knitout/emitter.js';
import { knitoutToKCode } from '../../src/knitout/kniterate/to-kcode.js';
import {
  DEFAULT_KEY_PALETTE,
  KEY_ID_EMPTY,
  KEY_ID_K2TOG,
  KEY_ID_KNIT_DEFAULT,
  KEY_ID_SSK,
  type KnitlabChartState,
  type KnitlabKeyDefinition,
} from '../../src/colorwork/knitlab1-contract.js';
import type { YarnBinding } from '../../src/knitout/types.js';

/** Two-color palette: default knit (cream) plus a navy stand-in. */
const TWO_COLOR_PALETTE: KnitlabKeyDefinition[] = [
  ...DEFAULT_KEY_PALETTE,
  {
    id: 'navy',
    name: 'Navy',
    width: 1,
    height: 1,
    backgroundColor: '#0a1f44',
    symbolColor: '#ffffff',
    cells: [[null]],
  },
];

const CREAM_BINDING: YarnBinding = { keyId: KEY_ID_KNIT_DEFAULT, carrier: '2', name: 'cream' };
const NAVY_BINDING: YarnBinding = { keyId: 'navy', carrier: '3', name: 'navy' };

function twoColorChart(): KnitlabChartState {
  // 4 rows × 6 cols, simple alternating columns of cream and navy
  return {
    id: 'two-color',
    rows: 4,
    cols: 6,
    orientation: 'bottom-up',
    name: 'Two color',
    displaySettings: { rowCountVisibility: 'right', colCountVisibility: 'bottom' },
    layers: [
      {
        id: 'base',
        name: 'Base',
        isVisible: true,
        grid: {},
        keyPlacements: [
          // Navy at columns 1, 3, 5 of every row
          { anchor: { x: 1, y: 0 }, keyId: 'navy' },
          { anchor: { x: 3, y: 0 }, keyId: 'navy' },
          { anchor: { x: 5, y: 0 }, keyId: 'navy' },
          { anchor: { x: 1, y: 1 }, keyId: 'navy' },
          { anchor: { x: 3, y: 1 }, keyId: 'navy' },
          { anchor: { x: 5, y: 1 }, keyId: 'navy' },
          { anchor: { x: 1, y: 2 }, keyId: 'navy' },
          { anchor: { x: 3, y: 2 }, keyId: 'navy' },
          { anchor: { x: 5, y: 2 }, keyId: 'navy' },
          { anchor: { x: 1, y: 3 }, keyId: 'navy' },
          { anchor: { x: 3, y: 3 }, keyId: 'navy' },
          { anchor: { x: 5, y: 3 }, keyId: 'navy' },
        ],
      },
    ],
    activeLayerId: 'base',
  };
}

describe('compileChartToKnitout — P4 2-color ladder-back jacquard', () => {
  it('compiles a 2-color chart successfully', () => {
    const result = compileChartToKnitout({
      chart: twoColorChart(),
      keyPalette: TWO_COLOR_PALETTE,
      yarnBindings: [CREAM_BINDING, NAVY_BINDING],
      needleOffset: 50,
      wastePasses: 4,
      bindOff: 'drop',
      developerMode: true,
    });
    if (!result.ok) {
      const errs = result.messages.filter(m => m.severity === 'error').map(m => `[${m.rule}] ${m.message}`).join('\n');
      throw new Error('compile failed:\n' + errs);
    }
    expect(result.ok).toBe(true);
  });

  it('emits ;;Yarn-N headers for both carriers', () => {
    const result = compileChartToKnitout({
      chart: twoColorChart(),
      keyPalette: TWO_COLOR_PALETTE,
      yarnBindings: [CREAM_BINDING, NAVY_BINDING],
      needleOffset: 50,
      wastePasses: 4,
      bindOff: 'drop',
      developerMode: true,
    });
    const text = writeKnitoutProgram(result.program!);
    expect(text).toContain(';;Yarn-2: cream');
    expect(text).toContain(';;Yarn-3: navy');
  });

  it('emits front passes for each present color and one back-bed ladder pass per row', () => {
    const result = compileChartToKnitout({
      chart: twoColorChart(),
      keyPalette: TWO_COLOR_PALETTE,
      yarnBindings: [CREAM_BINDING, NAVY_BINDING],
      needleOffset: 50,
      wastePasses: 4,
      bindOff: 'drop',
      developerMode: true,
    });
    const ops = result.program!.ops;
    // Find pattern row comments.
    const rowMarkers = ops
      .map((op, i) => ({ op, i }))
      .filter(({ op }) => op.kind === 'comment' && /^row \d+$/.test(op.text));
    expect(rowMarkers.length).toBe(4);

    // Each pattern row should have:
    //   - front-bed knits/misses for carrier 2 (cream)
    //   - front-bed knits/misses for carrier 3 (navy)
    //   - back-bed knits with the ladder color (alternates 2, 3, 2, 3)
    for (let m = 0; m < rowMarkers.length; m++) {
      const start = rowMarkers[m]!.i + 1;
      const end = m + 1 < rowMarkers.length ? rowMarkers[m + 1]!.i : ops.length;
      const slice = ops.slice(start, end);
      const frontCream = slice.filter(o => (o.kind === 'knit' || o.kind === 'miss') && o.needle.bed === 'f' && o.carriers[0] === '2');
      const frontNavy = slice.filter(o => (o.kind === 'knit' || o.kind === 'miss') && o.needle.bed === 'f' && o.carriers[0] === '3');
      const backOps = slice.filter(o => o.kind === 'knit' && o.needle.bed === 'b');
      expect(frontCream.length).toBeGreaterThan(0);
      expect(frontNavy.length).toBeGreaterThan(0);
      // Back pass: full row width
      expect(backOps.length).toBe(6);
      // Ladder color alternates between rows
      const ladderCarrier = backOps[0]!.carriers[0];
      expect(ladderCarrier).toBe(m % 2 === 0 ? '2' : '3');
    }
  });

  it('a knit cell in the chart emits knit on the front bed for that color', () => {
    const result = compileChartToKnitout({
      chart: twoColorChart(),
      keyPalette: TWO_COLOR_PALETTE,
      yarnBindings: [CREAM_BINDING, NAVY_BINDING],
      needleOffset: 50,
      wastePasses: 4,
      bindOff: 'drop',
      developerMode: true,
    });
    const ops = result.program!.ops;
    // Chart row 0, column 1 is navy. needle = 50 + 1 = 51, carrier 3.
    // Find the corresponding op in the first pattern row's navy front pass.
    const row0Idx = ops.findIndex(op => op.kind === 'comment' && op.text === 'row 0');
    expect(row0Idx).toBeGreaterThan(-1);
    let foundNavyKnit = false;
    for (let i = row0Idx; i < ops.length; i++) {
      const op = ops[i]!;
      if (op.kind === 'knit' && op.needle.bed === 'f' && op.needle.needle === 51 && op.carriers[0] === '3') {
        foundNavyKnit = true;
        break;
      }
      if (op.kind === 'comment' && /^row 1$/.test(op.text)) break;
    }
    expect(foundNavyKnit).toBe(true);
  });

  it('produces no carrier-state errors and ends with all carriers released', () => {
    const result = compileChartToKnitout({
      chart: twoColorChart(),
      keyPalette: TWO_COLOR_PALETTE,
      yarnBindings: [CREAM_BINDING, NAVY_BINDING],
      needleOffset: 50,
      wastePasses: 4,
      bindOff: 'drop',
      developerMode: true,
    });
    expect(result.messages.filter(m => m.severity === 'error')).toEqual([]);
    expect(result.messages.some(m => m.rule === 'carriers-trailing-at-end')).toBe(false);
    expect(result.messages.some(m => m.rule === 'carrier-active')).toBe(false);
  });

  it('round-trips through the vendored knitout-to-kcode compiler', () => {
    const result = compileChartToKnitout({
      chart: twoColorChart(),
      keyPalette: TWO_COLOR_PALETTE,
      yarnBindings: [CREAM_BINDING, NAVY_BINDING],
      needleOffset: 50,
      wastePasses: 4,
      bindOff: 'drop',
      developerMode: true,
    });
    const text = writeKnitoutProgram(result.program!);
    const kc = knitoutToKCode(text);
    if (!kc.ok) {
      throw new Error(
        `knitout-to-kcode failed:\n--- stdout ---\n${kc.stdout}\n--- stderr ---\n${kc.stderr}\n--- knitout ---\n${text}`,
      );
    }
    expect(kc.kcode).toMatch(/FRNT:/);
    expect(kc.kcode).toMatch(/REAR:/);
  });

  it('produces a snapshot-stable .k for a 2x4 two-color chart', () => {
    const chart: KnitlabChartState = {
      id: 'snap',
      rows: 2,
      cols: 4,
      orientation: 'bottom-up',
      name: 'Snap',
      displaySettings: { rowCountVisibility: 'right', colCountVisibility: 'bottom' },
      layers: [
        {
          id: 'base',
          name: 'Base',
          isVisible: true,
          grid: {},
          keyPlacements: [
            { anchor: { x: 1, y: 0 }, keyId: 'navy' },
            { anchor: { x: 3, y: 0 }, keyId: 'navy' },
            { anchor: { x: 0, y: 1 }, keyId: 'navy' },
            { anchor: { x: 2, y: 1 }, keyId: 'navy' },
          ],
        },
      ],
      activeLayerId: 'base',
    };
    const result = compileChartToKnitout({
      chart,
      keyPalette: TWO_COLOR_PALETTE,
      yarnBindings: [CREAM_BINDING, NAVY_BINDING],
      needleOffset: 50,
      wastePasses: 4,
      bindOff: 'drop',
      developerMode: true,
    });
    expect(result.ok).toBe(true);
    expect(writeKnitoutProgram(result.program!)).toMatchSnapshot();
  });

  it('B5 full: shaped within-row multicolor charts lower with a preview warning', () => {
    const chart = twoColorChart();
    chart.layers[0]!.keyPlacements.push(
      { anchor: { x: 0, y: 0 }, keyId: KEY_ID_K2TOG },
      { anchor: { x: 0, y: 1 }, keyId: KEY_ID_EMPTY },
    );

    const result = compileChartToKnitout({
      chart,
      keyPalette: TWO_COLOR_PALETTE,
      yarnBindings: [CREAM_BINDING, NAVY_BINDING],
      needleOffset: 50,
      wastePasses: 4,
      bindOff: 'drop',
      developerMode: true,
    });

    expect(result.messages.some(m => m.rule === 'track-a-shape-jacquard-unsupported')).toBe(false);
    expect(result.messages.some(m => m.rule === 'track-a-shape-jacquard-preview')).toBe(true);
  });

  it('B5 full: shaped jacquard emits per-color front-bed passes over the active range', () => {
    // Build a 4×6 two-color shaped chart from scratch (avoids conflicts
    // with twoColorChart's navy-at-col-1 placements that would override
    // the k2tog under the resolve sort).
    const chart: KnitlabChartState = {
      id: 'b5-test',
      rows: 4,
      cols: 6,
      orientation: 'bottom-up',
      name: 'B5 test',
      displaySettings: { rowCountVisibility: 'right', colCountVisibility: 'bottom' },
      layers: [{
        id: 'base',
        name: 'Base',
        isVisible: true,
        grid: {},
        keyPlacements: [
          // Two-color stripes on the active range. Authored row 0 is the
          // shaped top row; avoid col 1 because canonical SSK at col 0 owns
          // source col 0 and visible result col 1.
          { anchor: { x: 3, y: 0 }, keyId: 'navy' },
          { anchor: { x: 5, y: 0 }, keyId: 'navy' },
          { anchor: { x: 1, y: 1 }, keyId: 'navy' },
          { anchor: { x: 3, y: 1 }, keyId: 'navy' },
          { anchor: { x: 5, y: 1 }, keyId: 'navy' },
          { anchor: { x: 1, y: 2 }, keyId: 'navy' },
          { anchor: { x: 3, y: 2 }, keyId: 'navy' },
          { anchor: { x: 5, y: 2 }, keyId: 'navy' },
          { anchor: { x: 1, y: 3 }, keyId: 'navy' },
          { anchor: { x: 3, y: 3 }, keyId: 'navy' },
          { anchor: { x: 5, y: 3 }, keyId: 'navy' },
          // Shape: panel narrows by 1 at the top via a canonical atomic SSK.
          { anchor: { x: 0, y: 0 }, keyId: KEY_ID_SSK },
        ],
      }],
      activeLayerId: 'base',
    };
    const result = compileChartToKnitout({
      chart,
      keyPalette: TWO_COLOR_PALETTE,
      yarnBindings: [CREAM_BINDING, NAVY_BINDING],
      needleOffset: 50,
      wastePasses: 4,
      bindOff: 'drop',
      developerMode: true,
    });
    expect(result.ok).toBe(true);
    expect(result.plan?.technique).toBe('stockinette-shaped-jacquard');
    // Per-color passes mean both carriers see knit ops in the same row.
    const ops = result.program!.ops;
    const cream = ops.filter(op => op.kind === 'knit' && op.carriers.includes('2'));
    const navy = ops.filter(op => op.kind === 'knit' && op.carriers.includes('3'));
    expect(cream.length).toBeGreaterThan(0);
    expect(navy.length).toBeGreaterThan(0);
  });
});
