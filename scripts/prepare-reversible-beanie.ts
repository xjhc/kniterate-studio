/** Experimental inverse-image mini beanie; not a Studio UI recipe.
 * node --import tsx scripts/prepare-reversible-beanie.ts <straight project.json> <directory>
 * Add: --run2-startup <successful Run 2 program.kc> for the repaired startup.
 * Source project is a baseline only. study-input.json is the actual reversible input.
 */
import assert from 'node:assert/strict';
import { verifyRun2Startup } from './lib/run2-startup-check.js';
import { parseKc, simulateLoopStack } from '../packages/machine-lib/src/knitout/sophie/loop-stack-sim.js';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { materializeColorworkProject, parseColorworkProjectV1 } from '../packages/project-contract/src/index.js';
import { compileColorworkProject } from '../apps/studio/src/blanket/compileProject.js';
import { flatSections } from '../apps/studio/src/machineSetup.js';
import { buildCustomistRibBeanieProgram, type CustomistRibBeanieInput } from '../packages/machine-lib/src/knitout/passes/customist-rib-beanie.js';
import { writeKnitoutProgram } from '../packages/machine-lib/src/knitout/emitter.js';
import { authoredKnitoutToKCodeWithTrace } from '../packages/machine-lib/src/knitout/kniterate/to-kcode.js';
import { parseKCodeDocument } from '../packages/machine-lib/src/knitout/kcode/parser.js';
import { projectKCodeMachineTrace } from '../packages/machine-lib/src/knitout/kcode/machine-trace.js';
import { validateKCodeMachineTrace } from '../packages/machine-lib/src/knitout/kcode/machine-validator.js';
import { KNITERATE_7GG_KCODE_PROFILE_V2 as profile } from '../packages/machine-lib/src/knitout/kcode/machine-profile.js';

const [source, destination, startup, run2Reference] = process.argv.slice(2);
if (!source || !destination) throw new Error('Supply a straight DBJ source project and output directory.');
if (startup !== undefined && startup !== '--run2-startup') throw new Error('Unknown startup option');
const run2Startup = startup === '--run2-startup';
if (run2Startup && !run2Reference) throw new Error('Run 2 startup requires the frozen successful Run 2 KC as fourth argument');
const sourceText = await readFile(source, 'utf8');
const project = parseColorworkProjectV1(JSON.parse(sourceText));
const { state } = materializeColorworkProject(project);
if (state.object?.kind !== 'beanie' || state.object.construction !== 'straight-double-jacquard' || state.strategy.technique !== 'birdseye') throw new Error('Expected a straight birdseye beanie source.');
if (state.setup?.wasteRows !== undefined) throw new Error('This development script expects the original default waste length.');
const sourceCompile = compileColorworkProject(project);
if (!sourceCompile.ok) throw new Error(JSON.stringify(sourceCompile.messages));
const assignments = new Map(state.machine.yarnAssignments.map(a => [a.paletteId, a.carrier]));
const carrierOf = (index: number) => {
  const carrier = assignments.get(state.chart.palette[index]!.id);
  if (!carrier) throw new Error(`Missing assignment for palette index ${index}`);
  return carrier;
};
const base: CustomistRibBeanieInput = {
  needleStart: state.machine.needleOffset, needleEnd: state.machine.needleOffset + state.chart.width - 1,
  bodyCarrier: carrierOf(0), wasteCarrier: '6', drawCarrier: state.setup?.drawThread === false ? null : '1',
  ribRows: 0, crown: 'none', straightDoubleJacquard: true,
  ...(state.setup?.topWasteRows !== undefined ? { topWasteRows: state.setup.topWasteRows } : {}),
  ...(state.setup?.body !== undefined ? { bodySettings: state.setup.body } : {}),
  ...(flatSections(state.setup) ?? {}),
  jerseyBody: { backing: 'birdseye', rows: [...state.chart.cells].reverse().map(row => row.map(carrierOf)) },
};
const baseline = writeKnitoutProgram(buildCustomistRibBeanieProgram(base));
if (baseline !== sourceCompile.knitoutText) throw new Error('Rebuilt body differs from Studio source export.');

const input: CustomistRibBeanieInput = { ...base, experimentalReversibleJacquard: true,
  ...(run2Startup ? { experimentalStartup: 'run2-waste-and-intro' as const } : {}) };
