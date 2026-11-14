/** The operator's successful single-bed start, scoped to the C1/C3/C6 edge experiments. */
import assert from 'node:assert/strict';
import { knit, f, b, rack, xfer, drop, miss, xSpeedNumber, xRollerAdvance, xStitchNumber, xXferStitchNumber, type KnitoutProgram } from '../../packages/machine-lib/src/knitout/types.js';

export function withEdgeTrialCastOn(program: KnitoutProgram, lo: number, hi: number, widestLo: number): KnitoutProgram {
  const ops = program.ops;
  const firstXfer = ops.findIndex((op) => op.kind === 'xfer');
  const body = ops.findIndex((op) => op.kind === 'comment' && op.text.includes('SHAPED PANEL: BODY'));
  assert(firstXfer > 0 && body > firstXfer, 'Expected the shaped-panel waste/cast-on prefix');
  const firstBody = ops.findIndex((op, i) => i > body && op.kind === 'knit');
  assert(firstBody > body, 'Expected a first jersey row');
  let secondBody = firstBody;
  while (secondBody < ops.length) {
    const op = ops[secondBody]!;
    if (op.kind !== 'knit' || op.direction !== '+') break;
    assert(op.needle.bed === 'f' && op.needle.needle === lo + secondBody - firstBody && op.carriers.join() === '3');
    secondBody++;
  }
  assert.equal(secondBody - firstBody, hi - lo + 1, 'Expected one full front-bed first row');
  const up = Array.from({ length: hi - lo + 1 }, (_, i) => lo + i);
  const down = [...up].reverse();
  const settings = (speed: number, roller: number, stitch: number) => [xSpeedNumber(speed), xRollerAdvance(roller), xStitchNumber(stitch)];
  return { ...program, ops: [
    ...ops.slice(0, firstXfer),
    // Same clearances as the successful 107..146 / widest-left-105 trial. The new swatch grows
    // farther left, so both idle feeders must park relative to its widest row, not its cast-on.
    miss('-', f(widestLo - 6), '6'),
    ...settings(300, 450, 5), ...up.map((n) => drop(b(n))),
    ...settings(100, 200, 8), ...down.map((n) => knit('-', f(n), '1')), miss('-', f(widestLo - 3), '1'),
    rack(0.5), ...settings(200, 400, 4), ...down.flatMap((n) => [knit('-', b(n), '3'), knit('-', f(n), '3')]),
    rack(0), ...settings(200, 400, 5), ...up.map((n) => knit('+', f(n), '3')),
    ...down.map((n) => knit('-', b(n), '3')), miss('-', f(lo - 1), '3'),
    xSpeedNumber(100), xRollerAdvance(0), xXferStitchNumber(3), ...up.map((n) => xfer(b(n), f(n))),
    ...settings(300, 450, 6), ...up.map((n) => ({ ...knit('+', f(n), '3'), sourceRows: ops[firstBody]!.sourceRows })),
    ...settings(200, 450, 9), xXferStitchNumber(0),
    ...ops.slice(secondBody),
  ] };
}
