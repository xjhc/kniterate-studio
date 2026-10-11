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
import { FITS, SIZES, type Fit, type Size } from '../sweater/draft';
import { SWEATER_CHOICES, type SweaterIntent } from '../sweater/sweater';
import type { PanelIntent } from '../sweater/panel';
import { TEXTURES } from '../sweater/textures';
import { SilhouetteIcon } from '../sweater/SilhouetteIcon';

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

export function NewProjectDialog({ onCreate, onCreateBeanie, onCreateSweater, onCreatePanel, onClose, initialKind = 'rectangle' }: { onCreate: (values: NewProjectValues) => void; onCreateBeanie?: (intent: BeanieIntent) => void; onCreateSweater?: (intent: SweaterIntent) => void; onCreatePanel?: (intent: PanelIntent) => void; onClose: () => void; initialKind?: 'rectangle' | 'beanie' | 'sweater' }) {
  const [kind, setKind] = useState<'rectangle' | 'beanie' | 'sweater'>(initialKind);
  const kinds = [['sweater', 'Sweater'], ['beanie', 'Beanie'], ['rectangle', 'Scarf or blanket']] as const;
  return <DialogShell title="New project" onClose={onClose}>
    {(onCreateBeanie || onCreateSweater) && <div className="project-kind" role="tablist" aria-label="Kind of project">
      {kinds.filter(([id]) => id === 'rectangle' || (id === 'beanie' ? onCreateBeanie : onCreateSweater)).map(([id, name]) => <button key={id} type="button" role="tab" aria-selected={kind === id} className={kind === id ? 'active' : ''} onClick={() => setKind(id)}>{name}</button>)}
    </div>}
    {kind === 'beanie' && onCreateBeanie ? <NewBeanieForm onCreate={onCreateBeanie} onClose={onClose} />
      : kind === 'sweater' && onCreateSweater ? <NewSweaterForm onCreate={onCreateSweater} onClose={onClose} />
        : <RectangleChoice onCreate={onCreate} onCreatePanel={onCreatePanel} onClose={onClose} />}
  </DialogShell>;
}

/** A scarf or blanket: one colour in any stitch, or a colour chart. */
function RectangleChoice({ onCreate, onCreatePanel, onClose }: { onCreate: (values: NewProjectValues) => void; onCreatePanel?: (intent: PanelIntent) => void; onClose: () => void }) {
  const [style, setStyle] = useState<'stitch' | 'chart'>(onCreatePanel ? 'stitch' : 'chart');
  return <>
    {onCreatePanel && <div className="choice-pills rectangle-style" role="radiogroup" aria-label="Scarf or blanket">
      <button type="button" role="radio" aria-checked={style === 'stitch'} className={style === 'stitch' ? 'active' : ''} onClick={() => setStyle('stitch')}>One colour, any stitch</button>
      <button type="button" role="radio" aria-checked={style === 'chart'} className={style === 'chart' ? 'active' : ''} onClick={() => setStyle('chart')}>Colour chart</button>
    </div>}
    {style === 'stitch' && onCreatePanel ? <NewPanelForm onCreate={onCreatePanel} onClose={onClose} /> : <NewRectangleForm onCreate={onCreate} onClose={onClose} />}
  </>;
}

