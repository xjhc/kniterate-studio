/** Scoped rebuild of partner's hash-pinned edge experiment. Production emitters unchanged. */
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {parseKnitoutProgram} from '../../packages/machine-lib/src/knitout/parser.js';
import {writeKnitoutProgram} from '../../packages/machine-lib/src/knitout/emitter.js';
import {knitoutToKCodeWithTrace} from '../../packages/machine-lib/src/knitout/kniterate/to-kcode.js';
import {withEdgeTrialCastOn} from './edge-trial-caston.js';
const original=fs.readFileSync('fixtures/experiments/edge-swatch-original.k','utf8');
assert.equal(createHash('sha256').update(original).digest('hex'),'890992f60693ddb23e9baddf9fb9167ef72a248f6ea399f8f33aa841168a341a');
const parsed=parseKnitoutProgram(original);assert.equal(parsed.issues.length,0);
const program=withEdgeTrialCastOn(parsed.program,107,146,105);
const output=process.argv[2]??'../edge-full-caston-swatch';fs.mkdirSync(output,{recursive:true});
const text=writeKnitoutProgram(program);const compiled=knitoutToKCodeWithTrace(text,'program.k');assert(compiled.ok,JSON.stringify(compiled));
fs.writeFileSync(path.join(output,'program.k'),text);fs.writeFileSync(path.join(output,'program.kc'),compiled.kcode);
console.log(JSON.stringify({output,sha256:createHash('sha256').update(compiled.kcode).digest('hex'),bytes:Buffer.byteLength(compiled.kcode)},null,2));
