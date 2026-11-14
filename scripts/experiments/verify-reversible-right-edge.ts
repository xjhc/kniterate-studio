import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {knitoutToKCodeWithTrace} from '../../packages/machine-lib/src/knitout/kniterate/to-kcode.js';
import {parseKCodeDocument,projectKCodeMachineTrace,validateKCodeMachineSafetyV1,KNITERATE_7GG_KCODE_PROFILE_V2 as profile} from '../../packages/machine-lib/src/browser.js';
const dir=process.argv[2]??'../reversible-right-edge-swatch';
const source=fs.readFileSync(dir+'/program.k','utf8'),lines=source.split('\n');
const compiled=knitoutToKCodeWithTrace(source,'program.k');assert(compiled.ok);
assert.equal(compiled.kcode,fs.readFileSync(dir+'/program.kc','utf8'));
const parsed=parseKCodeDocument(compiled.kcode,{profile,dialect:'knitout-vendor',strict:true});assert(parsed.ok);
const trace=projectKCodeMachineTrace(parsed.document,profile);assert(validateKCodeMachineSafetyV1(trace,profile).ok);
const plan:{needleStart:number;motif?:string;rows:{row:number;width:number;event:string;direction:string;front:string[]}[]}=JSON.parse(fs.readFileSync(dir+'/plan.json','utf8'));
if(plan.rows.length===81){
 const motif=JSON.parse(fs.readFileSync(plan.motif==='mixed-paisley'?'fixtures/experiments/mixed-paisley-21x81.json':plan.motif==='original-small'?'fixtures/experiments/original-small-paisley-21x81.json':'fixtures/experiments/reversible-paisley-21x81.json','utf8'));
 if(plan.motif==='original-small'||plan.motif==='mixed-paisley')for(const m of motif.placements)for(let y=0;y<13;y++)for(let x=0;x<7;x++)assert.equal(plan.rows[m.row-1+y].front[m.x+x],motif.originalTile[y][x]?'3':'4','Original tile changed');
 for(let r=0;r<81;r++)for(let x=0;x<21;x++)if(motif.cells[r][x]){
  assert(x>=2&&x<=plan.rows[r].width-4,`motif touches construction margin row ${r+1}`);
  assert.equal(plan.rows[r].front[x],'3');
 }
}
if(plan.motif==='mixed-paisley'){
 const mixed=JSON.parse(fs.readFileSync('fixtures/experiments/mixed-paisley-21x81.json','utf8'));
 const visible=mixed.cells.flatMap((row:number[],i:number)=>row.some(Boolean)?[i+1]:[]);
 const gaps=visible.slice(1).flatMap((r:number,i:number)=>r-visible[i]>1?[r-visible[i]-1]:[]);
 assert.deepEqual(gaps,[2,2],'Both motif gaps must be exactly two blank rows');
 const previous=JSON.parse(fs.readFileSync('fixtures/experiments/reversible-paisley-21x81.json','utf8'));
 for(let r=28;r<55;r++)for(let x=2;x<=plan.rows[r].width-4;x++)assert.equal(plan.rows[r].front[x],previous.cells[r][x]?'3':'4','Large centre changed');
}
const labels=lines.flatMap((s,i)=>s.startsWith('; TRIAL ROW ')?[{line:i+1,row:Number(s.split(' ')[3])}]:[]);
const end=lines.findIndex(l=>l==='; TRIAL BODY END')+1;
const rowOf=(line:number)=>line>=end?0:labels.findLast(x=>x.line<line)?.row??0;
const passRow=compiled.scheduledPasses.map(p=>Math.max(0,...p.sourceLines.map(rowOf)));
const rowKnits=plan.rows.map(()=>[] as any[]),rowEmpty=plan.rows.map(()=>[] as any[]),rowXfers=plan.rows.map(()=>[] as any[]);
const stacks=new Map<string,string[]>();
const key=(a:any)=>`${a.bed}:${a.traceCoordinate}`;
for(let pi=0;pi<trace.passes.length;pi++){
 const p=trace.passes[pi],r=passRow[pi];
 for(const a of p.actions){
  if(a.kind==='xfer'){
   const src=stacks.get(key(a.source))??[],dst=stacks.get(key(a.target))??[];
   if(r){assert(src.length,`empty transfer at ${pi+1}`);rowXfers[r-1].push({source:a.source,target:a.target,src:[...src],dst:[...dst],pass:pi+1});}
   stacks.set(key(a.target),[...dst,...src]);stacks.set(key(a.source),[]);
  }else if(a.kind==='knit'||a.kind==='tuck'){
   const held=stacks.get(key(a.at))??[];
   if(r){rowKnits[r-1].push({at:a.at,carrier:p.carrier,pass:pi+1});if(!held.length)rowEmpty[r-1].push({bed:a.at.bed,n:a.at.traceCoordinate,carrier:p.carrier});}
   stacks.set(key(a.at),a.kind==='tuck'?[...held,p.carrier]:[p.carrier]);
  }else if(a.kind==='drop')stacks.set(key(a.at),[]);
 }
 if(r&&passRow[pi+1]!==r){const live=[...stacks.values()].reduce((s,a)=>s+a.length,0);assert.equal(live,2*plan.rows[r-1].width,`row ${r} occupancy`);}
}
const lo=plan.needleStart-1,events:any[]=[];
for(let i=0;i<plan.rows.length;i++){
 const row=plan.rows[i],knits=rowKnits[i],empty=rowEmpty[i],xfers=rowXfers[i],hi=lo+row.width-1;
 assert.equal(knits.length,row.width*2);assert.equal(new Set(knits.map(x=>key(x.at))).size,knits.length);
 for(const k of knits){assert(k.at.traceCoordinate>=lo&&k.at.traceCoordinate<=hi);assert.equal(k.carrier,k.at.bed==='front'?row.front[k.at.traceCoordinate-lo]:(row.front[k.at.traceCoordinate-lo]==='3'?'4':'3'));}
 if(row.event==='increase'){
  assert.equal(xfers.length,1);const x=xfers[0];assert.deepEqual(x.src,['3']);assert.deepEqual(x.dst,[]);
  assert.equal(x.source.bed,'rear');assert.equal(x.source.traceCoordinate,hi-1);assert.equal(x.target.bed,'front');assert.equal(x.target.traceCoordinate,hi);
  assert.deepEqual(empty.sort((a,b)=>a.n-b.n),[{bed:'rear',n:hi-1,carrier:'4'},{bed:'rear',n:hi,carrier:'3'}]);
 }else {assert.equal(empty.length,0);assert.equal(xfers.length,row.event==='decrease'?2:0);if(xfers.length)assert(xfers.every(x=>x.src.length===1&&x.dst.length===1));}
 if(row.event!=='plain')events.push({row:i+1,event:row.event,width:row.width,transferPasses:xfers.map(x=>x.pass),knitPasses:[...new Set(knits.map(x=>x.pass))],direction:row.direction});
}
// Yarn-path evidence, not just colour alternation: a carrier actually crosses beds at each edge.
const last=new Map<string,any>(),joins:{left:number[],right:number[]}={left:[],right:[]};
for(let i=0;i<plan.rows.length;i++)for(const k of rowKnits[i]){
 const prev=last.get(k.carrier),hi=lo+plan.rows[i].width-1;
 if(prev&&prev.at.bed!==k.at.bed){
  if(prev.at.traceCoordinate===lo&&k.at.traceCoordinate===lo)joins.left.push(i+1);
  if(Math.min(prev.at.traceCoordinate,k.at.traceCoordinate)>=hi-1&&Math.abs(prev.at.traceCoordinate-k.at.traceCoordinate)<=1)joins.right.push(i+1);
 }
 last.set(k.carrier,k);
}
for(const side of ['left','right'] as const){joins[side]=[...new Set(joins[side])];for(let start=1;start<=plan.rows.length-3;start++)assert(joins[side].some(r=>r>=start&&r<=start+3),`${side} unlinked rows ${start}–${start+3}`);}
const bodyFirst=passRow.findIndex(r=>r>0),bodyLast=passRow.findLastIndex(r=>r>0),body=trace.passes.slice(bodyFirst,bodyLast+1);
assert(!body.some(p=>p.carrier==='1'||p.carrier==='6'),'idle feeder in body');
const knitting=body.filter(p=>p.actions.some(a=>a.kind==='knit')).length;
const moves=body.filter(p=>!p.actions.some(a=>['knit','tuck','xfer','split','drop'].includes(a.kind))).length;assert(moves/knitting<=1.5);
// Verify the two local columns against actual official reversible sleeve operations.
const refParsed=parseKCodeDocument(fs.readFileSync('packages/machine-lib/reference/sleeves.kc','utf8'),{profile,dialect:'app',strict:true});assert(refParsed.ok);
const ref=projectKCodeMachineTrace(refParsed.document,profile);
const transfer=ref.passes[168].actions.find(a=>a.kind==='xfer');assert(transfer&&transfer.kind==='xfer');
assert.equal(transfer.source.bed,'rear');assert.equal(transfer.target.bed,'front');assert.equal(transfer.target.traceCoordinate-transfer.source.traceCoordinate,1);
const old=transfer.source.traceCoordinate,newN=transfer.target.traceCoordinate;
for(const [pi,c,beds] of [[171,'3',['front','rear']],[172,'4',['rear','front']]] as const){const p=ref.passes[pi];assert.equal(p.carrier,c);for(const [j,n] of [old,newN].entries())assert(p.actions.some(a=>a.kind==='knit'&&a.at.traceCoordinate===n&&a.at.bed===beds[j]));}
const report={passed:true,sha256:createHash('sha256').update(compiled.kcode).digest('hex'),passes:trace.passes.length,bodyPasses:[bodyFirst+1,bodyLast+1],bodyKnittingPasses:knitting,bodyMovementPasses:moves,movementToKnittingRatio:moves/knitting,idleC1C6BodyPasses:0,rows:plan.rows.length,increases:events.filter(e=>e.event==='increase').length,decreases:events.filter(e=>e.event==='decrease').length,emptyNeedlesPerIncrease:'two rear needles, exactly one per carrier; none elsewhere',loopCounts:'two live loops per width column after every row',edgeJoins:joins,reference:'sleeves.kc passes 169,172,173: local transfer and old/new column yarn/bed selection; directions alternate in trial, settings not claimed identical',events,physicalValidation:false};
fs.writeFileSync(dir+'/verification.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({...report,events:events.slice(0,2)},null,2));
