import type { ColorworkChartV1 } from '@kniterate-studio/chart-contract';

export function PaletteRail({ chart, carriers, active, onSelect }: { chart: ColorworkChartV1; carriers: ReadonlyMap<string, string>; active: number; onSelect: (index: number) => void }) {
  return <aside className="palette-rail" aria-label="Palette">{chart.palette.map((entry, index) => {
    const carrier = carriers.get(entry.id);
    return <button type="button" key={entry.id} className={active === index ? 'active' : ''} onClick={() => onSelect(index)} title={`${entry.name}${carrier ? `, on carrier ${carrier}` : ''}`} aria-label={`Use ${entry.name}`}><i style={{ background: entry.hex }} /><span>{entry.name}</span></button>;
  })}</aside>;
}
