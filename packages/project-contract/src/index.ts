import {
  InvalidColorworkChartError,
  parseColorworkChartV1,
  type ColorworkChartV1,
} from '@kniterate-studio/chart-contract';
import { z } from 'zod';

export const COLORWORK_PROJECT_KIND = 'kniterate-studio-project' as const;
export const COLORWORK_PROJECT_VERSION = 1 as const;
export const COLORWORK_PROJECT_PROFILE = 'kniterate-7gg-worsted-v1' as const;
export const PROJECT_CHECKPOINT_INTERVAL = 50;

/**
 * One browser-safe admission contract for the fixed V1 authored compiler.
 * `ColorworkChartV1` remains a neutral interchange format; these limits apply
 * only after a chart becomes a Kniterate Studio project.
 */
export const AUTHORED_CAPACITY_LIMITS_V1 = {
  projectSourceCodeUnits: 16 * 1024 * 1024,
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
  knitoutRecords: 600_000,
  loweredPasses: 8_192,
  selectedCells: 200_000,
  kcodeRecords: 100_000,
} as const;

const Id = z.string().min(1).max(120).regex(/^[a-zA-Z0-9][a-zA-Z0-9_.:-]*$/);
const Carrier = z.enum(['2', '3', '4', '5']);
const RowId = Id;

const YarnAssignmentSchema = z.object({
  paletteId: Id,
  carrier: Carrier,
  yarnName: z.string().min(1).max(120),
});

const StrategySchema = z.object({
  technique: z.enum(['fairisle', 'ladder-back', 'lined', 'birdseye', 'complement']),
  birdseyeMode: z.enum(['minimal', 'full']).optional(),
  floatLimit: z.number().int().min(1).max(30).default(5),
});

const FrameSchema = z.object({
  wasteRows: z.number().int().min(4).max(200).default(20),
  drawThread: z.boolean().default(true),
  bindOff: z.enum(['machine-bindoff', 'waste-and-drop']).default('machine-bindoff'),
});

const StitchOverrideSchema = z.object({
  id: Id,
  kind: z.literal('stitch'),
  anchor: z.object({ rowId: RowId, needleIndex: z.number().int().min(0) }),
  operation: z.enum(['knit', 'tuck', 'miss', 'rear-knit', 'transfer']),
});

const PassOverrideSchema = z.object({
  id: Id,
  kind: z.literal('pass'),
  anchor: z.object({
    rowId: RowId,
    purpose: z.enum(['body', 'carrier-intro', 'bind-off']),
    ordinal: z.number().int().min(0),
  }),
  setting: z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('speed'), value: z.number().int().min(1).max(1000) }),
    z.object({ kind: z.literal('roller'), value: z.number().int().min(0).max(1000) }),
    z.object({ kind: z.literal('stitch'), value: z.number().int().min(0).max(35) }),
  ]),
});

export const ProjectOverrideSchema = z.discriminatedUnion('kind', [StitchOverrideSchema, PassOverrideSchema]);
export type ProjectOverride = z.infer<typeof ProjectOverrideSchema>;

const PaintCellsEditSchema = z.object({
  kind: z.literal('paint-cells'),
  cells: z.array(z.object({ rowId: RowId, column: z.number().int().min(0), paletteIndex: z.number().int().min(0) })).min(1),
});
const InsertRowEditSchema = z.object({
  kind: z.literal('insert-row'),
  rowId: RowId,
  afterRowId: RowId.nullable(),
  cells: z.array(z.number().int().min(0)).min(1),
});
const DeleteRowEditSchema = z.object({ kind: z.literal('delete-row'), rowId: RowId });
const SetWidthEditSchema = z.object({
  kind: z.literal('set-width'),
  width: z.number().int().min(1).max(252),
  fillPaletteIndex: z.number().int().min(0),
});
const SetHeightEditSchema = z.object({
  kind: z.literal('set-height'),
  height: z.number().int().min(1).max(AUTHORED_CAPACITY_LIMITS_V1.chartHeight),
  fillPaletteIndex: z.number().int().min(0),
  newRowIds: z.array(RowId),
});
const SetNeedleOffsetEditSchema = z.object({
  kind: z.literal('set-needle-offset'),
  needleOffset: z.number().int().min(1).max(252),
});
const SetStrategyEditSchema = z.object({ kind: z.literal('set-strategy'), strategy: StrategySchema });
const SetFrameEditSchema = z.object({ kind: z.literal('set-frame'), frame: FrameSchema });
const SetYarnEditSchema = z.object({ kind: z.literal('set-yarn-assignment'), assignment: YarnAssignmentSchema });
const RemoveYarnEditSchema = z.object({ kind: z.literal('remove-yarn-assignment'), paletteId: Id });
const SetPaletteEntryEditSchema = z.object({
  kind: z.literal('set-palette-entry'),
  paletteId: Id,
  name: z.string().min(1).max(100),
  hex: z.string().regex(/^#[0-9a-fA-F]{6}$/),
});
const AddOverrideEditSchema = z.object({ kind: z.literal('add-override'), override: ProjectOverrideSchema });
const RemoveOverrideEditSchema = z.object({ kind: z.literal('remove-override'), overrideId: Id });

export const ProjectEditSchema = z.discriminatedUnion('kind', [
  PaintCellsEditSchema,
  InsertRowEditSchema,
  DeleteRowEditSchema,
  SetWidthEditSchema,
  SetHeightEditSchema,
  SetNeedleOffsetEditSchema,
  SetStrategyEditSchema,
  SetFrameEditSchema,
  SetYarnEditSchema,
  RemoveYarnEditSchema,
  SetPaletteEntryEditSchema,
  AddOverrideEditSchema,
  RemoveOverrideEditSchema,
]);
export type ProjectEdit = z.infer<typeof ProjectEditSchema>;

export interface ProjectState {
  chart: ColorworkChartV1;
  rowIds: string[];
  machine: {
    profile: typeof COLORWORK_PROJECT_PROFILE;
    needleOffset: number;
    yarnAssignments: Array<z.infer<typeof YarnAssignmentSchema>>;
  };
  strategy: z.infer<typeof StrategySchema>;
  frame: z.infer<typeof FrameSchema>;
  overrides: ProjectOverride[];
}

export interface ProjectEditEntry {
  id: string;
  source: 'human' | 'assistant' | 'system';
  edit: ProjectEdit;
}

export interface ProjectCheckpoint {
  cursor: number;
  state: ProjectState;
}

export interface ColorworkProjectV1 {
  kind: typeof COLORWORK_PROJECT_KIND;
  version: typeof COLORWORK_PROJECT_VERSION;
  id: string;
  title: string;
  base: ProjectState;
  history: {
    cursor: number;
    entries: ProjectEditEntry[];
    checkpoints: ProjectCheckpoint[];
  };
}

export interface ResolvedProjectOverride {
  override: ProjectOverride;
  status: 'active' | 'quarantined';
  reason?: string;
}

export interface MaterializedColorworkProject {
  state: ProjectState;
  overrides: ResolvedProjectOverride[];
}

export class InvalidColorworkProjectError extends Error {
  readonly issues: string[];
  constructor(issues: string[]) {
    super(`Invalid ColorworkProjectV1:\n${issues.map((issue) => `- ${issue}`).join('\n')}`);
    this.name = 'InvalidColorworkProjectError';
    this.issues = issues;
  }
}

export type ProjectStructureCapacityMetricV1 =
  | 'project-source'
  | 'chart-width'
  | 'chart-height'
  | 'chart-cells'
  | 'state-cells-total'
  | 'state-elements-total'
  | 'row-ids'
  | 'palette'
  | 'yarn-assignments'
  | 'overrides'
  | 'history-entries'
  | 'history-checkpoints'
  | 'edit-items'
  | 'history-replay-cells';

export interface ProjectStructureCapacityIssueV1 {
  readonly rule: 'project-authored-capacity-v1';
  readonly metric: ProjectStructureCapacityMetricV1;
  readonly path: string;
  readonly required: number;
  readonly limit: number;
  readonly message: string;
}

type UnknownRecord = Record<string, unknown>;

function unknownRecord(value: unknown): UnknownRecord | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as UnknownRecord
    : null;
}

function positiveSafeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) > 0;
}

function structureCapacityIssue(
  metric: ProjectStructureCapacityMetricV1,
  path: string,
  required: number,
  limit: number,
  unit: string,
): ProjectStructureCapacityIssueV1 {
  return {
    rule: 'project-authored-capacity-v1',
    metric,
    path,
    required,
    limit,
    message: `${path} requires ${required.toLocaleString('en-US')} ${unit}; the authored V1 capacity is ${limit.toLocaleString('en-US')}.`,
  };
}

interface ProjectCapacityTotalsV1 {
  stateCells: number;
  stateElements: number;
  rowIds: number;
  palette: number;
  yarnAssignments: number;
  overrides: number;
}

interface ProjectCapacityDimensionsV1 {
  width: number | null;
  height: number | null;
}

function inspectProjectStateCapacityV1(
  value: unknown,
  path: string,
  totals: ProjectCapacityTotalsV1,
): { dimensions: ProjectCapacityDimensionsV1; issue: ProjectStructureCapacityIssueV1 | null } {
  const state = unknownRecord(value);
  const chart = unknownRecord(state?.chart);
  const width = positiveSafeInteger(chart?.width) ? chart.width : null;
  const height = positiveSafeInteger(chart?.height) ? chart.height : null;
  const dimensions = { width, height };
  if (width !== null && width > AUTHORED_CAPACITY_LIMITS_V1.chartWidth) {
    return { dimensions, issue: structureCapacityIssue('chart-width', `${path}.chart.width`, width, AUTHORED_CAPACITY_LIMITS_V1.chartWidth, 'needles') };
  }
  if (height !== null && height > AUTHORED_CAPACITY_LIMITS_V1.chartHeight) {
    return { dimensions, issue: structureCapacityIssue('chart-height', `${path}.chart.height`, height, AUTHORED_CAPACITY_LIMITS_V1.chartHeight, 'rows') };
  }
  if (width !== null && height !== null && width * height > AUTHORED_CAPACITY_LIMITS_V1.chartCellsPerState) {
    return { dimensions, issue: structureCapacityIssue('chart-cells', `${path}.chart`, width * height, AUTHORED_CAPACITY_LIMITS_V1.chartCellsPerState, 'cells') };
  }

  const cells = chart?.cells;
  let stateCells = 0;
  if (Array.isArray(cells)) {
    if (cells.length > AUTHORED_CAPACITY_LIMITS_V1.chartHeight) {
      return { dimensions, issue: structureCapacityIssue('chart-height', `${path}.chart.cells`, cells.length, AUTHORED_CAPACITY_LIMITS_V1.chartHeight, 'rows') };
    }
    for (let rowIndex = 0; rowIndex < cells.length; rowIndex++) {
      const row = cells[rowIndex];
      if (!Array.isArray(row)) continue;
      if (row.length > AUTHORED_CAPACITY_LIMITS_V1.chartWidth) {
        return { dimensions, issue: structureCapacityIssue('chart-width', `${path}.chart.cells[${rowIndex}]`, row.length, AUTHORED_CAPACITY_LIMITS_V1.chartWidth, 'cells') };
      }
      stateCells += row.length;
      if (stateCells > AUTHORED_CAPACITY_LIMITS_V1.chartCellsPerState) {
        return { dimensions, issue: structureCapacityIssue('chart-cells', `${path}.chart.cells`, stateCells, AUTHORED_CAPACITY_LIMITS_V1.chartCellsPerState, 'cells') };
      }
    }
  }
  totals.stateCells += stateCells;
  totals.stateElements += stateCells;
  if (totals.stateCells > AUTHORED_CAPACITY_LIMITS_V1.stateCellsTotal) {
    return { dimensions, issue: structureCapacityIssue('state-cells-total', 'project base/checkpoint charts', totals.stateCells, AUTHORED_CAPACITY_LIMITS_V1.stateCellsTotal, 'cells') };
  }

  const rowIds = state?.rowIds;
  if (Array.isArray(rowIds)) {
    if (rowIds.length > AUTHORED_CAPACITY_LIMITS_V1.rowIdsPerState) {
      return { dimensions, issue: structureCapacityIssue('row-ids', `${path}.rowIds`, rowIds.length, AUTHORED_CAPACITY_LIMITS_V1.rowIdsPerState, 'row IDs') };
    }
    totals.rowIds += rowIds.length;
    totals.stateElements += rowIds.length;
    if (totals.rowIds > AUTHORED_CAPACITY_LIMITS_V1.rowIdsTotal) {
      return { dimensions, issue: structureCapacityIssue('row-ids', 'project base/checkpoint row IDs', totals.rowIds, AUTHORED_CAPACITY_LIMITS_V1.rowIdsTotal, 'row IDs') };
    }
  }

  const palette = chart?.palette;
  if (Array.isArray(palette)) {
    if (palette.length > AUTHORED_CAPACITY_LIMITS_V1.palettePerState) {
      return { dimensions, issue: structureCapacityIssue('palette', `${path}.chart.palette`, palette.length, AUTHORED_CAPACITY_LIMITS_V1.palettePerState, 'palette entries') };
    }
    totals.palette += palette.length;
    totals.stateElements += palette.length;
    if (totals.palette > AUTHORED_CAPACITY_LIMITS_V1.paletteTotal) {
      return { dimensions, issue: structureCapacityIssue('palette', 'project base/checkpoint palettes', totals.palette, AUTHORED_CAPACITY_LIMITS_V1.paletteTotal, 'palette entries') };
    }
  }

  const yarnAssignments = unknownRecord(state?.machine)?.yarnAssignments;
  if (Array.isArray(yarnAssignments)) {
    if (yarnAssignments.length > AUTHORED_CAPACITY_LIMITS_V1.yarnAssignmentsPerState) {
      return { dimensions, issue: structureCapacityIssue('yarn-assignments', `${path}.machine.yarnAssignments`, yarnAssignments.length, AUTHORED_CAPACITY_LIMITS_V1.yarnAssignmentsPerState, 'assignments') };
    }
    totals.yarnAssignments += yarnAssignments.length;
    totals.stateElements += yarnAssignments.length;
    if (totals.yarnAssignments > AUTHORED_CAPACITY_LIMITS_V1.yarnAssignmentsTotal) {
      return { dimensions, issue: structureCapacityIssue('yarn-assignments', 'project base/checkpoint yarn assignments', totals.yarnAssignments, AUTHORED_CAPACITY_LIMITS_V1.yarnAssignmentsTotal, 'assignments') };
    }
  }

  const overrides = state?.overrides;
  if (Array.isArray(overrides)) {
    if (overrides.length > AUTHORED_CAPACITY_LIMITS_V1.overridesPerState) {
      return { dimensions, issue: structureCapacityIssue('overrides', `${path}.overrides`, overrides.length, AUTHORED_CAPACITY_LIMITS_V1.overridesPerState, 'overrides') };
    }
    totals.overrides += overrides.length;
    totals.stateElements += overrides.length;
    if (totals.overrides > AUTHORED_CAPACITY_LIMITS_V1.overridesTotal) {
      return { dimensions, issue: structureCapacityIssue('overrides', 'project base/checkpoint overrides', totals.overrides, AUTHORED_CAPACITY_LIMITS_V1.overridesTotal, 'overrides') };
    }
  }
  if (totals.stateElements > AUTHORED_CAPACITY_LIMITS_V1.stateElementsTotal) {
    return { dimensions, issue: structureCapacityIssue('state-elements-total', 'project base/checkpoint arrays', totals.stateElements, AUTHORED_CAPACITY_LIMITS_V1.stateElementsTotal, 'array items') };
  }
  return { dimensions, issue: null };
}

