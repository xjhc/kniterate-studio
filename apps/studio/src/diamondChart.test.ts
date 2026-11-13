import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { appendProjectEdit, createColorworkProjectV1, materializeColorworkProject } from '@kniterate-studio/project-contract';
import { diamondRangesV1, auditTraceV1, parseKCodeDocument, projectKCodeMachineTrace, KNITERATE_7GG_KCODE_PROFILE_V2 } from '@kniterate-studio/machine-lib/browser';
import { runAuthoredPipeline } from './authoredPipeline';
import { reversibleEdgeStatus } from './reversibleEdges';
import { planProject } from './plan';

function diamond(width = 20, tipStitches = 12, stripe: 'centre' | 'mostly-solid' | 'stripes' = 'centre', needleOffset = 70) {
  const height = (width - tipStitches) * 2 + 3;
  let p = createColorworkProjectV1({ kind: 'knitlab-colorwork-chart', version: 1, title: 'Diamond', width, height, rowNumbering: 'bottom-up', palette: [{ id: 'a', name: 'A', hex: '#DD6600' }, { id: 'b', name: 'B', hex: '#888888' }], cells: Array.from({ length: height }, (_, y) => Array.from({ length: width }, (_, x) => stripe === 'stripes' ? y % 2 : (stripe === 'centre' || y === 0) && x === width / 2 ? 1 : 0)) }, { id: 'diamond', needleOffset });
  p = appendProjectEdit(p, { id: 'shape', source: 'human', edit: { kind: 'set-strategy', strategy: { technique: 'complement', floatLimit: 7, diamond: { tipStitches, rowsPerStep: 2 } } } });
  const edit = reversibleEdgeStatus(materializeColorworkProject(p).state).edit!;
  return edit ? appendProjectEdit(p, { id: 'edges', source: 'human', edit }) : p;
}

