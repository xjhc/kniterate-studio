import { useEffect, useState, type ReactNode } from 'react';
import { ChevronDown, Pencil } from 'lucide-react';
import type { ProjectEdit, ProjectGauge, ProjectState, SweaterObject } from '@kniterate-studio/project-contract';
import { FITS, SIZES, defaultMeasurements, type Fit, type Measurements, type Size } from './draft';
import { SWEATER_CHOICES, sweaterEdit, type SweaterPlan } from './sweater';
import { RIBS, TEXTURES, textureMatching } from './textures';
import { TextureEditor, TextureSwatch } from './TextureSwatch';
import { SilhouetteIcon } from './SilhouetteIcon';

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
  { key: 'frontNeckDepth', label: 'Front neck depth', hint: 'How far the front neck dips below the shoulders', show: (object) => object.neckline === 'crew' },
  { key: 'backNeckDepth', label: 'Back neck depth', hint: '0 keeps the back neck straight', show: (object) => object.neckline === 'crew' },
  { key: 'shoulderDrop', label: 'Shoulder slope', hint: 'How much lower the shoulder point sits than the neck', show: (object) => object.neckline === 'crew' },
];

function Section({ title, children, defaultOpen = true, aside }: { title: string; children: ReactNode; defaultOpen?: boolean; aside?: ReactNode }) {
  const [open, setOpen] = useState(defaultOpen);
  return <section className={`design-section${open ? ' open' : ''}`}>
    <button type="button" className="design-section-head" onClick={() => setOpen(!open)} aria-expanded={open}>
      <span>{title}</span>{aside}<ChevronDown size={15} />
    </button>
    {open && <div className="design-section-body">{children}</div>}
  </section>;
}

/** A number that commits on Enter or blur; invalid input is shown, never applied. */
function NumberInput({ value, min, max, step = 0.5, onCommit, label, suffix }: { value: number; min: number; max: number; step?: number; onCommit: (value: number) => void; label: string; suffix?: string }) {
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);
  const parsed = Number(text);
  const invalid = text.trim() === '' || !Number.isFinite(parsed) || parsed < min || parsed > max;
  const commit = () => { if (!invalid && parsed !== value) onCommit(Math.round(parsed * 10) / 10); else if (invalid) setText(String(value)); };
  return <span className="number-input">
    <input type="number" inputMode="decimal" min={min} max={max} step={step} value={text} aria-label={label} aria-invalid={invalid}
      onChange={(event) => setText(event.currentTarget.value)} onBlur={commit} onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur(); if (event.key === 'Escape') { setText(String(value)); event.currentTarget.blur(); } }} />
    {suffix && <i>{suffix}</i>}
  </span>;
}

function Chips<T extends string>({ value, options, onPick, label }: { value: T | null; options: readonly { id: T; name: string; note?: string }[]; onPick: (id: T) => void; label: string }) {
  return <div className="chips" role="radiogroup" aria-label={label}>
    {options.map((option) => <button key={option.id} type="button" role="radio" aria-checked={value === option.id} className={value === option.id ? 'active' : ''} title={option.note} onClick={() => onPick(option.id)}>{option.name}</button>)}
  </div>;
}

function parseSize(label: string | undefined): { size: Size | null; fit: Fit | null } {
  const [size, fit] = (label ?? '').split(' ');
  return { size: (SIZES as readonly string[]).includes(size ?? '') ? size as Size : null, fit: (FITS as readonly string[]).includes(fit ?? '') ? fit as Fit : null };
}