const program = buildCustomistRibBeanieProgram(input);
const knitout = writeKnitoutProgram(program);
const converted = authoredKnitoutToKCodeWithTrace(knitout);
if (!converted.ok) throw new Error(converted.error);
const parsed = parseKCodeDocument(converted.kcode, { profile, dialect: 'knitout-vendor', strict: true });
if (!parsed.ok) throw new Error('Strict KCode parse failed.');
const trace = projectKCodeMachineTrace(parsed.document, profile);
const report = validateKCodeMachineTrace(trace, profile);
assert.deepEqual(report.diagnostics, []);
const rows = input.jerseyBody!.rows;
const width = state.chart.width;
const colors = [input.bodyCarrier, ...new Set(rows.flat().filter(c => c !== input.bodyCarrier))];
assert.equal(colors.length, 2);
// Check the emitted KC, after scheduling: the final main-yarn stitches must
// reproduce the exact inverse bed choice, including blank rows and both edges.
const mainKnits = trace.passes.flatMap(pass => colors.includes(pass.carrier as typeof colors[number])
  ? pass.actions.flatMap(action => action.kind === 'knit' ? [{ pass, action }] : []) : []);
const bodyKnits = mainKnits.slice(-rows.length * width * 2);
assert.equal(bodyKnits.length, rows.length * width * 2);
for (let r = 0; r < rows.length; r++) for (let c = 0; c < colors.length; c++) {
  const block = bodyKnits.slice((r * 2 + c) * width, (r * 2 + c + 1) * width);
  assert(block.every(k => k.pass.carrier === colors[c] && k.pass.rack === 0));
  const actual = block.map(k => `${k.action.at.kcodeColumn}:${k.action.at.bed}`).sort();
  const expected = rows[r]!.map((carrier, x) => `${input.needleStart + x - 1}:${carrier === colors[c] ? 'front' : 'rear'}`).sort();
  assert.deepEqual(actual, expected, `inverse body row ${r}, C${colors[c]}`);
  assert(block.every(k => k.action.at.stitchSelector.encodedValue === 7));
}
const bodyFirst = trace.passes.indexOf(bodyKnits[0]!.pass);
const bodyLast = trace.passes.indexOf(bodyKnits.at(-1)!.pass);
assert(!trace.passes.slice(bodyFirst, bodyLast + 1).some(p => p.actions.some(a => a.kind === 'xfer' || a.kind === 'drop')));
const finish = trace.passes.slice(bodyLast + 1);
const lastWaste = finish.findLastIndex(p => p.actions.some(a => a.kind === 'knit'));
assert(!finish.slice(0, lastWaste + 1).some(p => p.actions.some(a => a.kind === 'drop' || a.kind === 'xfer')));
for (const bed of ['front', 'rear']) for (let x = 0; x < width; x++) {
  const column = input.needleStart + x - 1;
  const knits = finish.flatMap(p => p.actions.flatMap(a => a.kind === 'knit' && a.at.bed === bed && a.at.kcodeColumn === column ? [p] : []));
  assert.equal(knits.length, base.topWasteRows ?? 8);
  assert(knits.every(p => p.carrier === '6'));
  assert.equal(finish.flatMap(p => p.actions).filter(a => a.kind === 'drop' && a.at.bed === bed && a.at.kcodeColumn === column).length, 1);
}
assert.deepEqual([...new Set(trace.passes.map(p => p.speed))].sort((a,b) => a-b), run2Startup ? [100, 200, 300, 600] : [100]);
const loops = simulateLoopStack(parseKc(converted.kcode, { dialect: 'knitout-vendor' }), { xferMovesWholeStack: true });
assert.equal(loops.xferEmpty, 0);
assert(loops.maxStack <= 2);
// The legacy stack oracle treats carrier-zero knit-off as a knit. Use the
// decoded action semantics to check actual drops and final occupancy.
const held = new Map<string, number>();
const key = (at: { bed: string; traceCoordinate: number }) => `${at.bed}:${at.traceCoordinate}`;
for (const pass of trace.passes) for (const action of pass.actions) {
  if (action.kind === 'knit') held.set(key(action.at), 1);
  else if (action.kind === 'tuck') held.set(key(action.at), (held.get(key(action.at)) ?? 0) + 1);
  else if (action.kind === 'drop') held.delete(key(action.at));
  else if (action.kind === 'xfer') {
    const from = key(action.source), to = key(action.target);
    held.set(to, (held.get(to) ?? 0) + (held.get(from) ?? 0)); held.delete(from);
  } else if (action.kind !== 'move') throw new Error(`Unhandled action ${action.kind}`);
}
assert.equal([...held.values()].reduce((sum, n) => sum + n, 0), 0);
assert.equal(loops.knitHoles.filter(h => h.idx >= bodyFirst && h.idx <= bodyLast).length, 0);
const sha = (text: string) => createHash('sha256').update(text).digest('hex');
let startupVerification;
if (run2Startup) {
  const reference = await readFile(run2Reference!, 'utf8');
  assert.equal(sha(reference), '092076f4a15dca100f27f444c2bf5875aec7505ec9df00a638d969f50a2189fb', 'Wrong Run 2 baseline');
  startupVerification = verifyRun2Startup(reference, converted.kcode, input.needleStart, width, colors);
}
const accent = state.chart.cells.flatMap((row, y) => row.flatMap((cell, x) => cell === 1 ? [{ x, y }] : []));
const bird = { width: Math.max(...accent.map(c => c.x)) - Math.min(...accent.map(c => c.x)) + 1,
  height: Math.max(...accent.map(c => c.y)) - Math.min(...accent.map(c => c.y)) + 1 };
