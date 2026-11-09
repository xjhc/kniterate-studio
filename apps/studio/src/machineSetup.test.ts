import { describe, expect, it } from 'vitest';
import { appendProjectEdit, createColorworkProjectV1, materializeColorworkProject, type ColorworkProjectV1 } from '@kniterate-studio/project-contract';
import { CUSTOMIST_MIN_WASTE_PASSES_V1, CUSTOMIST_STANDARD_BODY_SETTINGS_V1, CUSTOMIST_STANDARD_TOP_WASTE_ROWS_V1, CUSTOMIST_STANDARD_WASTE_PASSES_V1, customistWastePassesV1, traceAutoSectionsV1 } from '@kniterate-studio/machine-lib/browser';
import { runAuthoredPipeline } from './authoredPipeline';
import { createBeanieProject } from './beanie';
import { compileColorworkProject } from './blanket/compileProject';
import { createPanelProject, planPanel } from './sweater/panel';
import { panelInstructions } from './sweater/panelHandoff';
import { createSweaterProject, planSweater } from './sweater/sweater';
import { sweaterInstructions } from './sweater/sweaterHandoff';
import { planProject } from './plan';
import { bodyStandard, machineSetupWords, sectionStandards, settingsWarning } from './workspace/MachineSetupSection';
import { machineSetupErrors, sectionLimits } from './machineSetup';
import { runSweaterPipeline } from './sweater/sweaterPipeline';

/** A project's own waste section: shorter than the reference saves exactly those passes, and the file still passes the strict checks. */

const WASTE = 71;
// The waste keeps the reference's parity, rounded up: 71 knits 72 on birdseye's even reference.
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

  it('is refused when too short for the rollers to grip, on every construction', async () => {
    const tooShort = CUSTOMIST_MIN_WASTE_PASSES_V1 - 2;
    const fairisle = compileColorworkProject(withWaste(chart('fairisle'), tooShort));
    expect(fairisle.ok).toBe(false);
    expect(fairisle.messages).toEqual([{
      severity: 'error',
      rule: 'project-waste-too-short',
      message: `The waste knits ${customistWastePassesV1('fairisle', tooShort)} rows; Studio needs at least ${CUSTOMIST_MIN_WASTE_PASSES_V1}, because with fewer the fabric may not reach the rollers before your piece starts, and without pull-down the knitting fails.`,
    }]);
    const birdseye = await runAuthoredPipeline(withWaste(chart('birdseye'), tooShort));
    expect(birdseye.verdict.state).toBe('blocked');
    expect(birdseye.exportReady).toBe(false);
    const hat = createBeanieProject({ title: 'Hat', headCircumferenceCm: 56, bodyCm: 13, bodyGauge: { stitchesPer10cm: 26, rowsPer10cm: 34, source: 'measured' }, main: { name: 'Black', hex: '#111111' } }, { id: 'hat', source: 'human', group: 'create' });
    expect(compileColorworkProject(withWaste(hat, tooShort)).messages.map((item) => item.rule)).toEqual(['project-waste-too-short']);
    const scarf = createPanelProject({ title: 'Scarf', widthCm: 20, lengthCm: 30, textureId: 'stockinette', yarn: { name: 'Oat', hex: '#D9CBB0' } }, { id: 'scarf', source: 'human', group: 'create' });
    const short = await runSweaterPipeline(withWaste(scarf, tooShort));
    expect(short.verdict.state).toBe('blocked');
    expect(short.exportReady).toBe(false);
    expect(short.pieces[0]!.compileError).toContain(`Studio needs at least ${CUSTOMIST_MIN_WASTE_PASSES_V1}`);
    // The floor is inclusive.
    expect(machineSetupErrors({ wasteRows: CUSTOMIST_MIN_WASTE_PASSES_V1 }, 'birdseye')).toEqual([]);
    expect(machineSetupErrors({ wasteRows: CUSTOMIST_MIN_WASTE_PASSES_V1 - 1 }, 'birdseye')).toEqual([]);
    expect(machineSetupErrors({ wasteRows: CUSTOMIST_MIN_WASTE_PASSES_V1 - 1 }, 'flat').map((error) => error.rule)).toEqual(['project-waste-too-short']);
  });
});

