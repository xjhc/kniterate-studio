#!/usr/bin/env -S node --import tsx
/**
 * An increase swatch: one jersey strip whose right edge widens and narrows
 * once per band, each band making its increases a different way, so one knit
 * shows which increase is clean. The left edge is straight, so the waste and
 * draw feeders park there and never move.
 *
 *   node --import tsx scripts/experiments/increase-swatch.ts <out-dir>
 *
 * The file goes through the same emitter, converter, strict validator and
 * machine-safety envelope as every Studio piece, and through the loop audit.
 * It is a development trial: Surface-proven at most, nothing here is knitted.
 */

import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { auditTraceV1, computeInputHash, emitShapedPanelV1, parseKnitoutProgram, traceRowsV1, writeKnitoutProgram, type PanelIncreaseV1, type PanelRowV1, type TraceSectionV1 } from '../../packages/machine-lib/src/browser.js';
import { assessAuthoredCapacityV1, observeAuthoredCapacityV1 } from '../../packages/project-contract/src/index.js';
import { compileKCodeArtifact } from '../../apps/studio/src/kcode/compileKCodeArtifact.js';
import { createPanelProject } from '../../apps/studio/src/sweater/panel.js';

interface Band { readonly name: string; readonly increase: PanelIncreaseV1; readonly everyRows: number; readonly what: string }

/** Bands bottom to top. Each widens by `STEPS` stitches, holds, and narrows by the same. */
export const INCREASE_SWATCH_BANDS: readonly Band[] = [
  { name: 'Edge needle', increase: 'edge', everyRows: 2, what: 'Nothing moves: the new outermost needle simply knits. Expect a loose loop at the very edge and no mark inside.' },
  { name: 'Fashioned, open', increase: 'eyelet', everyRows: 2, what: 'The three edge stitches move out one needle and the needle they leave knits empty. Expect a neat line of small holes three stitches in (Kniterate\'s own fashioned increase).' },
  { name: 'Fashioned, lifted bar', increase: 'bar', everyRows: 2, what: 'The three edge stitches move out and the gap is filled with the strand between two stitches of the row below. Expect the same line three stitches in, closed.' },
  { name: 'Lifted bar, every row', increase: 'bar', everyRows: 1, what: 'The lifted bar again at twice the slope: one stitch every row.' },
];
const STEPS = 8;
const CAST_ON = { lo: 107, hi: 146 };
const FASHION = 3;
const LEAD_ROWS = 6;
const HOLD_ROWS = 4;
const CARRIERS = { main: '3', waste: '6', draw: '1' } as const;

function swatchRows(): { rows: PanelRowV1[]; bands: { band: Band; rows: { from: number; to: number } }[] } {
  const rows: PanelRowV1[] = [];
  const bands: { band: Band; rows: { from: number; to: number } }[] = [];
  let hi = CAST_ON.hi;
  const push = (purls: number, increase?: PanelIncreaseV1) => {
    // Band markers: purl bumps near the straight edge, one per band number, in the band's second row.
    const marks = new Set(Array.from({ length: purls }, (_, k) => CAST_ON.lo + 6 + 2 * k));
    rows.push({ segments: [{ lo: CAST_ON.lo, hi }], stitch: (n) => (marks.has(n) ? 'p' : 'k'), settings: 'body', sourceRow: rows.length, ...(increase ? { increase } : {}) });
  };
  INCREASE_SWATCH_BANDS.forEach((band, index) => {
    const from = rows.length + 1;
    for (let k = 0; k < LEAD_ROWS; k++) push(k === 1 ? index + 1 : 0);
    for (let step = 0; step < STEPS; step++) {
      hi++;
      push(0, band.increase);
      for (let k = 1; k < band.everyRows; k++) push(0);
    }
    for (let k = 0; k < HOLD_ROWS; k++) push(0);
    for (let step = 0; step < STEPS; step++) {
      hi--;
      push(0);
      for (let k = 1; k < band.everyRows; k++) push(0);
    }
    bands.push({ band, rows: { from, to: rows.length } });
  });
  for (let k = 0; k < LEAD_ROWS; k++) push(0);
  return { rows, bands };
}

export async function buildIncreaseSwatch() {
  const { rows, bands } = swatchRows();
  const built = emitShapedPanelV1({ rows, mainCarrier: CARRIERS.main, wasteCarrier: CARRIERS.waste, drawCarrier: CARRIERS.draw, top: 'waste', fashion: FASHION });
  const knitoutText = writeKnitoutProgram(built.program);
  const parsed = parseKnitoutProgram(knitoutText);
  const opRows = built.program.ops.map((op) => op.sourceRows ?? null);
  // Capacity is assessed as for any one-yarn panel of this size.
  const capacity = assessAuthoredCapacityV1(createPanelProject({ title: 'Increase swatch', widthCm: 20, lengthCm: 30, textureId: 'stockinette', yarn: { name: 'Main', hex: '#D9CBB0' } }, { id: 'increase-swatch', source: 'human', group: 'create' }));
  if (capacity.status !== 'supported') throw new Error(capacity.message);
  const observed = observeAuthoredCapacityV1(capacity, { knitoutRecords: knitoutText.split('\n').length });
  if (observed.status !== 'supported') throw new Error(observed.message);
  const kcode = await compileKCodeArtifact({
    kind: 'convert-kcode',
    requestId: 1,
    inputHash: computeInputHash({ construction: 'increase-swatch@1', bands: INCREASE_SWATCH_BANDS, STEPS, CAST_ON, FASHION, LEAD_ROWS, HOLD_ROWS, CARRIERS }),
    capacity: observed,
    knitoutText,
    compilerNeedleRange: { start: CAST_ON.lo, end: CAST_ON.hi + STEPS },
    programOpSourceRows: opRows.length === parsed.opLines.length ? opRows : parsed.opLines.map(() => null),
    rowProvenance: rows.map((_, index) => ({ rowId: `row-${index + 1}`, chartRow: rows.length - 1 - index, machineRow: index })),
  });
  return { rows, bands, knitoutText, kcode };
}

