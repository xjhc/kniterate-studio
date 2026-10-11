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
    const file = readKnitFile(piece.kcode!, raster, result.plan.carriers, 'body')!;
    const trace = piece.kcode!.trace!;

    // Every knit and tuck action in the file is one mark in the picture ('x' is both beds at one needle).
    const actions = trace.passes.reduce((sum, pass) => sum + pass.actions.filter((action) => action.kind === 'knit' || action.kind === 'tuck').length, 0);
    const marks = file.courses.reduce((sum, course) => sum + [...course.stitches].reduce((count, mark) => count + (mark === '.' ? 0 : mark === 'x' ? 2 : 1), 0), 0);
    expect(marks).toBe(actions);
    expect(file.passCount).toBe(trace.passes.length);

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
    const file = readKnitFile(piece.kcode!, result.plan.pieces.find((item) => item.id === 'sleeve')!.raster!, result.plan.carriers, 'sleeve')!;
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
