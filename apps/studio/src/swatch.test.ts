import { describe, expect, it } from 'vitest';
import { appendProjectEdit, createColorworkProjectV1, materializeColorworkProject } from '@kniterate-studio/project-contract';
import { createBeanieProject } from './beanie';
import { runAuthoredPipeline } from './authoredPipeline';
import { planProject } from './plan';
import { createSweaterProject } from './sweater/sweater';
import { createPanelProject, planPanel } from './sweater/panel';
import { runSweaterPipeline } from './sweater/sweaterPipeline';
import { swatchKey, swatchProject, SWATCH_CM } from './swatch';

const gauge = { stitchesPer10cm: 26, rowsPer10cm: 34, source: 'assumed' as const };
const rib = { stitchesPer10cm: 30, rowsPer10cm: 32, source: 'assumed' as const };

describe('a swatch knits the project’s own fabric', () => {
  it('a sweater or scarf swatch is its body stitch between rib bands, at its gauge, and can be knitted', { timeout: 120_000 }, async () => {
    const sweater = createSweaterProject({ title: 'Jumper', silhouette: 'set-in', neckline: 'crew', size: 'M', fit: 'classic', textureId: 'seed', yarn: { name: 'Oatmeal', hex: '#D9CBB0' } }, { id: 'jumper', source: 'human', group: 'create' });
    const scarf = createPanelProject({ title: 'Scarf', widthCm: 25, lengthCm: 160, textureId: 'garter', ends: { rib: 'kp', cm: 4 }, yarn: { name: 'Moss', hex: '#6B7F4E' } }, { id: 'scarf', source: 'human', group: 'create' });
    for (const project of [sweater, scarf]) {
      const { state } = materializeColorworkProject(project);
      const swatch = swatchProject(project)!;
      const swatchState = materializeColorworkProject(swatch).state;
      const object = swatchState.object!;
      expect(object.kind).toBe('panel');
      if (object.kind !== 'panel' || (state.object?.kind !== 'sweater' && state.object?.kind !== 'panel')) throw new Error('unreachable');
      expect(object.body).toEqual(state.object.body);
      expect(object.ends.rib).toBe(state.object.kind === 'sweater' ? state.object.trims.hem.rib : state.object.ends.rib);
      expect(object.widthCm).toBe(SWATCH_CM);
      expect(swatchState.gauge).toEqual(state.gauge);
      expect(swatchState.chart.palette[0]!.hex).toBe(state.chart.palette[0]!.hex);
      expect(planPanel(swatchState).findings.filter((finding) => finding.severity === 'error')).toEqual([]);
      const result = await runSweaterPipeline(swatch);
      expect(result.exportReady).toBe(true);
      expect(result.verdict.state).not.toBe('blocked');
    }
  });

  it('a beanie swatch is a narrow beanie with an unfolded cuff, in its yarns, backing and gauge, and can be knitted', { timeout: 120_000 }, async () => {
    for (const backing of ['birdseye', 'fairisle'] as const) {
      const hat = createBeanieProject({ title: 'Toque', headCircumferenceCm: 56, bodyCm: 13, bodyGauge: gauge, cuffCm: 7, ribGauge: rib, fold: true, backing, main: { name: 'Black', hex: '#111111' }, accent: { name: 'White', hex: '#F2F2F2' } }, { id: 'toque', source: 'human', group: 'create' });
      const swatch = swatchProject(hat)!;
      const { state, placements } = materializeColorworkProject(swatch);
      expect(state.object?.kind).toBe('beanie');
      expect(state.strategy.technique).toBe(backing);
      expect(state.gauge).toEqual(gauge);
      expect(state.chart.width).toBe(62);
      const plan = planProject(state, placements);
      expect(plan.sections?.cuff?.folds).toBe(false);
      // Both yarns are in the body, as under a motif.
      const body = state.chart.cells.slice(0, state.chart.height - plan.sections!.cuff!.rows).flat();
      expect(new Set(body)).toEqual(new Set([0, 1]));
      const result = await runAuthoredPipeline(swatch);
      expect(result.exportReady).toBe(true);
    }
    const ribHat = createBeanieProject({ title: 'Rib hat', headCircumferenceCm: 56, bodyCm: 13, bodyGauge: rib, main: { name: 'Black', hex: '#111111' } }, { id: 'rib-hat', source: 'human', group: 'create' });
    expect((await runAuthoredPipeline(swatchProject(ribHat)!)).exportReady).toBe(true);
  });

  it('a colour chart swatch is a piece of the chart, in its colours and backing; a chart with no gauge has none', { timeout: 120_000 }, async () => {
    const width = 120; const height = 160;
    const chart = createColorworkProjectV1({
      kind: 'knitlab-colorwork-chart', version: 1, title: 'Blanket', width, height, rowNumbering: 'bottom-up',
      palette: [{ id: 'natural', name: 'Natural', hex: '#F4F0E6' }, { id: 'red', name: 'Red', hex: '#C2413A' }],
      cells: Array.from({ length: height }, (_, row) => Array.from({ length: width }, (_, column) => ((row >> 2) + (column >> 2)) % 2)),
    }, { id: 'blanket', title: 'Blanket' });
    expect(swatchProject(chart)).toBeNull();
    const sized = appendProjectEdit(chart, { id: 'gauge', source: 'human', edit: { kind: 'set-gauge', gauge } });
    const swatch = swatchProject(sized)!;
    const { state } = materializeColorworkProject(swatch);
    const original = materializeColorworkProject(sized).state;
    expect(state.chart.width).toBe(Math.round(SWATCH_CM * gauge.stitchesPer10cm / 10));
    expect(state.chart.height).toBe(Math.round(SWATCH_CM * gauge.rowsPer10cm / 10));
    expect(state.strategy).toEqual(original.strategy);
    expect(state.machine.yarnAssignments).toEqual(original.machine.yarnAssignments);
    expect(state.chart.cells.at(-1)).toEqual(original.chart.cells.at(-1)!.slice((width - state.chart.width) >> 1, ((width - state.chart.width) >> 1) + state.chart.width));
    expect((await runAuthoredPipeline(swatch)).exportReady).toBe(true);
  });
});

describe('the swatch key', () => {
  it('names what the swatch file is made from: its settings change it, the design alone does not', () => {
    const hat = createBeanieProject({ title: 'Toque', headCircumferenceCm: 56, bodyCm: 13, bodyGauge: gauge, cuffCm: 7, ribGauge: rib, fold: true, backing: 'fairisle', main: { name: 'Black', hex: '#111111' }, accent: { name: 'White', hex: '#F2F2F2' } }, { id: 'toque', source: 'human', group: 'create' });
    const key = swatchKey(hat);
    expect(key).not.toBeNull();
    expect(swatchKey(hat)).toBe(key);
    const target = materializeColorworkProject(hat).state.target;
    expect(swatchKey(appendProjectEdit(hat, { id: 'taller', source: 'human', edit: { kind: 'set-target', target: { ...target, heightCm: 15 } } }))).toBe(key);
    expect(swatchKey(appendProjectEdit(hat, { id: 'waste', source: 'human', edit: { kind: 'set-machine-setup', setup: { wasteRows: 40 } } }))).not.toBe(key);
    expect(swatchKey(appendProjectEdit(hat, { id: 'gauge', source: 'human', edit: { kind: 'set-gauge', gauge: { ...gauge, stitchesPer10cm: 24 } } }))).not.toBe(key);
  });
});
