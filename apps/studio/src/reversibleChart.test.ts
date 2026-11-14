import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { appendProjectEdit, createColorworkProjectV1, materializeColorworkProject } from '@kniterate-studio/project-contract';
import { auditTraceV1, parseKCodeDocument, projectKCodeMachineTrace, KNITERATE_7GG_KCODE_PROFILE_V2 } from '@kniterate-studio/machine-lib/browser';
import { runAuthoredPipeline } from './authoredPipeline';
import { reversibleEdgeStatus } from './reversibleEdges';
import { planProject } from './plan';
import { bodyStandard, wasteConstruction } from './workspace/MachineSetupSection';

function project(width: number, height = 7, closed = true) {
  const chart = { kind: 'knitlab-colorwork-chart', version: 1, title: 'Inverse test', width, height, rowNumbering: 'bottom-up',
    palette: [{ id: 'a', name: 'A', hex: '#112233' }, { id: 'b', name: 'B', hex: '#EEDDCC' }],
    cells: Array.from({ length: height }, (_, y) => Array.from({ length: width }, (_, x) => closed && (x === 0 || x === width - 1) ? y % 2 : y === 0 ? 0 : y === height - 1 ? 1 : (Math.floor(x / 5) + y) % 2)) };
  return appendProjectEdit(createColorworkProjectV1(chart, { id: `inverse-${width}`, needleOffset: 70 }), { id: 'inverse', source: 'human', edit: { kind: 'set-strategy', strategy: { technique: 'complement', floatLimit: 7 } } });
}

