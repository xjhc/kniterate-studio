import { describe, expect, it } from 'vitest';
import { KNITERATE_7GG_KCODE_PROFILE_V2, auditTraceV1, deriveMachineTraceAdvisoriesV1 } from '@kniterate-studio/machine-lib/browser';
import type { KCodeArtifact } from './kcode/kcodeProtocol';
import { appendProjectEdit, createColorworkProjectV1, materializeColorworkProject } from '@kniterate-studio/project-contract';
import { createBeanieProject } from './beanie';
import { runAuthoredPipeline } from './authoredPipeline';
import { planProject } from './plan';
import { createPanelProject } from './sweater/panel';
import { createSweaterProject } from './sweater/sweater';
import { runSweaterPipeline } from './sweater/sweaterPipeline';
import { readKnitFile, type KnitFileCarriers, type KnitFileKind } from './sweater/knitFile';

/**
 * The start every flat piece knits, checked against what failed on the machine.
 *
 * Issue #9 run 3 failed at the start: its waste yarn sped up to 700, its yarns
 * came in at 200, and the waste carrier crossed the bed without knitting. The
 * fix (Kniterate's fairisle waste speeds and yarn introduction, plus a yarn
 * catch) is pinned here as rules, so a later change cannot quietly undo it.
 *
 * Not covered yet: the birdseye rectangle's start, which is still Kniterate's
 * jacquard start without the yarn catch (queued in docs/ROADMAP.md).
 */

const CATCH_NEEDLES = 20;
/**
 * Replay every loop with the machine-lib audit (the same one `pnpm studio -- audit` runs):
 * no start loop held long (handoff 2 held one ~90 passes at the corner that broke), no waste
 * yarn knitting through doubled body loops, nothing dropped unheld, nothing left on the needles.
 */
function auditRules(name: string, kcode: KCodeArtifact, file: NonNullable<ReturnType<typeof readKnitFile>>, carriers: KnitFileCarriers) {
  const sections = file.sections.map((section) => ({ name: section.kind, from: section.passes.from + 1, to: section.passes.to + 1 }));
  const audit = auditTraceV1(kcode.trace!, { sections, roles: { waste: carriers.waste, draw: carriers.draw } });
  const failing = audit.checks.filter((check) => !check.ok && check.severity === 'issue').map((check) => `${check.id} ${check.value}${check.at ? `: ${check.at.join('; ')}` : ''}`);
  expect(failing, name).toEqual([]);
}

function startRules(name: string, kcode: KCodeArtifact, read: { kind: KnitFileKind; carriers: KnitFileCarriers; zoneOfRow: (row: number) => 'rib' | 'body' }) {
  const file = readKnitFile(kcode, read)!;
  // The start is the waste yarn and draw thread, up to the cast-on or the first row.
  const end = file.sections.find((section) => section.kind !== 'waste' && section.kind !== 'draw')!.passes.from;
  const start = file.passes.slice(0, end);
  const startLo = Math.min(...start.flatMap((pass) => (pass.needles ? [pass.needles.lo] : [])));
  const startHi = Math.max(...start.flatMap((pass) => (pass.needles ? [pass.needles.hi] : [])));

  // No yarn knits faster than 300 before the piece begins (carriage-only moves carry no yarn).
  for (const [index, pass] of start.entries()) if (pass.carrier !== '0') expect(pass.speed, `${name}: pass ${index + 1} on C${pass.carrier}`).toBeLessThanOrEqual(300);

  // Each yarn is caught out and back over the leftmost 20 needles (all of them on a narrower piece), then knits its first row, all at speed 100.
  const yarns = [...new Set(start.filter((pass) => pass.carrier !== '0' && pass.kind === 'knit').map((pass) => pass.carrier))];
  expect(yarns.length, name).toBeGreaterThanOrEqual(2);
  for (const carrier of yarns) {
    const [out, back, first] = file.passes.filter((pass) => pass.carrier === carrier && pass.kind === 'knit');
    for (const pass of [out!, back!]) {
      expect(pass.needles, `${name}: C${carrier} catch`).toEqual({ lo: startLo, hi: Math.min(startLo + CATCH_NEEDLES - 1, startHi) });
      expect(pass.speed, `${name}: C${carrier} catch`).toBe(100);
      expect(pass.roller, `${name}: C${carrier} catch`).toBeGreaterThan(0);
    }
    expect(back!.direction, `${name}: C${carrier} catch`).not.toBe(out!.direction);
    expect(first!.speed, `${name}: C${carrier} first row`).toBe(100);
  }

  // No yarn floats across the bed during the start.
  const floats = deriveMachineTraceAdvisoriesV1(kcode.trace!, KNITERATE_7GG_KCODE_PROFILE_V2, {}).advisories
    .filter((advisory) => advisory.rule === 'machine-advisory.float-distance' && advisory.passIndex < end);
  expect(floats.map((advisory) => advisory.message), name).toEqual([]);

  auditRules(name, kcode, file, read.carriers);
}

