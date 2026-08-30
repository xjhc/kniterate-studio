import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  materializeColorworkProject,
  parseColorworkProjectV1,
} from '../../project-contract/src/index.js';
import { compileColorworkProject } from '../../../apps/studio/src/blanket/compileProject.js';
import { knitoutToKCodeWithTrace } from '../src/knitout/kniterate/to-kcode.js';
import {
  createAuthoredKCodeCoordinateBridgeV1,
  type AuthoredKCodeCoordinateBridgeV1,
} from '../src/knitout/kcode/coordinate-bridge.js';
import { KNITERATE_7GG_KCODE_PROFILE_V2 } from '../src/knitout/kcode/machine-profile.js';
import { projectKCodeMachineTrace } from '../src/knitout/kcode/machine-trace.js';
import { parseKCodeDocument } from '../src/knitout/kcode/parser.js';
import { compareScheduledPassesToMachineTrace } from '../src/knitout/kcode/scheduled-trace-diff.js';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

const REGISTRY_PROJECT_BUDGET = {
  chartWidth: 252,
  chartHeight: 300,
  chartCellsPerState: 75_600,
  stateCellsTotal: 750_000,
  stateElementsTotal: 1_000_000,
  rowIdsPerState: 300,
  rowIdsTotal: 2_700,
  palettePerState: 256,
  paletteTotal: 2_304,
  yarnAssignmentsPerState: 4,
  yarnAssignmentsTotal: 36,
  overridesPerState: 75_600,
  overridesTotal: 680_400,
  historyEntries: 256,
  historyCheckpoints: 8,
  editItemsTotal: 200_000,
  paintCellsPerEdit: 75_600,
  replayCellVisits: 20_000_000,
} as const;

/**
 * The complete source/configuration closure used to produce the fixed V1 trial
 * and decide whether its manual evidence is eligible for promotion. Paths are
 * repository-relative so the same bytes hash identically in any clone.
 */
export const COMPILER_FINGERPRINT_INPUTS = [
  'packages/machine-lib/src',
  'packages/chart-contract/src',
  'packages/project-contract/src',
  'apps/studio/src/blanket/compileProject.ts',
  'scripts/build-v1-knit-trial.ts',
  'scripts/check-v1-physical-release.ts',
  'scripts/register-v1-knit-trial.ts',
  'packages/machine-lib/scripts/registry-support.ts',
  'packages/machine-lib/scripts/kniterate-swatch-registry-check.ts',
  'packages/machine-lib/registry/swatches/_schema.json',
  'packages/machine-lib/registry/swatches/_template',
  'package.json',
  'pnpm-lock.yaml',
  'pnpm-workspace.yaml',
  '.node-version',
  'tsconfig.base.json',
  'packages/machine-lib/package.json',
  'packages/machine-lib/tsconfig.json',
  'packages/chart-contract/package.json',
  'packages/chart-contract/tsconfig.json',
  'packages/project-contract/package.json',
  'packages/project-contract/tsconfig.json',
  'apps/studio/package.json',
  'apps/studio/tsconfig.json',
] as const;

function filesUnder(root: string): string[] {
  const result: string[] = [];
  const visit = (path: string): void => {
    if (!existsSync(path)) throw new Error(`compiler fingerprint input is missing: ${path}`);
    if (!statSync(path).isDirectory()) {
      result.push(path);
      return;
    }
    for (const name of readdirSync(path).sort()) visit(join(path, name));
  };
  visit(root);
  return result;
}

function portableRelative(root: string, path: string): string {
  return relative(root, path).split(sep).join('/');
}

