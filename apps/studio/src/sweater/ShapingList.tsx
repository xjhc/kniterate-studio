import type { PanelPlan } from './rasterize';
import { pieceRhythm, sidedText, type RhythmStep } from './rhythm';

/** A piece's shaping as a machine knitter reads it, naming the edge where the two sides differ. Hovering a step marks its rows. */
export function ShapingList({ raster, onHover }: { raster: PanelPlan; onHover: (step: RhythmStep | null) => void }) {
  const rhythm = pieceRhythm(raster);
  const lists = [['Edges', rhythm.edge], ['Neck', rhythm.neck]] as const;
  return <div className="piece-rhythm" aria-label="Shaping">
    {rhythm.edge.length === 0 && rhythm.neck.length === 0
      ? <p className="design-hint">No shaping.</p>
      : lists.map(([title, steps]) => steps.length > 0 && <section key={title}>
          <h4>{title}</h4>
          <ol>{steps.map((step, index) => <li key={index} className={`rhythm-${step.kind}`} onMouseEnter={() => onHover(step)} onMouseLeave={() => onHover(null)}>{sidedText(step)}</li>)}</ol>
        </section>)}
  </div>;
}
