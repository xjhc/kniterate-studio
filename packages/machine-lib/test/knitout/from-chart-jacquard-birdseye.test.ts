/**
 * P2 #10 — Birdseye-back jacquard walker. The float-free 3+ color
 * option that replaces the broken lined-back. Per
 * https://www.kniterate.com/2025/05/21/birdseye-backs-in-jacquard-knitting/:
 * each color knits a stippled subset of back-bed needles per row, and
 * the back bed runs at +0.5 rack to prevent collisions.
 */

import { describe, expect, it } from 'vitest';
import { compileChartToKnitout } from '../../src/knitout/compile/from-chart.js';
import {
  DEFAULT_KEY_PALETTE,
  KEY_ID_KNIT_DEFAULT,
  type KnitlabChartState,
  type KnitlabKeyDefinition,
} from '../../src/colorwork/knitlab1-contract.js';
import type { YarnBinding } from '../../src/knitout/types.js';

const THREE_COLOR_PALETTE: KnitlabKeyDefinition[] = [
  ...DEFAULT_KEY_PALETTE,
  { id: 'navy', name: 'Navy', width: 1, height: 1, backgroundColor: '#0a1f44', symbolColor: '#fff', cells: [[null]] },
  { id: 'rust', name: 'Rust', width: 1, height: 1, backgroundColor: '#a83a1f', symbolColor: '#fff', cells: [[null]] },
];

const BINDINGS: YarnBinding[] = [
  { keyId: KEY_ID_KNIT_DEFAULT, carrier: '2', name: 'cream' },
  { keyId: 'navy',              carrier: '3', name: 'navy' },
  { keyId: 'rust',              carrier: '4', name: 'rust' },
];

/** 4 rows × 6 cols chart that uses all three colors. */
function threeColorChart(): KnitlabChartState {
  return {
    id: 'three-color-birdseye',
    rows: 4,
    cols: 6,
    orientation: 'bottom-up',
    name: 'Three color birdseye',
    displaySettings: { rowCountVisibility: 'right', colCountVisibility: 'bottom' },
    layers: [
      {
        id: 'base',
        name: 'Base',
        isVisible: true,
        grid: {},
        keyPlacements: [
          { anchor: { x: 1, y: 0 }, keyId: 'navy' },
          { anchor: { x: 3, y: 0 }, keyId: 'rust' },
          { anchor: { x: 1, y: 1 }, keyId: 'rust' },
          { anchor: { x: 3, y: 1 }, keyId: 'navy' },
          { anchor: { x: 5, y: 1 }, keyId: 'navy' },
          { anchor: { x: 0, y: 2 }, keyId: 'navy' },
          { anchor: { x: 4, y: 2 }, keyId: 'rust' },
          { anchor: { x: 2, y: 3 }, keyId: 'rust' },
          { anchor: { x: 5, y: 3 }, keyId: 'rust' },
        ],
      },
    ],
    activeLayerId: 'base',
  };
}

