import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';

const shortName = process.argv.slice(2).find((argument) => argument !== '--');
if (!shortName || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(shortName)) {
  throw new Error('usage: pnpm release:register -- <short-kebab-name>');
}

const trial = resolve('out/v1-knit-trial');
const manifestPath = resolve(trial, 'manifest.json');
if (!existsSync(manifestPath)) throw new Error('physical trial is missing; run pnpm release:trial first');
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
  title: string;
  profile: string;
  chart: { width: number; height: number; palette: { id: string; name: string; hex: string }[] };
  machine: { needleStart: number; needleEnd: number; settings: { gauge: number; stitchNumber: number; xferStitchNumber: number; speedNumber: number; rollerAdvance: number } };
  frame: { wasteRows: number; bindOff: string };
  strategy: { technique: string };
  identity: { compileHash: string; knitoutSha256: string; kcodeSha256: string };
  compilerFingerprint: string;
  carriers: { carrier: string; role: string; paletteId?: string; yarnName?: string }[];
};
const date = new Date().toISOString().slice(0, 10);
const id = `${date}-${shortName}`;
const registryRoot = resolve(process.env.KNITERATE_SWATCH_ROOT ?? 'packages/machine-lib/registry/swatches');
const templateRoot = resolve('packages/machine-lib/registry/swatches/_template');
const destination = resolve(registryRoot, id);
if (existsSync(destination)) throw new Error(`registry entry already exists: ${destination}`);
mkdirSync(destination, { recursive: true });
copyFileSync(resolve(templateRoot, 'outcome.md'), resolve(destination, 'outcome.md'));
for (const [source, target] of [
  ['blanket.k', 'out.k'],
  ['blanket.kc', 'out.kc'],
  ['project.kniterate-studio.json', 'project.kniterate-studio.json'],
  ['chart.colorwork.json', 'chart.colorwork.json'],
] as const) copyFileSync(resolve(trial, source), resolve(destination, target));

const emitterCommit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const version = (JSON.parse(readFileSync('package.json', 'utf8')) as { version: string }).version;
const spec = {
  $schema: '../_schema.json',
  kind: 'colorwork-blanket',
  sourceFingerprint: manifest.identity.compileHash,
  compilerFingerprint: manifest.compilerFingerprint,
  knitoutSha256: manifest.identity.knitoutSha256,
  kcodeSha256: manifest.identity.kcodeSha256,
  emitterCommit,
  compiledAt: new Date().toISOString(),
  studioVersion: version,
  compileResultOk: true,
  request: { path: 'request.json', reemitCommand: 'pnpm release:trial' },
  reemitCheck: {
    status: 'not-run', checkedAt: null, currentCommit: null,
    notes: 'After the machine run, regenerate the trial and set status to matches only if out.k and out.kc remain byte-identical.',
  },
  compileMessages: [],
  planSummary: {
    technique: manifest.strategy.technique,
    needleStart: manifest.machine.needleStart,
    needleEnd: manifest.machine.needleEnd,
    rows: manifest.chart.height,
    wastePasses: manifest.frame.wasteRows,
    bindOff: manifest.frame.bindOff,
    profile: manifest.profile,
  },
  notes: 'V1 representative four-color rectangular blanket release trial.',
};
const request = {
  $schema: '../_schema.json',
  kind: 'kniterate-studio-project',
  description: manifest.title,
  reemitCommand: 'pnpm release:trial',
  inputFiles: ['project.kniterate-studio.json', 'chart.colorwork.json'],
};
const yarns = manifest.carriers.map((carrier) => {
  const color = manifest.chart.palette.find((entry) => entry.id === carrier.paletteId);
  return {
    carrier: carrier.carrier,
    role: carrier.role,
    name: carrier.yarnName ?? `TODO: ${carrier.role}`,
    fiber: 'TODO: wool | cotton | alpaca | acrylic | blend',
    weight: 'TODO: e.g. 2/12 Nm',
    ply: null,
    color: color?.hex ?? 'TODO: color',
    coneSource: 'TODO: vendor + lot or batch id',
  };
});
const machine = {
  $schema: '../_schema.json',
  ranAt: '1970-01-01T00:00:00Z',
  machineSerial: 'TODO: machine serial or descriptive id',
  ...manifest.machine.settings,
  position: 'Center',
  wastePasses: manifest.frame.wasteRows,
  carriers: Object.fromEntries(manifest.carriers.map((carrier, index) => [carrier.carrier, { role: carrier.role, yarnEntry: `yarn.json#yarns[${index}]` }])),
  deviationsFromCompile: [],
};
const yarn = {
  $schema: '../_schema.json',
  yarns,
  tensionSwatch: {
    stsPer10cm: { offMachine: null, rested24h: null, steamed: null, wetFinished: null },
    rowsPer10cm: { offMachine: null, rested24h: null, steamed: null, wetFinished: null },
    measuredBy: 'TODO: who measured', measuredOn: '1970-01-01', notes: 'TODO: drape, hand, and weight observations',
  },
};
writeFileSync(resolve(destination, 'spec.json'), `${JSON.stringify(spec, null, 2)}\n`);
writeFileSync(resolve(destination, 'request.json'), `${JSON.stringify(request, null, 2)}\n`);
writeFileSync(resolve(destination, 'machine.json'), `${JSON.stringify(machine, null, 2)}\n`);
writeFileSync(resolve(destination, 'yarn.json'), `${JSON.stringify(yarn, null, 2)}\n`);
process.stdout.write(`physical registry entry scaffolded: ${basename(destination)}\nComplete machine.json, yarn.json, outcome.md, and the reemit check after the run.\n`);
