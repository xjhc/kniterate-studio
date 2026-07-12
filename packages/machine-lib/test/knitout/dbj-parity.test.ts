/**
 * DBJ machine-equivalent parity harness.
 *
 * Drives the same productized seam as the Kniterate wizard:
 *   decode reference design -> author chart + dbj-backing: full ->
 *   detached wizard config -> compile -> vendor k-code -> diffKc.
 *
 * This is footer-level machine parity (direction / pass type / carrier /
 * speed / roller), matching the fairisle parity bar. Raw FRNT/REAR byte
 * layout is intentionally outside this test.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { buildPunchcardChart } from '../../src/colorwork/punchcard.js';
import {
  DEFAULT_KEY_PALETTE,
  KEY_ID_COLOR_GOLD,
  KEY_ID_COLOR_RED,
  KEY_ID_COLOR_TEAL,
  KEY_ID_KNIT_DEFAULT,
  type KnitlabChartState,
  type KnitlabKeyDefinition,
} from '../../src/colorwork/knitlab1-contract.js';
import {
  compileExportFromState,
} from '../../src/knitout/export-helpers.js';
import { FAIRISLE_PARK_BINDOFF_DEFAULTS } from '../../src/knitout/passes/bind-off.js';
import {
  DEFAULT_KNITERATE_WIZARD_CONFIG,
  deriveKniterateExportState,
  type KniterateWizardConfig,
  type RecipeOverrides,
} from '../../src/knitout/wizard-config.js';
import { writeKnitoutProgram } from '../../src/knitout/emitter.js';
import { diffKc } from '../../src/knitout/kc-diff.js';
import { knitoutToKCode } from '../../src/knitout/kniterate/to-kcode.js';
import type { CompileChartResult } from '../../src/knitout/compile/from-chart.js';
import { decodeCustomistDesign } from './reference-kc/customist-design-decode.js';

const REFERENCE = readFileSync(resolve('reference/dbj.kc'), 'utf8');
const PALETTE: KnitlabKeyDefinition[] = DEFAULT_KEY_PALETTE;

const KEY_FOR_CARRIER = new Map<string, string>([
  ['2', KEY_ID_KNIT_DEFAULT],
  ['3', KEY_ID_COLOR_RED],
  ['4', KEY_ID_COLOR_GOLD],
  ['5', KEY_ID_COLOR_TEAL],
]);

const BINDINGS = [
  { keyId: KEY_ID_KNIT_DEFAULT, carrier: '2' as const, name: 'c2' },
  { keyId: KEY_ID_COLOR_RED, carrier: '3' as const, name: 'c3' },
  { keyId: KEY_ID_COLOR_GOLD, carrier: '4' as const, name: 'c4' },
  { keyId: KEY_ID_COLOR_TEAL, carrier: '5' as const, name: 'c5' },
];

const DBJ_MANUAL_OVERRIDES: RecipeOverrides = {
  body: {
    stitchNumber: 7,
    speedNumber: 400,
    rollerAdvance: 450,
    xferStitchNumber: 5,
    backBedStyle: 'birdseye',
    birdseyeMode: 'full',
  },
  start: {
    wastePasses: 80,
    wasteCarrierOverride: '6',
    drawCarrierOverride: 'none',
    wasteMachineConfig: {
      stitchNumber: 5,
      castOnSpeed: 100,
      castOnRoller: 440,
      castOnPasses: 1,
      castOnTuckPasses: 0,
      castOnTuckSpeed: 300,
      castOnTuckRoller: 0,
      wasteSpeed: 400,
      flatRollerPasses: 4,
      rampRollerLeft: 440,
      rampRollerRight: 0,
      castOnFirstBed: 'front',
      edgeInertNeedles: 0,
    },
  },
  finish: {
    bindOff: 'fairisle-park-bindoff',
    fairisleParkConfig: {
      ...FAIRISLE_PARK_BINDOFF_DEFAULTS,
      closingWasteSpeed: 300,
      closingWasteRoller: 450,
      closingWasteStitchRamp: Array.from({ length: 20 }, () => 6),
      parkSpeed: 300,
      parkRoller: 450,
      parkStitch: 6,
      parkAutoMoveSpeed: 600,
      parkAutoMoveRoller: 0,
    },
  },
};

function buildDbjChart() {
  const design = decodeCustomistDesign(REFERENCE);
  // The decoded 71st row is a terminal/artifact row from the reference
  // footer transition; the authored DBJ chart is the first 70 design rows.
  const designRows = design.rows.slice(0, 70);
  const cells = designRows.map(row => {
    const out: string[] = [];
    for (let c = design.lo; c <= design.hi; c++) {
      out.push(KEY_FOR_CARRIER.get(row.get(c) ?? '4') ?? KEY_ID_COLOR_GOLD);
    }
    return out;
  });
  const chart = buildPunchcardChart({
    name: 'dbj-parity',
    cols: design.width,
    rows: designRows.length,
    tile: { cols: design.width, rows: designRows.length, cells },
  });
  chart.annotations = [{
    id: 'dbj-full',
    kind: 'dbj-backing',
    anchor: { scope: 'sheet' },
    dbjStrategy: 'full',
  }];
  return { design, chart };
}

function toKc(result: CompileChartResult): string {
  if (!result.ok) {
    throw new Error('dbj compile failed: ' + result.messages.filter(m => m.severity === 'error').map(m => m.rule).join(', '));
  }
  const kc = knitoutToKCode(writeKnitoutProgram(result.program!));
  if (!kc.ok) throw new Error('kcode failed: ' + kc.stderr);
  return kc.kcode!;
}

function manualDbjWizardConfig(): KniterateWizardConfig {
  return {
    ...DEFAULT_KNITERATE_WIZARD_CONFIG,
    recipeId: null,
    yarns: BINDINGS,
    allocationMode: 'default',
    // This fixture proves byte-equivalence to the historical vendor
    // reference. Product exports keep first-body-row protection enabled.
    protectFirstBodyRow: false,
    recipeOverrides: DBJ_MANUAL_OVERRIDES,
  };
}

function compileViaDetachedWizardConfig(chart: KnitlabChartState): string {
  const config: KniterateWizardConfig = {
    ...manualDbjWizardConfig(),
  };
  const state = deriveKniterateExportState(config, null);
  return toKc(compileExportFromState(chart, PALETTE, state, { developerMode: true }));
}

const BODY_REGION = { start: 112, end: 459 };

describe('dbj.kc machine-equivalent parity', () => {
  const { design, chart } = buildDbjChart();
  const wizardKc = compileViaDetachedWizardConfig(chart);
  const diff = diffKc(wizardKc, REFERENCE, { maxDeltas: 400 });

  it('decodes the reference design to 70 authored rows over carriers 2..5', () => {
    expect(design.patternCarriers).toEqual(['2', '3', '4', '5']);
    expect(design.width).toBe(70);
    expect(design.rows.slice(0, 70)).toHaveLength(70);
  });

  it('uses a detached/manual wizard config rather than a DBJ recipe preset', () => {
    const config = manualDbjWizardConfig();
    expect(config.recipeId).toBeNull();
    expect(config.recipeOverrides.body?.backBedStyle).toBe('birdseye');
    expect(config.recipeOverrides.body?.birdseyeMode).toBe('full');
    expect(config.recipeOverrides.start?.wasteCarrierOverride).toBe('6');
    expect(config.protectFirstBodyRow).toBe(false);
  });

  it('the entire body footer schedule matches the reference', () => {
    const bodyDeltas = diff.deltas.filter(
      d => d.index >= BODY_REGION.start && d.index <= BODY_REGION.end,
    );
    expect(bodyDeltas).toHaveLength(0);
  });

  it('matches the reference at machine-equivalent footer parity', () => {
    expect(diff.deltaCount).toBe(0);
    expect(diff.deltas).toEqual([]);
  });
});
