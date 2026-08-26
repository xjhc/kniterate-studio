import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createColorworkProjectV1 } from '../packages/project-contract/src/index.js';
import type { ColorworkChartV1 } from '../packages/chart-contract/src/index.js';
import { compileColorworkProject } from '../apps/studio/src/blanket/compileProject.js';
import { inspectKcDocument } from '../packages/machine-lib/src/knitout/kc-document.js';
import { kcToKnitout } from '../packages/machine-lib/src/knitout/kc-to-knitout.js';
import { knitoutToKCodeWithTrace } from '../packages/machine-lib/src/knitout/kniterate/to-kcode.js';
import { validateKnitoutProgram } from '../packages/machine-lib/src/validators/knitout-program.js';
import { computeCompilerFingerprint, sha256Bytes } from '../packages/machine-lib/scripts/registry-support.js';

export const V1_KNIT_TRIAL_DESTINATION = resolve('out/v1-knit-trial');

const GIT_COMMIT = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/;

export interface V1KnitTrialReleaseSource {
  readonly commit: string;
  readonly worktree: 'clean';
}

type ReadGit = (args: readonly string[]) => string;

/** Resolve the exact source commit and refuse release packaging from any dirty
 * tree, including untracked files. Internal compile/check helpers remain pure
 * and bind this evidence only when producing an operator-facing package. */
export function readCleanV1KnitTrialReleaseSource(
  readGit: ReadGit = (args) => execFileSync('git', [...args], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }),
): V1KnitTrialReleaseSource {
  const commit = readGit(['rev-parse', 'HEAD']).trim();
  if (!GIT_COMMIT.test(commit)) throw new Error(`release trial requires a full Git commit identity; received ${JSON.stringify(commit)}`);
  const status = readGit(['status', '--porcelain=v1', '--untracked-files=all']).trimEnd();
  if (status.length > 0) {
    throw new Error(`release trial requires a clean working tree, including no untracked files:\n${status}`);
  }
  return { commit, worktree: 'clean' };
}

const palette = [
  { id: 'natural', name: 'Natural worsted', hex: '#F1EDE3' },
  { id: 'red', name: 'Red worsted', hex: '#B4423A' },
  { id: 'gold', name: 'Gold worsted', hex: '#C99A35' },
  { id: 'navy', name: 'Navy worsted', hex: '#29445F' },
];
const width = 120;
const height = 160;

function trialChart(): ColorworkChartV1 {
  return {
    kind: 'knitlab-colorwork-chart', version: 1, title: 'V1 four-color blanket trial', width, height,
    rowNumbering: 'bottom-up', palette,
    cells: Array.from({ length: height }, (_, row) => Array.from({ length: width }, (_, column) => {
      const border = row < 6 || row >= height - 6 || column < 6 || column >= width - 6;
      if (border) return (Math.floor(row / 2) + Math.floor(column / 2)) % 2;
      return (Math.floor((row - 6) / 8) + Math.floor((column - 6) / 8) + (column % 7 === 0 ? 1 : 0)) % 4;
    })),
  };
}

function firstSetting(knitoutText: string, name: string): number {
  const value = new RegExp(`^${name} ([0-9.]+)$`, 'm').exec(knitoutText)?.[1];
  if (value === undefined) throw new Error(`generated knitout is missing ${name}`);
  return Number(value);
}

function firstTextSetting(knitoutText: string, name: string): string {
  const value = new RegExp(`^${name} (\\S+)$`, 'm').exec(knitoutText)?.[1];
  if (value === undefined) throw new Error(`generated knitout is missing ${name}`);
  return value;
}

