/** Gate 3 outward-first comparison builder. Review only; never an operator release. */
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { CarriageSimulator } from '../../packages/machine-lib/src/knitout/sim/carriage-simulator.js';
import { emitCustomistFairisleFrame } from '../../packages/machine-lib/src/knitout/passes/customist-fairisle-frame.js';
import { emitReversibleOutwardIncrease } from '../../packages/machine-lib/src/knitout/passes/reversible-outward-increase.js';
import { FAIRISLE_PARK_WASTE_DEFAULTS } from '../../packages/machine-lib/src/knitout/passes/waste-section.js';
import { FAIRISLE_CARRIER_INTRO_DEFAULTS } from '../../packages/machine-lib/src/knitout/passes/carrier-intro.js';
import { writeKnitoutProgram } from '../../packages/machine-lib/src/knitout/emitter.js';
import { knitoutToKCodeWithTrace } from '../../packages/machine-lib/src/knitout/kniterate/to-kcode.js';
import { b, comment, f, type CarrierId, type Direction, type KnitoutOp, type KnitoutProgram } from '../../packages/machine-lib/src/knitout/types.js';
import { verifyReversibleSplitComparison } from './verify-reversible-split.js';

const A: CarrierId = '4', B: CarrierId = '3';
const carriers = ['1', '2', '3', '4', '5', '6'] as const;
export interface SplitComparisonCycle {
  readonly row: number;
  readonly lo: number;
  readonly hi: number;
  readonly kind: 'plain' | 'growth' | 'completion';
  readonly front: readonly CarrierId[];
  readonly emptyRear: number | null;
}
export interface SplitComparisonEvent {
  readonly row: number;
  readonly side: 'left' | 'right';
  readonly phase: 'P' | 'Q';
  readonly lo: number;
  readonly hi: number;
}

/** One candidate side, P then Q, with the opposite borrowed-loop control. */
export function buildReversibleSplitComparison(side: 'left' | 'right') {
  let lo = 117, hi = 136;
  const widest = { lo: lo - 2, hi: hi + 2 };
  const frame = emitCustomistFairisleFrame({
    needleStart: lo, needleEnd: hi, wasteNeedleStart: widest.lo, wasteNeedleEnd: widest.hi,
    wasteCarrier: '6', drawCarrier: '1', bodyCarriers: [B, A], wastePasses: 80,
    waste: FAIRISLE_PARK_WASTE_DEFAULTS, intro: FAIRISLE_CARRIER_INTRO_DEFAULTS,
    retainBackBed: true, catchNeedles: 8,
  });
  const ops: KnitoutOp[] = [{ kind: 'x-carrier-spacing', value: 2 }, { kind: 'x-carrier-stopping-distance', value: 2.5 }, ...frame.ops];
  const sim = new CarriageSimulator({ carriers, initialNextDirection: frame.finalNextDirection });
  for (const state of frame.finalCarrierStates.values()) sim.seedCarrierState(state);
  sim.seedRacking(0);
  sim.setPresserSpeed(600); sim.setPresserRoller(0);
  const drain = () => ops.push(...sim.drainOps());
  drain();
  const rows: SplitComparisonCycle[] = [], events: SplitComparisonEvent[] = [];
  let leftFront: CarrierId = B, rightFront: CarrierId = side === 'right' ? A : B;
  const front = () => Array.from({ length: hi - lo + 1 }, (_, x) => x === 0 ? leftFront : x === hi - lo ? rightFront : A);
  const plain = () => {
    const row = rows.length;
    if (row > 0) { leftFront = leftFront === A ? B : A; rightFront = rightFront === A ? B : A; }
    ops.push(comment(`GATE3 ROW ${row + 1} plain`));
    sim.setSourceRows([row]); sim.setSpeed(row === 0 ? 100 : 200); sim.setStitch(7); sim.setRoller(row === 0 ? 100 : 450);
    const colours = front();
    const firstDirection = sim.finalNextDirection();
    const firstSide = firstDirection === '+' ? 'left' : 'right';
    const first = sim.positionOf(A)?.side === firstSide ? A : B;
    for (const carrier of [first, first === A ? B : A]) {
      const direction: Direction = sim.positionOf(carrier)!.side === 'left' ? '+' : '-';
      assert.equal(direction, sim.finalNextDirection(), 'Normal cycle must start with the carrier at the carriage');
      const needles = Array.from({ length: hi - lo + 1 }, (_, x) => lo + x);
      if (direction === '-') needles.reverse();
      for (const n of needles) sim.knit(carrier, direction, colours[n - lo] === carrier ? f(n) : b(n));
    }
    rows.push({ row: row + 1, lo, hi, kind: 'plain', front: colours, emptyRear: null });
    drain();
  };
  // Left uses the production border's first B-front row at both edges.
  // Right uses the preserved baseline's first B-front left / A-front right.
  // Both cross the primary cast-on tail at the left. No threaded empty trip
  // or new phase-reset construction is used to manufacture a P entry.
  for (let k = 0; k < (side === 'left' ? 8 : 9); k++) plain();
  for (const phase of ['P', 'Q'] as const) {
    assert.equal(side === 'left' ? leftFront : rightFront, phase === 'P' ? A : B, 'Actual old edge phase');
    const sourceRow = rows.length;
    events.push({ row: sourceRow + 1, side, phase, lo, hi });
    ops.push(...emitReversibleOutwardIncrease({ sim, lo, hi, side, frontCarrier: A, rearCarrier: B, sourceRow }));
    const oldCandidate = side === 'left' ? lo : hi;
    lo--; hi++;
    leftFront = side === 'left' ? A : B; rightFront = side === 'right' ? A : B;
    rows.push({ row: sourceRow + 1, lo, hi, kind: 'growth', front: front(), emptyRear: oldCandidate });
    leftFront = side === 'left' ? B : A; rightFront = side === 'right' ? B : A;
    rows.push({ row: sourceRow + 2, lo, hi, kind: 'completion', front: front(), emptyRear: null });
    if (phase === 'P') { plain(); plain(); }
  }
  for (let k = 0; k < 3; k++) plain();
  ops.push(comment('GATE3 BODY END'));
  sim.setSourceRows(undefined); sim.setSpeed(200); sim.setStitch(7); sim.setRoller(450);
  // Preserve the retained two-bed trial's eight tubular waste cycles.
  for (let row = 0; row < 8; row++) {
    for (let n = lo; n <= hi; n++) sim.knit('6', '+', f(n));
    for (let n = hi; n >= lo; n--) sim.knit('6', '-', b(n));
  }
  sim.setSpeed(150); sim.setStitch(4);
  for (let n = lo; n <= hi; n++) { sim.drop(f(n)); sim.drop(b(n)); }
  sim.setRoller(0);
  for (const carrier of ['1', B, A, '6'] as CarrierId[]) sim.out(carrier);
  drain();
  const program: KnitoutProgram = {
    version: 2, carriers: [...carriers], machine: 'kniterate', gauge: 7, position: 'Keep',
    yarns: { '3': 'Orange single 2/14 acrylic — confirm actual cone', '4': 'Grey single 2/14 acrylic — confirm actual cone' },
    kniterate: { xferStyle: 'four-pass' }, ops,
  };
  const source = writeKnitoutProgram(program);
  const compiled = knitoutToKCodeWithTrace(source, 'program.k');
  if (!compiled.ok) throw new Error(compiled.error);
  return { side, program, source, compiled, rows, events, widest };
}

