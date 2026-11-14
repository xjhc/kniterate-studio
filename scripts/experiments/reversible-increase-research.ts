/** Research only: builds synthetic operations in memory, NEVER writes runnable KCode.
 * Not a production emitter or an approved knitting recipe. Run with node --import tsx.
 */
import assert from 'node:assert/strict';
import { knitoutToKCodeWithTrace } from '../../packages/machine-lib/src/knitout/kniterate/to-kcode.js';
import { parseKCodeDocument, projectKCodeMachineTrace, projectMachineTopologyV1, validateKCodeMachineSafetyV1, KNITERATE_7GG_KCODE_PROFILE_V2 as profile } from '../../packages/machine-lib/src/browser.js';

function compile(lines: string[]) {
  const result = knitoutToKCodeWithTrace([';!knitout-2', ';;Machine: kniterate', ';;Carriers: 1 2 3 4 5 6',
    'x-stitch-number 7', 'x-xfer-stitch-number 5', 'x-speed-number 100',
    'x-roller-advance 100', 'in 3', 'in 4', ...lines, 'out 3', 'out 4', ''].join('\n'));
  assert(result.ok, JSON.stringify(result));
  const parsed = parseKCodeDocument(result.kcode, {profile, dialect: 'knitout-vendor', strict: true});
  assert(parsed.document.metadata.parseStatus === "accepted", JSON.stringify(parsed.diagnostics));
  return projectKCodeMachineTrace(parsed.document, profile);
}
function setup(lo: number, hi: number, front: string, rear: string) {
  // Synthetic occupied-bed fixture, NOT a physical cast-on.
  return [...Array.from({length: hi-lo+1}, (_,i)=>`knit + f${lo+i} ${front}`),
    ...Array.from({length: hi-lo+1}, (_,i)=>`knit + b${lo+i} ${rear}`)];
}
function candidate(n: number, side: number, dir: string, front: string, rear: string) {
  const target = n + side, spare = n + 2*side;
  // Vendor convention: front = rear + rack. The outside spare must be empty.
  return [`rack ${-side}`, `split ${dir} f${n} b${target} ${front}`,
    'rack 0', `xfer b${target} f${target}`,
    `rack ${2*side}`, `split ${dir === '+' ? '-' : '+'} b${n} f${spare} ${rear}`,
    `rack ${side}`, `xfer f${spare} b${target}`, 'rack 0'];
}
function replay(trace: ReturnType<typeof compile>) {
  const stacks = new Map<string,string[]>(); let next=0, begun=false;
  let occupiedTargets=0, emptySources=0, emptyBodyKnits=0, maxStack=0;
  const at=(a: {bed:string;traceCoordinate:number})=>`${a.bed}:${a.traceCoordinate}`;
  for (const p of trace.passes) for(const a of p.actions) {
    if(a.kind==='split'||a.kind==='xfer') {
      begun=true;
      const src=at(a.source), dst=at(a.target), old=stacks.get(src)??[], held=stacks.get(dst)??[];
      if(!old.length) emptySources++;
      if(held.length) occupiedTargets++;
      stacks.set(dst,[...held,...old]);
      stacks.set(src,a.kind==='split'?[`${p.carrier}:${next++}`]:[]);
    } else if(a.kind==='knit'||a.kind==='tuck') {
      const key=at(a.at), held=stacks.get(key)??[];
      if(begun&&!held.length) emptyBodyKnits++;
      stacks.set(key,a.kind==='tuck'?[...held,`${p.carrier}:${next++}`]:[`${p.carrier}:${next++}`]);
    } else if(a.kind==='drop') stacks.set(at(a.at),[]);
    maxStack=Math.max(maxStack,...[...stacks.values()].map(s=>s.length));
  }
  return {stacks,occupiedTargets,emptySources,emptyBodyKnits,maxStack};
}
const cases=[];
for(const side of [-1,1]) for(const dir of ['+','-']) for(const front of ['3','4']) {
  const rear=front==='3'?'4':'3', lo=110, hi=125, repeats=4;
  const lines=setup(lo,hi,front,rear);
  for(let i=0;i<repeats;i++) {
    lines.push(...candidate((side===1?hi:lo)+side*i,side,dir,front,rear));
    // Continue both faces so a newly created column must actually be knitted through.
    lines.push(...setup(side===-1?lo-i-1:lo,side===1?hi+i+1:hi,front,rear));
  }
  const trace=compile(lines), r=replay(trace), topology=projectMachineTopologyV1(trace);
  assert.equal(r.occupiedTargets,0); assert.equal(r.emptySources,0); assert.equal(r.emptyBodyKnits,0); assert.equal(r.maxStack,1);
  assert.equal(topology.summary.liveLoopCount,2*(hi-lo+1+repeats));
  const splits=topology.loops.filter(l=>l.creation==='split');
  assert.equal(splits.length,2*repeats); assert(splits.every(l=>l.parentLoopIds.length===1));
  for(const bed of ['front','rear'] as const) {
    const stacks=topology.finalStacks[bed]; assert.equal(stacks.length,20);
    for(const stack of stacks) {
      assert.equal(stack.loopIds.length,1);
      const loop=topology.loops.find(l=>l.id===stack.loopIds[0])!;
      assert.equal(loop.carrier,bed==='front'?front:rear);
    }
  }
  const safety=validateKCodeMachineSafetyV1(trace,profile);
  assert.equal(safety.ok,false);
  assert.equal(safety.counts['machine-safety.transfer-with-carrier'],8);
  if(side===1 && dir==='-') assert.equal(safety.errorCount,8, 'Preferred direction must have no findings other than unverified split encoding');
  cases.push({side:side===1?'right':'left',firstSplitDirection:dir,frontCarrier:front,repeats,
    passes:trace.passes.length,liveLoops:topology.summary.liveLoopCount,maxStack:r.maxStack,
    splitParentsVerified:true,occupiedTargets:r.occupiedTargets,emptySources:r.emptySources,
    safetyDiagnostics:safety.diagnostics.map(d=>({rule:d.rule,message:d.message})),
    safetyErrors:Object.fromEntries(Object.entries(safety.counts).filter(([,n])=>n>0))});
}
// Negative controls: the same checks must expose the two known failure mechanisms.
const naive=replay(compile([...setup(110,125,'3','4'),'split + f125 b125 3']));
assert.equal(naive.occupiedTargets,1); assert.equal(naive.maxStack,2);
const baseline=replay(compile([...setup(110,125,'3','4'),'rack 1','xfer b125 f126','rack 0','knit - b126 4','knit - b125 4']));
assert.equal(baseline.emptyBodyKnits,2);
console.log(JSON.stringify({status:'BLOCKED_NOT_FOR_MACHINE',scope:'synthetic loop accounting and pinned-backend serialization only',
  cases,negativeControls:{naiveSplitOccupiedTargets:naive.occupiedTargets,currentBorrowEmptyRearKnits:baseline.emptyBodyKnits},
  limitations:['No vendor split KCode reference; machine-safety gate remains blocking','No physical cast-on, finish, idle-feeder lifecycle, or whole-project integration',
    'No physical yarn-path, latch clearance, take-down, loop-size, or appearance validation','Extra local knitting and colour/edge-join scheduling remain to be designed']},null,2));
