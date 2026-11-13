/** Isolated physical trial; canonical frame/simulator/backend, no production recipe change. */
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {emitCustomistFairisleFrame} from '../../packages/machine-lib/src/knitout/passes/customist-fairisle-frame.js';
import {FAIRISLE_PARK_WASTE_DEFAULTS} from '../../packages/machine-lib/src/knitout/passes/waste-section.js';
import {FAIRISLE_CARRIER_INTRO_DEFAULTS} from '../../packages/machine-lib/src/knitout/passes/carrier-intro.js';
import {CarriageSimulator} from '../../packages/machine-lib/src/knitout/sim/carriage-simulator.js';
import {ALL_CARRIERS,b,f,comment,type KnitoutOp,type KnitoutProgram,type CarrierId,type Direction} from '../../packages/machine-lib/src/knitout/types.js';
import {writeKnitoutProgram} from '../../packages/machine-lib/src/knitout/emitter.js';
import {knitoutToKCodeWithTrace} from '../../packages/machine-lib/src/knitout/kniterate/to-kcode.js';
const mixed=process.argv.includes('--mixed-paisley');
const originalSmall=process.argv.includes('--original-small');
const wide=process.argv.includes('--wide21');
const steps=wide?13:12,totalRows=3+6*steps,decStart=3+3*steps;
const paisley=process.argv.includes('--paisley');
const out=process.argv[2]??'../reversible-right-edge-swatch';
assert(!(originalSmall||mixed)||(wide&&paisley),'Original small motif requires --wide21 --paisley');
const motifFile=mixed?'fixtures/experiments/mixed-paisley-21x81.json':originalSmall?'fixtures/experiments/original-small-paisley-21x81.json':`fixtures/experiments/reversible-paisley-${wide?'21x81':'20x75'}.json`;
const motif=paisley?JSON.parse(fs.readFileSync(motifFile,'utf8')):null;
const lo=119, initialHi=126;
const frame=emitCustomistFairisleFrame({needleStart:lo,needleEnd:initialHi,wasteCarrier:'6',bodyCarriers:['3','4'],drawCarrier:'1',wastePasses:80,waste:FAIRISLE_PARK_WASTE_DEFAULTS,intro:FAIRISLE_CARRIER_INTRO_DEFAULTS,retainBackBed:true,catchNeedles:8});
const ops:KnitoutOp[]=[{kind:'x-carrier-spacing',value:2},{kind:'x-carrier-stopping-distance',value:2.5},...frame.ops];
const sim=new CarriageSimulator({carriers:ALL_CARRIERS,initialNextDirection:frame.finalNextDirection});
for(const state of frame.finalCarrierStates.values())sim.seedCarrierState(state);
sim.seedRacking(0);
const drain=()=>ops.push(...sim.drainOps());
sim.setPresserSpeed(600);sim.setPresserRoller(0);
// Anchors stay on the fixed left edge. Space idle feeders outside the entire working envelope.
sim.miss('6','-',f(lo-8));sim.miss('1','-',f(lo-5));drain();
ops.push(comment('TRIAL BODY START'));
let hi=initialHi, nextDir:Direction='+';
const rows:{row:number;width:number;event:string;direction:Direction;front:CarrierId[]}[]=[];
for(let r=0;r<totalRows;r++) {
 const increase=r>=3&&r<=3*steps&&r%3===0;
 const decrease=r>=decStart&&r<=totalRows-3&&r%3===0;
 const event=increase?'increase':decrease?'decrease':'plain';
 ops.push(comment(`TRIAL ROW ${r+1} ${event}`));
 sim.setSourceRows([r]);
 if(increase||decrease){sim.setSpeed(100);sim.setRoller(0);sim.setXferStitch(5);}
 if(increase){
  // sleeves.kc: old rear C3 loop seeds new front; each yarn then knits ONE empty rear needle.
  sim.setRacking(1);sim.xferBatch([{from:b(hi),to:f(hi+1)}]);sim.setRacking(0);hi++;
 }
 if(decrease){
  // Established reversible diamond baseline: one cross-bed edge merge per transfer pass.
  sim.setRacking(1);sim.xferBatch([{from:f(hi),to:b(hi-1)}]);
  sim.setRacking(-1);sim.xferBatch([{from:b(hi),to:f(hi-1)}]);sim.setRacking(0);hi--;
 }
 sim.setSpeed(r===0?100:200);sim.setStitch(7);sim.setRoller(r===0?100:450);
 const front:CarrierId[]=Array.from({length:hi-lo+1},(_,i)=> motif?.cells[r][i]?'3':'4');
 front[0]=r%2===0?'3':'4'; // Alternate face ownership to close the fixed left edge.
 // Right edge: swap between increases, but restore solid C4-front/C3-rear BEFORE each borrow.
 front[front.length-1]=r<decStart?(r%3===1?'3':'4'):(r%2===0?'3':'4');
 if(increase)front[front.length-2]='3'; // Old column swaps; prevents two adjacent empty C3 needles.
 for(const c of ['3','4'] as CarrierId[]){
  const dir:Direction=c==='3'?nextDir:(nextDir==='+'?'-':'+');
  const needles=Array.from({length:hi-lo+1},(_,i)=>lo+i);if(dir==='-')needles.reverse();
  for(const n of needles)sim.knit(c,dir,front[n-lo]===c?f(n):b(n));
 }
 rows.push({row:r+1,width:hi-lo+1,event,direction:nextDir,front});
 nextDir=nextDir==='+'?'-':'+';drain();
}
assert.equal(hi,initialHi);ops.push(comment('TRIAL BODY END'));sim.setSourceRows(undefined);
// Retain both beds under eight tubular waste courses, then release. Not a bind-off experiment.
sim.setSpeed(200);sim.setStitch(7);sim.setRoller(450);
for(let r=0;r<8;r++){
 for(let n=lo;n<=hi;n++)sim.knit('6','+',f(n));
 for(let n=hi;n>=lo;n--)sim.knit('6','-',b(n));
}
sim.setSpeed(150);sim.setStitch(4);
for(let n=lo;n<=hi;n++)sim.drop(f(n));for(let n=hi;n>=lo;n--)sim.drop(b(n));
sim.setRoller(0);for(const c of ['1','3','4','6'] as CarrierId[])sim.out(c);drain();
const program:KnitoutProgram={version:2,carriers:[...ALL_CARRIERS],machine:'kniterate',gauge:7,position:'Keep',yarns:{'3':'Orange single 2/14 acrylic','4':'Grey single 2/14 acrylic'},kniterate:{xferStyle:'four-pass'},ops};
const source=writeKnitoutProgram(program),compiled=knitoutToKCodeWithTrace(source,'program.k');assert(compiled.ok,JSON.stringify(compiled));
fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'program.k'),source);fs.writeFileSync(path.join(out,'program.kc'),compiled.kcode);
fs.writeFileSync(path.join(out,'plan.json'),JSON.stringify({needleStart:lo,motif:mixed?'mixed-paisley':originalSmall?'original-small':paisley?'paisley':'solid',rows},null,2)+'\n');
console.log(JSON.stringify({output:out,sha256:createHash('sha256').update(compiled.kcode).digest('hex'),bytes:Buffer.byteLength(compiled.kcode),rows:rows.length},null,2));
