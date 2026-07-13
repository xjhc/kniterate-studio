/**
 * Floats jacquard walker — front-bed only, no back-bed knit.
 *
 * Matches the body structure of Customist Studio's `.kc` fairisle
 * exports (see `reference/fairisle.kc`). For each chart row, emits N
 * front-bed passes (one per color present), with knit-this-color /
 * miss-elsewhere logic. The unworked yarn floats unsecured behind the
 * work.
 *
 * These tests pin the contract:
 *   - `backBedStyle: 'floats'` routes through `emitJacquardFloatsWalk`
 *   - No back-bed knits / misses in the body
 *   - Pass count per chart row = number of distinct colors in that row
 *   - The `'floats-jacquard'` technique tag appears on the plan
 *   - The `passesPerRowFor` helper returns N (not 2N or N+1)
 *
 * A separate suite covers the Customist fairisle preset end-to-end
 * (compile → `.kc` head matches the reference's machine settings).
 */

import { describe, expect, it } from 'vitest';
import { compileChartToKnitout } from '../../src/knitout/compile/from-chart.js';
import {
  buildPunchcardChart,
  stripePunchcardTile,
} from '../../src/colorwork/punchcard.js';
import {
  DEFAULT_KEY_PALETTE,
  KEY_ID_KNIT_DEFAULT,
  type KnitlabKeyDefinition,
} from '../../src/colorwork/knitlab1-contract.js';
import {
  DEFAULT_KNITERATE_EXPORT_STATE,
  applyMachineRecipe,
  passesPerRowFor,
  type KniterateExportState,
} from '../../src/knitout/export-helpers.js';
import { CUSTOMIST_STUDIO_FAIRISLE_7GG_RECIPE } from '../../src/knitout/recipes/index.js';
import { FAIRISLE_BODY_DEFAULTS } from '../../src/knitout/kniterate/constants.js';
import { FAIRISLE_PARK_WASTE_DEFAULTS } from '../../src/knitout/passes/waste-section.js';
import { emitJacquardFloatsWalk } from '../../src/knitout/passes/jacquard-floats.js';
import { simulatorHandoffFromSides } from '../../src/knitout/passes/simulator-handoff.js';
import { knitoutToKCode } from '../../src/knitout/kniterate/to-kcode.js';
import { writeKnitoutProgram } from '../../src/knitout/emitter.js';
import type { CarrierId, KnitoutOp, YarnBinding } from '../../src/knitout/types.js';
import type { ResolvedChart } from '../../src/knitout/passes/resolve-chart.js';

const PALETTE: KnitlabKeyDefinition[] = [
  ...DEFAULT_KEY_PALETTE,
  { id: 'navy', name: 'Navy', width: 1, height: 1, backgroundColor: '#0a1f44', symbolColor: '#fff', cells: [[null]] },
];

const TWO_COLOR_BINDINGS: YarnBinding[] = [
  { keyId: KEY_ID_KNIT_DEFAULT, carrier: '4', name: 'cream' },
  { keyId: 'navy',              carrier: '3', name: 'navy'  },
];

const DIRECT_FLOAT_BINDINGS = new Map<string, CarrierId>([
  [KEY_ID_KNIT_DEFAULT, '4'],
  ['navy', '3'],
]);

function smallFairisleChart() {
  return buildPunchcardChart({
    cols: 16,
    rows: 6,
    tile: stripePunchcardTile(3, 5, KEY_ID_KNIT_DEFAULT, 'navy'),
  });
}

function resolvedCells(cells: string[][]): ResolvedChart {
  return {
    rows: cells.length,
    cols: cells[0]?.length ?? 0,
    cells,
    warnings: [],
  };
}

function activeHandoff(sides: Partial<Record<CarrierId, 'left' | 'right'>>) {
  return simulatorHandoffFromSides(sides);
}

