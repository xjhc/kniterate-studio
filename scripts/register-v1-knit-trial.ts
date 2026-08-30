import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { readCleanV1KnitTrialReleaseSource } from './build-v1-knit-trial.js';
import type { AuthoredKCodeCoordinateBridgeV1 } from '../packages/machine-lib/src/knitout/kcode/coordinate-bridge.js';

const GIT_COMMIT = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/;

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
  machine: {
    coordinateSystem: string;
    compilerCoordinateStart: number;
    compilerCoordinateEnd: number;
    coordinateBridge: AuthoredKCodeCoordinateBridgeV1;
    program: {
      gauge: number;
      position: string;
      wastePasses: number;
      bindOff: string;
      initialSettings: {
        stitchNumber: number;
        xferStitchNumber: number;
        speedNumber: number;
        rollerAdvance: number;
        xferStyle: string;
        carrierSpacing: number;
        carrierStoppingDistance: number;
      };
    };
  };
  frame: { wasteRows: number; bindOff: string };
  strategy: { technique: string };
  identity: { compileHash: string; knitoutSha256: string; kcodeSha256: string };
  compilerFingerprint: string;
  carriers: { carrier: string; role: string; paletteId?: string; yarnName?: string }[];
  releaseSource: { commit: string; worktree: string };
};
if (!manifest.releaseSource
  || !GIT_COMMIT.test(manifest.releaseSource.commit)
  || manifest.releaseSource.worktree !== 'clean') {
  throw new Error('physical trial manifest is not bound to a full clean generating commit; rerun pnpm release:trial from a clean tree');
}
const currentReleaseSource = readCleanV1KnitTrialReleaseSource();
if (currentReleaseSource.commit !== manifest.releaseSource.commit) {
  throw new Error(`physical trial was generated from ${manifest.releaseSource.commit}, but registration is running at ${currentReleaseSource.commit}; return to the generating commit or regenerate and rerun the physical trial`);
}
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

const emitterCommit = manifest.releaseSource.commit;
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
    notes: 'Historical operator note only. The registry checker independently recompiles and byte-compares current out.k/out.kc in-process.',
  },
  compileMessages: [],
  planSummary: {
    technique: manifest.strategy.technique,
    coordinateSystem: manifest.machine.coordinateSystem,
    compilerCoordinateStart: manifest.machine.compilerCoordinateStart,
    compilerCoordinateEnd: manifest.machine.compilerCoordinateEnd,
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
    brand: 'TODO: manufacturer',
    line: 'TODO: yarn line',
    lot: 'TODO: dye lot or batch id',
    weight: 'TODO: e.g. 2/12 Nm',
    ply: null,
    color: color?.hex ?? 'TODO: color',
    coneSource: 'TODO: vendor + lot or batch id',
  };
});
const machine = {
  $schema: '../_schema.json',
  kind: 'kniterate-machine-run-v1',
  schemaVersion: 1,
  ranAt: '1970-01-01T00:00:00Z',
  machineSerial: 'TODO: machine serial or descriptive id',
  controlSoftwareVersion: 'TODO: Kniterate application/control software version',
  profile: manifest.profile,
  program: {
    compilerCoordinateStart: manifest.machine.compilerCoordinateStart,
    compilerCoordinateEnd: manifest.machine.compilerCoordinateEnd,
    coordinateBridge: manifest.machine.coordinateBridge,
    ...manifest.machine.program,
  },
  carriers: Object.fromEntries(manifest.carriers.map((carrier, index) => [carrier.carrier, { role: carrier.role, yarnEntry: `yarn.json#yarns[${index}]` }])),
  deviationsFromCompile: [],
};
const yarn = {
  $schema: '../_schema.json',
  kind: 'kniterate-yarn-evidence-v1',
  schemaVersion: 1,
  yarns,
  tensionSwatch: {
    machineProfile: manifest.profile,
    structure: 'TODO: tension-swatch structure',
    settings: manifest.machine.program.initialSettings,
    measuredBy: 'TODO: who measured',
    measuredOn: '1970-01-01',
    measurements: Object.fromEntries(['offMachine', 'rested24h', 'steamed', 'wetFinished'].map((stage) => [stage, {
      status: 'not-performed',
      reason: 'TODO: measure this stage or explain why it was not performed',
    }])),
    notes: 'TODO: drape, hand, and weight observations',
  },
};
const run = {
  $schema: '../_schema.json',
  kind: 'kniterate-run-observation-v1',
  schemaVersion: 1,
  operator: 'TODO: operator name or stable id',
  startedAt: '1970-01-01T00:00:00Z',
  endedAt: '1970-01-01T00:00:00Z',
  outcome: 'TODO: clean | dropped | jammed | aborted | partial',
  physicalPlacement: {
    verified: false,
    compilerCoordinateStart: manifest.machine.compilerCoordinateStart,
    compilerCoordinateEnd: manifest.machine.compilerCoordinateEnd,
    physicalNeedleStart: null,
    physicalNeedleEnd: null,
    orientation: null,
    method: 'TODO: documented machine/vendor datum procedure used',
    verifiedBy: 'TODO: independent verifier',
    verifiedAt: null,
  },
  artifact: {
    loadedKcodeSha256: manifest.identity.kcodeSha256,
    displayedPassCount: null,
    manualProgramEdits: false,
  },
  manualInterventions: [],
  observations: {
    sections: {
      waste: 'not-reached',
      castOn: 'not-reached',
      drawThread: 'not-reached',
      carrierBringIn: 'not-reached',
      body: 'not-reached',
      backing: 'not-reached',
      leftEdge: 'not-reached',
      rightEdge: 'not-reached',
      bindOff: 'not-reached',
    },
    stops: [],
    dimensionsCm: {
      offMachine: { status: 'not-measured', reason: 'TODO: measure or explain' },
      rested24h: { status: 'not-measured', reason: 'TODO: measure or explain' },
    },
    photos: [],
    notes: '',
  },
};
writeFileSync(resolve(destination, 'spec.json'), `${JSON.stringify(spec, null, 2)}\n`);
writeFileSync(resolve(destination, 'request.json'), `${JSON.stringify(request, null, 2)}\n`);
writeFileSync(resolve(destination, 'machine.json'), `${JSON.stringify(machine, null, 2)}\n`);
writeFileSync(resolve(destination, 'yarn.json'), `${JSON.stringify(yarn, null, 2)}\n`);
writeFileSync(resolve(destination, 'run.json'), `${JSON.stringify(run, null, 2)}\n`);
process.stdout.write(`physical registry entry scaffolded: ${basename(destination)}\nComplete machine.json, yarn.json, run.json, and outcome.md after the run.\n`);
