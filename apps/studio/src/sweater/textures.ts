/**
 * Stitch textures as small repeats. Rows are written as seen, top row first;
 * the bottom row is knitted first. `k` knit, `p` purl (the stitch is knitted
 * on the rear bed), `t`/`u` tuck on the front/rear bed, `s` slip.
 *
 * One carriage pass knits a row, so a row may tuck on a bed only if it knits
 * nothing else on that bed; `textureProblem` checks this.
 */

export interface TextureDefinition {
  id: string;
  name: string;
  rows: readonly string[];
  /** What it looks like and how it behaves, for the picker. */
  note: string;
  /** Typical gauge in worsted at 7gg, used while the gauge is assumed. */
  gauge: { stitchesPer10cm: number; rowsPer10cm: number };
}

export const TEXTURES: readonly TextureDefinition[] = [
  { id: 'stockinette', name: 'Stockinette', rows: ['k'], note: 'Smooth V stitches. Curls at the edges, so it needs a rib or band.', gauge: { stitchesPer10cm: 26, rowsPer10cm: 34 } },
  { id: 'reverse', name: 'Reverse stockinette', rows: ['p'], note: 'The bumpy purl side outward.', gauge: { stitchesPer10cm: 26, rowsPer10cm: 34 } },
  { id: 'rib-1x1', name: '1×1 rib', rows: ['kp'], note: 'Stretchy, close-fitting columns.', gauge: { stitchesPer10cm: 32, rowsPer10cm: 32 } },
  { id: 'rib-2x2', name: '2×2 rib', rows: ['kkpp'], note: 'Bold columns that hug the body.', gauge: { stitchesPer10cm: 30, rowsPer10cm: 32 } },
  { id: 'seed', name: 'Seed stitch', rows: ['pk', 'kp'], note: 'A pebbly, flat fabric that does not curl. Every row moves stitches between beds, so it knits slowly.', gauge: { stitchesPer10cm: 25, rowsPer10cm: 40 } },
  { id: 'moss', name: 'Moss stitch', rows: ['pk', 'pk', 'kp', 'kp'], note: 'Seed stitch stretched over two rows: a softer texture.', gauge: { stitchesPer10cm: 25, rowsPer10cm: 38 } },
  { id: 'garter', name: 'Garter stitch', rows: ['p', 'k'], note: 'Horizontal ridges, squishy and flat. Every row moves all stitches.', gauge: { stitchesPer10cm: 25, rowsPer10cm: 48 } },
  { id: 'broken-rib', name: 'Broken rib', rows: ['kk', 'kp'], note: 'A rib that breaks every other row: textured and less clingy.', gauge: { stitchesPer10cm: 27, rowsPer10cm: 36 } },
  { id: 'welts', name: 'Welts', rows: ['p', 'p', 'k', 'k', 'k', 'k'], note: 'Raised horizontal bands.', gauge: { stitchesPer10cm: 26, rowsPer10cm: 40 } },
  { id: 'basketweave', name: 'Basketweave', rows: ['ppppkkkk', 'ppppkkkk', 'ppppkkkk', 'ppppkkkk', 'kkkkpppp', 'kkkkpppp', 'kkkkpppp', 'kkkkpppp'], note: 'Checks of knit and purl.', gauge: { stitchesPer10cm: 26, rowsPer10cm: 38 } },
  { id: 'half-cardigan', name: 'Half cardigan', rows: ['kp', 'ku'], note: 'A plump tuck rib: the rear stitches tuck every other row.', gauge: { stitchesPer10cm: 22, rowsPer10cm: 44 } },
  { id: 'full-cardigan', name: 'Fisherman rib', rows: ['tp', 'ku'], note: 'Full cardigan: both beds tuck in turn. Thick, deep and very warm.', gauge: { stitchesPer10cm: 20, rowsPer10cm: 46 } },
  { id: 'slip-tweed', name: 'Slip-stitch tweed', rows: ['kk', 'ks'], note: 'Slipped stitches pull up small floats for a woven look.', gauge: { stitchesPer10cm: 27, rowsPer10cm: 40 } },
];

export const RIBS: readonly { rib: string; name: string }[] = [
  { rib: 'kp', name: '1×1' },
  { rib: 'kkpp', name: '2×2' },
  { rib: 'kkkp', name: '3×1' },
  { rib: 'kkkpp', name: '3×2' },
];

export function textureById(id: string): TextureDefinition | undefined {
  return TEXTURES.find((texture) => texture.id === id);
}

/** The library texture with exactly these rows, if any. */
export function textureMatching(rows: readonly string[]): TextureDefinition | undefined {
  return TEXTURES.find((texture) => texture.rows.length === rows.length && texture.rows.every((row, index) => row === rows[index]));
}

export function ribName(rib: string): string {
  return RIBS.find((item) => item.rib === rib)?.name ?? rib;
}

/** Why a texture cannot be knitted, or null. */
export function textureProblem(rows: readonly string[]): string | null {
  if (rows.length === 0 || rows[0]!.length === 0) return 'A texture needs at least one stitch.';
  if (rows.some((row) => row.length !== rows[0]!.length)) return 'Every texture row needs the same number of stitches.';
  if (rows.some((row) => /[^kptus]/.test(row))) return 'A texture uses only k (knit), p (purl), t and u (tuck front or back) and s (slip).';
  for (const [index, row] of rows.entries()) {
    const label = `Row ${rows.length - index} (from the bottom)`;
    if (row.includes('k') && row.includes('t')) return `${label} knits and tucks on the front bed; one carriage pass cannot do both. Tuck on the back (u) or knit the row plain.`;
    if (row.includes('p') && row.includes('u')) return `${label} purls and tucks on the back bed; one carriage pass cannot do both.`;
    if (/^s+$/.test(row)) return `${label} slips every stitch, so the yarn would not be knitted in.`;
  }
  // Repeated tucks on one needle would stack loops past what the needle holds.
  const width = rows[0]!.length;
  for (let column = 0; column < width; column++) {
    for (let index = 0; index < rows.length; index++) {
      const a = rows[index]![column];
      const b = rows[(index + 1) % rows.length]![column];
      if ((a === 't' || a === 'u') && (b === 't' || b === 'u') && rows.length > 1) return `Stitch ${column + 1} tucks in two rows running; a needle holds at most two loops.`;
    }
  }
  return null;
}

/** How a texture's rows move stitches: rows that change beds take transfer passes and slow the knit. */
export function textureTransfersPerRepeat(rows: readonly string[]): number {
  const bed = (stitch: string, previous: string) => (stitch === 'k' || stitch === 't' ? 'f' : stitch === 'p' || stitch === 'u' ? 'b' : previous);
  let changes = 0;
  // Knitting order is bottom first; compare each row with the one knitted before it, around the repeat.
  const order = [...rows].reverse();
  for (let index = 0; index < order.length; index++) {
    const now = order[index]!;
    const before = order[(index + order.length - 1) % order.length]!;
    if ([...now].some((stitch, column) => bed(stitch, 'f') !== bed(before[column]!, 'f'))) changes++;
  }
  return changes;
}