/** The floats walker sets body auto-move presser speed/roller (600/0)
 *  before row 0. Strip those leading ops so structural assertions can
 *  anchor on the first row comment / preposition move. */
function stripLeadingPresser(ops: readonly KnitoutOp[]): readonly KnitoutOp[] {
  let i = 0;
  while (ops[i] && (ops[i]!.kind === 'x-presser-speed' || ops[i]!.kind === 'x-presser-roller')) i++;
  return ops.slice(i);
}

describe('compileChartToKnitout — floats jacquard (Customist fairisle)', () => {
  it('routes 2-color chart through the floats walker', () => {
    const result = compileChartToKnitout({
      chart: smallFairisleChart(),
      keyPalette: PALETTE,
      yarnBindings: TWO_COLOR_BINDINGS,
      needleOffset: 50,
      wastePasses: 4,
      bindOff: 'drop',
      developerMode: true,
      backBedStyle: 'floats',
    });
    if (!result.ok) {
      throw new Error(
        `floats compile failed:\n${result.messages
          .filter(m => m.severity === 'error')
          .map(m => `[${m.rule}] ${m.message}`)
          .join('\n')}`,
      );
    }
    expect(result.plan?.technique).toBe('floats-jacquard');
  });

  it('carries typed design-row provenance on emitted body operations', () => {
    const result = compileChartToKnitout({
      chart: smallFairisleChart(),
      keyPalette: PALETTE,
      yarnBindings: TWO_COLOR_BINDINGS,
      needleOffset: 50,
      wastePasses: 4,
      bindOff: 'drop',
      developerMode: true,
      backBedStyle: 'floats',
    });
    expect(result.ok).toBe(true);
    const sourcedOps = result.program!.ops.filter((op) => op.sourceRows !== undefined);
    expect(sourcedOps.length).toBeGreaterThan(0);
    expect(sourcedOps.some((op) => op.sourceRows?.includes(0))).toBe(true);
    expect(sourcedOps.some((op) => op.sourceRows?.includes(5))).toBe(true);
  });

  it('emits no back-bed knits or misses in the body', () => {
    const result = compileChartToKnitout({
      chart: smallFairisleChart(),
      keyPalette: PALETTE,
      yarnBindings: TWO_COLOR_BINDINGS,
      needleOffset: 50,
      wastePasses: 4,
      bindOff: 'drop',
      developerMode: true,
      backBedStyle: 'floats',
    });
    expect(result.ok).toBe(true);
    const ops = result.program!.ops;
    // Locate the `--- PATTERN ---` comment as the body boundary.
    const bodyStart = ops.findIndex(
      o => o.kind === 'comment' && o.text === '--- PATTERN ---',
    );
    expect(bodyStart).toBeGreaterThan(0);
    const bindOffStart = ops.findIndex(
      (o, i) => i > bodyStart && o.kind === 'comment' && o.text.startsWith('--- BIND OFF'),
    );
    const bodyEnd = bindOffStart > 0 ? bindOffStart : ops.length;
    const bodyOps = ops.slice(bodyStart, bodyEnd);
    const backBedKnits = bodyOps.filter(
      o => (o.kind === 'knit' || o.kind === 'miss') && o.needle.bed === 'b',
    );
    expect(backBedKnits.length).toBe(0);
  });

  it('emits exactly N front-bed passes per chart row when N colors are present', () => {
    const result = compileChartToKnitout({
      chart: smallFairisleChart(),
      keyPalette: PALETTE,
      yarnBindings: TWO_COLOR_BINDINGS,
      needleOffset: 50,
      wastePasses: 4,
      bindOff: 'drop',
      developerMode: true,
      backBedStyle: 'floats',
    });
    expect(result.ok).toBe(true);
    const ops = result.program!.ops;
    // Walk body row markers; between successive `row N` comments, count
    // the distinct carriers that issue knit/miss ops. For a 2-color
    // stripe punchcard, every row has both colors, so per-row carrier
    // count should be 2.
    const rowMarkers: number[] = [];
    for (let i = 0; i < ops.length; i++) {
      const op = ops[i]!;
      if (op.kind === 'comment' && /^row \d+$/.test(op.text)) rowMarkers.push(i);
    }
    expect(rowMarkers.length).toBe(6);
    for (let r = 0; r < rowMarkers.length; r++) {
      const start = rowMarkers[r]!;
      const end = rowMarkers[r + 1] ?? ops.length;
      const carriers = new Set<string>();
      for (let i = start; i < end; i++) {
        const op = ops[i]!;
        if (op.kind === 'knit' || op.kind === 'miss') {
          for (const c of op.carriers) carriers.add(c);
        }
      }
      expect(carriers.size).toBe(2);
    }
  });

  it('passesPerRowFor returns N for floats mode (vs N+1 for ladder, 2N for birdseye)', () => {
    const state2: Pick<KniterateExportState, 'backBedStyle' | 'bindings'> = {
      backBedStyle: 'floats',
      bindings: TWO_COLOR_BINDINGS,
    };
    expect(passesPerRowFor(state2)).toBe(2);
  });

  it('prepositions the second carrier only for a two-carrier same-side body start', () => {
    const result = emitJacquardFloatsWalk({
      resolved: resolvedCells([[KEY_ID_KNIT_DEFAULT, 'navy']]),
      bindings: DIRECT_FLOAT_BINDINGS,
      needleStart: 50,
      handoff: activeHandoff({ '4': 'left', '3': 'left' }),
      initialNextDirection: '+',
    });

    const ops = stripLeadingPresser(result.ops);
    expect(ops[0]).toMatchObject({
      kind: 'miss',
      direction: '+',
      carriers: ['3'],
    });
    expect(ops[1]).toMatchObject({ kind: 'comment', text: 'row 0' });
  });

  it('does not preposition when two body carriers already alternate sides', () => {
    const result = emitJacquardFloatsWalk({
      resolved: resolvedCells([[KEY_ID_KNIT_DEFAULT, 'navy']]),
      bindings: DIRECT_FLOAT_BINDINGS,
      needleStart: 50,
      handoff: activeHandoff({ '4': 'left', '3': 'right' }),
      initialNextDirection: '+',
    });

    expect(stripLeadingPresser(result.ops)[0]).toMatchObject({ kind: 'comment', text: 'row 0' });
  });

  it('does not preposition three-color rows through the two-carrier helper', () => {
    const bindings = new Map<string, CarrierId>([
      [KEY_ID_KNIT_DEFAULT, '4'],
      ['navy', '3'],
      ['rust', '2'],
    ]);
    const result = emitJacquardFloatsWalk({
      resolved: resolvedCells([[KEY_ID_KNIT_DEFAULT, 'navy', 'rust']]),
      bindings,
      needleStart: 50,
      handoff: activeHandoff({ '4': 'left', '3': 'left', '2': 'left' }),
      initialNextDirection: '+',
    });

    expect(stripLeadingPresser(result.ops)[0]).toMatchObject({ kind: 'comment', text: 'row 0' });
  });

  it('honors the Customist fairisle preset (machine settings reach the program)', () => {
    const result = compileChartToKnitout({
      chart: smallFairisleChart(),
      keyPalette: PALETTE,
      yarnBindings: TWO_COLOR_BINDINGS,
      needleOffset: 50,
      wastePasses: 80,
      bindOff: 'drop',
      developerMode: true,
      backBedStyle: 'floats',
      drawCarrierOverride: 'none',
      wasteCarrierOverride: '6',
      kniterate: {
        rollerAdvance: FAIRISLE_BODY_DEFAULTS.rollerAdvance,
        stitchNumber: FAIRISLE_BODY_DEFAULTS.stitchNumber,
        xferStitchNumber: FAIRISLE_BODY_DEFAULTS.xferStitchNumber,
        speedNumber: FAIRISLE_BODY_DEFAULTS.speedNumber,
      },
      wasteMachineConfig: FAIRISLE_PARK_WASTE_DEFAULTS,
    });
    expect(result.ok).toBe(true);
    const ops = result.program!.ops;
    // Body settings (re-emitted at the start of the body pass).
    const bodyStart = ops.findIndex(
      o => o.kind === 'comment' && o.text === '--- PATTERN ---',
    );
    expect(bodyStart).toBeGreaterThan(0);
    // The body re-asserts speed / roller / stitch after the waste section.
    const tail = ops.slice(bodyStart, bodyStart + 6);
    const stitchOps = tail.filter(o => o.kind === 'x-stitch-number');
    const speedOps = tail.filter(o => o.kind === 'x-speed-number');
    const rollerOps = tail.filter(o => o.kind === 'x-roller-advance');
    expect(stitchOps[0]).toMatchObject({ kind: 'x-stitch-number', value: 9 });
    expect(speedOps[0]).toMatchObject({ kind: 'x-speed-number', value: 200 });
    expect(rollerOps[0]).toMatchObject({ kind: 'x-roller-advance', value: 450 });
    // Waste section emits its own x-stitch-number (4) between the
    // header (9) and the body re-assert (9). The middle value is the
    // waste cast-on stitch number, not the body value.
    const wasteCommentIdx = ops.findIndex(
      o => o.kind === 'comment' && o.text === '--- WASTE SECTION ---',
    );
    const bodyCommentIdx = ops.findIndex(
      (o, i) => i > wasteCommentIdx && o.kind === 'comment' && o.text === '--- PATTERN ---',
    );
    expect(wasteCommentIdx).toBeGreaterThan(0);
    expect(bodyCommentIdx).toBeGreaterThan(wasteCommentIdx);
    const wasteStitchOp = ops
      .slice(wasteCommentIdx, bodyCommentIdx)
      .find(o => o.kind === 'x-stitch-number');
    expect(wasteStitchOp).toMatchObject({ kind: 'x-stitch-number', value: 4 });
  });

  it('emits back-bed clear xfers between cast-on and body for floats mode', () => {
    const result = compileChartToKnitout({
      chart: smallFairisleChart(),
      keyPalette: PALETTE,
      yarnBindings: TWO_COLOR_BINDINGS,
      needleOffset: 50,
      wastePasses: 4,
      bindOff: 'drop',
      developerMode: true,
      backBedStyle: 'floats',
    });
    expect(result.ok).toBe(true);
    const ops = result.program!.ops;
    const patternIdx = ops.findIndex(o => o.kind === 'comment' && o.text === '--- PATTERN ---');
    const clearIdx = ops.findIndex(
      (o, i) => i > patternIdx && o.kind === 'comment' && o.text.includes('BACK-BED CLEAR'),
    );
    expect(clearIdx).toBeGreaterThan(patternIdx);
    // First body knit must come AFTER the back-bed clear.
    const firstKnitIdx = ops.findIndex(
      (o, i) => i > clearIdx && o.kind === 'knit',
    );
    expect(firstKnitIdx).toBeGreaterThan(clearIdx);
    // At least one xfer between clearIdx and firstKnitIdx.
    const xferOps = ops
      .slice(clearIdx, firstKnitIdx)
      .filter(o => o.kind === 'xfer');
    expect(xferOps.length).toBeGreaterThan(0);
    // All xfers go b → f (not f → b).
    for (const op of xferOps) {
      if (op.kind === 'xfer') {
        expect(op.from.bed).toBe('b');
        expect(op.to.bed).toBe('f');
        expect(op.from.needle).toBe(op.to.needle);
      }
    }
  });

  it('applyMachineRecipe with the Customist fairisle recipe sets the body+bind-off knobs without touching bindings/needleOffset', () => {
    const initial: KniterateExportState = {
      ...DEFAULT_KNITERATE_EXPORT_STATE,
      bindings: [...TWO_COLOR_BINDINGS],
      needleOffset: 73,
    };
    const next = applyMachineRecipe(initial, CUSTOMIST_STUDIO_FAIRISLE_7GG_RECIPE);
    expect(next.backBedStyle).toBe('floats');
    expect(next.stitchNumber).toBe(9);
    expect(next.speedNumber).toBe(200);
    expect(next.rollerAdvance).toBe(450);
    expect(next.xferStitchNumber).toBe(5);
    expect(next.wastePasses).toBe(87);
    expect(next.drawCarrierOverride).toBe('none');
    expect(next.wasteCarrierOverride).toBe('6');
    expect(next.wasteMachineConfig?.stitchNumber).toBe(4);
    expect(next.wasteMachineConfig?.castOnSpeed).toBe(100);
    expect(next.wasteMachineConfig?.castOnRoller).toBe(440);
    expect(next.wasteMachineConfig?.castOnTuckPasses).toBe(2);
    expect(next.wasteMachineConfig?.castOnTuckSpeed).toBe(300);
    expect(next.wasteMachineConfig?.castOnTuckRoller).toBe(0);
    // Phase 3 + 4 (2026-05-23): preset now also enables the carrier
    // intro + ramp and the park-out bind-off. P3.2 materialized the
    // carrier-intro config as an object instead of a boolean toggle —
    // the recipe pins the full intro spec rather than relying on the
    // engine's defaults lookup.
    expect(next.fairisleCarrierIntro).toBeDefined();
    expect(typeof next.fairisleCarrierIntro).toBe('object');
    expect(next.bindOff).toBe('fairisle-park-bindoff');
    // Bindings + needleOffset preserved (chart-driven, not preset-driven).
    expect(next.bindings).toEqual(TWO_COLOR_BINDINGS);
    expect(next.needleOffset).toBe(73);
  });

  it('end-to-end: applyMachineRecipe(Customist) → compileExport produces a program with intro, clear, body, closing waste, and park-outs', async () => {
    // Reuse compileExport via the recipe path so we exercise the full
    // wizard wire: recipe application → compileExport → compileChartToKnitout.
    const { compileExportFromState } = await import('../../src/knitout/export-helpers.js');
    const state = applyMachineRecipe({
      ...DEFAULT_KNITERATE_EXPORT_STATE,
      bindings: [...TWO_COLOR_BINDINGS],
      needleOffset: 50,
    }, CUSTOMIST_STUDIO_FAIRISLE_7GG_RECIPE);
    const result = compileExportFromState(smallFairisleChart(), PALETTE, state);
    if (!result.ok) {
      throw new Error(
        `preset end-to-end compile failed:\n${result.messages
          .filter(m => m.severity === 'error')
          .map(m => `[${m.rule}] ${m.message}`)
          .join('\n')}`,
      );
    }
    const ops = result.program!.ops;
    // All the major phases land in the right order.
    const introIdx = ops.findIndex(
      o => o.kind === 'comment' && o.text.includes('CARRIER INTRO'),
    );
    const clearIdx = ops.findIndex(
      o => o.kind === 'comment' && o.text.includes('BACK-BED CLEAR'),
    );
    const bindIdx = ops.findIndex(
      o => o.kind === 'comment' && o.text.includes('fairisle parity park'),
    );
    expect(introIdx).toBeGreaterThan(0);
    expect(clearIdx).toBeGreaterThan(introIdx);
    expect(bindIdx).toBeGreaterThan(clearIdx);
    // At least one Tu-Tu park-out lands in the .kc end section.
    const knitoutText = writeKnitoutProgram(result.program!);
    const kc = knitoutToKCode(knitoutText);
    expect(kc.ok).toBe(true);
    const tuTuLines = kc.kcode!.split('\n').filter(l => /^[<>]{2} Tu-Tu [1-6] 150 0$/.test(l));
    expect(tuTuLines.length).toBeGreaterThan(0);
  });

  // ---- Phase 3 (2026-05-23): carrier intro + stitch ramp ---------------

  it('Phase 3: fairisleCarrierIntro emits per-carrier intro + stitch ramp before back-bed clear', () => {
    const result = compileChartToKnitout({
      chart: smallFairisleChart(),
      keyPalette: PALETTE,
      yarnBindings: TWO_COLOR_BINDINGS,
      needleOffset: 50,
      wastePasses: 4,
      bindOff: 'drop',
      developerMode: true,
      backBedStyle: 'floats',
      fairisleCarrierIntro: true,
      kniterate: {
        rollerAdvance: FAIRISLE_BODY_DEFAULTS.rollerAdvance,
        stitchNumber: FAIRISLE_BODY_DEFAULTS.stitchNumber,
        xferStitchNumber: FAIRISLE_BODY_DEFAULTS.xferStitchNumber,
        speedNumber: FAIRISLE_BODY_DEFAULTS.speedNumber,
      },
    });
    if (!result.ok) {
      throw new Error(
        `transition compile failed:\n${result.messages
          .filter(m => m.severity === 'error')
          .map(m => `[${m.rule}] ${m.message}`)
          .join('\n')}`,
      );
    }
    const ops = result.program!.ops;
    const introIdx = ops.findIndex(
      o => o.kind === 'comment' && o.text.includes('CARRIER INTRO'),
    );
    const rampIdx = ops.findIndex(
      o => o.kind === 'comment' && o.text.includes('STITCH RAMP'),
    );
    const clearIdx = ops.findIndex(
      o => o.kind === 'comment' && o.text.includes('BACK-BED CLEAR'),
    );
    expect(introIdx).toBeGreaterThan(0);
    expect(rampIdx).toBeGreaterThan(introIdx);
    expect(clearIdx).toBeGreaterThan(rampIdx);
  });

  it('Phase 3: intro emits one front-bed pass per pattern carrier (highest-numbered first)', () => {
    const result = compileChartToKnitout({
      chart: smallFairisleChart(),
      keyPalette: PALETTE,
      yarnBindings: TWO_COLOR_BINDINGS,
      needleOffset: 50,
      wastePasses: 4,
      bindOff: 'drop',
      developerMode: true,
      backBedStyle: 'floats',
      fairisleCarrierIntro: true,
    });
    expect(result.ok).toBe(true);
    const ops = result.program!.ops;
    const introIdx = ops.findIndex(
      o => o.kind === 'comment' && o.text.includes('CARRIER INTRO'),
    );
    const rampIdx = ops.findIndex(
      o => o.kind === 'comment' && o.text.includes('STITCH RAMP'),
    );
    expect(introIdx).toBeGreaterThan(0);
    expect(rampIdx).toBeGreaterThan(introIdx);
    // Collect knit ops between intro comment and ramp comment.
    const introKnits = ops
      .slice(introIdx, rampIdx)
      .filter(o => o.kind === 'knit');
    expect(introKnits.length).toBeGreaterThan(0);
    // All intro knits should be on the front bed (no back-bed knits).
    for (const op of introKnits) {
      if (op.kind === 'knit') expect(op.needle.bed).toBe('f');
    }
    // Carriers used should be the pattern carriers, highest-first, with
    // carrier-6 filler rows interleaved between them.
    const carriersInOrder: string[] = [];
    for (const op of introKnits) {
      if (op.kind === 'knit') {
        const c = op.carriers[0];
        if (c && carriersInOrder[carriersInOrder.length - 1] !== c) carriersInOrder.push(c);
      }
    }
    expect(carriersInOrder).toEqual(['4', '6', '3', '6']);
  });

  it('Phase 3: ramp restores body STIF after the ramp values run through', () => {
    const result = compileChartToKnitout({
      chart: smallFairisleChart(),
      keyPalette: PALETTE,
      yarnBindings: TWO_COLOR_BINDINGS,
      needleOffset: 50,
      wastePasses: 4,
      bindOff: 'drop',
      developerMode: true,
      backBedStyle: 'floats',
      fairisleCarrierIntro: true,
      kniterate: {
        rollerAdvance: FAIRISLE_BODY_DEFAULTS.rollerAdvance,
        stitchNumber: FAIRISLE_BODY_DEFAULTS.stitchNumber,
        speedNumber: FAIRISLE_BODY_DEFAULTS.speedNumber,
      },
    });
    expect(result.ok).toBe(true);
    const ops = result.program!.ops;
    const clearIdx = ops.findIndex(
      o => o.kind === 'comment' && o.text.includes('BACK-BED CLEAR'),
    );
    const firstWalkerKnit = ops.findIndex(
      (o, i) => i > clearIdx && o.kind === 'knit',
    );
    expect(firstWalkerKnit).toBeGreaterThan(clearIdx);
    // Between back-bed clear and the walker's first knit, the body
    // settings re-assert restores STIF to body value (9).
    const stitchSettings = ops
      .slice(clearIdx, firstWalkerKnit)
      .filter(o => o.kind === 'x-stitch-number');
    const lastStitch = stitchSettings[stitchSettings.length - 1];
    expect(lastStitch).toMatchObject({ kind: 'x-stitch-number', value: 9 });
  });

  // ---- Phase 4 (2026-05-23): closing waste + Tu-Tu park-out ------------

  it('Phase 4: customist-fairisle-park bind-off emits closing-waste + park sequence + Tu-Tu out for each active carrier', () => {
    const result = compileChartToKnitout({
      chart: smallFairisleChart(),
      keyPalette: PALETTE,
      yarnBindings: TWO_COLOR_BINDINGS,
      needleOffset: 50,
      wastePasses: 4,
      bindOff: 'fairisle-park-bindoff',
      backBedStyle: 'floats',
    });
    if (!result.ok) {
      throw new Error(
        `park bind-off compile failed:\n${result.messages
          .filter(m => m.severity === 'error')
          .map(m => `[${m.rule}] ${m.message}`)
          .join('\n')}`,
      );
    }
    const ops = result.program!.ops;
    const bindIdx = ops.findIndex(
      o => o.kind === 'comment' && o.text.includes('fairisle parity park'),
    );
    expect(bindIdx).toBeGreaterThan(0);
    const tail = ops.slice(bindIdx);
    // Closing-waste section uses front-bed knit only on C6.
    const closingKnits = tail.filter(
      o => o.kind === 'knit' && o.needle.bed === 'f' && o.carriers[0] === '6',
    );
    expect(closingKnits.length).toBeGreaterThan(0);
    // No back-bed knits in the closing waste section.
    const closingBackKnits = tail.filter(
      o => o.kind === 'knit' && o.needle.bed === 'b',
    );
    expect(closingBackKnits.length).toBe(0);
    // x-park-carriage op is emitted before the carrier-outs.
    const parkIdx = tail.findIndex(o => o.kind === 'x-park-carriage');
    expect(parkIdx).toBeGreaterThan(0);
    // Each active carrier is taken out via `out` after the park.
    // For 2-color fairisle, that's the pattern carriers (3, 4) plus
    // C6 (closing waste) — but the pattern carrier matching `knitCarrier`
    // is taken out at the START of the bind-off (before the closing
    // waste section), so the post-park `out` ops only catch the rest.
    const outOps = tail.slice(parkIdx).filter(o => o.kind === 'out');
    expect(outOps.length).toBeGreaterThan(0);
    // All carrier-outs come in numeric order.
    const outCarriers = outOps
      .map(o => (o.kind === 'out' ? o.carriers[0] : undefined))
      .filter((c): c is string => Boolean(c));
    const sortedOuts = [...outCarriers].sort();
    expect(outCarriers).toEqual(sortedOuts);
  });

  it('Phase 4: park-pass machine settings reach the .kc with the expected speed/roller/stitch', async () => {
    const result = compileChartToKnitout({
      chart: smallFairisleChart(),
      keyPalette: PALETTE,
      yarnBindings: TWO_COLOR_BINDINGS,
      needleOffset: 50,
      wastePasses: 4,
      bindOff: 'fairisle-park-bindoff',
      backBedStyle: 'floats',
      kniterate: {
        rollerAdvance: FAIRISLE_BODY_DEFAULTS.rollerAdvance,
        stitchNumber: FAIRISLE_BODY_DEFAULTS.stitchNumber,
        xferStitchNumber: FAIRISLE_BODY_DEFAULTS.xferStitchNumber,
        speedNumber: FAIRISLE_BODY_DEFAULTS.speedNumber,
      },
    });
    expect(result.ok).toBe(true);
    const knitoutText = writeKnitoutProgram(result.program!);
    const kc = knitoutToKCode(knitoutText);
    expect(kc.ok).toBe(true);
    const lines = kc.kcode!.split('\n');
    // Reference fairisle.kc line 2555 = `>> Kn-Kn 0 150 450` (park pass).
    // Default closingWasteStitchRamp has length 16 (even), which leaves
    // the closing-waste carrier on the LEFT, so the park pass goes `>>`
    // matching the reference's direction exactly.
    const parkLine = lines.findIndex(l => /^>> Kn-Kn 0 150 450$/.test(l));
    expect(parkLine).toBeGreaterThan(0);
    // The auto-move that follows the park is at presser speed 600 /
    // roller 0 (matches reference's `<< Kn-Kn 0 600 0`).
    const autoAfterPark = lines.slice(parkLine + 1).find(l => /Kn-Kn 0/.test(l));
    expect(autoAfterPark).toMatch(/Kn-Kn 0 600 0/);
    // Tu-Tu lines for each remaining carrier follow.
    const tuTuLines = lines.filter(l => /^[<>]{2} Tu-Tu [1-6] 150 0$/.test(l));
    expect(tuTuLines.length).toBeGreaterThan(0);
  });

  it('back-bed clear materializes as Rr-Tr / Rl-Tr passes at speed 120 in the .kc', async () => {
    const result = compileChartToKnitout({
      chart: smallFairisleChart(),
      keyPalette: PALETTE,
      yarnBindings: TWO_COLOR_BINDINGS,
      needleOffset: 50,
      wastePasses: 4,
      bindOff: 'drop',
      developerMode: true,
      backBedStyle: 'floats',
      kniterate: {
        rollerAdvance: FAIRISLE_BODY_DEFAULTS.rollerAdvance,
        stitchNumber: FAIRISLE_BODY_DEFAULTS.stitchNumber,
        xferStitchNumber: FAIRISLE_BODY_DEFAULTS.xferStitchNumber,
        speedNumber: FAIRISLE_BODY_DEFAULTS.speedNumber,
      },
    });
    expect(result.ok).toBe(true);
    const knitoutText = writeKnitoutProgram(result.program!);
    const kc = knitoutToKCode(knitoutText);
    expect(kc.ok).toBe(true);
    const lines = kc.kcode!.split('\n');
    // Reference fairisle.kc line 1011 = `>> Rr-Tr 0 120 0`, line 1021 = `<< Rl-Tr 0 120 0`
    const rrTr = lines.findIndex(l => /^>> Rr-Tr 0 120 0$/.test(l));
    const rlTr = lines.findIndex(l => /^<< Rl-Tr 0 120 0$/.test(l));
    expect(rrTr).toBeGreaterThan(0);
    expect(rlTr).toBeGreaterThan(rrTr);
  });
});