const manifest = {
  kind: 'experimental-reversible-mini-beanie', status: 'software-checked-physically-untried',
  sourceProjectSha256: sha(sourceText), baselineKnitoutMatchesStudio: true,
  construction: 'straight inverse-image double jacquard; hand seam and gathered top; no decreases or machine bind-off',
  columnsPerBed: width, designRows: rows.length, bird, topWasteRowsPerBed: base.topWasteRows ?? 8,
  carriers: { main: colors[0], contrast: colors[1], waste: '6', draw: input.drawCarrier },
  kcodeBytes: Buffer.byteLength(converted.kcode), kcodeSha256: sha(converted.kcode), passes: trace.passes.length,
  inverseBodyCheckedFromKCode: true, bodyFirstPass1Based: bodyFirst + 1, bodyLastPass1Based: bodyLast + 1,
  diagnostics: report.diagnostics, encodedSpeeds: [...new Set(trace.passes.map(p => p.speed))].sort((a,b) => a-b), bodyStitch: 7, bodyRack: 0,
  startup: run2Startup ? 'Run 2 waste and intro with rear-left catch-loop refresh; later beanie cast-on retained' : 'original all-100 beanie start',
  ...(startupVerification ? { startupVerification } : {}),
  loopChecks: { emptyTransfers: loops.xferEmpty, maxStack: loops.maxStack, finalLoops: 0, bodyKnitIntoEmpty: 0 },
  limitation: 'New fabric, no physical knit validation. Source Studio project exports birdseye; rebuild this trial with the dedicated script. Fit and gauge unmeasured.',
};
await mkdir(destination, { recursive: true });
await writeFile(resolve(destination, 'study-input.json'), JSON.stringify({ sourceProjectSha256: sha(sourceText), input }, null, 2) + '\n');
await writeFile(resolve(destination, 'source-straight-project.json'), sourceText);
await writeFile(resolve(destination, 'reversible-beanie.k'), knitout);
await writeFile(resolve(destination, 'command.kc'), converted.kcode);
await writeFile(resolve(destination, 'verification.json'), JSON.stringify(manifest, null, 2) + '\n');
// Rear face mirrored horizontally, as viewed after turning the fabric over.
const unit = 6, top = 148, panelWidth = width * unit, gap = 70, left = 30;
const canvasWidth = 2 * panelWidth + gap + 2 * left, bottom = top + rows.length * unit;
const rectangles: string[] = [];
for (let face = 0; face < 2; face++) {
  const origin = left + face * (panelWidth + gap);
  state.chart.cells.forEach((row, y) => row.forEach((cell, x) => {
    const col = face === 0 ? x : width - 1 - x;
    const color = state.chart.palette[face === 0 ? cell : 1 - cell]!.hex;
    rectangles.push(`<rect x="${origin + col * unit}" y="${top + y * unit}" width="${unit}" height="${unit}" fill="${color}"/>`);
  }));
  rectangles.push(`<rect x="${origin}" y="${top - 48}" width="${panelWidth}" height="48" fill="#a8c5d2"/>`);
}
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${canvasWidth}" height="${bottom + 110}" viewBox="0 0 ${canvasWidth} ${bottom + 110}">
<rect width="100%" height="100%" fill="#faf9f5"/>
<g font-family="Arial, sans-serif" fill="#20252a">
<text x="30" y="30" font-size="22" font-weight="bold">Run 3 · reversible mini beanie panel</text>
<text x="30" y="56" font-size="14">${width} stitches × ${rows.length} design rows · bird ${bird.width} × ${bird.height} · straight, hand-gathered top</text>
<text x="30" y="88" font-size="16">Front face</text>
<text x="${left + panelWidth + gap}" y="88" font-size="16">Reverse face · opposite colours, mirrored</text>
${rectangles.join('\n')}
<text x="30" y="${bottom + 30}" font-size="14">Blue: 8 supporting waste rows on EACH bed. Lower waste and cast-on omitted.</text>
<text x="30" y="${bottom + 55}" font-size="14">Sew the side seam through both layers; secure both sets of top loops before removing waste.</text>
<text x="30" y="${bottom + 80}" font-size="14">Stitch chart only. Small construction trial; finished size and reversible gauge unmeasured.</text>
</g></svg>`;
await writeFile(resolve(destination, 'faces-preview.svg'), svg);
console.log(JSON.stringify(manifest, null, 2));
