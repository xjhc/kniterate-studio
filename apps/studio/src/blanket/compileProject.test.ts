import { describe, expect, it } from 'vitest';
import { KCODE_RESOURCE_LIMITS_V1, KNITOUT_RESOURCE_LIMITS_V1 } from '@kniterate-studio/machine-lib/browser';
import { browserAuthoredKnitoutToKCode } from '@kniterate-studio/machine-lib/browser-converter';
import {
  AUTHORED_CAPACITY_LIMITS_V1,
  appendProjectEdit,
  createColorworkProjectV1,
} from '@kniterate-studio/project-contract';
import { compileColorworkProject } from './compileProject';
import { compileKCodeArtifact } from '../kcode/compileKCodeArtifact';
import { openMachineDocument } from '../engine';

const chart = {
  kind: 'knitlab-colorwork-chart', version: 1, title: 'Compile fixture', width: 4, height: 3, rowNumbering: 'bottom-up',
  palette: [
    { id: 'natural', name: 'Natural', hex: '#F4F0E6' },
    { id: 'red', name: 'Red', hex: '#C2413A' },
  ],
  cells: [[0, 1, 0, 1], [1, 0, 1, 0], [0, 1, 1, 0]],
};

function fourColorChart(width: number, height: number, title: string) {
  return {
    kind: 'knitlab-colorwork-chart', version: 1, title, width, height,
    rowNumbering: 'bottom-up',
    palette: [
      { id: 'natural', name: 'Natural', hex: '#F1EDE3' },
      { id: 'red', name: 'Red', hex: '#B4423A' },
      { id: 'gold', name: 'Gold', hex: '#C99A35' },
      { id: 'navy', name: 'Navy', hex: '#29445F' },
    ],
    cells: Array.from({ length: height }, (_, row) =>
      Array.from({ length: width }, (_, column) =>
        (Math.floor(column / 8) + Math.floor(row / 6) + (column % 5 === 0 ? 1 : 0)) % 4)),
  };
}

