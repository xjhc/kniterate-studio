import type { PieceId } from './draft';
import { assembledLayout, schematicLayout } from './schematic';
import type { SweaterPlan } from './sweater';
import { inkFor } from './TextureSwatch';

/** Every piece to scale, as knitted, over its drafted outline; click a piece to open it. */
/** What a piece's machine file knits before and after the piece itself. */
export interface PieceRun { belowCm: number; drawsCm: number[]; widthCm: number; finish: string }

export function GarmentView({ plan, hex, onOpen, statuses, only, runs = {} }: { plan: SweaterPlan; hex: string; onOpen: (piece: PieceId) => void; statuses: Partial<Record<PieceId, 'ok' | 'blocked' | 'checking'>>; only?: PieceId; runs?: Partial<Record<PieceId, PieceRun>> }) {
  // Stitches are too small to draw at this scale: the pieces are flat yarn colour, the ribs a shade darker.
  const below = Math.max(0, ...Object.values(runs).map((run) => run!.belowCm));
  const layout = schematicLayout(plan, only, below);
  return <svg className="garment-view" viewBox={`0 0 ${layout.width} ${layout.height}`} preserveAspectRatio="xMidYMid meet" role="img" aria-label="The sweater's pieces, to scale">
    {layout.pieces.map((piece) => {
      const status = statuses[piece.id];
      return <g key={piece.id} className={`garment-piece status-${status ?? 'checking'}`} role="button" tabIndex={0} aria-label={`Open the ${piece.name.toLowerCase()}`}
        onClick={() => onOpen(piece.id)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onOpen(piece.id); } }}>
        <path className="garment-draft" d={piece.draftPath} />
        <path className="garment-knitted" d={piece.knittedPath} fill={hex} />
        <path className="garment-rib" d={piece.ribPath} fill={inkFor(hex)} />
        {piece.dimensions.map((dimension, index) => {
          // A width under the piece moves below its waste yarn.
          const shift = dimension.side === 'below' ? runs[piece.id]?.belowCm ?? 0 : 0;
          return { ...dimension, y1: dimension.y1 + shift, y2: dimension.y2 + shift, index };
        }).map((d) => <g key={d.index} className="garment-dimension">
          <line x1={d.x1} y1={d.y1} x2={d.x2} y2={d.y2} />
          <text x={d.side === 'left' ? d.x1 - 0.8 : d.side === 'right' ? d.x1 + 0.8 : (d.x1 + d.x2) / 2} y={d.side === 'above' ? d.y1 - 1 : d.side === 'below' ? d.y1 + 3.4 : (d.y1 + d.y2) / 2 + 1} textAnchor={d.side === 'left' ? 'end' : d.side === 'right' ? 'start' : 'middle'}>{d.text}</text>
        </g>)}
        {runs[piece.id] && (() => {
          // Under the piece, to scale: the waste yarn and draw thread its file knits first.
          const run = runs[piece.id]!;
          return <g className="garment-run">
            <rect className="garment-waste" x={piece.x - run.widthCm / 2} y={piece.y} width={run.widthCm} height={run.belowCm} />
            {run.drawsCm.map((at, index) => <line key={index} className="garment-draw" x1={piece.x - run.widthCm / 2} x2={piece.x + run.widthCm / 2} y1={piece.y + at} y2={piece.y + at} />)}
          </g>;
        })()}
        <text className="garment-label" x={piece.x} y={piece.y + (runs[piece.id]?.belowCm ?? 0) + (runs[piece.id] ? 12 : 9.5)} textAnchor="middle">{piece.name}{piece.copies > 1 ? ` ×${piece.copies}` : ''}{runs[piece.id] ? ` · ${runs[piece.id]!.finish.toLowerCase()}` : ''}</text>
      </g>;
    })}
  </svg>;
}

/** The sweater as worn, front view: the front with both sleeves folded and hinged at the shoulders. */
export function AssembledView({ plan, hex, onOpen }: { plan: SweaterPlan; hex: string; onOpen: (piece: PieceId) => void }) {
  const layout = assembledLayout(plan);
  if (layout === null) return null;
  const rib = inkFor(hex);
  return <svg className="garment-view assembled" viewBox={`${layout.minX} ${layout.minY} ${layout.width} ${layout.height}`} preserveAspectRatio="xMidYMid meet" role="img" aria-label="The sweater as worn, from the front">
    <path className="assembled-back" d={layout.back} fill={hex} />
    {layout.neckband && <polyline className="assembled-band back" points={layout.neckband.back} strokeWidth={layout.neckband.width} stroke={hex} />}
    {layout.sleeves.map((sleeve, index) => <g key={index} className="garment-piece" role="button" tabIndex={0} aria-label="Open the sleeve" onClick={() => onOpen('sleeve')} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onOpen('sleeve'); } }}>
      <path className="garment-knitted assembled-head" d={sleeve.head} fill={hex} />
      <path className="garment-knitted assembled-sleeve" d={sleeve.path} fill={hex} />
      <path className="garment-rib" d={sleeve.rib} fill={rib} />
    </g>)}
    <g className="garment-piece" role="button" tabIndex={0} aria-label="Open the front" onClick={() => onOpen('front')} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onOpen('front'); } }}>
      <path className="garment-knitted assembled-front" d={layout.front} fill={hex} />
      <path className="garment-rib" d={layout.frontRib} fill={rib} />
    </g>
    {layout.neckband && <g className="garment-piece" role="button" tabIndex={0} aria-label="Open the neckband" onClick={() => onOpen('neckband')} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onOpen('neckband'); } }}>
      <polyline className="assembled-band" points={layout.neckband.front} strokeWidth={layout.neckband.width} stroke={hex} />
      <polyline className="assembled-band-rib" points={layout.neckband.front} strokeWidth={layout.neckband.width} stroke={rib} />
    </g>}
  </svg>;
}
