import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

const repoRoot = fileURLToPath(new URL('../..', import.meta.url));

describe('kniterate topology oracle', () => {
  it('blocks files that leave live loops at the top edge', () => {
    const dir = mkdtempSync(join(tmpdir(), 'knitlab-topology-'));
    try {
      const file = join(dir, 'live-ending.k');
      writeFileSync(file, [
        ';!knitout-2',
        ';;Carriers: 1',
        'in 1',
        'knit + f10 1',
        'out 1',
        '',
      ].join('\n'));

      const result = spawnSync(
        process.execPath,
        ['--import', 'tsx', 'scripts/kniterate-topology-oracle.ts', file],
        { cwd: repoRoot, encoding: 'utf8' },
      );

      expect(result.status).toBe(2);
      expect(result.stdout).toContain('unexpected live loop endings');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('allows manifest-declared tube top-edge live loops', () => {
    const dir = mkdtempSync(join(tmpdir(), 'knitlab-topology-tube-'));
    try {
      const machineDir = join(dir, 'tube-plain', 'machine');
      const file = join(machineDir, '01-tube.k');
      mkdirSync(machineDir, { recursive: true });
      writeFileSync(join(dir, 'tube-plain', 'manifest.json'), JSON.stringify({
        source: { family: 'tube' },
        machine: { route: 'tube-plain' },
      }));
      writeFileSync(file, [
        ';!knitout-2',
        ';;Carriers: 1',
        'in 1',
        'knit + f10 1',
        'out 1',
        '',
      ].join('\n'));

      const result = spawnSync(
        process.execPath,
        ['--import', 'tsx', 'scripts/kniterate-topology-oracle.ts', join(dir, 'tube-plain')],
        { cwd: repoRoot, encoding: 'utf8' },
      );

      expect(result.status).toBe(0);
      expect(result.stdout).toContain('allowed: 1 live loop ending column(s) allowed');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
