#!/usr/bin/env node

// Customist parity scoreboard: which captured reference .kc pieces Studio can
// author natively. For each reference with a recipe, recover its colorwork from
// the reference front face, author it as a Studio project with the recipe's
// backing, run the same pipeline as the UI, and compare knitted faces.
// Local software evidence only: face equality is programmed loop formation,
// not fabric appearance or a physical knit.

import { readFile } from 'node:fs/promises';

import {
  appendProjectEdit,
  createColorworkProjectV1,
  type ProjectState,
} from '../packages/project-contract/src/index.ts';
import { KNITERATE_7GG_KCODE_PROFILE_V2 } from '../packages/machine-lib/src/knitout/kcode/machine-profile.ts';
import { parseKCodeDocument } from '../packages/machine-lib/src/knitout/kcode/parser.ts';
import { projectKCodeMachineTrace } from '../packages/machine-lib/src/knitout/kcode/machine-trace.ts';
import {
  compareKnittedFaceRowsV1,
  projectKnittedFacesV1,
  recoverColorworkFromFrontFaceV1,
  type KnittedFacesV1,
} from '../packages/machine-lib/src/knitout/kcode/knitted-faces.ts';
import { runAuthoredPipeline } from '../apps/studio/src/authoredPipeline.ts';

type Strategy = ProjectState['strategy'];
type Carrier = '1' | '2' | '3' | '4' | '5' | '6';

interface Reference {
  readonly id: string;
  readonly group: 'colorwork' | 'rib + beanie' | 'sweater panel' | 'shaped garment';
  readonly waste: Carrier;
  /** Studio recipe; absent when Studio cannot author the piece yet. */
  readonly strategy?: Strategy;
  /** What the piece needs that Studio lacks (or where the recipe diverges). */
  readonly gaps: readonly string[];
}

// Backings chosen by rear-face agreement. Unmatched rear rows in the colorwork
// group come from Customist's full-needle cast-on row (the first post-draw pass
// knits both beds on every needle); Studio casts on alternate needles.
const REFERENCES: readonly Reference[] = [
  { id: 'swatch', group: 'colorwork', waste: '2', strategy: { technique: 'fairisle', floatLimit: 30 }, gaps: ['Customist full-needle cast-on row'] },
  { id: 'jacquard', group: 'colorwork', waste: '6', strategy: { technique: 'ladder-back', floatLimit: 30 }, gaps: ['Customist full-needle cast-on row'] },
  { id: 'fairisle', group: 'colorwork', waste: '6', strategy: { technique: 'fairisle', floatLimit: 30 }, gaps: ['Customist full-needle cast-on row'] },
  { id: 'color-swatch-bindoff', group: 'colorwork', waste: '5', strategy: { technique: 'fairisle', floatLimit: 30 }, gaps: ['Customist full-needle cast-on row'] },
  { id: 'dbj', group: 'colorwork', waste: '6', strategy: { technique: 'birdseye', floatLimit: 30, birdseyeMode: 'full' }, gaps: ['full-needle jacquard (rack 0.5)', 'jacquard border closing', 'Customist full-needle cast-on row'] },
  { id: 'fox-baby-beanie', group: 'rib + beanie', waste: '6', gaps: ['rib', 'rib-to-jersey transfers', 'decrease transfers', 'colorwork within a shaped piece'] },
  { id: '2x2-rib-beanie', group: 'rib + beanie', waste: '6', gaps: ['2x2 rib', 'racked transfers up to ±4', 'crown decreases'] },
  { id: 'front', group: 'sweater panel', waste: '6', gaps: ['rib hem', 'increase/decrease transfers', 'neckline split', 'partial bind-off'] },
  { id: 'back', group: 'sweater panel', waste: '6', gaps: ['rib hem', 'increase/decrease transfers', 'partial bind-off'] },
  { id: 'sleeves', group: 'sweater panel', waste: '6', gaps: ['rib cuff', 'increase transfers (racks ±2)', 'sleeve-cap decreases'] },
  { id: 'sophie', group: 'shaped garment', waste: '6', gaps: ['piece grows from 6 needles', '~20k transfer actions', 'stitch grid + transfers'] },
  { id: 'sophie2', group: 'shaped garment', waste: '6', gaps: ['piece grows from 6 needles', '~20k transfer actions', 'stitch grid + transfers'] },
  { id: 'sophie_stripe', group: 'shaped garment', waste: '6', gaps: ['piece grows from 6 needles', 'stripes', '~20k transfer actions'] },
];

const PALETTE = ['#F4F0E6', '#24415D', '#C2413A', '#D6A633'];

