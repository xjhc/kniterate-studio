import { beforeAll, describe, expect, it } from 'vitest';
import { buildReversibleSplitComparison } from '../../../../scripts/experiments/reversible-split-swatch.js';
import { verifyReversibleSplitComparison } from '../../../../scripts/experiments/verify-reversible-split.js';
import { knitoutToKCodeWithTrace } from '../../src/knitout/kniterate/to-kcode.js';
import { emitReversibleOutwardIncrease } from '../../src/knitout/passes/reversible-outward-increase.js';
import { CarriageSimulator } from '../../src/knitout/sim/carriage-simulator.js';
import { f } from '../../src/knitout/types.js';

describe.each(['left', 'right'] as const)('Gate 3 outward-first %s candidate', side => {
  let built: ReturnType<typeof buildReversibleSplitComparison>;
  beforeAll(() => { built = buildReversibleSplitComparison(side); });

  it('checks both old edge colours, supported parentage, joined returns and the complete serialized schedule', () => {
    const report = verifyReversibleSplitComparison(built);
    expect(report.events.map(event => event.phase)).toEqual(['P', 'Q']);
    expect(report.events.every(event => event.side === side)).toBe(true);
    expect(report.events.map(event => event.hi - event.lo + 1)).toEqual([20, 22]);
    expect(report.audit.checks.every(check => check.ok)).toBe(true);
    expect(report.bodySchedule.filter(pass => pass.slot === 'O8' && pass.carrier === '4').map(pass => pass.roller)).toEqual([450, 450]);
    expect(built.source).not.toMatch(/; GATE3 I\d/);
  });

  it('rejects omission of the outer split even though the file still converts', () => {
    const source = built.source.replace(/^split ([+-]) (f\d+) b\d+ 4$/m, 'knit $1 $2 4');
    expect(source).not.toBe(built.source);
    const compiled = knitoutToKCodeWithTrace(source, 'program.k');
    if (!compiled.ok) throw new Error(compiled.error);
    expect(() => verifyReversibleSplitComparison({ ...built, source, compiled })).toThrow();
  });

  it('rejects an O6 front visit that loses the intended outer cross-bed return', () => {
    const source = built.source.replace(/(; GATE3 O6 cycle \d+[\s\S]*?)knit ([+-]) b(\d+) 4/, '$1knit $2 f$3 4');
    expect(source).not.toBe(built.source);
    const compiled = knitoutToKCodeWithTrace(source, 'program.k');
    if (!compiled.ok) throw new Error(compiled.error);
    expect(() => verifyReversibleSplitComparison({ ...built, source, compiled })).toThrow();
  });

  it('rejects removing the split-first roller increment', () => {
    const source = built.source.replace('x-add-roller-advance 450\n', '');
    expect(source).not.toBe(built.source);
    const compiled = knitoutToKCodeWithTrace(source, 'program.k');
    if (!compiled.ok) throw new Error(compiled.error);
    expect(() => verifyReversibleSplitComparison({ ...built, source, compiled })).toThrow(/Roller at pass/);
  });
});

it('refuses an inward-first entry instead of silently changing the schedule', () => {
  const sim = new CarriageSimulator({ carriers: ['3', '4'] });
  sim.bringIn('4', { side: 'left' }); sim.knit('4', '+', f(136));
  sim.bringIn('3', { side: 'left' }); sim.knit('3', '-', f(117));
  sim.drainOps();
  expect(() => emitReversibleOutwardIncrease({ sim, lo: 117, hi: 136, side: 'right', frontCarrier: '4', rearCarrier: '3', sourceRow: 8 })).toThrow(/opposite the candidate edge/);
});
