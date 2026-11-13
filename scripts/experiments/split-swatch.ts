#!/usr/bin/env -S node --import tsx
/**
 * A split-increase swatch: one small jersey piece that widens with Kniterate's
 * current increase, the split stitch of Customist's Increase Transfers command.
 * The emitted passes are those of two Customist exports kept in
 * packages/machine-lib/reference/customist-increase (see the shaped-panel test).
 *
 * Four parts of three increases each, four rows apart:
 *
 *   1. Simple, right edge     the split is one stitch in from the edge
 *   2. Simple, left edge
 *   3. Fashioned, right edge  the split is four stitches in: a fashioning mark
 *   4. Fashioned, left edge
 *
 * Parts 1 and 3 are the exports' own form. Parts 2 and 4 mirror the transfers;
 * their split is still made in a right-to-left pass, the only one the exports show.
 *
 *   node --import tsx scripts/experiments/split-swatch.ts <out-dir>
 *
 * A development trial: Surface-proven at most, nothing here is knitted.
 */

import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { auditTraceV1, computeInputHash, emitShapedPanelV1, parseKnitoutProgram, traceRowsV1, writeKnitoutProgram, type PanelRowV1, type TraceSectionV1 } from '../../packages/machine-lib/src/browser.js';
import { assessAuthoredCapacityV1, observeAuthoredCapacityV1 } from '../../packages/project-contract/src/index.js';
import { compileKCodeArtifact } from '../../apps/studio/src/kcode/compileKCodeArtifact.js';
import { createPanelProject } from '../../apps/studio/src/sweater/panel.js';

const CAST_ON = { lo: 107, hi: 146 };
/** An even number, so the row before each increase runs right to left. */
const LEAD_ROWS = 6;
const EVERY = 4;
const PER_PART = 3;
const END_ROWS = 2;
const PARTS = [
  { name: 'Simple', fashion: 1, side: 'right' },
  { name: 'Simple', fashion: 1, side: 'left' },
  { name: 'Fashioned', fashion: 4, side: 'right' },
  { name: 'Fashioned', fashion: 4, side: 'left' },
] as const;
const CARRIERS = { main: '3', waste: '6', draw: '1' } as const;

interface Event { readonly row: number; readonly part: number; readonly step: number; readonly name: string; readonly fashion: number; readonly side: 'left' | 'right'; readonly splitNeedle: number; readonly newNeedle: number }

