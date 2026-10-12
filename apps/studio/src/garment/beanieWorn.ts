import type { BeanieSections } from '../plan';

/**
 * The beanie as worn, seen from the front or the back, drawn flat and to
 * scale like the sweater: half its knitted circumference wide, and as tall as
 * its visible cuff, body and crown, the crown rounding to the gathered top.
 * The chart's middle faces front; its two edges meet at the back seam. A cuff
 * is a shade darker, as the sweater's rib is. Everything comes from the plan: the knitted circumference,
 * each section's knitted length, and the chart as knitted (motifs drawn in).
 * It shows the hat unstretched. Lengths are cm, y up from the bottom of the
 * visible cuff.
 */

export interface WornRect { x0: number; x1: number; y0: number; y1: number; hex: string }
export interface WornPoint { x: number; y: number }

export interface BeanieWornLayout {
  /** Half the hat's width: a quarter of its circumference. */
  halfWidth: number;
  height: number;
  /** The right half of the outline, from the bottom corner up to the centre of the top; mirrored on the left. */
  outline: WornPoint[];
  /** The main yarn: the body's ground and the crown. */
  hex: string;
  /** The body's stitches in other colours: runs of one colour in a row. */
  body: WornRect[];
  /** The cuff's rib, drawn a shade darker. A beanie all in rib has nothing to set it apart from, so it is not shaded. */
  rib: { y0: number; y1: number } | null;
  /** Where the back seam shows (the back view). */
  seam: number | null;
}

export function beanieWornLayout(input: {
  cells: readonly (readonly number[])[];
  palette: readonly { hex: string }[];
  /** Rib rows at the bottom of the chart: the cuff, or the whole chart for a beanie all in rib. */
  ribRows: number;
  sections: BeanieSections;
  /** The knitted circumference, once seamed. */
  circumferenceCm: number;
  side: 'front' | 'back';
}): BeanieWornLayout | null {
  const { cells, palette, ribRows, sections, circumferenceCm } = input;
  const width = cells[0]?.length ?? 0;
  const bodyCm = sections.body.cm?.value ?? null;
  if (width === 0 || bodyCm === null || circumferenceCm <= 0) return null;
  const back = input.side === 'back';
  const halfWidth = circumferenceCm / 4;
  const main = palette[0]?.hex ?? '#D9CBB0';
  const cuffCm = sections.cuff === null ? 0 : sections.cuff.visibleCm?.value ?? 0;
  const bodyTop = cuffCm + bodyCm;
  const crownCm = sections.crown?.cm?.value ?? 0;

  // Straight up the sides, then the crown rounds over to the centre of the top.
  const samples = 24;
  const outline: WornPoint[] = [{ x: halfWidth, y: 0 }, ...Array.from({ length: samples + 1 }, (_, index) => {
    const angle = (index / samples) * (Math.PI / 2);
    return { x: index === samples ? 0 : halfWidth * Math.cos(angle), y: bodyTop + crownCm * Math.sin(angle) };
  })];

  // Each column's span across the side seen: the chart's middle at the front's centre, its edges at the back's.
  const columnCm = circumferenceCm / width;
  const spans = Array.from({ length: width }, (_, column) => {
    const x0 = (((column + (back ? width / 2 : 0)) % width) - width / 2) * columnCm;
    return { column, x0: Math.max(-halfWidth, x0), x1: Math.min(halfWidth, x0 + columnCm) };
  }).filter((span) => span.x1 > span.x0).sort((a, b) => a.x0 - b.x0);

  // The chart's body rows, top first, spread over the body's knitted length.
  const allRib = sections.body.fabric === 'rib';
  const bodyRows = allRib ? cells.length : cells.length - ribRows;
  const rowCm = bodyRows > 0 ? bodyCm / bodyRows : 0;
  const body: WornRect[] = [];
  for (let row = 0; row < bodyRows; row += 1) {
    const y1 = bodyTop - row * rowCm;
    let run: WornRect | null = null;
    for (const span of spans) {
      const hex = palette[cells[row]![span.column]!]?.hex ?? main;
      if (run !== null && run.hex === hex) { run.x1 = span.x1; continue; }
      if (run && run.hex !== main) body.push(run);
      run = { x0: span.x0, x1: span.x1, y0: y1 - rowCm, y1, hex };
    }
    if (run && run.hex !== main) body.push(run);
  }

  return {
    halfWidth,
    height: bodyTop + crownCm,
    outline,
    hex: main,
    body,
    rib: sections.cuff === null ? null : { y0: 0, y1: cuffCm },
    seam: back ? 0 : null,
  };
}
