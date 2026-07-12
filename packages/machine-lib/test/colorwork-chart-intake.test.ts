import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { projectColorworkChartV1 } from '../src/colorwork/from-colorwork-chart';
import { compileChartToKnitout } from '../src/knitout/compile/from-chart';
import type { CarrierId, YarnBinding } from '../src/knitout/types';

const fixture = JSON.parse(readFileSync(
  resolve('../../fixtures/colorwork-chart-v1/four-color-checker.json'),
  'utf8',
)) as unknown;

describe('ColorworkChartV1 machine boundary', () => {
  it('projects the public artifact into the proven chart compiler unchanged', () => {
    const projected = projectColorworkChartV1(fixture);
    expect(projected.chart).toMatchObject({ rows: 3, cols: 4, orientation: 'bottom-up' });
    expect(projected.palette.map((entry) => entry.id)).toEqual(['natural', 'red', 'gold', 'navy']);
    expect(projected.chart.layers[0]!.keyPlacements).toHaveLength(12);
    expect(projected.chart.layers[0]!.keyPlacements[0]).toEqual({
      anchor: { x: 0, y: 0 },
      keyId: 'navy',
    });
  });

  it('compiles the four-color fixture after Studio assigns carriers', () => {
    const projected = projectColorworkChartV1(fixture);
    const carriers: CarrierId[] = ['2', '3', '4', '5'];
    const yarnBindings: YarnBinding[] = projected.artifact.palette.map((entry, index) => ({
      keyId: entry.id,
      name: entry.name,
      carrier: carriers[index]!,
    }));
    const result = compileChartToKnitout({
      chart: projected.chart,
      keyPalette: projected.palette,
      yarnBindings,
      needleOffset: 50,
      wastePasses: 4,
      bindOff: 'drop',
      developerMode: true,
      backBedStyle: 'ladder',
    });
    expect(result.messages.filter((message) => message.severity === 'error')).toEqual([]);
    expect(result.ok).toBe(true);
    expect(result.program?.ops.length).toBeGreaterThan(0);
  });
});
