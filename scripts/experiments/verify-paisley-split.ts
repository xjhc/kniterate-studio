import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { auditTraceV1,compareScheduledPassesToMachineTrace,deriveMachineTraceAdvisoriesV1,KNITERATE_7GG_KCODE_PROFILE_V2 as profile,parseKCodeDocument,projectKCodeMachineTrace,projectMachineTopologyV1,validateKCodeMachineSafetyV1,validateKCodeMachineTrace } from '../../packages/machine-lib/src/browser.js';
import { paisleyIncreaseStarts,type buildPaisleySplit } from './paisley-split-swatch.js';
export function verifyPaisleySplit(built:ReturnType<typeof buildPaisleySplit>){
 const p=parseKCodeDocument(built.compiled.kcode,{profile,dialect:'knitout-vendor',strict:true});assert(p.ok);
 const trace=projectKCodeMachineTrace(p.document,profile),validation=validateKCodeMachineTrace(trace,profile),safety=validateKCodeMachineSafetyV1(trace,profile);
 assert(validation.ok,JSON.stringify(validation.diagnostics));assert(safety.ok,JSON.stringify(safety.diagnostics));
 assert(compareScheduledPassesToMachineTrace(built.compiled.scheduledPasses,trace).ok,'Schedule differential');
 let label={row:0,slot:'frame'};
 const labels=built.source.split('\n').map(l=>{const m=l.match(/^; PAISLEY ROW (\d+) (\S+)$/);if(m)label={row:+m[1],slot:m[2]};if(l==='; PAISLEY BODY END')label={row:0,slot:'finish'};return label;});
 const pl=built.compiled.scheduledPasses.map(p=>{const ls=p.sourceLines.map(n=>labels[n-1]);assert(new Set(ls.map(l=>l.row)).size<=1,'Row boundary');return ls.at(-1)!;});
 const first=pl.findIndex(l=>l.row>0),last=pl.findLastIndex(l=>l.row>0);
 const audit=auditTraceV1(trace,{sections:[{name:'waste',from:1,to:first},{name:'body',from:first+1,to:last+1},{name:'top',from:last+2,to:trace.passes.length}]});
 assert(audit.checks.every(c=>c.ok),JSON.stringify(audit.checks.filter(c=>!c.ok)));
 const topology=projectMachineTopologyV1(trace),offset=built.compiled.coordinateMapping.frontSourceSlotToKCodeColumnOffset,at=(n:number)=>n+offset;
 const stacks=new Map<string,number>();
 const joins={left:new Set<number>(),right:new Set<number>()};
 for(const pass of trace.passes){
  const state=validation.passStates[pass.index];for(const delta of state.stackDeltas)stacks.set(`${delta.bed}:${delta.traceCoordinate}`,delta.afterCount);
  const l=pl[pass.index];if(!l.row)continue;
  assert(!['1','6'].includes(pass.carrier),'No idle feeder body moves');assert(state.after.maxStack<=2);
  const works=pass.actions.some(a=>a.kind==='knit'||a.kind==='split');
  if(works){assert([0,l.row===1?100:450].includes(pass.roller),`Roller pass${pass.index+1}`);if(l.slot==='outer-join')assert.equal(pass.roller,0);assert.equal(pass.speed,l.row===1?100:200);assert.equal(pass.rack,0);}else assert.equal(pass.roller,0);
  if(pl[pass.index+1]?.row!==l.row){const row=built.rows[l.row-1];assert.equal(state.after.totalLoops,row.width*2-(row.emptyRear===null?0:1),`row ${l.row} total`);for(let n=built.lo;n<built.lo+row.width;n++)for(const bed of ['front','rear'])assert.equal(stacks.get(`${bed}:${at(n)}`)??0,bed==='rear'&&n===row.emptyRear?0:1,`row ${l.row} occupancy ${bed} ${n}`);}
 }
 const events=[];
 for(const row of built.rows){
  const loops=topology.loops.filter(l=>pl[l.createdAt.passIndex].row===row.row),hi=built.lo+row.width-1;
  assert.equal(loops.length,row.width*2-(row.emptyRear===null?0:1),'Working count');
  assert.equal(new Set(loops.map(l=>`${l.createdAt.location.bed}:${l.createdAt.location.traceCoordinate}`)).size,loops.length,'No double knitting');
  for(const l of loops){assert(l.parentLoopIds.length>0,`No empty body knit row${row.row}`);const loc=l.createdAt.location,n=loc.traceCoordinate-offset;assert(n>=built.lo&&n<=hi);const c=row.front[n-built.lo];assert.equal(l.carrier,loc.bed==='front'?c:c==='3'?'4':'3','Chart colour');
   const prev=l.previousCarrierLoopId===null?undefined:topology.loops[l.previousCarrierLoopId];if(prev){const q=prev.createdAt.location;if(q.bed!==loc.bed){if(q.traceCoordinate===at(built.lo)&&loc.traceCoordinate===at(built.lo))joins.left.add(row.row);if(Math.min(q.traceCoordinate,loc.traceCoordinate)>=at(hi-1)&&Math.abs(q.traceCoordinate-loc.traceCoordinate)<=1)joins.right.add(row.row);}}
  }
  // Preserve every original artwork cell, including blank interior background.
  for(let x=1;x<row.width-2;x++)assert.equal(row.front[x],built.motif.cells[row.row-1][x]?'3':'4','Original interior chart');
  for(let x=0;x<21;x++)if(built.motif.cells[row.row-1][x]){assert(x>0&&x<row.width-2,'Motif outside construction area');assert.equal(row.front[x],'3');}
  const passes=trace.passes.filter(p=>pl[p.index].row===row.row),xf=passes.flatMap(p=>p.actions.filter(a=>a.kind==='xfer')),split=passes.filter(p=>p.actions.some(a=>a.kind==='split'));
  assert.equal(passes.filter(p=>p.roller>0).length,2,`Two take-down advances row${row.row}`);
  assert.equal(xf.length,row.kind==='growth'?1:row.kind==='decrease'?2:0);
  assert.equal(split.length,['growth','completion'].includes(row.kind)?1:0);
  if(row.kind==='growth'){const x=xf[0];assert.equal(x.source.bed,'rear');assert.equal(x.source.traceCoordinate,at(hi-1));assert.equal(x.target.bed,'front');assert.equal(x.target.traceCoordinate,at(hi));}
  if(row.kind==='decrease'){assert(xf.some(x=>x.source.bed==='front'&&x.source.traceCoordinate===at(hi+1)&&x.target.bed==='rear'&&x.target.traceCoordinate===at(hi)));assert(xf.some(x=>x.source.bed==='rear'&&x.source.traceCoordinate===at(hi+1)&&x.target.bed==='front'&&x.target.traceCoordinate===at(hi)));assert.equal(loops.filter(l=>l.parentLoopIds.length===2).length,2,'Two merged decreases');}
  if(row.kind==='growth'||row.kind==='completion'){
   const target=row.kind==='growth'?hi:hi-1,sl=loops.find(l=>l.creation==='split')!;assert(sl);assert.equal(sl.createdAt.location.traceCoordinate,at(target));assert.equal(sl.createdAt.location.bed,'front');assert.equal(sl.parentLoopIds.length,1);
   const receiving=loops.find(l=>l.createdAt.location.bed==='rear'&&l.createdAt.location.traceCoordinate===at(target))!;assert(receiving);assert.deepEqual(receiving.parentLoopIds,sl.parentLoopIds,'Both split descendants retain parent');
  }
  if(row.kind!=='plain')events.push({row:row.row,kind:row.kind,width:row.width,passes:passes.map(p=>p.index+1),splitPasses:split.map(p=>p.index+1)});
 }
 for(const side of ['left','right'] as const)for(let start=1;start<=78;start++)assert([...joins[side]].some(r=>r>=start&&r<=start+3),`${side} join missing rows${start}..${start+3}`);
 assert.equal(built.rows.length,81);assert.equal(built.rows.filter(r=>r.kind==='growth').length,13);assert.equal(built.rows.filter(r=>r.kind==='decrease').length,13);
 const starts=paisleyIncreaseStarts(built.variant);
 for(const row of built.rows)assert.equal(row.width,8+Math.min(starts.filter(r=>r<row.row).length,Math.floor((81-row.row)/3)),'Width schedule');
 if(built.variant==='grey')for(const row of built.rows)if(row.A)assert.equal(row.A,'4','Grey makes every split');
 return {passed:true,sha256:createHash('sha256').update(built.compiled.kcode).digest('hex'),bytes:Buffer.byteLength(built.compiled.kcode),passes:trace.passes.length,rows:81,increases:13,decreases:13,emptyBodyKnits:0,idleBodyMoves:0,events,advisories:deriveMachineTraceAdvisoriesV1(trace,profile),audit,joins:{left:[...joins.left],right:[...joins.right]},physicalValidation:false};
}
