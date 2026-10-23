import { useState } from 'react';
import type { ProjectGauge } from '@kniterate-studio/project-contract';

/**
 * A gauge, the same for every kind of project: one editor, the words for
 * whether it was measured, and the rule for a change of fabric.
 */

export type GaugeValue = Pick<ProjectGauge, 'stitchesPer10cm' | 'rowsPer10cm' | 'source' | 'note'>;
type Numbers = Pick<ProjectGauge, 'stitchesPer10cm' | 'rowsPer10cm'>;

/**
 * A measured gauge belongs to the fabric it was measured on. Another fabric
 * keeps the numbers, but not as measured, noting where they came from; back
 * on that fabric, they count as measured again. A typical gauge takes the new
 * fabric's typical values, when it has any. `to` is null for a fabric of your
 * own, which is never the one measured. Null when nothing changes.
 */
export function regauge(gauge: GaugeValue, from: string, to: { name: string; typical?: Numbers } | null): GaugeValue | null {
  const kept = { stitchesPer10cm: gauge.stitchesPer10cm, rowsPer10cm: gauge.rowsPer10cm };
  if (gauge.source === 'measured') return { ...kept, source: 'assumed', note: `Measured on ${from}` };
  if (to && gauge.note === `Measured on ${to.name}`) return { ...kept, source: 'measured' };
  if (to?.typical && !gauge.note) return { stitchesPer10cm: to.typical.stitchesPer10cm, rowsPer10cm: to.typical.rowsPer10cm, source: 'assumed' };
  return null;
}

/** How a swatch section says where its gauges come from: each gauge with the fabric it is for, which names what to knit the swatch in. */
export function swatchWords(gauges: readonly { gauge: GaugeValue | undefined; fabric: string }[]): { aside: 'measured' | 'typical' | 'measure again'; hint: string } {
  const noted = gauges.find(({ gauge }) => gauge?.source !== 'measured' && gauge?.note);
  if (gauges.every(({ gauge }) => gauge?.source === 'measured')) return { aside: 'measured', hint: 'From your swatch.' };
  if (noted) return { aside: 'measure again', hint: `${noted.gauge!.note}. Measure a swatch of ${noted.fabric} for true sizes.` };
  return { aside: 'typical', hint: 'Typical values. Measure 10 cm of a swatch for true sizes.' };
}

export function SwatchAside({ aside }: { aside: ReturnType<typeof swatchWords>['aside'] }) {
  return <em className={`section-aside ${aside === 'measured' ? 'ok' : 'warn'}`}>{aside}</em>;
}

/**
 * One gauge: stitches and rows per 10 cm, and whether you measured them.
 * One operation per gauge: it commits when focus leaves the group, not after
 * each number. Any change here is yours, so it drops the note of which fabric
 * an earlier swatch was.
 */
export function GaugeFields({ id, label, gauge, onCommit }: { id: string; label: string; gauge: GaugeValue | undefined; onCommit: (gauge: GaugeValue) => void }) {
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
  return <fieldset className="gauge-fields" id={id} tabIndex={-1} onBlur={(event) => { if (draft && !event.currentTarget.contains(event.relatedTarget as Node | null)) commit(gauge?.source ?? 'assumed'); }}>
    <legend>{label} <small>per 10 cm</small></legend>
    <div className="gauge-row">
      <label><span>Stitches</span><input aria-label={`${label} stitches per 10 cm`} type="number" step="0.5" min="1" max="100" value={stitches} onChange={(event) => setDraft({ stitches: event.currentTarget.value, rows })} onKeyDown={(event) => { if (event.key === 'Enter') commit(gauge?.source ?? 'assumed'); }} /></label>
      <label><span>Rows</span><input aria-label={`${label} rows per 10 cm`} type="number" step="0.5" min="1" max="100" value={rows} onChange={(event) => setDraft({ stitches, rows: event.currentTarget.value })} onKeyDown={(event) => { if (event.key === 'Enter') commit(gauge?.source ?? 'assumed'); }} /></label>
      <label className="measured-check"><input type="checkbox" aria-label={`${label} measured`} checked={gauge?.source === 'measured'} onChange={(event) => commit(event.currentTarget.checked ? 'measured' : 'assumed')} />measured</label>
    </div>
  </fieldset>;
}