describe('compileChartToKnitout — P2 #10 birdseye back', () => {
  it('compiles a 3-color chart with backBedStyle: birdseye', () => {
    const result = compileChartToKnitout({
      chart: threeColorChart(),
      keyPalette: THREE_COLOR_PALETTE,
      yarnBindings: BINDINGS,
      needleOffset: 50,
      wastePasses: 4,
      bindOff: 'drop',
      developerMode: true,
      backBedStyle: 'birdseye',
    });
    if (!result.ok) {
      const errs = result.messages
        .filter(m => m.severity === 'error')
        .map(m => `[${m.rule}] ${m.message}`)
        .join('\n');
      throw new Error(`birdseye compile failed:\n${errs}`);
    }
    expect(result.ok).toBe(true);
    expect(result.plan?.technique).toBe('birdseye-jacquard');
  });

  it('emits +0.5 rack and back to 0 around each pattern row', () => {
    const result = compileChartToKnitout({
      chart: threeColorChart(),
      keyPalette: THREE_COLOR_PALETTE,
      yarnBindings: BINDINGS,
      needleOffset: 50,
      wastePasses: 4,
      bindOff: 'drop',
      developerMode: true,
      backBedStyle: 'birdseye',
    });
    expect(result.ok).toBe(true);
    const ops = result.program!.ops;
    const halfRacks = ops.filter(o => o.kind === 'rack' && o.offset === 0.5);
    const zeroRacks = ops.filter(o => o.kind === 'rack' && o.offset === 0);
    // 4 chart rows → 4 half-racks, paired with 4 zero-racks
    expect(halfRacks.length).toBe(4);
    expect(zeroRacks.length).toBeGreaterThanOrEqual(4);
  });

  it('back-bed coverage: every back-bed needle in row 0 is knit exactly once across the N color passes (full mode)', () => {
    const result = compileChartToKnitout({
      chart: threeColorChart(),
      keyPalette: THREE_COLOR_PALETTE,
      yarnBindings: BINDINGS,
      needleOffset: 50,
      wastePasses: 4,
      bindOff: 'drop',
      developerMode: true,
      backBedStyle: 'birdseye',
      birdseyeMode: 'full',
    });
    expect(result.ok).toBe(true);
    const ops = result.program!.ops;
    // Find the row 0 marker
    const row0Start = ops.findIndex(
      o => o.kind === 'comment' && o.text === 'row 0',
    );
    const row1Start = ops.findIndex(
      o => o.kind === 'comment' && o.text === 'row 1',
    );
    expect(row0Start).toBeGreaterThan(-1);
    expect(row1Start).toBeGreaterThan(row0Start);

    // Count back-bed knits per needle in the row-0 slice.
    const row0Ops = ops.slice(row0Start, row1Start);
    const backKnitsByNeedle = new Map<number, number>();
    for (const op of row0Ops) {
      if (op.kind === 'knit' && op.needle.bed === 'b') {
        backKnitsByNeedle.set(op.needle.needle, (backKnitsByNeedle.get(op.needle.needle) ?? 0) + 1);
      }
    }
    // Full mode → 3 colors × 6 cols = 18 back-bed knits total, and each
    // needle should be knit by exactly one color (stippling formula).
    expect(backKnitsByNeedle.size).toBe(6);
    for (const [needle, count] of backKnitsByNeedle.entries()) {
      expect(count).toBe(1);
    }
  });

  it('minimal mode skips back-bed passes for colors not present in the row', () => {
    // Build a 3-color chart where row 0 uses only cream (default) — no
    // navy / rust placements on row 0. In 'minimal' mode, navy and rust
    // should NOT emit a back-bed pass for that row.
    const chart: KnitlabChartState = {
      id: 'minimal-test',
      rows: 2,
      cols: 4,
      orientation: 'bottom-up',
      name: 'Minimal birdseye',
      displaySettings: { rowCountVisibility: 'right', colCountVisibility: 'bottom' },
      layers: [
        {
          id: 'base',
          name: 'Base',
          isVisible: true,
          grid: {},
          keyPlacements: [
            // Only place navy and rust on row 1 — row 0 is all cream.
            { anchor: { x: 1, y: 1 }, keyId: 'navy' },
            { anchor: { x: 2, y: 1 }, keyId: 'rust' },
          ],
        },
      ],
      activeLayerId: 'base',
    };
    const result = compileChartToKnitout({
      chart,
      keyPalette: THREE_COLOR_PALETTE,
      yarnBindings: BINDINGS,
      needleOffset: 50,
      wastePasses: 4,
      bindOff: 'drop',
      developerMode: true,
      backBedStyle: 'birdseye',
      birdseyeMode: 'minimal',
    });
    expect(result.ok).toBe(true);
    const ops = result.program!.ops;
    const row0Start = ops.findIndex(o => o.kind === 'comment' && o.text === 'row 0');
    const row1Start = ops.findIndex(o => o.kind === 'comment' && o.text === 'row 1');
    const row0Ops = ops.slice(row0Start, row1Start);
    // In row 0, only cream (carrier '2') has content on the front; in
    // minimal mode the back-bed passes for navy and rust are skipped.
    const backKnits = row0Ops.filter(o => o.kind === 'knit' && o.needle.bed === 'b');
    const backCarriers = new Set(backKnits.map(o => (o as { carriers: string[] }).carriers[0]));
    expect(backCarriers).toEqual(new Set(['2']));
  });

  it('B4 full: striped backing assigns full rows to one color (row % N === colorIndex)', () => {
    const chart = threeColorChart();
    chart.annotations = [{
      id: 'dbj-1',
      kind: 'dbj-backing',
      anchor: { scope: 'sheet' },
      dbjStrategy: 'striped',
    }];
    const result = compileChartToKnitout({
      chart,
      keyPalette: THREE_COLOR_PALETTE,
      yarnBindings: BINDINGS,
      needleOffset: 50,
      wastePasses: 4,
      bindOff: 'drop',
      developerMode: true,
      backBedStyle: 'birdseye',
      birdseyeMode: 'full',
    });
    expect(result.ok).toBe(true);
    const ops = result.program!.ops;
    const row0Start = ops.findIndex(o => o.kind === 'comment' && o.text === 'row 0');
    const row1Start = ops.findIndex(o => o.kind === 'comment' && o.text === 'row 1');
    const row0Ops = ops.slice(row0Start, row1Start);
    // Striped: row 0 → color index 0 → carrier '2' (cream) owns all
    // back-bed needles for row 0; navy and rust pass miss-only.
    const backKnits = row0Ops.filter(o => o.kind === 'knit' && o.needle.bed === 'b');
    const knitCarriers = new Set(backKnits.map(o => (o as { carriers: string[] }).carriers[0]));
    expect(knitCarriers).toEqual(new Set(['2']));
  });

  it('B4 full: twill backing assigns 2-needle diagonal stripes', () => {
    const chart = threeColorChart();
    chart.annotations = [{
      id: 'dbj-1',
      kind: 'dbj-backing',
      anchor: { scope: 'sheet' },
      dbjStrategy: 'twill',
    }];
    const result = compileChartToKnitout({
      chart,
      keyPalette: THREE_COLOR_PALETTE,
      yarnBindings: BINDINGS,
      needleOffset: 50,
      wastePasses: 4,
      bindOff: 'drop',
      developerMode: true,
      backBedStyle: 'birdseye',
      birdseyeMode: 'full',
    });
    expect(result.ok).toBe(true);
    const ops = result.program!.ops;
    const row0Start = ops.findIndex(o => o.kind === 'comment' && o.text === 'row 0');
    const row1Start = ops.findIndex(o => o.kind === 'comment' && o.text === 'row 1');
    const row0Ops = ops.slice(row0Start, row1Start);
    // Twill: floor((col + 0) / 2) % 3 → cols 0,1=color 0; cols 2,3=color 1; cols 4,5=color 2.
    // Every back-bed needle should be owned by exactly one color.
    const backKnitsByNeedle = new Map<number, string>();
    for (const op of row0Ops) {
      if (op.kind === 'knit' && op.needle.bed === 'b') {
        backKnitsByNeedle.set(op.needle.needle, (op as { carriers: string[] }).carriers[0]!);
      }
    }
    expect(backKnitsByNeedle.size).toBe(6);
    // cols 0,1 (needles 50, 51) should be '2' (cream); 2,3 → '3' (navy); 4,5 → '4' (rust).
    expect(backKnitsByNeedle.get(50)).toBe('2');
    expect(backKnitsByNeedle.get(51)).toBe('2');
    expect(backKnitsByNeedle.get(52)).toBe('3');
    expect(backKnitsByNeedle.get(53)).toBe('3');
    expect(backKnitsByNeedle.get(54)).toBe('4');
    expect(backKnitsByNeedle.get(55)).toBe('4');
  });
});