/**
 * Cheaply rejects hostile or accidental project amplification before Zod,
 * checkpoint validation, JSON cloning, or edit replay materializes it.
 */
export function inspectColorworkProjectStructureCapacityV1(
  value: unknown,
): ProjectStructureCapacityIssueV1 | null {
  const project = unknownRecord(value);
  if (project === null) return null;
  const totals: ProjectCapacityTotalsV1 = {
    stateCells: 0,
    stateElements: 0,
    rowIds: 0,
    palette: 0,
    yarnAssignments: 0,
    overrides: 0,
  };
  const base = inspectProjectStateCapacityV1(project.base, 'project.base', totals);
  if (base.issue !== null) return base.issue;

  const history = unknownRecord(project.history);
  const entries = history?.entries;
  const checkpoints = history?.checkpoints;
  if (Array.isArray(entries) && entries.length > AUTHORED_CAPACITY_LIMITS_V1.historyEntries) {
    return structureCapacityIssue('history-entries', 'project.history.entries', entries.length, AUTHORED_CAPACITY_LIMITS_V1.historyEntries, 'entries');
  }
  if (Array.isArray(checkpoints) && checkpoints.length > AUTHORED_CAPACITY_LIMITS_V1.historyCheckpoints) {
    return structureCapacityIssue('history-checkpoints', 'project.history.checkpoints', checkpoints.length, AUTHORED_CAPACITY_LIMITS_V1.historyCheckpoints, 'checkpoints');
  }
  if (Array.isArray(checkpoints)) {
    for (let index = 0; index < checkpoints.length; index++) {
      const checkpoint = unknownRecord(checkpoints[index]);
      const inspected = inspectProjectStateCapacityV1(checkpoint?.state, `project.history.checkpoints[${index}].state`, totals);
      if (inspected.issue !== null) return inspected.issue;
    }
  }
  if (!Array.isArray(entries)) return null;

  let width = base.dimensions.width;
  let height = base.dimensions.height;
  let editItems = 0;
  let replayCellVisits = 0;
  let overrideCount = Array.isArray(unknownRecord(project.base)?.overrides)
    ? (unknownRecord(project.base)!.overrides as unknown[]).length
    : 0;
  for (let index = 0; index < entries.length; index++) {
    if (width !== null && height !== null) {
      replayCellVisits += width * height;
      if (replayCellVisits > AUTHORED_CAPACITY_LIMITS_V1.replayCellVisits) {
        return structureCapacityIssue('history-replay-cells', 'project history replay', replayCellVisits, AUTHORED_CAPACITY_LIMITS_V1.replayCellVisits, 'cell visits');
      }
    }
    const edit = unknownRecord(unknownRecord(entries[index])?.edit);
    if (edit === null) continue;
    const editPath = `project.history.entries[${index}].edit`;
    if (edit.kind === 'paint-cells' && Array.isArray(edit.cells)) {
      if (edit.cells.length > AUTHORED_CAPACITY_LIMITS_V1.paintCellsPerEdit) {
        return structureCapacityIssue('edit-items', `${editPath}.cells`, edit.cells.length, AUTHORED_CAPACITY_LIMITS_V1.paintCellsPerEdit, 'paint cells');
      }
      editItems += edit.cells.length;
    } else if (edit.kind === 'insert-row' && Array.isArray(edit.cells)) {
      if (edit.cells.length > AUTHORED_CAPACITY_LIMITS_V1.chartWidth) {
        return structureCapacityIssue('chart-width', `${editPath}.cells`, edit.cells.length, AUTHORED_CAPACITY_LIMITS_V1.chartWidth, 'cells');
      }
      editItems += edit.cells.length;
      if (height !== null) height += 1;
    } else if (edit.kind === 'set-height') {
      if (positiveSafeInteger(edit.height)) {
        if (edit.height > AUTHORED_CAPACITY_LIMITS_V1.chartHeight) {
          return structureCapacityIssue('chart-height', `${editPath}.height`, edit.height, AUTHORED_CAPACITY_LIMITS_V1.chartHeight, 'rows');
        }
        height = edit.height;
      }
      if (Array.isArray(edit.newRowIds)) {
        if (edit.newRowIds.length > AUTHORED_CAPACITY_LIMITS_V1.rowIdsPerState) {
          return structureCapacityIssue('row-ids', `${editPath}.newRowIds`, edit.newRowIds.length, AUTHORED_CAPACITY_LIMITS_V1.rowIdsPerState, 'row IDs');
        }
        editItems += edit.newRowIds.length;
      }
    } else if (edit.kind === 'set-width' && positiveSafeInteger(edit.width)) {
      if (edit.width > AUTHORED_CAPACITY_LIMITS_V1.chartWidth) {
        return structureCapacityIssue('chart-width', `${editPath}.width`, edit.width, AUTHORED_CAPACITY_LIMITS_V1.chartWidth, 'needles');
      }
      width = edit.width;
    } else if (edit.kind === 'add-override') {
      overrideCount += 1;
      if (overrideCount > AUTHORED_CAPACITY_LIMITS_V1.overridesPerState) {
        return structureCapacityIssue('overrides', editPath, overrideCount, AUTHORED_CAPACITY_LIMITS_V1.overridesPerState, 'overrides');
      }
    } else if (edit.kind === 'remove-override') {
      overrideCount = Math.max(0, overrideCount - 1);
    } else if (edit.kind === 'delete-row' && height !== null) {
      height = Math.max(1, height - 1);
    }
    if (editItems > AUTHORED_CAPACITY_LIMITS_V1.editItemsTotal) {
      return structureCapacityIssue('edit-items', 'project history edit arrays', editItems, AUTHORED_CAPACITY_LIMITS_V1.editItemsTotal, 'items');
    }
    if (width !== null && height !== null && width * height > AUTHORED_CAPACITY_LIMITS_V1.chartCellsPerState) {
      return structureCapacityIssue('chart-cells', editPath, width * height, AUTHORED_CAPACITY_LIMITS_V1.chartCellsPerState, 'chart cells');
    }
  }
  return null;
}

