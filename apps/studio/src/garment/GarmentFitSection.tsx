import { useState } from 'react';
import type { ProjectGauge, ProjectState } from '@kniterate-studio/project-contract';
import type { BeanieFitChange } from '../beanie';
import { beanieIntentOf } from '../beanie';
import type { ProjectPlan, Valued } from '../plan';

/**
 * The garment's fit as a designer states it. Every input is a change of
 * intent; the Plan derives needles and rows (shown beside each input with
 * how they were derived). Ids match readiness targets (`fit.head`, ...).
 */

function cm(value: Valued<number> | null | undefined): string {
  if (!value) return '—';
  return `${value.provenance === 'assumed' ? '≈' : ''}${value.value} cm`;
}

function NumberField({ id, label, value, step = 0.5, min, max, suffix, onCommit }: { id: string; label: string; value: number | undefined; step?: number; min: number; max: number; suffix: string; onCommit: (value: number) => void }) {
  return <label className="strategy-field garment-field" htmlFor={id}>
    <span>{label}</span>
    <span className="garment-input"><input id={id} type="number" inputMode="decimal" step={step} min={min} max={max} defaultValue={value ?? ''} key={`${id}-${value ?? 'none'}`}
      onBlur={(event) => { const next = Number(event.currentTarget.value); if (event.currentTarget.value !== '' && Number.isFinite(next) && next >= min && next <= max && next !== value) onCommit(next); }}
      onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur(); }} /><i>{suffix}</i></span>
  </label>;
}

function GaugeFields({ id, label, gauge, onCommit }: { id: string; label: string; gauge: Pick<ProjectGauge, 'stitchesPer10cm' | 'rowsPer10cm' | 'source'> | undefined; onCommit: (gauge: Pick<ProjectGauge, 'stitchesPer10cm' | 'rowsPer10cm' | 'source'>) => void }) {
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
      <label><span>Source</span><select aria-label={`${label} source`} value={gauge?.source ?? 'assumed'} onChange={(event) => commit(event.currentTarget.value as ProjectGauge['source'])}><option value="measured">Measured</option><option value="assumed">Assumed</option></select></label>
    </div>
    {gauge?.source === 'assumed' && <p className="garment-note">Assumed: sizes in cm are a guess until you measure a swatch in this yarn and fabric.</p>}
  </fieldset>;
}

export function GarmentFitSection({ state, plan, onFit }: { state: ProjectState; plan: ProjectPlan; onFit: (change: BeanieFitChange, label: string) => void }) {
  const intent = beanieIntentOf(state);
  if (intent === null) return null;
  const sections = plan.sections;
  const widthCheck = plan.sizeChecks.find((check) => check.dimension === 'width');
  const cuff = intent.construction === 'rib-cuff-jersey-body';
  const easePercent = Math.round((intent.ease ?? -0.1) * 1000) / 10;
  return <>
    <section className="garment-section"><h2>Fit</h2>
      <NumberField id="fit.head" label="Head circumference" value={intent.headCircumferenceCm} min={30} max={80} suffix="cm" onCommit={(headCircumferenceCm) => onFit({ headCircumferenceCm }, `Head ${headCircumferenceCm} cm`)} />
      <NumberField id="fit.ease" label="Ease (negative = snug)" value={easePercent} step={1} min={-40} max={40} suffix="%" onCommit={(percent) => onFit({ ease: percent / 100 }, `Ease ${percent}%`)} />
      <p className="garment-derived" title={widthCheck?.required.how ?? plan.predicted?.widthCm.how}>{plan.stitches.value} needles · {cm(plan.predicted?.widthCm)} finished around</p>
    </section>
    {cuff && <section className="garment-section"><h2>Cuff</h2>
      <NumberField id="fit.cuff" label="Visible cuff height" value={intent.cuffCm} min={1} max={30} suffix="cm" onCommit={(cuffCm) => onFit({ cuffCm }, `Cuff ${cuffCm} cm`)} />
      <label className="check-label">Folds up (knitted twice as tall)<input type="checkbox" checked={intent.fold === true} onChange={(event) => onFit({ fold: event.currentTarget.checked }, event.currentTarget.checked ? 'Fold the cuff up' : 'Unfolded cuff')} /></label>
      {sections?.cuff && <p className="garment-derived" title={sections.cuff.knittedCm?.how}>{sections.cuff.rows} rib rows · knitted {cm(sections.cuff.knittedCm)}{sections.cuff.folds ? ` · ${cm(sections.cuff.visibleCm)} folded` : ''}</p>}
    </section>}
    <section className="garment-section"><h2>Body</h2>
      <NumberField id="fit.body" label={cuff ? 'Body height above the cuff' : 'Rib body height'} value={intent.bodyCm} min={2} max={60} suffix="cm" onCommit={(bodyCm) => onFit({ bodyCm }, `Body ${bodyCm} cm`)} />
      <p className="garment-help">Measured from the {cuff ? 'cuff top' : 'cast-on'} to the first crown decrease.</p>
      {sections && <p className="garment-derived" title={sections.body.cm?.how}>{sections.body.rows} rows of {sections.body.fabric} · {cm(sections.body.cm)}</p>}
      {sections?.crown && <p className="garment-derived" title={sections.crown.cm?.how}>Crown: {sections.crown.rows} rows to {sections.crown.finalStitches} stitches · {cm(sections.crown.cm)}</p>}
      {sections?.finishedHeightCm && <p className="garment-derived" title={sections.finishedHeightCm.how}>Finished height {cm(sections.finishedHeightCm)} flat</p>}
    </section>
    <section className="garment-section"><h2>Gauge</h2>
      <GaugeFields id="gauge.body" label={cuff ? `Body (${state.strategy.technique === 'birdseye' ? 'birdseye' : 'fairisle'} fabric)` : 'Rib'} gauge={state.gauge} onCommit={(bodyGauge) => onFit({ bodyGauge }, 'Body gauge')} />
      {cuff && <GaugeFields id="gauge.rib" label="Cuff (2x2 rib)" gauge={state.object?.ribGauge} onCommit={(ribGauge) => onFit({ ribGauge }, 'Rib gauge')} />}
    </section>
  </>;
}
