import {
  knitoutToPasses,
  passesToKCode,
  passesToKCodeWithTrace,
} from '../vendor/knitout-to-kcode.browser.js';
import { checkKnitoutSourceResourceLimits } from '../parser.js';
import type {
  VendorLoweringSettings,
  VendorScheduledKCode,
  VendorScheduledPass,
} from './vendor-pass-contract.js';

interface VendorConverter {
  knitoutToPasses: (
    knitout: string,
    filename: string,
  ) => {
    headers: Record<string, string[]>;
    passes: unknown[];
    lowering: VendorLoweringSettings;
  };
  passesToKCode: (headers: Record<string, string[]>, passes: unknown[], filename: string) => string;
  passesToKCodeWithTrace: (
    headers: Record<string, string[]>,
    passes: unknown[],
    filename: string,
    lowering?: VendorLoweringSettings,
  ) => VendorScheduledKCode;
}

const browserConverter: VendorConverter = {
  knitoutToPasses,
  passesToKCode,
  passesToKCodeWithTrace,
};

export interface BrowserKCodeResult {
  ok: boolean;
  kcode?: string;
  error?: string;
  warnings?: readonly string[];
  /** Total backend warnings, including details omitted from the bounded array. */
  warningCount?: number;
  /** Exact post-lowering passes from the pinned backend. */
  scheduledPasses?: readonly VendorScheduledPass[];
}

/** Browser-safe adapter over the same vendored converter used by Node. */
export function browserKnitoutToKCode(knitoutText: string, filename = 'blanket.k'): BrowserKCodeResult {
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
  console.log = () => {};
  try {
    const { headers, passes, lowering } = browserConverter.knitoutToPasses(knitoutText, filename);
    const converted = browserConverter.passesToKCodeWithTrace(
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
    return { ok: false, error: error instanceof Error ? error.message : String(error), warnings, warningCount };
  } finally {
    console.warn = originalWarn;
    console.log = originalLog;
  }
}
