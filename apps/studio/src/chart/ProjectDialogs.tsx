import { useState, type FormEvent, type ReactNode } from 'react';
import { Check, X } from 'lucide-react';
import type { ColorworkChartPaletteEntry } from '@kniterate-studio/chart-contract';
import { materializeColorworkProject, type ColorworkProjectV1 } from '@kniterate-studio/project-contract';

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

export function NewProjectDialog({ onCreate, onClose }: { onCreate: (values: NewProjectValues) => void; onClose: () => void }) {
  const [title, setTitle] = useState('New colorwork blanket');
  const [width, setWidth] = useState(120);
  const [height, setHeight] = useState(160);
  const [colorCount, setColorCount] = useState(4);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    onCreate({ title: title.trim(), width, height, colorCount });
  };
  return <DialogShell title="New project" onClose={onClose}><form onSubmit={submit}>
    <label>Project name<input autoFocus required maxLength={200} value={title} onChange={(event) => setTitle(event.currentTarget.value)} /></label>
    <div className="project-dialog-grid"><label>Needles<input required type="number" min="1" max="252" value={width} onChange={(event) => setWidth(Number(event.currentTarget.value))} /></label><label>Rows<input required type="number" min="1" max="2000" value={height} onChange={(event) => setHeight(Number(event.currentTarget.value))} /></label></div>
    <fieldset><legend>Pattern colors</legend><div className="color-count-control">{[2, 3, 4].map((count) => <button className={colorCount === count ? 'active' : ''} type="button" key={count} onClick={() => setColorCount(count)}>{count}</button>)}</div></fieldset>
    <footer><button className="secondary-button" type="button" onClick={onClose}>Cancel</button><button className="primary-button" type="submit" disabled={!title.trim() || width < 1 || width > 252 || height < 1}><Check size={16} /> Create</button></footer>
  </form></DialogShell>;
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
