/** Experimental right-only split shaping with preserved mixed-paisley artwork. */
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { emitCustomistFairisleFrame } from '../../packages/machine-lib/src/knitout/passes/customist-fairisle-frame.js';
import { FAIRISLE_PARK_WASTE_DEFAULTS } from '../../packages/machine-lib/src/knitout/passes/waste-section.js';
import { FAIRISLE_CARRIER_INTRO_DEFAULTS } from '../../packages/machine-lib/src/knitout/passes/carrier-intro.js';
import { CarriageSimulator } from '../../packages/machine-lib/src/knitout/sim/carriage-simulator.js';
import { ALL_CARRIERS,b,f,comment,type KnitoutOp,type KnitoutProgram,type CarrierId,type Direction } from '../../packages/machine-lib/src/knitout/types.js';
import { writeKnitoutProgram } from '../../packages/machine-lib/src/knitout/emitter.js';
import { knitoutToKCodeWithTrace } from '../../packages/machine-lib/src/knitout/kniterate/to-kcode.js';
import { verifyPaisleySplit } from './verify-paisley-split.js';
/**
 * 'alternating' is the knitted 514-pass file: an increase every three rows, split by whichever
 * yarn is on the left. 'grey' keeps C4 (the grey face's yarn) as the splitting yarn at every
 * increase. The yarns swap sides on every plain row and not across an increase, so that needs an
 * even number of plain rows between increases: they start two, then four rows apart.
 */
