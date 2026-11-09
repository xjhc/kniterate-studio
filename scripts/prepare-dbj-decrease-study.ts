/** Development prototype, intentionally separate from the Studio garment UI.
 * node --import tsx scripts/prepare-dbj-decrease-study.ts <straight project.json> <directory>
 * Rebuilds the unchanged straight body, then adds eight two-bed edge decreases.
 * study-input.json records the complete machine input; the source project alone
 * remains straight and must NOT be presented as a shaped-project export.
 */
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

const [source, destination] = process.argv.slice(2);
if (!source || !destination) throw new Error('Supply a straight DBJ source project and output directory.');
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
const input: CustomistRibBeanieInput = { ...base, experimentalDoubleJacquardCrown: { steps: 8, rowsPerStep: 2 } };
const program = buildCustomistRibBeanieProgram(input);
const knitout = writeKnitoutProgram(program);
const converted = authoredKnitoutToKCodeWithTrace(knitout);
if (!converted.ok) throw new Error(converted.error);
const parsed = parseKCodeDocument(converted.kcode, { profile, dialect: 'knitout-vendor', strict: true });
if (!parsed.ok) throw new Error('Strict KCode parse failed.');
const trace = projectKCodeMachineTrace(parsed.document, profile);
const report = validateKCodeMachineTrace(trace, profile);
if (report.diagnostics.length) throw new Error(JSON.stringify(report.diagnostics));
const sha = (text: string) => createHash('sha256').update(text).digest('hex');
const bodyWidth = state.chart.width;
const widths = [bodyWidth, ...Array.from({ length: 8 }, (_, i) => bodyWidth - 2 * (i + 1))];
const manifest = {
  kind: 'experimental-dbj-edge-crown-study', status: 'software-checked-physically-untried',
  sourceProjectSha256: sha(sourceText), baselineKnitoutMatchesStudio: true,
  crown: input.experimentalDoubleJacquardCrown, columnsPerBed: widths,
  bodyRows: state.chart.height, crownDesignRows: 16, topWasteRowsPerBed: base.topWasteRows ?? 8,
  kcodeBytes: Buffer.byteLength(converted.kcode), kcodeSha256: sha(converted.kcode), passes: trace.passes.length,
  diagnostics: report.diagnostics,
  encodedSpeeds: [...new Set(trace.passes.map(pass => pass.speed))],
  limitation: 'Edge taper, not a rounded crown; birdseye backing, not inverse-image reversible; not integrated into Studio project/UI export.',
};
await mkdir(destination, { recursive: true });
await writeFile(resolve(destination, 'study-input.json'), JSON.stringify({ sourceProjectSha256: sha(sourceText), input }, null, 2) + '\n');
await writeFile(resolve(destination, 'source-straight-project.json'), sourceText);
await writeFile(resolve(destination, 'experimental-taper.k'), knitout);
await writeFile(resolve(destination, 'experimental-taper.kc'), converted.kcode);
await writeFile(resolve(destination, 'verification.json'), JSON.stringify(manifest, null, 2) + '\n');

// A stitch-count drawing, not a prediction of relaxed dimensions or fit.
const unit = 6, left = 60, chartTop = 190, crownRows = 16;
const faceRows = [
  ...Array.from({ length: crownRows }, (_, r) => ({ width: widths[8 - Math.floor(r / 2)]!, cells: null })),
  ...state.chart.cells.map(cells => ({ width: bodyWidth, cells })),
];
const rectangles: string[] = [];
faceRows.forEach((row, r) => {
  const inset = (bodyWidth - row.width) / 2;
  for (let col = 0; col < row.width; col++) {
    const color = row.cells ? state.chart.palette[row.cells[col]!]!.hex : state.chart.palette[0]!.hex;
    rectangles.push(`<rect x="${left + (col + inset) * unit}" y="${chartTop + r * unit}" width="${unit}" height="${unit}" fill="${color}"/>`);
  }
});
const wasteTop = chartTop - 48;
rectangles.push(`<rect x="${left + 8 * unit}" y="${wasteTop}" width="${widths[8]! * unit}" height="48" fill="#b2cdd4"/>`);
const bodyY = chartTop + crownRows * unit;
const bottom = chartTop + faceRows.length * unit;
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="820" height="${bottom + 110}" viewBox="0 0 820 ${bottom + 110}">
<rect width="820" height="100%" fill="#fbfaf7"/><g font-family="Arial, sans-serif" fill="#20252a">
<text x="40" y="44" font-size="25" font-weight="bold">Run 3 · double-jacquard decrease study</text>
<text x="40" y="73" font-size="16">Experimental edge taper — not a finished rounded crown</text>
<text x="40" y="99" font-size="14">Front stitch chart; both needle beds narrow together.</text>
${rectangles.join('\n')}
<path d="M ${left + bodyWidth * unit + 12} ${bodyY} H 490" stroke="#737b80"/>
<text x="500" y="${bodyY - 10}" font-size="16">${bodyWidth} columns → ${widths[8]} columns per bed</text>
<text x="500" y="${bodyY + 14}" font-size="14">8 decreases × 2 design rows</text>
<text x="500" y="${bodyY + 38}" font-size="14">Same stitch size 7; speed 100</text>
<text x="500" y="${chartTop - 20}" font-size="14">8 waste rows on each bed</text>
<text x="500" y="${bodyY + 95}" font-size="16">Original bird and straight body</text>
<text x="500" y="${bodyY + 120}" font-size="14">No rib; no single-jersey crown</text>
<text x="40" y="${bottom + 38}" font-size="14">Bottom waste/cast-on omitted from this drawing. Top still needs hand gathering.</text>
<text x="40" y="${bottom + 64}" font-size="14">Diagram shows stitch counts, not measured centimetres or finished fit.</text>
</g></svg>`;
await writeFile(resolve(destination, 'shape-preview.svg'), svg);
console.log(JSON.stringify(manifest, null, 2));
