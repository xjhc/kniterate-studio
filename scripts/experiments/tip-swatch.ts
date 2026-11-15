/**
 * Experimental tip trial for a piece that starts and ends on two columns (issue #21).
 *
 * The knitted 8-column reversible start narrows to 2 columns as a removable starter. A draw-thread
 * round and the frame's own zigzag cast-on then start the piece on those 2 columns; it widens to 8
 * and narrows to 2 again, and ends under waste. Increases and decreases are the ones the 514-pass
 * paisley knitted (right edge only, an increase every three rows, split by the yarn on the left).
 * New here: knitting below 8 columns, the draw thread returning mid-piece, the 2-column cast-on
 * and the 2-column top waste.
 *
 * node --import tsx scripts/experiments/tip-swatch.ts <out-dir>
 */
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { emitCustomistFairisleFrame } from '../../packages/machine-lib/src/knitout/passes/customist-fairisle-frame.js';
import { FAIRISLE_PARK_WASTE_DEFAULTS } from '../../packages/machine-lib/src/knitout/passes/waste-section.js';
import { FAIRISLE_CARRIER_INTRO_DEFAULTS as intro } from '../../packages/machine-lib/src/knitout/passes/carrier-intro.js';
import { CarriageSimulator } from '../../packages/machine-lib/src/knitout/sim/carriage-simulator.js';
import { ALL_CARRIERS, b, f, comment, type KnitoutOp, type KnitoutProgram, type CarrierId, type Direction } from '../../packages/machine-lib/src/knitout/types.js';
import { writeKnitoutProgram } from '../../packages/machine-lib/src/knitout/emitter.js';
import { knitoutToKCodeWithTrace } from '../../packages/machine-lib/src/knitout/kniterate/to-kcode.js';
import { auditTraceV1, compareScheduledPassesToMachineTrace, deriveMachineTraceAdvisoriesV1, KNITERATE_7GG_KCODE_PROFILE_V2 as profile, parseKCodeDocument, projectKCodeMachineTrace, projectMachineTopologyV1, validateKCodeMachineSafetyV1, validateKCodeMachineTrace } from '../../packages/machine-lib/src/browser.js';

const LO = 119, WIDE = 8, NARROW = 2, STEPS = WIDE - NARROW;
/** Starter: three plain rows, a decrease every third row down to 2 columns, two more rows, then one half row. */
const STARTER_ROWS = 3 * STEPS + 3;
/** Piece: three rows on 2 columns, an increase every third row to 8, then a decrease every third row to 2. */
const PIECE_INCREASES = Array.from({ length: STEPS }, (_, i) => 3 + 3 * i);
const PIECE_DECREASES = Array.from({ length: STEPS }, (_, i) => 6 + 3 * STEPS + 3 * i);
const PIECE_ROWS = PIECE_DECREASES.at(-1)! + 3;

export interface TipRow { id: number; section: 'starter' | 'piece'; row: number; width: number; kind: 'plain' | 'decrease' | 'growth' | 'completion' | 'half'; front: CarrierId[]; emptyRear: number | null; knits: CarrierId[] }

