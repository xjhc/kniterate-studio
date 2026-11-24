import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { authoredKnitoutToKCodeWithTrace, knitoutToKCodeWithTrace } from '../../../packages/machine-lib/src/knitout/kniterate/to-kcode.ts';
import { parseTriangleProject } from '../../../apps/studio/src/scarf/triangleProjectFile.ts';
import { plannedBodyPlacement } from '../../../apps/studio/src/scarf/triangle.ts';

const file = name => fileURLToPath(new URL(name, import.meta.url));
export const largeLetter = process.argv.includes('--large-letter');
export const compactLetter = process.argv.includes('--compact-letter');
assert(!(largeLetter && compactLetter), 'Choose one letter size');
export const scarf = process.argv.includes('--full-scarf')
  ? parseTriangleProject(JSON.parse(fs.readFileSync(file('../Fig-Camel-141cm-9-Rows.kniterate-studio.json'), 'utf8'))) : null;
if (scarf) assert(scarf.c3Decrease && scarf.plan.columns === 214 && scarf.plan.rows === 846);
export const c3Decrease = Boolean(scarf) || largeLetter || compactLetter || process.argv.includes('--c3-decrease');
const outputFolder = scarf ? '../fig-camel-full-scarf' : compactLetter ? 'c3-compact-A' : largeLetter ? 'c3-paisley-size-A' : c3Decrease ? 'c3-decrease' : '.';
export const outputFile = name => file(outputFolder + '/' + name);
const tip = fs.readFileSync(file('../nov22-trials/03-tip/program.k'), 'utf8');
const [setup, starter] = tip.split('; TIP ROW 1 plain\n');
const lo = scarf ? plannedBodyPlacement(scarf.plan).firstNeedle : 119;
const moveStarter = text => text.replace(/\b([fb])(\d+)\b/g, (_, bed, n) => bed + (Number(n) + lo - 119));
const lines = [moveStarter(setup.trimEnd()).replace('Orange single 2/14 acrylic', 'Camel single 3/28 cashmere').replace('Grey single 2/14 acrylic', 'Fig single 3/28 cashmere')];
const emit = (...ops) => lines.push(...ops);
const tipWidth = 3, increases = scarf ? scarf.plan.growth : 10;
let hi = lo + tipWidth - 1;
function pass(carrier, direction, bedAt, first = lo, last = hi) {
  for (let i = first; i <= last; i++) {
    const n = direction === '+' ? i : last - (i - first);
    emit(`knit ${direction} ${bedAt(n)}${n} ${carrier}`);
  }
}

// The operator-tested tip file reaches three columns after starter row 16.
// Keep its next two rows to put C3 on the left for the half row before the draw.
emit('; STARTER', moveStarter(starter.split('; TIP ROW 19 decrease')[0].trimEnd())
  .replaceAll('x-stitch-number 7', 'x-stitch-number 6')
  .replaceAll('x-speed-number 200', 'x-speed-number 150')
  .replaceAll('x-roller-advance 450', 'x-roller-advance 400'));
emit('; STARTER half');
pass('3', '+', n => n === lo ? 'f' : 'b');
emit('; NECK draw', 'x-speed-number 100', 'x-roller-advance 400', 'x-stitch-number 8');
pass('1', '+', () => 'f'); pass('1', '-', () => 'b');
emit('x-roller-advance 0', `miss - f${lo - 5} 1`, '; NECK cast-on', 'rack 0.5', 'x-roller-advance 450', 'x-stitch-number 3');
for (let n = hi; n >= lo; n--) emit(`knit - b${n} 3`, `knit - f${n} 3`);
emit('x-roller-advance 400', 'x-stitch-number 5');
pass('3', '+', () => 'f'); pass('3', '-', () => 'b'); emit('rack 0');

