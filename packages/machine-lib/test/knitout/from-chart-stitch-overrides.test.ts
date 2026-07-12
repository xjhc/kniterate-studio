import { describe, expect, it } from 'vitest';
import { compileChartToKnitout } from '../../src/knitout/compile/from-chart.js';
import { writeKnitoutProgram } from '../../src/knitout/emitter.js';
import {
  DEFAULT_KEY_PALETTE,
  KEY_ID_KNIT_DEFAULT,
  KEY_ID_PURL_DEFAULT,
  KEY_ID_TUCK,
  type KnitlabChartState,
  type KnitlabKeyDefinition,
} from '../../src/colorwork/knitlab1-contract.js';
import type { StitchType, YarnBinding } from '../../src/knitout/types.js';

const CREAM: YarnBinding = { keyId: KEY_ID_KNIT_DEFAULT, carrier: '2', name: 'cream' };

function chartWithRibColumns(rows = 4, cols = 8): KnitlabChartState {
  // Alternate columns: even = knit (default), odd = purl
  const placements = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c += 2) {
      placements.push({ anchor: { x: c + 1, y: r }, keyId: KEY_ID_PURL_DEFAULT });
    }
  }
  return {
    id: 'rib',
    rows,
    cols,
    orientation: 'bottom-up',
    name: 'Rib',
    displaySettings: { rowCountVisibility: 'right', colCountVisibility: 'bottom' },
    layers: [{ id: 'base', name: 'Base', isVisible: true, grid: {}, keyPlacements: placements }],
    activeLayerId: 'base',
  };
}

const RIB_BINDINGS = new Map<string, StitchType>([
  [KEY_ID_KNIT_DEFAULT, { kind: 'knit' }],
  [KEY_ID_PURL_DEFAULT, { kind: 'purl' }],
]);

