#!/usr/bin/env node

// Only a strict whole-program trace match earns "reproduced". Face projections
// and shifted stitch sets are diagnostics, not that gate or physical evidence.
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { appendProjectEdit, createColorworkProjectV1, type ProjectState } from '../packages/project-contract/src/index.js';
import { KNITERATE_7GG_KCODE_PROFILE_V2 } from '../packages/machine-lib/src/knitout/kcode/machine-profile.js';
import { parseKCodeDocument } from '../packages/machine-lib/src/knitout/kcode/parser.js';
import { projectKCodeMachineTrace } from '../packages/machine-lib/src/knitout/kcode/machine-trace.js';
import { diffKCodeMachineTrace } from '../packages/machine-lib/src/knitout/kc-diff.js';
import { compareKnittedFaceRowsV1, projectKnittedFacesV1, recoverColorworkFromFrontFaceV1 } from '../packages/machine-lib/src/knitout/kcode/knitted-faces.js';
import { diffTraceStitchesV1 } from '../packages/machine-lib/src/knitout/kcode/trace-stitch-diff.js';
import { runAuthoredPipeline } from '../apps/studio/src/authoredPipeline.js';
import { openMachineDocument } from '../apps/studio/src/engine.js';
import { buildCustomistRibBeanieProgram } from '../packages/machine-lib/src/knitout/passes/customist-rib-beanie.js';
import { writeKnitoutProgram } from '../packages/machine-lib/src/knitout/emitter.js';
import { authoredKnitoutToKCodeWithTrace } from '../packages/machine-lib/src/knitout/kniterate/to-kcode.js';

type Carrier = '1' | '2' | '3' | '4' | '5' | '6';
interface Reference {
  readonly id: string;
  readonly group: 'colorwork' | 'rib + beanie' | 'sweater panel' | 'shaped garment';
  readonly waste: Carrier;
  readonly strategy?: ProjectState['strategy'];
  /** A dedicated construction generator instead of an authored colorwork project. */
  readonly generator?: 'customist-rib-beanie';
  readonly gaps: readonly string[];
}

export const REFERENCES: readonly Reference[] = [
  { id: 'swatch', group: 'colorwork', waste: '2', strategy: { technique: 'fairisle', floatLimit: 30 }, gaps: ['reference-specific cast-on and finish'] },
  { id: 'jacquard', group: 'colorwork', waste: '6', strategy: { technique: 'birdseye', floatLimit: 30 }, gaps: ['two-color jacquard frame and backing'] },
  { id: 'fairisle', group: 'colorwork', waste: '6', strategy: { technique: 'fairisle', floatLimit: 30 }, gaps: ['six Customist catch-loop passes'] },
  { id: 'color-swatch-bindoff', group: 'colorwork', waste: '5', strategy: { technique: 'fairisle', floatLimit: 30 }, gaps: ['reference-specific cast-on and finish'] },
  { id: 'dbj', group: 'colorwork', waste: '6', strategy: { technique: 'birdseye', floatLimit: 30, birdseyeMode: 'full' }, gaps: ['full-needle jacquard backing (rack 0.5)', 'jacquard border closing'] },
  { id: 'fox-baby-beanie', group: 'rib + beanie', waste: '6', gaps: ['rib', 'rib-to-jersey transfers', 'decrease transfers', 'colorwork within a shaped piece'] },
  { id: '2x2-rib-beanie', group: 'rib + beanie', waste: '6', generator: 'customist-rib-beanie', gaps: ['crown generalised beyond 194 needles'] },
  { id: 'front', group: 'sweater panel', waste: '6', gaps: ['rib hem', 'increase/decrease transfers', 'neckline split', 'partial bind-off'] },
  { id: 'back', group: 'sweater panel', waste: '6', gaps: ['rib hem', 'increase/decrease transfers', 'partial bind-off'] },
  { id: 'sleeves', group: 'sweater panel', waste: '6', gaps: ['rib cuff', 'increase transfers (racks ±2)', 'sleeve-cap decreases'] },
  { id: 'sophie', group: 'shaped garment', waste: '6', gaps: ['piece grows from 6 needles', '~20k transfer actions', 'stitch grid + transfers'] },
  { id: 'sophie2', group: 'shaped garment', waste: '6', gaps: ['piece grows from 6 needles', '~20k transfer actions', 'stitch grid + transfers'] },
  { id: 'sophie_stripe', group: 'shaped garment', waste: '6', gaps: ['piece grows from 6 needles', 'stripes', '~20k transfer actions'] },
];
const ROOT = fileURLToPath(new URL('..', import.meta.url));
const PALETTE = ['#F4F0E6', '#24415D', '#C2413A', '#D6A633'];
const sha256 = (text: string) => createHash('sha256').update(text).digest('hex');

