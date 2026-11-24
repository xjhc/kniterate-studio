import { describe, expect, it } from 'vitest';
import { paintFigCamelDetails } from './figCamelArtwork';
import { cashmereGauge, figCamelTarget, planTriangle, triangleCells } from './triangle';
import { pointOrnament, seedDown, seedUp } from './wildRagMotifs';

const plan = planTriangle(cashmereGauge.stitches * 10 / cashmereGauge.widthCm, 60, figCamelTarget);
describe('141 cm regular cashmere scarf', () => {
  it('holds every width for two courses through both tips and the apex', () => {
    const pairs = Array.from({ length: 423 }, (_, pair) => 3 + Math.min(pair, 422 - pair));
    expect(plan.widths).toEqual(pairs.flatMap(width => [width, width]));
    expect(plan.lengthCm).toBe(141);
  });

  it('follows the joined swatch front-edge yarns through growth and narrowing', () => {
    const cells = triangleCells(plan, new Uint8ClampedArray(plan.rows * plan.columns * 4), true);
    paintFigCamelDetails(plan, cells);
    const edges = cells.map((course, row) => [course[0], course[plan.widths[row]! - 1]]);
    // C4 (Fig) = 0, C3 (Camel) = 1. The two starter courses correspond
    // to swatch courses 2 and 3. Swatch courses 4 and 5 form the first split pair.
    expect(edges.slice(0, 4)).toEqual([[0, 1], [1, 0], [0, 0], [1, 1]]);
    for (let row = 2; row < plan.rows; row += 2) {
      const decreasing = plan.widths[row]! < plan.widths[row - 1]!;
      expect(edges.slice(row, row + 2)).toEqual(decreasing ? [[0, 1], [1, 0]] : [[0, 0], [1, 1]]);
      if (plan.widths[row]! > plan.widths[row - 1]!) {
        const inboard = plan.widths[row]! - 2;
        expect([cells[row]![inboard], cells[row + 1]![inboard]]).toEqual([0, 0]);
      }
    }
  });

  it('places the compact A with two full crossbar courses only on the starting tie', () => {
    const cells = plan.widths.map(() => Array<number>(plan.columns).fill(0));
    paintFigCamelDetails(plan, cells);
    const letter = cells.slice(35, 43).reverse().map(row => row.slice(8, 14).join(''));
    expect(letter).toEqual(['001100', '011110', '110011', '110011', '111111', '111111', '110011', '110011']);
    expect(cells.slice(14, 22).every(row => row.slice(2, 8).every(value => value === 0))).toBe(true);
    expect(cells.slice(-43, -35).every(row => row.slice(8, 14).every(value => value === 0))).toBe(true);
  });

  it('keeps the centre ornament mirrored and the fine paisleys free of solid 2 × 2 blocks', () => {
    for (const row of pointOrnament) expect(row).toBe([...row].reverse().join(''));
    for (const motif of [pointOrnament, seedDown, seedUp]) {
      for (let y = 1; y < motif.length; y++) {
        for (let x = 1; x < motif[y]!.length; x++) {
          const block = motif[y - 1]!.slice(x - 1, x + 1) + motif[y]!.slice(x - 1, x + 1);
          expect(block).not.toBe('####');
        }
      }
    }
  });

  it('keeps each 2 × 2 square separate and the same distance from its neighbours', () => {
    const cells = plan.widths.map(() => Array<number>(plan.columns).fill(0));
    paintFigCamelDetails(plan, cells);
    function checkSquare(x: number, y: number) {
      expect(cells.slice(x - 1, x + 3).map(row => row.slice(y - 1, y + 3))).toEqual([
        [0,0,0,0], [0,1,1,0], [0,1,1,0], [0,0,0,0],
      ]);
    }
    for (let x = 166; x < 682; x += 4) checkSquare(x, 36);
    for (let i = 0; i <= 65; i++) {
      checkSquare(162 + i * 4, 38 + i * 2);
      checkSquare(682 - i * 4, 38 + i * 2);
    }
    // Both halves of the terminal must fit inside the sloping reserved edges.
    for (const [y, line] of pointOrnament.entries()) {
      for (const [x, stitch] of [...line].entries()) {
        if (stitch === '#') expect(cells[394 + x]![166 + y]).toBe(1);
      }
    }
  });
});
