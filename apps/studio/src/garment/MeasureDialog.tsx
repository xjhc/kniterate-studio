import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { materializeColorworkProject } from '@kniterate-studio/project-contract';
import type { PlacementImage } from '../placements';
import { placementPixels } from './MotifPanel';
import { Check, X } from 'lucide-react';
import type { ColorworkProjectV1, ProjectEdit } from '@kniterate-studio/project-contract';
import { measurementTemplate, type MeasurementRecord } from '../handoff';
import { trialRevision } from '../trials';

/**
 * Measurements returned from knitting one exact candidate → a recorded trial
 * and a revised candidate, previewed before anything changes. Synthetic
 * values (made up to test software) must be marked as such.
 */
export function MeasureDialog({ project, hasCuff, candidateSha256, onRecord, onClose }: {
  project: ColorworkProjectV1;
  hasCuff: boolean;
  candidateSha256: string | null;
  onRecord: (label: string, edits: ProjectEdit[]) => void;
  onClose: () => void;
}) {
  const [record, setRecord] = useState<MeasurementRecord>(() => measurementTemplate(project, candidateSha256 ?? ''));
  const [synthetic, setSynthetic] = useState<boolean | null>(null);
  // Decoded motif images, so the revision re-converts motifs at the measured gauge.
  const [pixels, setPixels] = useState<ReadonlyMap<string, PlacementImage['pixels']> | null>(null);
  useEffect(() => {
    let active = true;
    const placements = (materializeColorworkProject(project).state.placements ?? []).filter((placement) => placement.source);
    void Promise.all(placements.map(async (placement) => [placement.id, await placementPixels(placement)] as const)).then((entries) => { if (active) setPixels(new Map(entries)); }, () => { if (active) setPixels(new Map()); });
    return () => { active = false; };
  }, [project]);
  const set = (path: (draft: MeasurementRecord) => void) => setRecord((current) => { const next = structuredClone(current); path(next); return next; });
  const num = (value: string) => (value === '' ? null : Number(value));
  const preview = useMemo(() => {
    if (synthetic === null || record.outcome === null || !/^[0-9a-f]{64}$/.test(record.candidate.kcodeSha256)) return null;
    if (pixels === null) return null;
    try { return trialRevision(project, { ...record, synthetic }, { id: 'preview', recordedAt: new Date().toISOString(), pixels }); } catch (error) { return error instanceof Error ? error.message : String(error); }
  }, [project, record, synthetic, pixels]);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (synthetic === null || typeof preview !== 'object' || preview === null) return;
    const revision = trialRevision(project, { ...record, synthetic }, { id: `trial-${crypto.randomUUID().slice(0, 8)}`, recordedAt: new Date().toISOString(), pixels: pixels ?? undefined });
    onRecord(`Record ${synthetic ? 'SYNTHETIC ' : ''}measurements of candidate ${record.candidate.kcodeSha256.slice(0, 12)} and revise`, revision.edits);
  };
  const gaugeInputs = (key: 'bodyGauge' | 'ribGauge', label: string) => <fieldset><legend>{label} <small>per 10 cm</small></legend><div className="project-dialog-grid">
    <label>Stitches<input type="number" step="0.5" min="1" max="100" value={record[key].stitchesPer10cm ?? ''} onChange={(event) => { const value = num(event.currentTarget.value); set((draft) => { draft[key].stitchesPer10cm = value; }); }} /></label>
    <label>Rows<input type="number" step="0.5" min="1" max="100" value={record[key].rowsPer10cm ?? ''} onChange={(event) => { const value = num(event.currentTarget.value); set((draft) => { draft[key].rowsPer10cm = value; }); }} /></label>
  </div></fieldset>;
  return <div className="modal-backdrop project-dialog-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
    <section className="project-dialog measure-dialog" role="dialog" aria-modal="true" aria-labelledby="measure-title">
      <header><h2 id="measure-title">Record measurements</h2><button className="icon-button" type="button" onClick={onClose} aria-label="Close"><X size={16} /></button></header>
      <form onSubmit={submit}>
        <label>Candidate (KCode SHA-256 of the file that was knitted)<input required pattern="[0-9a-f]{64}" value={record.candidate.kcodeSha256} onChange={(event) => { const value = event.currentTarget.value.trim(); set((draft) => { draft.candidate.kcodeSha256 = value; }); }} /></label>
        <fieldset><legend>Where do these values come from?</legend>
          <label className="check-label"><input type="radio" name="synthetic" checked={synthetic === false} onChange={() => setSynthetic(false)} /> A real knit of this exact file</label>
          <label className="check-label"><input type="radio" name="synthetic" checked={synthetic === true} onChange={() => setSynthetic(true)} /> Synthetic: made up to test the software</label>
        </fieldset>
        <label>Outcome<select required value={record.outcome ?? ''} onChange={(event) => { const value = event.currentTarget.value as MeasurementRecord['outcome']; set((draft) => { draft.outcome = value || null; }); }}><option value="">Choose…</option><option value="clean">Clean run</option><option value="issues">Finished with issues</option><option value="failed">Failed</option></select></label>
        {gaugeInputs('bodyGauge', 'Body gauge')}
        {hasCuff && gaugeInputs('ribGauge', 'Rib gauge (cuff)')}
        <fieldset><legend>Finished, flat, after washing and resting (cm)</legend><div className="project-dialog-grid">
          {(['circumference', 'cuffVisible', 'body', 'crown', 'total'] as const).map((key) => <label key={key}>{{ circumference: 'Circumference', cuffVisible: 'Visible cuff', body: 'Body', crown: 'Crown', total: 'Total height' }[key]}<input type="number" step="0.1" min="0" max="500" value={record.finishedCm[key] ?? ''} onChange={(event) => { const value = num(event.currentTarget.value); set((draft) => { draft.finishedCm[key] = value; }); }} /></label>)}
        </div></fieldset>
        <label>Notes (stops, interventions, what you saw)<textarea rows={3} value={record.notes} onChange={(event) => { const value = event.currentTarget.value; set((draft) => { draft.notes = value; }); }} /></label>
        {typeof preview === 'string' && <p className="setup-error" role="alert">{preview}</p>}
        {preview !== null && typeof preview === 'object' && <div className="measure-preview" aria-label="What will change">
          {preview.comparisons.length > 0 && <table><thead><tr><th>Measure</th><th>Predicted</th><th>Measured</th><th>Off by</th></tr></thead><tbody>{preview.comparisons.map((row) => <tr key={row.measure}><td>{row.measure}</td><td>{row.predictedCm ?? '—'}</td><td>{row.measuredCm}</td><td>{row.deviation === null ? '—' : `${(row.deviation * 100).toFixed(1)}%`}</td></tr>)}</tbody></table>}
          <ul>{preview.changes.map((change) => <li key={change}>{change}</li>)}</ul>
          <p className="garment-help">The knitted candidate stays as it was; this records the trial in the project and revises it as one undoable change.</p>
        </div>}
        <footer><button className="secondary-button" type="button" onClick={onClose}>Cancel</button><button className="primary-button" type="submit" disabled={synthetic === null || typeof preview !== 'object' || preview === null}><Check size={16} /> Record and revise</button></footer>
      </form>
    </section>
  </div>;
}