describe('blanket project compiler', () => {
  it('pins the Studio authored capacity contract to the machine-lib authored profiles', () => {
    expect(AUTHORED_CAPACITY_LIMITS_V1).toMatchObject({
      knitoutRecords: KNITOUT_RESOURCE_LIMITS_V1['authored-v1'].records,
      loweredPasses: KNITOUT_RESOURCE_LIMITS_V1['authored-v1'].loweredPasses,
      selectedCells: KNITOUT_RESOURCE_LIMITS_V1['authored-v1'].loweredSelections,
      kcodeRecords: KNITOUT_RESOURCE_LIMITS_V1['authored-v1'].kcodeRecords,
    });
    expect(AUTHORED_CAPACITY_LIMITS_V1.kcodeRecords)
      .toBe(KCODE_RESOURCE_LIMITS_V1['authored-v1'].records);
    expect(AUTHORED_CAPACITY_LIMITS_V1.loweredPasses)
      .toBe(KCODE_RESOURCE_LIMITS_V1['authored-v1'].passRecords);
    expect(KNITOUT_RESOURCE_LIMITS_V1['foreign-v1']).toMatchObject({
      records: 250_000,
      loweredPasses: 4_096,
      loweredSelections: 200_000,
      kcodeRecords: 50_000,
    });
  });

  it('derives a deterministic surface-proven artifact with reserved frame carriers', () => {
    const project = createColorworkProjectV1(chart, { id: 'compile-fixture', needleOffset: 40 });
    const first = compileColorworkProject(project);
    const second = compileColorworkProject(project);
    expect(first.ok).toBe(true);
    expect(first.compileVerdict).toBe('surface');
    expect(first.inputHash).toBe(second.inputHash);
    expect(first.knitoutText).toBe(second.knitoutText);
    expect(first.stats.passCount).toBeGreaterThan(0);
    expect(first.knitoutText).toContain(';;Carriers: 1 2 3 4 5 6');
    expect(first.rowProvenance.map((row) => row.displayRow)).toEqual([3, 2, 1]);
    expect(first.rowProvenance.every((row) => row.passIndices.length > 0)).toBe(true);
    expect(first.passes.some((pass) => pass.sourceRows?.includes(0))).toBe(true);
    expect(first.knitoutText).not.toContain('sourceRows');
    expect(first.backFace?.cells.flat().some((cell) => cell.kind === 'float')).toBe(true);
  });

  it('blocks before compile when a used color has no assignment', () => {
    let project = createColorworkProjectV1(chart, { id: 'missing-yarn' });
    project = appendProjectEdit(project, { id: 'remove-red', source: 'human', edit: { kind: 'remove-yarn-assignment', paletteId: 'red' } });
    const artifact = compileColorworkProject(project);
    expect(artifact.ok).toBe(false);
    expect(artifact.messages).toContainEqual(expect.objectContaining({ rule: 'project-yarn-assignment-required', severity: 'error' }));
    expect(artifact.knitoutText).toBeNull();
  });

  it('refuses active overrides instead of compiling output that omits them', () => {
    let project = createColorworkProjectV1(chart, { id: 'active-overrides' });
    const rowId = project.base.rowIds[0]!;
    project = appendProjectEdit(project, { id: 'tuck', source: 'assistant', edit: { kind: 'add-override', override: { id: 'tuck-1', kind: 'stitch', anchor: { rowId, needleIndex: 1 }, operation: 'tuck' } } });
    project = appendProjectEdit(project, { id: 'speed', source: 'assistant', edit: { kind: 'add-override', override: { id: 'speed-1', kind: 'pass', anchor: { rowId, purpose: 'body', ordinal: 0 }, setting: { kind: 'speed', value: 220 } } } });
    const artifact = compileColorworkProject(project);
    expect(artifact.ok).toBe(false);
    expect(artifact.compileVerdict).toBe('blocked');
    expect(artifact.knitoutText).toBeNull();
    expect(artifact.messages.filter((message) => message.rule === 'project-override-unsupported')).toHaveLength(2);
  });

  it('blocks backings without a Customist-matched reference program', () => {
    for (const technique of ['ladder-back', 'lined', 'complement'] as const) {
      let project = createColorworkProjectV1(chart, { id: `unmatched-${technique}` });
      project = appendProjectEdit(project, { id: 'strategy', source: 'human', edit: { kind: 'set-strategy', strategy: { technique, floatLimit: 5 } } });
      const artifact = compileColorworkProject(project);
      expect(artifact.ok, technique).toBe(false);
      expect(artifact.messages).toContainEqual(expect.objectContaining({ rule: 'project-technique-unmatched' }));
    }
    // A single-color chart has no backing and knits jersey inside the fairisle frame.
    const oneColor = { ...chart, palette: chart.palette.slice(0, 1), cells: chart.cells.map((row) => row.map(() => 0)) };
    const single = compileColorworkProject(createColorworkProjectV1(oneColor, { id: 'single-color' }));
    expect(single.ok).toBe(true);
    expect(single.frame).toMatchObject({ preset: 'customist-studio-fairisle-7gg' });
  });

  it('compiles through the Customist-matched frame for each authored backing', () => {
    for (const [technique, preset, reference] of [
      ['fairisle', 'customist-studio-fairisle-7gg', 'reference/fairisle.kc'],
      ['birdseye', 'customist-studio-birdseye-7gg', 'reference/dbj.kc'],
    ] as const) {
      let project = createColorworkProjectV1(fourColorChart(24, 12, `Matched ${technique}`), { id: `matched-${technique}`, needleOffset: 40 });
      project = appendProjectEdit(project, { id: 'strategy', source: 'human', edit: { kind: 'set-strategy', strategy: { technique, floatLimit: 5 } } });
      // Project frame edits no longer change the program.
      const edited = appendProjectEdit(project, { id: 'frame', source: 'human', edit: { kind: 'set-frame', frame: { wasteRows: 200, drawThread: false, bindOff: 'waste-and-drop' } } });
      const artifact = compileColorworkProject(project);
      expect(artifact.ok, technique).toBe(true);
      expect(artifact.frame).toMatchObject({ preset, reference, wasteCarrier: '6' });
      expect(compileColorworkProject(edited).knitoutText).toBe(artifact.knitoutText);
    }
  });

  it('refuses a program that would knit a carrier with no assigned yarn', () => {
    // The matched birdseye program is laid out for four colors on C2-C5; with
    // two colors it would bring in C4/C5 with no yarn loaded.
    let project = createColorworkProjectV1(chart, { id: 'birdseye-two-colors', needleOffset: 40 });
    project = appendProjectEdit(project, { id: 'strategy', source: 'human', edit: { kind: 'set-strategy', strategy: { technique: 'birdseye', floatLimit: 5 } } });
    const artifact = compileColorworkProject(project);
    expect(artifact.ok).toBe(false);
    expect(artifact.knitoutText).toBeNull();
    expect(artifact.messages).toContainEqual(expect.objectContaining({ rule: 'project-unassigned-carrier', severity: 'error' }));
  });

  it('keeps row provenance and declares only the preset frame yarn for four-color birdseye', () => {
    const project = createColorworkProjectV1(fourColorChart(24, 12, 'Four-color provenance'), { id: 'birdseye-provenance', needleOffset: 40 });
    const artifact = compileColorworkProject(project);
    expect(artifact.technique).toBe('birdseye');
    expect(artifact.ok).toBe(true);
    expect(artifact.frame?.frameCarriers).toEqual(['1']);
    expect(artifact.rowProvenance.every((row) => row.passIndices.length > 0)).toBe(true);
  });

  it('compiles one-color-per-row stripes under the Customist fairisle frame without re-introducing carriers', () => {
    const stripes = { ...chart, width: 20, height: 12, cells: Array.from({ length: 12 }, (_, row) => Array.from({ length: 20 }, () => Math.floor(row / 4) % 2)) };
    let project = createColorworkProjectV1(stripes, { id: 'stripes-fairisle', needleOffset: 40 });
    project = appendProjectEdit(project, { id: 'strategy', source: 'human', edit: { kind: 'set-strategy', strategy: { technique: 'fairisle', floatLimit: 5 } } });
    const artifact = compileColorworkProject(project);
    expect(artifact.ok).toBe(true);
    const introduced = [...artifact.knitoutText!.matchAll(/^in ([1-6])$/gm)].map((match) => match[1]);
    expect(introduced).toHaveLength(new Set(introduced).size);
  });

  it('joins op diagnostics to chart rows through typed engine provenance', () => {
    let project = createColorworkProjectV1(chart, { id: 'typed-provenance' });
    project = appendProjectEdit(project, {
      id: 'strict-floats',
      source: 'human',
      edit: { kind: 'set-strategy', strategy: { technique: 'fairisle', floatLimit: 1 } },
    });
    const artifact = compileColorworkProject(project);
    const floatDiagnostic = artifact.diagnostics.find((diagnostic) => diagnostic.rule === 'bed-state-long-float');
    expect(floatDiagnostic).toBeDefined();
    expect(floatDiagnostic?.opIndex).not.toBeNull();
    expect(floatDiagnostic?.rowId).not.toBeNull();
    expect(floatDiagnostic?.passIndices.length).toBeGreaterThan(0);
  });

  it('keeps predicted and emitted pass positions as distinct provenance spaces', async () => {
    const width = 24;
    const height = 10;
    const blocks = {
      kind: 'knitlab-colorwork-chart',
      version: 1,
      title: 'Predicted versus emitted provenance',
      width,
      height,
      rowNumbering: 'bottom-up',
      palette: [
        { id: 'ground', name: 'Ground', hex: '#F4F0E6' },
        { id: 'ink', name: 'Ink', hex: '#24211F' },
      ],
      cells: Array.from({ length: height }, () =>
        Array.from({ length: width }, (_, column) => Math.floor(column / 3) % 2)),
    };
    let project = createColorworkProjectV1(blocks, { id: 'pass-space-regression' });
    project = appendProjectEdit(project, {
      id: 'strict-floats',
      source: 'human',
      edit: { kind: 'set-strategy', strategy: { technique: 'fairisle', floatLimit: 1 } },
    });

    const compiled = compileColorworkProject(project);
    expect(compiled.ok).toBe(true);
    if (compiled.capacity.status === 'blocked') throw new Error(compiled.capacity.message);
    expect(compiled.passes).toHaveLength(158);
    const emitted = await compileKCodeArtifact({
      kind: 'convert-kcode',
      requestId: 1,
      inputHash: compiled.inputHash!,
      capacity: compiled.capacity,
      knitoutText: compiled.knitoutText!,
      programOpSourceRows: compiled.programOpSourceRows,
      rowProvenance: compiled.rowProvenance.map(({ rowId, chartRow, machineRow }) => ({ rowId, chartRow, machineRow })),
    });

    expect(emitted.ok).toBe(true);
    expect(emitted.passCount).toBe(158);
    expect(compiled.rowProvenance[0]).toMatchObject({ rowId: 'row_0001', passIndices: [132, 133] });
    expect(emitted.rowPasses[0]).toEqual({ rowId: 'row_0001', passIndices: [130, 131] });
    expect(compiled.diagnostics.find((item) => item.rowId === 'row_0001')).toMatchObject({
      rule: 'bed-state-long-float',
      passIndices: [132, 133],
    });
  });

  it('admits the canonical 200x300 four-color Birdseye project under the authored envelope', { timeout: 30_000 }, () => {
    const project = createColorworkProjectV1(
      fourColorChart(200, 300, 'Canonical authored blanket'),
      { id: 'canonical-authored-blanket' },
    );
    const compiled = compileColorworkProject(project);

    expect(compiled.ok).toBe(true);
    expect(compiled.capacity).toMatchObject({
      profile: 'authored-v1',
      status: 'supported',
      evidence: null,
      project: { width: 200, height: 300, paletteColors: 4, activeColors: 4, technique: 'birdseye', birdseyeMode: 'minimal' },
      observed: { knitoutRecords: 266_061 },
    });
    expect(compiled.capacity.estimate.knitoutRecords).toBeGreaterThanOrEqual(compiled.capacity.observed.knitoutRecords ?? Infinity);
    expect(compiled.capacity.estimate.kcodeRecords).toBeLessThanOrEqual(AUTHORED_CAPACITY_LIMITS_V1.kcodeRecords);
    expect(compiled.stats).toMatchObject({ designRows: 300, needles: 200, passCount: 1_650, opCount: 266_049 });
  });

  it('refuses a structurally valid oversized Birdseye project before compiler allocation', () => {
    const project = createColorworkProjectV1(
      fourColorChart(252, 300, 'Oversized authored blanket'),
      { id: 'oversized-authored-blanket' },
    );
    const compiled = compileColorworkProject(project);

    expect(compiled).toMatchObject({
      ok: false,
      compileVerdict: 'blocked',
      knitoutText: null,
      capacity: {
        status: 'blocked',
        evidence: 'conservative-estimate',
        rule: 'project-authored-capacity-v1',
        metric: 'knitout-records',
        limit: AUTHORED_CAPACITY_LIMITS_V1.knitoutRecords,
      },
      stats: { designRows: 300, needles: 252, passCount: 0, opCount: 0 },
    });
  });

  it('admits a full-bed chart by current active colors rather than unused palette entries', { timeout: 20_000 }, () => {
    const source = fourColorChart(252, 300, 'Two active colors, four declared');
    const twoUsed = { ...source, cells: source.cells.map((row) => row.map((cell) => cell % 2)) };
    let project = createColorworkProjectV1(twoUsed, { id: 'two-active-full-bed' });
    project = appendProjectEdit(project, { id: 'fairisle', source: 'human', edit: { kind: 'set-strategy', strategy: { technique: 'fairisle', floatLimit: 5 } } });
    const compiled = compileColorworkProject(project);
    expect(compiled.ok).toBe(true);
    expect(compiled.capacity).toMatchObject({
      status: 'supported',
      project: { paletteColors: 4, activeColors: 2 },
      observed: { knitoutRecords: 182_082 },
    });

    project = appendProjectEdit(project, {
      id: 'activate-third-color',
      source: 'human',
      edit: {
        kind: 'paint-cells',
        cells: [{ rowId: project.base.rowIds[0]!, column: 0, paletteIndex: 2 }],
      },
    });
    expect(compileColorworkProject(project).capacity.project.activeColors).toBe(3);
  });

  it('rejects a forged typed project with amplified cell rows at the compiler seam', () => {
    const forged = createColorworkProjectV1(chart, { id: 'forged-compiler-input' });
    forged.base.chart.height = 1;
    forged.base.chart.cells = Array.from({ length: 50_000 }, () => [0]);
    const compiled = compileColorworkProject(forged);
    expect(compiled).toMatchObject({
      ok: false,
      compileVerdict: 'blocked',
      capacity: { status: 'blocked', evidence: 'exact-observation', metric: 'chart-height', required: 50_000, limit: 300 },
      stats: { passCount: 0, opCount: 0 },
    });
  });

  it('keeps the conservative Knitout estimate above exact output across authored strategies', { timeout: 20_000 }, () => {
    const cases = [
      { technique: 'fairisle', birdseyeMode: undefined },
      { technique: 'birdseye', birdseyeMode: undefined },
    ] as const;
    for (const item of cases) {
      const sourceChart = fourColorChart(80, 60, `Estimate ${item.technique} ${item.birdseyeMode ?? ''}`);
      const strategyChart = sourceChart;
      let project = createColorworkProjectV1(
        strategyChart,
        { id: `estimate-${item.technique}-${item.birdseyeMode ?? 'default'}` },
      );
      project = appendProjectEdit(project, {
        id: 'strategy',
        source: 'system',
        edit: {
          kind: 'set-strategy',
          strategy: {
            technique: item.technique,
            ...(item.birdseyeMode === undefined ? {} : { birdseyeMode: item.birdseyeMode }),
            floatLimit: 5,
          },
        },
      });
      const compiled = compileColorworkProject(project);
      expect(compiled.ok, item.technique).toBe(true);
      expect(compiled.capacity.estimate.knitoutRecords, item.technique)
        .toBeGreaterThanOrEqual(compiled.capacity.observed.knitoutRecords ?? Infinity);
    }
  });

  it('keeps the width-aware pass estimate above exact lowering for short full-bed charts', { timeout: 20_000 }, () => {
    for (const [height, exactPasses] of [[1, 154], [10, 198]] as const) {
      let project = createColorworkProjectV1(
        fourColorChart(252, height, `Full-bed ${height}`),
        { id: `full-bed-${height}` },
      );
      const compiled = compileColorworkProject(project);
      expect(compiled.ok).toBe(true);
      const converted = browserAuthoredKnitoutToKCode(compiled.knitoutText!, 'short-full-bed.k');
      expect(converted.ok).toBe(true);
      expect(converted.scheduledPasses).toHaveLength(exactPasses);
      expect(compiled.capacity.estimate.loweredPasses).toBeGreaterThanOrEqual(exactPasses);
    }
  });

  it('reopens the canonical authored export through the normal import path', { timeout: 30_000 }, async () => {
    let project = createColorworkProjectV1(
      fourColorChart(200, 300, 'Large authored self-reopen'),
      { id: 'large-authored-self-reopen' },
    );
    const compiled = compileColorworkProject(project);
    expect(compiled.ok).toBe(true);
    if (compiled.capacity.status === 'blocked') throw new Error(compiled.capacity.message);
    const emitted = await compileKCodeArtifact({
      kind: 'convert-kcode',
      requestId: 1,
      inputHash: compiled.inputHash!,
      capacity: compiled.capacity,
      knitoutText: compiled.knitoutText!,
      programOpSourceRows: compiled.programOpSourceRows,
      rowProvenance: compiled.rowProvenance,
    });
    expect(emitted.capacity.observed.kcodeRecords).toBe(15_155);
    const reopened = openMachineDocument('large-authored-self-reopen.kc', emitted.kcText, {
      dialect: 'knitout-vendor',
    });
    expect(reopened.kcode?.document?.metadata).toMatchObject({
      resourceProfile: 'foreign-v1',
      parseStatus: 'accepted',
      recordMaterialization: 'complete',
    });
    expect(reopened.verdict).toMatchObject({ state: 'surface', label: 'Surface-proven (imported)' });
    expect(emitted.validation).toMatchObject({ profileConformance: 'conformant' });
    expect(reopened.kcode?.validation).toEqual(emitted.validation);
  });
});