function trace(kcode: string) {
  const parsed = parseKCodeDocument(kcode, { profile: KNITERATE_7GG_KCODE_PROFILE_V2, dialect: 'knitout-vendor', strict: true });
  if (!parsed.ok) throw new Error('comparison input is not strict KCode');
  return projectKCodeMachineTrace(parsed.document, KNITERATE_7GG_KCODE_PROFILE_V2);
}

/** No carrier remapping or alignment is allowed for this verdict. */
export function compareParityPrograms(reference: string, candidate: string, exportReady: boolean) {
  const machine = diffKCodeMachineTrace(candidate, reference, {
    profile: KNITERATE_7GG_KCODE_PROFILE_V2, dialect: 'knitout-vendor', maxDeltas: 24,
  });
  return {
    status: !exportReady || machine.status !== 'compared' ? 'blocked' as const
      : machine.identical ? 'reproduced' as const : 'partial' as const,
    machine, referenceSha256: sha256(reference), candidateSha256: sha256(candidate),
  };
}

export async function scoreReference(reference: Reference) {
  const base = { id: reference.id, group: reference.group, gaps: reference.gaps };
  if (reference.generator === 'customist-rib-beanie') {
    // The reference's own parameters: knitout 30-223 (its KCode columns 29-222), 102 rib rows.
    const referenceText = await readFile(resolve(ROOT, `packages/machine-lib/reference/${reference.id}.kc`), 'utf8');
    const converted = authoredKnitoutToKCodeWithTrace(writeKnitoutProgram(buildCustomistRibBeanieProgram({
      needleStart: 30, needleEnd: 223, bodyCarrier: '3', wasteCarrier: '6', drawCarrier: '1', ribRows: 102, crown: 'customist-194',
    })));
    if (!converted.ok) return { ...base, status: 'blocked' as const, reason: converted.error };
    const document = openMachineDocument(`${reference.id}.kc`, converted.kcode, { dialect: 'knitout-vendor' });
    return {
      ...base,
      input: { kind: 'construction-generator', generator: 'customist-2x2-rib-beanie@1', ribRows: 102 },
      ...compareParityPrograms(referenceText, converted.kcode, document.verdict.state === 'surface'),
      verdict: document.verdict.label,
      stitches: diffTraceStitchesV1(trace(referenceText), trace(converted.kcode)),
    };
  }
  if (!reference.strategy) return { ...base, status: 'unsupported' as const, reason: 'No authored recipe for this piece.' };
  const referenceText = await readFile(resolve(ROOT, `packages/machine-lib/reference/${reference.id}.kc`), 'utf8');
  const referenceTrace = trace(referenceText);
  const referenceFaces = projectKnittedFacesV1(referenceTrace, { drawCarrier: '1', wasteCarrier: reference.waste });
  let project;
  let input;
  let carrierMap: Map<string, string>;
  if (reference.id === 'fairisle') {
    // The exact trial chart/bindings, not a heuristic 52-row C2/C3 recovery.
    const path = 'fixtures/colorwork-chart-v1/customist-fairisle-reference.json';
    const chart = JSON.parse(await readFile(resolve(ROOT, path), 'utf8'));
    project = createColorworkProjectV1(chart, { id: 'parity-fairisle' });
    for (const [paletteId, carrier] of [['ground', '4'], ['motif', '3']] as const) {
      project = appendProjectEdit(project, { id: `carrier-${paletteId}`, source: 'system', edit: { kind: 'set-yarn-assignment', assignment: { paletteId, carrier, yarnName: paletteId } } });
    }
    input = { kind: 'checked-in-chart', path, width: chart.width as number, height: chart.height as number, droppedPartialRows: 0 };
    carrierMap = new Map([['3', '3'], ['4', '4']]);
  } else {
    // This is a proposed input. Never delete interior holes to invent a chart.
    const recovered = recoverColorworkFromFrontFaceV1(referenceFaces.front, { trimEdgePartialRows: true });
    if (!recovered || recovered.carriers.length > 4) return {
      ...base, status: 'unsupported' as const,
      reason: 'Knit columns do not recover an unambiguous rectangle with at most four colors; an explicit chart/body window is needed.',
      referenceSha256: sha256(referenceText), boundary: referenceFaces.boundary,
    };
    project = createColorworkProjectV1({
      kind: 'knitlab-colorwork-chart', version: 1, title: reference.id,
      width: recovered.width, height: recovered.height, rowNumbering: 'bottom-up',
      palette: recovered.carriers.map((carrier, index) => ({ id: `c${carrier}`, name: `C${carrier}`, hex: PALETTE[index]! })),
      cells: recovered.cells.map((row) => [...row]),
    }, { id: `parity-${reference.id}`, needleOffset: Math.max(1, referenceFaces.front.firstCoordinate ?? 1) });
    input = { kind: 'inferred-knit-columns', width: recovered.width, height: recovered.height, droppedPartialRows: recovered.droppedPartialRows };
    carrierMap = new Map(project.base.machine.yarnAssignments.map((assignment) => [assignment.paletteId.slice(1), assignment.carrier as string]));
  }
  project = appendProjectEdit(project, { id: 'recipe', source: 'system', edit: { kind: 'set-strategy', strategy: reference.strategy } });
  const result = await runAuthoredPipeline(project);
  if (!result.kcode) return { ...base, input, status: 'blocked' as const, verdict: result.verdict.label, reason: result.compileError ?? result.outputError ?? result.compiled?.messages.map((message) => message.message).join('; ') ?? result.verdict.annotation };
  const candidateFaces = projectKnittedFacesV1(result.kcode.trace!, { drawCarrier: '1', wasteCarrier: '6' });
  return {
    ...base, input, ...compareParityPrograms(referenceText, result.kcode.kcText, result.exportReady), verdict: result.verdict.label,
    stitches: diffTraceStitchesV1(referenceTrace, result.kcode.trace!),
    faces: {
      referenceBoundary: referenceFaces.boundary, candidateBoundary: candidateFaces.boundary,
      carrierMap: Object.fromEntries(carrierMap),
      front: compareKnittedFaceRowsV1(referenceFaces.front, candidateFaces.front, carrierMap),
      rear: compareKnittedFaceRowsV1(referenceFaces.rear, candidateFaces.rear, carrierMap),
      limitations: [...new Set([...referenceFaces.limitations, ...candidateFaces.limitations])],
    },
  };
}

