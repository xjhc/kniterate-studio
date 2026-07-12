import type { ColorworkChartV1 } from '@kniterate-studio/chart-contract';

export function PaletteRail({ chart, active, onSelect }: { chart: ColorworkChartV1; active: number; onSelect: (index: number) => void }) {
  return <aside className="palette-rail" aria-label="Palette">{chart.palette.map((entry, index) => <button type="button" key={entry.id} className={active === index ? 'active' : ''} onClick={() => onSelect(index)} title={`${entry.name} ${entry.hex}`} aria-label={`Use ${entry.name}`}><i style={{ background: entry.hex }} /><span>{entry.name}</span></button>)}</aside>;
}
