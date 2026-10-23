import { appendProjectOperation, beanieObjectOf, materializeColorworkProject, type ColorworkProjectV1, type ProjectEdit, type ProjectGauge, type ProjectState } from '@kniterate-studio/project-contract';
import { projectBackingWords } from './backing';
import { RIBS, textureMatching } from './sweater/textures';
import { regauge, type GaugeValue } from './workspace/gauge';

/**
 * The fabric each gauge is measured on: what a swatch has to match. It is
 * the stitch (or the backing, or the rib) and its stitch size once you set
 * your own. A change to either is a change of fabric, so every design
 * operation applies the one rule for that (`regauge`), whichever control
 * made it.
 */

export interface Fabric {
  /** In words, for "Measured on …" and "Measure a swatch of …". */
  name: string;
  /** What has to match: a stitch of your own changes with every edit, under the same name. */
  key: string;
  /** A stitch of your own, which is never the one a swatch was measured on. */
  own: boolean;
  typical?: Pick<ProjectGauge, 'stitchesPer10cm' | 'rowsPer10cm'>;
}

const atSize = (name: string, stitch: number | undefined) => (stitch === undefined ? name : `${name} at stitch size ${stitch}`);

function ribFabric(rib: string, stitch: number | undefined): Fabric {
  const name = atSize(`${RIBS.find((item) => item.rib === rib)?.name ?? rib} rib`, stitch);
  return { name, key: name, own: false };
}

/** The fabric of the project gauge (`body`) and of the rib gauge (`rib`, null when there is no rib to measure). */
export function gaugeFabrics(state: ProjectState): { body: Fabric | null; rib: Fabric | null } {
  const object = state.object;
  const bodyStitch = state.setup?.body?.stitch;
  const ribStitch = state.setup?.rib?.stitch;
  if (object?.kind === 'sweater' || object?.kind === 'panel') {
    const library = textureMatching(object.body.texture);
    // The rib gauge is the swatch's: a sweater's hem rib, or a scarf's ends.
    const rib = object.kind === 'sweater' ? object.trims.hem.rib : object.ends.cm > 0 ? object.ends.rib : null;
    return {
      body: { name: atSize(object.body.name, bodyStitch), key: atSize(object.body.texture.join(' '), bodyStitch), own: library === undefined, ...(library ? { typical: library.gauge } : {}) },
      rib: rib === null ? null : ribFabric(rib, ribStitch),
    };
  }
  const beanie = beanieObjectOf(state);
  // A beanie in rib all over: its gauge is the rib's.
  if (beanie && beanie.construction !== 'rib-cuff-jersey-body') return { body: ribFabric('kkpp', ribStitch), rib: null };
  const body = atSize(projectBackingWords(state)?.fabric ?? 'plain stockinette', bodyStitch);
  return { body: { name: body, key: body, own: false }, rib: beanie ? ribFabric('kkpp', ribStitch) : null };
}

const same = (a: GaugeValue | undefined, b: GaugeValue | undefined) => a?.stitchesPer10cm === b?.stitchesPer10cm && a?.rowsPer10cm === b?.rowsPer10cm && a?.source === b?.source && a?.note === b?.note;

/** A gauge after a change of fabric; null when the fabric is the same, or when the operation sets the gauge itself (then it is yours). */
function followed(before: GaugeValue | undefined, after: GaugeValue | undefined, was: Fabric | null, now: Fabric | null): GaugeValue | null {
  if (!after || !was || !now || was.key === now.key || !same(before, after)) return null;
  return regauge(after, was.name, now.own ? null : { name: now.name, ...(now.typical ? { typical: now.typical } : {}) });
}

/** The edits that keep each gauge true to its fabric across a change from `before` to `after`. */
export function regaugeEdits(before: ProjectState, after: ProjectState): ProjectEdit[] {
  const was = gaugeFabrics(before);
  const now = gaugeFabrics(after);
  const body = followed(before.gauge, after.gauge, was.body, now.body);
  const rib = followed(before.object?.ribGauge, after.object?.ribGauge, was.rib, now.rib);
  return [
    ...(body ? [{ kind: 'set-gauge' as const, gauge: body }] : []),
    ...(rib && after.object ? [{ kind: 'set-object' as const, object: { ...after.object, ribGauge: rib } }] : []),
  ];
}

/** One undoable design operation, with the gauges following any change of fabric it makes. */
export function appendDesignOperation(project: ColorworkProjectV1, label: string, edits: readonly ProjectEdit[]): ColorworkProjectV1 {
  const operation = { group: `op_${crypto.randomUUID().replace(/-/g, '')}`, source: 'human' as const, label, edits };
  const next = appendProjectOperation(project, operation);
  const follow = regaugeEdits(materializeColorworkProject(project).state, materializeColorworkProject(next).state);
  return follow.length === 0 ? next : appendProjectOperation(project, { ...operation, edits: [...edits, ...follow] });
}
