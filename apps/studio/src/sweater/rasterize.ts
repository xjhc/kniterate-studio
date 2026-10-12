import type { PanelStitchV1 } from '@kniterate-studio/machine-lib/browser';
import type { DraftPiece, Point } from './draft';

/**
 * Rasterizing: a piece's outline becomes knitting rows at the gauge. Each
 * row's target width is the outline's slice at the row's middle; the rows
 * then follow the targets with only what the machine can do in a row:
 *
 * - narrow an edge by 1 or 2 stitches with transfers, on any row;
 * - bind off 3 or more stitches at an edge, only on a row that starts at
 *   that edge (where the yarn is); the other edge binds off a row later;
 * - widen an edge by one stitch;
 * - split the neck on a row that starts on the right; the second yarn then
 *   knits the right part.
 *
 * Where the rows lag the outline (a slope steeper than the machine can
 * follow), the lag is reported, never hidden.
 */

export interface Gauge { stitchesPer10cm: number; rowsPer10cm: number }

export interface PanelSegment { lo: number; hi: number }

export type RowZone = 'rib' | 'body';

export interface PlannedRow {
  segments: PanelSegment[];
  zone: RowZone;
  /** Middle of the row, cm above the cast-on edge. */
  y: number;
}

export type ShapingEventKind = 'bind-off' | 'decrease' | 'increase' | 'neck-split';

export interface ShapingEvent {
  /** Row index (0 = the cast-on row's first knitted row). */
  row: number;
  kind: ShapingEventKind;
  /** Which edge: the piece's outer left/right, or the neck edge of a shoulder. */
  edge: 'left' | 'right' | 'neck-left' | 'neck-right' | 'centre';
  stitches: number;
}

export interface PanelPlan {
  piece: DraftPiece;
  /** Knitout needle of the piece's centre line: needle `centre` is the first stitch right of centre. */
  centre: number;
  rows: PlannedRow[];
  events: ShapingEvent[];
  stitchAt: (row: number, needle: number) => PanelStitchV1;
  realized: {
    castOnStitches: number;
    widestStitches: number;
    rows: number;
    ribRows: { bottom: number; top: number };
    widthCm: number;
    heightCm: number;
  };
  /** Largest distance the rows lag the outline, in stitches, and where. */
  lag: { stitches: number; row: number; cm: number };
  stitchCm: number;
  rowCm: { rib: number; body: number };
}

export interface RasterizeInput {
  piece: DraftPiece;
  gauge: Gauge;
  ribGauge: Gauge;
  /** Body texture rows, top row first. */
  texture: readonly string[];
  /** The rib row for the piece's bottom (and top) border. */
  rib: string;
  /** Rib for a top border, when the piece has one (a boat neck). */
  topRib?: string;
  /** Knitout needle of the centre line (default: the middle of the 252-needle bed). */
  centre?: number;
}

/** Live x intervals of the outline at height y, left to right. */
export function sliceOutline(outline: readonly Point[], y: number): [number, number][] {
  const xs: number[] = [];
  for (let i = 0; i < outline.length; i++) {
    const a = outline[i]!;
    const b = outline[(i + 1) % outline.length]!;
    if (a.y === b.y) continue;
    const lo = Math.min(a.y, b.y);
    const hi = Math.max(a.y, b.y);
    if (y < lo || y >= hi) continue;
    xs.push(a.x + ((y - a.y) / (b.y - a.y)) * (b.x - a.x));
  }
  xs.sort((p, q) => p - q);
  const out: [number, number][] = [];
  for (let i = 0; i + 1 < xs.length; i += 2) if (xs[i + 1]! - xs[i]! > 1e-6) out.push([xs[i]!, xs[i + 1]!]);
  return out;
}

const MIN_SEGMENT = 4;

