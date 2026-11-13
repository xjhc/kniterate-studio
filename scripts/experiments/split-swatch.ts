#!/usr/bin/env -S node --import tsx
/**
 * Gate-2 review draft: captured single-bed split increases, Simple and Fashioned.
 * For each style, repeat both edges together in leftward split passes, then test
 * the left and right edges separately in rightward split passes. No simultaneous
 * rightward splits: that combination has no Customist capture yet.
 *
 * node --import tsx scripts/experiments/split-swatch.ts <out-dir>
 *
 * Uses the full-needle cast-on from the operator's successful edge trial.
 * Nothing in this package has been knitted or approved for sending to the operator.
 */

import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { auditTraceV1, computeInputHash, emitShapedPanelV1, parseKnitoutProgram, traceRowsV1, writeKnitoutProgram, type PanelRowV1, type TraceSectionV1 } from '../../packages/machine-lib/src/browser.js';
import { assessAuthoredCapacityV1, observeAuthoredCapacityV1 } from '../../packages/project-contract/src/index.js';
import { compileKCodeArtifact } from '../../apps/studio/src/kcode/compileKCodeArtifact.js';
import { withEdgeTrialCastOn } from './edge-trial-caston.js';
import { createPanelProject } from '../../apps/studio/src/sweater/panel.js';

const CAST_ON = { lo: 107, hi: 146 };
const LEAD_ROWS = 6;
const EVERY = 4;
const END_ROWS = 2;
const PARTS = [
  { name: 'Simple', fashion: 1, side: 'both', splitDirection: '<<', repeats: 2 },
  { name: 'Simple', fashion: 1, side: 'left', splitDirection: '>>', repeats: 1 },
  { name: 'Simple', fashion: 1, side: 'right', splitDirection: '>>', repeats: 1 },
  { name: 'Fashioned', fashion: 4, side: 'both', splitDirection: '<<', repeats: 2 },
  { name: 'Fashioned', fashion: 4, side: 'left', splitDirection: '>>', repeats: 1 },
  { name: 'Fashioned', fashion: 4, side: 'right', splitDirection: '>>', repeats: 1 },
] as const;
// The successful edge trial's body values after its first jersey row.
const BODY_SETTINGS = { speed: 200, roller: 450, stitch: 9 } as const;
const CARRIERS = { main: '3', waste: '6', draw: '1' } as const;

interface Event {
  readonly row: number;
  readonly part: number;
  readonly step: number;
  readonly name: string;
  readonly fashion: number;
  readonly side: 'left' | 'right' | 'both';
  readonly splitDirection: '<<' | '>>';
  readonly edges: readonly { side: 'left' | 'right'; splitNeedle: number; newNeedle: number }[];
}

function swatchRows(): { rows: PanelRowV1[]; events: Event[] } {
  const rows: PanelRowV1[] = [];
  const events: Event[] = [];
  let { lo, hi } = CAST_ON;
  const push = (extra: Partial<PanelRowV1> = {}) => { rows.push({ segments: [{ lo, hi }], stitch: () => 'k', settings: 'body', sourceRow: rows.length, ...extra }); };
  for (let k = 0; k < LEAD_ROWS; k++) push();
  PARTS.forEach((part, index) => {
    // A zero-based even widening row follows a leftward preparing row.
    if (rows.length % 2 !== (part.splitDirection === '<<' ? 0 : 1)) push();
    for (let step = 1; step <= part.repeats; step++) {
      const edges: Event['edges'][number][] = [];
      if (part.side !== 'right') { edges.push({ side: 'left', splitNeedle: lo + part.fashion, newNeedle: lo - 1 }); lo--; }
      if (part.side !== 'left') { edges.push({ side: 'right', splitNeedle: hi - part.fashion, newNeedle: hi + 1 }); hi++; }
      events.push({ row: rows.length + 1, part: index + 1, step, name: part.name, fashion: part.fashion, side: part.side, splitDirection: part.splitDirection, edges });
      push({ increase: 'split', fashion: part.fashion });
      for (let k = 1; k < EVERY; k++) push();
    }
  });
  for (let k = 0; k < END_ROWS; k++) push();
  return { rows, events };
}

