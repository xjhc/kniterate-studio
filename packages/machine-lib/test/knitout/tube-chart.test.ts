import { expect, it } from 'vitest';
import { DEFAULT_KEY_PALETTE } from '../../src/colorwork/knitlab1-contract.js';
import { buildLeafChart } from '../../src/knitout/compile/leaf-chart.js';
import { compileTubeChartToKnitout } from '../../src/knitout/compile/tube-chart.js';

it('emits the painted tube or rejects the first row that cannot be represented by its width', () => {
  const compile = (remove?: number) => {
    const chart = buildLeafChart([3, 3, 2]);
    const layer = chart.layers[0]!;
    layer.keyPlacements = layer.keyPlacements!.filter((p) => p.anchor.y !== 1 || p.anchor.x !== remove);
    return compileTubeChartToKnitout({ chart, keyPalette: [...DEFAULT_KEY_PALETTE] });
  };
  expect(compile()).toMatchObject({ ok: true, schedule: [3, 3, 2] });
  expect(compile(2)).toMatchObject({ ok: false, messages: [{ rule: 'tube-row-hole' }] });
  expect(compile(3)).toMatchObject({ ok: false, messages: [{ rule: 'tube-moving-spine' }] });
});
