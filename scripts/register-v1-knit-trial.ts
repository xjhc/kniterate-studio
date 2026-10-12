import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { basename, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { readCleanV1KnitTrialReleaseSource } from './build-v1-knit-trial.js';
import type { AuthoredKCodeCoordinateBridgeV1 } from '../packages/machine-lib/src/knitout/kcode/coordinate-bridge.js';
import { compileRegistryRequestCurrent, computeCompilerFingerprint } from '../packages/machine-lib/scripts/registry-support.js';
import { materializeColorworkProject, parseColorworkProjectV1 } from '../packages/project-contract/src/index.js';

const GIT_COMMIT = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/;

/** `<short-name> [--package <dir>]`, in either order; without `--package` the fixed V1 rectangle trial is registered. */
export function parseRegisterArguments(argv: readonly string[]): { shortName: string; packageDirectory: string | undefined } {
  const args = argv.filter((argument) => argument !== '--');
  const packageAt = args.indexOf('--package');
  const packageDirectory = packageAt >= 0 ? args[packageAt + 1] : undefined;
  if (packageAt >= 0 && (packageDirectory === undefined || packageDirectory.startsWith('--'))) throw new Error('--package needs a handoff package directory (pnpm studio -- package)');
  const shortName = args.find((argument, index) => !argument.startsWith('--') && !(packageAt >= 0 && index === packageAt + 1));
  if (!shortName || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(shortName)) {
    throw new Error('usage: pnpm release:register -- <short-kebab-name> [--package <handoff-package-dir>]');
  }
  return { shortName, packageDirectory };
}

const COORDINATE_SYSTEM = 'compiler/project coordinates mapped to exact KCode/trace coordinates; physical needle labels unverified';

/** What a registry entry is made from: the fixed V1 rectangle trial, or a Studio handoff package. */
interface EntrySource {
  title: string;
  profile: string;
  specKind: 'colorwork-blanket' | 'kniterate-studio-project';
  compileHash: string;
  compilerFingerprint: string;
  knitoutSha256: string;
  kcodeSha256: string;
  emitterCommit: string;
  machine: {
    coordinateSystem: string;
    compilerCoordinateStart: number;
    compilerCoordinateEnd: number;
    coordinateBridge: AuthoredKCodeCoordinateBridgeV1;
    program: { gauge: number; position: string; wastePasses: number; bindOff: string; initialSettings: Record<string, number | string> & { stitchNumber: number; xferStitchNumber: number; speedNumber: number; rollerAdvance: number; xferStyle: string; carrierSpacing: number; carrierStoppingDistance: number } };
  };
  wastePasses: number;
  bindOff: string;
  technique: string;
  rows: number;
  carriers: { carrier: string; role: string; yarnName?: string; hex?: string }[];
  /** [file in the source directory, name in the entry]. */
  files: (readonly [string, string])[];
  sourceDirectory: string;
  inputFiles: string[];
  reemitCommand: string;
  notes: string;
}

const sha256 = (bytes: string | Uint8Array) => createHash('sha256').update(bytes).digest('hex');

function packageSource(directory: string): EntrySource {
  const root = resolve(directory);
  const manifest = JSON.parse(readFileSync(resolve(root, 'manifest.json'), 'utf8')) as { kind?: string; title: string; identity: { kcodeSha256: string }; files: Record<string, string> };
  if (manifest.kind !== 'kniterate-studio-handoff') throw new Error(`${root}/manifest.json is not a Studio handoff package manifest`);
  for (const [name, hash] of Object.entries(manifest.files)) {
    if (sha256(readFileSync(resolve(root, name))) !== hash) throw new Error(`package file ${name} does not match its manifest hash; the package was changed after it was made`);
  }
  const release = readCleanV1KnitTrialReleaseSource();
  // Recompile the project in-process: the entry trusts only bytes this checkout re-emits.
  const current = compileRegistryRequestCurrent(root, { kind: 'kniterate-studio-project', inputFiles: ['project.kniterate-studio.json'] });
  if (!current.ok || current.kcodeText === null || current.knitoutText === null || current.expectedMachine === null || current.sourceFingerprint === null) {
    throw new Error(`the package's project does not compile at ${release.commit}: ${current.messages.join('; ')}`);
  }
  const kcode = readFileSync(resolve(root, 'program.kc'), 'utf8');
  if (current.kcodeText !== kcode || current.kcodeSha256 !== manifest.identity.kcodeSha256) {
    throw new Error(`this checkout (${release.commit}) does not re-emit the packaged program.kc byte for byte (packaged ${manifest.identity.kcodeSha256}, re-emitted ${current.kcodeSha256}); register from the commit that made the package`);
  }
  if (current.knitoutText !== readFileSync(resolve(root, 'program.k'), 'utf8')) throw new Error('this checkout does not re-emit the packaged program.k byte for byte');
  const project = JSON.parse(readFileSync(resolve(root, 'project.kniterate-studio.json'), 'utf8')) as Parameters<typeof parseColorworkProjectV1>[0];
  const { state } = materializeColorworkProject(parseColorworkProjectV1(project));
  const machine = current.expectedMachine;
  return {
    title: manifest.title,
    profile: machine.profile,
    specKind: 'kniterate-studio-project',
    compileHash: current.sourceFingerprint,
    compilerFingerprint: computeCompilerFingerprint(),
    knitoutSha256: current.knitoutSha256!,
    kcodeSha256: current.kcodeSha256!,
    emitterCommit: release.commit,
    machine: {
      coordinateSystem: COORDINATE_SYSTEM,
      compilerCoordinateStart: machine.compilerCoordinates.start,
      compilerCoordinateEnd: machine.compilerCoordinates.end,
      coordinateBridge: machine.coordinateBridge,
      program: machine.program,
    },
    wastePasses: machine.program.wastePasses,
    bindOff: machine.program.bindOff,
    technique: state.strategy.technique,
    rows: state.chart.height,
    carriers: machine.carriers.map((carrier) => {
      const assignment = state.machine.yarnAssignments.find((item) => item.carrier === carrier.carrier);
      return { carrier: carrier.carrier, role: carrier.role, ...(assignment ? { yarnName: assignment.yarnName, hex: state.chart.palette.find((entry) => entry.id === assignment.paletteId)?.hex } : {}) };
    }),
    files: [['program.k', 'out.k'], ['program.kc', 'out.kc'], ['project.kniterate-studio.json', 'project.kniterate-studio.json']],
    sourceDirectory: root,
    inputFiles: ['project.kniterate-studio.json'],
    reemitCommand: 'pnpm studio -- package project.kniterate-studio.json -o <directory>',
    notes: `Development run of a Studio handoff package (${manifest.title}); not a 1.0.0 qualification artifact.`,
  };
}

function rectangleSource(): EntrySource {
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
  frame: { wastePasses: number; bindOff: string };
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
return {
  title: manifest.title,
  profile: manifest.profile,
  specKind: 'colorwork-blanket',
  compileHash: manifest.identity.compileHash,
  compilerFingerprint: manifest.compilerFingerprint,
  knitoutSha256: manifest.identity.knitoutSha256,
  kcodeSha256: manifest.identity.kcodeSha256,
  emitterCommit: manifest.releaseSource.commit,
  machine: manifest.machine,
  wastePasses: manifest.frame.wastePasses,
  bindOff: manifest.frame.bindOff,
  technique: manifest.strategy.technique,
  rows: manifest.chart.height,
  carriers: manifest.carriers.map((carrier) => ({
    carrier: carrier.carrier,
    role: carrier.role,
    ...(carrier.yarnName ? { yarnName: carrier.yarnName } : {}),
    ...(manifest.chart.palette.find((entry) => entry.id === carrier.paletteId) ? { hex: manifest.chart.palette.find((entry) => entry.id === carrier.paletteId)!.hex } : {}),
  })),
  files: [['blanket.k', 'out.k'], ['blanket.kc', 'out.kc'], ['project.kniterate-studio.json', 'project.kniterate-studio.json'], ['chart.colorwork.json', 'chart.colorwork.json']],
  sourceDirectory: trial,
  inputFiles: ['project.kniterate-studio.json', 'chart.colorwork.json'],
  reemitCommand: 'pnpm release:trial',
  notes: 'V1 release trial reproducing the captured Customist fairisle.kc program.',
};
}

function main(): void {
  const { shortName, packageDirectory } = parseRegisterArguments(process.argv.slice(2));
  const source = packageDirectory === undefined ? rectangleSource() : packageSource(packageDirectory);
  const date = new Date().toISOString().slice(0, 10);
  const id = `${date}-${shortName}`;
  const registryRoot = resolve(process.env.KNITERATE_SWATCH_ROOT ?? 'packages/machine-lib/registry/swatches');
  const templateRoot = resolve('packages/machine-lib/registry/swatches/_template');
  const destination = resolve(registryRoot, id);
  if (existsSync(destination)) throw new Error(`registry entry already exists: ${destination}`);
  mkdirSync(destination, { recursive: true });
  copyFileSync(resolve(templateRoot, 'outcome.md'), resolve(destination, 'outcome.md'));
  for (const [from, target] of source.files) copyFileSync(resolve(source.sourceDirectory, from), resolve(destination, target));

  const emitterCommit = source.emitterCommit;
  const version = (JSON.parse(readFileSync('package.json', 'utf8')) as { version: string }).version;
  const spec = {
    $schema: '../_schema.json',
    kind: source.specKind,
    sourceFingerprint: source.compileHash,
    compilerFingerprint: source.compilerFingerprint,
    knitoutSha256: source.knitoutSha256,
    kcodeSha256: source.kcodeSha256,
    emitterCommit,
    compiledAt: new Date().toISOString(),
    studioVersion: version,
    compileResultOk: true,
    request: { path: 'request.json', reemitCommand: source.reemitCommand },
    reemitCheck: {
      status: 'not-run', checkedAt: null, currentCommit: null,
      notes: 'Historical operator note only. The registry checker independently recompiles and byte-compares current out.k/out.kc in-process.',
    },
    compileMessages: [],
    planSummary: {
      technique: source.technique,
      coordinateSystem: source.machine.coordinateSystem,
      compilerCoordinateStart: source.machine.compilerCoordinateStart,
      compilerCoordinateEnd: source.machine.compilerCoordinateEnd,
      rows: source.rows,
      wastePasses: source.wastePasses,
      bindOff: source.bindOff,
      profile: source.profile,
    },
    notes: source.notes,
  };
  const request = {
    $schema: '../_schema.json',
    kind: 'kniterate-studio-project',
    description: source.title,
    reemitCommand: source.reemitCommand,
    inputFiles: source.inputFiles,
  };
  const yarns = source.carriers.map((carrier) => {
    const color = carrier.hex === undefined ? undefined : { hex: carrier.hex };
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
    profile: source.profile,
    program: {
      compilerCoordinateStart: source.machine.compilerCoordinateStart,
      compilerCoordinateEnd: source.machine.compilerCoordinateEnd,
      coordinateBridge: source.machine.coordinateBridge,
      ...source.machine.program,
    },
    carriers: Object.fromEntries(source.carriers.map((carrier, index) => [carrier.carrier, { role: carrier.role, yarnEntry: `yarn.json#yarns[${index}]` }])),
    deviationsFromCompile: [],
  };
  const yarn = {
    $schema: '../_schema.json',
    kind: 'kniterate-yarn-evidence-v1',
    schemaVersion: 1,
    yarns,
    tensionSwatch: {
      machineProfile: source.profile,
      structure: 'TODO: tension-swatch structure',
      settings: source.machine.program.initialSettings,
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
      compilerCoordinateStart: source.machine.compilerCoordinateStart,
      compilerCoordinateEnd: source.machine.compilerCoordinateEnd,
      physicalNeedleStart: null,
      physicalNeedleEnd: null,
      orientation: null,
      method: 'TODO: documented machine/vendor datum procedure used',
      verifiedBy: 'TODO: independent verifier',
      verifiedAt: null,
    },
    artifact: {
      loadedKcodeSha256: source.kcodeSha256,
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
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : null;
if (invokedPath === import.meta.url) main();
