import { useState, type ReactNode } from 'react';
import type { ProjectGauge, ProjectState } from '@kniterate-studio/project-contract';
import type { BeanieFitChange } from '../beanie';
import { BEANIE_FITS, beanieIntentOf } from '../beanie';
import type { ProjectPlan, Valued } from '../plan';
import { Chips, Section } from '../workspace/panel';

/**
 * The garment's fit as a designer states it: what you want beside what your
 * gauge knits, the same counts the schematic reads back from the machine
 * file. Every input is a change of intent; the Plan derives needles and rows.
 * Ids match readiness targets (`fit.head`, `gauge.body`, ...).
 */

const FITS = BEANIE_FITS;

function cm(value: Valued<number> | null | undefined): string {
  return value ? String(value.value) : '—';
}

/** A number the designer types; an out-of-range value is shown as not applied, with the reason, never silently dropped. */
export function NumberField({ id, label, value, step = 0.5, min, max, suffix, onCommit }: { id: string; label: string; value: number | undefined; step?: number; min: number; max: number; suffix: string; onCommit: (value: number) => void }) {
  const [draft, setDraft] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const shown = draft ?? (value === undefined ? '' : String(value));
  const commit = () => {
    if (draft === null) return;
    const next = Number(draft);
    if (draft.trim() === '' || !Number.isFinite(next) || next < min || next > max) {
      setError(`Not applied: enter ${min}–${max} ${suffix}. The design still uses ${value ?? 'no value'}${value === undefined ? '' : ` ${suffix}`}.`);
      return;
    }
    setError(null); setDraft(null);
    if (next !== value) onCommit(next);
  };
  return <>
    <span className="garment-input number-input"><input id={id} type="number" inputMode="decimal" step={step} min={min} max={max} value={shown} aria-label={label} aria-invalid={error !== null} aria-describedby={error ? `${id}-error` : undefined}
      onChange={(event) => { setDraft(event.currentTarget.value); setError(null); }}
      onBlur={commit}
      onKeyDown={(event) => { if (event.key === 'Enter') commit(); if (event.key === 'Escape') { setDraft(null); setError(null); } }} /><i>{suffix}</i></span>
    {error && <p className="garment-error" id={`${id}-error`} role="alert">{error} <button type="button" className="link-button" onClick={() => { setDraft(null); setError(null); }}>Restore</button></p>}
  </>;
}

/** One row of the table: what you want (if you set it), what your gauge knits, and its stitches or rows. */
export function MeasureRow({ label, hint, wanted, knitted, count, off = false }: { label: string; hint: string; wanted: ReactNode; knitted: string; count: string; off?: boolean }) {
  return <div className="measure-row garment-measure" title={hint}>
    <span>{label}</span>
    {wanted ?? <span />}
    <span className={`knitted${off ? ' off' : ''}`}>{knitted}</span>
    <span className="knitted count">{count}</span>
  </div>;
}

export function GaugeFields({ id, label, gauge, onCommit }: { id: string; label: string; gauge: Pick<ProjectGauge, 'stitchesPer10cm' | 'rowsPer10cm' | 'source'> | undefined; onCommit: (gauge: Pick<ProjectGauge, 'stitchesPer10cm' | 'rowsPer10cm' | 'source'>) => void }) {
  const [draft, setDraft] = useState<{ stitches: string; rows: string } | null>(null);
  const stitches = draft?.stitches ?? String(gauge?.stitchesPer10cm ?? '');
  const rows = draft?.rows ?? String(gauge?.rowsPer10cm ?? '');
  const commit = (source: ProjectGauge['source']) => {
    const next = { stitchesPer10cm: Number(stitches), rowsPer10cm: Number(rows), source };
    setDraft(null);
    if (!(next.stitchesPer10cm > 0 && next.stitchesPer10cm <= 100 && next.rowsPer10cm > 0 && next.rowsPer10cm <= 100)) return;
    if (gauge && gauge.stitchesPer10cm === next.stitchesPer10cm && gauge.rowsPer10cm === next.rowsPer10cm && gauge.source === next.source) return;
    onCommit(next);
  };
  // One operation per gauge: commit when focus leaves the group, not after each number.
  return <fieldset className="gauge-fields" id={id} tabIndex={-1} onBlur={(event) => { if (draft && !event.currentTarget.contains(event.relatedTarget as Node | null)) commit(gauge?.source ?? 'assumed'); }}>
    <legend>{label} <small>per 10 cm</small></legend>
    <div className="gauge-row">
      <label><span>Stitches</span><input aria-label={`${label} stitches per 10 cm`} type="number" step="0.5" min="1" max="100" value={stitches} onChange={(event) => setDraft({ stitches: event.currentTarget.value, rows })} /></label>
      <label><span>Rows</span><input aria-label={`${label} rows per 10 cm`} type="number" step="0.5" min="1" max="100" value={rows} onChange={(event) => setDraft({ stitches, rows: event.currentTarget.value })} /></label>
      <label className="measured-check"><input type="checkbox" aria-label={`${label} measured`} checked={gauge?.source === 'measured'} onChange={(event) => commit(event.currentTarget.checked ? 'measured' : 'assumed')} />measured</label>
    </div>
  </fieldset>;
}

