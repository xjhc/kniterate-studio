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
  wasteRows: z.number().int().min(1).max(200).default(20),
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
  height: z.number().int().min(1),
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

function parseProjectStructure(value: unknown): ColorworkProjectV1 {
  const parsed = ProjectSchema.safeParse(value);
  if (!parsed.success) throw new InvalidColorworkProjectError(formatIssues(parsed.error));
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
    return parseColorworkProjectV1(JSON.parse(json) as unknown);
  } catch (error) {
    if (error instanceof InvalidColorworkProjectError) throw error;
    throw new InvalidColorworkProjectError([`file is not valid JSON: ${error instanceof Error ? error.message : String(error)}`]);
  }
}

export function createColorworkProjectV1(chartValue: unknown, options: { id: string; title?: string; needleOffset?: number }): ColorworkProjectV1 {
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
    strategy: { technique: chart.palette.length === 2 ? 'fairisle' : 'birdseye', birdseyeMode: 'minimal', floatLimit: 5 },
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
      state.overrides.push(edit.override);
      break;
    case 'remove-override': state.overrides = state.overrides.filter((item) => item.id !== edit.overrideId); break;
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
  const project = clone(projectValue);
  const entry = z.object({ id: Id, source: z.enum(['human', 'assistant', 'system']), edit: ProjectEditSchema }).parse(entryValue);
  if (project.history.entries.some((item) => item.id === entry.id)) throw new InvalidColorworkProjectError([`duplicate edit id "${entry.id}"`]);
  project.history.entries = project.history.entries.slice(0, project.history.cursor);
  project.history.checkpoints = project.history.checkpoints.filter((item) => item.cursor <= project.history.cursor);
  project.history.entries.push(entry);
  project.history.cursor += 1;
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
