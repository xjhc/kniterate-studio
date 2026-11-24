import assert from 'node:assert/strict';
import fs from 'node:fs';
import { rows, source, compiled, lo, c3Decrease, largeLetter, compactLetter, scarf, outputFile } from './build.mjs';
import { auditTraceV1, compareScheduledPassesToMachineTrace, deriveMachineTraceAdvisoriesV1, KNITERATE_7GG_KCODE_PROFILE_V2 as profile, parseKCodeDocument, projectKCodeMachineTrace, projectMachineTopologyV1, validateKCodeMachineSafetyV1, validateKCodeMachineTrace } from '../../../packages/machine-lib/src/browser.ts';

assert.equal(fs.readFileSync(outputFile('command.kc'),'utf8'),compiled.kcode);
const parsed=parseKCodeDocument(compiled.kcode,{profile,dialect:'knitout-vendor',strict:true,resourceProfile:scarf?'authored-v1':'foreign-v1'});
assert(parsed.ok);
const trace=projectKCodeMachineTrace(parsed.document,profile);
const validation=validateKCodeMachineTrace(trace,profile);
assert(validation.ok,JSON.stringify(validation.diagnostics));
const safety = validateKCodeMachineSafetyV1(trace,profile);
assert(safety.ok,JSON.stringify(safety.diagnostics));
assert(compareScheduledPassesToMachineTrace(compiled.scheduledPasses,trace).ok);
let section='setup', row=0, kind='';
const labels=source.split('\n').map(line=>{
  if(line==='; STARTER') section='starter';
  if(line.startsWith('; NECK ')) section='neck';
  const match=line.match(/^; LETTER ROW (\d+) (.+)/);
  if(match) { section='body';row=Number(match[1]);kind=match[2]; }
  if(line==='; LETTER BODY END') {section='finish';row=0;kind='';}
  return {section,row,kind};
});
const byPass=compiled.scheduledPasses.map(p=>{
  const l=p.sourceLines.map(n=>labels[n-1]);return l.at(-1);
});
const passesIn=section=>trace.passes.filter(p=>byPass[p.index].section===section);
const ranges=Object.fromEntries(['setup','starter','neck','body','finish'].map(name=>{
  const ps=passesIn(name);return [name,[ps[0].index+1,ps.at(-1).index+1]];
}));
const audit=auditTraceV1(trace,{sections:[{name:'waste',from:1,to:ranges.body[0]-1},{name:'body',from:ranges.body[0],to:ranges.body[1]},{name:'top',from:ranges.finish[0],to:ranges.finish[1]}]});
assert(audit.checks.every(c=>c.ok),JSON.stringify(audit.checks.filter(c=>!c.ok)));
// Reserve enough topology records for both beds of the full chart and setup.
const loopBudget = scarf ? 2 * scarf.plan.widths.reduce((sum,width)=>sum+width,0) + 4000 : 0;
const topo=projectMachineTopologyV1(trace,scarf ? {maxLoops:loopBudget,maxConnections:loopBudget*3,maxMovements:60000} : undefined);
const offset=compiled.coordinateMapping.frontSourceSlotToKCodeColumnOffset;
const loopsByRow=Array.from({length:rows.length+1},()=>[]);
for (const loop of topo.loops) loopsByRow[byPass[loop.createdAt.passIndex].row].push(loop);
const passesByRow=Array.from({length:rows.length+1},()=>[]);
for (const pass of trace.passes) passesByRow[byPass[pass.index].row].push(pass);
const occupancy=new Map(), finalAt=[];
for(const p of trace.passes){
  const state=validation.passStates[p.index];
  for(const delta of state.stackDeltas)occupancy.set(delta.bed+':'+delta.traceCoordinate,delta.afterCount);
  if(p.index+1>=ranges.starter[0])assert(state.after.maxStack<=2);
  if(byPass[p.index].section==='body' && byPass[p.index+1].row!==byPass[p.index].row) finalAt.push(new Map(occupancy));
}
assert.equal(validation.passStates.at(-1).after.totalLoops,0);
assert(topo.loops.filter(l=>l.createdAt.passIndex+1>=ranges.starter[0]).every(l=>l.parentLoopIds.length>0),'Unsupported knit after starter begins');
const joins={left:[],right:[]}, events=[], faces=[];
for(const {row:r,front} of rows){
  const width=front.length, edge=lo+width-1, state=finalAt[r-1];
  const passes=passesByRow[r];
  const kind=byPass[passes[0].index].kind;
  // Six additional rows at width 12 precede the final increase in the large-A trial.
  const shapeRow = largeLetter && r >= 22 ? Math.max(21, r - 6) : r;
  assert.equal(width,scarf ? (scarf.plan.widths[r-2] ?? 3) : Math.min(13,3+Math.max(0,Math.floor((shapeRow-2)/2)),3+Math.max(0,Math.floor((43-shapeRow)/2))));
  const loops=loopsByRow[r];
  assert.equal(loops.length,2*width-(kind==='growth'?1:0));
  assert.equal(new Set(loops.map(l=>l.createdAt.location.bed+':'+l.createdAt.location.traceCoordinate)).size,loops.length);
  const face = {front:Array(width).fill(null), rear:Array(width).fill(null)};
  faces.push(face);
  for(const l of loops){
    const {bed,traceCoordinate}=l.createdAt.location,n=traceCoordinate-offset;
    assert(n>=lo && n<=edge);
    face[bed][n-lo]=l.carrier;
    assert.equal(l.carrier,bed==='front'?front[n-lo]:front[n-lo]==='4'?'3':'4');
    const prev=topo.loops[l.previousCarrierLoopId]?.createdAt.location;
    if(prev && prev.bed!==bed){
      if(prev.traceCoordinate===traceCoordinate && n===lo) joins.left.push(r);
      if(Math.min(n,prev.traceCoordinate-offset)>=edge-1 && Math.abs(traceCoordinate-prev.traceCoordinate)<=1) joins.right.push(r);
    }
  }
  for(let n=lo;n<=edge;n++)for(const bed of ['front','rear']) {
    assert.equal(state.get(bed+':'+(n+offset))??0,kind==='growth' && n===edge-1 && bed==='rear'?0:1);
  }
  const frontOn=(i)=>loops.find(l=>l.createdAt.location.bed==='front'&&l.createdAt.location.traceCoordinate===lo+i+offset)?.carrier;
  // Independently check the feet, crossbar and apex in knitting order.
  // Every other interior stitch, including the entire narrowing half, is Fig.
  const expectedLetter = compactLetter ? {
    16: [2,3,6,7], 17: [2,3,6,7], 18: [2,3,4,5,6,7],
    19: [2,3,4,5,6,7], 20: [2,3,6,7], 21: [2,3,6,7],
    22: [3,4,5,6], 23: [4,5],
  } : largeLetter ? {
    20: [2,3,8,9], 21: [2,3,8,9],
    22: [2,3,4,5,6,7,8,9], 23: [2,3,4,5,6,7,8,9],
    24: [2,3,8,9], 25: [2,3,8,9], 26: [2,3,4,7,8,9],
    27: [3,4,5,6,7,8], 28: [4,5,6,7], 29: [5,6],
  } : {
    14: [2,5], 15: [2,5], 16: [2,3,4,5], 17: [2,5], 18: [3,4],
  };
  const letterColumns = expectedLetter[r] ?? [];
  for (const column of letterColumns) assert(column >= 2 && column <= width - 3);
  if (scarf && r >= 2 && r <= scarf.plan.rows+1) {
    assert.deepEqual(face.front,scarf.cells[r-2].slice(0,width).map(x=>x?'3':'4'));
  }
  if (!scarf) for (let column = 1; column < width - 1; column++) {
    assert.equal(frontOn(column), letterColumns.includes(column) ? '3' : '4');
  }
  if (scarf ? r >= scarf.plan.rows/2 + 3 : shapeRow >= 24) {
    const expected = r % 2 === 0 ? (c3Decrease ? '3' : '4') : (c3Decrease ? '4' : '3');
    assert.equal(face.front.at(-1), expected, 'Shaped edge colour on front');
    assert.equal(face.rear.at(-1), expected === '3' ? '4' : '3', 'Shaped edge colour on rear');
  }
  const splits=loops.filter(l=>l.creation==='split');
  assert.equal(splits.length,['growth','completion'].includes(kind)?1:0);
  if(splits.length){const l=splits[0];assert.equal(l.carrier,'4');assert.equal(l.parentLoopIds.length,1);assert.equal(l.createdAt.location.traceCoordinate-offset,kind==='growth'?edge:edge-1);assert.equal(l.createdAt.location.bed,'front');assert.deepEqual(loops.find(other=>other.createdAt.location.bed==='rear'&&other.createdAt.location.traceCoordinate===l.createdAt.location.traceCoordinate).parentLoopIds,l.parentLoopIds);}
  if(kind==='decrease')assert.equal(loops.filter(l=>l.parentLoopIds.length===2).length,2);
  const xfers=passes.flatMap(p=>p.actions.filter(a=>a.kind==='xfer').map(a=>[a.source.bed,a.source.traceCoordinate-offset,a.target.bed,a.target.traceCoordinate-offset]));
  assert.deepEqual(xfers,kind==='growth'?[['rear',edge-1,'front',edge]]:kind==='decrease'?[['front',edge+1,'rear',edge],['rear',edge+1,'front',edge]]:[]);
  assert.equal(passes.filter(p=>p.roller>0).length,2);
  for(const p of passes){
    assert(!['1','6'].includes(p.carrier));
    const acts=p.actions.filter(a=>a.kind==='knit'||a.kind==='split');
    for(const act of acts){
      for(const needle of (act.kind==='split' ? [act.source,act.target] : [act.at])) assert.equal(needle.stitchSelector.encodedValue,6);
    }
    if(acts.length){assert.equal(p.rack,0);assert.equal(p.speed,r===1?100:150);assert([0,r===1?100:400].includes(p.roller));}
  }
  events.push({row:r,kind,width,passes:[passes[0].index+1,passes.at(-1).index+1]});
}
assert.equal(rows.length, scarf ? scarf.plan.rows + 2 : largeLetter ? 50 : 44);
assert.equal(events.filter(e => e.kind === 'growth').length, scarf?.plan.growth ?? 10);
assert.equal(events.filter(e => e.kind === 'decrease').length, scarf?.plan.growth ?? 10);
for(const side of Object.values(joins)) for(let r=1;r<=rows.length-3;r++)assert(side.some(join=>join>=r&&join<=r+3));
const advisories=deriveMachineTraceAdvisoriesV1(trace,profile);
console.log(JSON.stringify(scarf ? {ranges, passCount:trace.passes.length, compilerWarningCount:compiled.warningCount, chartRows:scarf.plan.rows, selectedColumns:[lo+offset,lo+offset+scarf.plan.columns-1], advisories, peak:events.filter(e=>e.width===scarf.plan.columns)} : {ranges,events,faces,advisories},null,2));