export type PaisleySplitVariant='alternating'|'grey';
export const paisleyIncreaseStarts=(variant:PaisleySplitVariant)=>Array.from({length:37},(_,i)=>i+3).filter(r=>variant==='grey'?r%6===3||r%6===5:r%3===0);
export function buildPaisleySplit(variant:PaisleySplitVariant='alternating') {
 const increaseStarts=new Set(paisleyIncreaseStarts(variant));
 const motif=JSON.parse(fs.readFileSync('fixtures/experiments/mixed-paisley-21x81.json','utf8'));
 const lo=119, initialHi=126;
 const frame=emitCustomistFairisleFrame({needleStart:lo,needleEnd:initialHi,wasteCarrier:'6',bodyCarriers:['3','4'],drawCarrier:'1',wastePasses:80,waste:FAIRISLE_PARK_WASTE_DEFAULTS,intro:FAIRISLE_CARRIER_INTRO_DEFAULTS,retainBackBed:true,catchNeedles:8});
 const ops:KnitoutOp[]=[{kind:'x-carrier-spacing',value:2},{kind:'x-carrier-stopping-distance',value:2.5},...frame.ops];
 const sim=new CarriageSimulator({carriers:ALL_CARRIERS,initialNextDirection:frame.finalNextDirection});
 for(const state of frame.finalCarrierStates.values())sim.seedCarrierState(state);
 sim.seedRacking(0);sim.setPresserSpeed(600);sim.setPresserRoller(0);
 const drain=()=>ops.push(...sim.drainOps());
 sim.miss('6','-',f(lo-8));sim.miss('1','-',f(lo-5));drain();
 const rows:{row:number;width:number;kind:string;front:CarrierId[];emptyRear:number|null;A?:CarrierId}[]=[];
 let hi=initialHi,rightFront:CarrierId='4';
 const other=(c:CarrierId):CarrierId=>c==='3'?'4':'3';
 const colours=(r:number)=>{const a:CarrierId[]=Array.from({length:hi-lo+1},(_,i)=>motif.cells[r][i]?'3':'4');a[0]=r%2===0?'3':'4';return a;};
 const slot=(r:number,name:string,fn:()=>void)=>{ops.push(comment(`PAISLEY ROW ${r+1} ${name}`));sim.setSourceRows([r]);fn();drain();};
 const settings=(r:number,roller=450)=>{sim.setSpeed(r===0?100:200);sim.setStitch(7);sim.setRoller(r===0?100:roller);};
 const knit=(c:CarrierId,d:Direction,n:number,front:CarrierId[])=>sim.knit(c,d,front[n-lo]===c?f(n):b(n));
 for(let r=0;r<81;r++) {
  if(increaseStarts.has(r)){
   const A:CarrierId=variant==='grey'||sim.positionOf('4')?.side==='left'?'4':'3', B=other(A),old=hi;
   assert.equal(sim.positionOf(A)?.side,'left');assert.equal(sim.positionOf(B)?.side,'right');
   slot(r,'prepare',()=>{sim.setSpeed(200);sim.setRoller(0);sim.miss(B,'-',f(old));sim.miss(B,'+',f(old+1));sim.setSpeed(100);sim.setXferStitch(5);sim.setRacking(1);sim.xferBatch([{from:b(old),to:f(old+1)}]);sim.setRacking(0);});
   hi++;
   const growth=colours(r);growth[old-lo]=A;growth[hi-lo]=A;
   slot(r,'growth-A',()=>{settings(r);for(let n=lo;n<=old;n++)knit(A,'+',n,growth);sim.split(A,'+',f(hi),b(hi));});
   slot(r,'growth-B',()=>{settings(r);sim.knit(B,'-',b(hi));for(let n=old-1;n>=lo;n--)knit(B,'-',n,growth);});
   rows.push({row:r+1,width:hi-lo+1,kind:'growth',front:growth,emptyRear:old,A});
   r++;
   const complete=colours(r);complete[old-lo]=A;complete[hi-lo]=B;
   slot(r,'outer-join',()=>{settings(r,0);sim.knit(A,'-',b(hi));});
   slot(r,'return',()=>{sim.setSpeed(200);sim.setRoller(0);sim.miss(A,'+',f(hi));});
   slot(r,'completion-A',()=>{settings(r);sim.addRollerAdvance(450);sim.split(A,'-',f(old),b(old));sim.setRoller(0);for(let n=old-1;n>=lo;n--)knit(A,'-',n,complete);});
   slot(r,'completion-B',()=>{settings(r);for(let n=lo;n<=old;n++)knit(B,'+',n,complete);sim.knit(B,'+',f(hi));});
   rows.push({row:r+1,width:hi-lo+1,kind:'completion',front:complete,emptyRear:null,A});rightFront=B;
   continue;
  }
  const decrease=r>=42&&r<=78&&r%3===0;
  if(decrease)slot(r,'decrease',()=>{sim.setSpeed(100);sim.setRoller(0);sim.setXferStitch(5);sim.setRacking(1);sim.xferBatch([{from:f(hi),to:b(hi-1)}]);sim.setRacking(-1);sim.xferBatch([{from:b(hi),to:f(hi-1)}]);sim.setRacking(0);hi--;});
  const front=colours(r);if(r>0)rightFront=other(rightFront);front[hi-lo]=rightFront;
  slot(r,'plain',()=>{settings(r);const firstSide=sim.finalNextDirection()==='+'?'left':'right';const first:CarrierId=sim.positionOf('3')?.side===firstSide?'3':'4';for(const c of [first,other(first)]){const d:Direction=sim.positionOf(c)?.side==='left'?'+':'-';const ns=Array.from({length:hi-lo+1},(_,i)=>lo+i);if(d==='-')ns.reverse();for(const n of ns)knit(c,d,n,front);}});
  rows.push({row:r+1,width:hi-lo+1,kind:decrease?'decrease':'plain',front,emptyRear:null});
 }
 assert.equal(hi,initialHi);ops.push(comment('PAISLEY BODY END'));sim.setSourceRows(undefined);sim.setSpeed(200);sim.setStitch(7);sim.setRoller(450);
 for(let r=0;r<8;r++){for(let n=lo;n<=hi;n++)sim.knit('6','+',f(n));for(let n=hi;n>=lo;n--)sim.knit('6','-',b(n));}
 sim.setSpeed(150);sim.setStitch(4);for(let n=lo;n<=hi;n++){sim.drop(f(n));sim.drop(b(n));}sim.setRoller(0);for(const c of ['1','3','4','6'] as CarrierId[])sim.out(c);drain();
 const program:KnitoutProgram={version:2,carriers:[...ALL_CARRIERS],machine:'kniterate',gauge:7,position:'Keep',yarns:{'3':'Orange single 2/14 acrylic','4':'Grey single 2/14 acrylic'},kniterate:{xferStyle:'four-pass'},ops};
 const source=writeKnitoutProgram(program),compiled=knitoutToKCodeWithTrace(source,'program.k');assert(compiled.ok,JSON.stringify(compiled));
 return {source,compiled,rows,lo,motif,variant};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
 const variant=process.argv[3]??'alternating';assert(variant==='alternating'||variant==='grey','usage: paisley-split-swatch.ts <out-dir> [alternating|grey]');
 const built=buildPaisleySplit(variant),report=verifyPaisleySplit(built),out=process.argv[2]??'../paisley-split-swatch';
 fs.mkdirSync(out,{recursive:true});for(const [name,data] of Object.entries({'program.k':built.source,'program.kc':built.compiled.kcode,'plan.json':JSON.stringify({lo:built.lo,rows:built.rows},null,2),'verification.json':JSON.stringify(report,null,2)}))fs.writeFileSync(path.join(out,name),data);
 console.log(JSON.stringify(report,null,2));
}