function inspectIncomingProjectEditCapacityV1(value: unknown): ProjectStructureCapacityIssueV1 | null {
  const edit = unknownRecord(unknownRecord(value)?.edit);
  if (edit === null) return null;
  if (edit.kind === 'paint-cells' && Array.isArray(edit.cells)
    && edit.cells.length > AUTHORED_CAPACITY_LIMITS_V1.paintCellsPerEdit) {
    return structureCapacityIssue('edit-items', 'entry.edit.cells', edit.cells.length, AUTHORED_CAPACITY_LIMITS_V1.paintCellsPerEdit, 'paint cells');
  }
  if (edit.kind === 'insert-row' && Array.isArray(edit.cells)
    && edit.cells.length > AUTHORED_CAPACITY_LIMITS_V1.chartWidth) {
    return structureCapacityIssue('chart-width', 'entry.edit.cells', edit.cells.length, AUTHORED_CAPACITY_LIMITS_V1.chartWidth, 'cells');
  }
  if (edit.kind === 'set-height' && Array.isArray(edit.newRowIds)
    && edit.newRowIds.length > AUTHORED_CAPACITY_LIMITS_V1.rowIdsPerState) {
    return structureCapacityIssue('row-ids', 'entry.edit.newRowIds', edit.newRowIds.length, AUTHORED_CAPACITY_LIMITS_V1.rowIdsPerState, 'row IDs');
  }
  return null;
}

export type AuthoredOutputCapacityMetricV1 =
  | 'knitout-records'
  | 'lowered-passes'
  | 'selected-cells'
  | 'kcode-records';
export type AuthoredCapacityMetricV1 = ProjectStructureCapacityMetricV1 | AuthoredOutputCapacityMetricV1;
export type AuthoredCapacityEvidenceV1 = 'conservative-estimate' | 'exact-observation' | 'lower-bound';

export interface AuthoredCapacityEstimateV1 {
  readonly knitoutRecords: number;
  readonly loweredPasses: number;
  readonly selectedCells: number;
  readonly kcodeRecords: number;
}

export interface AuthoredCapacityObservedV1 {
  readonly knitoutRecords: number | null;
  readonly loweredPasses: number | null;
  readonly selectedCells: number | null;
  readonly kcodeRecords: number | null;
}

export interface AuthoredCapacityProjectV1 {
  readonly width: number;
  readonly height: number;
  readonly paletteColors: number;
  readonly activeColors: number;
  readonly technique: ProjectState['strategy']['technique'];
  readonly birdseyeMode: 'minimal' | 'full' | null;
  readonly wasteRows: number;
}

interface AuthoredCapacityBaseV1 {
  readonly profile: 'authored-v1';
  readonly limits: {
    readonly knitoutRecords: number;
    readonly loweredPasses: number;
    readonly selectedCells: number;
    readonly kcodeRecords: number;
  };
  readonly project: AuthoredCapacityProjectV1;
  readonly estimate: AuthoredCapacityEstimateV1;
  readonly observed: AuthoredCapacityObservedV1;
}

export interface AuthoredCapacitySupportedV1 extends AuthoredCapacityBaseV1 {
  readonly status: 'supported';
  readonly evidence: null;
  readonly rule: null;
  readonly metric: null;
  readonly required: null;
  readonly limit: null;
  readonly message: null;
  readonly remedy: null;
}

export interface AuthoredCapacityBlockedV1 extends AuthoredCapacityBaseV1 {
  readonly status: 'blocked';
  readonly evidence: AuthoredCapacityEvidenceV1;
  readonly rule: 'project-authored-capacity-v1';
  readonly metric: AuthoredCapacityMetricV1;
  readonly required: number;
  readonly limit: number;
  readonly message: string;
  readonly remedy: string;
}

export type AuthoredCapacityV1 = AuthoredCapacitySupportedV1 | AuthoredCapacityBlockedV1;

const AUTHORED_OUTPUT_LIMITS_V1: AuthoredCapacityBaseV1['limits'] = {
  knitoutRecords: AUTHORED_CAPACITY_LIMITS_V1.knitoutRecords,
  loweredPasses: AUTHORED_CAPACITY_LIMITS_V1.loweredPasses,
  selectedCells: AUTHORED_CAPACITY_LIMITS_V1.selectedCells,
  kcodeRecords: AUTHORED_CAPACITY_LIMITS_V1.kcodeRecords,
};

function currentCapacityProjectV1(project: ColorworkProjectV1): AuthoredCapacityProjectV1 {
  // Structural admission has already bounded this replay to 20m cell visits
  // and one 75,600-cell current state. The exact active-color set avoids
  // refusing large two-used-color charts merely because their palette retains
  // additional unused entries.
  const state = materializeColorworkProject(project).state;
  const activePaletteIndexes = new Set<number>();
  for (const row of state.chart.cells) {
    for (const paletteIndex of row) activePaletteIndexes.add(paletteIndex);
  }
  return {
    width: state.chart.width,
    height: state.chart.height,
    paletteColors: state.chart.palette.length,
    activeColors: activePaletteIndexes.size,
    technique: state.strategy.technique,
    birdseyeMode: state.strategy.technique === 'birdseye'
      ? state.strategy.birdseyeMode ?? 'minimal'
      : null,
    wasteRows: state.frame.wasteRows,
  };
}

/**
 * Upper bound on frame passes (waste interlock, carrier intro, closing waste,
 * park-out) in the Customist-matched configurations authored backings compile
 * through: 87 interlock passes plus intro and closing sections.
 */
const CUSTOMIST_FRAME_PASS_BOUND_V1 = 160;

function capacityEstimateV1(project: AuthoredCapacityProjectV1): AuthoredCapacityEstimateV1 {
  // Conservative upper bounds for the fixed V1 rectangular compiler: every
  // design cell can expand to two actions per active carrier (measured at
  // about 1.1 per carrier for both backings), and every frame pass can select
  // the full width on both beds.
  // Exact post-compile/lowering counts are still recorded and checked before
  // output can become Surface-proven.
  const colors = Math.max(1, Math.min(4, project.activeColors));
  const recordMultiplier = colors * 2;
  // At most 16 body/positioning passes per design row, four bind-off
  // movements per needle, and the fixed frame bound. The width-aware
  // bind-off term is material at short, full-bed charts where a height-only
  // estimate under-counts lowering.
  const loweredPasses = project.height * 16
    + project.width * 4
    + CUSTOMIST_FRAME_PASS_BOUND_V1 * 2;
  return {
    knitoutRecords: recordMultiplier * project.width * project.height
      + 2 * project.width * CUSTOMIST_FRAME_PASS_BOUND_V1
      + 1_200,
    loweredPasses,
    // Measured body selections are 1.41-1.43 per design cell at two colors
    // and up to 2.43 at four, for both backings; frame selections are about
    // 130 per needle of width.
    selectedCells: Math.ceil((1 + 0.4 * colors) * project.width * project.height)
      + 140 * project.width
      + 10_000,
    // The pinned serializer emits at most 12 records per pass plus three
    // document headers. This keeps every pass-admitted authored artifact below
    // the shared KCode parser/materialization ceiling.
    kcodeRecords: 3 + 12 * loweredPasses,
  };
}

