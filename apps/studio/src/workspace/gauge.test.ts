import { describe, expect, it } from 'vitest';
import { regauge, swatchWords } from './gauge';

const measured = { stitchesPer10cm: 22, rowsPer10cm: 30, source: 'measured' as const };

describe('a gauge and a change of fabric', () => {
  it('keeps a measured gauge for another fabric, not as measured, and counts it again back on its own', () => {
    const moved = regauge(measured, 'Seed stitch', { name: '1×1 rib', typical: { stitchesPer10cm: 32, rowsPer10cm: 32 } });
    expect(moved).toEqual({ stitchesPer10cm: 22, rowsPer10cm: 30, source: 'assumed', note: 'Measured on Seed stitch' });
    // Through a third fabric the numbers stay those of the swatch.
    expect(regauge(moved!, '1×1 rib', { name: 'Moss stitch', typical: { stitchesPer10cm: 25, rowsPer10cm: 38 } })).toBeNull();
    expect(regauge(moved!, 'Moss stitch', { name: 'Seed stitch' })).toEqual({ stitchesPer10cm: 22, rowsPer10cm: 30, source: 'measured' });
    // A stitch of your own is never the one measured.
    expect(regauge(moved!, '1×1 rib', null)).toBeNull();
  });

  it('gives a typical gauge the new fabric typical values, when it has any', () => {
    const typical = { stitchesPer10cm: 26, rowsPer10cm: 34, source: 'assumed' as const };
    expect(regauge(typical, 'Stockinette', { name: 'Garter stitch', typical: { stitchesPer10cm: 25, rowsPer10cm: 48 } })).toEqual({ stitchesPer10cm: 25, rowsPer10cm: 48, source: 'assumed' });
    expect(regauge(typical, 'fairisle fabric', { name: 'birdseye fabric' })).toBeNull();
  });

  it('says where the gauges come from', () => {
    expect(swatchWords([{ gauge: measured, fabric: 'Seed stitch' }, { gauge: measured, fabric: '2×2 rib' }])).toEqual({ aside: 'measured', hint: 'From your swatch.' });
    expect(swatchWords([{ gauge: { ...measured, source: 'assumed', note: 'Measured on Seed stitch' }, fabric: '1×1 rib' }, { gauge: measured, fabric: '2×2 rib' }]))
      .toEqual({ aside: 'measure again', hint: 'Measured on Seed stitch. Measure a swatch of 1×1 rib for true sizes.' });
    // Each gauge names its own fabric: a rib to measure again is a rib swatch.
    expect(swatchWords([{ gauge: measured, fabric: 'Stockinette' }, { gauge: { ...measured, source: 'assumed', note: 'Measured on 2×2 rib' }, fabric: '1×1 rib' }]).hint)
      .toBe('Measured on 2×2 rib. Measure a swatch of 1×1 rib for true sizes.');
    expect(swatchWords([{ gauge: { ...measured, source: 'assumed' }, fabric: 'fairisle fabric' }]).aside).toBe('typical');
  });
});
