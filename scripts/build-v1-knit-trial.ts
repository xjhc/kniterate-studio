import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createColorworkProjectV1 } from '../packages/project-contract/src/index.js';
import type { ColorworkChartV1 } from '../packages/chart-contract/src/index.js';
import { compileColorworkProject } from '../apps/studio/src/blanket/compileProject.js';
import { inspectKcDocument } from '../packages/machine-lib/src/knitout/kc-document.js';
import { kcToKnitout } from '../packages/machine-lib/src/knitout/kc-to-knitout.js';
import { knitoutToKCodeWithTrace } from '../packages/machine-lib/src/knitout/kniterate/to-kcode.js';
import { KNITERATE_7GG_KCODE_PROFILE_V2 } from '../packages/machine-lib/src/knitout/kcode/machine-profile.js';
import { createAuthoredKCodeCoordinateBridgeV1 } from '../packages/machine-lib/src/knitout/kcode/coordinate-bridge.js';
import { projectKCodeMachineTrace } from '../packages/machine-lib/src/knitout/kcode/machine-trace.js';
import { validateKCodeMachineTrace } from '../packages/machine-lib/src/knitout/kcode/machine-validator.js';
import { parseKCodeDocument } from '../packages/machine-lib/src/knitout/kcode/parser.js';
import { compareScheduledPassesToMachineTrace } from '../packages/machine-lib/src/knitout/kcode/scheduled-trace-diff.js';
import { validateKnitoutProgram } from '../packages/machine-lib/src/validators/knitout-program.js';
import { computeCompilerFingerprint, sha256Bytes } from '../packages/machine-lib/scripts/registry-support.js';

export const V1_KNIT_TRIAL_DESTINATION = resolve('out/v1-knit-trial');

const GIT_COMMIT = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/;

export interface V1KnitTrialReleaseSource {
  readonly commit: string;
  readonly worktree: 'clean';
}