export function compileCurrentV1KnitTrial() {
  const chart = trialChart();
  const project = createColorworkProjectV1(chart, { id: 'v1-four-color-blanket-trial', title: chart.title });
  const compiled = compileColorworkProject(project);
  if (!compiled.ok || !compiled.knitoutText || !compiled.inputHash) {
    throw new Error(compiled.messages.map((message) => `${message.severity}: ${message.message}`).join('\n'));
  }
  const converted = knitoutToKCodeWithTrace(compiled.knitoutText, 'command.k');
  if (!converted.ok) throw new Error(converted.error || 'KCode conversion failed');
  const reconstructed = kcToKnitout(converted.kcode);
  const validation = validateKnitoutProgram(reconstructed.program);
  const errors = validation.messages.filter((message) => message.severity === 'error');
  if (errors.length > 0 || Object.keys(reconstructed.stats.unrecognizedTypes).length > 0) {
    throw new Error(`generated KCode failed revalidation: ${errors.map((message) => message.message).join('; ')}`);
  }
  const compilerFingerprint = computeCompilerFingerprint();
  const manifest = {
    kind: 'kniterate-studio-v1-physical-trial', schemaVersion: 1,
    title: project.title, profile: project.base.machine.profile,
    chart: { width, height, colors: palette.length, rowNumbering: chart.rowNumbering, palette },
    machine: {
      coordinateSystem: 'compiler/project coordinates; physical needle labels unverified',
      compilerCoordinateStart: project.base.machine.needleOffset,
      compilerCoordinateEnd: project.base.machine.needleOffset + width - 1,
      program: {
        gauge: 7,
        position: 'Center',
        wastePasses: project.base.frame.wasteRows,
        bindOff: project.base.frame.bindOff,
        initialSettings: {
          stitchNumber: firstSetting(compiled.knitoutText, 'x-stitch-number'),
          xferStitchNumber: firstSetting(compiled.knitoutText, 'x-xfer-stitch-number'),
          speedNumber: firstSetting(compiled.knitoutText, 'x-speed-number'),
          rollerAdvance: firstSetting(compiled.knitoutText, 'x-roller-advance'),
          xferStyle: firstTextSetting(compiled.knitoutText, 'x-xfer-style'),
          carrierSpacing: firstSetting(compiled.knitoutText, 'x-carrier-spacing'),
          carrierStoppingDistance: firstSetting(compiled.knitoutText, 'x-carrier-stopping-distance'),
        },
      },
    },
    carriers: [
      { carrier: '1', role: 'draw' },
      ...project.base.machine.yarnAssignments.map((assignment) => ({ carrier: assignment.carrier, role: 'pattern', paletteId: assignment.paletteId, yarnName: assignment.yarnName })),
      { carrier: '6', role: 'waste' },
    ],
    frame: project.base.frame, strategy: project.base.strategy,
    output: {
      predictedPasses: compiled.stats.passCount,
      emittedPasses: inspectKcDocument(converted.kcode).length,
      operations: compiled.stats.opCount,
      estimatedKnitTimeSeconds: compiled.stats.estimatedKnitTimeSeconds,
    },
    identity: {
      compileHash: compiled.inputHash,
      knitoutSha256: sha256Bytes(compiled.knitoutText),
      kcodeSha256: sha256Bytes(converted.kcode),
    },
    compilerFingerprint,
    softwareVerdict: 'Surface-proven', physicalVerdict: 'Pending machine trial',
    physicalPlacementGate: {
      status: 'unverified',
      requirement: 'Resolve compiler/project coordinates to physical machine needle labels using a documented machine/vendor datum procedure, then record independent operator verification in run.json before sending the job.',
    },
  };
  const operatorChecklist = `# V1 physical blanket trial

1. Knit a profile-matched tension swatch with the exact four yarns and record yarn brand, line, lot, fiber, and measured gauge.
2. Load C1 draw thread, C2-C5 according to manifest.json, and C6 waste yarn.
3. The range ${project.base.machine.needleOffset}-${project.base.machine.needleOffset + width - 1} is expressed only in compiler/project coordinates. It is not a verified physical needle-label range.
4. Before sending the job, resolve that compiler range to physical needle labels using a documented machine/vendor datum procedure. Have an operator independently verify the placement and record the mapping, method, verifier, and time in run.json. Do not run while this gate is unverified.
5. Confirm 20 waste rows, draw thread, and machine bind-off, then open blanket.kc in the Kniterate application and compare its pass count to manifest.json before sending.
6. Watch waste, draw, carrier bring-in, first two body rows, and bind-off. Stop on unexpected carrier position, loop loss, or takedown behavior; record every manual intervention in run.json.
7. Photograph front, back, cast-on, both edges, and bind-off. Record dimensions off-machine and after 24 hours of rest.
8. Copy the completed artifact into packages/machine-lib/registry/swatches only after the structured run evidence, narrative outcome, and exact hashes are recorded.
`;
  return {
    project,
    chart,
    knitoutText: compiled.knitoutText,
    kcodeText: converted.kcode,
    manifest,
    operatorChecklist,
  };
}

export type V1KnitTrialCompileResult = ReturnType<typeof compileCurrentV1KnitTrial>;

export function bindV1KnitTrialReleaseSource(
  result: V1KnitTrialCompileResult,
  releaseSource: V1KnitTrialReleaseSource,
) {
  return {
    ...result,
    manifest: {
      ...result.manifest,
      releaseSource,
    },
  };
}

export type V1KnitTrialReleaseResult = ReturnType<typeof bindV1KnitTrialReleaseSource>;

export function writeV1KnitTrial(
  result: V1KnitTrialReleaseResult,
  destination = V1_KNIT_TRIAL_DESTINATION,
): void {
  rmSync(destination, { recursive: true, force: true });
  mkdirSync(destination, { recursive: true });
  writeFileSync(resolve(destination, 'project.kniterate-studio.json'), `${JSON.stringify(result.project, null, 2)}\n`);
  writeFileSync(resolve(destination, 'chart.colorwork.json'), `${JSON.stringify(result.chart, null, 2)}\n`);
  writeFileSync(resolve(destination, 'blanket.k'), result.knitoutText);
  writeFileSync(resolve(destination, 'blanket.kc'), result.kcodeText);
  writeFileSync(resolve(destination, 'manifest.json'), `${JSON.stringify(result.manifest, null, 2)}\n`);
  writeFileSync(resolve(destination, 'OPERATOR-CHECKLIST.md'), result.operatorChecklist);
}

function main(): void {
  const initialSource = readCleanV1KnitTrialReleaseSource();
  const compiled = compileCurrentV1KnitTrial();
  const releaseSource = readCleanV1KnitTrialReleaseSource();
  if (releaseSource.commit !== initialSource.commit) {
    throw new Error(`release trial source changed during compilation: ${initialSource.commit} -> ${releaseSource.commit}`);
  }
  const result = bindV1KnitTrialReleaseSource(compiled, releaseSource);
  writeV1KnitTrial(result);
  process.stdout.write(`v1 physical trial ready from ${releaseSource.commit}: ${V1_KNIT_TRIAL_DESTINATION}\n${JSON.stringify(result.manifest.output, null, 2)}\n`);
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : null;
if (invokedPath === import.meta.url) main();