export function sha256Bytes(bytes: string | Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

export function sha256File(path: string): string {
  return sha256Bytes(readFileSync(path));
}

export function computeCompilerFingerprint(root = repositoryRoot): string {
  const hash = createHash('sha256');
  const paths = COMPILER_FINGERPRINT_INPUTS.flatMap((input) => filesUnder(resolve(root, input)));
  paths.sort((left, right) => {
    const leftName = portableRelative(root, left);
    const rightName = portableRelative(root, right);
    return leftName < rightName ? -1 : leftName > rightName ? 1 : 0;
  });
  for (const path of paths) {
    hash.update(portableRelative(root, path));
    hash.update('\0');
    hash.update(readFileSync(path));
    hash.update('\0');
  }
  return hash.digest('hex');
}

export interface CurrentRegistryCompileResult {
  readonly supported: boolean;
  readonly ok: boolean;
  readonly messages: readonly string[];
  readonly sourceFingerprint: string | null;
  readonly knitoutText: string | null;
  readonly kcodeText: string | null;
  readonly knitoutSha256: string | null;
  readonly kcodeSha256: string | null;
  readonly expectedMachine: CurrentRegistryMachineEvidence | null;
}

export interface CurrentRegistryMachineEvidence {
  readonly profile: string;
  readonly compilerCoordinates: {
    readonly start: number;
    readonly end: number;
  };
  readonly coordinateBridge: AuthoredKCodeCoordinateBridgeV1;
  readonly program: {
    readonly gauge: number;
    readonly position: string;
    readonly wastePasses: number;
    readonly bindOff: string;
    readonly initialSettings: {
      readonly stitchNumber: number;
      readonly xferStitchNumber: number;
      readonly speedNumber: number;
      readonly rollerAdvance: number;
      readonly xferStyle: string;
      readonly carrierSpacing: number;
      readonly carrierStoppingDistance: number;
    };
  };
  readonly emittedPassCount: number;
  readonly carriers: readonly {
    readonly carrier: string;
    readonly role: 'draw' | 'pattern' | 'waste';
  }[];
}

function failedCurrentCompile(supported: boolean, message: string): CurrentRegistryCompileResult {
  return {
    supported,
    ok: false,
    messages: [message],
    sourceFingerprint: null,
    knitoutText: null,
    kcodeText: null,
    knitoutSha256: null,
    kcodeSha256: null,
    expectedMachine: null,
  };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

interface RegistryProjectBudgetTotals {
  stateCells: number;
  stateElements: number;
  rowIds: number;
  palette: number;
  yarnAssignments: number;
  overrides: number;
}

interface RegistryProjectStateDimensions {
  width: number | null;
  height: number | null;
}

function positiveSafeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) > 0;
}