function supportedCapacityV1(
  project: AuthoredCapacityProjectV1,
  estimate: AuthoredCapacityEstimateV1,
): AuthoredCapacitySupportedV1 {
  return {
    profile: 'authored-v1',
    status: 'supported',
    evidence: null,
    limits: AUTHORED_OUTPUT_LIMITS_V1,
    project,
    estimate,
    observed: { knitoutRecords: null, loweredPasses: null, selectedCells: null, kcodeRecords: null },
    rule: null,
    metric: null,
    required: null,
    limit: null,
    message: null,
    remedy: null,
  };
}

function structuralBlockedCapacityV1(
  project: ColorworkProjectV1,
  issue: ProjectStructureCapacityIssueV1,
): AuthoredCapacityBlockedV1 {
  const base = unknownRecord(project)?.base;
  const state = unknownRecord(base);
  const chart = unknownRecord(state?.chart);
  const strategy = unknownRecord(state?.strategy);
  const frame = unknownRecord(state?.frame);
  const rawTechnique = strategy?.technique;
  const technique: AuthoredCapacityProjectV1['technique'] = rawTechnique === 'fairisle'
    || rawTechnique === 'ladder-back'
    || rawTechnique === 'lined'
    || rawTechnique === 'birdseye'
    || rawTechnique === 'complement'
    ? rawTechnique
    : 'fairisle';
  const rawBirdseyeMode = strategy?.birdseyeMode;
  const summary: AuthoredCapacityProjectV1 = {
    width: positiveSafeInteger(chart?.width) ? chart.width : 1,
    height: positiveSafeInteger(chart?.height) ? chart.height : 1,
    paletteColors: Array.isArray(chart?.palette) ? chart.palette.length : 1,
    activeColors: Array.isArray(chart?.palette) ? chart.palette.length : 1,
    technique,
    birdseyeMode: technique === 'birdseye' && (rawBirdseyeMode === 'minimal' || rawBirdseyeMode === 'full')
      ? rawBirdseyeMode
      : technique === 'birdseye' ? 'minimal' : null,
    wasteRows: positiveSafeInteger(frame?.wasteRows) ? frame.wasteRows : 20,
  };
  const supported = supportedCapacityV1(summary, capacityEstimateV1(summary));
  return {
    ...supported,
    status: 'blocked',
    evidence: 'exact-observation',
    rule: issue.rule,
    metric: issue.metric,
    required: issue.required,
    limit: issue.limit,
    message: issue.message,
    remedy: 'Reduce project dimensions or history before compiling.',
  };
}

function blockCapacityV1(
  capacity: AuthoredCapacityBaseV1,
  metric: AuthoredCapacityMetricV1,
  required: number,
  limit: number,
  phase: 'preflight' | 'compiled' | 'lowering' | 'lower-bound',
): AuthoredCapacityBlockedV1 {
  const label = metric === 'knitout-records' ? 'Knitout records'
    : metric === 'lowered-passes' ? 'emitted KCode passes'
    : metric === 'selected-cells' ? 'selected raster cells'
    : metric === 'kcode-records' ? 'KCode records'
    : metric.replace(/-/g, ' ');
  const remedy = 'Reduce rows or needles, or choose a lower-expansion backing strategy such as Fairisle.';
  const qualifier = phase === 'preflight' ? 'can require up to'
    : phase === 'lower-bound' ? 'requires at least'
    : 'requires';
  return {
    ...capacity,
    status: 'blocked',
    evidence: phase === 'preflight' ? 'conservative-estimate'
      : phase === 'lower-bound' ? 'lower-bound'
      : 'exact-observation',
    rule: 'project-authored-capacity-v1',
    metric,
    required,
    limit,
    message: `${capacity.project.width}x${capacity.project.height} ${capacity.project.technique} ${qualifier} ${required.toLocaleString('en-US')} ${label}; the authored V1 limit is ${limit.toLocaleString('en-US')}. ${remedy}`,
    remedy,
  };
}

/** Assess the active project without cloning cells or replaying edits. */
export function assessAuthoredCapacityV1(project: ColorworkProjectV1): AuthoredCapacityV1 {
  const structureIssue = inspectColorworkProjectStructureCapacityV1(project);
  if (structureIssue !== null) return structuralBlockedCapacityV1(project, structureIssue);
  const current = currentCapacityProjectV1(project);
  const estimate = capacityEstimateV1(current);
  const supported = supportedCapacityV1(current, estimate);
  if (estimate.knitoutRecords > supported.limits.knitoutRecords) {
    return blockCapacityV1(supported, 'knitout-records', estimate.knitoutRecords, supported.limits.knitoutRecords, 'preflight');
  }
  if (estimate.loweredPasses > supported.limits.loweredPasses) {
    return blockCapacityV1(supported, 'lowered-passes', estimate.loweredPasses, supported.limits.loweredPasses, 'preflight');
  }
  if (estimate.selectedCells > supported.limits.selectedCells) {
    return blockCapacityV1(supported, 'selected-cells', estimate.selectedCells, supported.limits.selectedCells, 'preflight');
  }
  if (estimate.kcodeRecords > supported.limits.kcodeRecords) {
    return blockCapacityV1(supported, 'kcode-records', estimate.kcodeRecords, supported.limits.kcodeRecords, 'preflight');
  }
  return supported;
}

/** Add exact compiler/lowering counts and fail closed on any exceeded budget. */
export function observeAuthoredCapacityV1(
  capacity: AuthoredCapacityV1,
  observed: Partial<AuthoredCapacityObservedV1>,
): AuthoredCapacityV1 {
  if (capacity.status === 'blocked') return capacity;
  const next: AuthoredCapacitySupportedV1 = {
    ...capacity,
    observed: { ...capacity.observed, ...observed },
  };
  const checks: Array<readonly [keyof AuthoredCapacityObservedV1, AuthoredCapacityMetricV1]> = [
    ['knitoutRecords', 'knitout-records'],
    ['loweredPasses', 'lowered-passes'],
    ['selectedCells', 'selected-cells'],
    ['kcodeRecords', 'kcode-records'],
  ];
  for (const [key, metric] of checks) {
    const required = next.observed[key];
    const limit = next.limits[key];
    if (required !== null && required > limit) return blockCapacityV1(next, metric, required, limit, key === 'knitoutRecords' ? 'compiled' : 'lowering');
  }
  return next;
}

/** Record an aborted lowering refusal without pretending its first rejected
 * item is a completed exact observation. */
export function refuseAuthoredCapacityFromLowerBoundV1(
  capacity: AuthoredCapacitySupportedV1,
  metric: AuthoredOutputCapacityMetricV1,
  requiredLowerBound: number,
): AuthoredCapacityBlockedV1 {
  const limit = capacity.limits[
    metric === 'knitout-records' ? 'knitoutRecords'
      : metric === 'lowered-passes' ? 'loweredPasses'
        : metric === 'selected-cells' ? 'selectedCells'
          : 'kcodeRecords'
  ];
  return blockCapacityV1(capacity, metric, Math.max(requiredLowerBound, limit + 1), limit, 'lower-bound');
}

