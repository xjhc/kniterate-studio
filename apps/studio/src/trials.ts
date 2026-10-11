import { appendProjectEdit, materializeColorworkProject, type ColorworkProjectV1, type ProjectEdit, type ProjectState, type ProjectTrial } from '@kniterate-studio/project-contract';
import { beanieFitEdits, withSizingFixes } from './beanie';
import type { MeasurementRecord } from './handoff';
import { planProject, type ProjectPlan } from './plan';
import { refreshedPlacement, PlacementColorDecisionError, type PlacementImage } from './placements';

/**
 * Returned measurements → a recorded trial and a revised candidate. The
 * measured candidate stays what it was (its files and hash are untouched);
 * the trial is recorded in the project, the gauges become `measured`, and the
 * Plan's sizing fixes re-size the project in one undoable operation.
 */

export interface MeasurementComparison {
  measure: string;
  predictedCm: number | null;
  measuredCm: number;
  /** Measured − predicted, as a fraction of predicted. */
  deviation: number | null;
}

export interface TrialRevision {
  trial: ProjectTrial;
  edits: ProjectEdit[];
  comparisons: MeasurementComparison[];
  /**
   * What the measurements were compared with: the predictions saved with the
   * knitted candidate's form, the current design when it is that candidate,
   * or nothing (the candidate's predictions are unknown here).
   */
  comparisonBasis: 'candidate-form' | 'current-design' | 'unknown';
  /** Plain-language summary of what the revision changes. */
  changes: string[];
}

function complete(gauge: MeasurementRecord['bodyGauge']): { stitchesPer10cm: number; rowsPer10cm: number } | undefined {
  if (gauge.stitchesPer10cm === null && gauge.rowsPer10cm === null) return undefined;
  if (!(gauge.stitchesPer10cm! > 0) || !(gauge.rowsPer10cm! > 0)) throw new Error('A gauge needs both stitches and rows per 10 cm.');
  return { stitchesPer10cm: gauge.stitchesPer10cm!, rowsPer10cm: gauge.rowsPer10cm! };
}

export function parseMeasurementRecord(value: unknown): MeasurementRecord {
  const record = value as MeasurementRecord;
  if (record?.kind !== 'kniterate-studio-measurements' || record.schemaVersion !== 1) throw new Error('Not a kniterate-studio-measurements v1 record.');
  if (!/^[0-9a-f]{64}$/.test(record.candidate?.kcodeSha256 ?? '')) throw new Error('The record must name the candidate by its KCode SHA-256.');
  if (typeof record.synthetic !== 'boolean') throw new Error('The record must say whether its values are synthetic (made up for testing).');
  if (record.outcome === null || !['clean', 'issues', 'failed'].includes(record.outcome)) throw new Error('Record the outcome: clean, issues or failed.');
  return record;
}

function planOf(project: ColorworkProjectV1): ProjectPlan {
  const { state, placements } = materializeColorworkProject(project);
  return planProject(state, placements);
}

/**
 * Each motif with a source image, re-converted at a new body gauge, so it
 * keeps its size in cm. A motif whose image now shows colours with no yarn
 * keeps its stitches (readiness then asks for a refresh, where those colours
 * are chosen).
 */
export function reconvertMotifs(state: ProjectState, bodyGauge: { stitchesPer10cm: number; rowsPer10cm: number }, pixels: ReadonlyMap<string, PlacementImage['pixels']>): { edits: ProjectEdit[]; refreshed: string[]; needsColorChoices: string[] } {
  const edits: ProjectEdit[] = [];
  const refreshed: string[] = [];
  const needsColorChoices: string[] = [];
  for (const placement of state.placements ?? []) {
    const image = pixels.get(placement.id);
    if (!placement.source || !image) continue;
    try {
      edits.push({ kind: 'set-placement', placement: refreshedPlacement(placement, image, bodyGauge) });
      refreshed.push(placement.id);
    } catch (error) {
      if (!(error instanceof PlacementColorDecisionError)) throw error;
      // Legacy placements have no conversion gauge. Preserve the prior
      // project gauge so even a stitch-only change requires a refresh.
      if (placement.source.gauge === undefined && state.gauge) {
        edits.push({ kind: 'set-placement', placement: {
          ...placement,
          source: { ...placement.source, gauge: { stitchesPer10cm: state.gauge.stitchesPer10cm, rowsPer10cm: state.gauge.rowsPer10cm } },
        } });
      }
      // Keep the previous motif. Its saved gauge now differs, so readiness
      // requires a refresh, where the designer can resolve the new colors.
      needsColorChoices.push(`${placement.id}: image color${error.missing.length === 1 ? '' : 's'} ${error.missing.map((item) => item.color).join(', ')}`);
    }
  }
  return { edits, refreshed, needsColorChoices };
}

/**
 * `pixels` holds each placement's decoded source image (by placement id):
 * with them, motifs are re-converted at the measured gauge in the same
 * operation, so the revised candidate is coherent. Without them, they are
 * flagged for refresh (placement-size-off).
 */