function inspectRegistryProjectStateBudget(
  value: unknown,
  path: string,
  totals: RegistryProjectBudgetTotals,
): { dimensions: RegistryProjectStateDimensions; message: string | null } {
  const state = asRecord(value);
  const chart = asRecord(state?.chart);
  const width = positiveSafeInteger(chart?.width) ? chart.width : null;
  const height = positiveSafeInteger(chart?.height) ? chart.height : null;
  if (width !== null && width > REGISTRY_PROJECT_BUDGET.chartWidth) {
    return { dimensions: { width, height }, message: `${path}.chart.width ${width} exceeds the ${REGISTRY_PROJECT_BUDGET.chartWidth}-needle registry compile limit` };
  }
  if (height !== null && height > REGISTRY_PROJECT_BUDGET.chartHeight) {
    return { dimensions: { width, height }, message: `${path}.chart.height ${height} exceeds the ${REGISTRY_PROJECT_BUDGET.chartHeight}-row registry compile limit` };
  }

  const cells = chart?.cells;
  let stateCells = 0;
  if (Array.isArray(cells)) {
    if (cells.length > REGISTRY_PROJECT_BUDGET.chartHeight) {
      return { dimensions: { width, height }, message: `${path}.chart.cells has ${cells.length} rows, exceeding the ${REGISTRY_PROJECT_BUDGET.chartHeight}-row registry compile limit` };
    }
    for (let rowIndex = 0; rowIndex < cells.length; rowIndex++) {
      const row = cells[rowIndex];
      if (!Array.isArray(row)) continue;
      if (row.length > REGISTRY_PROJECT_BUDGET.chartWidth) {
        return { dimensions: { width, height }, message: `${path}.chart.cells[${rowIndex}] has ${row.length} cells, exceeding the ${REGISTRY_PROJECT_BUDGET.chartWidth}-cell row limit` };
      }
      stateCells += row.length;
      if (stateCells > REGISTRY_PROJECT_BUDGET.chartCellsPerState) {
        return { dimensions: { width, height }, message: `${path}.chart.cells exceeds the ${REGISTRY_PROJECT_BUDGET.chartCellsPerState}-cell state limit` };
      }
    }
  }
  totals.stateCells += stateCells;
  totals.stateElements += stateCells;
  if (totals.stateCells > REGISTRY_PROJECT_BUDGET.stateCellsTotal) {
    return { dimensions: { width, height }, message: `project base/checkpoint charts exceed the ${REGISTRY_PROJECT_BUDGET.stateCellsTotal}-cell aggregate limit` };
  }

  const rowIds = state?.rowIds;
  if (Array.isArray(rowIds)) {
    if (rowIds.length > REGISTRY_PROJECT_BUDGET.rowIdsPerState) {
      return { dimensions: { width, height }, message: `${path}.rowIds exceeds the ${REGISTRY_PROJECT_BUDGET.rowIdsPerState}-item state limit` };
    }
    totals.rowIds += rowIds.length;
    totals.stateElements += rowIds.length;
    if (totals.rowIds > REGISTRY_PROJECT_BUDGET.rowIdsTotal) {
      return { dimensions: { width, height }, message: `project base/checkpoint rowIds exceed the ${REGISTRY_PROJECT_BUDGET.rowIdsTotal}-item aggregate limit` };
    }
  }

  const palette = chart?.palette;
  if (Array.isArray(palette)) {
    if (palette.length > REGISTRY_PROJECT_BUDGET.palettePerState) {
      return { dimensions: { width, height }, message: `${path}.chart.palette exceeds the ${REGISTRY_PROJECT_BUDGET.palettePerState}-entry state limit` };
    }
    totals.palette += palette.length;
    totals.stateElements += palette.length;
    if (totals.palette > REGISTRY_PROJECT_BUDGET.paletteTotal) {
      return { dimensions: { width, height }, message: `project base/checkpoint palettes exceed the ${REGISTRY_PROJECT_BUDGET.paletteTotal}-entry aggregate limit` };
    }
  }

  const assignments = asRecord(state?.machine)?.yarnAssignments;
  if (Array.isArray(assignments)) {
    if (assignments.length > REGISTRY_PROJECT_BUDGET.yarnAssignmentsPerState) {
      return { dimensions: { width, height }, message: `${path}.machine.yarnAssignments exceeds the ${REGISTRY_PROJECT_BUDGET.yarnAssignmentsPerState}-item state limit` };
    }
    totals.yarnAssignments += assignments.length;
    totals.stateElements += assignments.length;
    if (totals.yarnAssignments > REGISTRY_PROJECT_BUDGET.yarnAssignmentsTotal) {
      return { dimensions: { width, height }, message: `project base/checkpoint yarn assignments exceed the ${REGISTRY_PROJECT_BUDGET.yarnAssignmentsTotal}-item aggregate limit` };
    }
  }

  const overrides = state?.overrides;
  if (Array.isArray(overrides)) {
    if (overrides.length > REGISTRY_PROJECT_BUDGET.overridesPerState) {
      return { dimensions: { width, height }, message: `${path}.overrides exceeds the ${REGISTRY_PROJECT_BUDGET.overridesPerState}-item state limit` };
    }
    totals.overrides += overrides.length;
    totals.stateElements += overrides.length;
    if (totals.overrides > REGISTRY_PROJECT_BUDGET.overridesTotal) {
      return { dimensions: { width, height }, message: `project base/checkpoint overrides exceed the ${REGISTRY_PROJECT_BUDGET.overridesTotal}-item aggregate limit` };
    }
  }
  if (totals.stateElements > REGISTRY_PROJECT_BUDGET.stateElementsTotal) {
    return { dimensions: { width, height }, message: `project base/checkpoint arrays exceed the ${REGISTRY_PROJECT_BUDGET.stateElementsTotal}-element aggregate limit` };
  }
  return { dimensions: { width, height }, message: null };
}

