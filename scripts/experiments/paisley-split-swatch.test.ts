import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildPaisleySplit } from './paisley-split-swatch.js';
import { verifyPaisleySplit } from './verify-paisley-split.js';
import { knitoutToKCodeWithTrace } from '../../packages/machine-lib/src/knitout/kniterate/to-kcode.js';
const built=buildPaisleySplit();
function mutated(source:string){assert.notEqual(source,built.source);const compiled=knitoutToKCodeWithTrace(source,'program.k');assert(compiled.ok);return {...built,source,compiled};}
test('serialized loops, supported splits, decreases, motif and yarn-path joins',()=>{const r=verifyPaisleySplit(built);assert.equal(r.increases,13);assert.equal(r.decreases,13);});
test('historical silhouette and every interior cell match issued paisley',()=>{
 const old=JSON.parse(fs.readFileSync('docs/physical-trials/2026-11-12/reversible-mixed-paisley-spaced/plan.json','utf8'));
 for(const row of built.rows){const previous=old.rows[row.row-1];assert.equal(row.width,previous.width);for(let x=1;x<row.width-2;x++)assert.equal(row.front[x],previous.front[x]);}
});
test('reject unsupported rear loop caused by replacing first split with knit',()=>{
 const source=built.source.replace(/^split \+ f(\d+) b\1 ([34])$/m,'knit + f$1 $2');const candidate=mutated(source);assert.throws(()=>verifyPaisleySplit(candidate));
});
test('reject extra take-down after split when colourwork creates a separate pass',()=>{
 const source=built.source.replace(/(split - f\d+ b\d+ [34]\nx-roller-advance )0/,(_,prefix)=>prefix+'450');const candidate=mutated(source);assert.throws(()=>verifyPaisleySplit(candidate));
});
test('reject lost fixed-side joins even with valid per-row loop counts',()=>{
 const source=built.source.replace(/^(knit [+-]) ([fb])119 ([34])$/gm,(_,op,bed,c)=>`${op} ${c==='3'?'f':'b'}119 ${c}`);
 const candidate=mutated(source);assert.throws(()=>verifyPaisleySplit(candidate));
});
// Grey variant: one change from the knitted 514-pass file. C4 makes every split, which needs
// increases two then four rows apart; the start, the decreases and the artwork stay as knitted.
const grey=buildPaisleySplit('grey');
test('grey variant: C4 makes every split and the serialized checks pass',()=>{
 const r=verifyPaisleySplit(grey);assert.equal(r.increases,13);assert.equal(r.decreases,13);
 const splits=[...grey.source.matchAll(/^split [+-] f\d+ b\d+ ([34])$/gm)].map(m=>m[1]);
 assert.equal(splits.length,26);assert(splits.every(c=>c==='4'));
 assert(/^split [+-] f\d+ b\d+ 3$/m.test(built.source),'The knitted alternating file does split with C3');
});
test('grey variant: an increase puts one orange stitch on the grey face, in the outer column of its second row',()=>{
 for(const row of grey.rows){
  if(row.kind==='growth')assert.deepEqual(row.front.slice(-2),['4','4']);
  if(row.kind==='completion')assert.deepEqual(row.front.slice(-2),['4','3']);
 }
 assert(built.rows.some(row=>row.kind==='growth'&&row.front.slice(-2).join('')==='33'),'The knitted alternating file has orange increase rows');
});
test('grey variant: artwork, start and decrease half are those of the knitted file',()=>{
 for(const row of grey.rows){const previous=built.rows[row.row-1];assert(row.width===previous.width||row.width===previous.width+1);for(let x=1;x<previous.width-2;x++)assert.equal(row.front[x],previous.front[x]);if(row.row>42)assert.deepEqual(row,previous);}
 const body=(s:string)=>s.slice(s.indexOf('; PAISLEY ROW 43 '));
 assert.equal(body(grey.source),body(built.source));
 assert.equal(grey.source.slice(0,grey.source.indexOf('; PAISLEY ROW 6 ')),built.source.slice(0,built.source.indexOf('; PAISLEY ROW 6 ')));
});
// Open variant: the hedge. The grey variant with the widening edge left unjoined for linking.
const open=buildPaisleySplit('open');
test('open variant: the widening edge is unjoined and both edge columns of the grey face are grey',()=>{
 const r=verifyPaisleySplit(open);assert.equal(r.increases,13);assert.equal(r.decreases,13);
 assert.deepEqual(r.joins.right.filter(row=>row<=42),[]);
 assert(verifyPaisleySplit(grey).joins.right.some(row=>row<=42),'The joined variant does cross yarns at this edge');
 for(const row of open.rows)if(row.row<=42)assert.deepEqual(row.front.slice(-2),['4','4']);
 const splits=[...open.source.matchAll(/^split [+-] f\d+ b\d+ ([34])$/gm)].map(m=>m[1]);
 assert.equal(splits.length,26);assert(splits.every(c=>c==='4'));
});
test('open variant: the second split has a knitted needle outside it and there is no outer-join pass',()=>{
 assert(!open.source.includes(' outer-join'));assert(grey.source.includes(' outer-join'));
 const second=[...open.source.matchAll(/^knit - f(\d+) 4\nsplit - f(\d+) b\d+ 4$/gm)];
 assert.equal(second.length,13);for(const m of second)assert.equal(+m[1],+m[2]+1);
});
test('open variant: widths, artwork and the narrowing half are those of the grey variant',()=>{
 for(const row of open.rows){const joined=grey.rows[row.row-1];assert.equal(row.width,joined.width);for(let x=1;x<row.width-2;x++)assert.equal(row.front[x],joined.front[x]);if(row.row>42)assert.deepEqual(row,joined);}
 const tail=(s:string)=>s.slice(s.indexOf('; PAISLEY ROW 43 '));
 assert.equal(tail(open.source),tail(built.source));
});