describe('reversible diamond through Studio export', () => {
  it('rejects invalid geometry and incompatible backing', async () => {
    expect(() => diamondRangesV1(20, 18, { tipStitches: 12, rowsPerStep: 2 })).toThrow();
    expect(() => diamondRangesV1(21, 21, { tipStitches: 12, rowsPerStep: 2 })).toThrow();
    const p = appendProjectEdit(diamond(), { id: 'bad', source: 'human', edit: { kind: 'set-strategy', strategy: { technique: 'fairisle', floatLimit: 7, diamond: { tipStitches: 12, rowsPerStep: 2 } } } });
    expect((await runAuthoredPipeline(p)).exportReady).toBe(false);
  });

  it.each([[20,12,'centre'],[48,16,'centre'],[20,12,'mostly-solid'],[20,12,'stripes']] as const)('knits inverse faces within moving bounds and retains both beds at width %s', async (width, tip, stripe) => {
    const p = diamond(width, tip, stripe);
    const state = materializeColorworkProject(p).state;
    const result = await runAuthoredPipeline(p);
    expect(result.exportReady, JSON.stringify(result.compiled?.messages)).toBe(true);
    const trace = result.kcode!.trace!;
    const main = trace.passes.filter(p => ['2','3'].includes(p.carrier) && p.actions.some(a => a.kind === 'knit'));
    const rows = state.chart.height;
    const body = Array.from({ length: rows }, (_, r) => [2, 3].map(c => {
      const passes = trace.passes.filter(p => p.carrier === String(c) && p.actions.some(a => a.kind === 'knit') && result.kcode!.passProvenance[p.index]?.sourceRows.includes(r));
      expect(passes, `row ${r}, carrier ${c}: no isolated empty-needle knitting pass`).toHaveLength(1);
      return { ...passes[0]!, actions: passes.flatMap(p => p.actions.filter(a => a.kind === 'knit')), index: passes.at(-1)!.index };
    })).flat();
    const ranges = diamondRangesV1(width, rows, state.strategy.diamond!);
    const offset = result.kcode!.coordinateBridge!.kcodeColumn.start;
    const fullWaste = trace.passes.filter(p => p.carrier === '6' && p.actions.some(a => a.kind === 'knit'))
      .sort((a, b) => b.actions.length - a.actions.length)[0]!;
    const draw = trace.passes.filter(p => p.carrier === '1' && p.actions.some(a => a.kind === 'knit')).at(-1)!;
    for (const pass of [fullWaste, draw]) {
      expect([...new Set(pass.actions.flatMap(a => a.kind === 'knit' ? [a.at.kcodeColumn] : []))].sort((a, b) => a - b))
        .toEqual(Array.from({ length: width }, (_, x) => offset + x));
    }
    for (let r = 0; r < rows; r++) for (let colour = 0; colour < 2; colour++) {
      const pass = body[r * 2 + colour]!;
      expect(pass.carrier).toBe(String(colour + 2));
      expect(pass.rack).toBe(0);
      const { lo, hi } = ranges[r]!;
      const knits = pass.actions.flatMap(a => a.kind === 'knit' ? [a] : []);
      expect(knits.map(a => `${a.at.kcodeColumn}:${a.at.bed}`).sort()).toEqual(Array.from({length: hi-lo+1}, (_, i) => {
        const x = lo + i;
        const value = x === lo || x === hi ? r % 2 : state.chart.cells[rows - 1 - r]![x]!;
        return `${offset+x}:${value === colour ? 'front' : 'rear'}`;
      }).sort());
      if (r > 0 && lo < ranges[r - 1]!.lo) {
        // The borrow empties two rear needles on each side. Each yarn must
        // knit just one, in its ordinary full row, as in sleeves.kc.
        for (const pair of [[lo, lo + 1], [hi - 1, hi]]) {
          const owners = pair.map(x => body.slice(r * 2, r * 2 + 2).find(p => p.actions.some(a => a.kind === 'knit' && a.at.bed === 'rear' && a.at.kcodeColumn === offset + x))!.carrier);
          expect(new Set(owners).size).toBe(2);
        }
      }
      if (r > 0) {
        const prev = body[(r-1)*2+colour]!.actions.filter(a => a.kind === 'knit').at(-1)!;
        const next = knits[0]!;
        if (prev.kind !== 'knit') throw Error('Missing edge');
        expect(next.at.bed).not.toBe(prev.at.bed);
        expect(Math.abs(next.at.kcodeColumn - prev.at.kcodeColumn)).toBeLessThanOrEqual(1);
      }
    }
    const start = main.filter(p => !result.kcode!.passProvenance[p.index]?.sourceRows.length).slice(-3);
    expect(start.map(p => p.actions.filter(a => a.kind === 'knit').length)).toEqual([tip*2,tip,tip]);
    const finish = trace.passes.slice(Math.max(...body.map(p => p.index))+1);
    expect(finish.some(p => p.actions.some(a => a.kind === 'xfer'))).toBe(false);
    const last = ranges.at(-1)!;
    for (const bed of ['front','rear']) for (let x=last.lo; x<=last.hi; x++) expect(finish.flatMap(p => p.carrier === '6' ? p.actions.filter(a => a.kind === 'knit' && a.at.bed === bed && a.at.kcodeColumn === offset+x) : [])).toHaveLength(8);
    expect(trace.passes.some(p => p.actions.some(a => a.kind === 'xfer'))).toBe(true);
    const reference = parseKCodeDocument(readFileSync(new URL('../../../packages/machine-lib/reference/sleeves.kc', import.meta.url), 'utf8'), { profile: KNITERATE_7GG_KCODE_PROFILE_V2, dialect: 'app', strict: true });
    if (!reference.ok) throw Error('Reference did not parse');
    const unitSignatures = (passes: typeof trace.passes) => passes.flatMap(p => p.actions.flatMap(a => a.kind === 'xfer' ? [`${a.source.bed}>${a.target.bed}:${a.target.kcodeColumn-a.source.kcodeColumn}:${p.rack}`] : []));
    const referenceUnits = new Set(unitSignatures(projectKCodeMachineTrace(reference.document, KNITERATE_7GG_KCODE_PROFILE_V2).passes));
    for (const signature of unitSignatures(trace.passes)) expect(referenceUnits.has(signature), signature).toBe(true);

    expect(auditTraceV1(trace).checks.filter(c => c.severity === 'issue' && !c.ok)).toEqual([]);
    expect(result.compiled!.rowProvenance.every(r => r.passIndices.length > 0)).toBe(true);
  });

  it('blocks a same-colour widening pair and offers a visible repair without changing the interior', async () => {
    const p = diamond();
    const state = materializeColorworkProject(p).state;
    const y = state.chart.height - 3; // first widening, knit row 2
    const bounds = diamondRangesV1(state.chart.width, state.chart.height, state.strategy.diamond!)[2]!;
    const column = bounds.lo + 1;
    const damaged = appendProjectEdit(p, { id: 'damage-widening', source: 'human', edit: { kind: 'paint-cells', cells: [{ rowId: state.rowIds[y]!, column, paletteIndex: state.chart.cells[y]![bounds.lo]! }] } });
    expect((await runAuthoredPipeline(damaged)).exportReady).toBe(false);
    const finding = planProject(materializeColorworkProject(damaged).state).findings.find(f => f.rule === 'reversible-open-edges')!;
    const edit = finding.fixes[0]!.edits[0]!;
    expect(edit).toEqual({ kind: 'paint-cells', cells: [{ rowId: state.rowIds[y]!, column, paletteIndex: state.chart.cells[y]![column]! }] });
    const repaired = appendProjectEdit(damaged, { id: 'repair-widening', source: 'human', edit });
    expect(materializeColorworkProject(repaired).state.chart.cells).toEqual(state.chart.cells);
    expect((await runAuthoredPipeline(repaired)).exportReady).toBe(true);
  });

  it.each([1, 6, 205])('keeps feeder parking and transfer clearance within the bed at offset %s', async needleOffset => {
    const result = await runAuthoredPipeline(diamond(48, 16, 'centre', needleOffset));
    expect(result.exportReady, JSON.stringify(result.compiled?.messages)).toBe(true);
    expect(result.kcode!.safety!.diagnostics).toEqual([]);
    expect(auditTraceV1(result.kcode!.trace!).ok).toBe(true);
  });
});