async function main() {
  const out = process.argv[2];
  if (!out) { process.stderr.write('usage: increase-swatch.ts <out-dir>\n'); process.exit(64); }
  const { rows, bands, knitoutText, kcode } = await buildIncreaseSwatch();
  const problems = [
    ...(kcode.validation?.issues ?? []).filter((issue) => issue.severity === 'error').map((issue) => `validator: ${issue.rule}: ${issue.message}`),
    ...(kcode.safety?.findings ?? []).map((finding) => `safety: ${finding.rule}: ${finding.message}`),
  ];
  const trace = kcode.trace!;
  // Sections by the design row each pass came from: every pass up to the first body row is the start.
  const passOfRow = new Map(kcode.rowPasses.map((row) => [row.rowId, row.passIndices] as const));
  const firstBody = Math.min(...(passOfRow.get('row-1') ?? [0])) + 1;
  const lastBody = Math.max(...kcode.rowPasses.flatMap((row) => row.passIndices)) + 1;
  const sections: TraceSectionV1[] = [{ name: 'waste', from: 1, to: firstBody - 1 }, { name: 'body', from: firstBody, to: lastBody }, { name: 'top', from: lastBody + 1, to: trace.passes.length }];
  const audit = auditTraceV1(trace, { sections });
  const bandPasses = bands.map(({ band, rows: span }) => {
    const passes = Array.from({ length: span.to - span.from + 1 }, (_, k) => passOfRow.get(`row-${span.from + k}`) ?? []).flat();
    return { band, rows: span, passes: passes.length ? { from: Math.min(...passes) + 1, to: Math.max(...passes) + 1 } : null };
  });
  const summary = audit.checks.map((check) => `${check.id} ${check.value}${check.limit !== null ? `/${check.limit}` : ''} ${check.ok ? 'ok' : check.severity === 'issue' ? 'ISSUE' : 'note'}`);
  await mkdir(out, { recursive: true });
  const ok = kcode.ok && problems.length === 0 && audit.ok;
  const instructions = [
    '# Increase swatch',
    '',
    `Candidate: \`program.kc\`, ${trace.passes.length} passes, SHA-256 \`${kcode.kcHash}\`.`,
    'A development trial, checked by software only. It has not been knitted.',
    '',
    `One strip of plain jersey, ${CAST_ON.hi - CAST_ON.lo + 1} stitches wide on needles ${CAST_ON.lo}–${CAST_ON.hi}, ${rows.length} rows. The left edge is straight. The right edge widens by ${STEPS} stitches and narrows again once per band, and each band makes its increases a different way. Decreases are the same in every band.`,
    '',
    '## Yarns',
    '',
    `- C${CARRIERS.main}: main yarn, one colour.`,
    `- C${CARRIERS.waste}: waste yarn. C${CARRIERS.draw}: draw thread.`,
    '- Both stay parked on the left after the start. If either moves during the bands, stop and note the pass.',
    '',
    '## Bands, bottom to top',
    '',
    'Each band starts with purl bumps near the left edge: one bump for band 1, two for band 2, and so on.',
    '',
    '| Band | Increase | Rate | Rows | Passes | What to look for |',
    '|---|---|---|---|---|---|',
    ...bandPasses.map(({ band, rows: span, passes }, index) => `| ${index + 1} | ${band.name} | every ${band.everyRows === 1 ? 'row' : `${band.everyRows} rows`} | ${span.from}–${span.to} | ${passes ? `${passes.from}–${passes.to}` : '—'} | ${band.what} |`),
    '',
    '## What to record',
    '',
    '- For each band: are the increases closed or open, on the face and on the back? Is the sloped edge tight, loose or wavy? Any dropped stitch, with the pass number.',
    '- Which band you would want on a finished piece.',
    '- Every stop and what was done.',
    '- Photos of both faces flat, with a ruler, and a close-up of each band\'s slope.',
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
  await writeFile(join(out, 'program.kc'), kcode.kcText);
  await writeFile(join(out, 'program.k'), knitoutText);
  await writeFile(join(out, 'instructions.md'), instructions);
  process.stdout.write(`${JSON.stringify({ ok, passes: trace.passes.length, kcodeSha256: kcode.kcHash, knitoutSha256: createHash('sha256').update(knitoutText).digest('hex'), rows: rows.length, bands: bandPasses.map(({ band, rows: span, passes }) => ({ band: band.name, rows: span, passes })), problems, audit: summary, work: audit.work, sample: traceRowsV1(trace, sections).slice(firstBody - 1, firstBody + 3).map((row) => row.text) }, null, 2)}\n`);
  process.exit(ok ? 0 : 1);
}

if (process.argv[1]?.endsWith('increase-swatch.ts')) await main();
