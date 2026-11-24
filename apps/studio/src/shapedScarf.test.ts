import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { authoredKnitoutToKCodeWithTrace } from '../../../packages/machine-lib/src/knitout/kniterate/to-kcode';
import { scarfCommand } from '../../../scripts/lib/scarf-command';
import {
  buildShapedScarf, KNITTED_SCARF_SETTINGS, readScarfDesign, scarfOutlineProblems, scarfPreviewPng, ScarfDesignError, verifyShapedScarf, type ScarfDesign,
} from '../../../scripts/lib/shaped-scarf';

const repo = (path: string) => new URL(`../../../${path}`, import.meta.url);
const KNITTED_DESIGN = 'designs/fig-camel/Fig-Camel-141cm-9-Rows.kniterate-studio.json';
const KNITTED_SHA = '3c82521ea30c5c59c79798bd0ea5d8aa64c4d468ed2c94ff34a6f0fed425d254';

/** One width per pair of courses, with a motif kept two columns clear of each edge. */
function design(pairs: number[], change: Partial<ScarfDesign> = {}): ScarfDesign {
  const widths = pairs.flatMap((width) => [width, width]), widest = Math.max(...widths);
  const cells = widths.map((width, course) => Array.from({ length: widest }, (_, column) => Number(column >= 2 && column < width - 2 && (column + course) % 3 === 0)));
  return { title: 'Test scarf', widths, cells, colours: ['#532b3c', '#c9a47a'], yarns: { c3: 'Camel', c4: 'Fig' }, settings: { ...KNITTED_SCARF_SETTINGS }, firstNeedle: 100, gauge: null, ...change };
}

