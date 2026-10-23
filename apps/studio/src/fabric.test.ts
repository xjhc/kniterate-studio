import { describe, expect, it } from 'vitest';
import { materializeColorworkProject, undoProjectEdit, type ColorworkProjectV1, type MachineSetup, type ProjectEdit, type SweaterObject } from '@kniterate-studio/project-contract';
import { createBeanieProject } from './beanie';
import { appendDesignOperation, gaugeFabrics } from './fabric';
import { createSweaterProject } from './sweater/sweater';
import { textureById } from './sweater/textures';

/** A gauge is measured on one fabric: a stitch, a backing or a rib, at its stitch size. Any operation that changes the fabric marks the gauge "measure again", keeping its numbers. */

const measured = { stitchesPer10cm: 24, rowsPer10cm: 30, source: 'measured' as const };
const sweater = () => createSweaterProject({ title: 'Jumper', silhouette: 'set-in', neckline: 'crew', size: 'M', fit: 'classic', textureId: 'stockinette', yarn: { name: 'Oat', hex: '#D9CBB0' }, gauge: measured, ribGauge: { stitchesPer10cm: 30, rowsPer10cm: 32, source: 'measured' } }, { id: 'jumper', source: 'human', group: 'create' });
const stateOf = (project: ColorworkProjectV1) => materializeColorworkProject(project).state;
const objectOf = (project: ColorworkProjectV1) => stateOf(project).object as SweaterObject;
const setup = (value: MachineSetup | null): ProjectEdit => ({ kind: 'set-machine-setup', setup: value });

describe('a change of fabric', () => {
  it('marks the body gauge "measure again" when the body stitch size changes, and measured again back at it', () => {
    const tighter = appendDesignOperation(sweater(), 'Body stitch size 11', [setup({ body: { stitch: 11 } })]);
    expect(stateOf(tighter).gauge).toEqual({ ...measured, source: 'assumed', note: 'Measured on Stockinette' });
    expect(gaugeFabrics(stateOf(tighter)).body?.name).toBe('Stockinette at stitch size 11');
    const back = appendDesignOperation(tighter, 'Standard body settings', [setup(null)]);
    expect(stateOf(back).gauge).toEqual(measured);
    // One operation: undo puts the gauge back with the setting.
    expect(stateOf(undoProjectEdit(tighter)).gauge).toEqual(measured);
  });

  it('marks the rib gauge "measure again" when a rib changes, and when its stitch size does', () => {
    const project = sweater();
    const object = objectOf(project);
    const hem = appendDesignOperation(project, 'Hem: 1×1 rib', [{ kind: 'set-object', object: { ...object, trims: { ...object.trims, hem: { ...object.trims.hem, rib: 'kp' } } } }]);
    expect(objectOf(hem).ribGauge).toEqual({ stitchesPer10cm: 30, rowsPer10cm: 32, source: 'assumed', note: 'Measured on 2×2 rib' });
    expect(objectOf(hem).trims.hem.rib).toBe('kp');
    expect(stateOf(hem).gauge).toEqual(measured);
    const rib = appendDesignOperation(project, 'Rib stitch size 6', [setup({ rib: { stitch: 6 } })]);
    expect(objectOf(rib).ribGauge?.note).toBe('Measured on 2×2 rib');
    expect(stateOf(rib).gauge).toEqual(measured);
  });

  it('gives a typical gauge the new stitch’s typical values, as the stitch picker always has', () => {
    const typical = createSweaterProject({ title: 'Jumper', silhouette: 'set-in', neckline: 'crew', size: 'M', fit: 'classic', textureId: 'stockinette', yarn: { name: 'Oat', hex: '#D9CBB0' } }, { id: 'typical', source: 'human', group: 'create' });
    const seed = textureById('seed')!;
    const next = appendDesignOperation(typical, 'Seed stitch', [{ kind: 'set-object', object: { ...objectOf(typical), body: { name: seed.name, texture: [...seed.rows] } } }]);
    expect(stateOf(next).gauge).toEqual({ ...seed.gauge, source: 'assumed' });
  });

  it('leaves alone a gauge the operation sets itself, and a change that is not one of fabric', () => {
    const own = appendDesignOperation(sweater(), 'Body stitch size 11 and a new swatch', [setup({ body: { stitch: 11 } }), { kind: 'set-gauge', gauge: { stitchesPer10cm: 25, rowsPer10cm: 31, source: 'measured' } }]);
    expect(stateOf(own).gauge).toEqual({ stitchesPer10cm: 25, rowsPer10cm: 31, source: 'measured' });
    const speed = appendDesignOperation(sweater(), 'Body speed 250', [setup({ body: { speed: 250 } })]);
    expect(stateOf(speed).gauge).toEqual(measured);
  });

  it('follows a beanie’s backing and its cuff’s stitch size', () => {
    const hat = createBeanieProject({ title: 'Hat', headCircumferenceCm: 56, bodyCm: 13, bodyGauge: measured, cuffCm: 7, ribGauge: { stitchesPer10cm: 30, rowsPer10cm: 32, source: 'measured' }, fold: true, main: { name: 'Black', hex: '#111111' }, accent: { name: 'White', hex: '#F2F2F2' } }, { id: 'hat', source: 'human', group: 'create' });
    const state = stateOf(hat);
    const backing = state.strategy.technique === 'birdseye' ? 'fairisle' : 'birdseye';
    const switched = appendDesignOperation(hat, `Backing: ${backing}`, [{ kind: 'set-strategy', strategy: { ...state.strategy, technique: backing } }]);
    expect(stateOf(switched).gauge?.note).toBe(`Measured on ${gaugeFabrics(state).body?.name}`);
    expect(gaugeFabrics(stateOf(switched)).body?.name).not.toBe(gaugeFabrics(state).body?.name);
    const cuff = appendDesignOperation(hat, 'Rib stitch size 6', [setup({ rib: { stitch: 6 } })]);
    expect(stateOf(cuff).object?.ribGauge?.note).toBe('Measured on 2×2 rib');
    expect(stateOf(cuff).gauge).toEqual(measured);
  });
});
