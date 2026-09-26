/**
 * DBJ reference comparison. The frame comes from the captured program;
 * the authored body uses the generic Birdseye contract, not its fixture-
 * specific full-back schedule. Exact authored row coverage is tested through
 * the Studio pipeline in birdseyeBody.test.ts.
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
import { CUSTOMIST_STUDIO_BIRDSEYE_7GG_OVERRIDES } from '../../src/knitout/recipes/customist-studio-birdseye-7gg.js';
import {
  DEFAULT_KNITERATE_WIZARD_CONFIG,
  deriveKniterateExportState,
  type KniterateWizardConfig,
  type RecipeOverrides,
} from '../../src/knitout/wizard-config.js';
import { writeKnitoutProgram } from '../../src/knitout/emitter.js';
import { diffKc } from '../../src/knitout/kc-diff.js';
import { buildCustomistMatchedCompileInputV1 } from '../../src/knitout/recipes/customist-matched.js';
import { compileChartToKnitout } from '../../src/knitout/compile/from-chart.js';
import { diffTraceStitchesV1 } from '../../src/knitout/kcode/trace-stitch-diff.js';
import { parseKCodeDocument } from '../../src/knitout/kcode/parser.js';
import { projectKCodeMachineTrace } from '../../src/knitout/kcode/machine-trace.js';
import { KNITERATE_7GG_KCODE_PROFILE_V2 } from '../../src/knitout/kcode/machine-profile.js';
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

const DBJ_MANUAL_OVERRIDES: RecipeOverrides = CUSTOMIST_STUDIO_BIRDSEYE_7GG_OVERRIDES;

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

const BODY_START_PASS = 112;

describe('dbj.kc frame comparison and explicit body divergence', () => {
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

  it('preserves the captured introduction footer schedule', () => {
    const frameDeltas = diff.deltas.filter((delta) => delta.index < BODY_START_PASS);
    expect(frameDeltas).toEqual([]);
  });

  it('reports the generic Birdseye body as different from the captured full-back program', () => {
    const trace = (kcode: string) => {
      const parsed = parseKCodeDocument(kcode, { profile: KNITERATE_7GG_KCODE_PROFILE_V2, dialect: 'knitout-vendor', strict: true });
      if (!parsed.ok) throw new Error('not strict KCode');
      return projectKCodeMachineTrace(parsed.document, KNITERATE_7GG_KCODE_PROFILE_V2);
    };
    const reference = trace(REFERENCE);
    const authored = trace(wizardKc);
    const stitches = diffTraceStitchesV1(reference, authored);
    // A score or matching footer is not a correctness gate. Generic
    // front/back passes deliberately differ; do not bless this as exact
    // Customist parity by pinning a replacement identical-pass count.
    expect(diff.deltaCount).toBeGreaterThan(0);
    expect(stitches.actualPasses).toBeGreaterThan(stitches.expectedPasses);
    expect(stitches.differingPassIndices.some((index) => index >= BODY_START_PASS)).toBe(true);
  });

  it('Studio and the detached configuration share the same body, apart from first-row protection', () => {
    const { annotations: _annotations, ...plain } = chart;
    const input = buildCustomistMatchedCompileInputV1({ technique: 'birdseye', chart: plain, keyPalette: PALETTE, yarnBindings: BINDINGS });
    const studioDiff = diffKc(toKc(compileChartToKnitout(input)), wizardKc, { maxDeltas: 400 });
    expect(studioDiff.deltas.every((delta) => delta.field === 'speed')).toBe(true);
    expect(studioDiff.deltaCount).toBeGreaterThan(0);
  });
});
