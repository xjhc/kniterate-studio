/**
 * Wrapper around the vendored knitout-to-kcode.cjs (from
 * textiles-lab/knitout-backend-kniterate). Invokes the script as a
 * Node subprocess: writes the input .k to a temp file, runs the CLI,
 * reads the output .kc, cleans up.
 *
 * Used by:
 *   - scripts/chart-to-knitout.ts (CLI tool)
 *   - test/knitout/to-kcode.test.ts (smoke test)
 *
 * The browser path (for the wizard UI) will load the vendored .cjs as
 * a Worker module instead — that's Phase 7 work.
 */

import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { KCodeConverter } from '../run-artifact.js';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const VENDOR_SCRIPT = resolve(__dirname, '..', 'vendor', 'knitout-to-kcode.cjs');

export interface KnitoutToKCodeResult {
  ok: boolean;
  kcode?: string;
  stdout: string;
  stderr: string;
  exitCode: number;
}

/** Run the vendored knitout-to-kcode compiler on a knitout source string.
 *  Returns the .kc output as a string. */
export function knitoutToKCode(knitoutText: string): KnitoutToKCodeResult {
  const dir = mkdtempSync(join(tmpdir(), 'knitlab-kcode-'));
  const inputPath = join(dir, 'input.k');
  //The Kniterate machine loads a file literally named `command.kc`;
  //the vendor compiler embeds whatever filename it's given into the
  //k-code header (line 3). For App parity we use `command.kc`.
  const outputPath = join(dir, 'command.kc');
  try {
    writeFileSync(inputPath, knitoutText, 'utf8');
    const result = spawnSync('node', [VENDOR_SCRIPT, inputPath, outputPath], {
      encoding: 'utf8',
      timeout: 30_000,
    });
    if (result.status !== 0) {
      return {
        ok: false,
        stdout: result.stdout ?? '',
        stderr: result.stderr ?? '',
        exitCode: result.status ?? -1,
      };
    }
    const kcode = readFileSync(outputPath, 'utf8');
    return {
      ok: true,
      kcode,
      stdout: result.stdout ?? '',
      stderr: result.stderr ?? '',
      exitCode: 0,
    };
  } finally {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      // ignore cleanup errors
    }
  }
}

/** Node-side `KCodeConverter` (P2.1) — a thin async adapter over
 *  `knitoutToKCode` so `convertRunArtifactToKCode` can stay
 *  environment-agnostic. */
export const nodeKCodeConverter: KCodeConverter = async (knitoutText: string) => {
  const result = knitoutToKCode(knitoutText);
  if (!result.ok) {
    return {
      ok: false,
      error: result.stderr || result.stdout || `kc converter exited with code ${result.exitCode}`,
    };
  }
  return { ok: true, kcode: result.kcode };
};
