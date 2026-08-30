/**
 * Wrapper around this repository's locally maintained fork of
 * textiles-lab/knitout-backend-kniterate (see the vendor README for immutable
 * provenance and the patch ledger). The isolated entrypoint writes the input
 * .k to a temp file, invokes the CLI, reads the output .kc, and cleans up.
 *
 * Used by:
 *   - scripts/chart-to-knitout.ts (CLI tool)
 *   - test/knitout/to-kcode.test.ts (smoke test)
 *
 * The browser adapter runs the generated ESM copy of the same local fork.
 */

import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { KCodeConverter } from '../run-artifact.js';
import {
  checkKnitoutSourceResourceLimits,
  classifyKnitoutCapacityIssue,
  type KnitoutCapacityIssueV1,
  type KnitoutResourceProfileV1,
} from '../parser.js';
import {
  vendorLoweringResourceLimits,
  type VendorLoweringResourceLimits,
  type VendorLoweringSettings,
  type VendorScheduledKCode,
  type VendorScheduledPass,
} from './vendor-pass-contract.js';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const VENDOR_SCRIPT = resolve(__dirname, '..', 'vendor', 'knitout-to-kcode.cjs');
const requireFromHere = createRequire(import.meta.url);

interface VendorCompilerModule {
  knitoutToPasses: (
    knitout: string,
    filename: string,
    resourceLimits?: VendorLoweringResourceLimits,
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
      readonly coordinateMapping: VendorScheduledKCode['coordinateMapping'];
      readonly warnings: readonly string[];
      readonly warningCount: number;
    }
  | {
      readonly ok: false;
      readonly error: string;
      readonly warnings: readonly string[];
      readonly warningCount: number;
      readonly capacityIssue?: KnitoutCapacityIssueV1;
    };

/**
 * In-process adapter used by conformance tests to retain the backend's exact
 * scheduled-pass IR. Production conversion can continue using the isolated
 * subprocess adapter above.
 */
function convertKnitoutToKCodeWithTrace(
  knitoutText: string,
  filename: string,
  resourceProfile: KnitoutResourceProfileV1,
): KnitoutToScheduledKCodeResult {
  const warnings: string[] = [];
  let warningCount = 0;
  const captureWarning = (...values: unknown[]): void => {
    warningCount++;
    if (warnings.length < 512) warnings.push(values.map(String).join(' '));
  };
  const originalWarn = console.warn;
  const originalLog = console.log;
  const resourceIssue = checkKnitoutSourceResourceLimits(knitoutText, resourceProfile);
  if (resourceIssue !== null) {
    const message = `Line ${resourceIssue.line}: ${resourceIssue.message}`;
    const capacityIssue = classifyKnitoutCapacityIssue(message, resourceProfile);
    return {
      ok: false,
      error: message,
      warnings,
      warningCount,
      ...(capacityIssue === undefined ? {} : { capacityIssue }),
    };
  }
  console.warn = captureWarning;
  // Studio's browser adapter treats routine vendor progress chatter as
  // non-diagnostic. Keep Node verdicts identical: only console.warn is a
  // backend warning; console.log is intentionally suppressed.
  console.log = () => {};
  try {
    const vendor = requireFromHere(VENDOR_SCRIPT) as VendorCompilerModule;
    const { headers, passes, lowering } = vendor.knitoutToPasses(
      knitoutText,
      filename,
      vendorLoweringResourceLimits(resourceProfile),
    );
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
      coordinateMapping: converted.coordinateMapping,
      warnings,
      warningCount,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const capacityIssue = classifyKnitoutCapacityIssue(message, resourceProfile);
    return {
      ok: false,
      error: message,
      warnings,
      warningCount,
      ...(capacityIssue === undefined ? {} : { capacityIssue }),
    };
  } finally {
    console.warn = originalWarn;
    console.log = originalLog;
  }
}

export function knitoutToKCodeWithTrace(
  knitoutText: string,
  filename = 'command.k',
): KnitoutToScheduledKCodeResult {
  return convertKnitoutToKCodeWithTrace(knitoutText, filename, 'foreign-v1');
}

export function authoredKnitoutToKCodeWithTrace(
  knitoutText: string,
  filename = 'command.k',
): KnitoutToScheduledKCodeResult {
  return convertKnitoutToKCodeWithTrace(knitoutText, filename, 'authored-v1');
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