// Read top down with the cast-on below. Each mark is one Camel stitch.
const letterTopCourse = compactLetter ? 23 : largeLetter ? 29 : 18;
const letterFirstColumn = 2;
const glyph = compactLetter ? [
  '..##..',
  '.####.',
  '##..##',
  '##..##',
  '######',
  '######',
  '##..##',
  '##..##',
] : largeLetter ? [
  '...##...',
  '..####..',
  '.######.',
  '###..###',
  '##....##',
  '##....##',
  '########',
  '########',
  '##....##',
  '##....##',
] : [
  '.##.',
  '#..#',
  '####',
  '#..#',
  '#..#',
];
const rows = [];
let c3Left = true;
function colours(r, right) {
  // The cashmere swatch brackets the design with one three-stitch course
  // at each tip to establish and recover the carrier positions.
  if (scarf && r >= 2 && r <= scarf.plan.rows + 1) {
    const width = hi - lo + 1;
    assert.equal(width, scarf.plan.widths[r - 2]);
    const front = scarf.cells[r - 2].slice(0, width).map(colour => colour === 1 ? '3' : '4');
    assert.equal(front.at(-1), right);
    rows.push({row:r, front});
    return front;
  }
  const front = [];
  for (let n = lo; n <= hi; n++) {
    const accent = glyph[letterTopCourse - r]?.[n - lo - letterFirstColumn] === '#';
    if (accent) assert(n > lo && n < hi - 1, 'Letter intrudes on shaping');
    front.push(accent ? '3' : '4');
  }
  front[0] = r % 2 ? '3' : '4';
  front[hi - lo] = right;
  rows.push({row:r, front});
  return front;
}
const bed = (c, front) => n => front[n-lo] === c ? 'f' : 'b';
const body = r => emit('x-stitch-number 6', `x-speed-number ${r === 1 ? 100 : 150}`, `x-roller-advance ${r === 1 ? 100 : 400}`);
const label = (r, part) => emit(`; LETTER ROW ${r} ${part}`);
function plain(r, narrowing = false, wideningHold = false) {
  label(r, narrowing ? 'decrease' : 'plain');
  if (narrowing) {
    emit('x-speed-number 100', 'x-roller-advance 0', 'x-xfer-stitch-number 5', 'rack 1',
      `xfer f${hi} b${hi-1}`, 'rack -1', `xfer b${hi} f${hi-1}`, 'rack 0');
    hi--;
  }
  // During a widening hold continue the Fig/Camel edge phase of the splits.
  const figOnOddCourses = r <= 3 || (c3Decrease && !wideningHold);
  const right = Boolean(r % 2) === figOnOddCourses ? '4' : '3';
  const front = colours(r, right);
  body(r);
  const leftCarrier = c3Left ? '3' : '4', rightCarrier = c3Left ? '4' : '3';
  if (r <= 3) {
    pass(leftCarrier, '+', bed(leftCarrier,front)); pass(rightCarrier, '-', bed(rightCarrier,front));
  } else {
    pass(rightCarrier, '-', bed(rightCarrier,front)); pass(leftCarrier, '+', bed(leftCarrier,front));
  }
  c3Left = !c3Left;
}
function increase(r) {
  assert(!c3Left, 'Joined split requires C4 on left');
  label(r, 'growth');
  const old = hi++;
  emit('x-roller-advance 0', `miss - f${old} 3`, `miss + f${hi} 3`, 'x-speed-number 100',
    'x-xfer-stitch-number 5', 'rack 1', `xfer b${old} f${hi}`, 'rack 0');
  const growth = colours(r,'4'); growth[old-lo]='4';
  body(r); pass('4', '+', bed('4',growth),lo,old); emit(`split + f${hi} b${hi} 4`);
  emit(`knit - b${hi} 3`); pass('3','-',bed('3',growth),lo,old-1);
  label(r+1, 'completion');
  const finish=colours(r+1,'3'); finish[old-lo]='4';
  emit('x-roller-advance 0', `knit - b${hi} 4`, `miss + f${hi} 4`, 'x-roller-advance 400',
    'x-add-roller-advance 400', `split - f${old} b${old} 4`, 'x-roller-advance 0');
  pass('4','-',bed('4',finish),lo,old-1);
  emit('x-roller-advance 400'); pass('3','+',bed('3',finish));
}
for (let r=1; r<=3; r++) plain(r);
let r=4;
for (let i = 0; i < increases; i++) {
  if (largeLetter && i === increases - 1) {
    for (let hold = 0; hold < 6; hold++, r++) plain(r, false, true);
  }
  increase(r);
  r += 2;
}
for (let i=0; i<increases; i++,r+=2) { plain(r,true); plain(r+1); }
plain(r);
assert.equal(hi,lo+tipWidth-1);
emit('; LETTER BODY END','x-speed-number 150','x-stitch-number 7','x-roller-advance 400');
for (let round=0;round<8;round++) { pass('6','+',()=> 'f'); pass('6','-',()=> 'b'); }
emit('x-stitch-number 4');
for (let n=lo;n<=hi;n++) emit(`drop f${n}`, `drop b${n}`);
emit('x-roller-advance 0','out 1','out 3','out 4','out 6');
export const source = lines.join('\n')+'\n';
const sourceName = scarf ? 'Fig-Camel-141cm-9-Rows.k' : 'triangle-A.k';
export const compiled = (scarf ? authoredKnitoutToKCodeWithTrace : knitoutToKCodeWithTrace)(source,sourceName);
assert(compiled.ok, compiled.error);
export { rows, lo };
if (process.argv[1] === file('./build.mjs')) {
  fs.mkdirSync(outputFile('.'), {recursive:true});
  fs.writeFileSync(outputFile(sourceName),source);
  fs.writeFileSync(outputFile('command.kc'),compiled.kcode);
}
