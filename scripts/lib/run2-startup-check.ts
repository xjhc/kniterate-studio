import assert from 'node:assert/strict';
import { CarriageSimulator } from '../../packages/machine-lib/src/knitout/sim/carriage-simulator.js';
import { emitCustomistWasteAndIntro } from '../../packages/machine-lib/src/knitout/passes/customist-waste-intro.js';
import { FAIRISLE_PARK_WASTE_DEFAULTS } from '../../packages/machine-lib/src/knitout/passes/waste-section.js';
import { FAIRISLE_CARRIER_INTRO_DEFAULTS } from '../../packages/machine-lib/src/knitout/passes/carrier-intro.js';
import { writeKnitoutProgram } from '../../packages/machine-lib/src/knitout/emitter.js';
import { authoredKnitoutToKCodeWithTrace } from '../../packages/machine-lib/src/knitout/kniterate/to-kcode.js';
import { parseKCodeDocument } from '../../packages/machine-lib/src/knitout/kcode/parser.js';
import { projectKCodeMachineTrace, type MachineTracePassV1 } from '../../packages/machine-lib/src/knitout/kcode/machine-trace.js';
import { KNITERATE_7GG_KCODE_PROFILE_V2 as profile } from '../../packages/machine-lib/src/knitout/kcode/machine-profile.js';
import type { CarrierId, KnitoutOp } from '../../packages/machine-lib/src/knitout/types.js';

function trace(kcode: string) {
  const parsed = parseKCodeDocument(kcode, { profile, dialect: 'knitout-vendor', strict: true });
  if (!parsed.ok) throw new Error('Cannot parse startup');
  return projectKCodeMachineTrace(parsed.document, profile);
}
function unchangedPrefix(lo: number, width: number, colors: readonly CarrierId[]) {
  const sim = new CarriageSimulator({ carriers: ['1','2','3','4','5','6'] });
  const ops: KnitoutOp[] = [];
  emitCustomistWasteAndIntro(sim, ops, {
    needleStart: lo, needleEnd: lo + width - 1, wasteCarrier: '6', drawCarrier: '1',
    bodyCarriers: colors, wastePasses: 87, waste: FAIRISLE_PARK_WASTE_DEFAULTS,
    intro: FAIRISLE_CARRIER_INTRO_DEFAULTS, catchNeedles: 20,
  });
  for (const carrier of ['1', ...colors, '6'] as CarrierId[]) sim.out(carrier);
  ops.push(...sim.drainOps());
  const converted = authoredKnitoutToKCodeWithTrace(writeKnitoutProgram({
    version: 2, carriers: ['1','2','3','4','5','6'], machine: 'kniterate', gauge: 7,
    position: 'Keep', yarns: {}, kniterate: { xferStyle: 'four-pass' }, ops,
  }));
  if (!converted.ok) throw new Error(converted.error);
  return trace(converted.kcode).passes.slice(0, 112);
}
function signature(p: MachineTracePassV1) {
  return { carrier: p.carrier, direction: p.direction, operation: p.operation,
    speed: p.speed, roller: p.roller, rack: p.rack,
    carriage: { ...p.carriageStops }, carrierStops: p.carrierStops ? { ...p.carrierStops } : null,
    front: p.selections.front.map(s => [s.kcodeColumn, s.stitchSelector.encodedValue]),
    rear: p.selections.rear.map(s => [s.kcodeColumn, s.stitchSelector.encodedValue]),
  };
}

/** Compare the shared routine against the frozen physical Run 2 KC, then
 * compare the candidate to that routine at its own width/carriers. Allowed
 * differences: rear-left refresh on 40 waste passes and the consequent
 * removal of the converter's two EMPTY C6 release movements.
 */
export function verifyRun2Startup(referenceKcode: string, candidateKcode: string,
  lo: number, width: number, colors: readonly CarrierId[]) {
  const reference = trace(referenceKcode).passes;
  const control = unchangedPrefix(95, 64, ['2', '3']);
  assert.equal(control.length, 112);
  assert.deepEqual(control.map(signature), reference.slice(0, 112).map(signature), 'Shared startup must reproduce frozen Run 2');
  const template = unchangedPrefix(lo, width, colors);
  const omitted = template.filter(p => p.carrier === '6' && p.operation === 'Tu-Tu' && p.actions.every(a => a.kind === 'move'));
  assert.equal(omitted.length, 2);
  const expected = template.filter(p => !omitted.includes(p)).map(signature);
  const firstMain = expected.findIndex(p => p.carrier === colors[0]);
  let refreshed = 0;
  for (let i = 0; i < firstMain; i++) {
    const p = expected[i]!;
    if (p.carrier === '6' && p.direction === '<<' && p.front.length > 10 && p.rear.length > 10) {
      p.rear.unshift([lo - 1, 4]);
      // The initial interior row now reaches one column further left.
      p.carrierStops!.left = Math.min(p.carrierStops!.left, lo - 1 - 2.5);
      p.carriage.left = Math.min(p.carriage.left, lo - 1 - 2.5);
      refreshed++;
    }
  }
  assert.equal(refreshed, 40);
  const candidate = trace(candidateKcode).passes;
  assert.deepEqual(candidate.slice(0, expected.length).map(signature), expected,
    'Candidate deviates from Run 2 beyond the explicitly allowed edge refresh');
  assert(candidate[expected.length]!.actions.some(a => a.kind === 'xfer'), 'Prefix must join the beanie collapse transfers');
  assert(candidate.slice(expected.length).every(p => p.speed === 100), 'Only startup speed profile may change');
  const held = new Map<string, { pass: number; carrier: string }>();
  const catches: { carrier: string; pass: number; oldestWastePass: number; newestWastePass: number }[] = [];
  let oldestCapturedAge = 0;
  for (const p of candidate.slice(0, expected.length)) {
    const consumed: number[] = [];
    for (const action of p.actions) if (action.kind === 'knit') {
      const key = `${action.at.bed}:${action.at.traceCoordinate}`;
      const old = held.get(key);
      if (old?.carrier === '6' && p.carrier !== '6') {
        consumed.push(old.pass);
        oldestCapturedAge = Math.max(oldestCapturedAge, p.index + 1 - old.pass);
        assert(old.pass > 2, `C${p.carrier} captured original waste catch at ${key}`);
        assert(p.index + 1 - old.pass <= 5, `C${p.carrier} captured stale waste at ${key}`);
      }
      held.set(key, { pass: p.index + 1, carrier: p.carrier });
    }
    if (consumed.length) catches.push({ carrier: p.carrier, pass: p.index + 1,
      oldestWastePass: Math.min(...consumed), newestWastePass: Math.max(...consumed) });
  }
  return { frozenRun2PrefixPassesMatched: 112, candidatePrefixPasses: expected.length,
    rearLeftRefreshPasses: refreshed, emptyReleaseMovesRemoved: omitted.length,
    maxConsumedWasteAgeInMachinePasses: oldestCapturedAge, catches };
}
