import { describe, expect, it } from 'vitest';
import {
  DEFAULT_KEY_PALETTE,
  KEY_ID_COLOR_GOLD,
  KEY_ID_COLOR_RED,
  KEY_ID_COLOR_TEAL,
  KEY_ID_KNIT_DEFAULT,
  type KnitlabChartState,
  type KnitlabKeyDefinition,
} from '../../src/colorwork/knitlab1-contract.js';
import { compileChartToKnitout, type CompileChartInput } from '../../src/knitout/compile/from-chart.js';
import { FAIRISLE_CARRIER_INTRO_DEFAULTS } from '../../src/knitout/passes/carrier-intro.js';
import type { KnitoutOp, YarnBinding } from '../../src/knitout/types.js';

const NAVY = 'navy';

const TWO_COLOR_PALETTE: KnitlabKeyDefinition[] = [
  ...DEFAULT_KEY_PALETTE,
  {
    id: NAVY,
    name: 'Navy',
    width: 1,
    height: 1,
    backgroundColor: '#0a1f44',
    symbolColor: '#ffffff',
    cells: [[null]],
  },
];

const STOCKINETTE_BINDING: YarnBinding = {
  keyId: KEY_ID_KNIT_DEFAULT,
  carrier: '2',
  name: 'cream',
};

const TWO_COLOR_BINDINGS: YarnBinding[] = [
  STOCKINETTE_BINDING,
  { keyId: NAVY, carrier: '3', name: 'navy' },
];

const DBJ_BINDINGS: YarnBinding[] = [
  STOCKINETTE_BINDING,
  { keyId: KEY_ID_COLOR_RED, carrier: '3', name: 'red' },
  { keyId: KEY_ID_COLOR_GOLD, carrier: '4', name: 'gold' },
  { keyId: KEY_ID_COLOR_TEAL, carrier: '5', name: 'teal' },
];

function chart(rows: number, cols: number, placements: Array<{ x: number; y: number; keyId: string }> = []): KnitlabChartState {
  return {
    id: 'first-row-protection',
    rows,
    cols,
    orientation: 'bottom-up',
    name: 'First row protection',
    displaySettings: { rowCountVisibility: 'right', colCountVisibility: 'bottom' },
    layers: [{
      id: 'base',
      name: 'Base',
      isVisible: true,
      grid: {},
      keyPlacements: placements.map(p => ({ anchor: { x: p.x, y: p.y }, keyId: p.keyId })),
    }],
    activeLayerId: 'base',
  };
}

function dbjFullChart(): KnitlabChartState {
  const out = chart(3, 8, [
    { x: 1, y: 0, keyId: KEY_ID_COLOR_RED },
    { x: 3, y: 0, keyId: KEY_ID_COLOR_GOLD },
    { x: 5, y: 1, keyId: KEY_ID_COLOR_TEAL },
    { x: 2, y: 2, keyId: KEY_ID_COLOR_RED },
  ]);
  out.annotations = [{
    id: 'dbj-full',
    kind: 'dbj-backing',
    anchor: { scope: 'sheet' },
    dbjStrategy: 'full',
  }];
  return out;
}

function compileOk(input: CompileChartInput) {
  const result = compileChartToKnitout(input);
  if (!result.ok || !result.program || !result.plan) {
    const errors = result.messages
      .filter(m => m.severity === 'error')
      .map(m => `[${m.rule}] ${m.message}`)
      .join('\n');
    throw new Error(`compile failed:\n${errors}`);
  }
  return result;
}

function rowSlice(ops: readonly KnitoutOp[], row: number): readonly KnitoutOp[] {
  const start = ops.findIndex(op => op.kind === 'comment' && op.text === `row ${row}`);
  expect(start).toBeGreaterThanOrEqual(0);
  const end = ops.findIndex((op, i) => i > start && op.kind === 'comment' && /^row \d+$/.test(op.text));
  return ops.slice(start, end === -1 ? ops.length : end);
}

function rowCommentCount(ops: readonly KnitoutOp[]): number {
  return ops.filter(op => op.kind === 'comment' && /^row \d+$/.test(op.text)).length;
}

function carrierOpIndex(ops: readonly KnitoutOp[]): number {
  return ops.findIndex(op => op.kind === 'knit' || op.kind === 'tuck' || op.kind === 'miss');
}

function expectProtectedFirstRow(
  result: ReturnType<typeof compileOk>,
  rows: number,
  restoreSpeed = result.plan!.settings.speedNumber,
): void {
  const row0 = rowSlice(result.program!.ops, 0);
  const firstCarrierOp = carrierOpIndex(row0);
  expect(firstCarrierOp).toBeGreaterThan(0);

  const dip = row0.findIndex(op =>
    op.kind === 'x-speed-number'
    && op.value === FAIRISLE_CARRIER_INTRO_DEFAULTS.rampSpeed,
  );
  expect(dip).toBeGreaterThan(0);
  expect(dip).toBeLessThan(firstCarrierOp);

  const restore = row0.findIndex((op, i) =>
    i > firstCarrierOp
    && op.kind === 'x-speed-number'
    && op.value === restoreSpeed,
  );
  expect(restore).toBeGreaterThan(firstCarrierOp);
  expect(rowCommentCount(result.program!.ops)).toBe(rows);
}

describe('first body row speed protection', () => {
  it('slows the first stockinette body row by default without adding rows', () => {
    const result = compileOk({
      chart: chart(3, 8),
      keyPalette: DEFAULT_KEY_PALETTE,
      yarnBindings: [STOCKINETTE_BINDING],
    });

    expect(result.plan!.technique).toBe('stockinette');
    expectProtectedFirstRow(result, 3);
  });

  it('can be explicitly disabled for parity/debug exports', () => {
    const result = compileOk({
      chart: chart(3, 8),
      keyPalette: DEFAULT_KEY_PALETTE,
      yarnBindings: [STOCKINETTE_BINDING],
      protectFirstBodyRow: false,
    });

    const row0 = rowSlice(result.program!.ops, 0);
    expect(row0.some(op =>
      op.kind === 'x-speed-number'
      && op.value === FAIRISLE_CARRIER_INTRO_DEFAULTS.rampSpeed,
    )).toBe(false);
    expect(rowCommentCount(result.program!.ops)).toBe(3);
  });

  it('also protects non-fairisle multicolor body walkers', () => {
    const result = compileOk({
      chart: chart(3, 8, [
        { x: 1, y: 0, keyId: NAVY },
        { x: 3, y: 1, keyId: NAVY },
        { x: 5, y: 2, keyId: NAVY },
      ]),
      keyPalette: TWO_COLOR_PALETTE,
      yarnBindings: TWO_COLOR_BINDINGS,
      backBedStyle: 'birdseye',
      bindOff: 'drop',
      developerMode: true,
      wastePasses: 4,
      needleOffset: 50,
    });

    expect(result.plan!.technique).toBe('birdseye-jacquard');
    expectProtectedFirstRow(result, 3);
  });

  it('protects the full-back DBJ walker and restores its recipe body speed', () => {
    const result = compileOk({
      chart: dbjFullChart(),
      keyPalette: DEFAULT_KEY_PALETTE,
      yarnBindings: DBJ_BINDINGS,
      backBedStyle: 'birdseye',
      birdseyeMode: 'full',
      bindOff: 'drop',
      developerMode: true,
      wastePasses: 4,
      needleOffset: 50,
    });

    expect(result.plan!.technique).toBe('lined-jacquard');
    expectProtectedFirstRow(result, 3, 400);
  });
});
