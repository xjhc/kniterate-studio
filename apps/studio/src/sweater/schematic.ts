import type { Point } from './draft';
import type { PanelPlan } from './rasterize';
import type { SweaterPlan } from './sweater';

/**
 * The flat-layout schematic: every piece to scale in cm, as knitted (the
 * rows' live widths, so bind-off steps show) over its drafted outline, with
 * the knitted dimensions. One layout drives the browser view and the
 * package's SVG.
 */

export interface SchematicDimension { x1: number; y1: number; x2: number; y2: number; text: string; /** Which side the label sits on. */ side: 'above' | 'below' | 'left' | 'right' }

export interface SchematicPiece {
  id: SweaterPlan['pieces'][number]['id'];
  name: string;
  copies: number;
  /** Offset of the piece's centre line and cast-on edge in the layout, cm (y grows downward). */
  x: number;
  y: number;
  width: number;
  height: number;
  /** The knitted shape: one rectangle per row segment, as an SVG path in layout cm. */
  knittedPath: string;
  /** The drafted outline, as an SVG path in layout cm. */
  draftPath: string;
  /** Rib rows at the bottom and top, as paths, to tint. */
  ribPath: string;
  dimensions: SchematicDimension[];
}

export interface SchematicLayout { width: number; height: number; pieces: SchematicPiece[] }

const GAP = 18;
const r1 = (value: number) => Math.round(value * 10) / 10;
const r2 = (value: number) => Math.round(value * 100) / 100;

/** Bottom and top of each row, cm above the cast-on edge. */
export function rowBands(raster: PanelPlan): { y0: number; y1: number }[] {
  let y = 0;
  return raster.rows.map((row) => {
    const height = row.zone === 'rib' ? raster.rowCm.rib : raster.rowCm.body;
    const band = { y0: y, y1: y + height };
    y += height;
    return band;
  });
}

function knittedPaths(raster: PanelPlan, ox: number, oy: number): { knitted: string; rib: string } {
  const bands = rowBands(raster);
  const parts: string[] = [];
  const rib: string[] = [];
  raster.rows.forEach((row, index) => {
    const band = bands[index]!;
    for (const segment of row.segments) {
      const x0 = ox + (segment.lo - raster.centre) * raster.stitchCm;
      const x1 = ox + (segment.hi + 1 - raster.centre) * raster.stitchCm;
      // Rows overlap a hair so anti-aliasing leaves no seams between them.
      const path = `M${r2(x0)} ${r2(oy - band.y1 - 0.04)}H${r2(x1)}V${r2(oy - band.y0)}H${r2(x0)}Z`;
      (row.zone === 'rib' ? rib : parts).push(path);
    }
  });
  return { knitted: [...parts, ...rib].join(''), rib: rib.join('') };
}

function outlinePath(outline: readonly Point[], ox: number, oy: number): string {
  return `${outline.map((p, i) => `${i === 0 ? 'M' : 'L'}${r1(ox + p.x)} ${r1(oy - p.y)}`).join('')}Z`;
}

export function schematicLayout(plan: SweaterPlan): SchematicLayout {
  const pieces: SchematicPiece[] = [];
  const placed = plan.pieces.filter((piece) => piece.raster !== null);
  const main = placed.filter((piece) => piece.id !== 'neckband');
  // Pieces stand on one baseline, in a row; the neckband lies under the front.
  const baseline = Math.max(0, ...main.map((piece) => piece.raster!.realized.heightCm)) + GAP;
  let cursor = GAP;
  for (const piece of main) {
    const raster = piece.raster!;
    const width = raster.realized.widestStitches * raster.stitchCm;
    pieces.push(pieceLayout(plan, piece.id, piece.name, piece.copies, raster, piece.draft.outline, cursor + width / 2, baseline, width));
    cursor += width + GAP;
  }
  let height = baseline + GAP;
  const band = placed.find((piece) => piece.id === 'neckband');
  if (band) {
    const raster = band.raster!;
    const width = raster.realized.widestStitches * raster.stitchCm;
    const y = baseline + GAP + raster.realized.heightCm + 4;
    const front = pieces.find((piece) => piece.id === 'front') ?? pieces[0];
    const x = Math.max(GAP + width / 2, front?.x ?? 0);
    pieces.push(pieceLayout(plan, band.id, band.name, band.copies, raster, band.draft.outline, x, y, width));
    height = y + GAP;
    cursor = Math.max(cursor, x + width / 2 + GAP);
  }
  return { width: cursor, height, pieces };
}

