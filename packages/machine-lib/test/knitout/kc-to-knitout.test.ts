import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  carrierIn,
  carrierOut,
  drop,
  f,
  knit,
  rack,
  tuck,
  xfer,
  type CarrierId,
  type KnitoutOp,
} from '../../src/knitout/types.js';
import { writeKnitoutProgram } from '../../src/knitout/emitter.js';
import { knitoutToKCode } from '../../src/knitout/kniterate/to-kcode.js';
import { kcToKnitout } from '../../src/knitout/kc-to-knitout.js';

function buildProgram(ops: KnitoutOp[]) {
  return {
    version: 2 as const,
    carriers: ['1', '2', '3', '4', '5', '6'] as CarrierId[],
    machine: 'kniterate' as const,
    yarns: { '3': 'merino' } as Partial<Record<CarrierId, string>>,
    kniterate: { stitchNumber: 6, speedNumber: 300, rollerAdvance: 450 },
    ops,
  };
}

/** Needle numbers appearing on a fabric-defining op. */
function needlesOf(op: KnitoutOp): number[] {
  switch (op.kind) {
    case 'knit':
    case 'tuck':
    case 'drop':
      return [op.needle.needle];
    case 'xfer':
    case 'split':
      return [op.from.needle, op.to.needle];
    default:
      return [];
  }
}

/** A comparable signature for fabric-defining ops, with needle numbers made
 *  relative to `base`. The vendor positions the work on the bed (so absolute
 *  needles shift by a constant); only the relative geometry is meaningful for
 *  visualization fidelity. */
function fabricSig(op: KnitoutOp, base: number): string | null {
  const rel = (n: number) => n - base;
  switch (op.kind) {
    case 'knit':
    case 'tuck':
      return `${op.kind} ${op.direction} ${op.needle.bed}${rel(op.needle.needle)} ${op.carriers.join('+')}`;
    case 'xfer':
      return `xfer ${op.from.bed}${rel(op.from.needle)}->${op.to.bed}${rel(op.to.needle)}`;
    case 'split':
      return `split ${op.direction} ${op.from.bed}${rel(op.from.needle)}->${op.to.bed}${rel(op.to.needle)} ${op.carriers.join('+')}`;
    case 'drop':
      return `drop ${op.needle.bed}${rel(op.needle.needle)}`;
    default:
      return null;
  }
}

function fabricMultiset(ops: KnitoutOp[]): string[] {
  const fabric = ops.filter((o) => needlesOf(o).length > 0);
  const base = fabric.length > 0 ? Math.min(...fabric.flatMap(needlesOf)) : 0;
  return fabric.map((o) => fabricSig(o, base)).filter((s): s is string => s !== null).sort();
}

/** knitout → vendor kc → decompiled knitout. Asserts the vendor accepted it. */
function roundTrip(ops: KnitoutOp[]) {
  const kc = knitoutToKCode(writeKnitoutProgram(buildProgram(ops)));
  expect(kc.ok, `vendor rejected program:\n${kc.stderr}`).toBe(true);
  const { program, stats } = kcToKnitout(kc.kcode!);
  return { recovered: program.ops, stats, kc: kc.kcode! };
}

