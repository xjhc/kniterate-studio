import { appendProjectEdit, materializeColorworkProject, type ColorworkProjectV1, type ProjectEdit, type ProjectTrial } from '@kniterate-studio/project-contract';
import { beanieFitEdits, withSizingFixes } from './beanie';
import type { MeasurementRecord } from './handoff';
import { planProject, type ProjectPlan } from './plan';
import { refreshedPlacement, type PlacementImage } from './placements';

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
 * `pixels` holds each placement's decoded source image (by placement id):
 * with them, motifs are re-converted at the measured gauge in the same
 * operation, so the revised candidate is coherent. Without them, they are
 * flagged for refresh (placement-size-off).
 */
export function trialRevision(project: ColorworkProjectV1, record: MeasurementRecord, options: { id: string; recordedAt: string; pixels?: ReadonlyMap<string, PlacementImage['pixels']> }): TrialRevision {
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
  let edits: ProjectEdit[];
  if (state.object?.kind === 'beanie') {
    const fitEdits = beanieFitEdits(project, {
      ...(bodyGauge ? { bodyGauge: { ...bodyGauge, source: 'measured', note } } : {}),
      ...(ribGauge && state.object.construction === 'rib-cuff-jersey-body' ? { ribGauge: { ...ribGauge, source: 'measured', note } } : {}),
    });
    edits = [recordEdit, ...fitEdits];
  } else {
    edits = withSizingFixes(project, [recordEdit, ...(bodyGauge ? [{ kind: 'set-gauge', gauge: { ...bodyGauge, source: 'measured', note } } as ProjectEdit] : [])]);
  }
  // Re-convert motifs at the measured body gauge.
  const refreshed: string[] = [];
  if (bodyGauge && options.pixels) {
    for (const placement of state.placements ?? []) {
      const pixels = options.pixels.get(placement.id);
      if (!placement.source || !pixels) continue;
      edits.push({ kind: 'set-placement', placement: refreshedPlacement(placement, pixels, bodyGauge) });
      refreshed.push(placement.id);
    }
  }
  const sections = before.sections;
  const predicted: Record<keyof NonNullable<ProjectTrial['finishedCm']>, number | null> = {
    circumference: before.predicted?.widthCm.value ?? null,
    cuffVisible: sections?.cuff?.visibleCm?.value ?? null,
    body: sections?.body.cm?.value ?? null,
    crown: sections?.crown?.cm?.value ?? null,
    total: sections?.finishedHeightCm?.value ?? null,
  };
  const comparisons = (Object.entries(finished) as [keyof typeof predicted, number][]).map(([measure, measuredCm]) => ({
    measure,
    predictedCm: predicted[measure],
    measuredCm,
    deviation: predicted[measure] ? Math.round(((measuredCm - predicted[measure]!) / predicted[measure]!) * 1000) / 1000 : null,
  }));
  // Describe the revision from the plans before and after.
  const after = planOf(edits.reduce((current, edit, index) => appendProjectEdit(current, { id: `trial-scratch-${index}`, source: 'system', edit }), project));
  const changes: string[] = [];
  if (bodyGauge) changes.push(`Body gauge ${state.gauge ? `${state.gauge.stitchesPer10cm}/${state.gauge.rowsPer10cm} (${state.gauge.source})` : 'none'} → ${bodyGauge.stitchesPer10cm}/${bodyGauge.rowsPer10cm} (measured)`);
  if (ribGauge && state.object?.ribGauge) changes.push(`Rib gauge ${state.object.ribGauge.stitchesPer10cm}/${state.object.ribGauge.rowsPer10cm} (${state.object.ribGauge.source}) → ${ribGauge.stitchesPer10cm}/${ribGauge.rowsPer10cm} (measured)`);
  if (after.stitches.value !== before.stitches.value) changes.push(`Needles ${before.stitches.value} → ${after.stitches.value}`);
  if (after.sections?.cuff && before.sections?.cuff && after.sections.cuff.rows !== before.sections.cuff.rows) changes.push(`Cuff rows ${before.sections.cuff.rows} → ${after.sections.cuff.rows}`);
  if (after.sections && before.sections && after.sections.body.rows !== before.sections.body.rows) changes.push(`Body rows ${before.sections.body.rows} → ${after.sections.body.rows}`);
  if (refreshed.length) changes.push(`Motifs re-converted at the measured gauge: ${refreshed.join(', ')}`);
  if (changes.length === 0) changes.push('No size change: the measured gauges agree with the plan.');
  return { trial, edits, comparisons, changes };
}