function pieceLayout(plan: SweaterPlan, id: SchematicPiece['id'], name: string, copies: number, raster: PanelPlan, outline: readonly Point[], x: number, y: number, width: number): SchematicPiece {
  const paths = knittedPaths(raster, x, y);
  const height = raster.realized.heightCm;
  const half = width / 2;
  const dims: SchematicDimension[] = [];
  const cm = (value: number | undefined) => `${r1(value ?? 0)} cm`;
  const k = plan.knitted;
  const starts = rowBands(raster).map((band) => band.y0);
  const levelOf = (level: number) => { const row = raster.rows.findIndex((item) => item.y >= level); return row < 0 ? height : starts[row]!; };
  const castOn = raster.realized.castOnStitches * raster.stitchCm;
  dims.push({ x1: x - castOn / 2, y1: y + 3, x2: x + castOn / 2, y2: y + 3, text: cm(castOn), side: 'below' });
  if (id === 'neckband') {
    dims.push({ x1: x + half + 3, y1: y, x2: x + half + 3, y2: y - height, text: cm(height), side: 'right' });
  } else if (id === 'sleeve') {
    const underarm = levelOf(plan.draft.levels.sleeveUnderarm);
    const upper = (k.upperArm ?? width);
    dims.push({ x1: x - upper / 2, y1: y - underarm, x2: x + upper / 2, y2: y - underarm, text: cm(k.upperArm), side: 'above' });
    dims.push({ x1: x - half - 3, y1: y, x2: x - half - 3, y2: y - underarm, text: cm(k.sleeveLength), side: 'left' });
    if (height - underarm > 0.5) dims.push({ x1: x + half + 3, y1: y - underarm, x2: x + half + 3, y2: y - height, text: cm(height - underarm), side: 'right' });
  } else if (id === 'back') {
    const underarm = levelOf(plan.draft.levels.underarm);
    const shoulder = levelOf(plan.draft.levels.shoulderPoint);
    dims.push({ x1: x - half - 3, y1: y, x2: x - half - 3, y2: y - height, text: cm(k.length), side: 'left' });
    dims.push({ x1: x + half + 3, y1: y - underarm, x2: x + half + 3, y2: y - shoulder, text: cm(k.armholeDepth), side: 'right' });
    if (plan.object.silhouette !== 'drop-shoulder') dims.push({ x1: x - (k.shoulderWidth ?? width) / 2, y1: y - height - 7, x2: x + (k.shoulderWidth ?? width) / 2, y2: y - height - 7, text: cm(k.shoulderWidth), side: 'above' });
    if (k.neckWidth !== undefined) dims.push({ x1: x - k.neckWidth / 2, y1: y - height - 2.5, x2: x + k.neckWidth / 2, y2: y - height - 2.5, text: cm(k.neckWidth), side: 'above' });
  } else if (k.frontNeckDepth !== undefined) {
    dims.push({ x1: x + half + 3, y1: y - height + k.frontNeckDepth, x2: x + half + 3, y2: y - height, text: cm(k.frontNeckDepth), side: 'right' });
  }
  return { id, name, copies, x, y, width, height, knittedPath: paths.knitted, draftPath: outlinePath(outline, x, y), ribPath: paths.rib, dimensions: dims };
}