describe('kcToKnitout — round-trip oracle (knitout → vendor → kc → knitout)', () => {
  it('recovers knit ops and direction across a stockinette block', () => {
    const ops: KnitoutOp[] = [carrierIn('3')];
    // cast on with tucks, then 4 alternating-direction knit rows
    for (let n = 1; n <= 6; n++) ops.push(tuck('+', f(n), '3'));
    for (let row = 0; row < 4; row++) {
      if (row % 2 === 0) for (let n = 6; n >= 1; n--) ops.push(knit('-', f(n), '3'));
      else for (let n = 1; n <= 6; n++) ops.push(knit('+', f(n), '3'));
    }
    ops.push(carrierOut('3'));

    const { recovered } = roundTrip(ops);
    expect(fabricMultiset(recovered)).toEqual(fabricMultiset(ops));
  });

  it('recovers two-carrier (fairisle-like) knit passes with per-row carriers', () => {
    const ops: KnitoutOp[] = [carrierIn('1'), carrierIn('2')];
    for (let n = 1; n <= 6; n++) ops.push(tuck('+', f(n), '1'));
    // alternate carriers row to row
    for (let row = 0; row < 4; row++) {
      const c: CarrierId = row % 2 === 0 ? '1' : '2';
      if (row % 2 === 0) for (let n = 6; n >= 1; n--) ops.push(knit('-', f(n), c));
      else for (let n = 1; n <= 6; n++) ops.push(knit('+', f(n), c));
    }
    ops.push(carrierOut('1'), carrierOut('2'));

    const { recovered, stats } = roundTrip(ops);
    expect(stats.carriersUsed).toEqual(['1', '2']);
    expect(fabricMultiset(recovered)).toEqual(fabricMultiset(ops));
  });

  it('recovers transfers (xfer) at rack 0 and back-bed alignment', () => {
    const ops: KnitoutOp[] = [carrierIn('3')];
    for (let n = 1; n <= 6; n++) ops.push(tuck('+', f(n), '3'));
    for (let n = 6; n >= 1; n--) ops.push(knit('-', f(n), '3'));
    // transfer the even front needles to the back
    ops.push(rack(0));
    for (const n of [2, 4, 6]) ops.push(xfer(f(n), { bed: 'b', needle: n }));
    ops.push(carrierOut('3'));

    const { recovered } = roundTrip(ops);
    const xfers = recovered.filter((o) => o.kind === 'xfer');
    expect(xfers.length).toBe(3);
    expect(fabricMultiset(recovered.filter((o) => o.kind === 'xfer'))).toEqual(
      fabricMultiset(ops.filter((o) => o.kind === 'xfer')),
    );
  });

  it('recovers drops as drops (carrier-0 selection passes)', () => {
    const ops: KnitoutOp[] = [carrierIn('3')];
    for (let n = 1; n <= 6; n++) ops.push(tuck('+', f(n), '3'));
    for (let n = 6; n >= 1; n--) ops.push(knit('-', f(n), '3'));
    for (let n = 1; n <= 6; n++) ops.push(drop(f(n)));
    ops.push(carrierOut('3'));

    const { recovered, stats } = roundTrip(ops);
    expect(stats.dropPasses).toBeGreaterThanOrEqual(1);
    expect(fabricMultiset(recovered.filter((o) => o.kind === 'drop'))).toEqual(
      fabricMultiset(ops.filter((o) => o.kind === 'drop')),
    );
  });

  it('skips empty carrier-0 auto-move passes (no spurious ops)', () => {
    const ops: KnitoutOp[] = [carrierIn('3')];
    for (let n = 1; n <= 6; n++) ops.push(tuck('+', f(n), '3'));
    // two same-direction knit rows force the vendor to insert an auto-move
    for (let n = 6; n >= 1; n--) ops.push(knit('-', f(n), '3'));
    for (let n = 6; n >= 1; n--) ops.push(knit('-', f(n), '3'));
    ops.push(carrierOut('3'));

    const { recovered, stats } = roundTrip(ops);
    // auto-moves (and any other choreography) must not have become fabric ops
    expect(stats.unrecognizedTypes).toEqual({});
    expect(fabricMultiset(recovered)).toEqual(fabricMultiset(ops));
  });
});

describe('kcToKnitout — reference fixtures (visualization-faithful, not byte parity)', () => {
  const fixtures = ['swatch', 'fairisle', 'jacquard', 'dbj'] as const;
  for (const name of fixtures) {
    it(`decompiles reference/${name}.kc with no unrecognized pass types`, () => {
      const kcText = readFileSync(resolve(__dirname, '../../reference', `${name}.kc`), 'utf8');
      const { program, stats } = kcToKnitout(kcText);
      expect(stats.unrecognizedTypes).toEqual({});
      expect(program.ops.length).toBeGreaterThan(0);
      expect((stats.opCounts.knit ?? 0)).toBeGreaterThan(0);
      expect(stats.needleBounds).not.toBeNull();
      // recovered needle span is plausible for a garment swatch (well under the bed)
      expect(stats.needleBounds!.max - stats.needleBounds!.min).toBeLessThan(252);
    });
  }
});