function NewPanelForm({ onCreate, onClose }: { onCreate: (intent: PanelIntent) => void; onClose: () => void }) {
  const [title, setTitle] = useState('Scarf');
  const [widthCm, setWidthCm] = useState(25);
  const [lengthCm, setLengthCm] = useState(160);
  const [textureId, setTextureId] = useState('seed');
  const [endsCm, setEndsCm] = useState(4);
  const [yarn, setYarn] = useState({ name: 'Moss', hex: '#6B7F4E' });
  const submit = (event: FormEvent) => {
    event.preventDefault();
    onCreate({ title: title.trim(), widthCm, lengthCm, textureId, ends: { rib: 'kkpp', cm: endsCm }, yarn });
  };
  return <form onSubmit={submit} className="new-sweater">
    <label>Project name<input autoFocus required maxLength={200} value={title} onChange={(event) => setTitle(event.currentTarget.value)} /></label>
    <div className="project-dialog-grid">
      <label>Width (cm)<input required type="number" min="5" max="110" step="0.5" value={widthCm} onChange={(event) => setWidthCm(Number(event.currentTarget.value))} /></label>
      <label>Length (cm)<input required type="number" min="5" max="400" step="0.5" value={lengthCm} onChange={(event) => setLengthCm(Number(event.currentTarget.value))} /></label>
    </div>
    <label>Stitch<select value={textureId} onChange={(event) => setTextureId(event.currentTarget.value)}>{TEXTURES.map((texture) => <option key={texture.id} value={texture.id}>{texture.name}</option>)}</select></label>
    <label>Rib at each end (cm, 0 for none)<input type="number" min="0" max="30" step="0.5" value={endsCm} onChange={(event) => setEndsCm(Number(event.currentTarget.value))} /></label>
    <fieldset><legend>Yarn</legend><div className="yarn-pick"><label>Name<input aria-label="Yarn name" value={yarn.name} onChange={(event) => setYarn({ ...yarn, name: event.currentTarget.value })} /><input type="color" aria-label="Yarn colour" value={yarn.hex} onChange={(event) => setYarn({ ...yarn, hex: event.currentTarget.value.toUpperCase() })} /></label></div></fieldset>
    <footer><button className="secondary-button" type="button" onClick={onClose}>Cancel</button><button className="primary-button" type="submit" disabled={!title.trim() || !yarn.name.trim() || !(widthCm >= 5 && widthCm <= 110 && lengthCm >= 5 && lengthCm <= 400)}><Check size={16} /> Create</button></footer>
  </form>;
}

function NewSweaterForm({ onCreate, onClose }: { onCreate: (intent: SweaterIntent) => void; onClose: () => void }) {
  const [title, setTitle] = useState('Sweater');
  const [silhouette, setSilhouette] = useState<SweaterIntent['silhouette']>('set-in');
  const [neckline, setNeckline] = useState<SweaterIntent['neckline']>('crew');
  const [size, setSize] = useState<Size>('M');
  const [fit, setFit] = useState<Fit>('classic');
  const [textureId, setTextureId] = useState('stockinette');
  const [yarn, setYarn] = useState({ name: 'Oatmeal', hex: '#D9CBB0' });
  const submit = (event: FormEvent) => {
    event.preventDefault();
    onCreate({ title: title.trim(), silhouette, neckline, size, fit, textureId, yarn });
  };
  return <form onSubmit={submit} className="new-sweater">
    <label>Project name<input autoFocus required maxLength={200} value={title} onChange={(event) => setTitle(event.currentTarget.value)} /></label>
    <fieldset><legend>Style</legend><div className="silhouette-cards">{SWEATER_CHOICES.silhouettes.map((choice) => <button key={choice.id} type="button" className={silhouette === choice.id ? 'active' : ''} aria-pressed={silhouette === choice.id} onClick={() => setSilhouette(choice.id)} title={choice.note}><SilhouetteIcon silhouette={choice.id} neckline={neckline} /><b>{choice.name}</b></button>)}</div>
      <p className="garment-help">{SWEATER_CHOICES.silhouettes.find((choice) => choice.id === silhouette)!.note}</p></fieldset>
    <fieldset className="choice-rows"><legend>Neck, size and fit</legend>
      <div><span>Neck</span><div className="choice-pills">{SWEATER_CHOICES.necklines.map((choice) => <button key={choice.id} type="button" className={neckline === choice.id ? 'active' : ''} aria-pressed={neckline === choice.id} onClick={() => setNeckline(choice.id)} title={choice.note}>{choice.name}</button>)}</div></div>
      <div><span>Size</span><div className="choice-pills">{SIZES.map((id) => <button key={id} type="button" className={size === id ? 'active' : ''} aria-pressed={size === id} onClick={() => setSize(id)}>{id}</button>)}</div></div>
      <div><span>Fit</span><div className="choice-pills">{FITS.map((id) => <button key={id} type="button" className={fit === id ? 'active' : ''} aria-pressed={fit === id} onClick={() => setFit(id)}>{id[0]!.toUpperCase() + id.slice(1)}</button>)}</div></div>
      <p className="garment-help">Every measurement, and the shape of each piece, can be changed after.</p></fieldset>
    <label>Stitch<select value={textureId} onChange={(event) => setTextureId(event.currentTarget.value)}>{TEXTURES.map((texture) => <option key={texture.id} value={texture.id}>{texture.name}</option>)}</select></label>
    <fieldset><legend>Yarn</legend><div className="yarn-pick"><label>Name<input aria-label="Yarn name" value={yarn.name} onChange={(event) => setYarn({ ...yarn, name: event.currentTarget.value })} /><input type="color" aria-label="Yarn colour" value={yarn.hex} onChange={(event) => setYarn({ ...yarn, hex: event.currentTarget.value.toUpperCase() })} /></label></div></fieldset>
    <footer><button className="secondary-button" type="button" onClick={onClose}>Cancel</button><button className="primary-button" type="submit" disabled={!title.trim() || !yarn.name.trim()}><Check size={16} /> Create sweater</button></footer>
  </form>;
}

