import { describe, expect, it } from 'vitest';
import { appendProjectEdit, createColorworkProjectV1, type ColorworkProjectV1 } from '@kniterate-studio/project-contract';
import { CUSTOMIST_STANDARD_WASTE_PASSES_V1, customistWastePassesV1 } from '@kniterate-studio/machine-lib/browser';
import { runAuthoredPipeline } from './authoredPipeline';
import { createBeanieProject } from './beanie';
import { compileColorworkProject } from './blanket/compileProject';
import { createPanelProject } from './sweater/panel';
import { machineSetupWords } from './workspace/MachineSetupSection';
import { runSweaterPipeline } from './sweater/sweaterPipeline';

/** A project's own waste section: shorter than the reference saves exactly those passes, and the file still passes the strict checks. */

const WASTE = 40;
// The waste keeps the reference's parity, rounded up: 40 knits 41 on an odd reference.
const knitted = (construction: keyof typeof CUSTOMIST_STANDARD_WASTE_PASSES_V1) => customistWastePassesV1(construction, WASTE);
const withWaste = (project: ColorworkProjectV1, wasteRows: number) => appendProjectEdit(project, { id: 'setup', source: 'human', edit: { kind: 'set-machine-setup', setup: { wasteRows } } });

function chart(technique: 'fairisle' | 'birdseye') {
  const project = createColorworkProjectV1({
    kind: 'knitlab-colorwork-chart', version: 1, title: 'Checks', width: 40, height: 24, rowNumbering: 'bottom-up',
    palette: [{ id: 'natural', name: 'Natural', hex: '#F1EDE3' }, { id: 'navy', name: 'Navy', hex: '#29445F' }],
    cells: Array.from({ length: 24 }, (_, row) => Array.from({ length: 40 }, (_, column) => (Math.floor(column / 4) + Math.floor(row / 4)) % 2)),
  }, { id: `checks-${technique}` });
  return technique === 'fairisle' ? project : appendProjectEdit(project, { id: 'birdseye', source: 'human', edit: { kind: 'set-strategy', strategy: { technique: 'birdseye', floatLimit: 5 } } });
}

describe('the waste yarn at the start', () => {
  it('keeps the reference’s parity, rounding up', () => {
    expect([customistWastePassesV1('flat', 41), customistWastePassesV1('flat', 40), customistWastePassesV1('birdseye', 40), customistWastePassesV1('birdseye', 41), customistWastePassesV1('fairisle', 86)]).toEqual([41, 41, 40, 42, 87]);
  });

  it.each(['fairisle', 'birdseye'] as const)('is the project’s own on a %s chart', async (technique) => {
    const standard = await runAuthoredPipeline(chart(technique));
    const short = await runAuthoredPipeline(withWaste(chart(technique), WASTE));
    expect(standard.verdict.state).toBe('surface');
    expect(short.verdict.state).toBe('surface');
    expect(standard.kcode!.passCount - short.kcode!.passCount).toBe(CUSTOMIST_STANDARD_WASTE_PASSES_V1[technique] - knitted(technique));
    // Leaving the setting out knits exactly as before it existed.
    expect(compileColorworkProject(withWaste(chart(technique), CUSTOMIST_STANDARD_WASTE_PASSES_V1[technique])).knitoutText).toBe(compileColorworkProject(chart(technique)).knitoutText);
  });

  it('is the project’s own on a beanie', async () => {
    const hat = createBeanieProject({ title: 'Hat', headCircumferenceCm: 56, bodyCm: 13, bodyGauge: { stitchesPer10cm: 26, rowsPer10cm: 34, source: 'measured' }, main: { name: 'Black', hex: '#111111' } }, { id: 'hat', source: 'human', group: 'create' });
    const standard = await runAuthoredPipeline(hat);
    const short = await runAuthoredPipeline(withWaste(hat, WASTE));
    expect(short.verdict.state).toBe('surface');
    expect(standard.kcode!.passCount - short.kcode!.passCount).toBe(CUSTOMIST_STANDARD_WASTE_PASSES_V1.flat - knitted('flat'));
    expect(compileColorworkProject(withWaste(hat, CUSTOMIST_STANDARD_WASTE_PASSES_V1.flat)).knitoutText).toBe(compileColorworkProject(hat).knitoutText);
  });

  it('is the project’s own on a scarf, as on every flat piece', async () => {
    const scarf = createPanelProject({ title: 'Scarf', widthCm: 20, lengthCm: 30, textureId: 'stockinette', yarn: { name: 'Oat', hex: '#D9CBB0' } }, { id: 'scarf', source: 'human', group: 'create' });
    const standard = await runSweaterPipeline(scarf);
    const short = await runSweaterPipeline(withWaste(scarf, WASTE));
    expect(short.verdict.state).toBe('surface');
    expect(standard.pieces[0]!.kcode!.passCount - short.pieces[0]!.kcode!.passCount).toBe(CUSTOMIST_STANDARD_WASTE_PASSES_V1.flat - knitted('flat'));
  });
});

describe('the machine settings section', () => {
  it('shows the standard until you set your own, and warns when the waste is short', () => {
    expect(machineSetupWords(undefined, 'flat')).toEqual({ wasteRows: 81, standard: 81, own: false, warning: null });
    expect(machineSetupWords({ wasteRows: 71 }, 'flat')).toMatchObject({ wasteRows: 71, own: true, warning: null });
    expect(machineSetupWords({ wasteRows: 40 }, 'flat')).toMatchObject({ wasteRows: 41, own: true, warning: 'Below about 70 rows the fabric may not reach the rollers before your piece starts.' });
  });
});
