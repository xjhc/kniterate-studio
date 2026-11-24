export const triangleTarget: TriangleTarget = { longEdgeCm: 141, depthCm: 62.5 };
export const originalFigCamelTarget = { longEdgeCm: 63.75 * 2.54, depthCm: 23 * 2.54 };
export const proportionalFigCamelTarget = { longEdgeCm: 141, depthCm: 141 * 23 / 63.75 };
export const figCamelTarget = { longEdgeCm: 141, depthCm: 214 * 11 / 48, everyOtherCourse: true };
export type TriangleTarget = { longEdgeCm: number; depthCm: number; everyOtherCourse?: boolean };
export const cashmereGauge = { stitches: 48, widthCm: 11, rows: 30, heightCm: 5, stitchSize: 6 };
export const acrylicGauge = { stitches: 21, widthCm: 5.5, rows: 81, heightCm: 18 };
export const tipColumns = 3;
export const triangleDraftKind = 'kniterate-studio-triangle-design';
export type TriangleDesignId = 'atelier-paisley' | 'fig-camel';
export const bedColumns = 252;
export const paisleyPalette = [
  { id: 'midnight', name: 'Midnight', hex: '#172b39' },
  { id: 'butter', name: 'Butter', hex: '#eadcb9' },
] as const;

export const figCamelPalette = [
  { id: 'fig', name: 'Fig', hex: '#532b3c' },
  { id: 'camel', name: 'Camel', hex: '#c9a47a' },
] as const;
export type TrianglePalette = readonly [{ id: string; name: string; hex: string }, { id: string; name: string; hex: string }];

export function planTriangle(stitchesPer10cm: number, rowsPer10cm: number, target: TriangleTarget = triangleTarget, endColumns = tipColumns) {
  const idealRows = target.longEdgeCm * rowsPer10cm / 10;
  const regular = target.everyOtherCourse === true;
  // An odd number of identical course pairs places one full pair at the apex.
  // Other designs retain their original single-course center and target depth.
  const rows = regular ? 4 * Math.round((idealRows - 2) / 4) + 2
    : 2 * Math.round((idealRows - 1) / 2) + 1;
  const half = Math.floor((rows - 1) / 2);
  const columns = regular ? endColumns + half / 2 : Math.round(target.depthCm * stitchesPer10cm / 10);
  const growth = columns - endColumns;
  const widths = Array.from({ length: rows }, (_, row) =>
    regular ? endColumns + Math.floor(Math.min(row, rows - 1 - row) / 2)
      : columns - Math.round(growth * Math.abs(row - half) / half),
  );
  return {
    columns, rows, widths, endColumns,
    coursesPerIncrease: regular ? 2 : half / growth,
    transitions: half,
    growth,
    lengthCm: rows * 10 / rowsPer10cm,
    depthCm: columns * 10 / stitchesPer10cm,
  };
}

export type TrianglePlan = ReturnType<typeof planTriangle>;

// Count physical needle positions from the operator's left, starting at one.
export function plannedBodyPlacement(plan: TrianglePlan) {
  if (plan.columns > bedColumns || plan.columns < plan.endColumns) return null;
  const firstNeedle = 1 + Math.floor((bedColumns - plan.columns) / 2);
  return {
    numbering: 'one-based-from-machine-left',
    firstNeedle,
    tipLastNeedle: firstNeedle + plan.endColumns - 1,
    widestLastNeedle: firstNeedle + plan.columns - 1,
  } as const;
}

// Pixels are in worn orientation. The chart is stored course first, from tip
// to tip, with needle indices running from the straight edge to the shaped one.
export function triangleCells(plan: TrianglePlan, rgba: Uint8ClampedArray, contrastSelvedge = false): number[][] {
  if (rgba.length !== plan.rows * plan.columns * 4) throw Error('Artwork and stitch grid dimensions differ.');
  return plan.widths.map((width, row) =>
    Array.from({ length: plan.columns }, (_, column) => {
      // The scarf starts with the last two plain courses before the swatch's
      // first growth (swatch courses 2 and 3). C4 is Fig, C3 is Camel.
      // At growth both front edges knit C4, then C3 on completion. Continue
      // in carriage order through the decreases, including the apex pair.
      if (contrastSelvedge && width > 2 && (column === 0 || column === width - 1)) {
        if (row < 2 && column === width - 1) return 1 - row;
        return row % 2;
      }
      if (column < 2 || column >= width - 2) return 0;
      const offset = (column * plan.rows + row) * 4;
      const red = rgba[offset]!;
      const alpha = rgba[offset + 3]!;
      return Number(red * alpha / 255 >= 105);
    }),
  );
}

// Construction reference selected for the regular Fig / Camel scarf.
export const joinedPaisleyIncrease = {
  swatchPasses: 510,
  swatchSha256: '2c85e52672cc19100a882c1f2feaf8d7cf3b83bf471fa00c010dd54589709aac',
  method: 'Joined right-edge supported split over two design rows',
  splitCarrier: 'C4',
  frontBackground: 'C4 (Fig)',
  frontContrast: 'C3 (Camel)',
  decrease: 'Transfer the front outer loop to the rear one column inward, then the rear outer loop to the front one column inward',
  splitBed: 'front',
  splitRack: 0,
} as const;

export const cashmereDecrease = {
  swatchSha256: '55797036219c57bafb1ebe4aa18098a6ca967edc1094cf0101b9782e0b9b5172',
  swatchPasses: 398,
  method: joinedPaisleyIncrease.decrease,
  frontEdgeOnDecrease: 'C3',
  frontEdgeOnFollowingCourse: 'C4',
} as const;

export function triangleDraft(plan: TrianglePlan, cells: number[][], stitchesPer10cm: number, rowsPer10cm: number, design: { id: TriangleDesignId; title: string; target: TriangleTarget; palette: TrianglePalette; c3Decrease?: boolean }) {
  return {
    kind: triangleDraftKind,
    version: 1,
    designId: design.id,
    title: design.title,
    targetCm: { longEdgeCm: design.target.longEdgeCm, depthCm: design.target.depthCm },
    gaugePer10cm: { stitches: stitchesPer10cm, rows: rowsPer10cm },
    edgeIntent: 'linked reversible jacquard',
    ...(design.id === 'fig-camel' && design.target.everyOtherCourse ? { increaseReference: joinedPaisleyIncrease } : {}),
    ...(design.c3Decrease ? { decreaseReference: cashmereDecrease } : {}),
    plannedBodyPlacement: plannedBodyPlacement(plan),
    tipColumns: plan.endColumns,
    reservedEdgeColumns: 2,
    setupReference: {
      swatchSha256: '3ea65875e829afc7b406a6a12d3270cc33e16c6f498af6c921dab04ef357b5c1',
      starterPasses: [1, 174],
      finishPasses: [350, 378],
    },
    activeIntervalsExclusive: plan.widths.map((width) => [0, width]),
    chart: {
      kind: 'knitlab-colorwork-chart',
      version: 1,
      rowNumbering: 'bottom-up',
      width: plan.columns,
      height: plan.rows,
      palette: design.palette,
      cells,
    },
  };
}