export function trialRevision(project: ColorworkProjectV1, record: MeasurementRecord, options: { id: string; recordedAt: string; pixels?: ReadonlyMap<string, PlacementImage['pixels']>; currentCandidateSha256?: string | null }): TrialRevision {
  const { state } = materializeColorworkProject(project);
  const before = planOf(project);
  const bodyGauge = complete(record.bodyGauge);
  const ribGauge = complete(record.ribGauge);
  const finished = Object.fromEntries(Object.entries(record.finishedCm).filter(([, value]) => value !== null && value > 0)) as NonNullable<ProjectTrial['finishedCm']>;
  const trial: ProjectTrial = {
    id: options.id,
    candidate: { kcodeSha256: record.candidate.kcodeSha256, ...(record.candidate.label ? { label: record.candidate.label } : {}) },
    recordedAt: options.recordedAt,
    synthetic: record.synthetic,
    outcome: record.outcome!,
    ...(bodyGauge ? { bodyGauge } : {}),
    ...(ribGauge ? { ribGauge } : {}),
    ...(Object.keys(finished).length ? { finishedCm: finished } : {}),
    ...(record.notes ? { notes: record.notes } : {}),
  };
  const note = `${record.synthetic ? 'SYNTHETIC (software test) ' : ''}measured on candidate ${record.candidate.kcodeSha256.slice(0, 12)}, ${options.recordedAt.slice(0, 10)}`;
  const recordEdit: ProjectEdit = { kind: 'record-trial', trial };
  // Synthetic values exercise the revision but never count as measured.
  const source = record.synthetic ? 'assumed' as const : 'measured' as const;
  let edits: ProjectEdit[];
  if (state.object?.kind === 'beanie') {
    const fitEdits = beanieFitEdits(project, {
      ...(bodyGauge ? { bodyGauge: { ...bodyGauge, source, note } } : {}),
      ...(ribGauge && state.object.construction === 'rib-cuff-jersey-body' ? { ribGauge: { ...ribGauge, source, note } } : {}),
    });
    edits = [recordEdit, ...fitEdits];
  } else {
    edits = withSizingFixes(project, [recordEdit, ...(bodyGauge ? [{ kind: 'set-gauge', gauge: { ...bodyGauge, source, note } } as ProjectEdit] : [])]);
  }
  // Re-convert motifs at the measured body gauge.
  const { edits: motifEdits, refreshed, needsColorChoices } = bodyGauge && options.pixels ? reconvertMotifs(state, bodyGauge, options.pixels) : { edits: [], refreshed: [], needsColorChoices: [] };
  edits.push(...motifEdits);
  // Compare with what the knitted candidate predicted, never with a later draft.
  const sections = before.sections;
  const fromForm = record.candidate.predictedCm;
  const isCurrent = options.currentCandidateSha256 != null && options.currentCandidateSha256 === record.candidate.kcodeSha256;
  const comparisonBasis: TrialRevision['comparisonBasis'] = fromForm ? 'candidate-form' : isCurrent ? 'current-design' : 'unknown';
  const predicted: Record<keyof NonNullable<ProjectTrial['finishedCm']>, number | null> = fromForm ? { ...fromForm } : isCurrent ? {
    circumference: before.predicted?.widthCm.value ?? null,
    cuffVisible: sections?.cuff?.visibleCm?.value ?? null,
    body: sections?.body.cm?.value ?? null,
    crown: sections?.crown?.cm?.value ?? null,
    total: sections?.finishedHeightCm?.value ?? null,
  } : { circumference: null, cuffVisible: null, body: null, crown: null, total: null };
  const comparisons = (Object.entries(finished) as [keyof typeof predicted, number][]).map(([measure, measuredCm]) => ({
    measure,
    predictedCm: predicted[measure],
    measuredCm,
    deviation: predicted[measure] ? Math.round(((measuredCm - predicted[measure]!) / predicted[measure]!) * 1000) / 1000 : null,
  }));
  // Describe the revision from the plans before and after.
  const after = planOf(edits.reduce((current, edit, index) => appendProjectEdit(current, { id: `trial-scratch-${index}`, source: 'system', edit }), project));
  const changes: string[] = [];
  const label = record.synthetic ? 'synthetic, counted as assumed' : 'measured';
  if (bodyGauge) changes.push(`Body gauge ${state.gauge ? `${state.gauge.stitchesPer10cm}/${state.gauge.rowsPer10cm} (${state.gauge.source})` : 'none'} → ${bodyGauge.stitchesPer10cm}/${bodyGauge.rowsPer10cm} (${label})`);
  if (ribGauge && state.object?.ribGauge) changes.push(`Rib gauge ${state.object.ribGauge.stitchesPer10cm}/${state.object.ribGauge.rowsPer10cm} (${state.object.ribGauge.source}) → ${ribGauge.stitchesPer10cm}/${ribGauge.rowsPer10cm} (${label})`);
  if (after.stitches.value !== before.stitches.value) changes.push(`Needles ${before.stitches.value} → ${after.stitches.value}`);
  if (after.sections?.cuff && before.sections?.cuff && after.sections.cuff.rows !== before.sections.cuff.rows) changes.push(`Cuff rows ${before.sections.cuff.rows} → ${after.sections.cuff.rows}`);
  if (after.sections && before.sections && after.sections.body.rows !== before.sections.body.rows) changes.push(`Body rows ${before.sections.body.rows} → ${after.sections.body.rows}`);
  if (refreshed.length) changes.push(`Motifs re-converted at the measured gauge: ${refreshed.join(', ')}`);
  if (needsColorChoices.length) changes.push(`Motifs kept unchanged and need Refresh to choose a yarn or background for new colors: ${needsColorChoices.join('; ')}`);
  if (changes.length === 0) changes.push('No size change: the measured gauges agree with the plan.');
  return { trial, edits, comparisons, comparisonBasis, changes };
}
