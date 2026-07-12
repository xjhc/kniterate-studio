/**
 * Fairisle byte-parity harness (durable replacement for the ad-hoc
 * tmp/clawd repro script).
 *
 * Drives the real productized path the wizard uses —
 *   decode reference design → author chart → applyMachineRecipe →
 *   compileExportFromState → knitout → kc → diffKc(vs reference)
 * — and pins the current parity state:
 *
 *   - all 286 footer-level machine passes match the reference
 *     (direction / pass type / carrier / speed / roller);
 *   - the wizard config seam compiles to the same `.kc` as the direct
 *     recipe projection.
 *
 * This is footer / machine-equivalent parity, not raw FRNT/STIF byte
 * parity. The latter is intentionally outside this harness.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { buildPunchcardChart } from '../../src/colorwork/punchcard.js';
import {
  DEFAULT_KEY_PALETTE,
  KEY_ID_KNIT_DEFAULT,
  type KnitlabKeyDefinition,
} from '../../src/colorwork/knitlab1-contract.js';
import {
  DEFAULT_KNITERATE_EXPORT_STATE,
  applyMachineRecipe,
  compileExportFromState,
} from '../../src/knitout/export-helpers.js';
import {
  DEFAULT_KNITERATE_WIZARD_CONFIG,
  deriveKniterateExportState,
  type KniterateWizardConfig,
} from '../../src/knitout/wizard-config.js';
import { CUSTOMIST_STUDIO_FAIRISLE_7GG_RECIPE } from '../../src/knitout/recipes/index.js';
import { writeKnitoutProgram } from '../../src/knitout/emitter.js';
import { knitoutToKCode } from '../../src/knitout/kniterate/to-kcode.js';
import { diffKc } from '../../src/knitout/kc-diff.js';
import type { CompileChartResult } from '../../src/knitout/compile/from-chart.js';
import type { KnitlabChartState } from '../../src/colorwork/knitlab1-contract.js';
import { decodeCustomistDesign } from './reference-kc/customist-design-decode.js';

const REFERENCE = readFileSync(resolve('reference/fairisle.kc'), 'utf8');
const SECONDARY = 'fairisle_secondary';
const PALETTE: KnitlabKeyDefinition[] = [
  ...DEFAULT_KEY_PALETTE,
  { id: SECONDARY, name: 'Secondary', width: 1, height: 1, backgroundColor: '#0a1f44', symbolColor: '#fff', cells: [[null]] },
];

const BINDINGS = [
  // Carrier 4 = primary/cast-on color (KNIT_DEFAULT); carrier 3 = secondary
  // — matches the reference intro order (4 → 3 → 1 cameo).
  { keyId: KEY_ID_KNIT_DEFAULT, carrier: '4' as const, name: 'cream' },
  { keyId: SECONDARY, carrier: '3' as const, name: 'navy' },
];

/** Author the fairisle chart from the decoded reference design. */
function buildFairisleChart() {
  // The first fairisle roller-450 row in the reference is the carrier
  // intro's ramp handoff, which the recipe emits. The authored body chart
  // starts after that row.
  const design = decodeCustomistDesign(REFERENCE, { skipLeadingRows: 1 });
  const cells: string[][] = design.rows.map(row => {
    const r: string[] = [];
    for (let c = design.lo; c <= design.hi; c++) {
      r.push(row.get(c) === '4' ? KEY_ID_KNIT_DEFAULT : SECONDARY);
    }
    return r;
  });
  const chart = buildPunchcardChart({
    name: 'fairisle-parity', cols: design.width, rows: design.rows.length,
    tile: { cols: design.width, rows: design.rows.length, cells },
  });
  return { design, chart };
}

function toKc(result: CompileChartResult): string {
  if (!result.ok) {
    throw new Error('fairisle compile failed: ' + result.messages.filter(m => m.severity === 'error').map(m => m.rule).join(', '));
  }
  const kc = knitoutToKCode(writeKnitoutProgram(result.program!));
  if (!kc.ok) throw new Error('kcode failed: ' + kc.stderr);
  return kc.kcode!;
}

/** Direct recipe path: applyMachineRecipe → compileExportFromState. */
function compileViaRecipe(chart: KnitlabChartState): string {
  let state = { ...DEFAULT_KNITERATE_EXPORT_STATE, bindings: BINDINGS };
  state = applyMachineRecipe(state, CUSTOMIST_STUDIO_FAIRISLE_7GG_RECIPE);
  return toKc(compileExportFromState(chart, PALETTE, state, { developerMode: true }));
}

/** Wizard config seam: persisted KniterateWizardConfig (recipeId) →
 *  deriveKniterateExportState → compileExportFromState. This is the path
 *  the UI's export panel drives (the manifest's "compile identity"
 *  seam) — proving it without a flaky browser click-through. */
function compileViaWizardConfig(chart: KnitlabChartState): string {
  const config: KniterateWizardConfig = {
    ...DEFAULT_KNITERATE_WIZARD_CONFIG,
    recipeId: CUSTOMIST_STUDIO_FAIRISLE_7GG_RECIPE.id,
    yarns: BINDINGS,
  };
  const state = deriveKniterateExportState(config, CUSTOMIST_STUDIO_FAIRISLE_7GG_RECIPE);
  return toKc(compileExportFromState(chart, PALETTE, state, { developerMode: true }));
}

// Body design pass-index window (deltas here would mean the colorwork
// itself diverged). Bounded by the intro end and the closing start.
const BODY_REGION = { start: 127, end: 259 };
// Slice C: the recipe/wizard-projected waste config now emits the
// Customist tubular-tuck pair at passes 6-7, so the footer-level
// machine-equivalence gate is closed.
const EXPECTED_DELTA_COUNT = 0;

describe('fairisle.kc byte-parity (recipe path)', () => {
  const { design, chart } = buildFairisleChart();
  const recipeKc = compileViaRecipe(chart);
  const diff = diffKc(recipeKc, REFERENCE, { maxDeltas: 400 });

  it('decodes the reference body design to 64×50 over carriers 3 + 4', () => {
    expect(design.patternCarriers).toEqual(['3', '4']);
    expect(design.width).toBe(64);
    expect(design.rows.length).toBe(50);
  });

  it('the wizard config seam produces a byte-identical .kc to the direct recipe path', () => {
    // KniterateWizardConfig → deriveKniterateExportState → compile is the
    // path the UI export panel drives; it must reach the same machine
    // output as applyMachineRecipe (compile identity).
    expect(compileViaWizardConfig(chart)).toBe(recipeKc);
  });

  it('cast-on prologue is byte-identical (no deltas in passes 0..5)', () => {
    expect(diff.deltas.filter(d => d.index <= 5)).toHaveLength(0);
  });

  it('the entire body design is byte-identical', () => {
    const bodyDeltas = diff.deltas.filter(
      d => d.index >= BODY_REGION.start && d.index <= BODY_REGION.end,
    );
    expect(bodyDeltas).toHaveLength(0);
  });

  it('matches the reference at machine-equivalent footer parity', () => {
    expect(diff.deltaCount).toBe(EXPECTED_DELTA_COUNT);
    expect(diff.deltas).toEqual([]);
  });
});
