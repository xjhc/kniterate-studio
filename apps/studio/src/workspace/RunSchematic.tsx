import type { KnitFile, KnitSectionKind } from '../sweater/knitFile';

/**
 * A flat, measured drawing of everything one machine file knits, bottom to
 * top: the waste yarn, the draw thread, the piece, and its finish. Drawn
 * from the file read back, so it is the whole run, not only the design.
 */

const WASTE = '#A9B0B8';
const DRAW = '#C2413A';
const MIN_LABEL_GAP = 14;

function shade(hex: string, amount: number): string {
  const value = Number.parseInt(hex.slice(1), 16);
  const channel = (shift: number) => Math.round(((value >> shift) & 255) * (1 + amount));
  return `rgb(${channel(16)}, ${channel(8)}, ${channel(0)})`;
}

interface Band { kind: KnitSectionKind; label: string; from: number; to: number; lo: number; hi: number; left: number[]; right: number[] }

export function RunSchematic({ file, hex, stitchCm, rowCm, label }: {
  file: KnitFile;
  hex: string;
  /** Centimetres per stitch and per row, when the gauge is known. */
  stitchCm: number | null;
  rowCm: { rib: number; body: number } | null;
  label: string;
}) {
  // Bands: runs of courses in one section, with each course's knitted extent.
  const bands: Band[] = [];
  file.courses.forEach((course, index) => {
    const first = course.stitches.search(/[^.]/);
    if (first === -1) return;
    const last = course.stitches.length - 1 - [...course.stitches].reverse().join('').search(/[^.]/);
    const section = file.sections[course.section]!;
    const band = bands.at(-1);
    const label = section.kind === 'shoulders' ? 'Shoulders' : section.label;
    if (band && band.label === label && band.to === index - 1) {
      band.to = index; band.lo = Math.min(band.lo, first); band.hi = Math.max(band.hi, last); band.left.push(first); band.right.push(last);
    } else bands.push({ kind: section.kind, label, from: index, to: index, lo: first, hi: last, left: [first], right: [last] });
  });
  const st = stitchCm ?? 0.4;
  const rowOf = (kind: KnitSectionKind) => (rowCm ? (kind === 'rib' ? rowCm.rib : rowCm.body) : 0.3);
  const heights = file.courses.map((course) => rowOf(file.sections[course.section]!.kind));
  const tops: number[] = [];
  let total = 0;
  for (const value of heights) { tops.push(total); total += value; }
  const widest = Math.max(...bands.map((band) => band.hi - band.lo + 1)) * st;
  // Pixels per cm, so the drawing fits about 560 px tall and 420 px wide.
  const k = Math.min(560 / Math.max(total, 1), 420 / Math.max(widest, 1));
  const pad = { left: 70, right: 230, top: 24, bottom: 46 };
  const width = Math.ceil(widest * k) + pad.left + pad.right;
  const height = Math.ceil(total * k) + pad.top + pad.bottom;
  const x = (stitch: number) => pad.left + stitch * st * k;
  const y = (cm: number) => pad.top + (total - cm) * k;
  const fill = (kind: KnitSectionKind) => (kind === 'waste' ? WASTE : kind === 'draw' ? DRAW : kind === 'rib' ? shade(hex, -0.12) : hex);
  // The piece: from the cast-on to its finish, without the waste yarn either side.
  const body = bands.filter((band) => band.kind !== 'waste' && band.kind !== 'draw' && !(band.kind === 'top' && band.label.startsWith('Waste')));
  const piece = body.length > 0 ? { from: body[0]!.from, to: body.at(-1)!.to, lo: Math.min(...body.map((band) => band.lo)), hi: Math.max(...body.map((band) => band.hi)) } : null;
  const cm = (value: number) => `${Math.round(value * 10) / 10} cm`;
  let lastLabel = -Infinity;
  const labels = [...bands].reverse().map((band) => {
    const rows = band.to - band.from + 1;
    const mid = y((tops[band.from]! + tops[band.to]! + heights[band.to]!) / 2);
    const at = Math.max(mid, lastLabel + MIN_LABEL_GAP);
    lastLabel = at;
    const size = band.kind === 'draw' ? '' : ` · ${rows} ${rows === 1 ? 'row' : 'rows'}${stitchCm && rowCm && band.kind !== 'waste' ? `, ${cm(rows * rowOf(band.kind))}` : ''}`;
    return { band, at, mid, text: `${band.label}${size}` };
  });
  return <svg className="run-schematic" data-testid="schematic" viewBox={`0 0 ${width} ${height}`} width={width} height={height} role="img" aria-label={`${label}: the whole machine run, from the waste yarn to the finish`}>
    {file.courses.map((course, index) => {
      // Each row as knitted: one block per run of stitches, so a neck opening shows as a gap.
      const kind = file.sections[course.section]!.kind;
      const runs: [number, number][] = [];
      for (let k = 0; k < course.stitches.length; k++) {
        if (course.stitches[k] === '.') continue;
        if (runs.length > 0 && runs.at(-1)![1] === k - 1) runs.at(-1)![1] = k; else runs.push([k, k]);
      }
      const top = y(tops[index]! + heights[index]!);
      const height = Math.max(0.6, y(tops[index]!) - top + 0.4);
      // Where one pass knits both sides of empty needles, its yarn runs across them: draw the strand, not a hole.
      const strands = runs.slice(1).map(([next], k) => [runs[k]![1] + 1, next - 1] as const).filter(([from, to]) => course.passes.some((pass) => {
        const needles = file.passes[pass]!.needles;
        return needles !== null && needles.lo - file.needles.lo < from && needles.hi - file.needles.lo > to;
      }));
      return [
        ...strands.map(([from, to]) => <rect key={`${index}-strand-${from}`} className="run-strand" x={x(from)} y={top + height * 0.4} width={x(to + 1) - x(from)} height={Math.max(0.5, height * 0.2)} fill={fill(kind)} />),
        ...runs.map(([from, to]) => <rect key={`${index}-${from}`} className={`run-band band-${kind}`} x={x(from)} y={top} width={x(to + 1) - x(from)} height={height} fill={fill(kind)} />),
      ];
    })}
    {labels.map(({ band, at, mid, text }, index) => <g key={index} className="run-label">
      <line x1={x(band.hi + 1) + 4} y1={mid} x2={pad.left + widest * k + 16} y2={at} />
      <text x={pad.left + widest * k + 20} y={at + 4}>{text}</text>
    </g>)}
    {piece && <g className="run-dimension">
      <line x1={x(piece.lo)} y1={height - 24} x2={x(piece.hi + 1)} y2={height - 24} />
      <text x={(x(piece.lo) + x(piece.hi + 1)) / 2} y={height - 8} textAnchor="middle">{piece.hi - piece.lo + 1} stitches{stitchCm ? `, ${cm((piece.hi - piece.lo + 1) * stitchCm)}` : ''}</text>
      <line x1={pad.left - 18} y1={y(tops[piece.from]!)} x2={pad.left - 18} y2={y(tops[piece.to]! + heights[piece.to]!)} />
      <text x={pad.left - 24} y={(y(tops[piece.from]!) + y(tops[piece.to]! + heights[piece.to]!)) / 2} textAnchor="end">{rowCm ? cm(tops[piece.to]! + heights[piece.to]! - tops[piece.from]!) : `${piece.to - piece.from + 1} rows`}</text>
    </g>}
  </svg>;
}