function registryProjectBudgetMessage(value: unknown): string | null {
  const project = asRecord(value);
  if (project === null) return null;
  const totals: RegistryProjectBudgetTotals = {
    stateCells: 0,
    stateElements: 0,
    rowIds: 0,
    palette: 0,
    yarnAssignments: 0,
    overrides: 0,
  };
  const base = inspectRegistryProjectStateBudget(project.base, 'project.base', totals);
  if (base.message !== null) return base.message;

  const history = asRecord(project.history);
  const entries = history?.entries;
  const checkpoints = history?.checkpoints;
  if (Array.isArray(entries) && entries.length > REGISTRY_PROJECT_BUDGET.historyEntries) {
    return `project.history.entries exceeds the ${REGISTRY_PROJECT_BUDGET.historyEntries}-entry registry compile limit`;
  }
  if (Array.isArray(checkpoints) && checkpoints.length > REGISTRY_PROJECT_BUDGET.historyCheckpoints) {
    return `project.history.checkpoints exceeds the ${REGISTRY_PROJECT_BUDGET.historyCheckpoints}-checkpoint registry compile limit`;
  }
  if (Array.isArray(checkpoints)) {
    for (let index = 0; index < checkpoints.length; index++) {
      const checkpoint = asRecord(checkpoints[index]);
      const inspected = inspectRegistryProjectStateBudget(checkpoint?.state, `project.history.checkpoints[${index}].state`, totals);
      if (inspected.message !== null) return inspected.message;
    }
  }

  if (!Array.isArray(entries)) return null;
  let editItems = 0;
  let replayCellVisits = 0;
  let width = base.dimensions.width;
  let height = base.dimensions.height;
  let overrideCount = Array.isArray(asRecord(project.base)?.overrides) ? (asRecord(project.base)!.overrides as unknown[]).length : 0;
  for (let index = 0; index < entries.length; index++) {
    if (width !== null && height !== null) {
      replayCellVisits += width * height;
      if (replayCellVisits > REGISTRY_PROJECT_BUDGET.replayCellVisits) {
        return `project history replay exceeds the ${REGISTRY_PROJECT_BUDGET.replayCellVisits}-cell-work registry compile limit`;
      }
    }
    const edit = asRecord(asRecord(entries[index])?.edit);
    if (edit === null) continue;
    const editPath = `project.history.entries[${index}].edit`;
    if (edit.kind === 'paint-cells' && Array.isArray(edit.cells)) {
      if (edit.cells.length > REGISTRY_PROJECT_BUDGET.paintCellsPerEdit) return `${editPath}.cells exceeds the ${REGISTRY_PROJECT_BUDGET.paintCellsPerEdit}-item edit limit`;
      editItems += edit.cells.length;
    } else if (edit.kind === 'insert-row' && Array.isArray(edit.cells)) {
      if (edit.cells.length > REGISTRY_PROJECT_BUDGET.chartWidth) return `${editPath}.cells exceeds the ${REGISTRY_PROJECT_BUDGET.chartWidth}-cell row limit`;
      editItems += edit.cells.length;
      if (height !== null) height += 1;
    } else if (edit.kind === 'set-height') {
      if (positiveSafeInteger(edit.height)) {
        if (edit.height > REGISTRY_PROJECT_BUDGET.chartHeight) return `${editPath}.height ${edit.height} exceeds the ${REGISTRY_PROJECT_BUDGET.chartHeight}-row limit`;
        height = edit.height;
      }
      if (Array.isArray(edit.newRowIds)) {
        if (edit.newRowIds.length > REGISTRY_PROJECT_BUDGET.rowIdsPerState) return `${editPath}.newRowIds exceeds the ${REGISTRY_PROJECT_BUDGET.rowIdsPerState}-item limit`;
        editItems += edit.newRowIds.length;
      }
    } else if (edit.kind === 'set-width' && positiveSafeInteger(edit.width)) {
      if (edit.width > REGISTRY_PROJECT_BUDGET.chartWidth) return `${editPath}.width ${edit.width} exceeds the ${REGISTRY_PROJECT_BUDGET.chartWidth}-needle limit`;
      width = edit.width;
    } else if (edit.kind === 'add-override') {
      overrideCount += 1;
      if (overrideCount > REGISTRY_PROJECT_BUDGET.overridesPerState) return `${editPath} grows overrides beyond the ${REGISTRY_PROJECT_BUDGET.overridesPerState}-item state limit`;
    } else if (edit.kind === 'delete-row' && height !== null) height = Math.max(1, height - 1);
    if (editItems > REGISTRY_PROJECT_BUDGET.editItemsTotal) return `project history edit arrays exceed the ${REGISTRY_PROJECT_BUDGET.editItemsTotal}-item aggregate limit`;
    if (width !== null && height !== null && width * height > REGISTRY_PROJECT_BUDGET.chartCellsPerState) {
      return `${editPath} grows the chart beyond the ${REGISTRY_PROJECT_BUDGET.chartCellsPerState}-cell state limit`;
    }
  }
  return null;
}

