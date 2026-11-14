import assert from 'node:assert/strict';
import fs from 'node:fs';
import {knitoutToKCodeWithTrace} from '../../packages/machine-lib/src/knitout/kniterate/to-kcode.js';
import {parseKCodeDocument,projectKCodeMachineTrace,KNITERATE_7GG_KCODE_PROFILE_V2 as profile} from '../../packages/machine-lib/src/browser.js';
function read(file:string,dialect:'app'|'knitout-vendor') {const p=parseKCodeDocument(fs.readFileSync(file,'utf8'),{profile,dialect,strict:true});assert(p.ok);return projectKCodeMachineTrace(p.document,profile);}
const dir=process.argv[2]??'../edge-full-caston-swatch';
const trial=read(dir+'/program.kc','knitout-vendor');
const ref=read('packages/machine-lib/reference/swatch.kc','app');
const original=knitoutToKCodeWithTrace(fs.readFileSync('fixtures/experiments/edge-swatch-original.k','utf8'),'program.k');assert(original.ok);
const oldParsed=parseKCodeDocument(original.kcode,{profile,dialect:'knitout-vendor',strict:true});assert(oldParsed.ok);
const old=projectKCodeMachineTrace(oldParsed.document,profile);
function normalized(p: typeof trial.passes[number],start:number,width:number,mapCarrier=false) {
 const at=(a:any)=>({bed:a.bed,n:a.traceCoordinate-start,stitch:a.stitchSelector.encodedValue});
 const acts=p.actions.filter(a=>{const s='at' in a?a.at:a.source;return s.traceCoordinate>=start&&s.traceCoordinate<start+width;}).map(a=> 'at' in a?{kind:a.kind,at:at(a.at)}:{kind:a.kind,source:at(a.source),target:at(a.target)}).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));
 return {direction:p.direction,carrier:mapCarrier&&p.carrier==='5'?'3':p.carrier,rack:p.rack,speed:p.speed,roller:p.roller,actions:acts};
}
// Four knitting passes plus the two intervening transfer passes. Scale 80 columns to 40,
// map reference body C5 to trial C3, and normalize placement. Nothing else is ignored.
const matches=[];
for(let i=0;i<6;i++){
 const a=normalized(trial.passes[105+i]!,106,40),b=normalized(ref.passes[97+i]!,86,40,true);
 assert.deepEqual(a,b,`cast-on step ${i+1}`);matches.push({trialPass:106+i,referencePass:98+i,actions:a.actions.length});
}
assert.notDeepEqual(normalized(old.passes[111]!,106,40),normalized(ref.passes[97]!,86,40,true),'Old cast-on must fail reference parity');
for(let i=0;i<141;i++)assert.deepEqual(normalized(trial.passes[111+i]!,0,1000),normalized(old.passes[117+i]!,0,1000),`unchanged body pass ${112+i}`);
const body=trial.passes.slice(110,252);assert(!body.some(p=>['1','6'].includes(p.carrier)));
console.log(JSON.stringify({passed:true,reference:'swatch.kc',normalization:'80→40 columns, placement offset, body carrier C5→C3',matches,oldCastOnRejected:true,unchangedRemainingBodyPasses:141,idleC1C6BodyPasses:0,physicalValidation:false},null,2));
