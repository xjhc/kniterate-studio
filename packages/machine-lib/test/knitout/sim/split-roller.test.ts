import { describe, expect, it } from 'vitest';

import { writeKnitoutProgram } from '../../../src/knitout/emitter.js';
import { knitoutToKCode } from '../../../src/knitout/kniterate/to-kcode.js';
import { CarriageSimulator } from '../../../src/knitout/sim/carriage-simulator.js';
import { parseKcPasses } from '../../../src/knitout/sim/kc-parse.js';
import { b, f, type Direction } from '../../../src/knitout/types.js';

const carriers = ['1', '2', '3', '4', '5', '6'] as const;

function setup() {
  const sim = new CarriageSimulator({ carriers });
  sim.setSpeed(200);
  sim.setRoller(450);
  sim.setStitch(7);
  sim.setPresserSpeed(600);
  sim.setPresserRoller(0);
  sim.bringIn('3', { side: 'left' });
  return sim;
}

/** This gate compares settings and pass boundaries, not split type prediction. */
function assertRollerParity(sim: CarriageSimulator) {
  sim.setRoller(0);
  sim.out('3');
  const source = writeKnitoutProgram({ version: 2, carriers: [...carriers], machine: 'kniterate', gauge: 7, position: 'Keep', yarns: {}, kniterate: {}, ops: sim.finalize() });
  const result = knitoutToKCode(source);
  if (!result.ok || result.kcode === undefined) throw new Error(result.stderr);
  const actual = parseKcPasses(result.kcode);
  expect(sim.predictedPasses().map(pass => ({
    direction: pass.direction, carrier: pass.carriers.join('') || '0', speed: pass.speed, roller: pass.roller,
  }))).toEqual(actual.map(({ direction, carrier, speed, roller }) => ({ direction, carrier, speed, roller })));
  return actual;
}

describe('split roller prediction against the pinned converter', () => {
  for (const direction of ['+', '-'] as const) {
    for (const first of ['split', 'knit'] as const) {
      for (const increment of [0, 450]) {
        it(`${direction} ${first}-first keeps the first operation's roller with increment ${increment}`, () => {
          const sim = setup();
          const needles = direction === '+' ? [40, 41, 42, 43] : [43, 42, 41, 40];
          const reverse: Direction = direction === '+' ? '-' : '+';
          for (const n of [...needles].reverse()) sim.knit('3', reverse, f(n));
          needles.forEach((n, index) => {
            if (index === (first === 'split' ? 0 : 1)) {
              if (increment) sim.addRollerAdvance(increment);
              sim.split('3', direction, f(n), b(n));
            } else sim.knit('3', direction, f(n));
          });
          for (const n of [...needles].reverse()) sim.knit('3', reverse, f(n));
          const actual = assertRollerParity(sim);
          const splitPass = actual.find(pass => pass.type === (direction === '+' ? 'Tr-Rr' : 'Tr-Rl'))!;
          expect(splitPass.roller).toBe(first === 'split' ? increment : 450);
          const following = actual.slice(actual.indexOf(splitPass) + 1).find(pass => pass.type === 'Kn-Kn' && pass.carrier === '3')!;
          expect(following.roller).toBe(450); // One-shot does not change the following normal row.
        });
      }
    }

    it(`${direction} applies the split increment after the zero-roller self-kick`, () => {
      const sim = setup();
      const needles = direction === '+' ? [40, 41, 42, 43] : [43, 42, 41, 40];
      for (const n of needles) sim.knit('3', direction, f(n));
      sim.addRollerAdvance(450);
      sim.split('3', direction, f(needles[0]!), b(needles[0]!));
      for (const n of needles.slice(1)) sim.knit('3', direction, f(n));
      const actual = assertRollerParity(sim);
      expect(sim.predictedPasses().some(pass => pass.source?.startsWith('self-kick'))).toBe(true);
      expect(actual.filter(pass => pass.type === 'Tu-Tu').every(pass => pass.roller === 0)).toBe(true);
      expect(actual.find(pass => pass.type === (direction === '+' ? 'Tr-Rr' : 'Tr-Rl'))!.roller).toBe(450);
    });
  }
});