function requiredNumericSetting(knitout: string, pattern: RegExp, label: string): number {
  const raw = pattern.exec(knitout)?.[1];
  const value = raw === undefined ? Number.NaN : Number(raw);
  if (!Number.isFinite(value)) throw new Error(`current compile is missing numeric ${label}`);
  return value;
}

function requiredTextSetting(knitout: string, pattern: RegExp, label: string): string {
  const value = pattern.exec(knitout)?.[1]?.trim();
  if (!value) throw new Error(`current compile is missing ${label}`);
  return value;
}

function expectedMachineEvidence(
  knitout: string,
  project: ReturnType<typeof parseColorworkProjectV1>,
  emittedPassCount: number,
  coordinateBridge: AuthoredKCodeCoordinateBridgeV1,
): CurrentRegistryMachineEvidence {
  const state = materializeColorworkProject(project).state;
  const position = /^;;Position:\s*(\S(?:.*\S)?)\s*$/m.exec(knitout)?.[1];
  if (position === undefined) throw new Error('current compile is missing ;;Position');
  const carriers: CurrentRegistryMachineEvidence['carriers'][number][] = [];
  if (state.frame.drawThread) carriers.push({ carrier: '1', role: 'draw' });
  carriers.push(...state.machine.yarnAssignments.map((assignment) => ({
    carrier: assignment.carrier,
    role: 'pattern' as const,
  })));
  carriers.push({ carrier: '6', role: 'waste' });
  carriers.sort((left, right) => Number(left.carrier) - Number(right.carrier));
  return {
    profile: state.machine.profile,
    compilerCoordinates: {
      start: state.machine.needleOffset,
      end: state.machine.needleOffset + state.chart.width - 1,
    },
    coordinateBridge,
    program: {
      gauge: requiredNumericSetting(knitout, /^;;Gauge:\s*([0-9]+(?:\.[0-9]+)?)\s*$/m, 'gauge'),
      position,
      wastePasses: state.frame.wasteRows,
      bindOff: state.frame.bindOff,
      initialSettings: {
        stitchNumber: requiredNumericSetting(knitout, /^x-stitch-number\s+([0-9]+(?:\.[0-9]+)?)\s*$/m, 'stitch number'),
        xferStitchNumber: requiredNumericSetting(knitout, /^x-xfer-stitch-number\s+([0-9]+(?:\.[0-9]+)?)\s*$/m, 'transfer stitch number'),
        speedNumber: requiredNumericSetting(knitout, /^x-speed-number\s+([0-9]+(?:\.[0-9]+)?)\s*$/m, 'speed number'),
        rollerAdvance: requiredNumericSetting(knitout, /^x-roller-advance\s+([0-9]+(?:\.[0-9]+)?)\s*$/m, 'roller advance'),
        xferStyle: requiredTextSetting(knitout, /^x-xfer-style\s+(\S+)\s*$/m, 'transfer style'),
        carrierSpacing: requiredNumericSetting(knitout, /^x-carrier-spacing\s+([0-9]+(?:\.[0-9]+)?)\s*$/m, 'carrier spacing'),
        carrierStoppingDistance: requiredNumericSetting(knitout, /^x-carrier-stopping-distance\s+([0-9]+(?:\.[0-9]+)?)\s*$/m, 'carrier stopping distance'),
      },
    },
    emittedPassCount,
    carriers,
  };
}

