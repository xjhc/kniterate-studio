import { describe, expect, it } from 'vitest';
import { appendProjectEdit, createColorworkProjectV1, materializeColorworkProject } from '@kniterate-studio/project-contract';
import { createBeanieProject } from './beanie';
import { runAuthoredPipeline } from './authoredPipeline';
import { colourworkColours, projectBackingWords } from './backing';

const gauge = { stitchesPer10cm: 26, rowsPer10cm: 34, source: 'assumed' as const };
const rib = { stitchesPer10cm: 30, rowsPer10cm: 32, source: 'assumed' as const };
const main = { name: 'Black', hex: '#111111' };

function chart(cells: number[][]) {
  return createColorworkProjectV1({
    kind: 'knitlab-colorwork-chart', version: 1, title: 'Chart', width: cells[0]!.length, height: cells.length, rowNumbering: 'bottom-up',
    palette: [{ id: 'natural', name: 'Natural', hex: '#F4F0E6' }, { id: 'red', name: 'Red', hex: '#C2413A' }],
    cells,
  }, { id: 'chart', title: 'Chart' });
}

describe('the backing in plain words', () => {
  it('a one-colour chart has no backing to choose; a second colour brings the choice back', () => {
    const plain = materializeColorworkProject(chart([[0, 0, 0], [0, 0, 0]])).state;
    expect(colourworkColours(plain)).toBe(1);
    expect(projectBackingWords(plain)).toBeNull();
    const two = materializeColorworkProject(chart([[0, 1, 0], [0, 0, 0]])).state;
    expect(projectBackingWords(two)?.name).toBe('Fairisle');
  });

  it('a one-yarn beanie body is one layer or two; a rib beanie has no backing', async () => {
    const hat = (backing: 'fairisle' | 'birdseye') => createBeanieProject({ title: 'Plain hat', headCircumferenceCm: 56, bodyCm: 13, bodyGauge: gauge, cuffCm: 7, ribGauge: rib, fold: true, backing, main }, { id: `plain-${backing}`, source: 'human', group: 'create' });
    const double = hat('birdseye');
    const single = hat('fairisle');
    expect(projectBackingWords(materializeColorworkProject(double).state)?.name).toBe('Double layer');
    expect(projectBackingWords(materializeColorworkProject(single).state)?.name).toBe('Single layer');
    // Both can be knitted, and they are different fabrics: birdseye knits the back layer in the same yarn.
    const [doubleRun, singleRun] = await Promise.all([runAuthoredPipeline(double), runAuthoredPipeline(single)]);
    expect(doubleRun.exportReady).toBe(true);
    expect(singleRun.exportReady).toBe(true);
    expect(doubleRun.compiled!.knitoutText).toContain('BIRDSEYE COLORWORK BODY');
    expect(singleRun.compiled!.knitoutText).not.toContain('BIRDSEYE COLORWORK BODY');

    // Painting the accent into the body makes it colourwork again.
    const withAccent = createBeanieProject({ title: 'Hat', headCircumferenceCm: 56, bodyCm: 13, bodyGauge: gauge, cuffCm: 7, ribGauge: rib, fold: true, backing: 'birdseye', main, accent: { name: 'White', hex: '#F2F2F2' } }, { id: 'hat', source: 'human', group: 'create' });
    expect(projectBackingWords(materializeColorworkProject(withAccent).state)?.name).toBe('Double layer');
    const { rowIds } = materializeColorworkProject(withAccent).state;
    const painted = appendProjectEdit(withAccent, { id: 'dot', source: 'human', edit: { kind: 'paint-cells', cells: [{ rowId: rowIds[0]!, column: 0, paletteIndex: 1 }] } });
    expect(projectBackingWords(materializeColorworkProject(painted).state)?.name).toBe('Birdseye');

    const ribHat = createBeanieProject({ title: 'Rib hat', headCircumferenceCm: 56, bodyCm: 13, bodyGauge: rib, main }, { id: 'rib-hat', source: 'human', group: 'create' });
    expect(colourworkColours(materializeColorworkProject(ribHat).state)).toBeNull();
    expect(projectBackingWords(materializeColorworkProject(ribHat).state)).toBeNull();
  }, 120_000);
});