describe('settings outside the machine-safety envelope', () => {
  it('bound every section, with transfer limits and room for a rib’s rear stitch', () => {
    expect(sectionLimits('body')).toEqual({ stitch: { min: 2, max: 15 }, speed: { min: 10, max: 800 }, roller: { min: 0, max: 999 } });
    expect(sectionLimits('waste')).toEqual(sectionLimits('body'));
    expect(sectionLimits('castOn')).toEqual(sectionLimits('body'));
    expect(sectionLimits('rib')).toEqual({ stitch: { min: 3, max: 15 }, speed: { min: 10, max: 800 }, roller: { min: 0, max: 999 } });
    expect(sectionLimits('transfers')).toEqual({ stitch: { min: 0, max: 15 }, speed: { min: 10, max: 400 }, roller: { min: 0, max: 450 } });
  });

  it('are refused before anything is compiled', async () => {
    expect(machineSetupErrors({ body: { stitch: 2, speed: 10, roller: 0 }, transfers: { stitch: 0, speed: 400, roller: 450 }, rib: { stitch: 3 } }, 'flat')).toEqual([]);
    expect(machineSetupErrors({ body: { stitch: 1, speed: 801 }, rib: { stitch: 2 }, transfers: { speed: 500, roller: 451 }, waste: { roller: -1 } }, 'flat')).toEqual([
      { rule: 'project-setting-outside-machine-range', message: "Waste roller -1 is outside Studio's safety limits for the machine (0 to 999)." },
      { rule: 'project-setting-outside-machine-range', message: "Rib stitch size 2 is outside Studio's safety limits for the machine (3 to 15)." },
      { rule: 'project-setting-outside-machine-range', message: "Body stitch size 1 is outside Studio's safety limits for the machine (2 to 15)." },
      { rule: 'project-setting-outside-machine-range', message: "Body speed 801 is outside Studio's safety limits for the machine (10 to 800)." },
      { rule: 'project-setting-outside-machine-range', message: "Transfers speed 500 is outside Studio's safety limits for the machine (10 to 400)." },
      { rule: 'project-setting-outside-machine-range', message: "Transfers roller 451 is outside Studio's safety limits for the machine (0 to 450)." },
    ]);
    // A chart sets only its waste and body.
    expect(machineSetupErrors({ transfers: { speed: 500 }, body: { speed: 9 } }, 'fairisle').map((error) => error.message)).toEqual(["Body speed 9 is outside Studio's safety limits for the machine (10 to 800)."]);
    const setup = (project: ColorworkProjectV1, value: Record<string, unknown>) => appendProjectEdit(project, { id: 'unsafe', source: 'human', edit: { kind: 'set-machine-setup', setup: value } });
    const chartResult = await runAuthoredPipeline(setup(chart('fairisle'), { body: { speed: 0, roller: -500 } }));
    expect(chartResult.verdict.state).toBe('blocked');
    expect(chartResult.exportReady).toBe(false);
    expect(chartResult.compiled!.messages.map((item) => item.message)).toEqual([
      "Body speed 0 is outside Studio's safety limits for the machine (10 to 800).",
      "Body roller -500 is outside Studio's safety limits for the machine (0 to 999).",
    ]);
    const hat = createBeanieProject({ title: 'Hat', headCircumferenceCm: 56, bodyCm: 13, bodyGauge: { stitchesPer10cm: 26, rowsPer10cm: 34, source: 'measured' }, main: { name: 'Black', hex: '#111111' } }, { id: 'hat', source: 'human', group: 'create' });
    const hatResult = await runAuthoredPipeline(setup(hat, { transfers: { speed: 800, roller: 999 } }));
    expect(hatResult.verdict.state).toBe('blocked');
    expect(hatResult.exportReady).toBe(false);
  });
});

