import { describe, expect, it } from 'vitest';
import { materializeColorworkProject } from '@kniterate-studio/project-contract';
import { createPanelProject, planPanel, type PanelIntent } from './panel';
import { panelInstructions } from './panelHandoff';
import { runSweaterPipeline } from './sweaterPipeline';
import { summarizeSweaterRun } from './sweaterRun';

const intent = (overrides: Partial<PanelIntent> = {}): PanelIntent => ({
  title: 'Scarf', widthCm: 25, lengthCm: 60, textureId: 'seed', ends: { rib: 'kkpp', cm: 4 }, yarn: { name: 'Moss', hex: '#6B7F4E' }, ...overrides,
});
const create = (overrides: Partial<PanelIntent> = {}) => createPanelProject(intent(overrides), { id: 'panel-test', source: 'human', group: 'create' });

describe('one-yarn scarf or blanket', () => {
  it('plans one rectangle in the chosen stitch with rib ends', () => {
    const plan = planPanel(materializeColorworkProject(create()).state);
    expect(plan.pieces).toHaveLength(1);
    const raster = plan.pieces[0]!.raster!;
    expect(plan.pieces[0]!.name).toBe('Scarf');
    expect(raster.rows[0]!.zone).toBe('rib');
    expect(raster.rows.at(-1)!.zone).toBe('rib');
    expect(raster.rows.some((row) => row.zone === 'body')).toBe(true);
    expect(plan.knitted!.widthCm).toBeGreaterThan(24);
    expect(plan.knitted!.widthCm).toBeLessThan(26);
    expect(plan.findings.map((finding) => finding.rule)).toEqual(['gauge-assumed', 'gauge-assumed']);
  });

  it('compiles to one Surface-proven machine file, read back from waste yarn to bind-off, in any stitch', { timeout: 120_000 }, async () => {
    for (const overrides of [{}, { textureId: 'stockinette', ends: { rib: 'kp', cm: 0 } }, { textureId: 'full-cardigan', widthCm: 70, lengthCm: 40 }] as Partial<PanelIntent>[]) {
      const result = await runSweaterPipeline(create(overrides));
      expect(result.pieces).toHaveLength(1);
      expect(result.pieces[0]!.verdict.state, result.pieces[0]!.compileError ?? result.pieces[0]!.outputError ?? '').toBe('surface');
      expect(result.exportReady).toBe(true);
      const file = summarizeSweaterRun(result).pieces[0]!.file!;
      const kinds = file.sections.map((section) => section.kind);
      expect(kinds.slice(0, 5)).toEqual(['waste', 'draw', 'waste', 'draw', 'cast-on']);
      expect(kinds).toContain('body');
      expect(kinds.at(-2)).toBe('top');
      expect(file.sections.find((section) => section.kind === 'body')!.label).toBe('Pattern');
      if ((overrides.ends?.cm ?? 4) > 0) expect(kinds.filter((kind) => kind === 'rib')).toHaveLength(2);
    }
    // With a typical gauge it can be knitted; only the size is unconfirmed, as the panel says.
    const result = await runSweaterPipeline(create());
    const pattern = panelInstructions(create(), planPanel(materializeColorworkProject(create()).state), summarizeSweaterRun(result));
    expect(pattern).toContain('**File checks passed, sizes not confirmed.** Sizes use a typical gauge until you measure a swatch.');
    expect(pattern).not.toMatch(/Not ready|assumed gauge/);
  });

  it('refuses a panel wider than the bed in words', () => {
    const plan = planPanel(materializeColorworkProject(create({ widthCm: 110, textureId: 'stockinette' })).state);
    expect(plan.findings).toContainEqual(expect.objectContaining({ rule: 'sweater-piece-too-wide', severity: 'error' }));
  });
});