/**
 * Recompile a supported registry request through one fixed in-process path.
 * Stored command strings and caller-supplied re-emit status are never executed
 * or treated as proof.
 */
export function compileRegistryRequestCurrent(
  entryRoot: string,
  requestValue: unknown,
): CurrentRegistryCompileResult {
  const request = asRecord(requestValue);
  if (request?.kind !== 'kniterate-studio-project') {
    return failedCurrentCompile(false, `request kind ${JSON.stringify(request?.kind ?? null)} has no fixed current recompiler`);
  }
  const inputFiles = Array.isArray(request.inputFiles)
    ? request.inputFiles.filter((value): value is string => typeof value === 'string')
    : [];
  if (!inputFiles.includes('project.kniterate-studio.json')) {
    return failedCurrentCompile(true, 'supported request must include project.kniterate-studio.json');
  }
  const projectPath = resolve(entryRoot, 'project.kniterate-studio.json');
  if (!existsSync(projectPath)) {
    return failedCurrentCompile(true, 'supported request is missing project.kniterate-studio.json');
  }

  try {
    const projectValue = JSON.parse(readFileSync(projectPath, 'utf8')) as unknown;
    const budgetMessage = registryProjectBudgetMessage(projectValue);
    if (budgetMessage !== null) return failedCurrentCompile(true, `current project exceeds the fixed registry compile budget: ${budgetMessage}`);
    const project = parseColorworkProjectV1(projectValue);
    const compiled = compileColorworkProject(project);
    if (!compiled.ok || compiled.knitoutText === null || compiled.inputHash === null) {
      const details = compiled.messages.map((message) => `${message.severity}: ${message.message}`).join('; ');
      return failedCurrentCompile(true, `current project compile failed${details ? `: ${details}` : ''}`);
    }
    const converted = knitoutToKCodeWithTrace(compiled.knitoutText, 'command.k');
    if (!converted.ok) return failedCurrentCompile(true, `current KCode emission failed: ${converted.error}`);
    const parsedKCode = parseKCodeDocument(converted.kcode, {
      profile: KNITERATE_7GG_KCODE_PROFILE_V2,
      dialect: KNITERATE_7GG_KCODE_PROFILE_V2.dialect,
      strict: true,
      resourceProfile: 'authored-v1',
    });
    if (!parsedKCode.ok) {
      return failedCurrentCompile(true, `current KCode emission failed strict parsing: ${parsedKCode.diagnostics.slice(0, 8).map((diagnostic) => diagnostic.rule).join(', ')}`);
    }
    const trace = projectKCodeMachineTrace(
      parsedKCode.document,
      KNITERATE_7GG_KCODE_PROFILE_V2,
    );
    const scheduledTraceComparison = compareScheduledPassesToMachineTrace(
      converted.scheduledPasses,
      trace,
    );
    const state = materializeColorworkProject(project).state;
    const coordinateBridge = createAuthoredKCodeCoordinateBridgeV1({
      artifactKcodeSha256: sha256Bytes(converted.kcode),
      compilerCoordinateStart: state.machine.needleOffset,
      compilerCoordinateEnd: state.machine.needleOffset + state.chart.width - 1,
      lowering: converted.coordinateMapping,
      trace,
      scheduledTraceComparison,
      profile: KNITERATE_7GG_KCODE_PROFILE_V2,
    });
    return {
      supported: true,
      ok: true,
      messages: converted.warnings,
      sourceFingerprint: compiled.inputHash,
      knitoutText: compiled.knitoutText,
      kcodeText: converted.kcode,
      knitoutSha256: sha256Bytes(compiled.knitoutText),
      kcodeSha256: sha256Bytes(converted.kcode),
      expectedMachine: expectedMachineEvidence(
        compiled.knitoutText,
        project,
        converted.scheduledPasses.length,
        coordinateBridge,
      ),
    };
  } catch (error) {
    return failedCurrentCompile(true, `current request could not be compiled: ${error instanceof Error ? error.message : String(error)}`);
  }
}