export function GarmentFitSection({ state, plan, onFit }: { state: ProjectState; plan: ProjectPlan; onFit: (change: BeanieFitChange, label: string) => void }) {
  const [resizedFrom, setResizedFrom] = useState<{ needles: number; rows: number } | null>(null);
  const intent = beanieIntentOf(state);
  if (intent === null) return null;
  const sections = plan.sections;
  const widthCheck = plan.sizeChecks.find((check) => check.dimension === 'width');
  const cuff = intent.construction === 'rib-cuff-jersey-body';
  const ease = intent.ease ?? -0.1;
  const fit = FITS.find((choice) => Math.abs(choice.ease - ease) < 0.001) ?? null;
  const easePercent = Math.round(ease * 1000) / 10;
  // A new gauge resizes the whole hat: say by how much.
  const counts = { needles: plan.stitches.value, rows: plan.rows.value };
  const setGauge = (change: BeanieFitChange, label: string) => { setResizedFrom(counts); onFit(change, label); };
  const resized = resizedFrom && (resizedFrom.needles !== counts.needles || resizedFrom.rows !== counts.rows) ? resizedFrom : null;
  const measured = state.gauge?.source === 'measured' && (!cuff || state.object?.ribGauge?.source === 'measured');
  const off = (wanted: number | undefined, knitted: Valued<number> | null | undefined) => wanted !== undefined && knitted != null && Math.abs(knitted.value - wanted) >= 1;
  const fitName = fit ? fit.name.toLowerCase() : `${easePercent}%`;
  return <>
    <Section title="Size" aside={<em className="section-aside">{intent.headCircumferenceCm} cm · {fitName}</em>}>
      <div className="field-row"><span>Fit</span><Chips label="Fit" value={fit?.id ?? 'custom'}
        options={[...FITS.map((choice) => ({ id: choice.id, name: choice.name, note: `Knitted ${Math.round(-choice.ease * 100)}% smaller than the head, so it stays on.` })), ...(fit ? [] : [{ id: 'custom' as const, name: `${easePercent}%`, note: 'Your own ease: how much smaller than the head the hat is knitted.' }])]}
        onPick={(id) => { const choice = FITS.find((item) => item.id === id); if (choice) onFit({ ease: choice.ease }, `${choice.name} fit`); }} /></div>
      <div className="measure-table" role="group" aria-label="Finished measurements">
        <div className="measure-head garment-measure"><span /><span>Wanted</span><span>Knitted</span><span>Rows</span></div>
        <MeasureRow label="Head" hint={`Head circumference. The hat is ${Math.round(-ease * 100)}% smaller around so it stays on, measured once seamed: ${plan.predicted?.widthCm.how ?? ''}. ${widthCheck?.required.how ?? ''}`}
          wanted={<NumberField id="fit.head" label="Head circumference" value={intent.headCircumferenceCm} min={30} max={80} suffix="cm" onCommit={(headCircumferenceCm) => onFit({ headCircumferenceCm }, `Head ${headCircumferenceCm} cm`)} />}
          knitted={cm(plan.predicted?.widthCm)} count={`${plan.stitches.value} st`} />
        {cuff && <MeasureRow label={intent.fold ? 'Cuff, folded' : 'Cuff'} hint={sections?.cuff ? `${sections.cuff.folds ? `Folded, as worn. Knitted ${cm(sections.cuff.knittedCm)} cm and folded up. ` : ''}${sections.cuff.knittedCm?.how ?? ''}` : 'The rib cuff.'}
          wanted={<NumberField id="fit.cuff" label="Cuff height" value={intent.cuffCm} min={1} max={30} suffix="cm" onCommit={(cuffCm) => onFit({ cuffCm }, `Cuff ${cuffCm} cm`)} />}
          knitted={sections?.cuff ? cm(sections.cuff.folds ? sections.cuff.visibleCm : sections.cuff.knittedCm) : '—'} count={sections?.cuff ? String(sections.cuff.rows) : '—'}
          off={off(intent.cuffCm, sections?.cuff ? (sections.cuff.folds ? sections.cuff.visibleCm : sections.cuff.knittedCm) : null)} />}
        <MeasureRow label={cuff ? 'Body' : 'Rib body'} hint={`From the ${cuff ? 'cuff top' : 'cast-on'} to the first crown decrease. ${sections?.body.cm?.how ?? ''}`}
          wanted={<NumberField id="fit.body" label={cuff ? 'Body height' : 'Rib body height'} value={intent.bodyCm} min={2} max={60} suffix="cm" onCommit={(bodyCm) => onFit({ bodyCm }, `Body ${bodyCm} cm`)} />}
          knitted={cm(sections?.body.cm)} count={sections ? String(sections.body.rows) : '—'} off={off(intent.bodyCm, sections?.body.cm)} />
        {sections?.crown && <MeasureRow label="Crown" hint={`Decreases to ${sections.crown.finalStitches} stitches, then straight rows that are gathered. ${sections.crown.cm?.how ?? ''}`}
          wanted={null} knitted={cm(sections.crown.cm)} count={String(sections.crown.rows)} />}
        {sections?.finishedHeightCm && <MeasureRow label="Height" hint={`Flat, ${cuff && sections.cuff?.folds ? 'with the cuff folded. ' : ''}${sections.finishedHeightCm.how}`}
          wanted={null} knitted={cm(sections.finishedHeightCm)} count="" />}
      </div>
      {cuff && <label className="check-label fold-check"><input type="checkbox" checked={intent.fold === true} onChange={(event) => onFit({ fold: event.currentTarget.checked }, event.currentTarget.checked ? 'Fold the cuff up' : 'Unfolded cuff')} />The cuff folds up (knitted twice as tall)</label>}
      <p className="design-hint">Knitted: what your swatch makes, in cm.</p>
    </Section>
    <Section id="swatch" title="Your swatch" aside={measured ? <em className="section-aside ok">measured</em> : <em className="section-aside warn">typical</em>}>
      <p className="garment-help">{measured ? 'From your swatch. The whole hat is sized from it.' : 'Typical values. Enter what 10 cm of your swatch measures and the whole hat follows.'}</p>
      <GaugeFields id="gauge.body" label={cuff ? `Body (${state.strategy.technique === 'birdseye' ? 'birdseye' : 'fairisle'} fabric)` : 'Rib'} gauge={state.gauge} onCommit={(bodyGauge) => setGauge({ bodyGauge }, `Body gauge ${bodyGauge.stitchesPer10cm}/${bodyGauge.rowsPer10cm} (${bodyGauge.source})`)} />
      {cuff && <GaugeFields id="gauge.rib" label="Cuff (2x2 rib)" gauge={state.object?.ribGauge} onCommit={(ribGauge) => setGauge({ ribGauge }, `Rib gauge ${ribGauge.stitchesPer10cm}/${ribGauge.rowsPer10cm} (${ribGauge.source})`)} />}
      {resized && <p className="garment-derived" role="status">Resized: {resized.needles} → {counts.needles} needles, {resized.rows} → {counts.rows} rows.</p>}
    </Section>
  </>;
}