const ChartSchema = z.unknown().transform((value, context): ColorworkChartV1 => {
  try {
    return parseColorworkChartV1(value);
  } catch (error) {
    const issues = error instanceof InvalidColorworkChartError ? error.issues : [String(error)];
    for (const issue of issues) context.addIssue({ code: 'custom', message: issue });
    return z.NEVER;
  }
});

const ProjectStateSchema: z.ZodType<ProjectState> = z.object({
  chart: ChartSchema,
  rowIds: z.array(RowId),
  machine: z.object({
    profile: z.literal(COLORWORK_PROJECT_PROFILE),
    needleOffset: z.number().int().min(1).max(252),
    yarnAssignments: z.array(YarnAssignmentSchema).max(4),
  }),
  strategy: StrategySchema,
  frame: FrameSchema,
  overrides: z.array(ProjectOverrideSchema),
}).superRefine(validateStateRelationships);

const ProjectSchema: z.ZodType<ColorworkProjectV1> = z.object({
  kind: z.literal(COLORWORK_PROJECT_KIND),
  version: z.literal(COLORWORK_PROJECT_VERSION),
  id: Id,
  title: z.string().min(1).max(200),
  base: ProjectStateSchema,
  history: z.object({
    cursor: z.number().int().min(0),
    entries: z.array(z.object({ id: Id, source: z.enum(['human', 'assistant', 'system']), edit: ProjectEditSchema })),
    checkpoints: z.array(z.object({ cursor: z.number().int().min(0), state: ProjectStateSchema })),
  }),
}).superRefine((project, context) => {
  if (project.history.cursor > project.history.entries.length) context.addIssue({ code: 'custom', path: ['history', 'cursor'], message: 'cursor exceeds history length' });
  const entryIds = new Set<string>();
  project.history.entries.forEach((entry, index) => {
    if (entryIds.has(entry.id)) context.addIssue({ code: 'custom', path: ['history', 'entries', index, 'id'], message: `duplicate edit id "${entry.id}"` });
    entryIds.add(entry.id);
  });
  let prior = -1;
  project.history.checkpoints.forEach((checkpoint, index) => {
    if (checkpoint.cursor <= prior || checkpoint.cursor > project.history.entries.length) context.addIssue({ code: 'custom', path: ['history', 'checkpoints', index, 'cursor'], message: 'checkpoint cursors must be ascending and within history' });
    prior = checkpoint.cursor;
  });
});

function validateStateRelationships(state: ProjectState, context: z.RefinementCtx): void {
  if (state.rowIds.length !== state.chart.height) context.addIssue({ code: 'custom', path: ['rowIds'], message: `rowIds has ${state.rowIds.length} entries; expected ${state.chart.height}` });
  if (new Set(state.rowIds).size !== state.rowIds.length) context.addIssue({ code: 'custom', path: ['rowIds'], message: 'rowIds must be unique' });
  if (state.machine.needleOffset + state.chart.width - 1 > 252) context.addIssue({ code: 'custom', path: ['machine', 'needleOffset'], message: 'chart exceeds the 252-needle bed at this offset' });
  const paletteIds = new Set(state.chart.palette.map((entry) => entry.id));
  const assignedPalette = new Set<string>();
  const assignedCarriers = new Set<string>();
  state.machine.yarnAssignments.forEach((assignment, index) => {
    if (!paletteIds.has(assignment.paletteId)) context.addIssue({ code: 'custom', path: ['machine', 'yarnAssignments', index, 'paletteId'], message: `unknown palette id "${assignment.paletteId}"` });
    if (assignedPalette.has(assignment.paletteId)) context.addIssue({ code: 'custom', path: ['machine', 'yarnAssignments', index], message: `palette "${assignment.paletteId}" is assigned twice` });
    if (assignedCarriers.has(assignment.carrier)) context.addIssue({ code: 'custom', path: ['machine', 'yarnAssignments', index], message: `carrier C${assignment.carrier} is assigned twice` });
    assignedPalette.add(assignment.paletteId);
    assignedCarriers.add(assignment.carrier);
  });
  const overrideIds = new Set<string>();
  state.overrides.forEach((override, index) => {
    if (overrideIds.has(override.id)) context.addIssue({ code: 'custom', path: ['overrides', index, 'id'], message: `duplicate override id "${override.id}"` });
    overrideIds.add(override.id);
  });
}

function formatIssues(error: z.ZodError): string[] {
  return error.issues.map((issue) => `${issue.path.length ? issue.path.join('.') + ': ' : ''}${issue.message}`);
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function jsonStringCodeUnits(value: string): number {
  let codeUnits = 2; // opening and closing quotes
  for (let index = 0; index < value.length; index++) {
    const code = value.charCodeAt(index);
    if (code === 0x22 || code === 0x5c || code === 0x08 || code === 0x0c
      || code === 0x0a || code === 0x0d || code === 0x09) {
      codeUnits += 2;
    } else if (code <= 0x1f) {
      codeUnits += 6;
    } else if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        codeUnits += 2;
        index++;
      } else {
        codeUnits += 6;
      }
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      codeUnits += 6;
    } else {
      codeUnits++;
    }
  }
  return codeUnits;
}

/** Exact compact-JSON size without allocating the serialized project string. */
function jsonValueCodeUnits(value: unknown): number {
  if (value === null) return 4;
  if (typeof value === 'string') return jsonStringCodeUnits(value);
  if (typeof value === 'number') return JSON.stringify(value).length;
  if (typeof value === 'boolean') return value ? 4 : 5;
  if (Array.isArray(value)) {
    let codeUnits = 2 + Math.max(0, value.length - 1);
    for (const item of value) codeUnits += jsonValueCodeUnits(item);
    return codeUnits;
  }
  if (typeof value === 'object') {
    const entries = Object.entries(value).filter(([, item]) => item !== undefined);
    let codeUnits = 2 + Math.max(0, entries.length - 1);
    for (const [key, item] of entries) {
      codeUnits += jsonStringCodeUnits(key) + 1 + jsonValueCodeUnits(item);
    }
    return codeUnits;
  }
  throw new Error(`Project contains a non-JSON value of type ${typeof value}.`);
}

function parseProjectStructure(value: unknown): ColorworkProjectV1 {
  const capacityIssue = inspectColorworkProjectStructureCapacityV1(value);
  if (capacityIssue !== null) throw new InvalidColorworkProjectError([capacityIssue.message]);
  const parsed = ProjectSchema.safeParse(value);
  if (!parsed.success) throw new InvalidColorworkProjectError(formatIssues(parsed.error));
  const serializedCodeUnits = jsonValueCodeUnits(parsed.data);
  if (serializedCodeUnits > AUTHORED_CAPACITY_LIMITS_V1.projectSourceCodeUnits) {
    throw new InvalidColorworkProjectError([
      structureCapacityIssue(
        'project-source',
        'project canonical JSON',
        serializedCodeUnits,
        AUTHORED_CAPACITY_LIMITS_V1.projectSourceCodeUnits,
        'code units',
      ).message,
    ]);
  }
  return parsed.data;
}

