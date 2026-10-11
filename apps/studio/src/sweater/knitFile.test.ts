import { describe, expect, it } from 'vitest';
import { createSweaterProject, type SweaterIntent } from './sweater';
import { runSweaterPipeline } from './sweaterPipeline';
import { readKnitFile } from './knitFile';
import { describePass } from './KnitFileView';

const intent = (overrides: Partial<SweaterIntent> = {}): SweaterIntent => ({
  title: 'File', silhouette: 'set-in', neckline: 'crew', size: 'M', fit: 'classic', textureId: 'seed', yarn: { name: 'Oatmeal', hex: '#D9CBB0' }, ...overrides,
});

describe('a piece machine file read back', () => {
  it('shows every stitch the .kc knits exactly once, in sections that cover the whole file in order', { timeout: 120_000 }, async () => {
    const result = await runSweaterPipeline(createSweaterProject(intent(), { id: 'file', source: 'human', group: 'create' }));
    const piece = result.pieces.find((item) => item.id === 'front')!;
    const raster = result.plan.pieces.find((item) => item.id === 'front')!.raster!;
    const file = readKnitFile(piece.kcode!, { zoneOfRow: (row) => raster.rows[row]!.zone, carriers: result.plan.carriers, kind: 'body' })!;
    const trace = piece.kcode!.trace!;

    // Each design row is one course: every front-bed stitch of its passes shows there as knitted,
    // and every mark on it comes from a stitch of those passes.
    expect(file.passCount).toBe(trace.passes.length);
    const offset = piece.kcode!.coordinateBridge!.offsets.compilerProjectToTraceCoordinate;
    for (const course of file.courses.filter((item) => item.row !== null)) {
      const made = new Map<number, Set<string>>();
      for (const index of file.passes.flatMap((pass, k) => (pass.course === file.courses.indexOf(course) ? [k] : []))) {
        for (const action of trace.passes[index]!.actions) {
          if (action.kind !== 'knit' && action.kind !== 'tuck') continue;
          const at = action.at.traceCoordinate - offset - file.needles.lo;
          const mark = action.kind === 'tuck' ? 't' : action.at.bed === 'front' ? 'k' : 'p';
          made.set(at, (made.get(at) ?? new Set()).add(mark));
          if (action.at.bed === 'front') expect(course.stitches[at]).toBe(mark);
        }
      }
      [...course.stitches].forEach((mark, at) => { if (mark !== '.') expect(made.get(at)?.has(mark)).toBe(true); });
    }
    // Every course outside the design rows is made of the file's own stitches too.
    expect(file.courses.filter((course) => course.row === null).every((course) => course.passes.length > 0 || /[^.]/.test(course.stitches))).toBe(true);

    // Sections run in file order, cover every pass, and read as the machine knits it.
    expect(file.sections[0]!.passes.from).toBe(0);
    expect(file.sections.at(-1)!.passes.to).toBe(file.passCount - 1);
    file.sections.slice(1).forEach((section, index) => expect(section.passes.from).toBe(file.sections[index]!.passes.to + 1));
    expect(file.sections.map((section) => section.kind)).toEqual(['waste', 'draw', 'waste', 'draw', 'cast-on', 'rib', 'body', 'shoulders', 'top', 'carriers-out']);
    expect(file.sections[0]!.joins).toEqual(expect.arrayContaining(['3', '4']));
    expect(file.sections.find((section) => section.kind === 'rib')!.label).toBe('Hem rib');

    // Every design row's knitting is in the picture.
    expect(new Set(file.passes.flatMap((pass) => (pass.row !== null && pass.course !== null ? [pass.row] : []))).size).toBe(raster.rows.length);

    // After the split the right shoulder is all C4 and the left all C3.
    const centre = raster.centre;
    for (const course of file.courses.filter((item) => file.sections[item.section]!.kind === 'shoulders')) {
      [...course.carriers].forEach((carrier, offset) => {
        if (carrier === '.') return;
        expect(carrier).toBe(file.needles.lo + offset < centre ? '3' : '4');
      });
    }

    // Each pass's line span in the .kc ends with that pass's footer.
    const lines = piece.kcode!.kcText.split('\n');
    for (const index of [0, 200, 1500, file.passCount - 1]) {
      const pass = file.passes[index]!;
      expect(lines[pass.lines!.end - 1]).toBe(`${pass.direction} ${pass.operation} ${pass.carrier} ${trace.passes[index]!.speedRaw} ${trace.passes[index]!.rollerRaw}`);
      expect(lines[pass.lines!.start - 1]).toMatch(/^FRNT:/);
    }
  });

  it('says what each pass does in words', { timeout: 120_000 }, async () => {
    const result = await runSweaterPipeline(createSweaterProject(intent({ textureId: 'stockinette' }), { id: 'file', source: 'human', group: 'create' }));
    const piece = result.pieces.find((item) => item.id === 'sleeve')!;
    const raster = result.plan.pieces.find((item) => item.id === 'sleeve')!.raster!;
    const file = readKnitFile(piece.kcode!, { zoneOfRow: (row) => raster.rows[row]!.zone, carriers: result.plan.carriers, kind: 'sleeve' })!;
    expect(file.sections.find((section) => section.kind === 'rib')!.label).toBe('Cuff rib');
    expect(file.sections.some((section) => section.kind === 'shoulders')).toBe(false);
    const knit = file.passes.findIndex((pass) => pass.kind === 'knit' && pass.carrier === '3' && pass.row !== null);
    expect(describePass(file, knit, result.plan.carriers)).toMatch(/^The carriage goes (left|right) with C3 \(your yarn\) and knits \d+ stitches on the front bed.*: needles \d+–\d+\.$/);
    const transfer = file.passes.findIndex((pass) => pass.kind === 'transfer');
    expect(describePass(file, transfer, result.plan.carriers)).toMatch(/^No yarn\. The carriage goes (left|right) and moves \d+ stitch(es)? from the (front|back) bed to the (back|front)/);
    const waste = file.passes.findIndex((pass) => pass.kind === 'knit' && pass.carrier === '6');
    expect(describePass(file, waste, result.plan.carriers)).toMatch(/with C6 \(waste yarn\)/);
  });
});
