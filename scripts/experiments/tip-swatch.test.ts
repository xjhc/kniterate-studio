import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTipSwatch, verifyTipSwatch } from './tip-swatch.js';
import { buildPaisleySplit } from './paisley-split-swatch.js';
import { knitoutToKCodeWithTrace } from '../../packages/machine-lib/src/knitout/kniterate/to-kcode.js';

const built = buildTipSwatch();
function mutated(source: string) { assert.notEqual(source, built.source); const compiled = knitoutToKCodeWithTrace(source, 'program.k'); assert(compiled.ok); return { ...built, source, compiled }; }

test('starter narrows 8 to 2, the piece runs 2 to 8 to 2, and the serialized checks pass', () => {
  const report = verifyTipSwatch(built);
  assert.deepEqual(built.rows.filter((row) => row.section === 'starter').map((row) => row.width), [8, 8, 8, 7, 7, 7, 6, 6, 6, 5, 5, 5, 4, 4, 4, 3, 3, 3, 2, 2, 2]);
  const piece = built.rows.filter((row) => row.section === 'piece');
  assert.equal(piece.filter((row) => row.kind === 'growth').length, 6); assert.equal(piece.filter((row) => row.kind === 'decrease').length, 6);
  assert.deepEqual([piece[0]!.width, Math.max(...piece.map((row) => row.width)), piece.at(-1)!.width], [2, 8, 2]);
  assert.equal(report.neckPasses.length, 7);
});
test('the start and the first three rows are the knitted 514-pass paisley\'s', () => {
  const paisley = buildPaisleySplit().source;
  const head = (source: string, name: string) => source.slice(0, source.indexOf(`; ${name} ROW 4 `)).replaceAll(`; ${name} ROW`, '; ROW');
  assert(head(built.source, 'TIP').length > 1000);
  assert.equal(head(built.source, 'TIP'), head(paisley, 'PAISLEY'));
});
test('reject a neck without its rear draw-thread loops', () => {
  const neck = built.source.indexOf('; TIP NECK draw');
  const source = built.source.slice(0, neck) + built.source.slice(neck).replace(/^knit - b\d+ 1\n/gm, '');
  assert.throws(() => verifyTipSwatch(mutated(source)));
});
test('reject an increase on two columns whose first split is a plain knit', () => {
  const source = built.source.replace(/^split \+ f(\d+) b\1 ([34])$/m, 'knit + f$1 $2');
  assert.throws(() => verifyTipSwatch(mutated(source)));
});
