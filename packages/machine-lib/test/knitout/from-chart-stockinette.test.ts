import { describe, expect, it } from 'vitest';
import { compileChartToKnitout } from '../../src/knitout/compile/from-chart.js';
import {
  DEFAULT_KEY_PALETTE,
  KEY_ID_EMPTY,
  KEY_ID_K2TOG,
  KEY_ID_KNIT_DEFAULT,
  KEY_ID_M1L,
  KEY_ID_M1LP,
  KEY_ID_M1R,
  KEY_ID_M1RP,
  KEY_ID_PURL_DEFAULT,
  KEY_ID_SSK,
  KEY_ID_TUCK,
  KEY_ID_YARN_OVER,
  type KnitlabChartState,
  type KnitlabKeyDefinition,
} from '../../src/colorwork/knitlab1-contract.js';
import { writeKnitoutProgram } from '../../src/knitout/emitter.js';
import type { YarnBinding } from '../../src/knitout/types.js';
import { emitShapedStockinetteWalk } from '../../src/knitout/passes/stockinette-shaped.js';
import { emitStockinetteWithOverridesWalk } from '../../src/knitout/passes/stockinette-with-overrides.js';
import { simulatorHandoffFromSides } from '../../src/knitout/passes/simulator-handoff.js';
import { projectionFromCells } from './_projection-from-cells.js';

function smallChart(rows = 4, cols = 10): KnitlabChartState {
  return {
    id: 'test',
    rows,
    cols,
    orientation: 'bottom-up',
    name: 'Test',
    displaySettings: { rowCountVisibility: 'right', colCountVisibility: 'bottom' },
    layers: [
      {
        id: 'base',
        name: 'Base',
        isVisible: true,
        grid: {},
        keyPlacements: [],
      },
    ],
    activeLayerId: 'base',
  };
}

const KNIT_BINDING: YarnBinding = {
  keyId: KEY_ID_KNIT_DEFAULT,
  carrier: '2',
  name: 'merino 2/12 cream',
  role: 'background',
};