export function buildTipSwatch() {
  const frame = emitCustomistFairisleFrame({ needleStart: LO, needleEnd: LO + WIDE - 1, wasteCarrier: '6', bodyCarriers: ['3', '4'], drawCarrier: '1', wastePasses: 80, waste: FAIRISLE_PARK_WASTE_DEFAULTS, intro, retainBackBed: true, catchNeedles: 8 });
  const ops: KnitoutOp[] = [{ kind: 'x-carrier-spacing', value: 2 }, { kind: 'x-carrier-stopping-distance', value: 2.5 }, ...frame.ops];
  const sim = new CarriageSimulator({ carriers: ALL_CARRIERS, initialNextDirection: frame.finalNextDirection });
  for (const state of frame.finalCarrierStates.values()) sim.seedCarrierState(state);
  sim.seedRacking(0); sim.setPresserSpeed(600); sim.setPresserRoller(0);
  const drain = () => ops.push(...sim.drainOps());
  sim.miss('6', '-', f(LO - 8)); sim.miss('1', '-', f(LO - 5)); drain();

  const rows: TipRow[] = [];
  let hi = LO + WIDE - 1, rightFront: CarrierId = '4';
  const other = (c: CarrierId): CarrierId => (c === '3' ? '4' : '3');
  const onLeft = (): CarrierId => (sim.positionOf('3')?.side === 'left' ? '3' : '4');
  /** Grey face in front; the left edge column alternates so the yarns cross beds there. */
  const colours = (r: number) => { const a: CarrierId[] = Array.from({ length: hi - LO + 1 }, () => '4'); a[0] = r % 2 === 0 ? '3' : '4'; return a; };
  const knit = (c: CarrierId, d: Direction, n: number, front: CarrierId[]) => sim.knit(c, d, front[n - LO] === c ? f(n) : b(n));
  const settings = (r: number, roller = 450) => { sim.setSpeed(r === 0 ? 100 : 200); sim.setStitch(7); sim.setRoller(r === 0 ? 100 : roller); };
  const slot = (label: string, fn: () => void) => { ops.push(comment(`TIP ${label}`)); fn(); drain(); };
  const record = (section: TipRow['section'], r: number, kind: TipRow['kind'], front: CarrierId[], emptyRear: number | null, knits: CarrierId[]) => rows.push({ id: rows.length + 1, section, row: r + 1, width: hi - LO + 1, kind, front, emptyRear, knits });

  const run = (section: TipRow['section'], total: number, increases: readonly number[], decreases: readonly number[]) => {
    const at = (name: string) => `ROW ${rows.length + 1} ${name}`;
    for (let r = 0; r < total; r++) {
      if (increases.includes(r)) {
        // The 514-pass paisley's increase: the rear edge loop moves out to the new front needle,
        // the yarn on the left splits it, and a second split refills the old rear needle a row later.
        const A = onLeft(), B = other(A), old = hi;
        assert.equal(sim.positionOf(B)?.side, 'right');
        slot(at('prepare'), () => { sim.setSpeed(200); sim.setRoller(0); sim.miss(B, '-', f(old)); sim.miss(B, '+', f(old + 1)); sim.setSpeed(100); sim.setXferStitch(5); sim.setRacking(1); sim.xferBatch([{ from: b(old), to: f(old + 1) }]); sim.setRacking(0); });
        hi++;
        const growth = colours(r); growth[old - LO] = A; growth[hi - LO] = A;
        slot(at('growth-A'), () => { settings(r); for (let n = LO; n <= old; n++) knit(A, '+', n, growth); sim.split(A, '+', f(hi), b(hi)); });
        slot(at('growth-B'), () => { settings(r); sim.knit(B, '-', b(hi)); for (let n = old - 1; n >= LO; n--) knit(B, '-', n, growth); });
        record(section, r, 'growth', growth, old, [A, B]);
        r++;
        const complete = colours(r); complete[old - LO] = A; complete[hi - LO] = B;
        slot(at('outer-join'), () => { settings(r, 0); sim.knit(A, '-', b(hi)); });
        slot(at('return'), () => { sim.setSpeed(200); sim.setRoller(0); sim.miss(A, '+', f(hi)); });
        slot(at('completion-A'), () => { settings(r); sim.addRollerAdvance(450); sim.split(A, '-', f(old), b(old)); sim.setRoller(0); for (let n = old - 1; n >= LO; n--) knit(A, '-', n, complete); });
        slot(at('completion-B'), () => { settings(r); for (let n = LO; n <= old; n++) knit(B, '+', n, complete); sim.knit(B, '+', f(hi)); });
        record(section, r, 'completion', complete, null, [A, B]); rightFront = B;
        continue;
      }
      const decrease = decreases.includes(r);
      if (decrease) slot(at('decrease'), () => { sim.setSpeed(100); sim.setRoller(0); sim.setXferStitch(5); sim.setRacking(1); sim.xferBatch([{ from: f(hi), to: b(hi - 1) }]); sim.setRacking(-1); sim.xferBatch([{ from: b(hi), to: f(hi - 1) }]); sim.setRacking(0); hi--; });
      const front = colours(r); if (r > 0) rightFront = other(rightFront); front[hi - LO] = rightFront;
      // The yarn standing where the carriage is goes first; each crosses to the other side.
      const first: CarrierId = sim.positionOf('3')?.side === (sim.finalNextDirection() === '+' ? 'left' : 'right') ? '3' : '4';
      assert.notEqual(sim.positionOf('3')?.side, sim.positionOf('4')?.side);
      // The starter's last row is knitted by the left yarn only, so both yarns stand on the right
      // for the cast-on, as they do after the frame's yarn insertions.
      const half = section === 'starter' && r === total - 1;
      if (half) assert.equal(sim.positionOf(first)?.side, 'left');
      slot(at(half ? 'half' : 'plain'), () => {
        settings(r);
        for (const c of half ? [first] : [first, other(first)]) {
          const d: Direction = sim.positionOf(c)?.side === 'left' ? '+' : '-';
          const needles = Array.from({ length: hi - LO + 1 }, (_, i) => LO + i); if (d === '-') needles.reverse();
          for (const n of needles) knit(c, d, n, front);
        }
      });
      record(section, r, half ? 'half' : decrease ? 'decrease' : 'plain', front, null, half ? [first] : [first, other(first)]);
    }
  };

  run('starter', STARTER_ROWS, [], Array.from({ length: STEPS }, (_, i) => 3 + 3 * i));
  assert.equal(hi, LO + NARROW - 1);

  // The neck. A draw-thread round on all four needles, then the frame's cast-on (zigzag at half
  // rack, front row, rear row) with the frame's settings. Pulling the draw thread frees the piece.
  slot('NECK draw', () => {
    sim.setSpeed(intro.introSpeed); sim.setRoller(intro.introRoller); sim.setStitch(8);
    for (let n = LO; n <= hi; n++) sim.knit('1', '+', f(n));
    for (let n = hi; n >= LO; n--) sim.knit('1', '-', b(n));
    sim.setRoller(0); sim.miss('1', '-', f(LO - 5));
  });
  slot('NECK cast-on', () => {
    const [rampCastOn = 3, rampTubular = 5] = intro.rampStitches;
    sim.setRacking(0.5); sim.setSpeed(intro.castOnSpeed ?? intro.rampSpeed); sim.setRoller(intro.rampRoller); sim.setStitch(rampCastOn);
    for (let n = hi; n >= LO; n--) { sim.knit('3', '-', b(n)); sim.knit('3', '-', f(n)); }
    sim.setRoller(intro.tubularRoller ?? intro.introRoller); sim.setStitch(rampTubular);
    for (let n = LO; n <= hi; n++) sim.knit('3', '+', f(n));
    for (let n = hi; n >= LO; n--) sim.knit('3', '-', b(n));
    sim.setRacking(0);
  });

  rightFront = '4';
  run('piece', PIECE_ROWS, PIECE_INCREASES, PIECE_DECREASES);
  assert.equal(hi, LO + NARROW - 1);

  ops.push(comment('TIP BODY END')); sim.setSpeed(200); sim.setStitch(7); sim.setRoller(450);
  for (let r = 0; r < 8; r++) { for (let n = LO; n <= hi; n++) sim.knit('6', '+', f(n)); for (let n = hi; n >= LO; n--) sim.knit('6', '-', b(n)); }
  sim.setSpeed(150); sim.setStitch(4); for (let n = LO; n <= hi; n++) { sim.drop(f(n)); sim.drop(b(n)); } sim.setRoller(0); for (const c of ['1', '3', '4', '6'] as CarrierId[]) sim.out(c); drain();
  const program: KnitoutProgram = { version: 2, carriers: [...ALL_CARRIERS], machine: 'kniterate', gauge: 7, position: 'Keep', yarns: { '3': 'Orange single 2/14 acrylic', '4': 'Grey single 2/14 acrylic' }, kniterate: { xferStyle: 'four-pass' }, ops };
  const source = writeKnitoutProgram(program), compiled = knitoutToKCodeWithTrace(source, 'program.k'); assert(compiled.ok, JSON.stringify(compiled));
  return { source, compiled, rows, lo: LO };
}

