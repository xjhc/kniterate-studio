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
import { createRequire } from 'node:module';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { KCodeConverter } from '../run-artifact.js';
import { checkKnitoutSourceResourceLimits } from '../parser.js';
import type {
  VendorLoweringSettings,
  VendorScheduledKCode,
  VendorScheduledPass,
} from './vendor-pass-contract.js';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const VENDOR_SCRIPT = resolve(__dirname, '..', 'vendor', 'knitout-to-kcode.cjs');
const requireFromHere = createRequire(import.meta.url);

interface VendorCompilerModule {
  knitoutToPasses: (
    knitout: string,
    filename: string,
  ) => {
    headers: Record<string, string[]>;
    passes: unknown[];
    lowering: VendorLoweringSettings;
  };
  passesToKCodeWithTrace: (
    headers: Record<string, string[]>,
    passes: unknown[],
    filename: string,
    lowering?: VendorLoweringSettings,
  ) => VendorScheduledKCode;
}

export interface KnitoutToKCodeResult {
  ok: boolean;
  kcode?: string;
  stdout: string;
  stderr: string;
  exitCode: number;
}

export type KnitoutToScheduledKCodeResult =
  | {
      readonly ok: true;
      readonly kcode: string;
      readonly scheduledPasses: readonly VendorScheduledPass[];
      readonly warnings: readonly string[];
      readonly warningCount: number;
    }
  | {
      readonly ok: false;
      readonly error: string;
      readonly warnings: readonly string[];
      readonly warningCount: number;
    };

/**
 * In-process adapter used by conformance tests to retain the backend's exact
 * scheduled-pass IR. Production conversion can continue using the isolated
 * subprocess adapter above.
 */
export function knitoutToKCodeWithTrace(
  knitoutText: string,
  filename = 'command.k',
): KnitoutToScheduledKCodeResult {
  const warnings: string[] = [];
  let warningCount = 0;
  const captureWarning = (...values: unknown[]): void => {
    warningCount++;
    if (warnings.length < 512) warnings.push(values.map(String).join(' '));
  };
  const originalWarn = console.warn;
  const originalLog = console.log;
  const resourceIssue = checkKnitoutSourceResourceLimits(knitoutText);
  if (resourceIssue !== null) {
    return {
      ok: false,
      error: `Line ${resourceIssue.line}: ${resourceIssue.message}`,
      warnings,
      warningCount,
    };
  }
  console.warn = captureWarning;
  console.log = captureWarning;
  try {
    const vendor = requireFromHere(VENDOR_SCRIPT) as VendorCompilerModule;
    const { headers, passes, lowering } = vendor.knitoutToPasses(knitoutText, filename);
    const converted = vendor.passesToKCodeWithTrace(
      headers,
      passes,
      filename.replace(/\.k$/i, '.kc'),
      lowering,
    );
    return {
      ok: true,
      kcode: converted.kcode,
      scheduledPasses: converted.passes,
      warnings,
      warningCount,
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
      warnings,
      warningCount,
    };
  } finally {
    console.warn = originalWarn;
    console.log = originalLog;
  }
}

/** Run the vendored knitout-to-kcode compiler on a knitout source string.
 *  Returns the .kc output as a string. */
export function knitoutToKCode(knitoutText: string): KnitoutToKCodeResult {
  const resourceIssue = checkKnitoutSourceResourceLimits(knitoutText);
  if (resourceIssue !== null) {
    return {
      ok: false,
      stdout: '',
      stderr: `Line ${resourceIssue.line}: ${resourceIssue.message}`,
      exitCode: 2,
    };
  }
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
