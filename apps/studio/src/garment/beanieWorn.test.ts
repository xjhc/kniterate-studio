import { describe, expect, it } from 'vitest';
import { appendProjectEdit, materializeColorworkProject } from '@kniterate-studio/project-contract';
import { createBeanieProject } from '../beanie';
import { planProject } from '../plan';
import { beanieWornLayout } from './beanieWorn';

const gauge = { stitchesPer10cm: 26, rowsPer10cm: 34, source: 'assumed' as const };
const rib = { stitchesPer10cm: 30, rowsPer10cm: 32, source: 'assumed' as const };

function hat(paint: (rowIds: readonly string[], width: number) => { rowId: string; column: number; paletteIndex: number }[] = () => []) {
  let project = createBeanieProject({ title: 'Hat', headCircumferenceCm: 56, bodyCm: 13, bodyGauge: gauge, cuffCm: 7, ribGauge: rib, fold: true, backing: 'fairisle', main: { name: 'Black', hex: '#111111' }, accent: { name: 'White', hex: '#F2F2F2' } }, { id: 'hat', source: 'human', group: 'create' });
  const { state } = materializeColorworkProject(project);
  const cells = paint(state.rowIds, state.chart.width);
  if (cells.length > 0) project = appendProjectEdit(project, { id: 'paint', source: 'human', edit: { kind: 'paint-cells', cells } });
  const materialized = materializeColorworkProject(project);
  const plan = planProject(materialized.state, materialized.placements);
  const layout = (side: 'front' | 'back') => beanieWornLayout({ cells: materialized.state.chart.cells, palette: materialized.state.chart.palette, ribRows: plan.sections!.cuff!.rows, sections: plan.sections!, circumferenceCm: plan.predicted!.widthCm.value, side })!;
  return { plan, layout };
}

describe('the beanie as worn', () => {
  it('stands on the folded cuff, runs up the side and closes over the top', () => {
    const { plan, layout } = hat();
    const front = layout('front');
    expect(front.radius).toBeCloseTo(plan.predicted!.widthCm.value / (2 * Math.PI), 6);
    expect(front.cuff).toMatchObject({ top: plan.sections!.cuff!.visibleCm!.value });
    expect(front.cuff!.halfWidth).toBeGreaterThan(front.radius);
    expect(front.outline[0]).toEqual({ x: front.radius, y: front.cuff!.top });
    expect(front.outline.at(-1)!.x).toBe(0);
    // Above the cuff it is the body and crown's knitted length, over a rounded top as wide as the hat.
    const length = plan.sections!.body.cm!.value + plan.sections!.crown!.cm!.value;
    expect(front.height).toBeCloseTo(front.cuff!.top + length - (Math.PI / 2) * front.radius + front.radius, 6);
    // A plain body shows only its ground colour.
    expect(front.body).toEqual([]);
    expect(front.seam).toBeNull();
    expect(layout('back').seam).toBe(0);
  });

  it('shows the middle of the chart on the front and its edges, at the seam, on the back', () => {
    // A white stitch at the chart's centre and one at its left edge, on the body's lowest row.
    const { layout } = hat((rowIds, width) => {
      const row = rowIds[rowIds.length - 46]!;
      return [{ rowId: row, column: width / 2, paletteIndex: 1 }, { rowId: row, column: 0, paletteIndex: 1 }];
    });
    const front = layout('front').body;
    expect(front).toHaveLength(1);
    expect(Math.abs(front[0]!.x0 + front[0]!.x1) / 2).toBeLessThan(0.2);
    const back = layout('back').body;
    expect(back).toHaveLength(1);
    // Just right of the seam, as seen from behind.
    expect(back[0]!.x0).toBeGreaterThanOrEqual(-1e-9);
    expect(back[0]!.x1).toBeLessThan(0.5);
  });
});
