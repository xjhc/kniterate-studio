import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const trialPath = resolve('out/v1-knit-trial/manifest.json');
if (!existsSync(trialPath)) throw new Error('physical trial is missing; run pnpm release:trial first');
const trial = JSON.parse(readFileSync(trialPath, 'utf8')) as {
  identity: { compileHash: string; kcodeSha256: string };
  compilerFingerprint: string;
};
const registry = JSON.parse(readFileSync('packages/machine-lib/registry/knit-proven.json', 'utf8')) as {
  compilerFingerprint: string;
  entries: { id: string; sourceFingerprint: string; kcodeSha256: string; compilerFingerprint: string }[];
};
const match = registry.entries.find((entry) =>
  entry.compilerFingerprint === registry.compilerFingerprint
  && entry.compilerFingerprint === trial.compilerFingerprint
  && entry.sourceFingerprint === trial.identity.compileHash
  && entry.kcodeSha256 === trial.identity.kcodeSha256,
);
if (!match) {
  process.stderr.write('v1 physical release gate: BLOCKED\nNo current clean registry entry exactly matches the generated blanket.kc.\n');
  process.exit(2);
}
process.stdout.write(`v1 physical release gate: PASS (${match.id})\n`);