export interface V1KCodeProofReceipt {
  readonly path: 'packages/machine-lib/out/kcode-proof/proof-manifest.json';
  readonly sha256: string;
  readonly verdict: 'software-proven';
  readonly profileSha256: string;
  readonly contractSha256: string;
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
  const parsedKCode = parseKCodeDocument(converted.kcode, {
    profile: KNITERATE_7GG_KCODE_PROFILE_V2,
    dialect: KNITERATE_7GG_KCODE_PROFILE_V2.dialect,
    strict: true,
    resourceProfile: 'authored-v1',
  });
  if (!parsedKCode.ok) {
    throw new Error(`generated KCode failed strict command parsing: ${parsedKCode.diagnostics.map((diagnostic) => `${diagnostic.rule}: ${diagnostic.message}`).join('; ')}`);
  }
  const machineTrace = projectKCodeMachineTrace(parsedKCode.document, KNITERATE_7GG_KCODE_PROFILE_V2);
  const scheduledTraceComparison = compareScheduledPassesToMachineTrace(
    converted.scheduledPasses,
    machineTrace,
  );
  if (!scheduledTraceComparison.ok) {
    throw new Error(`generated KCode differs from its scheduled machine fields: ${scheduledTraceComparison.mismatches.map((mismatch) => mismatch.message).join('; ')}`);
  }
  const machineValidation = validateKCodeMachineTrace(machineTrace, KNITERATE_7GG_KCODE_PROFILE_V2);
  if (!machineValidation.ok || machineValidation.profileConformance !== 'conformant') {
    throw new Error(`generated KCode failed command-legality validation: ${machineValidation.diagnostics.map((diagnostic) => `${diagnostic.rule}: ${diagnostic.message}`).join('; ')}`);
  }
  const reconstructed = kcToKnitout(converted.kcode);
  const validation = validateKnitoutProgram(reconstructed.program);
  const errors = validation.messages.filter((message) => message.severity === 'error');
  if (errors.length > 0 || Object.keys(reconstructed.stats.unrecognizedTypes).length > 0) {
    throw new Error(`generated KCode failed revalidation: ${errors.map((message) => message.message).join('; ')}`);
  }
  const compilerFingerprint = computeCompilerFingerprint();
  const compilerCoordinateStart = project.base.machine.needleOffset;
  const compilerCoordinateEnd = project.base.machine.needleOffset + width - 1;
  const coordinateBridge = createAuthoredKCodeCoordinateBridgeV1({
    artifactKcodeSha256: sha256Bytes(converted.kcode),
    compilerCoordinateStart,
    compilerCoordinateEnd,
    lowering: converted.coordinateMapping,
    trace: machineTrace,
    scheduledTraceComparison,
    profile: KNITERATE_7GG_KCODE_PROFILE_V2,
  });
  const combinations = [...new Map(machineTrace.passes.map((pass) => {
    const combination = {
      operation: pass.operation,
      direction: pass.direction,
      carrier: pass.carrier,
      rack: pass.rack,
    };
    return [`${combination.operation}|${combination.direction}|${combination.carrier}|${combination.rack}`, combination] as const;
  })).values()].sort((a, b) =>
    a.operation.localeCompare(b.operation)
    || a.direction.localeCompare(b.direction)
    || a.carrier.localeCompare(b.carrier)
    || a.rack - b.rack);
  const commandLegality = {
    kind: 'kniterate-studio-command-legality-evidence',
    schemaVersion: 1,
    profile: {
      id: KNITERATE_7GG_KCODE_PROFILE_V2.profileId,
      version: KNITERATE_7GG_KCODE_PROFILE_V2.profileVersion,
      sha256: sha256Bytes(JSON.stringify(KNITERATE_7GG_KCODE_PROFILE_V2)),
    },
    contractSha256: sha256Bytes(JSON.stringify(KNITERATE_7GG_KCODE_PROFILE_V2.operations)),
    artifact: {
      kcodeSha256: sha256Bytes(converted.kcode),
      passes: machineTrace.passes.length,
      profileConformance: machineValidation.profileConformance,
      modeledState: machineValidation.modeledState,
      operationalPolicy: machineValidation.operationalPolicy,
      controllerAcceptance: machineValidation.controllerAcceptance,
      scheduledTraceComparison,
    },
    coverage: {
      operations: [...new Set(machineTrace.passes.map((pass) => pass.operation))].sort(),
      directions: [...new Set(machineTrace.passes.map((pass) => pass.direction))].sort(),
      carriers: [...new Set(machineTrace.passes.map((pass) => pass.carrier))].sort(),
      racks: [...new Set(machineTrace.passes.map((pass) => pass.rack))].sort((a, b) => a - b),
      combinations,
    },
    controllerObserved: 'pending',
    limitations: [
      'Software validation establishes profile conformance, not controller acceptance.',
      'Transfer profile conformance covers serialized logical commands only; controller-observed physical direction remains unresolved.',
      'Physical needle numbering, carrier lifecycle, and operational setting safety remain outside this claim.',
    ],
  } as const;
  const manifest = {
    kind: 'kniterate-studio-v1-physical-trial', schemaVersion: 1,
    title: project.title, profile: project.base.machine.profile,
    chart: { width, height, colors: palette.length, rowNumbering: chart.rowNumbering, palette },
    machine: {
      coordinateSystem: 'compiler/project coordinates mapped to exact KCode/trace coordinates; physical needle labels unverified',
      compilerCoordinateStart,
      compilerCoordinateEnd,
      coordinateBridge,
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
      requirement: 'Use the hash-bound coordinate bridge and a documented machine/vendor datum procedure to resolve both mapped trace endpoints to physical machine needle labels, then record orientation and independent operator verification in run.json before sending the job.',
    },
  };
  const operatorChecklist = `# V1 physical blanket trial

1. Knit a profile-matched tension swatch with the exact four yarns and record yarn brand, line, lot, fiber, and measured gauge.
2. Load C1 draw thread, C2-C5 according to manifest.json, and C6 waste yarn.
3. The compiler/project range ${compilerCoordinateStart}-${compilerCoordinateEnd} maps through the exact hash-bound lowering receipt to KCode columns ${coordinateBridge.kcodeColumn.start}-${coordinateBridge.kcodeColumn.end} and normalized trace coordinates ${coordinateBridge.traceCoordinate.start}-${coordinateBridge.traceCoordinate.end}. None of those values is yet a verified physical needle label.
4. Before sending the job, resolve both trace endpoints to physical needle labels using a documented machine/vendor datum procedure. Record increasing or decreasing physical-label orientation, and have a different person independently verify the endpoints, method, exact artifact hash, and time in run.json. Do not run while this gate is unverified.
5. Confirm 20 waste rows, draw thread, and machine bind-off. Per Kniterate's [start-up guide](https://support.kniterate.com/hc/en-us/articles/18230075945885-Start-up-guide) and [machine procedure](https://support.kniterate.com/hc/en-us/article_attachments/360009817198), the design app does not import .kc files: after independent hash and metadata review, copy the exact bytes of blanket.kc to the SD card as command.kc, eject the card correctly, and follow that documented manual procedure. Retain blanket.kc as the unchanged evidence copy. Do not claim or attempt an automated controller-only dry run.
6. Watch waste, draw, carrier bring-in, first two body rows, and bind-off. Stop on unexpected carrier position, loop loss, or takedown behavior; record every manual intervention in run.json.
7. Photograph front, back, cast-on, both edges, and bind-off. Record dimensions off-machine and after 24 hours of rest.
8. Copy the completed artifact into packages/machine-lib/registry/swatches only after the structured run evidence, narrative outcome, and exact hashes are recorded.
`;
  const controllerReview = `# Controller review

This package contains only the exact KCode artifact that passed the V1 software
command-legality gate. It does not contain deliberately invalid probes.

- Verify the profile, KCode SHA-256, proof-receipt SHA-256, pass count, and command
  combinations in \`command-legality.json\` before authorizing a machine run.
- The current controller-observed status is **pending**. Software validation does
  not prove that a specific Kniterate control-software revision accepts the file.
- Do not hand-edit or rename the evidence copy. Follow \`OPERATOR-CHECKLIST.md\`
  and record the exact loaded artifact, machine serial, control-software version,
  stops, interventions, and outcome in the physical registry.
- Kniterate documents that .kc files are not imported into the design app and
  are read by the machine from SD card. Controller review is therefore a
  separately authorized physical procedure, not an automated software gate.
- The authorized SD-card transfer copy must be named \`command.kc\`; verify
  that its bytes still match the KCode SHA-256 after the copy.
`;
  return {
    project,
    chart,
    knitoutText: compiled.knitoutText,
    kcodeText: converted.kcode,
    manifest,
    commandLegality,
    operatorChecklist,
    controllerReview,
  };
}