export function parseColorworkProjectV1(value: unknown): ColorworkProjectV1 {
  const project = parseProjectStructure(value);
  // Checkpoints accelerate replay but never become authority. Validate every
  // stored checkpoint against a clean base+op-log replay before using one.
  try {
    let replayed = clone(project.base);
    let checkpointIndex = 0;
    for (let cursor = 1; cursor <= project.history.entries.length; cursor += 1) {
      replayed = applyEditToState(replayed, project.history.entries[cursor - 1]!.edit);
      const checkpoint = project.history.checkpoints[checkpointIndex];
      if (checkpoint?.cursor === cursor) {
        if (JSON.stringify(checkpoint.state) !== JSON.stringify(replayed)) throw new Error(`checkpoint at cursor ${cursor} does not match authoritative edit replay`);
        checkpointIndex += 1;
      }
    }
    materializeColorworkProject(project);
  } catch (error) {
    throw new InvalidColorworkProjectError([error instanceof Error ? error.message : String(error)]);
  }
  return project;
}

export function parseColorworkProjectV1Json(json: string): ColorworkProjectV1 {
  try {
    if (json.length > AUTHORED_CAPACITY_LIMITS_V1.projectSourceCodeUnits) {
      throw new InvalidColorworkProjectError([
        structureCapacityIssue(
          'project-source',
          'project source',
          json.length,
          AUTHORED_CAPACITY_LIMITS_V1.projectSourceCodeUnits,
          'code units',
        ).message,
      ]);
    }
    return parseColorworkProjectV1(JSON.parse(json) as unknown);
  } catch (error) {
    if (error instanceof InvalidColorworkProjectError) throw error;
    throw new InvalidColorworkProjectError([`file is not valid JSON: ${error instanceof Error ? error.message : String(error)}`]);
  }
}

/** Canonical compact project JSON. Every accepted project is guaranteed to
 * remain within the same source ceiling when saved and reopened. */
export function serializeColorworkProjectV1(projectValue: ColorworkProjectV1): string {
  return JSON.stringify(parseColorworkProjectV1(projectValue));
}

export function createColorworkProjectV1(chartValue: unknown, options: { id: string; title?: string; needleOffset?: number }): ColorworkProjectV1 {
  const capacityIssue = inspectColorworkProjectStructureCapacityV1({ base: { chart: chartValue } });
  if (capacityIssue !== null) throw new InvalidColorworkProjectError([capacityIssue.message]);
  const chart = parseColorworkChartV1(chartValue);
  const id = Id.parse(options.id);
  const needleOffset = options.needleOffset ?? Math.floor((252 - chart.width) / 2) + 1;
  const carriers = ['2', '3', '4', '5'] as const;
  const base: ProjectState = {
    chart,
    rowIds: Array.from({ length: chart.height }, (_, index) => `row_${String(index + 1).padStart(4, '0')}`),
    machine: {
      profile: COLORWORK_PROJECT_PROFILE,
      needleOffset,
      yarnAssignments: chart.palette.slice(0, 4).map((entry, index) => ({ paletteId: entry.id, carrier: carriers[index]!, yarnName: entry.name })),
    },
    // Studio's Customist-matched birdseye program is laid out for four colors on C2-C5.
    strategy: { technique: chart.palette.length === 4 ? 'birdseye' : 'fairisle', birdseyeMode: 'minimal', floatLimit: 5 },
    frame: { wasteRows: 20, drawThread: true, bindOff: 'machine-bindoff' },
    overrides: [],
  };
  return parseColorworkProjectV1({
    kind: COLORWORK_PROJECT_KIND,
    version: COLORWORK_PROJECT_VERSION,
    id,
    title: options.title ?? chart.title ?? 'Untitled colorwork project',
    base,
    history: { cursor: 0, entries: [], checkpoints: [] },
  });
}

export function renameColorworkProject(projectValue: ColorworkProjectV1, titleValue: string): ColorworkProjectV1 {
  const title = z.string().trim().min(1).max(200).parse(titleValue);
  const project = clone(projectValue);
  project.title = title;
  project.base.chart.title = title;
  for (const checkpoint of project.history.checkpoints) checkpoint.state.chart.title = title;
  return parseColorworkProjectV1(project);
}

function assertPaletteIndex(state: ProjectState, index: number): void {
  if (index >= state.chart.palette.length) throw new Error(`palette index ${index} does not exist`);
}