describe('the machine settings section', () => {
  it('shows the standard until you set your own, and warns when the waste is short', () => {
    expect(machineSetupWords(undefined, 'flat')).toEqual({ wasteRows: 81, standard: 81, drawThread: true, own: false, warning: null });
    expect(machineSetupWords(undefined, 'fairisle')).toMatchObject({ wasteRows: 87, drawThread: null });
    expect(machineSetupWords({ drawThread: false }, 'flat')).toMatchObject({ drawThread: false, own: true });
    expect(machineSetupWords({ wasteRows: 71 }, 'flat')).toMatchObject({ wasteRows: 71, own: true, warning: null });
    expect(machineSetupWords({ wasteRows: 40 }, 'flat')).toMatchObject({ wasteRows: 41, own: true, warning: 'Below 70 rows the fabric may not reach the rollers before your piece starts, so no program is made.' });
  });
});

describe('the draw thread', () => {
  it('can be left out of every flat piece: the file has no C1 and still passes the strict checks', async () => {
    const off = (project: ColorworkProjectV1) => appendProjectEdit(project, { id: 'no-draw', source: 'human', edit: { kind: 'set-machine-setup', setup: { drawThread: false } } });
    const hat = createBeanieProject({ title: 'Hat', headCircumferenceCm: 56, bodyCm: 13, bodyGauge: { stitchesPer10cm: 26, rowsPer10cm: 34, source: 'measured' }, main: { name: 'Black', hex: '#111111' } }, { id: 'hat', source: 'human', group: 'create' });
    const scarf = createPanelProject({ title: 'Scarf', widthCm: 20, lengthCm: 30, textureId: 'stockinette', yarn: { name: 'Oat', hex: '#D9CBB0' } }, { id: 'scarf', source: 'human', group: 'create' });
    const beanie = await runAuthoredPipeline(off(hat));
    expect(beanie.verdict.state).toBe('surface');
    expect(beanie.compiled!.knitoutText).not.toMatch(/^in 1$/m);
    expect(compileColorworkProject(hat).knitoutText).toMatch(/^in 1$/m);
    const piece = (await runSweaterPipeline(off(scarf))).pieces[0]!;
    expect(piece.verdict.state).toBe('surface');
    expect(piece.compiled!.knitoutText).not.toMatch(/^in 1$/m);
  });

  it('is left out of every written instruction too', () => {
    const off = (project: ColorworkProjectV1) => appendProjectEdit(project, { id: 'no-draw', source: 'human', edit: { kind: 'set-machine-setup', setup: { drawThread: false } } });
    const sweater = off(createSweaterProject({ title: 'Jumper', silhouette: 'set-in', neckline: 'crew', size: 'M', fit: 'classic', textureId: 'stockinette', yarn: { name: 'Oat', hex: '#D9CBB0' } }, { id: 'jumper', source: 'human', group: 'create' }));
    const scarf = off(createPanelProject({ title: 'Scarf', widthCm: 20, lengthCm: 30, textureId: 'stockinette', yarn: { name: 'Oat', hex: '#D9CBB0' } }, { id: 'scarf', source: 'human', group: 'create' }));
    const hat = off(createBeanieProject({ title: 'Hat', headCircumferenceCm: 56, bodyCm: 13, bodyGauge: { stitchesPer10cm: 26, rowsPer10cm: 34, source: 'measured' }, main: { name: 'Black', hex: '#111111' } }, { id: 'hat', source: 'human', group: 'create' }));
    const texts = [
      sweaterInstructions(sweater, planSweater(materializeColorworkProject(sweater).state), null),
      panelInstructions(scarf, planPanel(materializeColorworkProject(scarf).state), null),
      planProject(materializeColorworkProject(hat).state).finishing.join('\n'),
    ];
    for (const text of texts) {
      expect(text).not.toMatch(/pull the draw thread|draw thread on C|draw thread \(C/i);
      expect(text).toMatch(/unravel or cut away the waste yarn|no draw thread/i);
    }
  });
});

describe('the top', () => {
  it.each(['fairisle', 'birdseye'] as const)('of a %s chart is the reference’s closing waste, of any even length, or a chain bind-off', async (technique) => {
    const setup = (value: Record<string, unknown>) => appendProjectEdit(chart(technique), { id: 'top', source: 'human', edit: { kind: 'set-machine-setup', setup: value } });
    const standard = await runAuthoredPipeline(chart(technique));
    const shorter = await runAuthoredPipeline(setup({ topWasteRows: 8 }));
    expect(shorter.verdict.state).toBe('surface');
    expect(standard.kcode!.passCount - shorter.kcode!.passCount).toBe(CUSTOMIST_STANDARD_TOP_WASTE_ROWS_V1[technique] - 8);
    const bound = await runAuthoredPipeline(setup({ top: 'bind-off' }));
    expect(bound.verdict.state).toBe('surface');
    expect(bound.compiled!.knitoutText).not.toBe(standard.compiled!.knitoutText);
  });

  it('of a scarf on waste yarn is as many rows as you set', async () => {
    const scarf = (setup?: Record<string, unknown>) => {
      const created = createPanelProject({ title: 'Scarf', widthCm: 20, lengthCm: 30, textureId: 'stockinette', yarn: { name: 'Oat', hex: '#D9CBB0' } }, { id: 'scarf', source: 'human', group: 'create' });
      const state = materializeColorworkProject(created).state;
      const onWaste = appendProjectEdit(created, { id: 'top', source: 'human', edit: { kind: 'set-object', object: { ...state.object!, top: 'waste' } as never } });
      return setup ? appendProjectEdit(onWaste, { id: 'setup', source: 'human', edit: { kind: 'set-machine-setup', setup } }) : onWaste;
    };
    const standard = (await runSweaterPipeline(scarf())).pieces[0]!;
    const longer = (await runSweaterPipeline(scarf({ topWasteRows: 20 }))).pieces[0]!;
    expect(longer.verdict.state).toBe('surface');
    expect(longer.kcode!.passCount - standard.kcode!.passCount).toBe(20 - CUSTOMIST_STANDARD_TOP_WASTE_ROWS_V1.flat);
  });
});

describe('the body’s speed, roller and stitch size', () => {
  const OWN = { speed: 333, roller: 444, stitch: 11 };
  const own = (project: ColorworkProjectV1) => appendProjectEdit(project, { id: 'body', source: 'human', edit: { kind: 'set-machine-setup', setup: { body: OWN } } });
  // Values no reference program uses, so seeing them proves the body knits with them. Stitch sizes from 10 are written as letters: 11 is B.
  const uses = (knitout: string) => [/^x-speed-number 333$/m, /^x-roller-advance 444$/m, /^x-stitch-number B$/m].map((pattern) => pattern.test(knitout));

  it.each(['fairisle', 'birdseye'] as const)('are the project’s own on a %s chart', async (technique) => {
    expect(uses(compileColorworkProject(chart(technique)).knitoutText!)).toEqual([false, false, false]);
    const result = await runAuthoredPipeline(own(chart(technique)));
    expect(result.verdict.state).toBe('surface');
    expect(uses(result.compiled!.knitoutText!)).toEqual([true, true, true]);
  });

  it.each(['birdseye', 'fairisle'] as const)('are the project’s own on a beanie with a %s back', async (backing) => {
    const hat = createBeanieProject({ title: 'Hat', headCircumferenceCm: 56, bodyCm: 13, bodyGauge: { stitchesPer10cm: 26, rowsPer10cm: 34, source: 'measured' }, cuffCm: 7, ribGauge: { stitchesPer10cm: 30, rowsPer10cm: 32, source: 'measured' }, fold: true, backing, main: { name: 'Black', hex: '#111111' }, accent: { name: 'White', hex: '#F2F2F2' } }, { id: `hat-${backing}`, source: 'human', group: 'create' });
    expect(bodyStandard(materializeColorworkProject(hat).state)).toEqual(CUSTOMIST_STANDARD_BODY_SETTINGS_V1[backing]);
    expect(uses(compileColorworkProject(hat).knitoutText!)).toEqual([false, false, false]);
    const result = await runAuthoredPipeline(own(hat));
    expect(result.verdict.state).toBe('surface');
    expect(uses(result.compiled!.knitoutText!)).toEqual([true, true, true]);
  });

  it('are the project’s own on a scarf, as on every flat piece', async () => {
    const scarf = createPanelProject({ title: 'Scarf', widthCm: 20, lengthCm: 30, textureId: 'stockinette', yarn: { name: 'Oat', hex: '#D9CBB0' } }, { id: 'scarf', source: 'human', group: 'create' });
    const piece = (await runSweaterPipeline(own(scarf))).pieces[0]!;
    expect(piece.verdict.state).toBe('surface');
    expect(uses(piece.compiled!.knitoutText)).toEqual([true, true, true]);
  });

  it('warns outside what Kniterate’s own files use', () => {
    expect(settingsWarning({ speed: 650, roller: 500 })).toBeNull();
    expect(settingsWarning({ speed: 750 })).toContain('speed');
    expect(settingsWarning({ roller: -20 })).toContain('roller');
  });
});

describe('every section’s speed, roller and stitch size', () => {
  const OWN = { speed: 333, roller: 444, stitch: 11 };
  const own = (project: ColorworkProjectV1, section: string) => appendProjectEdit(project, { id: `own-${section}`, source: 'human', edit: { kind: 'set-machine-setup', setup: { [section]: OWN } } });
  const uses = (knitout: string) => [/^x-speed-number 333$/m, /^x-roller-advance 444$/m, /^x-stitch-number B$/m].map((pattern) => pattern.test(knitout));
  const hat = () => createBeanieProject({ title: 'Hat', headCircumferenceCm: 56, bodyCm: 13, bodyGauge: { stitchesPer10cm: 26, rowsPer10cm: 34, source: 'measured' }, cuffCm: 7, ribGauge: { stitchesPer10cm: 30, rowsPer10cm: 32, source: 'measured' }, fold: true, main: { name: 'Black', hex: '#111111' }, accent: { name: 'White', hex: '#F2F2F2' } }, { id: 'hat', source: 'human', group: 'create' });

  it.each(['fairisle', 'birdseye'] as const)('of a %s chart: its waste', async (technique) => {
    expect(sectionStandards(materializeColorworkProject(chart(technique)).state).map((section) => section.key)).toEqual(technique === 'fairisle' ? ['waste', 'castOn', 'body'] : ['waste', 'body']);
    const result = await runAuthoredPipeline(own(chart(technique), 'waste'));
    expect(result.verdict.state).toBe('surface');
    expect(uses(result.compiled!.knitoutText!)).toEqual([true, true, true]);
  });

  it.each(['waste', 'castOn', 'rib', 'transfers', 'crown'])('of a beanie: its %s', async (section) => {
    expect(sectionStandards(materializeColorworkProject(hat()).state).map((item) => item.key)).toEqual(['waste', 'castOn', 'rib', 'body', 'transfers', 'crown']);
    const result = await runAuthoredPipeline(own(hat(), section));
    expect(result.verdict.state).toBe('surface');
    // Transfers carry their own stitch size (x-xfer-stitch-number), not the knitting one.
    expect(uses(result.compiled!.knitoutText!)).toEqual(section === 'transfers' ? [true, true, false] : [true, true, true]);
    if (section === 'transfers') expect(result.compiled!.knitoutText).toMatch(/^x-xfer-stitch-number B$/m);
  });

  it('of a beanie: its transfers are every transfer’s, the crown’s too', async () => {
    const crownOf = (knitout: string) => knitout.slice(knitout.indexOf('RIB CROWN'));
    const standard = crownOf(compileColorworkProject(hat()).knitoutText!);
    // Without your own, the crown keeps its reference's transfer speed.
    expect(standard).toMatch(/^x-speed-number 150$/m);
    const result = await runAuthoredPipeline(own(hat(), 'transfers'));
    expect(result.verdict.state).toBe('surface');
    const crown = crownOf(result.compiled!.knitoutText!);
    expect(crown).not.toMatch(/^x-speed-number 150$/m);
    expect(crown).toMatch(/^x-speed-number 333$/m);
    // The transfer stitch size is set once and never changes back, the crown included.
    expect(new Set(result.compiled!.knitoutText!.match(/^x-xfer-stitch-number .+$/gm))).toEqual(new Set(['x-xfer-stitch-number B']));
  });

  it('of a beanie: its crown settings are every crown row’s, and nothing else’s', async () => {
    const crownOf = (knitout: string) => knitout.slice(knitout.indexOf('RIB CROWN'), knitout.indexOf('WASTE ON TOP'));
    const standard = compileColorworkProject(hat()).knitoutText!;
    const result = await runAuthoredPipeline(own(hat(), 'crown'));
    expect(result.verdict.state).toBe('surface');
    const knitout = result.compiled!.knitoutText!;
    expect(knitout.slice(0, knitout.indexOf('RIB CROWN'))).toBe(standard.slice(0, standard.indexOf('RIB CROWN')));
    // Every crown row knits at your settings; the crown's transfers keep theirs.
    expect(new Set(crownOf(knitout).match(/^x-stitch-number .+$/gm))).toEqual(new Set(['x-stitch-number B']));
    expect(crownOf(knitout)).toMatch(/^x-speed-number 150$/m);
  });

  it('of a beanie: a slower waste and cast-on knit every start row no faster, the tube and tubular rows too (PR #14)', { timeout: 60_000 }, async () => {
    const slow = { speed: 100 };
    const slowed = appendProjectEdit(hat(), { id: 'slow-start', source: 'human', edit: { kind: 'set-machine-setup', setup: { waste: slow, castOn: slow } } });
    const [before, after] = await Promise.all([runAuthoredPipeline(hat()), runAuthoredPipeline(slowed)]);
    expect(after.verdict.state).toBe('surface');
    const startKnits = (trace: NonNullable<NonNullable<typeof after.kcode>['trace']>) => {
      const start = traceAutoSectionsV1(trace).filter((section) => ['waste', 'draw', 'cast-on'].includes(section.name));
      return trace.passes.filter((pass) => start.some((section) => pass.index + 1 >= section.from && pass.index + 1 <= section.to) && pass.actions.some((action) => action.kind === 'knit'));
    };
    // The standard start knits its waste tube and tubular rows at 200.
    expect(startKnits(before.kcode!.trace!).filter((pass) => pass.speed === 200).length).toBeGreaterThan(4);
    expect(Math.max(...startKnits(after.kcode!.trace!).map((pass) => pass.speed))).toBe(100);
  });

  it('of a beanie: the top is waste yarn over the crown’s stitches, its rows your own', async () => {
    const topOf = (knitout: string) => knitout.slice(knitout.indexOf('WASTE ON TOP'));
    const rows = (knitout: string) => topOf(knitout).split('\n').filter((line) => /^knit [+-] f\d+ 6$/.test(line)).length;
    const compiled = compileColorworkProject(hat());
    const standard = compiled.knitoutText!;
    expect(standard).toContain('WASTE ON TOP');
    // The operator is told the waste yarn runs up the right edge to the top.
    expect(compiled.diagnostics).toContainEqual(expect.objectContaining({ rule: 'carried-yarn', message: expect.stringMatching(/^C6 \(waste\) is carried .* up the right edge .* to the waste rows on top/) }));
    const stitches = new Set(topOf(standard).match(/^drop f\d+$/gm)).size;
    expect(rows(standard)).toBe(8 * stitches);
    const result = await runAuthoredPipeline(appendProjectEdit(hat(), { id: 'top-rows', source: 'human', edit: { kind: 'set-machine-setup', setup: { topWasteRows: 12 } } }));
    expect(result.verdict.state).toBe('surface');
    expect(rows(result.compiled!.knitoutText!)).toBe(12 * stitches);
  });

  it('of a scarf: its sections, the rib only when it has rib ends', async () => {
    const scarf = (ends: number) => createPanelProject({ title: 'Scarf', widthCm: 20, lengthCm: 30, textureId: 'stockinette', ends: { rib: 'kkpp', cm: ends }, yarn: { name: 'Oat', hex: '#D9CBB0' } }, { id: `scarf-${ends}`, source: 'human', group: 'create' });
    expect(sectionStandards(materializeColorworkProject(scarf(0)).state).map((section) => section.key)).not.toContain('rib');
    expect(sectionStandards(materializeColorworkProject(scarf(4)).state).map((section) => section.key)).toContain('rib');
    const piece = (await runSweaterPipeline(own(scarf(4), 'rib'))).pieces[0]!;
    expect(piece.verdict.state).toBe('surface');
    expect(uses(piece.compiled!.knitoutText)).toEqual([true, true, true]);
  });
});

describe('a fairisle chart\'s cast-on and a chart\'s chain bind-off', () => {
  const withSetup = (project: ColorworkProjectV1, setup: object) => appendProjectEdit(project, { id: 'setup', source: 'human', edit: { kind: 'set-machine-setup', setup } as never });
  const differing = (a: readonly { raw: unknown }[], b: readonly { raw: unknown }[]) => a.flatMap((pass, index) => (JSON.stringify(pass.raw) === JSON.stringify(b[index]?.raw) ? [] : [index]));

  it('cast-on roller and stitch set only the first zig-zag row (the operator\'s setting behind issue #9 run 4B)', { timeout: 60_000 }, async () => {
    const [before, after] = await Promise.all([runAuthoredPipeline(chart('fairisle')), runAuthoredPipeline(withSetup(chart('fairisle'), { castOn: { roller: 300 } }))]);
    expect(after.exportReady).toBe(true);
    const a = before.kcode!.trace!.passes;
    const b = after.kcode!.trace!.passes;
    expect(b).toHaveLength(a.length);
    const changed = differing(a, b);
    expect(changed).toHaveLength(1);
    expect([a[changed[0]!]!.roller, b[changed[0]!]!.roller]).toEqual([450, 300]);
    expect(b[changed[0]!]!.raw.FRNT).toBe(a[changed[0]!]!.raw.FRNT);
  });

  it('cast-on speed sets the three cast-on rows and nothing else: the first body row stays slow', { timeout: 60_000 }, async () => {
    const [before, after] = await Promise.all([runAuthoredPipeline(chart('fairisle')), runAuthoredPipeline(withSetup(chart('fairisle'), { castOn: { speed: 50 } }))]);
    expect(after.exportReady).toBe(true);
    const a = before.kcode!.trace!.passes;
    const b = after.kcode!.trace!.passes;
    expect(b).toHaveLength(a.length);
    const changed = differing(a, b);
    expect(changed).toEqual([changed[0], changed[0]! + 1, changed[0]! + 2]);
    expect(changed.map((index) => [a[index]!.speed, b[index]!.speed])).toEqual([[100, 50], [100, 50], [100, 50]]);
    // The first body row after the transfers, one pass per colour, keeps its
    // slow 100 (issue #9 runs 1 and 2).
    const firstBody = b.filter((pass, index) => index > changed[2]! && pass.actions.some((action) => action.kind === 'knit')).slice(0, 2);
    expect(firstBody.map((pass) => [pass.carrier, pass.speed])).toEqual([['2', 100], ['3', 100]]);
  });

  it('the tubular roller sets only the two tubular rows after the zig-zag (an owner\'s fix for first-row breaks)', { timeout: 60_000 }, async () => {
    const [before, after] = await Promise.all([runAuthoredPipeline(chart('fairisle')), runAuthoredPipeline(withSetup(chart('fairisle'), { castOn: { tubularRoller: 200 } }))]);
    expect(after.exportReady).toBe(true);
    const a = before.kcode!.trace!.passes;
    const b = after.kcode!.trace!.passes;
    const changed = differing(a, b);
    expect(changed).toHaveLength(2);
    expect(changed[1]).toBe(changed[0]! + 1);
    expect(changed.map((index) => [a[index]!.roller, b[index]!.roller])).toEqual([[400, 200], [400, 200]]);
    expect(changed.map((index) => b[index]!.raw.FRNT + b[index]!.raw.REAR)).toEqual(changed.map((index) => a[index]!.raw.FRNT + a[index]!.raw.REAR));
  });

  it('a bind-off top can knit Kniterate\'s first stitch at roller 350 and set the chain\'s knit stitch size', { timeout: 60_000 }, async () => {
    const top = { top: 'bind-off' };
    const [before, after] = await Promise.all([runAuthoredPipeline(withSetup(chart('fairisle'), top)), runAuthoredPipeline(withSetup(chart('fairisle'), { ...top, bindOff: { stitch: 4, knitFirstStitch: true } }))]);
    expect(before.exportReady).toBe(true);
    expect(after.exportReady).toBe(true);
    const a = before.kcode!.trace!.passes;
    const b = after.kcode!.trace!.passes;
    const first = differing(a, b)[0]!;
    // Everything up to the bind-off is unchanged; the bind-off gains only the
    // first stitch's knit and the yarn's move to it.
    expect(a.slice(0, first).map((pass) => pass.raw)).toEqual(b.slice(0, first).map((pass) => pass.raw));
    expect(b).toHaveLength(a.length + 2);
    const knits = (pass: (typeof b)[number]) => pass.actions.filter((action) => action.kind === 'knit');
    const bindOff = b.slice(first);
    const [knitFirst, ...chain] = bindOff.filter((pass) => knits(pass).length > 0);
    expect(knits(knitFirst!)).toHaveLength(1);
    expect(knitFirst!.roller).toBe(350);
    // Kniterate knits the first stitch in the chain knits' own direction, so the
    // yarn then waits outside the edge: no carrier moves while the beds are racked.
    expect(chain.length).toBeGreaterThan(30);
    expect(new Set(chain.map((pass) => pass.direction))).toEqual(new Set([knitFirst!.direction]));
    expect(bindOff.filter((pass) => pass.rack !== 0 && pass.carrier !== '0').map((pass) => pass.index)).toEqual([]);
    // Every chain knit uses stitch 4.
    expect(new Set([knitFirst!, ...chain].flatMap((pass) => knits(pass).map((action) => ('at' in action ? action.at.stitchSelector.encodedValue : -1))))).toEqual(new Set([4]));
  });

  it('refuses values outside the machine\'s limits', () => {
    expect(machineSetupErrors({ castOn: { roller: -1, stitch: 1, speed: 0 } }, 'fairisle')).toHaveLength(3);
    expect(machineSetupErrors({ top: 'bind-off', bindOff: { stitch: 4, knitFirstStitch: true }, castOn: { tubularRoller: 200 } }, 'fairisle')).toEqual([]);
    expect(machineSetupErrors({ top: 'bind-off', bindOff: { stitch: 1 }, castOn: { tubularRoller: 1000 } }, 'fairisle').map((error) => error.rule)).toEqual(['project-setting-outside-machine-range', 'project-setting-outside-machine-range']);
  });

  it('keeps a setting the construction does not use, and ignores it: switching the backing or the top never blocks the project', { timeout: 60_000 }, async () => {
    // The panel hides these sections then, so a refusal could not be cleared there.
    expect(machineSetupErrors({ castOn: { roller: 300 } }, 'birdseye')).toEqual([]);
    expect(machineSetupErrors({ bindOff: { stitch: 4, knitFirstStitch: true } }, 'fairisle')).toEqual([]);
    expect(machineSetupErrors({ bindOff: { stitch: 4 } }, 'flat')).toEqual([]);
    const raw = (result: Awaited<ReturnType<typeof runAuthoredPipeline>>) => result.kcode!.trace!.passes.map((pass) => pass.raw);
    const [birdseye, birdseyeOwn, waste, wasteOwn] = await Promise.all([
      runAuthoredPipeline(chart('birdseye')),
      runAuthoredPipeline(withSetup(chart('birdseye'), { castOn: { roller: 300, speed: 50, tubularRoller: 200 } })),
      runAuthoredPipeline(chart('fairisle')),
      runAuthoredPipeline(withSetup(chart('fairisle'), { bindOff: { stitch: 4, knitFirstStitch: true } })),
    ]);
    expect(birdseyeOwn.exportReady).toBe(true);
    expect(raw(birdseyeOwn)).toEqual(raw(birdseye));
    expect(wasteOwn.exportReady).toBe(true);
    expect(raw(wasteOwn)).toEqual(raw(waste));
  });
});