/** The schematic as a standalone SVG, for the package and the printed sheet. */
export function sweaterSchematicSvg(plan: SweaterPlan, yarnHex: string): string {
  const layout = schematicLayout(plan);
  const scale = 8;
  const w = Math.ceil(layout.width * scale);
  const h = Math.ceil(layout.height * scale);
  const label = (text: string, x: number, y: number, anchor = 'middle', size = 15) => `<text x="${r1(x * scale)}" y="${r1(y * scale)}" text-anchor="${anchor}" font-size="${size}" font-family="sans-serif" fill="#333">${escapeXml(text)}</text>`;
  const body = layout.pieces.map((piece) => [
    `<g transform="scale(${scale})">`,
    `<path d="${piece.draftPath}" fill="none" stroke="#999" stroke-width="0.15" stroke-dasharray="0.6 0.4"/>`,
    `<path d="${piece.knittedPath}" fill="${yarnHex}" fill-opacity="0.55" stroke="none"/>`,
    `<path d="${piece.ribPath}" fill="${yarnHex}" fill-opacity="0.85" stroke="none"/>`,
    ...piece.dimensions.map((d) => `<line x1="${d.x1}" y1="${d.y1}" x2="${d.x2}" y2="${d.y2}" stroke="#555" stroke-width="0.12"/>`),
    '</g>',
    label(`${piece.name}${piece.copies > 1 ? ` ×${piece.copies}` : ''}`, piece.x, piece.y + 9, 'middle', 18),
    ...piece.dimensions.map((d) => {
      const mx = (d.x1 + d.x2) / 2;
      const my = (d.y1 + d.y2) / 2;
      if (d.side === 'left') return label(d.text, mx - 0.8, my, 'end');
      if (d.side === 'right') return label(d.text, mx + 0.8, my, 'start');
      return label(d.text, mx, d.side === 'above' ? my - 0.9 : my + 2.6);
    }),
  ].join('')).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><rect width="100%" height="100%" fill="#fff"/>${body}<text x="10" y="${h - 8}" font-size="13" font-family="sans-serif" fill="#666">Shaded: as knitted at the gauge. Dashed: the drafted shape. ${plan.gauge.source === 'assumed' ? 'Sizes come from an assumed gauge.' : 'Sizes come from the measured gauge.'}</text></svg>`;
}

function escapeXml(text: string): string {
  return text.replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' })[c]!);
}

export interface AssembledLayout {
  /** viewBox in cm. */
  minX: number;
  minY: number;
  width: number;
  height: number;
  front: string;
  frontRib: string;
  /** The back, behind the front: it shows through the neck opening. */
  back: string;
  /** Each sleeve, and the sleeve head between the armhole and the cap edge (the cap rounds over the shoulder, which a flat view cannot show). */
  sleeves: { path: string; rib: string; head: string }[];
  /** The neckband along the front neck edge and, behind the front, along the back neck edge: polylines and the band's width in cm. */
  neckband: { front: string; back: string; width: number } | null;
}

/**
 * The sweater as worn, seen from the front: the front as knitted, and each
 * sleeve folded along its length (half its width shows) and hinged at the
 * shoulder, pointing out and a little down. An illustration of proportion,
 * not a fitting.
 */
export function assembledLayout(plan: SweaterPlan): AssembledLayout | null {
  const front = plan.pieces.find((piece) => piece.id === 'front')?.raster;
  const backRaster = plan.pieces.find((piece) => piece.id === 'back')?.raster;
  const sleeve = plan.pieces.find((piece) => piece.id === 'sleeve')?.raster;
  if (!front || !sleeve || !backRaster) return null;
  const frontPaths = knittedPaths(front, 0, 0);
  const backPaths = knittedPaths(backRaster, 0, 0);
  const { levels } = plan.draft;
  // The shoulder point: where the armhole meets the shoulder line.
  const shoulderRowIndex = Math.max(0, front.rows.findIndex((row) => row.y >= levels.shoulderPoint) - 1);
  const shoulderRow = front.rows[shoulderRowIndex]!;
  const bands = rowBands(front);
  const pivotX = (shoulderRow.segments.at(-1)!.hi + 1 - front.centre) * front.stitchCm;
  const pivotY = -bands[shoulderRowIndex]!.y1;
  const sleeveBands = rowBands(sleeve);
  const top = sleeve.realized.heightCm;
  // The angle that puts the sleeve's underarm corner on the body's underarm: drop shoulders lie flat out, caps angle down.
  const bodyUnder = Math.max(0, front.rows.findIndex((row) => row.y >= levels.underarm));
  const bodyUnderX = (front.rows[Math.max(0, bodyUnder - 1)]!.segments.at(-1)!.hi + 1 - front.centre) * front.stitchCm;
  const sleeveUnder = Math.max(0, sleeve.rows.findIndex((row) => row.y >= levels.sleeveUnderarm));
  const sleeveHalf = (sleeve.rows[Math.max(0, sleeveUnder - 1)]!.segments.at(-1)!.hi + 1 - sleeve.centre) * sleeve.stitchCm;
  const localAngle = Math.atan2(sleeveHalf, top - sleeveBands[sleeveUnder]!.y0);
  const targetAngle = Math.atan2(-bands[bodyUnder]!.y0 - pivotY, bodyUnderX - pivotX);
  const a = Math.max(0, Math.min(Math.PI / 3, targetAngle - localAngle));
  const sleevePaths = [1, -1].map((side) => {
    // Along the sleeve (d, out and down) and across it from the fold toward the underarm (n), mirrored for the left.
    const d = { x: side * Math.cos(a), y: Math.sin(a) };
    const n = { x: -side * Math.sin(a), y: Math.cos(a) };
    const at = (along: number, across: number) => ({ x: side * pivotX + along * d.x + across * n.x, y: pivotY + along * d.y + across * n.y });
    const parts: string[] = [];
    const rib: string[] = [];
    sleeve.rows.forEach((row, index) => {
      const right = (row.segments.at(-1)!.hi + 1 - sleeve.centre) * sleeve.stitchCm;
      const s0 = top - sleeveBands[index]!.y1 - 0.04;
      const s1 = top - sleeveBands[index]!.y0;
      const corners = [at(s0, 0), at(s0, right), at(s1, right), at(s1, 0)];
      (row.zone === 'rib' ? rib : parts).push(`M${corners.map((p) => `${r2(p.x)} ${r2(p.y)}`).join('L')}Z`);
    });
    // The sleeve head: down the body's armhole edge from the shoulder to the underarm, then back up the cap edge.
    const armhole: { x: number; y: number }[] = [];
    for (let index = shoulderRowIndex; index >= bodyUnder; index--) {
      const row = front.rows[index]!;
      armhole.push({ x: side * ((row.segments.at(-1)!.hi + 1 - front.centre) * front.stitchCm), y: -bands[index]!.y0 });
    }
    const capEdge: { x: number; y: number }[] = [];
    for (let index = sleeveUnder; index < sleeve.rows.length; index++) {
      const right = (sleeve.rows[index]!.segments.at(-1)!.hi + 1 - sleeve.centre) * sleeve.stitchCm;
      capEdge.push(at(top - sleeveBands[index]!.y1, right));
    }
    const head = armhole.length > 1 && capEdge.length > 0 ? `M${[...armhole, ...capEdge, { x: side * pivotX, y: pivotY }].map((p) => `${r2(p.x)} ${r2(p.y)}`).join('L')}Z` : '';
    return { path: [...parts, ...rib].join(''), rib: rib.join(''), head };
  });
  // A neck edge (neck point to centre) as a band from one neck point round to the other, sitting just above the edge.
  const ring = (edge: readonly Point[] | undefined) => edge === undefined ? '' : [...edge.map((p) => ({ x: -p.x, y: p.y })), ...[...edge].reverse()]
    .map((p) => `${r2(p.x)},${r2(-p.y - plan.object.trims.neck.cm * 0.3)}`).join(' ');
  const frontNeck = plan.pieces.find((piece) => piece.id === 'front')?.draft.edges.neck;
  const backNeck = plan.pieces.find((piece) => piece.id === 'back')?.draft.edges.neck;
  const band = plan.object.neckline === 'crew' && frontNeck ? { front: ring(frontNeck), back: ring(backNeck), width: plan.object.trims.neck.cm } : null;
  // Bounds: the front and both sleeves.
  const xs: number[] = [];
  const ys: number[] = [];
  for (const path of [frontPaths.knitted, ...sleevePaths.map((item) => item.path)]) {
    for (const match of path.matchAll(/(-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?)/g)) { xs.push(Number(match[1])); ys.push(Number(match[2])); }
  }
  const pad = 6;
  const minX = Math.min(...xs) - pad;
  const minY = Math.min(...ys) - pad;
  return { minX, minY, width: Math.max(...xs) + pad - minX, height: Math.max(...ys) + pad - minY, front: frontPaths.knitted, frontRib: frontPaths.rib, back: backPaths.knitted, sleeves: sleevePaths, neckband: band };
}
