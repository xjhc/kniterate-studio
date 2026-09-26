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
