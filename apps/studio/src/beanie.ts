import {
  appendProjectEdit,
  createColorworkProjectV1,
  materializeColorworkProject,
  type ColorworkProjectV1,
  type ProjectEdit,
  type ProjectEditEntry,
  type ProjectGauge,
  type ProjectObject,
  type ProjectState,
} from '@kniterate-studio/project-contract';
import { planProject, type PlanFinding } from './plan';

/**
 * Beanie intent as a designer states it: head size and fit, cuff, body height,
 * gauges, yarns and backing. Shared by the CLI and the browser. Stitch and row
 * counts always come from the Plan's own fixes, never from arithmetic here.
 */

export interface BeanieColor { name: string; hex: string }

export interface BeanieIntent {
  title: string;
  headCircumferenceCm?: number;
  /** Fraction; -0.1 is 10% negative ease. */
  ease?: number;
  /** Body height above the cuff (or the whole rib body without a cuff). */
  bodyCm?: number;
  bodyGauge?: Pick<ProjectGauge, 'stitchesPer10cm' | 'rowsPer10cm' | 'source'> & { note?: string };
  /** Visible cuff height; adds a rib cuff under a colorwork body. */
  cuffCm?: number;
  ribGauge?: Pick<ProjectGauge, 'stitchesPer10cm' | 'rowsPer10cm' | 'source'> & { note?: string };
  fold?: boolean;
  main: BeanieColor;
  accent?: BeanieColor;
  backing?: 'fairisle' | 'birdseye';
}

/** Rules whose fixes are the Plan's sizing; applying them is how intent becomes counts. */
const SIZING_RULES: readonly PlanFinding['rule'][] = ['beanie-width-invalid', 'cuff-off-target', 'size-off-target'];

function planOf(project: ColorworkProjectV1) {
  const { state, placements } = materializeColorworkProject(project);
  return planProject(state, placements);
}

/**
 * The edits that bring the counts in line with the intent after `edits`: the
 * Plan's sizing fixes, applied until none remain (each fix is checked by
 * re-planning). Returns `edits` followed by those fixes.
 */
export function withSizingFixes(project: ColorworkProjectV1, edits: readonly ProjectEdit[]): ProjectEdit[] {
  const all = [...edits];
  let scratch = edits.reduce((current, edit, index) => appendProjectEdit(current, { id: `scratch-${index}`, source: 'system', edit }), project);
  for (let round = 0; round < 4; round += 1) {
    const finding = planOf(scratch).findings.find((item) => SIZING_RULES.includes(item.rule) && item.fixes.length > 0);
    if (finding === undefined) break;
    for (const edit of finding.fixes[0]!.edits) {
      scratch = appendProjectEdit(scratch, { id: `scratch-fix-${round}-${all.length}`, source: 'system', edit });
      all.push(edit);
    }
  }
  return all;
}

/** A new beanie project, sized by the Plan. Every edit is one operation in its history. */
export function createBeanieProject(intent: BeanieIntent, options: { id: string; source: ProjectEditEntry['source']; group: string }): ColorworkProjectV1 {
  const cuff = intent.cuffCm !== undefined;
  if (cuff && intent.ribGauge === undefined) throw new Error('A cuff height needs a 2x2 rib gauge.');
  if (intent.accent !== undefined && !cuff) throw new Error('A second color needs a colorwork body: add a cuff (the all-rib beanie knits one yarn).');
  // Placeholder counts; the Plan's fixes below set the real ones.
  const placeholderCuff = cuff ? Math.max(2, Math.round((intent.cuffCm! * (intent.fold ? 2 : 1) * intent.ribGauge!.rowsPer10cm) / 10)) : 0;
  const height = cuff ? placeholderCuff + 20 : 102;
  const chart = {
    kind: 'knitlab-colorwork-chart', version: 1, title: intent.title, width: 194, height, rowNumbering: 'bottom-up',
    palette: [{ id: 'main', ...intent.main }, ...(intent.accent ? [{ id: 'accent', ...intent.accent }] : [])],
    cells: Array.from({ length: height }, () => Array<number>(194).fill(0)),
  };
  const object: ProjectObject = cuff
    ? {
        kind: 'beanie', construction: 'rib-cuff-jersey-body', cuffRows: placeholderCuff, cuffTargetCm: intent.cuffCm!,
        ribGauge: { ...intent.ribGauge! }, ...(intent.fold ? { cuffFold: true } : {}),
        ...(intent.headCircumferenceCm !== undefined ? { headCircumferenceCm: intent.headCircumferenceCm } : {}),
        ...(intent.ease !== undefined ? { ease: intent.ease } : {}),
      }
    : {
        kind: 'beanie', construction: 'flat-rib-2x2',
        ...(intent.headCircumferenceCm !== undefined ? { headCircumferenceCm: intent.headCircumferenceCm } : {}),
        ...(intent.ease !== undefined ? { ease: intent.ease } : {}),
      };
  const edits: ProjectEdit[] = [
    { kind: 'set-object', object },
    { kind: 'set-yarn-assignment', assignment: { paletteId: 'main', carrier: '3', yarnName: intent.main.name } },
  ];
  if (intent.accent) edits.push({ kind: 'set-yarn-assignment', assignment: { paletteId: 'accent', carrier: '4', yarnName: intent.accent.name } });
  // A colorwork body uses Customist's default float warning distance (7).
  if (cuff) edits.push({ kind: 'set-strategy', strategy: { technique: intent.backing ?? 'fairisle', floatLimit: 7 } });
  if (intent.bodyGauge !== undefined) edits.push({ kind: 'set-gauge', gauge: { ...intent.bodyGauge } });
  if (intent.bodyCm !== undefined) edits.push({ kind: 'set-target', target: { heightCm: intent.bodyCm } });
  const project = createColorworkProjectV1(chart, { id: options.id, title: intent.title });
  return withSizingFixes(project, edits).reduce((current, edit, index) => appendProjectEdit(current, {
    id: `${options.group}-${index}`, source: options.source, edit, group: options.group, ...(index === 0 ? { label: `Create ${intent.title}` } : {}),
  }), project);
}