function swatchRows(): { rows: PanelRowV1[]; events: Event[] } {
  const rows: PanelRowV1[] = [];
  const events: Event[] = [];
  let { lo, hi } = CAST_ON;
  const push = (extra: Partial<PanelRowV1> = {}) => { rows.push({ segments: [{ lo, hi }], stitch: () => 'k', settings: 'body', sourceRow: rows.length, ...extra }); };
  for (let k = 0; k < LEAD_ROWS; k++) push();
  PARTS.forEach((part, index) => {
    for (let step = 1; step <= PER_PART; step++) {
      const splitNeedle = part.side === 'right' ? hi - part.fashion : lo + part.fashion;
      if (part.side === 'right') hi++; else lo--;
      events.push({ row: rows.length + 1, part: index + 1, step, name: part.name, fashion: part.fashion, side: part.side, splitNeedle, newNeedle: part.side === 'right' ? hi : lo });
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
  const built = emitShapedPanelV1({ rows, mainCarrier: CARRIERS.main, wasteCarrier: CARRIERS.waste, drawCarrier: CARRIERS.draw, top: 'waste' });
  const knitoutText = writeKnitoutProgram(built.program);
  const parsed = parseKnitoutProgram(knitoutText);
  const opRows = built.program.ops.map((op) => op.sourceRows ?? null);
  // Capacity is assessed as for any one-yarn panel of this size.
  const capacity = assessAuthoredCapacityV1(createPanelProject({ title: 'Split swatch', widthCm: 20, lengthCm: 15, textureId: 'stockinette', yarn: { name: 'Main', hex: '#D9CBB0' } }, { id: 'split-swatch', source: 'human', group: 'create' }));
  if (capacity.status !== 'supported') throw new Error(capacity.message);
  const observed = observeAuthoredCapacityV1(capacity, { knitoutRecords: knitoutText.split('\n').length });
  if (observed.status !== 'supported') throw new Error(observed.message);
  const kcode = await compileKCodeArtifact({
    kind: 'convert-kcode',
    requestId: 1,
    inputHash: computeInputHash({ construction: 'split-swatch@1', CAST_ON, LEAD_ROWS, EVERY, PER_PART, END_ROWS, PARTS, CARRIERS }),
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
    else if (split.direction !== '<<' || split.rack !== 0) problems.push(`design: the split for row ${event.row} is not a right-to-left pass at rack 0`);
    return { ...event, splitPass: split?.pass ?? 0, transfers, knitPass: knit?.pass ?? 0 };
  });
  const splitPasses = listed.filter((pass) => (pass.actions['split front>rear'] ?? 0) > 0);
  if (splitPasses.length !== events.length || splitPasses.some((pass) => pass.actions['split front>rear'] !== 1)) problems.push('design: every increase should be one split in its own pass');
  const summary = audit.checks.map((check) => `${check.id} ${check.value}${check.limit !== null ? `/${check.limit}` : ''} ${check.ok ? 'ok' : check.severity === 'issue' ? 'ISSUE' : 'note'}`);
  const ok = kcode.ok && problems.length === 0 && audit.ok;
  const span = (part: number) => { const own = table.filter((event) => event.part === part); return `${own[0]!.splitPass}–${own.at(-1)!.knitPass}`; };
  const instructions = [
    '# Split-increase swatch',
    '',
    `Candidate: \`program.kc\`, ${trace.passes.length} passes, SHA-256 \`${kcode.kcHash}\`.`,
    'A development trial, checked by software only. It has not been knitted.',
    '',
    `One small piece of plain jersey, ${rows.length} rows. It casts on ${CAST_ON.hi - CAST_ON.lo + 1} stitches on needles ${CAST_ON.lo}–${CAST_ON.hi} and widens to ${widest.hi - widest.lo + 1} (needles ${widest.lo}–${widest.hi}): six stitches on the right, six on the left. There are no decreases.`,
    '',
    '## Yarns',
    '',
    `- C${CARRIERS.main}: main yarn, one colour. Same yarn and settings as the edge swatch.`,
    `- C${CARRIERS.waste}: waste yarn. C${CARRIERS.draw}: draw thread. Both stay parked on the left after the start.`,
    '',
    '## What is new',
    '',
    'Every increase is a split stitch, the increase Kniterate\'s own app makes (Increase Transfers). Studio has not written one before.',
    '',
    '1. In a right-to-left knitting row, one needle near the edge is split: it knits a new loop and passes its old loop to the rear needle opposite. On the screen this row shows as a transfer row with yarn.',
    '2. The edge stitches outside that needle go to the rear bed, then all of them come back one needle outward.',
    '3. The next row knits one stitch wider. No needle is ever knitted empty, so there should be no hole.',
    '',
    '## The four parts',
    '',
    ...PARTS.map((part, index) => `${index + 1}. **${part.name}, ${part.side} edge (passes ${span(index + 1)}).** The split is ${part.fashion === 1 ? 'one stitch' : `${part.fashion} stitches`} in from the edge.${part.side === 'right' ? ' This is exactly the form in Kniterate\'s export.' : ' The mirror of Kniterate\'s form; Kniterate\'s export only shows the right edge.'}`),
    '',
    '## Every increase',
    '',
    '| Part | Style | Edge | Step | Split pass | Split needle | Transfer passes | First wider row |',
    '|---|---|---|---|---|---|---|---|',
    ...table.map((event) => `| ${event.part} | ${event.name} | ${event.side} | ${event.step} | ${event.splitPass} | ${event.splitNeedle} | ${event.transfers[0]}–${event.transfers.at(-1)} | ${event.knitPass} |`),
    '',
    '## What to record',
    '',
    '1. Whether the machine runs each split pass at all. If it stops or does something unexpected at the first one, stop and note the pass number: that would mean the machine reads this pass differently from Kniterate\'s app.',
    '2. For anything that goes wrong: the pass number, which edge, and whether a loop fell off, stayed behind on the rear bed, or sat on the wrong needle.',
    '3. Afterwards: a photo of each face flat and a close-up of each edge. Is there a hole at any increase? Which looks better as an open scarf edge, Simple (parts 1–2) or Fashioned (parts 3–4)?',
    '',
    'The top ends on waste yarn; the stitches under it are live.',
    '',
    '## Software checks',
    '',
    `- Strict KCode validator and machine-safety envelope: ${problems.length === 0 ? 'passed' : `${problems.length} problem(s)`}.`,
    `- Loop audit: ${audit.ok ? 'passed' : 'FAILED'} (${summary.join(', ')}).`,
    `- Passes from the end of the start to the last row: ${audit.work.knitting} knitting, ${audit.work.transfers} transfer, ${audit.work.movementOnly} movement-only.`,
    '- The increase passes match Kniterate\'s two Customist exports needle for needle (shaped-panel test). Transfers here keep roller 0 throughout; Kniterate\'s export uses roller 50 on the passes that bring the loops back.',
    '',
  ].join('\n');
  await mkdir(out, { recursive: true });
  await writeFile(join(out, 'program.kc'), kcode.kcText);
  await writeFile(join(out, 'program.k'), knitoutText);
  await writeFile(join(out, 'instructions.md'), instructions);
  process.stdout.write(`${JSON.stringify({ ok, passes: trace.passes.length, kcodeSha256: kcode.kcHash, knitoutSha256: createHash('sha256').update(knitoutText).digest('hex'), rows: rows.length, widest, events: table, problems, audit: summary, work: audit.work }, null, 2)}\n`);
  process.exit(ok ? 0 : 1);
}

if (process.argv[1]?.endsWith('split-swatch.ts')) await main();
