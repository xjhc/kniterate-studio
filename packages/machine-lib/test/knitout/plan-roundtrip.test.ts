/**
 * B1.0a byte-parity gate: the chart → plan → program path must emit
 * byte-identical KnitoutProgram to the legacy chart → program path. The
 * existing snapshot tests (from-chart-stockinette, from-chart-jacquard,
 * from-chart-stitch-overrides, from-chart-jacquard-lined) cover this
 * implicitly — if they all pass post-refactor, byte parity holds.
 *
 * This file adds plan-shape assertions: the Plan must be JSON-safe,
 * round-trip through JSON.stringify, and surface every yarn binding /
 * carrier assignment / pass purpose the wizard / notes generator reads.
 */

import { describe, expect, it } from 'vitest';
import { compileChartToKnitout } from '../../src/knitout/compile/from-chart.js';
import { compilePlanToKnitout } from '../../src/knitout/plan/plan-to-knitout.js';
import {
  DEFAULT_KEY_PALETTE,
  KEY_ID_KNIT_DEFAULT,
  type KnitlabChartState,
  type KnitlabKeyDefinition,
} from '../../src/colorwork/knitlab1-contract.js';
import { writeKnitoutProgram } from '../../src/knitout/emitter.js';
import type { YarnBinding } from '../../src/knitout/types.js';

function simpleStockinetteChart(rows = 8, cols = 12): KnitlabChartState {
  return {
    id: 'plan-test',
    rows,
    cols,
    orientation: 'bottom-up',
    name: 'plan-test',
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

function fairIsleChart(rows = 6, cols = 8): KnitlabChartState {
  const KEY_NAVY: KnitlabKeyDefinition = {
    id: 'navy',
    name: 'Navy',
    width: 1, height: 1,
    backgroundColor: '#001f4d',
    symbolColor: '#fff',
    cells: [[null]],
  };
  const placements = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if ((r + c) % 2 === 0) placements.push({ anchor: { x: c, y: r }, keyId: KEY_NAVY.id });
    }
  }
  return {
    id: 'fi',
    rows,
    cols,
    orientation: 'bottom-up',
    name: 'fi',
    displaySettings: { rowCountVisibility: 'right', colCountVisibility: 'bottom' },
    layers: [{ id: 'base', name: 'Base', isVisible: true, grid: {}, keyPlacements: placements }],
    activeLayerId: 'base',
  };
}

const NAVY_KEY: KnitlabKeyDefinition = {
  id: 'navy', name: 'Navy', width: 1, height: 1,
  backgroundColor: '#001f4d', symbolColor: '#fff', cells: [[null]],
};

describe('compileChartToKnitout → plan + program', () => {
  it('returns a plan alongside the program', () => {
    const result = compileChartToKnitout({
      chart: simpleStockinetteChart(),
      keyPalette: DEFAULT_KEY_PALETTE,
      yarnBindings: [{ keyId: KEY_ID_KNIT_DEFAULT, carrier: '2', name: 'merino' }],
    });
    expect(result.ok).toBe(true);
    expect(result.plan).toBeDefined();
    expect(result.plan!.machine).toBe('kniterate');
    expect(result.plan!.source.kind).toBe('chart');
  });

  it('plan → program round-trip is byte-identical to compileChartToKnitout', () => {
    const bindings: YarnBinding[] = [
      { keyId: KEY_ID_KNIT_DEFAULT, carrier: '2', name: 'merino' },
      { keyId: 'navy', carrier: '3', name: 'navy wool' },
    ];
    const result = compileChartToKnitout({
      chart: fairIsleChart(),
      keyPalette: [...DEFAULT_KEY_PALETTE, NAVY_KEY],
      yarnBindings: bindings,
    });
    expect(result.ok).toBe(true);
    const direct = writeKnitoutProgram(result.program!);
    const viaPlan = writeKnitoutProgram(compilePlanToKnitout(result.plan!));
    expect(viaPlan).toBe(direct);
  });

  it('plan is JSON-safe (round-trips through stringify/parse)', () => {
    const result = compileChartToKnitout({
      chart: simpleStockinetteChart(),
      keyPalette: DEFAULT_KEY_PALETTE,
      yarnBindings: [{ keyId: KEY_ID_KNIT_DEFAULT, carrier: '2', name: 'merino' }],
    });
    const json = JSON.stringify(result.plan);
    const parsed = JSON.parse(json);
    expect(parsed.machine).toBe('kniterate');
    expect(parsed.carriers.length).toBe(result.plan!.carriers.length);
    expect(parsed.passes.length).toBe(result.plan!.passes.length);
    // Critical: no Map instances survive serialization, so bindings need
    // to be records, not Maps.
    expect(Array.isArray(parsed.yarnBindings)).toBe(false);
    expect(typeof parsed.yarnBindings).toBe('object');
  });

  it('plan surfaces per-pass purpose labels', () => {
    const result = compileChartToKnitout({
      chart: simpleStockinetteChart(),
      keyPalette: DEFAULT_KEY_PALETTE,
      yarnBindings: [{ keyId: KEY_ID_KNIT_DEFAULT, carrier: '2', name: 'merino' }],
    });
    const purposes = result.plan!.passes.map(p => p.purpose);
    expect(purposes).toContain('settings');
    expect(purposes).toContain('waste');
    expect(purposes).toContain('body');
    expect(purposes).toContain('bind-off');
  });

  it('plan carriers include draw + waste + each pattern color', () => {
    const result = compileChartToKnitout({
      chart: fairIsleChart(),
      keyPalette: [...DEFAULT_KEY_PALETTE, NAVY_KEY],
      yarnBindings: [
        { keyId: KEY_ID_KNIT_DEFAULT, carrier: '2', name: 'merino' },
        { keyId: 'navy', carrier: '3', name: 'navy wool' },
      ],
    });
    const roles = result.plan!.carriers.map(c => c.role);
    expect(roles).toContain('draw');
    expect(roles).toContain('waste');
    expect(roles.filter(r => r === 'pattern')).toHaveLength(2);
  });

  it('notes content includes machine settings and dimensions', () => {
    const result = compileChartToKnitout({
      chart: simpleStockinetteChart(10, 16),
      keyPalette: DEFAULT_KEY_PALETTE,
      yarnBindings: [{ keyId: KEY_ID_KNIT_DEFAULT, carrier: '2', name: 'merino' }],
    });
    const notes = result.plan!.notes;
    // These values track DEFAULT_KNITERATE_HEADERS / DEFAULT_WASTE_PASSES
    // (src/knitout/kniterate/constants.ts). When Cameron's recommended
    // settings are updated, both sides move together.
    expect(notes.machineSettings.stitchNumber).toBe(6);
    expect(notes.machineSettings.speedNumber).toBe(300);
    expect(notes.machineSettings.wastePasses).toBe(80);
    expect(notes.dimensions.needleCount).toBe(16);
    expect(notes.dimensions.estimatedRows).toBe(10);
  });
});
