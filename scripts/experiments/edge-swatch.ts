#!/usr/bin/env -S node --import tsx
/**
 * An edge swatch: one small jersey piece that narrows, widens past its start and
 * narrows again, on both edges at once. It follows the first increase swatch
 * (increase-swatch.ts), whose plain edge increase missed its loop and whose
 * decreases were bad, and it separates the three likely causes:
 *
 *   - support: the first narrowing has fabric under it; the second follows a
 *     widening, as the failed one did, so its edge hangs past the fabric below;
 *   - method: each narrowing makes two decreases one loop per pass and two with
 *     the edge stitches together (the method that failed);
 *   - carrier side: every widening row adds a needle at both edges, so one is
 *     knitted first (the yarn starts there) and the other last; half the rows
 *     run each way.
 *
 * Left and right carry the same events, so a fault on one side only shows as that.
 *
 *   node --import tsx scripts/experiments/edge-swatch.ts <out-dir>
 *
 * A development trial: Surface-proven at most, nothing here is knitted.
 */

import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { auditTraceV1, computeInputHash, emitShapedPanelV1, parseKnitoutProgram, traceRowsV1, writeKnitoutProgram, type PanelRowV1, type TraceSectionV1 } from '../../packages/machine-lib/src/browser.js';
import type { PanelDecreaseV1 } from '../../packages/machine-lib/src/knitout/passes/shaped-panel.js';
import { assessAuthoredCapacityV1, observeAuthoredCapacityV1 } from '../../packages/project-contract/src/index.js';
import { compileKCodeArtifact } from '../../apps/studio/src/kcode/compileKCodeArtifact.js';
import { createPanelProject } from '../../apps/studio/src/sweater/panel.js';

const CAST_ON = { lo: 107, hi: 146 };
const FASHION = 3;
const LEAD_ROWS = 6;
const HOLD_ROWS = 4;
/** Each narrowing: the method of each decrease, bottom to top. */
const NARROWING: readonly PanelDecreaseV1[] = ['single', 'single', 'together', 'together'];
/** The widening: rows from its first row at which both edges gain a needle. The odd gap after the third flips the pass direction. */
const WIDENING_AT = [0, 2, 4, 7, 9, 11];
const CARRIERS = { main: '3', waste: '6', draw: '1' } as const;

interface Event { readonly row: number; readonly section: 1 | 2 | 3; readonly step: number; readonly kind: 'decrease' | 'increase'; readonly method?: PanelDecreaseV1 }

function swatchRows(): { rows: PanelRowV1[]; events: Event[] } {
  const rows: PanelRowV1[] = [];
  const events: Event[] = [];
  let { lo, hi } = CAST_ON;
  const push = (extra: Partial<PanelRowV1> = {}) => { rows.push({ segments: [{ lo, hi }], stitch: () => 'k', settings: 'body', sourceRow: rows.length, ...extra }); };
  const plain = (count: number) => { for (let k = 0; k < count; k++) push(); };
  const narrow = (section: 1 | 3) => NARROWING.forEach((method, step) => {
    lo++; hi--;
    events.push({ row: rows.length + 1, section, step: step + 1, kind: 'decrease', method });
    push({ decrease: method });
    push();
  });
  plain(LEAD_ROWS);
  narrow(1);
  plain(HOLD_ROWS);
  for (let k = 0; k <= WIDENING_AT.at(-1)!; k++) {
    const step = WIDENING_AT.indexOf(k);
    if (step < 0) { push(); continue; }
    lo--; hi++;
    events.push({ row: rows.length + 1, section: 2, step: step + 1, kind: 'increase' });
    push({ increase: 'edge' });
  }
  plain(HOLD_ROWS);
  narrow(3);
  plain(HOLD_ROWS);
  return { rows, events };
}

