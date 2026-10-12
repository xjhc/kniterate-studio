import { Minus, Plus } from 'lucide-react';
import { textureProblem } from './textures';

/** Symbols drawn for each stitch, as seen from the right side. */
function StitchMark({ stitch, x, y, size, ink }: { stitch: string; x: number; y: number; size: number; ink: string }) {
  const cx = x + size / 2;
  const cy = y + size / 2;
  const h = size * 0.34;
  switch (stitch) {
    case 'k': return <path d={`M${x + size * 0.18} ${cy - h}L${cx} ${cy + h}L${x + size * 0.82} ${cy - h}`} fill="none" stroke={ink} strokeWidth={Math.max(1, size * 0.11)} strokeLinecap="round" strokeLinejoin="round" />;
    case 'p': return <path d={`M${x + size * 0.2} ${cy}Q${cx} ${cy - h * 1.1} ${x + size * 0.8} ${cy}`} fill="none" stroke={ink} strokeWidth={Math.max(1, size * 0.14)} strokeLinecap="round" />;
    case 't': case 'u': return <circle cx={cx} cy={cy} r={size * 0.2} fill="none" stroke={ink} strokeWidth={Math.max(1, size * 0.1)} strokeDasharray={stitch === 'u' ? `${size * 0.12} ${size * 0.08}` : undefined} />;
    default: return <path d={`M${cx} ${cy - h * 1.2}V${cy + h * 1.2}`} stroke={ink} strokeWidth={Math.max(1, size * 0.1)} strokeLinecap="round" />;
  }
}

/** A few repeats of a texture, as stitch symbols on the yarn colour. */
export function TextureSwatch({ rows, hex, size = 10, columns = 8, rowsShown = 8 }: { rows: readonly string[]; hex: string; size?: number; columns?: number; rowsShown?: number }) {
  const width = rows[0]?.length ?? 1;
  const marks = [];
  for (let r = 0; r < rowsShown; r++) {
    // Drawn top row first, like the chart: the repeat's bottom row sits at the bottom.
    const line = rows[(rows.length - 1 - ((rowsShown - 1 - r) % rows.length) + rows.length) % rows.length]!;
    for (let c = 0; c < columns; c++) marks.push(<StitchMark key={`${r}-${c}`} stitch={line[c % width]!} x={c * size} y={r * size} size={size} ink={inkFor(hex)} />);
  }
  return <svg className="texture-swatch" width={columns * size} height={rowsShown * size} viewBox={`0 0 ${columns * size} ${rowsShown * size}`} aria-hidden="true"><rect width="100%" height="100%" fill={hex} />{marks}</svg>;
}

/** Dark or light marks, whichever reads on the yarn colour. */
export function inkFor(hex: string): string {
  const value = Number.parseInt(hex.slice(1), 16);
  const luminance = (0.299 * ((value >> 16) & 255) + 0.587 * ((value >> 8) & 255) + 0.114 * (value & 255)) / 255;
  return luminance > 0.55 ? '#2b2420cc' : '#fff8eecc';
}

const CYCLE = ['k', 'p', 't', 'u', 's'] as const;
export const STITCH_NAMES: Record<string, string> = { k: 'Knit', p: 'Purl', t: 'Tuck (front)', u: 'Tuck (back)', s: 'Slip' };

/** Click a stitch to change it; rows are shown top first, as knitted bottom first. */
export function TextureEditor({ rows, hex, onChange }: { rows: readonly string[]; hex: string; onChange: (rows: string[]) => void }) {
  const width = rows[0]!.length;
  const problem = textureProblem(rows);
  const set = (r: number, c: number) => {
    const next = rows.map((line, index) => index !== r ? line : line.slice(0, c) + CYCLE[(CYCLE.indexOf(line[c] as typeof CYCLE[number]) + 1) % CYCLE.length] + line.slice(c + 1));
    onChange(next);
  };
  const resize = (dw: number, dh: number) => {
    const w = Math.max(1, Math.min(24, width + dw));
    const h = Math.max(1, Math.min(24, rows.length + dh));
    const grown = rows.map((line) => (line + line.repeat(24)).slice(0, w));
    // Rows are added or removed at the top (the end of the repeat).
    onChange(h > rows.length ? [...Array.from({ length: h - rows.length }, () => 'k'.repeat(w)), ...grown] : grown.slice(rows.length - h));
  };
  const size = Math.max(14, Math.min(26, Math.floor(220 / Math.max(width, rows.length))));
  return <div className="texture-editor">
    <div className="texture-editor-grid" style={{ gridTemplateColumns: `repeat(${width}, ${size}px)` }}>
      {rows.map((line, r) => [...line].map((stitch, c) => <button key={`${r}-${c}`} type="button" style={{ width: size, height: size, background: hex }} title={`${STITCH_NAMES[stitch]} — click to change`} aria-label={`Row ${rows.length - r}, stitch ${c + 1}: ${STITCH_NAMES[stitch]}`} onClick={() => set(r, c)}>
        <svg width={size} height={size} aria-hidden="true"><StitchMark stitch={stitch} x={0} y={0} size={size} ink={inkFor(hex)} /></svg>
      </button>))}
    </div>
    <div className="texture-editor-size">
      <span>{width} × {rows.length}</span>
      <button type="button" className="mini-button" onClick={() => resize(-1, 0)} aria-label="Fewer stitches" disabled={width <= 1}><Minus size={12} /></button>
      <button type="button" className="mini-button" onClick={() => resize(1, 0)} aria-label="More stitches" disabled={width >= 24}><Plus size={12} /></button>
      <span>wide</span>
      <button type="button" className="mini-button" onClick={() => resize(0, -1)} aria-label="Fewer rows" disabled={rows.length <= 1}><Minus size={12} /></button>
      <button type="button" className="mini-button" onClick={() => resize(0, 1)} aria-label="More rows" disabled={rows.length >= 24}><Plus size={12} /></button>
      <span>tall</span>
    </div>
    <p className="texture-legend">{CYCLE.map((stitch) => <span key={stitch}><svg width={14} height={14} aria-hidden="true"><rect width={14} height={14} fill={hex} /><StitchMark stitch={stitch} x={0} y={0} size={14} ink={inkFor(hex)} /></svg>{STITCH_NAMES[stitch]}</span>)}</p>
    {problem && <p className="sweater-error" role="alert">{problem}</p>}
  </div>;
}