describe('compileChartToKnitout — P1 stockinette', () => {
  it('compiles a minimal 4x10 stockinette chart successfully', () => {
    const result = compileChartToKnitout({
      chart: smallChart(),
      keyPalette: DEFAULT_KEY_PALETTE,
      yarnBindings: [KNIT_BINDING],
    });
    expect(result.ok).toBe(true);
    expect(result.program).toBeDefined();
    expect(result.plan?.technique).toBe('stockinette');
    expect(result.messages.filter(m => m.severity === 'error')).toEqual([]);
  });

  it('warns when supplied machine settings are inactive for the selected path', () => {
    const result = compileChartToKnitout({
      chart: smallChart(),
      keyPalette: DEFAULT_KEY_PALETTE,
      yarnBindings: [KNIT_BINDING],
      bindOffMachineConfig: { knitSpeed: 250 },
      fairisleCarrierIntro: true,
    });

    expect(result.ok).toBe(true);
    const ignored = result.messages.filter(m => m.rule === 'machine-setting-ignored');
    expect(ignored).toEqual([
      expect.objectContaining({
        message: expect.stringContaining('bindOffMachineConfig.knitSpeed supplied but not consumed'),
      }),
      expect.objectContaining({
        message: expect.stringContaining('fairisleCarrierIntro supplied but not consumed'),
      }),
    ]);
  });

  it('emits a header with required ;;Carriers: and ;;Machine: kniterate', () => {
    const result = compileChartToKnitout({
      chart: smallChart(),
      keyPalette: DEFAULT_KEY_PALETTE,
      yarnBindings: [KNIT_BINDING],
    });
    const text = writeKnitoutProgram(result.program!);
    expect(text).toContain(';;Carriers: 1 2 3 4 5 6');
    expect(text).toContain(';;Machine: kniterate');
    expect(text).toContain(';;Yarn-2: merino 2/12 cream');
  });

  it('emits carrier spacing as a machine-effective op, not only a diagnostic header', () => {
    const result = compileChartToKnitout({
      chart: smallChart(),
      keyPalette: DEFAULT_KEY_PALETTE,
      yarnBindings: [KNIT_BINDING],
      kniterate: {
        carrierSpacing: 4,
        carrierStoppingDistance: 5.5,
      },
    });

    expect(result.ok).toBe(true);
    const text = writeKnitoutProgram(result.program!);
    expect(text).toContain(';;X-carrier-spacing: 4');
    expect(text).toContain('\nx-carrier-spacing 4\n');
    expect(text).toContain(';;X-carrier-stopping-distance: 5.5');
    expect(text).toContain('\nx-carrier-stopping-distance 5.5\n');
  });

  it('centers the chart on the 252-needle bed by default', () => {
    const result = compileChartToKnitout({
      chart: smallChart(4, 10),
      keyPalette: DEFAULT_KEY_PALETTE,
      yarnBindings: [KNIT_BINDING],
    });
    const text = writeKnitoutProgram(result.program!);
    // 10-stitch chart on 252-needle bed → start needle = floor((252-10)/2)+1 = 122
    expect(text).toMatch(/knit \+ f122 2/);
    expect(text).toMatch(/knit \+ f131 2/);
    expect(text).not.toMatch(/knit \+ f121 2/);
    expect(text).not.toMatch(/knit \+ f132 2/);
  });

  it('honors an explicit needleOffset', () => {
    const result = compileChartToKnitout({
      chart: smallChart(4, 10),
      keyPalette: DEFAULT_KEY_PALETTE,
      yarnBindings: [KNIT_BINDING],
      needleOffset: 50,
    });
    const text = writeKnitoutProgram(result.program!);
    expect(text).toMatch(/knit \+ f50 2/);
    expect(text).toMatch(/knit \+ f59 2/);
  });

  it('alternates direction on each pattern row', () => {
    const result = compileChartToKnitout({
      chart: smallChart(4, 10),
      keyPalette: DEFAULT_KEY_PALETTE,
      yarnBindings: [KNIT_BINDING],
      needleOffset: 50,
    });
    const ops = result.program!.ops;
    // Find pattern row ops by their preceding "row N" comment.
    const rowComments = ops
      .map((op, i) => ({ op, i }))
      .filter(({ op }) => op.kind === 'comment' && /^row \d+$/.test(op.text));
    expect(rowComments.length).toBe(4);

    // The op right after each row N comment should be a knit; check direction alternation.
    const firstKnitDirections = rowComments.map(({ i }) => {
      for (let k = i + 1; k < ops.length; k++) {
        const op = ops[k]!;
        if (op.kind === 'knit') return op.direction;
      }
      return null;
    });
    expect(firstKnitDirections[0]).toBe(firstKnitDirections[2]);
    expect(firstKnitDirections[1]).toBe(firstKnitDirections[3]);
    expect(firstKnitDirections[0]).not.toBe(firstKnitDirections[1]);
  });

  it('rejects unsupported no-stitch shape without matching decreases', () => {
    const chart = smallChart();
    chart.layers![0]!.keyPlacements.push({ anchor: { x: 0, y: 0 }, keyId: KEY_ID_EMPTY });
    const result = compileChartToKnitout({
      chart,
      keyPalette: DEFAULT_KEY_PALETTE,
      yarnBindings: [KNIT_BINDING],
    });
    expect(result.ok).toBe(false);
    expect(result.messages.some(m => m.rule === 'chart-continuity-row-width-mismatch')).toBe(true);
  });

  it('compiles a balanced yarn-over (YO + paired k2tog same row, net delta 0)', () => {
    // Eyelet pattern: row N has a YO at col C and a k2tog at col C-1, so
    // the row's net delta is 0 and the YO needle was the source the dec
    // gave up. Validates that YO + paired dec lowers cleanly via the
    // stitch-override walker.
    const chart = smallChart(4, 30);
    // Place YO at (col=2, row=1), with a k2tog at (col=1, row=1) — the
    // k2tog consumes the col=2 stitch from row 0 + col=1 stitch from
    // row 0, leaving col=2 inactive after the dec. The YO at col=2 then
    // re-activates col=2 with a fresh wrap, net delta 0.
    chart.layers![0]!.keyPlacements.push(
      { anchor: { x: 1, y: 1 }, keyId: KEY_ID_K2TOG },
      { anchor: { x: 2, y: 1 }, keyId: KEY_ID_YARN_OVER },
    );
    const result = compileChartToKnitout({
      chart,
      keyPalette: DEFAULT_KEY_PALETTE,
      yarnBindings: [KNIT_BINDING],
    });
    expect(result.ok).toBe(true);
    expect(result.messages.some(m => m.rule === 'track-a-unsupported-op')).toBe(false);
    expect(result.messages.some(m => m.rule === 'track-a-unbound-keys')).toBe(false);
    // The shape walker routes balanced YO+k2tog through the shaped
    // technique; the k2tog transfer dance frees the YO needle, then the
    // result-row knit deposits a fresh loop there.
    expect(result.plan?.technique).toBe('stockinette-shaped');
    const ops = result.program!.ops;
    // The k2tog @ col 1 produces an xfer + rack(-1) + xfer-back sequence
    // before the row's knit pass: that's the merge-toward-left choreography
    // that the new balanced-YO path emits.
    const hasMergeTowardLeft = ops.some((op, i) =>
      op.kind === 'rack' && op.offset === -1 &&
      i > 0 && ops[i - 1]?.kind === 'xfer' &&
      i + 1 < ops.length && ops[i + 1]?.kind === 'xfer',
    );
    expect(hasMergeTowardLeft).toBe(true);
  });

  it('accepts yarn-over without requiring a separate yarn binding', () => {
    const chart = smallChart(4, 30);
    chart.layers![0]!.keyPlacements.push(
      { anchor: { x: 1, y: 1 }, keyId: KEY_ID_K2TOG },
      { anchor: { x: 2, y: 1 }, keyId: KEY_ID_YARN_OVER },
    );
    const result = compileChartToKnitout({
      chart,
      keyPalette: DEFAULT_KEY_PALETTE,
      yarnBindings: [KNIT_BINDING],
    });
    expect(result.ok).toBe(true);
    expect(result.messages.some(m => m.rule === 'track-a-unbound-keys')).toBe(false);
  });

  it('lowers yarn-over via the stitch-override walker as knit + comment in rectangular mode', () => {
    // Rectangular chart with no-stitch in the previous row at the YO
    // column: width grows by 1 (no balancing dec). Routes through
    // stockinette-shaped because no-stitch triggers shape mode, but if
    // we only place YO without no-stitch, the rectangular path doesn't
    // apply. So here we verify the comment + knit pattern via direct
    // emitStockinetteWithOverridesWalk usage.
    const result = emitStockinetteWithOverridesWalk({
      projection: projectionFromCells([
        [KEY_ID_KNIT_DEFAULT, KEY_ID_YARN_OVER, KEY_ID_KNIT_DEFAULT, KEY_ID_KNIT_DEFAULT],
        [KEY_ID_KNIT_DEFAULT, KEY_ID_KNIT_DEFAULT, KEY_ID_KNIT_DEFAULT, KEY_ID_KNIT_DEFAULT],
      ], DEFAULT_KEY_PALETTE),
      carrier: '2',
      needleStart: 50,
      handoff: simulatorHandoffFromSides({ '2': 'left' }),
      stitchTypeForKey: new Map([[KEY_ID_YARN_OVER, { kind: 'yarn-over' }]]),
    });
    const hasYarnOverComment = result.ops.some(op => op.kind === 'comment' && /yarn-over @ f51/.test(op.text));
    expect(hasYarnOverComment).toBe(true);
    const knitOpsAtYO = result.ops.filter(op => op.kind === 'knit' && op.needle.bed === 'f' && op.needle.needle === 51);
    expect(knitOpsAtYO.length).toBeGreaterThan(0);
  });

  it('lowers a chart short-row-turn annotation as a wrap-and-turn partial pass', () => {
    // Bottom-up shape chart that narrows by 1 stitch on authored row 2
    // (= walker row 1, since rows are reversed for bottom-up). The
    // short-row-turn annotation sits on authored row 1 (= walker row 2)
    // where the panel is at the narrowed width.
    // Canonical 2-wide SSK at anchor x=0 places: tile col 0 (= ns source)
    // at col 0, tile col 1 (= ssk svg) at col 1. No separate EMPTY at the
    // source col is needed — the atomic tile already masks it.
    const chart = smallChart(4, 30);
    chart.layers![0]!.keyPlacements.push(
      { anchor: { x: 0, y: 2 }, keyId: KEY_ID_SSK },
      { anchor: { x: 0, y: 1 }, keyId: KEY_ID_EMPTY },
      { anchor: { x: 0, y: 0 }, keyId: KEY_ID_EMPTY },
    );
    chart.annotations = [
      {
        id: 'sr-1',
        kind: 'short-row-turn',
        anchor: { scope: 'cell', row: 1, col: 20 },
        direction: 'left',
        stitches: 5,
        turnMethod: 'wrap-and-turn',
      },
    ];
    const result = compileChartToKnitout({
      chart,
      keyPalette: DEFAULT_KEY_PALETTE,
      yarnBindings: [KNIT_BINDING],
    });
    expect(result.ok).toBe(true);
    const text = writeKnitoutProgram(result.program!);
    expect(text).toMatch(/short-row turn \(wrap\) \(left\)/);
    // The wrap-and-turn dance emits a `tuck` op on the wrap needle; check
    // the program has at least one tuck attributable to the short-row.
    const tuckOps = result.program!.ops.filter(op => op.kind === 'tuck');
    expect(tuckOps.length).toBeGreaterThan(0);
  });

  it('lowers M1Lp/M1Rp through the shaped increase walker', () => {
    const chart = smallChart(2, 30);
    chart.layers![0]!.keyPlacements.push(
      { anchor: { x: 0, y: 1 }, keyId: KEY_ID_EMPTY },
      { anchor: { x: 29, y: 1 }, keyId: KEY_ID_EMPTY },
      { anchor: { x: 0, y: 0 }, keyId: KEY_ID_M1LP },
      { anchor: { x: 29, y: 0 }, keyId: KEY_ID_M1RP },
    );

    const result = compileChartToKnitout({
      chart,
      keyPalette: DEFAULT_KEY_PALETTE,
      yarnBindings: [KNIT_BINDING],
    });

    expect(result.ok).toBe(true);
    const text = writeKnitoutProgram(result.program!);
    expect(text).toContain('chart split inc');
  });

  it('flags german short-row turns as preview-grade', () => {
    const chart = smallChart(4, 30);
    chart.layers![0]!.keyPlacements.push(
      { anchor: { x: 0, y: 2 }, keyId: KEY_ID_EMPTY },
      { anchor: { x: 1, y: 2 }, keyId: KEY_ID_K2TOG },
      { anchor: { x: 0, y: 1 }, keyId: KEY_ID_EMPTY },
      { anchor: { x: 0, y: 0 }, keyId: KEY_ID_EMPTY },
    );
    chart.annotations = [
      {
        id: 'sr-german',
        kind: 'short-row-turn',
        anchor: { scope: 'cell', row: 1, col: 20 },
        direction: 'left',
        stitches: 5,
        turnMethod: 'german',
      },
    ];
    const result = compileChartToKnitout({
      chart,
      keyPalette: DEFAULT_KEY_PALETTE,
      yarnBindings: [KNIT_BINDING],
    });
    expect(result.messages.some(m => m.rule === 'track-a-short-row-german-preview')).toBe(true);
  });

  it('rejects unknown semantic ops instead of defaulting them during export', () => {
    const futureKey = {
      id: 'key_future_cable',
      name: 'Future Cable',
      width: 1,
      height: 1,
      backgroundColor: '#ffffff',
      symbolColor: '#111111',
      cells: [[{ type: 'text', value: 'C' }]],
      op: 'cable-2x2',
    } as unknown as KnitlabKeyDefinition;
    const chart = smallChart();
    chart.layers![0]!.keyPlacements.push({ anchor: { x: 0, y: 0 }, keyId: futureKey.id });
    const result = compileChartToKnitout({
      chart,
      keyPalette: [...DEFAULT_KEY_PALETTE, futureKey],
      yarnBindings: [KNIT_BINDING],
    });
    expect(result.ok).toBe(false);
    expect(result.messages.some(m => m.rule === 'track-a-unknown-op')).toBe(true);
    expect(result.messages.some(m => m.rule === 'track-a-unbound-keys')).toBe(false);
  });

  it('rejects decrease primitives on the first row because no source row exists', () => {
    const chart = smallChart();
    chart.layers![0]!.keyPlacements.push({ anchor: { x: 0, y: chart.rows - 1 }, keyId: KEY_ID_K2TOG });
    const result = compileChartToKnitout({
      chart,
      keyPalette: DEFAULT_KEY_PALETTE,
      yarnBindings: [KNIT_BINDING],
    });
    expect(result.ok).toBe(false);
    expect(result.messages.some(m => m.rule === 'chart-continuity-initial-shape')).toBe(true);
    expect(result.messages.some(m => m.rule === 'track-a-unbound-keys')).toBe(false);
  });

  it('lowers a left-edge M1 widening chart and casts on only the first active row', () => {
    const chart = smallChart(2, 5);
    chart.layers![0]!.keyPlacements.push(
      { anchor: { x: 0, y: 1 }, keyId: KEY_ID_EMPTY },
      { anchor: { x: 0, y: 0 }, keyId: KEY_ID_M1L },
    );
    const result = compileChartToKnitout({
      chart,
      keyPalette: DEFAULT_KEY_PALETTE,
      yarnBindings: [KNIT_BINDING],
      needleOffset: 50,
      wastePasses: 4,
      bindOff: 'drop',
      developerMode: true,
    });
    if (!result.ok) {
      const errs = result.messages.filter(m => m.severity === 'error').map(m => `[${m.rule}] ${m.message}`).join('\n');
      throw new Error('left-edge M1 compile failed:\n' + errs);
    }
    expect(result.plan?.technique).toBe('stockinette-shaped');
    expect(result.plan?.waste.needleStart).toBe(51);
    expect(result.plan?.waste.needleEnd).toBe(54);
    expect(result.messages.some(m => m.rule === 'track-a-shape-op-unsupported')).toBe(false);
    expect(result.messages.some(m => m.rule === 'chart-continuity-row-width-mismatch')).toBe(false);
    expect(result.messages.some(m => m.rule === 'track-a-unbound-keys')).toBe(false);

    const ops = result.program!.ops;
    const row1Idx = ops.findIndex(o => o.kind === 'comment' && o.text === 'row 1');
    const row1Ops = ops.slice(row1Idx, ops.findIndex((o, i) => i > row1Idx && o.kind === 'comment' && o.text === 'row 2'));
    expect(row1Ops.some(o => o.kind === 'split' && o.from.bed === 'f' && o.from.needle === 51 && o.to.bed === 'b' && o.to.needle === 51)).toBe(true);
    expect(row1Ops.some(o => o.kind === 'xfer' && o.from.bed === 'b' && o.from.needle === 51 && o.to.bed === 'f' && o.to.needle === 50)).toBe(true);
    expect(row1Ops.some(o => o.kind === 'knit' && o.needle.bed === 'f' && o.needle.needle === 50)).toBe(true);
  });

  it('lowers paired edge M1 increases with split transfers toward new edge columns', () => {
    const chart = smallChart(2, 6);
    chart.layers![0]!.keyPlacements.push(
      { anchor: { x: 0, y: 1 }, keyId: KEY_ID_EMPTY },
      { anchor: { x: 5, y: 1 }, keyId: KEY_ID_EMPTY },
      { anchor: { x: 0, y: 0 }, keyId: KEY_ID_M1L },
      { anchor: { x: 5, y: 0 }, keyId: KEY_ID_M1R },
    );

    const result = compileChartToKnitout({
      chart,
      keyPalette: DEFAULT_KEY_PALETTE,
      yarnBindings: [KNIT_BINDING],
      needleOffset: 50,
      wastePasses: 4,
      bindOff: 'drop',
      developerMode: true,
    });

    if (!result.ok) {
      const errs = result.messages.filter(m => m.severity === 'error').map(m => `[${m.rule}] ${m.message}`).join('\n');
      throw new Error('paired-edge M1 compile failed:\n' + errs);
    }

    const ops = result.program!.ops;
    const row1Idx = ops.findIndex(o => o.kind === 'comment' && o.text === 'row 1');
    const row1Ops = ops.slice(row1Idx, ops.findIndex((o, i) => i > row1Idx && o.kind === 'comment' && o.text === 'row 2'));
    expect(row1Ops.some(o => o.kind === 'split' && o.from.bed === 'f' && o.from.needle === 51 && o.to.bed === 'b' && o.to.needle === 51)).toBe(true);
    expect(row1Ops.some(o => o.kind === 'xfer' && o.from.bed === 'b' && o.from.needle === 51 && o.to.bed === 'f' && o.to.needle === 50)).toBe(true);
    expect(row1Ops.some(o => o.kind === 'split' && o.from.bed === 'f' && o.from.needle === 54 && o.to.bed === 'b' && o.to.needle === 54)).toBe(true);
    expect(row1Ops.some(o => o.kind === 'xfer' && o.from.bed === 'b' && o.from.needle === 54 && o.to.bed === 'f' && o.to.needle === 55)).toBe(true);
  });

  it('lowers a generated-style left-edge bind-off span before the result-row knit pass', () => {
    const chart = smallChart(2, 8);
    chart.layers![0]!.keyPlacements.push(
      { anchor: { x: 0, y: 0 }, keyId: KEY_ID_EMPTY },
      { anchor: { x: 1, y: 0 }, keyId: KEY_ID_EMPTY },
    );
    chart.annotations = [
      {
        id: 'ann_left_bo',
        kind: 'bind-off-span',
        source: 'generated',
        locked: true,
        anchor: { scope: 'edge', row: 0, side: 'left', start: 0, end: 2 },
      },
    ];

    const result = compileChartToKnitout({
      chart,
      keyPalette: DEFAULT_KEY_PALETTE,
      yarnBindings: [KNIT_BINDING],
      needleOffset: 50,
      wastePasses: 4,
      bindOff: 'drop',
      developerMode: true,
    });

    if (!result.ok) {
      const errs = result.messages.filter(m => m.severity === 'error').map(m => `[${m.rule}] ${m.message}`).join('\n');
      throw new Error('left-edge bind-off span compile failed:\n' + errs);
    }
    expect(result.plan?.technique).toBe('stockinette-shaped');

    const ops = result.program!.ops;
    const row1Idx = ops.findIndex(o => o.kind === 'comment' && o.text === 'row 1');
    const row1Ops = ops.slice(row1Idx, ops.findIndex((o, i) => i > row1Idx && o.kind === 'comment' && o.text === 'row 2'));
    expect(row1Ops.some(o => o.kind === 'comment' && /chart bind-off left/.test(o.text))).toBe(true);
    expect(row1Ops.some(o => o.kind === 'xfer' && o.from.bed === 'f' && o.from.needle === 50 && o.to.bed === 'b' && o.to.needle === 50)).toBe(true);
    expect(row1Ops.some(o => o.kind === 'xfer' && o.from.bed === 'b' && o.from.needle === 51 && o.to.bed === 'f' && o.to.needle === 52)).toBe(true);
    expect(row1Ops.some(o => o.kind === 'knit' && o.needle.bed === 'f' && o.needle.needle === 52)).toBe(true);
  });

  it('lowers a generated-style right-edge bind-off span toward the surviving active edge', () => {
    const chart = smallChart(2, 8);
    chart.layers![0]!.keyPlacements.push(
      { anchor: { x: 6, y: 0 }, keyId: KEY_ID_EMPTY },
      { anchor: { x: 7, y: 0 }, keyId: KEY_ID_EMPTY },
    );
    chart.annotations = [
      {
        id: 'ann_right_bo',
        kind: 'bind-off-span',
        source: 'generated',
        locked: true,
        anchor: { scope: 'edge', row: 0, side: 'right', start: 6, end: 8 },
      },
    ];

    const result = compileChartToKnitout({
      chart,
      keyPalette: DEFAULT_KEY_PALETTE,
      yarnBindings: [KNIT_BINDING],
      needleOffset: 50,
      wastePasses: 4,
      bindOff: 'drop',
      developerMode: true,
    });

    if (!result.ok) {
      const errs = result.messages.filter(m => m.severity === 'error').map(m => `[${m.rule}] ${m.message}`).join('\n');
      throw new Error('right-edge bind-off span compile failed:\n' + errs);
    }

    const ops = result.program!.ops;
    const row1Idx = ops.findIndex(o => o.kind === 'comment' && o.text === 'row 1');
    const row1Ops = ops.slice(row1Idx, ops.findIndex((o, i) => i > row1Idx && o.kind === 'comment' && o.text === 'row 2'));
    expect(row1Ops.some(o => o.kind === 'comment' && /chart bind-off right/.test(o.text))).toBe(true);
    expect(row1Ops.some(o => o.kind === 'xfer' && o.from.bed === 'f' && o.from.needle === 57 && o.to.bed === 'b' && o.to.needle === 57)).toBe(true);
    expect(row1Ops.some(o => o.kind === 'xfer' && o.from.bed === 'b' && o.from.needle === 56 && o.to.bed === 'f' && o.to.needle === 55)).toBe(true);
    expect(row1Ops.some(o => o.kind === 'knit' && o.needle.bed === 'f' && o.needle.needle === 55)).toBe(true);
  });

  it('lowers a generated-style center bind-off span and knits the two shoulders as single-cut blocks', () => {
    const chart = smallChart(2, 8);
    chart.layers![0]!.keyPlacements.push(
      { anchor: { x: 3, y: 0 }, keyId: KEY_ID_EMPTY },
      { anchor: { x: 4, y: 0 }, keyId: KEY_ID_EMPTY },
    );
    chart.annotations = [
      {
        id: 'ann_center_bo',
        kind: 'bind-off-span',
        source: 'generated',
        locked: true,
        locationKind: 'center-front',
        anchor: { scope: 'edge', row: 0, side: 'top', start: 3, end: 5 },
      },
    ];

    const result = compileChartToKnitout({
      chart,
      keyPalette: DEFAULT_KEY_PALETTE,
      yarnBindings: [KNIT_BINDING],
      needleOffset: 50,
      wastePasses: 4,
      bindOff: 'drop',
      developerMode: true,
    });

    if (!result.ok) {
      const errs = result.messages.filter(m => m.severity === 'error').map(m => `[${m.rule}] ${m.message}`).join('\n');
      throw new Error('center bind-off span compile failed:\n' + errs);
    }

    expect(result.plan?.technique).toBe('stockinette-shaped');
    expect(result.messages.filter(m => m.severity === 'error')).toEqual([]);
    expect(result.messages.some(m => m.rule === 'chart-continuity-split-active-row')).toBe(true);

    // Block scheduling (2026-05-29): the centre bind-off opens the neck once,
    // then each shoulder is knit as its own carrier segment with a SINGLE cut
    // between them — not a cut/rejoin on every split row.
    const ops = result.program!.ops;
    expect(ops.some(o => o.kind === 'comment' && /chart bind-off center/.test(o.text))).toBe(true);
    expect(ops.some(o => o.kind === 'xfer' && o.from.bed === 'f' && o.from.needle === 53 && o.to.bed === 'b' && o.to.needle === 53)).toBe(true);
    expect(ops.some(o => o.kind === 'xfer' && o.from.bed === 'b' && o.from.needle === 54 && o.to.bed === 'f' && o.to.needle === 55)).toBe(true);

    const blockStart = ops.findIndex(o => o.kind === 'comment' && /knit left shoulder block/.test(o.text));
    expect(blockStart).toBeGreaterThanOrEqual(0);
    const blockOps = ops.slice(blockStart);
    // exactly one carrier cut for the whole neck (the entire point of the fix)
    expect(blockOps.filter(o => o.kind === 'comment' && /cut carrier C2 once before right shoulder/.test(o.text))).toHaveLength(1);
    expect(blockOps.filter(o => o.kind === 'comment' && /rejoin carrier C2 for right shoulder/.test(o.text))).toHaveLength(1);
    expect(blockOps.some(o => o.kind === 'out' && o.carriers.includes('2'))).toBe(true);
    // no per-row split cut/rejoin remnants anywhere
    expect(ops.some(o => o.kind === 'comment' && /before next shoulder segment/.test(o.text))).toBe(false);
    // both shoulders knit; no float / miss across the bound-off gap (53,54)
    expect(blockOps.some(o => o.kind === 'knit' && o.needle.bed === 'f' && o.needle.needle === 52)).toBe(true);
    expect(blockOps.filter(o => o.kind === 'knit' && o.needle.bed === 'f' && o.needle.needle === 55)).toHaveLength(1);
    expect(blockOps.some(o => o.kind === 'knit' && o.needle.bed === 'f' && o.needle.needle === 56)).toBe(true);
    expect(blockOps.some(o => o.kind === 'miss' && o.needle.bed === 'f' && (o.needle.needle === 53 || o.needle.needle === 54))).toBe(false);
  });

  it('schedules realistic split-neck gaps without long carrier floats', () => {
    const chart = smallChart(2, 40);
    for (let x = 14; x < 26; x++) {
      chart.layers![0]!.keyPlacements.push({ anchor: { x, y: 0 }, keyId: KEY_ID_EMPTY });
    }
    chart.annotations = [
      {
        id: 'ann_realistic_center_bo',
        kind: 'bind-off-span',
        source: 'generated',
        locked: true,
        locationKind: 'center-front',
        anchor: { scope: 'edge', row: 0, side: 'top', start: 14, end: 26 },
      },
    ];

    const result = compileChartToKnitout({
      chart,
      keyPalette: DEFAULT_KEY_PALETTE,
      yarnBindings: [KNIT_BINDING],
      needleOffset: 50,
      wastePasses: 4,
      bindOff: 'drop',
      developerMode: true,
    });

    if (!result.ok) {
      const errs = result.messages.filter(m => m.severity === 'error').map(m => `[${m.rule}] ${m.message}`).join('\n');
      throw new Error('realistic split-neck compile failed:\n' + errs);
    }

    expect(result.messages.some(m => m.rule === 'bed-state-long-float')).toBe(false);
    expect(result.messages.some(m => m.rule === 'chart-continuity-split-active-row')).toBe(true);

    // Each shoulder is knit as its own block, so the wide neck gap is never
    // floated across — and the carrier is cut exactly once for the whole neck.
    const ops = result.program!.ops;
    const gapMisses = ops.filter(o => o.kind === 'miss' && o.needle.bed === 'f' && o.needle.needle >= 64 && o.needle.needle < 76);
    expect(gapMisses).toHaveLength(0);
    const blockStart = ops.findIndex(o => o.kind === 'comment' && /knit left shoulder block/.test(o.text));
    expect(blockStart).toBeGreaterThanOrEqual(0);
    const blockOps = ops.slice(blockStart);
    expect(blockOps.filter(o => o.kind === 'comment' && /cut carrier C2 once before right shoulder/.test(o.text))).toHaveLength(1);
    expect(blockOps.some(o => o.kind === 'out' && o.carriers.includes('2'))).toBe(true);
    expect(blockOps.some(o => o.kind === 'in' && o.carriers.includes('2'))).toBe(true);
    expect(ops.some(o => o.kind === 'comment' && /before next shoulder segment/.test(o.text))).toBe(false);
  });

  it('lowers an edge-decrease shaped stockinette chart', () => {
    // Canonical 2-wide SSK tile = [ns source, svg]. For a left-edge dec
    // each row's SSK anchor sits at the new outer column; the tile's
    // own ns slot covers the disappearing source so no separate EMPTY
    // belongs adjacent to the SSK.
    const chart = smallChart(5, 8);
    chart.name = 'Left edge shaped panel';
    chart.layers![0]!.keyPlacements.push(
      { anchor: { x: 0, y: 3 }, keyId: KEY_ID_SSK },
      { anchor: { x: 0, y: 2 }, keyId: KEY_ID_EMPTY },
      { anchor: { x: 1, y: 2 }, keyId: KEY_ID_SSK },
      { anchor: { x: 0, y: 1 }, keyId: KEY_ID_EMPTY },
      { anchor: { x: 1, y: 1 }, keyId: KEY_ID_EMPTY },
      { anchor: { x: 2, y: 1 }, keyId: KEY_ID_SSK },
      { anchor: { x: 0, y: 0 }, keyId: KEY_ID_EMPTY },
      { anchor: { x: 1, y: 0 }, keyId: KEY_ID_EMPTY },
      { anchor: { x: 2, y: 0 }, keyId: KEY_ID_EMPTY },
      { anchor: { x: 3, y: 0 }, keyId: KEY_ID_SSK },
    );

    const result = compileChartToKnitout({
      chart,
      keyPalette: DEFAULT_KEY_PALETTE,
      yarnBindings: [KNIT_BINDING],
      needleOffset: 50,
      wastePasses: 4,
      bindOff: 'drop',
      developerMode: true,
    });

    if (!result.ok) {
      const errs = result.messages.filter(m => m.severity === 'error').map(m => `[${m.rule}] ${m.message}`).join('\n');
      throw new Error('shaped stockinette compile failed:\n' + errs);
    }
    expect(result.plan?.technique).toBe('stockinette-shaped');
    expect(result.messages.some(m => m.rule === 'track-a-shape-op-unsupported')).toBe(false);
    expect(result.messages.some(m => m.rule === 'track-a-no-no-stitch')).toBe(false);

    const ops = result.program!.ops;
    const row0Idx = ops.findIndex(o => o.kind === 'comment' && o.text === 'row 0');
    const row0Ops = ops.slice(row0Idx, ops.findIndex((o, i) => i > row0Idx && o.kind === 'comment' && o.text === 'row 1'));
    const row1Idx = ops.findIndex(o => o.kind === 'comment' && o.text === 'row 1');
    const row1Ops = ops.slice(row1Idx, ops.findIndex((o, i) => i > row1Idx && o.kind === 'comment' && o.text === 'row 2'));
    expect(row0Ops.some(o => o.kind === 'xfer')).toBe(false);
    expect(row1Ops.some(o => o.kind === 'xfer' && o.from.bed === 'f' && o.from.needle === 50 && o.to.bed === 'b' && o.to.needle === 50)).toBe(true);
    expect(row1Ops.some(o => o.kind === 'xfer' && o.from.bed === 'b' && o.from.needle === 50 && o.to.bed === 'f' && o.to.needle === 51)).toBe(true);
    expect(row1Ops.some(o => o.kind === 'knit' && o.needle.bed === 'f' && o.needle.needle === 50)).toBe(false);
    expect(row1Ops.some(o => o.kind === 'knit' && o.needle.bed === 'f' && o.needle.needle === 51)).toBe(true);
  });

  it('compiles a canonical fashioned k2tog end-to-end (canonical tile + extra wedge)', () => {
    // Phase 1c follow-up (2026-05-24): a canonical 2-wide K2TOG tile at
    // chart-display row 0 (= walker row 1) col 7 owns cols 7 (svg) + 8
    // (source NS). An EXTRA EMPTY at col 9 is the fashioning wedge — the
    // walker shifts that stitch inward by one needle and stacks the
    // merged source onto the target. End-to-end this exercises the chart
    // continuity validator's wedge-aware row-width check AND the walker's
    // canonical fashioning dance.
    const chart = smallChart(2, 10);
    chart.name = 'Fashioned right-edge k2tog';
    chart.layers![0]!.keyPlacements.push(
      { anchor: { x: 7, y: 0 }, keyId: KEY_ID_K2TOG },
      { anchor: { x: 9, y: 0 }, keyId: KEY_ID_EMPTY },
    );

    const result = compileChartToKnitout({
      chart,
      keyPalette: DEFAULT_KEY_PALETTE,
      yarnBindings: [KNIT_BINDING],
      needleOffset: 50,
      wastePasses: 4,
      bindOff: 'drop',
      developerMode: true,
    });

    if (!result.ok) {
      const errs = result.messages.filter(m => m.severity === 'error').map(m => `[${m.rule}] ${m.message}`).join('\n');
      throw new Error('canonical fashioned k2tog compile failed:\n' + errs);
    }
    expect(result.plan?.technique).toBe('stockinette-shaped');
    expect(result.messages.some(m => m.rule === 'chart-continuity-row-width-mismatch')).toBe(false);
    expect(result.messages.some(m => m.rule === 'chart-continuity-deactivated-without-decrease')).toBe(false);

    const ops = result.program!.ops;
    const row1Idx = ops.findIndex(o => o.kind === 'comment' && o.text === 'row 1');
    const row1End = ops.findIndex((o, i) => i > row1Idx && o.kind === 'comment' && o.text === 'row 2');
    const row1Ops = ops.slice(row1Idx, row1End === -1 ? undefined : row1End);
    // Target needle = 50 + 7 = 57. Wedge depth 1 fashioning dance shifts
    // cols 8 + 9 inward: xfer f58 → b58, f59 → b59, rack -1,
    // xfer b58 → f57 (k2tog stack), xfer b59 → f58, rack 0.
    expect(row1Ops.some(o => o.kind === 'xfer' && o.from.bed === 'f' && o.from.needle === 58 && o.to.bed === 'b' && o.to.needle === 58)).toBe(true);
    expect(row1Ops.some(o => o.kind === 'xfer' && o.from.bed === 'f' && o.from.needle === 59 && o.to.bed === 'b' && o.to.needle === 59)).toBe(true);
    expect(row1Ops.some(o => o.kind === 'xfer' && o.from.bed === 'b' && o.from.needle === 58 && o.to.bed === 'f' && o.to.needle === 57)).toBe(true);
    expect(row1Ops.some(o => o.kind === 'xfer' && o.from.bed === 'b' && o.from.needle === 59 && o.to.bed === 'f' && o.to.needle === 58)).toBe(true);
  });

  it('compiles a canonical fashioned ssk end-to-end (canonical tile + extra wedge on the left)', () => {
    // Mirror: canonical 2-wide SSK tile at chart-display row 0 col 1 owns
    // cols 1 (source NS) + 2 (svg). EXTRA EMPTY at col 0 is the wedge.
    const chart = smallChart(2, 10);
    chart.name = 'Fashioned left-edge ssk';
    chart.layers![0]!.keyPlacements.push(
      { anchor: { x: 0, y: 0 }, keyId: KEY_ID_EMPTY },
      { anchor: { x: 1, y: 0 }, keyId: KEY_ID_SSK },
    );

    const result = compileChartToKnitout({
      chart,
      keyPalette: DEFAULT_KEY_PALETTE,
      yarnBindings: [KNIT_BINDING],
      needleOffset: 50,
      wastePasses: 4,
      bindOff: 'drop',
      developerMode: true,
    });

    if (!result.ok) {
      const errs = result.messages.filter(m => m.severity === 'error').map(m => `[${m.rule}] ${m.message}`).join('\n');
      throw new Error('canonical fashioned ssk compile failed:\n' + errs);
    }
    expect(result.plan?.technique).toBe('stockinette-shaped');
    expect(result.messages.some(m => m.rule === 'chart-continuity-row-width-mismatch')).toBe(false);
    expect(result.messages.some(m => m.rule === 'chart-continuity-deactivated-without-decrease')).toBe(false);

    const ops = result.program!.ops;
    const row1Idx = ops.findIndex(o => o.kind === 'comment' && o.text === 'row 1');
    const row1End = ops.findIndex((o, i) => i > row1Idx && o.kind === 'comment' && o.text === 'row 2');
    const row1Ops = ops.slice(row1Idx, row1End === -1 ? undefined : row1End);
    // Target needle for ssk svg at col 2: 50 + 2 = 52. Mirrored dance
    // shifts cols 1 + 0 inward: xfer f51 → b51, f50 → b50, rack +1,
    // xfer b51 → f52 (ssk stack), xfer b50 → f51, rack 0.
    expect(row1Ops.some(o => o.kind === 'xfer' && o.from.bed === 'f' && o.from.needle === 51 && o.to.bed === 'b' && o.to.needle === 51)).toBe(true);
    expect(row1Ops.some(o => o.kind === 'xfer' && o.from.bed === 'f' && o.from.needle === 50 && o.to.bed === 'b' && o.to.needle === 50)).toBe(true);
    expect(row1Ops.some(o => o.kind === 'xfer' && o.from.bed === 'b' && o.from.needle === 51 && o.to.bed === 'f' && o.to.needle === 52)).toBe(true);
    expect(row1Ops.some(o => o.kind === 'xfer' && o.from.bed === 'b' && o.from.needle === 50 && o.to.bed === 'f' && o.to.needle === 51)).toBe(true);
  });

  it('rejects a distance-3 fashioning wedge end-to-end (only distance-2 is canonical)', () => {
    // Mirror of the validator-direct test: canonical fashioning is
    // distance-2 only. A chart that places the EMPTY at offset +3 with
    // the intermediate at +2 still active must fail compileChartToKnitout
    // with row-width-mismatch — confirms the clamp holds end-to-end.
    const chart = smallChart(2, 11);
    chart.name = 'Distance-3 (rejected)';
    chart.layers![0]!.keyPlacements.push(
      { anchor: { x: 7, y: 0 }, keyId: KEY_ID_K2TOG },
      { anchor: { x: 10, y: 0 }, keyId: KEY_ID_EMPTY },
    );

    const result = compileChartToKnitout({
      chart,
      keyPalette: DEFAULT_KEY_PALETTE,
      yarnBindings: [KNIT_BINDING],
      needleOffset: 50,
      wastePasses: 4,
      bindOff: 'drop',
      developerMode: true,
    });

    expect(result.ok).toBe(false);
    expect(result.messages.some(m => m.rule === 'chart-continuity-row-width-mismatch')).toBe(true);
  });

  it('lowers paired edge decreases toward the surviving active columns', () => {
    // Canonical SSK (tile [ns, svg]) at the left edge + canonical K2TOG
    // (tile [svg, ns]) at the right edge. Each tile already provides its
    // own source-slot no-stitch — no adjacent EMPTY needed.
    const chart = smallChart(2, 8);
    chart.layers![0]!.keyPlacements.push(
      { anchor: { x: 0, y: 0 }, keyId: KEY_ID_SSK },
      { anchor: { x: 6, y: 0 }, keyId: KEY_ID_K2TOG },
    );

    const result = compileChartToKnitout({
      chart,
      keyPalette: DEFAULT_KEY_PALETTE,
      yarnBindings: [KNIT_BINDING],
      needleOffset: 50,
      wastePasses: 4,
      bindOff: 'drop',
      developerMode: true,
    });

    if (!result.ok) {
      const errs = result.messages.filter(m => m.severity === 'error').map(m => `[${m.rule}] ${m.message}`).join('\n');
      throw new Error('paired-edge shaped compile failed:\n' + errs);
    }

    const ops = result.program!.ops;
    const row1Idx = ops.findIndex(o => o.kind === 'comment' && o.text === 'row 1');
    const row1Ops = ops.slice(row1Idx, ops.findIndex((o, i) => i > row1Idx && o.kind === 'comment' && o.text === 'row 2'));
    expect(row1Ops.some(o => o.kind === 'xfer' && o.from.bed === 'b' && o.from.needle === 50 && o.to.bed === 'f' && o.to.needle === 51)).toBe(true);
    expect(row1Ops.some(o => o.kind === 'xfer' && o.from.bed === 'b' && o.from.needle === 57 && o.to.bed === 'f' && o.to.needle === 56)).toBe(true);
    expect(row1Ops.some(o => o.kind === 'knit' && o.needle.bed === 'f' && o.needle.needle === 50)).toBe(false);
    expect(row1Ops.some(o => o.kind === 'knit' && o.needle.bed === 'f' && o.needle.needle === 57)).toBe(false);
  });

  it('rejects shaped charts with texture overrides for now', () => {
    const chart = smallChart(2, 4);
    chart.layers![0]!.keyPlacements.push(
      { anchor: { x: 0, y: 0 }, keyId: KEY_ID_EMPTY },
      { anchor: { x: 1, y: 0 }, keyId: KEY_ID_SSK },
      { anchor: { x: 2, y: 0 }, keyId: KEY_ID_PURL_DEFAULT },
    );

    const result = compileChartToKnitout({
      chart,
      keyPalette: DEFAULT_KEY_PALETTE,
      yarnBindings: [KNIT_BINDING],
    });

    expect(result.ok).toBe(false);
    expect(result.messages.some(m => m.rule === 'track-a-shape-overrides-unsupported')).toBe(true);
  });

  it('shape walker lowers tuck cells as front-bed tuck ops (Slice 3)', () => {
    // Slice 1.5 + Slice 3 (2026-05-21): both purl (trim) and tuck (body
    // texture) are now supported by the shape walker. Tuck doesn't change
    // stitch count, so it's compatible with shape mode anywhere; the
    // validator allows it globally and the walker emits a front-bed tuck.
    const result = emitShapedStockinetteWalk({
      projection: projectionFromCells([
        [KEY_ID_KNIT_DEFAULT, KEY_ID_KNIT_DEFAULT],
        [KEY_ID_TUCK, KEY_ID_KNIT_DEFAULT],
      ], DEFAULT_KEY_PALETTE),
      carrier: '2',
      needleStart: 50,
      handoff: simulatorHandoffFromSides({ '2': 'left' }),
    });
    const tuckOps = result.ops.filter(op => op.kind === 'tuck');
    expect(tuckOps.length).toBe(1);
    expect(tuckOps[0]!.needle.bed).toBe('f');
  });

  it('rejects a chart wider than the 252-needle bed', () => {
    const result = compileChartToKnitout({
      chart: smallChart(4, 260),
      keyPalette: DEFAULT_KEY_PALETTE,
      yarnBindings: [KNIT_BINDING],
    });
    expect(result.ok).toBe(false);
    expect(result.messages.some(m => m.rule === 'track-a-bed-width')).toBe(true);
  });

  it('warns on charts narrower than 30 stitches (G23, takedown rollers)', () => {
    // 20 stitches wide — below the ~30-stitch takedown threshold.
    const result = compileChartToKnitout({
      chart: smallChart(4, 20),
      keyPalette: DEFAULT_KEY_PALETTE,
      yarnBindings: [KNIT_BINDING],
    });
    expect(result.ok).toBe(true); // warning, not error
    const warn = result.messages.find(m => m.rule === 'track-a-narrow-chart');
    expect(warn?.severity).toBe('warning');
    expect(warn?.message).toMatch(/20 stitches wide/);
  });

  it('does not warn at exactly 30 stitches (G23 boundary)', () => {
    const result = compileChartToKnitout({
      chart: smallChart(4, 30),
      keyPalette: DEFAULT_KEY_PALETTE,
      yarnBindings: [KNIT_BINDING],
    });
    expect(result.messages.some(m => m.rule === 'track-a-narrow-chart')).toBe(false);
  });

  it('warns when chart orientation is not bottom-up (G16)', () => {
    const chart = smallChart();
    chart.orientation = 'top-down';
    const result = compileChartToKnitout({
      chart,
      keyPalette: DEFAULT_KEY_PALETTE,
      yarnBindings: [KNIT_BINDING],
    });
    expect(result.ok).toBe(true);
    const warn = result.messages.find(m => m.rule === 'track-a-orientation');
    expect(warn?.severity).toBe('warning');
    expect(warn?.message).toMatch(/top-down/);
    expect(warn?.message).toMatch(/bottom-up/);
  });

  it('rejects empty yarn bindings', () => {
    const result = compileChartToKnitout({
      chart: smallChart(),
      keyPalette: DEFAULT_KEY_PALETTE,
      yarnBindings: [],
    });
    expect(result.ok).toBe(false);
    expect(result.messages.some(m => m.rule === 'track-a-needs-color')).toBe(true);
  });

  it('rejects unbound chart colors (silent mis-compile guard)', () => {
    // Chart contains both knit (bound) and a custom navy key (unbound).
    const palette = [
      ...DEFAULT_KEY_PALETTE,
      { id: 'navy', name: 'Navy', width: 1, height: 1, backgroundColor: '#0a1f44', symbolColor: '#fff', cells: [[null]] },
    ];
    const chart = smallChart();
    chart.layers![0]!.keyPlacements.push({ anchor: { x: 0, y: 0 }, keyId: 'navy' });
    const result = compileChartToKnitout({
      chart,
      keyPalette: palette,
      yarnBindings: [KNIT_BINDING], // 'navy' NOT bound
    });
    expect(result.ok).toBe(false);
    expect(result.messages.some(m => m.rule === 'track-a-unbound-keys')).toBe(true);
    const msg = result.messages.find(m => m.rule === 'track-a-unbound-keys');
    expect(msg?.message).toContain('navy');
  });

  it('rejects duplicate carrier bindings', () => {
    const palette = [
      ...DEFAULT_KEY_PALETTE,
      { id: 'navy', name: 'Navy', width: 1, height: 1, backgroundColor: '#0a1f44', symbolColor: '#fff', cells: [[null]] },
    ];
    const chart = smallChart();
    chart.layers![0]!.keyPlacements.push({ anchor: { x: 0, y: 0 }, keyId: 'navy' });
    const result = compileChartToKnitout({
      chart,
      keyPalette: palette,
      yarnBindings: [
        KNIT_BINDING, // C2
        { keyId: 'navy', carrier: '2', name: 'navy' }, // also C2 ← conflict
      ],
    });
    expect(result.ok).toBe(false);
    expect(result.messages.some(m => m.rule === 'track-a-duplicate-carrier')).toBe(true);
  });

  // (Multi-color charts route through jacquard ladder now;
  //  see test/knitout/from-chart-jacquard.test.ts)

  it('produces a program with no carrier-state errors from the op-level validator', () => {
    const result = compileChartToKnitout({
      chart: smallChart(),
      keyPalette: DEFAULT_KEY_PALETTE,
      yarnBindings: [KNIT_BINDING],
    });
    const errors = result.messages.filter(m => m.severity === 'error');
    expect(errors).toEqual([]);
    // Specifically check there are no carrier-active errors (would mean
    // the row walker referenced a carrier without bringing it in).
    expect(result.messages.some(m => m.rule === 'carrier-active')).toBe(false);
  });

  it('ends with no carriers still active (releaseCarriersAtEnd=true)', () => {
    const result = compileChartToKnitout({
      chart: smallChart(),
      keyPalette: DEFAULT_KEY_PALETTE,
      yarnBindings: [KNIT_BINDING],
    });
    expect(result.messages.some(m => m.rule === 'carriers-trailing-at-end')).toBe(false);
  });

  it('produces a snapshot-stable .k for a minimal 2x4 stockinette', () => {
    const chart: KnitlabChartState = {
      id: 'snap',
      rows: 2,
      cols: 4,
      orientation: 'bottom-up',
      name: 'Snap',
      displaySettings: { rowCountVisibility: 'right', colCountVisibility: 'bottom' },
      layers: [{ id: 'base', name: 'Base', isVisible: true, grid: {}, keyPlacements: [] }],
      activeLayerId: 'base',
    };
    const result = compileChartToKnitout({
      chart,
      keyPalette: DEFAULT_KEY_PALETTE,
      yarnBindings: [KNIT_BINDING],
      needleOffset: 50,
      wastePasses: 4, // minimum, keep snapshot small
      bindOff: 'drop',
      developerMode: true,
      releaseCarriersAtEnd: true,
    });
    expect(result.ok).toBe(true);
    expect(writeKnitoutProgram(result.program!)).toMatchSnapshot();
  });
});