/** How much smaller around than the head a beanie is knitted, so it stays on. */
export const BEANIE_FITS = [
  { id: 'snug', name: 'Snug', ease: -0.15 },
  { id: 'classic', name: 'Classic', ease: -0.1 },
  { id: 'loose', name: 'Loose', ease: -0.05 },
] as const;

/** Typical head circumferences, cm. */
export const BEANIE_HEADS = [
  { id: 'child', name: 'Child', cm: 50 },
  { id: 'S', name: 'S', cm: 54 },
  { id: 'M', name: 'M', cm: 56 },
  { id: 'L', name: 'L', cm: 58 },
  { id: 'XL', name: 'XL', cm: 60 },
] as const;

export interface BeanieFitChange {
  headCircumferenceCm?: number;
  ease?: number;
  bodyCm?: number;
  cuffCm?: number;
  fold?: boolean;
  bodyGauge?: BeanieIntent['bodyGauge'];
  ribGauge?: BeanieIntent['ribGauge'];
  backing?: 'fairisle' | 'birdseye';
}

/**
 * The edits for a change of fit, cuff, height, gauge or backing, followed by
 * the Plan's sizing fixes, so the counts follow the intent in one operation.
 * Placements keep their anchors, so motifs stay centred above the cuff.
 */
export function beanieFitEdits(project: ColorworkProjectV1, change: BeanieFitChange): ProjectEdit[] {
  const { state } = materializeColorworkProject(project);
  const object = state.object;
  if (object?.kind !== 'beanie') throw new Error('This project is not a beanie.');
  const edits: ProjectEdit[] = [];
  const nextObject: ProjectObject = { ...object };
  if (change.headCircumferenceCm !== undefined) nextObject.headCircumferenceCm = change.headCircumferenceCm;
  if (change.ease !== undefined) nextObject.ease = change.ease;
  if (change.cuffCm !== undefined || change.fold !== undefined || change.ribGauge !== undefined) {
    if (object.construction !== 'rib-cuff-jersey-body') throw new Error('This beanie has no cuff; its whole body is rib.');
    if (change.cuffCm !== undefined) nextObject.cuffTargetCm = change.cuffCm;
    if (change.fold !== undefined) { if (change.fold) nextObject.cuffFold = true; else delete nextObject.cuffFold; }
    if (change.ribGauge !== undefined) nextObject.ribGauge = { ...change.ribGauge };
  }
  if (JSON.stringify(nextObject) !== JSON.stringify(object)) edits.push({ kind: 'set-object', object: nextObject });
  if (change.bodyGauge !== undefined) edits.push({ kind: 'set-gauge', gauge: { ...change.bodyGauge } });
  if (change.bodyCm !== undefined) edits.push({ kind: 'set-target', target: { ...state.target, heightCm: change.bodyCm } });
  // The beanie body supports exactly fairisle and full birdseye: set only those fields, so no hidden mode survives a switch.
  if (change.backing !== undefined && change.backing !== state.strategy.technique) edits.push({ kind: 'set-strategy', strategy: { technique: change.backing, floatLimit: state.strategy.floatLimit } });
  return withSizingFixes(project, edits);
}

/** A change of fit in words, for the history: "Head 58 cm, body gauge 24/30 (measured)". */
export function fitChangeLabel(change: BeanieFitChange): string {
  const parts = [
    change.headCircumferenceCm !== undefined ? `head ${change.headCircumferenceCm} cm` : null,
    change.ease !== undefined ? `ease ${Math.round(change.ease * 1000) / 10}%` : null,
    change.bodyCm !== undefined ? `body ${change.bodyCm} cm` : null,
    change.cuffCm !== undefined ? `cuff ${change.cuffCm} cm` : null,
    change.fold !== undefined ? (change.fold ? 'cuff folds up' : 'cuff unfolded') : null,
    change.bodyGauge ? `body gauge ${change.bodyGauge.stitchesPer10cm}/${change.bodyGauge.rowsPer10cm} (${change.bodyGauge.source})` : null,
    change.ribGauge ? `rib gauge ${change.ribGauge.stitchesPer10cm}/${change.ribGauge.rowsPer10cm} (${change.ribGauge.source})` : null,
    change.backing ? `${change.backing} backing` : null,
  ].filter(Boolean).join(', ');
  return parts ? `${parts[0]!.toUpperCase()}${parts.slice(1)}` : 'No change';
}

/** The designer-facing fit of a beanie, read back from its state. */
export function beanieIntentOf(state: ProjectState): BeanieFitChange & { construction: 'flat-rib-2x2' | 'rib-cuff-jersey-body' } | null {
  const object = state.object;
  if (object?.kind !== 'beanie') return null;
  return {
    construction: object.construction,
    ...(object.headCircumferenceCm !== undefined ? { headCircumferenceCm: object.headCircumferenceCm } : {}),
    ease: object.ease ?? -0.1,
    ...(state.target?.heightCm !== undefined ? { bodyCm: state.target.heightCm } : {}),
    ...(object.cuffTargetCm !== undefined ? { cuffCm: object.cuffTargetCm } : {}),
    fold: object.cuffFold === true,
    ...(state.gauge ? { bodyGauge: state.gauge } : {}),
    ...(object.ribGauge ? { ribGauge: object.ribGauge } : {}),
    backing: state.strategy.technique === 'birdseye' ? 'birdseye' : 'fairisle',
  };
}
