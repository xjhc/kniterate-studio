import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { AUTHORED_CAPACITY_LIMITS_V1 } from '../packages/project-contract/src/index.ts';
import { computeCompilerFingerprint } from '../packages/machine-lib/scripts/registry-support.ts';
import { createMachineExecutionIndexV1, inspectMachineExecutionV1, MACHINE_EXECUTION_LIMITS_V1 } from '../packages/machine-lib/src/browser.ts';
import { createSweaterProject, type SweaterIntent } from '../apps/studio/src/sweater/sweater.ts';
import { runSweaterPipeline } from '../apps/studio/src/sweater/sweaterPipeline.ts';

// One synthetic candidate: maximum admitted plan width and schema body length,
// near the selection budget. No measured gauge or physical qualification claim.
const intent: SweaterIntent = {
  title: 'Synthetic sweater capacity audit', silhouette: 'drop-shoulder', neckline: 'boat',
  size: 'XXL', fit: 'oversized', textureId: 'stockinette', yarn: { name: 'Synthetic audit yarn', hex: '#D9CBB0' },
  gauge: { stitchesPer10cm: 20, rowsPer10cm: 28, source: 'assumed' },
  ribGauge: { stitchesPer10cm: 20, rowsPer10cm: 32, source: 'assumed' },
  measurements: { chest: 240, length: 250 },
};
const project = createSweaterProject(intent, { id: 'sweater-capacity-audit', source: 'human', group: 'create' });
const sourceCommit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const sourceModified = execFileSync('git', ['diff', '--name-only', 'HEAD'], { encoding: 'utf8' }).trim().length > 0;
const compilerFingerprint = computeCompilerFingerprint();
const started = performance.now();
const result = await runSweaterPipeline(project);
const pieces = result.pieces.map((piece) => {
  const kcode = piece.kcode;
  const trace = kcode?.trace;
  const raster = result.plan.pieces.find((item) => item.id === piece.id)?.raster?.realized;
  if (!trace || !kcode?.validation) return { id: piece.id, raster, verdict: piece.verdict.state, compileError: piece.compileError, outputError: piece.outputError };
  const index = createMachineExecutionIndexV1(trace, kcode.validation);
  const final = inspectMachineExecutionV1(index, index.events.length - 1);
  const selectedCells = trace.passes.reduce((sum, pass) => sum + pass.selections.front.length + pass.selections.rear.length, 0);
  const actions = trace.passes.reduce((sum, pass) => sum + pass.actions.length, 0);
  return {
    id: piece.id, raster, verdict: piece.verdict.state, kcodeOk: kcode.ok, kcodeSha256: kcode.kcHash,
    hashMatches: createHash('sha256').update(kcode.kcText).digest('hex') === kcode.kcHash,
    passes: trace.passes.length, rackCommands: trace.rackCommands.length, selectedCells, actions,
    selectionHeadroom: AUTHORED_CAPACITY_LIMITS_V1.selectedCells - selectedCells,
    events: index.events.length, eventLimit: MACHINE_EXECUTION_LIMITS_V1.events,
    eventHeadroom: MACHINE_EXECUTION_LIMITS_V1.events - index.events.length,
    eventFormulaMatches: index.events.length === actions + 2 * trace.passes.length + trace.rackCommands.length,
    finalReplayMatchesValidator: JSON.stringify(final.loopState) === JSON.stringify(kcode.validation.finalState),
    errors: kcode.messages.filter((message) => message.severity === 'error').map(({ rule, message }) => ({ rule, message })),
  };
});
console.log(JSON.stringify({
  schemaVersion: 1,
  sourceCommit, sourceModified, compilerFingerprint,
  reproduce: 'node --import tsx scripts/audit-sweater-replay-capacity.ts',
  scope: 'One synthetic maximum-plan-width/schema-max-body-length candidate; not an exhaustive largest-program search or a physical trial.',
  intent, object: result.plan.object, elapsedSeconds: (performance.now() - started) / 1000,
  sweaterVerdict: result.verdict.state, exportReady: result.exportReady, readiness: result.readiness,
  admittedAuthoredEventBound: {
    selections: AUTHORED_CAPACITY_LIMITS_V1.selectedCells,
    passes: AUTHORED_CAPACITY_LIMITS_V1.loweredPasses,
    records: AUTHORED_CAPACITY_LIMITS_V1.kcodeRecords,
    formula: 'selections + 3 * passes + records',
    rationale: 'At most one action per selection or empty pass, two pass boundaries, and at most one rack event per record.',
    events: AUTHORED_CAPACITY_LIMITS_V1.selectedCells + 3 * AUTHORED_CAPACITY_LIMITS_V1.loweredPasses + AUTHORED_CAPACITY_LIMITS_V1.kcodeRecords,
    limit: MACHINE_EXECUTION_LIMITS_V1.events,
  },
  pieces,
}, null, 2));