async function main(): Promise<void> {
  const rows = [];
  for (const reference of REFERENCES) rows.push(await scoreReference(reference));
  const counts = {
    reproduced: rows.filter((row) => row.status === 'reproduced').length,
    partial: rows.filter((row) => row.status === 'partial').length,
    blocked: rows.filter((row) => row.status === 'blocked').length,
    unsupported: rows.filter((row) => row.status === 'unsupported').length,
    total: rows.length,
  };
  if (process.argv.includes('--json')) {
    process.stdout.write(`${JSON.stringify({ kind: 'kniterate-studio-parity-scoreboard', schemaVersion: 2, counts, references: rows }, null, 2)}\n`);
    return;
  }
  process.stdout.write(`Customist parity: ${counts.reproduced} exact machine traces, ${counts.partial} partial, ${counts.blocked} blocked, ${counts.unsupported} unsupported, of ${counts.total} references\nSoftware comparison only; no controller or physical-knit claim.\n\n`);
  for (const row of rows) {
    const comparison = 'stitches' in row && row.stitches ? ` · ${row.stitches.identicalPasses}/${row.stitches.expectedPasses} stitch-identical passes · ${row.machine.deltaCount} strict trace differences · ${row.verdict}` : '';
    process.stdout.write(`${row.status.padEnd(12)} ${row.id.padEnd(21)} ${row.group}${comparison}\n`);
    if ('reason' in row) process.stdout.write(`             ${row.reason}\n`);
    if (row.gaps.length) process.stdout.write(`             needs: ${row.gaps.join(', ')}\n`);
  }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error: unknown) => {
    process.stderr.write(`parity: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 2;
  });
}
