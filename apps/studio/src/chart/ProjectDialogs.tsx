import { useState, type FormEvent, type ReactNode } from 'react';
import { Check, X } from 'lucide-react';
import type { ColorworkChartPaletteEntry } from '@kniterate-studio/chart-contract';
import {
  AUTHORED_CAPACITY_LIMITS_V1,
  materializeColorworkProject,
  type ColorworkProjectV1,
  type ProjectGauge,
} from '@kniterate-studio/project-contract';
import type { BeanieIntent } from '../beanie';

export const DEFAULT_PROJECT_PALETTE: readonly ColorworkChartPaletteEntry[] = [
  { id: 'natural', name: 'Natural', hex: '#F4F0E6' },
  { id: 'red', name: 'Red', hex: '#C2413A' },
  { id: 'gold', name: 'Gold', hex: '#D6A633' },
  { id: 'navy', name: 'Navy', hex: '#24415D' },
];

function DialogShell({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  return <div className="modal-backdrop project-dialog-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
    <section className="project-dialog" role="dialog" aria-modal="true" aria-labelledby="project-dialog-title">
      <header><h2 id="project-dialog-title">{title}</h2><button className="icon-button" type="button" onClick={onClose} aria-label="Close"><X size={16} /></button></header>
      {children}
    </section>
  </div>;
}

export interface NewProjectValues {
  title: string;
  width: number;
  height: number;
  colorCount: number;
}

export function NewProjectDialog({ onCreate, onCreateBeanie, onClose }: { onCreate: (values: NewProjectValues) => void; onCreateBeanie?: (intent: BeanieIntent) => void; onClose: () => void }) {
  const [kind, setKind] = useState<'rectangle' | 'beanie'>('rectangle');
  return <DialogShell title="New project" onClose={onClose}>
    {onCreateBeanie && <div className="project-kind" role="tablist" aria-label="Kind of project">
      <button type="button" role="tab" aria-selected={kind === 'rectangle'} className={kind === 'rectangle' ? 'active' : ''} onClick={() => setKind('rectangle')}>Rectangle</button>
      <button type="button" role="tab" aria-selected={kind === 'beanie'} className={kind === 'beanie' ? 'active' : ''} onClick={() => setKind('beanie')}>Beanie</button>
    </div>}
    {kind === 'beanie' && onCreateBeanie ? <NewBeanieForm onCreate={onCreateBeanie} onClose={onClose} /> : <NewRectangleForm onCreate={onCreate} onClose={onClose} />}
  </DialogShell>;
}

function NewRectangleForm({ onCreate, onClose }: { onCreate: (values: NewProjectValues) => void; onClose: () => void }) {
  const [title, setTitle] = useState('New colorwork blanket');
  const [width, setWidth] = useState(120);
  const [height, setHeight] = useState(160);
  const [colorCount, setColorCount] = useState(4);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    onCreate({ title: title.trim(), width, height, colorCount });
  };
  return <form onSubmit={submit}>
    <label>Project name<input autoFocus required maxLength={200} value={title} onChange={(event) => setTitle(event.currentTarget.value)} /></label>
    <div className="project-dialog-grid"><label>Needles<input required type="number" min="1" max={AUTHORED_CAPACITY_LIMITS_V1.chartWidth} value={width} onChange={(event) => setWidth(Number(event.currentTarget.value))} /></label><label>Rows<input required type="number" min="1" max={AUTHORED_CAPACITY_LIMITS_V1.chartHeight} value={height} onChange={(event) => setHeight(Number(event.currentTarget.value))} /></label></div>
    <fieldset><legend>Pattern colors</legend><div className="color-count-control">{[2, 3, 4].map((count) => <button className={colorCount === count ? 'active' : ''} type="button" key={count} onClick={() => setColorCount(count)}>{count}</button>)}</div></fieldset>
    <footer><button className="secondary-button" type="button" onClick={onClose}>Cancel</button><button className="primary-button" type="submit" disabled={!title.trim() || width < 1 || width > AUTHORED_CAPACITY_LIMITS_V1.chartWidth || height < 1 || height > AUTHORED_CAPACITY_LIMITS_V1.chartHeight}><Check size={16} /> Create</button></footer>
  </form>;
}