describe('shaped scarf recipe', () => {
  it('rebuilds the scarf knitted on 2026-11-23 byte for byte from its design file', async () => {
    const out = mkdtempSync(join(tmpdir(), 'scarf-'));
    try {
      const { ok, result } = await scarfCommand(repo(KNITTED_DESIGN).pathname, out);
      expect(ok).toBe(true);
      expect(result).toMatchObject({
        fits: true, sha256: KNITTED_SHA, passes: 4384, courses: 846, increases: 211, decreases: 211,
        columns: { start: 3, widest: 214, end: 3 }, needles: [20, 233], compilerWarnings: 0, floatAdvisories: 0,
        ranges: { setup: [1, 114], starter: [115, 161], neck: [162, 168], body: [169, 4355], finish: [4356, 4384] },
        // Every pass has run: this is the file in the knit log.
        knitLog: { new: 0 },
      });
      expect(readFileSync(join(out, 'command.kc'), 'utf8')).toBe(readFileSync(repo('designs/fig-camel/fig-camel-full-scarf/command.kc'), 'utf8'));
      expect(readFileSync(join(out, 'instructions.md'), 'utf8')).toContain('root of the SD card');
      const png = readFileSync(join(out, 'preview.png'));
      expect([...png.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
      // 846 courses and two extra rows, two pixels each; both faces of 214 columns plus the gap.
      expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([848 * 2, (2 * 214 + 4) * 3]);
    } finally { rmSync(out, { recursive: true, force: true }); }
  }, 120_000);

  it.each([
    ['a straight middle and a blunt end', [3, 4, 5, 6, 7, 8, 8, 8, 8, 7, 6, 6, 6], 5, 2],
    ['a point off-centre', [3, 4, 5, 6, 7, 8, 9, 10, 9, 9, 8, 8, 7, 7, 6, 6, 5, 5, 4, 4, 3], 7, 7],
    ['holds between increases', [3, 3, 4, 4, 4, 5, 5, 6, 6, 6, 5, 4, 3], 3, 3],
    ['an edge that widens again after narrowing', [3, 4, 5, 4, 5, 6, 5, 4, 5, 4, 3], 5, 5],
  ])('knits %s, with every row replayed against the chart', (_name, pairs, increases, decreases) => {
    const built = buildShapedScarf(design(pairs));
    expect(verifyShapedScarf(built)).toMatchObject({ passed: true, increases, decreases, courses: pairs.length * 2 });
    expect(scarfPreviewPng(built).readUInt32BE(16)).toBeGreaterThan(0);
  });

  it('says why an outline or chart does not fit', () => {
    const problems = (change: (d: ScarfDesign) => void) => { const d = design([3, 4, 5, 5, 4, 3]); change(d); return scarfOutlineProblems(d); };
    expect(scarfOutlineProblems(design([3, 4, 5, 5, 4, 3]))).toEqual([]);
    expect(problems((d) => { d.widths[0] = d.widths[1] = 4; })[0]).toMatch(/first course is 4 columns/);
    expect(problems((d) => { d.widths[3] = 5; })[0]).toMatch(/Course 4 changes width/);
    expect(problems((d) => { d.widths[4] = d.widths[5] = 6; })[0]).toMatch(/Course 5 changes by 2 columns/);
    expect(problems((d) => { d.widths.pop(); d.cells.pop(); })[0]).toMatch(/even number/);
    expect(problems((d) => { d.cells[2]![2] = 1; })[0]).toMatch(/Course 3 widens/);
    expect(problems((d) => { d.cells[0]![4] = 1; })[0]).toMatch(/colour outside the outline/);
    expect(problems((d) => { d.firstNeedle = 250; })[0]).toMatch(/do not fit/);
    expect(() => buildShapedScarf(design([3, 5, 3]))).toThrow(ScarfDesignError);
  });

  it('reads the knit block of a design file and refuses a chart that is not two colours', () => {
    const file = JSON.parse(readFileSync(repo(KNITTED_DESIGN), 'utf8'));
    expect(readScarfDesign(file)).toMatchObject({ settings: KNITTED_SCARF_SETTINGS, firstNeedle: 20, yarns: { c3: 'Camel', c4: 'Fig' } });
    expect(readScarfDesign({ ...file, knit: { yarns: { c3: 'Rust wool' }, stitch: 7, firstNeedle: 30 } })).toMatchObject({ settings: { stitch: 7, speed: 150, roller: 400 }, firstNeedle: 30, yarns: { c3: 'Rust wool', c4: 'Fig' } });
    expect(() => readScarfDesign({ ...file, chart: { ...file.chart, palette: [...file.chart.palette, { id: 'x', name: 'X', hex: '#000000' }] } })).toThrow(/two colours/);
    expect(() => readScarfDesign({ ...file, activeIntervalsExclusive: file.activeIntervalsExclusive.map(([, end]: number[]) => [1, end]) })).toThrow(/left edge/);
  });

  it('rejects a machine file whose stitches differ from the design', () => {
    const built = buildShapedScarf(design([3, 4, 5, 5, 4, 3]));
    const mutated = (source: string) => {
      expect(source).not.toBe(built.source);
      const compiled = authoredKnitoutToKCodeWithTrace(source, built.sourceName);
      if (!compiled.ok) throw new Error(compiled.error);
      return { ...built, source, compiled };
    };
    expect(verifyShapedScarf(built).passed).toBe(true);
    // Both changed files still compile; it is the replay that refuses them.
    // An increase whose first split is a plain knit leaves the new rear needle empty.
    const noSplit = mutated(built.source.replace(/^split \+ f(\d+) b\1 4$/m, 'knit + f$1 4'));
    expect(() => verifyShapedScarf(noSplit)).toThrow();
    // One body stitch knitted on the other bed puts the wrong colour on the face.
    const body = built.source.indexOf('; ROW 9 plain');
    const wrongBed = mutated(built.source.slice(0, body) + built.source.slice(body).replace(/^knit \+ f(\d+) 4$/m, 'knit + b$1 4'));
    expect(() => verifyShapedScarf(wrongBed)).toThrow();
  });
});