export async function buildSplitSwatch() {
  const { rows, events } = swatchRows();
  const widest = { lo: Math.min(...rows.map((row) => row.segments[0]!.lo)), hi: Math.max(...rows.map((row) => row.segments[0]!.hi)) };
  const built = emitShapedPanelV1({ rows, mainCarrier: CARRIERS.main, wasteCarrier: CARRIERS.waste, drawCarrier: CARRIERS.draw, top: 'waste', bodySettings: BODY_SETTINGS });
  const program = withEdgeTrialCastOn(built.program, CAST_ON.lo, CAST_ON.hi, widest.lo);
  const knitoutText = writeKnitoutProgram(program);
  const parsed = parseKnitoutProgram(knitoutText);
  const opRows = program.ops.map((op) => op.sourceRows ?? null);
  // Capacity is assessed as for any one-yarn panel of this size.
  const capacity = assessAuthoredCapacityV1(createPanelProject({ title: 'Split swatch', widthCm: 20, lengthCm: 15, textureId: 'stockinette', yarn: { name: 'Main', hex: '#D9CBB0' } }, { id: 'split-swatch', source: 'human', group: 'create' }));
  if (capacity.status !== 'supported') throw new Error(capacity.message);
  const observed = observeAuthoredCapacityV1(capacity, { knitoutRecords: knitoutText.split('\n').length });
  if (observed.status !== 'supported') throw new Error(observed.message);
  const kcode = await compileKCodeArtifact({
    kind: 'convert-kcode',
    requestId: 1,
    inputHash: computeInputHash({ construction: 'split-swatch@2-full-needle-caston', CAST_ON, LEAD_ROWS, EVERY, END_ROWS, PARTS, CARRIERS, BODY_SETTINGS }),
    capacity: observed,
    knitoutText,
    compilerNeedleRange: { start: widest.lo, end: widest.hi },
    programOpSourceRows: opRows.length === parsed.opLines.length ? opRows : parsed.opLines.map(() => null),
    rowProvenance: rows.map((_, index) => ({ rowId: `row-${index + 1}`, chartRow: rows.length - 1 - index, machineRow: index })),
  });
  return { rows, events, widest, knitoutText, kcode };
}