export function SweaterDesignPanel({ state, plan, operate }: { state: ProjectState; plan: SweaterPlan; operate: Operate }) {
  const object = plan.object;
  const yarn = state.chart.palette[0]!;
  const [editingTexture, setEditingTexture] = useState(false);
  const change = (label: string, next: SweaterObject, extra: ProjectEdit[] = []) => operate(label, [sweaterEdit(next), ...extra]);
  const { size, fit } = parseSize(object.size);
  const sized = size !== null && fit !== null ? defaultMeasurements(size, fit, object.silhouette) : null;
  const custom = sized === null || FIELDS.some((field) => (field.show?.(object) ?? true) && Math.abs((sized[field.key] ?? 0) - (object.measurements[field.key] ?? 0)) > 0.05);
  const applySize = (nextSize: Size, nextFit: Fit, silhouette = object.silhouette) => change(`Size ${nextSize}, ${nextFit} fit`, { ...object, silhouette, size: `${nextSize} ${nextFit}`, measurements: defaultMeasurements(nextSize, nextFit, silhouette) });
  const library = textureMatching(object.body.texture);
  const gauge = plan.gauge;
  const setGauge = (next: Pick<ProjectGauge, 'stitchesPer10cm' | 'rowsPer10cm' | 'source'>, label: string) => operate(label, [{ kind: 'set-gauge', gauge: { ...next } }]);
  const setRibGauge = (next: Pick<ProjectGauge, 'stitchesPer10cm' | 'rowsPer10cm' | 'source'>, label: string) => change(label, { ...object, ribGauge: { ...next } });

  return <aside className="sweater-design" aria-label="Design">
    <Section title="Style">
      <div className="silhouette-cards" role="radiogroup" aria-label="Sleeve style">
        {SWEATER_CHOICES.silhouettes.map((choice) => <button key={choice.id} type="button" role="radio" aria-checked={object.silhouette === choice.id} className={object.silhouette === choice.id ? 'active' : ''} onClick={() => {
          if (choice.id === object.silhouette) return;
          // Keep a standard size standard: the new style gets its own fitted measurements.
          if (size !== null && fit !== null && !custom) applySize(size, fit, choice.id);
          else change(`${choice.name}`, { ...object, silhouette: choice.id });
        }}>
          <SilhouetteIcon silhouette={choice.id} neckline={object.neckline} />
          <b>{choice.name}</b>
          <small>{choice.note}</small>
        </button>)}
      </div>
      <div className="field-row"><span>Neck</span><Chips label="Neckline" value={object.neckline} options={SWEATER_CHOICES.necklines} onPick={(neckline) => change(neckline === 'crew' ? 'Crew neck' : 'Boat neck', { ...object, neckline })} /></div>
    </Section>

    <Section title="Size" aside={<em className="section-aside">{custom ? 'Custom' : `${size} · ${fit}`}</em>}>
      <div className="field-row"><span>Size</span><Chips label="Size" value={custom ? null : size} options={SIZES.map((id) => ({ id, name: id }))} onPick={(id) => applySize(id, fit ?? 'classic')} /></div>
      <div className="field-row"><span>Fit</span><Chips label="Fit" value={custom ? null : fit} options={FITS.map((id) => ({ id, name: id[0]!.toUpperCase() + id.slice(1) }))} onPick={(id) => applySize(size ?? 'M', id)} /></div>
      <div className="measure-table" role="group" aria-label="Finished measurements">
        <div className="measure-head"><span /><span>Wanted</span><span>Knitted</span></div>
        {FIELDS.filter((field) => field.show?.(object) ?? true).map((field) => {
          const wanted = object.measurements[field.key] ?? (field.key === 'shoulderDrop' ? 2 : 0);
          const knitted = plan.knitted[field.key];
          const off = knitted !== undefined && Math.abs(knitted - wanted) >= 1;
          return <label key={field.key} className="measure-row" title={field.hint}>
            <span>{field.label}</span>
            <NumberInput label={field.label} value={wanted} min={field.key === 'backNeckDepth' || field.key === 'shoulderDrop' ? 0 : 1} max={field.key === 'shoulderDrop' ? 15 : 250} suffix="cm"
              onCommit={(value) => change(`${field.label} ${value} cm`, { ...object, measurements: { ...object.measurements, [field.key]: value } })} />
            <span className={`knitted${off ? ' off' : ''}`}>{knitted === undefined ? '—' : `${knitted}`}</span>
          </label>;
        })}
      </div>
      <p className="design-hint">Measurements are the finished sweater, not the body. "Knitted" is what the machine makes at your gauge.</p>
    </Section>

    <Section title="Stitch" aside={<em className="section-aside">{object.body.name}</em>}>
      <div className="texture-grid" role="radiogroup" aria-label="Body stitch">
        {TEXTURES.map((texture) => <button key={texture.id} type="button" role="radio" aria-checked={library?.id === texture.id} className={library?.id === texture.id ? 'active' : ''} title={texture.note} onClick={() => {
          if (library?.id === texture.id) return;
          const edits: ProjectEdit[] = gauge.source === 'assumed' ? [{ kind: 'set-gauge', gauge: { ...texture.gauge, source: 'assumed' } }] : [];
          change(`${texture.name}`, { ...object, body: { name: texture.name, texture: [...texture.rows] } }, edits);
        }}>
          <TextureSwatch rows={texture.rows} hex={yarn.hex} size={8} columns={8} rowsShown={6} />
          <span>{texture.name}</span>
        </button>)}
        <button type="button" role="radio" aria-checked={library === undefined} className={`custom-texture${library === undefined ? ' active' : ''}`} onClick={() => setEditingTexture(true)}>
          {library === undefined ? <TextureSwatch rows={object.body.texture} hex={yarn.hex} size={8} columns={8} rowsShown={6} /> : <span className="custom-mark"><Pencil size={16} /></span>}
          <span>{library === undefined ? 'Your stitch' : 'Make your own'}</span>
        </button>
      </div>
      {library && <p className="design-hint">{library.note}</p>}
      {(editingTexture || library === undefined) && <div className="texture-editor-wrap">
        <TextureEditor rows={object.body.texture} hex={yarn.hex} onChange={(rows) => { change('Edit the stitch', { ...object, body: { name: textureMatching(rows)?.name ?? 'Custom stitch', texture: rows } }); }} />
        {editingTexture && <button type="button" className="link-button" onClick={() => setEditingTexture(false)}>Done</button>}
      </div>}
    </Section>

    <Section title="Edges">
      {([['hem', 'Hem'], ['cuff', 'Cuffs'], ['neck', object.neckline === 'crew' ? 'Neckband' : 'Neck edge']] as const).map(([key, label]) => <div key={key} className="trim-row">
        <span>{label}</span>
        <Chips label={`${label} rib`} value={object.trims[key].rib} options={RIBS.map((rib) => ({ id: rib.rib, name: rib.name }))} onPick={(rib) => change(`${label}: ${RIBS.find((item) => item.rib === rib)?.name} rib`, { ...object, trims: { ...object.trims, [key]: { ...object.trims[key], rib } } })} />
        <NumberInput label={`${label} height`} value={object.trims[key].cm} min={key === 'hem' ? 0 : 1} max={20} suffix="cm" onCommit={(cm) => change(`${label} ${cm} cm`, { ...object, trims: { ...object.trims, [key]: { ...object.trims[key], cm } } })} />
      </div>)}
      <div className="field-row"><span>Top</span><Chips label="Top edge" value={object.top ?? 'bind-off'} options={[{ id: 'bind-off', name: 'Bind off', note: 'The machine binds off each piece.' }, { id: 'waste', name: 'Waste yarn', note: 'Live stitches on waste yarn, to graft or bind off by hand.' }]} onPick={(top) => change(top === 'waste' ? 'Finish on waste yarn' : 'Bind off the tops', { ...object, top })} /></div>
      <div className="field-row"><span>Shaping</span><Chips label="Shaping line" value={String(object.fashion ?? 1) as '1' | '2' | '3'} options={[{ id: '1', name: 'At the edge', note: 'Decreases and increases at the very edge.' }, { id: '2', name: '2 in', note: 'A fashioning line 2 stitches in from the edge.' }, { id: '3', name: '3 in', note: 'A fashioning line 3 stitches in.' }]} onPick={(fashion) => change(fashion === '1' ? 'Shape at the edge' : `Fashion ${fashion} stitches in`, { ...object, fashion: Number(fashion) })} /></div>
    </Section>

    <Section title="Yarn & gauge" aside={gauge.source === 'assumed' ? <em className="section-aside warn">assumed</em> : <em className="section-aside ok">measured</em>}>
      <label className="yarn-row"><input type="color" value={yarn.hex} aria-label="Yarn colour" onChange={(event) => operate('Yarn colour', [{ kind: 'set-palette-entry', paletteId: yarn.id, name: yarn.name, hex: event.currentTarget.value.toUpperCase() }])} />
        <input type="text" defaultValue={yarn.name} key={yarn.name} aria-label="Yarn name" onBlur={(event) => { const name = event.currentTarget.value.trim(); if (name && name !== yarn.name) operate(`Yarn: ${name}`, [{ kind: 'set-palette-entry', paletteId: yarn.id, name, hex: yarn.hex }, { kind: 'set-yarn-assignment', assignment: { paletteId: yarn.id, carrier: plan.carriers.main as '2' | '3' | '4' | '5', yarnName: name } }]); }} />
      </label>
      <GaugeRow label={`${object.body.name} gauge`} gauge={gauge} onChange={(next) => setGauge(next, `Body gauge ${next.stitchesPer10cm}/${next.rowsPer10cm} (${next.source})`)} />
      <GaugeRow label="Rib gauge" gauge={plan.ribGauge} onChange={(next) => setRibGauge(next, `Rib gauge ${next.stitchesPer10cm}/${next.rowsPer10cm} (${next.source})`)} />
      <p className="design-hint">{gauge.source === 'assumed' ? 'Gauges are typical values. Knit a swatch, measure stitches and rows over 10 cm, and enter them to get true sizes.' : 'Sizes come from your measured gauge.'}</p>
    </Section>
  </aside>;
}

function GaugeRow({ label, gauge, onChange }: { label: string; gauge: { stitchesPer10cm: number; rowsPer10cm: number; source: 'measured' | 'assumed' }; onChange: (next: { stitchesPer10cm: number; rowsPer10cm: number; source: 'measured' | 'assumed' }) => void }) {
  return <div className="gauge-row" role="group" aria-label={label}>
    <span>{label}</span>
    <NumberInput label={`${label} stitches per 10 cm`} value={gauge.stitchesPer10cm} min={5} max={60} step={0.5} suffix="st" onCommit={(stitchesPer10cm) => onChange({ ...gauge, stitchesPer10cm })} />
    <NumberInput label={`${label} rows per 10 cm`} value={gauge.rowsPer10cm} min={5} max={100} step={0.5} suffix="rows" onCommit={(rowsPer10cm) => onChange({ ...gauge, rowsPer10cm })} />
    <label className="measured-check"><input type="checkbox" checked={gauge.source === 'measured'} onChange={(event) => onChange({ ...gauge, source: event.currentTarget.checked ? 'measured' : 'assumed' })} />measured</label>
  </div>;
}