export function ProjectSettingsDialog({ project, onSave, onClose }: {
  project: ColorworkProjectV1;
  onSave: (title: string, palette: ColorworkChartPaletteEntry[]) => void;
  onClose: () => void;
}) {
  const [title, setTitle] = useState(project.title);
  const [palette, setPalette] = useState(() => materializeColorworkProject(project).state.chart.palette.map((entry) => ({ ...entry })));
  const submit = (event: FormEvent) => {
    event.preventDefault();
    onSave(title.trim(), palette);
  };
  return <DialogShell title="Project settings" onClose={onClose}><form onSubmit={submit}>
    <label>Project name<input autoFocus required maxLength={200} value={title} onChange={(event) => setTitle(event.currentTarget.value)} /></label>
    <fieldset><legend>Palette</legend><div className="palette-editor">{palette.map((entry, index) => <div key={entry.id}>
      <input type="color" aria-label={`${entry.name} color`} value={entry.hex} onChange={(event) => { const hex = event.currentTarget.value.toUpperCase(); setPalette((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, hex } : item)); }} />
      <input required maxLength={100} aria-label={`Palette color ${index + 1} name`} value={entry.name} onChange={(event) => { const name = event.currentTarget.value; setPalette((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, name } : item)); }} />
      <code>{entry.hex.toUpperCase()}</code>
    </div>)}</div></fieldset>
    <footer><button className="secondary-button" type="button" onClick={onClose}>Cancel</button><button className="primary-button" type="submit" disabled={!title.trim() || palette.some((entry) => !entry.name.trim())}><Check size={16} /> Save</button></footer>
  </form></DialogShell>;
}