describe('compileChartToKnitout — P6 per-cell stitch overrides (stockinette mode)', () => {
  it('bind-off drops both beds so purl back-bed loops are released', () => {
    const result = compileChartToKnitout({
      chart: chartWithRibColumns(4, 6),
      keyPalette: DEFAULT_KEY_PALETTE,
      yarnBindings: [CREAM],
      stitchBindings: RIB_BINDINGS,
      needleOffset: 50,
      wastePasses: 4,
      bindOff: 'drop',
      developerMode: true,
    });
    expect(result.ok).toBe(true);
    const ops = result.program!.ops;
    const bindOffIdx = ops.findIndex(o => o.kind === 'comment' && o.text.startsWith('--- BIND OFF'));
    expect(bindOffIdx).toBeGreaterThan(-1);
    const bindOps = ops.slice(bindOffIdx);
    // Must drop both beds for every needle in [50..55]
    for (let n = 50; n <= 55; n++) {
      expect(bindOps.some(o => o.kind === 'drop' && o.needle.bed === 'f' && o.needle.needle === n)).toBe(true);
      expect(bindOps.some(o => o.kind === 'drop' && o.needle.bed === 'b' && o.needle.needle === n)).toBe(true);
    }
  });

  it('compiles a 1x1 rib chart and emits purls on the back bed', () => {
    const result = compileChartToKnitout({
      chart: chartWithRibColumns(4, 6),
      keyPalette: DEFAULT_KEY_PALETTE,
      yarnBindings: [CREAM],
      stitchBindings: RIB_BINDINGS,
      needleOffset: 50,
      wastePasses: 4,
      bindOff: 'drop',
      developerMode: true,
    });
    if (!result.ok) {
      const errs = result.messages.filter(m => m.severity === 'error').map(m => `[${m.rule}] ${m.message}`).join('\n');
      throw new Error('rib compile failed:\n' + errs);
    }
    expect(result.ok).toBe(true);
    // Pattern rows should have knit ops on b (back bed) for the odd columns.
    const ops = result.program!.ops;
    const row0Idx = ops.findIndex(o => o.kind === 'comment' && o.text === 'row 0');
    expect(row0Idx).toBeGreaterThan(-1);
    let foundBackKnit = false;
    for (let i = row0Idx; i < ops.length; i++) {
      const op = ops[i]!;
      if (op.kind === 'knit' && op.needle.bed === 'b' && op.carriers[0] === '2') {
        foundBackKnit = true;
        break;
      }
      if (op.kind === 'comment' && op.text === 'row 1') break;
    }
    expect(foundBackKnit).toBe(true);
  });

  it('derives purl overrides from KeyDefinition.op without explicit stitchBindings', () => {
    const result = compileChartToKnitout({
      chart: chartWithRibColumns(4, 6),
      keyPalette: DEFAULT_KEY_PALETTE,
      yarnBindings: [CREAM],
      needleOffset: 50,
      wastePasses: 4,
      bindOff: 'drop',
      developerMode: true,
    });
    if (!result.ok) {
      const errs = result.messages.filter(m => m.severity === 'error').map(m => `[${m.rule}] ${m.message}`).join('\n');
      throw new Error('op-derived rib compile failed:\n' + errs);
    }
    expect(result.plan?.technique).toBe('stockinette-with-overrides');
    const ops = result.program!.ops;
    const row0Idx = ops.findIndex(o => o.kind === 'comment' && o.text === 'row 0');
    expect(row0Idx).toBeGreaterThan(-1);
    const row0Ops = ops.slice(row0Idx, ops.findIndex((o, i) => i > row0Idx && o.kind === 'comment' && o.text === 'row 1'));
    expect(row0Ops.some(o => o.kind === 'knit' && o.needle.bed === 'b' && o.needle.needle === 51)).toBe(true);
  });

  it('cast-on row uses per-column bed pattern derived from row 0 stitch types', () => {
    const result = compileChartToKnitout({
      chart: chartWithRibColumns(2, 4),
      keyPalette: DEFAULT_KEY_PALETTE,
      yarnBindings: [CREAM],
      stitchBindings: RIB_BINDINGS,
      needleOffset: 50,
      wastePasses: 4,
      bindOff: 'drop',
      developerMode: true,
    });
    const ops = result.program!.ops;
    const castOnIdx = ops.findIndex(o => o.kind === 'comment' && o.text === '--- BOTH-BEDS CAST-ON ROW ---');
    expect(castOnIdx).toBeGreaterThan(-1);
    const castOnOps = ops.slice(castOnIdx + 1, ops.findIndex((o, i) => i > castOnIdx && o.kind === 'comment')).filter(o => o.kind === 'knit');
    // chart cols: 0=knit, 1=purl, 2=knit, 3=purl
    // needles: 50=knit→f, 51=purl→b, 52=knit→f, 53=purl→b
    // We knit + so order is 50,51,52,53
    expect(castOnOps).toHaveLength(4);
    const beds = (castOnOps as { needle: { bed: string; needle: number } }[]).map(o => `${o.needle.bed}${o.needle.needle}`);
    expect(beds).toEqual(['f50', 'b51', 'f52', 'b53']);
  });

  it('tuck bindings emit tuck on front bed', () => {
    const chart: KnitlabChartState = {
      id: 'tuck',
      rows: 1,
      cols: 3,
      orientation: 'bottom-up',
      name: 'Tuck',
      displaySettings: { rowCountVisibility: 'right', colCountVisibility: 'bottom' },
      layers: [{
        id: 'base', name: 'Base', isVisible: true, grid: {},
        keyPlacements: [{ anchor: { x: 1, y: 0 }, keyId: 'tuck-key' }],
      }],
      activeLayerId: 'base',
    };
    const palette: KnitlabKeyDefinition[] = [
      ...DEFAULT_KEY_PALETTE,
      { id: 'tuck-key', name: 'Tuck', width: 1, height: 1, backgroundColor: '#ff0', symbolColor: '#000', cells: [[{ type: 'text', value: 't' }]] },
    ];
    const result = compileChartToKnitout({
      chart,
      keyPalette: palette,
      yarnBindings: [CREAM],
      stitchBindings: new Map([
        [KEY_ID_KNIT_DEFAULT, { kind: 'knit' }],
        ['tuck-key', { kind: 'tuck' }],
      ]),
      needleOffset: 50,
      wastePasses: 4,
      bindOff: 'drop',
      developerMode: true,
    });
    expect(result.ok).toBe(true);
    const tuckOps = result.program!.ops.filter(o => o.kind === 'tuck');
    expect(tuckOps.length).toBeGreaterThan(0);
    expect(tuckOps.every(o => o.needle.bed === 'f')).toBe(true);
  });

  it('derives tuck overrides from KeyDefinition.op without explicit stitchBindings', () => {
    const chart: KnitlabChartState = {
      id: 'tuck-op',
      rows: 1,
      cols: 3,
      orientation: 'bottom-up',
      name: 'Tuck op',
      displaySettings: { rowCountVisibility: 'right', colCountVisibility: 'bottom' },
      layers: [{
        id: 'base', name: 'Base', isVisible: true, grid: {},
        keyPlacements: [{ anchor: { x: 1, y: 0 }, keyId: KEY_ID_TUCK }],
      }],
      activeLayerId: 'base',
    };
    const result = compileChartToKnitout({
      chart,
      keyPalette: DEFAULT_KEY_PALETTE,
      yarnBindings: [CREAM],
      needleOffset: 50,
      wastePasses: 4,
      bindOff: 'drop',
      developerMode: true,
    });
    if (!result.ok) {
      const errs = result.messages.filter(m => m.severity === 'error').map(m => `[${m.rule}] ${m.message}`).join('\n');
      throw new Error('op-derived tuck compile failed:\n' + errs);
    }
    expect(result.plan?.technique).toBe('stockinette-with-overrides');
    const tuckOps = result.program!.ops.filter(o => o.kind === 'tuck');
    expect(tuckOps.some(o => o.needle.bed === 'f' && o.needle.needle === 51)).toBe(true);
  });

  it('slip bindings emit miss on front bed', () => {
    const chart: KnitlabChartState = {
      id: 'slip',
      rows: 1,
      cols: 3,
      orientation: 'bottom-up',
      name: 'Slip',
      displaySettings: { rowCountVisibility: 'right', colCountVisibility: 'bottom' },
      layers: [{
        id: 'base', name: 'Base', isVisible: true, grid: {},
        keyPlacements: [{ anchor: { x: 1, y: 0 }, keyId: 'slip-key' }],
      }],
      activeLayerId: 'base',
    };
    const palette: KnitlabKeyDefinition[] = [
      ...DEFAULT_KEY_PALETTE,
      { id: 'slip-key', name: 'Slip', width: 1, height: 1, backgroundColor: '#ccc', symbolColor: '#000', cells: [[{ type: 'text', value: 's' }]] },
    ];
    const result = compileChartToKnitout({
      chart,
      keyPalette: palette,
      yarnBindings: [CREAM],
      stitchBindings: new Map([
        [KEY_ID_KNIT_DEFAULT, { kind: 'knit' }],
        ['slip-key', { kind: 'slip' }],
      ]),
      needleOffset: 50,
      wastePasses: 4,
      bindOff: 'drop',
      developerMode: true,
    });
    expect(result.ok).toBe(true);
    // Find pattern row miss ops on f51 (the slip cell)
    const ops = result.program!.ops;
    const row0Idx = ops.findIndex(o => o.kind === 'comment' && o.text === 'row 0');
    let foundSlipMiss = false;
    for (let i = row0Idx; i < ops.length; i++) {
      const op = ops[i]!;
      if (op.kind === 'miss' && op.needle.bed === 'f' && op.needle.needle === 51 && op.carriers[0] === '2') {
        foundSlipMiss = true;
        break;
      }
    }
    expect(foundSlipMiss).toBe(true);
  });

  it('pause bindings emit pause op once per row containing pause cells', () => {
    const chart: KnitlabChartState = {
      id: 'pause',
      rows: 2,
      cols: 3,
      orientation: 'bottom-up',
      name: 'Pause',
      displaySettings: { rowCountVisibility: 'right', colCountVisibility: 'bottom' },
      layers: [{
        id: 'base', name: 'Base', isVisible: true, grid: {},
        // Row 0 has 2 pause cells; row 1 none.
        keyPlacements: [
          { anchor: { x: 0, y: 0 }, keyId: 'pause-key' },
          { anchor: { x: 2, y: 0 }, keyId: 'pause-key' },
        ],
      }],
      activeLayerId: 'base',
    };
    const palette: KnitlabKeyDefinition[] = [
      ...DEFAULT_KEY_PALETTE,
      { id: 'pause-key', name: 'Pause', width: 1, height: 1, backgroundColor: '#fcc', symbolColor: '#000', cells: [[{ type: 'text', value: '!' }]] },
    ];
    const result = compileChartToKnitout({
      chart,
      keyPalette: palette,
      yarnBindings: [CREAM],
      stitchBindings: new Map([
        [KEY_ID_KNIT_DEFAULT, { kind: 'knit' }],
        ['pause-key', { kind: 'pause', message: 'change cone' }],
      ]),
      needleOffset: 50,
      wastePasses: 4,
      bindOff: 'drop',
      developerMode: true,
    });
    expect(result.ok).toBe(true);
    const pauseOps = result.program!.ops.filter(o => o.kind === 'pause');
    // Exactly one pause op (for row 0), regardless of how many pause cells in the row.
    expect(pauseOps.length).toBe(1);
    expect(pauseOps[0]!.kind === 'pause' && pauseOps[0]!.message).toBe('change cone');
  });

  it('drop bindings emit drop after the row knits', () => {
    const chart: KnitlabChartState = {
      id: 'drop',
      rows: 1,
      cols: 3,
      orientation: 'bottom-up',
      name: 'Drop',
      displaySettings: { rowCountVisibility: 'right', colCountVisibility: 'bottom' },
      layers: [{
        id: 'base', name: 'Base', isVisible: true, grid: {},
        keyPlacements: [{ anchor: { x: 1, y: 0 }, keyId: 'drop-key' }],
      }],
      activeLayerId: 'base',
    };
    const palette: KnitlabKeyDefinition[] = [
      ...DEFAULT_KEY_PALETTE,
      { id: 'drop-key', name: 'Drop', width: 1, height: 1, backgroundColor: '#fcc', symbolColor: '#000', cells: [[{ type: 'text', value: 'd' }]] },
    ];
    const result = compileChartToKnitout({
      chart,
      keyPalette: palette,
      yarnBindings: [CREAM],
      stitchBindings: new Map([
        [KEY_ID_KNIT_DEFAULT, { kind: 'knit' }],
        ['drop-key', { kind: 'drop' }],
      ]),
      needleOffset: 50,
      wastePasses: 4,
      bindOff: 'drop',
      developerMode: true,
    });
    expect(result.ok).toBe(true);
    // Find the row 0 marker, then look for drop op on f51 after the knits.
    const ops = result.program!.ops;
    const row0Idx = ops.findIndex(o => o.kind === 'comment' && o.text === 'row 0');
    let knitOnF51Idx = -1;
    let dropOnF51Idx = -1;
    for (let i = row0Idx; i < ops.length; i++) {
      const op = ops[i]!;
      if (op.kind === 'knit' && op.needle.bed === 'f' && op.needle.needle === 51) knitOnF51Idx = i;
      if (op.kind === 'drop' && op.needle.bed === 'f' && op.needle.needle === 51) dropOnF51Idx = i;
    }
    expect(knitOnF51Idx).toBeGreaterThan(-1);
    expect(dropOnF51Idx).toBeGreaterThan(knitOnF51Idx); // drop happens after knit
  });

  it('warns when stitch bindings are provided in a jacquard chart (overrides ignored)', () => {
    const chart: KnitlabChartState = {
      id: 'jacquard-with-overrides',
      rows: 2,
      cols: 4,
      orientation: 'bottom-up',
      name: 'Mix',
      displaySettings: { rowCountVisibility: 'right', colCountVisibility: 'bottom' },
      layers: [{
        id: 'base', name: 'Base', isVisible: true, grid: {},
        keyPlacements: [{ anchor: { x: 1, y: 0 }, keyId: 'navy' }],
      }],
      activeLayerId: 'base',
    };
    const palette: KnitlabKeyDefinition[] = [
      ...DEFAULT_KEY_PALETTE,
      { id: 'navy', name: 'Navy', width: 1, height: 1, backgroundColor: '#0a1f44', symbolColor: '#fff', cells: [[null]] },
    ];
    const result = compileChartToKnitout({
      chart,
      keyPalette: palette,
      yarnBindings: [CREAM, { keyId: 'navy', carrier: '3', name: 'navy' }],
      stitchBindings: new Map([[KEY_ID_PURL_DEFAULT, { kind: 'purl' }]]),
      needleOffset: 50,
      wastePasses: 4,
      bindOff: 'drop',
      developerMode: true,
    });
    expect(result.ok).toBe(true);
    expect(result.messages.some(m => m.rule === 'p6-overrides-jacquard-unsupported')).toBe(true);
  });

  it('rejects used op-derived overrides in jacquard charts', () => {
    const chart: KnitlabChartState = {
      id: 'jacquard-with-used-op',
      rows: 2,
      cols: 4,
      orientation: 'bottom-up',
      name: 'Mix With Purl',
      displaySettings: { rowCountVisibility: 'right', colCountVisibility: 'bottom' },
      layers: [{
        id: 'base', name: 'Base', isVisible: true, grid: {},
        keyPlacements: [
          { anchor: { x: 0, y: 0 }, keyId: KEY_ID_PURL_DEFAULT },
          { anchor: { x: 1, y: 0 }, keyId: 'navy' },
        ],
      }],
      activeLayerId: 'base',
    };
    const palette: KnitlabKeyDefinition[] = [
      ...DEFAULT_KEY_PALETTE,
      { id: 'navy', name: 'Navy', width: 1, height: 1, backgroundColor: '#0a1f44', symbolColor: '#fff', cells: [[null]] },
    ];
    const result = compileChartToKnitout({
      chart,
      keyPalette: palette,
      yarnBindings: [CREAM, { keyId: 'navy', carrier: '3', name: 'navy' }],
      needleOffset: 50,
      wastePasses: 4,
      bindOff: 'drop',
      developerMode: true,
    });
    expect(result.ok).toBe(false);
    expect(result.messages.some(m => m.rule === 'track-a-overrides-jacquard-unsupported')).toBe(true);
    expect(result.messages.some(m => m.rule === 'track-a-unbound-keys')).toBe(false);
  });
});
