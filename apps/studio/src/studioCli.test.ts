import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { appendProjectEdit, createColorworkProjectV1, serializeColorworkProjectV1 } from '@kniterate-studio/project-contract';

const root = resolve(__dirname, '../../..');
const chart = {
  kind: 'knitlab-colorwork-chart', version: 1, title: 'CLI fixture', width: 4, height: 3, rowNumbering: 'bottom-up',
  palette: [
    { id: 'natural', name: 'Natural', hex: '#F4F0E6' },
    { id: 'red', name: 'Red', hex: '#C2413A' },
  ],
  cells: [[0, 1, 0, 1], [1, 0, 1, 0], [0, 1, 1, 0]],
};

function cli(args: string[]) {
  const result = spawnSync(process.execPath, ['--import', 'tsx', 'scripts/studio.ts', ...args], {
    cwd: root, encoding: 'utf8', timeout: 30_000,
  });
  expect(result.error).toBeUndefined();
  expect(result.stderr).toBe('');
  return { status: result.status, receipt: JSON.parse(result.stdout) };
}

describe('authored CLI command receipts', () => {
  it('exposes the canonical frame and every emitted carrier in compile and export', { timeout: 60_000 }, () => {
    const directory = mkdtempSync(resolve(tmpdir(), 'kniterate-studio-cli-'));
    const projectPath = resolve(directory, 'project.json');
    const outputPath = resolve(directory, 'output.kc');
    writeFileSync(projectPath, serializeColorworkProjectV1(createColorworkProjectV1(chart, { id: 'cli-receipt' })));
    const compiled = cli(['compile', projectPath]);
    expect(compiled.status).toBe(0);
    expect(compiled.receipt).toMatchObject({
      exportReady: true,
      frame: { preset: 'customist-studio-fairisle-7gg', wastePasses: 87, wasteCarrier: '6', frameCarriers: ['1'] },
      carrierRequirements: [
        { carrier: '1', role: 'frame', paletteId: null, yarnName: null },
        { carrier: '2', role: 'pattern', paletteId: 'natural', yarnName: 'Natural' },
        { carrier: '3', role: 'pattern', paletteId: 'red', yarnName: 'Red' },
        { carrier: '6', role: 'waste', paletteId: null, yarnName: null },
      ],
    });
    const exported = cli(['export', projectPath, '-o', outputPath]);
    expect(exported.status).toBe(0);
    expect(exported.receipt.frame).toEqual(compiled.receipt.frame);
    expect(exported.receipt.carrierRequirements).toEqual(compiled.receipt.carrierRequirements);
    expect(createHash('sha256').update(readFileSync(outputPath)).digest('hex')).toBe(exported.receipt.hashes.kcodeSha256);
  });

  it('reports blocking findings as JSON without replacing an existing output', () => {
    const directory = mkdtempSync(resolve(tmpdir(), 'kniterate-studio-cli-'));
    const projectPath = resolve(directory, 'blocked.json');
    const outputPath = resolve(directory, 'output.kc');
    let project = createColorworkProjectV1(chart, { id: 'cli-blocked' });
    project = appendProjectEdit(project, {
      id: 'override', source: 'assistant', edit: {
        kind: 'add-override', override: { id: 'tuck', kind: 'stitch', anchor: { rowId: project.base.rowIds[0]!, needleIndex: 1 }, operation: 'tuck' },
      },
    });
    writeFileSync(projectPath, serializeColorworkProjectV1(project));
    writeFileSync(outputPath, 'existing output');
    const result = cli(['export', projectPath, '-o', outputPath]);
    expect(result.status).toBe(1);
    expect(result.receipt).toMatchObject({ verdict: { state: 'blocked' }, exportReady: false, exported: null, frame: null, carrierRequirements: null });
    expect(result.receipt.findings).toContainEqual(expect.objectContaining({ rule: 'project-override-unsupported' }));
    expect(readFileSync(outputPath, 'utf8')).toBe('existing output');
  });

  it('sizes a blank project from gauge and target, applies plan fixes, and reports readiness', { timeout: 120_000 }, () => {
    const directory = mkdtempSync(resolve(tmpdir(), 'kniterate-studio-cli-'));
    const projectPath = resolve(directory, 'scarf.json');
    expect(cli(['new', '--width', '20', '--height', '30', '--palette', 'Oat=#E8DFCF,Rust=#B5532E', '-o', projectPath]).status).toBe(0);
    const edited = cli(['edit', projectPath, JSON.stringify([
      { kind: 'set-gauge', gauge: { stitchesPer10cm: 26, rowsPer10cm: 34, source: 'measured' } },
      { kind: 'set-target', target: { widthCm: 15, heightCm: 12 } },
    ])]);
    expect(edited.receipt.plan.before.sizeChecks).toEqual([]);
    expect(edited.receipt.plan.after.sizeChecks).toEqual([
      { dimension: 'width', targetCm: 15, required: 39, actual: 20, ok: false },
      { dimension: 'height', targetCm: 12, required: 41, actual: 30, ok: false },
    ]);
    const notReady = cli(['readiness', projectPath]);
    expect(notReady.status).toBe(1);
    expect(notReady.receipt.readiness.blockers).toContainEqual(expect.objectContaining({ kind: 'finding', rule: 'size-off-target', owner: 'design' }));
    const plan = cli(['plan', projectPath]).receipt;
    const fixes = plan.findings.flatMap((finding: { fixes: { edits: unknown[] }[] }) => finding.fixes.flatMap((fix) => fix.edits));
    writeFileSync(resolve(directory, 'fixes.json'), JSON.stringify(fixes));
    expect(cli(['edit', projectPath, resolve(directory, 'fixes.json')]).receipt.plan.after.findings).toEqual([]);
    const described = cli(['describe', projectPath]);
    expect(described.status).toBe(0);
    expect(described.receipt.readiness).toMatchObject({ ready: true, blockers: [] });
    expect(described.receipt.readiness.operatorChecks.join('\n')).toContain('X-carrier-spacing');
    expect(described.receipt.summary).toContain('Readiness: READY');
    expect(described.receipt.summary.join('\n')).toContain('Panel: 39 st × 41 rows');
    for (const view of ['chart', 'back', 'speed']) {
      const pngPath = resolve(directory, `${view}.png`);
      expect(cli(['render', projectPath, '--view', view, '-o', pngPath]).status).toBe(0);
      expect(readFileSync(pngPath).subarray(1, 4).toString('ascii')).toBe('PNG');
    }
    const chartPath = resolve(directory, 'motif.json');
    const image = cli(['image', resolve(directory, 'chart.png'), '--width-st', '13', '--gauge', '26,34', '--colors', '2', '-o', chartPath]);
    expect(image.status).toBe(0);
    expect(image.receipt.receipt).toMatchObject({ stitches: 13, aspect: 'gauge-corrected' });
    expect(cli(['new', chartPath, '-o', resolve(directory, 'motif-project.json')]).status).toBe(0);
    expect(cli(['explain', 'size-off-target']).receipt.kind).toBe('plan-rule');
    expect(cli(['explain', 'long-float']).receipt.kind).toBe('validator-rule');
    expect(cli(['render', projectPath, '--view', 'nope', '-o', 'x.png']).status).toBe(2);
  });

  it('creates a beanie project sized from head, ease and gauge, and exports it with instructions', { timeout: 120_000 }, () => {
    const directory = mkdtempSync(resolve(tmpdir(), 'kniterate-studio-cli-'));
    const projectPath = resolve(directory, 'hat.json');
    expect(cli(['new', '--object', 'beanie', '--head-cm', '56', '--body-cm', '18', '--gauge', '30,32', '--color', 'Black=#111111', '-o', projectPath]).status).toBe(0);
    const plan = cli(['plan', projectPath]).receipt;
    expect(plan).toMatchObject({
      piece: 'beanie',
      stitches: { value: 154 },
      rows: { value: 58 },
      needles: { first: 50, last: 203 },
      predicted: { widthCm: { value: 50.7 }, heightCm: { value: 18.1 } },
      sizeChecks: [
        expect.objectContaining({ dimension: 'width', targetCm: 50.4, required: expect.objectContaining({ value: 154 }), ok: true }),
        expect.objectContaining({ dimension: 'height', targetCm: 18, required: expect.objectContaining({ value: 58 }), ok: true }),
      ],
      findings: [],
    });
    const described = cli(['describe', projectPath]);
    expect(described.status).toBe(0);
    expect(described.receipt.readiness.ready).toBe(true);
    expect(described.receipt.summary.join('\n')).toContain('eight-line crown');
    const exported = cli(['export', projectPath, '-o', resolve(directory, 'hat.kc')]);
    expect(exported.status).toBe(0);
    expect(readFileSync(resolve(directory, 'hat-instructions.md'), 'utf8')).toContain('mattress stitch');
    expect(cli(['new', '--object', 'beanie', '--head-cm', '56', '-o', projectPath]).status).toBe(2);
  });

  it('builds a folded-cuff toque with a placed motif and reports floats honestly', { timeout: 120_000 }, () => {
    const directory = mkdtempSync(resolve(tmpdir(), 'kniterate-studio-cli-'));
    const projectPath = resolve(directory, 'toque.json');
    expect(cli(['new', '--object', 'beanie', '--head-cm', '56', '--body-cm', '13', '--gauge', '26,34', '--cuff-cm', '7', '--fold', '--rib-gauge', '30,32',
      '--color', 'Black=#111111', '--accent', 'White=#F2F2F2', '-o', projectPath]).status).toBe(0);
    expect(cli(['plan', projectPath]).receipt).toMatchObject({
      piece: 'beanie', stitches: { value: 134 }, rows: { value: 89 },
      predicted: { heightCm: { value: 12.9, how: 'body: (89 − 45 cuff rows) ÷ 34 rows/10 cm' } }, findings: [],
    });
    // A 6-stitch block: the black behind it floats 6 stitches, within the limit of 7.
    const block = { kind: 'knitlab-colorwork-chart', version: 1, width: 6, height: 6, rowNumbering: 'bottom-up',
      palette: [{ id: 'bg', name: 'bg', hex: '#000000' }, { id: 'ink', name: 'ink', hex: '#FFFFFF' }], cells: Array.from({ length: 6 }, () => Array<number>(6).fill(1)) };
    writeFileSync(resolve(directory, 'block.json'), JSON.stringify(block));
    const placed = cli(['place', projectPath, resolve(directory, 'block.json'), '--id', 'block']);
    expect(placed.receipt.placement).toMatchObject({ id: 'block', status: 'placed', at: { column: 64, knitRow: 47 }, x: 'center', rowsAboveCuff: 2 });
    // The cuff intent is stored with the project, not only used to size it.
    const saved = JSON.parse(readFileSync(projectPath, 'utf8'));
    expect(JSON.stringify(saved)).toContain('"cuffTargetCm":7');
    expect(JSON.stringify(saved)).toContain('"ribGauge":{"stitchesPer10cm":30,"rowsPer10cm":32,"source":"measured"}');
    const ready = cli(['describe', projectPath]);
    expect(ready.receipt.readiness.ready).toBe(true);
    expect(ready.receipt.summary.join('\n')).toContain('45-row 2x2 rib cuff folding up to 7 cm; 44-row fairisle colorwork body (12.9 cm); 30-row eight-line (jersey) crown');
    expect(cli(['export', projectPath, '-o', resolve(directory, 'toque.kc')]).status).toBe(0);
    const sheet = readFileSync(resolve(directory, 'toque-instructions.md'), 'utf8');
    expect(sheet).toContain('**Ready to knit.**');
    expect(sheet).toContain('Software checks passed · Surface-proven · physical knit pending');
    expect(sheet).toContain('Flat beanie, seamed afterwards: 134 needles');
    expect(sheet).toContain('Fold the rib cuff up');
    expect(sheet).not.toContain('rib rows, then the crown');

    // Resizing for a smaller head is one operation, and keeps the motif centred above the cuff.
    const fit = cli(['fit', projectPath, '--head-cm', '52']);
    expect(fit.status).toBe(0);
    expect(fit.receipt.after.findings).toEqual([]);
    const narrower = cli(['describe', projectPath]).receipt;
    expect(narrower.summary.join('\n')).toContain('122 needles');
    expect(narrower.readiness.ready).toBe(true);
    expect(cli(['place', projectPath, '--refresh', 'block']).status).toBe(2);

    // A motif that no longer fits is a conflict that blocks export, never a clipped motif.
    const wide = { ...block, width: 130, height: 2, cells: [Array<number>(130).fill(1), Array<number>(130).fill(1)] };
    writeFileSync(resolve(directory, 'wide.json'), JSON.stringify(wide));
    const conflict = cli(['place', projectPath, resolve(directory, 'wide.json'), '--id', 'wide']);
    expect(conflict.status).toBe(1);
    expect(conflict.receipt.placement).toMatchObject({ status: 'conflict', at: null });
    expect(cli(['readiness', projectPath]).receipt.findings).toContainEqual(expect.objectContaining({ rule: 'project-placement-conflict' }));
    expect(cli(['edit', projectPath, JSON.stringify({ kind: 'remove-placement', placementId: 'wide' })]).status).toBe(0);

    // One stitch per row, 12 stitches apart in consecutive rows: no float within a row, but the yarn carries 12.
    const stair = { ...block, width: 13, height: 2, cells: [[...Array<number>(12).fill(0), 1], [1, ...Array<number>(12).fill(0)]] };
    writeFileSync(resolve(directory, 'stair.json'), JSON.stringify(stair));
    expect(cli(['place', projectPath, resolve(directory, 'stair.json'), '--id', 'stair', '--above-cuff', '20']).status).toBe(0);
    const floats = cli(['readiness', projectPath]);
    expect(floats.status).toBe(1);
    expect(floats.receipt.readiness.blockers).toContainEqual(expect.objectContaining({ kind: 'finding', rule: 'long-float', owner: 'design' }));
    // A birdseye back ties the accent into the backing every other needle: the same motif is ready, and the body gains its 3 start/join rows.
    expect(cli(['edit', projectPath, JSON.stringify({ kind: 'set-strategy', strategy: { technique: 'birdseye', floatLimit: 7 } })]).status).toBe(0);
    const birdseye = cli(['describe', projectPath]).receipt;
    expect(birdseye.findings.filter((finding: { rule: string }) => finding.rule === 'long-float')).toEqual([]);
    expect(birdseye.summary.join('\n')).toContain('47-row birdseye colorwork body');
    expect(cli(['edit', projectPath, JSON.stringify({ kind: 'set-strategy', strategy: { technique: 'fairisle', floatLimit: 7 } })]).status).toBe(0);
    expect(cli(['edit', projectPath, JSON.stringify({ kind: 'remove-placement', placementId: 'stair' })]).status).toBe(0);

    // A backing the beanie does not build is refused, not silently knitted as fairisle.
    expect(cli(['edit', projectPath, JSON.stringify({ kind: 'set-strategy', strategy: { technique: 'ladder-back', floatLimit: 7 } })]).status).toBe(0);
    expect(cli(['readiness', projectPath]).receipt.findings).toContainEqual(expect.objectContaining({ rule: 'project-beanie-backing-unsupported' }));
  });

  it('keeps usage and read failures machine-readable', () => {
    const missingCommand = cli([]);
    expect(missingCommand.status).toBe(2);
    expect(missingCommand.receipt).toMatchObject({ kind: 'kniterate-studio-cli-error', schemaVersion: 1, error: { kind: 'usage', message: 'A command is required.' } });
    const missingPath = resolve(mkdtempSync(resolve(tmpdir(), 'kniterate-studio-cli-')), 'missing.json');
    const missingFile = cli(['show', missingPath]);
    expect(missingFile.status).toBe(2);
    expect(missingFile.receipt.error.kind).toBe('input-or-io');
    expect(missingFile.receipt.error.message).toContain('ENOENT');
  });
});