export type V1KnitTrialCompileResult = ReturnType<typeof compileCurrentV1KnitTrial>;

export function readCurrentV1KCodeProofReceipt(): V1KCodeProofReceipt {
  const path = resolve(import.meta.dirname, '../packages/machine-lib/out/kcode-proof/proof-manifest.json');
  const bytes = readFileSync(path);
  const manifest = JSON.parse(bytes.toString('utf8')) as {
    verdict?: unknown;
    legalityCoverage?: { profileSha256?: unknown; contractSha256?: unknown };
  };
  const profileSha256 = sha256Bytes(JSON.stringify(KNITERATE_7GG_KCODE_PROFILE_V2));
  const contractSha256 = sha256Bytes(JSON.stringify(KNITERATE_7GG_KCODE_PROFILE_V2.operations));
  if (manifest.verdict !== 'software-proven') throw new Error('tracked KCode proof manifest is not software-proven');
  if (manifest.legalityCoverage?.profileSha256 !== profileSha256) {
    throw new Error('tracked KCode proof manifest does not match the current machine profile');
  }
  if (manifest.legalityCoverage?.contractSha256 !== contractSha256) {
    throw new Error('tracked KCode proof manifest does not match the current operation contract');
  }
  return {
    path: 'packages/machine-lib/out/kcode-proof/proof-manifest.json',
    sha256: sha256Bytes(bytes),
    verdict: 'software-proven',
    profileSha256,
    contractSha256,
  };
}

export function bindV1KnitTrialReleaseSource(
  result: V1KnitTrialCompileResult,
  releaseSource: V1KnitTrialReleaseSource,
  proofReceipt: V1KCodeProofReceipt,
) {
  return {
    ...result,
    manifest: {
      ...result.manifest,
      releaseSource,
    },
    commandLegality: {
      ...result.commandLegality,
      proofReceipt,
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
  writeFileSync(resolve(destination, 'command-legality.json'), `${JSON.stringify(result.commandLegality, null, 2)}\n`);
  writeFileSync(resolve(destination, 'OPERATOR-CHECKLIST.md'), result.operatorChecklist);
  writeFileSync(resolve(destination, 'CONTROLLER-REVIEW.md'), result.controllerReview);
}

function main(): void {
  const initialSource = readCleanV1KnitTrialReleaseSource();
  execFileSync('pnpm', ['verify:kcode:check'], { stdio: 'inherit' });
  const verifiedSource = readCleanV1KnitTrialReleaseSource();
  if (verifiedSource.commit !== initialSource.commit) {
    throw new Error(`release trial source changed during KCode proof: ${initialSource.commit} -> ${verifiedSource.commit}`);
  }
  const compiled = compileCurrentV1KnitTrial();
  const releaseSource = readCleanV1KnitTrialReleaseSource();
  if (releaseSource.commit !== initialSource.commit) {
    throw new Error(`release trial source changed during compilation: ${initialSource.commit} -> ${releaseSource.commit}`);
  }
  const result = bindV1KnitTrialReleaseSource(
    compiled,
    releaseSource,
    readCurrentV1KCodeProofReceipt(),
  );
  writeV1KnitTrial(result);
  process.stdout.write(`v1 physical trial ready from ${releaseSource.commit}: ${V1_KNIT_TRIAL_DESTINATION}\n${JSON.stringify(result.manifest.output, null, 2)}\n`);
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : null;
if (invokedPath === import.meta.url) main();