/** Checks the serialized file: every loop, every row's needles, the neck and the take-down. */
export function verifyTipSwatch(built: ReturnType<typeof buildTipSwatch>) {
  const parsed = parseKCodeDocument(built.compiled.kcode, { profile, dialect: 'knitout-vendor', strict: true }); assert(parsed.ok);
  const trace = projectKCodeMachineTrace(parsed.document, profile), validation = validateKCodeMachineTrace(trace, profile), safety = validateKCodeMachineSafetyV1(trace, profile);
  assert(validation.ok, JSON.stringify(validation.diagnostics)); assert(safety.ok, JSON.stringify(safety.diagnostics));
  assert(compareScheduledPassesToMachineTrace(built.compiled.scheduledPasses, trace).ok, 'Schedule differential');
  type Label = { row: number; slot: string };
  let label: Label = { row: 0, slot: 'frame' };
  const labels = built.source.split('\n').map((line) => {
    const row = line.match(/^; TIP ROW (\d+) (\S+)$/), neck = line.match(/^; TIP NECK (\S+)$/);
    if (row) label = { row: +row[1]!, slot: row[2]! }; else if (neck) label = { row: 0, slot: `neck-${neck[1]}` }; else if (line === '; TIP BODY END') label = { row: 0, slot: 'finish' };
    return label;
  });
  const passLabels = built.compiled.scheduledPasses.map((pass) => { const own = pass.sourceLines.map((n) => labels[n - 1]!); assert(new Set(own.map((l) => `${l.row}:${l.slot.startsWith('neck') ? 'neck' : ''}`)).size <= 1, 'A pass crosses a row boundary'); return own.at(-1)!; });
  const firstBody = passLabels.findIndex((l) => l.row > 0), lastBody = passLabels.findLastIndex((l) => l.row > 0);
  const audit = auditTraceV1(trace, { sections: [{ name: 'waste', from: 1, to: firstBody }, { name: 'body', from: firstBody + 1, to: lastBody + 1 }, { name: 'top', from: lastBody + 2, to: trace.passes.length }] });
  assert(audit.checks.every((c) => c.ok), JSON.stringify(audit.checks.filter((c) => !c.ok)));
  const topology = projectMachineTopologyV1(trace), offset = built.compiled.coordinateMapping.frontSourceSlotToKCodeColumnOffset, at = (n: number) => n + offset;
  const stacks = new Map<string, number>();
  const loopsOn = (bed: string, n: number) => stacks.get(`${bed}:${at(n)}`) ?? 0;
  for (const pass of trace.passes) {
    const state = validation.passStates[pass.index]!; for (const delta of state.stackDeltas) stacks.set(`${delta.bed}:${delta.traceCoordinate}`, delta.afterCount);
    const l = passLabels[pass.index]!; if (pass.index < firstBody || pass.index > lastBody) continue;
    assert(state.after.maxStack <= 2, `pass ${pass.index + 1} stacks more than two loops`);
    assert(pass.carrier !== '6', 'The waste yarn does not move during the body');
    const works = pass.actions.some((a) => a.kind === 'knit' || a.kind === 'split');
    if (l.row === 0) {
      // Neck: the draw thread and C3 only, with a loop on each of the four needles after every pass.
      assert(['0', '1', '3'].includes(pass.carrier), `Neck pass ${pass.index + 1} carrier`);
      for (const bed of ['front', 'rear']) for (let n = built.lo; n < built.lo + NARROW; n++) assert.equal(loopsOn(bed, n), 1, `Neck pass ${pass.index + 1} ${bed} ${n}`);
      assert.equal(state.after.totalLoops, NARROW * 2, 'Neck holds four loops');
      continue;
    }
    const row = built.rows[l.row - 1]!;
    assert(pass.carrier !== '1', 'The draw thread does not move outside the neck');
    if (works) { assert([0, row.row === 1 ? 100 : 450].includes(pass.roller), `Roller pass ${pass.index + 1}`); if (l.slot === 'outer-join') assert.equal(pass.roller, 0); assert.equal(pass.speed, row.row === 1 ? 100 : 200); assert.equal(pass.rack, 0); } else assert.equal(pass.roller, 0, `Roller pass ${pass.index + 1}`);
    if (passLabels[pass.index + 1]?.row !== l.row) {
      assert.equal(state.after.totalLoops, row.width * 2 - (row.emptyRear === null ? 0 : 1), `row ${row.id} total`);
      for (let n = built.lo; n < built.lo + row.width; n++) for (const bed of ['front', 'rear']) assert.equal(loopsOn(bed, n), bed === 'rear' && n === row.emptyRear ? 0 : 1, `row ${row.id} occupancy ${bed} ${n}`);
    }
  }
  const neckLoops = topology.loops.filter((l) => { const p = l.createdAt.passIndex; return p >= firstBody && p <= lastBody && passLabels[p]!.row === 0; });
  assert.equal(neckLoops.filter((l) => l.carrier === '1').length, NARROW * 2, 'One draw-thread loop per needle');
  assert.equal(neckLoops.filter((l) => l.carrier === '3').length, NARROW * 4, 'Cast-on: zigzag and one round');
  assert(neckLoops.every((l) => l.parentLoopIds.length === 1), 'Every neck loop is knitted through one loop');
  const joins = new Map<number, { left: boolean; right: boolean }>(), events = [];
  for (const row of built.rows) {
    const loops = topology.loops.filter((l) => passLabels[l.createdAt.passIndex]!.row === row.id), hi = built.lo + row.width - 1, join = { left: false, right: false };
    const expected = row.kind === 'half' ? row.width : row.width * 2 - (row.emptyRear === null ? 0 : 1);
    assert.equal(loops.length, expected, `row ${row.id} working count`);
    assert.equal(new Set(loops.map((l) => `${l.createdAt.location.bed}:${l.createdAt.location.traceCoordinate}`)).size, loops.length, 'No needle knits twice in a row');
    for (const l of loops) {
      assert(l.parentLoopIds.length > 0, `row ${row.id} knits an empty needle`);
      const loc = l.createdAt.location, n = loc.traceCoordinate - offset; assert(n >= built.lo && n <= hi);
      const c = row.front[n - built.lo]!; assert.equal(l.carrier, loc.bed === 'front' ? c : c === '3' ? '4' : '3', `row ${row.id} colour`);
      assert(row.knits.includes(l.carrier as CarrierId));
      const prev = l.previousCarrierLoopId === null ? undefined : topology.loops[l.previousCarrierLoopId];
      if (prev && prev.createdAt.location.bed !== loc.bed) { const q = prev.createdAt.location.traceCoordinate; if (q === at(built.lo) && loc.traceCoordinate === at(built.lo)) join.left = true; if (Math.max(q, loc.traceCoordinate) === at(hi) && Math.abs(q - loc.traceCoordinate) <= 1) join.right = true; }
    }
    joins.set(row.id, join);
    const passes = trace.passes.filter((p) => passLabels[p.index]!.row === row.id), xfers = passes.flatMap((p) => p.actions.filter((a) => a.kind === 'xfer')), splits = passes.filter((p) => p.actions.some((a) => a.kind === 'split'));
    assert.equal(passes.filter((p) => p.roller > 0).length, row.kind === 'half' ? 1 : 2, `row ${row.id} take-down advances`);
    assert.equal(xfers.length, row.kind === 'growth' ? 1 : row.kind === 'decrease' ? 2 : 0);
    assert.equal(splits.length, row.kind === 'growth' || row.kind === 'completion' ? 1 : 0);
    if (row.kind === 'decrease') assert.equal(loops.filter((l) => l.parentLoopIds.length === 2).length, 2, 'Two merged loops per decrease');
    if (row.kind === 'growth' || row.kind === 'completion') {
      const target = row.kind === 'growth' ? hi : hi - 1, split = loops.find((l) => l.creation === 'split')!; assert(split);
      assert.equal(split.createdAt.location.traceCoordinate, at(target)); assert.equal(split.createdAt.location.bed, 'front');
      const receiving = loops.find((l) => l.createdAt.location.bed === 'rear' && l.createdAt.location.traceCoordinate === at(target))!; assert(receiving);
      assert.deepEqual(receiving.parentLoopIds, split.parentLoopIds, 'Both loops of a split share its parent');
    }
    if (row.kind !== 'plain') events.push({ row: row.id, section: row.section, kind: row.kind, width: row.width, passes: passes.map((p) => p.index + 1), splitPasses: splits.map((p) => p.index + 1) });
  }
  // The yarns cross beds at each edge at least once in any four rows of a section, as in the paisley.
  for (const section of ['starter', 'piece'] as const) { const own = built.rows.filter((r) => r.section === section); for (const side of ['left', 'right'] as const) for (let i = 0; i + 4 <= own.length; i++) assert(own.slice(i, i + 4).some((r) => joins.get(r.id)![side]), `${section} ${side} edge unjoined from row ${own[i]!.id}`); }
  const widths = (section: TipRow['section']) => built.rows.filter((r) => r.section === section).map((r) => r.width);
  assert.equal(Math.min(...widths('starter')), NARROW); assert.equal(widths('starter')[0], WIDE);
  assert.equal(widths('piece')[0], NARROW); assert.equal(Math.max(...widths('piece')), WIDE); assert.equal(widths('piece').at(-1), NARROW);
  const neck = trace.passes.filter((p) => p.index >= firstBody && p.index <= lastBody && passLabels[p.index]!.row === 0).map((p) => p.index + 1);
  return { passed: true, sha256: createHash('sha256').update(built.compiled.kcode).digest('hex'), bytes: Buffer.byteLength(built.compiled.kcode), passes: trace.passes.length, starterRows: widths('starter').length, pieceRows: widths('piece').length, neckPasses: neck, firstBodyPass: firstBody + 1, lastBodyPass: lastBody + 1, events, advisories: deriveMachineTraceAdvisoriesV1(trace, profile), audit, physicalValidation: false };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const out = process.argv[2]; assert(out, 'usage: tip-swatch.ts <out-dir>');
  const built = buildTipSwatch(), report = verifyTipSwatch(built);
  fs.mkdirSync(out, { recursive: true });
  for (const [name, data] of Object.entries({ 'program.k': built.source, 'program.kc': built.compiled.kcode, 'plan.json': JSON.stringify({ lo: built.lo, rows: built.rows }, null, 2), 'verification.json': JSON.stringify(report, null, 2) })) fs.writeFileSync(path.join(out, name), data);
  console.log(JSON.stringify(report, null, 2));
}
