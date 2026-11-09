import { describe, expect, it } from 'vitest';
import { appendProjectEdit, createColorworkProjectV1, materializeColorworkProject } from '@kniterate-studio/project-contract';
import { runAuthoredPipeline } from './authoredPipeline';

const chart = {
  kind: 'knitlab-colorwork-chart', version: 1, title: 'Pipeline fixture', width: 4, height: 3, rowNumbering: 'bottom-up',
  palette: [
    { id: 'natural', name: 'Natural', hex: '#F4F0E6' },
    { id: 'red', name: 'Red', hex: '#C2413A' },
  ],
  cells: [[0, 1, 0, 1], [1, 0, 1, 0], [0, 1, 1, 0]],
};

describe('headless authored pipeline', () => {
  it('reaches the same export gate as Studio for a clean project', { timeout: 20_000 }, async () => {
    const result = await runAuthoredPipeline(createColorworkProjectV1(chart, { id: 'pipeline-clean', needleOffset: 40 }));
    expect(result.verdict.state).toBe('surface');
    expect(result.exportReady).toBe(true);
    expect(result.kcode?.ok).toBe(true);
    expect(result.kcode?.kcText).toContain('FRNT:');
  });

  it('refuses export when the compiler blocks the project', { timeout: 20_000 }, async () => {
    let project = createColorworkProjectV1(chart, { id: 'pipeline-blocked' });
    project = appendProjectEdit(project, { id: 'tuck', source: 'assistant', edit: { kind: 'add-override', override: { id: 'tuck-1', kind: 'stitch', anchor: { rowId: project.base.rowIds[0]!, needleIndex: 1 }, operation: 'tuck' } } });
    const result = await runAuthoredPipeline(project);
    expect(result.verdict.state).toBe('blocked');
    expect(result.exportReady).toBe(false);
    expect(result.kcode).toBeNull();
  });
});

describe('a fairisle motif that stops short of the edges', () => {
  // A centred heart: the red's last row ends in the middle. Its yarn used to
  // park at the edge across needles the waste on top then knitted under,
  // and machine safety (attached-yarn) refused every such chart.
  const W = 60;
  const H = 40;
  const heart = (x: number, y: number) => { const dx = (x - 30) / 12; const dy = (20 - y) / 12; return (dx * dx + dy * dy - 1) ** 3 - dx * dx * dy ** 3 < 0 ? 1 : 0; };
  const motif = {
    kind: 'knitlab-colorwork-chart', version: 1, title: 'Heart', width: W, height: H, rowNumbering: 'bottom-up',
    palette: [{ id: 'natural', name: 'Natural', hex: '#F4F0E6' }, { id: 'red', name: 'Red', hex: '#C2413A' }],
    cells: Array.from({ length: H }, (_, y) => Array.from({ length: W }, (_, x) => heart(x, y))),
  };

  it('knits: the red ends its yarn at the edge with one tuck, and nothing else changes', { timeout: 60_000 }, async () => {
    const project = createColorworkProjectV1(motif, { id: 'heart' });
    const result = await runAuthoredPipeline(project);
    expect(result.verdict.state).toBe('surface');
    expect(result.exportReady).toBe(true);
    const knitout = result.compiled!.knitoutText!;
    const tucks = knitout.split('\n').filter((line) => line.startsWith('tuck '));
    expect(tucks).toHaveLength(1);
    // In the red, on an edge needle of the chart (the needles the two pattern yarns knit).
    const { yarnAssignments } = materializeColorworkProject(project).state.machine;
    const red = yarnAssignments.find((item) => item.paletteId === 'red')!.carrier;
    const pattern = yarnAssignments.map((item) => item.carrier).join('');
    const chartNeedles = [...knitout.matchAll(new RegExp(`^knit [+-] f(\\d+) [${pattern}]$`, 'gm'))].map((match) => Number(match[1]));
    const [, , needle, carrier] = tucks[0]!.split(' ');
    expect(carrier).toBe(red);
    expect([`f${Math.min(...chartNeedles)}`, `f${Math.max(...chartNeedles)}`]).toContain(needle);
    expect(Math.max(...chartNeedles) - Math.min(...chartNeedles) + 1).toBe(W);
  });
});

describe('Customist fairisle partial reproduction (physical trial candidate)', () => {
  it('is Kniterate’s fairisle with Studio’s start: a yarn catch for each yarn and a gentle first row', { timeout: 60_000 }, async () => {
    const { readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    const root = resolve(__dirname, '../../..');
    const chart = JSON.parse(readFileSync(resolve(root, 'fixtures/colorwork-chart-v1/customist-fairisle-reference.json'), 'utf8'));
    let project = createColorworkProjectV1(chart, { id: 'customist-fairisle-reproduction' });
    project = appendProjectEdit(project, { id: 'ground', source: 'system', edit: { kind: 'set-yarn-assignment', assignment: { paletteId: 'ground', carrier: '4', yarnName: 'Ground' } } });
    project = appendProjectEdit(project, { id: 'motif', source: 'system', edit: { kind: 'set-yarn-assignment', assignment: { paletteId: 'motif', carrier: '3', yarnName: 'Motif' } } });
    const result = await runAuthoredPipeline(project);
    expect(result.exportReady).toBe(true);
    const passes = result.kcode!.trace!.passes;
    // The reference's 286 passes plus the catch: each yarn knits out and back over the piece's leftmost 20 needles first.
    // Two of the reference's empty waste-yarn moves drop out once the waste knits the rear-left needle (no held loop).
    expect(passes).toHaveLength(286 + 8 - 2);
    const knits = (pass: (typeof passes)[number]) => pass.actions.filter((action) => action.kind === 'knit');
    const catches = passes.filter((pass) => knits(pass).length === 20);
    expect(catches.map((pass) => pass.carrier)).toEqual(['6', '6', '4', '4', '3', '3', '1', '1']);
    expect(catches.every((pass) => pass.roller > 0)).toBe(true);
    // The first body row after the transfers pulls gently, then the body's roller returns.
    let lastTransfer = -1;
    passes.forEach((pass, index) => { if (index < 140 && pass.actions.some((action) => action.kind === 'xfer')) lastTransfer = index; });
    const firstRow = passes.findIndex((pass, index) => index > lastTransfer && knits(pass).length > 0);
    expect(passes[firstRow]!.roller).toBe(100);
    expect(passes.slice(firstRow + 1).find((pass) => knits(pass).length > 0)!.roller).toBe(450);
    // Without Studio's start the recipe path keeps the reference's six differing passes (fairisle-parity.test.ts).
  });

  it('records the canonical strict difference in the pure trial manifest without claiming exact reproduction', { timeout: 60_000 }, async () => {
    const { compileCurrentV1KnitTrial } = await import('../../../scripts/build-v1-knit-trial');
    const trial = compileCurrentV1KnitTrial();
    expect(trial.manifest.customistParity).toMatchObject({
      reproduction: 'partial', comparedPasses: 286,
      machineTraceComparison: { comparison: 'strict-machine-trace-v1', status: 'compared', identical: false, generatedPassCount: 292, referencePassCount: 286, detailsTruncated: true },
    });
    expect(trial.manifest.customistParity.note).toContain('yarn catch');
    expect(trial.manifest.customistParity.machineTraceComparison.deltas).toHaveLength(50);
    expect(trial.operatorChecklist).toContain('partial reproduction');
    expect(trial.operatorChecklist).toContain('yarn catch');
    expect(trial.operatorChecklist).toContain(`${trial.manifest.customistParity.machineTraceComparison.deltaCount} strict machine-trace field differences`);
  });
});
