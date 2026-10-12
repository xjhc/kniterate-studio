import { useState, type FormEvent } from 'react';
import { Plus } from 'lucide-react';
import type { ColorworkChartV1 } from '@kniterate-studio/chart-contract';

/** Colours offered for a new yarn: the first one the chart does not have yet. */
const SUGGESTED = [
  { name: 'White', hex: '#F2F2F2' }, { name: 'Red', hex: '#C2413A' }, { name: 'Gold', hex: '#D6A633' },
  { name: 'Navy', hex: '#24415D' }, { name: 'Black', hex: '#111111' }, { name: 'Moss', hex: '#6B7F4E' },
];

export function PaletteRail({ chart, carriers, active, onSelect, onAdd, addLimit }: {
  chart: ColorworkChartV1; carriers: ReadonlyMap<string, string>; active: number; onSelect: (index: number) => void;
  /** Adds a colour with its own yarn; absent when the piece takes no more. */
  onAdd?: (colour: { name: string; hex: string }) => void;
  /** Why no colour can be added, when one cannot. */
  addLimit?: string;
}) {
  const [adding, setAdding] = useState<{ name: string; hex: string } | null>(null);
  const suggest = () => {
    const used = new Set(chart.palette.map((entry) => entry.hex.toUpperCase()));
    return { ...(SUGGESTED.find((colour) => !used.has(colour.hex)) ?? SUGGESTED[0]!) };
  };
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!adding || !adding.name.trim() || !onAdd) return;
    onAdd({ name: adding.name.trim(), hex: adding.hex.toUpperCase() });
    setAdding(null);
  };
  return <aside className="palette-rail" aria-label="Palette">{chart.palette.map((entry, index) => {
    const carrier = carriers.get(entry.id);
    return <button type="button" key={entry.id} className={active === index ? 'active' : ''} onClick={() => onSelect(index)} title={`${entry.name}${carrier ? `, on carrier ${carrier}` : ''}`} aria-label={`Use ${entry.name}`}><i style={{ background: entry.hex }} /><span>{entry.name}</span></button>;
  })}
    {(onAdd || addLimit) && (adding && onAdd
      ? <form className="palette-add" onSubmit={submit} aria-label="New colour">
          <input type="color" aria-label="New colour" value={adding.hex} onChange={(event) => setAdding({ ...adding, hex: event.currentTarget.value.toUpperCase() })} />
          <input type="text" aria-label="New colour name" value={adding.name} maxLength={100} autoFocus onChange={(event) => setAdding({ ...adding, name: event.currentTarget.value })} />
          <span><button type="submit" className="primary-button" disabled={!adding.name.trim()}>Add</button><button type="button" className="secondary-button" onClick={() => setAdding(null)}>Cancel</button></span>
        </form>
      : <button type="button" className="palette-add-button" disabled={!onAdd} onClick={() => setAdding(suggest())} title={onAdd ? 'Add a colour, with its own yarn' : addLimit} aria-label="Add a colour"><Plus size={14} /><span>Add</span></button>)}
  </aside>;
}