async function main() {
  const out = process.argv[2];
  if (!out) { process.stderr.write('usage: split-swatch.ts <out-dir>\n'); process.exit(64); }
  const { rows, events, widest, knitoutText, kcode } = await buildSplitSwatch();
  const problems = [
    ...(kcode.validation?.diagnostics ?? []).filter((diagnostic) => diagnostic.severity === 'error').map((diagnostic) => `validator: ${diagnostic.rule}: ${diagnostic.message}`),
    ...(kcode.safety?.diagnostics ?? []).map((diagnostic) => `safety: ${diagnostic.rule}: ${diagnostic.message}`),
  ];
  const trace = kcode.trace!;
  const passOfRow = new Map(kcode.rowPasses.map((row) => [row.rowId, row.passIndices] as const));
  const firstBody = Math.min(...(passOfRow.get('row-1') ?? [0])) + 1;
  const lastBody = Math.max(...kcode.rowPasses.flatMap((row) => row.passIndices)) + 1;
  const sections: TraceSectionV1[] = [{ name: 'waste', from: 1, to: firstBody - 1 }, { name: 'body', from: firstBody, to: lastBody }, { name: 'top', from: lastBody + 1, to: trace.passes.length }];
  const audit = auditTraceV1(trace, { sections });
  const listed = traceRowsV1(trace, sections);
  const passesOf = (row: number) => (passOfRow.get(`row-${row}`) ?? []).map((index) => listed[index]!);
  const table = events.map((event) => {
    // The row before the increase holds the split; the increase's own row holds the transfers and then knits wider.
    const split = passesOf(event.row - 1).find((pass) => (pass.actions['split front>rear'] ?? 0) > 0);
    const own = passesOf(event.row);
    const transfers = own.filter((pass) => pass.role === 'transfer').map((pass) => pass.pass);
    const knit = own.find((pass) => pass.carrier === CARRIERS.main && (pass.actions['knit front'] ?? 0) > 0);
    if (split === undefined || knit === undefined || transfers.length === 0) problems.push(`design: row ${event.row} has no split, transfer or knitting pass`);
    else if (split.direction !== event.splitDirection || split.rack !== 0 || split.actions['split front>rear'] !== event.edges.length) problems.push(`design: row ${event.row} has the wrong split direction, racking or split count`);
    return { ...event, splitPass: split?.pass ?? 0, transfers, knitPass: knit?.pass ?? 0 };
  });
  const splitPasses = listed.filter((pass) => (pass.actions['split front>rear'] ?? 0) > 0);
  if (splitPasses.length !== events.length || splitPasses.reduce((count, pass) => count + (pass.actions['split front>rear'] ?? 0), 0) !== events.reduce((count, event) => count + event.edges.length, 0)) problems.push('design: every new edge needle must have exactly one split');
  if (table.some((event) => event.side === 'both' && event.splitDirection !== '<<')) problems.push('design: simultaneous rightward splits have no capture');
  const summary = audit.checks.map((check) => `${check.id} ${check.value}${check.limit !== null ? `/${check.limit}` : ''} ${check.ok ? 'ok' : check.severity === 'issue' ? 'ISSUE' : 'note'}`);
  const ok = kcode.ok && problems.length === 0 && audit.ok;
  const span = (part: number) => { const own = table.filter((event) => event.part === part); return `${own[0]!.splitPass}–${own.at(-1)!.knitPass}`; };
  const instructions = [
    '# Split-increase swatch — Gate 2 review draft',
    '',
    `Candidate: \`program.kc\`, ${trace.passes.length} passes, ${Buffer.byteLength(kcode.kcText)} bytes, SHA-256 \`${kcode.kcHash}\`.`,
    'Checked by software only. This file has not been knitted. Review draft; not approved for sending to the operator.',
    '',
    `One piece of plain jersey: ${rows.length} body rows, starting at ${CAST_ON.hi - CAST_ON.lo + 1} stitches and widening to ${widest.hi - widest.lo + 1}. No decreases.`,
    '',
    '## Cast-on and yarn',
    '',
    'The full-needle cast-on follows the operator’s successful 2026-11-12 edge trial (268 passes, SHA-256 2c5ef66ef99610d933f9fbdf7998d6dad242e67402ad06ba61201684ee72a8ac). Its construction and settings are retained. Idle carriers park farther left to clear this swatch’s wider outline. The combined split swatch still needs its own review and knit.',
    `C${CARRIERS.main}: use the same main yarn as the successful orange edge swatch. Its yarn specification was not recorded; confirm the actual cone with the operator. Body settings are speed ${BODY_SETTINGS.speed}, roller ${BODY_SETTINGS.roller}, stitch ${BODY_SETTINGS.stitch}, as encoded in that trial.`,
    `C${CARRIERS.waste}: the same waste yarn. C${CARRIERS.draw}: the same draw thread. Both stay parked through the body. The top is waste yarn; stitches below it remain live.`,
    '',
    '## What this tests',
    '',
    'A split knits a new front loop through an existing loop and moves the old loop to the rear. Transfers then move the edge outward. Software replay finds no empty-needle starts in the body; the knit must establish whether each loop is caught and the edge is clean.',
    'Both-edge increases use right-to-left split rows only. Left-to-right split rows test one edge at a time, because simultaneous left-to-right splits have no captured reference.',
    '',
    ...PARTS.map((part, index) => `${index + 1}. **${part.name}, ${part.side === 'both' ? 'both edges' : `${part.side} edge`} (passes ${span(index + 1)}).** ${part.repeats} event(s); split ${part.splitDirection === '<<' ? 'right to left' : 'left to right'}, ${part.fashion} stitch(es) inward from each tested edge.`),
    '',
    '## Every increase',
    '',
    '| Part | Style | Step | Edge | Split direction | Split pass | Transfer passes | First wider row |',
    '|---|---|---|---|---|---|---|---|',
    ...table.flatMap((event) => event.edges.map((edge) => `| ${event.part} | ${event.name} | ${event.step} | ${edge.side} | ${event.splitDirection} | ${event.splitPass} | ${event.transfers.join(', ')} | ${event.knitPass} |`)),
    '',
    'Paired entries with the same split pass are one simultaneous increase at both edges. Their transfer lists cover the whole event, left edge before right edge. Pass numbers are 1-based, as on the controller.',
    '',
    '## What to record',
    '',
    'For each fault record these three facts:',
    '1. The pass number shown on the controller.',
    '2. The left or right edge.',
    '3. Whether the loop stayed, dropped, or sat on the wrong needle; note the bed if visible.',
    '',
    'If the first split is refused or behaves unexpectedly, stop and record the pass. Stop for piled loops or a needle at risk. Record any stops, interventions and setting changes.',
    'Photograph both faces and each widening edge. Mark the affected part and pass. Compare Simple with Fashioned for holes, loose loops and edge appearance.',
    '',
    '## Software checks',
    '',
    `- Strict KCode validator and machine-safety envelope: ${problems.length === 0 ? 'passed' : `${problems.length} problem(s)`}.`,
    `- Loop audit: ${audit.ok ? 'passed' : 'FAILED'} (${summary.join(', ')}).`,
    `- Body work: ${audit.work.knitting} knitting, ${audit.work.transfers} transfer, ${audit.work.movementOnly} movement-only passes.`,
    '- The engine’s 13 capture comparisons cover these forms. Transfer roller stays 0; some Customist returns use 50. No controller acceptance or physical split-knit result is established.',
    '',
  ].join('\n');
  await mkdir(out, { recursive: true });
  await writeFile(join(out, 'program.kc'), kcode.kcText);
  await writeFile(join(out, 'program.k'), knitoutText);
  await writeFile(join(out, 'instructions.md'), instructions);
  const report = { ok, reviewOnly: true, castOn: 'operator edge trial full-needle start; widest-row feeder parking', bytes: Buffer.byteLength(kcode.kcText), passes: trace.passes.length, kcodeSha256: kcode.kcHash, knitoutSha256: createHash('sha256').update(knitoutText).digest('hex'), rows: rows.length, widest, events: table, problems, audit: summary, work: audit.work };
  await writeFile(join(out, 'verification.json'), `${JSON.stringify(report, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  process.exit(ok ? 0 : 1);
}

if (process.argv[1]?.endsWith('split-swatch.ts')) await main();