describe('reversible charts through the normal Studio export', () => {
  it.each([19, 32, 33, 68])('preserves exact inverse stitches and supports both beds at width %s', async width => {
    const p = project(width);
    const { state } = materializeColorworkProject(p);
    const result = await runAuthoredPipeline(p);
    expect(result.verdict.state, JSON.stringify(result)).toBe('surface');
    const trace = result.kcode!.trace!;
    const main = trace.passes.filter(pass => ['2', '3'].includes(pass.carrier) && pass.actions.some(a => a.kind === 'knit'));
    const body = main.slice(-2 * state.chart.height);
    const rows = [...state.chart.cells].reverse();
    const linkedSides = new Set<number>();
    for (let row = 0; row < rows.length; row++) for (let colour = 0; colour < 2; colour++) {
      const pass = body[row * 2 + colour]!;
      expect(pass.carrier).toBe(String(2 + colour));
      expect(pass.rack).toBe(0);
      const actual = pass.actions.flatMap(a => a.kind === 'knit' ? [`${a.at.kcodeColumn}:${a.at.bed}`] : []).sort();
      const expected = rows[row]!.map((v, x) => `${result.kcode!.coordinateBridge!.kcodeColumn.start + x}:${v === colour ? 'front' : 'rear'}`).sort();
      expect(actual).toEqual(expected);
      if (row > 0) {
        const previous = body[(row - 1) * 2 + colour]!.actions.filter(a => a.kind === 'knit').at(-1)!;
        const next = pass.actions.find(a => a.kind === 'knit')!;
        if (previous.kind !== 'knit' || next.kind !== 'knit') throw new Error('Missing edge knit');
        // The SAME yarn runs directly from the last edge loop on one bed
        // to the first edge loop on the other, at each turnaround.
        expect(next.at.kcodeColumn).toBe(previous.at.kcodeColumn);
        expect(next.at.bed).not.toBe(previous.at.bed);
        linkedSides.add(next.at.kcodeColumn);
      }
    }
    expect([...linkedSides].sort((a, b) => a - b)).toEqual([result.kcode!.coordinateBridge!.kcodeColumn.start, result.kcode!.coordinateBridge!.kcodeColumn.start + width - 1]);
    const start = main.slice(-2 * rows.length - 3, -2 * rows.length);
    expect(start).toHaveLength(3);
    expect(start[0]!.rack).toBe(0.5);
    expect(start[0]!.actions.filter(a => a.kind === 'knit')).toHaveLength(width * 2);
    expect(start[1]!.actions.filter(a => a.kind === 'knit')).toHaveLength(width);
    expect(start[2]!.actions.filter(a => a.kind === 'knit')).toHaveLength(width);
    expect(trace.passes.some(pass => pass.actions.some(a => a.kind === 'xfer'))).toBe(false);
    const bodyEnd = trace.passes.indexOf(body.at(-1)!);
    const finish = trace.passes.slice(bodyEnd + 1);
    for (const bed of ['front', 'rear']) for (let x = 0; x < width; x++) {
      expect(finish.flatMap(pass => pass.carrier === '6' ? pass.actions.filter(a => a.kind === 'knit' && a.at.bed === bed && a.at.kcodeColumn === result.kcode!.coordinateBridge!.kcodeColumn.start + x) : [])).toHaveLength(8);
    }
    expect(finish.filter(pass => pass.actions.some(a => a.kind === 'drop'))).toHaveLength(2);
    expect(auditTraceV1(trace).checks.filter(c => c.severity === 'issue' && !c.ok)).toEqual([]);
  });

  it('matches jacquard.kc cast-on bed selections and racking, retaining the trial settings', async () => {
    const result = await runAuthoredPipeline(project(67));
    const main = result.kcode!.trace!.passes.filter(pass => ['2', '3'].includes(pass.carrier) && pass.actions.some(a => a.kind === 'knit'));
    const start = main.slice(-17, -14);
    const parsed = parseKCodeDocument(readFileSync(new URL('../../../packages/machine-lib/reference/jacquard.kc', import.meta.url), 'utf8'), { profile: KNITERATE_7GG_KCODE_PROFILE_V2, dialect: 'app', strict: true });
    if (!parsed.ok) throw new Error('Reference did not parse');
    const reference = projectKCodeMachineTrace(parsed.document, KNITERATE_7GG_KCODE_PROFILE_V2).passes.slice(101, 104);
    const selections = (pass: typeof start[number]) => {
      const knits = pass.actions.flatMap(a => a.kind === 'knit' ? [a] : []);
      const lo = Math.min(...knits.map(a => a.at.kcodeColumn));
      return knits.map(a => `${a.at.kcodeColumn - lo}:${a.at.bed}`).sort();
    };
    for (let i = 0; i < 3; i++) {
      expect(selections(start[i]!)).toEqual(selections(reference[i]!));
      expect(start[i]!.rack).toEqual(reference[i]!.rack);
    }
  });

  it('refuses one used colour and a single-bed chain finish', async () => {
    const p = project(32);
    const finish = appendProjectEdit(p, { id: 'top', source: 'human', edit: { kind: 'set-machine-setup', setup: { top: 'bind-off' } } });
    expect((await runAuthoredPipeline(finish)).verdict.state).toBe('blocked');
    const one = project(32, 1, false);
    expect((await runAuthoredPipeline(one)).verdict.state).toBe('blocked');
  });

  it('shows reversible settings and explains safe removal', () => {
    const { state } = materializeColorworkProject(project(32));
    expect(wasteConstruction(state)).toBe('complement');
    expect(bodyStandard(state)).toEqual({ stitch: 7, speed: 200, roller: 450 });
    expect(planProject(state).finishing.join(' ')).toContain('BOTH faces');
  });

  it('blocks open edges and repairs only the visible outer columns with an undoable edit', async () => {
    const p = project(32, 7, false);
    expect((await runAuthoredPipeline(p)).exportReady).toBe(false);
    const { state } = materializeColorworkProject(p);
    const finding = planProject(state).findings.find(f => f.rule === 'reversible-open-edges')!;
    expect(finding.fixes).toHaveLength(1);
    const edit = finding.fixes[0]!.edits[0]!;
    const repaired = appendProjectEdit(p, { id: 'closed-edges', source: 'human', edit });
    const after = materializeColorworkProject(repaired).state;
    expect(reversibleEdgeStatus(after).closed).toBe(true);
    expect(after.chart.cells.map(row => row.slice(1, -1))).toEqual(state.chart.cells.map(row => row.slice(1, -1)));
    expect((await runAuthoredPipeline(repaired)).exportReady).toBe(true);
    const damaged = appendProjectEdit(repaired, { id: 'erase-edge', source: 'human', edit: { kind: 'paint-cells', cells: [{ rowId: after.rowIds[1]!, column: 0, paletteIndex: after.chart.cells[0]![0]! }] } });
    expect((await runAuthoredPipeline(damaged)).exportReady).toBe(false);
  });
});