const gauge = { stitchesPer10cm: 20, rowsPer10cm: 28, source: 'assumed' as const };
const ribGauge = { stitchesPer10cm: 22, rowsPer10cm: 30, source: 'assumed' as const };
const hatCarriers: KnitFileCarriers = { main: '3', second: null, waste: '6', draw: '1' };

describe('the start every flat piece knits (issue #9 run 3)', () => {
  it('a beanie, with or without a cuff and with either backing', { timeout: 120_000 }, async () => {
    const options = (id: string) => ({ id, source: 'human' as const, group: 'create' });
    const hats = [
      createBeanieProject({ title: 'Toque', headCircumferenceCm: 56, bodyCm: 13, bodyGauge: gauge, cuffCm: 7, ribGauge, fold: true, main: { name: 'Black', hex: '#111111' }, accent: { name: 'White', hex: '#F2F2F2' } }, options('toque')),
      createBeanieProject({ title: 'Rib hat', headCircumferenceCm: 56, bodyCm: 13, bodyGauge: ribGauge, main: { name: 'Black', hex: '#111111' } }, options('rib-hat')),
      createBeanieProject({ title: 'Birdseye toque', headCircumferenceCm: 56, bodyCm: 13, bodyGauge: gauge, cuffCm: 7, ribGauge, fold: true, backing: 'birdseye', main: { name: 'Black', hex: '#111111' }, accent: { name: 'White', hex: '#F2F2F2' } }, options('birdseye-toque')),
    ];
    for (const project of hats) {
      const { state, placements } = materializeColorworkProject(project);
      const ribRows = planProject(state, placements).sections!.cuff?.rows ?? state.chart.height;
      const result = await runAuthoredPipeline(project);
      startRules(project.title, result.kcode!, { kind: 'beanie', carriers: hatCarriers, zoneOfRow: (row) => (row < ribRows ? 'rib' : 'body') });
    }
  });

  it('a one-yarn scarf and every sweater piece', { timeout: 180_000 }, async () => {
    const scarf = await runSweaterPipeline(createPanelProject({ title: 'Scarf', widthCm: 25, lengthCm: 30, textureId: 'seed', ends: { rib: 'kkpp', cm: 4 }, yarn: { name: 'Oat', hex: '#D9CBB0' } }, { id: 'scarf', source: 'human', group: 'create' }));
    const sweater = await runSweaterPipeline(createSweaterProject({ title: 'Sweater', silhouette: 'set-in', neckline: 'crew', size: 'M', fit: 'classic', textureId: 'seed', yarn: { name: 'Oat', hex: '#D9CBB0' } }, { id: 'sweater', source: 'human', group: 'create' }));
    for (const result of [scarf, sweater]) {
      expect(result.pieces.length).toBeGreaterThan(0);
      for (const piece of result.pieces) {
        const raster = result.plan.pieces.find((item) => item.id === piece.id)!.raster!;
        const kind: KnitFileKind = result === scarf ? 'panel' : piece.id === 'sleeve' ? 'sleeve' : 'body';
        startRules(`${result === scarf ? 'scarf' : 'sweater'} ${piece.id}`, piece.kcode!, { kind, carriers: result.plan.carriers, zoneOfRow: (row) => raster.rows[row]?.zone ?? 'body' });
      }
    }
  });

  it('narrow and odd-width pieces, where the catch reaches the right edge', { timeout: 180_000 }, async () => {
    // A catch over the whole piece also leaves a loop on the right-edge needle (issue #9 review).
    for (const width of [9, 12, 19, 20, 21]) {
      const cells = Array.from({ length: 12 }, (_, row) => Array.from({ length: width }, (_, column) => ((row + column) % 3 === 0 ? 1 : 0)));
      const chart = {
        kind: 'knitlab-colorwork-chart', version: 1, title: `Narrow ${width}`, width, height: 12, rowNumbering: 'bottom-up',
        palette: [{ id: 'natural', name: 'Natural', hex: '#F4F0E6' }, { id: 'red', name: 'Red', hex: '#C2413A' }], cells,
      } as const;
      const result = await runAuthoredPipeline(createColorworkProjectV1(chart, { id: `narrow-${width}` }));
      startRules(`fairisle chart ${width} wide`, result.kcode!, { kind: 'panel', carriers: { main: '2', second: null, waste: '6', draw: '1' }, zoneOfRow: () => 'body' });
    }
    for (const widthCm of [5, 8]) {
      const scarf = await runSweaterPipeline(createPanelProject({ title: 'Narrow scarf', widthCm, lengthCm: 10, textureId: 'stockinette', yarn: { name: 'Oat', hex: '#D9CBB0' } }, { id: `narrow-scarf-${widthCm}`, source: 'human', group: 'create' }));
      for (const piece of scarf.pieces) {
        const raster = scarf.plan.pieces.find((item) => item.id === piece.id)!.raster!;
        startRules(`scarf ${widthCm} cm`, piece.kcode!, { kind: 'panel', carriers: scarf.plan.carriers, zoneOfRow: (row) => raster.rows[row]?.zone ?? 'body' });
      }
    }
  });

  it('a fairisle colour chart', { timeout: 60_000 }, async () => {
    // A dithered two-colour chart: short runs of each colour on every row.
    const cells = Array.from({ length: 40 }, (_, row) => Array.from({ length: 60 }, (_, column) => ((row * 7 + column * 3) % 5 < 2 ? 1 : 0)));
    const chart = {
      kind: 'knitlab-colorwork-chart', version: 1, title: 'Dither', width: 60, height: 40, rowNumbering: 'bottom-up',
      palette: [{ id: 'natural', name: 'Natural', hex: '#F4F0E6' }, { id: 'red', name: 'Red', hex: '#C2413A' }], cells,
    } as const;
    const result = await runAuthoredPipeline(createColorworkProjectV1(chart, { id: 'dither' }));
    startRules('fairisle chart', result.kcode!, { kind: 'panel', carriers: { main: '2', second: null, waste: '6', draw: '1' }, zoneOfRow: () => 'body' });
  });

  it('a birdseye colour chart: no yarn catch yet, but the same loop audit', { timeout: 60_000 }, async () => {
    // Its start is still Kniterate's dbj.kc start (queued in docs/ROADMAP.md); the audit is what it shares.
    const cells = Array.from({ length: 30 }, (_, row) => Array.from({ length: 40 }, (_, column) => ((row * 7 + column * 3) % 5 < 2 ? 1 : 0)));
    const chart = {
      kind: 'knitlab-colorwork-chart', version: 1, title: 'Birdseye', width: 40, height: 30, rowNumbering: 'bottom-up',
      palette: [{ id: 'natural', name: 'Natural', hex: '#F4F0E6' }, { id: 'red', name: 'Red', hex: '#C2413A' }], cells,
    } as const;
    let project = createColorworkProjectV1(chart, { id: 'birdseye' });
    project = appendProjectEdit(project, { id: 'birdseye', source: 'human', edit: { kind: 'set-strategy', strategy: { technique: 'birdseye', floatLimit: 7 } } });
    const result = await runAuthoredPipeline(project);
    const carriers: KnitFileCarriers = { main: '2', second: null, waste: '6', draw: '1' };
    auditRules('birdseye chart', result.kcode!, readKnitFile(result.kcode!, { kind: 'panel', carriers, zoneOfRow: () => 'body' })!, carriers);
  });
});