function faces(kcode: string, waste: Carrier): KnittedFacesV1 {
  const parsed = parseKCodeDocument(kcode, { profile: KNITERATE_7GG_KCODE_PROFILE_V2, dialect: 'knitout-vendor', strict: true });
  if (!parsed.ok) throw new Error('reference is not strict KCode');
  return projectKnittedFacesV1(projectKCodeMachineTrace(parsed.document, KNITERATE_7GG_KCODE_PROFILE_V2), { drawCarrier: '1', wasteCarrier: waste });
}

interface Row {
  id: string;
  group: Reference['group'];
  status: 'reproduced' | 'partial' | 'not-yet';
  front: string | null;
  rear: string | null;
  verdict: string | null;
  gaps: readonly string[];
}

async function score(reference: Reference): Promise<Row> {
  const base = { id: reference.id, group: reference.group, gaps: reference.gaps };
  if (!reference.strategy) return { ...base, status: 'not-yet', front: null, rear: null, verdict: null };
  const referenceFaces = faces(await readFile(`packages/machine-lib/reference/${reference.id}.kc`, 'utf8'), reference.waste);
  const recovered = recoverColorworkFromFrontFaceV1(referenceFaces.front);
  if (!recovered || recovered.carriers.length > 4) return { ...base, status: 'not-yet', front: null, rear: null, verdict: null };

  let project = createColorworkProjectV1({
    kind: 'knitlab-colorwork-chart', version: 1, title: reference.id,
    width: recovered.width, height: recovered.height, rowNumbering: 'bottom-up',
    palette: recovered.carriers.map((carrier, index) => ({ id: `c${carrier}`, name: `C${carrier}`, hex: PALETTE[index]! })),
    cells: recovered.cells.map((row) => [...row]),
  }, { id: `parity-${reference.id}`, needleOffset: Math.max(1, referenceFaces.front.firstCoordinate ?? 1) });
  project = appendProjectEdit(project, { id: 'recipe', source: 'system', edit: { kind: 'set-strategy', strategy: reference.strategy } });
  const result = await runAuthoredPipeline(project);
  if (!result.kcode) return { ...base, status: 'not-yet', front: null, rear: null, verdict: result.verdict.label };

  // Studio assigns palette entries to C2.. in palette order.
  const carrierMap = new Map(project.base.machine.yarnAssignments.map((assignment) => [assignment.paletteId.slice(1), assignment.carrier as string]));
  const ours = faces(result.kcode.kcText, '6');
  const complete = { ...referenceFaces.front, rows: referenceFaces.front.rows.filter((row) => !row.includes(' ')) };
  const front = compareKnittedFaceRowsV1(complete, { ...ours.front, rows: ours.front.rows.filter((row) => !row.includes(' ')) }, carrierMap);
  const rear = compareKnittedFaceRowsV1(referenceFaces.rear, ours.rear, carrierMap);
  const frontExact = front.matchingRows === front.expectedRows;
  const rearExact = rear.matchingRows === rear.expectedRows;
  return {
    ...base,
    status: frontExact && rearExact && result.exportReady ? 'reproduced' : frontExact && result.exportReady ? 'partial' : 'not-yet',
    front: `${front.matchingRows}/${front.expectedRows}`,
    rear: `${rear.matchingRows}/${rear.expectedRows}`,
    verdict: result.verdict.label,
  };
}

async function main(): Promise<void> {
  const json = process.argv.includes('--json');
  const rows: Row[] = [];
  for (const reference of REFERENCES) rows.push(await score(reference));
  const counts = {
    reproduced: rows.filter((row) => row.status === 'reproduced').length,
    partial: rows.filter((row) => row.status === 'partial').length,
    total: rows.length,
  };
  if (json) {
    process.stdout.write(`${JSON.stringify({ kind: 'kniterate-studio-parity-scoreboard', schemaVersion: 1, counts, references: rows }, null, 2)}\n`);
    return;
  }
  process.stdout.write(`Customist parity: ${counts.reproduced} reproduced, ${counts.partial} front-face only, of ${counts.total} references\n\n`);
  for (const row of rows) {
    const faces = row.front === null ? '' : ` front ${row.front} rear ${row.rear} · ${row.verdict}`;
    process.stdout.write(`${row.status.padEnd(10)} ${row.id.padEnd(21)} ${row.group.padEnd(15)}${faces}\n`);
    if (row.gaps.length > 0) process.stdout.write(`${' '.repeat(11)}needs: ${row.gaps.join(', ')}\n`);
  }
}

main().catch((error: unknown) => {
  process.stderr.write(`parity: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 2;
});
