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

  it('generates the flat 2x2 rib beanie from a body length and gauge', { timeout: 60_000 }, () => {
    const prefix = resolve(mkdtempSync(resolve(tmpdir(), 'kniterate-studio-cli-')), 'hat');
    const result = cli(['beanie', '--body-cm', '18', '--gauge', '30,32', '-o', prefix]);
    expect(result.status).toBe(0);
    expect(result.receipt).toMatchObject({
      verdict: { state: 'surface' },
      construction: { recipe: 'customist-2x2-rib-beanie@1', needles: 194, needleRange: [30, 223], crown: 'customist-194', ribRows: 58, crownRows: 40, passes: 486 },
      ribRows: { value: 58, how: '18 cm × 32 rows/10 cm' },
      predicted: { finishedCircumferenceCm: 64, bodyCm: 18.1 },
    });
    const sized = cli(['beanie', '--head-cm', '56', '--body-cm', '18', '--gauge', '30,32', '-o', `${prefix}-56`]);
    expect(sized.status).toBe(0);
    expect(sized.receipt).toMatchObject({
      construction: { needles: 154, needleRange: [50, 203], crown: 'eight-line' },
      needles: { value: 154, ease: { value: -0.1, source: 'default' } },
      predicted: { finishedCircumferenceCm: 50.7 },
    });
    expect(cli(['beanie', '--head-cm', '56', '--needles', '150', '--gauge', '30,32', '-o', prefix]).status).toBe(2);
    expect(readFileSync(`${prefix}-instructions.md`, 'utf8')).toContain('mattress stitch');
    expect(cli(['beanie', '--body-cm', '18', '-o', prefix]).status).toBe(2);
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