export function rasterizePiece(input: RasterizeInput): PanelPlan {
  const { piece, gauge, ribGauge } = input;
  const centre = input.centre ?? 127;
  const stitchCm = 10 / gauge.stitchesPer10cm;
  const rowCm = { rib: 10 / ribGauge.rowsPer10cm, body: 10 / gauge.rowsPer10cm };
  const height = Math.max(...piece.outline.map((p) => p.y));

  // Row layout: the bottom rib, the body, a top rib border.
  const ys: { y: number; zone: RowZone }[] = [];
  if (piece.allRib) {
    const count = Math.max(2, Math.round(height / rowCm.rib));
    for (let r = 0; r < count; r++) ys.push({ y: ((r + 0.5) * height) / count, zone: 'rib' });
  } else {
    const bottom = piece.bottomRibCm > 0 ? Math.max(2, Math.round(piece.bottomRibCm / rowCm.rib)) : 0;
    const topRib = piece.topRibCm > 0 ? Math.max(2, Math.round(piece.topRibCm / rowCm.rib)) : 0;
    const bodyHeight = height - piece.bottomRibCm - piece.topRibCm;
    const body = Math.max(1, Math.round(bodyHeight / rowCm.body));
    for (let r = 0; r < bottom; r++) ys.push({ y: ((r + 0.5) * piece.bottomRibCm) / bottom, zone: 'rib' });
    for (let r = 0; r < body; r++) ys.push({ y: piece.bottomRibCm + ((r + 0.5) * bodyHeight) / body, zone: 'body' });
    for (let r = 0; r < topRib; r++) ys.push({ y: height - piece.topRibCm + ((r + 0.5) * piece.topRibCm) / topRib, zone: 'rib' });
  }
  // Rounded away from the centre line symmetrically, so a symmetric outline gives symmetric rows.
  const toStitches = (x: number) => Math.sign(x) * Math.round(Math.abs(x) / stitchCm);
  const targets = ys.map(({ y }) => sliceOutline(piece.outline, y).map(([a, b]): PanelSegment => ({ lo: centre + toStitches(a), hi: centre + toStitches(b) - 1 })));
  // Two shoulders are split by at least one bound-off needle each side of the centre (the point of a V).
  for (const target of targets) {
    if (target.length !== 2) continue;
    target[0] = { ...target[0]!, hi: Math.min(target[0]!.hi, centre - 2) };
    target[1] = { ...target[1]!, lo: Math.max(target[1]!.lo, centre + 1) };
  }

  const first = targets[0]?.[0];
  if (first === undefined) throw new Error(`${piece.name} has no width at its cast-on`);
  // The cast-on is an even number of needles, centred.
  const half = Math.max(4, Math.round((first.hi - first.lo + 1) / 2));
  const rows: PlannedRow[] = [{ segments: [{ lo: centre - half, hi: centre + half - 1 }], zone: ys[0]!.zone, y: ys[0]!.y }];
  const events: ShapingEvent[] = [];
  let lag = { stitches: 0, row: 0, cm: 0 };
  let splitRow: number | null = null;

  /**
   * New edge position from `old` toward `target`. `yarnHere`: the row starts
   * at this edge. `waited`: the edge's target at a fresh step one row earlier,
   * which it had to wait a row for; it then binds off only what was due then
   * (so the two sides of an armhole bind off alike) and transfers the rest.
   */
  const follow = (row: number, old: number, target: number, side: 'left' | 'right', edge: ShapingEvent['edge'], yarnHere: boolean, waited: number | null): number => {
    const decrease = side === 'left' ? target - old : old - target;
    const inward = side === 'left' ? 1 : -1;
    if (decrease === 0) return old;
    if (decrease < 0) { events.push({ row, kind: 'increase', edge, stitches: 1 }); return old - inward; }
    if (decrease <= 2) { events.push({ row, kind: 'decrease', edge, stitches: decrease }); return old + inward * decrease; }
    if (!yarnHere) return old;
    const due = waited === null ? 0 : side === 'left' ? waited - old : old - waited;
    const stitches = due >= 3 ? Math.min(decrease, due) : decrease;
    events.push({ row, kind: 'bind-off', edge, stitches });
    return old + inward * stitches;
  };

  for (let r = 1; r < targets.length; r++) {
    const target = targets[r]!;
    const previous = rows[r - 1]!.segments;
    if (target.length === 0) break;
    // The main yarn starts even rows on the left; after the split the second yarn starts on the right in the row after it.
    const mainLeft = r % 2 === 0;
    // A fresh step in the outline one row ago (an armhole or cap bind-off) that this edge had to wait for:
    // it binds off what was due then, so both sides match. Continuous slopes follow their own targets.
    const freshStep = (pick: (slice: PanelSegment[]) => number | undefined) => {
      const at = (k: number) => (k >= 0 && targets[k]!.length > 0 ? pick(targets[k]!) : undefined);
      const [a, b, c] = [at(r - 3), at(r - 2), at(r - 1)];
      return a !== undefined && b !== undefined && c !== undefined && Math.abs(c - b) >= 3 && Math.abs(b - a) < 3 ? c : null;
    };
    const secondLeft = splitRow !== null && (r - splitRow) % 2 === 0;
    let next: PanelSegment[];
    if (previous.length === 1 && target.length === 2 && !mainLeft) {
      const [left, right] = target as [PanelSegment, PanelSegment];
      const lo = follow(r, previous[0]!.lo, left.lo, 'left', 'left', false, null);
      const hi = follow(r, previous[0]!.hi, right.hi, 'right', 'right', true, freshStep((slice) => slice.at(-1)!.hi));
      next = [{ lo, hi: Math.max(lo + 1, left.hi) }, { lo: Math.min(hi - 1, right.lo), hi }];
      events.push({ row: r, kind: 'neck-split', edge: 'centre', stitches: next[1]!.lo - next[0]!.hi - 1 });
      splitRow = r;
    } else if (previous.length === 1) {
      const outer = target.length === 2 ? { lo: target[0]!.lo, hi: target[1]!.hi } : target[0]!;
      next = [{ lo: follow(r, previous[0]!.lo, outer.lo, 'left', 'left', mainLeft, freshStep((slice) => slice[0]!.lo)), hi: follow(r, previous[0]!.hi, outer.hi, 'right', 'right', !mainLeft, freshStep((slice) => slice.at(-1)!.hi)) }];
    } else {
      const [left, right] = target.length === 2 ? target as [PanelSegment, PanelSegment] : [target[0]!, target[0]!];
      next = [
        { lo: follow(r, previous[0]!.lo, left.lo, 'left', 'left', mainLeft, null), hi: follow(r, previous[0]!.hi, left.hi, 'right', 'neck-left', !mainLeft, null) },
        { lo: follow(r, previous[1]!.lo, right.lo, 'left', 'neck-right', secondLeft, null), hi: follow(r, previous[1]!.hi, right.hi, 'right', 'right', !secondLeft, null) },
      ];
    }
    // The top bind-off takes the last stitches of a narrowing segment.
    if (next.some((segment) => segment.hi - segment.lo + 1 < MIN_SEGMENT)) {
      while (events.length > 0 && events.at(-1)!.row === r) events.pop();
      if (splitRow === r) splitRow = null;
      break;
    }
    // Lag against this row's outline or the previous row's: a bind-off that waits one row for the yarn is not lag.
    const goalFor = (slice: PanelSegment[], index: number) => (slice.length === next.length ? slice[index]! : slice.length === 2 ? { lo: slice[0]!.lo, hi: slice[1]!.hi } : slice[0]!);
    const lagged = Math.max(...next.flatMap((segment, index) => {
      const now = goalFor(target, index);
      const before = goalFor(targets[r - 1]!.length > 0 ? targets[r - 1]! : target, index);
      return [Math.min(Math.abs(segment.lo - now.lo), Math.abs(segment.lo - before.lo)), Math.min(Math.abs(segment.hi - now.hi), Math.abs(segment.hi - before.hi))];
    }));
    if (lagged > lag.stitches) lag = { stitches: lagged, row: r, cm: Math.round(lagged * stitchCm * 10) / 10 };
    rows.push({ segments: next, zone: ys[r]!.zone, y: ys[r]!.y });
  }

  // Leading rib rows are the bottom border; trailing rib rows (a boat neck) the top border.
  let firstBodyRow = 0;
  while (firstBodyRow < rows.length && rows[firstBodyRow]!.zone === 'rib') firstBodyRow++;
  let topRibRows = 0;
  while (!piece.allRib && topRibRows < rows.length - firstBodyRow && rows[rows.length - 1 - topRibRows]!.zone === 'rib') topRibRows++;
  const texture = input.texture;
  const tileHeight = texture.length;
  const tileWidth = texture[0]!.length;
  const ribAt = (pattern: string, needle: number, origin: number): PanelStitchV1 => pattern[(((needle - origin) % pattern.length) + pattern.length) % pattern.length] as PanelStitchV1;
  const castOn = rows[0]!.segments[0]!;
  const stitchAt = (row: number, needle: number): PanelStitchV1 => {
    const zone = rows[row]?.zone ?? 'body';
    if (zone === 'rib') {
      // Ribs start at the cast-on's left edge with their first stitch.
      const top = !piece.allRib && row > firstBodyRow;
      return ribAt(top ? input.topRib ?? input.rib : input.rib, needle, castOn.lo);
    }
    // The texture is centred on the piece and starts with its bottom row.
    const k = row - firstBodyRow;
    const line = texture[tileHeight - 1 - (((k % tileHeight) + tileHeight) % tileHeight)]!;
    return line[(((needle - centre) % tileWidth) + tileWidth) % tileWidth] as PanelStitchV1;
  };
  const widest = Math.max(...rows.map((row) => row.segments.at(-1)!.hi - row.segments[0]!.lo + 1));
  return {
    piece,
    centre,
    rows,
    events,
    stitchAt,
    realized: {
      castOnStitches: castOn.hi - castOn.lo + 1,
      widestStitches: widest,
      rows: rows.length,
      ribRows: { bottom: firstBodyRow, top: topRibRows },
      widthCm: Math.round(widest * stitchCm * 10) / 10,
      heightCm: Math.round(rows.reduce((sum, row) => sum + (row.zone === 'rib' ? rowCm.rib : rowCm.body), 0) * 10) / 10,
    },
    lag,
    stitchCm,
    rowCm,
  };
}
