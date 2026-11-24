import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { scheduleSupportedSplit } from '../../../scripts/lib/reversible-shape';
import { carrierPickupPlan } from '../../../scripts/lib/carrier-plan';
import { buildPaisleySplit } from '../../../scripts/experiments/paisley-split-swatch';
import { verifyPaisleySplit } from '../../../scripts/experiments/verify-paisley-split';
import { traceOf } from '../../../scripts/lib/machine-files';
import type { MachineTraceV1 } from '@kniterate-studio/machine-lib/browser';

const local = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

describe('supported-split planning', () => {
  it('accounts for holds before shaping, the growth completion and the turn at the peak', () => {
    const schedule = scheduleSupportedSplit([8, 9, 8]);
    expect(schedule.rows.map((r) => [r.width, r.kind, r.designRow])).toEqual([
      [8, 'plain', 1], [8, 'plain', null], [8, 'plain', null], [9, 'growth', 2],
      [9, 'completion', null], [9, 'plain', null], [8, 'decrease', 3],
    ]);
    expect(scheduleSupportedSplit([8, 8, 8, 9])).toMatchObject({ endsWithGrowth: true, minimumRows: 5 });
    expect(scheduleSupportedSplit([8, 8, 8, 9, 9, 9, 8]).extraRows).toBe(0);
    expect(() => scheduleSupportedSplit([8, 10])).toThrow(/one column/);
    expect(() => scheduleSupportedSplit([1])).toThrow(/active columns/);
    expect(() => scheduleSupportedSplit([253])).toThrow(/active columns/);
  });

  it('replays the two split descendants, both merged loops and the planned feeder handoffs in the recorded program', () => {
    const built = buildPaisleySplit();
    expect(verifyPaisleySplit(built)).toMatchObject({ passed: true, passes: 514, increases: 13, decreases: 13,
      sha256: '2868d508005e90eab60d2ac609609870bba8f9b2fb13661f5e927a50f481aa1d' });
  });
});

describe('whole-file feeder pickup bounds', () => {
  // C1's home is -11.5. Pickups to and from home, yarn-forming passes, and nonzero roller are fixed.
  function moves(stops: number[], workAfter: number | null, rollerAfter: number | null = null) {
    const passes = stops.slice(1).flatMap((to, index) => {
      const from = stops[index]!;
      const move = { carrier: '1', direction: from < to ? '>>' : '<<', operation: 'Tu-Tu', roller: index === rollerAfter ? 100 : 0,
        carrierStops: { left: Math.min(from, to), right: Math.max(from, to) }, actions: [{ kind: 'move' }] };
      if (index !== workAfter) return [move];
      const work = { carrier: '0', direction: '<<', operation: 'Kn-Kn', roller: 0, rack: 0, carrierStops: null,
        actions: [{ kind: 'drop', at: { bed: 'front', traceCoordinate: 10 } }] };
      return [move, work];
    });
    return { passes: passes.map((p, index) => ({ ...p, index })) } as unknown as MachineTraceV1;
  }
  it('finds an entire dispensable excursion and retains both pickups when later needles require clearance', () => {
    const stops = [-11.5, 10.5, 20.5, 10.5, -11.5];
    expect(carrierPickupPlan(moves(stops, null))).toMatchObject({ available: true, recordedPickups: 2, minimumPickups: 0 });
    expect(carrierPickupPlan(moves(stops, 1))).toMatchObject({ available: true, recordedPickups: 2, minimumPickups: 2 });
    expect(carrierPickupPlan(moves(stops, null, 2))).toMatchObject({ recordedPickups: 1, minimumPickups: 1 });
    expect(carrierPickupPlan(moves(stops, 0))).toMatchObject({ available: false, minimumPickups: null });
  });
  it('finds the pickup difference in C1 and C6 on the diamond that stopped', () => {
    const trace = traceOf(local('../../../packages/machine-lib/registry/swatches/2026-11-11-reversible-diamond-paisley/out.kc'));
    const plan = carrierPickupPlan(trace);
    expect(plan).toMatchObject({ available: true, recordedPickups: 717, minimumPickups: 631 });
    const difference = plan.carriers!.filter((c) => c.omittedInModel.length).map((c) => [c.carrier, c.omittedInModel.length]);
    expect(difference).toEqual([['1', 32], ['6', 54]]);
  });
  it('agrees with exhaustive pickup subsets through alternate parking paths', () => {
    const stops = [-11.5, 10.5, 20.5, 14.5, 10.5, 20.5, 10.5, -11.5];
    for (let guard = 0; guard < stops.length - 1; guard++) {
      let minimum = Infinity;
      for (let mask = 0; mask < 2 ** (stops.length - 3); mask++) {
        let parked = stops[0]!, pickups = 0, valid = true;
        for (let i = 0; i < stops.length - 1; i++) {
          const atHome = i === 0 || i === stops.length - 2;
          if (atHome || (mask & (1 << (i - 1)))) {
            if (parked !== stops[i]) valid = false;
            parked = stops[i + 1]!;
            if (!atHome) pickups++;
          }
          if (i === guard && Math.abs(parked - 10) < 2.5) valid = false;
        }
        if (valid) minimum = Math.min(minimum, pickups);
      }
      expect(carrierPickupPlan(moves(stops, guard)).minimumPickups).toBe(Number.isFinite(minimum) ? minimum : null);
    }
  });
});
