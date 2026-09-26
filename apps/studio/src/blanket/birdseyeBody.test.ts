import { describe, expect, it } from 'vitest';
import { appendProjectEdit, createColorworkProjectV1 } from '@kniterate-studio/project-contract';
import { runAuthoredPipeline } from '../authoredPipeline';

const palette = Array.from({ length: 4 }, (_, index) => ({ id: `color-${index}`, name: `Color ${index}`, hex: '#123456' }));
const full = (width: number, shift = 0) => Array.from({ length: width }, (_, column) => (column + shift) % 4);
const solid = (width: number, color: number) => Array.from({ length: width }, () => color);

const cases = [
  { name: 'all four colors on every row', cells: Array.from({ length: 4 }, () => full(8)), offset: 40 },
  ...[0, 1, 2, 3].map((color) => ({
    name: `only color ${color} on the final row`,
    cells: [solid(7, color), full(7, 3), full(7, 2), full(7, 1), full(7)], offset: 80,
  })),
  { name: 'horizontal stripes with one color per row', cells: [solid(9, 3), solid(9, 2), solid(9, 1), solid(9, 0)], offset: 30 },
  { name: 'one needle and four colors across rows', cells: [[3], [2], [1], [0]], offset: 126 },
  { name: 'rows beyond the former reference-specific row-order range', cells: Array.from({ length: 66 }, (_, row) => full(8, row)), offset: 40 },
  { name: 'permuted carrier assignments', cells: [full(7, 3), solid(7, 2), full(7)], offset: 70, carriers: ['5', '3', '2', '4'] as const },
];

describe('authored Birdseye exact emitted row contract', () => {
  it.each(cases)('$name', { timeout: 20_000 }, async ({ name, cells, offset, carriers }) => {
    const width = cells[0]!.length;
    let project = createColorworkProjectV1({
      kind: 'knitlab-colorwork-chart', version: 1, title: name,
      width, height: cells.length, rowNumbering: 'bottom-up', palette, cells,
    }, { id: 'birdseye-row-contract', needleOffset: offset });
    if (carriers) {
      for (const [index, carrier] of carriers.entries()) {
        project = appendProjectEdit(project, { id: `carrier-${index}`, source: 'system', edit: {
          kind: 'set-yarn-assignment', assignment: { paletteId: palette[index]!.id, yarnName: palette[index]!.name, carrier },
        } });
      }
    }
    const result = await runAuthoredPipeline(project);
    expect(result.compileError).toBeNull();
    expect(result.outputError).toBeNull();
    expect(result.compiled?.messages.filter((message) => message.severity === 'error')).toEqual([]);
    expect(result.kcode?.messages.filter((message) => message.severity === 'error')).toEqual([]);
    expect(result.exportReady).toBe(true);
    const trace = result.kcode!.trace!;
    const assigned = carriers ?? ['2', '3', '4', '5'];
    for (const row of result.compiled!.rowProvenance) {
      const passIndices = result.kcode!.rowPasses.find((entry) => entry.rowId === row.rowId)!.passIndices;
      const stitches = passIndices.flatMap((index) => {
        const pass = trace.passes[index]!;
        return pass.actions.flatMap((action) => action.kind === 'knit'
          ? [{ bed: action.at.bed, needle: action.at.traceCoordinate, carrier: pass.carrier, rack: pass.rack }]
          : []);
      });
      const front = stitches.filter((stitch) => stitch.bed === 'front').sort((a, b) => a.needle - b.needle);
      const rear = stitches.filter((stitch) => stitch.bed === 'rear').sort((a, b) => a.needle - b.needle);
      // Exact emitted events, grouped by canonical source-row provenance:
      // every requested front color once and every rear needle once, even
      // when some colors are absent from the front or this is the last row.
      expect(front, `front chart row ${row.chartRow}`).toHaveLength(width);
      const start = front[0]!.needle;
      expect(front.map(({ needle, carrier }) => [needle - start, carrier])).toEqual(
        cells[row.chartRow]!.map((color, column) => [column, assigned[color]]),
      );
      expect(rear.map(({ needle, carrier }) => [needle - start, carrier])).toEqual(
        Array.from({ length: width }, (_, column) => [column, String(2 + (column + row.machineRow) % 4)]),
      );
      expect(rear.every((stitch) => stitch.rack === 0.5)).toBe(true);
    }
    // Every finish uses the frame's twenty C6 closing-waste passes at
    // roller 450, including width one (which has only one transfer batch).
    const lastBodyPass = Math.max(...result.kcode!.rowPasses.flatMap((row) => row.passIndices));
    const closingWaste = trace.passes.slice(lastBodyPass + 1).filter((pass) =>
      pass.carrier === '6' && pass.actions.some((action) => action.kind === 'knit'));
    expect(closingWaste).toHaveLength(20);
    expect(closingWaste.map((pass) => pass.roller)).toEqual(Array.from({ length: 20 }, () => 450));
  });
});
