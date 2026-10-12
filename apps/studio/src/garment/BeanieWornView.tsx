import { useMemo, useState } from 'react';
import type { BeanieSections } from '../plan';
import { inkFor } from '../sweater/TextureSwatch';
import { beanieWornLayout } from './beanieWorn';

/** The beanie as worn, flat and to scale like the sweater: the cuff folded up, the chart round to the back seam, the crown rounding to the top. Clicking it opens the chart. */
export function BeanieWornView({ cells, palette, ribRows, sections, circumferenceCm, onOpen }: {
  cells: readonly (readonly number[])[];
  palette: readonly { hex: string }[];
  ribRows: number;
  sections: BeanieSections;
  circumferenceCm: number;
  onOpen: () => void;
}) {
  const [side, setSide] = useState<'front' | 'back'>('front');
  const layout = useMemo(() => beanieWornLayout({ cells, palette, ribRows, sections, circumferenceCm, side }), [cells, palette, ribRows, sections, circumferenceCm, side]);
  if (layout === null) return <p className="knitfile-waiting" role="status">The hat cannot be drawn without a gauge.</p>;
  const margin = layout.halfWidth * 0.2;
  const top = layout.height + margin;
  // y counts up from the cuff; the drawing counts down from the top.
  const y = (value: number) => top - value;
  const hat = [...layout.outline, ...[...layout.outline].reverse().map((point) => ({ x: -point.x, y: point.y }))].map((point) => `${point.x},${y(point.y)}`).join(' ');
  const open = () => onOpen();
  return <div className="garment-wrap beanie-worn">
    <div className="garment-view-toggle compact" role="tablist" aria-label="Side">
      {(['front', 'back'] as const).map((value) => <button key={value} type="button" role="tab" aria-selected={side === value} className={side === value ? 'active' : ''} onClick={() => setSide(value)}>{value === 'front' ? 'Front' : 'Back'}</button>)}
    </div>
    <svg className="garment-view" viewBox={`${-layout.halfWidth - margin} 0 ${2 * (layout.halfWidth + margin)} ${top + margin * 0.6}`} preserveAspectRatio="xMidYMid meet" role="img" aria-label={`The hat as worn, from the ${side}`}>
      <g className="garment-piece" role="button" tabIndex={0} aria-label="Open the chart" onClick={open} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); open(); } }}>
        <polygon className="garment-knitted beanie-hat" points={hat} fill={layout.hex} />
        <g shapeRendering="crispEdges">{layout.body.map((rect, index) => <rect key={index} x={rect.x0} y={y(rect.y1)} width={rect.x1 - rect.x0} height={rect.y1 - rect.y0} fill={rect.hex} />)}</g>
        {layout.rib && <rect className="garment-rib" x={-layout.halfWidth} y={y(layout.rib.y1)} width={2 * layout.halfWidth} height={layout.rib.y1 - layout.rib.y0} fill={inkFor(layout.hex)} />}
        {layout.seam !== null && <line className="beanie-seam" x1={layout.seam} x2={layout.seam} y1={y(0)} y2={y(layout.height)} />}
      </g>
    </svg>
    <p className="stage-caption">As worn, from the {side}, flat and to scale.{side === 'back' ? ' The seam runs up the back.' : ''} Click the hat to open its chart.</p>
  </div>;
}
