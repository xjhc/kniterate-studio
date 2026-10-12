import type { BeanieSections } from '../plan';

/**
 * The beanie as worn, seen from the front or the back: the chart wrapped
 * round to the back seam, where its two edges meet, standing on the visible
 * cuff. Everything comes from the plan: the knitted circumference, each
 * section's knitted length, and the chart as knitted (motifs drawn in).
 *
 * The hat's length above the cuff (body and crown) runs up the side of a
 * head and over its rounded top, a half circle as wide as the hat, to the
 * gathered centre; a short hat is laid over a flatter top. So the upper body
 * rows curve in, as they do when worn. It shows the hat unstretched: how far
 * it stretches on a head is not modelled, nor how the gathered top bunches.
 * Lengths are cm, y up from the bottom of the visible cuff.
 */

export interface WornRect { x0: number; x1: number; y0: number; y1: number; hex: string }
export interface WornPoint { x: number; y: number }

export interface BeanieWornLayout {
  /** Half the width of the hat seen from the front. */
  radius: number;
  height: number;
  /** The visible cuff band, wider than the body: it is folded over itself. Its purl columns are darker. */
  cuff: { top: number; halfWidth: number; hex: string; purls: { x0: number; x1: number }[] } | null;
  /** The hat above the cuff, right side from the cuff up to the centre of the top; mirrored on the left. */
  outline: WornPoint[];
  /** The main yarn: the body's ground and the crown. */
  hex: string;
  /** The body's stitches in other colours, as seen: runs of one colour in a row, narrower toward the sides and the top. */
  body: WornRect[];
  /** Purl columns of a body knitted all in rib, each a strip following the hat's outline. */
  ribPurls: WornPoint[][];
  /** Where the back seam shows (the back view). */
  seam: number | null;
}

/** A column's left and right edge as a fraction of the hat's half-width seen, or null when it faces away. */
function columnSpan(column: number, width: number, back: boolean): { x0: number; x1: number } | null {
  // The chart's centre faces front; its two edges meet at the back seam.
  const angle = (edge: number) => (2 * Math.PI * edge) / width - Math.PI + (back ? Math.PI : 0);
  const a0 = angle(column);
  const a1 = angle(column + 1);
  if (Math.cos((a0 + a1) / 2) <= 0) return null;
  const seen = (a: number) => Math.sin(Math.max(-Math.PI / 2, Math.min(Math.PI / 2, Math.atan2(Math.sin(a), Math.cos(a)))));
  return { x0: seen(a0), x1: seen(a1) };
}

/** 2x2 rib: the third and fourth stitch of each four are purls. */
function purlSpans(width: number, back: boolean): { x0: number; x1: number }[] {
  const spans: { x0: number; x1: number }[] = [];
  for (let column = 0; column < width; column += 1) {
    if (column % 4 < 2) continue;
    const span = columnSpan(column, width, back);
    if (span) spans.push(span);
  }
  return spans;
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
  const radius = circumferenceCm / (2 * Math.PI);
  const main = palette[0]?.hex ?? '#D9CBB0';
  const cuffCm = sections.cuff === null ? 0 : sections.cuff.visibleCm?.value ?? 0;

  // Along the hat from the cuff (s, cm) to where it is seen: straight up the side, then over the top.
  const length = bodyCm + (sections.crown?.cm?.value ?? 0);
  const over = Math.min(length, (Math.PI / 2) * radius);
  const side = length - over;
  const rise = over < (Math.PI / 2) * radius ? (2 * over) / Math.PI : radius;
  const at = (s: number): WornPoint => {
    if (s <= side) return { x: radius, y: cuffCm + s };
    const angle = ((s - side) / over) * (Math.PI / 2);
    return { x: radius * Math.cos(angle), y: cuffCm + side + rise * Math.sin(angle) };
  };
  const samples = 48;
  const outline = Array.from({ length: samples + 1 }, (_, index) => (index === samples ? { x: 0, y: at(length).y } : at((length * index) / samples)));

  // The chart's body rows, top first, spread over the body's knitted length.
  const allRib = sections.body.fabric === 'rib';
  const bodyRows = allRib ? cells.length : cells.length - ribRows;
  const rowCm = bodyRows > 0 ? bodyCm / bodyRows : 0;
  const spans = Array.from({ length: width }, (_, column) => columnSpan(column, width, back));
  const order = spans.map((span, column) => ({ span, column })).filter((item) => item.span !== null).sort((a, b) => a.span!.x0 - b.span!.x0);
  const body: WornRect[] = [];
  for (let row = 0; row < bodyRows; row += 1) {
    const top = bodyCm - row * rowCm;
    const lower = at(top - rowCm);
    const upper = at(top);
    const half = at(top - rowCm / 2).x;
    let run: WornRect | null = null;
    for (const { span, column } of order) {
      const hex = palette[cells[row]![column]!]?.hex ?? main;
      if (run !== null && run.hex === hex) { run.x1 = span!.x1 * half; continue; }
      if (run && run.hex !== main) body.push(run);
      run = { x0: span!.x0 * half, x1: span!.x1 * half, y0: lower.y, y1: upper.y, hex };
    }
    if (run && run.hex !== main) body.push(run);
  }

  const ribPurls = allRib ? purlSpans(width, back).map((span) => {
    const path = outline.filter((point) => point.y <= at(bodyCm).y + 1e-9);
    return [...path.map((point) => ({ x: span.x0 * point.x, y: point.y })), ...[...path].reverse().map((point) => ({ x: span.x1 * point.x, y: point.y }))];
  }) : [];

  return {
    radius,
    height: outline.at(-1)!.y,
    cuff: sections.cuff === null ? null : { top: cuffCm, halfWidth: radius * (sections.cuff.folds ? 1.03 : 1), hex: main, purls: purlSpans(width, back) },
    outline,
    hex: main,
    body,
    ribPurls,
    seam: back ? 0 : null,
  };
}