export async function buildEdgeSwatch() {
  const { rows, events } = swatchRows();
  const widest = { lo: Math.min(...rows.map((row) => row.segments[0]!.lo)), hi: Math.max(...rows.map((row) => row.segments[0]!.hi)) };
  const built = emitShapedPanelV1({ rows, mainCarrier: CARRIERS.main, wasteCarrier: CARRIERS.waste, drawCarrier: CARRIERS.draw, top: 'waste', fashion: FASHION });
  const knitoutText = writeKnitoutProgram(built.program);
  const parsed = parseKnitoutProgram(knitoutText);
  const opRows = built.program.ops.map((op) => op.sourceRows ?? null);
  // Capacity is assessed as for any one-yarn panel of this size.
  const capacity = assessAuthoredCapacityV1(createPanelProject({ title: 'Edge swatch', widthCm: 20, lengthCm: 15, textureId: 'stockinette', yarn: { name: 'Main', hex: '#D9CBB0' } }, { id: 'edge-swatch', source: 'human', group: 'create' }));
  if (capacity.status !== 'supported') throw new Error(capacity.message);
  const observed = observeAuthoredCapacityV1(capacity, { knitoutRecords: knitoutText.split('\n').length });
  if (observed.status !== 'supported') throw new Error(observed.message);
  const kcode = await compileKCodeArtifact({
    kind: 'convert-kcode',
    requestId: 1,
    inputHash: computeInputHash({ construction: 'edge-swatch@1', CAST_ON, FASHION, LEAD_ROWS, HOLD_ROWS, NARROWING, WIDENING_AT, CARRIERS }),
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
  if (!out) { process.stderr.write('usage: edge-swatch.ts <out-dir>\n'); process.exit(64); }
  const { rows, events, widest, knitoutText, kcode } = await buildEdgeSwatch();
  const problems = [
    ...(kcode.validation?.diagnostics ?? []).filter((issue) => issue.severity === 'error').map((issue) => `validator: ${issue.rule}: ${issue.message}`),
    ...(kcode.safety?.diagnostics ?? []).map((finding) => `safety: ${finding.rule}: ${finding.message}`),
  ];
  const trace = kcode.trace!;
  const passOfRow = new Map(kcode.rowPasses.map((row) => [row.rowId, row.passIndices] as const));
  const firstBody = Math.min(...(passOfRow.get('row-1') ?? [0])) + 1;
  const lastBody = Math.max(...kcode.rowPasses.flatMap((row) => row.passIndices)) + 1;
  const sections: TraceSectionV1[] = [{ name: 'waste', from: 1, to: firstBody - 1 }, { name: 'body', from: firstBody, to: lastBody }, { name: 'top', from: lastBody + 1, to: trace.passes.length }];
  const audit = auditTraceV1(trace, { sections });
  const listed = traceRowsV1(trace, sections);
  const table = events.map((event) => {
    const passes = (passOfRow.get(`row-${event.row}`) ?? []).map((index) => index + 1);
    const span = { from: Math.min(...passes), to: Math.max(...passes) };
    // The row's knitting pass: the main yarn's pass with the most stitches.
    const knitting = passes.map((pass) => listed[pass - 1]!).filter((pass) => pass.carrier === CARRIERS.main).sort((a, b) => (b.actions['knit front'] ?? 0) - (a.actions['knit front'] ?? 0))[0]!;
    const transfers = passes.filter((pass) => listed[pass - 1]!.role === 'transfer').length;
    // A widening row is its knitting pass alone; a decrease row is its transfers and then its knitting pass.
    return { ...event, passes: event.kind === 'increase' ? { from: knitting.pass, to: knitting.pass } : span, knitPass: knitting.pass, direction: knitting.direction, transfers };
  });
  const widening = table.filter((event) => event.kind === 'increase');
  // The design needs both pass directions among the widening rows.
  if (new Set(widening.map((event) => event.direction)).size !== 2) problems.push('design: the widening rows all run one way; both edges would not each be tried first and last');
  const summary = audit.checks.map((check) => `${check.id} ${check.value}${check.limit !== null ? `/${check.limit}` : ''} ${check.ok ? 'ok' : check.severity === 'issue' ? 'ISSUE' : 'note'}`);
  const ok = kcode.ok && problems.length === 0 && audit.ok;
  const how = (method: PanelDecreaseV1 | undefined) => (method === 'single' ? 'one loop per pass' : 'three stitches together');
  const sectionRows = (section: 1 | 2 | 3) => table.filter((event) => event.section === section);
  const spanOf = (section: 1 | 2 | 3) => `${sectionRows(section)[0]!.passes.from}–${sectionRows(section).at(-1)!.passes.to}`;
  const instructions = [
    '# Edge swatch',
    '',
    `Candidate: \`program.kc\`, ${trace.passes.length} passes, SHA-256 \`${kcode.kcHash}\`.`,
    'A development trial, checked by software only. It has not been knitted.',
    '',
    `One small piece of plain jersey, ${rows.length} rows. It casts on ${CAST_ON.hi - CAST_ON.lo + 1} stitches on needles ${CAST_ON.lo}–${CAST_ON.hi}, narrows to ${CAST_ON.hi - CAST_ON.lo + 1 - 2 * NARROWING.length}, widens to ${widest.hi - widest.lo + 1} (needles ${widest.lo}–${widest.hi}) and narrows to ${widest.hi - widest.lo + 1 - 2 * NARROWING.length}. Both edges do the same thing in the same row.`,
    '',
    '## Yarns',
    '',
    `- C${CARRIERS.main}: main yarn, one colour. Same yarn and settings as the first increase swatch.`,
    `- C${CARRIERS.waste}: waste yarn. C${CARRIERS.draw}: draw thread. Both stay parked on the left after the start.`,
    '',
    '## What each part tests',
    '',
    `1. **First narrowing (passes ${spanOf(1)}).** The edge has fabric under it. Decreases 1 and 2 move one loop per carriage pass; decreases 3 and 4 move the three edge stitches together, as the first swatch did.`,
    `2. **Widening (passes ${spanOf(2)}).** Each widening row brings one new needle into work at each edge. The edge where the row starts knits its new needle first; the other edge knits it last, as the first swatch did. Half the rows start from each side.`,
    `3. **Second narrowing (passes ${spanOf(3)}).** The same four decreases as part 1, but straight after a widening, so the edge hangs past the fabric below it. This repeats the first swatch's conditions.`,
    '',
    '## Every event',
    '',
    '| Part | Step | Row | Passes | What happens | Left edge | Right edge |',
    '|---|---|---|---|---|---|---|',
    ...table.map((event) => {
      if (event.kind === 'decrease') return `| ${event.section} | ${event.step} | ${event.row} | ${event.passes.from}–${event.passes.to} | decrease, ${how(event.method)} (${event.transfers} transfer passes), then knit at ${event.knitPass} | ${how(event.method)} | ${how(event.method)} |`;
      const leftFirst = event.direction === '>>';
      return `| ${event.section} | ${event.step} | ${event.row} | ${event.knitPass} | new needle at each edge, knitted ${leftFirst ? 'left to right' : 'right to left'} | new needle knitted ${leftFirst ? 'first' : 'last'} | new needle knitted ${leftFirst ? 'last' : 'first'} |`;
    }),
    '',
    '## What to record',
    '',
    'Three facts for anything that goes wrong, because "bad" cannot be told apart afterwards:',
    '',
    '1. The pass number on the screen (the table above says which event that is).',
    '2. Which edge, and whether the loop stayed on its needle, fell off, or was on the wrong needle.',
    '3. For a decrease: whether it went wrong as the stitch crossed to the rear bed or as it came back to the front.',
    '',
    'If it can run to the end without harm, let it: later events are still worth seeing after an early fault. Stop if loops pile up or a needle is at risk.',
    '',
    'Afterwards: a photo of each face flat, and a close-up of each edge. Mark part 1, 2 and 3 on the photo if they are not obvious (the piece has a waist, then a wide part).',
    '',
    'The top ends on waste yarn; the stitches under it are live.',
    '',
    '## Software checks',
    '',
    `- Strict KCode validator and machine-safety envelope: ${problems.length === 0 ? 'passed' : `${problems.length} problem(s)`}.`,
    `- Loop audit: ${audit.ok ? 'passed' : 'FAILED'} (${summary.join(', ')}).`,
    `- Passes from the end of the start to the last row: ${audit.work.knitting} knitting, ${audit.work.transfers} transfer, ${audit.work.movementOnly} movement-only.`,
    '',
  ].join('\n');
  await mkdir(out, { recursive: true });
  await writeFile(join(out, 'program.kc'), kcode.kcText);
  await writeFile(join(out, 'program.k'), knitoutText);
  await writeFile(join(out, 'instructions.md'), instructions);
  process.stdout.write(`${JSON.stringify({ ok, passes: trace.passes.length, kcodeSha256: kcode.kcHash, knitoutSha256: createHash('sha256').update(knitoutText).digest('hex'), rows: rows.length, widest, events: table, problems, audit: summary, work: audit.work }, null, 2)}\n`);
  process.exit(ok ? 0 : 1);
}

if (process.argv[1]?.endsWith('edge-swatch.ts')) await main();