export function NewBeanieForm({ onCreate, onClose }: { onCreate: (intent: BeanieIntent) => void; onClose: () => void }) {
  const [title, setTitle] = useState('Beanie');
  const [head, setHead] = useState(56);
  const [easePercent, setEasePercent] = useState(-10);
  const [cuff, setCuff] = useState(true);
  const [cuffCm, setCuffCm] = useState(7);
  const [fold, setFold] = useState(true);
  const [bodyCm, setBodyCm] = useState(13);
  const [bodyGauge, setBodyGauge] = useState({ stitchesPer10cm: 26, rowsPer10cm: 34, source: 'assumed' as ProjectGauge['source'] });
  const [ribGauge, setRibGauge] = useState({ stitchesPer10cm: 30, rowsPer10cm: 32, source: 'assumed' as ProjectGauge['source'] });
  const [main, setMain] = useState({ name: 'Black', hex: '#111111' });
  const [accent, setAccent] = useState<{ name: string; hex: string } | null>({ name: 'White', hex: '#F2F2F2' });
  const [backing, setBacking] = useState<'fairisle' | 'birdseye'>('birdseye');
  const submit = (event: FormEvent) => {
    event.preventDefault();
    onCreate({
      title: title.trim(), headCircumferenceCm: head, ease: easePercent / 100, bodyCm, bodyGauge: cuff ? bodyGauge : ribGauge,
      ...(cuff ? { cuffCm, ribGauge, fold, backing, ...(accent ? { accent } : {}) } : {}),
      main,
    });
  };
  const gauge = (label: string, value: typeof bodyGauge, set: (next: typeof bodyGauge) => void) => <fieldset><legend>{label} <small>per 10 cm</small></legend><div className="project-dialog-grid three">
    <label>Stitches<input required type="number" step="0.5" min="1" max="100" value={value.stitchesPer10cm} onChange={(event) => set({ ...value, stitchesPer10cm: Number(event.currentTarget.value) })} /></label>
    <label>Rows<input required type="number" step="0.5" min="1" max="100" value={value.rowsPer10cm} onChange={(event) => set({ ...value, rowsPer10cm: Number(event.currentTarget.value) })} /></label>
    <label>Source<select value={value.source} onChange={(event) => set({ ...value, source: event.currentTarget.value as ProjectGauge['source'] })}><option value="measured">Measured</option><option value="assumed">Assumed</option></select></label>
  </div></fieldset>;
  return <form onSubmit={submit}>
    <label>Project name<input autoFocus required maxLength={200} value={title} onChange={(event) => setTitle(event.currentTarget.value)} /></label>
    <div className="project-dialog-grid">
      <label>Head circumference (cm)<input required type="number" step="0.5" min="30" max="80" value={head} onChange={(event) => setHead(Number(event.currentTarget.value))} /></label>
      <label>Ease (%; negative = snug)<input required type="number" step="1" min="-40" max="40" value={easePercent} onChange={(event) => setEasePercent(Number(event.currentTarget.value))} /></label>
      <label>{cuff ? 'Body above the cuff (cm)' : 'Rib body (cm)'}<input required type="number" step="0.5" min="2" max="60" value={bodyCm} onChange={(event) => setBodyCm(Number(event.currentTarget.value))} /></label>
      <label>Cuff<select value={cuff ? 'cuff' : 'rib'} onChange={(event) => setCuff(event.currentTarget.value === 'cuff')}><option value="cuff">Rib cuff + colorwork body</option><option value="rib">All 2x2 rib, one color</option></select></label>
    </div>
    {cuff && <div className="project-dialog-grid">
      <label>Visible cuff height (cm)<input required type="number" step="0.5" min="1" max="30" value={cuffCm} onChange={(event) => setCuffCm(Number(event.currentTarget.value))} /></label>
      <label className="check-label"><input type="checkbox" checked={fold} onChange={(event) => setFold(event.currentTarget.checked)} /> Folds up</label>
    </div>}
    {cuff ? gauge('Body gauge', bodyGauge, setBodyGauge) : gauge('Rib gauge', ribGauge, setRibGauge)}
    {cuff && gauge('Cuff (2x2 rib) gauge', ribGauge, setRibGauge)}
    <fieldset><legend>Yarns</legend><div className="yarn-pick">
      <label>Main<input aria-label="Main yarn name" value={main.name} onChange={(event) => setMain({ ...main, name: event.currentTarget.value })} /><input type="color" aria-label="Main yarn color" value={main.hex} onChange={(event) => setMain({ ...main, hex: event.currentTarget.value.toUpperCase() })} /></label>
      {cuff && (accent ? <label>Accent<input aria-label="Accent yarn name" value={accent.name} onChange={(event) => setAccent({ ...accent, name: event.currentTarget.value })} /><input type="color" aria-label="Accent yarn color" value={accent.hex} onChange={(event) => setAccent({ ...accent, hex: event.currentTarget.value.toUpperCase() })} /><button type="button" className="secondary-button" onClick={() => setAccent(null)}>Remove</button></label>
        : <button type="button" className="secondary-button" onClick={() => setAccent({ name: 'White', hex: '#F2F2F2' })}>Add an accent yarn</button>)}
    </div></fieldset>
    {cuff && <fieldset><legend>Body backing</legend><div className="color-count-control">
      <button type="button" className={backing === 'birdseye' ? 'active' : ''} onClick={() => setBacking('birdseye')}>Birdseye</button>
      <button type="button" className={backing === 'fairisle' ? 'active' : ''} onClick={() => setBacking('fairisle')}>Fairisle</button>
    </div><p className="garment-help">{backing === 'birdseye' ? 'Every color knits its share of the back on every row: no floats, so logos and thin lines are fine. Thicker and warmer; measure the gauge on birdseye fabric.' : 'Unused colors float behind the work: lighter, but floats over 7 stitches (and colors idle for many rows) are not ready to knit.'}</p></fieldset>}
    <footer><button className="secondary-button" type="button" onClick={onClose}>Cancel</button><button className="primary-button" type="submit" disabled={!title.trim() || !main.name.trim()}><Check size={16} /> Create beanie</button></footer>
  </form>;
}
