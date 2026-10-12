import { useId, useMemo, useState } from 'react';
import type { BeanieSections } from '../plan';
import { beanieWornLayout } from './beanieWorn';

/** The beanie as worn: the cuff folded up, the chart wrapped round to the back seam, the crown gathered. Clicking it opens the chart. */
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
  const id = useId();
  if (layout === null) return <p className="knitfile-waiting" role="status">The hat cannot be drawn without a gauge.</p>;
  const margin = layout.radius * 0.25;
  const left = -layout.radius - margin;
  const span = 2 * (layout.radius + margin);
  const top = layout.height + margin;
  // y counts up from the cuff; the drawing counts down from the top.
  const y = (value: number) => top - value;
  const points = (path: readonly { x: number; y: number }[]) => path.map((point) => `${point.x},${y(point.y)}`).join(' ');
  const hat = points([...layout.outline, ...[...layout.outline].reverse().map((point) => ({ x: -point.x, y: point.y }))]);
  const open = () => onOpen();
  return <div className="garment-wrap beanie-worn">
    <div className="garment-view-toggle compact" role="tablist" aria-label="Side">
      {(['front', 'back'] as const).map((value) => <button key={value} type="button" role="tab" aria-selected={side === value} className={side === value ? 'active' : ''} onClick={() => setSide(value)}>{value === 'front' ? 'Front' : 'Back'}</button>)}
    </div>
    <svg className="garment-view" viewBox={`${left} 0 ${span} ${top + margin * 0.6}`} preserveAspectRatio="xMidYMid meet" role="img" aria-label={`The hat as worn, from the ${side}`}>
      <defs>
        <linearGradient id={`${id}-round`} x1="0" x2="1" y1="0" y2="0">
          <stop offset="0" stopColor="#000" stopOpacity=".32" />
          <stop offset=".3" stopColor="#000" stopOpacity="0" />
          <stop offset=".62" stopColor="#fff" stopOpacity=".08" />
          <stop offset="1" stopColor="#000" stopOpacity=".32" />
        </linearGradient>
      </defs>
      <g className="garment-piece" role="button" tabIndex={0} aria-label="Open the chart" onClick={open} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); open(); } }}>
        <polygon points={hat} fill={layout.hex} />
        <g shapeRendering="crispEdges">{layout.body.map((rect, index) => <rect key={index} x={rect.x0} y={y(rect.y1)} width={rect.x1 - rect.x0} height={rect.y1 - rect.y0} fill={rect.hex} />)}</g>
        {layout.ribPurls.map((strip, index) => <polygon key={index} points={points(strip)} fill="#000" opacity=".14" />)}
        <polygon points={hat} fill={`url(#${id}-round)`} />
        {layout.seam !== null && <line className="beanie-seam" x1={layout.seam} x2={layout.seam} y1={y(0)} y2={y(layout.height)} />}
        {layout.cuff && <g className="beanie-cuff">
          <rect x={-layout.cuff.halfWidth} y={y(layout.cuff.top)} width={2 * layout.cuff.halfWidth} height={layout.cuff.top} rx={0.4} fill={layout.cuff.hex} />
          {layout.cuff.purls.map((purl, index) => <rect key={index} x={purl.x0 * layout.cuff!.halfWidth / layout.radius} y={y(layout.cuff!.top)} width={(purl.x1 - purl.x0) * layout.cuff!.halfWidth / layout.radius} height={layout.cuff!.top} fill="#000" opacity=".16" />)}
          <rect x={-layout.cuff.halfWidth} y={y(layout.cuff.top)} width={2 * layout.cuff.halfWidth} height={layout.cuff.top} rx={0.4} fill={`url(#${id}-round)`} />
        </g>}
      </g>
    </svg>
    <p className="stage-caption">As worn, from the {side}, before it stretches to the head.{side === 'back' ? ' The seam runs up the back.' : ''} Click the hat to open its chart.</p>
  </div>;
}