async function main() {
  const [side, out] = process.argv.slice(2);
  if ((side !== 'left' && side !== 'right') || !out) throw new Error('usage: reversible-split-swatch.ts <left|right> <out-dir>');
  const built = buildReversibleSplitComparison(side);
  const report = verifyReversibleSplitComparison(built); // No files written unless every check passes.
  await mkdir(out, { recursive: true });
  await writeFile(join(out, 'program.k'), built.source);
  await writeFile(join(out, 'program.kc'), built.compiled.kcode);
  await writeFile(join(out, 'plan.json'), JSON.stringify({ reviewOnly: true, side, rows: built.rows, events: built.events, widest: built.widest }, null, 2) + '\n');
  await writeFile(join(out, 'verification.json'), JSON.stringify(report, null, 2) + '\n');
  await writeFile(join(out, 'body-passes.txt'), report.bodySchedule.map(pass => `cycle ${pass.row}, ${pass.slot}: ${pass.text}; carriage ${JSON.stringify(pass.carriageStops)}; feeder ${JSON.stringify(pass.carrierStops)}`).join('\n') + '\n');
  await writeFile(join(out, 'README.md'), [
    `# Gate 3 ${side} candidate — software review only`, '',
    '**Not approved for the operator. Gate 2 must first knit successfully, and this exact file needs independent review.**', '',
    `SHA-256: \`${report.sha256}\`. ${report.passes} passes, ${report.bytes} bytes, ${report.cycles} body cycles.`, '',
    '20 → 22 → 24 columns. A = C4 grey front-ground; B = C3 orange rear-ground. Confirm actual cones and tension settings before any later handoff.', '',
    '| Old front | Growth / completion cycles | Split passes |', '| --- | --- | --- |',
    ...report.events.map(event => `| ${event.phase === 'P' ? 'A / grey' : 'B / orange'} | ${event.row} / ${event.row + 1} | ${event.splitPasses.join(', ')} |`), '',
    `The ${side} edge uses two supported splits over two cycles. The opposite edge uses the borrowed-loop control with two empty rear starts. Both share take-down and extra carriage moves; this is not a replay of the old paisley file.`, '',
    'Main yarn passes: speed 200, stitch 7, roller 450. Extra working fragments: roller 0. Carrierless shaping: speed 100, transfer stitch 5, roller 0. First body cycle: speed/roller 100. Waste/draw use the repaired common frame.', '',
    '**Main physical unknown:** the first split is the last working needle of its pass; the second is the first. Inset split captures and Gate 2 do not test these placements. Parentage does not establish loop clearance, orientation, take-down adequacy or edge appearance.', '',
    'One frame advisory: C6 travels 23 needles between its last stitch in pass 80 and its next stitch in pass 86, during the main-yarn introduction. Pass 85 moves C6 empty across that interval at roller 0. This is outside the body; the candidate does not alter that common-frame sequence. The file has no body movement of C1/C6. Record any slack or snag there during a later approved trial.', '',
    'Review `body-passes.txt` for every cycle, slot, setting and numeric stop; `verification.json` records actual loop parent IDs, yarn connections, the canonical checks and advisory. No physical result or Knit-proven status is claimed.', '',
  ].join('\n'));
  process.stdout.write(JSON.stringify({ side, output: resolve(out), sha256: report.sha256, passes: report.passes, reviewOnly: true }) + '\n');
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) void main();
