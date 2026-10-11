import { Chips, NumberInput, Section } from '../workspace/panel';
import type { ProjectEdit, ProjectGauge, ProjectState, SweaterObject } from '@kniterate-studio/project-contract';
import { FITS, SIZES, defaultMeasurements, parseSize, withNeckline, type Fit, type Measurements, type Size } from './draft';
import { SHAPE_MEASUREMENTS, SWEATER_CHOICES, sweaterEdit, withoutShapes, type SweaterPlan } from './sweater';
import { RIBS } from './textures';
import { SilhouetteIcon } from './SilhouetteIcon';
import { StitchSection, YarnGaugeSection } from './DesignSections';

/**
 * The design: style, size, measurements, stitch, trims, yarn and gauge.
 * Every change is one undoable operation; the counts follow from the plan.
 */

export type Operate = (label: string, edits: ProjectEdit[]) => boolean;

const FIELDS: { key: keyof Measurements; label: string; hint: string; show?: (object: SweaterObject) => boolean }[] = [
  { key: 'chest', label: 'Chest', hint: 'All the way round the finished sweater, under the arms' },
  { key: 'length', label: 'Length', hint: 'From the hem up to the shoulder, next to the neck' },
  { key: 'armholeDepth', label: 'Armhole depth', hint: 'From the underarm straight up to the shoulder' },
  { key: 'shoulderWidth', label: 'Shoulder width', hint: 'Across the back, from shoulder point to shoulder point', show: (object) => object.silhouette !== 'drop-shoulder' },
  { key: 'sleeveLength', label: 'Sleeve length', hint: 'From the underarm to the edge of the cuff' },
  { key: 'upperArm', label: 'Upper arm', hint: 'Round the sleeve at the underarm' },
  { key: 'cuff', label: 'Cuff', hint: 'Round the cuff' },
  { key: 'neckWidth', label: 'Neck width', hint: 'Across the neck opening' },
  { key: 'frontNeckDepth', label: 'Front neck depth', hint: 'How far the front neck dips below the shoulders', show: (object) => object.neckline !== 'boat' },
  { key: 'backNeckDepth', label: 'Back neck depth', hint: '0 keeps the back neck straight', show: (object) => object.neckline !== 'boat' },
  { key: 'shoulderDrop', label: 'Shoulder slope', hint: 'How much lower the shoulder point sits than the neck', show: (object) => object.neckline !== 'boat' },
];


