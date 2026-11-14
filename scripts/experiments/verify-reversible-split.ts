/** Checks the serialized trial, independently of the emitter's live state. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  auditTraceV1, compareScheduledPassesToMachineTrace, deriveMachineTraceAdvisoriesV1,
  KNITERATE_7GG_KCODE_PROFILE_V2 as profile, parseKCodeDocument,
  projectKCodeMachineTrace, projectMachineTopologyV1, traceRowsV1,
  validateKCodeMachineSafetyV1, validateKCodeMachineTrace,
  type MachineTopologyLoopV1, type TraceSectionV1,
} from '../../packages/machine-lib/src/browser.js';
import type { buildReversibleSplitComparison } from './reversible-split-swatch.js';

export function verifyReversibleSplitComparison(built: ReturnType<typeof buildReversibleSplitComparison>) {
  const parsed = parseKCodeDocument(built.compiled.kcode, { profile, dialect: 'knitout-vendor', strict: true });
  assert(parsed.ok, 'Strict KCode parse');
  const trace = projectKCodeMachineTrace(parsed.document, profile);
  const validation = validateKCodeMachineTrace(trace, profile);
  const safety = validateKCodeMachineSafetyV1(trace, profile);
  assert(validation.ok, JSON.stringify(validation.diagnostics));
  assert(safety.ok, JSON.stringify(safety.diagnostics));
  assert(compareScheduledPassesToMachineTrace(built.compiled.scheduledPasses, trace).ok, 'Serialized schedule differential');

  let label = { row: 0, slot: 'frame' };
  const labels = built.source.split('\n').map(line => {
    const plain = line.match(/^; GATE3 ROW (\d+) plain$/);
    const event = line.match(/^; GATE3 (\S+) cycle (\d+)$/);
    if (plain) label = { row: Number(plain[1]), slot: 'plain' };
    if (event) label = { row: Number(event[2]), slot: event[1]! };
    if (line === '; GATE3 BODY END') label = { row: 0, slot: 'finish' };
    return label;
  });
  const passLabels = built.compiled.scheduledPasses.map(pass => {
    const matches = pass.sourceLines.map(line => labels[line - 1]!).filter(Boolean);
    const rows = [...new Set(matches.map(item => item.row))];
    assert(rows.length <= 1, `Pass ${pass.index + 1} crosses a cycle boundary`);
    return matches.at(-1) ?? { row: 0, slot: 'unlabelled' };
  });
  const bodyIndices = passLabels.flatMap((item, index) => item.row > 0 ? [index] : []);
  assert(bodyIndices.length > 0, 'Labelled body');
  const first = bodyIndices[0]!;
  const last = bodyIndices.at(-1)!;
  const sections: TraceSectionV1[] = [{ name: 'waste', from: 1, to: first }, { name: 'body', from: first + 1, to: last + 1 }, { name: 'top', from: last + 2, to: trace.passes.length }];
  const audit = auditTraceV1(trace, { sections });
  assert(audit.checks.every(check => check.ok), JSON.stringify(audit.checks.filter(check => !check.ok)));
  const topology = projectMachineTopologyV1(trace);
  const offset = built.compiled.coordinateMapping.frontSourceSlotToKCodeColumnOffset;
  const at = (needle: number) => needle + offset;
  const createdIn = (row: number) => topology.loops.filter(loop => passLabels[loop.createdAt.passIndex]!.row === row);
  const loopAt = (row: number, bed: 'front' | 'rear', needle: number, carrier: string) => {
    const found = createdIn(row).filter(loop => loop.createdAt.location.bed === bed && loop.createdAt.location.traceCoordinate === at(needle) && loop.carrier === carrier);
    assert.equal(found.length, 1, `Cycle ${row}: exactly one ${carrier} loop at ${bed} ${needle}`);
    return found[0]!;
  };
  const parent = (loop: MachineTopologyLoopV1, ids: readonly number[]) => assert.deepEqual(loop.parentLoopIds, ids, `Loop ${loop.id} ancestry`);
  const stacks = new Map<string, number>();
  const bodyPasses = trace.passes.slice(first, last + 1);
  for (const pass of trace.passes) {
    const state = validation.passStates[pass.index]!;
    for (const delta of state.stackDeltas) stacks.set(`${delta.bed}:${delta.traceCoordinate}`, delta.afterCount);
    const { row, slot } = passLabels[pass.index]!;
    if (!row) continue;
    assert(state.after.maxStack <= 1, `Body stack at pass ${pass.index + 1}`);
    assert(!['1', '6'].includes(pass.carrier), 'Idle waste/draw feeder in body');
    const works = pass.actions.some(action => action.kind === 'knit' || action.kind === 'split');
    const transfers = pass.actions.some(action => action.kind === 'xfer');
    assert.equal(pass.roller, works ? (['O1', 'O6'].includes(slot) ? 0 : row === 1 ? 100 : 450) : 0, `Roller at pass ${pass.index + 1}, ${slot}`);
    assert.equal(pass.speed, works ? row === 1 ? 100 : 200 : transfers ? 100 : pass.carrier === '0' ? 600 : 200, `Speed at pass ${pass.index + 1}`);
    assert(Math.abs(pass.rack) <= 1, 'Body racking');
    if (works) assert.equal(pass.rack, 0);
    if (passLabels[pass.index + 1]?.row !== row) {
      const expected = built.rows[row - 1]!;
      assert.equal(state.after.totalLoops, 2 * (expected.hi - expected.lo + 1) - (expected.emptyRear === null ? 0 : 1), `Cycle ${row} live loops`);
      for (let n = expected.lo; n <= expected.hi; n++) {
        assert.equal(stacks.get(`front:${at(n)}`), 1, `Cycle ${row} front ${n}`);
        assert.equal(stacks.get(`rear:${at(n)}`) ?? 0, n === expected.emptyRear ? 0 : 1, `Cycle ${row} rear ${n}`);
      }
    }
  }
  for (const row of built.rows) {
    const loops = createdIn(row.row);
    const workingPasses = trace.passes.filter(pass => passLabels[pass.index]!.row === row.row && pass.actions.some(action => action.kind === 'knit' || action.kind === 'split'));
    assert.equal(workingPasses.length, row.kind === 'plain' ? 2 : 3, 'No extra loop-forming fragments');
    assert.equal(workingPasses.filter(pass => pass.roller > 0).length, 2, 'Exactly two positive roller commands per cycle');
    const expected = 2 * (row.hi - row.lo + 1) - (row.emptyRear === null ? 0 : 1);
    assert.equal(loops.length, expected, `Cycle ${row.row} working count`);
    assert.equal(new Set(loops.map(loop => `${loop.createdAt.location.bed}:${loop.createdAt.location.traceCoordinate}`)).size, expected, 'No double knitting');
    for (const loop of loops) {
      const column = loop.createdAt.location.traceCoordinate - offset;
      assert(column >= row.lo && column <= row.hi);
      const frontCarrier = row.front[column - row.lo];
      assert.equal(loop.carrier, loop.createdAt.location.bed === 'front' ? frontCarrier : frontCarrier === '4' ? '3' : '4');
    }
    const empty = loops.filter(loop => !loop.parentLoopIds.length);
    if (row.kind !== 'growth') assert.equal(empty.length, 0, 'Only designated control starts may be empty');
    else {
      const event = built.events.find(event => event.row === row.row)!;
      const oldControl = built.side === 'right' ? event.lo : event.hi;
      const newControl = oldControl + (built.side === 'right' ? -1 : 1);
      assert.deepEqual(empty.map(loop => [loop.createdAt.location.bed, loop.createdAt.location.traceCoordinate, loop.carrier]).sort(), [['rear', at(oldControl), '3'], ['rear', at(newControl), '4']].sort(), 'Exactly two empty control starts, none at candidate');
    }
  }
  const events = built.events.map(event => {
    const old = event.side === 'right' ? event.hi : event.lo;
    const outer = old + (event.side === 'right' ? 1 : -1);
    const control = event.side === 'right' ? event.lo - 1 : event.hi + 1;
    const r = event.row;
    const a1 = loopAt(r, 'front', old, '4'), c1 = loopAt(r, 'front', outer, '4'), d1 = loopAt(r, 'rear', outer, '3');
    const a2 = loopAt(r + 1, 'front', old, '4'), b2 = loopAt(r + 1, 'rear', old, '3');
    const c2 = loopAt(r + 1, 'front', outer, '3'), d2 = loopAt(r + 1, 'rear', outer, '4');
    assert.equal(a1.parentLoopIds.length, 1); assert.equal(c1.parentLoopIds.length, 1);
    const a = topology.loops[a1.parentLoopIds[0]!]!, b = topology.loops[c1.parentLoopIds[0]!]!;
    assert.equal(a.carrier, event.phase === 'P' ? '4' : '3');
    assert.equal(b.carrier, event.phase === 'P' ? '3' : '4');
    parent(d1, [b.id]); parent(a2, [a1.id]); parent(b2, [a1.id]); parent(c2, [c1.id]); parent(d2, [d1.id]);
    assert.equal(c1.creation, 'split'); assert.equal(a2.creation, 'split');
    assert.equal(d1.previousCarrierLoopId, event.phase === 'P' ? b.id : a.id, 'Actual B growth attachment');
    assert.equal(d2.previousCarrierLoopId, c1.id, 'Outer A return crosses F1 to R1');
    assert.equal(a2.previousCarrierLoopId, d2.id, 'A rear visit precedes the second split');
    assert.equal(c2.previousCarrierLoopId, b2.id, 'B completes R0 then F1');
    const nextB = loopAt(r + 2, 'rear', outer, '3');
    assert.equal(nextB.previousCarrierLoopId, c2.id, 'Normal outer B return crosses F1 to R1');
    const controlB1 = loopAt(r, 'front', control, '3'), controlB2 = loopAt(r + 1, 'rear', control, '3');
    assert.equal(controlB2.previousCarrierLoopId, controlB1.id, 'Control B return crosses beds');
    const controlA2 = loopAt(r + 1, 'front', control, '4'), controlNextA = loopAt(r + 2, 'rear', control, '4');
    assert.equal(controlNextA.previousCarrierLoopId, controlA2.id, 'Control A normal return crosses beds');
    const passes = trace.passes.filter(pass => [r, r + 1].includes(passLabels[pass.index]!.row));
    const xfers = passes.flatMap(pass => pass.actions.filter(action => action.kind === 'xfer'));
    assert.equal(xfers.length, 2);
    for (const [from, to] of [[event.lo, event.lo - 1], [event.hi, event.hi + 1]]) assert(xfers.some(action => action.source.bed === 'rear' && action.source.traceCoordinate === at(from!) && action.target.bed === 'front' && action.target.traceCoordinate === at(to!)));
    const splits = passes.filter(pass => pass.actions.some(action => action.kind === 'split'));
    assert.equal(splits.length, 2);
    splits.forEach((pass, index) => {
      const work = pass.actions.filter(action => action.kind !== 'move');
      assert.equal((index === 0 ? work.at(-1) : work[0])?.kind, 'split', 'Explicit terminal split');
      assert.equal(pass.operation, (index === 0) === (event.side === 'right') ? 'Tr-Rr' : 'Tr-Rl');
      assert.equal(pass.roller, 450);
    });
    const evidence = (loop: MachineTopologyLoopV1) => ({ id: loop.id, carrier: loop.carrier, pass: loop.createdAt.passIndex + 1, location: loop.createdAt.location, parents: loop.parentLoopIds, previousYarnLoop: loop.previousCarrierLoopId });
    return { ...event, passes: passes.map(pass => pass.index + 1), splitPasses: splits.map(pass => pass.index + 1), supportedCandidateStarts: true, outerAndControlYarnReturns: true,
      loopLedger: Object.fromEntries(Object.entries({ a, b, a1, c1, d1, a2, b2, c2, d2 }).map(([name, loop]) => [name, evidence(loop)])),
    };
  });
  assert.equal(topology.summary.liveLoopCount, 0);
  const listed = traceRowsV1(trace, sections);
  return {
    passed: true, softwareOnly: true, physicalValidation: false, side: built.side,
    sha256: createHash('sha256').update(built.compiled.kcode).digest('hex'), bytes: Buffer.byteLength(built.compiled.kcode),
    passes: trace.passes.length, bodyPasses: [first + 1, last + 1], cycles: built.rows.length,
    events, audit, advisories: deriveMachineTraceAdvisoriesV1(trace, profile).advisories,
    bodySchedule: bodyPasses.map(pass => ({ row: passLabels[pass.index]!.row, slot: passLabels[pass.index]!.slot, carriageStops: pass.carriageStops, carrierStops: pass.carrierStops, ...listed[pass.index]! })),
  };
}