function NewRectangleForm({ onCreate, onClose }: { onCreate: (values: NewProjectValues) => void; onClose: () => void }) {
  const [title, setTitle] = useState('New colourwork blanket');
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
    <fieldset><legend>Pattern colours</legend><div className="color-count-control">{[2, 3, 4].map((count) => <button className={colorCount === count ? 'active' : ''} type="button" key={count} onClick={() => setColorCount(count)}>{count}</button>)}</div></fieldset>
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
      <input type="color" aria-label={`${entry.name} colour`} value={entry.hex} onChange={(event) => { const hex = event.currentTarget.value.toUpperCase(); setPalette((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, hex } : item)); }} />
      <input required maxLength={100} aria-label={`Palette colour ${index + 1} name`} value={entry.name} onChange={(event) => { const name = event.currentTarget.value; setPalette((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, name } : item)); }} />
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
      <label>Cuff<select value={cuff ? 'cuff' : 'rib'} onChange={(event) => setCuff(event.currentTarget.value === 'cuff')}><option value="cuff">Rib cuff + colourwork body</option><option value="rib">All 2x2 rib, one colour</option></select></label>
    </div>
    {cuff && <div className="project-dialog-grid">
      <label>Visible cuff height (cm)<input required type="number" step="0.5" min="1" max="30" value={cuffCm} onChange={(event) => setCuffCm(Number(event.currentTarget.value))} /></label>
      <label className="check-label"><input type="checkbox" checked={fold} onChange={(event) => setFold(event.currentTarget.checked)} /> Folds up</label>
    </div>}
    {cuff ? gauge('Body gauge', bodyGauge, setBodyGauge) : gauge('Rib gauge', ribGauge, setRibGauge)}
    {cuff && gauge('Cuff (2x2 rib) gauge', ribGauge, setRibGauge)}
    <fieldset><legend>Yarns</legend><div className="yarn-pick">
      <label>Main<input aria-label="Main yarn name" value={main.name} onChange={(event) => setMain({ ...main, name: event.currentTarget.value })} /><input type="color" aria-label="Main yarn colour" value={main.hex} onChange={(event) => setMain({ ...main, hex: event.currentTarget.value.toUpperCase() })} /></label>
      {cuff && (accent ? <label>Accent<input aria-label="Accent yarn name" value={accent.name} onChange={(event) => setAccent({ ...accent, name: event.currentTarget.value })} /><input type="color" aria-label="Accent yarn colour" value={accent.hex} onChange={(event) => setAccent({ ...accent, hex: event.currentTarget.value.toUpperCase() })} /><button type="button" className="secondary-button" onClick={() => setAccent(null)}>Remove</button></label>
        : <button type="button" className="secondary-button" onClick={() => setAccent({ name: 'White', hex: '#F2F2F2' })}>Add an accent yarn</button>)}
    </div></fieldset>
    {cuff && <fieldset><legend>Body backing</legend><div className="color-count-control">
      <button type="button" className={backing === 'birdseye' ? 'active' : ''} onClick={() => setBacking('birdseye')}>Birdseye</button>
      <button type="button" className={backing === 'fairisle' ? 'active' : ''} onClick={() => setBacking('fairisle')}>Fairisle</button>
    </div><p className="garment-help">{backing === 'birdseye' ? 'Thicker and warmer. No long floats, so thin lines and logos work.' : 'Light. Unused colours float behind the work.'}</p></fieldset>}
    <footer><button className="secondary-button" type="button" onClick={onClose}>Cancel</button><button className="primary-button" type="submit" disabled={!title.trim() || !main.name.trim()}><Check size={16} /> Create beanie</button></footer>
  </form>;
}