function applyEditToState(stateValue: ProjectState, editValue: ProjectEdit): ProjectState {
  const state = clone(stateValue);
  const edit = ProjectEditSchema.parse(editValue);
  const rowIndex = (rowId: string) => {
    const index = state.rowIds.indexOf(rowId);
    if (index < 0) throw new Error(`edit targets missing row "${rowId}"`);
    return index;
  };
  switch (edit.kind) {
    case 'paint-cells':
      for (const cell of edit.cells) {
        assertPaletteIndex(state, cell.paletteIndex);
        if (cell.column >= state.chart.width) throw new Error(`paint column ${cell.column} exceeds chart width ${state.chart.width}`);
        state.chart.cells[rowIndex(cell.rowId)]![cell.column] = cell.paletteIndex;
      }
      break;
    case 'insert-row': {
      if (state.rowIds.includes(edit.rowId)) throw new Error(`row id "${edit.rowId}" already exists`);
      if (edit.cells.length !== state.chart.width) throw new Error(`inserted row has ${edit.cells.length} cells; expected ${state.chart.width}`);
      edit.cells.forEach((index) => assertPaletteIndex(state, index));
      const index = edit.afterRowId === null ? 0 : rowIndex(edit.afterRowId) + 1;
      state.rowIds.splice(index, 0, edit.rowId);
      state.chart.cells.splice(index, 0, [...edit.cells]);
      state.chart.height += 1;
      break;
    }
    case 'delete-row': {
      if (state.chart.height === 1) throw new Error('a project must retain at least one row');
      const index = rowIndex(edit.rowId);
      state.rowIds.splice(index, 1);
      state.chart.cells.splice(index, 1);
      state.chart.height -= 1;
      break;
    }
    case 'set-width':
      assertPaletteIndex(state, edit.fillPaletteIndex);
      if (state.machine.needleOffset + edit.width - 1 > 252) throw new Error('new width exceeds the 252-needle bed at the current offset');
      state.chart.cells = state.chart.cells.map((row) => row.length >= edit.width ? row.slice(0, edit.width) : [...row, ...Array(edit.width - row.length).fill(edit.fillPaletteIndex) as number[]]);
      state.chart.width = edit.width;
      break;
    case 'set-height': {
      assertPaletteIndex(state, edit.fillPaletteIndex);
      const added = edit.height - state.chart.height;
      const expectedIds = Math.max(0, added);
      if (edit.newRowIds.length !== expectedIds) throw new Error(`set-height requires ${expectedIds} new row ids; received ${edit.newRowIds.length}`);
      if (new Set(edit.newRowIds).size !== edit.newRowIds.length || edit.newRowIds.some((id) => state.rowIds.includes(id))) throw new Error('set-height row ids must be new and unique');
      if (added > 0) {
        const rows = edit.newRowIds.map(() => Array(state.chart.width).fill(edit.fillPaletteIndex) as number[]);
        if (state.chart.rowNumbering === 'bottom-up') { state.rowIds.unshift(...edit.newRowIds); state.chart.cells.unshift(...rows); }
        else { state.rowIds.push(...edit.newRowIds); state.chart.cells.push(...rows); }
      } else if (added < 0) {
        const remove = -added;
        if (state.chart.rowNumbering === 'bottom-up') { state.rowIds.splice(0, remove); state.chart.cells.splice(0, remove); }
        else { state.rowIds.splice(edit.height, remove); state.chart.cells.splice(edit.height, remove); }
      }
      state.chart.height = edit.height;
      break;
    }
    case 'set-needle-offset':
      if (edit.needleOffset + state.chart.width - 1 > 252) throw new Error('chart exceeds the 252-needle bed at this offset');
      state.machine.needleOffset = edit.needleOffset;
      break;
    case 'set-strategy': state.strategy = edit.strategy; break;
    case 'set-frame': state.frame = edit.frame; break;
    case 'set-yarn-assignment': {
      if (!state.chart.palette.some((entry) => entry.id === edit.assignment.paletteId)) throw new Error(`unknown palette id "${edit.assignment.paletteId}"`);
      state.machine.yarnAssignments = state.machine.yarnAssignments.filter((item) => item.paletteId !== edit.assignment.paletteId && item.carrier !== edit.assignment.carrier);
      state.machine.yarnAssignments.push(edit.assignment);
      state.machine.yarnAssignments.sort((a, b) => a.carrier.localeCompare(b.carrier));
      break;
    }
    case 'remove-yarn-assignment': state.machine.yarnAssignments = state.machine.yarnAssignments.filter((item) => item.paletteId !== edit.paletteId); break;
    case 'set-palette-entry': {
      const paletteEntry = state.chart.palette.find((entry) => entry.id === edit.paletteId);
      if (!paletteEntry) throw new Error(`unknown palette id "${edit.paletteId}"`);
      paletteEntry.name = edit.name;
      paletteEntry.hex = edit.hex.toUpperCase();
      break;
    }
    case 'add-override':
      if (state.overrides.some((item) => item.id === edit.override.id)) throw new Error(`override id "${edit.override.id}" already exists`);
      if (state.overrides.length >= AUTHORED_CAPACITY_LIMITS_V1.overridesPerState) throw new Error(`project supports at most ${AUTHORED_CAPACITY_LIMITS_V1.overridesPerState.toLocaleString('en-US')} active overrides`);
      state.overrides.push(edit.override);
      break;
    case 'remove-override': {
      if (!state.overrides.some((item) => item.id === edit.overrideId)) throw new Error(`override id "${edit.overrideId}" does not exist`);
      state.overrides = state.overrides.filter((item) => item.id !== edit.overrideId);
      break;
    }
  }
  return state;
}

export function materializeColorworkProject(project: ColorworkProjectV1): MaterializedColorworkProject {
  const checkpoint = [...project.history.checkpoints].reverse().find((item) => item.cursor <= project.history.cursor);
  let state = clone(checkpoint?.state ?? project.base);
  const start = checkpoint?.cursor ?? 0;
  for (let index = start; index < project.history.cursor; index += 1) state = applyEditToState(state, project.history.entries[index]!.edit);
  const rows = new Set(state.rowIds);
  const overrides = state.overrides.map((override): ResolvedProjectOverride => {
    if (!rows.has(override.anchor.rowId)) return { override, status: 'quarantined', reason: `Row "${override.anchor.rowId}" no longer exists.` };
    if (override.kind === 'stitch' && override.anchor.needleIndex >= state.chart.width) return { override, status: 'quarantined', reason: `Needle index ${override.anchor.needleIndex} is outside width ${state.chart.width}.` };
    return { override, status: 'active' };
  });
  return { state, overrides };
}

export function appendProjectEdit(projectValue: ColorworkProjectV1, entryValue: ProjectEditEntry): ColorworkProjectV1 {
  const existingCapacityIssue = inspectColorworkProjectStructureCapacityV1(projectValue);
  if (existingCapacityIssue !== null) throw new InvalidColorworkProjectError([existingCapacityIssue.message]);
  const incomingCapacityIssue = inspectIncomingProjectEditCapacityV1(entryValue);
  if (incomingCapacityIssue !== null) throw new InvalidColorworkProjectError([incomingCapacityIssue.message]);
  const project = clone(projectValue);
  const entry = z.object({ id: Id, source: z.enum(['human', 'assistant', 'system']), edit: ProjectEditSchema }).parse(entryValue);
  if (project.history.entries.some((item) => item.id === entry.id)) throw new InvalidColorworkProjectError([`duplicate edit id "${entry.id}"`]);
  project.history.entries = project.history.entries.slice(0, project.history.cursor);
  project.history.checkpoints = project.history.checkpoints.filter((item) => item.cursor <= project.history.cursor);
  project.history.entries.push(entry);
  project.history.cursor += 1;
  while (project.history.entries.length > AUTHORED_CAPACITY_LIMITS_V1.historyEntries) {
    const oldestCheckpoint = project.history.checkpoints.find((checkpoint) => checkpoint.cursor > 0);
    const rebaseCursor = oldestCheckpoint?.cursor ?? Math.min(PROJECT_CHECKPOINT_INTERVAL, project.history.cursor);
    let rebasedState = clone(project.base);
    for (let index = 0; index < rebaseCursor; index += 1) {
      rebasedState = applyEditToState(rebasedState, project.history.entries[index]!.edit);
    }
    project.base = rebasedState;
    project.history.entries = project.history.entries.slice(rebaseCursor);
    project.history.cursor -= rebaseCursor;
    project.history.checkpoints = project.history.checkpoints
      .filter((checkpoint) => checkpoint.cursor > rebaseCursor)
      .map((checkpoint) => ({ cursor: checkpoint.cursor - rebaseCursor, state: checkpoint.state }));
  }
  const capacityIssue = inspectColorworkProjectStructureCapacityV1(project);
  if (capacityIssue !== null) throw new InvalidColorworkProjectError([capacityIssue.message]);
  // Materialize now so invalid edits fail at the boundary, not during render.
  const materialized = materializeColorworkProject(project);
  if (project.history.cursor % PROJECT_CHECKPOINT_INTERVAL === 0) project.history.checkpoints.push({ cursor: project.history.cursor, state: materialized.state });
  // The incoming project was already authoritative and the new edit was
  // materialized above. Structural validation is sufficient on the hot edit
  // path; full base+history replay remains mandatory when opening a file.
  return parseProjectStructure(project);
}

export function undoProjectEdit(projectValue: ColorworkProjectV1): ColorworkProjectV1 {
  const project = clone(projectValue);
  project.history.cursor = Math.max(0, project.history.cursor - 1);
  return parseProjectStructure(project);
}

export function redoProjectEdit(projectValue: ColorworkProjectV1): ColorworkProjectV1 {
  const project = clone(projectValue);
  project.history.cursor = Math.min(project.history.entries.length, project.history.cursor + 1);
  return parseProjectStructure(project);
}