export function SweaterDesignPanel({ state, plan, operate }: { state: ProjectState; plan: SweaterPlan; operate: Operate }) {
  const object = plan.object;
  const yarn = state.chart.palette[0]!;
  const change = (label: string, next: SweaterObject, extra: ProjectEdit[] = []) => operate(label, [sweaterEdit(next), ...extra]);
  const { size, fit } = parseSize(object.size);
  const sized = size !== null && fit !== null ? defaultMeasurements(size, fit, object.silhouette, object.neckline) : null;
  const custom = sized === null || FIELDS.some((field) => (field.show?.(object) ?? true) && Math.abs((sized[field.key] ?? 0) - (object.measurements[field.key] ?? 0)) > 0.05);
  const shaped = plan.custom.body || plan.custom.sleeve;
  const resetNote = shaped ? ' (your shapes reset)' : '';
  const applySize = (nextSize: Size, nextFit: Fit, silhouette = object.silhouette) => change(`Size ${nextSize}, ${nextFit} fit${resetNote}`, { ...withoutShapes(object), silhouette, size: `${nextSize} ${nextFit}`, measurements: defaultMeasurements(nextSize, nextFit, silhouette, object.neckline) });
  const lockedBy = (key: keyof Measurements): 'body' | 'sleeve' | null => (plan.custom.body && SHAPE_MEASUREMENTS.body.includes(key) ? 'body' : plan.custom.sleeve && SHAPE_MEASUREMENTS.sleeve.includes(key) ? 'sleeve' : null);
  const releaseShape = (kind: 'body' | 'sleeve') => {
    const { [kind]: _dropped, ...others } = object.shapes ?? {};
    change(`${kind === 'body' ? 'Body' : 'Sleeve'} shape from the measurements`, { ...object, shapes: Object.keys(others).length > 0 ? others : undefined });
  };
  const gauge = plan.gauge;
  const setRibGauge = (next: Pick<ProjectGauge, 'stitchesPer10cm' | 'rowsPer10cm' | 'source'>, label: string) => change(label, { ...object, ribGauge: { ...next } });

  return <aside className="sweater-design" aria-label="Design">
    <Section title="Style">
      <div className="silhouette-cards" role="radiogroup" aria-label="Sleeve style">
        {SWEATER_CHOICES.silhouettes.map((choice) => <button key={choice.id} type="button" role="radio" aria-checked={object.silhouette === choice.id} className={object.silhouette === choice.id ? 'active' : ''} onClick={() => {
          if (choice.id === object.silhouette) return;
          // Keep a standard size standard: the new style gets its own fitted measurements.
          if (size !== null && fit !== null && !custom) applySize(size, fit, choice.id);
          else change(`${choice.name}${resetNote}`, { ...withoutShapes(object), silhouette: choice.id });
        }}>
          <SilhouetteIcon silhouette={choice.id} neckline={object.neckline} />
          <b>{choice.name}</b>
          <small>{choice.note}</small>
        </button>)}
      </div>
      <div className="field-row"><span>Neck</span><Chips label="Neckline" value={object.neckline} options={SWEATER_CHOICES.necklines} onPick={(neckline) => change(SWEATER_CHOICES.necklines.find((choice) => choice.id === neckline)!.name, withNeckline(object, neckline))} /></div>
    </Section>

    <Section title="Size" aside={<em className="section-aside">{custom ? 'Custom' : `${size} · ${fit}`}</em>}>
      <div className="field-row"><span>Size</span><Chips label="Size" value={custom ? null : size} options={SIZES.map((id) => ({ id, name: id }))} onPick={(id) => applySize(id, fit ?? 'classic')} /></div>
      <div className="field-row"><span>Fit</span><Chips label="Fit" value={custom ? null : fit} options={FITS.map((id) => ({ id, name: id[0]!.toUpperCase() + id.slice(1) }))} onPick={(id) => applySize(size ?? 'M', id)} /></div>
      <div className="measure-table" role="group" aria-label="Finished measurements">
        <div className="measure-head"><span /><span>Wanted</span><span>Knitted</span></div>
        {FIELDS.filter((field) => field.show?.(object) ?? true).map((field) => {
          const wanted = object.measurements[field.key] ?? (field.key === 'shoulderDrop' ? 2 : 0);
          const knitted = plan.knitted[field.key];
          const locked = lockedBy(field.key);
          const off = locked === null && knitted !== undefined && Math.abs(knitted - wanted) >= 1;
          return <label key={field.key} className={`measure-row${locked ? ' locked' : ''}`} title={locked ? `Your ${locked} shape sets this; the knitted value is shown.` : field.hint}>
            <span>{field.label}</span>
            {locked
              ? <span className="shape-locked">from shape</span>
              : <NumberInput label={field.label} value={wanted} min={field.key === 'backNeckDepth' || field.key === 'shoulderDrop' ? 0 : 1} max={field.key === 'shoulderDrop' ? 15 : 250} suffix="cm"
                  onCommit={(value) => change(`${field.label} ${value} cm`, { ...object, measurements: { ...object.measurements, [field.key]: value } })} />}
            <span className={`knitted${off ? ' off' : ''}`}>{knitted === undefined ? '—' : `${knitted}`}</span>
          </label>;
        })}
      </div>
      {(['body', 'sleeve'] as const).filter((kind) => plan.custom[kind]).map((kind) => <p key={kind} className="shape-note">The {kind === 'body' ? 'front and back follow' : 'sleeves follow'} your own shape. <button type="button" className="link-button" onClick={() => releaseShape(kind)}>Use the measurements</button></p>)}
      <p className="design-hint">Finished sizes, not body sizes. Knitted: what your gauge makes.</p>
    </Section>

    <StitchSection body={object.body} hex={yarn.hex} gaugeAssumed={gauge.source === 'assumed'} onChange={(label, body, edits) => change(label, { ...object, body }, edits)} />

    <Section title="Edges">
      {([['hem', 'Hem'], ['cuff', 'Cuffs'], ['neck', object.neckline === 'boat' ? 'Neck edge' : 'Neckband']] as const).map(([key, label]) => <div key={key} className="trim-row">
        <span>{label}</span>
        <Chips label={`${label} rib`} value={object.trims[key].rib} options={RIBS.map((rib) => ({ id: rib.rib, name: rib.name }))} onPick={(rib) => change(`${label}: ${RIBS.find((item) => item.rib === rib)?.name} rib`, { ...object, trims: { ...object.trims, [key]: { ...object.trims[key], rib } } })} />
        <NumberInput label={`${label} height`} value={object.trims[key].cm} min={key === 'hem' ? 0 : 1} max={20} suffix="cm" onCommit={(cm) => change(`${label} ${cm} cm`, { ...object, trims: { ...object.trims, [key]: { ...object.trims[key], cm } } })} />
      </div>)}
      <div className="field-row"><span>Top</span><Chips label="Top edge" value={object.top ?? 'bind-off'} options={[{ id: 'bind-off', name: 'Bind off', note: 'The machine binds off each piece.' }, { id: 'waste', name: 'Waste yarn', note: 'Live stitches on waste yarn, to graft or bind off by hand.' }]} onPick={(top) => change(top === 'waste' ? 'Finish on waste yarn' : 'Bind off the tops', { ...object, top })} /></div>
      <div className="field-row"><span>Shaping</span><Chips label="Shaping line" value={String(object.fashion ?? 1) as '1' | '2' | '3'} options={[{ id: '1', name: 'At the edge', note: 'Decreases and increases at the very edge.' }, { id: '2', name: '2 in', note: 'A fashioning line 2 stitches in from the edge.' }, { id: '3', name: '3 in', note: 'A fashioning line 3 stitches in.' }]} onPick={(fashion) => change(fashion === '1' ? 'Shape at the edge' : `Fashion ${fashion} stitches in`, { ...object, fashion: Number(fashion) })} /></div>
    </Section>

    <YarnGaugeSection yarn={yarn} carrier={plan.carriers.main} bodyName={object.body.name} gauge={gauge} ribGauge={plan.ribGauge} operate={operate} onRibGauge={setRibGauge} />
  </aside>;
}
