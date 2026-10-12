import {
  appendProjectEdit,
  appendProjectOperation,
  createColorworkProjectV1,
  materializeColorworkProject,
  type ColorworkProjectV1,
  type ProjectEdit,
  type ProjectState,
} from '@kniterate-studio/project-contract';
import { createBeanieProject, beanieIntentOf } from './beanie';

/**
 * A swatch for a project: a small piece in the project's own stitch, yarns,
 * backing and gauge, made by the project's own construction, so the fabric
 * you measure is the fabric the piece knits. It is a project document like
 * any other; the same pipeline and verdict decide whether it can be knitted.
 */

/** Wide and long enough to measure 10 cm in the middle, clear of the edges. */
export const SWATCH_CM = 15;
/** A rib band at each end, to measure the rib's rows. */
const SWATCH_RIB_CM = 5;
/** The narrowest flat beanie the construction knits (2 mod 4 for the rib). */
const SWATCH_BEANIE_NEEDLES = 62;

const group = 'create-swatch';

function yarnOf(state: ProjectState, index: number): { name: string; hex: string } | null {
  const entry = state.chart.palette[index];
  if (!entry) return null;
  return { name: state.machine.yarnAssignments.find((item) => item.paletteId === entry.id)?.yarnName ?? entry.name, hex: entry.hex };
}

/** Whether a project has a swatch: every garment and scarf does; a colour chart once it has a gauge. */
export function hasSwatch(state: ProjectState): boolean {
  return state.object !== undefined ? state.gauge !== undefined || state.object.kind !== 'beanie' : state.gauge !== undefined;
}

/** The swatch for `project`, or null when it has no gauge to measure (a chart sized in needles). */
/** The swatch knits with the project's own machine setup too, so it tests the start the piece will have. */
export function swatchProject(project: ColorworkProjectV1): ColorworkProjectV1 | null {
  const swatch = swatchOf(project);
  const setup = materializeColorworkProject(project).state.setup;
  return swatch && setup ? appendProjectEdit(swatch, { id: `${group}-setup`, source: 'system', edit: { kind: 'set-machine-setup', setup } }) : swatch;
}

function swatchOf(project: ColorworkProjectV1): ColorworkProjectV1 | null {
  const { state } = materializeColorworkProject(project);
  const object = state.object;
  const id = `${project.id}-swatch`;
  const title = `${project.title} swatch`;
  if (object?.kind === 'sweater' || object?.kind === 'panel') {
    // The body stitch between two rib bands: the sweater's hem rib, or the scarf's own ends.
    const rib = object.kind === 'sweater' ? object.trims.hem.rib : object.ends.rib;
    const yarn = yarnOf(state, 0)!;
    const created = createColorworkProjectV1({
      kind: 'knitlab-colorwork-chart', version: 1, title, width: 1, height: 1, rowNumbering: 'bottom-up',
      palette: [{ id: 'main', name: yarn.name, hex: yarn.hex }], cells: [[0]],
    }, { id, title });
    const edits: ProjectEdit[] = [
      { kind: 'set-object', object: { kind: 'panel', widthCm: SWATCH_CM, lengthCm: SWATCH_CM + 2 * SWATCH_RIB_CM, body: { name: object.body.name, texture: [...object.body.texture] }, ends: { rib, cm: SWATCH_RIB_CM }, ...(object.ribGauge ? { ribGauge: { ...object.ribGauge } } : {}) } },
      { kind: 'set-yarn-assignment', assignment: { paletteId: 'main', carrier: '3', yarnName: yarn.name } },
      ...(state.gauge ? [{ kind: 'set-gauge' as const, gauge: { ...state.gauge } }] : []),
    ];
    return appendProjectOperation(created, { group, source: 'system', label: `Create ${title}`, edits });
  }
  if (object?.kind === 'beanie') {
    // A narrow beanie with an unfolded cuff: the cuff, the body and its backing knit exactly as the hat's do.
    const intent = beanieIntentOf(state)!;
    const gauge = intent.bodyGauge;
    if (!gauge) return null;
    const ease = intent.ease ?? -0.1;
    const headCircumferenceCm = Math.round(((SWATCH_BEANIE_NEEDLES - 2) / gauge.stitchesPer10cm * 10) / (1 + ease) * 10) / 10;
    const cuffed = intent.construction === 'rib-cuff-jersey-body';
    const main = yarnOf(state, 0)!;
    const accent = cuffed ? yarnOf(state, 1) : null;
    const swatch = createBeanieProject({
      title, headCircumferenceCm, ease, bodyCm: SWATCH_CM, bodyGauge: gauge, main,
      ...(cuffed ? { cuffCm: SWATCH_RIB_CM, ribGauge: intent.ribGauge, fold: false, backing: intent.backing, ...(accent ? { accent } : {}) } : {}),
    }, { id, source: 'system', group });
    if (!accent) return swatch;
    // A small check of both yarns over the body, so its backing works as it does under a motif.
    const painted = materializeColorworkProject(swatch).state;
    const ribRows = beanieIntentOf(painted)?.construction === 'rib-cuff-jersey-body' && painted.object?.kind === 'beanie' ? painted.object.cuffRows ?? 0 : 0;
    const bodyRows = painted.chart.height - ribRows;
    const cells = painted.rowIds.slice(0, bodyRows).flatMap((rowId, row) => Array.from({ length: painted.chart.width }, (_, column) => ({ rowId, column, paletteIndex: (Math.floor(row / 4) + Math.floor(column / 4)) % 2 === 0 ? 1 : 0 })).filter((cell) => cell.paletteIndex === 1));
    return cells.length > 0 ? appendProjectEdit(swatch, { id: `${group}-check`, source: 'system', edit: { kind: 'paint-cells', cells } }) : swatch;
  }
  if (object === undefined && state.gauge) {
    // A piece of the chart itself: its bottom-centre, in its own colours, backing and yarns.
    const width = Math.min(state.chart.width, Math.round(SWATCH_CM * state.gauge.stitchesPer10cm / 10));
    const height = Math.min(state.chart.height, Math.round(SWATCH_CM * state.gauge.rowsPer10cm / 10));
    const left = Math.floor((state.chart.width - width) / 2);
    const top = state.chart.height - height;
    const created = createColorworkProjectV1({
      kind: 'knitlab-colorwork-chart', version: 1, title, width, height, rowNumbering: 'bottom-up',
      palette: state.chart.palette.map((entry) => ({ ...entry })),
      cells: state.chart.cells.slice(top).map((row) => row.slice(left, left + width)),
    }, { id, title });
    const edits: ProjectEdit[] = [
      { kind: 'set-strategy', strategy: { ...state.strategy } },
      { kind: 'set-gauge', gauge: { ...state.gauge } },
      { kind: 'set-needle-offset', needleOffset: Math.floor((252 - width) / 2) + 1 },
      ...state.machine.yarnAssignments.map((assignment) => ({ kind: 'set-yarn-assignment' as const, assignment: { ...assignment } })),
    ];
    return appendProjectOperation(created, { group, source: 'system', label: `Create ${title}`, edits });
  }
  return null;
}

/** What the swatch worker sends back: the verdict decides, and only a knittable swatch has a file. */
export type SwatchResponse =
  | { kind: 'swatch-complete'; requestId: number; exportReady: boolean; verdictLabel: string; kcText: string | null; problem: string | null }
  | { kind: 'swatch-failed'; requestId: number; error: string };
